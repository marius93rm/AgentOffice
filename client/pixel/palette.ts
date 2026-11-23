import type { PluginTheme } from "@getpaseo/plugin";
import type { RoomLight } from "../lighting";
import { BLACK, WHITE, darken, lighten, luminance, mix, parseColor, readableOn } from "./color";
import type { Rgba } from "./png";
import type { AvatarConfig } from "../../shared/avatar";

/**
 * Every sprite is drawn in palette slots, never in colours. Slot order is fixed, so a sprite's
 * pixels do not depend on the theme: only the palette handed to the encoder does.
 */

/** Shared paint swatches. Indexed slots derive lighter and darker ramps from these pigments. */
export const PIXEL_PAINT = {
  ink: "#18161c", paper: "#faf8f4", oak: "#c79a6c", walnut: "#8a6444",
  espresso: "#5b3a26", brick: "#c0693f", moss: "#3f8a54", sage: "#55a868",
  glass: "#8fd0f0", indigo: "#33457a", amber: "#e6b83f", wine: "#8f3046",
  steel: "#39414f", mint: "#35d0c0", blush: "#f3a6bb", violet: "#8a63c4",
  blue: "#4a86c7", rust: "#d2603f", jade: "#4f9d6b", teal: "#3fa3a8",
  rose: "#c9588f", slate: "#7b8794",
} as const;
const SKINS = ["#f6d3b3", "#e8b98f", "#c98f62", "#9a6541", "#6b4429"] as const;
const HAIRS = ["#2b2330", "#5a3825", "#a5632a", "#d9a441", "#b9422f", "#8d95a3"] as const;
const SHIRTS = [
  PIXEL_PAINT.blue, PIXEL_PAINT.rust, PIXEL_PAINT.jade, PIXEL_PAINT.violet,
  PIXEL_PAINT.amber, PIXEL_PAINT.teal, PIXEL_PAINT.rose, PIXEL_PAINT.slate,
] as const;
const PANTS = ["#39445f", "#4b4038", "#2f4a45"] as const;

export const SKIN_COUNT = SKINS.length;
export const HAIR_COUNT = HAIRS.length;
export const SHIRT_COUNT = SHIRTS.length;
export const PANTS_COUNT = PANTS.length;

type Indexed<Name extends string, Count extends number> = `${Name}${Count}`;
type SkinIndex = 0 | 1 | 2 | 3 | 4;
type HairIndex = 0 | 1 | 2 | 3 | 4 | 5;
type ShirtIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type PantsIndex = 0 | 1 | 2;

const FIXED_SLOTS = [
  "transparent",
  "outline",
  "white",
  "characterShadow",
  "shoes",
  "hat",
  "hatBand",
  "cape",
  "capeShade",
  "headset",
  "headsetLight",
  "earInner",
  "floor",
  "floorAlt",
  "floorSeam",
  "wall",
  "wallShade",
  "wallTrim",
  "wood",
  "woodShade",
  "woodLight",
  "metal",
  "metalShade",
  "metalLight",
  "screenLit",
  "screenGlow",
  "screenOff",
  "screenError",
  "screenErrorInk",
  "leaf",
  "leafShade",
  "pot",
  "potShade",
  "fabric",
  "fabricShade",
  "fabricLight",
  "glass",
  "glassShade",
  "lampGlow",
  "windowGlow",
  "coffee",
  "emoteAlert",
  "emoteAlertInk",
  "emoteFail",
  "emoteFailInk",
  "emoteReady",
  "emoteReadyInk",
  "emoteIdle",
  "emoteIdleInk",
  "emoteThinking",
  "emoteThinkingInk",
  "carpet",
  "carpetShade",
  "kitchen",
  "kitchenAlt",
  "partition",
  "partitionShade",
  "partitionLight",
  "pod0",
  "pod0Shade",
  "pod1",
  "pod1Shade",
  "pod2",
  "pod2Shade",
  "pod3",
  "pod3Shade",
] as const;

/**
 * What a wall's shadow falls on, each with the slot it is drawn in when it does. On a light theme
 * a shadow is the darker slot beside it; on a dark one those lean light, so it is darkened instead.
 */
export const SHADOW_OF = [
  ["floor", "floorSeam"],
  ["floorAlt", "floorSeam"],
  ["floorSeam", "wallShade"],
  ["carpet", "carpetShade"],
  ["carpetShade", "wallShade"],
  ["kitchen", "kitchenAlt"],
  ["kitchenAlt", "wallShade"],
  ["wall", "wallShade"],
  ["wallShade", "wallTrim"],
  ["wallTrim", "outline"],
  ["pod0", "pod0Shade"],
  ["pod1", "pod1Shade"],
  ["pod2", "pod2Shade"],
  ["pod3", "pod3Shade"],
  ["pod0Shade", "wallShade"],
  ["pod1Shade", "wallShade"],
  ["pod2Shade", "wallShade"],
  ["pod3Shade", "wallShade"],
] as const satisfies ReadonlyArray<readonly [(typeof FIXED_SLOTS)[number], (typeof FIXED_SLOTS)[number]]>;
type Shadowed = (typeof SHADOW_OF)[number][0];

