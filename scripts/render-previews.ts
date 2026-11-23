import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { ART_THEMES } from "../client/art-themes";
import { DEMO_ROOM, DEMO_START, DEMO_WORKSPACES, demoScenario } from "../client/demo-model";
import { buildForest, crewState, groupByWorkspace } from "../client/model";
import { layoutOffice, presences } from "../client/office-model";
import { buildReplay, sceneActor } from "../client/replay-model";
import { officeImage, type OfficeImage } from "../client/screenshot";
import { DEFAULT_ROOM } from "../shared/preferences";

const scale = 3;

function chunk(name: string, bytes: Buffer): Buffer {
  const tag = Buffer.from(name, "ascii");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([tag, bytes])));
  return Buffer.concat([size, tag, bytes, checksum]);
}

function png(image: OfficeImage): Buffer {
  const width = image.width * scale;
  const height = image.height * scale;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
    pixels.set(image.pixels.subarray(from, from + 4), y * stride + 1 + x * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

for (const light of ["day", "night"] as const) {
  const replay = buildReplay(demoScenario("recovery").events);
  const at = DEMO_START + (light === "day" ? 6000 : 13_100);
  const actors = replay.seek(replay.countAt(at));
  const agents = new Map([...actors.values()].flatMap((actor) => {
    const agent = sceneActor(actor);
    return agent ? [[agent.id, agent] as const] : [];
  }));
  const groups = groupByWorkspace(buildForest(agents.values(), null), DEMO_WORKSPACES);
  const office = layoutOffice(groups, { width: 16, agents, preferences: { [DEMO_ROOM]: {
    ...DEFAULT_ROOM, theme: "library", wall: "panel", palette: light === "day" ? "mint" : "amber", decor: "full", objects: { lamp: true, window: true },
  } } });
  const image = officeImage(ART_THEMES[light === "day" ? 0 : 1], office, presences(office, agents, crewState, at), agents, {}, light, (room) => room.name);
  if (!image) throw new Error("The office preview does not fit the export");
  writeFileSync(`docs/lobby-v2-${light}.png`, png(image));
}
