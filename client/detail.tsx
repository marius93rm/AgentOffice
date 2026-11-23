import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import type { PaseoAgent, PaseoApi, PaseoRequest, PaseoResponse } from "./paseo-types";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { AgentChat } from "./chat";
import { activityAt, displayModel, displayTitle, roleOf, STATE_LABEL, type CrewNode } from "./model";
import { operationSummary, type Operation } from "./operations";
import { QuestionForm } from "./question-form";
import { isQuestion, permissionFacts, questionsOf, requestTitle } from "./questions";
import { StateIcon } from "./sprites";
import { Button, IconButton, Muted, font, pressStyle, radius, space, stateColor } from "./ui";

export type Dialog =
  | { kind: "message"; agent: PaseoAgent }
  | { kind: "archive"; agent: PaseoAgent }
  | { kind: "permission"; agent: PaseoAgent; requestId: string };

export interface AgentActions {
  dialog: Dialog | null;
  setDialog: (dialog: Dialog | null) => void;
  draft: string;
  setDraft: (draft: string) => void;
  busy: boolean;
  run: (label: string, action: () => Promise<unknown>) => Promise<boolean>;
  respond: (agent: PaseoAgent, requestId: string, response: PaseoResponse, label: string) => Promise<boolean>;
}

/** The actions an agent's detail offers, shared by the list and the office. */
export function useAgentActions(paseo: PaseoApi): AgentActions {
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const messageId = dialog?.kind === "message" ? dialog.agent.id : null;
  const draft = messageId ? drafts.get(messageId) ?? "" : "";
  const setDraft = (text: string) => {
    if (messageId) setDrafts((current) => new Map(current).set(messageId, text));
  };
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      try {
        await action();
        toast.show(label, { variant: "success" });
        setDialog((current) => current === dialog ? null : current);
        if (messageId) setDrafts((current) => {
          if (current.get(messageId) !== draft) return current;
          const next = new Map(current);
          next.delete(messageId);
          return next;
        });
        return true;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [toast, dialog, draft, messageId],
  );

  const respond = useCallback(
    (agent: PaseoAgent, requestId: string, response: PaseoResponse, label: string) =>
      run(label, () => paseo.agents.ref(agent.id).respondToPermission({ requestId, response })),
    [paseo, run],
  );

  return { dialog, setDialog, draft, setDraft, busy, run, respond };
}

