import { blit, canvas, mirror, paint, type Bitmap, type Canvas, type Legend } from "./grid";
import { Lru } from "./lru";
import type { CharacterLook, Slot } from "./palette";
import { CHAIR_ROWS, PROP_LEGEND } from "./props";
import { ROLES, type LobbyRole } from "../roles";

/**
 * People, 16 x 24, feet on the bottom row (lying down, 24 x 16). A character is composed from layers (cape or tail,
 * body, chair back, head, headgear), so every role shares one body and every pose shares one head.
 *
 * Legend: o outline, s/S skin, h/H hair, t/T shirt, p pants, b shoes,
 * a/A the role's gear colours, c/C cape.
 */

export type CharacterRole = LobbyRole;
/** `sit` facing up is the back view at a desk, and its two frames are typing. */
export type CharacterPose =
  | "idle"
  | "walk"
  /** Halfway between standing at the chair and the typing pose. */
  | "settle"
  | "sit"
  | "read" | "board" | "plan" | "terminal" | "watch" | "frustrated" | "celebrate"
  | "sleep"
  /** Standing with a cup; frame 1 lifts it to the mouth. */
  | "drink"
  /** Standing; frame 1 opens the mouth and moves a hand. */
  | "talk"
  /** Standing; frame 1 has both arms up. */
  | "stretch"
  /** Seated facing the viewer with eyes shut, head nodding. */
  | "doze"
  /** Lying asleep, drawn sideways: this pose alone is 24 x 16. */
  | "lie";
export type Facing = "down" | "up" | "left" | "right";

export const CHARACTER_WIDTH = 16;
export const CHARACTER_HEIGHT = 24;
export const CHARACTER_FRAMES: Readonly<Record<CharacterPose, number>> = {
  idle: 2,
  walk: 8,
  settle: 1,
  sit: 2,
  read: 2,
  board: 2,
  plan: 2,
  terminal: 2,
  watch: 2,
  frustrated: 2,
  celebrate: 2,
  sleep: 2,
  drink: 2,
  talk: 2,
  stretch: 2,
  doze: 2,
  lie: 2,
};

export const CHARACTER_SHADOW_FRAMES = CHARACTER_FRAMES.walk;
const SHADOW_ROWS: readonly (readonly string[])[] = [
  [".....oooooo.....", "..oooooooooooo..", ".....oooooo....."],
  ["....oooooooo....", "...oooooooooo...", ".....oooooo....."],
  ["......oooo......", "...oooooooooo...", "......oooo......"],
  ["......oooo......", "....oooooooo....", "......oooo......"],
  [".....oooooo.....", "..oooooooooooo..", ".....oooooo....."],
  ["....oooooooo....", "...oooooooooo...", ".....oooooo....."],
  ["....oooooooo....", "..oooooooooooo..", "....oooooooo...."],
  ["......oooo......", "....oooooooo....", "......oooo......"],
];
const shadowCache = new Lru<Bitmap>(CHARACTER_SHADOW_FRAMES);

/** A soft pixel ellipse at the feet; walking frames narrow and widen with the stride. */
export function characterShadow(frame = 0): Bitmap {
  const index = ((frame % CHARACTER_SHADOW_FRAMES) + CHARACTER_SHADOW_FRAMES) % CHARACTER_SHADOW_FRAMES;
  const key = `character-shadow:${index}`;
  let bitmap = shadowCache.get(key);
  if (!bitmap) {
    const drawing = paint(SHADOW_ROWS[index]!, { o: "characterShadow" });
    bitmap = { ...drawing, key, anchor: { x: 8, y: 3 } };
    shadowCache.set(key, bitmap);
  }
  return bitmap;
}

export interface CharacterSpec {
  readonly role: CharacterRole;
  readonly look: CharacterLook;
  readonly pose?: CharacterPose;
  readonly facing?: Facing;
  /** Something in the hand. Shown from the front and the sides, not from behind. */
  readonly carry?: "cup" | "book" | null;
  /** Any integer; wraps at the pose's frame count. Frame 0 is the still to show under reduced motion. */
  readonly frame?: number;
}

