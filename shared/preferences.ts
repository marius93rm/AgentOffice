import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { resultNotice } from "./inbox";

export const ROOM_THEMES = ["auto", "studio", "library", "workshop"] as const;
export const DECOR_LEVELS = ["minimal", "balanced", "full"] as const;
export const BREAK_PACES = ["quiet", "normal", "lively"] as const;
export const MOTION_MODES = ["system", "on", "off"] as const;
export const NOTICE_MODES = ["all", "attention", "off"] as const;
export const LIGHTING_MODES = ["auto", "day", "night"] as const;
export const FLOOR_STYLES = ["auto", "stone", "tile", "planks", "mosaic"] as const;
export const WALL_STYLES = ["auto", "paint", "panel", "brick"] as const;
export const ROOM_COLORS = ["auto", "mint", "amber", "lilac", "rose", "blue", "olive", "clay"] as const;
export const ROOM_OBJECTS = ["plant", "bookshelf", "sofa", "beanbag", "table", "rug", "lamp", "window"] as const;

export const roomPreset = z.object({
  theme: z.enum(ROOM_THEMES).default("auto"),
  decor: z.enum(DECOR_LEVELS).default("balanced"),
  breaks: z.enum(BREAK_PACES).default("normal"),
  seed: z.number().int().min(0).max(0xffffffff).default(0),
  floor: z.enum(FLOOR_STYLES).default("auto"),
  wall: z.enum(WALL_STYLES).default("auto"),
  palette: z.enum(ROOM_COLORS).default("auto"),
  objects: z.partialRecord(z.enum(ROOM_OBJECTS), z.boolean()).default({}),
});

const roomSetting = roomPreset.extend({ locked: z.boolean().default(false) });
export type RoomPreset = z.output<typeof roomPreset>;
export type RoomSetting = z.output<typeof roomSetting>;
export const DEFAULT_ROOM = roomSetting.parse({});

export const lobbyPreferences = defineSettings({
  id: "lobby",
  scope: "host",
  version: 2,
  migrate: (values) => values,
  schema: z.object({
    rooms: z.record(z.string(), roomSetting).default({}),
    favorites: z.array(z.string()).default([]),
    motion: z.enum(MOTION_MODES).optional(),
    notices: z.enum(NOTICE_MODES).default("all"),
    lighting: z.enum(LIGHTING_MODES).default("auto"),
    ambient: z.boolean().default(true),
    effects: z.boolean().default(true),
    pet: z.boolean().default(false),
    privacy: z.boolean().default(false),
  }),
});

export const completionInbox = defineSettings({
  id: "completions",
  scope: "host",
  version: 1,
  schema: z.object({
    read: z.record(z.string(), z.string()).default({}),
    observed: z.record(z.string(), resultNotice).default({}),
  }),
});

export type LobbyPreferences = z.output<typeof lobbyPreferences.schema>;
export type MotionMode = NonNullable<LobbyPreferences["motion"]>;
export type LightingMode = LobbyPreferences["lighting"];
export const DEFAULT_PREFERENCES = lobbyPreferences.schema.parse({});
