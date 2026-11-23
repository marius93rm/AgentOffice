import type { Operation, Task } from "./operations";
import type { Notice } from "./notifications";

export type EffectKind = "completed" | "tests-passed" | "tests-failed" | "message" | "error";
export interface EffectCandidate { id: string; kind: EffectKind; agentId: string; at: number }
export interface VisualEffect extends EffectCandidate { endsAt: number; startsAt: number }
export interface EffectQueue { seen: ReadonlySet<string>; items: readonly VisualEffect[] }

export const EMPTY_EFFECTS: EffectQueue = { seen: new Set(), items: [] };
export const EFFECT_LABEL: Record<EffectKind, string> = {
  completed: "Task completed", "tests-passed": "Tests passed", "tests-failed": "Tests failed",
  message: "Agent message received", error: "Turn failed",
};
const DURATION = 2200;
const COOLDOWN = 12_000;

export function effectOf(operation: Operation): EffectCandidate | null {
  let kind: EffectKind | null = null;
  if (operation.kind === "testing" && operation.phase !== "running" && operation.phase !== "canceled" && operation.exitCode !== undefined) {
    kind = operation.exitCode === 0 && operation.phase === "completed" ? "tests-passed" : "tests-failed";
  }
  if (operation.source === "message" && "from" in operation) kind = "message";
  if (operation.source === "turn" && operation.kind === "error") kind = "error";
  return kind ? { id: JSON.stringify([operation.agentId, operation.source, operation.id, kind]), kind, agentId: operation.agentId, at: operation.at } : null;
}

export function taskEffects(notices: readonly Notice[], tasks: readonly Task[], now: number): EffectCandidate[] {
  return notices.flatMap((notice) => {
    if (notice.origin !== "task" || notice.kind !== "completed" || !notice.agentId || now - notice.at > 5000
      || !tasks.some((task) => task.agentId === notice.agentId && task.at === notice.at && task.state === "done")) return [];
    return [{ id: notice.id, at: notice.at, kind: "completed", agentId: notice.agentId }];
  });
}

export function dispatchEffects(queue: EffectQueue, events: readonly EffectCandidate[], now: number): EffectQueue {
  if (!events.length) return queue;
  const seen = new Set(queue.seen);
  const recent = queue.items.filter((effect) => effect.endsAt + COOLDOWN > now);
  for (const event of events) {
    if (seen.has(event.id) || now - event.at > 5000 || event.at > now) continue;
    seen.add(event.id);
    if (recent.some((item) => item.agentId === event.agentId && item.kind === event.kind && item.endsAt + COOLDOWN > now)) continue;
    const onDeck = recent.filter((item) => item.endsAt > now);
    if (onDeck.length >= 6) continue;
    const lane = onDeck.length < 2 ? now : onDeck.at(-2)!.endsAt;
    const agent = onDeck.findLast((item) => item.agentId === event.agentId)?.endsAt ?? now;
    const startsAt = Math.max(now, lane, agent);
    recent.push({ ...event, startsAt, endsAt: startsAt + DURATION });
    recent.sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt);
  }
  return { seen: new Set([...seen].slice(-1000)), items: recent };
}

export function effectsAt(queue: EffectQueue, now: number): { active: readonly VisualEffect[]; next: number | null } {
  const next = queue.items.reduce((at, effect) => Math.min(at, effect.startsAt > now ? effect.startsAt : effect.endsAt > now ? effect.endsAt : Infinity), Infinity);
  return { active: queue.items.filter((effect) => effect.startsAt <= now && effect.endsAt > now), next: next === Infinity ? null : next };
}
