import type { PluginTheme } from "@getpaseo/plugin";
import { FlatList } from "@getpaseo/plugin/client/react-native";
import type { PaseoWorkspace } from "./paseo-types";
import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { Pressable, Text, View, type FlatList as NativeFlatList, type StyleProp, type ViewStyle, type ViewToken } from "react-native";
import {
  activityAt,
  displayModel,
  displayTitle,
  flatten,
  formatAge,
  groupByWorkspace,
  roleOf,
  STATE_LABEL,
  summary,
  type CrewNode,
} from "./model";
import { operationSummary, type Operation } from "./operations";
import { StateIcon } from "./sprites";
import { Empty, IconButton, Muted, font, pressStyle, radius, space, stateColor, useReducedMotion } from "./ui";
import { agentArrowKeys, focusAgent } from "./web";

type Row =
  | { kind: "group"; key: string; name: string; text: string }
  | { kind: "agent"; key: string; node: CrewNode };
const VIEWABILITY = { itemVisiblePercentThreshold: 30 };

/** The crew as rows: a status dot, a title, a muted second line, and the detail under the selected row. */
export function CrewList({
  theme,
  roots,
  grouped,
  workspaces,
  now,
  compact,
  selected,
  onSelect,
  renderDetail,
  emptyLabel,
  extraData,
  contentStyle,
  latest,
  live,
  onAgentsInView,
}: {
  theme: PluginTheme;
  /** The forest to list, already filtered. */
  roots: CrewNode[];
  /** True groups the rows under a heading per workspace. */
  grouped: boolean;
  workspaces: ReadonlyMap<string, PaseoWorkspace>;
  now: number;
  compact: boolean;
  selected: string | null;
  onSelect: (agentId: string | null) => void;
  renderDetail?: (node: CrewNode, style: StyleProp<ViewStyle>) => ReactElement;
  emptyLabel: string;
  extraData?: unknown;
  contentStyle?: StyleProp<ViewStyle>;
  latest: ReadonlyMap<string, Operation>;
  live: ReadonlySet<string>;
  onAgentsInView: (agentIds: readonly string[]) => void;
}) {
  const { colors } = theme;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo<Row[]>(() => {
    if (!grouped) {
      return flatten(roots, collapsed).map((node) => ({ kind: "agent", key: node.agent.id, node }));
    }
    const out: Row[] = [];
    for (const group of groupByWorkspace(roots, workspaces)) {
      out.push({
        kind: "group",
        key: `group:${group.workspaceId}`,
        name: group.name,
        text: summary(group.counts),
      });
      for (const node of flatten(group.roots, collapsed)) {
        out.push({ kind: "agent", key: node.agent.id, node });
      }
    }
    return out;
  }, [grouped, roots, collapsed, workspaces]);
  const list = useRef<NativeFlatList<Row>>(null);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
    onAgentsInView(viewableItems.flatMap(({ item }) => item.kind === "agent" ? [item.key] : []));
  }, [onAgentsInView]);
  const refs = useRef(new Map<string, View>());
  const focusWhenMounted = useRef<string | null>(null);
  const stepAgent = useCallback((id: string, direction: -1 | 1) => {
    const start = rows.findIndex((row) => row.key === id);
    if (start < 0) return;
    for (let index = start + direction; index >= 0 && index < rows.length; index += direction) {
      const row = rows[index]!;
      if (row.kind !== "agent") continue;
      const visible = refs.current.get(row.key);
      if (visible) focusAgent(visible);
      else {
        focusWhenMounted.current = row.key;
        list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
      }
      return;
    }
  }, [rows]);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const reduced = useReducedMotion();
  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "group") {
        return (
          <View
            style={{
              paddingHorizontal: space.lg,
              paddingTop: space.lg,
              paddingBottom: space.xs,
              flexDirection: "row",
              alignItems: "baseline",
              gap: space.sm,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.foreground, fontSize: font.sm, fontWeight: "600", flexShrink: 1 }}
            >
              {item.name}
            </Text>
            <Muted theme={theme} size={font.xs}>
              {item.text}
            </Muted>
          </View>
        );
      }
      const { node } = item;
      const { agent } = node;
      const isSelected = selected === agent.id;
      const secondary = [roleOf(agent), displayModel(agent)].filter(Boolean).join(" · ");
      const observation = operationSummary(latest.get(agent.id), live.has(agent.id), now, activityAt(agent));
      const indent = Math.min(node.depth, compact ? 2 : 4) * (compact ? space.md : space.lg);
      return (
        <View style={{ paddingHorizontal: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.lg, backgroundColor: isSelected ? colors.surface2 : "transparent" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={[displayTitle(agent), STATE_LABEL[node.state], observation.label, observation.freshness].filter(Boolean).join(", ")}
            {...agentArrowKeys((direction) => stepAgent(agent.id, direction))}
            ref={(view) => {
              if (!view) refs.current.delete(agent.id);
              else {
                refs.current.set(agent.id, view);
                if (focusWhenMounted.current === agent.id) {
                  focusWhenMounted.current = null;
                  focusAgent(view);
                }
              }
            }}
            onPress={() => onSelect(renderDetail && isSelected ? null : agent.id)}
            style={pressStyle(({ hovered }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              flex: 1,
              minWidth: 0,
              minHeight: compact ? 56 : 44,
              paddingVertical: space.sm,
              paddingLeft: space.sm + indent,
              paddingRight: space.sm,
              borderRadius: radius.lg,
              backgroundColor: isSelected ? colors.surface2 : hovered ? colors.surface1 : "transparent",
            }))}
          >
            {node.depth > 0 ? (
              <View
                style={{
                  position: "absolute",
                  left: Math.max(space.sm, indent - 3),
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: colors.border,
                }}
              />
            ) : null}
            {/* A shape of its own for each state, moving where the state goes on; the word for it is on the right. */}
            <StateIcon theme={theme} state={node.state} still={reduced} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: compact ? 15 : font.base }}>
                {displayTitle(agent)}
              </Text>
              <Muted theme={theme} size={font.xs} numberOfLines={2}>{observation.label}</Muted>
              {secondary ? <Muted theme={theme} size={font.xs} numberOfLines={1}>{secondary}</Muted> : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={{ color: stateColor(theme, node.state), fontSize: font.xs }}>{STATE_LABEL[node.state]}</Text>
              <Text style={{ color: colors.foregroundMuted, fontSize: font.xs, lineHeight: 16, textAlign: "right", maxWidth: 104 }}>
                {observation.freshness || formatAge(activityAt(agent), now)}
              </Text>
            </View>
          </Pressable>
            {node.children.length > 0 ? (
              <IconButton
                theme={theme}
                icon={collapsed.has(agent.id) ? "ChevronRight" : "ChevronDown"}
                label={collapsed.has(agent.id) ? `Expand ${node.descendants}` : "Collapse"}
                onPress={() => toggleCollapsed(agent.id)}
                size={compact ? 44 : 28}
              />
            ) : (
              <View style={{ width: compact ? space.xs : 28 }} />
            )}
          </View>
          {isSelected && renderDetail
            ? renderDetail(node, {
                marginLeft: space.sm + indent + space.lg,
                marginRight: space.sm,
                marginBottom: space.sm,
              })
            : null}
        </View>
      );
    },
    [colors, theme, compact, selected, collapsed, now, reduced, toggleCollapsed, onSelect, renderDetail, stepAgent, latest, live],
  );

  return (
    <FlatList
      ref={list}
      data={rows}
      keyExtractor={(row: Row) => row.key}
      renderItem={renderRow}
      extraData={[selected, collapsed, now, reduced, extraData, latest, live]}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={VIEWABILITY}
      keyboardShouldPersistTaps="handled"
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
      }}
      contentContainerStyle={[{ paddingVertical: space.sm, paddingBottom: space.xl }, contentStyle]}
      ListEmptyComponent={emptyLabel ? <Empty theme={theme} label={emptyLabel} /> : null}
      style={{ flex: 1 }}
    />
  );
}
