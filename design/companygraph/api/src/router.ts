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
} from "./routes/query";
import { handleHealthz } from "./routes/healthz";
import { handleStats } from "./routes/stats";
import { handleExportJson, handleExportNdjson } from "./routes/export";
import { handleOpenapi } from "./routes/openapi";
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

  return error(404, "not_found", "no route", { method, path });
}
