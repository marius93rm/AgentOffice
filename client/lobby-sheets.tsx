import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { copyText, Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { resultDetail, type ResultNotice } from "../shared/inbox";
import { BREAK_PACES, DECOR_LEVELS, DEFAULT_ROOM, FLOOR_STYLES, LIGHTING_MODES, MOTION_MODES, ROOM_COLORS,
  ROOM_OBJECTS, ROOM_THEMES, WALL_STYLES, roomPreset, type LobbyPreferences, type MotionMode, type RoomSetting } from "../shared/preferences";
import { readableText } from "./chat-model";
import { permissionKey, type InboxStatus } from "./inbox-model";
import { displayTitle, formatAge, STATE_LABEL, type CrewNode, type CrewState } from "./model";
import { resolvedRoomTheme } from "./office-model";
import { officeLight } from "./lighting";
import { RoomPreview } from "./room-preview";
import type { PaseoAgent, PaseoApi } from "./paseo-types";
import { isQuestion, requestTitle } from "./questions";
import { Button, Chip, IconButton, Muted, pressStyle, radius, space, stateColor } from "./ui";
import { useChat } from "./use-chat";
import type { PendingRequest } from "./use-inbox";

export function SheetRow({ theme, title, subtitle, icon, tone, onPress, selected }: {
  theme: PluginTheme;
  title: string;
  subtitle?: string;
  icon?: string;
  tone?: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const { colors } = theme;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onPress={onPress}
      style={pressStyle(({ pressed, hovered }) => ({
        flex: 1, flexDirection: "row", alignItems: "center", minHeight: 52,
        paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.md,
        borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected || pressed || hovered ? colors.surface2 : colors.surface1,
      }))}>
      {icon ? <Icon name={icon} size={18} color={tone ?? colors.foregroundMuted} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: "500" }}>{title}</Text>
        {subtitle ? <Muted theme={theme} size={12} numberOfLines={2}>{subtitle}</Muted> : null}
      </View>
      <Icon name="ChevronRight" size={15} color={colors.foregroundMuted} />
    </Pressable>
  );
}

export function InboxRoomChoice({ theme, roomName, allRooms, onChange }: {
  theme: PluginTheme;
  roomName: string | null;
  allRooms: boolean;
  onChange: (allRooms: boolean) => void;
}) {
  if (roomName === null) return <Muted theme={theme} size={13}>All rooms</Muted>;
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Chip theme={theme} touch label="This room" selected={!allRooms} onPress={() => onChange(false)} />
        <Chip theme={theme} touch label="All rooms" selected={allRooms} onPress={() => onChange(true)} />
      </View>
      {!allRooms ? <Muted theme={theme} size={13} numberOfLines={2}>{roomName}</Muted> : null}
    </View>
  );
}

export function InboxStatusLine({ theme, status, onRetry, partial = false }: {
  theme: PluginTheme;
  status: InboxStatus;
  onRetry: () => void;
  partial?: boolean;
}) {
  const { phase, updatedAt } = status;
  const time = updatedAt === null ? null : new Date(updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const label = phase === "loading" ? "Updating…" : phase === "error" ? "Could not update"
    : phase === "offline" ? "Disconnected" : null;
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }}>
          {[label, time ? `Last updated at ${time}` : null].filter(Boolean).join(" · ")}
        </Text>
        {phase === "error" ? <Button theme={theme} size="touch" variant="outline" label="Retry" onPress={onRetry} /> : null}
      </View>
      {partial ? <Muted theme={theme} size={12}>Showing the first 2,000 agents. This list may be incomplete.</Muted> : null}
    </View>
  );
}