/** The agent's status, next action and recent conversation. */
export function Detail({
  theme,
  paseo,
  node,
  shown,
  still,
  operation,
  live,
  now,
  title,
  onClose,
  closeIcon = "X",
  closeLabel = "Close details",
  canOpen,
  onOpen,
  onMessage,
  onReview,
  onMore,
  pending,
  busy,
  touch = false,
  privateMode = false,
  children,
  compact,
  style,
  chatStyle,
}: {
  theme: PluginTheme;
  paseo: PaseoApi;
  node: CrewNode;
  /** False while the pane is hidden. */
  shown: boolean;
  still: boolean;
  operation?: Operation;
  live: boolean;
  now: number;
  /** True draws the state, title and model; the list's own row already does. */
  title: boolean;
  onClose?: () => void;
  closeIcon?: string;
  closeLabel?: string;
  canOpen: boolean;
  onOpen: () => void;
  onMessage: () => void;
  onReview: (requestId: string) => void;
  onMore: () => void;
  pending: readonly PaseoRequest[];
  busy: boolean;
  touch?: boolean;
  privateMode?: boolean;
  children?: React.ReactNode;
  /** Under a list row: the chat shows its last few lines without a scroller of its own. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  chatStyle?: StyleProp<ViewStyle>;
}) {
  const { agent } = node;
  const { colors } = theme;
  const secondary = [roleOf(agent), displayModel(agent)].filter(Boolean).join(" · ");
  const observation = operationSummary(operation, live, now, activityAt(agent));
  const first = pending[0];
  const primary = first ? {
    label: isQuestion(first) ? "Answer question" : "Review permission",
    icon: isQuestion(first) ? "MessageSquare" : "ShieldQuestion", onPress: () => onReview(first.id),
  } : !privateMode ? { label: "Message agent", icon: "MessageSquare", onPress: onMessage }
    : canOpen ? { label: "Open in Paseo", icon: "ArrowUpRight", onPress: onOpen } : null;
  const actions = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
      <IconButton theme={theme} icon="Ellipsis" label="More agent actions" size={touch ? 44 : undefined} onPress={onMore} />
      {onClose ? <IconButton theme={theme} icon={closeIcon} label={closeLabel} size={touch ? 44 : undefined} onPress={onClose} /> : null}
    </View>
  );
  const more = (
    <>
      {pending.slice(1).map((request) => (
        <Pressable
          key={request.id}
          accessibilityRole="button"
          accessibilityLabel={`${isQuestion(request) ? "Answer" : "Review"}: ${requestTitle(request)}`}
          disabled={busy}
          onPress={() => onReview(request.id)}
          style={pressStyle(({ pressed, hovered }) => ({
            flexDirection: "row", alignItems: "center", minHeight: 44,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: space.md,
            gap: space.sm,
            backgroundColor: pressed || hovered ? colors.surface2 : colors.surface1,
          }))}
        >
          <Icon name={isQuestion(request) ? "MessageSquare" : "ShieldQuestion"} size={16} color={colors.statusWarning} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: touch ? 15 : font.base, fontWeight: "500" }}>
              {requestTitle(request)}
            </Text>
            <Muted theme={theme}>{isQuestion(request) ? "Answer question" : "Review permission"}</Muted>
          </View>
          <Icon name="ChevronRight" size={16} color={colors.foregroundMuted} />
        </Pressable>
      ))}
      {children}
    </>
  );
  return (
    <View style={[{ gap: space.sm, minHeight: 0 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {title ? <StateIcon theme={theme} state={node.state} still={still} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {title ? <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: font.base, fontWeight: "600" }}>{displayTitle(agent)}</Text> : null}
          <Muted theme={theme} numberOfLines={1}>
            <Text style={{ color: stateColor(theme, node.state), fontWeight: "600" }}>{STATE_LABEL[node.state]}</Text>
            {secondary ? ` · ${secondary}` : ""}
          </Muted>
          {operation ? <Muted theme={theme} size={13} numberOfLines={1}>{observation.label}</Muted> : null}
          {observation.freshness ? <Muted theme={theme} size={12} numberOfLines={1}>{observation.freshness}</Muted> : null}
          {first ? <Muted theme={theme} size={13} numberOfLines={1}>{requestTitle(first)}</Muted> : null}
        </View>
        {actions}
      </View>
      {primary ? <Button theme={theme} size={touch ? "touch" : "sm"} variant="default" disabled={busy}
        accessibilityLabel={first ? `${primary.label}, ${requestTitle(first)}` : undefined}
        style={touch ? undefined : { alignSelf: "flex-start" }} {...primary} /> : null}
      {privateMode ? compact ? (
        <View style={{ gap: space.sm }}>{more}<Muted theme={theme}>Chat hidden by Privacy Mode.</Muted></View>
      ) : (
        <ScrollView style={chatStyle} contentContainerStyle={{ gap: space.sm }}>
          {more}<Muted theme={theme}>Chat hidden by Privacy Mode.</Muted>
        </ScrollView>
      ) : <AgentChat
        theme={theme}
        paseo={paseo}
        agentId={agent.id}
        state={node.state}
        shown={shown}
        still={still}
        onOpen={canOpen ? onOpen : null}
        compact={compact}
        roomy={touch}
        style={chatStyle}
      >{more}</AgentChat>}
    </View>
  );
}

export function AgentFacts({ theme, agent, workspaceName, privateMode }: {
  theme: PluginTheme; agent: PaseoAgent; workspaceName: string | null; privateMode: boolean;
}) {
  const facts: Array<[string, string]> = [];
  if (workspaceName) facts.push(["Workspace", workspaceName]);
  if (!privateMode && agent.cwd) facts.push(["Directory", agent.cwd]);
  for (const key of Object.keys(agent.labels).sort()) {
    const value = agent.labels[key];
    if (value && !key.startsWith("paseo.")) facts.push([key.slice(key.lastIndexOf("/") + 1), value]);
  }
  if (agent.lastError) facts.push(["Last error", agent.lastError]);
  return facts.length ? (
    <View style={{ gap: space.sm }}>
      {facts.map(([label, value], index) => (
        <View key={index} style={{ gap: 2 }}>
          <Muted theme={theme} size={13}>{label}</Muted>
          <Text selectable={!privateMode} style={{ color: label === "Last error" ? theme.colors.statusDanger : theme.colors.foreground,
            fontSize: 15, lineHeight: 21 }}>{value}</Text>
        </View>
      ))}
    </View>
  ) : <Muted theme={theme}>Agent details are unavailable.</Muted>;
}

/** Resolve again against the live directory so a request answered on another device cannot be sent twice. */
export function dialogRequest(dialog: Dialog | null, agents: ReadonlyMap<string, PaseoAgent>) {
  return dialog?.kind === "permission"
    ? agents.get(dialog.agent.id)?.pendingPermissions.find((request) => request.id === dialog.requestId)
    : undefined;
}

export function agentDialogTitle(dialog: Dialog, agents: ReadonlyMap<string, PaseoAgent>): string {
  if (dialog.kind === "message") return "Message agent";
  if (dialog.kind === "archive") return "Archive agent";
  const request = dialogRequest(dialog, agents);
  return request && isQuestion(request) ? "Answer question" : "Review permission";
}

export function AgentDialogContent({
  theme, paseo, actions, agents, platform, onOpen, onResponded,
}: {
  theme: PluginTheme;
  paseo: PaseoApi;
  actions: AgentActions;
  agents: ReadonlyMap<string, PaseoAgent>;
  platform: "ios" | "android" | "web";
  onOpen: (() => void) | null;
  onResponded: (agentId: string, requestId: string) => void;
}) {
  const { colors } = theme;
  const { dialog, setDialog, draft, setDraft, busy, run, respond } = actions;
  if (!dialog) return null;
  const back = <Button theme={theme} size="touch" variant="ghost" label="Back" disabled={busy} onPress={() => setDialog(null)} />;
  const agentName = <Muted theme={theme} size={13}>{displayTitle(dialog.agent)}</Muted>;
  if (dialog.kind === "message") return (
    <>
      {agentName}
      <TextInput
        accessibilityLabel="Message"
        value={draft}
        onChangeText={setDraft}
        editable={!busy}
        multiline
        placeholder="What should it know or do next?"
        placeholderTextColor={colors.foregroundMuted}
        style={{
          minHeight: 96, padding: space.md, borderRadius: radius.md, borderWidth: 1,
          borderColor: colors.border, color: colors.foreground, fontSize: 16, textAlignVertical: "top",
        }}
      />
      <Button theme={theme} size="touch" variant="default" label="Send message" disabled={busy || !draft.trim()}
        onPress={() => void run("Message sent", () => paseo.agents.ref(dialog.agent.id).send(draft.trim()))} />
      {back}
    </>
  );
  if (dialog.kind === "archive") return (
    <>
      <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22 }}>
        Archive “{displayTitle(dialog.agent)}”? Its chat stays in History. Children keep running.
      </Text>
      <Button theme={theme} size="touch" variant="destructive" label="Archive" disabled={busy}
        onPress={() => void run("Archived", () => paseo.agents.ref(dialog.agent.id).archive())} />
      {back}
    </>
  );

  const request = dialogRequest(dialog, agents);
  if (!request) return <><Muted theme={theme}>This request is no longer pending.</Muted>{back}</>;
  const submit = async (response: PaseoResponse, label: string) => {
    if (await respond(dialog.agent, request.id, response, label)) onResponded(dialog.agent.id, request.id);
  };
  if (isQuestion(request)) {
    const questions = questionsOf(request);
    return (
      <>
        {agentName}
        {questions ? (
          <QuestionForm key={dialog.agent.id + "/" + request.id} theme={theme} request={request} questions={questions} busy={busy}
            onSubmit={(response) => void submit(response, "Answer sent")} />
        ) : (
          <>
            <Muted theme={theme} size={14}>Continue in the agent’s chat to answer this question.</Muted>
            {onOpen ? <Button theme={theme} size="touch" variant="default" label="Open agent chat" onPress={onOpen} /> : null}
          </>
        )}
        {back}
      </>
    );
  }
  return <PermissionReview key={JSON.stringify([dialog.agent.id, request.id])} theme={theme} request={request}
    agentName={displayTitle(dialog.agent)} platform={platform} busy={busy}
    onSubmit={(response) => void submit(response, response.behavior === "allow" ? "Allowed" : "Denied")}
    onBack={() => setDialog(null)} />;
}

