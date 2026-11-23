import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { inboxSnapshot } from "../shared/inbox";
import { inboxTimestamp as timestamp, permissionKey, type InboxStatus } from "./inbox-model";
import type { PaseoAgent, PaseoRequest } from "./paseo-types";

export interface PendingRequest {
  agent: PaseoAgent;
  request: PaseoRequest;
  at: string | null;
}

type Snapshot = Awaited<ReturnType<ReturnType<typeof useRpc<typeof inboxSnapshot.input, typeof inboxSnapshot.output>>>>;
interface LoadState {
  signature: string;
  refresh: number;
  failed: boolean;
  snapshot: Snapshot | null;
  updatedAt: number | null;
}

export function useInbox(agents: ReadonlyMap<string, PaseoAgent>, {
  shown, online, directoryPhase,
}: {
  shown: boolean;
  online: boolean | null;
  directoryPhase: "loading" | "ready" | "error";
}) {
  const load = useRpc(inboxSnapshot);
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const snapshot = loaded?.snapshot;
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  const signature = useMemo(() => JSON.stringify([...agents.values()].map((agent) => [
    agent.id,
    agent.pendingPermissions.map((request) => request.id),
  ])), [agents]);

  useEffect(() => {
    if (!shown || online === false || directoryPhase !== "ready") return;
    let live = true;
    const entries = JSON.parse(signature) as Array<[string, string[]]>;
    const receive = (snapshot: Snapshot | null) => {
      if (live) setLoaded({ signature, refresh, failed: false, snapshot, updatedAt: Date.now() });
    };
    if (entries.length === 0) {
      receive(null);
      return;
    }
    void load({ agentIds: entries.map(([id]) => id) }).then(receive).catch(() => {
      if (live) setLoaded((previous) => ({
        signature, refresh, failed: true, snapshot: previous?.snapshot ?? null, updatedAt: previous?.updatedAt ?? null,
      }));
    });
    return () => { live = false; };
  }, [load, refresh, shown, signature, online, directoryPhase]);

  const settled = loaded?.signature === signature && loaded.refresh === refresh;
  const status: InboxStatus = {
    phase: online === false ? "offline" : directoryPhase === "error" || (settled && loaded.failed) ? "error"
      : directoryPhase === "loading" || !settled ? "loading" : "ready",
    updatedAt: loaded?.updatedAt ?? null,
  };

  const reportedPending = useMemo(() => {
    const times = new Map(snapshot?.requests.map((item) => [permissionKey(item.agentId, item.requestId), item.at]));
    return [...agents.values()].flatMap((agent): PendingRequest[] => agent.pendingPermissions.map((request) => ({
      agent, request,
      at: times.get(permissionKey(agent.id, request.id))
        ?? (agent.attentionReason === "permission" ? agent.attentionTimestamp ?? null : null),
    }))).sort((a, b) => (timestamp(a.at) || Infinity) - (timestamp(b.at) || Infinity) || a.agent.id.localeCompare(b.agent.id));
  }, [agents, snapshot]);
  useEffect(() => {
    if (acknowledged.size === 0) return;
    const liveKeys = new Set(reportedPending.map(({ agent, request }) => permissionKey(agent.id, request.id)));
    setAcknowledged((current) => {
      const retained = new Set([...current].filter((key) => liveKeys.has(key)));
      return retained.size === current.size ? current : retained;
    });
  }, [reportedPending, acknowledged.size]);
  const pending = useMemo(() => reportedPending.filter(({ agent, request }) => !acknowledged.has(permissionKey(agent.id, request.id))),
    [reportedPending, acknowledged]);
  const acknowledge = useCallback((agentId: string, requestId: string) => {
    setAcknowledged((current) => new Set(current).add(permissionKey(agentId, requestId)));
  }, []);

  return { pending, acknowledge, status, reload };
}
