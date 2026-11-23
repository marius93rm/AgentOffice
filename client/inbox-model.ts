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
