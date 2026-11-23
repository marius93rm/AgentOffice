import { activityAt, crewState, type CrewState } from "./model";
import type { PaseoAgent } from "./paseo-types";
import type { Task, TaskSnapshot } from "./operations";
import type { LobbyPreferences } from "../shared/preferences";

export type NoticeKind = "permission" | "error" | "completed" | "blocked" | "lost" | "restored";
export const NOTICE_LABEL: Record<NoticeKind, string> = {
  permission: "Response requested", error: "Agent failed", completed: "Work completed", blocked: "Task blocked",
  lost: "Connection lost", restored: "Connection restored",
};

export interface Notice {
  id: string;
  kind: NoticeKind;
  at: number;
  agentId?: string;
  workspaceId?: string | null;
  requestId?: string;
  origin?: "task";
}

export const isAttention = (kind: NoticeKind) => kind === "permission" || kind === "error" || kind === "blocked" || kind === "lost";
export function canNotify(kind: NoticeKind, preference: LobbyPreferences["notices"]): boolean {
  return preference === "all" || (preference === "attention" && isAttention(kind));
}

export interface NoticeHistory {
  seen: ReadonlySet<string>;
  entries: readonly Notice[];
}
export const EMPTY_NOTICES: NoticeHistory = { seen: new Set(), entries: [] };

export function appendNotices(history: NoticeHistory, candidates: readonly Notice[]): NoticeHistory {
  const unseen = candidates.filter((candidate) => !history.seen.has(candidate.id));
  if (!unseen.length) return history;
  const unique = new Map(unseen.map((item) => [item.id, item]));
  return {
    seen: new Set([...history.seen, ...unique.keys()].slice(-4096)),
    entries: [...history.entries, ...unique.values()].sort((a, b) => a.at - b.at).slice(-100),
  };
}

export function agentNotices(agents: ReadonlyMap<string, PaseoAgent>, previous: ReadonlyMap<string, CrewState>, now: number): Notice[] {
  const notices: Notice[] = [];
  for (const agent of agents.values()) {
    const base = { agentId: agent.id, workspaceId: agent.workspaceId, at: Date.parse(activityAt(agent)) || now };
    for (const request of agent.pendingPermissions) {
      notices.push({ ...base, id: JSON.stringify([agent.id, request.id]), kind: "permission", requestId: request.id });
    }
    const state = crewState(agent);
    if (previous.get(agent.id) === state || (state !== "failed" && state !== "ready")) continue;
    const at = agent.attentionTimestamp ?? agent.updatedAt;
    notices.push({ ...base, id: JSON.stringify([agent.id, state, at]), kind: state === "failed" ? "error" : "completed" });
  }
  return notices;
}

export function scopedTasks(snapshots: ReadonlyMap<string, TaskSnapshot>, agents: ReadonlyMap<string, PaseoAgent>, scope: string | null): Task[] {
  const tasks: Task[] = [];
  for (const [id, snapshot] of snapshots) {
    const agent = agents.get(id);
    if (!agent || (scope !== null && agent.workspaceId !== scope)) continue;
    tasks.push(...snapshot.tasks.map((task) => ({ ...task, workspaceId: agent.workspaceId ?? null })));
  }
  return tasks.sort((a, b) => b.at - a.at);
}

export function taskNotices(tasks: readonly Task[], previous: ReadonlyMap<string, Task["state"]>, now: number): Notice[] {
  return tasks.flatMap((task) => {
    const before = previous.get(task.id);
    const kind = task.state === "blocked" ? "blocked" : task.state === "done" && before ? "completed" : null;
    if (!kind || before === task.state || now - task.at > 30_000) return [];
    return [{ id: JSON.stringify([task.id, task.state, task.at, task.sequence]), kind, origin: "task", at: task.at, agentId: task.agentId, workspaceId: task.workspaceId }];
  });
}