function PermissionReview({ theme, request, agentName, platform, busy, onSubmit, onBack }: {
  theme: PluginTheme;
  request: PaseoRequest;
  agentName: string;
  platform: "ios" | "android" | "web";
  busy: boolean;
  onSubmit: (response: PaseoResponse) => void;
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = theme;
  const facts = permissionFacts(request);
  const decisions = request.actions?.length ? request.actions : [
    { id: "", label: "Deny", behavior: "deny", variant: "secondary" },
    { id: "", label: "Allow", behavior: "allow", variant: "primary" },
  ] as const;
  const raw = request.input ?? request.detail;
  return (
    <View style={{ flex: 1, minHeight: 0, gap: space.sm }}>
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: space.md, paddingBottom: space.sm }}>
        <Muted theme={theme} size={13}>{agentName}</Muted>
        <Text selectable style={{ color: colors.foreground, fontSize: 16, lineHeight: 23, fontWeight: "600" }}>
          {requestTitle(request)}
        </Text>
        {request.title && request.title !== request.name ? <Muted theme={theme} size={13}>{request.name}</Muted> : null}
        {request.description ? <Text selectable style={{ color: colors.foreground, fontSize: 15, lineHeight: 22 }}>{request.description}</Text> : null}
        {facts.map(({ label, value }) => (
          <View key={label} style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface1 }}>
            <Muted theme={theme} size={13}>{label}</Muted>
            <Text selectable style={{ color: colors.foreground, fontSize: 15, lineHeight: 22,
              fontFamily: label === "Command" ? platform === "ios" ? "Menlo" : "monospace" : undefined }}>{value}</Text>
          </View>
        ))}
        {raw ? <Button theme={theme} size="touch" variant="outline" label={expanded ? "Hide technical details" : "Show technical details"}
          icon={expanded ? "ChevronUp" : "ChevronDown"} onPress={() => setExpanded((value) => !value)} /> : null}
        {raw && expanded ? (
          <Text selectable style={{
            color: colors.foregroundMuted, fontSize: 13, lineHeight: 19,
            fontFamily: platform === "ios" ? "Menlo" : "monospace",
            backgroundColor: colors.surface1, padding: space.md, borderRadius: radius.md,
          }}>{JSON.stringify(raw, null, 2)}</Text>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
        <IconButton theme={theme} icon="ArrowLeft" label="Back" size={44} disabled={busy} onPress={onBack} />
        {decisions.map((decision) => (
          <Button key={decision.id || decision.behavior} theme={theme} size="touch" style={{ flexGrow: 1 }}
            variant={decision.variant === "danger" ? "destructive" : decision.variant === "primary" || (!decision.variant && decision.behavior === "allow") ? "default" : "outline"}
            label={decision.label} disabled={busy}
            onPress={() => onSubmit({ behavior: decision.behavior, selectedActionId: decision.id || undefined })} />
        ))}
      </View>
    </View>
  );
}
