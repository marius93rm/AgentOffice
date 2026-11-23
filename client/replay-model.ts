import { crewState, displayTitle, PARENT_LABEL, parentAgentId, ROLE_LABEL, type CrewState } from "./model";
import { normalizeRole, type LobbyRole } from "./roles";
import { operationTitle, type Operation } from "./operations";
import type { PaseoAgent } from "./paseo-types";

export interface ReplayActor {
  id: string;
  title: string;
  workspaceId?: string;
  parentId?: string;
  role: LobbyRole;
  createdAt: string;
}
type ReplayAction = { type: "created" } | { type: "departed" } | { type: "state"; state: CrewState; transition?: boolean } | { type: "operation"; operation: Operation };
export type EventDraft = { key: string; actor: ReplayActor; at: number } & ReplayAction;
export type ReplayEvent = EventDraft & { order: number };

export interface ReplayPresence {
  actor: ReplayActor;
  at: number;
  state: CrewState | null;
  operation?: Operation;
}

export const JOURNAL_LIMIT = 1200;
const LANDMARK = 32;

export function replayActor(agent: PaseoAgent): ReplayActor {
  return {
    id: agent.id, title: displayTitle(agent), workspaceId: agent.workspaceId,
    parentId: parentAgentId(agent) ?? undefined, role: normalizeRole(agent.labels[ROLE_LABEL]), createdAt: agent.createdAt,
  };
}

export function operationEvent(actor: ReplayActor, operation: Operation): EventDraft {
  return { key: JSON.stringify([actor.id, operation.source, operation.id, operation.phase]), actor, at: operation.at,
    type: "operation", operation };
}

export interface Journal {
  observe(agents: ReadonlyMap<string, PaseoAgent>, at: number): void;
  record(operations: readonly Operation[], agents: ReadonlyMap<string, PaseoAgent>): void;
  getSnapshot(): readonly ReplayEvent[];
  subscribe(listener: () => void): () => void;
}