export type Slot =
  | (typeof FIXED_SLOTS)[number]
  | `${Shadowed}Shadow`
  | Indexed<"skin" | "skinShade" | "skinLight", SkinIndex>
  | Indexed<"hair" | "hairShade" | "hairLight", HairIndex>
  | Indexed<"shirt" | "shirtShade" | "shirtLight", ShirtIndex>
  | Indexed<"pants" | "pantsShade", PantsIndex>;

const numbered = (name: string, count: number) => Array.from({ length: count }, (_, index) => `${name}${index}`);

export const SLOTS = [
  ...FIXED_SLOTS,
  ...numbered("skin", SKIN_COUNT),
  ...numbered("skinShade", SKIN_COUNT),
  ...numbered("skinLight", SKIN_COUNT),
  ...numbered("hair", HAIR_COUNT),
  ...numbered("hairShade", HAIR_COUNT),
  ...numbered("hairLight", HAIR_COUNT),
  ...numbered("shirt", SHIRT_COUNT),
  ...numbered("shirtShade", SHIRT_COUNT),
  ...numbered("shirtLight", SHIRT_COUNT),
  ...numbered("pants", PANTS_COUNT),
  ...numbered("pantsShade", PANTS_COUNT),
  ...SHADOW_OF.map(([base]) => `${base}Shadow`),
] as readonly Slot[];

const SLOT_INDEX = new Map(SLOTS.map((slot, index) => [slot, index]));

export function slotIndex(slot: Slot): number {
  const index = SLOT_INDEX.get(slot);
  if (index === undefined) throw new Error(`unknown palette slot ${slot}`);
  return index;
}

export interface Palette {
  /** Changes whenever a colour does; part of the image cache key. */
  readonly key: string;
  readonly dark: boolean;
  /** One colour per entry of `SLOTS`, in that order. */
  readonly colors: readonly Rgba[];
}

export function paletteColor(palette: Palette, slot: Slot): Rgba {
  return palette.colors[slotIndex(slot)]!;
}

const INK = parseColor(PIXEL_PAINT.ink);
const PAPER = parseColor(PIXEL_PAINT.paper);

