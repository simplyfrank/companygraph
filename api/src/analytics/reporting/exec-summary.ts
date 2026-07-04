// T-05 — deterministic exec-summary PDF generator (FR-08, NFR-04, DD-02/DD-03).
//
// `renderExecSummaryPdf(snapshot)` builds the CTO exec-summary PDF with `pdfkit`
// and is PURE w.r.t. its `snapshot` argument: two calls with the same snapshot
// return byte-identical `Uint8Array`s — INCLUDING the trailer `/ID` array
// (NFR-04, AC-08(a)). Byte-determinism is the load-bearing constraint; every
// non-deterministic PDF internal is pinned per DD-03:
//
//   • All determinism-critical metadata is pinned via the `PDFDocument`
//     constructor `info` option (B-02) — NOT set post-construction. pdfkit
//     computes the trailer `/ID` (`generateFileID(this.info)`) INSIDE the
//     constructor from `info.CreationDate.getTime()` + `Producer` + …, and
//     `_finalize()` writes `/ID:[this._id,this._id]`. Pinning the dates on the
//     already-built `doc` is too late — `generateFileID` has already hashed the
//     wall clock. So `CreationDate`/`ModDate` = `new Date(0)` and
//     `Producer`/`Creator` = `"companygraph"` go in the constructor `info`.
//   • `compress:false` — no zlib stream → a stable, diffable object stream.
//   • Font = standard-14 `Courier` (`doc.font("Courier")`) for body + the
//     monospace hash footer. NO `registerFont`, NO embedded/vendored font, NO
//     subsetting — Courier is non-embedded, so the PDF carries no font stream
//     at all (B-01, OQ-1 RESOLVED), removing the biggest nondeterminism source.
//   • The only variable text comes from the cache snapshot (`last_run_at`, the
//     scores, the hash) — all deterministic for a given snapshot. No
//     `Date.now()`, no random, no locale-formatted numbers.
//
// The `graphStateHash` of the snapshot is stamped into BOTH `/Subject`
// (set AFTER construction — it does not feed `generateFileID`) and the page-1
// monospace footer, so an external verifier re-derives the same hash from the
// `/snapshot/:last_run_at` endpoint (T-06 / AC-18).
//
// No Neo4j here (AC-11 guard): the generator consumes an already-captured cache
// snapshot; it never touches the graph driver.

import PDFDocument from "pdfkit";
import { graphStateHash, type HashInput } from "./hash";
import type {
  RunSnapshot,
  JourneyScoreRow,
  SystemMetricRow,
  AiCandidateRow,
} from "./cache";

/**
 * The exact cache contents the PDF renders from. `run` carries the captured
 * snapshot (nodes/edges/weights → the hash basis) + `last_run_at`; the three
 * score arrays are the precomputed report rows. All fields are deterministic
 * for a given `last_run_at`.
 */
export interface ExecSummarySnapshot {
  run: RunSnapshot;
  journeyScores: JourneyScoreRow[];
  systemMetrics: SystemMetricRow[];
  aiCandidates: AiCandidateRow[];
}

const TOP_JOURNEYS = 5;
const TOP_CONSOLIDATION = 3;
const TOP_AI = 3;

// Deterministic number formatting — NO locale (`toLocaleString`), NO `Date.now`.
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Build the `HashInput` from the cache run's captured snapshot. The hash basis
 * is `{ snapshot_id, nodes, edges, weights }` — `snapshot_id` is the run's
 * `last_run_at` (DD-06), matching the scheduler's own hash call so the PDF
 * footer hash equals the run's hash.
 */
export function hashInputForRun(run: RunSnapshot): HashInput {
  return {
    snapshot_id: run.last_run_at,
    nodes: run.nodes,
    edges: run.edges,
    weights: run.weights,
  };
}

/**
 * Render the deterministic exec-summary PDF. Pure w.r.t. `snapshot`: identical
 * snapshots → byte-identical output (including the trailer `/ID`). Returns the
 * PDF bytes as a `Uint8Array`; the endpoint sets the PDF headers.
 */
