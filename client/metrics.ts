import { crewState } from "./model";
import type { PaseoAgent } from "./paseo-types";
import type { Task, TaskSnapshot } from "./operations";
import type { ReplayEvent } from "./replay-model";

export interface Metric {
  id: string;
  label: string;
  value: number | null;
  unit?: "minutes";
  source: string;
}

export function metricsOf(agents: readonly PaseoAgent[], tasks: readonly Task[], snapshots: ReadonlyMap<string, TaskSnapshot>,
  events: readonly ReplayEvent[], loaded: boolean, now: number): Metric[] {
  const selected = new Map(agents.map((agent) => [agent.id, agent]));
  let working = 0, idle = 0, errors = 0, closed = 0;
  let runningSince = -Infinity;
  const pending = new Set<string>();
  for (const agent of selected.values()) {
    const state = crewState(agent);
    if (state === "working") working++;
    if (state === "idle" || state === "ready") idle++;
    if (state === "failed") errors++;
    if (state === "closed") closed++;
    if (state === "working" && agent.activeTurn?.startedAt) {
      const started = Date.parse(agent.activeTurn.startedAt);
      if (started <= now) runningSince = Math.max(runningSince, started);
    }
    for (const request of agent.pendingPermissions) pending.add(JSON.stringify([agent.id, request.id]));
  }
  const boardCoverage = [...selected.keys()].filter((id) => snapshots.has(id)).length;
  const sessions = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "state" || event.state !== "closed" || !event.transition || !selected.has(event.actor.id) || sessions.has(event.actor.id)) continue;
    const created = Date.parse(event.actor.createdAt);
    if (created > 0 && event.at >= created) sessions.set(event.actor.id, (event.at - created) / 60_000);
  }
  const directory = "Paseo agent directory";
  const stat = (id: string, label: string, value: number): Metric => ({ id, label, value: loaded ? value : null, source: directory });
  return [
    stat("total", "Agents", selected.size), stat("working", "Working", working), stat("idle", "Inactive", idle),
    stat("error", "In error", errors), stat("closed", "Closed", closed),
    { id: "permissions", label: "Pending responses", value: loaded ? pending.size : null, source: "Paseo pending permissions and questions" },
    { id: "tasks", label: "Completed tasks observed", value: boardCoverage ? new Set(tasks.filter((task) => selected.has(task.agentId) && task.state === "done").map((task) => task.id)).size : null,
      source: `Structured task updates · ${boardCoverage} of ${selected.size} agents` },
    { id: "active-turn", label: "Newest active turn", value: runningSince > 0 ? (now - runningSince) / 60_000 : null, unit: "minutes", source: "Paseo active turn start time" },
    { id: "sessions", label: "Mean observed session span", value: sessions.size > 0 ? [...sessions.values()].reduce((a, b) => a + b, 0) / sessions.size : null,
      unit: "minutes", source: `Creation to live observation of closure · ${sessions.size} sessions` },
  ];
}
