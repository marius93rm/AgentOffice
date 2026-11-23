import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import type { PaseoApi } from "./paseo-types";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as NativeScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { FOLLOWING, bounded, chatRows, followResize, followScroll, readableText, type ChatItem, type ChatRow } from "./chat-model";
import type { CrewState } from "./model";
import { Button, IconButton, Muted, font, pressStyle, radius, space } from "./ui";
import { useChat } from "./use-chat";
import { anchorScroll } from "./web";

/**
 * Under a list row the chat has no scroller of its own, which a list row cannot hold
 * reliably on every platform: it draws this many of its last lines, each message cut
 * to this many characters, and points to the full chat for the rest.
 */
const COMPACT_ROWS = 6;
const COMPACT_CHARS = 280;

const TOOL_ICON: Record<string, string> = {
  running: "Loader",
  completed: "Check",
  failed: "X",
  canceled: "Ban",
};

function conciseToolSummary(summary: string): string {
  const script = summary.match(/^(python(?:\d+(?:\.\d+)?)?|node|ruby|perl|php)\s+-\s*<</i)?.[1];
  return script ? `${script} script` : summary;
}

type MessageBlock =
  | { kind: "paragraph" | "code" | "quote"; text: string }
  | { kind: "heading"; text: string; level: number }
  | { kind: "list"; text: string; marker: string };

function assistantBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] = [];
  let inCode = false;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };

  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      if (inCode) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim() || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    const bullet = line.match(/^\s*([-*+])\s+(.+)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (heading || bullet || ordered || quote) {
      flushParagraph();
      if (heading) blocks.push({ kind: "heading", level: heading[1]?.length ?? 2, text: heading[2] ?? "" });
      else if (bullet) blocks.push({ kind: "list", marker: "•", text: bullet[2] ?? "" });
      else if (ordered) blocks.push({ kind: "list", marker: `${ordered[1]}.`, text: ordered[2] ?? "" });
      else if (quote) blocks.push({ kind: "quote", text: quote[1] ?? "" });
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  if (code.length) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks;
}

function inlineMarkdown(text: string, theme: PluginTheme): ReactNode[] {
  const segments: ReactNode[] = [];
  const token = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(token)) {
    const value = match[0];
    const at = match.index ?? 0;
    if (at > cursor) segments.push(text.slice(cursor, at));
    const body = value.startsWith("**") || value.startsWith("__") ? value.slice(2, -2)
      : value.startsWith("`") ? value.slice(1, -1)
      : value.match(/^\[([^\]]+)\]/)?.[1] ?? value;
    const style = value.startsWith("**") || value.startsWith("__") ? { fontWeight: "700" as const }
      : value.startsWith("`") ? { color: theme.colors.accent, fontFamily: "monospace" }
      : value.startsWith("[") ? { color: theme.colors.accent, textDecorationLine: "underline" as const }
      : undefined;
    segments.push(style ? <Text key={`md-${index++}`} style={style}>{body}</Text> : body);
    cursor = at + value.length;
  }
  if (cursor < text.length) segments.push(text.slice(cursor));
  return segments;
}

/** A compact native Markdown treatment for assistant output, without a platform-specific renderer. */
function AssistantText({ theme, text, roomy }: { theme: PluginTheme; text: string; roomy: boolean }) {
  const blocks = useMemo(() => assistantBlocks(text), [text]);
  const bodyStyle: StyleProp<TextStyle> = { color: theme.colors.foreground, fontSize: roomy ? 15 : font.base, lineHeight: roomy ? 23 : 19 };
  return (
    <View style={{ gap: space.sm }}>
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return <Text key={index} selectable style={{ color: theme.colors.foregroundMuted, backgroundColor: theme.colors.surface1,
            borderRadius: radius.sm, padding: space.sm, fontFamily: "monospace", fontSize: roomy ? 13 : font.xs, lineHeight: roomy ? 20 : 16 }}>
            {block.text}
          </Text>;
        }
        if (block.kind === "heading") {
          return <Text key={index} accessibilityRole="header" style={{ color: theme.colors.foreground,
            fontSize: roomy ? block.level <= 2 ? 17 : 15 : block.level <= 2 ? 15 : 13,
            lineHeight: roomy ? 23 : 20, fontWeight: "700", marginTop: index > 0 ? space.xs : 0 }}>
            {inlineMarkdown(block.text, theme)}
          </Text>;
        }
        if (block.kind === "list") {
          return <View key={index} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingLeft: space.xs }}>
            <Text style={[bodyStyle, { color: theme.colors.foregroundMuted, minWidth: block.marker.length > 1 ? 22 : 12 }]}>{block.marker}</Text>
            <Text selectable style={[bodyStyle, { flex: 1 }]}>{inlineMarkdown(block.text, theme)}</Text>
          </View>;
        }
        if (block.kind === "quote") {
          return <Text key={index} selectable style={[bodyStyle, { color: theme.colors.foregroundMuted, borderLeftWidth: 2,
            borderLeftColor: theme.colors.border, paddingLeft: space.sm }]}>{inlineMarkdown(block.text, theme)}</Text>;
        }
        return <Text key={index} selectable style={bodyStyle}>{inlineMarkdown(block.text, theme)}</Text>;
      })}
    </View>
  );
}

