// kpi-okr-performance-dashboards T-11 / design §4.6 (FR-09) — OpenAPI
// coverage for the three read-only performance aggregate routes. Owned
// by kpi-okr-performance-dashboards; wired into getOpenApiDoc() via a
// single sanctioned two-line hook in openapi.ts (§4.7), mirroring
// openapi-kpi-okr.ts. Generated from the SAME zod definitions the
// handlers parse/respond with (shared/src/schema/performance.ts) — no
// hand-maintained copy. The kpi-trends sparkline route is already
// registered by kpi-okr-governance FR-12 and is NOT re-registered here.

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  performanceSliceQuerySchema,
  kpiStatusRowSchema,
  kpiStatusResponseSchema,
  okrDomainAssignmentSchema,
  okrPerformanceRowSchema,
  okrPerformanceResponseSchema,
  journeyAxisResponseSchema,
} from "@companygraph/shared/schema/performance";
import { errorEnvelopeSchema } from "./openapi";

export function registerPerformancePaths(registry: OpenAPIRegistry): void {
  // ── Schemas (§3.2) ─────────────────────────────────────────────────
  registry.register("PerformanceSliceQuery", performanceSliceQuerySchema);
  registry.register("KpiStatusRow", kpiStatusRowSchema);
  registry.register("KpiStatusResponse", kpiStatusResponseSchema);
  registry.register("OkrDomainAssignment", okrDomainAssignmentSchema);
  registry.register("OkrPerformanceRow", okrPerformanceRowSchema);
  registry.register("OkrPerformanceResponse", okrPerformanceResponseSchema);
  registry.register("JourneyAxisResponse", journeyAxisResponseSchema);

  const err400 = {
    description:
      "validation error — malformed domain/journey UUID (details.issues[] envelope). NOTE: an unknown `kind` is NOT a 400 — it coerces to the `all` slice (AC-03/AC-06 N-03).",
    content: { "application/json": { schema: errorEnvelopeSchema } },
  };
  const jsonOk = (schema: Parameters<OpenAPIRegistry["register"]>[1], description = "ok") => ({
    description,
    content: { "application/json": { schema } },
  });

  // ── GET /analytics/performance/kpis (FR-05, FR-02, FR-06) ──────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/performance/kpis",
    description:
      "KPI portfolio status aggregate (read-only, DD-01). ?domain=&journey=&kind= slice; status (on_target|warning|breach|no_data) computed server-side (DD-02) from the latest Neo4j :KPIMeasurement per KPI (DEC-03 — ≤ 2 Neo4j round trips, 0 Postgres). Unknown-but-well-formed domain/journey → {rows:[]}; unknown kind → the `all` slice.",
    request: { query: performanceSliceQuerySchema },
    responses: { 200: jsonOk(kpiStatusResponseSchema), 400: err400 },
  });

  // ── GET /analytics/performance/okr (FR-07, FR-03) ──────────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/performance/okr",
    description:
      "OKR roll-down performance aggregate (read-only). Per-directive key-result progress (from KeyResult.attributes_json) joined server-side with per-domain roll-down assignment status (the four as-built literals pending|committed|approved|rejected), weight, and adjustment_requested (derived from pending :RollDownAdjustment nodes, never from status — FR-03). ?domain filters directives only (N-04).",
    request: { query: performanceSliceQuerySchema },
    responses: { 200: jsonOk(okrPerformanceResponseSchema), 400: err400 },
  });

  // ── GET /analytics/performance/journeys (FR-08, DD-07) ─────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/performance/journeys",
    description:
      "Journey axis for the dashboard slicer: UserJourney nodes PART_OF the given ?domain, ordered by name. Absent or unknown domain → {rows:[]} (never every journey, never 404).",
    request: { query: performanceSliceQuerySchema },
    responses: { 200: jsonOk(journeyAxisResponseSchema), 400: err400 },
  });
}