// Rows 0 to 12. Rows 0 to 2 stay empty for headgear.
const HEAD_DOWN = [
  "................",
  "................",
  "................",
  "....oooooooo....",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhsssshho...",
  "...ohssssssho...",
  "...ossossosso...",
  "...ossossosso...",
  "...osssssssso...",
  "...oSssssssSo...",
  "....oooooooo....",
];
const HEAD_RIGHT = [
  "................",
  "................",
  "................",
  ".....ooooooo....",
  "....oJhhhHHho...",
  "....ohhhhhhho...",
  "....ohhhhhsSo...",
  "....ohhhssLso...",
  "....ohhssosso...",
  "....oHhssosSso..",
  ".....osssSso....",
  ".....oSssSo.....",
  "......oooo......",
];
const HEAD_UP = [
  "................",
  "................",
  "................",
  "....oooooooo....",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...oHhhhhhhHo...",
  "...ossHHHHsso...",
  "....oooooooo....",
];
type Patch = readonly [x: number, y: number, char: string];

const LONG_HAIR: readonly Patch[] = [
  ...[6, 7, 8, 9, 10, 11].flatMap((y): Patch[] => [
    [4, y, "h"],
    [11, y, "h"],
  ]),
  ...[12, 13].flatMap((y): Patch[] => [
    [3, y, "o"],
    [4, y, "h"],
    [5, y, "o"],
    [10, y, "o"],
    [11, y, "h"],
    [12, y, "o"],
  ]),
];
const FRINGE: readonly Patch[] = [
  [6, 6, "h"],
  [7, 6, "h"],
  [8, 6, "h"],
  [5, 7, "h"],
  [6, 7, "h"],
  [9, 6, "H"],
  [7, 7, "H"],
];
const PUFF: readonly Patch[] = [
  [4, 3, "o"], [5, 2, "o"], [6, 2, "o"], [7, 1, "o"], [8, 1, "o"], [9, 2, "o"], [10, 2, "o"],
  [6, 3, "h"], [7, 2, "J"], [8, 2, "h"], [9, 3, "h"],
];
const BUN: readonly Patch[] = [
  [4, 8, "h"], [3, 9, "h"], [2, 10, "o"], [3, 10, "J"], [4, 10, "H"], [3, 11, "o"], [4, 11, "o"],
];

/**
 * Hair styles are small edits to the head, so they survive under a hat or a headset. The side
 * view (drawn facing right) keeps only what does not cover the face.
 */
const HAIR_STYLES: readonly Readonly<Record<"down" | "up" | "side", readonly Patch[]>>[] = [
  { down: [], up: [], side: [] },
  { down: LONG_HAIR, up: LONG_HAIR, side: LONG_HAIR.filter(([x]) => x <= 5) },
  { down: FRINGE, up: [], side: [] },
  { down: PUFF, up: PUFF, side: PUFF },
  { down: [[4, 7, "H"], [11, 7, "H"]], up: BUN, side: BUN },
];

