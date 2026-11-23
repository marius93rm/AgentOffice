import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PixelRatio, Text, View } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { eventsFromHistory, operationOfEvent } from "./exchanges";
import { buildForest, crewState, displayTitle, groupByWorkspace } from "./model";
import { MotionPaused } from "./motion";
import { OfficeScene } from "./office";
import { layoutOffice, presences } from "./office-model";
import { activeOperation, operationDeadline, type ActivityKind } from "./operations";
import type { PaseoAgent, PaseoApi, PaseoWorkspace } from "./paseo-types";
import { buildReplay, operationEvent, replayActor, replayLabel, sceneActor, type Journal, type ReplayActor, type ReplayEvent, type ReplayPresence } from "./replay-model";
import { indexNodes, officeScale } from "./scene-model";
import { SheetRow } from "./lobby-sheets";
import { Button, Chip, IconButton, Muted, radius, space } from "./ui";
import { observedTime } from "./supervision";
import { usePlayback } from "./use-playback";

const ignore = () => {};
const EMPTY = new Map();
const ITEMS_PER_PAGE = 24;
const HISTORY_CAP = 120;

export const ReplayScene = memo(function ReplayScene({ theme, actors, workspaces, cursor, still }: {
  theme: PluginTheme;
  actors: ReadonlyMap<string, ReplayPresence>;
  workspaces: ReadonlyMap<string, PaseoWorkspace>;
  cursor: number;
  still: boolean;
}) {
  const [width, setWidth] = useState(0);
  const scale = officeScale(width, width, PixelRatio.get(), null);
  const plan = useMemo(() => {
    const agents = new Map([...actors].flatMap(([id, actor]) => {
      const value = sceneActor(actor);
      return value ? [[id, value] as const] : [];
    }));
    const roots = buildForest(agents.values(), null);
    const map = layoutOffice(groupByWorkspace(roots, workspaces), { width: scale.widthTiles, agents });
    const operations = new Map<string, ActivityKind>();
    for (const [id, actor] of actors) {
      if (!actor.state) continue;
      const activity = activeOperation(actor.operation, actor.state, true, cursor);
      if (activity) operations.set(id, activity);
    }
    return { agents, map, nodes: indexNodes(roots), locations: presences(map, agents, crewState, cursor, false), operations };
  }, [actors, workspaces, scale.widthTiles, cursor]);
  return (
    <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={{ backgroundColor: theme.colors.surface0, borderRadius: radius.md, overflow: "hidden" }}>
      {plan.agents.size === 0 ? <View style={{ padding: space.md }}><Muted theme={theme} size={14}>No agent state observed at this point.</Muted></View>
        : width > 0 ? <View style={{ height: Math.min(320, plan.map.height * scale.tile) }}>
          <OfficeScene theme={theme} office={plan.map} tile={scale.tile} available={width} nodes={plan.nodes} agents={plan.agents}
            presences={plan.locations} bubbles={EMPTY} exchanges={[]} operations={plan.operations}
            selected={null} highlighted={null} still={still} onSelect={ignore} onLeft={ignore} onOpenClosed={ignore}
            interactive={false} />
        </View> : null}
    </View>
  );
});

async function historyOf(paseo: PaseoApi, agent: PaseoAgent): Promise<ReplayEvent[]> {
  const page = await paseo.agents.ref(agent.id).timeline.refetch({ direction: "tail", limit: HISTORY_CAP, projection: "projected" });
  const actor = replayActor(agent);
  let order = 0;
  return page.entries.flatMap((entry) => {
    const at = Date.parse(entry.timestamp);
    if (!Number.isFinite(at)) return [];
    const op = entry.item.type === "user_message"
      ? { id: entry.item.messageId ?? String(entry.seqEnd), agentId: agent.id, source: "message" as const, kind: "messaging" as const, phase: "completed" as const, at }
      : entry.item.type === "error"
        ? { id: String(entry.seqEnd), agentId: agent.id, source: "turn" as const, kind: "error" as const, phase: "failed" as const, at }
        : eventsFromHistory(agent.id, [entry], Date.now()).flatMap((event) => operationOfEvent(event) ?? [])[0];
    return op ? [{ ...operationEvent(actor, op), order: ++order }] : [];
  });
}

