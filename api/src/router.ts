import {
  handleNodePost,
  handleNodeGet,
  handleNodePatch,
  handleNodeDelete,
} from "./routes/nodes";
import { handleEdgePost, handleEdgeDelete } from "./routes/edges";
import { handleImport } from "./routes/import";
import {
  handleListDomains,
  handleGetDomain,
  handleGetJourney,
  handleGetActivity,
  handleFindPath,
  handleNeighbors,
  handleCypher,
  handleSearch,
  handleJourneyHealth,
  handleJourneyOwnership,
  handleJourneyActivities,
  handleJourneyRoles,
  handleJourneySystems,
  handleJourneyHandoffs,
  handleJourneyTouchpoints,
} from "./routes/query";
import { handleHealthz } from "./routes/healthz";
import { handleChatMessage, handleChatProgress } from "./routes/chat";
import { handleStats } from "./routes/stats";
import { handleExportJson, handleExportNdjson } from "./routes/export";
import { handleOpenapi } from "./routes/openapi";
import { handleGraphAnalytics } from "./routes/analytics";
import {
  handleCreateNodeLabel,
  handleListNodeLabels,
  handleGetNodeLabel,
  handlePatchNodeLabel,
  handleDeleteNodeLabel,
} from "./routes/ontology-node-labels";
import {
  handleCreateEdgeType,
  handleListEdgeTypes,
  handleGetEdgeType,
  handlePatchEdgeType,
  handleDeleteEdgeType,
} from "./routes/ontology-edge-types";
import { handleGetSchema } from "./routes/ontology-schema";
import { handleListAudit, handleListVersions } from "./routes/ontology-audit";
import { handleOntologyImport } from "./routes/ontology-import";
import { handleOntologyEvents } from "./routes/ontology-events";
import { handlePostMigration } from "./routes/ontology-migrations";
import { handleRollback } from "./routes/ontology-versions";
import { handleOntologyExport } from "./routes/ontology-export";
import { handleBoundedContexts } from "./routes/ontology-bounded-contexts";
import {
  handleGlossaryCollections,
  handleCreateGlossaryCollection,
  handleGlossaryCollection,
  handlePatchGlossaryCollection,
  handleDeleteGlossaryCollection,
} from "./routes/ontology-glossary-collections";
import {
  handleGlossaryTerms,
  handleCreateGlossaryTerm,
  handleGlossaryTerm,
  handlePatchGlossaryTerm,
  handleDeleteGlossaryTerm,
} from "./routes/ontology-glossary-terms";
import {
  handleOntologyProposals,
  handleCreateOntologyProposal,
  handleOntologyProposal,
  handlePatchOntologyProposal,
  handleDeleteOntologyProposal,
} from "./routes/ontology-proposals";
import {
  handleComplianceRules,
  handleCreateComplianceRule,
  handleComplianceRule,
  handlePatchComplianceRule,
  handleDeleteComplianceRule,
  handleEvaluateComplianceRule,
} from "./routes/compliance-rules";
import { handleRdfExport } from "./routes/ontology-rdf-export";
import { handleRdfImport } from "./routes/ontology-rdf-import";
import { handleOntologyQuery } from "./routes/ontology-query";
import {
  handleAuthLogin,
  handleAuthCallback,
  handleAuthLogout,
  handleAuthMe,
} from "./routes/auth";
import {
  handleRbacRolePost,
  handleRbacRoleList,
  handleRbacRoleGet,
  handleRbacRolePatch,
  handleRbacRoleDelete,
  handlePersonaRbacRolePost,
  handlePersonaRbacRoleDelete,
  handlePersonaPermissionsGet,
} from "./routes/rbac-roles";
import {
  handleUserPersonaPost,
  handleUserPersonaList,
  handleUserPersonaDelete,
  handleUserPersonaPatch,
} from "./routes/user-persona";
import { getRoutePermission, isPublicRoute } from "./auth/rbac-permissions";
import { getSession, hasPermissionByRbac } from "./auth/oauth";
import {
  handleChangeRequestsList,
  handleChangeRequestGet,
  handleChangeRequestCreate,
  handleChangeRequestPatch,
  handleChangeRequestDelete,
  handleChangeRequestReviewCreate,
  handleChangeRequestSignOffCreate,
} from "./routes/change-requests";
import {
  handleRiskRegisterList,
  handleRiskRegisterGet,
  handleRiskRegisterCreate,
  handleRiskRegisterPatch,
  handleRiskRegisterDelete,
  handleRiskAggregationByDomain,
  handleRiskAggregationByOwner,
  handleRiskAggregationByCategory,
  handleRiskAggregationByRiskType,
  handleRiskAggregationSummary,
} from "./routes/risk-register";
import {
  handleRegulatedActivityInventory,
  handleSodViolations,
  handleThirdPartyRegister,
} from "./routes/risk-compliance";
import { handleSnapshotExport } from "./routes/snapshot";
import {
  handleDomainPost,
  handleDomainPatch,
  handleDomainArchive,
  handleDomainAuditLog,
} from "./routes/domain-crud";
import {
  handleJourneyPost,
  handleJourneyPatch,
  handleJourneyArchive,
  handleJourneyAuditLog,
} from "./routes/journey-crud";
import {
  handleOkrDirectivePost,
  handleOkrDirectiveGet,
  handleOkrDirectiveGetByProduct,
  handleOkrDirectivePatch,
  handleOkrDirectiveDelete,
  handleKeyResultPost,
  handleKeyResultGet,
  handleKeyResultPatch,
  handleKeyResultDelete,
  handleOkrPerformanceGet,
} from "./routes/okr-crud";
import {
  handleKpiRollDownPost,
  handleKpiRollDownGet,
  handleKpiRollDownByDomainGet,
  handleKpiProductRollDownPost,
  handleKpiProductRollDownGet,
  handleKpiProgramRollDownPost,
  handleKpiProgramRollDownGet,
  handleOkrRollDownPost,
  handleOkrRollDownGet,
  handleOkrRollDownByDomainGet,
  handleOkrProductRollDownPost,
  handleOkrProductRollDownGet,
  handleOkrProgramRollDownPost,
  handleOkrProgramRollDownGet,
  handleRollDownCommitPost,
  handleRollDownAdjustmentPost,
  handleRollDownContributionsGet,
  handleRollDownContributionsByDomainGet,
  handleRollDownApprove,
  handleRollDownReject,
  handleRollDownNotify,
  handleSlaDomainRollDownPost,
  handleSlaDomainRollDownGet,
} from "./routes/roll-down";
import {
  handleJourneyVersions,
  handleJourneyRollback,
  handleJourneyChanges,
} from "./routes/journey-versions";
import {
  handleKpiPost,
  handleKpiPatch,
  handleKpiArchive,
  handleKpiAuditLog,
} from "./routes/kpi-crud";
import {
  handleSlaPost,
  handleSlaPatch,
  handleSlaArchive,
  handleSlaAuditLog,
} from "./routes/sla-crud";
import {
  handleKpiAlignmentPost,
  handleKpiAlignmentDelete,
  handleKpiAlignmentsGet,
  handleSlaAlignmentPost,
  handleSlaAlignmentDelete,
  handleSlaAlignmentsGet,
} from "./routes/kpi-sla-alignment";
import {
  handleKpiMeasurementPost,
  handleKpiMeasurementsGet,
  handleKpiMeasurementGet,
  handleKpiMeasurementDelete,
} from "./routes/kpi-measurements";
import {
  handleSlaBreachPost,
  handleSlaBreachesGet,
  handleSlaBreachGet,
  handleSlaBreachPatch,
  handleSlaBreachDelete,
} from "./routes/sla-breaches";
import {
  handleKpiTrendsGet,
} from "./routes/kpi-trends";
import {
  handleSlaComplianceGet,
  handleSlaComplianceByDomainGet,
  handleSlaComplianceAllGet,
} from "./routes/sla-compliance";
import {
  handlePersonaPost,
  handlePersonaList,
  handlePersonaGet,
  handlePersonaPatch,
  handlePersonaDelete,
  handlePersonaAssignmentPost,
  handlePersonaAssignmentList,
  handlePersonaAssignmentDelete,
} from "./routes/persona";
import { error, fromValidationError } from "./routes/_helpers";
import { ValidationError } from "./errors";
import { logRequest } from "./logging";
import { metrics } from "./metrics";

