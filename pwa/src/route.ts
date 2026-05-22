// Surface + tab catalogue — drives the TopBar surf-nav and SubNav tabs.
// ids align with the data-view/data-tab markers in
// design/companygraph/companygraph-views.html.

export interface Surface {
  id: string;
  label: string;
  kbd: string;
  tabs: Array<{ id: string; label: string }>;
}

export const SURFACES: Surface[] = [
  {
    id: "explorer", label: "Explorer", kbd: "1",
    tabs: [
      { id: "domains",        label: "Domains" },
      { id: "journey-detail", label: "Journey detail" },
      { id: "journey-graph",  label: "Journey graph" },
      { id: "systems",        label: "Systems" },
      { id: "path-finder",    label: "Path finder" },
    ],
  },
  {
    id: "chat", label: "Chat", kbd: "2",
    tabs: [{ id: "thread", label: "Thread" }],
  },
  {
    id: "ontology", label: "Ontology", kbd: "3",
    tabs: [
      { id: "catalog",  label: "Catalog" },
      { id: "erd",      label: "ERD" },
      { id: "editor",   label: "Editor" },
      { id: "edges",    label: "Edges" },
      { id: "versions", label: "Versions" },
      { id: "audit",    label: "Audit" },
    ],
  },
  {
    id: "sme", label: "SME", kbd: "4",
    tabs: [
      { id: "review",    label: "Review" },
      { id: "add",       label: "Add" },
      { id: "quarterly", label: "Quarterly" },
    ],
  },
  {
    id: "analytics", label: "Analytics", kbd: "5",
    tabs: [
      { id: "overview",   label: "Overview" },
      { id: "matrix",     label: "Matrix" },
      { id: "complexity", label: "Complexity" },
      { id: "ai",         label: "AI" },
    ],
  },
  {
    id: "api", label: "API", kbd: "6",
    tabs: [
      { id: "endpoints", label: "Endpoints" },
      { id: "errors",    label: "Errors" },
      { id: "import",    label: "Import" },
    ],
  },
  {
    id: "exec", label: "Exec", kbd: "7",
    tabs: [
      { id: "ops",       label: "Ops" },
      { id: "finance",   label: "Finance" },
      { id: "people",    label: "People" },
      { id: "transform", label: "Transform" },
      { id: "risk",      label: "Risk" },
    ],
  },
  {
    id: "data", label: "Data", kbd: "8",
    tabs: [
      { id: "map",    label: "Map" },
      { id: "export", label: "Export" },
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

const EXPLORER_VIRTUAL_TABS = new Set(["activities", "roles", "locations"]);

export function parseHash(hash: string): Route {
  // Strip leading "#/" then split off the optional query string.
  const raw = hash.replace(/^#\/?/, "");
  const [pathPart, queryStr] = raw.split("?") as [string, string | undefined];
  const segments = pathPart.split("/");
  const surfaceId = segments[0];
  const tabId = segments[1] ?? "";
  const entityId = segments[2];
  const mode = segments[3];

  const surface = SURFACES.find((s) => s.id === surfaceId);
  if (!surface) return DEFAULT_ROUTE;

  // Tab resolution: prefer a real SubNav tab; otherwise accept a known
  // virtual explorer tab; otherwise fall back to the first tab.
  let resolvedTab: string;
  const matchedTab = surface.tabs.find((t) => t.id === tabId);
  if (matchedTab) {
    resolvedTab = matchedTab.id;
  } else if (surface.id === "explorer" && EXPLORER_VIRTUAL_TABS.has(tabId)) {
    resolvedTab = tabId;
  } else {
    resolvedTab = surface.tabs[0]!.id;
  }

  const params: Record<string, string> = {};
  if (queryStr) {
    for (const [k, v] of new URLSearchParams(queryStr)) {
      params[k] = v;
    }
  }

  const route: Route = { surface: surface.id, tab: resolvedTab, params };
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
