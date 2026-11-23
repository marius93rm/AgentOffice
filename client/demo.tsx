import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { PixelRatio, Text, View } from "react-native";
import { DEFAULT_ROOM } from "../shared/preferences";
import { TranscriptPreview } from "./chat";
import { buildForest, countStates, crewState, displayTitle, groupByWorkspace, STATE_LABEL } from "./model";
import { OfficeScene } from "./office";
import { layoutOffice, presences } from "./office-model";
import { QuestionForm } from "./question-form";
import { questionsOf } from "./questions";
import { indexNodes, officeScale } from "./scene-model";
import { Button, Chip, Muted, radius, space, useReducedMotion } from "./ui";
import { DEMO_CHAT, DEMO_QUESTION, DEMO_ROOM, DEMO_START, DEMO_WORKSPACES, demoBubbles, demoExchange, demoScenario, type DemoScenario } from "./demo-model";
import { buildReplay, sceneActor } from "./replay-model";
import { activeOperation, type ActivityKind } from "./operations";
import { effectOf } from "./visual-events";
import { usePlayback } from "./use-playback";
import { MotionPaused } from "./motion";
import { useShown } from "./use-directory";

const questions = questionsOf(DEMO_QUESTION)!;
const ignore = () => {};

export function DemoSurface({ theme }: PluginScreenProps) {
  const still = useReducedMotion();
  const [sized, setSized] = useState(false);
  const shown = useShown(sized);
  return <MotionPaused.Provider value={!shown}>
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: space.lg }}
      onLayout={(event) => setSized(event.nativeEvent.layout.width > 0 && event.nativeEvent.layout.height > 0)}>
      <View style={{ width: "100%", maxWidth: 720, alignSelf: "center" }}>
        <LobbyDemo theme={theme} still={still || !shown} shown={shown} />
      </View>
    </ScrollView>
  </MotionPaused.Provider>;
}

export function LobbyDemo({ theme, still, shown }: { theme: PluginTheme; still: boolean; shown: boolean }) {
  const [id, setId] = useState<DemoScenario["id"]>("recovery");
  return <View style={{ gap: space.md }}>
    <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "700" }}>Demo Mode</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      <Chip theme={theme} touch label="Test recovery" selected={id === "recovery"} onPress={() => setId("recovery")} />
      <Chip theme={theme} touch label="Office delivery" selected={id === "delivery"} onPress={() => setId("delivery")} />
    </View>
    <DemoPlayer key={id} theme={theme} still={still} shown={shown} id={id} />
  </View>;
}

