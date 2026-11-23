import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Text, View } from "react-native";
import { activityAt, crewState, displayTitle, STATE_LABEL } from "./model";
import { canNotify, isAttention, NOTICE_LABEL, type Notice } from "./notifications";
import { OPERATION_PHASE, operationTitle, type Operation, type Task } from "./operations";
import type { PaseoAgent } from "./paseo-types";
import { SheetRow } from "./lobby-sheets";
import { Button, Chip, IconButton, Muted, radius, space } from "./ui";
import type { LobbyPreferences } from "../shared/preferences";
import type { Metric } from "./metrics";

const TASK_STATE: Record<Task["state"], string> = { working: "In progress", planned: "Planned", blocked: "Blocked", done: "Completed" };

export function observedTime(at: number): string {
  return Number.isFinite(at) && at > 0 ? new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" }) : "Time unavailable";
}

export function OperationsSheet({ theme, agents, latest, live, connection, workspaceName, onOpen, onLocate, privateMode }: {
  theme: PluginTheme;
  agents: readonly PaseoAgent[];
  latest: ReadonlyMap<string, Operation>;
  live: ReadonlySet<string>;
  connection: "online" | "offline" | "error" | "idle" | "connecting" | undefined;
  workspaceName: (agent: PaseoAgent) => string | null;
  onOpen: (agent: PaseoAgent) => void;
  onLocate: (agent: PaseoAgent) => void;
  privateMode?: boolean;
}) {
  const [shown, setShown] = useState(24);
  return (
    <View style={{ gap: space.sm }}>
      <Muted theme={theme} size={14}>
        {connection === "online" ? "Connected" : connection === "connecting" ? "Connecting…" : connection === "offline" || connection === "error" ? "Disconnected" : "Connection status unavailable"}
        {` · ${agents.filter((agent) => live.has(agent.id)).length} live timelines`}
      </Muted>
      {agents.length === 0 ? <Muted theme={theme} size={15}>No agents in this room.</Muted> : null}
      {agents.slice(0, shown).map((agent) => {
        const op = latest.get(agent.id);
        const receiving = live.has(agent.id) && connection !== "offline" && connection !== "error";
        return (
          <View key={agent.id} style={{ gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: theme.colors.surface1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <SheetRow theme={theme} title={displayTitle(agent)} icon={receiving ? "Radio" : "Clock"}
                subtitle={[STATE_LABEL[crewState(agent)], workspaceName(agent), receiving ? "Live timeline" : "Latest snapshot"].filter(Boolean).join(" · ")}
                onPress={() => onOpen(agent)} />
              <IconButton theme={theme} size={44} icon="Map" label={`Show ${displayTitle(agent)} on the map`} onPress={() => onLocate(agent)} />
            </View>
            <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xs, gap: 2 }}>
              {op ? <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>{operationTitle(op)} · {OPERATION_PHASE[op.phase]}</Text>
                : <Muted theme={theme} size={13}>Activity details unavailable</Muted>}
              {!privateMode && op && (op.tool || op.resource) ? <Muted theme={theme} size={13} numberOfLines={2}>{[op.tool, op.resource].filter(Boolean).join(" · ")}</Muted> : null}
              {crewState(agent) === "failed" ? <Text numberOfLines={3} style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
                {privateMode ? "Agent reported an error" : agent.lastError ?? "Agent reported an error"}
              </Text> : null}
              <Muted theme={theme} size={12}>{observedTime(op?.at ?? Date.parse(activityAt(agent)))}</Muted>
            </View>
          </View>
        );
      })}
      {agents.length > shown ? <Button theme={theme} size="touch" variant="outline" label="Show more agents" onPress={() => setShown(shown + 24)} /> : null}
    </View>
  );
}

