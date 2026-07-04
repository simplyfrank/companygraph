import type { Driver } from "neo4j-driver";
import type { z } from "zod";
import {
  type NodeCreateInput,
  type NodeUpdateInput,
  type Node,
} from "@companygraph/shared/schema/nodes";
import { generateId } from "../ids";
import { ValidationError, isConstraintViolation } from "../errors";
import { getAttributeValidator } from "../ontology/cache/attribute-zod";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";

// T-15 / FR-04 — per-label attribute schema enforcement.
//
// Loads the compiled zod validator for the node's label from the
// attribute-zod cache (api/src/ontology/cache/attribute-zod.ts) and
// runs `safeParse` against the input attributes map. On failure,
// throws `attribute_violation` (400) with details split into:
//   • `missing[]`      — required keys absent from input
//   • `type_mismatch[]` — keys present but with the wrong primitive type
//
// AC-03 invariant: this runs on WRITE paths only (createNode /
// patchNode / upsertNode). A registry mutation (adding a new label or
// patching `json_schema_doc`) NEVER triggers a retroactive validation
// pass over existing data — existing rows that don't satisfy a
// newly-tightened schema remain in place until `forceBackfill` in
// `patchNodeLabel` rewrites them.
//
// Graceful fallback: when the registry has no entry for the label
// (e.g. an integration test created the data label directly without
// seeding the registry), the cache helper throws `not_found`. Treat
// that as a permissive default — the write proceeds without per-label
// validation. The top-level shape is still guarded by the route-layer
// `nodeCreateSchema` / `nodeUpdateSchema` in shared.
// system-augmentation-model T-07 (DD-07): non-throwing core, extracted so
// the import route's dry-run can run the SAME registry attribute check the
// write path uses (registry READ, zero writes). Returns `null` when the
// attributes satisfy the label's registered schema — including the
// `not_found → permissive` fallback for unregistered labels — or the
// classified issue split otherwise.
export async function checkAttributesAgainstSchema(
  label: string,
  attributes: Record<string, unknown> | undefined,
): Promise<{ missing: string[]; type_mismatch: string[] } | null> {
  let validator: z.ZodTypeAny;
  try {
    validator = await getAttributeValidator(label);
  } catch (e) {
    // The cache throws `not_found` when the label has no registry row.
    // Treat that as permissive — proceed with the write.
    if ((e as { code?: string }).code === "not_found") return null;
    throw e;
  }
  const parsed = validator.safeParse(attributes ?? {});
  if (parsed.success) return null;

  const missing: string[] = [];
  const type_mismatch: string[] = [];
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "<root>";
    // Zod marks missing required keys as `invalid_type` with
    // `received === "undefined"`. Everything else is a type mismatch.
    const isMissing =
      issue.code === "invalid_type" &&
      (issue as { received?: string }).received === "undefined";
    if (isMissing) {
      if (!missing.includes(key)) missing.push(key);
    } else {
      if (!type_mismatch.includes(key)) type_mismatch.push(key);
    }
  }
  return { missing, type_mismatch };
}

// Throwing wrapper — byte-for-byte identical semantics to the pre-T-07
// function: valid (or unregistered label) → resolves; violation →
// throws 400 `attribute_violation` with the `details` split above.
async function assertAttributesMatchSchema(
  label: string,
  attributes: Record<string, unknown> | undefined,
): Promise<void> {
  const violation = await checkAttributesAgainstSchema(label, attributes);
  if (violation === null) return;
  ERROR_CODE_THROWERS.attribute_violation(violation);
}

function deserializeNode(label: string, neoNode: {
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
  label: string,
  input: NodeCreateInput,
): Promise<Node> {
  // FR-04 — per-label attribute schema enforcement (runs BEFORE the
  // storage write so violations short-circuit without touching Neo4j).
  await assertAttributesMatchSchema(label, input.attributes);

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
      throw new ValidationError("id_conflict", { id, label }, 409);
    }
    throw e;
  } finally {
    await session.close();
  }
}

export async function getNode(
  driver: Driver,
  label: string,
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
  label: string,
  id: string,
  input: NodeUpdateInput,
): Promise<Node> {
  // FR-04 — per-label attribute schema enforcement. The PATCH attributes
  // semantic is replace-the-whole-map (see the `n.attributes_json = $attrsJson`
  // SET below), so the new map must satisfy the registered schema in full.
  // When `attributes` is omitted the existing row's attributes stay
  // untouched, so no validation is needed.
  if (input.attributes !== undefined) {
    await assertAttributesMatchSchema(label, input.attributes);
  }

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
// Accepts optional `createdAt` / `updatedAt` so an export → import
// round-trip preserves timestamps byte-for-byte (AC-25). When absent
// (e.g. seed-loader path) both default to `now`.
export async function upsertNode(
  driver: Driver,
  label: string,
  input: NodeCreateInput & { createdAt?: string; updatedAt?: string },
): Promise<Node> {
  // FR-04 — per-label attribute schema enforcement on the import path.
  // ValidationErrors surface in the import response's `errors[]` array
  // (see routes/import.ts) rather than aborting the envelope.
  await assertAttributesMatchSchema(label, input.attributes);

  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  const props = {
    id,
    name: input.name,
    description: input.description ?? "",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
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
  label: string,
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
      const n = (result.records[0]?.get("n") as number | undefined) ?? 0;
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
    // Cypher with no matching node returns zero records — handle that as
    // not_found rather than crashing on `row.get` (the previous shape
    // assumed `MATCH` always produced a row, which is only true when the
    // node exists).
    const row = check.records[0];
    if (!row || !row.get("exists")) {
      throw new ValidationError("not_found", { label, id }, 404);
    }
    const edgeCount = row.get("edgeCount") as number;
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
