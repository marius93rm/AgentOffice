import type { ChatItem } from "./chat-model";
import type { Bubble, Exchange } from "./exchanges";
import type { CrewState } from "./model";
import type { Operation, ActivityKind } from "./operations";
import type { PaseoRequest, PaseoWorkspace } from "./paseo-types";
import { operationEvent, type EventDraft, type ReplayActor, type ReplayEvent } from "./replay-model";
import type { LobbyRole } from "./roles";

export const DEMO_START = Date.UTC(2026, 10, 18, 10);
export const DEMO_ROOM = "demo-studio";
export const DEMO_WORKSPACES = new Map([[DEMO_ROOM, { id: DEMO_ROOM, name: "Studio", projectDisplayName: "Demo" } as PaseoWorkspace]]);
const titles = ["Mira", "Dario", "Rina", "Sofia", "Toni", "Iris"];
const roles: LobbyRole[] = ["planner", "developer", "reviewer", "security", "tester", "researcher"];

export const DEMO_QUESTION: PaseoRequest = {
  id: "demo-question", provider: "codex", kind: "question", name: "request_user_input", title: "Choose the details",
  input: { questions: [{
    header: "Studio", question: "Quale dettaglio aggiungiamo allo studio?",
    options: [{ label: "Lampada", description: "Una luce calda vicino alla scrivania." },
      { label: "Poster", description: "Un tocco di colore sulla parete." }, { label: "Pianta", description: "Un angolo più verde." }],
  }, {
    header: "Test", question: "Quali controlli includiamo?", isMultiSelect: true,
    options: [{ label: "Layout", description: "Controlla la mappa." }, { label: "Chat", description: "Controlla la leggibilità." }],
  }] },
};

export interface DemoScenario {
  id: "delivery" | "recovery";
  label: string;
  events: readonly ReplayEvent[];
  narrative: readonly { at: number; text: string }[];
  requestAt: number;
  resumeAt: number;
}

