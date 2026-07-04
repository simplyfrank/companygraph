/**
 * Analytics REST endpoint scaffold (FR-09, cto-analytics design §5.2, T-14).
 *
 * Mounts the **7 BUILD-set** FR-09 report GETs under `/api/v1/analytics/`:
 *
 *   GET /api/v1/analytics/systems
 *   GET /api/v1/analytics/matrix
 *   GET /api/v1/analytics/consolidation
 *   GET /api/v1/analytics/complexity
 *   GET /api/v1/analytics/single-system-journeys
 *   GET /api/v1/analytics/critical-paths
 *   GET /api/v1/analytics/ai-candidates
 *
 * plus a read-only config endpoint that serves the **code-default** scoring
 * weights + AI-candidate definition (design §10.2, RD-6): runtime tunability
 * and the audit trail land with FR-11 in the follow-up spec
 * `cto-analytics-reporting`, so these ship as code-default constants here and
 * are read by T-10 (weighted complexity) and T-13 (AI-candidate filter).
 *
 *   GET /api/v1/analytics/config
 *
 * RD-1 (design §4 DD-02): every report reads the live graph through the
 * shared read-only module `api/src/neo4j/read-only-graph.ts` — no analytics
 * module calls `getDriver()`/`driver.session()` directly (AC-11; guard test
 * T-19). The deferred `exec-summary.pdf` / `settings` / `snapshot` endpoints
 * are **not** mounted here (RD-6, design §5.3).
 *
 * Scaffold status: `systems` is served live by the T-20 `runSystemMap()`
 * module. The other six report modules land in their owning tasks
 * (consolidation → T-09, complexity → T-10, single-system → T-11,
 * critical-paths → T-12, ai-candidates → T-13; `matrix` completion → T-08).
 * Until each module lands, its route returns a well-formed NFR-08 success
 * envelope carrying `scaffold_pending: true` so the surface is reachable and
 * the AC-10 envelope harness (T-19) exercises a 200 for every report GET.
 * The owning task swaps the placeholder body for its real module call.
 */

import { z } from "zod";
import { runSystemMap } from "./system-map";
import { ok, error } from "../routes/_helpers";
import { parseWith } from "../routes/_helpers";

// ── Code-default config (design §10.2, RD-4a / RD-6) ────────────────────
//
// These are the read-only defaults T-10 / T-13 consume. They are **not** the
// deferred `analytics_settings` table — runtime tunability + the audit trail
// are deferred to `cto-analytics-reporting` (FR-11). Shipped as frozen
// constants so no BUILD task depends on the deferred settings subsystem.

/** FR-04 weighted-complexity default weights (RD-2 formula: depth × systems × roles). */
export const ANALYTICS_COMPLEXITY_WEIGHTS = Object.freeze({
  depth_weight: 1.0,
  system_weight: 1.0,
  role_weight: 1.0,
});
export type AnalyticsComplexityWeights = typeof ANALYTICS_COMPLEXITY_WEIGHTS;

/**
 * FR-07 default `analytics_ai_candidate_definition` (RD-4a).
 *
 * Matches the as-built vocabulary in `shared/seed/retail-mini-enriched.json`
 * and `api/src/chat/tools/ai-candidates.ts` so analytics ≡ chat: an Activity
 * is an AI candidate when `repetition == "high"` AND `data_richness == "high"`
 * AND `leverage_score >= 0.5`.
 */
export const ANALYTICS_AI_CANDIDATE_DEFINITION = Object.freeze({
  repetition_key: "repetition",
  repetition_match: "high",
  richness_key: "data_richness",
  richness_match: "high",
  leverage_score_key: "leverage_score",
  leverage_min: 0.5,
});
export type AnalyticsAiCandidateDefinition = typeof ANALYTICS_AI_CANDIDATE_DEFINITION;

// ── Route table ─────────────────────────────────────────────────────────

/** The 7 BUILD-set FR-09 report route names (RD-3 verbatim), mounted under `/api/v1/analytics/`. */
export const ANALYTICS_REPORT_ROUTES = [
  "systems",
  "matrix",
  "consolidation",
  "complexity",
  "single-system-journeys",
  "critical-paths",
  "ai-candidates",
] as const;
export type AnalyticsReportRoute = (typeof ANALYTICS_REPORT_ROUTES)[number];

const reportRouteSchema = z.enum(ANALYTICS_REPORT_ROUTES);

// A report module not yet landed by its owning task returns this shape.
// Owning task replaces the branch below with its real module call.
function scaffoldPending(report: AnalyticsReportRoute): Response {
  return ok({ report, scaffold_pending: true, items: [] });
}

/**
 * Dispatches a `GET /api/v1/analytics/:report` request. `report` is the raw
 * path segment; unknown segments fall through to a 404 `not_found` envelope
 * (NFR-08 error shape). Called from `api/src/router.ts`.
 */
export async function handleAnalyticsReport(report: string): Promise<Response> {
  const parsed = reportRouteSchema.safeParse(report);
  if (!parsed.success) {
    return error(404, "not_found", "unknown analytics report", { report });
  }

  switch (parsed.data) {
    case "systems": {
      // Live via the T-20 system-map module (reads through read-only-graph).
      const map = await runSystemMap();
      return ok(map);
    }
    // Report modules land in their owning tasks (see file header); until
    // then the route is reachable with a well-formed 200 envelope.
    case "matrix":
    case "consolidation":
    case "complexity":
    case "single-system-journeys":
    case "critical-paths":
    case "ai-candidates":
      return scaffoldPending(parsed.data);
  }
}

// The read-only config resource served at `GET /api/v1/analytics/config`.
const analyticsConfigSchema = z.object({
  complexity_weights: z.object({
    depth_weight: z.number(),
    system_weight: z.number(),
    role_weight: z.number(),
  }),
  ai_candidate_definition: z.object({
    repetition_key: z.string(),
    repetition_match: z.string(),
    richness_key: z.string(),
    richness_match: z.string(),
    leverage_score_key: z.string(),
    leverage_min: z.number(),
  }),
});
export type AnalyticsConfig = z.infer<typeof analyticsConfigSchema>;

/**
 * `GET /api/v1/analytics/config` — read-only code-default config (design §10.2).
 * Validated against the config schema before it leaves the boundary so the
 * shipped shape is exactly what T-10 / T-13 rely on.
 */
export function handleAnalyticsConfig(): Response {
  const config = parseWith(analyticsConfigSchema, {
    complexity_weights: ANALYTICS_COMPLEXITY_WEIGHTS,
    ai_candidate_definition: ANALYTICS_AI_CANDIDATE_DEFINITION,
  });
  return ok(config);
}