function DemoPlayer({ theme, still, shown, id }: { theme: PluginTheme; still: boolean; shown: boolean; id: DemoScenario["id"] }) {
  const [width, setWidth] = useState(0);
  const [run, setRun] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const scenario = useMemo(() => demoScenario(id), [id]);
  const replay = useMemo(() => buildReplay(scenario.events), [scenario.events]);
  const clock = usePlayback(replay.end - DEMO_START, shown);
  const offset = clock.offset;
  const time = offset + DEMO_START;
  const asking = !choice && offset >= scenario.requestAt && offset < scenario.resumeAt;
  const count = replay.countAt(time);
  const state = useMemo(() => replay.seek(count), [replay, count]);
  const stageTime = replay.events[count - 1]?.at ?? DEMO_START;
  const scale = officeScale(width, width, PixelRatio.get(), null);
  const scene = useMemo(() => {
    const agents = new Map([...state].flatMap(([id, actor]) => {
      const value = sceneActor(actor);
      return value ? [[id, value] as const] : [];
    }));
    const roots = buildForest(agents.values(), null);
    const groups = groupByWorkspace(roots, DEMO_WORKSPACES);
    if (groups.length === 0) groups.push({ workspaceId: DEMO_ROOM, name: "Demo · Studio", roots: [], counts: countStates([]) });
    const office = layoutOffice(groups, { width: scale.widthTiles, agents, preferences: { [DEMO_ROOM]: { ...DEFAULT_ROOM,
      theme: id === "recovery" ? "library" : "studio", objects: { lamp: true, window: true } } } });
    const operations = new Map<string, ActivityKind>();
    for (const [id, present] of state) {
      if (!present.state) continue;
      const activity = activeOperation(present.operation, present.state, true, stageTime);
      if (activity) operations.set(id, activity);
    }
    return { office, agents, nodes: indexNodes(roots), locations: presences(office, agents, crewState, stageTime), operations };
  }, [state, scale.widthTiles, stageTime, id]);
  const bubbles = useMemo(() => demoBubbles(scenario, asking ? scenario.requestAt : -1), [scenario, asking]);
  const hasExchange = offset >= 8050 && offset < 10_100;
  const exchanges = useMemo(() => demoExchange(hasExchange ? 8050 : 0), [hasExchange]);
  const effects = useMemo(() => replay.events.slice(0, count).flatMap((event) => {
    if (event.type !== "operation" || stageTime - event.at > 2300) return [];
    const effect = effectOf(event.operation);
    return effect ? [{ ...effect, startsAt: event.at, endsAt: event.at + 2200 }] : [];
  }).slice(-2), [replay, count, stageTime]);
  useEffect(() => {
    if (asking && clock.playing) clock.pause();
  }, [asking, clock.playing]);
  const narrative = scenario.narrative.findLast((entry) => entry.at <= offset)?.text;
  const currentAgent = selected ? scene.agents.get(selected) : undefined;
  return (
    <View style={{ gap: space.md }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
        <Button theme={theme} size="touch" label={clock.playing ? "Pause" : "Play"} icon={clock.playing ? "Pause" : "Play"}
          onPress={clock.toggle} disabled={asking} />
        <Button theme={theme} size="touch" variant="outline" icon="RotateCcw" label="Restart" onPress={() => {
          clock.seek(0); setRun(run + 1); setChoice(null); setSelected(null);
        }} />
        <Button theme={theme} size="touch" variant="outline" label="Chat preview" icon="MessageSquare" onPress={() => setChat(!chat)} />
      </View>
      <Muted theme={theme} size={14}>{narrative} · {(offset / 1000).toFixed(1)} s</Muted>
      <View style={{ height: width > 0 ? Math.min(scene.office.height * scale.tile, 332) : 154, backgroundColor: theme.colors.surface1, borderRadius: radius.md, overflow: "hidden" }}>
        {width > 0 ? <OfficeScene key={run} theme={theme} tile={scale.tile} office={scene.office} nodes={scene.nodes} agents={scene.agents}
          presences={scene.locations} operations={scene.operations} bubbles={bubbles} exchanges={exchanges} effects={effects}
          light={id === "recovery" ? "night" : "day"} pet
          roomScope={DEMO_ROOM} selected={selected} highlighted={null} still={still} available={width}
          onSelect={setSelected} onLeft={ignore} onOpenClosed={ignore} /> : null}
      </View>
      {currentAgent ? <Muted theme={theme} size={14}>{displayTitle(currentAgent)} · {STATE_LABEL[crewState(currentAgent)]}</Muted> : null}
      {asking ? (
        <QuestionForm theme={theme} request={DEMO_QUESTION} questions={questions} busy={false} onSubmit={(response) => {
          if (response.behavior !== "allow") return;
          const answers = response.updatedInput?.answers as Record<string, string> | undefined;
          setChoice(Object.values(answers ?? {}).join(" · ") || "Response selected");
          clock.seek(scenario.resumeAt);
        }} />
      ) : choice && offset < scenario.resumeAt + 4200 ? <Muted theme={theme}>Demo response saved · {choice}</Muted> : null}
      {chat ? <View style={{ padding: space.md, gap: space.md, backgroundColor: theme.colors.surface1, borderRadius: radius.lg }}>
        <Text style={{ fontSize: 16, color: theme.colors.foreground, fontWeight: "600" }}>Sample chat · Dario</Text>
        <TranscriptPreview theme={theme} items={DEMO_CHAT} />
      </View> : null}
    </View>
  );
}
