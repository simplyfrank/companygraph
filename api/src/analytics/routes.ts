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
import {
  withCacheEnvelope,
  getAnalyticsDbPath,
} from "./reporting/cache";
// NOTE: `runPrecompute` (scheduler.ts) is imported LAZILY inside the refresh
// branch below — a top-level import would close an eager module cycle
// (routes.ts → scheduler.ts → settings/complexity/ai-candidates.ts → routes.ts
// for the code-default `ANALYTICS_*` constants), breaking their init order.
// `cache.ts` has no back-import, so it stays a top-level import.

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
function scaffoldPendingBody(report: AnalyticsReportRoute): Record<string, unknown> {
  return { report, scaffold_pending: true, items: [] };
}

// ── DD-10 / AC-R3: degraded-envelope + `?refresh=true` wiring ────────────
//
// Each of the 7 report GETs serves its body, then that body is passed through
// `withCacheEnvelope` so a stale cache (latest `analytics_run` older than 25 h)
// adds `{ degraded:true, last_run_at }` INSIDE the NFR-08 success envelope
// (never an error). `?refresh=true` forces a fresh `runPrecompute()` first, so
// the wrapped body is non-degraded. The report body SHAPES are unchanged.

/**
 * Wrap a report body in the staleness envelope (DD-10). Guarded: the analytics
 * cache DB is initialised at server bootstrap (T-04). When it is NOT yet
 * initialised (e.g. a driver-free unit test that never boots the cache), the
 * body is returned untouched — the degraded flag simply does not apply, and no
 * `getAnalyticsDb()` "not initialised" throw escapes to the caller.
 */
function wrapEnvelope(body: Record<string, unknown>): Record<string, unknown> {
  if (getAnalyticsDbPath() === null) return body;
  return withCacheEnvelope(body);
}

/**
 * Dispatches a `GET /api/v1/analytics/:report` request. `report` is the raw
 * path segment; unknown segments fall through to a 404 `not_found` envelope
 * (NFR-08 error shape). Called from `api/src/router.ts`.
 *
 * `refresh` (from the `?refresh=true` query flag, threaded by the router)
 * forces a fresh `runPrecompute()` before the body is served + wrapped, so the
 * response is non-degraded (FR-10 / AC-R3). It defaults to `false`, so the
 * existing single-argument call sites (router, scaffold/envelope harnesses)
 * keep their behaviour.
 */
export async function handleAnalyticsReport(
  report: string,
  refresh = false,
): Promise<Response> {
  const parsed = reportRouteSchema.safeParse(report);
  if (!parsed.success) {
    return error(404, "not_found", "unknown analytics report", { report });
  }

  // FR-10: `?refresh=true` recomputes the cache before serving (single
  // execution via the DD-07 mutex). Only meaningful once the cache is booted.
  // Lazy import breaks the eager module cycle (see the import note above).
  if (refresh && getAnalyticsDbPath() !== null) {
    const { runPrecompute } = await import("./reporting/scheduler");
    await runPrecompute();
  }

  let body: Record<string, unknown>;
  switch (parsed.data) {
    case "systems": {
      // Live via the T-20 system-map module (reads through read-only-graph).
      // `SystemMap` is an interface (no index signature) — spread into a plain
      // record so it conforms to `withCacheEnvelope`'s `Record<string,unknown>`.
      body = { ...(await runSystemMap()) };
      break;
    }
    // Report modules land in their owning tasks (see file header); until
    // then the route is reachable with a well-formed 200 envelope.
    case "matrix":
    case "consolidation":
    case "complexity":
    case "single-system-journeys":
    case "critical-paths":
    case "ai-candidates":
      body = scaffoldPendingBody(parsed.data);
      break;
  }

  // DD-10: the body rides through the staleness envelope (unchanged shape when
  // fresh; `{...body, degraded:true, last_run_at}` when stale).
  return ok(wrapEnvelope(body));
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
