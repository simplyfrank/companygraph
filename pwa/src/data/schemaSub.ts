// Schema subscription state machine per design §4.4.
//
// Wraps the browser `EventSource` with a 3-strike-in-60s fallback to a
// 5-minute poll loop. While in POLL-MODE the layer retries opening
// a fresh `EventSource` every 30 minutes; on success it returns to
// SSE-CONNECTED and the poll loop stops.

import { useSchemaStore } from "../store/schemaStore";

export type SubState = "idle" | "sse-connected" | "poll-mode";

interface Options {
  url?: string;
  pollIntervalMs?: number;
  sseRetryIntervalMs?: number;
  strikeWindowMs?: number;
  strikeThreshold?: number;
  // For tests: provide a custom EventSource constructor.
  EventSourceCtor?: typeof EventSource;
}

interface SubHandle {
  stop: () => void;
  state: () => SubState;
}

export function startSchemaSubscription(opts: Options = {}): SubHandle {
  const url = opts.url ?? "/api/v1/ontology/events";
  const pollIntervalMs = opts.pollIntervalMs ?? 5 * 60 * 1000;
  const sseRetryIntervalMs = opts.sseRetryIntervalMs ?? 30 * 60 * 1000;
  const strikeWindowMs = opts.strikeWindowMs ?? 60 * 1000;
  const strikeThreshold = opts.strikeThreshold ?? 3;
  const ESCtor =
    opts.EventSourceCtor ??
    (typeof EventSource !== "undefined" ? EventSource : undefined);

  let state: SubState = "idle";
  let es: EventSource | null = null;
  let strikes: number[] = [];
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let sseRetryHandle: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function openSse(): void {
    if (!ESCtor) {
      // No EventSource available — go straight to poll mode.
      enterPollMode();
      return;
    }
    try {
      es = new ESCtor(url);
    } catch {
      enterPollMode();
      return;
    }
    es.onopen = () => {
      state = "sse-connected";
      strikes = [];
      stopPolling();
      clearSseRetry();
    };
    es.onmessage = (ev) => {
      // ontology.changed events arrive as default-typed messages or
      // typed via `event: ontology.changed`. Either way: invalidate.
      void ev;
      useSchemaStore.getState().invalidate();
      void useSchemaStore.getState().refresh();
    };
    es.addEventListener("ontology.changed", () => {
      useSchemaStore.getState().invalidate();
      void useSchemaStore.getState().refresh();
    });
    es.onerror = () => {
      const now = Date.now();
      strikes = strikes.filter((t) => now - t < strikeWindowMs);
      strikes.push(now);
      if (strikes.length >= strikeThreshold) {
        closeSse();
        enterPollMode();
      }
      // else: rely on EventSource's built-in auto-reconnect.
    };
  }

  function closeSse(): void {
    if (es) {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      es = null;
    }
  }

  function enterPollMode(): void {
    if (stopped) return;
    state = "poll-mode";
    stopPolling();
    pollHandle = setInterval(() => {
      void useSchemaStore.getState().refresh();
    }, pollIntervalMs);
    scheduleSseRetry();
  }

  function stopPolling(): void {
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  function scheduleSseRetry(): void {
    clearSseRetry();
    sseRetryHandle = setTimeout(() => {
      if (stopped) return;
      openSse();
    }, sseRetryIntervalMs);
  }

  function clearSseRetry(): void {
    if (sseRetryHandle !== null) {
      clearTimeout(sseRetryHandle);
      sseRetryHandle = null;
    }
  }

  // Boot.
  openSse();

  return {
    stop: () => {
      stopped = true;
      closeSse();
      stopPolling();
      clearSseRetry();
      state = "idle";
    },
    state: () => state,
  };
}
