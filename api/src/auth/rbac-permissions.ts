// RBAC Permission Mapping for API Routes
// Uses segment-based pattern matching where ":param" matches any single path segment.
// More specific routes must be listed before parameterized ones.

interface RoutePermission {
  method: string;
  segments: string[];
  permission: string;
}

const P = (method: string, path: string, permission: string): RoutePermission => ({
  method,
  segments: path.split("/"),
  permission,
});

// Ordered list — specific routes before parameterized ones.
const ROUTE_PERMISSIONS: RoutePermission[] = [
  // ── Public routes ──
  P("GET", "healthz", "public"),
  P("GET", "openapi.json", "public"),
  P("GET", "metrics", "public"),
  P("GET", "auth/login", "public"),
  P("GET", "auth/callback", "public"),
  P("POST", "auth/logout", "public"),

  // ── Auth ──
  P("GET", "auth/me", "auth:read"),

  // ── Stats / Analytics ──
  P("GET", "stats", "analytics:read"),
  P("GET", "analytics/graph", "analytics:read"),

  // ── Performance dashboards ──
  // kpi-okr-performance-dashboards (design §4.7) — SECURITY-CRITICAL:
  // the router gate SKIPS the permission check when getRoutePermission
  // returns null, so each new route lands with its entry in the SAME
  // task as its dispatch (same-task pairing). Guarded by analytics:read,
  // the same permission the analytics/graph read uses.
  P("GET", "analytics/performance/kpis", "analytics:read"),
  P("GET", "analytics/performance/okr", "analytics:read"),
  P("GET", "analytics/performance/journeys", "analytics:read"),

  // ── Import / Export / Snapshot ──
  P("POST", "import", "data:write"),
  P("GET", "export", "export:read"),
  P("GET", "export.ndjson", "export:read"),
  P("GET", "snapshot", "export:read"),

  // ── Nodes ──
  P("POST", "nodes/:label", "node:write"),
  P("GET", "nodes/:label/:id", "node:read"),
  P("PATCH", "nodes/:label/:id", "node:write"),
  P("DELETE", "nodes/:label/:id", "node:write"),

  // ── Edges ──
  P("POST", "edges", "edge:write"),
  P("DELETE", "edges/:id", "edge:write"),

  // ── Query ──
  P("GET", "query/listDomains", "query:read"),
  P("GET", "query/getDomain/:id", "query:read"),
  P("GET", "query/getJourney/:id", "query:read"),
  P("GET", "query/getActivity/:id", "query:read"),
  P("GET", "query/findPath", "query:read"),
  P("GET", "query/neighbors/:id", "query:read"),
  P("POST", "query/cypher", "query:read"),
  P("GET", "query/search", "query:read"),
  P("GET", "query/journeyHealth/:id", "query:read"),
  P("GET", "query/journeyOwnership/:id", "query:read"),
  P("GET", "query/journeyActivities/:id", "query:read"),
  P("GET", "query/journeyRoles/:id", "query:read"),
  P("GET", "query/journeySystems/:id", "query:read"),
  P("GET", "query/journeyHandoffs/:id", "query:read"),
  P("GET", "query/journeyTouchpoints/:id", "query:read"),

  // ── Chat ──
  P("POST", "chat/messages", "chat:write"),
  P("GET", "chat/messages/:id/progress", "chat:read"),
  P("POST", "chat/bookmarks", "chat:write"),
  P("GET", "chat/bookmarks", "chat:read"),
  P("DELETE", "chat/bookmarks/:id", "chat:write"),

  // ── Ontology ──
  P("GET", "schema", "ontology:read"),
  P("GET", "ontology/node-labels", "ontology:read"),
  P("POST", "ontology/node-labels", "ontology:write"),
  P("GET", "ontology/node-labels/:name", "ontology:read"),
  P("PATCH", "ontology/node-labels/:name", "ontology:write"),
  P("DELETE", "ontology/node-labels/:name", "ontology:write"),
  P("GET", "ontology/edge-types", "ontology:read"),
  P("POST", "ontology/edge-types", "ontology:write"),
  P("GET", "ontology/edge-types/:name", "ontology:read"),
  P("PATCH", "ontology/edge-types/:name", "ontology:write"),
  P("DELETE", "ontology/edge-types/:name", "ontology:write"),
  P("GET", "ontology/audit", "ontology:read"),
  P("GET", "ontology/versions", "ontology:read"),
  P("POST", "ontology/import", "ontology:write"),
  P("GET", "ontology/events", "ontology:read"),
  P("POST", "ontology/migrations", "ontology:write"),
  P("GET", "ontology/export", "ontology:read"),
  P("GET", "ontology/bounded-contexts", "ontology:read"),
  P("GET", "ontology/shared-domains", "ontology:read"),
  P("GET", "ontology/namespaces", "ontology:read"),
  P("POST", "ontology/rollback/:version_id", "ontology:write"),
  P("GET", "ontology/rdf", "ontology:read"),
  P("POST", "ontology/rdf", "ontology:write"),
  P("POST", "ontology/query", "ontology:read"),

  // ── Glossary ──
  P("GET", "glossary/collections", "ontology:read"),
  P("POST", "glossary/collections", "ontology:write"),
  P("GET", "glossary/collections/:id", "ontology:read"),
  P("PATCH", "glossary/collections/:id", "ontology:write"),
  P("DELETE", "glossary/collections/:id", "ontology:write"),
  P("GET", "glossary/terms", "ontology:read"),
  P("POST", "glossary/terms", "ontology:write"),
  P("GET", "glossary/terms/:id", "ontology:read"),
  P("PATCH", "glossary/terms/:id", "ontology:write"),
  P("DELETE", "glossary/terms/:id", "ontology:write"),

  // ── Ontology proposals ──
  P("GET", "ontology/proposals", "ontology:read"),
  P("POST", "ontology/proposals", "ontology:write"),
  P("GET", "ontology/proposals/:id", "ontology:read"),
  P("PATCH", "ontology/proposals/:id", "ontology:write"),
  P("DELETE", "ontology/proposals/:id", "ontology:write"),

  // ── Compliance ──
  P("GET", "compliance/rules", "compliance:read"),
  P("POST", "compliance/rules", "compliance:write"),
  P("POST", "compliance/rules/evaluate", "compliance:read"),
  P("GET", "compliance/rules/:id", "compliance:read"),
  P("PATCH", "compliance/rules/:id", "compliance:write"),
  P("DELETE", "compliance/rules/:id", "compliance:write"),

  // ── Change requests ──
  P("GET", "change-requests", "change_request:read"),
  P("POST", "change-requests", "change_request:write"),
  P("GET", "change-requests/:id", "change_request:read"),
  P("PATCH", "change-requests/:id", "change_request:write"),
  P("DELETE", "change-requests/:id", "change_request:write"),
  P("POST", "change-requests/:id/reviews", "change_request:review"),
  P("POST", "change-requests/:id/sign-offs", "change_request:review"),

  // ── Risk register ──
  P("GET", "risk-register", "risk:read"),
  P("POST", "risk-register", "risk:write"),
  P("GET", "risk-register/:id", "risk:read"),
  P("PATCH", "risk-register/:id", "risk:write"),
  P("DELETE", "risk-register/:id", "risk:write"),
  P("GET", "risk-register/aggregation/domain", "risk:read"),
  P("GET", "risk-register/aggregation/owner", "risk:read"),
  P("GET", "risk-register/aggregation/category", "risk:read"),
  P("GET", "risk-register/aggregation/risk-type", "risk:read"),
  P("GET", "risk-register/aggregation/summary", "risk:read"),

  // ── Risk & Compliance ──
  P("GET", "risk-compliance/regulated-activity-inventory", "risk:read"),
  P("GET", "risk-compliance/sod-violations", "risk:read"),
  P("GET", "risk-compliance/third-party-register", "risk:read"),

  // ── RBAC roles ──
  P("GET", "rbac-roles", "rbac:read"),
  P("POST", "rbac-roles", "rbac:write"),
  P("GET", "rbac-roles/:id", "rbac:read"),
  P("PATCH", "rbac-roles/:id", "rbac:write"),
  P("DELETE", "rbac-roles/:id", "rbac:write"),

  // ── Personas ──
  P("GET", "personas", "persona:read"),
  P("POST", "personas", "persona:write"),
  P("GET", "personas/:id", "persona:read"),
  P("PATCH", "personas/:id", "persona:write"),
  P("DELETE", "personas/:id", "persona:write"),
  P("GET", "personas/:id/permissions", "persona:read"),
  P("POST", "personas/:id/rbac-roles", "persona:write"),
  P("DELETE", "personas/:personaId/rbac-roles/:rbacRoleId", "persona:write"),

  // ── Persona assignments ──
  P("GET", "persona-assignments", "persona:read"),
  P("POST", "persona-assignments", "persona:write"),
  P("DELETE", "persona-assignments/:id", "persona:write"),

  // ── User-Persona assignments ──
  P("GET", "users/:userId/personas", "user:read"),
  P("POST", "users/:userId/personas", "user:write"),
  P("PATCH", "users/:userId/personas/:personaId", "user:write"),
  P("DELETE", "users/:userId/personas/:personaId", "user:write"),

  // ── Domains ──
  P("POST", "domains", "domain:write"),
  P("GET", "domains", "domain:read"), // kpi-okr-governance FR-10d list
  P("PATCH", "domains/:id", "domain:write"),
  P("POST", "domains/:id", "domain:write"),
  P("GET", "domains/:id", "domain:read"),

  // ── Journeys ──
  P("POST", "journeys", "journey:write"),
  P("PATCH", "journeys/:id", "journey:write"),
  P("POST", "journeys/:id", "journey:write"),
  P("GET", "journeys/:id", "journey:read"),
  P("GET", "journeys/:id/versions", "journey:read"),
  P("POST", "journeys/:id/rollback/:versionId", "journey:write"),
  P("GET", "journeys/:id/changes", "journey:read"),

  // ── KPIs ── (kpi-okr-governance §4.10 — list + subpaths added; the
  // stale POST kpis/:id row for the DEC-01-retired archive overload is
  // removed so a permission mapping never points at a 404 route)
  P("POST", "kpis", "kpi:write"),
  P("GET", "kpis", "kpi:read"),
  P("POST", "kpis/:id/archive", "kpi:write"),
  P("GET", "kpis/:id/audit", "kpi:read"),
  P("PATCH", "kpis/:id", "kpi:write"),
  P("GET", "kpis/:id", "kpi:read"),

  // ── SLAs ── (kpi-okr-governance §4.10 — mirror of the KPI section;
  // stale POST slas/:id overload row removed per DEC-01)
  P("POST", "slas", "sla:write"),
  P("GET", "slas", "sla:read"),
  P("POST", "slas/:id/archive", "sla:write"),
  P("GET", "slas/:id/audit", "sla:read"),
  P("PATCH", "slas/:id", "sla:write"),
  P("GET", "slas/:id", "sla:read"),

  // ── KPI alignments ──
  P("POST", "kpi-alignments", "kpi:write"),
  P("GET", "kpi-alignments", "kpi:read"),
  P("DELETE", "kpi-alignments/:id", "kpi:write"),

  // ── SLA alignments ──
  P("POST", "sla-alignments", "sla:write"),
  P("GET", "sla-alignments", "sla:read"),
  P("DELETE", "sla-alignments/:id", "sla:write"),

  // ── KPI measurements ──
  P("POST", "kpi-measurements", "kpi:write"),
  P("GET", "kpi-measurements", "kpi:read"),
  P("GET", "kpi-measurements/:id", "kpi:read"),
  P("DELETE", "kpi-measurements/:id", "kpi:write"),

  // ── KPI parameter bindings (kpi-measurement-alignment FR-09, FR-18) ──
  P("POST", "kpis/:id/param-bindings", "kpi:write"),
  P("GET", "kpis/:id/param-bindings", "kpi:read"),
  P("DELETE", "param-bindings/:id", "kpi:write"),

  // ── KPI reconciliation (kpi-measurement-alignment FR-11, FR-18) ──
  P("POST", "kpis/:id/reconcile", "kpi:write"),
  P("POST", "kpis/reconcile-all", "kpi:write"),

  // ── SLA breaches ──
  P("POST", "sla-breaches", "sla:write"),
  P("GET", "sla-breaches", "sla:read"),
  P("GET", "sla-breaches/:id", "sla:read"),
  P("PATCH", "sla-breaches/:id", "sla:write"),
  P("DELETE", "sla-breaches/:id", "sla:write"),

  // ── KPI trends ──
  P("GET", "kpi-trends/:id", "kpi:read"),

  // ── SLA compliance ──
  P("GET", "sla-compliance/all", "sla:read"),
  P("GET", "sla-compliance/domain/:domainId", "sla:read"),
  P("GET", "sla-compliance/:id", "sla:read"),

  // ── OKR directives ──
  P("POST", "okr-directives", "okr:write"),
  P("GET", "okr-directives", "okr:read"),
  P("PATCH", "okr-directives/:id", "okr:write"),
  P("DELETE", "okr-directives/:id", "okr:write"),

  // ── Key results ──
  P("POST", "key-results", "okr:write"),
  P("GET", "key-results", "okr:read"),
  P("PATCH", "key-results/:id", "okr:write"),
  P("DELETE", "key-results/:id", "okr:write"),

  // ── OKR performance ──
  P("GET", "okr-performance", "okr:read"),

  // ── Business models + modules (model-workspace-core T-13 / FR-12) ──
  // Specific before parameterized (matchSegments rejects on segment
  // count first, so ordering only bites same-length literal-vs-param
  // rows — kept as forward-proofing). SECURITY-CRITICAL property: every
  // new route has a row — an unmapped route returns null from
  // getRoutePermission and the router then SKIPS the RBAC check
  // entirely (silent open write). No route here is `public`.
  P("POST", "models", "model:write"),
  P("GET", "models", "model:read"),
  P("POST", "models/:id/domains", "model:write"),
  P("POST", "models/:id/archive", "model:write"),
  P("POST", "models/:modelId/module-instances", "module:write"),
  P("GET", "models/:modelId/module-instances", "module:read"),
  P("PATCH", "models/:modelId/module-instances/:instanceId/nodes/:nodeId", "module:write"),
  P("POST", "models/:modelId/module-instances/:instanceId/edges", "module:write"),
  P("DELETE", "models/:modelId/module-instances/:instanceId/edges", "module:write"),
  P("POST", "models/:modelId/module-instances/:instanceId/fork", "module:write"),
  P("POST", "models/:modelId/module-instances/:instanceId/upgrade", "module:write"),
  // ── User stories + acceptance criteria (story-spec-core T-11 / FR-11) ──
  // Ten rows, one per route (design §4.8) — specific (bootstrap +
  // acceptance-criteria) before the parameterized :storyId rows, and all
  // BEFORE model-workspace-core's models/:id rows per the house
  // convention. GETs → story:read; POST/PATCH/DELETE/bootstrap →
  // story:write. No route is public; auth stays in the central gate
  // (NFR-05 — never a per-route check).
  P("GET", "models/:modelId/stories", "story:read"),
  P("POST", "models/:modelId/stories", "story:write"),
  P("POST", "models/:modelId/stories/bootstrap", "story:write"),
  P("GET", "models/:modelId/stories/:storyId/acceptance-criteria", "story:read"),
  P("POST", "models/:modelId/stories/:storyId/acceptance-criteria", "story:write"),
  P("PATCH", "models/:modelId/stories/:storyId/acceptance-criteria/:acId", "story:write"),
  P("DELETE", "models/:modelId/stories/:storyId/acceptance-criteria/:acId", "story:write"),
  P("GET", "models/:modelId/stories/:storyId", "story:read"),
  P("PATCH", "models/:modelId/stories/:storyId", "story:write"),
  P("DELETE", "models/:modelId/stories/:storyId", "story:write"),
  // ── Key activities (key-activity-optimizer T-09 / FR-11) ──
  // Three rows, one per route (design §4.8) — specific-before-
  // parameterized, BEFORE model-workspace-core's models/:id rows per
  // the house convention (matchSegments rejects on segment count first,
  // so the 3-/5-segment rows never collide with models/:id anyway).
  // SECURITY-CRITICAL: every new route has a row — an unmapped route
  // returns null from getRoutePermission and the router then SKIPS the
  // RBAC check (silent open write). No route is public; auth stays in
  // the central gate (NFR-06 — never a per-route check).
  P("GET", "models/:modelId/key-activities", "key_activity:read"),
  P("POST", "models/:modelId/key-activities/:activityId/mark", "key_activity:write"),
  P("DELETE", "models/:modelId/key-activities/:activityId/mark", "key_activity:write"),
  // ── Capabilities + system-model (ddd-system-modeling T-08 / FR-11) ──
  // Thirteen rows, one per route (design §4.8) — ordering is house
  // convention + forward-proofing (DD-10: matchSegments rejects on
  // segment count first, so no same-length shadowing exists here).
  // SECURITY-CRITICAL: every new route has a row — an unmapped route
  // returns null from getRoutePermission and the router then SKIPS the
  // RBAC check (silent open write). The three P("PUT",…) rows are the
  // table's first PUT entries (DD-11 — rp.method is a plain string
  // compare, no matcher change). No route is public; auth stays in the
  // central gate (NFR-05 — never a per-route check).
  P("GET", "models/:modelId/system-model/gaps", "capability:read"),
  P("GET", "models/:modelId/system-model/context-map", "capability:read"),
  P("GET", "models/:modelId/capabilities", "capability:read"),
  P("POST", "models/:modelId/capabilities", "capability:write"),
  P("PUT", "models/:modelId/capabilities/:capabilityId/needed-by", "capability:write"),
  P("DELETE", "models/:modelId/capabilities/:capabilityId/needed-by", "capability:write"),
  P("PUT", "models/:modelId/capabilities/:capabilityId/supported-by", "capability:write"),
  P("DELETE", "models/:modelId/capabilities/:capabilityId/supported-by/:systemId", "capability:write"),
  P("PUT", "models/:modelId/capabilities/:capabilityId/context", "capability:write"),
  P("DELETE", "models/:modelId/capabilities/:capabilityId/context", "capability:write"),
  P("GET", "models/:modelId/capabilities/:capabilityId", "capability:read"),
  P("PATCH", "models/:modelId/capabilities/:capabilityId", "capability:write"),
  P("DELETE", "models/:modelId/capabilities/:capabilityId", "capability:write"),
  // ── Spec export (requirements-export T-05b / FR-07) ──
  // One read-only route, specific-before-parameterized, BEFORE
  // model-workspace-core's models/:id rows. SECURITY-CRITICAL: an
  // unmapped route returns null → router SKIPS the RBAC check (silent
  // open read). No route is public; auth stays in the central gate.
  P("GET", "models/:modelId/spec-export", "spec_export:read"),
  // ── Authoring (business-model-authoring T-12 / FR-14) ──
  // Three rows for the DD-06 route set. The PATCH domain row is a
  // sibling of mwc's models/:id/domains POST row (same model:write).
  // SECURITY-CRITICAL: an unmapped route returns null → router SKIPS
  // the RBAC check (silent open write). No route is public.
  P("POST", "models/:modelId/authoring/apply", "model:write"),
  P("GET", "models/:modelId/authoring/graph", "model:read"),
  P("PATCH", "models/:id/domains/:domainId", "model:write"),
  // ── KPI impact mapping (kpi-impact-mapping T-07 / FR-11) ──
  // Eight rows, specific-before-parameterized, BEFORE model-workspace-core's
  // models/:id rows. SECURITY-CRITICAL: an unmapped route returns null →
  // router SKIPS the RBAC check (silent open write). No route is public.
  P("GET", "models/:modelId/kpi-impact/matrix", "kpi_impact:read"),
  P("GET", "models/:modelId/kpi-impact/rollup", "kpi_impact:read"),
  P("GET", "models/:modelId/kpi-impact/activity-links", "kpi_impact:read"),
  P("POST", "models/:modelId/kpi-impact/activity-links", "kpi_impact:write"),
  P("DELETE", "models/:modelId/kpi-impact/activity-links/:linkId", "kpi_impact:write"),
  P("GET", "models/:modelId/kpi-impact/story-links", "kpi_impact:read"),
  P("POST", "models/:modelId/kpi-impact/story-links", "kpi_impact:write"),
  P("DELETE", "models/:modelId/kpi-impact/story-links/:linkId", "kpi_impact:write"),
  P("GET", "models/:id", "model:read"),
  P("PATCH", "models/:id", "model:write"),
  P("DELETE", "models/:id", "model:write"),
  P("POST", "modules", "module:write"),
  P("GET", "modules", "module:read"),
  P("POST", "modules/:id/versions", "module:write"),
  P("GET", "modules/:id/versions", "module:read"),

  // ── Roll-down — specific paths before parameterized ──
  P("POST", "roll-down/kpi", "kpi:write"),
  P("GET", "roll-down/kpi", "kpi:read"),
  P("POST", "roll-down/kpi/product", "kpi:write"),
  P("GET", "roll-down/kpi/product/:domainId", "kpi:read"),
  P("POST", "roll-down/kpi/program", "kpi:write"),
  P("GET", "roll-down/kpi/program/:programId", "kpi:read"),
  P("GET", "roll-down/kpi/:domainId", "kpi:read"),
  P("POST", "roll-down/okr", "okr:write"),
  P("GET", "roll-down/okr", "okr:read"),
  P("POST", "roll-down/okr/product", "okr:write"),
  P("GET", "roll-down/okr/product/:domainId", "okr:read"),
  P("POST", "roll-down/okr/program", "okr:write"),
  P("GET", "roll-down/okr/program/:programId", "okr:read"),
  P("GET", "roll-down/okr/:domainId", "okr:read"),
  P("POST", "roll-down/sla/domain", "sla:write"),
  P("GET", "roll-down/sla/domain/:domainId", "sla:read"),
  P("POST", "roll-down/commit", "kpi:write"),
  P("POST", "roll-down/adjustment", "kpi:write"),
  P("GET", "roll-down/contributions", "kpi:read"),
  P("GET", "roll-down/contributions/:domainId", "kpi:read"),
  P("POST", "roll-down/approve", "kpi:write"),
  P("POST", "roll-down/reject", "kpi:write"),
  P("POST", "roll-down/notify", "kpi:write"),
];

function matchSegments(pattern: string[], path: string[]): boolean {
  if (pattern.length !== path.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i]!.startsWith(":")) continue;
    if (pattern[i] !== path[i]) return false;
  }
  return true;
}

/**
 * Get required permission for a route.
 * Strips the /api/v1/ prefix and matches against the route table.
 */
export function getRoutePermission(method: string, path: string): string | null {
  const sub = path.startsWith("/api/v1/") ? path.slice("/api/v1/".length) : path;
  const segments = sub.split("/");
  const upperMethod = method.toUpperCase();

  for (const rp of ROUTE_PERMISSIONS) {
    if (rp.method === upperMethod && matchSegments(rp.segments, segments)) {
      return rp.permission;
    }
  }
  return null;
}

/**
 * Check if a route is public (no authentication required)
 */
export function isPublicRoute(method: string, path: string): boolean {
  return getRoutePermission(method, path) === "public";
}