export function demoScenario(id: DemoScenario["id"]): DemoScenario {
  const recovery = id === "recovery";
  const actors: ReplayActor[] = roles.map((role, index) => ({
    id: "demo-" + role, title: titles[index]!, role, workspaceId: DEMO_ROOM,
    createdAt: new Date(DEMO_START + (index === 5 ? 3400 : 850 + index * 550)).toISOString(),
    ...(index === 5 ? { parentId: "demo-planner" } : {}),
  }));
  const events: ReplayEvent[] = [];
  const narrative: { at: number; text: string }[] = [{ at: 0, text: "The studio is ready." }];
  const add = (draft: EventDraft) => events.push({ ...draft, order: events.length });
  const status = (index: number, time: number, state: CrewState) => {
    const actor = actors[index]!;
    add({ key: [actor.id, time, state].join(":"), actor, type: "state", state, at: DEMO_START + time });
  };
  const action = (index: number, time: number, name: string, kind: ActivityKind, fields: Partial<Operation> = {}) => {
    const actor = actors[index]!;
    add(operationEvent(actor, { id: name, agentId: actor.id, kind, phase: "running", source: "tool", at: DEMO_START + time, ...fields }));
  };
  actors.forEach((actor, index) => {
    const at = Date.parse(actor.createdAt);
    add({ key: "created:" + actor.id, actor, at, type: "created" });
    status(index, at - DEMO_START, "working");
  });
  narrative.push({ at: 850, text: "Mira opens the office." }, { at: 3400, text: "Iris joins as Mira’s subagent." });
  action(0, 1300, "plan", "planning");
  action(1, 4030, "edit", "editing");
  action(2, 4650, "review", "reading");
  action(3, 4920, "lookup", "searching");
  action(4, 5320, "tests", "testing");
  action(5, 5430, "read", "reading");
  narrative.push({ at: 4000, text: "The team plans, reads and edits in parallel." });
  action(1, 8050, "feedback", "messaging", { source: "message", phase: "completed", from: "demo-reviewer" });
  narrative.push({ at: 8050, text: "Rina sends a review to Dario." });
  const requestAt = recovery ? 12_800 : 10_600;
  status(1, requestAt, "needs-input");
  action(1, requestAt, DEMO_QUESTION.id, "permission", { source: "permission" });
  narrative.push({ at: requestAt, text: "Dario is waiting for a response." });
  const resumeAt = requestAt + 1850;
  status(1, resumeAt, "working");
  narrative.push({ at: resumeAt, text: "Dario applies the selected details." });
  action(1, resumeAt, DEMO_QUESTION.id, "permission", { phase: "completed", source: "permission" });
  action(1, resumeAt + 250, "terminal", "command");
  if (recovery) {
    action(4, 9000, "tests", "testing", { exitCode: 1, phase: "failed" });
    status(4, 9300, "failed");
    action(4, 9300, "failed", "error", { source: "turn", phase: "failed" });
    narrative.push({ at: 9300, text: "Toni reports a failed test run." });
    status(4, resumeAt + 1100, "working");
    action(4, resumeAt + 1400, "retry", "testing");
    narrative.push({ at: resumeAt + 1100, text: "Toni resumes work and retries the tests." });
  }
  const done = resumeAt + 3650;
  action(4, done - 400, recovery ? "retry" : "tests", "testing", { exitCode: 0, phase: "completed" });
  for (let index = 0; index < actors.length; index++) {
    status(index, done + index * 260, "ready");
    action(index, done + index * 260, "complete", "completion", { source: "turn", phase: "completed" });
    status(index, done + 5100 + index * 350, "closed");
  }
  narrative.push({ at: done, text: "The tests pass and the team finishes." }, { at: done + 2600, text: "The team takes a break." },
    { at: done + 5100, text: "The team closes its sessions." });
  return { id, label: recovery ? "Test recovery" : "Office delivery", events, narrative: narrative.sort((a, b) => a.at - b.at), requestAt, resumeAt };
}

export function demoExchange(offset: number): Exchange[] {
  if (offset < 8050 || offset >= 10_100) return [];
  return [{ id: "demo-feedback", from: "demo-reviewer", to: "demo-developer", event: "message", fromTitle: "Rina",
    text: "Review ready", at: DEMO_START + 8050, expiresAt: DEMO_START + 10100 }];
}

export function demoBubbles(scenario: DemoScenario, offset: number): ReadonlyMap<string, Bubble> {
  const bubbles = new Map<string, Bubble>();
  if (offset >= scenario.requestAt && offset < scenario.resumeAt) {
    bubbles.set("demo-developer", { key: DEMO_QUESTION.id, agentId: "demo-developer", tone: "ask", text: "Una scelta?", label: DEMO_QUESTION.title!,
      at: DEMO_START + scenario.requestAt, expiresAt: DEMO_START + scenario.resumeAt });
  }
  return bubbles;
}

export const DEMO_CHAT: readonly ChatItem[] = [
  { kind: "user", key: "u1", text: "Controlla l’ufficio e prepara il riepilogo.", cut: false },
  { kind: "assistant", key: "a1", text: "Ho controllato le stanze. La mini mappa resta leggibile anche con la chat aperta.\n\n---\n\nOra verifico il modulo delle domande.", cut: false },
  { kind: "tool", key: "t1", callId: "t1", status: "completed", word: "Read", label: "Read", summary: "demo/room.ts" },
  { kind: "tool", key: "t2", callId: "t2", status: "completed", word: "Test", label: "Tests", summary: "Layout and chat" },
  { kind: "message", key: "m1", event: "message", fromTitle: "Rina", text: "Revisione del layout completata.", cut: false },
  { kind: "assistant", key: "a2", text: "Il riepilogo è pronto. La squadra può passare alla prossima attività.", cut: false },
];
