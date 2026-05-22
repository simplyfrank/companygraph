// AC-32 (client side) — progress polling cadence + termination.
//
// We drive `pollProgress` with a stub fetcher and a synchronous
// timer so the test runs deterministically (no real 500ms waits).
// The hook (`useProgressPolling`) wraps the same function; the
// React-specific wiring is excluded from this test to avoid pulling
// in React Testing Library (per the task constraints).

import { describe, test, expect } from "bun:test";

import {
  pollProgress,
  PROGRESS_POLL_INTERVAL_MS,
} from "../../src/views/chat/useProgressPolling";
import type { ProgressSnapshot } from "@companygraph/shared/types";

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

interface SyncTimer {
  setTimeoutFn: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn: (h: unknown) => void;
  flush: () => Promise<void>;
  delays: number[];
}

function syncTimer(): SyncTimer {
  const queue: Array<{ fn: () => void; id: number }> = [];
  const delays: number[] = [];
  let nextId = 1;
  return {
    setTimeoutFn: (fn, ms) => {
      delays.push(ms);
      const id = nextId++;
      queue.push({ fn, id });
      return id;
    },
    clearTimeoutFn: (h) => {
      const i = queue.findIndex((q) => q.id === h);
      if (i >= 0) queue.splice(i, 1);
    },
    flush: async () => {
      // Yield first so the initial `void tick()` microtask runs and
      // either schedules a follow-up or resolves the outer promise.
      await Promise.resolve();
      await Promise.resolve();
      while (queue.length > 0) {
        const next = queue.shift()!;
        next.fn();
        // Yield microtasks so the async fetcher chain settles and any
        // follow-up tick gets a chance to enqueue before we re-check.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
    delays,
  };
}

function snap(overrides: Partial<ProgressSnapshot>): ProgressSnapshot {
  return {
    message_id: "m1",
    conversation_id: "c1",
    state: "llm_call",
    tool_calls_so_far: [],
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe("pollProgress — cadence + termination", () => {
  test("default poll interval is 500ms", () => {
    expect(PROGRESS_POLL_INTERVAL_MS).toBe(500);
  });

  test("terminates on state: 'done' without scheduling another poll", async () => {
    const timer = syncTimer();
    const updates: ProgressSnapshot[] = [];

    const fetcher = (() => {
      let calls = 0;
      return async () => {
        calls += 1;
        if (calls === 1) return snap({ state: "tool:list_domains" });
        return snap({ state: "done" });
      };
    })();

    const p = pollProgress("m1", {
      fetcher,
      onUpdate: (s) => updates.push(s),
      setTimeoutFn: timer.setTimeoutFn,
      clearTimeoutFn: timer.clearTimeoutFn,
    });

    // First tick runs immediately; after the non-terminal result it
    // schedules the next. Flushing runs the scheduled callback,
    // which fetches the terminal snapshot and resolves the promise.
    await timer.flush();
    const final = await p;

    expect(updates.length).toBe(2);
    expect(updates[0]?.state).toBe("tool:list_domains");
    expect(updates[1]?.state).toBe("done");
    expect(final?.state).toBe("done");
    // Exactly one delay was scheduled (between the two fetches).
    expect(timer.delays).toEqual([500]);
  });

  test("terminates on state: 'error'", async () => {
    const timer = syncTimer();
    const fetcher = async () =>
      snap({ state: "error", error: { code: "chat:llm_provider_error", message: "boom" } });

    const final = await pollProgress("m1", {
      fetcher,
      setTimeoutFn: timer.setTimeoutFn,
      clearTimeoutFn: timer.clearTimeoutFn,
    });

    expect(final?.state).toBe("error");
    expect(timer.delays).toEqual([]);  // no follow-up scheduled
  });

  test("uses 500ms cadence between non-terminal polls", async () => {
    const timer = syncTimer();
    let calls = 0;
    const fetcher = async (): Promise<ProgressSnapshot> => {
      calls += 1;
      if (calls < 3) return snap({ state: "llm_call" });
      return snap({ state: "done" });
    };

    const p = pollProgress("m1", {
      fetcher,
      setTimeoutFn: timer.setTimeoutFn,
      clearTimeoutFn: timer.clearTimeoutFn,
    });
    await timer.flush();
    await p;

    // 2 non-terminal results → 2 scheduled delays at 500ms each.
    expect(timer.delays).toEqual([500, 500]);
    expect(calls).toBe(3);
  });

  test("aborts mid-flight via AbortController signal", async () => {
    const timer = syncTimer();
    const ctrl = new AbortController();

    const fetcher = async (_id: string, signal?: AbortSignal): Promise<ProgressSnapshot> => {
      if (signal?.aborted) {
        const err = new Error("aborted");
        (err as Error & { name: string }).name = "AbortError";
        throw err;
      }
      return snap({ state: "llm_call" });
    };

    const p = pollProgress("m1", {
      fetcher,
      signal: ctrl.signal,
      setTimeoutFn: timer.setTimeoutFn,
      clearTimeoutFn: timer.clearTimeoutFn,
    });

    // Abort before flushing any scheduled callbacks.
    ctrl.abort();
    await timer.flush();
    const final = await p;

    // Aborted polls resolve with the last seen snapshot (which may be
    // the first non-terminal one if a fetch completed before abort).
    expect(final === null || final.state === "llm_call").toBe(true);
  });

  test("idempotency: terminal snapshot resolves the promise once", async () => {
    const timer = syncTimer();
    const fetcher = async () => snap({ state: "done" });
    let resolveCount = 0;
    const p = pollProgress("m1", {
      fetcher,
      setTimeoutFn: timer.setTimeoutFn,
      clearTimeoutFn: timer.clearTimeoutFn,
    }).then((s) => {
      resolveCount += 1;
      return s;
    });
    await timer.flush();
    await p;
    expect(resolveCount).toBe(1);
  });
});
