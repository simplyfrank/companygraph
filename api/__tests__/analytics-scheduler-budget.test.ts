// T-04 — precompute compute-budget guard (AC-16).
//
// AC-16 (NFR): a full precompute over `retail-mini` completes well within the
// 30-minute nightly budget. This unit variant MOCKS the live-graph capture
// with a retail-mini-scale snapshot (≈ tens of nodes) and asserts the
// capture→compute→cache-write wall-clock is orders of magnitude under budget.
//
// The 10k-node stress case is gated behind `RUN_ANALYTICS_STRESS=1` (it
// generates a synthetic 10k-node/≈30k-edge snapshot and still asserts the
// < 30-min ceiling). It stays opt-in so the default unit run stays fast.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { CapturedSnapshot } from "../src/analytics/reporting/capture";

const BUDGET_MS = 30 * 60 * 1000; // AC-16 nightly ceiling.
const STRESS = process.env.RUN_ANALYTICS_STRESS === "1";
const STRESS_NODES = 10_000;

let currentSnapshot: CapturedSnapshot = emptySnapshot();

function emptySnapshot(): CapturedSnapshot {
  return { nodes: [], edges: [], namesById: new Map() };
}

// retail-mini-scale: a handful of journeys, each with a few activities using a
// couple of systems + roles.
function miniSnapshot(): CapturedSnapshot {
  const nodes: CapturedSnapshot["nodes"] = [];
  const edges: CapturedSnapshot["edges"] = [];
  const namesById = new Map<string, string>();
  const ts = "2026-07-04T00:00:00.000Z";
  const push = (id: string, label: string, attributes: Record<string, unknown> = {}) => {
    nodes.push({ id, label, attributes, updatedAt: ts });
    namesById.set(id, id);
  };
  for (let s = 0; s < 6; s++) push(`s${s}`, "System");
  for (let r = 0; r < 4; r++) push(`r${r}`, "Role");
  let edgeSeq = 0;
  const edge = (type: string, fromId: string, toId: string) =>
    edges.push({ id: `e${edgeSeq++}`, type, fromId, toId, attributes: {}, createdAt: ts });
  for (let j = 0; j < 5; j++) {
    push(`j${j}`, "UserJourney");
    let prev: string | null = null;
    for (let a = 0; a < 5; a++) {
      const aid = `j${j}a${a}`;
      push(aid, "Activity", {
        repetition: a % 2 === 0 ? "high" : "low",
        data_richness: "high",
        leverage_score: 0.6,
      });
      edge("PART_OF", aid, `j${j}`);
      edge("USES_SYSTEM", aid, `s${a % 6}`);
      edge("EXECUTES", `r${a % 4}`, aid);
      if (prev) edge("PRECEDES", prev, aid);
      prev = aid;
    }
  }
  return { nodes, edges, namesById };
}

function stressSnapshot(n: number): CapturedSnapshot {
  const nodes: CapturedSnapshot["nodes"] = [];
  const edges: CapturedSnapshot["edges"] = [];
  const namesById = new Map<string, string>();
  const ts = "2026-07-04T00:00:00.000Z";
  const journeys = Math.max(1, Math.floor(n / 10));
  let idSeq = 0;
  let edgeSeq = 0;
  const push = (label: string, attributes: Record<string, unknown> = {}): string => {
    const id = `n${idSeq++}`;
    nodes.push({ id, label, attributes, updatedAt: ts });
    namesById.set(id, id);
    return id;
  };
  const edge = (type: string, fromId: string, toId: string) =>
    edges.push({ id: `e${edgeSeq++}`, type, fromId, toId, attributes: {}, createdAt: ts });
  const systems = Array.from({ length: 200 }, () => push("System"));
  const roles = Array.from({ length: 100 }, () => push("Role"));
  for (let j = 0; j < journeys && idSeq < n; j++) {
    const jid = push("UserJourney");
    let prev: string | null = null;
    for (let a = 0; a < 9 && idSeq < n; a++) {
      const aid = push("Activity", { repetition: "high", data_richness: "high", leverage_score: 0.7 });
      edge("PART_OF", aid, jid);
      edge("USES_SYSTEM", aid, systems[a % systems.length]!);
      edge("EXECUTES", roles[a % roles.length]!, aid);
      if (prev) edge("PRECEDES", prev, aid);
      prev = aid;
    }
  }
  return { nodes, edges, namesById };
}

mock.module("../src/analytics/reporting/capture", () => ({
  async captureSnapshot(): Promise<CapturedSnapshot> {
    return currentSnapshot;
  },
}));

mock.module("../src/ontology/cache/attribute-zod", () => ({
  async getAttributeValidator() {
    return z.object({
      repetition: z.unknown(),
      data_richness: z.unknown(),
      leverage_score: z.unknown(),
    });
  },
}));

const { initAnalyticsDb, resetAnalyticsDbForTest, getLatestRun } = await import(
  "../src/analytics/reporting/cache"
);
const { initAnalyticsSettings } = await import("../src/analytics/reporting/settings");
const { runPrecompute, _resetPrecomputeRunCount } = await import(
  "../src/analytics/reporting/scheduler"
);

let tmpDir = "";
let prevEnv: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-budget-"));
  prevEnv = process.env.ANALYTICS_DB_PATH;
  process.env.ANALYTICS_DB_PATH = join(tmpDir, "analytics.sqlite");
  resetAnalyticsDbForTest();
  initAnalyticsDb();
  initAnalyticsSettings();
  _resetPrecomputeRunCount();
  currentSnapshot = emptySnapshot();
});

afterEach(() => {
  resetAnalyticsDbForTest();
  if (prevEnv === undefined) delete process.env.ANALYTICS_DB_PATH;
  else process.env.ANALYTICS_DB_PATH = prevEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AC-16: precompute compute budget", () => {
  test("retail-mini precompute is far under the 30-minute budget", async () => {
    currentSnapshot = miniSnapshot();
    const t0 = performance.now();
    const result = await runPrecompute();
    const elapsed = performance.now() - t0;
    expect(result.status).toBe("ok");
    expect(getLatestRun()).not.toBeNull();
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  test.if(STRESS)(
    "10k-node stress precompute stays under the 30-minute budget (RUN_ANALYTICS_STRESS=1)",
    async () => {
      currentSnapshot = stressSnapshot(STRESS_NODES);
      const t0 = performance.now();
      const result = await runPrecompute();
      const elapsed = performance.now() - t0;
      expect(result.status).toBe("ok");
      expect(elapsed).toBeLessThan(BUDGET_MS);
    },
  );
});
