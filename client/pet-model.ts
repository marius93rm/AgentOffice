import type { Point, Presence, Room } from "./office-model";
import { PROPS } from "./pixel/props";

export type PetPose = "idle" | "walking" | "sleeping" | "sitting" | "stretching" | "jumping";
export interface Pet { species: "cat"; roomId: string; at: Point; pose: PetPose; heading: "left" | "right" }
export interface PetStep { at: Point; pose: PetPose; ms: number }

const key = (point: Point) => `${Math.floor(point.x)},${point.y}`;
const steps = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }];
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const contains = (point: Point, room: Room) =>
  point.x > room.x && point.x < room.x + room.width - 1 && point.y >= room.floorTop && point.y < room.y + room.height - 1;

export function petFloor(room: Room): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const pod of room.pods) for (const team of pod.teams) for (const desk of team.desks) {
    for (const offset of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]) blocked.add(key(add(desk.cell, offset)));
  }
  for (const zone of room.zones) for (const item of zone.props) {
    if (item.id === "rug") continue;
    for (let width = 0; width < PROPS[item.id].tilesWide; width++) blocked.add(key({ x: item.x + width, y: item.y }));
  }
  if (room.lounge.wall) {
    const { x, y, width } = room.lounge.wall;
    for (let index = 0; index < width; index++) blocked.add(key({ x: x + index, y }));
  }
  if (room.closed) blocked.add(key(room.closed.at));
  const floor = new Set<string>();
  for (let y = room.floorTop; y < room.y + room.height - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x++) {
      const id = key({ x, y });
      if (!blocked.has(id)) floor.add(id);
    }
  }
  return floor;
}

/** Shortest four-neighbor route. The returned path excludes the start. */
export function petPath(floor: ReadonlySet<string>, from: Point, to: Point, occupied: ReadonlySet<string>): Point[] | null {
  if (!floor.has(key(from)) || !floor.has(key(to)) || occupied.has(key(to))) return null;
  const visited = new Map<string, Point | null>([[key(from), null]]);
  const queue = [from];
  for (let index = 0; index < queue.length; index++) {
    const at = queue[index]!;
    if (key(at) === key(to)) {
      const result: Point[] = [];
      let point = at;
      while (key(point) !== key(from)) {
        result.push(point);
        point = visited.get(key(point))!;
      }
      return result.reverse();
    }
    for (const offset of steps) {
      const next = add(at, offset), id = key(next);
      if (!floor.has(id) || occupied.has(id) || visited.has(id)) continue;
      visited.set(id, at);
      queue.push(next);
    }
  }
  return null;
}

export function petHome(room: Room, floor: ReadonlySet<string>): Point | null {
  const y = room.lounge.walkway.y;
  for (let x = room.x + room.width - 2; x > room.corridorX; x--) {
    if (floor.has(key({ x, y }))) return { x, y };
  }
  return null;
}

export function petOccupants(room: Room, people: ReadonlyMap<string, Presence>): ReadonlySet<string> {
  return new Set([...people.values()].filter((person) => person.visible && contains(person.at, room)).map((person) => key(person.at)));
}

export function canPetOccupy(step: PetStep, occupied: ReadonlySet<string>): boolean {
  return !occupied.has(key(step.at));
}

export function petPlan(room: Room, floor: ReadonlySet<string>, people: ReadonlyMap<string, Presence>, from: Point, turn: number): PetStep[] {
  const occupied = petOccupants(room, people);
  const around = [...people.values()].filter((person) => person.visible && contains(person.at, room))
    .flatMap((person) => steps.map((offset) => add({ x: Math.floor(person.at.x), y: person.at.y }, offset)));
  const home = petHome(room, floor);
  const jumps = room.zones.flatMap((zone) => zone.props.filter((item) => item.id === "sofa"))
    .map((item) => ({ from: { x: item.x, y: item.y + 1 }, to: { x: item.x, y: item.y } }));
  for (const pod of room.pods) for (const team of pod.teams) for (const desk of team.desks) {
    const agent = people.get(desk.agentId);
    if (agent?.activity === "wandering" || agent?.activity === "gathering" || agent?.visible === false) {
      jumps.push({ from: { x: desk.cell.x, y: desk.aisleY }, to: desk.cell });
    }
  }
  const choices: { at: Point; jump: Point | null }[] = turn % 4 === 0 ? jumps.filter((jump) => !occupied.has(key(jump.to))).map((jump) => ({ at: jump.from, jump: jump.to }))
    : turn % 4 === 1 ? around.map((at) => ({ at, jump: null }))
    : turn % 4 === 2 && home ? [{ at: home, jump: null }] : [];
  const points = [...floor].map((id) => {
    const [x, y] = id.split(",").map(Number) as [number, number];
    return { x, y };
  }).filter((point) => point.x !== room.corridorX);
  const shift = points.length ? (turn * 11 + room.workspaceId.length * 3) % points.length : 0;
  choices.push(...[...points.slice(shift), ...points.slice(0, shift)].map((at) => ({ at, jump: null })));
  for (const target of choices) {
    const path = petPath(floor, from, target.at, occupied);
    if (!path) continue;
    const move: PetStep[] = path.map((at) => ({ at, pose: "walking", ms: 175 }));
    if (target.jump) {
      move.push({ at: target.jump, pose: "jumping", ms: 310 }, { at: target.jump, pose: "sitting", ms: 3600 },
        { at: target.at, pose: "jumping", ms: 310 });
    } else {
      const pose: PetPose = turn % 4 === 2 ? "sleeping" : turn % 4 === 3 ? "stretching" : "idle";
      move.push({ at: target.at, pose, ms: pose === "sleeping" ? 7200 : 3500 });
    }
    return move;
  }
  return [{ at: from, pose: "idle", ms: 4500 }];
}
