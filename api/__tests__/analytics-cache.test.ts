// T-01 — analytics precompute cache (FR-10, DD-06/DD-10/DD-12).
//
// Verifies (per tasks.md T-01 Verification):
//   (a) init a temp ANALYTICS_DB_PATH → the 5 cache tables exist and the DB
//       file is DISTINCT from the chat DB path (NFR-R1 isolation).
//   (b) a fresh run (last_run_at = now) → withCacheEnvelope(body) omits `degraded`.
//   (c) a stale run (last_run_at = now − 26 h) → withCacheEnvelope(body) adds
//       `degraded:true` + `last_run_at`.
//   (d) write 8 runs then pruneSnapshots() → the oldest run's nodes_json/
//       edges_json are cleared and the latest 7 remain intact (DD-12, N=7).
//
// This is a pure-SQLite suite (no Neo4j) → runs under `bun test` (unit).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  SNAPSHOT_RETENTION,
  closeAnalyticsDb,
  getAnalyticsDb,
  getAnalyticsDbPath,
  getRun,
  initAnalyticsDb,
  pruneSnapshots,
  resetAnalyticsDbForTest,
  withCacheEnvelope,
  writeRun,
  type SnapshotEdge,
  type SnapshotNode,
  type WriteRunInput,
} from "../src/analytics/reporting/cache";

const H = 60 * 60 * 1000;

let tmpDir = "";
let dbPath = "";
let prevEnv: string | undefined;

function makeNodes(n: number): SnapshotNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `node-${i}`,
    label: "Activity",
    attributes: { k: i },
    updatedAt: "2026-07-04T00:00:00.000Z",
  }));
}

function makeEdges(n: number): SnapshotEdge[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `edge-${i}`,
    type: "PRECEDES",
    fromId: `node-${i}`,
    toId: `node-${i + 1}`,
    attributes: {},
    createdAt: "2026-07-04T00:00:00.000Z",
  }));
}

function runInput(lastRunAt: string): WriteRunInput {
  return {
    lastRunAt,
    nodes: makeNodes(3),
    edges: makeEdges(2),
    weights: { depth_weight: 1, system_weight: 1, role_weight: 1 },
    status: "ok",
    journeyScores: [
      {
        journey_id: "j1",
        journey_name: "Checkout",
        depth: 3,
        distinct_systems: 2,
        distinct_roles: 1,
        score: 6,
      },
    ],
    systemMetrics: [
      { system_id: "s1", system_name: "POS", degree: 4, integration_count: 2 },
    ],
    aiCandidates: [
      {
        activity_id: "a1",
        activity_name: "Reconcile",
        leverage_score: 0.9,
        detail: { reason: "repetitive" },
      },
    ],
  };
}

beforeEach(() => {
  if (!process.env.NEO4J_PASSWORD) process.env.NEO4J_PASSWORD = "test";
  prevEnv = process.env.ANALYTICS_DB_PATH;
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-cache-"));
  dbPath = join(tmpDir, "analytics.sqlite");
  process.env.ANALYTICS_DB_PATH = dbPath;
  resetAnalyticsDbForTest();
  initAnalyticsDb();
});

afterEach(() => {
  closeAnalyticsDb();
  if (prevEnv === undefined) delete process.env.ANALYTICS_DB_PATH;
  else process.env.ANALYTICS_DB_PATH = prevEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("T-01 (a): init creates the 5 cache tables in an isolated DB file", () => {
  test("all 5 cache tables exist", () => {
    const db = getAnalyticsDb();
    const names = new Set(
      (
        db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
          .all() as { name: string }[]
      ).map((r) => r.name),
    );
    for (const t of [
      "analytics_run",
      "analytics_journey_scores",
      "analytics_system_metrics",
      "analytics_ai_candidates",
      "analytics_alerts",
    ]) {
      expect(names.has(t)).toBe(true);
    }
  });

  test("the resolved DB file is distinct from the chat DB path", () => {
    const analyticsPath = getAnalyticsDbPath();
    expect(analyticsPath).not.toBeNull();
    const chatPath = resolve(process.cwd(), process.env.CHAT_DB_PATH ?? "../data/chat.db");
    expect(analyticsPath).not.toBe(chatPath);
    expect(existsSync(dbPath)).toBe(true);
  });
});

describe("T-01 (b/c): withCacheEnvelope staleness (DD-10)", () => {
  test("fresh run (now) → no degraded flag", () => {
    writeRun(runInput(new Date().toISOString()));
    const out = withCacheEnvelope({ report: "complexity", items: [] });
    expect("degraded" in out).toBe(false);
    expect(out.report).toBe("complexity");
  });

  test("stale run (now − 26 h) → degraded:true + last_run_at", () => {
    const stale = new Date(Date.now() - 26 * H).toISOString();
    writeRun(runInput(stale));
    const out = withCacheEnvelope({ report: "complexity", items: [] });
    expect("degraded" in out).toBe(true);
    if ("degraded" in out) {
      expect(out.degraded).toBe(true);
      expect(out.last_run_at).toBe(stale);
    }
  });

  test("no runs at all → body returned untouched (no degraded)", () => {
    const out = withCacheEnvelope({ report: "systems" });
    expect("degraded" in out).toBe(false);
  });
});

describe("T-01 (d): pruneSnapshots keeps the latest N=7 blobs (DD-12)", () => {
  test("8 runs → oldest blob cleared, latest 7 intact", () => {
    // 8 runs with monotonically increasing last_run_at.
    const stamps = Array.from(
      { length: 8 },
      (_, i) => `2026-07-0${i + 1}T02:00:00.000Z`,
    );
    for (const s of stamps) writeRun(runInput(s));

    // writeRun() already prunes; call again to prove idempotence.
    pruneSnapshots();

    expect(SNAPSHOT_RETENTION).toBe(7);

    // Oldest run: blob cleared → hydrated as pruned with empty node/edge arrays.
    const oldest = getRun(stamps[0]!);
    expect(oldest).not.toBeNull();
    expect(oldest!.pruned).toBe(true);
    expect(oldest!.nodes.length).toBe(0);
    expect(oldest!.edges.length).toBe(0);
    // Header + weights are retained.
    expect(oldest!.weights.depth_weight).toBe(1);

    // Latest 7 runs: blobs intact.
    for (const s of stamps.slice(1)) {
      const r = getRun(s);
      expect(r).not.toBeNull();
      expect(r!.pruned).toBe(false);
      expect(r!.nodes.length).toBe(3);
      expect(r!.edges.length).toBe(2);
    }
  });
});
