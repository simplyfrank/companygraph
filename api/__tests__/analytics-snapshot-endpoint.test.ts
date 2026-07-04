// T-06 — cache-snapshot read endpoint (AC-18, FR-11a).
//
// Verifies (per tasks.md T-06 Verification / design §5.7, DD-12/C-03):
//   • precompute (seed) a run, render the exec-summary PDF capturing its footer
//     hash, call handleSnapshot(last_run_at), re-derive graphStateHash from the
//     returned { snapshot_id, nodes, edges, weights } → expect it EQUALS the PDF
//     footer hash (AC-18 external re-derivation contract);
//   • an unknown last_run_at → 404 not_found envelope;
//   • a PRUNED run (its snapshot blob cleared beyond the rolling N=7 window by
//     pruneSnapshots()) → 404 not_found (DD-12 / C-03).
//
// Pure SQLite + pdfkit — no Neo4j, runs under `bun test` (unit). Runs are seeded
// directly via writeRun() so the endpoint is tested without the scheduler.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initAnalyticsDb,
  resetAnalyticsDbForTest,
  writeRun,
  getRun,
  SNAPSHOT_RETENTION,
  type SnapshotNode,
  type SnapshotEdge,
  type RunWeights,
} from "../src/analytics/reporting/cache";
import { handleSnapshot } from "../src/analytics/reporting-routes";
import {
  renderExecSummaryPdf,
  hashInputForRun,
} from "../src/analytics/reporting/exec-summary";
import { graphStateHash } from "../src/analytics/reporting/hash";

// ── Fixture: a deterministic captured snapshot + score rows ─────────────────

const NODES: SnapshotNode[] = [
  { id: "j1", label: "UserJourney", attributes: {}, updatedAt: "2026-07-04T00:00:00.000Z" },
  {
    id: "a1",
    label: "Activity",
    attributes: { repetition: "high", data_richness: "high", leverage_score: 0.9 },
    updatedAt: "2026-07-04T00:00:00.000Z",
  },
  { id: "s1", label: "System", attributes: {}, updatedAt: "2026-07-04T00:00:00.000Z" },
];
const EDGES: SnapshotEdge[] = [
  { id: "e1", type: "PART_OF", fromId: "a1", toId: "j1", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
  { id: "e2", type: "USES_SYSTEM", fromId: "a1", toId: "s1", attributes: {}, createdAt: "2026-07-04T00:00:00.000Z" },
];

const WEIGHTS: RunWeights = { depth_weight: 1, system_weight: 1, role_weight: 1 };
const RUN_AT = "2026-07-04T02:00:00.000Z";

function seedRun(lastRunAt: string): void {
  writeRun({
    lastRunAt,
    nodes: NODES,
    edges: EDGES,
    weights: WEIGHTS,
    status: "ok",
    journeyScores: [
      {
        journey_id: "j1",
        journey_name: "Checkout",
        depth: 3,
        distinct_systems: 2,
        distinct_roles: 1,
        score: 7.5,
      },
    ],
    systemMetrics: [{ system_id: "s1", system_name: "POS", degree: 4, integration_count: 2 }],
    aiCandidates: [
      {
        activity_id: "a1",
        activity_name: "Scan item",
        leverage_score: 0.9,
        detail: { repetition: "high" },
      },
    ],
  });
}

// pdfkit draws body text HEX-encoded, one `<hex>` token per glyph run with
// kerning offsets; decode every token, concat, then read the footer hash.
function decodeDrawnText(pdf: string): string {
  let out = "";
  for (const m of pdf.matchAll(/<([0-9a-fA-F]+)>/g)) {
    const hex = m[1]!;
    if (hex.length % 2 !== 0) continue;
    out += Buffer.from(hex, "hex").toString("latin1");
  }
  return out;
}
function extractFooterHash(pdf: string): string | null {
  const m = decodeDrawnText(pdf).match(/graph-state hash: ([0-9a-f]{64})/);
  return m ? m[1]! : null;
}

let tmpDir = "";
let prevEnv: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-snap-"));
  prevEnv = process.env.ANALYTICS_DB_PATH;
  process.env.ANALYTICS_DB_PATH = join(tmpDir, "analytics.sqlite");
  resetAnalyticsDbForTest();
  initAnalyticsDb();
});

afterEach(() => {
  resetAnalyticsDbForTest();
  if (prevEnv === undefined) delete process.env.ANALYTICS_DB_PATH;
  else process.env.ANALYTICS_DB_PATH = prevEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AC-18: cache-snapshot read endpoint", () => {
  test("re-derives the SAME hash the exec-summary PDF stamped", async () => {
    seedRun(RUN_AT);
    const run = getRun(RUN_AT)!;

    // Render the PDF and capture its page-1 footer hash.
    const pdf = Buffer.from(
      await renderExecSummaryPdf({
        run,
        journeyScores: [],
        systemMetrics: [],
        aiCandidates: [],
      }),
    ).toString("latin1");
    const pdfHash = extractFooterHash(pdf);
    expect(pdfHash).toMatch(/^[0-9a-f]{64}$/);

    // Call the snapshot endpoint, re-derive the hash from its body.
    const res = handleSnapshot(RUN_AT);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      snapshot_id: string;
      nodes: SnapshotNode[];
      edges: SnapshotEdge[];
      weights: RunWeights;
      journey_scores: unknown[];
      system_metrics: unknown[];
      ai_candidates: unknown[];
    };

    // Shape (design §5.7) — all seven fields present.
    expect(body.snapshot_id).toBe(RUN_AT);
    expect(body.nodes.length).toBe(NODES.length);
    expect(body.edges.length).toBe(EDGES.length);
    expect(body.weights).toEqual(WEIGHTS);
    expect(body.journey_scores.length).toBe(1);
    expect(body.system_metrics.length).toBe(1);
    expect(body.ai_candidates.length).toBe(1);

    // The { snapshot_id, nodes, edges, weights } subset re-derives the SAME hash.
    const rederived = graphStateHash({
      snapshot_id: body.snapshot_id,
      nodes: body.nodes,
      edges: body.edges,
      weights: body.weights,
    });
    expect(rederived).toBe(pdfHash);
    // …and equals what hashInputForRun produces from the cache run.
    expect(rederived).toBe(graphStateHash(hashInputForRun(run)));
  });

  test("unknown last_run_at → 404 not_found envelope", async () => {
    seedRun(RUN_AT);
    const res = handleSnapshot("2099-01-01T00:00:00.000Z");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
  });

  test("pruned run (blob cleared beyond N=7) → 404 not_found (DD-12/C-03)", async () => {
    // Seed N+1 runs at strictly increasing timestamps; the oldest falls outside
    // the rolling window and pruneSnapshots() (called by writeRun) clears its
    // nodes_json/edges_json.
    const base = Date.parse("2026-07-01T00:00:00.000Z");
    const stamps: string[] = [];
    for (let i = 0; i <= SNAPSHOT_RETENTION; i++) {
      const at = new Date(base + i * 3_600_000).toISOString();
      stamps.push(at);
      seedRun(at);
    }
    const oldest = stamps[0]!;

    // Sanity: the run header still exists but its blob is pruned.
    const run = getRun(oldest);
    expect(run).not.toBeNull();
    expect(run!.pruned).toBe(true);

    const res = handleSnapshot(oldest);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");

    // The newest run is still re-derivable (200).
    const newest = stamps[stamps.length - 1]!;
    expect(handleSnapshot(newest).status).toBe(200);
  });
});
