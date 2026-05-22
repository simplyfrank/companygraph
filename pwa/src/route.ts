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
export interface Route {
  surface: string;
  tab: string;
  params: Readonly<Record<string, string>>;
}

export const DEFAULT_ROUTE: Route = { surface: "explorer", tab: "domains", params: {} };

export function parseHash(hash: string): Route {
  const m = hash.replace(/^#\/?/, "").split("/");
  const surfaceId = m[0];
  const tabAndQuery = m[1] ?? "";
  const [tabId, queryStr] = tabAndQuery.split("?") as [string, string | undefined];
  const surface = SURFACES.find((s) => s.id === surfaceId);
  if (!surface) return DEFAULT_ROUTE;
  const tab = surface.tabs.find((t) => t.id === tabId) ?? surface.tabs[0];
  const params: Record<string, string> = {};
  if (queryStr) {
    for (const [k, v] of new URLSearchParams(queryStr)) {
      params[k] = v;
    }
  }
  return { surface: surface.id, tab: tab!.id, params };
}

export function toHash(route: Pick<Route, "surface" | "tab">, params?: Record<string, string>): string {
  const base = `#/${route.surface}/${route.tab}`;
  if (!params || Object.keys(params).length === 0) return base;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

export function findSurface(id: string): Surface | undefined {
  return SURFACES.find((s) => s.id === id);
}
