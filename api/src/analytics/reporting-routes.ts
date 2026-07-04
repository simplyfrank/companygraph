// Analytics reporting REST handlers — cto-analytics-reporting (design §5.7).
//
// A sibling module to `api/src/analytics/routes.ts` that carries the new
// FR-08/FR-11/FR-11a handlers (keeps the concurrent edit to `routes.ts`
// minimal, DD-01). The router mount is a single fenced block in
// `api/src/router.ts` (T-09, DD-11).
//
// T-03 lands the two settings handlers (FR-11):
//   GET   /api/v1/analytics/settings    → handleGetSettings
//   PATCH /api/v1/analytics/settings    → handlePatchSettings
//
// The exec-summary (T-05) and snapshot (T-06) handlers extend this same
// module in their owning tasks.

import { ok, error, readJson, fromValidationError } from "../routes/_helpers";
import { ValidationError } from "../errors";
import {
  getSettingsRow,
  patchSettings,
  validateSettingsPatch,
  type SettingsRow,
} from "./reporting/settings";
import {
  getLatestRun,
  getRun,
  getJourneyScores,
  getSystemMetrics,
  getAiCandidates,
} from "./reporting/cache";
import { runPrecompute } from "./reporting/scheduler";
import {
  renderExecSummaryPdf,
  type ExecSummarySnapshot,
} from "./reporting/exec-summary";

// ── FR-11: settings (GET / PATCH) ───────────────────────────────────────

/** `GET /api/v1/analytics/settings` — the single settings row (NFR-08 envelope). */
export function handleGetSettings(): Response {
  return ok(settingsBody(getSettingsRow()));
}

/**
 * `PATCH /api/v1/analytics/settings` — validate via `parseWith` (bad body →
 * `invalid_payload` 400), apply the patch, write one audit row (DD-09), and
 * return the updated row. `ValidationError` is caught locally so the handler
 * is self-contained even before the router gate is wired (T-09); the rendered
 * 400 is identical to the router's global catch.
 */
export async function handlePatchSettings(req: Request): Promise<Response> {
  try {
    const raw = await readJson(req);
    const patch = validateSettingsPatch(raw);
    const next = patchSettings(patch);
    return ok(settingsBody(next));
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

// ── FR-08: exec-summary PDF (GET → application/pdf) ─────────────────────

/**
 * `GET /api/v1/analytics/exec-summary.pdf` — render the deterministic
 * exec-summary PDF from the latest `analytics_run` cache snapshot (FR-08). If
 * no run exists yet, trigger a `runPrecompute()` first so the endpoint always
 * has a cache snapshot to render from. Returns the PDF bytes with
 * `content-type: application/pdf` + `content-disposition: attachment`.
 *
 * A pruned latest run (its snapshot blob cleared beyond the N=7 window, DD-12)
 * cannot serve the nodes/edges hash basis, so this handler recomputes a fresh
 * run in that (unusual) case — the latest run is only pruned when ≥ 7 newer
 * runs exist, which is not possible for the most-recent run under the ordering,
 * but the guard keeps the render total.
 */
export async function handleExecSummaryPdf(): Promise<Response> {
  let run = getLatestRun();
  if (run === null || run.pruned) {
    await runPrecompute();
    run = getLatestRun();
  }
  if (run === null) {
    // Should never happen — runPrecompute() always writes a run — but reuse
    // the closed enum's `not_found` (OQ-3: no new ERROR_CODES) rather than
    // throwing, so the caller always sees a well-formed envelope.
    return error(404, "not_found", "no analytics run available to render");
  }

  const snapshot: ExecSummarySnapshot = {
    run,
    journeyScores: getJourneyScores(run.last_run_at),
    systemMetrics: getSystemMetrics(run.last_run_at),
    aiCandidates: getAiCandidates(run.last_run_at),
  };

  const bytes = await renderExecSummaryPdf(snapshot);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="exec-summary.pdf"',
    },
  });
}

// ── FR-11a: cache-snapshot read (GET → exact hash basis) ────────────────

/**
 * `GET /api/v1/analytics/snapshot/:last_run_at` — return the exact cache
 * contents the exec-summary PDF was hashed over, so an external verifier can
 * re-derive the same `graphStateHash` (FR-11a, AC-18).
 *
 * Returns `{ snapshot_id, nodes, edges, weights, journey_scores,
 * system_metrics, ai_candidates }`. The `{ snapshot_id, nodes, edges, weights }`
 * subset is exactly the `HashInput` `hash.ts` consumes — `snapshot_id` is the
 * run's `last_run_at` (DD-06), matching `hashInputForRun` so the re-derived
 * hash equals the run's PDF footer hash.
 *
 * `404 not_found` in TWO cases (DD-12 / C-03), both reusing the closed enum's
 * `not_found` (OQ-3: no new ERROR_CODES):
 *   (i)  no `analytics_run` row exists for that `last_run_at`;
 *   (ii) the row exists but its snapshot blob was PRUNED beyond the rolling
 *        N=7 window (`run.pruned`) — a pruned run can no longer serve the
 *        nodes/edges hash basis, so it is `not_found` for the re-derivation
 *        contract.
 */
export function handleSnapshot(lastRunAt: string): Response {
  const run = getRun(lastRunAt);
  if (run === null || run.pruned) {
    return error(404, "not_found", `no re-derivable analytics snapshot at ${lastRunAt}`);
  }
  return ok({
    snapshot_id: run.last_run_at,
    nodes: run.nodes,
    edges: run.edges,
    weights: run.weights,
    journey_scores: getJourneyScores(run.last_run_at),
    system_metrics: getSystemMetrics(run.last_run_at),
    ai_candidates: getAiCandidates(run.last_run_at),
  });
}

/** Shape the settings row for the wire (JSON columns already parsed to objects). */
function settingsBody(row: SettingsRow) {
  return {
    depth_weight: row.depth_weight,
    system_weight: row.system_weight,
    role_weight: row.role_weight,
    scheduler_cron: row.scheduler_cron,
    pdf_brand: row.pdf_brand,
    ai_candidate_definition: row.ai_candidate_definition,
    updated_at: row.updated_at,
  };
}
