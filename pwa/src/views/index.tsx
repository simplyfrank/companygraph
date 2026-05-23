import type { ReactNode } from "react";
import type { Route } from "../route";
import { NotFoundPanel } from "./_shared";

import { ExplorerDomains } from "./explorer/Domains";
import { ExplorerJourney } from "./explorer/Journey";
import { ExplorerJourneyGraph } from "./explorer/JourneyGraph";
import { ExplorerSystems } from "./explorer/Systems";
import { ExplorerPath } from "./explorer/Path";
import { ExplorerActivities } from "./explorer/Activities";
import { ExplorerRoles } from "./explorer/Roles";
import { ExplorerLocations } from "./explorer/Locations";

import { ChatThread } from "./chat/Thread";

import { OntologyCatalog } from "./ontology/Catalog";
import { OntologyErd } from "./ontology/Erd";
import { OntologyEditor } from "./ontology/Editor";
import { OntologyEdges } from "./ontology/Edges";
import { OntologyVersions } from "./ontology/Versions";
import { OntologyAudit } from "./ontology/Audit";

import { SmeReview } from "./sme/Review";
import { SmeAdd } from "./sme/Add";
import { SmeQuarterly } from "./sme/Quarterly";
import { SmeHome } from "./sme/Home";

import { AnalyticsOverview } from "./analytics/Overview";
import { AnalyticsMatrix } from "./analytics/Matrix";
import { AnalyticsComplexity } from "./analytics/Complexity";
import { AnalyticsAi } from "./analytics/Ai";

import { ApiEndpoints } from "./api/Endpoints";
import { ApiErrors } from "./api/Errors";
import { ApiImport } from "./api/Import";

import { ExecOps } from "./exec/Ops";
import { ExecFinance } from "./exec/Finance";
import { ExecPeople } from "./exec/People";
import { ExecTransform } from "./exec/Transform";
import { ExecRisk } from "./exec/Risk";

import { DataMap } from "./data/Map";
import { DataExport } from "./data/Export";

type ViewMap = Record<string, Record<string, (route: Route) => ReactNode>>;

const VIEWS: ViewMap = {
  explorer: {
    "domains":        (r) => <ExplorerDomains route={r} />,
    "journey-detail": (r) => <ExplorerJourney route={r} />,
    "journey-graph":  (r) => <ExplorerJourneyGraph route={r} />,
    "systems":        () => <ExplorerSystems />,
    "path-finder":    () => <ExplorerPath />,
    // Virtual explorer tabs — not in SURFACES (no SubNav entry) but
    // routable via parseHash's EXPLORER_VIRTUAL_TABS allowlist. Each
    // file handles its own list + detail split via route.entityId.
    "activities":     (r) => <ExplorerActivities route={r} />,
    "roles":          (r) => <ExplorerRoles route={r} />,
    "locations":      (r) => <ExplorerLocations route={r} />,
  },
  chat: {
    thread: () => <ChatThread />,
  },
  ontology: {
    catalog:  () => <OntologyCatalog />,
    erd:      () => <OntologyErd />,
    editor:   () => <OntologyEditor />,
    edges:    () => <OntologyEdges />,
    versions: () => <OntologyVersions />,
    audit:    () => <OntologyAudit />,
  },
  sme: {
    review:    () => <SmeReview />,
    add:       () => <SmeAdd />,
    quarterly: () => <SmeQuarterly />,
    home:      () => <SmeHome />,
  },
  analytics: {
    overview:   () => <AnalyticsOverview />,
    matrix:     () => <AnalyticsMatrix />,
    complexity: () => <AnalyticsComplexity />,
    ai:         () => <AnalyticsAi />,
  },
  api: {
    endpoints: () => <ApiEndpoints />,
    errors:    () => <ApiErrors />,
    import:    () => <ApiImport />,
  },
  exec: {
    ops:       () => <ExecOps />,
    finance:   () => <ExecFinance />,
    people:    () => <ExecPeople />,
    transform: () => <ExecTransform />,
    risk:      () => <ExecRisk />,
  },
  data: {
    map:    () => <DataMap />,
    export: () => <DataExport />,
  },
};

export function renderView(route: Route): ReactNode {
  const surface = VIEWS[route.surface];
  if (!surface) return <NotFoundPanel route={route} />;
  const view = surface[route.tab];
  if (!view) return <NotFoundPanel route={route} />;
  return view(route);
}
