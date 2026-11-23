import type { PluginTheme } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { ACCESSORIES, HEADGEAR, avatarPreferences, type AvatarConfig } from "../shared/avatar";
import { defaultAvatar } from "./avatar-model";
import type { SpriteRole } from "./scene-model";
import { CharacterSprite } from "./sprites";
import { Button, IconButton, Muted, radius, space } from "./ui";

const EMPTY: Readonly<Record<string, AvatarConfig>> = {};

export function useAvatars() {
  const settings = useSettings(avatarPreferences);
  const saved = settings.status === "ready" ? settings.values.avatars : EMPTY;
  const [edits, setEdits] = useState<Record<string, AvatarConfig | null>>({});
  const entries = useMemo(() => Object.entries(edits), [edits]);
  const next = useMemo(() => {
    if (!entries.length) return saved;
    const all = { ...saved };
    for (const [id, config] of entries) {
      if (config) all[id] = config;
      else delete all[id];
    }
    return all;
  }, [entries, saved]);
  const tried = useRef("");
  useEffect(() => {
    if (!entries.length || settings.status !== "ready" || settings.saving) return;
    const attempt = JSON.stringify([settings.revision, edits]);
    if (tried.current === attempt) return;
    tried.current = attempt;
    void settings.save({ avatars: next }, settings.revision).then((ok) => {
      if (!ok) return;
      setEdits((current) => Object.fromEntries(Object.entries(current).filter(([id, value]) => !Object.hasOwn(edits, id) || edits[id] !== value)));
    });
  }, [settings, entries, next, edits]);
  return {
    avatars: next,
    enabled: settings.status === "ready",
    status: settings.status === "ready"
      ? settings.saveError || (settings.saving || entries.length ? "Saving…" : "Saved on this host")
      : settings.status === "loading" ? "Loading avatar…" : settings.error,
    set: (id: string, value: AvatarConfig | null) => setEdits((current) => ({ ...current, [id]: value })),
  };
}

const numericOptions = [
  ["hairStyle", "Hairstyle", ["Short", "Long", "Fringe", "Curls", "Bun"]],
  ["hair", "Hair color", ["Ink", "Brown", "Copper", "Honey", "Auburn", "Silver"]],
  ["skin", "Skin tone", ["1", "2", "3", "4", "5"]],
  ["outfit", "Outfit", ["Classic", "Jacket", "Badge", "Collar"]],
  ["shirt", "Shirt color", ["Blue", "Rust", "Green", "Lilac", "Mustard", "Teal", "Rose", "Slate"]],
  ["pants", "Trousers", ["Indigo", "Walnut", "Pine"]],
] as const;

export function AvatarEditor({ theme, id, role, config, onChange, enabled, status }: {
  theme: PluginTheme;
  id: string;
  role: SpriteRole;
  config: AvatarConfig | undefined;
  onChange: (value: AvatarConfig | null) => void;
  enabled: boolean;
  status: string;
}) {
  const value = config ?? defaultAvatar(id);
  const cycle = (label: string, current: string, rotate: (direction: number) => void) => (
    <View key={label} style={{ flexDirection: "row", alignItems: "center", minHeight: 48, gap: space.xs }}>
      <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 14 }}>{label}</Text>
      <IconButton theme={theme} icon="ChevronLeft" label={`Previous ${label.toLowerCase()}`} size={44} disabled={!enabled} onPress={() => rotate(-1)} />
      <View style={{ minWidth: 60, alignItems: "center" }}><Muted theme={theme} size={13}>{current}</Muted></View>
      <IconButton theme={theme} icon="ChevronRight" label={`Next ${label.toLowerCase()}`} size={44} disabled={!enabled} onPress={() => rotate(1)} />
    </View>
  );
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ alignItems: "center", padding: space.md, backgroundColor: theme.colors.surface1, borderRadius: radius.lg }}>
        <CharacterSprite theme={theme} tile={64} agentId={id} role={role} pose="stand" heading="down" look={value} />
      </View>
      {numericOptions.map(([key, label, options]) => cycle(label, options[value[key]]!, (direction) => {
        onChange({ ...value, [key]: (value[key] + options.length + direction) % options.length });
      }))}
      {cycle("Accessory", value.accessory, (direction) => onChange({
        ...value, accessory: ACCESSORIES[(ACCESSORIES.indexOf(value.accessory) + ACCESSORIES.length + direction) % ACCESSORIES.length]!,
      }))}
      {cycle("Headwear", value.headgear, (direction) => onChange({
        ...value, headgear: HEADGEAR[(HEADGEAR.indexOf(value.headgear) + HEADGEAR.length + direction) % HEADGEAR.length]!,
      }))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button theme={theme} size="touch" icon="Shuffle" label="Randomize" disabled={!enabled}
          onPress={() => onChange(defaultAvatar(id + "/" + Math.random().toString(36)))} />
        <Button theme={theme} size="touch" variant="outline" label="Reset" disabled={!enabled || !config} onPress={() => onChange(null)} />
      </View>
      <Muted theme={theme} size={12}>{status}</Muted>
    </View>
  );
}
