import type { ReactNode } from "react";
import type { Route } from "../route";

import { ExplorerDomains } from "./explorer/Domains";
import { ExplorerJourney } from "./explorer/Journey";
import { ExplorerJourneyGraph } from "./explorer/JourneyGraph";
import { ExplorerSystems } from "./explorer/Systems";
import { ExplorerPath } from "./explorer/Path";

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
  if (!surface) return <NotFound route={route} />;
  const view = surface[route.tab];
  if (!view) return <NotFound route={route} />;
  return view(route);
}

function NotFound({ route }: { route: Route }) {
  return (
    <div style={{ padding: 24, color: "var(--muted)" }}>
      Unknown route: <code>{route.surface}/{route.tab}</code>
    </div>
  );
}