const TORSO_IDLE = [
  "...otttttttto...",
  "..otTttttttTto..",
  "..otTttttttTto..",
  "..osTttttttTso..",
  "..oottttttttoo..",
];
const TORSO_WALK = [
  "...otttttttto...",
  "..otTttttttTto..",
  "..otTttttttTso..",
  "..osTttttttToo..",
  "..oottttttttto..",
];
// The passing pose swings the opposite arm and narrows the waist for one beat.
const TORSO_WALK_PASS = [
  "...otttttttto...",
  "..otTttttttUto..",
  "..otTttttttTto..",
  "..osTttttttTso..",
  "..oottttttttoo..",
];
// Back view at a keyboard: forearms are out of sight, the elbows move.
const TORSO_TYPE_OUT = [
  "...otttttttto...",
  ".ottTttttttTtto.",
  ".ootTttttttTtoo.",
  "...oTttttttTo...",
  "...otttttttto...",
];
const TORSO_TYPE_IN = [
  "...otttttttto...",
  "..otTttttttTto..",
  "..ooTttttttToo..",
  "...oTttttttTo...",
  "...otttttttto...",
];
const LEGS_IDLE = [
  "...oppppppppo...",
  "...oppppppppo...",
  "...opppoopppo...",
  "...opppoopppo...",
  "...obbboobbbo...",
  "...oooooooooo...",
];
const LEGS_STEP = [
  "...oppppppppo...",
  "...oppppppppo...",
  "...opppoopppo...",
  "...opppoobbbo...",
  "...obbboooooo...",
  "...ooooo........",
];
const LEGS_PASS = [
  "...oppppppppo...",
  "...oppppppppo...",
  "...opppoopppo...",
  "...opppoppppo...",
  "..obbb..bbbo....",
  "...oooooooooo...",
];
const LEGS_LOAD = [
  "...oppppppppo...",
  "...oppppppppo...",
  "...opppooqppo...",
  "..opppo.oqppo...",
  "..obbbo..obbo...",
  "..ooooo..oooo...",
];
const LEGS_RISE = [
  "...oppppppppo...",
  "...oppppppppo...",
  "....opppqppo....",
  "....opppobbbo...",
  "....obbbooooo...",
  "....ooooo.......",
];
const WALK_LEGS = [LEGS_STEP, LEGS_LOAD, LEGS_PASS, LEGS_RISE];
const WALK_BOB = [0, 1, 1, 0];
const SIDE_SHIRT = [
  ".....otttto.....",
  "....oUtttTto....",
  "....ottttTto....",
  "....ottttTto....",
  ".....oTttTo.....",
];

/** The far shoe is darker and a row higher where it clears the floor. */
function sideStride(out: Canvas, legend: Legend, frame: number): void {
  const phase = frame % 4;
  const nearLeads = frame < 4;
  const forward = [3, 2, 0, -2][phase]!;
  const back = [-3, -2, 0, 2][phase]!;
  const draw = (ankle: number, high: number, far: boolean) => {
    const knee = 7 + Math.sign(ankle);
    blit(out, paint(far ? ["oqo", "oqo"] : ["opo", "opo"], legend), knee, 18);
    const shin = 7 + Math.round(ankle / 2);
    blit(out, paint(far ? ["oqo", "oqo"] : ["opo", "opo"], legend), shin, 20 - high);
    blit(out, paint(["obbo", "oooo"], legend), 7 + ankle, 22 - high);
  };
  draw(nearLeads ? back : forward, nearLeads && phase >= 2 ? 1 : 0, true);
  draw(nearLeads ? forward : back, !nearLeads && phase >= 2 ? 1 : 0, false);
}
const LEGS_SEATED = ["...oppppppppo...", "...opppoopppo...", "...obbboobbbo...", "...oooooooooo..."];
const WALK_ARMS: Readonly<Record<0 | 1, readonly Patch[]>> = {
  0: [
    [2, 15, "t"], [2, 16, "t"], [2, 17, "s"],
    [13, 14, "t"], [13, 15, "t"], [13, 16, "s"],
  ],
  1: [
    [2, 14, "t"], [2, 15, "t"], [2, 16, "s"],
    [13, 15, "t"], [13, 16, "t"], [13, 17, "s"],
  ],
};

