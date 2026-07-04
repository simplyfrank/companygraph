// T-07 — degraded-envelope + `?refresh=true` wiring on the 7 report GETs
// (FR-10 / DD-10 / AC-R3).
//
// Verifies (per tasks.md T-07 Verification, AC-R3): for each of the 7 report
// GETs the `handleAnalyticsReport` dispatcher —
//   (fresh)   a cache run with last_run_at = now         → body has NO `degraded`
//   (stale)   a cache run with last_run_at = now − 26 h  → body adds
//             `{ degraded:true, last_run_at }` INSIDE the NFR-08 success envelope
//   (refresh) a `?refresh=true` call → serves a fresh (non-degraded) body
//
// The 6 not-yet-built report modules + the degraded/fresh envelope are
// driver-free (they serve from the SQLite cache), so those assertions run under
// `bun test` (unit). The `systems` report and the live `?refresh=true`
// recompute both read Neo4j (`runSystemMap` / `runPrecompute` → capture), so
// their live behaviour is the recorded integration/manual repro at the bottom;
// here the refresh contract is asserted structurally against the wired
// dispatcher (fresh cache after a "refresh" → no `degraded`).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeAnalyticsDb,
  getAnalyticsDb,
  initAnalyticsDb,
  resetAnalyticsDbForTest,
  writeRun,
  type WriteRunInput,
} from "../src/analytics/reporting/cache";
import {
  ANALYTICS_REPORT_ROUTES,
  handleAnalyticsReport,
  type AnalyticsReportRoute,
} from "../src/analytics/routes";

const H = 60 * 60 * 1000;

// The 6 driver-free report GETs (`systems` reads Neo4j — integration repro).
const DRIVER_FREE_REPORTS: AnalyticsReportRoute[] = ANALYTICS_REPORT_ROUTES.filter(
  (r) => r !== "systems",
);

let tmpDir = "";
let prevEnv: string | undefined;

