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

  // ── KPIs ──
  P("POST", "kpis", "kpi:write"),
  P("PATCH", "kpis/:id", "kpi:write"),
  P("POST", "kpis/:id", "kpi:write"),
  P("GET", "kpis/:id", "kpi:read"),

  // ── SLAs ──
  P("POST", "slas", "sla:write"),
  P("PATCH", "slas/:id", "sla:write"),
  P("POST", "slas/:id", "sla:write"),
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
