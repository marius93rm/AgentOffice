import { PARENT_LABEL, ROLE_LABEL } from "./model";
import type { Bubble, Exchange } from "./exchanges";
import { normalizeRole } from "./roles";
import { isQuestion } from "./questions";
import type { Operation, Task } from "./operations";
import type { PaseoAgent, PaseoWorkspace } from "./paseo-types";
import type { PaseoApi } from "./paseo-types";
import type { ReplayActor } from "./replay-model";

export function createPrivacy() {
  const agents = new Map<string, string>();
  const workspaces = new Map<string, string>();
  const name = (table: Map<string, string>, key: string, label: string) => {
    const existing = table.get(key);
    if (existing) return existing;
    const alias = label + " " + String(table.size + 1).padStart(2, "0");
    table.set(key, alias);
    return alias;
  };
  const agentName = (id: string) => name(agents, id, "Agent");
  const workspaceName = (id: string) => name(workspaces, id, "Room");
  return {
    agentName, workspaceName,
    agent(agent: PaseoAgent): PaseoAgent {
      const parent = agent.labels[PARENT_LABEL];
      const role = normalizeRole(agent.labels[ROLE_LABEL]);
      return {
        id: agent.id, workspaceId: agent.workspaceId, title: agentName(agent.id), provider: "Paseo", cwd: "", model: null,
        status: agent.status, createdAt: agent.createdAt, updatedAt: agent.updatedAt, lastUserMessageAt: null,
        requiresAttention: agent.requiresAttention, attentionReason: agent.attentionReason, attentionTimestamp: agent.attentionTimestamp,
        archivedAt: agent.archivedAt, currentModeId: null, availableModes: [], capabilities: agent.capabilities, persistence: null,
        labels: { ...(parent ? { [PARENT_LABEL]: parent } : {}), ...(role !== "agent" ? { [ROLE_LABEL]: role } : {}) },
        pendingPermissions: agent.pendingPermissions.map((request) => {
          const question = isQuestion(request);
          return { id: request.id, provider: request.provider, kind: question ? "question" as const : "tool" as const,
            name: question ? "Question" : "Permission", title: question ? "Question pending" : "Permission pending", input: {} };
        }),
      };
    },
    workspace(id: string): PaseoWorkspace {
      return { id, projectDisplayName: "", name: workspaceName(id) } as PaseoWorkspace;
    },
    replayActor(actor: ReplayActor): ReplayActor {
      return { ...actor, title: agentName(actor.id) };
    },
  };
}

const aliasesByConnection = new WeakMap<PaseoApi, ReturnType<typeof createPrivacy>>();
export function privacyFor(paseo: PaseoApi) {
  const existing = aliasesByConnection.get(paseo);
  if (existing) return existing;
  const aliases = createPrivacy();
  aliasesByConnection.set(paseo, aliases);
  return aliases;
}

const BUBBLE_LABEL: Record<Bubble["tone"], string> = { say: "Reply", tool: "Tool", tell: "Message", ask: "Needs you", alert: "Error" };
export function privateBubbles(items: ReadonlyMap<string, Bubble>): ReadonlyMap<string, Bubble> {
  return new Map([...items].map(([id, bubble]) => {
    const label = BUBBLE_LABEL[bubble.tone];
    return [id, { ...bubble, text: label, label, fullText: undefined }];
  }));
}
export function privateExchanges(items: readonly Exchange[]): readonly Exchange[] {
  return items.map((item) => ({ ...item, fromTitle: null, text: "Agent message" }));
}
export function privateOperations(items: ReadonlyMap<string, Operation>): ReadonlyMap<string, Operation> {
  return new Map([...items].map(([id, operation]) => [id, { ...operation, tool: undefined, resource: undefined }]));
}
export function privateTasks(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => ({ ...task, title: "Task" }));
}
