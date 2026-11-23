import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM, lobbyPreferences, roomPreset } from "../shared/preferences";
import { officeLight } from "../client/lighting";
import { buildForest, crewState, groupByWorkspace } from "../client/model";
import { layoutOffice, presences } from "../client/office-model";
import { petFloor, petHome, petOccupants, petPath, petPlan, type PetPose } from "../client/pet-model";
import { catArt } from "../client/pixel/cat";
import { roomArt } from "../client/backdrop";
import { dispatchEffects, effectOf, effectsAt, EMPTY_EFFECTS } from "../client/visual-events";
import { agent } from "./fake-daemon";

const now = new Date(2026, 10, 18, 15).getTime();
const people = new Map(Array.from({ length: 6 }, (_, index) => {
  const id = `test-${index}`;
  return [id, agent(id, { createdAt: new Date(now - index * 5000).toISOString(), updatedAt: new Date(now).toISOString() })];
}));
const groups = groupByWorkspace(buildForest(people.values(), "ws-a"), new Map());
const base = { ...DEFAULT_ROOM, theme: "library" as const };
const config = { ...base, floor: "mosaic" as const, wall: "brick" as const, palette: "rose" as const, objects: { window: true, lamp: true, rug: false } };

describe("environment", () => {
  it("uses a single local-time boundary in Auto", () => {
    expect(officeLight("auto", now, true)).toEqual({ light: "day", next: new Date(2026, 10, 18, 19).getTime() });
    expect(officeLight("auto", new Date(2026, 10, 18, 21).getTime(), true)).toEqual({ light: "night", next: new Date(2026, 10, 19, 7).getTime() });
    expect(officeLight("night", now, true)).toEqual({ light: "night", next: null });
    expect(officeLight("auto", now, false)).toEqual({ light: "theme", next: null });
  });

  it("retains earlier room choices with new defaults and parses edited/imported presets", async () => {
    const old = { rooms: { one: { theme: "workshop", seed: 93, locked: true } }, favorites: ["one"], motion: "off" };
    const migrated = lobbyPreferences.schema.parse(await lobbyPreferences.migrate?.(old, 1));
    expect(migrated.rooms.one).toMatchObject({ theme: "workshop", seed: 93, locked: true, floor: "auto", objects: {} });
    expect(migrated.pet).toBe(false);
    const { locked: _locked, ...fields } = config;
    expect(roomPreset.parse(JSON.parse(JSON.stringify(config)))).toEqual(fields);
    expect(roomPreset.safeParse({ objects: { fake: true } }).success).toBe(false);
  });

  it.each([5, 9, 15, 24])("keeps furniture and routes within the reserved space at width %s", (width) => {
    const original = layoutOffice(groups, { width, agents: people, preferences: { "ws-a": base } });
    const office = layoutOffice(groups, { width, agents: people, preferences: { "ws-a": config } });
    const room = office.rooms[0]!;
    expect(room.look).toMatchObject({ floor: "floorMosaic", wall: "brick" });
    expect([...office.desks.values()].map((desk) => desk.cell)).toEqual([...original.desks.values()].map((desk) => desk.cell));
    expect(roomArt(room).pixels.length).toBe(room.width * room.height * 256);
    const floor = petFloor(room);
    const home = petHome(room, floor)!;
    const occupants = petOccupants(room, presences(office, people, crewState, now));
    for (const desk of office.desks.values()) expect(floor.has(`${desk.cell.x},${desk.cell.y}`)).toBe(false);
    const path = petPath(floor, home, { x: room.corridorX, y: room.floorTop }, occupants);
    expect(petPath(floor, home, { x: room.corridorX, y: room.floorTop }, new Set())).not.toBeNull();
    for (const step of path ?? []) expect(occupants.has(`${step.x},${step.y}`)).toBe(false);
    const active = petPlan(room, floor, presences(office, people, crewState, now, false), home, 5);
    expect(active).toEqual(petPlan(room, floor, presences(office, people, crewState, now, false), home, 5));
    expect(active.every((step) => floor.has(`${step.at.x},${step.at.y}`))).toBe(true);
    expect([...presences(office, people, crewState, now, false).values()].every((person) => person.activity === "asleep")).toBe(true);
  });

  it("draws all six cat poses in both directions", () => {
    const poses: PetPose[] = ["idle", "walking", "sleeping", "sitting", "stretching", "jumping"];
    for (const pose of poses) for (const facing of ["left", "right"] as const) {
      const art = catArt(pose, facing);
      expect(art.still.width).toBe(16);
      expect(art.still.height).toBe(12);
      expect(art.still.pixels.some(Boolean)).toBe(true);
    }
  });

  it("deduplicates verified effects, queues two at a time and discards late arrivals", () => {
    const operation = { id: "test", agentId: "test-0", source: "tool", kind: "testing", phase: "completed", at: now } as const;
    expect(effectOf(operation)).toBeNull();
    const first = effectOf({ ...operation, exitCode: 0 })!;
    expect(first.kind).toBe("tests-passed");
    expect(effectOf({ ...operation, exitCode: 7 })?.kind).toBe("tests-failed");
    const list = [first, first, { ...first, id: "another-id" }, ...[1, 2, 3].map((agent) => ({ ...first, id: String(agent), agentId: String(agent) })), { ...first, id: "old", at: now - 6000 }];
    const queue = dispatchEffects(EMPTY_EFFECTS, list, now);
    expect(queue.items).toHaveLength(4);
    expect(effectsAt(queue, now).active).toHaveLength(2);
    expect(effectsAt(queue, now + 2300).active).toHaveLength(2);
    expect(effectsAt(queue, now + 4600)).toEqual({ active: [], next: null });
  });
});