function Pointer({
  theme,
  label,
  onOpen,
}: {
  theme: PluginTheme;
  label: string;
  onOpen: (() => void) | null;
}) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      {onOpen ? <Icon name="ArrowUpRight" size={12} color={theme.colors.foregroundMuted} /> : null}
      <Muted theme={theme} size={font.xs} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Muted>
    </View>
  );
  if (!onOpen) return body;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}. Open the agent`}
      onPress={onOpen}
      style={pressStyle(({ hovered }) => ({ opacity: hovered ? 0.7 : 1, alignSelf: "flex-start" }))}
    >
      {body}
    </Pressable>
  );
}

const Row = memo(function Row({
  theme,
  row,
  streaming,
  onOpen,
  maxChars,
  roomy,
}: {
  theme: PluginTheme;
  row: ChatRow;
  streaming: boolean;
  onOpen: (() => void) | null;
  /** Cuts each message to this many characters. */
  maxChars?: number;
  roomy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = theme;
  if (row.kind === "tools") {
    const latest = row.tools[row.tools.length - 1] as Extract<ChatItem, { kind: "tool" }>;
    const summary = conciseToolSummary(latest.summary);
    const color =
      latest.status === "failed" ? colors.statusDanger : latest.status === "running" ? colors.accent : colors.foregroundMuted;
    const more = row.tools.length - 1;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${row.tools.length === 1 ? "Tool call" : `${row.tools.length} tool calls, the latest`} ${latest.label}${latest.summary ? `, ${latest.summary}` : ""}, ${latest.status}`}
        onPress={() => setExpanded((open) => !open)}
        style={{ borderRadius: radius.md, backgroundColor: colors.surface1, padding: roomy ? space.md : space.sm, gap: space.sm, minHeight: roomy ? 44 : 32 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon name={TOOL_ICON[latest.status] ?? "Wrench"} size={14} color={color} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: roomy ? 13 : font.sm, color: colors.foregroundMuted }}>
            <Text style={{ color: colors.foreground, fontWeight: "500" }}>{latest.word}</Text>
            {summary ? `  ${summary}` : ""}
          </Text>
          {more > 0 ? <Muted theme={theme} size={12}>+{more}</Muted> : null}
          <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={15} color={colors.foregroundMuted} />
        </View>
        {expanded ? row.tools.map((tool) => (
          <Muted key={tool.key} theme={theme} size={roomy ? 13 : 12}>{[tool.label, tool.status, tool.summary].filter(Boolean).join(" · ")}</Muted>
        )) : null}
      </Pressable>
    );
  }
  const { item } = row;
  const full = "text" in item ? (item.kind === "assistant" ? readableText(item.text) : item.text) : "";
  if (item.kind === "assistant" && /^\s*(?:-{3,}|\*{3,}|_{3,})?\s*$/.test(full)) return null;
  const clipped = maxChars !== undefined && full.length > maxChars ? `${bounded(full, maxChars).text.trimEnd()}…` : full;
  const rest =
    ("cut" in item && item.cut) || clipped !== full ? (
      <Pointer theme={theme} label="Continues in the full chat" onOpen={onOpen} />
    ) : null;
  switch (item.kind) {
    case "user":
      return (
        <View style={{ gap: space.xs }}>
          <View style={{ alignSelf: "flex-end", maxWidth: "92%", backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: space.sm + 2, paddingVertical: space.xs + 2 }}>
            <Text selectable style={{ color: colors.foreground, fontSize: roomy ? 15 : font.base, lineHeight: roomy ? 22 : 19 }}>
              {clipped}
            </Text>
          </View>
          {rest}
        </View>
      );
    case "assistant":
      return (
        <View style={{ gap: space.xs }}>
          <AssistantText theme={theme} text={clipped} roomy={roomy} />
          {rest}
        </View>
      );
    case "message":
      // A child finishing or failing is one line; a message is its sender and what it said.
      if (item.event !== "message") {
        return (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Icon name="Bell" size={12} color={item.event === "errored" ? colors.statusDanger : colors.foregroundMuted} />
            <Muted theme={theme} size={font.xs} numberOfLines={1} style={{ flexShrink: 1 }}>
              {`${item.fromTitle ?? "Another agent"} ${clipped}`}
            </Muted>
          </View>
        );
      }
      return (
        <View style={{ gap: 2, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Icon name="MessageSquare" size={12} color={colors.foregroundMuted} />
            <Muted theme={theme} size={font.xs} numberOfLines={1}>
              {item.fromTitle ? `From ${item.fromTitle}` : "From another agent"}
            </Muted>
          </View>
          <Text selectable numberOfLines={8} style={{ color: colors.foreground, fontSize: font.sm, lineHeight: font.sm * 1.45 }}>
            {clipped}
          </Text>
          {rest}
        </View>
      );
    case "error":
      return (
        <View style={{ flexDirection: "row", gap: space.xs + 2 }}>
          <Icon name="CircleAlert" size={12} color={colors.statusDanger} />
          <Text selectable numberOfLines={6} style={{ flex: 1, color: colors.statusDanger, fontSize: font.xs, lineHeight: font.xs * 1.45 }}>
            {clipped}
          </Text>
        </View>
      );
    case "note":
      return (
        <Muted theme={theme} size={font.xs} numberOfLines={2}>
          {item.text}
        </Muted>
      );
    case "elsewhere":
      return <Pointer theme={theme} label={`${item.what} this view does not show`} onOpen={onOpen} />;
  }
});

