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
import { ChatConversations } from "./chat/Conversations";

import { OntologyCatalog } from "./ontology/Catalog";
import { OntologyErd } from "./ontology/Erd";
import { ErdErrorBoundary } from "./ontology/ErdErrorBoundary";
import { OntologyEditor } from "./ontology/Editor";
import { OntologyEdges } from "./ontology/Edges";
import { OntologyVersions } from "./ontology/Versions";
import { OntologyAudit } from "./ontology/Audit";
import { GlossaryManager } from "./ontology/GlossaryManager";
import { ComplianceManager } from "./ontology/ComplianceManager";
import { OntologyGenerator } from "./ontology/OntologyGenerator";

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
import { ExecRiskDashboard } from "./exec/RiskDashboard";
import { ExecKpiManagement } from "./exec/KpiManagement";
import { ExecOkrManagement } from "./exec/OkrManagement";
import { ExecRollDown } from "./exec/RollDown";
import { RollDownAnalytics } from "./exec/RollDownAnalytics";
import { ProgramManagement } from "./exec/ProgramManagement";
import { ContextAlignment } from "./exec/ContextAlignment";
import { PerformanceDashboard } from "./exec/PerformanceDashboard";

import { DataMap } from "./data/Map";
import { DataExport } from "./data/Export";

import { ModelWorkspace } from "./model/ModelWorkspace";
import { StoryCatalog } from "./model/StoryCatalog";
import { KeyActivityBoard } from "./model/KeyActivityBoard";
import { SystemModeler } from "./model/SystemModeler";
import { KpiImpactMatrix } from "./model/KpiImpactMatrix";
import { ModelCanvas } from "./model/ModelCanvas";
import { SpecExport } from "./model/SpecExport";

import { AdminPersonas } from "./admin/Personas";
import { AdminRbacRoles } from "./admin/RbacRoles";
import { AdminUserAssignments } from "./admin/UserAssignments";

type ViewMap = Record<string, Record<string, (route: Route) => ReactNode>>;

const VIEWS: ViewMap = {
  explorer: {
    "domains":        (r) => <ExplorerDomains route={r} />,
    "journeys":       (r) => {
      if (r.mode === "graph" && r.entityId) {
        return <ExplorerJourneyGraph route={{ ...r, params: { ...r.params, journey: r.entityId } }} />;
      }
      if (r.params["view"] === "graph") {
        return <ExplorerJourneyGraph route={r} />;
      }
      return <ExplorerJourney route={r} />;
    },
    "activities":     (r) => <ExplorerActivities route={r} />,
    "roles":          (r) => <ExplorerRoles route={r} />,
    "systems":        (r) => <ExplorerSystems route={r} />,
    "locations":      (r) => <ExplorerLocations route={r} />,
    "path-finder":    () => <ExplorerPath />,
    "review":         () => <SmeReview />,
    "add":            () => <SmeAdd />,
    "quarterly":      () => <SmeQuarterly />,
    // Virtual tabs — not in SURFACES but routable via VIRTUAL_TABS.
    "domain-detail":  (r) => <DomainDetail route={r} />,
    "product-detail": (r) => <ProductDetail productId={r.entityId || ""} />,
  },
  model: {
    models:           () => <ModelWorkspace />,
    canvas:           (r) => <ModelCanvas route={r} />,
    stories:          (r) => <StoryCatalog route={r} />,
    "key-activities": (r) => <KeyActivityBoard route={r} />,
    "kpi-impact":     (r) => <KpiImpactMatrix route={r} />,
    systems:          (r) => <SystemModeler route={r} />,
    export:           () => <SpecExport />,
  },
  chat: {
    thread:         (r) => <ChatThread route={r} />,
    conversations:  () => <ChatConversations />,
  },
  insights: {
    overview:              () => <AnalyticsOverview />,
    systems:               (r) => <AnalyticsSystems route={r} />,
    matrix:                () => <AnalyticsMatrix />,
    complexity:            () => <AnalyticsComplexity />,
    "context-alignment":   () => <ContextAlignment />,
    consolidation:         () => <AnalyticsConsolidation />,
    "single-system":       () => <AnalyticsSingleSystem />,
    "critical-paths":      () => <AnalyticsCriticalPaths />,
    ai:                    () => <AnalyticsAi />,
    "exec-summary":        () => <AnalyticsExecSummary />,
    finance:               () => <ExecFinance />,
    people:                () => <ExecPeople />,
    transform:             () => <ExecTransform />,
    performance:           (r) => <PerformanceDashboard route={r} />,
  },
  govern: {
    "kpi-management":      () => <ExecKpiManagement />,
    "okr-management":      () => <ExecOkrManagement />,
    "roll-down":           () => <ExecRollDown />,
    "roll-down-analytics": () => <RollDownAnalytics />,
    risk:                  () => <ExecRiskDashboard />,
    compliance:            () => <ComplianceManager />,
    programs:              () => <ProgramManagement />,
  },
  ontology: {
    catalog:    () => <OntologyCatalog />,
    erd:        () => <ErdErrorBoundary><OntologyErd /></ErdErrorBoundary>,
    editor:     () => <OntologyEditor />,
    edges:      () => <OntologyEdges />,
    versions:   () => <OntologyVersions />,
    audit:      () => <OntologyAudit />,
    glossary:   () => <GlossaryManager />,
    generator:  () => <OntologyGenerator />,
  },
  data: {
    map:       () => <DataMap />,
    import:    () => <ApiImport />,
    export:    () => <DataExport />,
    endpoints: () => <ApiEndpoints />,
    errors:    () => <ApiErrors />,
  },
  admin: {
    personas:     () => <AdminPersonas />,
    "rbac-roles": () => <AdminRbacRoles />,
    users:        () => <AdminUserAssignments />,
    platform:     () => <ExecOps />,
    settings:     () => <SmeHome />,
  },
};

export function renderView(route: Route): ReactNode {
  const surface = VIEWS[route.surface];
  if (!surface) return <NotFoundPanel route={route} />;
  const view = surface[route.tab];
  if (!view) return <NotFoundPanel route={route} />;
  return view(route);
}
