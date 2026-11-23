import type { ResultNotice } from "../shared/inbox";

type ResultStamp = Pick<ResultNotice, "agentId" | "at">;

export const inboxTimestamp = (value?: string | null): number => Date.parse(value ?? "") || 0;

export function inInboxRoom(workspaceId: string | null | undefined, room: string | null): boolean {
  return room === null || (workspaceId ?? "") === room;
}

export const permissionKey = (agentId: string, requestId: string) => JSON.stringify([agentId, requestId]);

export function nextPermissionOrder(keys: readonly string[], current: string): string[] {
  const index = keys.indexOf(current);
  return index < 0 ? [...keys] : [...keys.slice(index + 1), ...keys.slice(0, index)];
}

export type InboxPhase = "loading" | "ready" | "error" | "offline";
export interface InboxStatus {
  phase: InboxPhase;
  updatedAt: number | null;
}

export function isUnreadResult(read: Readonly<Record<string, string>>, result: ResultStamp): boolean {
  return inboxTimestamp(result.at) > inboxTimestamp(read[result.agentId]);
}

export function classifyResults(
  results: Iterable<ResultNotice>,
  read: Readonly<Record<string, string>>,
  knownAgents: { has(id: string): boolean },
): { unread: ResultNotice[]; seen: ResultNotice[] } {
  const unread: ResultNotice[] = [];
  const seen: ResultNotice[] = [];
  for (const result of results) {
    if (!knownAgents.has(result.agentId)) continue;
    (isUnreadResult(read, result) ? unread : seen).push(result);
  }
  const latestFirst = (a: ResultNotice, b: ResultNotice) => inboxTimestamp(b.at) - inboxTimestamp(a.at) || a.agentId.localeCompare(b.agentId);
  return { unread: unread.sort(latestFirst), seen: seen.sort(latestFirst) };
}

/** A read advances only as far as the result that was on screen when the user acted. */
export function advanceReadMarkers(read: Record<string, string>, results: readonly ResultStamp[]): Record<string, string> {
  const next = new Map(Object.entries(read));
  for (const result of results) {
    if (inboxTimestamp(result.at) > inboxTimestamp(next.get(result.agentId))) {
      next.set(result.agentId, result.at);
    }
  }
  return Object.fromEntries(next);
}