export function ReplaySheet({ theme, paseo, journal, scope, agents, workspaces, shown, still, privateActor, privateWorkspace }: {
  theme: PluginTheme;
  paseo: PaseoApi;
  journal: Journal;
  scope: string | null;
  agents: readonly PaseoAgent[];
  workspaces: ReadonlyMap<string, PaseoWorkspace>;
  shown: boolean;
  still: boolean;
  privateActor?: (actor: ReplayActor) => ReplayActor;
  privateWorkspace?: (id: string) => PaseoWorkspace;
}) {
  const log = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const [run, setRun] = useState<readonly ReplayEvent[]>(() => log);
  const [loading, setLoading] = useState<PaseoAgent | null>(null);
  const [past, setPast] = useState<readonly ReplayEvent[]>([]);
  const [error, setError] = useState(false);
  const [available, setAvailable] = useState(false);
  const [agentLimit, setAgentLimit] = useState(ITEMS_PER_PAGE);
  const [seekInput, setSeekInput] = useState("");
  const replay = useMemo(() => {
    const unique = new Map<string, ReplayEvent>();
    for (const event of [...past, ...run]) {
      if (scope !== null && (event.actor.workspaceId ?? "") !== scope) continue;
      unique.set(event.key, privateActor ? { ...event, actor: privateActor(event.actor) } : event);
    }
    return buildReplay([...unique.values()]);
  }, [past, run, scope, privateActor]);
  const duration = Math.max(0, replay.end - replay.start);
  const clock = usePlayback(duration, shown);
  const current = clock.offset + replay.start;
  const count = replay.countAt(current);
  const actors = useMemo(() => replay.seek(count), [replay, count]);
  const visibleWorkspaces = useMemo(() => {
    if (!privateWorkspace) return workspaces;
    const safe = new Map(workspaces);
    for (const event of replay.events) {
      const id = event.actor.workspaceId;
      if (id && !safe.has(id)) safe.set(id, privateWorkspace(id));
    }
    return safe;
  }, [privateWorkspace, replay.events, workspaces]);
  const eventTime = replay.events[count - 1]?.at ?? replay.start;
  let sceneTime = eventTime;
  for (const actor of actors.values()) {
    const expiry = operationDeadline(actor.operation);
    if (expiry !== null && expiry <= current) sceneTime = Math.max(sceneTime, expiry);
  }
  useEffect(() => {
    if (!loading) return;
    let active = true;
    void historyOf(paseo, loading).then((result) => {
      if (!active) return;
      setAvailable(result.length > 0);
      setPast(result);
      setError(false);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => { if (active) setLoading(null); });
    return () => { active = false; };
  }, [loading, paseo]);
  const step = (direction: 1 | -1) => {
    const moment = direction === 1 ? replay.events[count]?.at ?? replay.end
      : replay.events.findLast((event) => event.at < current)?.at ?? replay.start;
    clock.seek(moment - replay.start);
  };
  const jump = () => {
    if (!seekInput.trim()) return;
    const seconds = Number(seekInput.trim().replace(",", "."));
    if (Number.isFinite(seconds)) clock.seek(seconds * 1000);
  };
  return (
    <MotionPaused.Provider value={!shown}>
      <View style={{ gap: space.md }}>
        <Muted theme={theme} size={14}>Read-only replay. State changes are recorded while Lobby is observing. You can add recent timeline entries for one agent.</Muted>
        <Button theme={theme} size="touch" variant="outline" label="Refresh recorded events" disabled={run === log}
          onPress={() => { clock.seek(0); setRun(log); }} />
        {replay.events.length ? <>
          <ReplayScene theme={theme} actors={actors} workspaces={visibleWorkspaces} cursor={sceneTime} still={still || !clock.playing} />
          <Text style={{ color: theme.colors.foreground, fontSize: 15, fontVariant: ["tabular-nums"] }}>{observedTime(current)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
            <IconButton theme={theme} icon="SkipBack" size={44} label="Previous event" onPress={() => step(-1)} />
            <Button theme={theme} size="touch" label={clock.playing ? "Pause" : "Play"} icon={clock.playing ? "Pause" : "Play"}
              disabled={duration === 0} onPress={clock.toggle} />
            <IconButton theme={theme} icon="SkipForward" size={44} label="Next event" onPress={() => step(1)} />
            {([1, 2, 4] as const).map((speed) => <Chip key={speed} theme={theme} touch label={speed + "×"} selected={clock.speed === speed} onPress={() => clock.setSpeed(speed)} />)}
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.border }}>
            <View style={{ height: 4, borderRadius: 2, width: `${duration ? clock.offset / duration * 100 : 100}%`, backgroundColor: theme.colors.accent }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <TextInput value={seekInput} onChangeText={setSeekInput} onSubmitEditing={jump} keyboardType="decimal-pad"
              accessibilityLabel="Seek to seconds from start" placeholder="Seconds from start" placeholderTextColor={theme.colors.foregroundMuted}
              style={{ flex: 1, minWidth: 0, fontSize: 16, minHeight: 44, color: theme.colors.foreground, paddingHorizontal: space.sm, borderWidth: 1,
                borderRadius: radius.md, borderColor: theme.colors.border }} />
            <Button theme={theme} size="touch" variant="outline" label="Seek" onPress={jump} />
          </View>
          <Muted theme={theme}>{count} of {replay.events.length} events · {(clock.offset / 1000).toFixed(1)} s</Muted>
          {replay.events.slice(Math.max(0, count - 8), Math.min(replay.events.length, Math.max(9, count + 1))).reverse().map((event) => <SheetRow
            key={event.key} theme={theme} title={replayLabel(event)} subtitle={`${event.actor.title} · ${observedTime(event.at)}`}
            selected={event === replay.events[count - 1]} onPress={() => clock.seek(event.at - replay.start)} />)}
        </> : <Muted theme={theme}>No events recorded in this workspace.</Muted>}
        <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontWeight: "600", fontSize: 15 }}>Load recent timeline</Text>
        {loading ? <Muted theme={theme}>Loading the timeline…</Muted> : error ? <Muted theme={theme}>The recent timeline could not be loaded.</Muted>
          : available ? <Muted theme={theme}>Recent timeline included. Earlier state and lifecycle events may be unavailable.</Muted> : null}
        {agents.slice(0, agentLimit).map((agent) => <SheetRow key={agent.id} theme={theme} title={displayTitle(agent)} icon="History"
          onPress={() => { if (!loading) { clock.seek(0); setAvailable(false); setLoading(agent); } }} />)}
        {agents.length > agentLimit ? <Button theme={theme} size="touch" variant="outline" label="Show more agents" onPress={() => setAgentLimit(agentLimit + ITEMS_PER_PAGE)} /> : null}
      </View>
    </MotionPaused.Provider>
  );
}
