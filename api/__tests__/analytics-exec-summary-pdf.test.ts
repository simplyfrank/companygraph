// T-05 — deterministic exec-summary PDF generator (AC-08).
//
// Verifies (per tasks.md T-05 Verification / design §5.3, DD-03):
//   (a) render twice on the SAME cache snapshot → deep-equal bytes (the WHOLE
//       `Uint8Array`, so the trailer `/ID` array is asserted equal too — B-02).
//   (b) mutate the weights (a fresh snapshot) → the footer hash + the bytes
//       change; reverting the weights reverts the hash.
//   (c) the PDF `/Subject` and the page-1 footer carry the SAME 64-hex hash.
//   plus — the PDF carries NO embedded font stream (standard-14 Courier only,
//   B-01); no wall-clock leaks (the trailer /ID is stable across renders).
//
// Pure SQLite + pdfkit — no Neo4j, runs under `bun test` (unit). The cache run
// is seeded directly via `writeRun()` so the generator's determinism is tested
// without the scheduler.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initAnalyticsDb,
  resetAnalyticsDbForTest,
  writeRun,
  getLatestRun,
  getJourneyScores,
  getSystemMetrics,
  getAiCandidates,
  type SnapshotNode,
  type SnapshotEdge,
  type RunWeights,
} from "../src/analytics/reporting/cache";
import {
  renderExecSummaryPdf,
  hashInputForRun,
  type ExecSummarySnapshot,
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

const RUN_AT = "2026-07-04T02:00:00.000Z";

function seedRun(lastRunAt: string, weights: RunWeights): void {
  writeRun({
    lastRunAt,
    nodes: NODES,
    edges: EDGES,
    weights,
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
    systemMetrics: [
      { system_id: "s1", system_name: "POS", degree: 4, integration_count: 2 },
    ],
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

function snapshotFromCache(lastRunAt: string): ExecSummarySnapshot {
  const run = getLatestRun();
  if (run === null || run.last_run_at !== lastRunAt) {
    throw new Error("expected the seeded run to be the latest");
  }
  return {
    run,
    journeyScores: getJourneyScores(lastRunAt),
    systemMetrics: getSystemMetrics(lastRunAt),
    aiCandidates: getAiCandidates(lastRunAt),
  };
}

const WEIGHTS: RunWeights = { depth_weight: 1, system_weight: 1, role_weight: 1 };

let tmpDir = "";
let prevEnv: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-pdf-"));
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

// pdfkit stores /Subject as an INDIRECT object `/Subject N 0 R` whose target
// object is `N 0 obj (<literal>)`. Resolve the reference then read the literal.
function extractSubjectHash(pdf: string): string | null {
  const ref = pdf.match(/\/Subject\s+(\d+)\s+0\s+R/);
  if (!ref) {
    // Fallback: an inline literal `/Subject (…)`.
    const inline = pdf.match(/\/Subject\s*\(([0-9a-f]{64})\)/);
    return inline ? inline[1]! : null;
  }
  const objNum = ref[1]!;
  const obj = pdf.match(new RegExp(`${objNum}\\s+0\\s+obj\\s*\\(([0-9a-f]{64})\\)`));
  return obj ? obj[1]! : null;
}

// pdfkit draws body text HEX-encoded in the content stream, one `<hex>` token
// per glyph run with kerning offsets between runs (`[<hex> N <hex> …] TJ`), so
// no contiguous multi-char substring survives. Decode EVERY `<hex>` token and
// concatenate — that reconstructs the drawn text — then read the 64-hex hash
// that follows the footer prefix.
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
  const drawn = decodeDrawnText(pdf);
  const m = drawn.match(/graph-state hash: ([0-9a-f]{64})/);
  return m ? m[1]! : null;
}

describe("AC-08: deterministic exec-summary PDF", () => {
  test("(a) two renders on the same snapshot → byte-identical (incl. trailer /ID)", async () => {
    seedRun(RUN_AT, WEIGHTS);
    const snap = snapshotFromCache(RUN_AT);

    const a = await renderExecSummaryPdf(snap);
    const b = await renderExecSummaryPdf(snap);

    expect(a.length).toBe(b.length);
    expect(a).toEqual(b);

    // Explicit /ID coverage (B-02): the trailer /ID array must be identical.
    const sa = Buffer.from(a).toString("latin1");
    const sb = Buffer.from(b).toString("latin1");
    const idA = sa.match(/\/ID \[.*?\]/s);
    const idB = sb.match(/\/ID \[.*?\]/s);
    expect(idA).not.toBeNull();
    expect(idA![0]).toBe(idB![0]);
  });

  test("(b) mutating the weights changes the footer hash + the bytes; reverting reverts", async () => {
    seedRun(RUN_AT, WEIGHTS);
    const base = await renderExecSummaryPdf(snapshotFromCache(RUN_AT));
    const baseHash = extractFooterHash(Buffer.from(base).toString("latin1"));
    expect(baseHash).toMatch(/^[0-9a-f]{64}$/);

    // Fresh snapshot with different weights.
    const runAt2 = "2026-07-04T03:00:00.000Z";
    seedRun(runAt2, { depth_weight: 2, system_weight: 1, role_weight: 1 });
    const mutated = await renderExecSummaryPdf(snapshotFromCache(runAt2));
    const mutatedHash = extractFooterHash(Buffer.from(mutated).toString("latin1"));

    expect(mutatedHash).not.toBe(baseHash);
    expect(mutated).not.toEqual(base);

    // Reverting the weights (same run_at basis) reverts the hash.
    const runAt3 = RUN_AT;
    const revertedHash = graphStateHash(
      hashInputForRun({
        last_run_at: runAt3,
        nodes: NODES,
        edges: EDGES,
        weights: WEIGHTS,
        status: "ok",
        pruned: false,
      }),
    );
    expect(revertedHash).toBe(baseHash);
  });

  test("(c) /Subject and the page-1 footer carry the same 64-hex hash", async () => {
    seedRun(RUN_AT, WEIGHTS);
    const snap = snapshotFromCache(RUN_AT);
    const pdf = Buffer.from(await renderExecSummaryPdf(snap)).toString("latin1");

    const expected = graphStateHash(hashInputForRun(snap.run));
    const subjectHash = extractSubjectHash(pdf);
    const footerHash = extractFooterHash(pdf);

    expect(subjectHash).toBe(expected);
    expect(footerHash).toBe(expected);
    expect(subjectHash).toBe(footerHash);
  });

  test("standard-14 Courier only — no embedded font stream (B-01)", async () => {
    seedRun(RUN_AT, WEIGHTS);
    const pdf = Buffer.from(await renderExecSummaryPdf(snapshotFromCache(RUN_AT))).toString("latin1");
    // Base-14 Courier is referenced by name; no FontFile/FontFile2/FontFile3
    // stream (which an embedded/subsetted font would emit).
    expect(pdf).toContain("/Courier");
    expect(pdf).not.toContain("/FontFile");
  });
});
