import { formatAge, type CrewState } from "./model";
import { oneLine, toolSummary } from "./tool-activity";

export type ToolPhase = "running" | "completed" | "failed" | "canceled";
export type ActivityKind = "reading" | "editing" | "searching" | "command" | "testing" | "planning" | "messaging" | "permission" | "error" | "completion" | "tool";

export interface Operation {
  id: string;
  agentId: string;
  kind: ActivityKind;
  at: number;
  phase: ToolPhase;
  source: "tool" | "todo" | "message" | "turn" | "permission";
  tool?: string;
  resource?: string;
  /** An actual shell exit code. Tool completion alone is not proof that tests passed. */
  exitCode?: number;
  from?: string | null;
}

export interface Task {
  id: string;
  title: string;
  state: "planned" | "working" | "done" | "blocked";
  agentId: string;
  workspaceId: string | null;
  at: number;
  source: "timeline.todo";
  sequence?: number;
}

export type TimelineTask = Omit<Task, "workspaceId">;
export interface TaskSnapshot { at: number; sequence?: number; tasks: readonly TimelineTask[] }

const VALID_TEST_COMMAND = /^(?:(?:npm|pnpm|yarn|bun) (?:run )?test|(?:npx |pnpm exec |bunx )?(?:vitest|jest|pytest)|cargo test|go test)(?:\s|$)/;
export function isTestCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  const trimmed = command.trim();
  return VALID_TEST_COMMAND.test(trimmed) && !/[\n\r;|&<>]/.test(trimmed);
}

const TOOL_KINDS: Readonly<Record<string, ActivityKind>> = {
  read: "reading", edit: "editing", write: "editing", search: "searching", fetch: "searching", plan: "planning",
};

export function operationOfTool(
  agentId: string, callId: string, tool: string, detail: unknown, phase: ToolPhase, at: number,
): Operation {
  const data = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const type = typeof data.type === "string" ? data.type : "";
  const kind = type === "shell" ? isTestCommand(data.command) ? "testing" : "command" : TOOL_KINDS[type] ?? "tool";
  const exitCode = typeof data.exitCode === "number" && Number.isInteger(data.exitCode) ? data.exitCode : undefined;
  const failed = exitCode !== undefined && exitCode !== 0 && phase === "completed";
  return {
    id: callId, agentId, kind, at, phase: failed ? "failed" : phase, source: "tool",
    tool, resource: toolSummary(detail) || undefined, exitCode,
  };
}

export function tasksOf(raw: unknown, agentId: string, at: number, sequence?: number): TimelineTask[] | null {
  if (!Array.isArray(raw)) return null;
  const mapped = new Map<string, TimelineTask>();
  const occurrences = new Map<number, number>();
  raw.slice(0, 100).forEach((value) => {
    if (!value || typeof value !== "object") return;
    const task = value as Record<string, unknown>;
    const title = oneLine(task.text, 240);
    if (!title) return;
    let fingerprint = 2166136261;
    for (const unit of title) fingerprint = Math.imul(fingerprint ^ unit.codePointAt(0)!, 16777619);
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
    occurrences.set(fingerprint, occurrence);
    const id = typeof task.id === "string" && task.id ? `id:${task.id}` : `text:${fingerprint >>> 0}:${occurrence}`;
    const state = task.status === "in_progress" ? "working" : task.status === "blocked" ? "blocked" : task.status === "pending" ? "planned"
      : task.status === "completed" || task.completed === true ? "done" : "planned";
    mapped.set(id, { id: JSON.stringify([agentId, id]), title, state, agentId, at, source: "timeline.todo", sequence });
  });
  // An empty list really clears the board. A non-empty malformed list conveys no update.
  return raw.length > 0 && mapped.size === 0 ? null : [...mapped.values()];
}

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  reading: "Reading", editing: "Editing", searching: "Searching", command: "Running a command",
  testing: "Running tests", planning: "Planning", messaging: "Message", permission: "Waiting for you",
  error: "Error", completion: "Completed", tool: "Tool call",
};

export function operationTitle(operation: Operation): string {
  if (operation.kind === "testing" && operation.exitCode !== undefined && operation.phase !== "running"
    && operation.phase !== "canceled") return operation.exitCode === 0 && operation.phase === "completed" ? "Tests passed" : "Tests failed";
  return ACTIVITY_LABEL[operation.kind];
}

export const OPERATION_PHASE: Record<ToolPhase, string> = {
  running: "In progress", completed: "Finished", failed: "Failed", canceled: "Canceled",
};

export function operationSummary(operation: Operation | undefined, live: boolean, now: number, fallbackAt?: string) {
  const operationAt = operation && Number.isFinite(operation.at) && operation.at > 0 ? new Date(operation.at).toISOString() : null;
  const fallbackTime = fallbackAt && Number.isFinite(Date.parse(fallbackAt)) ? fallbackAt : null;
  const iso = operationAt ?? fallbackTime;
  const age = iso ? formatAge(iso, now) : null;
  const title = operation ? operationTitle(operation) : "Activity details unavailable";
  const freshness = live ? "Live timeline" : operationAt ? "Last observed" : fallbackTime ? "Agent update" : null;
  const label = operation?.phase === "running" || !operation ? title
    : [title, OPERATION_PHASE[operation.phase]].join(" · ");
  return { label, freshness: [freshness, age === "now" ? "just now" : age ? age + " ago" : null].filter(Boolean).join(" · "), iso };
}

export const ACTIVITY_TTL = 30_000;
export function operationDeadline(operation: Operation | undefined): number | null {
  if (!operation) return null;
  if (operation.kind === "error") return operation.at + 3000;
  if (operation.kind === "completion") return operation.at + 2000;
  if (operation.kind === "messaging") return operation.at + 4000;
  return operation.source === "tool" && operation.phase === "running" ? operation.at + ACTIVITY_TTL : null;
}

export function activeOperation(operation: Operation | undefined, state: CrewState, live: boolean, now: number): ActivityKind | null {
  const end = operationDeadline(operation);
  if (!operation || !live || end === null || now < operation.at || now >= end) return null;
  if (operation.kind === "error") return state === "failed" ? "error" : null;
  if (operation.kind === "completion") return state === "ready" ? "completion" : null;
  if (state !== "working") return null;
  return operation.kind;
}