const CUP = ["oooo", "occo", "owwo", "oooo"];
const CUP_LEFT = 11;
const BOOK = ["ooooooo", "owwowwo", "owwowwo", "ooooooo"];
const BOOK_LEFT = 5;
// Drinking: the right arm leaves the side and comes up beside the face, cup at the mouth.
const TORSO_DRINK = [
  "...otttttttto...",
  "..otTttttttTo...",
  "..otTttttttTo...",
  "..osTttttttTo...",
  "..ootttttttto...",
];
const ARM_RAISED = ["oo", "to", "to", "to"];
const TORSO_ARMLESS = [
  "...otttttttto...",
  "...oTttttttTo...",
  "...oTttttttTo...",
  "...oTttttttTo...",
  "...otttttttto...",
];
// Rows 5 to 13: both arms straight up past the head.
const ARMS_UP = [
  ".oo..........oo.",
  "oso..........oso",
  "oto..........oto",
  "oto..........oto",
  "oto..........oto",
  "oto..........oto",
  "oto..........oto",
  ".oto........oto.",
  "..oto......oto..",
];
const ARMS_UP_TOP = 5;
const EYES_SHUT: readonly Patch[] = [
  [6, 8, "s"],
  [9, 8, "s"],
  [5, 9, "o"],
  [10, 9, "o"],
];
const EYES_SHUT_SIDE: readonly Patch[] = [
  [10, 8, "s"],
  [11, 8, "s"],
  [11, 9, "o"],
];
const EYES_OPEN_FRONT: readonly Patch[] = [
  [7, 8, "w"],
  [10, 8, "w"],
  [5, 10, "L"],
  [11, 10, "L"],
  [8, 10, "S"],
  [9, 10, "S"],
];
const EYES_OPEN_SIDE: readonly Patch[] = [
  [11, 8, "w"],
  [12, 9, "L"],
  [10, 10, "S"],
];
const HAIR_GLINTS: Readonly<Record<"down" | "up" | "side", readonly Patch[]>> = {
  down: [[7, 5, "J"], [8, 5, "H"]],
  up: [[6, 6, "J"], [9, 6, "H"]],
  side: [[7, 5, "J"], [8, 6, "H"]],
};

const TORSO_TOP = 13;
const SEATED_DROP = 2;

const CAPE = [
  "..occcccccccco..",
  ".occcccccccccco.",
  ".occCccccccCcco.",
  ".occCccccccCcco.",
  ".occCccccccCcco.",
  ".occCccccccCcco.",
  ".occCccccccCcco.",
  ".oCCCCCCCCCCCCo.",
  ".oooooooooooooo.",
];
const TAIL = [
  "..............o.",
  ".............oao",
  ".............oao",
  "............oao.",
  "...........oao..",
  "...........oo...",
];
const BACK_ITEM_TOP = { overseer: 13, meow: 15 } as const;

const HAT = [
  "................",
  ".....oooooo.....",
  "....oaaaaaao....",
  "....oaaaaaao....",
  ".ooooAAAAAAoooo.",
  ".oaaaaaaaaaaaao.",
  "..oooooooooooo..",
];
const HEADSET_FRONT = [
  ".........oAAo...",
  ".........oAAo...",
  "..........oo....",
  "....oooooooo....",
  "...oaaaaaaaao...",
  "................",
  "................",
  "..oa........ao..",
  "..oa........ao..",
  "..oa........ao..",
  "..........Aaa...",
];
const HEADSET_BACK = HEADSET_FRONT.slice(0, 10);
const EARS = [
  "....o......o....",
  "...oao....oao...",
  "...oaAo..oAao...",
  "...oaaaooaaao...",
];
const EARS_BACK = EARS.map((line) => line.replace(/A/g, "a"));

function gearOf(look: CharacterLook, role: CharacterRole): "cap" | "headset" | "ears" | "none" {
  if (look.headgear && look.headgear !== "role") return look.headgear;
  if (role === "overseer") return "cap";
  if (role === "nexus") return "headset";
  if (role === "meow") return "ears";
  return "none";
}

function legendFor(look: CharacterLook, role: CharacterRole): Legend {
  const gear: Record<ReturnType<typeof gearOf>, readonly [Slot, Slot]> = {
    cap: ["hat", "hatBand"],
    headset: ["headset", "headsetLight"],
    ears: [`hair${look.hair}` as Slot, "earInner"],
    none: ["outline", "outline"],
  };
  const [a, A] = gear[gearOf(look, role)];
  return {
    o: "outline",
    w: "white",
    s: `skin${look.skin}` as Slot,
    S: `skinShade${look.skin}` as Slot,
    L: `skinLight${look.skin}` as Slot,
    h: `hair${look.hair}` as Slot,
    H: `hairShade${look.hair}` as Slot,
    J: `hairLight${look.hair}` as Slot,
    t: `shirt${look.shirt}` as Slot,
    T: `shirtShade${look.shirt}` as Slot,
    U: `shirtLight${look.shirt}` as Slot,
    p: `pants${look.pants}` as Slot,
    q: `pantsShade${look.pants}` as Slot,
    b: "shoes",
    a, A,
    c: "cape",
    C: "capeShade",
  };
}