export function createJournal(): Journal {
  let events: readonly ReplayEvent[] = [];
  let order = 0;
  let previous = new Map<string, { actor: ReplayActor; state: CrewState }>();
  const listeners = new Set<() => void>();
  const publish = (drafts: readonly EventDraft[]) => {
    if (!drafts.length) return;
    const added = new Map<string, ReplayEvent>();
    const existing = new Set(events.map((event) => event.key));
    for (const draft of drafts) {
      if (!Number.isFinite(draft.at) || existing.has(draft.key) || added.has(draft.key)) continue;
      added.set(draft.key, { ...draft, order: ++order });
    }
    if (!added.size) return;
    events = [...events, ...added.values()].sort(byTime).slice(-JOURNAL_LIMIT);
    for (const listener of listeners) listener();
  };
  return {
    observe(agents, at) {
      const drafts: EventDraft[] = [];
      const next = new Map<string, { actor: ReplayActor; state: CrewState }>();
      for (const agent of agents.values()) {
        const actor = replayActor(agent);
        const state = crewState(agent);
        const before = previous.get(actor.id);
        next.set(actor.id, { actor, state });
        const key = JSON.stringify([actor.id, at]);
        const createdAt = Date.parse(actor.createdAt);
        if (!before && Number.isFinite(createdAt) && createdAt <= at) {
          drafts.push({ key: JSON.stringify(["created", actor.id, createdAt]), actor, at: createdAt, type: "created" });
        }
        if (before?.state !== state || before?.actor.workspaceId !== actor.workspaceId || before?.actor.title !== actor.title
          || before?.actor.role !== actor.role || before?.actor.parentId !== actor.parentId) {
          drafts.push({ key: key + ":state:" + state, actor, at, type: "state", state, transition: Boolean(before && before.state !== state) });
        }
      }
      for (const [id, before] of previous) {
        if (!next.has(id)) drafts.push({ key: JSON.stringify([id, at, "departed"]), actor: before.actor, at, type: "departed" });
      }
      previous = next;
      publish(drafts);
    },
    record(operations, agents) {
      publish(operations.flatMap((operation) => {
        const agent = agents.get(operation.agentId);
        return agent ? [operationEvent(replayActor(agent), operation)] : [];
      }));
    },
    getSnapshot: () => events,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const byTime = (a: ReplayEvent, b: ReplayEvent) => a.at - b.at || a.order - b.order;

function apply(actors: Map<string, ReplayPresence>, event: ReplayEvent): void {
  const before = actors.get(event.actor.id);
  const actor = event.actor;
  switch (event.type) {
    case "created":
      if (!before) actors.set(actor.id, { actor, at: event.at, state: null });
      break;
    case "departed":
      actors.delete(actor.id);
      break;
    case "state":
      actors.set(actor.id, { actor, at: event.at, state: event.state,
        ...(before?.state === event.state ? { operation: before.operation } : {}) });
      break;
    case "operation":
      actors.set(actor.id, { actor, at: event.at, state: before?.state ?? null, operation: event.operation });
      break;
  }
}

export function buildReplay(source: readonly ReplayEvent[]) {
  const events = [...source].sort(byTime);
  const start = events[0]?.at ?? 0;
  const end = events.at(-1)?.at ?? start;
  const checkpoints: Array<ReadonlyMap<string, ReplayPresence>> = [new Map()];
  const actors = new Map<string, ReplayPresence>();
  events.forEach((event, index) => {
    apply(actors, event);
    if ((index + 1) % LANDMARK === 0) checkpoints.push(new Map(actors));
  });
  const countAt = (time: number) => {
    let low = 0;
    let high = events.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (events[mid]!.at <= time) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return {
    events, start, end, countAt,
    seek(count: number) {
      const offset = Math.min(events.length, Math.max(0, Math.floor(count) || 0));
      const checkpoint = Math.floor(offset / LANDMARK);
      const state = new Map(checkpoints[checkpoint]!);
      for (let index = checkpoint * LANDMARK; index < offset; index++) apply(state, events[index]!);
      return state;
    },
  };
}

export function replayLabel(event: ReplayEvent): string {
  if (event.type === "created") return "Agent created";
  if (event.type === "departed") return "Agent left the directory";
  if (event.type === "state") return ({ idle: "Idle", closed: "Closed", working: "Working", failed: "Error", ready: "Completed", "needs-input": "Waiting for a response" })[event.state];
  if (event.operation.source === "permission") return event.operation.phase === "running" ? "Response requested" : "Request resolved";
  return operationTitle(event.operation);
}

const NO_CAPABILITIES = {
  supportsStreaming: false, supportsSessionPersistence: false, supportsDynamicModes: false,
  supportsMcpServers: false, supportsReasoningStream: false, supportsToolInvocations: false,
};

/** A read-only actor with an observed state, used by the existing office renderer. */
export function sceneActor(entry: ReplayPresence): PaseoAgent | null {
  if (entry.state === null) return null;
  const { actor, state, at } = entry;
  return {
    id: actor.id, title: actor.title, createdAt: actor.createdAt, updatedAt: new Date(at).toISOString(),
    workspaceId: actor.workspaceId, provider: "lobby", cwd: "", model: null, lastUserMessageAt: null,
    currentModeId: null, availableModes: [], pendingPermissions: [], capabilities: NO_CAPABILITIES, persistence: null,
    status: state === "working" ? "running" : state === "failed" ? "error" : state === "closed" ? "closed" : "idle",
    ...(state === "ready" || state === "needs-input" ? {
      requiresAttention: true, attentionReason: state === "ready" ? "finished" : "permission",
      attentionTimestamp: new Date(at).toISOString(),
    } : {}),
    labels: { [ROLE_LABEL]: actor.role, ...(actor.parentId ? { [PARENT_LABEL]: actor.parentId } : {}) },
  };
}
