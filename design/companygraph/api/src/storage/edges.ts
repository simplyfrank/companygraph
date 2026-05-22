import type { Driver } from "neo4j-driver";
import {
  EDGE_TYPES,
  EDGE_ENDPOINTS,
  type EdgeCreateInput,
  type Edge,
  type EdgeType,
} from "@companygraph/shared/schema/edges";
import { type NodeLabel } from "@companygraph/shared/schema/nodes";
import { generateId } from "../ids";
import { ValidationError, isConstraintViolation } from "../errors";

// Shared validator — runs before either createEdge or upsertEdge. The
// optional `phase` ctx is populated when called from /import phase 2 so
// edge_endpoint_missing carries `details.phase: 1` when the missing
// endpoint was a failed phase-1 node.
//
// Steps:
//   1. Existence + label lookup of fromId, toId.
//   2. (type, fromLabel, toLabel) whitelist check via EDGE_ENDPOINTS
//      (resolves pass-2 C-02 from the requirements review).
//   3. Cross-type id uniqueness (resolves design-review C-10).
async function validateEdge(
  driver: Driver,
  input: EdgeCreateInput,
  ctx?: { phase: 1 | 2 },
): Promise<{ fromLabel: NodeLabel; toLabel: NodeLabel }> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const phaseDetail = ctx ? { phase: ctx.phase } : {};

    const fromRes = await session.run(
      `MATCH (n {id: $id}) RETURN labels(n)[0] AS l`,
      { id: input.fromId },
    );
    const fromLabel = (fromRes.records[0]?.get("l") as NodeLabel | undefined);
    if (!fromLabel) {
      throw new ValidationError("edge_endpoint_missing", {
        side: "fromId", id: input.fromId, ...phaseDetail,
      });
    }

    const toRes = await session.run(
      `MATCH (n {id: $id}) RETURN labels(n)[0] AS l`,
      { id: input.toId },
    );
    const toLabel = (toRes.records[0]?.get("l") as NodeLabel | undefined);
    if (!toLabel) {
      throw new ValidationError("edge_endpoint_missing", {
        side: "toId", id: input.toId, ...phaseDetail,
      });
    }

    const allowed = EDGE_ENDPOINTS[input.type];
    if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) {
      throw new ValidationError("edge_endpoint_label_mismatch", {
        type: input.type,
        fromLabel,
        toLabel,
        allowed: allowed.map(([f, t]) => ({ from: f, to: t })),
      });
    }

    // C-10: cross-type edge id collision check (only when id is supplied).
    if (input.id !== undefined) {
      const collisionCypher = EDGE_TYPES.map(
        (t) => `EXISTS { MATCH ()-[r:\`${t}\`]-() WHERE r.id = $id }`,
      ).join(" OR ");
      const res = await session.run(
        `RETURN ${collisionCypher} AS exists`,
        { id: input.id },
      );
      if (res.records[0]?.get("exists") === true) {
        throw new ValidationError("id_conflict", { id: input.id });
      }
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
    const n = (result.records[0]?.get("n") as { toNumber: () => number } | undefined)?.toNumber() ?? 0;
    if (n === 0) {
      throw new ValidationError("not_found", { id }, 404);
    }
  } finally {
    await session.close();
  }
}
