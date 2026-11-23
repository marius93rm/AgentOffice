import { useCallback, useEffect, useMemo, useState } from "react";
import type { Notice } from "./notifications";
import type { Operation, Task } from "./operations";
import { dispatchEffects, effectOf, effectsAt, EMPTY_EFFECTS, taskEffects } from "./visual-events";

export function useVisualEffects(notices: readonly Notice[], tasks: readonly Task[], enabled: boolean) {
  const [queue, setQueue] = useState(EMPTY_EFFECTS);
  const [now, setNow] = useState(0);
  const onOperations = useCallback((operations: readonly Operation[], live: boolean) => {
    if (!live || !enabled) return;
    const effects = operations.flatMap((operation) => effectOf(operation) ?? []);
    if (!effects.length) return;
    const at = Date.now();
    setQueue((before) => dispatchEffects(before, effects, at));
    setNow(at);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const at = Date.now();
    const latest = taskEffects(notices, tasks, at);
    if (!latest.length) return;
    setQueue((before) => dispatchEffects(before, latest, at));
    setNow(at);
  }, [notices, tasks, enabled]);

  const visible = useMemo(() => effectsAt(queue, now), [queue, now]);
  useEffect(() => {
    if (!enabled || visible.next === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(20, visible.next - Date.now()));
    return () => clearTimeout(timer);
  }, [visible.next, enabled]);
  return { effects: enabled ? visible.active : [], onOperations };
}