export function RequestsSheet({ theme, entries, now, workspaceName, complete, next, onPick, onLocate }: {
  theme: PluginTheme;
  entries: readonly PendingRequest[];
  now: number;
  workspaceName: (agent: PaseoAgent) => string | null;
  complete: boolean;
  next: PendingRequest | undefined;
  onPick: (entry: PendingRequest) => void;
  onLocate: (agent: PaseoAgent) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {next ? <Button theme={theme} size="touch" variant="default" icon="ArrowRight" label="Next request" onPress={() => onPick(next)} /> : null}
      {!entries.length && complete ? <Muted theme={theme} size={15}>No questions or permissions are waiting.</Muted> : null}
      {entries.map((entry) => {
        const { agent, request, at } = entry;
        const question = isQuestion(request);
        const age = at ? formatAge(at, now) : null;
        return (
          <View key={permissionKey(agent.id, request.id)} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <SheetRow theme={theme} title={requestTitle(request)}
              subtitle={[displayTitle(agent), workspaceName(agent), question ? "Question" : "Permission", age === "now" ? "Just now" : age ? age + " waiting" : null].filter(Boolean).join(" · ")}
              icon={question ? "MessageSquare" : "ShieldQuestion"} tone={theme.colors.statusWarning} onPress={() => onPick(entry)} />
            <IconButton theme={theme} icon="Map" size={44}
              label={`Show ${displayTitle(agent)} on the map`} onPress={() => onLocate(agent)} />
          </View>
        );
      })}
    </View>
  );
}

export function ResultsSheet({ theme, unread, seen, showSeen, onViewChange, agents, now, workspaceName, scopeName,
  complete, writable, onReadAll, onPick }: {
  theme: PluginTheme;
  unread: readonly ResultNotice[];
  seen: readonly ResultNotice[];
  showSeen: boolean;
  onViewChange: (showSeen: boolean) => void;
  agents: ReadonlyMap<string, PaseoAgent>;
  now: number;
  workspaceName: (agent: PaseoAgent) => string | null;
  scopeName: string;
  complete: boolean;
  writable: boolean;
  onReadAll: () => void;
  onPick: (result: ResultNotice) => void;
}) {
  const entries = showSeen ? seen : unread;
  const markLabel = unread.length === 1 ? "Mark 1 result as seen" : `Mark ${unread.length} results as seen`;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Chip theme={theme} touch label="To see" count={unread.length} selected={!showSeen} onPress={() => onViewChange(false)} />
        <Chip theme={theme} touch label="Seen" count={seen.length} selected={showSeen} onPress={() => onViewChange(true)} />
      </View>
      {!showSeen && unread.length > 0 ? (
        <Button theme={theme} size="touch" variant="outline" label={`${markLabel} · ${scopeName}`} icon="CheckCheck"
          disabled={!writable} onPress={onReadAll} />
      ) : null}
      {entries.length === 0 && complete ? <Muted theme={theme} size={15}>
        {showSeen ? "No seen results for these agents yet." : "You’re caught up with completed work."}
      </Muted> : null}
      {entries.map((result) => {
        const agent = agents.get(result.agentId);
        if (!agent) return null;
        return <SheetRow key={result.agentId} theme={theme} title={displayTitle(agent)}
          subtitle={[workspaceName(agent), formatAge(result.at, now), result.text.split("\n").find((line) => line.trim())?.slice(0, 100)].filter(Boolean).join(" · ")}
          icon="CircleCheck" tone={theme.colors.statusSuccess} onPress={() => onPick(result)} />;
      })}
    </View>
  );
}