function patched(rows: readonly string[], patches: readonly Patch[]): string[] {
  const out = rows.map((line) => line.split(""));
  for (const [x, y, char] of patches) {
    while (out.length <= y) out.push(".".repeat(CHARACTER_WIDTH).split(""));
    out[y]![x] = char;
  }
  return out.map((line) => line.join(""));
}

function headCanvas(
  facing: Facing,
  look: CharacterLook,
  role: CharacterRole,
  legend: Legend,
  eyesShut: boolean,
): Canvas {
  const view = facing === "up" || facing === "down" ? facing : "side";
  const base = view === "up" ? HEAD_UP : view === "down" ? HEAD_DOWN : HEAD_RIGHT;
  const hair = HAIR_STYLES[look.hairStyle % HAIR_STYLES.length]![view];
  const eyes = eyesShut
    ? view === "down"
      ? EYES_SHUT
      : view === "side"
        ? EYES_SHUT_SIDE
        : []
    : view === "down"
      ? EYES_OPEN_FRONT
      : view === "side"
        ? EYES_OPEN_SIDE
        : [];
  const head = paint(patched(base, [...hair, ...HAIR_GLINTS[view], ...eyes]), legend);
  const kind = gearOf(look, role);
  const gear =
    kind === "cap"
      ? HAT
      : kind === "headset"
        ? facing === "up"
          ? HEADSET_BACK
          : HEADSET_FRONT
        : kind === "ears"
          ? facing === "up"
            ? EARS_BACK
            : EARS
          : null;
  if (gear) blit(head, paint(gear, legend));
  if (look.accessory === "glasses" && view !== "up") {
    blit(head, paint(view === "side" ? ["oAoo", "oooo"] : ["ooo.ooo", "oAoooAo"], {
      o: "outline", A: "glass",
    }), view === "side" ? 9 : 5, 8);
  }
  return head;
}

