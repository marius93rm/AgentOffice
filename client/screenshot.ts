import type { PluginTheme } from "@getpaseo/plugin";
import type { AvatarConfig } from "../shared/avatar";
import { frameArt, roomArt } from "./backdrop";
import type { RoomLight } from "./lighting";
import type { Office, Presence } from "./office-model";
import type { PaseoAgent } from "./paseo-types";
import { character } from "./pixel/characters";
import { emote } from "./pixel/emotes";
import type { Bitmap } from "./pixel/grid";
import { lookFor, officePalette, roomPalette, type Palette } from "./pixel/palette";
import { prop, TILE } from "./pixel/props";
import { tag } from "./pixel/bubble";
import { fitText } from "./pixel/text";
import { spriteRole } from "./scene-model";

export interface OfficeImage { width: number; height: number; pixels: Uint8ClampedArray }
const MAX_PIXELS = 6_000_000;
const EMOTE = { question: "question", check: "readyBob", alert: "fail", zzz: "zzz" } as const;

/** Renders a still of the office from the same bitmap layers as the scene. */
export function officeImage(theme: PluginTheme, office: Office, presences: ReadonlyMap<string, Presence>, agents: ReadonlyMap<string, PaseoAgent>,
  avatars: Readonly<Record<string, AvatarConfig>>, light: RoomLight, displayRoom: (room: Office["rooms"][number]) => string): OfficeImage | null {
  const width = office.width * TILE;
  const height = office.height * TILE;
  if (width <= 0 || height <= 0 || width * height > MAX_PIXELS) return null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const ink = officePalette(theme);
  const draw = (bitmap: Bitmap, palette: Palette, x: number, y: number) => {
    const dx = Math.round(x - bitmap.anchor.x), dy = Math.round(y - bitmap.anchor.y);
    for (let sy = Math.max(0, -dy); sy < Math.min(bitmap.height, height - dy); sy++) {
      for (let sx = Math.max(0, -dx); sx < Math.min(bitmap.width, width - dx); sx++) {
        const index = bitmap.pixels[sy * bitmap.width + sx]!;
        if (index === 0) continue;
        const color = palette.colors[index];
        if (color) pixels.set(color, ((dy + sy) * width + dx + sx) * 4);
      }
    }
  };
  for (const room of office.rooms) draw(roomArt(room), roomPalette(theme, room.look.palette, light), room.x * TILE, room.y * TILE);
  if (office.building) draw(frameArt(office.rooms, office.building.depth), ink, 0, 0);
  for (const place of office.desks.values()) {
    const presence = presences.get(place.agentId);
    const screen = presence?.state === "failed" ? "error" : presence?.screenOn ? "lit" : "off";
    draw(prop("chair"), ink, (place.cell.x + 1) * TILE, (place.cell.y + 2) * TILE);
    draw(prop("desk", { screen }), ink, (place.cell.x + 1) * TILE, (place.cell.y + 1) * TILE);
  }
  for (const presence of [...presences.values()].filter((actor) => actor.visible).sort((a, b) => a.at.y - b.at.y)) {
    const agent = agents.get(presence.agentId);
    if (!agent) continue;
    const pose = presence.activity === "asleep" ? "sleep" : presence.seated || presence.lounging ? "sit" : "idle";
    const art = character({ role: spriteRole(agent), look: avatars[agent.id] ?? lookFor(agent.id), pose, facing: presence.facing, carry: presence.carry });
    const x = (presence.at.x + 0.5) * TILE, y = (presence.at.y + 1) * TILE - presence.lift;
    draw(art, ink, x, y);
    if (presence.emote) draw(emote(EMOTE[presence.emote]), ink, x, y - TILE * 1.4);
  }
  for (const room of office.rooms) {
    if (room.header.width < 2) continue;
    const name = fitText(displayRoom(room), room.header.width * TILE - 8);
    if (name) {
      const sign = tag(name);
      draw(sign, ink, room.header.x * TILE + sign.anchor.x + 2, room.header.y * TILE + sign.anchor.y);
    }
  }
  return { width, height, pixels };
}
