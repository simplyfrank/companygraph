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
import { DomainDetail } from "./explorer/DomainDetail";
import { ProductDetail } from "./explorer/ProductDetail";

import { ChatThread } from "./chat/Thread";

import { OntologyCatalog } from "./ontology/Catalog";
import { OntologyErd } from "./ontology/Erd";
import { ErdErrorBoundary } from "./ontology/ErdErrorBoundary";
import { OntologyEditor } from "./ontology/Editor";
import { OntologyEdges } from "./ontology/Edges";
import { OntologyVersions } from "./ontology/Versions";
import { OntologyAudit } from "./ontology/Audit";

import { SmeReview } from "./sme/Review";
import { SmeAdd } from "./sme/Add";
import { SmeQuarterly } from "./sme/Quarterly";
import { SmeHome } from "./sme/Home";

import { AnalyticsOverview } from "./analytics/Overview";
import { AnalyticsSystems } from "./analytics/Systems";
import { AnalyticsMatrix } from "./analytics/Matrix";
import { AnalyticsConsolidation } from "./analytics/Consolidation";
import { AnalyticsSingleSystem } from "./analytics/SingleSystem";
import { AnalyticsCriticalPaths } from "./analytics/CriticalPaths";
import { AnalyticsComplexity } from "./analytics/Complexity";
import { AnalyticsExecSummary } from "./analytics/ExecSummary";
import { AnalyticsAi } from "./analytics/Ai";

import { ApiEndpoints } from "./api/Endpoints";
import { ApiErrors } from "./api/Errors";
import { ApiImport } from "./api/Import";

import { ExecOps } from "./exec/Ops";
import { ExecFinance } from "./exec/Finance";
import { ExecPeople } from "./exec/People";
import { ExecTransform } from "./exec/Transform";
import { ExecRisk } from "./exec/Risk";
import { ExecKpiManagement } from "./exec/KpiManagement";
import { ExecOkrManagement } from "./exec/OkrManagement";
// kpi-okr-performance-dashboards T-14 (FR-01): the Performance exec tab.
import { PerformanceDashboard } from "./exec/PerformanceDashboard";

import { DataMap } from "./data/Map";
import { DataExport } from "./data/Export";

import { ModelWorkspace } from "./model/ModelWorkspace";
import { ModelTabPlaceholder } from "./model/ModelTabPlaceholder";
import { StoryCatalog } from "./model/StoryCatalog";
import { KeyActivityBoard } from "./model/KeyActivityBoard";
import { SystemModeler } from "./model/SystemModeler";
import { KpiImpactMatrix } from "./model/KpiImpactMatrix";
import { ModelCanvas } from "./model/ModelCanvas";
import { SpecExport } from "./model/SpecExport";

import { AdminPersonas } from "./admin/Personas";
import { AdminRbacRoles } from "./admin/RbacRoles";
import { AdminUserAssignments } from "./admin/UserAssignments";

// cto-analytics T-09 seam (retired): the FR-05/FR-06 report tabs were
// registered here (RD-3 route names) so `#/analytics/single-system` and
// `#/analytics/critical-paths` resolved before their views existed. Both views
// have since landed (T-11 / T-12), so the pending-seam placeholder is removed;
// the tabs now render their real reports below.

type ViewMap = Record<string, Record<string, (route: Route) => ReactNode>>;

