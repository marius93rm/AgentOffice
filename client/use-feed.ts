import type { PaseoAgentTimelineEvent, PaseoApi } from "./paseo-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_FEED,
  eventsFromHistory,
  eventsFromStream,
  mergeTaskSnapshot,
  operationOfEvent,
  operationExpiry,
  reduceFeed,
  retainAgents,
  visibleFeed,
  type Bubble,
  type Exchange,
  type FeedEvent,
  type FeedState,
} from "./exchanges";
import type { Operation, TaskSnapshot } from "./operations";
import { hubFor, type FeedHub } from "./feed-hub";
import { FEED_CAP, FEED_RETRY_MS, isWanted, planFeed, type FeedCandidate } from "./feed-plan";

/** Stream chunks arrive many times a second; the view hears about them this often. */
const FLUSH_MS = 150;
/**
 * What a new subscription reads of the past. A busy agent writes more than a handful of items
 * inside the lifetime of a bubble or a message, and a room scrolled into view has to show them.
 */
const BACKFILL_LIMIT = 20;
interface Subscription { since: number; stop: () => void; ready: boolean; page: number }

export interface Feed {
  /** agentId → the bubble over its head right now. */
  bubbles: ReadonlyMap<string, Bubble>;
  /** Messages in flight between agents right now, oldest first. */
  exchanges: readonly Exchange[];
  /** The agents this view has a live timeline for; everyone else is state only. */
  live: ReadonlySet<string>;
  latest: ReadonlyMap<string, Operation>;
  running: ReadonlyMap<string, readonly Operation[]>;
  tasks: ReadonlyMap<string, TaskSnapshot>;
  now: number;
  readTasks: (agentId: string) => Promise<"found" | "empty" | "error">;
}

export interface FeedOptions {
  /** False releases every subscription, e.g. while the list view is showing. Defaults to true. */
  enabled?: boolean;
  cap?: number;
  known?: ReadonlySet<string>;
  connected?: boolean;
  onEvents?: (operations: readonly Operation[], live: boolean) => void;
}

/** Every mounted Lobby view on this connection, bubbles and chat alike, draws on the same budget. */
export function timelineHub(paseo: PaseoApi): FeedHub<PaseoAgentTimelineEvent> {
  return hubFor<PaseoAgentTimelineEvent>(paseo, () => ({
    subscribe(agentId, handler) {
      const stop = paseo.agents.ref(agentId).timeline.subscribe(handler);
      return { stop: () => stop(), ready: stop.ready };
    },
  }));
}

/**
 * Live bubbles and exchanges for the agents a view is showing. Pass the agents
 * of the visible room; `planFeed` picks which of them this view wants, and the
 * hub grants them out of one budget shared by every mounted view.
 */
