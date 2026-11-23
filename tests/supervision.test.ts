import { describe, expect, it, vi } from "vitest";
import { DEMO_QUESTION, DEMO_START, demoScenario, demoBubbles } from "../client/demo-model";
import { buildReplay, createJournal, type ReplayEvent } from "../client/replay-model";
import { metricsOf } from "../client/metrics";
import { createPrivacy, privateBubbles, privateExchanges, privateOperations, privateTasks } from "../client/privacy";
import { questionsOf } from "../client/questions";
import { buildForest, crewState, groupByWorkspace } from "../client/model";
import { createOfficeLayoutCache, layoutOffice, presences } from "../client/office-model";
import { officeImage } from "../client/screenshot";
import { ART_THEMES } from "../client/art-themes";
import { agent } from "./fake-daemon";

const iso = (time: number) => new Date(time).toISOString();
const START = Date.UTC(2026, 10, 18, 12);
const live = agent("dev", { title: "Developer", createdAt: iso(START), updatedAt: iso(START), status: "running" });
const on = new Map([[live.id, live]]);

describe("replay", () => {
  it("replays serialized events with stable ties and seeks both directions", () => {
    const journal = createJournal();
    const listen = vi.fn();
    const unsubscribe = journal.subscribe(listen);
    journal.observe(on, START);
    const op = { id: "read", agentId: "dev", kind: "reading", source: "tool", phase: "running", at: START + 5 } as const;
    journal.record([op, op], on);
    journal.observe(new Map([["dev", { ...live, status: "closed" }]]), START + 5);
    journal.observe(new Map(), START + 10);
    expect(listen).toHaveBeenCalledTimes(4);
    unsubscribe();
    const json = JSON.parse(JSON.stringify(journal.getSnapshot())) as ReplayEvent[];
    const replay = buildReplay(json);
    expect(replay.events.map((event) => event.type)).toEqual(["created", "state", "operation", "state", "departed"]);
    expect(replay.seek(replay.countAt(START + 5)).get("dev")?.state).toBe("closed");
    expect(replay.seek(replay.countAt(START + 10)).size).toBe(0);
    expect(replay.seek(replay.countAt(START)).get("dev")?.state).toBe("working");
    expect(buildReplay(json.toReversed()).seek(4)).toEqual(replay.seek(4));
    journal.observe(on, START + 20);
    expect(listen).toHaveBeenCalledTimes(4);
  });

  it("keeps bounded history and reconstructs after a checkpoint", () => {
    const journal = createJournal();
    journal.observe(on, START);
    journal.record(Array.from({ length: 1400 }, (_, index) => ({ id: "op" + index, agentId: "dev",
      kind: "editing", phase: "completed", source: "tool", at: START + index + 3 })), on);
    const model = buildReplay(journal.getSnapshot());
    expect(model.events).toHaveLength(1200);
    expect(model.seek(49).get("dev")?.operation?.id).toBe("op248");
    expect(model.seek(5).get("dev")?.state).toBeNull();
  });
});

