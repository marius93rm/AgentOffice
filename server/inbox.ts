import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inboxSnapshot } from "../shared/inbox";

const REQUEST_LIMIT = 2_000;

export function registerInbox(server: PluginServerContext) {
  const requests = new Map<string, { agentId: string; requestId: string; at: string }>();
  const requestKey = (agentId: string, requestId: string) => JSON.stringify([agentId, requestId]);
  const trim = (entries: Map<string, unknown>, limit: number) => {
    if (entries.size > limit) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  };

  const ask = server.on("agent.permission_requested", ({ agent, request }) => {
    const key = requestKey(agent.id, request.id);
    if (!requests.has(key)) requests.set(key, { agentId: agent.id, requestId: request.id, at: new Date().toISOString() });
    trim(requests, REQUEST_LIMIT);
  });
  const answer = server.on("agent.permission_resolved", ({ agent, requestId }) => {
    requests.delete(requestKey(agent.id, requestId));
  });
  server.handle(inboxSnapshot, ({ agentIds }) => {
    const known = new Set(agentIds);
    return {
      requests: [...requests.values()].filter((request) => known.has(request.agentId)),
    };
  });
  return () => {
    ask();
    answer();
  };
}