export function renderExecSummaryPdf(
  snapshot: ExecSummarySnapshot,
): Promise<Uint8Array> {
  const { run, journeyScores, systemMetrics, aiCandidates } = snapshot;
  const hash = graphStateHash(hashInputForRun(run));

  return new Promise<Uint8Array>((resolve, reject) => {
    // B-02: pin ALL determinism-critical metadata in the constructor `info`.
    const doc = new PDFDocument({
      pdfVersion: "1.3",
      compress: false,
      autoFirstPage: true,
      margin: 48,
      info: {
        CreationDate: new Date(0),
        ModDate: new Date(0),
        Producer: "companygraph",
        Creator: "companygraph",
      },
    });

    // `/Subject` = the canonical hash location (FR-08). Safe to set AFTER
    // construction — it does not feed `generateFileID` (B-02).
    doc.info.Subject = hash;

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(concat(chunks)));
    doc.on("error", reject);

    // ── Body — standard-14 Courier only, drawn solely from the cache row ──
    doc.font("Courier");

    doc.fontSize(20).text("companygraph — CTO exec summary", { align: "left" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .text(`cache snapshot: ${run.last_run_at}`)
      .text(`precompute status: ${run.status}`)
      .text(
        `complexity weights: depth=${fmt(run.weights.depth_weight)} ` +
          `system=${fmt(run.weights.system_weight)} ` +
          `role=${fmt(run.weights.role_weight)}`,
      );
    doc.moveDown(1);

    // Section 1 — top-5 journeys by complexity score.
    doc.fontSize(14).text("Top complexity journeys");
    doc.moveDown(0.25);
    doc.fontSize(10);
    const topJourneys = journeyScores.slice(0, TOP_JOURNEYS);
    if (topJourneys.length === 0) {
      doc.text("  (no journeys scored)");
    } else {
      topJourneys.forEach((j, i) => {
        doc.text(
          `  ${i + 1}. ${j.journey_name} — score ${fmt(j.score)} ` +
            `(depth ${fmt(j.depth)}, systems ${fmt(j.distinct_systems)}, ` +
            `roles ${fmt(j.distinct_roles)})`,
        );
      });
    }
    doc.moveDown(1);

    // Section 2 — top-3 system consolidation candidates (by degree).
    doc.fontSize(14).text("Top consolidation candidates");
    doc.moveDown(0.25);
    doc.fontSize(10);
    const topSystems = systemMetrics.slice(0, TOP_CONSOLIDATION);
    if (topSystems.length === 0) {
      doc.text("  (no systems measured)");
    } else {
      topSystems.forEach((s, i) => {
        doc.text(
          `  ${i + 1}. ${s.system_name} — degree ${fmt(s.degree)}, ` +
            `integrations ${fmt(s.integration_count)}`,
        );
      });
    }
    doc.moveDown(1);

    // Section 3 — top-3 AI-leverage candidates.
    doc.fontSize(14).text("Top AI-leverage candidates");
    doc.moveDown(0.25);
    doc.fontSize(10);
    const topAi = aiCandidates.slice(0, TOP_AI);
    if (topAi.length === 0) {
      doc.text("  (no AI candidates)");
    } else {
      topAi.forEach((c, i) => {
        doc.text(
          `  ${i + 1}. ${c.activity_name} — leverage ${fmt(c.leverage_score)}`,
        );
      });
    }

    // Page-1 footer (monospace Courier): the canonical hash + snapshot marker.
    // Positioned at a fixed y so it does not depend on the body flow length.
    const footerY = doc.page.height - doc.page.margins.bottom - 12;
    doc
      .font("Courier")
      .fontSize(8)
      .text(
        `graph-state hash: ${hash} · cache snapshot: ${run.last_run_at}`,
        doc.page.margins.left,
        footerY,
        { lineBreak: false },
      );

    doc.end();
  });
}

/** Concatenate the streamed chunks into a single `Uint8Array` (no Node Buffer). */
function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
