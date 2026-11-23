import type { PetPose } from "../pet-model";
import { animation } from "./anim";
import { mirror, paint, type Bitmap } from "./grid";

const BODY = [
  "................", "..........o..o..", ".........odo.do.", "....ooo.odddd.o.",
  "...odddoddwowo..", "..oddldddddddo..", ".odddddddooooo..", ".oodddoddo......",
  "...odo.odo......", "...oo..oo.......", "................", "................",
];
const SLEEP = [
  "................", "................", "................", "................",
  "........o.oo....", "....ooo.odddo...", "..ooddddodo.o...", ".oddddddddddo...",
  ".oodddllldoo....", "...oooooooo.....", "................", "................",
];
const SIT = [
  "................", ".......o..o.....", "......odo.do....", "......oddddo....",
  "......owowdo....", "......odddoo....", ".....oddlddo....", "..oo.oddlddo....",
  ".oddooddddoo....", "..ooooooooo.....", "................", "................",
];
const STRETCH = [
  "................", "................", "................", "................",
  ".ooo.........o..", "....oooooo.o.oo.", "...oddddldodddo.", "..odddddddddwo..",
  ".oodoooooodddoo.", "...oo.....oooo..", "................", "................",
];

function drawings(pose: PetPose): readonly (readonly string[])[] {
  if (pose === "sleeping") return [SLEEP, SLEEP.map((row, index) => index === 1 ? "..........w....." : row)];
  if (pose === "sitting") return [SIT];
  if (pose === "stretching") return [BODY, STRETCH, STRETCH, BODY];
  if (pose === "jumping") return [STRETCH, ["................", ...BODY.slice(1, 8), "...oo....ooo....", "...oo....oo.....", "................", "................"]];
  if (pose === "walking") return [BODY, BODY.map((row, index) => index === 8 ? "...do...ddo....." : index === 9 ? "..oo....oo......" : row)];
  return [BODY, BODY.map((row, index) => index === 4 ? "...odddoddoooo.." : row)];
}

const cache = new Map<string, ReturnType<typeof animation>>();
export function catArt(pose: PetPose, heading: "left" | "right") {
  const key = `cat:${pose}:${heading}`;
  let art = cache.get(key);
  if (!art) {
    const frames: Bitmap[] = drawings(pose).map((rows, index) => {
      const image = paint(rows, { o: "outline", d: "pot", l: "woodLight", w: "white" });
      return { ...(heading === "left" ? mirror(image) : image), anchor: { x: 8, y: 10 }, key: `${key}:${index}` };
    });
    const ms = pose === "walking" ? 125 : pose === "jumping" ? 110 : pose === "stretching" ? 500 : 900;
    art = animation(key, frames, ms);
    cache.set(key, art);
  }
  return art;
}
