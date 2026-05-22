import type { Driver } from "neo4j-driver";
import {
  type NodeLabel,
  type NodeCreateInput,
  type NodeUpdateInput,
  type Node,
} from "@companygraph/shared/schema/nodes";
import { generateId } from "../ids";
import { ValidationError, isConstraintViolation } from "../errors";

function deserializeNode(label: NodeLabel, neoNode: {
  properties: {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    attributes_json: string;
  };
}): Node {
  return {
    id: neoNode.properties.id,
    label,
    name: neoNode.properties.name,
    description: neoNode.properties.description,
    createdAt: neoNode.properties.createdAt,
    updatedAt: neoNode.properties.updatedAt,
    attributes: JSON.parse(neoNode.properties.attributes_json ?? "{}"),
  };
}

// POST /api/v1/nodes/:label — strict CREATE. 409 on duplicate id
// (closes design-review B-02).
export async function createNode(
  driver: Driver,
  label: NodeLabel,
  input: NodeCreateInput,
): Promise<Node> {
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  const props = {
    id,
    name: input.name,
    description: input.description ?? "",
    createdAt: now,
    updatedAt: now,
    attributes_json: JSON.stringify(input.attributes ?? {}),
  };
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(`CREATE (n:\`${label}\` $props) RETURN n`, { props }),
    );
    return deserializeNode(label, result.records[0]!.get("n") as Parameters<typeof deserializeNode>[1]);
  } catch (e) {
    if (isConstraintViolation(e)) {
      throw new ValidationError("id_conflict", { id, label });
    }
    throw e;
  } finally {
    await session.close();
  }
}

export async function getNode(
  driver: Driver,
  label: NodeLabel,
  id: string,
): Promise<Node> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (n:\`${label}\` {id: $id}) RETURN n`,
      { id },
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("not_found", { label, id }, 404);
    return deserializeNode(label, rec.get("n") as Parameters<typeof deserializeNode>[1]);
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/nodes/:label/:id — partial update. Builds the SET clause
// dynamically from defined keys only — omitted fields are never touched
// (closes design-review B-01).
//
// Empty body is the C-08 pinned decision: 200 + bump updatedAt only.
export async function patchNode(
  driver: Driver,
  label: NodeLabel,
  id: string,
  input: NodeUpdateInput,
): Promise<Node> {
  const now = new Date().toISOString();
  const sets: string[] = ["n.updatedAt = $updatedAt"];
  const params: Record<string, unknown> = { id, updatedAt: now };
  if (input.name !== undefined) {
    sets.push("n.name = $name");
    params.name = input.name;
  }
  if (input.description !== undefined) {
    sets.push("n.description = $description");
    params.description = input.description;
  }
  if (input.attributes !== undefined) {
    sets.push("n.attributes_json = $attrsJson");
    params.attrsJson = JSON.stringify(input.attributes);
  }
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (n:\`${label}\` {id: $id})
         SET ${sets.join(", ")}
         RETURN n`,
        params,
      ),
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("not_found", { label, id }, 404);
    return deserializeNode(label, rec.get("n") as Parameters<typeof deserializeNode>[1]);
  } finally {
    await session.close();
  }
}

// POST /api/v1/import (and seed loader only) — idempotent MERGE-on-id.
export async function upsertNode(
  driver: Driver,
  label: NodeLabel,
  input: NodeCreateInput,
): Promise<Node> {
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  const props = {
    id,
    name: input.name,
    description: input.description ?? "",
    createdAt: now,
    updatedAt: now,
    attributes_json: JSON.stringify(input.attributes ?? {}),
  };
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MERGE (n:\`${label}\` {id: $id})
         ON CREATE SET n = $props
         ON MATCH  SET n.name = $props.name,
                       n.description = $props.description,
                       n.updatedAt = $props.updatedAt,
                       n.attributes_json = $props.attributes_json
         RETURN n`,
        { id, props },
      ),
    );
    return deserializeNode(label, result.records[0]!.get("n") as Parameters<typeof deserializeNode>[1]);
  } finally {
    await session.close();
  }
}

export async function deleteNode(
  driver: Driver,
  label: NodeLabel,
  id: string,
  cascade: boolean,
): Promise<void> {
  const session = driver.session();
  try {
    if (cascade) {
      const result = await session.executeWrite((tx) =>
        tx.run(
          `MATCH (n:\`${label}\` {id: $id}) DETACH DELETE n RETURN count(n) AS n`,
          { id },
        ),
      );
      const n = (result.records[0]?.get("n") as { toNumber: () => number } | undefined)?.toNumber() ?? 0;
      if (n === 0) throw new ValidationError("not_found", { label, id }, 404);
      return;
    }
    // Non-cascade: refuse if attached edges exist.
    const check = await session.run(
      `MATCH (n:\`${label}\` {id: $id})
       OPTIONAL MATCH (n)-[r]-()
       RETURN n IS NOT NULL AS exists, count(r) AS edgeCount`,
      { id },
    );
    const row = check.records[0]!;
    if (!row.get("exists")) throw new ValidationError("not_found", { label, id }, 404);
    const edgeCount = (row.get("edgeCount") as { toNumber: () => number }).toNumber();
    if (edgeCount > 0) {
      throw new ValidationError(
        "has_edges",
        { label, id, edgeCount, hint: "use ?cascade=true to delete attached edges" },
        409,
      );
    }
    await session.executeWrite((tx) =>
      tx.run(`MATCH (n:\`${label}\` {id: $id}) DELETE n`, { id }),
    );
  } finally {
    await session.close();
  }
}
