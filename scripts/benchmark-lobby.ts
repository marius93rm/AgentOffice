import { performance } from "node:perf_hooks";
import { buildForest, crewState, groupByWorkspace } from "../client/model";
import * as layout from "../client/office-model";
import { roomArt, frameArt } from "../client/backdrop";
import { candidatesOf, planFeed, FEED_CAP } from "../client/feed-plan";
import type { PaseoAgent, PaseoWorkspace } from "../client/paseo-types";

const observed = Date.UTC(2026, 10, 18, 10);
const iterations = 100;
for (const size of [10, 30, 100]) {
  const workspaces = new Map<string, PaseoWorkspace>();
  const agents = new Map<string, PaseoAgent>();
  for (let index = 0; index < size; index++) {
    const workspaceId = `room-${Math.floor(index / 10)}`;
    workspaces.set(workspaceId, { id: workspaceId, projectDisplayName: "Benchmark", name: workspaceId } as PaseoWorkspace);
    const id = `actor-${index}`;
    agents.set(id, {
      id, provider: "lobby", cwd: "", model: null, title: id, status: index % 5 < 3 ? "running" : "idle",
      workspaceId, createdAt: new Date(observed - 600_000 + index * 100).toISOString(),
      updatedAt: new Date(observed - index * 170).toISOString(), lastUserMessageAt: null, capabilities: {
        supportsStreaming: false, supportsSessionPersistence: false, supportsDynamicModes: false,
        supportsMcpServers: false, supportsReasoningStream: false, supportsToolInvocations: false,
      },
      currentModeId: null, availableModes: [], pendingPermissions: [], persistence: null, labels: {},
    } as PaseoAgent);
  }
  const previous = Object.hasOwn(layout, "createOfficeLayoutCache") ? layout.createOfficeLayoutCache() : null;
  let last: ReturnType<typeof layout.layoutOffice> | null = null;
  const batch = (index: number) => {
    const now = observed + index * 500;
    const roots = buildForest(agents.values(), null);
    const groups = groupByWorkspace(roots, workspaces);
    const office = previous ? previous(groups, { width: 25, agents }) : layout.shareOffice(last, layout.layoutOffice(groups, { width: 25, agents }));
    last = office;
    const people = layout.presences(office, agents, crewState, now);
    for (const room of office.rooms) roomArt(room);
    if (office.building) frameArt(office.rooms, office.building.depth);
    const plan = planFeed({ candidates: candidatesOf(roots), current: new Map(), lastWanted: new Map(), now, cap: FEED_CAP });
    return { people: people.size, rooms: office.rooms.length, live: plan.selected.length };
  };
  const coldStart = performance.now();
  const fixture = batch(0);
  const cold = performance.now() - coldStart;
  for (let index = 0; index < 10; index++) batch(index);
  const elapsed: number[] = [];
  const cpu = process.cpuUsage();
  const starting = process.memoryUsage();
  let peak = starting.heapUsed;
  for (let index = 0; index < iterations; index++) {
    const at = performance.now();
    batch(index);
    elapsed.push(performance.now() - at);
    peak = Math.max(peak, process.memoryUsage().heapUsed);
  }
  const usage = process.cpuUsage(cpu);
  elapsed.sort((a, b) => a - b);
  const round = (value: number) => Number(value.toFixed(2));
  console.log(JSON.stringify({ size, ...fixture, coldMs: round(cold), medianMs: round(elapsed[49]!), p95Ms: round(elapsed[94]!),
    cpuMs: round((usage.user + usage.system) / 1000), heapHighMiB: round(peak / 2 ** 20) }));
}
