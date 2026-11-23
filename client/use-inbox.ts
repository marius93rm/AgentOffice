import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inboxSnapshot, type ResultNotice } from "../shared/inbox";
import { completionInbox } from "../shared/preferences";
import { advanceReadMarkers, classifyResults, inboxTimestamp as timestamp, permissionKey, type InboxStatus } from "./inbox-model";
import { activityAt } from "./model";
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
const emptyNotices: Record<string, ResultNotice> = Object.create(null);
const emptyRead: Record<string, string> = Object.create(null);

export function useInbox(agents: ReadonlyMap<string, PaseoAgent>, {
  shown, online, directoryPhase,
}: {
  shown: boolean;
  online: boolean | null;
  directoryPhase: "loading" | "ready" | "error";
}) {
  const load = useRpc(inboxSnapshot);
  const settings = useSettings(completionInbox);
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const snapshot = loaded?.snapshot;
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  // A streaming agent update does not change the inbox. Refresh when requests or results actually change.
  const signature = useMemo(() => JSON.stringify([...agents.values()].map((agent) => [
    agent.id,
    agent.attentionReason === "finished" ? activityAt(agent) : "",
    agent.pendingPermissions.map((request) => request.id),
  ])), [agents]);
  useEffect(() => {
    if (!shown || online === false || directoryPhase !== "ready") return;
    let live = true;
    const entries = JSON.parse(signature) as Array<[string, string, string[]]>;
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
  const resultsStatus: InboxStatus = status.phase === "ready"
    && (settings.status !== "ready" || settings.saveError !== null) ? {
      ...status, phase: settings.status === "loading" ? "loading" : "error",
    } : status;

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
  const observed = settings.status === "ready" ? settings.values.observed : emptyNotices;
  const read = settings.status === "ready" ? settings.values.read : emptyRead;

  const notices = useMemo(() => {
    const byAgent = new Map(Object.entries(observed));
    for (const result of snapshot?.results ?? []) {
      const agent = agents.get(result.agentId);
      // Preserve the daemon snapshot timestamp when it represents the same completion.
      const at = agent?.attentionReason === "finished" ? activityAt(agent) : result.at;
      const canonical = Math.abs(timestamp(at) - timestamp(result.at)) < 3_000 ? { ...result, at } : result;
      const prior = byAgent.get(result.agentId);
      if (!prior || prior.key === result.key || timestamp(prior.at) <= timestamp(canonical.at)) byAgent.set(result.agentId, canonical);
    }
    for (const agent of agents.values()) {
      if (agent.attentionReason !== "finished") continue;
      const at = activityAt(agent);
      const other = byAgent.get(agent.id);
      if (!other || timestamp(at) > timestamp(other.at)) {
        byAgent.set(agent.id, { agentId: agent.id, at, key: at, text: "", cut: false });
      }
    }
    return byAgent;
  }, [agents, observed, snapshot]);
  const { unread, seen } = useMemo(() => classifyResults(notices.values(), read, agents), [notices, read, agents]);

  // Save the latest observed completion per agent, so leaving the workspace or restarting does not clear its result.
  // A conflicting writer wins its revision and this view retries when it receives the new document.
  const attempted = useRef("");
  useEffect(() => {
    if (!shown || settings.status !== "ready" || settings.saving || !snapshot) return;
    const delta = snapshot.results.filter((result) => result.key === notices.get(result.agentId)?.key && observed[result.agentId]?.key !== result.key);
    if (delta.length === 0) return;
    const attempt = JSON.stringify([settings.revision, ...delta.map((result) => [result.agentId, result.key])]);
    if (attempted.current === attempt) return;
    attempted.current = attempt;
    const records = { ...observed };
    for (const result of delta) records[result.agentId] = notices.get(result.agentId)!;
    const retained = Object.entries(records).sort((a, b) => timestamp(b[1].at) - timestamp(a[1].at)).slice(0, 250);
    void settings.save({ ...settings.values, observed: Object.fromEntries(retained) }, settings.revision);
  }, [notices, observed, settings, shown, snapshot]);

  const markRead = async (result: ResultNotice, body: string) => {
    if (settings.status !== "ready" || settings.saving) return false;
    const records = { ...settings.values.observed };
    const other = notices.get(result.agentId);
    if (other?.key === result.key) {
      const preview = result.text || Array.from(body).slice(0, 620).join("");
      records[result.agentId] = { ...result, text: preview, cut: result.cut || preview.length < body.length };
    }
    return settings.save({
      observed: records,
      read: advanceReadMarkers(settings.values.read, [result]),
    }, settings.revision);
  };

  const markAllRead = async (displayed: readonly ResultNotice[]) => {
    if (displayed.length === 0) return true;
    if (settings.status !== "ready" || settings.saving) return false;
    const saved = await settings.save({
      ...settings.values,
      read: advanceReadMarkers(settings.values.read, displayed),
    }, settings.revision);
    if (!saved) await settings.reload();
    return saved;
  };

  return {
    pending, acknowledge, notices, unread, seen, status, resultsStatus, markRead, markAllRead,
    reload: () => {
      reload();
      if (settings.status !== "ready" || settings.saveError) void settings.reload();
    },
    saving: settings.saving,
    canSave: settings.status === "ready",
    error: settings.saveError,
  };
}