const VIEWS: ViewMap = {
  explorer: {
    "domains":        (r) => <ExplorerDomains route={r} />,
    "journey-detail": (r) => <ExplorerJourney route={r} />,
    "journey-graph":  (r) => <ExplorerJourneyGraph route={r} />,
    "systems":        (r) => <ExplorerSystems route={r} />,
    "path-finder":    () => <ExplorerPath />,
    // Virtual explorer tabs — not in SURFACES (no SubNav entry) but
    // routable via parseHash's EXPLORER_VIRTUAL_TABS allowlist. Each
    // file handles its own list + detail split via route.entityId.
    "activities":     (r) => <ExplorerActivities route={r} />,
    "roles":          (r) => <ExplorerRoles route={r} />,
    "locations":      (r) => <ExplorerLocations route={r} />,
    "domain-detail":  (r) => <DomainDetail route={r} />,
    "product-detail": (r) => <ProductDetail productId={r.entityId || ""} />,
  },
  chat: {
    thread: () => <ChatThread />,
  },
  ontology: {
    catalog:  () => <OntologyCatalog />,
    erd:      () => <ErdErrorBoundary><OntologyErd /></ErdErrorBoundary>,
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
    // cto-analytics T-07 (FR-01): the `systems` tab renders the force-
    // directed System / INTEGRATES_WITH map. Cluster coloring uses the
    // T-21 accent ramp in tokens.css; data comes from T-20's
    // GET /api/v1/analytics/systems. Replaces the T-21 pending seam.
    systems:    (r) => <AnalyticsSystems route={r} />,
    matrix:     () => <AnalyticsMatrix />,
    // cto-analytics T-09 (FR-03): consolidation-candidates panel.
    "consolidation": () => <AnalyticsConsolidation />,
    complexity: () => <AnalyticsComplexity />,
    // cto-analytics T-09 registers the sibling report tabs (RD-3 names) so
    // their routes resolve. `critical-paths` renders a pending seam until its
    // owning task (T-12, FR-06) lands its view.
    // cto-analytics T-11 (FR-05): the `single-system` tab renders the
    // single-system journey report (journeys confined to one System),
    // replacing the T-09 pending seam per that seam's comment.
    "single-system":  () => <AnalyticsSingleSystem />,
    // cto-analytics T-12 (FR-06): the `critical-paths` tab renders the
    // critical-path report (longest acyclic PRECEDES chain per journey),
    // replacing the T-09 pending seam per that seam's comment.
    "critical-paths": () => <AnalyticsCriticalPaths />,
    ai:         () => <AnalyticsAi />,
    // cto-analytics-reporting T-08 (FR-08): server-rendered exec-summary PDF launcher.
    "exec-summary": () => <AnalyticsExecSummary />,
  },
  api: {
    endpoints: () => <ApiEndpoints />,
    errors:    () => <ApiErrors />,
    import:    () => <ApiImport />,
  },
  exec: {
    ops:              () => <ExecOps />,
    finance:          () => <ExecFinance />,
    people:           () => <ExecPeople />,
    transform:        () => <ExecTransform />,
    risk:             () => <ExecRisk />,
    "kpi-management": () => <ExecKpiManagement />,
    "okr-management": () => <ExecOkrManagement />,
    // kpi-okr-performance-dashboards T-14: URL-first sliced dashboard.
    "performance":    (r) => <PerformanceDashboard route={r} />,
  },
  data: {
    map:    () => <DataMap />,
    export: () => <DataExport />,
  },
  admin: {
    personas:   () => <AdminPersonas />,
    "rbac-roles": () => <AdminRbacRoles />,
    users:      () => <AdminUserAssignments />,
  },
  // model-workspace-core T-21 (FR-16, FR-17): `models` is the live
  // ModelWorkspace; the six sibling tabs render ModelTabPlaceholder
  // naming their owning downstream spec (blueprint View Tree) until
  // those specs land. All seven tabs are registered in route.ts by
  // this feature (T-17 — one feature owns a file).
  model: {
    models:           () => <ModelWorkspace />,
    canvas:           (r) => <ModelCanvas route={r} />,
    // story-spec-core T-14 (FR-12): the Stories tab is live — StoryCatalog
    // replaces the placeholder (the ONLY edit to this file;
    // route.ts/SURFACES stay model-workspace-core's).
    stories:          (r) => <StoryCatalog route={r} />,
    // key-activity-optimizer T-14 (FR-12): the Key Activities tab is
    // live — KeyActivityBoard replaces the placeholder (the ONLY edit
    // to this file; route.ts/SURFACES stay model-workspace-core's).
    "key-activities": (r) => <KeyActivityBoard route={r} />,
    "kpi-impact":     (r) => <KpiImpactMatrix route={r} />,
    // ddd-system-modeling T-13 (FR-12): the Systems tab is live —
    // SystemModeler replaces the placeholder (the ONLY edit to this
    // file; route.ts/SURFACES stay model-workspace-core's).
    systems:          (r) => <SystemModeler route={r} />,
    // requirements-export T-08 (FR-12): the Export tab is live —
    // SpecExport replaces the placeholder (the ONLY edit to this file;
    // route.ts/SURFACES stay model-workspace-core's).
    export:           () => <SpecExport />,
  },
};

export function renderView(route: Route): ReactNode {
  const surface = VIEWS[route.surface];
  if (!surface) return <NotFoundPanel route={route} />;
  const view = surface[route.tab];
  if (!view) return <NotFoundPanel route={route} />;
  return view(route);
}
