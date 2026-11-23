import { useHosts, usePaseo, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Modal, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { DEFAULT_PREFERENCES, DEFAULT_ROOM, lobbyPreferences, type LobbyPreferences, type RoomSetting } from "../shared/preferences";
import type { PaseoAgent, PaseoRequest } from "./paseo-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { AgentDialogContent, AgentFacts, Detail, agentDialogTitle, dialogRequest, useAgentActions } from "./detail";
import { ArtPreview } from "./art-preview";
import { AvatarEditor, useAvatars } from "./avatar";
import { LobbyDemo } from "./demo";
import { DockHandle } from "./dock-handle";
import { SIDE_DOCK_MIN_WIDTH, bottomDockHeight, readSize, sideDockWidth } from "./dock-model";
import { candidatesOf } from "./feed-plan";
import { CrewList } from "./list";
import { InboxRoomChoice, InboxStatusLine, OfficeSettings, RequestsSheet, RoomsSheet, SheetRow, TeamCard, type RoomEntry } from "./lobby-sheets";
import type { Bubble } from "./exchanges";
import {
  buildForest,
  countStates,
  crewState,
  displayModel,
  displayTitle,
  filterForest,
  flatten,
  groupByWorkspace,
  matches,
  roleOf,
  activityAt,
  formatAge,
  nextAgeChange,
  STATE_LABEL,
  STATE_ORDER,
  summary,
  type CrewNode,
  type CrewState,
} from "./model";
import { MotionPaused } from "./motion";
import { OfficeScene } from "./office";
import { inInboxRoom, nextPermissionOrder, permissionKey } from "./inbox-model";
import { officeLight } from "./lighting";
import { activeOperation, operationSummary, type ActivityKind, type Operation } from "./operations";
import { canNotify, scopedTasks, type Notice } from "./notifications";
import { BoardSheet, MetricsSheet, NotificationsSheet, OperationsSheet } from "./supervision";
import { metricsOf } from "./metrics";
import { ReplaySheet } from "./replay";
import { privacyFor, privateBubbles, privateExchanges, privateOperations, privateTasks } from "./privacy";
import { isQuestion } from "./questions";
import { officeImage } from "./screenshot";
import {
  isDormant,
  createOfficeLayoutCache,
  nextPresenceChange,
  presences as presencesOf,
  sharePresences,
  type Presence,
} from "./office-model";
import { highlighted as highlightedBy, indexNodes, officeScale, spriteRole, zoomStep } from "./scene-model";
import {
  Chip,
  Button,
  Empty,
  IconButton,
  Muted,
  font,
  pressStyle,
  radius,
  space,
  stateColor,
  useReducedMotion,
} from "./ui";
import { useDirectory, useShown, useWake } from "./use-directory";
import { useFeed } from "./use-feed";
import { useInbox } from "./use-inbox";
import { useNotices } from "./use-notices";
import { useVisualEffects } from "./use-effects";
import { useJournal } from "./use-journal";
import { nextWake, paneShown } from "./wake";
import { canExportOffice, downloadOffice, recall, remember } from "./web";

type Filter = CrewState | "all";
type Mode = "office" | "list";
type Sheet = (
  | { kind: "agent" | "requests" | "rooms" | "settings" | "filters" | "search" | "closed" | "demo" | "art" | "tools" | "operations" | "notices" | "replay" | "metrics" | "privacy" }
  | { kind: "board"; workspaceId: string | null }
  | { kind: "avatar" | "agent-menu" | "agent-facts"; agentId: string }
  | { kind: "private-request"; agentId: string }
  | { kind: "bubble"; bubble: Bubble }
) & { back?: Sheet };

const NOBODY: ReadonlySet<string> = new Set();
const NO_REQUESTS: readonly PaseoRequest[] = [];
const SEARCH_RESULTS = 12;

const counter = (label: string, count: number) => count > 0 ? `${label} ${count > 99 ? "99+" : count}` : label;

export interface CrewViewProps extends PluginSurfaceProps {
  scope: string | null;
}

export function CrewView({ scope: homeScope, theme, host, layout, navigation }: CrewViewProps) {
  // A panel opens on its own workspace, and both entry points can focus a room.
  const inPanel = homeScope !== null;
  const [scope, setScope] = useState(homeScope);
  const paseo = usePaseo();
  const connection = useHosts().find((entry) => entry.serverId === host.id)?.status;
  const online = connection === "online" ? true : connection === "offline" || connection === "error" ? false : null;
  const toast = useToast();
  const settings = useSettings(lobbyPreferences);
  const avatars = useAvatars();
  const preferences = settings.status === "ready" ? settings.values : DEFAULT_PREFERENCES;
  const [size, setSize] = useState({ view: 0, height: 0, scene: 0, column: 0 });
  // Sizes picked by hand are kept on this device, for a panel and for the surface apart, since one is
  // narrow and the other wide: the office's zoom, and the dock's width beside it and height under it.
  const place = inPanel ? "panel" : "surface";
  const zoomKey = `zoom.${place}`;
  const motionKey = `motion.${place}`;
  const [zoom, setZoomState] = useState(() => readSize(recall(zoomKey)));
  const setZoom = useCallback(
    (next: number | null) => {
      setZoomState(next);
      remember(zoomKey, next === null ? null : String(next));
    },
    [zoomKey],
  );
  const [dockWanted, setDockWanted] = useState(() => ({
    side: readSize(recall(`dock.width.${place}`)),
    bottom: readSize(recall(`dock.height.${place}`)),
  }));
  // The host keeps a pane mounted behind another tab; then nothing here runs.
  const shown = useShown(paneShown(size.view, size.height));
  const sources = useDirectory(paseo, shown);
  const aliases = useMemo(() => privacyFor(paseo), [paseo]);
  const privateMode = settings.status !== "ready" || preferences.privacy;
  const displayAgents = useMemo(() => privateMode ? new Map([...sources.agents].map(([id, agent]) => [id, aliases.agent(agent)])) : sources.agents,
    [sources.agents, privateMode, aliases]);
  const displayWorkspaces = useMemo(() => {
    if (!privateMode) return sources.workspaces;
    const ids = new Set(sources.workspaces.keys());
    for (const agent of sources.agents.values()) if (agent.workspaceId) ids.add(agent.workspaceId);
    return new Map([...ids].map((id) => [id, aliases.workspace(id)]));
  }, [sources.workspaces, sources.agents, privateMode, aliases]);
  const directory = { ...sources, agents: displayAgents, workspaces: displayWorkspaces };
  const journal = useJournal(paseo, sources.agents, shown && online !== false && sources.phase === "ready");
  // Time moves here only when something drawn depends on it: see `wakeAt`.
  const [turn, setTurn] = useState(0);
  const now = useMemo(() => Date.now(), [turn, directory.agents, shown]);
  const lighting = useMemo(() => officeLight(preferences.lighting, now, preferences.effects), [preferences.lighting, preferences.effects, now]);
  const actions = useAgentActions(paseo);
  const reducedMotion = useReducedMotion();
  const [legacyMotion] = useState(() => recall(motionKey));
  const motionMode = preferences.motion ?? (legacyMotion === "off" ? "off" : "system");
  const officeStill = motionMode === "off" || (motionMode === "system" && reducedMotion);
  const touch = layout.platform !== "web" || (size.view > 0 ? size.view < 600 : layout.compact);
  const [mode, setMode] = useState<Mode>("office");
  const [search, setSearch] = useState({ text: "", privateMode });
  const query = search.privateMode === privateMode ? search.text : "";
  const setQuery = (text: string) => setSearch({ text, privateMode });
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const previousRoom = useRef<string | null>(homeScope);
  const [queueAcrossRooms, setQueueAcrossRooms] = useState(false);
  const [nextRequests, setNextRequests] = useState<readonly string[] | null>(null);
  const [mapFocus, setMapFocus] = useState<{ agentId: string } | null>(null);
  // The room whose closed agents are listed in the dock.
  const [closedRoom, setClosedRoom] = useState<string | null>(null);
  const [inView, setInView] = useState<readonly string[] | null>(null);
  const [listVisible, setListVisible] = useState<ReadonlySet<string>>(NOBODY);
  const reportListVisible = useCallback((ids: readonly string[]) => {
    setListVisible((previous) => ids.length === previous.size && ids.every((id) => previous.has(id)) ? previous : new Set(ids));
  }, []);
  const { colors } = theme;
  const { setDialog, busy } = actions;
  const inbox = useInbox(sources.agents, { shown, online, directoryPhase: sources.phase });
  const pendingEntries = useMemo(() => privateMode ? inbox.pending.flatMap((entry) => {
    const agent = displayAgents.get(entry.agent.id);
    const request = agent?.pendingPermissions.find((value) => value.id === entry.request.id);
    return agent && request ? [{ ...entry, agent, request }] : [];
  }) : inbox.pending, [privateMode, displayAgents, inbox.pending]);
  const pendingByAgent = useMemo(() => {
    const grouped = new Map<string, PaseoRequest[]>();
    for (const { agent, request } of pendingEntries) {
      const requests = grouped.get(agent.id) ?? [];
      requests.push(request);
      grouped.set(agent.id, requests);
    }
    return grouped;
  }, [pendingEntries]);
  const officeRequests = useMemo(() => pendingEntries.filter(({ agent }) => inInboxRoom(agent.workspaceId, scope)), [pendingEntries, scope]);
  const queueRequests = queueAcrossRooms ? pendingEntries : officeRequests;
  const nextRequest = useMemo(() => {
    if (!nextRequests) return undefined;
    const pending = new Map(queueRequests.map((entry) => [permissionKey(entry.agent.id, entry.request.id), entry]));
    for (const key of nextRequests) {
      const entry = pending.get(key);
      if (entry) return entry;
    }
    return queueRequests[0];
  }, [nextRequests, queueRequests]);
  const refreshInbox = () => {
    if (sources.phase === "error") directory.reload();
    inbox.reload();
  };
  const onResponded = (agentId: string, requestId: string) => {
    inbox.acknowledge(agentId, requestId);
    if (sheet?.kind === "requests") {
      setNextRequests(nextPermissionOrder(queueRequests.map(({ agent, request }) => permissionKey(agent.id, request.id)),
        permissionKey(agentId, requestId)));
    }
  };

  const allRoots = useMemo(() => buildForest(directory.agents.values(), null), [directory.agents]);
  const globalNodes = useMemo(() => indexNodes(allRoots), [allRoots]);
  const roots = useMemo(() => scope === null ? allRoots : buildForest(directory.agents.values(), scope), [allRoots, directory.agents, scope]);
  const counts = useMemo(() => countStates(roots), [roots]);
  const workspaceName = useCallback(
    (agent: PaseoAgent) => (agent.workspaceId ? (directory.workspaces.get(agent.workspaceId)?.name ?? null) : null),
    [directory.workspaces],
  );
  const keep = useCallback(
    (node: CrewNode) =>
      (filter === "all" || node.state === filter) && (privateMode
        ? [displayTitle(node.agent), roleOf(node.agent), workspaceName(node.agent)].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())
        : matches(node.agent, query, workspaceName(node.agent))),
    [filter, query, workspaceName, privateMode],
  );
  // The list drops what does not match; the office keeps every seat and dims instead.
  const listed = useMemo(() => filterForest(roots, keep), [roots, keep]);
  const matchesInSearch = useMemo(() => sheet?.kind === "search" && (query.trim() || filter !== "all")
    ? flatten(listed, NOBODY).filter(keep) : [], [sheet?.kind, query, filter, listed, keep]);
  const highlighted = useMemo(
    () => privateMode ? filter === "all" && !query.trim() ? null : new Set([...indexNodes(filterForest(roots, keep)).keys()])
      : highlightedBy(roots, filter, query, workspaceName),
    [roots, filter, query, workspaceName, keep, privateMode],
  );

  const office = mode === "office";
  // Small in a side pane, larger in a wide one, or the size picked by hand. Only a change of size or of
  // tiles across lays the office out again, not every pixel a dock is dragged by.
  const pixelRatio = PixelRatio.get();
  const fitted = officeScale(size.view, size.scene, pixelRatio, zoom);
  const scale = useMemo(() => fitted, [fitted.scale, fitted.widthTiles]);
  const zoomOut = zoomStep(scale.scale, -1, size.scene, pixelRatio);
  const zoomIn = zoomStep(scale.scale, 1, size.scene, pixelRatio);
  const nodes = useMemo(() => indexNodes(roots), [roots]);
  // A closed agent has no desk, but it keeps the one it had until it has walked out of the door.
  const [left, setLeft] = useState<ReadonlySet<string>>(NOBODY);
  const seatedBefore = useRef<ReadonlySet<string>>(NOBODY);
  const holding = useMemo(() => {
    if (!office || officeStill) return NOBODY;
    const out = new Set<string>();
    for (const [id, node] of nodes) {
      if (node.state === "closed" && seatedBefore.current.has(id) && !left.has(id)) out.add(id);
    }
    return out.size > 0 ? out : NOBODY;
  }, [nodes, left, office, officeStill]);
  const everyGroup = useMemo(() => groupByWorkspace(roots, directory.workspaces), [roots, directory.workspaces]);
  const roomEntries = useMemo<RoomEntry[]>(() => {
    const grouped = groupByWorkspace(allRoots, directory.workspaces);
    const entries = new Map(grouped.map((group) => [group.workspaceId, {
      id: group.workspaceId, name: group.name, working: group.counts.working, waiting: group.counts["needs-input"],
    }]));
    for (const workspace of directory.workspaces.values()) {
      if (!entries.has(workspace.id)) entries.set(workspace.id, {
        id: workspace.id, name: [workspace.projectDisplayName, workspace.name].filter(Boolean).join(" · "), working: 0, waiting: 0,
      });
    }
    return [...entries.values()];
  }, [allRoots, directory.workspaces]);
  // Across workspaces, a room nobody is in stays folded away until a search or
  // the Closed filter singles out somebody in it.
  const groups = useMemo(() => {
    if (scope !== null) {
      if (everyGroup.length) return everyGroup;
      const workspace = directory.workspaces.get(scope);
      return workspace ? [{ workspaceId: scope, name: workspace.name, roots: [], counts: countStates([]) }] : everyGroup;
    }
    return everyGroup.filter(
      (group) =>
        !isDormant(group) ||
        // Its last agent is still walking out.
        candidatesOf(group.roots).some((candidate) => holding.has(candidate.id) || candidate.id === mapFocus?.agentId) ||
        (highlighted !== null && candidatesOf(group.roots).some((candidate) => highlighted.has(candidate.id))),
    );
  }, [everyGroup, scope, highlighted, holding, directory.workspaces, mapFocus]);
  // Laid out whole each time; what came out as before is the object from before, and is not drawn again.
  const layoutCached = useMemo(createOfficeLayoutCache, []);
  const plan = useMemo(() => layoutCached(groups, { width: scale.widthTiles, agents: directory.agents, holding, preferences: preferences.rooms }),
    [layoutCached, groups, scale.widthTiles, directory.agents, holding, preferences.rooms]);
  useEffect(() => {
    seatedBefore.current = office ? new Set(plan.desks.keys()) : NOBODY;
  }, [plan, office]);
  useEffect(() => {
    // Whoever is no longer closed, or no longer here, is forgotten.
    setLeft((current) => {
      const kept = [...current].filter((id) => nodes.get(id)?.state === "closed");
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [nodes]);
  const onLeft = useCallback((agentId: string) => setLeft((current) => new Set(current).add(agentId)), []);
  const lastPresences = useRef<ReadonlyMap<string, Presence> | null>(null);
  const presences = useMemo(() => {
    const next = sharePresences(lastPresences.current, presencesOf(plan, directory.agents, crewState, now, preferences.ambient));
    lastPresences.current = next;
    return next;
  }, [plan, directory.agents, now, preferences.ambient]);
  // Only the rooms on screen compete for the live subscriptions.
  const candidates = useMemo(() => {
    const visible = inView ? new Set(inView) : null;
    return candidatesOf(groups.filter((group) => !visible || visible.has(group.workspaceId)).flatMap((group) => group.roots));
  }, [groups, inView]);
  // The scene's own size passes through nothing too; its leases are held through that like the rest.
  const sceneShown = useShown(size.scene > 0);
  const inspecting = sheet?.kind === "operations" || sheet?.kind === "board";
  const feedCandidates = useMemo(() => {
    if (inspecting) return candidatesOf(roots);
    if (office) return candidates;
    return candidatesOf(roots).filter(({ id }) => listVisible.has(id));
  }, [inspecting, roots, candidates, office, listVisible]);
  const known = useMemo(() => new Set(directory.agents.keys()), [directory.agents]);
  const observeFeed = useRef<(operations: readonly Operation[], live: boolean) => void>(() => {});
  const feed = useFeed(paseo, feedCandidates, { enabled: shown && (!office || sceneShown || inspecting), connected: online !== false, known,
    onEvents: (operations, live) => observeFeed.current(operations, live) });
  const tasks = useMemo(() => scopedTasks(feed.tasks, directory.agents, null), [feed.tasks, directory.agents]);
  const notices = useNotices(directory.agents, tasks, online, shown);
  const visuals = useVisualEffects(notices, tasks, shown && office && preferences.effects);
  observeFeed.current = (operations, live) => {
    journal.record(operations, sources.agents);
    visuals.onOperations(operations, live);
  };
  const bubbles = useMemo(() => privateMode ? privateBubbles(feed.bubbles) : feed.bubbles, [privateMode, feed.bubbles]);
  const exchanges = useMemo(() => privateMode ? privateExchanges(feed.exchanges) : feed.exchanges, [privateMode, feed.exchanges]);
  const latest = useMemo(() => privateMode ? privateOperations(feed.latest) : feed.latest, [privateMode, feed.latest]);
  const operations = useMemo(() => {
    const poses = new Map<string, ActivityKind>();
    for (const id of feed.live) {
      const node = nodes.get(id);
      if (!node) continue;
      const latest = feed.latest.get(id);
      const pose = activeOperation(feed.running.get(id)?.at(-1), node.state, true, feed.now)
        ?? activeOperation(latest, node.state, true, feed.now);
      if (pose) poses.set(id, pose);
    }
    return poses;
  }, [nodes, feed.latest, feed.running, feed.live, feed.now]);

  const openAgent = useCallback((agent: PaseoAgent) => {
    setSheet(null);
    setDialog(null);
    navigation?.openAgent({ agentId: agent.id, serverId: host.id });
  }, [navigation, host.id, setDialog]);
  const savePreferences = async (change: (values: LobbyPreferences) => LobbyPreferences) => {
    if (settings.status !== "ready" || settings.saving) return false;
    const saved = await settings.save(change(settings.values), settings.revision);
    if (!saved) toast.error("Could not save Lobby settings. Reopen settings to retry.");
    return saved;
  };
  const openRequest = useCallback((agent: PaseoAgent, requestId: string) => {
    if (privateMode) {
      setSheet((current) => ({ kind: "private-request", agentId: agent.id, back: current ?? undefined }));
      return;
    }
    setDialog({ kind: "permission", agent, requestId });
  }, [setDialog, privateMode]);
  const showRequests = () => {
    refreshInbox();
    setQueueAcrossRooms(false);
    setNextRequests(null);
    setSheet({ kind: "requests" });
  };
  const showBubble = useCallback((bubble: Bubble) => {
    const agent = directory.agents.get(bubble.agentId);
    if (bubble.tone === "ask" && agent?.pendingPermissions.some((request) => request.id === bubble.key)) {
      openRequest(agent, bubble.key);
    } else {
      setSheet({ kind: "bubble", bubble });
    }
  }, [directory.agents, openRequest]);
  const chooseRoom = (id: string | null) => {
    if (id !== null) previousRoom.current = id;
    setScope(id);
    setSheet(null);
    setSelected(null);
    setClosedRoom(null);
    setInView(null);
    setMapFocus(null);
  };
  const showAgent = useCallback((agentId: string) => {
    setSelected(agentId);
    if (touch) setSheet({ kind: "agent" });
  }, [touch]);
  const showObservedAgent = useCallback((id: string) => {
    setSelected(id);
    setSheet((current) => ({ kind: "agent", back: current ?? undefined }));
  }, []);
  const focusOnMap = useCallback((agent: PaseoAgent, showDetails = false) => {
    setMode("office");
    if (scope !== null && !plan.roomOf.has(agent.id)) {
      setScope(agent.workspaceId ?? "");
      setInView(null);
    }
    setSelected(agent.id);
    setMapFocus({ agentId: agent.id });
    setClosedRoom(null);
    setDialog(null);
    setSheet(showDetails && touch ? { kind: "agent" } : null);
  }, [scope, plan.roomOf, setDialog, touch]);
  const openBoard = useCallback((workspaceId: string) => setSheet({ kind: "board", workspaceId }), []);
  const showNotice = (notice: Notice) => {
    const agent = notice.agentId ? directory.agents.get(notice.agentId) : undefined;
    if (!agent) return;
    if (notice.requestId && agent.pendingPermissions.some((entry) => entry.id === notice.requestId)) openRequest(agent, notice.requestId);
    else showObservedAgent(agent.id);
  };
  const toggle = useCallback((agentId: string) => {
    setClosedRoom(null);
    if (touch) showAgent(agentId);
    else setSelected((current) => (current === agentId ? null : agentId));
  }, [touch, showAgent]);
  const openClosed = useCallback((workspaceId: string) => {
    setSelected(null);
    if (touch) {
      setClosedRoom(workspaceId);
      setSheet({ kind: "closed" });
    } else setClosedRoom((current) => (current === workspaceId ? null : workspaceId));
  }, [touch]);
  const closedList = useMemo(() => {
    const room = office && closedRoom ? plan.rooms.find((entry) => entry.workspaceId === closedRoom) : undefined;
    if (!room?.closed) return null;
    const listed = room.closed.ids.flatMap((id) => nodes.get(id) ?? []);
    // What a search or filter singles out comes first.
    const first = highlighted ? listed.filter((node) => highlighted.has(node.agent.id)) : [];
    return { name: room.name, nodes: [...first, ...listed.filter((node) => !first.includes(node))], matching: first.length };
  }, [office, closedRoom, plan, nodes, highlighted]);

  const team = useMemo(() => {
    const root = selected ? globalNodes.get(selected) : undefined;
    return root?.descendants ? flatten(root.children, NOBODY) : [];
  }, [selected, globalNodes]);
  const litTeam = useMemo(() => {
    if (!selected) return highlighted;
    if (team.length === 0) return highlighted && !highlighted.has(selected) ? new Set([...highlighted, selected]) : highlighted;
    const ids = new Set([selected, ...team.map((member) => member.agent.id)]);
    return highlighted ? new Set([...ids].filter((id) => highlighted.has(id) || id === selected)) : ids;
  }, [selected, team, highlighted]);

  const detailFor = useCallback(
    (node: CrewNode, place: { dock: boolean; sheet?: boolean; style?: StyleProp<ViewStyle> }) => (
      <Detail
        key={node.agent.id}
        theme={theme}
        paseo={paseo}
        node={node}
        shown={shown}
        still={reducedMotion}
        operation={latest.get(node.agent.id)}
        live={online !== false && feed.live.has(node.agent.id)}
        now={now}
        title={place.dock}
        {...(place.dock
          ? {
              onClose: () => setSelected(null),
              closeIcon: closedList ? "ArrowLeft" : "X",
              closeLabel: closedList ? "Back to the closed agents" : "Close details",
            }
          : {})}
        canOpen={Boolean(navigation)}
        onOpen={() => openAgent(node.agent)}
        onMessage={() => setDialog({ kind: "message", agent: node.agent })}
        onReview={(requestId) => openRequest(node.agent, requestId)}
        pending={pendingByAgent.get(node.agent.id) ?? NO_REQUESTS}
        onMore={() => setSheet({ kind: "agent-menu", agentId: node.agent.id, back: place.sheet ? sheet ?? undefined : undefined })}
        busy={busy}
        compact={!place.dock && !place.sheet}
        touch={place.sheet}
        privateMode={privateMode}
        style={place.style}
        // In the dock the chat takes what is left and scrolls; under a list row it is its last few lines.
        chatStyle={place.dock || place.sheet ? { flex: 1 } : undefined}
      >
        {place.sheet && team.length > 0 ? (
          <Button theme={theme} size="touch" variant="outline" icon="Map" label="Show team on map"
            onPress={() => focusOnMap(node.agent)} />
        ) : null}
        {team.length > 0 ? <TeamCard key={node.agent.id + ":team"} theme={theme} people={team} onPick={showAgent} /> : null}
      </Detail>
    ),
    [theme, paseo, shown, reducedMotion, latest, feed.live, online, now, closedList, navigation, openAgent, setDialog,
      openRequest, pendingByAgent, sheet, busy, team, focusOnMap, showAgent, privateMode],
  );
  const renderDetail = useCallback(
    (node: CrewNode, style: StyleProp<ViewStyle>) => detailFor(node, { dock: false, style }),
    [detailFor],
  );

  const chips = STATE_ORDER.filter((state) => counts[state] > 0);
  const emptyLabel =
    directory.phase === "loading"
      ? ""
      : scope
        ? "No agents in this workspace"
        : "No agents";
  const noMatchLabel = query || filter !== "all" ? "No matching agents" : emptyLabel;

  // A visitor has no node in this forest; it still has a detail.
  const selectedNode = useMemo<CrewNode | undefined>(() => {
    if (!selected) return undefined;
    const seated = nodes.get(selected);
    if (seated) return seated;
    const elsewhere = globalNodes.get(selected);
    if (elsewhere) return elsewhere;
    const visitor = office && plan.visitors.has(selected) ? directory.agents.get(selected) : undefined;
    return visitor
      ? { agent: visitor, state: crewState(visitor), depth: 0, children: [], descendants: 0 }
      : undefined;
  }, [selected, nodes, globalNodes, office, plan.visitors, directory.agents]);
  const sideDock = !touch && size.view >= SIDE_DOCK_MIN_WIDTH;
  // A chat reads better wider; until it is dragged the office keeps at least as much as the dock takes.
  const dockWidth = sideDockWidth(size.view, dockWanted.side);
  const dockHeight = bottomDockHeight(size.column, dockWanted.bottom);
  // The dock as laid out: a list of closed agents under the office may be shorter than its height.
  const [dockShown, setDockShown] = useState(0);
  const onDockLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setDockShown(Math.round(sideDock ? width : height));
  };
  const resizeDock = useCallback(
    (next: number) =>
      setDockWanted((current) =>
        sideDock
          ? { ...current, side: sideDockWidth(size.view, next) }
          : { ...current, bottom: bottomDockHeight(size.column, next) },
      ),
    [sideDock, size.view, size.column],
  );
  // Kept once the drag ends, as the size it came to rest at.
  const keepDock = useCallback(
    (next: number) => remember(`${sideDock ? "dock.width" : "dock.height"}.${place}`, String(sideDock ? sideDockWidth(size.view, next) : bottomDockHeight(size.column, next))),
    [sideDock, place, size.view, size.column],
  );
  // A workspace pane fills its dock; the global list is reading-width, like Paseo's list pages.
  const column = !inPanel ? { width: "100%" as const, maxWidth: 720, alignSelf: "center" as const } : null;
  const onViewLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    const height = Math.round(event.nativeEvent.layout.height);
    setSize((current) => (current.view === width && current.height === height ? current : { ...current, view: width, height }));
  };
  // The one timer of a view at rest: the next break that moves on or ends, or the next age that reads differently.
  const wakeAt = useMemo(() => {
    if (!shown) return null;
    const aged = office ? (closedList?.nodes ?? []) : [...nodes.values()];
    const panelAges = sheet?.kind === "requests" ? queueRequests.flatMap((entry) => entry.at ? [entry.at] : []) : [];
    const presenceAt = office && preferences.ambient ? nextPresenceChange(plan, directory.agents, crewState, now) : null;
    const visualAt = Math.min(presenceAt ?? Infinity, office ? lighting.next ?? Infinity : Infinity);
    const observationAges = [...(office ? (selected ? [selected] : []) : listVisible)].flatMap((id) => {
      const agent = directory.agents.get(id);
      const iso = operationSummary(latest.get(id), false, now, agent ? activityAt(agent) : undefined).iso;
      return iso ? [iso] : [];
    });
    const ages = [...aged.map((node) => activityAt(node.agent)), ...panelAges, ...observationAges].map((at) => nextAgeChange(at, now));
    return nextWake(Number.isFinite(visualAt) ? visualAt : null, ages, now);
  }, [shown, office, closedList, nodes, plan, directory.agents, now, sheet, queueRequests,
    selected, listVisible, latest, preferences.ambient, lighting.next]);
  useWake(wakeAt, turn, () => setTurn((count) => count + 1));
  const onSceneLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    setSize((current) => (current.scene === width ? current : { ...current, scene: width }));
  };
  const onColumnLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setSize((current) => (current.column === height ? current : { ...current, column: height }));
  };

  const room = roomEntries.find((entry) => entry.id === scope) ?? null;
  const currentRoomName = scope === null ? null : directory.workspaces.get(scope)?.name ?? room?.name ?? "This room";
  const changeQueueScope = (allRooms: boolean) => {
    setQueueAcrossRooms(allRooms);
    setNextRequests(null);
  };
  const changeSearchScope = (allRooms: boolean) => {
    if (allRooms) {
      if (scope !== null) previousRoom.current = scope;
      setScope(null);
    } else if (scope === null && previousRoom.current !== null) {
      setScope(previousRoom.current);
    }
    setSelected(null);
    setInView(null);
    setMapFocus(null);
  };
  const previousRoomName = previousRoom.current === null ? null
    : previousRoom.current === "" ? "No workspace"
    : directory.workspaces.get(previousRoom.current)?.name ?? roomEntries.find((entry) => entry.id === previousRoom.current)?.name ?? "This room";
  const scopedAgents = useMemo(() => [...directory.agents.values()].filter((agent) => scope === null || (agent.workspaceId ?? "") === scope), [scope, directory.agents]);
  const exportImage = () => {
    try {
      const image = officeImage(theme, plan, presences, directory.agents, avatars.avatars, lighting.light, (room) =>
        privateMode && room.workspaceId ? aliases.workspaceName(room.workspaceId) : room.name);
      if (!image || !downloadOffice(image)) toast.error("The office image could not be exported.");
    } catch {
      toast.error("The office image could not be exported.");
    }
  };
  const settingsRoom = room ?? (selectedNode
    ? roomEntries.find((entry) => entry.id === (plan.roomOf.get(selectedNode.agent.id) ?? selectedNode.agent.workspaceId)) ?? null
    : null);
  const filterChips = (large: boolean) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      <Chip theme={theme} touch={large} label="All agents" selected={filter === "all"} onPress={() => setFilter("all")} />
      {chips.map((state) => (
        <Chip key={state} theme={theme} touch={large} label={STATE_LABEL[state]} count={counts[state]}
          color={stateColor(theme, state)} selected={filter === state} onPress={() => setFilter(filter === state ? "all" : state)} />
      ))}
    </View>
  );
  const zoomControls = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <IconButton theme={theme} icon="ZoomOut" label="Draw the office smaller" size={touch ? 44 : 32} disabled={zoomOut === null}
        onPress={() => zoomOut !== null && setZoom(zoomOut)} />
      {zoom !== null ? <Chip theme={theme} touch={touch} label="Auto" selected={false} onPress={() => setZoom(null)} /> : null}
      <IconButton theme={theme} icon="ZoomIn" label="Draw the office larger" size={touch ? 44 : 32} disabled={zoomIn === null}
        onPress={() => zoomIn !== null && setZoom(zoomIn)} />
    </View>
  );
  const header = (
    <View style={[{ paddingHorizontal: touch ? space.md : space.lg, paddingTop: space.sm, gap: space.xs }, office ? null : column]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs }}>
        <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
          <Button theme={theme} variant={touch ? "secondary" : "ghost"} size={touch ? "touch" : "sm"} icon="ChevronDown"
            numberOfLines={1} style={{ minWidth: 44, justifyContent: "flex-start", paddingHorizontal: space.sm }}
            label={currentRoomName ?? "All rooms"} accessibilityLabel={`Change room, ${currentRoomName ?? "all rooms"}`}
            onPress={() => setSheet({ kind: "rooms" })} />
          {!touch ? <Muted theme={theme} numberOfLines={1} size={12}>
            {directory.phase === "loading" ? "Loading agents…" : summary(counts)}
            {directory.truncated ? " · first 2000" : ""}
            {privateMode ? " · Private" : ""}
          </Muted> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs, borderRadius: radius.lg, backgroundColor: colors.surface1 }}>
          <Chip theme={theme} touch={touch} label="Office" selected={office} onPress={() => setMode("office")} />
          <Chip theme={theme} touch={touch} label="Agents" selected={!office} onPress={() => setMode("list")} />
        </View>
        {touch ? <IconButton theme={theme} icon="Search" label="Find an agent or change filters" size={44}
          color={query.trim() || filter !== "all" ? colors.accent : undefined} onPress={() => setSheet({ kind: "search" })} />
          : <IconButton theme={theme} icon="Settings" label="Office settings" size={32} onPress={() => setSheet({ kind: "settings" })} />}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Button theme={theme} size={touch ? "touch" : "sm"} variant={officeRequests.length ? "default" : "outline"}
          label={counter("Inbox", officeRequests.length)} icon={touch ? undefined : "Inbox"} numberOfLines={1}
          accessibilityLabel={`Inbox, ${officeRequests.length} pending in ${currentRoomName ?? "all rooms"}`}
          style={touch ? { flex: 1, minWidth: 44, paddingHorizontal: space.xs } : undefined} onPress={showRequests} />
        <Button theme={theme} size={touch ? "touch" : "sm"} variant="outline" label="Activity"
          icon={touch ? undefined : "Activity"} numberOfLines={1}
          style={touch ? { flex: 1, minWidth: 44, paddingHorizontal: space.xs } : undefined} onPress={() => setSheet({ kind: "tools" })} />
        {!touch ? (
          <>
            <Button theme={theme} variant="secondary" label={query.trim() || "Find an agent"} icon="Search" numberOfLines={1}
              accessibilityLabel="Find an agent" style={{ flexShrink: 1, marginLeft: "auto" }} onPress={() => setSheet({ kind: "search" })} />
            {office ? zoomControls : null}
            <IconButton theme={theme} icon="RefreshCw" label="Refresh agents" size={32} onPress={directory.reload} />
          </>
        ) : null}
      </View>
      {!touch ? filterChips(false) : null}
      {!touch && office && selected && team.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Muted theme={theme} size={13} style={{ flex: 1 }}>Team · {selectedNode ? displayTitle(selectedNode.agent) : ""}</Muted>
          <IconButton theme={theme} icon="X" label="Clear team focus" size={touch ? 44 : 28} onPress={() => setSelected(null)} />
        </View>
      ) : null}
      {!touch && office && highlighted?.size === 0 ? <Muted theme={theme} size={13}>No matching agents</Muted> : null}
      {!touch && directory.error ? <Text style={{ color: colors.statusDanger, fontSize: 13 }}>{privateMode ? "Could not refresh the directory" : directory.error}</Text> : null}
    </View>
  );
  const closedRows = closedList ? closedList.nodes.map((node, index) => (
    <Pressable key={node.agent.id} accessibilityRole="button"
      accessibilityLabel={`${displayTitle(node.agent)}, ${STATE_LABEL[node.state]}`}
      onPress={() => showAgent(node.agent.id)}
      style={pressStyle(({ hovered, pressed }) => ({
        minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.md, justifyContent: "center",
        backgroundColor: hovered || pressed ? colors.surface2 : "transparent",
        opacity: highlighted && index >= closedList.matching ? 0.5 : 1,
      }))}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: touch ? 15 : font.sm }}>{displayTitle(node.agent)}</Text>
      <Muted theme={theme} size={12} numberOfLines={1}>
        {[roleOf(node.agent), displayModel(node.agent), formatAge(activityAt(node.agent), now)].filter(Boolean).join(" · ")}
      </Muted>
    </Pressable>
  )) : null;
  const bubbleAgent = sheet?.kind === "bubble" ? directory.agents.get(sheet.bubble.agentId) : undefined;
  const actionAgent = sheet?.kind === "avatar" || sheet?.kind === "agent-menu" || sheet?.kind === "agent-facts"
    ? directory.agents.get(sheet.agentId) : undefined;
  const dialogAgent = actions.dialog ? directory.agents.get(actions.dialog.agent.id) : undefined;
  const requestInDialog = actions.dialog ? dialogRequest(actions.dialog, directory.agents) : undefined;
  const fixedBody = actions.dialog ? requestInDialog !== undefined && !isQuestion(requestInDialog) && !privateMode : sheet?.kind === "agent";
  const title = actions.dialog ? agentDialogTitle(actions.dialog, directory.agents)
    : sheet?.kind === "agent" ? selectedNode ? displayTitle(selectedNode.agent) : "Agent"
    : sheet?.kind === "requests" ? "Inbox"
    : sheet?.kind === "rooms" ? "Rooms"
    : sheet?.kind === "settings" ? "Office settings"
    : sheet?.kind === "filters" ? "Filters and zoom"
    : sheet?.kind === "search" ? "Find an agent"
    : sheet?.kind === "closed" ? `Closed in ${closedList?.name ?? "this room"}`
    : sheet?.kind === "bubble" ? bubbleAgent ? displayTitle(bubbleAgent) : "Activity"
    : sheet?.kind === "demo" ? "Lobby demo"
    : sheet?.kind === "art" ? "Pixel art preview"
    : sheet?.kind === "avatar" ? "Customize avatar"
    : sheet?.kind === "agent-menu" ? "Agent actions"
    : sheet?.kind === "agent-facts" ? "Agent details"
    : sheet?.kind === "tools" ? "Activity"
    : sheet?.kind === "operations" ? "Agent activity"
    : sheet?.kind === "board" ? "Task board"
    : sheet?.kind === "notices" ? "Notifications"
    : sheet?.kind === "replay" ? "Session replay"
    : sheet?.kind === "metrics" ? "Office metrics"
    : sheet?.kind === "privacy" ? "Privacy and export"
    : sheet?.kind === "private-request" ? "Pending response"
    : "";
  const onCloseSheet = () => {
    if (sheet?.kind === "agent" && selected !== mapFocus?.agentId) setSelected(null);
    if (sheet?.kind === "closed" || sheet?.kind === "agent") setClosedRoom(null);
    setSheet(null);
    setDialog(null);
  };
  return (
    // Behind another tab nothing here is painted; its loops are held, not left to the browser to notice.
    <MotionPaused.Provider value={!shown || (touch && (sheet !== null || actions.dialog !== null))}>
    <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={onViewLayout}>
      {header}

      {office ? (
        <View style={{ flex: 1, flexDirection: sideDock ? "row" : "column", paddingTop: space.sm }} onLayout={onColumnLayout}>
          <View style={{ flex: 1, minWidth: 0, minHeight: 0 }} onLayout={onSceneLayout}>
            {roots.length === 0 && plan.rooms.length === 0 ? (
              emptyLabel ? (
                <Empty theme={theme} label={emptyLabel} />
              ) : null
            ) : groups.length === 0 ? (
              <Empty theme={theme} label="Nobody is in" />
            ) : size.scene > 0 ? (
              <OfficeScene
                theme={theme}
                office={plan}
                tile={scale.tile}
                nodes={nodes}
                avatars={avatars.avatars}
                operations={operations}
                light={lighting.light}
                pet={preferences.pet}
                effects={visuals.effects}
                agents={directory.agents}
                presences={presences}
                bubbles={bubbles}
                exchanges={exchanges}
                selected={selected}
                highlighted={litTeam}
                still={officeStill || !shown}
                onSelect={toggle}
                onBubble={showBubble}
                touch={touch}
                roomScope={scope}
                focus={mapFocus}
                onLeft={onLeft}
                onOpenClosed={openClosed}
                onBoard={openBoard}
                available={size.scene}
                onRoomsInView={setInView}
                inView={inView}
              />
            ) : null}
          </View>
          {!touch && selectedNode ? (
            <View
              style={[
                { backgroundColor: colors.surface1, borderColor: colors.border },
                sideDock ? { width: dockWidth, borderLeftWidth: 1 } : { height: dockHeight, borderTopWidth: 1 },
              ]}
              onLayout={onDockLayout}
            >
              {detailFor(selectedNode, {
                dock: true,
                style: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
              })}
            </View>
          ) : null}
          {!touch && !selectedNode && closedList ? (
            <View
              style={[
                { backgroundColor: colors.surface1, borderColor: colors.border },
                sideDock ? { width: dockWidth, borderLeftWidth: 1 } : { maxHeight: dockHeight, borderTopWidth: 1 },
              ]}
              onLayout={onDockLayout}
            >
              <ScrollView contentContainerStyle={{ padding: space.md, gap: space.xs }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: font.sm, fontWeight: "600" }}>
                      Closed in {closedList.name}
                    </Text>
                    <Muted theme={theme} size={font.xs}>
                      {closedList.nodes.length} {closedList.nodes.length === 1 ? "agent" : "agents"}
                      {closedList.matching > 0 ? ` · ${closedList.matching} matching` : ""}
                    </Muted>
                  </View>
                  <IconButton theme={theme} icon="X" label="Close the list" onPress={() => setClosedRoom(null)} />
                </View>
                {closedRows}
              </ScrollView>
            </View>
          ) : null}
          {!touch && (selectedNode || closedList) && dockShown > 0 ? (
            <DockHandle theme={theme} side={sideDock} size={dockShown} onResize={resizeDock} onRest={keepDock} />
          ) : null}
        </View>
      ) : (
        <CrewList
          theme={theme}
          roots={listed}
          grouped={scope === null}
          workspaces={directory.workspaces}
          now={now}
          compact={touch}
          selected={selected}
          onSelect={touch ? (id) => id ? showAgent(id) : setSelected(null) : setSelected}
          renderDetail={touch ? undefined : renderDetail}
          emptyLabel={noMatchLabel}
          extraData={busy}
          contentStyle={column}
          latest={latest}
          live={online === false ? NOBODY : feed.live}
          onAgentsInView={reportListVisible}
        />
      )}

      <Modal title={title} open={Boolean(sheet || actions.dialog)} onOpenChange={(open) => { if (!open) onCloseSheet(); }}>
        <Modal.Content scrollable={!fixedBody} contentContainerStyle={{ padding: touch ? space.lg : space.xl, gap: space.md }}>
          {!actions.dialog && sheet?.back ? <Button theme={theme} size="touch" variant="ghost" icon="ArrowLeft"
            label="Back" style={{ alignSelf: "flex-start" }} onPress={() => setSheet(sheet.back ?? null)} /> : null}
          {actions.dialog ? (
            privateMode && actions.dialog.kind !== "archive" ? <Muted theme={theme}>Conversation details are hidden by Privacy Mode.</Muted>
              : <AgentDialogContent theme={theme} paseo={paseo} actions={actions} agents={directory.agents} platform={layout.platform}
                onOpen={dialogAgent && navigation ? () => openAgent(dialogAgent) : null} onResponded={onResponded} />
          ) : sheet?.kind === "agent" ? (
            selectedNode ? detailFor(selectedNode, { dock: false, sheet: true, style: { flex: 1 } }) : <Muted theme={theme}>This agent is no longer in the office.</Muted>
          ) : sheet?.kind === "requests" ? (
            <>
              <InboxRoomChoice theme={theme} roomName={currentRoomName} allRooms={queueAcrossRooms} onChange={changeQueueScope} />
              <InboxStatusLine theme={theme} status={inbox.status} onRetry={refreshInbox} partial={directory.truncated} />
              <RequestsSheet theme={theme} entries={queueRequests} workspaceName={workspaceName} now={now}
                complete={inbox.status.phase === "ready" && !directory.truncated} next={nextRequest}
                onPick={({ agent, request }) => openRequest(agent, request.id)} onLocate={focusOnMap} />
            </>
          ) : sheet?.kind === "rooms" ? (
            <RoomsSheet theme={theme} rooms={roomEntries} scope={scope} favorites={preferences.favorites}
              saving={settings.status !== "ready" || settings.saving} onPick={chooseRoom}
              onFavorite={(id) => void savePreferences((values) => ({
                ...values,
                favorites: values.favorites.includes(id) ? values.favorites.filter((favorite) => favorite !== id) : [...values.favorites, id],
              }))} />
          ) : sheet?.kind === "settings" ? (
            <>
            <OfficeSettings key={settingsRoom?.id ?? "all"} theme={theme} motion={motionMode}
              setMotion={(motion) => void savePreferences((values) => ({ ...values, motion }))}
              environment={preferences} onEnvironment={(change) => void savePreferences((values) => ({ ...values, ...change }))}
              room={settingsRoom} initial={settingsRoom ? preferences.rooms[settingsRoom.id] ?? DEFAULT_ROOM : DEFAULT_ROOM}
              writable={settings.status === "ready" && !settings.saving}
              error={settings.status === "ready" ? (privateMode ? null : settings.saveError)
                : settings.status === "invalid" || settings.status === "error" ? "Saved settings are unavailable." : null}
              saveRoom={(next: RoomSetting) => settingsRoom ? savePreferences((values) => ({
                ...values, rooms: { ...values.rooms, [settingsRoom.id]: next },
              })) : Promise.resolve(false)}
              onRooms={() => setSheet({ kind: "rooms", back: sheet })} onDemo={() => setSheet({ kind: "demo", back: sheet })} />
            <Button theme={theme} size="touch" variant="outline" icon="Palette" label="Pixel art preview" onPress={() => setSheet({ kind: "art", back: sheet })} />
            </>
          ) : sheet?.kind === "search" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                <Chip theme={theme} touch label="All rooms" selected={scope === null} onPress={() => changeSearchScope(true)} />
                {scope !== null ? <Chip theme={theme} touch label="This room" selected onPress={() => changeSearchScope(false)} />
                  : previousRoomName ? <Chip theme={theme} touch label="This room" selected={false} onPress={() => changeSearchScope(false)} /> : null}
              </View>
              {scope === null && previousRoomName ? <Muted theme={theme} size={12} numberOfLines={1}>This room · {previousRoomName}</Muted> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Agent name or workspace" placeholder="Name, workspace or role"
                  placeholderTextColor={colors.foregroundMuted} autoCorrect={false} returnKeyType="search"
                  onSubmitEditing={() => { if (matchesInSearch[0]) focusOnMap(matchesInSearch[0].agent, true); }}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, color: colors.foreground, fontSize: 16 }} />
                {query ? <IconButton theme={theme} icon="X" label="Clear search" size={44} onPress={() => setQuery("")} /> : null}
              </View>
              <Button theme={theme} size="touch" variant="outline" label={filter === "all" ? "Filters and zoom" : `Filters · ${STATE_LABEL[filter]}`}
                icon="ListFilter" onPress={() => setSheet({ kind: "filters", back: sheet })} />
              {matchesInSearch.slice(0, SEARCH_RESULTS).map((node) => (
                <SheetRow key={node.agent.id} theme={theme} title={displayTitle(node.agent)} icon="Map"
                  subtitle={[workspaceName(node.agent), STATE_LABEL[node.state]].filter(Boolean).join(" · ")}
                  onPress={() => focusOnMap(node.agent, true)} />
              ))}
              {matchesInSearch.length > SEARCH_RESULTS ? <Muted theme={theme} size={13}>
                Showing the first {SEARCH_RESULTS} matches. Refine your search to find more.
              </Muted> : null}
              {(query.trim() || filter !== "all") && matchesInSearch.length === 0 ? <Muted theme={theme}>No matching agents in {currentRoomName ?? "this office"}.</Muted> : null}
              {query.trim() || filter !== "all" ? <Button theme={theme} size="touch" variant="ghost" label="Show filtered view"
                onPress={() => setSheet(null)} /> : null}
            </>
          ) : sheet?.kind === "filters" ? (
            <>
              {filterChips(true)}
              {office ? zoomControls : null}
              <Button theme={theme} size="touch" variant="outline" label="Refresh agents" icon="RefreshCw" onPress={directory.reload} />
              {directory.error ? <Muted theme={theme}>Could not refresh the directory.</Muted> : null}
              <Button theme={theme} size="touch" variant="default" label="Show filtered view" onPress={onCloseSheet} />
            </>
          ) : sheet?.kind === "closed" ? (
            <>{closedRows ?? <Muted theme={theme}>No closed agents in this room.</Muted>}</>
          ) : sheet?.kind === "bubble" ? (
            <>
              <Text selectable={!privateMode} style={{ color: colors.foreground, fontSize: 16, lineHeight: 24 }}>
                {privateMode ? "Activity details hidden by Privacy Mode." : sheet.bubble.fullText ?? sheet.bubble.label}
              </Text>
              {bubbleAgent && navigation ? <Button theme={theme} size="touch" variant="outline" label="Open agent chat"
                onPress={() => openAgent(bubbleAgent)} /> : null}
            </>
          ) : sheet?.kind === "agent-menu" ? (
            actionAgent ? <>
              <Muted theme={theme} size={14}>{displayTitle(actionAgent)}</Muted>
              {navigation ? <SheetRow theme={theme} title="Open in Paseo" icon="ArrowUpRight" onPress={() => openAgent(actionAgent)} /> : null}
              {!privateMode ? <SheetRow theme={theme} title="Message agent" icon="MessageSquare"
                onPress={() => setDialog({ kind: "message", agent: actionAgent })} /> : null}
              <SheetRow theme={theme} title="Show on map" icon="Map" onPress={() => focusOnMap(actionAgent)} />
              <SheetRow theme={theme} title="Agent details" icon="Info"
                onPress={() => setSheet({ kind: "agent-facts", agentId: actionAgent.id, back: sheet })} />
              <SheetRow theme={theme} title="Customize avatar" icon="Palette"
                onPress={() => setSheet({ kind: "avatar", agentId: actionAgent.id, back: sheet })} />
              {actionAgent.status !== "closed" ? <SheetRow theme={theme} title="Archive agent" icon="Archive"
                onPress={() => setDialog({ kind: "archive", agent: actionAgent })} /> : null}
            </> : <Muted theme={theme}>This agent is no longer available.</Muted>
          ) : sheet?.kind === "agent-facts" ? (
            actionAgent ? <AgentFacts theme={theme} agent={actionAgent} workspaceName={workspaceName(actionAgent)} privateMode={privateMode} />
              : <Muted theme={theme}>This agent is no longer available.</Muted>
          ) : sheet?.kind === "avatar" ? (
            actionAgent ? <AvatarEditor theme={theme} id={sheet.agentId} role={spriteRole(actionAgent)}
              config={avatars.avatars[sheet.agentId]} enabled={avatars.enabled} status={avatars.status}
              onChange={(value) => avatars.set(sheet.agentId, value)} /> : <Muted theme={theme}>This agent is no longer available.</Muted>
          ) : sheet?.kind === "art" ? (
            <ArtPreview />
          ) : sheet?.kind === "tools" ? (
            <>
              <SheetRow theme={theme} title="Agent activity" subtitle="Live timelines and latest snapshots" icon="Activity" onPress={() => setSheet({ kind: "operations", back: sheet })} />
              <SheetRow theme={theme} title="Task board" icon="ListTodo" onPress={() => setSheet({ kind: "board", workspaceId: scope, back: sheet })} />
              <SheetRow theme={theme} title="Notifications" icon="Bell" onPress={() => setSheet({ kind: "notices", back: sheet })} />
              <SheetRow theme={theme} title="Session replay" icon="History" onPress={() => setSheet({ kind: "replay", back: sheet })} />
              <SheetRow theme={theme} title="Office metrics" icon="ChartNoAxesColumn" onPress={() => setSheet({ kind: "metrics", back: sheet })} />
              <SheetRow theme={theme} title="Privacy and export" icon="Shield" onPress={() => setSheet({ kind: "privacy", back: sheet })} />
              {touch ? <SheetRow theme={theme} title="Office settings" icon="Settings" onPress={() => setSheet({ kind: "settings", back: sheet })} /> : null}
            </>
          ) : sheet?.kind === "operations" ? (
            <OperationsSheet theme={theme} agents={scopedAgents} privateMode={privateMode}
              latest={latest} live={feed.live} connection={connection} workspaceName={workspaceName}
              onOpen={(agent) => showObservedAgent(agent.id)} onLocate={focusOnMap} />
          ) : sheet?.kind === "board" ? (
            <>
              <Muted theme={theme}>{roomEntries.find((entry) => entry.id === sheet.workspaceId)?.name ?? "All rooms"}</Muted>
              <BoardSheet key={sheet.workspaceId ?? "all"} theme={theme} tasks={(privateMode ? privateTasks(tasks) : tasks).filter((task) => sheet.workspaceId === null || (task.workspaceId ?? "") === sheet.workspaceId)}
                agents={new Map([...directory.agents].filter(([, agent]) => sheet.workspaceId === null || (agent.workspaceId ?? "") === sheet.workspaceId))}
                workspaceName={workspaceName} onPick={showObservedAgent} onRead={online === false ? undefined : feed.readTasks} />
            </>
          ) : sheet?.kind === "notices" ? (
            <NotificationsSheet theme={theme} entries={notices.filter((notice) => (scope === null || !notice.agentId || notice.workspaceId === scope)
              && canNotify(notice.kind, preferences.notices))} agents={directory.agents} preference={preferences.notices}
              writable={settings.status === "ready" && !settings.saving} onMode={(notices) => void savePreferences((values) => ({ ...values, notices }))}
              onPick={showNotice} />
          ) : sheet?.kind === "replay" ? (
            <ReplaySheet theme={theme} paseo={paseo} journal={journal} scope={scope} agents={scopedAgents} workspaces={directory.workspaces}
              shown={shown} still={officeStill} privateActor={privateMode ? aliases.replayActor : undefined} privateWorkspace={privateMode ? aliases.workspace : undefined} />
          ) : sheet?.kind === "metrics" ? (
            <MetricsSheet theme={theme} metrics={metricsOf([...sources.agents.values()].filter((agent) => scope === null || (agent.workspaceId ?? "") === scope),
              tasks, feed.tasks, journal.getSnapshot(), directory.phase === "ready", now)}
              coverage={`${room?.name ?? "All rooms"} · ${directory.truncated ? "Partial directory" : "Latest observations"}`} />
          ) : sheet?.kind === "privacy" ? (
            <>
              <Muted theme={theme} size={15}>Privacy Mode replaces names and hides conversation and tool details in Lobby.</Muted>
              <Chip theme={theme} touch label={privateMode ? "Privacy Mode on" : "Privacy Mode off"} selected={privateMode}
                disabled={settings.status !== "ready" || settings.saving} onPress={() => void savePreferences((values) => ({ ...values, privacy: !values.privacy }))} />
              {canExportOffice() ? <Button theme={theme} size="touch" variant="outline" label="Export office PNG" icon="Download" disabled={plan.rooms.length === 0} onPress={exportImage} />
                : <Muted theme={theme}>For a screenshot on this device, turn on Privacy Mode, close this panel and use the device screenshot controls.</Muted>}
            </>
          ) : sheet?.kind === "private-request" ? (
            <>
              <Muted theme={theme}>Open the agent in Paseo to review the request.</Muted>
              {navigation && directory.agents.has(sheet.agentId) ? <Button theme={theme} size="touch" label="Open in Paseo" icon="ArrowUpRight"
                onPress={() => openAgent(directory.agents.get(sheet.agentId)!)} /> : null}
            </>
          ) : sheet?.kind === "demo" ? (
            <MotionPaused.Provider value={!shown}>
              <LobbyDemo theme={theme} still={officeStill} shown={shown} />
            </MotionPaused.Provider>
          ) : null}
        </Modal.Content>
      </Modal>
    </View>
    </MotionPaused.Provider>
  );
}
