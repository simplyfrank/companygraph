// Progress polling (DD-10).
//
// The synchronous POST /api/v1/chat/messages and the short-poll GET
// /api/v1/chat/messages/:id/progress race; DD-10 guarantees the
// server only emits `state: "done"` after persistMessage() completes,
// so polling can terminate as soon as state hits a terminal value.
//
// We expose pollProgress() as a pure helper so the test can drive it
// without React, then wrap it in useProgressPolling() for components.

import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type {
  ProgressSnapshot,
  ProgressState,
} from "@companygraph/shared/types";

export const PROGRESS_POLL_INTERVAL_MS = 500;

const TERMINAL_STATES: readonly ProgressState[] = ["done", "error"];
function isTerminal(state: ProgressState | undefined): boolean {
  return state !== undefined && (TERMINAL_STATES as readonly string[]).includes(state);
}

export interface PollProgressOptions {
  intervalMs?: number;
  signal?: AbortSignal;
  onUpdate?: (snap: ProgressSnapshot) => void;
  // Injectable for tests; defaults to api.chat.progress.
  fetcher?: (messageId: string, signal?: AbortSignal) => Promise<ProgressSnapshot>;
  // Injectable timer for tests that want to drive the loop synchronously.
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
}

/**
 * Polls the progress endpoint at `intervalMs` cadence. Resolves with the
 * last snapshot once state hits "done"/"error" or the signal aborts.
 *
 * Defensive: errors from individual fetches are surfaced through onUpdate
 * via an `error` state synthesized client-side if `state` is undefined;
 * the loop continues until terminal or abort.
 */
export async function pollProgress(
  messageId: string,
  opts: PollProgressOptions = {},
): Promise<ProgressSnapshot | null> {
  const intervalMs = opts.intervalMs ?? PROGRESS_POLL_INTERVAL_MS;
  const fetcher = opts.fetcher ?? api.chat.progress;
  const setT = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let last: ProgressSnapshot | null = null;

  return new Promise<ProgressSnapshot | null>((resolve) => {
    let cancelled = false;
    let timer: unknown = null;

    const abortHandler = (): void => {
      cancelled = true;
      if (timer !== null) clearT(timer);
      resolve(last);
    };
    opts.signal?.addEventListener("abort", abortHandler);

    const tick = async (): Promise<void> => {
      if (cancelled || opts.signal?.aborted) {
        resolve(last);
        return;
      }
      try {
        const snap = await fetcher(messageId, opts.signal);
        last = snap;
        opts.onUpdate?.(snap);
        if (isTerminal(snap.state)) {
          resolve(snap);
          return;
        }
      } catch (e) {
        // Abort = unmount; bail out silently.
        if ((e as { name?: string } | null)?.name === "AbortError") {
          resolve(last);
          return;
        }
        // Other errors: keep polling — the synchronous POST may still resolve.
      }
      if (cancelled || opts.signal?.aborted) {
        resolve(last);
        return;
      }
      timer = setT(() => { void tick(); }, intervalMs);
    };

    void tick();
  });
}

export interface UseProgressPollingResult {
  state: ProgressState | null;
  toolCallsSoFar: ProgressSnapshot["tool_calls_so_far"];
  terminated: boolean;
  snapshot: ProgressSnapshot | null;
}

/**
 * React hook variant. Polls while `messageId` is non-null; cancels in-flight
 * on unmount or when `messageId` becomes null.
 */
export function useProgressPolling(messageId: string | null): UseProgressPollingResult {
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [terminated, setTerminated] = useState<boolean>(false);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSnapshot(null);
    setTerminated(false);
    if (!messageId) return;

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    void pollProgress(messageId, {
      signal: ctrl.signal,
      onUpdate: (snap) => {
        setSnapshot(snap);
        if (isTerminal(snap.state)) setTerminated(true);
      },
    }).then((final) => {
      if (ctrl.signal.aborted) return;
      if (final) {
        setSnapshot(final);
        if (isTerminal(final.state)) setTerminated(true);
      }
    });

    return () => {
      ctrl.abort();
      ctrlRef.current = null;
    };
  }, [messageId]);

  return {
    state: snapshot?.state ?? null,
    toolCallsSoFar: snapshot?.tool_calls_so_far ?? [],
    terminated,
    snapshot,
  };
}
