// Corrected health polling per design §6.1.
//
// The existing App.tsx polled every 30 s while visible but missed the
// `visibilitychange → visible` immediate-fetch path. This module lifts
// the polling out, fixes the gap, and exposes a tiny zustand store so
// ConnectivityBanner + AC-29 inheritance tests subscribe to one source.

import { create } from "zustand";
import { api } from "../api";

const POLL_INTERVAL_MS = 30_000;

export interface HealthState {
  connected: boolean;
  neo4jVersion: string | null;
  stats: { nodes: number; edges: number } | null;
  lastPolledAt: number | null;
  setHealth: (h: { ok: boolean; version?: string }) => void;
  setStats: (s: { nodes: number; edges: number } | null) => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  connected: false,
  neo4jVersion: null,
  stats: null,
  lastPolledAt: null,
  setHealth: (h) => set({
    connected: h.ok,
    neo4jVersion: h.version ?? null,
    lastPolledAt: Date.now(),
  }),
  setStats: (s) => set({ stats: s }),
}));

let pollHandle: ReturnType<typeof setInterval> | null = null;

async function poll(): Promise<void> {
  try {
    const h = await api.healthz();
    useHealthStore.getState().setHealth({ ok: h.ok, version: h.neo4j.version });
  } catch {
    useHealthStore.getState().setHealth({ ok: false });
  }
  try {
    const s = await api.stats();
    const nodes = Object.values(s.nodes).reduce((a, b) => a + b, 0);
    const edges = Object.values(s.edges).reduce((a, b) => a + b, 0);
    useHealthStore.getState().setStats({ nodes, edges });
  } catch {
    // leave last stats untouched; banner falls back to connection state.
  }
}

export function startHealthPolling(): () => void {
  if (typeof window === "undefined") return () => {};
  if (pollHandle !== null) {
    // Already running. Return a no-op stop so multiple mounts are safe.
    return () => {};
  }

  if (document.visibilityState === "visible") {
    void poll();
  }
  pollHandle = setInterval(() => {
    if (document.visibilityState === "visible") {
      void poll();
    }
  }, POLL_INTERVAL_MS);

  const onVisibility = (): void => {
    if (document.visibilityState === "visible") {
      // Immediate fresh fetch on tab return — the fix for the existing
      // App.tsx gap.
      void poll();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onPageShow = (e: PageTransitionEvent): void => {
    // bfcache restore: pages re-mounted via back-forward cache may carry
    // stale React state. Force a fresh poll so the connectivity banner
    // reflects current truth.
    if (e.persisted) {
      void poll();
    }
  };
  window.addEventListener("pageshow", onPageShow);

  return () => {
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
  };
}

// Test-only: lets unit tests run `poll()` deterministically without
// starting the interval timer.
export const _testOnly = { poll };