function resultLinks(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>`"')\]]+/g) ?? [];
  return [...new Set(urls.map((url) => url.replace(/[.,;!?]+$/, "")))].slice(0, 10);
}

export function ResultSheet({ theme, paseo, result, agent, now, shown, saving, error, onOpen, onRead, onMessage, onLocate }: {
  theme: PluginTheme;
  paseo: PaseoApi;
  result: ResultNotice;
  agent: PaseoAgent;
  now: number;
  shown: boolean;
  saving: boolean;
  error: string | null;
  onOpen: (() => void) | null;
  onRead: ((body: string) => void) | null;
  onMessage: (() => void) | null;
  onLocate: () => void;
}) {
  const fallback = result.key === result.at && !result.text;
  const chat = useChat(paseo, agent.id, "ready", shown && fallback);
  const load = useRpc(resultDetail);
  const [detail, setDetail] = useState<ResultNotice | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!shown || !result.cut || fallback) return;
    let live = true;
    setLoading(true);
    void load({ agentId: agent.id, key: result.key }).then((detail) => {
      if (live) setDetail(detail);
    }).catch(() => {}).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [load, agent.id, result.key, result.cut, shown, fallback]);
  const last = fallback ? chat.state.items.findLast((entry) => entry.kind === "assistant" && entry.text.trim()) : undefined;
  const body = (detail ?? result).text || (last?.kind === "assistant" ? last.text : "");
  const links = resultLinks(body);
  const toast = useToast();
  return (
    <View style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontSize: 17, lineHeight: 23, fontWeight: "600" }}>{displayTitle(agent)}</Text>
      <Muted theme={theme} size={13}>Finished {formatAge(result.at, now) === "now" ? "just now" : formatAge(result.at, now) + " ago"}</Muted>
      {body ? (
        <Text selectable style={{ color: theme.colors.foreground, fontSize: 15, lineHeight: 23 }}>{readableText(body)}</Text>
      ) : (
        <Muted theme={theme} size={14}>
          {fallback && chat.phase === "loading" ? "Loading the last reply…" : "This turn has no text preview."}
        </Muted>
      )}
      {loading ? <Muted theme={theme}>Loading the full reply…</Muted> : null}
      {body && !loading && ((detail ?? result).cut || (last?.kind === "assistant" && last.cut)) ? <Muted theme={theme}>The reply continues in the agent chat.</Muted> : null}
      {links.map((url) => (
        <SheetRow key={url} theme={theme} title={url.replace(/^https?:\/\//, "")} icon="ExternalLink"
          onPress={() => void openExternalUrl(url).catch(() => toast.error("Could not open the link"))} />
      ))}
      {error ? <Muted theme={theme}>{error}</Muted> : null}
      {onRead ? <Button theme={theme} size="touch" variant="default" label="Mark as seen" disabled={saving} onPress={() => onRead(body)} /> : null}
      {onMessage ? <Button theme={theme} size="touch" variant={onRead ? "outline" : "default"} icon="MessageSquare" label="Message agent" onPress={onMessage} /> : null}
      {onOpen ? <Button theme={theme} size="touch" variant="outline" label="Open agent chat" onPress={onOpen} /> : null}
      <Button theme={theme} size="touch" variant="ghost" icon="Map" label="Show on map" onPress={onLocate} />
    </View>
  );
}

export interface RoomEntry {
  id: string;
  name: string;
  working: number;
  waiting: number;
}

export function RoomsSheet({ theme, rooms, scope, favorites, onPick, onFavorite, saving }: {
  theme: PluginTheme;
  rooms: readonly RoomEntry[];
  scope: string | null;
  favorites: readonly string[];
  onPick: (id: string | null) => void;
  onFavorite: (id: string) => void;
  saving: boolean;
}) {
  const starred = new Set(favorites);
  const ordered = [...rooms].sort((left, right) =>
    Number(starred.has(right.id)) - Number(starred.has(left.id)) || right.waiting - left.waiting || left.name.localeCompare(right.name));
  return (
    <View style={{ gap: space.sm }}>
      <SheetRow theme={theme} title="All rooms" icon="LayoutGrid" selected={scope === null} onPress={() => onPick(null)} />
      {ordered.map((room) => (
        <View key={room.id} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <SheetRow theme={theme} title={room.name} icon="DoorOpen" selected={scope === room.id}
            subtitle={`${room.working} working · ${room.waiting} waiting`} onPress={() => onPick(room.id)} />
          <IconButton theme={theme} icon="Star" size={44} disabled={saving}
            color={starred.has(room.id) ? theme.colors.accent : undefined}
            label={`${starred.has(room.id) ? "Remove from" : "Add to"} favorites · ${room.name}`}
            onPress={() => onFavorite(room.id)} />
        </View>
      ))}
      {ordered.length === 0 ? <Muted theme={theme}>No rooms yet.</Muted> : null}
    </View>
  );
}

const captions = {
  auto: "Surprise me", studio: "Studio", library: "Library", workshop: "Workshop",
  minimal: "Minimal", balanced: "Balanced", full: "Full",
  quiet: "Quiet", normal: "Normal", lively: "Lively",
  system: "System", on: "On", off: "Off",
  day: "Day", night: "Night", stone: "Stone", tile: "Tile", planks: "Planks", mosaic: "Mosaic",
  paint: "Painted", panel: "Panelled", brick: "Brick", mint: "Mint", amber: "Amber", lilac: "Lilac",
  rose: "Rose", blue: "Blue", olive: "Olive", clay: "Clay",
} as const;

function Choices<Value extends keyof typeof captions>({ theme, label, values, selected, onChange, disabled, autoLabel }: {
  theme: PluginTheme;
  label: string;
  values: readonly Value[];
  selected: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  autoLabel?: string;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {values.map((value) => <Chip key={value} theme={theme} touch label={value === "auto" && autoLabel ? autoLabel : captions[value]}
          selected={value === selected} disabled={disabled} onPress={() => onChange(value)} />)}
      </View>
    </View>
  );
}

type EnvironmentSettings = Pick<LobbyPreferences, "lighting" | "ambient" | "effects" | "pet">;
const ENVIRONMENT_SWITCHES = { ambient: "Idle activities", effects: "Lighting and result effects", pet: "Office cat" } as const;

export function OfficeSettings({ theme, motion, setMotion, room, initial, saveRoom, writable, error, onRooms, onDemo, environment, onEnvironment }: {
  theme: PluginTheme;
  motion: MotionMode;
  setMotion: (mode: MotionMode) => void;
  room: RoomEntry | null;
  initial: RoomSetting;
  saveRoom: (settings: RoomSetting) => Promise<boolean>;
  writable: boolean;
  error: string | null;
  onRooms: () => void;
  onDemo: () => void;
  environment: EnvironmentSettings;
  onEnvironment: (change: Partial<EnvironmentSettings>) => void;
}) {
  const { colors } = theme;
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [paste, setPaste] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const copyPreset = () => {
    const data = { version: 2, ...roomPreset.parse(draft) };
    void copyText(JSON.stringify(data, null, 2)).then(() => toast.show("Room preset copied")).catch(() => toast.error("Could not copy the preset"));
  };
  const save = async () => {
    if (!writable || saving) return;
    setSaving(true);
    try {
      if (await saveRoom(draft)) toast.show("Room saved");
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ gap: space.lg }}>
      <Choices theme={theme} label="Motion" values={MOTION_MODES} selected={motion} onChange={setMotion} disabled={!writable} />
      <Choices theme={theme} label="Office lighting" values={LIGHTING_MODES} selected={environment.lighting} autoLabel="Auto" disabled={!writable || !environment.effects}
        onChange={(lighting) => onEnvironment({ lighting })} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {(Object.keys(ENVIRONMENT_SWITCHES) as (keyof typeof ENVIRONMENT_SWITCHES)[]).map((key) => (
          <Chip key={key} theme={theme} touch label={ENVIRONMENT_SWITCHES[key]} selected={environment[key]} disabled={!writable}
            onPress={() => onEnvironment({ [key]: !environment[key] })} />
        ))}
      </View>
      {room ? (
        <View style={{ gap: space.md, borderTopWidth: 1, borderColor: colors.border, paddingTop: space.md }}>
          <View style={{ gap: space.xs }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 17, fontWeight: "600" }}>{room.name}</Text>
            <Muted theme={theme} size={13}>{captions[resolvedRoomTheme(room.id, draft)]} · {draft.locked ? "Locked" : "Customizable"}</Muted>
          </View>
          <RoomPreview theme={theme} id={room.id} settings={draft} light={officeLight(environment.lighting, Date.now(), environment.effects).light} />
          {!draft.locked ? (
            <>
              <Choices theme={theme} label="Layout" values={ROOM_THEMES} selected={draft.theme} onChange={(value) => setDraft({ ...draft, theme: value })} />
              <Choices theme={theme} label="Decor" values={DECOR_LEVELS} selected={draft.decor} onChange={(value) => setDraft({ ...draft, decor: value })} />
              <Choices theme={theme} label="Floor" values={FLOOR_STYLES} autoLabel="Auto" selected={draft.floor} onChange={(floor) => setDraft({ ...draft, floor })} />
              <Choices theme={theme} label="Walls" values={WALL_STYLES} autoLabel="Auto" selected={draft.wall} onChange={(wall) => setDraft({ ...draft, wall })} />
              <Choices theme={theme} label="Palette" values={ROOM_COLORS} autoLabel="Auto" selected={draft.palette} onChange={(palette) => setDraft({ ...draft, palette })} />
              <Muted theme={theme} size={13}>Furnishings use the available space. Tap to cycle Auto, On and Off.</Muted>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                {ROOM_OBJECTS.map((object) => <Chip key={object} theme={theme} touch selected={draft.objects[object] === true}
                  label={`${object.charAt(0).toUpperCase()}${object.slice(1)} · ${draft.objects[object] === undefined ? "Auto" : draft.objects[object] ? "On" : "Off"}`}
                  onPress={() => {
                    const objects = { ...draft.objects };
                    if (objects[object] === false) delete objects[object];
                    else objects[object] = objects[object] === undefined;
                    setDraft({ ...draft, objects });
                  }} />)}
              </View>
            </>
          ) : null}
          <Choices theme={theme} label="Break frequency" values={BREAK_PACES} selected={draft.breaks} onChange={(value) => setDraft({ ...draft, breaks: value })} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Button theme={theme} size="touch" variant="outline" label="Regenerate" icon="Shuffle" disabled={draft.locked}
              onPress={() => setDraft({ ...draft, seed: (draft.seed + 1 + Math.floor(Math.random() * 0xfffffffe)) >>> 0 })} />
            <Button theme={theme} size="touch" variant="outline" label={draft.locked ? "Unlock" : "Lock"} icon={draft.locked ? "LockOpen" : "Lock"}
              onPress={() => { setPaste(null); setDraft({ ...draft, locked: !draft.locked }); }} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Button theme={theme} size="touch" variant="ghost" label="Copy preset" icon="Copy" onPress={copyPreset} />
            <Button theme={theme} size="touch" variant="ghost" label="Import preset" disabled={draft.locked} onPress={() => { setPaste(paste === null ? "" : null); setInvalid(false); }} />
            <Button theme={theme} size="touch" variant="ghost" label="Reset to default" disabled={draft.locked} onPress={() => setDraft(DEFAULT_ROOM)} />
          </View>
          {paste !== null ? (
            <>
              <TextInput accessibilityLabel="Room preset JSON" value={paste} onChangeText={(text) => { setPaste(text); setInvalid(false); }}
                multiline autoCorrect={false} autoCapitalize="none" maxLength={5_000} placeholder="Paste room preset JSON"
                placeholderTextColor={colors.foregroundMuted}
                style={{ minHeight: 90, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 16, color: colors.foreground, textAlignVertical: "top" }} />
              {invalid ? <Muted theme={theme} size={13}>That JSON is not a Lobby room preset.</Muted> : null}
              <Button theme={theme} size="touch" label="Load preset" onPress={() => {
                try {
                  const data: unknown = JSON.parse(paste);
                  if (!data || typeof data !== "object" || !("version" in data) || (data.version !== 1 && data.version !== 2)) throw new Error();
                  const preset = roomPreset.parse(data);
                  setDraft({ ...draft, ...preset });
                  setPaste(null);
                } catch {
                  setInvalid(true);
                }
              }} />
            </>
          ) : null}
          {error ? <Muted theme={theme} size={13}>{error}</Muted> : null}
          <Button theme={theme} size="touch" variant="default" label={saving ? "Saving…" : "Save room"} disabled={!dirty || saving || !writable}
            onPress={() => void save()} />
        </View>
      ) : <Button theme={theme} size="touch" label="Choose a room to customize" onPress={onRooms} />}
      <Button theme={theme} size="touch" variant="outline" icon="Play" label="Play demo" onPress={onDemo} />
    </View>
  );
}

export function TeamCard({ theme, people, onPick }: {
  theme: PluginTheme;
  people: readonly CrewNode[];
  onPick: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;
  const count = (state: CrewState) => people.filter((member) => member.state === state).length;
  return (
    <View style={{ gap: space.xs }}>
      <SheetRow theme={theme} title={expanded ? "Hide delegated work" : `Delegated work · ${people.length}`}
        subtitle={`${count("working")} working · ${count("needs-input")} waiting · ${count("ready")} finished`}
        icon="GitBranch" onPress={() => setExpanded((open) => !open)} />
      {expanded ? people.map((member) => (
        <SheetRow key={member.agent.id} theme={theme} title={displayTitle(member.agent)} subtitle={STATE_LABEL[member.state]}
          icon="GitBranch" tone={stateColor(theme, member.state)} onPress={() => onPick(member.agent.id)} />
      )) : null}
    </View>
  );
}
