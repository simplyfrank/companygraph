// Surface + tab catalogue — drives the TopBar surf-nav and SubNav tabs.
// ids align with the data-view/data-tab markers in
// design/companygraph/companygraph-views.html.

export interface TabGroup {
  id: string;
  label: string;
  tabIds: string[];
}

export interface Surface {
  id: string;
  label: string;
  tabs: Array<{ id: string; label: string }>;
  groups?: TabGroup[];
}

export const SURFACES: Surface[] = [
  {
    id: "explorer", label: "Explorer",
    tabs: [
      { id: "domains",     label: "Domains" },
      { id: "journeys",    label: "Journeys" },
      { id: "activities",  label: "Activities" },
      { id: "roles",       label: "Roles" },
      { id: "systems",     label: "Systems" },
      { id: "locations",   label: "Locations" },
      { id: "path-finder", label: "Path finder" },
      { id: "review",      label: "Review" },
      { id: "add",         label: "Add" },
      { id: "quarterly",   label: "Quarterly" },
    ],
    groups: [
      { id: "browse", label: "", tabIds: ["domains","journeys","activities","roles","systems","locations","path-finder"] },
      { id: "curate", label: "", tabIds: ["review","add","quarterly"] },
    ],
  },
  {
    id: "model", label: "Model",
    tabs: [
      { id: "models",         label: "Models" },
      { id: "canvas",         label: "Canvas" },
      { id: "stories",        label: "Stories" },
      { id: "key-activities", label: "Key Activities" },
      { id: "kpi-impact",     label: "KPI Impact" },
      { id: "systems",        label: "Systems" },
      { id: "export",         label: "Export" },
    ],
  },
  {
    id: "chat", label: "Chat",
    tabs: [
      { id: "thread",         label: "Thread" },
      { id: "conversations",  label: "Conversations" },
    ],
  },
  {
    id: "insights", label: "Insights",
    tabs: [
      { id: "overview",          label: "Overview" },
      { id: "systems",           label: "Systems" },
      { id: "matrix",            label: "Matrix" },
      { id: "complexity",        label: "Complexity" },
      { id: "context-alignment", label: "Context alignment" },
      { id: "consolidation",     label: "Consolidation" },
      { id: "single-system",     label: "Single-system" },
      { id: "critical-paths",    label: "Critical paths" },
      { id: "ai",                label: "AI" },
      { id: "exec-summary",      label: "Exec summary" },
      { id: "finance",           label: "Finance" },
      { id: "people",            label: "People" },
      { id: "transform",         label: "Transform" },
      { id: "performance",       label: "Performance" },
    ],
    groups: [
      { id: "analysis", label: "", tabIds: ["overview","systems","matrix","complexity","context-alignment"] },
      { id: "reports",  label: "", tabIds: ["consolidation","single-system","critical-paths","ai","exec-summary"] },
      { id: "business",  label: "", tabIds: ["finance","people","transform","performance"] },
    ],
  },
  {
    id: "govern", label: "Govern",
    tabs: [
      { id: "kpi-management", label: "KPI Management" },
      { id: "okr-management", label: "OKR Management" },
      { id: "roll-down",      label: "Roll-down" },
      { id: "roll-down-analytics", label: "Roll-down Analytics" },
      { id: "risk",           label: "Risk" },
      { id: "compliance",     label: "Compliance" },
      { id: "programs",       label: "Programs" },
    ],
  },
  {
    id: "ontology", label: "Ontology",
    tabs: [
      { id: "catalog",    label: "Catalog" },
      { id: "erd",        label: "ERD" },
      { id: "editor",     label: "Editor" },
      { id: "edges",      label: "Edges" },
      { id: "versions",   label: "Versions" },
      { id: "audit",      label: "Audit" },
      { id: "glossary",   label: "Glossary" },
      { id: "generator",  label: "Generator" },
    ],
  },
  {
    id: "data", label: "Data",
    tabs: [
      { id: "map",       label: "Map" },
      { id: "import",    label: "Import" },
      { id: "export",    label: "Export" },
      { id: "endpoints", label: "Endpoints" },
      { id: "errors",    label: "Errors" },
    ],
  },
  {
    id: "admin", label: "Admin",
    tabs: [
      { id: "personas",   label: "Personas" },
      { id: "rbac-roles", label: "RBAC Roles" },
      { id: "users",      label: "User Assignments" },
      { id: "platform",   label: "Platform" },
      { id: "settings",   label: "Settings" },
    ],
  },
];

