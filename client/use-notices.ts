import { useEffect, useRef, useState } from "react";
import { crewState, type CrewState } from "./model";
import { agentNotices, appendNotices, EMPTY_NOTICES, taskNotices, type Notice, type NoticeKind } from "./notifications";
import type { Task } from "./operations";
import type { PaseoAgent } from "./paseo-types";

export function useNotices(agents: ReadonlyMap<string, PaseoAgent>, tasks: readonly Task[], connection: boolean | null, shown: boolean) {
  const [log, setLog] = useState(EMPTY_NOTICES);
  const states = useRef(new Map<string, CrewState>());
  const taskStates = useRef(new Map<string, Task["state"]>());
  const online = useRef<boolean | null>(null);
  const connections = useRef(0);

  useEffect(() => {
    if (!shown) return;
    const now = Date.now();
    const current = agentNotices(agents, states.current, now).concat(taskNotices(tasks, taskStates.current, now));
    states.current = new Map([...agents].map(([id, agent]) => [id, crewState(agent)]));
    taskStates.current = new Map(tasks.map((task) => [task.id, task.state]));
    let kind: NoticeKind | null = null;
    if (connection !== null) {
      if (online.current === true && !connection) kind = "lost";
      if (online.current === false && connection) kind = "restored";
      if (online.current !== null || connection) online.current = connection;
    }
    if (kind) current.push({ id: `connection:${++connections.current}`, kind, at: now } satisfies Notice);
    if (current.length) setLog((previous) => appendNotices(previous, current));
  }, [agents, tasks, connection, shown]);
  return log.entries;
}
