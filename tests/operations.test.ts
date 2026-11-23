import { describe, expect, it } from "vitest";
import { EMPTY_FEED, eventsFromHistory, eventsFromStream, mergeTaskSnapshot, operationExpiry, reduceFeed, type TimelineItemLike } from "../client/exchanges";
import { activeOperation, isTestCommand, operationTitle, tasksOf } from "../client/operations";
import { agentNotices, appendNotices, EMPTY_NOTICES, scopedTasks, taskNotices } from "../client/notifications";
import { agent } from "./fake-daemon";

const timeline = (item: TimelineItemLike, seq: number, at: number) => eventsFromStream({ agentId: "a", seq, event: { type: "timeline", item } }, at);
const tool = (id: string, type: string, status: string, fields = {}) => ({ type: "tool_call", callId: id, name: "Tool", status, detail: { type, ...fields } });

describe("observed activities", () => {
  it("uses structured detail and expires, finishes or falls back for unknown tools", () => {
    let model = reduceFeed(EMPTY_FEED, timeline(tool("read", "read", "running", { filePath: "/one/two/file.ts" }), 1, 100), 100);
    const op = model.latest.get("a");
    expect(op).toMatchObject({ kind: "reading", resource: "two/file.ts", source: "tool" });
    expect(activeOperation(op, "working", true, 200)).toBe("reading");
    expect(activeOperation(op, "needs-input", true, 200)).toBeNull();
    expect(activeOperation(op, "working", false, 200)).toBeNull();
    expect(activeOperation(op, "working", true, 31_000)).toBeNull();
    model = reduceFeed(model, [...timeline(tool("edit", "edit", "running"), 2, 300), ...timeline(tool("read", "read", "completed"), 3, 400)], 400);
    expect(model.running.get("a")?.map((op) => op.kind)).toEqual(["editing"]);
    model = reduceFeed(model, eventsFromStream({ agentId: "a", event: { type: "turn_canceled" } }, 500), 500);
    expect(model.running.has("a")).toBe(false);
    model = reduceFeed(model, timeline(tool("unknown", "unknown", "running"), 4, 600), 600);
    expect(model.latest.get("a")?.kind).toBe("tool");
    expect(operationExpiry(model, 601)).toBe(30_600);
  });

  it("reports test outcomes only when a recognized test command carries a real exit status", () => {
    expect(isTestCommand("npm run test -- --runInBand")).toBe(true);
    expect(isTestCommand("npm run test:integration")).toBe(false);
    expect(isTestCommand("npm test || true")).toBe(false);
    expect(isTestCommand("echo pytest")).toBe(false);
    const result = (exitCode?: number) => reduceFeed(EMPTY_FEED, timeline(tool("c", "shell", "completed", { command: "pytest -q", exitCode }), 1, 200), 200).latest.get("a")!;
    expect(operationTitle(result(0))).toBe("Tests passed");
    expect(result(1).phase).toBe("failed");
    expect(operationTitle(result(1))).toBe("Tests failed");
    expect(operationTitle(result())).toBe("Running tests");
  });
});

describe("task board and notification history", () => {
  it("uses structured snapshots, handles older pages, removes items and respects workspace", () => {
    expect(tasksOf(["create a task"], "a", 5)).toBeNull();
    const update = { type: "todo", items: [{ id: "t", text: "Read it", status: "in_progress" }] };
    const later = { type: "todo", items: [{ id: "t", text: "Read it", completed: true }] };
    const agents = new Map([["a", agent("a")]]);
    let model = reduceFeed(EMPTY_FEED, timeline(later, 6, 1000), 1000);
    const delayed = eventsFromHistory("a", [{ item: update, timestamp: new Date(900).toISOString(), seqEnd: 5 }], 1100);
    model = reduceFeed(model, delayed, 1100);
    const list = scopedTasks(model.tasks, agents, "ws-a");
    expect(list).toMatchObject([{ state: "done", source: "timeline.todo", sequence: 6 }]);
    expect(scopedTasks(model.tasks, agents, "other")).toEqual([]);
    const notices = taskNotices(list, new Map([[list[0]!.id, "working"]]), 1200);
    expect(notices).toMatchObject([{ kind: "completed", agentId: "a" }]);
    model = reduceFeed(model, timeline({ type: "todo", items: [] }, 7, 1200), 1200);
    expect(scopedTasks(model.tasks, agents, null)).toEqual([]);
  });

  it("deduplicates permissions and repeated agent errors", () => {
    const agents = new Map([["a", agent("a", { status: "error", updatedAt: "2026-11-01T00:00:00Z" })]]);
    const initial = agentNotices(agents, new Map(), 100);
    expect(initial).toMatchObject([{ kind: "error", agentId: "a" }]);
    expect(agentNotices(agents, new Map([["a", "failed"]]), 101)).toEqual([]);
    const log = appendNotices(EMPTY_NOTICES, initial.concat(initial));
    expect(log.entries).toHaveLength(1);
    expect(appendNotices(log, initial)).toBe(log);
  });

  it("merges an on-demand board read without consuming the live cursor", () => {
    let model = reduceFeed(EMPTY_FEED, timeline(tool("read", "read", "running"), 7, 100), 100);
    const found = tasksOf([{ id: "task", text: "Ready", completed: true }], "a", 220, 12)!;
    model = mergeTaskSnapshot(model, "a", { at: 220, sequence: 12, tasks: found });
    expect(model.cursors.get("a")).toBe(7);
    const old = mergeTaskSnapshot(model, "a", { at: 600, sequence: 8, tasks: [] });
    expect(old).toBe(model);
  });
});
