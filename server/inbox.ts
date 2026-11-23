import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inboxSnapshot, resultDetail, type ResultNotice } from "../shared/inbox";

const RESULT_LIMIT = 500;
const REQUEST_LIMIT = 2_000;

/** Only the latest completion per agent is part of Lobby. Older turns are in Paseo's chat history. */
export function registerInbox(server: PluginServerContext) {
  const results = new Map<string, ResultNotice>();
  const requests = new Map<string, { agentId: string; requestId: string; at: string }>();
  const requestKey = (agentId: string, requestId: string) => JSON.stringify([agentId, requestId]);
  const trim = (entries: Map<string, unknown>, limit: number) => {
    if (entries.size > limit) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  };

  const end = server.on("agent.turn_ended", ({ agent, turnId, outcome, timeline }) => {
    if (outcome.kind !== "completed") return;
    const last = timeline.findLast((item) => item.type === "assistant_message" && item.text.trim());
    const full = last?.type === "assistant_message" ? last.text.trim() : "";
    const at = new Date().toISOString();
    let length = Math.min(full.length, 8_000);
    if (/^[\uD800-\uDBFF]$/.test(full.charAt(length - 1))) length -= 1;
    results.delete(agent.id);
    results.set(agent.id, { agentId: agent.id, at, key: turnId ?? at, text: full.slice(0, length), cut: length < full.length });
    trim(results, RESULT_LIMIT);
  });
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
      results: [...results.values()].filter((result) => known.has(result.agentId)).map((result) => {
        const preview = Array.from(result.text).slice(0, 620).join("");
        return { ...result, text: preview, cut: result.cut || preview.length < result.text.length };
      }),
      requests: [...requests.values()].filter((request) => known.has(request.agentId)),
    };
  });
  server.handle(resultDetail, ({ agentId, key }) => {
    const result = results.get(agentId);
    return result?.key === key ? result : null;
  });
  return () => {
    end();
    ask();
    answer();
  };
}