describe("metrics and privacy", () => {
  it("distinguishes missing data, an observed zero and a live observed closure", () => {
    const journal = createJournal();
    const closed = { ...live, status: "closed" as const };
    journal.observe(new Map([["dev", closed]]), START + 60_000);
    const unavailable = metricsOf([closed], [], new Map(), journal.getSnapshot(), true, START + 60_000);
    expect(unavailable.find((metric) => metric.id === "tasks")?.value).toBeNull();
    expect(unavailable.find((metric) => metric.id === "sessions")?.value).toBeNull();
    journal.observe(on, START + 65_000);
    journal.observe(new Map([["dev", closed]]), START + 120_000);
    const metrics = metricsOf([closed, closed], [], new Map([["dev", { at: START, tasks: [] }]]), journal.getSnapshot(), true, START + 120_000);
    expect(metrics.find((metric) => metric.id === "total")?.value).toBe(1);
    expect(metrics.find((metric) => metric.id === "tasks")?.value).toBe(0);
    expect(metrics.find((metric) => metric.id === "sessions")?.value).toBe(2);
  });

  it("projects private strings out of all shared display records", () => {
    const secret = "Secret-Project:/Users/account/file";
    const aliases = createPrivacy();
    const hidden = aliases.agent({ ...live, title: secret, cwd: secret, lastError: secret,
      model: secret, labels: { "ghostline/role": secret, incident: secret },
      pendingPermissions: [{ ...DEMO_QUESTION, title: secret, description: secret, input: { secret } }] });
    const bubbles = privateBubbles(new Map([["dev", { agentId: "dev", text: secret, label: secret, fullText: secret, key: "safe",
      at: START, expiresAt: START + 1000, tone: "say" }]]));
    const exchanges = privateExchanges([{ id: "safe", from: "dev", to: "agent", fromTitle: secret, text: secret, event: "message", at: START, expiresAt: START + 1000 }]);
    const operations = privateOperations(new Map([["dev", { kind: "command", source: "tool", phase: "running", agentId: "dev", id: "safe",
      at: START, tool: secret, resource: secret }]]));
    const tasks = privateTasks([{ title: secret, state: "planned", id: "safe", agentId: "dev", workspaceId: "ws-a", at: START, source: "timeline.todo" }]);
    expect(JSON.stringify([hidden, ...bubbles.values(), exchanges, ...operations.values(), tasks])).not.toContain(secret);
    expect(hidden.title).toBe(aliases.agentName(live.id));
    expect(aliases.workspace("hidden-id").name).toBe("Room 01");
    expect(hidden.pendingPermissions[0]?.input).toEqual({});
  });

  it("renders the PNG source from private room captions and scene art", () => {
    const aliases = createPrivacy();
    const office = layoutOffice(groupByWorkspace(buildForest(on.values(), null), new Map()), { width: 17, agents: on });
    const people = presences(office, on, crewState, START, false);
    const request = vi.fn((room: typeof office.rooms[number]) => aliases.workspaceName(room.workspaceId));
    const png = officeImage(ART_THEMES[1], office, people, on, {}, "night", request)!;
    expect(png.width).toBe(office.width * 16);
    expect(png.pixels).toHaveLength(png.width * png.height * 4);
    expect(request).toHaveBeenCalledTimes(1);
    expect(png.pixels.some((value) => value > 0)).toBe(true);
  });
});

describe("demo and efficient geometry", () => {
  it("runs a deterministic offline scenario with six roles, a subagent and a structured question", () => {
    const scenario = demoScenario("recovery");
    expect(demoScenario("recovery")).toEqual(scenario);
    expect(demoScenario("delivery").events).not.toEqual(scenario.events);
    const replay = buildReplay(scenario.events);
    const state = replay.seek(replay.countAt(DEMO_START + scenario.requestAt));
    expect(state.size).toBe(6);
    expect(state.get("demo-researcher")?.actor.parentId).toBe("demo-planner");
    expect(state.get("demo-tester")?.state).toBe("failed");
    expect(state.get("demo-developer")?.state).toBe("needs-input");
    expect(demoBubbles(scenario, scenario.requestAt).get("demo-developer")?.tone).toBe("ask");
    expect(questionsOf(DEMO_QUESTION)).toHaveLength(2);
    expect(questionsOf(DEMO_QUESTION)?.[1]?.multiple).toBe(true);
    expect([...replay.seek(replay.events.length).values()].every((actor) => actor.state === "closed")).toBe(true);
  });

  it("retains the layout for timestamp changes and desks for changes to working status", () => {
    const cached = createOfficeLayoutCache();
    const render = (actor: typeof live) => cached(groupByWorkspace(buildForest([actor], null), new Map()), { width: 18, agents: new Map([[actor.id, actor]]) });
    const first = render(live);
    expect(render({ ...live, updatedAt: iso(START + 1234) })).toBe(first);
    const idle = render({ ...live, status: "idle" });
    expect(idle.desks).toBe(first.desks);
    expect(idle.rooms[0]?.counts.idle).toBe(1);
    expect(render({ ...live, status: "closed" }).desks.size).toBe(0);
  });
});