// All routes are mounted under /api/v1/. Dispatch is a small switch
// on method + path-prefix — no framework dependency beyond Bun.serve.
export async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();
  const t0 = performance.now();

  let res: Response;
  try {
    if (!path.startsWith("/api/v1/")) {
      res = error(404, "not_found", "no route", { path });
    } else {
      res = await dispatch(method, path, req);
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      res = fromValidationError(e);
    } else {
      console.error("unhandled error", e);
      res = error(500, "neo4j_unreachable", "internal error", {
        cause: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logRequest({
    ts: new Date().toISOString(),
    level: res.status >= 500 ? "ERROR" : res.status >= 400 ? "WARN" : "INFO",
    method,
    path,
    status: res.status,
    durationMs: (globalThis as any).performance.now() - t0,
  });

  // Track metrics
  metrics.increment("http_requests_total", { method, path: path.split("/")[2] || "root", status: String(res.status) });
  metrics.observe("http_request_duration_ms", (globalThis as any).performance.now() - t0, { method, path: path.split("/")[2] || "root" });

  return res;
}

// DEV-ONLY fallback (baseline FR-05): with no OneLogin issuer configured
// there is no way to obtain a session locally, so the gate admits a
// synthetic admin session. Never deploy beyond localhost without
// ONELOGIN_ISSUER set.
let warnedDevAuth = false;
function devSession() {
  if (!warnedDevAuth) {
    warnedDevAuth = true;
    console.warn("[auth] ONELOGIN_ISSUER unset — DEV-ONLY fallback session with full permissions in effect");
  }
  return {
    userId: "dev-user",
    email: "dev@localhost",
    name: "Local Dev (no OneLogin issuer)",
    roles: ["admin"],
    storeAccess: ["*"],
    personaAssignments: [],
    rbacRoles: ["admin"],
    permissions: ["*"],
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
}

async function dispatch(method: string, path: string, req: Request): Promise<Response> {
  // Check if route is public
  if (isPublicRoute(method, path)) {
    return dispatchInternal(method, path, req);
  }

  if (!(globalThis as any).process?.env?.ONELOGIN_ISSUER) {
    (req as any).user = devSession();
    return dispatchInternal(method, path, req);
  }

  // Check authentication
  const sessionId = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Check RBAC permission
  const requiredPermission = getRoutePermission(method, path);
  if (requiredPermission && requiredPermission !== "public") {
    const userPermissions = session.permissions || [];
    if (!hasPermissionByRbac(userPermissions, requiredPermission)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // Attach user to request for downstream handlers
  (req as any).user = session;

  return dispatchInternal(method, path, req);
}

async function dispatchInternal(method: string, path: string, req: Request): Promise<Response> {
  // Trim /api/v1/ prefix.
  const sub = path.slice("/api/v1/".length);

  if (sub === "healthz" && method === "GET") return handleHealthz();
  if (sub === "stats" && method === "GET") return handleStats();
  if (sub === "openapi.json" && method === "GET") return handleOpenapi();
  if (sub === "import" && method === "POST") return handleImport(req);
  if (sub === "export" && method === "GET") return handleExportJson();
  if (sub === "export.ndjson" && method === "GET") return handleExportNdjson();

  // Authentication routes
  if (sub === "auth/login" && method === "GET") return handleAuthLogin();
  if (sub === "auth/callback" && method === "GET") return handleAuthCallback(req);
  if (sub === "auth/logout" && method === "POST") return handleAuthLogout();
  if (sub === "auth/me" && method === "GET") return handleAuthMe(req);

  if (sub === "edges" && method === "POST") return handleEdgePost(req);
  const edgeDelete = sub.match(/^edges\/([^/]+)$/);
  if (edgeDelete && method === "DELETE") return handleEdgeDelete(req, edgeDelete[1]!);

  const nodesPost = sub.match(/^nodes\/([^/]+)$/);
  if (nodesPost && method === "POST") return handleNodePost(req, nodesPost[1]!);
  const nodeOne = sub.match(/^nodes\/([^/]+)\/([^/]+)$/);
  if (nodeOne) {
    const [, label, id] = nodeOne;
    if (method === "GET") return handleNodeGet(req, label!, id!);
    if (method === "PATCH") return handleNodePatch(req, label!, id!);
    if (method === "DELETE") return handleNodeDelete(req, label!, id!);
  }

  if (sub === "query/listDomains" && method === "GET") return handleListDomains();
  const getDomain = sub.match(/^query\/getDomain\/([^/]+)$/);
  if (getDomain && method === "GET") return handleGetDomain(req, getDomain[1]!);
  const getJourney = sub.match(/^query\/getJourney\/([^/]+)$/);
  if (getJourney && method === "GET") return handleGetJourney(req, getJourney[1]!);
  const getActivity = sub.match(/^query\/getActivity\/([^/]+)$/);
  if (getActivity && method === "GET") return handleGetActivity(req, getActivity[1]!);
  if (sub === "query/findPath" && method === "GET") return handleFindPath(req);
  const neighbors = sub.match(/^query\/neighbors\/([^/]+)$/);
  if (neighbors && method === "GET") return handleNeighbors(req, neighbors[1]!);
  if (sub === "query/cypher" && method === "POST") return handleCypher(req);

  // Journey query routes (US-JM-01 through US-JM-08)
  const journeyHealth = sub.match(/^query\/journeyHealth\/([^/]+)$/);
  if (journeyHealth && method === "GET") return handleJourneyHealth(req, journeyHealth[1]!);
  const journeyOwnership = sub.match(/^query\/journeyOwnership\/([^/]+)$/);
  if (journeyOwnership && method === "GET") return handleJourneyOwnership(req, journeyOwnership[1]!);
  const journeyActivities = sub.match(/^query\/journeyActivities\/([^/]+)$/);
  if (journeyActivities && method === "GET") return handleJourneyActivities(req, journeyActivities[1]!);
  const journeyRoles = sub.match(/^query\/journeyRoles\/([^/]+)$/);
  if (journeyRoles && method === "GET") return handleJourneyRoles(req, journeyRoles[1]!);
  const journeySystems = sub.match(/^query\/journeySystems\/([^/]+)$/);
  if (journeySystems && method === "GET") return handleJourneySystems(req, journeySystems[1]!);
  const journeyHandoffs = sub.match(/^query\/journeyHandoffs\/([^/]+)$/);
  if (journeyHandoffs && method === "GET") return handleJourneyHandoffs(req, journeyHandoffs[1]!);
  const journeyTouchpoints = sub.match(/^query\/journeyTouchpoints\/([^/]+)$/);
  if (journeyTouchpoints && method === "GET") return handleJourneyTouchpoints(req, journeyTouchpoints[1]!);

  // Chat routes — /api/v1/chat/messages + progress
  if (sub === "chat/messages" && method === "POST") return handleChatMessage(req);
  const chatProgress = sub.match(/^chat\/messages\/([^/]+)\/progress$/);
  if (chatProgress && method === "GET") return handleChatProgress(chatProgress[1]!);
  if (sub === "query/search" && method === "GET") return handleSearch(req);

  // Ontology routes — /api/v1/ontology/* and /api/v1/schema
  if (sub === "schema" && method === "GET") return handleGetSchema(req);
  if (sub === "ontology/node-labels" && method === "GET") return handleListNodeLabels();
  if (sub === "ontology/node-labels" && method === "POST") return handleCreateNodeLabel(req);
  if (sub === "ontology/edge-types" && method === "GET") return handleListEdgeTypes();
  if (sub === "ontology/edge-types" && method === "POST") return handleCreateEdgeType(req);
  if (sub === "ontology/audit" && method === "GET") return handleListAudit(req);
  if (sub === "ontology/versions" && method === "GET") return handleListVersions(req);
  if (sub === "ontology/import" && method === "POST") return handleOntologyImport(req);
  if (sub === "ontology/events" && method === "GET") return handleOntologyEvents(req);
  if (sub === "ontology/migrations" && method === "POST") return handlePostMigration(req);
  if (sub === "ontology/export" && method === "GET") return handleOntologyExport(req);
  if (sub === "ontology/bounded-contexts" && method === "GET") return handleBoundedContexts();

  // Glossary collection routes
  if (sub === "glossary/collections" && method === "GET") return handleGlossaryCollections(req);
  if (sub === "glossary/collections" && method === "POST") return handleCreateGlossaryCollection(req);
  const glossaryCollectionOne = sub.match(/^glossary\/collections\/([^/]+)$/);
  if (glossaryCollectionOne) {
    const iri = decodeURIComponent(glossaryCollectionOne[1]!);
    if (method === "GET") return handleGlossaryCollection(req);
    if (method === "PATCH") return handlePatchGlossaryCollection(req);
    if (method === "DELETE") return handleDeleteGlossaryCollection(req);
  }

  // Glossary term routes
  if (sub === "glossary/terms" && method === "GET") return handleGlossaryTerms(req);
  if (sub === "glossary/terms" && method === "POST") return handleCreateGlossaryTerm(req);
  const glossaryTermOne = sub.match(/^glossary\/terms\/([^/]+)$/);
  if (glossaryTermOne) {
    const id = decodeURIComponent(glossaryTermOne[1]!);
    if (method === "GET") return handleGlossaryTerm(req);
    if (method === "PATCH") return handlePatchGlossaryTerm(req);
    if (method === "DELETE") return handleDeleteGlossaryTerm(req);
  }

  // Ontology proposal routes
  if (sub === "ontology/proposals" && method === "GET") return handleOntologyProposals();
  if (sub === "ontology/proposals" && method === "POST") return handleCreateOntologyProposal();
  const proposalOne = sub.match(/^ontology\/proposals\/([^/]+)$/);
  if (proposalOne) {
    const id = decodeURIComponent(proposalOne[1]!);
    if (method === "GET") return handleOntologyProposal();
    if (method === "PATCH") return handlePatchOntologyProposal();
    if (method === "DELETE") return handleDeleteOntologyProposal();
  }

  // Compliance rule routes
  if (sub === "compliance/rules" && method === "GET") return handleComplianceRules(req);
  if (sub === "compliance/rules" && method === "POST") return handleCreateComplianceRule(req);
  const ruleOne = sub.match(/^compliance\/rules\/([^/]+)$/);
  if (ruleOne) {
    const id = decodeURIComponent(ruleOne[1]!);
    if (method === "GET") return handleComplianceRule(req);
    if (method === "PATCH") return handlePatchComplianceRule(req);
    if (method === "DELETE") return handleDeleteComplianceRule(req);
  }
  if (sub === "compliance/rules/evaluate" && method === "POST") return handleEvaluateComplianceRule(req);

  // RDF export/import routes
  if (sub === "ontology/rdf" && method === "GET") return handleRdfExport(req);
  if (sub === "ontology/rdf" && method === "POST") return handleRdfImport(req);

  // Query routes
  if (sub === "ontology/query" && method === "POST") return handleOntologyQuery(req);

  const rollback = sub.match(/^ontology\/rollback\/([^/]+)$/);
  if (rollback && method === "POST") {
    return handleRollback(req, decodeURIComponent(rollback[1]!));
  }

  const nodeLabel = sub.match(/^ontology\/node-labels\/([^/]+)$/);
  if (nodeLabel) {
    const name = decodeURIComponent(nodeLabel[1]!);
    if (method === "GET") return handleGetNodeLabel(req, name);
    if (method === "PATCH") return handlePatchNodeLabel(req, name);
    if (method === "DELETE") return handleDeleteNodeLabel(req, name);
  }

  const edgeType = sub.match(/^ontology\/edge-types\/([^/]+)$/);
  if (edgeType) {
    const name = decodeURIComponent(edgeType[1]!);
    if (method === "GET") return handleGetEdgeType(req, name);
    if (method === "PATCH") return handlePatchEdgeType(req, name);
    if (method === "DELETE") return handleDeleteEdgeType(req, name);
  }

  // Change request routes
  if (sub === "change-requests" && method === "GET") return handleChangeRequestsList(req);
  if (sub === "change-requests" && method === "POST") return handleChangeRequestCreate(req);
  const changeRequestOne = sub.match(/^change-requests\/([^/]+)$/);
  if (changeRequestOne) {
    const id = decodeURIComponent(changeRequestOne[1]!);
    if (method === "GET") return handleChangeRequestGet(req, id);
    if (method === "PATCH") return handleChangeRequestPatch(req, id);
    if (method === "DELETE") return handleChangeRequestDelete(req, id);
  }
  const changeRequestReviews = sub.match(/^change-requests\/([^/]+)\/reviews$/);
  if (changeRequestReviews && method === "POST") return handleChangeRequestReviewCreate(req, decodeURIComponent(changeRequestReviews[1]!));
  const changeRequestSignOffs = sub.match(/^change-requests\/([^/]+)\/sign-offs$/);
  if (changeRequestSignOffs && method === "POST") return handleChangeRequestSignOffCreate(req, decodeURIComponent(changeRequestSignOffs[1]!));

  // Risk register routes
  if (sub === "risk-register" && method === "GET") return handleRiskRegisterList(req);
  if (sub === "risk-register" && method === "POST") return handleRiskRegisterCreate(req);
  const riskOne = sub.match(/^risk-register\/([^/]+)$/);
  if (riskOne) {
    const id = decodeURIComponent(riskOne[1]!);
    if (method === "GET") return handleRiskRegisterGet(req, id);
    if (method === "PATCH") return handleRiskRegisterPatch(req, id);
    if (method === "DELETE") return handleRiskRegisterDelete(req, id);
  }

  // Risk aggregation routes
  if (sub === "risk-register/aggregation/domain" && method === "GET") return handleRiskAggregationByDomain(req);
  if (sub === "risk-register/aggregation/owner" && method === "GET") return handleRiskAggregationByOwner(req);
  if (sub === "risk-register/aggregation/category" && method === "GET") return handleRiskAggregationByCategory(req);
  if (sub === "risk-register/aggregation/risk-type" && method === "GET") return handleRiskAggregationByRiskType(req);
  if (sub === "risk-register/aggregation/summary" && method === "GET") return handleRiskAggregationSummary(req);

  // Risk & Compliance routes
  if (sub === "risk-compliance/regulated-activity-inventory" && method === "GET") return handleRegulatedActivityInventory(req);
  if (sub === "risk-compliance/sod-violations" && method === "GET") return handleSodViolations(req);
  if (sub === "risk-compliance/third-party-register" && method === "GET") return handleThirdPartyRegister(req);

  // RBAC Role routes
  if (sub === "rbac-roles" && method === "GET") return handleRbacRoleList(req);
  if (sub === "rbac-roles" && method === "POST") return handleRbacRolePost(req);
  const rbacRoleOne = sub.match(/^rbac-roles\/([^/]+)$/);
  if (rbacRoleOne) {
    const id = decodeURIComponent(rbacRoleOne[1]!);
    if (method === "GET") return handleRbacRoleGet(req, id);
    if (method === "PATCH") return handleRbacRolePatch(req, id);
    if (method === "DELETE") return handleRbacRoleDelete(req, id);
  }
  const personaRbacRoles = sub.match(/^personas\/([^/]+)\/rbac-roles$/);
  if (personaRbacRoles && method === "POST") return handlePersonaRbacRolePost(req, decodeURIComponent(personaRbacRoles[1]!));
  const personaRbacRoleDelete = sub.match(/^personas\/([^/]+)\/rbac-roles\/([^/]+)$/);
  if (personaRbacRoleDelete && method === "DELETE") return handlePersonaRbacRoleDelete(req, decodeURIComponent(personaRbacRoleDelete[1]!), decodeURIComponent(personaRbacRoleDelete[2]!));
  const personaPermissions = sub.match(/^personas\/([^/]+)\/permissions$/);
  if (personaPermissions && method === "GET") return handlePersonaPermissionsGet(req, decodeURIComponent(personaPermissions[1]!));

  // User-Persona assignment routes
  const userPersonas = sub.match(/^users\/([^/]+)\/personas$/);
  if (userPersonas) {
    const userId = decodeURIComponent(userPersonas[1]!);
    if (method === "GET") return handleUserPersonaList(req, userId);
    if (method === "POST") return handleUserPersonaPost(req, userId);
  }
  const userPersonaOne = sub.match(/^users\/([^/]+)\/personas\/([^/]+)$/);
  if (userPersonaOne) {
    const userId = decodeURIComponent(userPersonaOne[1]!);
    const personaId = decodeURIComponent(userPersonaOne[2]!);
    if (method === "PATCH") return handleUserPersonaPatch(req, userId, personaId);
    if (method === "DELETE") return handleUserPersonaDelete(req, userId, personaId);
  }

  // Snapshot routes
  if (sub === "snapshot" && method === "GET") return handleSnapshotExport(req);

  // Roll-down routes
  if (sub === "roll-down/kpi" && method === "POST") return handleKpiRollDownPost(req);
  if (sub === "roll-down/kpi" && method === "GET") return handleKpiRollDownGet(req);
  const kpiRollDownByDomain = sub.match(/^roll-down\/kpi\/([^/]+)$/);
  if (kpiRollDownByDomain && method === "GET") return handleKpiRollDownByDomainGet(req, decodeURIComponent(kpiRollDownByDomain[1]!));
  if (sub === "roll-down/kpi/product" && method === "POST") return handleKpiProductRollDownPost(req);
  const kpiProductRollDownByDomain = sub.match(/^roll-down\/kpi\/product\/([^/]+)$/);
  if (kpiProductRollDownByDomain && method === "GET") return handleKpiProductRollDownGet(req, decodeURIComponent(kpiProductRollDownByDomain[1]!));
  if (sub === "roll-down/kpi/program" && method === "POST") return handleKpiProgramRollDownPost(req);
  const kpiProgramRollDownByProgram = sub.match(/^roll-down\/kpi\/program\/([^/]+)$/);
  if (kpiProgramRollDownByProgram && method === "GET") return handleKpiProgramRollDownGet(req, decodeURIComponent(kpiProgramRollDownByProgram[1]!));
  if (sub === "roll-down/okr" && method === "POST") return handleOkrRollDownPost(req);
  if (sub === "roll-down/okr" && method === "GET") return handleOkrRollDownGet(req);
  const okrRollDownByDomain = sub.match(/^roll-down\/okr\/([^/]+)$/);
  if (okrRollDownByDomain && method === "GET") return handleOkrRollDownByDomainGet(req, decodeURIComponent(okrRollDownByDomain[1]!));
  if (sub === "roll-down/okr/product" && method === "POST") return handleOkrProductRollDownPost(req);
  const okrProductRollDownByDomain = sub.match(/^roll-down\/okr\/product\/([^/]+)$/);
  if (okrProductRollDownByDomain && method === "GET") return handleOkrProductRollDownGet(req, decodeURIComponent(okrProductRollDownByDomain[1]!));
  if (sub === "roll-down/okr/program" && method === "POST") return handleOkrProgramRollDownPost(req);
  const okrProgramRollDownByProgram = sub.match(/^roll-down\/okr\/program\/([^/]+)$/);
  if (okrProgramRollDownByProgram && method === "GET") return handleOkrProgramRollDownGet(req, decodeURIComponent(okrProgramRollDownByProgram[1]!));
  if (sub === "roll-down/sla/domain" && method === "POST") return handleSlaDomainRollDownPost(req);
  const slaDomainRollDownByDomain = sub.match(/^roll-down\/sla\/domain\/([^/]+)$/);
  if (slaDomainRollDownByDomain && method === "GET") return handleSlaDomainRollDownGet(req, decodeURIComponent(slaDomainRollDownByDomain[1]!));
  if (sub === "roll-down/commit" && method === "POST") return handleRollDownCommitPost(req);
  if (sub === "roll-down/adjustment" && method === "POST") return handleRollDownAdjustmentPost(req);
  if (sub === "roll-down/contributions" && method === "GET") return handleRollDownContributionsGet(req);
  const contributionsByDomain = sub.match(/^roll-down\/contributions\/([^/]+)$/);
  if (contributionsByDomain && method === "GET") return handleRollDownContributionsByDomainGet(req, decodeURIComponent(contributionsByDomain[1]!));
  if (sub === "roll-down/approve" && method === "POST") return handleRollDownApprove(req);
  if (sub === "roll-down/reject" && method === "POST") return handleRollDownReject(req);
  if (sub === "roll-down/notify" && method === "POST") return handleRollDownNotify(req);

  // Domain CRUD routes (US-DM-05)
  if (sub === "domains" && method === "POST") return handleDomainPost(req);
  const domainOne = sub.match(/^domains\/([^/]+)$/);
  if (domainOne) {
    const id = decodeURIComponent(domainOne[1]!);
    if (method === "PATCH") return handleDomainPatch(req, id);
    if (method === "POST") return handleDomainArchive(req, id);
    if (method === "GET") return handleDomainAuditLog(req, id);
  }

  // Journey CRUD routes (US-JM-05)
  if (sub === "journeys" && method === "POST") return handleJourneyPost(req);
  const journeyOne = sub.match(/^journeys\/([^/]+)$/);
  if (journeyOne) {
    const id = decodeURIComponent(journeyOne[1]!);
    if (method === "PATCH") return handleJourneyPatch(req, id);
    if (method === "POST") return handleJourneyArchive(req, id);
    if (method === "GET") return handleJourneyAuditLog(req, id);
  }

  // Journey versioning routes (US-JM-06)
  const journeyVersions = sub.match(/^journeys\/([^/]+)\/versions$/);
  if (journeyVersions && method === "GET") return handleJourneyVersions(req, journeyVersions[1]!);
  const journeyRollback = sub.match(/^journeys\/([^/]+)\/rollback\/([^/]+)$/);
  if (journeyRollback && method === "POST") return handleJourneyRollback(req, journeyRollback[1]!, journeyRollback[2]!);
  const journeyChanges = sub.match(/^journeys\/([^/]+)\/changes$/);
  if (journeyChanges && method === "GET") return handleJourneyChanges(req, journeyChanges[1]!);

  // KPI CRUD routes (KPI-SLA-02)
  if (sub === "kpis" && method === "POST") return handleKpiPost(req);
  const kpiOne = sub.match(/^kpis\/([^/]+)$/);
  if (kpiOne) {
    const id = decodeURIComponent(kpiOne[1]!);
    if (method === "PATCH") return handleKpiPatch(req, id);
    if (method === "POST") return handleKpiArchive(req, id);
    if (method === "GET") return handleKpiAuditLog(req, id);
  }

  // SLA CRUD routes (KPI-SLA-03)
  if (sub === "slas" && method === "POST") return handleSlaPost(req);
  const slaOne = sub.match(/^slas\/([^/]+)$/);
  if (slaOne) {
    const id = decodeURIComponent(slaOne[1]!);
    if (method === "PATCH") return handleSlaPatch(req, id);
    if (method === "POST") return handleSlaArchive(req, id);
    if (method === "GET") return handleSlaAuditLog(req, id);
  }

  // KPI alignment routes (KPI-SLA-04)
  if (sub === "kpi-alignments" && method === "POST") return handleKpiAlignmentPost(req);
  if (sub === "kpi-alignments" && method === "GET") return handleKpiAlignmentsGet(req);
  const kpiAlignmentOne = sub.match(/^kpi-alignments\/([^/]+)$/);
  if (kpiAlignmentOne && method === "DELETE") return handleKpiAlignmentDelete(req, kpiAlignmentOne[1]!);

  // OKR Directive routes
  if (sub === "okr-directives" && method === "POST") return handleOkrDirectivePost(req);
  if (sub === "okr-directives" && method === "GET") {
    const domainId = new URL(req.url).searchParams.get("domain_id");
    const productId = new URL(req.url).searchParams.get("product_id");
    if (domainId) return handleOkrDirectiveGet(req, domainId);
    if (productId) return handleOkrDirectiveGetByProduct(req, productId);
  }
  const okrDirectiveOne = sub.match(/^okr-directives\/([^/]+)$/);
  if (okrDirectiveOne) {
    const id = decodeURIComponent(okrDirectiveOne[1]!);
    if (method === "PATCH") return handleOkrDirectivePatch(req, id);
    if (method === "DELETE") return handleOkrDirectiveDelete(req, id);
  }

  // Key Result routes
  if (sub === "key-results" && method === "POST") return handleKeyResultPost(req);
  if (sub === "key-results" && method === "GET") {
    const directiveId = new URL(req.url).searchParams.get("directive_id");
    if (directiveId) return handleKeyResultGet(req, directiveId);
  }
  const keyResultOne = sub.match(/^key-results\/([^/]+)$/);
  if (keyResultOne) {
    const id = decodeURIComponent(keyResultOne[1]!);
    if (method === "PATCH") return handleKeyResultPatch(req, id);
    if (method === "DELETE") return handleKeyResultDelete(req, id);
  }

  // OKR Performance route
  if (sub === "okr-performance" && method === "GET") {
    const domainId = new URL(req.url).searchParams.get("domain_id");
    if (domainId) return handleOkrPerformanceGet(req, domainId);
  }

  // SLA alignment routes (KPI-SLA-04)
  if (sub === "sla-alignments" && method === "POST") return handleSlaAlignmentPost(req);
  if (sub === "sla-alignments" && method === "GET") return handleSlaAlignmentsGet(req);
  const slaAlignmentOne = sub.match(/^sla-alignments\/([^/]+)$/);
  if (slaAlignmentOne && method === "DELETE") return handleSlaAlignmentDelete(req, slaAlignmentOne[1]!);

  // KPI measurement routes (KPI-SLA-05)
  if (sub === "kpi-measurements" && method === "POST") return handleKpiMeasurementPost(req);
  if (sub === "kpi-measurements" && method === "GET") return handleKpiMeasurementsGet(req);
  const kpiMeasurementOne = sub.match(/^kpi-measurements\/([^/]+)$/);
  if (kpiMeasurementOne) {
    const id = decodeURIComponent(kpiMeasurementOne[1]!);
    if (method === "GET") return handleKpiMeasurementGet(req, id);
    if (method === "DELETE") return handleKpiMeasurementDelete(req, id);
  }

  // SLA breach routes (KPI-SLA-06)
  if (sub === "sla-breaches" && method === "POST") return handleSlaBreachPost(req);
  if (sub === "sla-breaches" && method === "GET") return handleSlaBreachesGet(req);
  const slaBreachOne = sub.match(/^sla-breaches\/([^/]+)$/);
  if (slaBreachOne) {
    const id = decodeURIComponent(slaBreachOne[1]!);
    if (method === "GET") return handleSlaBreachGet(req, id);
    if (method === "PATCH") return handleSlaBreachPatch(req, id);
    if (method === "DELETE") return handleSlaBreachDelete(req, id);
  }

  // KPI trend analysis routes (KPI-SLA-07)
  const kpiTrendsOne = sub.match(/^kpi-trends\/([^/]+)$/);
  if (kpiTrendsOne && method === "GET") return handleKpiTrendsGet(req, decodeURIComponent(kpiTrendsOne[1]!));

  // SLA compliance reporting routes (KPI-SLA-08)
  if (sub === "sla-compliance/all" && method === "GET") return handleSlaComplianceAllGet(req);
  const slaComplianceOne = sub.match(/^sla-compliance\/([^/]+)$/);
  if (slaComplianceOne && method === "GET") return handleSlaComplianceGet(req, decodeURIComponent(slaComplianceOne[1]!));
  const slaComplianceByDomain = sub.match(/^sla-compliance\/domain\/([^/]+)$/);
  if (slaComplianceByDomain && method === "GET") return handleSlaComplianceByDomainGet(req, decodeURIComponent(slaComplianceByDomain[1]!));

  // Persona CRUD routes (US-PER-01 through US-PER-05)
  if (sub === "personas" && method === "POST") return handlePersonaPost(req);
  if (sub === "personas" && method === "GET") return handlePersonaList(req);
  const personaOne = sub.match(/^personas\/([^/]+)$/);
  if (personaOne) {
    const id = decodeURIComponent(personaOne[1]!);
    if (method === "GET") return handlePersonaGet(req, id);
    if (method === "PATCH") return handlePersonaPatch(req, id);
    if (method === "DELETE") return handlePersonaDelete(req, id);
  }

  // Persona assignment routes (US-PER-10 through US-PER-13)
  if (sub === "persona-assignments" && method === "POST") return handlePersonaAssignmentPost(req);
  if (sub === "persona-assignments" && method === "GET") return handlePersonaAssignmentList(req);
  const personaAssignmentOne = sub.match(/^persona-assignments\/([^/]+)$/);
  if (personaAssignmentOne && method === "DELETE") return handlePersonaAssignmentDelete(req, personaAssignmentOne[1]!);

  // Graph analytics routes
  if (sub === "analytics/graph" && method === "GET") return handleGraphAnalytics();

  // Metrics endpoint for Prometheus scraping
  if (sub === "metrics" && method === "GET") return handleMetrics();

  return error(404, "not_found", "no route", { method, path });
}

async function handleMetrics(): Promise<Response> {
  return new Response(metrics.export(), {
    headers: { "Content-Type": "text/plain" },
  });
}
