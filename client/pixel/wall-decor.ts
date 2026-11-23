import { paint, row, type Bitmap, type Legend } from "./grid";

/** Small hanging pieces, sized to sit in the gaps between the desk monitors. */
export const WALL_DECOR_IDS = ["sunset", "botanical", "clock", "waves", "moon", "books", "abstract", "flower"] as const;
export type WallDecorId = (typeof WALL_DECOR_IDS)[number];

const LEGEND: Legend = {
  o: "outline",
  w: "white",
  d: "wood",
  D: "woodShade",
  l: "woodLight",
  f: "fabric",
  F: "fabricShade",
  u: "fabricLight",
  g: "leaf",
  G: "leafShade",
  p: "pot",
  P: "potShade",
  c: "coffee",
  e: "emoteReady",
  a: "glass",
  A: "glassShade",
  m: "metal",
  M: "metalShade",
};

const framed = (body: readonly string[]) => [
  row("o", ["D", 10], "o"),
  row("o", ["d", 10], "o"),
  ...body.map((line) => `o${line}o`),
  row("o", ["d", 10], "o"),
  row("o", ["D", 10], "o"),
];

const ART: Readonly<Record<WallDecorId, readonly string[]>> = {
  sunset: framed([
    "..........",
    "...ccc....",
    "..cccccc..",
    ".cceeeecc.",
    "gggggggggg",
    "gGggGggGgg",
  ]),
  botanical: framed([
    "....gg....",
    "...gGGg...",
    "..gggggg..",
    "...gGGg...",
    "..oPPPPo..",
    "...oooo...",
  ]),
  clock: framed([
    "....oooo..",
    "...oaaaao.",
    "..oaaeeao.",
    "..oawwao..",
    "...oaaaao.",
    "....oooo..",
  ]),
  waves: framed([
    "..........",
    "gg....gg..",
    "ggg...ggg.",
    ".ggg...ggg",
    "..ggg...gg",
    "...ggg...g",
  ]),
  moon: framed([
    "....eeee..",
    "...eaaaae.",
    "..eaaaaa..",
    "..eaaa....",
    "...e......",
    "..........",
  ]),
  books: framed([
    "o..o..o...",
    "D..F..f...",
    "D..f..u...",
    "oooooooo..",
    "lDddDdl...",
    "DDDDDD....",
  ]),
  abstract: framed([
    "....c.....",
    "...ccc....",
    "..ceeecc..",
    ".ccccccccc",
    ".cDDDDDDc.",
    "..cDDDDc..",
  ]),
  flower: framed([
    "...gg.....",
    "..gGgg....",
    ".ggggggg..",
    "...gGg....",
    "...pp.....",
    "...oo.....",
  ]),
};

const cache = new Map<WallDecorId, Bitmap>();

/** Every piece is indexed art; the room's palette supplies its colors. */
export function wallDecoration(id: WallDecorId): Bitmap {
  let bitmap = cache.get(id);
  if (!bitmap) {
    const art = paint(ART[id], LEGEND);
    bitmap = {
      key: `wall-decor:${id}`,
      width: art.width,
      height: art.height,
      anchor: { x: art.width / 2, y: art.height / 2 },
      pixels: art.pixels,
    };
    cache.set(id, bitmap);
  }
  return bitmap;
}
