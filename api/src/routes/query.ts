import { z } from "zod";
import { getDriver } from "../neo4j/driver";
import { runPassthrough } from "../neo4j/read-only-session";
import { error, ok, parseId, parseRegistryLabel, readJson } from "./_helpers";
import { ValidationError } from "../errors";

const MAX_DEPTH = 8;

// listDomains
export async function handleListDomains(): Promise<Response> {
  const { rows } = await runPassthrough(
    getDriver(),
    `MATCH (d:Domain) RETURN d.id AS id, d.name AS name, d.description AS description ORDER BY d.id LIMIT 1001`,
  );
  return ok({ rows });
}

export async function handleGetDomain(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const { rows } = await runPassthrough(
    getDriver(),
    `MATCH (d:Domain {id: $id})
     OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
     WITH d, collect(CASE WHEN j IS NULL THEN NULL ELSE {id: j.id, name: j.name} END) AS allJourneys
     RETURN d.id AS id, d.name AS name, d.description AS description,
            [x IN allJourneys WHERE x IS NOT NULL] AS journeys`,
    { id },
  );
  if (rows.length === 0) return error(404, "not_found", "domain not found", { id });
  return ok({ rows });
}

export async function handleGetJourney(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const { rows } = await runPassthrough(
    getDriver(),
    `MATCH (j:UserJourney {id: $id})
     OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
     WITH j,
          collect(CASE WHEN a IS NULL THEN NULL
                  ELSE {
                    id: a.id, name: a.name,
                    sla_target_hours:  apoc.convert.fromJsonMap(coalesce(a.attributes_json, "{}"))[\'sla_target_hours\'],
                    p95_hours:         apoc.convert.fromJsonMap(coalesce(a.attributes_json, "{}"))[\'p95_hours\'],
                    kpi_score:         apoc.convert.fromJsonMap(coalesce(a.attributes_json, "{}"))[\'kpi_score\']
                  } END) AS allActivities
     WITH j, [x IN allActivities WHERE x IS NOT NULL] AS activities,
          apoc.convert.fromJsonMap(coalesce(j.attributes_json, "{}")) AS jAttrs
     RETURN j.id AS id, j.name AS name, j.description AS description,
            activities,
            jAttrs[\'sla_target_hours\'] AS sla_target_hours,
            jAttrs[\'p95_hours\']        AS p95_hours,
            jAttrs[\'kpi_score\']        AS kpi_score,
            jAttrs[\'owner_team\']       AS owner_team,
            jAttrs[\'_verification\']    AS verification`,
    { id },
  );
  if (rows.length === 0) return error(404, "not_found", "journey not found", { id });
  return ok({ rows });
}

export async function handleGetActivity(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const { rows } = await runPassthrough(
    getDriver(),
    `MATCH (a:Activity {id: $id})
     RETURN a.id AS id, a.name AS name, a.description AS description`,
    { id },
  );
  if (rows.length === 0) return error(404, "not_found", "activity not found", { id });
  return ok({ rows });
}

// findPath — single shortest path, single-source-to-single-target.
// Per design §5.4 — uses shortestPath (O(V+E)), per-tx timeout via
// runPassthrough's TX_TIMEOUT_MS.
const findPathQuery = z.object({
  fromId: z.string(),
  toId: z.string(),
  maxDepth: z.coerce.number().int().min(1).max(MAX_DEPTH).default(4),
});

export async function handleFindPath(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const params = findPathQuery.safeParse({
    fromId: u.searchParams.get("fromId"),
    toId: u.searchParams.get("toId"),
    maxDepth: u.searchParams.get("maxDepth") ?? undefined,
  });
  if (!params.success) {
    const fieldErrors = params.error.flatten().fieldErrors;
    // Distinguish depth_exceeded from generic invalid_payload (NFR-09 / AC-23).
    if (fieldErrors.maxDepth) {
      return error(400, "depth_exceeded", "maxDepth exceeds NFR-09 cap (8)", { cap: MAX_DEPTH });
    }
    return error(400, "invalid_payload", "missing or invalid query params", { fieldErrors });
  }
  if (params.data.fromId === params.data.toId) {
    return ok({ rows: [{ length: 0, nodes: [params.data.fromId], edges: [] }] });
  }
  // shortestPath returns 0 or 1 row.
  const { rows } = await runPassthrough(
    getDriver(),
    `MATCH (a {id: $fromId}), (b {id: $toId}),
           p = shortestPath((a)-[*..${params.data.maxDepth}]-(b))
     RETURN [n IN nodes(p) | n.id] AS nodes,
            [r IN relationships(p) | r.id] AS edges,
            length(p) AS length
     LIMIT 1`,
    { fromId: params.data.fromId, toId: params.data.toId },
  );
  return ok({ rows });
}

const neighborsQuery = z.object({
  depth: z.coerce.number().int().min(1).max(MAX_DEPTH).default(1),
});

export async function handleNeighbors(req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const u = new URL(req.url);
  const parsed = neighborsQuery.safeParse({ depth: u.searchParams.get("depth") ?? undefined });
  if (!parsed.success) {
    return error(400, "depth_exceeded", "depth exceeds NFR-09 cap (8)", { cap: MAX_DEPTH });
  }
  const { rows } = await runPassthrough(
    getDriver(),
    `MATCH (n {id: $id})
     OPTIONAL MATCH (n)-[r*1..${parsed.data.depth}]-(m)
     WITH DISTINCT n, m, r
     RETURN m{.id, .name} AS node, labels(m)[0] AS label
     LIMIT 1001`,
    { id },
  );
  return ok({ rows });
}

// Cypher passthrough — read-only via runPassthrough; driver AccessMode
// is the sole gate (design pass-1 C-04: regex retired).
const cypherSchema = z.object({
  statement: z.string().min(1).max(50_000),
  params: z.record(z.unknown()).optional(),
});

export async function handleCypher(req: Request): Promise<Response> {
  const body = await readJson(req);
  const parsed = cypherSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("invalid_payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const { rows } = await runPassthrough(getDriver(), parsed.data.statement, parsed.data.params ?? {});
  return ok({ rows });
}

// Substring search across node names — backs process-explorer-ui's
// typeahead binding (FR-17) + the global search palette (FR-08).
// Each label has its own fulltext index named `<label_lower>_name_fulltext`
// created in api/src/neo4j/bootstrap.ts.
const searchQuery = z.object({
  label: z.string().min(1),
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function handleSearch(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const parsed = searchQuery.safeParse({
    label: u.searchParams.get("label"),
    q: u.searchParams.get("q"),
    limit: u.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return error(400, "invalid_payload", "missing or invalid query params", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const label = await parseRegistryLabel(parsed.data.label);
  if (!label) {
    return error(400, "unknown_label", "unknown label", { label: parsed.data.label });
  }
  const indexName = `${label.toLowerCase()}_name_fulltext`;
  // LIMIT must be a literal integer in Cypher (Neo4j 5 rejects float
  // parameters there). Validated by zod as an int 1..100, safe to inline.
  const limit = parsed.data.limit;
  const { rows } = await runPassthrough(
    getDriver(),
    `CALL db.index.fulltext.queryNodes($index, $q) YIELD node
     RETURN node.id AS id, node.name AS name, $label AS label
     LIMIT ${limit}`,
    { index: indexName, q: parsed.data.q, label },
  );
  return ok({ rows });
}