/**
 * The agent's last few items, newest at the bottom, read-only. It follows the
 * end while you are at the end, and stays where you scrolled to otherwise.
 */
export function AgentChat({
  theme,
  paseo,
  agentId,
  state,
  shown,
  still,
  onOpen,
  compact,
  roomy = false,
  style,
  children,
}: {
  theme: PluginTheme;
  paseo: PaseoApi;
  agentId: string;
  state: CrewState;
  /** False while the pane is hidden: nothing is held or asked. */
  shown: boolean;
  /** Reduced motion: streamed text is shown whole at once. */
  still: boolean;
  /** Opens the agent's own chat; null where the host cannot. */
  onOpen: (() => void) | null;
  /** Under a list row: the last few lines, no scroller of its own. */
  compact?: boolean;
  roomy?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const chat = useChat(paseo, agentId, state, shown);
  const allRows = useMemo(() => chatRows(chat.state.items), [chat.state.items]);
  const rows = compact ? allRows.slice(-COMPACT_ROWS) : allRows;
  const earlier = rows.length > 0 && (chat.state.hasOlder || rows.length < allRows.length);
  const scroller = useRef<NativeScrollView>(null);
  // Following the end, until scrolled away from it; see `followScroll`.
  const follow = useRef(FOLLOWING);
  const [away, setAway] = useState(false);
  // The browser's scroll anchoring is off while following and on while reading; see `anchorScroll`.
  const setFollow = useCallback((next: typeof FOLLOWING) => {
    if (next.following !== follow.current.following) {
      anchorScroll(scroller.current, !next.following);
      setAway(!next.following);
    }
    follow.current = next;
  }, []);
  // Another agent's chat starts at its end.
  useLayoutEffect(() => {
    follow.current = { ...FOLLOWING, viewport: follow.current.viewport };
    setAway(false);
    anchorScroll(scroller.current, false);
  }, [agentId]);
  const jumpToLatest = () => {
    const scroll = () => scroller.current?.scrollToEnd({ animated: true });
    scroll();
    requestAnimationFrame(scroll);
  };
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setFollow(followScroll(follow.current, contentOffset.y, contentSize.height, layoutMeasurement.height));
  }, [setFollow]);
  const resized = useCallback((size: { content?: number; viewport?: number }) => {
    const next = followResize(follow.current, size);
    setFollow(next.follow);
    if (next.toEnd) scroller.current?.scrollToEnd({ animated: false });
  }, [setFollow]);
  const onContentSizeChange = useCallback((_: number, height: number) => resized({ content: height }), [resized]);
  const onLayout = useCallback((event: LayoutChangeEvent) => resized({ viewport: event.nativeEvent.layout.height }), [resized]);
  const { colors } = theme;
  const lastKey = rows[rows.length - 1]?.key;
  const streamingKey =
    chat.live && chat.wanted && chat.state.open && !still && rows[rows.length - 1]?.kind === "item" ? lastKey : undefined;

  let status: { text: string; tone: "muted" | "danger"; retry: boolean } | null = null;
  if (chat.phase === "loading" && rows.length === 0) status = { text: "Loading the chat", tone: "muted", retry: false };
  else if (chat.phase === "error" && rows.length === 0) status = { text: "Could not load the chat", tone: "danger", retry: true };
  else if (chat.wanted && !chat.live && chat.phase !== "loading")
    status = { text: "Not live: showing what was loaded", tone: "muted", retry: true };
  else if (rows.length === 0) status = { text: "Nothing in the chat yet", tone: "muted", retry: false };

  const heading = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: roomy ? 15 : 13, fontWeight: "600" }}>Recent conversation</Text>
        {chat.live ? <Muted theme={theme} size={12}>Live</Muted> : null}
    </View>
  );
  const lines = (
    <>
      {children}
      {heading}
      {earlier ? <Pointer theme={theme} label="Earlier messages are in the full chat" onOpen={onOpen} /> : null}
      {rows.map((row) => (
        <Row
          key={row.key}
          theme={theme}
          row={row}
          streaming={row.key === streamingKey}
          onOpen={onOpen}
          maxChars={compact ? COMPACT_CHARS : undefined}
          roomy={roomy}
        />
      ))}
      {status ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Text
            style={{ flex: 1, fontSize: font.xs, color: status.tone === "danger" ? colors.statusDanger : colors.foregroundMuted }}
          >
            {status.text}
          </Text>
          {status.retry ? <IconButton theme={theme} icon="RefreshCw" label="Load the chat again" onPress={chat.refresh} size={24} /> : null}
        </View>
      ) : null}
    </>
  );
  if (compact) {
    return (
      <View accessibilityLabel="Recent chat, read-only" style={[{ gap: space.sm + 2, paddingVertical: space.sm }, style]}>
        {lines}
      </View>
    );
  }
  return (
    <View style={[{ minHeight: 0 }, style]}>
      <ScrollView
        ref={scroller}
        style={{ flex: 1, minHeight: 0 }}
        onScroll={onScroll}
        scrollEventThrottle={100}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.sm + 2, paddingTop: space.sm, paddingBottom: away ? space.xl * 3 : space.sm }}
        accessibilityLabel="Recent chat, read-only"
      >
        {lines}
      </ScrollView>
      {away && rows.length > 0 ? <Button theme={theme} size={roomy ? "touch" : "md"} variant="outline" hitSlop={12}
        style={{ position: "absolute", right: 0, bottom: 0, left: 0, zIndex: 20, elevation: 20, backgroundColor: colors.surface0 }}
        icon="ArrowDown" label="Jump to latest" accessibilityLabel="Jump to the latest message"
        onPress={jumpToLatest} /> : null}
    </View>
  );
}

/** The demo uses the same transcript rows as a real chat. */
export function TranscriptPreview({ theme, items }: { theme: PluginTheme; items: readonly ChatItem[] }) {
  return <>{chatRows(items).map((row) => <Row key={row.key} theme={theme} row={row} streaming={false} onOpen={null} roomy />)}</>;
}