function build(theme: PluginTheme): Palette {
  const read = (name: keyof PluginTheme["colors"]) => {
    const [red, green, blue] = parseColor(theme.colors[name]);
    return [red, green, blue, 255] as Rgba;
  };
  const surface0 = read("surface0");
  const surface1 = read("surface1");
  const surface2 = read("surface2");
  const foreground = read("foreground");
  const muted = read("foregroundMuted");
  const accent = read("accent");
  const dark = luminance(surface0) < 0.2;

  // The room is made of the theme's own surfaces, so it sits in the pane instead of on it.
  const outline = dark ? darken(surface0, 0.55) : mix(INK, foreground, 0.5);
  // Fixed hues (wood, leaves, skin) are pulled a little toward the surface so they share its cast.
  const tint = (hex: string, towards = 0.12) => mix(parseColor(hex), surface1, dark ? towards + 0.1 : towards);
  const wood = tint(dark ? PIXEL_PAINT.walnut : PIXEL_PAINT.oak);
  const metal = mix(muted, surface2, 0.45);
  const fabric = mix(accent, surface2, dark ? 0.45 : 0.35);
  const leaf = tint(dark ? PIXEL_PAINT.moss : PIXEL_PAINT.sage);
  const pot = tint(PIXEL_PAINT.brick);
  const glass = tint(PIXEL_PAINT.glass);
  const status = {
    emoteAlert: read("statusWarning"),
    emoteFail: read("statusDanger"),
    emoteReady: read("statusSuccess"),
    emoteIdle: mix(muted, surface2, 0.25),
    emoteThinking: accent,
  };
  const inkOn = (color: Rgba) => readableOn(color, [INK, PAPER]);

  const colors: Record<string, Rgba> = {
    transparent: [0, 0, 0, 0],
    outline,
    white: dark ? mix(PAPER, surface0, 0.08) : PAPER,
    characterShadow: dark ? mix(surface1, foreground, 0.17) : mix(surface1, outline, 0.16),
    shoes: mix(INK, surface2, 0.18),
    hat: tint(PIXEL_PAINT.indigo, 0.04),
    hatBand: tint(PIXEL_PAINT.amber, 0.04),
    cape: tint(PIXEL_PAINT.wine, 0.04),
    capeShade: darken(tint(PIXEL_PAINT.wine, 0.04), 0.28),
    headset: tint(PIXEL_PAINT.steel, 0.04),
    headsetLight: tint(PIXEL_PAINT.mint, 0.02),
    earInner: tint(PIXEL_PAINT.blush, 0.04),
    floor: surface1,
    floorAlt: mix(surface1, foreground, 0.025),
    floorSeam: mix(surface1, foreground, 0.06),
    wall: mix(surface2, foreground, 0.12),
    wallShade: mix(surface2, foreground, 0.24),
    wallTrim: mix(surface2, foreground, 0.42),
    wood,
    woodShade: darken(wood, 0.24),
    woodLight: lighten(wood, 0.2),
    metal,
    metalShade: mix(metal, outline, 0.4),
    metalLight: mix(metal, WHITE, dark ? 0.25 : 0.55),
    screenLit: accent,
    screenGlow: lighten(accent, 0.55),
    screenOff: mix(outline, metal, 0.22),
    screenError: status.emoteFail,
    screenErrorInk: inkOn(status.emoteFail),
    leaf,
    leafShade: darken(leaf, 0.28),
    pot,
    potShade: darken(pot, 0.25),
    fabric,
    fabricShade: mix(fabric, BLACK, 0.22),
    fabricLight: mix(fabric, WHITE, 0.2),
    glass,
    glassShade: darken(glass, 0.22),
    lampGlow: mix(wood, WHITE, 0.5),
    windowGlow: glass,
    coffee: tint(PIXEL_PAINT.espresso, 0.04),
    ...status,
    emoteAlertInk: inkOn(status.emoteAlert),
    emoteFailInk: inkOn(status.emoteFail),
    emoteReadyInk: inkOn(status.emoteReady),
    emoteIdleInk: inkOn(status.emoteIdle),
    emoteThinkingInk: inkOn(status.emoteThinking),
    // Zone floors stay close to the plain floor: enough to mark a zone, not enough to fight it.
    carpet: mix(surface1, fabric, 0.22),
    carpetShade: mix(surface1, fabric, 0.34),
    kitchen: mix(surface1, glass, 0.12),
    kitchenAlt: mix(mix(surface1, glass, 0.12), foreground, 0.07),
    // Room dividers lean well toward the text colour, so they stand off the floor on either theme.
    partition: mix(surface1, foreground, 0.6),
    partitionShade: mix(surface1, foreground, 0.72),
    partitionLight: mix(surface1, foreground, 0.46),
  };
  // Pod floors: four quiet tints of the plain floor, told apart by their weave as much as their hue.
  ["#6f9fd8", "#d8a64f", "#a884d0", "#58b8a6"].forEach((hex, index) => {
    colors[`pod${index}`] = mix(surface1, parseColor(hex), dark ? 0.14 : 0.16);
    colors[`pod${index}Shade`] = mix(surface1, parseColor(hex), dark ? 0.3 : 0.36);
  });
  SKINS.forEach((hex, index) => {
    colors[`skin${index}`] = parseColor(hex);
    colors[`skinShade${index}`] = darken(parseColor(hex), 0.18);
    colors[`skinLight${index}`] = lighten(parseColor(hex), 0.12);
  });
  HAIRS.forEach((hex, index) => {
    colors[`hair${index}`] = parseColor(hex);
    colors[`hairShade${index}`] = darken(parseColor(hex), 0.3);
    colors[`hairLight${index}`] = lighten(parseColor(hex), 0.2);
  });
  SHIRTS.forEach((hex, index) => {
    colors[`shirt${index}`] = parseColor(hex);
    colors[`shirtShade${index}`] = darken(parseColor(hex), 0.22);
    colors[`shirtLight${index}`] = lighten(parseColor(hex), 0.2);
  });
  PANTS.forEach((hex, index) => {
    colors[`pants${index}`] = parseColor(hex);
    colors[`pantsShade${index}`] = darken(parseColor(hex), 0.22);
  });
  for (const [base, light] of SHADOW_OF) colors[`${base}Shadow`] = dark ? darken(colors[base]!, 0.4) : colors[light]!;

  const ordered = SLOTS.map((slot) => colors[slot]!);
  const key = hash(ordered.map((color) => color.join(".")).join("|")).toString(36);
  return { key, dark, colors: ordered };
}

const cache = new WeakMap<PluginTheme, Palette>();

/** The office palette for a Paseo theme. Stable for a given theme object. */
export function officePalette(theme: PluginTheme): Palette {
  let palette = cache.get(theme);
  if (!palette) {
    palette = build(theme);
    cache.set(theme, palette);
  }
  return palette;
}