// Architecture: Route carries typed params parsed centrally from the hash
// query string. Views read params via the Route prop or useRouteParams()
// instead of each maintaining a local hashchange listener + URLSearchParams
// parse. This provides a single parse point, type safety, and eliminates
// the duplicated useQuery() pattern that previously appeared in every view
// that needed URL parameters.
//
// process-explorer-ui/T-08 extension: parseHash now supports 4 path
// segments plus an optional query string. The new `entityId` (3rd) and
// `mode` (4th) segments carry deep-link state for entity-detail and
// canvas routes (FR-14). Two-segment routes remain backward-compatible:
// `entityId` and `mode` are simply `undefined` when not present in the
// hash.
//
// Virtual explorer tabs (activities / roles / locations) are not in
// SURFACES (they don't appear in SubNav) but are recognised by
// parseHash so that `#/explorer/activities/:id` routes correctly.
export interface Route {
  surface: string;
  tab: string;
  entityId?: string;
  mode?: string;
  params: Readonly<Record<string, string>>;
}

export const DEFAULT_ROUTE: Route = { surface: "explorer", tab: "domains", params: {} };

const VIRTUAL_TABS: Record<string, Set<string>> = {
  explorer: new Set(["domain-detail", "product-detail"]),
};

// ────────────────────────────────────────────────────────────────────
// Alias table (FR-11, FR-13, FR-14) — permanent legacy route compatibility.
// ────────────────────────────────────────────────────────────────────

interface AliasRow {
  from: { surface: string; tab?: string };
  to: { surface: string; tab: string };
  paramTransform?: (params: Record<string, string>, entityId?: string) => {
    params?: Record<string, string>;
    entityId?: string;
    mode?: string;
  };
  bareSurfaceDefault?: boolean;
}

export const ROUTE_ALIASES: readonly AliasRow[] = [
  // sme → explorer/admin
  { from: { surface: "sme", tab: "review" },    to: { surface: "explorer", tab: "review" } },
  { from: { surface: "sme", tab: "add" },       to: { surface: "explorer", tab: "add" } },
  { from: { surface: "sme", tab: "quarterly" }, to: { surface: "explorer", tab: "quarterly" } },
  { from: { surface: "sme", tab: "home" },      to: { surface: "admin", tab: "settings" } },

  // analytics → insights
  { from: { surface: "analytics", tab: "overview" },       to: { surface: "insights", tab: "overview" } },
  { from: { surface: "analytics", tab: "systems" },        to: { surface: "insights", tab: "systems" } },
  { from: { surface: "analytics", tab: "matrix" },         to: { surface: "insights", tab: "matrix" } },
  { from: { surface: "analytics", tab: "consolidation" },  to: { surface: "insights", tab: "consolidation" } },
  { from: { surface: "analytics", tab: "complexity" },     to: { surface: "insights", tab: "complexity" } },
  { from: { surface: "analytics", tab: "single-system" },  to: { surface: "insights", tab: "single-system" } },
  { from: { surface: "analytics", tab: "critical-paths" }, to: { surface: "insights", tab: "critical-paths" } },
  { from: { surface: "analytics", tab: "ai" },             to: { surface: "insights", tab: "ai" } },
  { from: { surface: "analytics", tab: "exec-summary" },   to: { surface: "insights", tab: "exec-summary" } },

  // api → data
  { from: { surface: "api", tab: "endpoints" }, to: { surface: "data", tab: "endpoints" } },
  { from: { surface: "api", tab: "errors" },    to: { surface: "data", tab: "errors" } },
  { from: { surface: "api", tab: "import" },    to: { surface: "data", tab: "import" } },

  // exec → admin/insights/govern
  { from: { surface: "exec", tab: "ops" },             to: { surface: "admin", tab: "platform" } },
  { from: { surface: "exec", tab: "finance" },         to: { surface: "insights", tab: "finance" } },
  { from: { surface: "exec", tab: "people" },          to: { surface: "insights", tab: "people" } },
  { from: { surface: "exec", tab: "transform" },       to: { surface: "insights", tab: "transform" } },
  { from: { surface: "exec", tab: "risk" },            to: { surface: "govern", tab: "risk" } },
  { from: { surface: "exec", tab: "kpi-management" },  to: { surface: "govern", tab: "kpi-management" } },
  { from: { surface: "exec", tab: "okr-management" },  to: { surface: "govern", tab: "okr-management" } },
  { from: { surface: "exec", tab: "performance" },     to: { surface: "insights", tab: "performance" } },

  // Explorer journey merge (FR-03)
  {
    from: { surface: "explorer", tab: "journey-detail" },
    to: { surface: "explorer", tab: "journeys" },
    paramTransform: (_params, entityId) => entityId
      ? { entityId }
      : {},
  },
  {
    from: { surface: "explorer", tab: "journey-graph" },
    to: { surface: "explorer", tab: "journeys" },
    paramTransform: (params, entityId) => {
      if (entityId) {
        return { entityId, mode: "graph", params: {} };
      }
      const journeyId = params["journey"];
      if (journeyId) {
        return { entityId: journeyId, mode: "graph", params: {} };
      }
      return { params: { ...params, view: "graph" } };
    },
  },

  // Bare surface defaults
  { from: { surface: "analytics" }, to: { surface: "insights", tab: "overview" }, bareSurfaceDefault: true },
  { from: { surface: "exec" },      to: { surface: "insights", tab: "finance" },  bareSurfaceDefault: true },
  { from: { surface: "sme" },       to: { surface: "explorer", tab: "review" },   bareSurfaceDefault: true },
  { from: { surface: "api" },       to: { surface: "data", tab: "endpoints" },    bareSurfaceDefault: true },
];

