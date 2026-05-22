import type { Driver } from "neo4j-driver";
import {
  EDGE_TYPES,
  type EdgeCreateInput,
  type Edge,
  type EdgeType,
} from "@companygraph/shared/schema/edges";
import { type NodeLabel } from "@companygraph/shared/schema/nodes";
import { generateId } from "../ids";
import { ValidationError, isConstraintViolation } from "../errors";
import { getEdgeEndpoints } from "../ontology/cache/edge-endpoints";

// Shared validator — runs before either createEdge or upsertEdge. The
// optional `phase` ctx is populated when called from /import phase 2 so
// edge_endpoint_missing carries `details.phase: 1` when the missing
// endpoint was a failed phase-1 node.
//
// Architecture: the existence + label lookup + cross-type id collision
// check are resolved in a SINGLE read session and ONE parameterized
// Cypher query. The (type, fromLabel, toLabel) whitelist now comes from
// the runtime `_OntologyEdgeEndpoint` registry via T-13's cache (cache
// hit ≤ 1 ms p99, cache miss ≤ 50 ms p99) — see
// `api/src/ontology/cache/edge-endpoints.ts` + ontology-manager design
// §7.2 + FR-04a. The compile-time endpoint-matrix lookup is gone;
// error code + response shape are unchanged so graph-core/AC-13
// continues to pass.
//
// NFR-02 boundary: `EDGE_TYPES` still imports — it's the basis of the
// cross-type id-collision EXISTS expression below + the closed zod enum
// at the REST boundary. The compile-time endpoint matrix is now
// off-limits to this module (registry-only).
//
// Steps:
//   1. Cache lookup of allowed (fromLabel, toLabel) pairs (1 cache hit
//      or 1 indexed Cypher fetch). Done BEFORE opening the validator
//      session so a cache miss doesn't hold the read session open.
//   2. Existence + label lookup of fromId, toId + cross-type id
//      collision EXISTS — single Cypher round-trip.
//   3. (type, fromLabel, toLabel) whitelist check applied in JS against
//      the cache result.
async function validateEdge(
  driver: Driver,
  input: EdgeCreateInput,
  ctx?: { phase: 1 | 2 },
): Promise<{ fromLabel: NodeLabel; toLabel: NodeLabel }> {
  const phaseDetail = ctx ? { phase: ctx.phase } : {};

  // (1) Resolve the allowed (fromLabel, toLabel) pair list from the
  // runtime registry via the T-13 cache. Done BEFORE opening the
  // session so a cache miss (~50 ms p99) doesn't hold our session.
  // `getEdgeEndpoints` returns ReadonlyArray<readonly [string, string]>.
  const allowed = await getEdgeEndpoints(input.type, driver);

  // Build the cross-type collision EXISTS clause only when an id is
  // supplied. When no id is provided a new one will be generated, so
  // there can be no collision.
  const otherTypes = input.id !== undefined
    ? EDGE_TYPES.filter((t) => t !== input.type)
    : [];
  const collisionExpr = otherTypes.length > 0
    ? otherTypes.map((t) => `EXISTS { MATCH ()-[r:\`${t}\`]-() WHERE r.id = $edgeId }`).join(" OR ")
    : "false";

  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `OPTIONAL MATCH (a {id: $fromId})
       OPTIONAL MATCH (b {id: $toId})
       RETURN labels(a)[0] AS fromLabel,
              labels(b)[0] AS toLabel,
              (${collisionExpr}) AS idCollision`,
      { fromId: input.fromId, toId: input.toId, edgeId: input.id ?? null },
    );

    const rec = res.records[0];
    const fromLabel = rec?.get("fromLabel") as NodeLabel | null | undefined;
    const toLabel   = rec?.get("toLabel")   as NodeLabel | null | undefined;

    if (!fromLabel) {
      throw new ValidationError("edge_endpoint_missing", {
        side: "fromId", id: input.fromId, ...phaseDetail,
      });
    }
    if (!toLabel) {
      throw new ValidationError("edge_endpoint_missing", {
        side: "toId", id: input.toId, ...phaseDetail,
      });
    }

    if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) {
      throw new ValidationError("edge_endpoint_label_mismatch", {
        type: input.type,
        fromLabel,
        toLabel,
        allowed: allowed.map(([f, t]) => ({ from: f, to: t })),
      });
    }

    // C-10: cross-type edge id uniqueness — result already in rec.
    if (rec?.get("idCollision") === true) {
      throw new ValidationError("id_conflict", { id: input.id });
    }

    return { fromLabel, toLabel };
  } finally {
    await session.close();
  }
}

function deserializeEdge(type: EdgeType, record: {
  get: (k: string) => unknown;
}): Edge {
  const rel = record.get("r") as {
    properties: { id: string; createdAt: string; attributes_json: string };
  };
  return {
    id: rel.properties.id,
    type,
    fromId: record.get("fromId") as string,
    toId: record.get("toId") as string,
    createdAt: rel.properties.createdAt,
    attributes: JSON.parse(rel.properties.attributes_json ?? "{}"),
  };
}

// POST /api/v1/edges — strict CREATE. 409 on duplicate id (closes pass-1 B-02).
export async function createEdge(
  driver: Driver,
  input: EdgeCreateInput,
): Promise<Edge> {
  await validateEdge(driver, input);
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  const attrs = JSON.stringify(input.attributes ?? {});
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a {id: $fromId}), (b {id: $toId})
         CREATE (a)-[r:\`${input.type}\` {id: $id, createdAt: $now, attributes_json: $attrs}]->(b)
         RETURN r, a.id AS fromId, b.id AS toId`,
        { id, fromId: input.fromId, toId: input.toId, now, attrs },
      ),
    );
    return deserializeEdge(input.type, result.records[0]!);
  } catch (e) {
    if (isConstraintViolation(e)) {
      throw new ValidationError("id_conflict", { id, type: input.type });
    }
    throw e;
  } finally {
    await session.close();
  }
}

// /api/v1/import phase 2 — idempotent MERGE-on-id.
export async function upsertEdge(
  driver: Driver,
  input: EdgeCreateInput,
  phase: 1 | 2 = 2,
): Promise<Edge> {
  await validateEdge(driver, input, { phase });
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  const attrs = JSON.stringify(input.attributes ?? {});
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a {id: $fromId}), (b {id: $toId})
         MERGE (a)-[r:\`${input.type}\` {id: $id}]->(b)
         ON CREATE SET r.createdAt = $now, r.attributes_json = $attrs
         ON MATCH  SET r.attributes_json = $attrs
         RETURN r, a.id AS fromId, b.id AS toId`,
        { id, fromId: input.fromId, toId: input.toId, now, attrs },
      ),
    );
    return deserializeEdge(input.type, result.records[0]!);
  } finally {
    await session.close();
  }
}

export async function deleteEdge(driver: Driver, id: string): Promise<void> {
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH ()-[r {id: $id}]-() DELETE r RETURN count(r) AS n`,
        { id },
      ),
    );
    const n = (result.records[0]?.get("n") as number | undefined) ?? 0;
    if (n === 0) {
      throw new ValidationError("not_found", { id }, 404);
    }
  } finally {
    await session.close();
  }
}