/** Draws one frame facing down, up or right. Left is the mirror of right, done by the caller. */
function compose(spec: Required<CharacterSpec>, eyesShut = false): Canvas {
  const { role, look, pose, frame } = spec;
  const seated = pose === "sit" || pose === "sleep" || pose === "doze" || pose === "read" || pose === "watch" || pose === "terminal";
  // Seated characters face the desk or the viewer; asleep at a desk is always slumped toward it.
  const facing: Facing =
    pose === "sleep"
      ? "up"
      : pose === "doze" || (seated && spec.facing !== "up") || (pose === "stretch" && spec.facing !== "up")
        ? "down"
        : spec.facing;
  const back = facing === "up";
  const side = facing === "left" || facing === "right";
  const legend = legendFor(look, role);
  const out = canvas(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const drop = seated ? SEATED_DROP : 0;
  const acting = frame === 1 && !back;

  const backItem = role === "overseer" ? CAPE : role === "meow" ? TAIL : null;
  const drawBackItem = () => {
    if (backItem) blit(out, paint(backItem, legend), 0, BACK_ITEM_TOP[role === "overseer" ? "overseer" : "meow"] + drop);
  };

  let torso = TORSO_IDLE;
  let legs = seated ? LEGS_SEATED : LEGS_IDLE;
  let flip = false;
  let headDrop = drop;
  if (pose === "walk") {
    const step = frame % 4;
    torso = side ? SIDE_SHIRT : step === 2 ? TORSO_WALK_PASS : TORSO_WALK;
    legs = WALK_LEGS[step]!;
    flip = !side && frame >= 4;
    headDrop += WALK_BOB[step]!;
  } else if (pose === "settle") {
    headDrop = 1;
    legs = LEGS_LOAD;
  } else if ((pose === "sit" && back) || pose === "terminal") {
    torso = frame === 0 ? TORSO_TYPE_OUT : TORSO_TYPE_IN;
  } else if (pose === "sleep") {
    headDrop += 3 + frame;
  } else if (pose === "doze") {
    headDrop += 1 + frame;
  } else if (pose === "drink") {
    if (acting) torso = TORSO_DRINK;
  } else if (pose === "talk") {
    if (acting) torso = TORSO_WALK;
    else headDrop += back ? frame : 0;
  } else if (pose === "stretch" || pose === "celebrate") {
    if (frame === 1) torso = TORSO_ARMLESS;
  } else if (pose === "read" || pose === "watch" || pose === "frustrated") {
    headDrop += frame;
  } else {
    headDrop += frame;
  }

  if (!back) drawBackItem();
  const body = canvas(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  if (pose === "walk" && side) sideStride(body, legend, frame);
  else blit(body, paint(legs, legend), 0, CHARACTER_HEIGHT - legs.length);
  blit(body, paint(torso, legend), 0, TORSO_TOP + (pose === "settle" ? 1 : drop));
  if (!back && !(pose === "walk" && side)) {
    const collar: readonly Patch[] = [
      [7, TORSO_TOP + drop, "s"],
      [8, TORSO_TOP + drop, "s"],
      [6, TORSO_TOP + drop + 1, "T"],
      [9, TORSO_TOP + drop + 1, "U"],
      [8, TORSO_TOP + drop + 2, "U"],
      [8, TORSO_TOP + drop + 3, "T"],
      [4, TORSO_TOP + drop + 3, "U"],
      [11, TORSO_TOP + drop + 3, "T"],
    ];
    for (const [x, y, char] of collar) blit(body, paint([char], legend), x, y);
  }
  if (pose === "walk" && side) {
    const advance = (frame < 4 ? -1 : 1) * ([2, 1, 0, -1][frame % 4]!);
    blit(body, paint(["oUo", "oTo", "oso"], legend), 7 + advance, 14 + (frame % 4 === 2 ? 1 : 0));
  } else if (pose === "walk") {
    const phase = frame % 4 < 2 ? 0 : 1;
    for (const [x, y, char] of WALK_ARMS[phase]) blit(body, paint([char], legend), x, y);
  }
  if (!seated && !(pose === "walk" && side)) {
    blit(body, paint(["q"], legend), 7, 20);
    blit(body, paint(["q"], legend), 8, 20);
  }
  const outfit = look.outfit ?? 0;
  if (outfit && pose !== "stretch" && !back) {
    const outfitTop = TORSO_TOP + drop + 1;
    const patch = outfit === 1 ? ["UT", "oT"] : outfit === 2 ? ["w", "U"] : ["s", "o"];
    blit(body, paint(patch, legend), side ? 9 : 8, outfitTop);
  }
  blit(out, flip ? mirror(body) : body);
  if (back) drawBackItem();
  const cup = spec.carry === "cup" || pose === "drink";
  const sipping = pose === "drink" && acting;
  if (cup && !back && !sipping) blit(out, paint(CUP, PROP_LEGEND), CUP_LEFT, TORSO_TOP + 1 + drop);
  if (spec.carry === "book" && !back && pose !== "drink") {
    blit(out, paint(BOOK, PROP_LEGEND), BOOK_LEFT, TORSO_TOP + 1 + drop);
  }
  if (seated && back) blit(out, paint(CHAIR_ROWS, PROP_LEGEND), 0, CHARACTER_HEIGHT - CHAIR_ROWS.length);
  blit(out, headCanvas(facing, look, role, legend, eyesShut || pose === "doze"), 0, headDrop);
  if (look.accessory === "pin") blit(out, paint(["ow", "oo"], PROP_LEGEND), back ? 9 : 6, TORSO_TOP + drop + 1);
  if (look.accessory === "scarf") blit(out, paint(["oeeeeo", ".oo.o."], PROP_LEGEND), 5, TORSO_TOP + headDrop - 1);
  const badge = ROLES[role].art;
  if (badge) blit(out, paint(badge, PROP_LEGEND), back ? 8 : side ? 3 : 11, TORSO_TOP + headDrop);
  if (sipping) {
    blit(out, paint(ARM_RAISED, legend), 12, 10);
    blit(out, paint(CUP, PROP_LEGEND), 8, 9);
  }
  if (pose === "talk" && acting) blit(out, paint(["oo"], legend), facing === "down" ? 7 : 9, 10 + headDrop);
  if ((pose === "stretch" || pose === "celebrate") && frame === 1) blit(out, paint(ARMS_UP, legend), 0, ARMS_UP_TOP);
  if (pose === "read") blit(out, paint(frame === 0 ? BOOK : ["ooooooo", "owwoo.o", "owwowwo", "ooooooo"], PROP_LEGEND), 0, 14);
  if (pose === "plan" || pose === "board") {
    const board = ["oooooo", "owwwwo", "owwwwo", "owwwwo", "oooooo"];
    blit(out, paint(board, PROP_LEGEND), 10, 12);
    blit(out, paint([frame === 0 ? "eee" : "e.e"], PROP_LEGEND), 11, 14);
    if (pose === "plan") blit(out, paint(["e", "o"], PROP_LEGEND), 11 + frame, 15);
  }
  if (pose === "terminal") blit(out, paint(["ooooo", frame === 0 ? "oee.o" : "o.eeo", "ooooo"], PROP_LEGEND), 0, 12);
  if (pose === "watch") blit(out, paint(["oooo", frame === 0 ? "oeeo" : "oe.o", "oooo"], PROP_LEGEND), 1, 11);
  if (pose === "frustrated") blit(out, paint(ARM_RAISED, legend), frame ? 1 : 12, 10);
  return out;
}

export const LYING_WIDTH = CHARACTER_HEIGHT;
export const LYING_HEIGHT = CHARACTER_WIDTH;

/** Turns a standing figure a quarter turn, head to the left. */
function laidDown(standing: Canvas): Canvas {
  const out = canvas(LYING_WIDTH, LYING_HEIGHT);
  for (let y = 0; y < standing.height; y++) {
    for (let x = 0; x < standing.width; x++) {
      out.pixels[(standing.width - 1 - x) * LYING_WIDTH + y] = standing.pixels[y * standing.width + x]!;
    }
  }
  return out;
}

function draw(spec: Required<CharacterSpec>): Canvas {
  if (spec.pose === "lie") return laidDown(compose({ ...spec, pose: "idle", facing: "down", carry: null }, true));
  return spec.facing === "left" ? mirror(compose({ ...spec, facing: "right" })) : compose(spec);
}

/** Looks times roles times frames runs to hundreds of thousands of drawings; keep the recent ones. */
export const CHARACTER_MAX_CACHED = 1024;
const cache = new Lru<Bitmap>(CHARACTER_MAX_CACHED);

/** The drawing for one character in one pose. While it is cached, the same spec returns the same object. */
export function character(spec: CharacterSpec): Bitmap {
  const pose = spec.pose ?? "idle";
  const frames = CHARACTER_FRAMES[pose];
  const frame = (((spec.frame ?? 0) % frames) + frames) % frames;
  const carry = spec.carry ?? null;
  const full = { role: spec.role, look: spec.look, pose, facing: spec.facing ?? "down", frame, carry };
  const { skin, hair, hairStyle, shirt, pants, outfit = 0, accessory = "none", headgear = "role" } = spec.look;
  const key = `c:${full.role}:${pose}:${full.facing}:${frame}:${skin}.${hair}.${hairStyle}.${shirt}.${pants}.${outfit}.${accessory}.${headgear}:${carry ?? ""}`;
  let bitmap = cache.get(key);
  if (!bitmap) {
    const drawn = draw(full);
    bitmap = { key, ...drawn, anchor: { x: drawn.width / 2, y: drawn.height } };
    cache.set(key, bitmap);
  }
  return bitmap;
}