const ROOM_HUES = ["#4f9f91", "#d79752", "#9677bf", "#d17683", "#6597c9", "#8da653", "#c16e50"] as const;
const roomPalettes = new WeakMap<PluginTheme, Map<string, Palette>>();

/** A room's quiet material tint; agent status colors and the Paseo theme remain untouched. */
export function roomPalette(theme: PluginTheme, variant: number, light: RoomLight = "theme"): Palette {
  const base = officePalette(theme);
  const index = ((Math.floor(variant) % ROOM_HUES.length) + ROOM_HUES.length) % ROOM_HUES.length;
  let variants = roomPalettes.get(theme);
  if (!variants) {
    variants = new Map();
    roomPalettes.set(theme, variants);
  }
  const key = `${base.key}:room:${index}:${light}`;
  const known = variants.get(key);
  if (known) return known;

  const colors = [...base.colors];
  const get = (slot: Slot) => colors[slotIndex(slot)]!;
  const set = (slot: Slot, color: Rgba) => {
    colors[slotIndex(slot)] = color;
  };
  // Anchor the room hue in the active theme's accent, then soften it into its materials.
  const hue = mix(parseColor(ROOM_HUES[index]!), get("screenLit"), 0.22);
  const fabric = mix(get("fabric"), hue, 0.62);
  set("fabric", fabric);
  set("fabricShade", mix(get("fabricShade"), hue, 0.42));
  set("fabricLight", mix(get("fabricLight"), hue, 0.38));
  set("carpet", mix(get("carpet"), hue, 0.48));
  set("carpetShade", mix(get("carpetShade"), hue, 0.42));
  set("kitchen", mix(get("kitchen"), hue, 0.18));
  set("kitchenAlt", mix(get("kitchenAlt"), hue, 0.18));
  set("wood", mix(get("wood"), hue, 0.09));
  set("woodShade", mix(get("woodShade"), hue, 0.09));
  set("woodLight", mix(get("woodLight"), hue, 0.09));
  for (let pod = 0; pod < 4; pod += 1) {
    set(`pod${pod}` as Slot, mix(get(`pod${pod}` as Slot), hue, 0.2));
    set(`pod${pod}Shade` as Slot, mix(get(`pod${pod}Shade` as Slot), hue, 0.16));
  }

  if (light !== "theme") {
    const sun = parseColor(PIXEL_PAINT.paper);
    const navy = parseColor(PIXEL_PAINT.ink);
    const night = light === "night";
    for (const slot of ["floor", "floorAlt", "floorSeam", "wall", "wallShade", "wallTrim", "carpet", "carpetShade", "kitchen", "kitchenAlt"] as const) {
      set(slot, mix(get(slot), night ? navy : sun, night ? (base.dark ? 0.38 : 0.60) : (base.dark ? 0.30 : 0.10)));
    }
    for (const [slot, neighbor] of SHADOW_OF) set(`${slot}Shadow`, night ? darken(get(slot), 0.23) : mix(get(slot), get(neighbor), 0.56));
    set("lampGlow", night ? parseColor(PIXEL_PAINT.amber) : mix(get("metalLight"), sun, 0.25));
    set("windowGlow", night ? mix(get("glass"), navy, 0.63) : mix(get("glass"), WHITE, 0.41));
    set("woodLight", mix(get("woodLight"), night ? parseColor(PIXEL_PAINT.amber) : sun, night ? 0.25 : 0.12));
    if (night) set("screenGlow", mix(get("screenGlow"), WHITE, 0.4));
  }
  const palette = { key, dark: base.dark, colors };
  variants.set(key, palette);
  return palette;
}

export interface CharacterLook {
  readonly skin: number;
  readonly hair: number;
  readonly hairStyle: number;
  readonly shirt: number;
  readonly pants: number;
  readonly outfit?: number;
  readonly accessory?: AvatarConfig["accessory"];
  readonly headgear?: AvatarConfig["headgear"];
}

export const HAIR_STYLE_COUNT = 5;

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  // Avalanche, so ids that differ in one character do not share most of their look.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

/** The same id always gets the same person. */
export function lookFor(agentId: string): CharacterLook {
  const seed = hash(agentId);
  const other = hash(`${agentId}/look`);
  return {
    skin: seed % SKIN_COUNT,
    hair: (seed >>> 8) % HAIR_COUNT,
    hairStyle: (seed >>> 16) % HAIR_STYLE_COUNT,
    shirt: other % SHIRT_COUNT,
    pants: (other >>> 8) % PANTS_COUNT,
    outfit: (other >>> 20) % 4,
  };
}
