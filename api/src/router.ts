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
} from "./routes/query";
import { handleHealthz } from "./routes/healthz";
import { handleStats } from "./routes/stats";
import { handleExportJson, handleExportNdjson } from "./routes/export";
import { handleOpenapi } from "./routes/openapi";
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
import { error, fromValidationError } from "./routes/_helpers";
import { ValidationError } from "./errors";
import { logRequest } from "./logging";

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
    method,
    path,
    status: res.status,
    durationMs: performance.now() - t0,
  });
  return res;
}

async function dispatch(method: string, path: string, req: Request): Promise<Response> {
  // Trim /api/v1/ prefix.
  const sub = path.slice("/api/v1/".length);

  if (sub === "healthz" && method === "GET") return handleHealthz();
  if (sub === "stats" && method === "GET") return handleStats();
  if (sub === "openapi.json" && method === "GET") return handleOpenapi();
  if (sub === "import" && method === "POST") return handleImport(req);
  if (sub === "export" && method === "GET") return handleExportJson();
  if (sub === "export.ndjson" && method === "GET") return handleExportNdjson();

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

  return error(404, "not_found", "no route", { method, path });
}