export function useFeed(paseo: PaseoApi, candidates: readonly FeedCandidate[], options?: FeedOptions): Feed {
  const enabled = options?.enabled ?? true;
  const connected = options?.connected ?? true;
  const cap = options?.cap ?? FEED_CAP;
  const [feed, setFeed] = useState<FeedState>(EMPTY_FEED);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<ReadonlySet<string>>(() => new Set());

  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const settings = useRef({ enabled, cap, connected, known: options?.known, onEvents: options?.onEvents });
  settings.current = { enabled, cap, connected, known: options?.known, onEvents: options?.onEvents };
  const sync = useRef<() => void>(() => {});
  const feedLife = useRef<number | null>(null);
  const lifeCount = useRef(0);
  const readTasks = useCallback(async (agentId: string) => {
    const life = feedLife.current;
    if (life === null || !settings.current.connected) return "error";
    try {
      const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 80, projection: "projected" });
      if (feedLife.current !== life) return "error";
      if (settings.current.known && !settings.current.known.has(agentId)) return "error";
      const at = Date.now();
      const latest = eventsFromHistory(agentId, page.entries, at).findLast((event) => event.kind === "tasks");
      if (!latest) return "empty";
      setFeed((previous) => mergeTaskSnapshot(previous, agentId, latest.snapshot));
      setNow(at);
      return "found";
    } catch {
      return "error";
    }
  }, [paseo]);

  useEffect(() => {
    feedLife.current = ++lifeCount.current;
    let alive = true;
    const hub = timelineHub(paseo);
    const view = {};
    const subscriptions = new Map<string, Subscription>();
    const lastWanted = new Map<string, number>();
    const failed = new Map<string, number>();
    let pending: FeedEvent[] = [];
    let observed: Operation[] = [];
    let history: Operation[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let recheckTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      const events = pending;
      pending = [];
      const at = Date.now();
      if (history.length) settings.current.onEvents?.(history, false);
      if (observed.length) settings.current.onEvents?.(observed, true);
      observed = [];
      history = [];
      setNow(at);
      setFeed((current) => reduceFeed(current, events, at));
    };
    const enqueue = (events: FeedEvent[], live = true, recordedAt?: number, humanMessage?: Operation) => {
      if (!alive || (events.length === 0 && !humanMessage)) return;
      pending.push(...events);
      const log = live ? observed : history;
      if (humanMessage) log.push(humanMessage);
      for (const event of events) {
        const operation = operationOfEvent(event);
        if (operation && operation.at) log.push(recordedAt ? { ...operation, at: recordedAt } : operation);
      }
      flushTimer ??= setTimeout(flush, FLUSH_MS);
    };

    const reportLive = () => {
      const ids = new Set([...subscriptions].filter(([, entry]) => entry.ready).map(([id]) => id));
      setLive((previous) => previous.size === ids.size && [...ids].every((id) => previous.has(id)) ? previous : ids);
    };

    const backfill = (agentId: string, entry: Subscription) => {
      const request = ++entry.page;
      void paseo.agents
        .ref(agentId)
        .timeline.refetch({ direction: "tail", limit: BACKFILL_LIMIT, projection: "projected" })
        .then((page) => {
          if (subscriptions.get(agentId) === entry && request === entry.page) enqueue(eventsFromHistory(agentId, page.entries, Date.now()), false);
        })
        .catch(() => {});
    };

    const open = (agentId: string, rank: number) => {
      const entry: Subscription = { since: Date.now(), stop: () => {}, ready: false, page: 0 };
      const claim = {
        view,
        rank,
        // Another view was owed the slot. Ask again later; by then this view is at its share or the other has left.
        onRevoked() {
          if (subscriptions.get(agentId) !== entry) return;
          subscriptions.delete(agentId);
          failed.set(agentId, Date.now());
          sync.current();
        },
      };
      const lease = hub.acquire(agentId, (update) => {
        if (subscriptions.get(agentId) !== entry) return;
        switch (update.event.type) {
          case "error":
            // The SDK has already released the subscription.
            subscriptions.delete(agentId);
            failed.set(agentId, Date.now());
            sync.current();
            return;
          case "subscription_restored":
            entry.ready = true;
            reportLive();
            backfill(agentId, entry);
            return;
          case "replacement":
            enqueue(eventsFromStream(update, Date.now()));
            backfill(agentId, entry);
            return;
          default:
            {
              const receivedAt = Date.now();
              const stamped = "timestamp" in update && typeof update.timestamp === "string" ? Date.parse(update.timestamp) : NaN;
              const at = Number.isFinite(stamped) ? Math.min(stamped, receivedAt) : receivedAt;
              const item = update.event.type === "timeline" ? update.event.item : undefined;
              const id = item?.type === "user_message" ? item.messageId ?? item.clientMessageId : undefined;
              const humanMessage: Operation | undefined = id
                ? { id, agentId, kind: "messaging", phase: "completed", source: "message", at }
                : undefined;
              enqueue(eventsFromStream(update, receivedAt), true, at, humanMessage);
            }
        }
      }, claim);
      if (!lease) {
        // The plugin-wide budget is spent, or the daemon refused: ask again after the retry delay.
        failed.set(agentId, Date.now());
        return;
      }
      entry.stop = lease.release;
      subscriptions.set(agentId, entry);
      // Live delivery only starts once the daemon confirms; what came before is history.
      void lease.ready.then(() => {
        if (subscriptions.get(agentId) !== entry) return;
        entry.ready = true;
        reportLive();
        backfill(agentId, entry);
      }).catch(() => {
        if (subscriptions.get(agentId) !== entry) return;
        subscriptions.delete(agentId);
        entry.stop();
        failed.set(agentId, Date.now());
        sync.current();
      });
    };

    sync.current = () => {
      if (!alive) return;
      if (recheckTimer) clearTimeout(recheckTimer);
      recheckTimer = null;
      const at = Date.now();
      const online = settings.current.enabled && settings.current.connected;
      const visible = online ? candidatesRef.current : [];
      for (const candidate of visible) {
        if (subscriptions.has(candidate.id) && isWanted(candidate.state)) lastWanted.set(candidate.id, at);
      }
      const plan = planFeed({
        candidates: visible,
        current: new Map([...subscriptions].map(([id, entry]) => [id, entry.since])),
        lastWanted,
        failed,
        now: at,
        // Disabled means released now, not after the linger.
        cap: online ? settings.current.cap : 0,
      });
      for (const id of plan.unsubscribe) {
        subscriptions.get(id)?.stop();
        subscriptions.delete(id);
        lastWanted.delete(id);
      }
      for (const id of plan.subscribe) open(id, plan.selected.indexOf(id));
      // A refused agent is not in this plan's recheck; come back for it after the retry delay.
      const refused = plan.subscribe.some((id) => !subscriptions.has(id));
      const recheckAt = Math.min(plan.recheckAt ?? Infinity, refused ? at + FEED_RETRY_MS : Infinity);
      if (Number.isFinite(recheckAt)) {
        recheckTimer = setTimeout(() => sync.current(), Math.max(50, recheckAt - at));
      }
      const keep = new Set([...visible.map((candidate) => candidate.id), ...subscriptions.keys()]);
      setFeed((current) => retainAgents(current, keep, settings.current.known));
      reportLive();
    };
    sync.current();

    return () => {
      alive = false;
      feedLife.current = null;
      sync.current = () => {};
      if (flushTimer) clearTimeout(flushTimer);
      if (recheckTimer) clearTimeout(recheckTimer);
      for (const entry of subscriptions.values()) entry.stop();
      subscriptions.clear();
    };
  }, [paseo]);

  // States and membership decide the plan; activity timestamps alone do not re-run it.
  const signature = candidates.map((candidate) => `${candidate.id}:${candidate.state}`).join("|");
  useEffect(() => {
    sync.current();
  }, [signature, enabled, cap, connected, options?.known]);

  const visible = useMemo(() => visibleFeed(feed, now), [feed, now]);
  const nextExpiry = Math.min(visible.nextExpiry ?? Infinity, operationExpiry(feed, now) ?? Infinity);
  useEffect(() => {
    if (!enabled || !Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => {
      const at = Date.now();
      setNow(at);
      setFeed((current) => reduceFeed(current, [], at));
    }, Math.max(50, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [nextExpiry, enabled]);

  return useMemo(
    () => ({ bubbles: visible.bubbles, exchanges: visible.exchanges, live, latest: feed.latest,
      running: feed.running, tasks: feed.tasks, now, readTasks }),
    [visible, live, feed.latest, feed.running, feed.tasks, now, readTasks],
  );
}