function runInput(lastRunAt: string): WriteRunInput {
  return {
    lastRunAt,
    nodes: [
      {
        id: "node-0",
        label: "Activity",
        attributes: {},
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ],
    edges: [],
    weights: { depth_weight: 1, system_weight: 1, role_weight: 1 },
    status: "ok",
    journeyScores: [],
    systemMetrics: [],
    aiCandidates: [],
  };
}

/** Wipe every run row so a test controls the single latest `last_run_at`. */
function clearRuns(): void {
  getAnalyticsDb().exec("DELETE FROM analytics_run");
}

type ReportBody = {
  report?: string;
  scaffold_pending?: boolean;
  degraded?: boolean;
  last_run_at?: string;
};

async function reportBody(
  report: AnalyticsReportRoute,
  refresh = false,
): Promise<{ status: number; body: ReportBody }> {
  const res = await handleAnalyticsReport(report, refresh);
  const body = (await res.json()) as ReportBody;
  return { status: res.status, body };
}

beforeEach(() => {
  if (!process.env.NEO4J_PASSWORD) process.env.NEO4J_PASSWORD = "test";
  prevEnv = process.env.ANALYTICS_DB_PATH;
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-degraded-"));
  process.env.ANALYTICS_DB_PATH = join(tmpDir, "analytics.sqlite");
  resetAnalyticsDbForTest();
  initAnalyticsDb();
});

afterEach(() => {
  closeAnalyticsDb();
  if (prevEnv === undefined) delete process.env.ANALYTICS_DB_PATH;
  else process.env.ANALYTICS_DB_PATH = prevEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AC-R3: fresh cache → no `degraded` flag on any report GET", () => {
  test("each driver-free report GET omits `degraded` when the cache is fresh", async () => {
    clearRuns();
    const now = new Date().toISOString();
    writeRun(runInput(now));

    for (const report of DRIVER_FREE_REPORTS) {
      const { status, body } = await reportBody(report);
      expect(status).toBe(200);
      // Unchanged scaffold body shape rides through untouched.
      expect(body.report).toBe(report);
      expect(body.scaffold_pending).toBe(true);
      // No staleness flag while fresh.
      expect(body.degraded).toBeUndefined();
      expect(body.last_run_at).toBeUndefined();
    }
  });
});

describe("AC-R3: stale cache → `degraded:true` + `last_run_at` inside the success envelope", () => {
  test("each driver-free report GET adds the degraded flag when the cache is stale", async () => {
    clearRuns();
    const stale = new Date(Date.now() - 26 * H).toISOString();
    writeRun(runInput(stale));

    for (const report of DRIVER_FREE_REPORTS) {
      const { status, body } = await reportBody(report);
      // Degraded rides INSIDE the NFR-08 success envelope — never an error.
      expect(status).toBe(200);
      expect(body.report).toBe(report);
      expect(body.scaffold_pending).toBe(true);
      expect(body.degraded).toBe(true);
      expect(body.last_run_at).toBe(stale);
    }
  });

  test("just-under-the-threshold cache (24 h old) is NOT degraded", async () => {
    clearRuns();
    const fresh = new Date(Date.now() - 24 * H).toISOString();
    writeRun(runInput(fresh));

    const { body } = await reportBody("complexity");
    expect(body.degraded).toBeUndefined();
  });
});

describe("AC-R3: `?refresh=true` serves a fresh (non-degraded) body", () => {
  // The live `?refresh=true` path calls `runPrecompute()` (Neo4j capture) — the
  // recorded integration repro exercises that end to end. Here we assert the
  // dispatcher contract: after a refresh writes a fresh `analytics_run` (the
  // post-recompute state), every report GET serves a non-degraded body.
  test("a fresh latest run (post-refresh state) → no `degraded` flag", async () => {
    clearRuns();
    // Simulate the pre-refresh stale state, then the fresh run a refresh writes.
    writeRun(runInput(new Date(Date.now() - 26 * H).toISOString()));
    writeRun(runInput(new Date().toISOString()));

    for (const report of DRIVER_FREE_REPORTS) {
      const { body } = await reportBody(report);
      expect(body.degraded).toBeUndefined();
      expect(body.last_run_at).toBeUndefined();
    }
  });

  test("`refresh=false` (the default) does not require a live driver / does not throw", async () => {
    clearRuns();
    writeRun(runInput(new Date().toISOString()));
    // The router passes a single argument (refresh defaults false); assert that
    // path stays driver-free for the 6 scaffold reports.
    for (const report of DRIVER_FREE_REPORTS) {
      const res = await handleAnalyticsReport(report);
      expect(res.status).toBe(200);
    }
  });
});

describe("dispatcher invariants preserved (unchanged from the scaffold)", () => {
  test("an unknown report name still yields a 404 not_found envelope", async () => {
    const res = await handleAnalyticsReport("no-such-report");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("not_found");
  });

  test("with NO cache run at all, a report GET still returns a 200 (no degraded)", async () => {
    clearRuns();
    const { status, body } = await reportBody("matrix");
    expect(status).toBe(200);
    expect(body.degraded).toBeUndefined();
  });
});

// Integration / manual repro (env-dependent — needs a running + seeded stack):
//   with `bun run dev` + `bun run seed`, then once the routes are mounted (T-09):
//     curl -s "127.0.0.1:8787/api/v1/analytics/complexity?refresh=true"
//       → expect a 200 envelope with a fresh `last_run_at` and NO `degraded` flag.
//     stop the scheduler / wait >25 h (or hand-age the run), then
//     curl -s "127.0.0.1:8787/api/v1/analytics/complexity"
//       → expect the same body plus `{ "degraded": true, "last_run_at": "<ISO>" }`.
//     curl -s "127.0.0.1:8787/api/v1/analytics/systems?refresh=true"
//       → expect the live SystemMap body, non-degraded.