function applyAliases(
  surfaceId: string,
  tabId: string,
  params: Record<string, string>,
  entityId: string | undefined,
  mode: string | undefined,
): { surfaceId: string; tabId: string; params: Record<string, string>; entityId?: string; mode?: string } {
  // Skip if surface is already a current surface AND the tab exists.
  const surface = SURFACES.find((s) => s.id === surfaceId);
  if (surface && surface.tabs.some((t) => t.id === tabId)) {
    return { surfaceId, tabId, params, entityId, mode };
  }

  // Try tab-level match first.
  for (const row of ROUTE_ALIASES) {
    if (row.bareSurfaceDefault) continue;
    if (row.from.surface === surfaceId && row.from.tab === tabId) {
      const result = { surfaceId: row.to.surface, tabId: row.to.tab, params: { ...params }, entityId, mode };
      if (row.paramTransform) {
        const transformed = row.paramTransform(params, entityId);
        if (transformed.params) result.params = transformed.params;
        if (transformed.entityId !== undefined) result.entityId = transformed.entityId;
        if (transformed.mode !== undefined) result.mode = transformed.mode;
      }
      return result;
    }
  }

  // Try bare-surface default.
  for (const row of ROUTE_ALIASES) {
    if (!row.bareSurfaceDefault) continue;
    if (row.from.surface === surfaceId) {
      return { surfaceId: row.to.surface, tabId: row.to.tab, params: { ...params }, entityId, mode };
    }
  }

  return { surfaceId, tabId, params, entityId, mode };
}

export function parseHash(hash: string): Route {
  // Strip leading "#/" then split off the optional query string.
  const raw = hash.replace(/^#\/?/, "");
  const [pathPart, queryStr] = raw.split("?") as [string, string | undefined];
  const segments = pathPart.split("/");
  let surfaceId = segments[0]!;
  let tabId = segments[1] ?? "";
  let entityId = segments[2];
  let mode = segments[3];

  const params: Record<string, string> = {};
  if (queryStr) {
    for (const [k, v] of new URLSearchParams(queryStr)) {
      params[k] = v;
    }
  }

  // Apply alias table before surface/tab resolution.
  const aliased = applyAliases(surfaceId, tabId, params, entityId, mode);
  if (aliased.surfaceId !== surfaceId || aliased.tabId !== tabId) {
    surfaceId = aliased.surfaceId;
    tabId = aliased.tabId;
    entityId = aliased.entityId;
    mode = aliased.mode;
    // Canonicalize: replace the hash silently (no extra back-stack entry).
    const canonicalHash = toHash(
      { surface: surfaceId, tab: tabId, entityId, mode },
      aliased.params,
    );
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState(null, "", canonicalHash);
    }
  }

  const surface = SURFACES.find((s) => s.id === surfaceId);
  if (!surface) return DEFAULT_ROUTE;

  // Tab resolution: prefer a real SubNav tab; otherwise accept a known
  // virtual tab; otherwise fall back to the first tab.
  let resolvedTab: string;
  const matchedTab = surface.tabs.find((t) => t.id === tabId);
  if (matchedTab) {
    resolvedTab = matchedTab.id;
  } else if (VIRTUAL_TABS[surface.id]?.has(tabId)) {
    resolvedTab = tabId;
  } else {
    resolvedTab = surface.tabs[0]!.id;
  }

  const route: Route = { surface: surface.id, tab: resolvedTab, params: aliased.params };
  if (entityId) route.entityId = entityId;
  if (mode) route.mode = mode;
  return route;
}

export function toHash(
  route: Pick<Route, "surface" | "tab"> & { entityId?: string; mode?: string },
  params?: Record<string, string>,
): string {
  let base = `#/${route.surface}/${route.tab}`;
  if (route.entityId) {
    base += `/${encodeURIComponent(route.entityId)}`;
    if (route.mode) base += `/${encodeURIComponent(route.mode)}`;
  }
  if (!params || Object.keys(params).length === 0) return base;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

export function findSurface(id: string): Surface | undefined {
  return SURFACES.find((s) => s.id === id);
}
