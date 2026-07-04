// T-04 — nightly precompute scheduler + lock + ontology validation (AC-13).
//
// Verifies (per tasks.md T-04 Verification):
//   (a) a manual runPrecompute() → cache rows written + a FRESH last_run_at
//       (withCacheEnvelope omits `degraded`).
//   (b) an artificially stale cache → withCacheEnvelope adds `degraded:true`.
//   (c) two concurrent runPrecompute() calls → the SAME run (single lastRunAt)
//       and the capture+compute body ran exactly once (mutex, DD-07).
//   (d) an AI-def whose keys are NOT registered Activity attributes → the AI
//       pass is skipped (status `ai_skipped`, zero ai_candidates) and an
//       `analytics_alerts` banner is written (AC-13(d)).
//
// The live-graph capture (capture.ts) and the ontology attribute-schema
// accessor (attribute-zod.ts) are MOCKED so the suite is pure SQLite and runs
// under `bun test` (unit — no Neo4j). AC-16's wall-clock budget lives in
// analytics-scheduler-budget.test.ts.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { CapturedSnapshot } from "../src/analytics/reporting/capture";

// ── Mocks (must be registered before the scheduler is imported) ─────────────

// A tiny retail-ish graph: one journey, two activities, one system, one role.
// The two candidate activities carry the default AI-def attributes so, when the
// AI keys validate, they surface as candidates.
function fixtureSnapshot(): CapturedSnapshot {
  const nodes = [
    { id: "j1", label: "UserJourney", attributes: {}, updatedAt: "2026-07-04T00:00:00.000Z" },
    {
      id: "a1",
      label: "Activity",
      attributes: { repetition: "high", data_richness: "high", leverage_score: 0.9 },
      updatedAt: "2026-07-04T00:00:00.000Z",
    },
    {
      id: "a2",
      label: "Activity",
      attributes: { repetition: "low", data_richness: "high", leverage_score: 0.2 },
      updatedAt: "2026-07-04T00:00:00.000Z",
    },
    { id: "s1", label: "System", attributes: {}, updatedAt: "2026-07-04T00:00:00.000Z" },
    { id: "r1", label: "Role", attributes: {}, updatedAt: "2026-07-04T00:00:00.000Z" },
  ];
  const edges = [
    { id: "e1", type: "PART_OF", fromId: "a1", toId: "j1", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
    { id: "e2", type: "PART_OF", fromId: "a2", toId: "j1", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
    { id: "e3", type: "PRECEDES", fromId: "a1", toId: "a2", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
    { id: "e4", type: "USES_SYSTEM", fromId: "a1", toId: "s1", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
    { id: "e5", type: "EXECUTES", fromId: "r1", toId: "a1", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
  ];
  const namesById = new Map<string, string>([
    ["j1", "Checkout"],
    ["a1", "Scan item"],
    ["a2", "Bag item"],
    ["s1", "POS"],
    ["r1", "Cashier"],
  ]);
  return { nodes, edges, namesById };
}

// Capture delay so two concurrent runs overlap in-flight (AC-13(c)).
let captureCalls = 0;
mock.module("../src/analytics/reporting/capture", () => ({
  async captureSnapshot(): Promise<CapturedSnapshot> {
    captureCalls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return fixtureSnapshot();
  },
}));

// The Activity attribute schema. `validatorKeys` decides which keys are
// "registered" — flip it to simulate an AI-key mismatch (AC-13(d)).
let validatorKeys: string[] = ["repetition", "data_richness", "leverage_score"];
mock.module("../src/ontology/cache/attribute-zod", () => ({
  async getAttributeValidator() {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const k of validatorKeys) shape[k] = z.unknown();
    return z.object(shape);
  },
}));

// ── Imports AFTER the mocks so the scheduler picks up the stubs ─────────────

const cache = await import("../src/analytics/reporting/cache");
const {
  initAnalyticsDb,
  resetAnalyticsDbForTest,
  getLatestRun,
  getLatestRunAt,
  getJourneyScores,
  getSystemMetrics,
  getAiCandidates,
  getAlerts,
  withCacheEnvelope,
} = cache;
const { initAnalyticsSettings } = await import("../src/analytics/reporting/settings");
const { runPrecompute, _precomputeRunCount, _resetPrecomputeRunCount } = await import(
  "../src/analytics/reporting/scheduler"
);

const H = 60 * 60 * 1000;

let tmpDir = "";
let prevEnv: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-scheduler-"));
  prevEnv = process.env.ANALYTICS_DB_PATH;
  process.env.ANALYTICS_DB_PATH = join(tmpDir, "analytics.sqlite");
  resetAnalyticsDbForTest();
  initAnalyticsDb();
  initAnalyticsSettings();
  captureCalls = 0;
  validatorKeys = ["repetition", "data_richness", "leverage_score"];
  _resetPrecomputeRunCount();
});

afterEach(() => {
  resetAnalyticsDbForTest();
  if (prevEnv === undefined) delete process.env.ANALYTICS_DB_PATH;
  else process.env.ANALYTICS_DB_PATH = prevEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AC-13: precompute scheduler", () => {
  test("(a) a manual run writes cache rows + a fresh last_run_at", async () => {
    const result = await runPrecompute();
    expect(result.status).toBe("ok");
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);

    const latest = getLatestRun();
    expect(latest).not.toBeNull();
    expect(latest!.last_run_at).toBe(result.lastRunAt);
    // one journey scored, one system, one AI candidate (a1).
    expect(getJourneyScores(result.lastRunAt).length).toBe(1);
    expect(getSystemMetrics(result.lastRunAt).length).toBe(1);
    const ai = getAiCandidates(result.lastRunAt);
    expect(ai.map((c) => c.activity_id)).toEqual(["a1"]);

    // The cache is fresh → withCacheEnvelope omits `degraded`.
    const enveloped = withCacheEnvelope({ report: "complexity" });
    expect((enveloped as Record<string, unknown>).degraded).toBeUndefined();
  });

  test("(b) an artificially stale run → withCacheEnvelope adds degraded:true", async () => {
    await runPrecompute();
    // Rewrite the run header to 26 h ago (stale).
    const db = cache.getAnalyticsDb();
    const staleAt = new Date(Date.now() - 26 * H).toISOString();
    db.prepare(`UPDATE analytics_run SET last_run_at = ?`).run(staleAt);

    expect(getLatestRunAt()).toBe(staleAt);
    const enveloped = withCacheEnvelope({ report: "complexity" }) as Record<string, unknown>;
    expect(enveloped.degraded).toBe(true);
    expect(enveloped.last_run_at).toBe(staleAt);
  });

  test("(c) concurrent runs → same run, capture+compute executed once", async () => {
    const [r1, r2] = await Promise.all([runPrecompute(), runPrecompute()]);
    expect(r1.lastRunAt).toBe(r2.lastRunAt);
    // Single execution: the mutex ran the body exactly once.
    expect(_precomputeRunCount()).toBe(1);
    expect(captureCalls).toBe(1);
  });

  test("(d) AI-key mismatch → AI pass skipped + alert banner", async () => {
    // Registered Activity attributes DON'T include the AI-def keys.
    validatorKeys = ["sku", "unrelated_attr"];
    const result = await runPrecompute();

    expect(result.status).toBe("ai_skipped");
    expect(result.aiValidated).toBe(false);
    // No AI candidates were computed.
    expect(getAiCandidates(result.lastRunAt).length).toBe(0);
    // An alert banner was written.
    const alerts = getAlerts(result.lastRunAt);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.kind).toBe("ai_schema_mismatch");
    // The run header status column carries the enum'd `ai_skipped` (N-02).
    expect(getLatestRun()!.status).toBe("ai_skipped");
  });
});
