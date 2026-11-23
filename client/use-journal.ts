import { useEffect, useMemo } from "react";
import { createJournal, type Journal } from "./replay-model";
import type { PaseoAgent, PaseoApi } from "./paseo-types";

const stores = new WeakMap<PaseoApi, Journal>();
export function useJournal(paseo: PaseoApi, agents: ReadonlyMap<string, PaseoAgent>, observing: boolean) {
  const journal = useMemo(() => {
    const known = stores.get(paseo);
    if (known) return known;
    const created = createJournal();
    stores.set(paseo, created);
    return created;
  }, [paseo]);
  useEffect(() => {
    if (observing) journal.observe(agents, Date.now());
  }, [journal, agents, observing]);
  return journal;
}