export function BoardSheet({ theme, tasks, agents, workspaceName, onPick, onRead, privateMode }: {
  theme: PluginTheme;
  tasks: readonly Task[];
  agents: ReadonlyMap<string, PaseoAgent>;
  workspaceName: (agent: PaseoAgent) => string | null;
  onPick: (id: string) => void;
  onRead?: (id: string) => Promise<"found" | "empty" | "error">;
  privateMode?: boolean;
}) {
  const [limit, setLimit] = useState(30);
  const [filter, setFilter] = useState<Task["state"] | null>(null);
  const [reading, setReading] = useState(false);
  const [agentCount, setAgentCount] = useState(20);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const listed = filter ? tasks.filter((task) => task.state === filter) : tasks;
  return (
    <View style={{ gap: space.sm }}>
      <Muted theme={theme} size={14}>Tasks from the latest structured updates received from Paseo.</Muted>
      {tasks.length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Chip theme={theme} touch label="All" selected={filter === null} onPress={() => setFilter(null)} />
        {Object.entries(TASK_STATE).map(([key, label]) => <Chip key={key} theme={theme} touch label={label} selected={filter === key}
          onPress={() => setFilter(key as Task["state"])} />)}
      </View> : null}
      {listed.length === 0 ? <Muted theme={theme} size={15}>{tasks.length ? "No tasks with this status." : "No task updates received."}</Muted> : null}
      {listed.slice(0, limit).map((task) => {
        const agent = agents.get(task.agentId);
        if (!agent) return null;
        const icon = task.state === "done" ? "CircleCheck" : task.state === "blocked" ? "CircleAlert" : "ListTodo";
        const tone = task.state === "done" ? theme.colors.statusSuccess : task.state === "blocked" ? theme.colors.statusWarning : undefined;
        return <SheetRow key={task.id} theme={theme} icon={icon} tone={tone} title={privateMode ? "Task" : task.title}
          subtitle={[TASK_STATE[task.state], displayTitle(agent), workspaceName(agent), observedTime(task.at)].filter(Boolean).join(" · ")}
          onPress={() => onPick(task.agentId)} />;
      })}
      {listed.length > limit ? <Button theme={theme} size="touch" variant="outline" label="Show more tasks" onPress={() => setLimit(limit + 30)} /> : null}
      {onRead && agents.size > 0 ? <Button theme={theme} size="touch" variant="outline" icon="History"
        label={reading ? "Hide agent timelines" : "Load recent tasks from an agent"} onPress={() => setReading(!reading)} /> : null}
      {reading && onRead ? <>
        {message ? <Muted theme={theme} size={13}>{message}</Muted> : null}
        {[...agents.values()].slice(0, agentCount).map((agent) => <SheetRow key={agent.id} theme={theme}
          title={displayTitle(agent)} subtitle={loading === agent.id ? "Reading timeline…" : workspaceName(agent) ?? undefined} icon="History"
          onPress={() => {
            if (loading) return;
            setLoading(agent.id);
            setMessage(null);
            void onRead(agent.id).then((status) => {
              setLoading(null);
              setMessage(status === "found" ? "Board updated." : status === "empty" ? "No task update in the recent timeline." : "Could not read the timeline.");
            });
          }} />)}
        {agents.size > agentCount ? <Button theme={theme} size="touch" variant="outline" label="Show more agents" onPress={() => setAgentCount(agentCount + 20)} /> : null}
      </> : null}
    </View>
  );
}

export function NotificationsSheet({ theme, entries, agents, preference, writable, onMode, onPick }: {
  theme: PluginTheme;
  entries: readonly Notice[];
  agents: ReadonlyMap<string, PaseoAgent>;
  preference: LobbyPreferences["notices"];
  writable: boolean;
  onMode: (value: LobbyPreferences["notices"]) => void;
  onPick: (notice: Notice) => void;
}) {
  const filtered = entries.filter((notice) => canNotify(notice.kind, preference));
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {([["all", "All"], ["attention", "Action needed"], ["off", "Off"]] as const).map(([value, label]) => (
          <Chip key={value} theme={theme} touch label={label} selected={preference === value} disabled={!writable} onPress={() => onMode(value)} />
        ))}
      </View>
      {!filtered.length ? <Muted theme={theme} size={15}>{preference === "off" ? "Notifications are off. Questions and permissions are available in Inbox." : "No recent notifications."}</Muted> : null}
      {[...filtered].reverse().map((notice) => {
        const agent = notice.agentId ? agents.get(notice.agentId) : undefined;
        const title = NOTICE_LABEL[notice.kind];
        const subtitle = [agent ? displayTitle(agent) : null, observedTime(notice.at)].filter(Boolean).join(" · ");
        if (!agent) return <View key={notice.id} style={{ padding: space.sm, gap: 4 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 15 }}>{title}</Text><Muted theme={theme}>{subtitle}</Muted>
        </View>;
        return <SheetRow key={notice.id} theme={theme} title={title} subtitle={subtitle}
          icon={isAttention(notice.kind) ? "BellRing" : "Bell"} tone={isAttention(notice.kind) ? theme.colors.statusWarning : undefined}
          onPress={() => onPick(notice)} />;
      })}
    </View>
  );
}

export function MetricsSheet({ theme, metrics, coverage }: { theme: PluginTheme; metrics: readonly Metric[]; coverage: string }) {
  return <View style={{ gap: space.sm }}>
    <Muted theme={theme} size={14}>{coverage}</Muted>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {metrics.map((metric) => <View key={metric.id} style={{ flexGrow: 1, flexBasis: 147, padding: space.md, gap: space.xs, backgroundColor: theme.colors.surface1, borderRadius: radius.md }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "500" }}>{metric.label}</Text>
        <Text style={{ color: theme.colors.foreground, fontSize: metric.value === null ? 14 : 19, fontVariant: ["tabular-nums"] }}>
          {metric.value === null ? "Unavailable" : metric.unit === "minutes" ? `${metric.value.toFixed(1)} min` : metric.value}
        </Text>
        <Muted theme={theme} size={12}>{metric.source}</Muted>
      </View>)}
    </View>
  </View>;
}
