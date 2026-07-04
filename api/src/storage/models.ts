// model-workspace-core T-05 (design §4.3) — BusinessModel CRUD storage.
//
// Lifecycle props (`ordinal`, `status`, `isReference`) are TOP-LEVEL
// Neo4j properties (never inside attributes_json) so the
// `business_model_ordinal_unique` constraint and server-side filters
// work (design rule 2). All writes ride dedicated routes — the generic
// node/edge routes reject lifecycle labels (T-10 guard).

import type { Driver } from "neo4j-driver";
import type {
  ModelCreateInput,
  ModelPatchInput,
  ModelRead,
  DomainAttachInput,
} from "@companygraph/shared/schema/model-workspace";
import type { Node } from "@companygraph/shared/schema/nodes";
import { generateId } from "../ids";
import { ValidationError, isConstraintViolation } from "../errors";
import { scopedNodeIds } from "./model-scope";

interface ModelProps {
  id: string;
  name: string;
  description: string;
  ordinal: number;
  status: string;
  isReference: boolean;
  createdAt: string;
  updatedAt: string;
  attributes_json: string;
}

function deserializeModel(
  props: ModelProps,
  moduleInstanceCount: number,
): ModelRead {
  return {
    id: props.id,
    name: props.name,
    description: props.description ?? "",
    ordinal: props.ordinal,
    status: (props.status ?? "active") as ModelRead["status"],
    isReference: props.isReference ?? false,
    moduleInstanceCount,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    attributes: JSON.parse(props.attributes_json ?? "{}"),
  };
}

// `ordinal = coalesce(max, 0) + 1` computed in the SAME write tx; the
// uniqueness constraint makes a concurrent double-create fail one side
// with ConstraintValidationFailed → bounded retry (≤ 3) recomputing
// max+1 (design §4.3).
export async function createModel(
  driver: Driver,
  input: ModelCreateInput & { isReference?: boolean },
): Promise<ModelRead> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const session = driver.session();
    try {
      const result = await session.executeWrite(async (tx) => {
        if (input.isReference) {
          // At-most-one-reference is not expressible as a Neo4j Community
          // constraint — enforced in-transaction (documented limitation).
          const ref = await tx.run(
            `MATCH (r:BusinessModel {isReference: true}) RETURN r.id AS id LIMIT 1`,
          );
          if (ref.records.length > 0) {
            throw new ValidationError(
              "invalid_payload",
              { cause: "a reference model already exists", existing: ref.records[0]!.get("id") },
            );
          }
        }
        const now = new Date().toISOString();
        return tx.run(
          `MATCH (existing:BusinessModel)
           WITH coalesce(max(existing.ordinal), 0) + 1 AS next
           CREATE (m:BusinessModel {
             id: $id, name: $name, description: $description,
             ordinal: next, status: "active", isReference: $isReference,
             createdAt: $now, updatedAt: $now, attributes_json: $attrs
           })
           RETURN m`,
          {
            id: generateId(),
            name: input.name,
            description: input.description ?? "",
            isReference: input.isReference ?? false,
            now,
            attrs: JSON.stringify(input.attributes ?? {}),
          },
        );
      });
      const props = (result.records[0]!.get("m") as { properties: ModelProps }).properties;
      return deserializeModel(props, 0);
    } catch (e) {
      lastError = e;
      if (isConstraintViolation(e) && attempt < maxAttempts - 1) continue;
      throw e;
    } finally {
      await session.close();
    }
  }
  throw lastError;
}

// ORDER BY ordinal ASC; moduleInstanceCount computed in the SAME query
// via INSTANCE_IN count — no N+1 (requirements C-06).
export async function listModels(driver: Driver): Promise<ModelRead[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (m:BusinessModel)
       OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
       WITH m, count(mi) AS instanceCount
       RETURN m, instanceCount
       ORDER BY m.ordinal ASC`,
    );
    return result.records.map((rec) =>
      deserializeModel(
        (rec.get("m") as { properties: ModelProps }).properties,
        rec.get("instanceCount") as number,
      ),
    );
  } finally {
    await session.close();
  }
}

export async function getModel(driver: Driver, id: string): Promise<ModelRead> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (m:BusinessModel {id: $id})
       OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
       RETURN m, count(mi) AS instanceCount`,
      { id },
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("model_not_found", { id }, 404);
    return deserializeModel(
      (rec.get("m") as { properties: ModelProps }).properties,
      rec.get("instanceCount") as number,
    );
  } finally {
    await session.close();
  }
}

// Dynamic SET — omitted fields are never clobbered (mirrors patchNode).
export async function patchModel(
  driver: Driver,
  id: string,
  input: ModelPatchInput,
): Promise<ModelRead> {
  const sets: string[] = ["m.updatedAt = $updatedAt"];
  const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    sets.push("m.name = $name");
    params.name = input.name;
  }
  if (input.description !== undefined) {
    sets.push("m.description = $description");
    params.description = input.description;
  }
  if (input.attributes !== undefined) {
    sets.push("m.attributes_json = $attrsJson");
    params.attrsJson = JSON.stringify(input.attributes);
  }
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (m:BusinessModel {id: $id})
         SET ${sets.join(", ")}
         WITH m
         OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
         RETURN m, count(mi) AS instanceCount`,
        params,
      ),
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("model_not_found", { id }, 404);
    return deserializeModel(
      (rec.get("m") as { properties: ModelProps }).properties,
      rec.get("instanceCount") as number,
    );
  } finally {
    await session.close();
  }
}

// Non-destructive: subgraph retained; only `status` flips.
export async function archiveModel(driver: Driver, id: string): Promise<ModelRead> {
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (m:BusinessModel {id: $id})
         SET m.status = "archived", m.updatedAt = $now
         WITH m
         OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
         RETURN m, count(mi) AS instanceCount`,
        { id, now: new Date().toISOString() },
      ),
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("model_not_found", { id }, 404);
    return deserializeModel(
      (rec.get("m") as { properties: ModelProps }).properties,
      rec.get("instanceCount") as number,
    );
  } finally {
    await session.close();
  }
}

// Cascade delete of the model-scoped STRUCTURAL subgraph. The
// scopedNodeIds set already excludes shared System/Role/Location
// (design §4.2 / N-03 — no separate subtraction needed). Catalog
// BusinessModule / BusinessModuleVersion nodes are model-independent
// and are NOT deleted.
export async function deleteModel(driver: Driver, id: string): Promise<void> {
  const existing = await getModel(driver, id);
  if (existing.isReference) {
    throw new ValidationError("model_reference_immutable", { id }, 409);
  }
  const scope = await scopedNodeIds(driver, id);
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`,
        { ids: Array.from(scope) },
      );
      await tx.run(
        `MATCH (m:BusinessModel {id: $id}) DETACH DELETE m`,
        { id },
      );
    });
  } finally {
    await session.close();
  }
}

// POST /api/v1/models/:id/domains (design §4.3, review B-02) — the
// minimal sanctioned API path that puts a Domain into a user-created
// model: creates the Domain (server UUIDv7) AND its IN_MODEL edge in
// one tx. The IN_MODEL edge is written internally here — the T-10
// guard on the generic edge route is not in this path. Richer domain
// authoring (attach-existing, move, detach) stays downstream.
export async function attachDomain(
  driver: Driver,
  modelId: string,
  input: DomainAttachInput,
): Promise<Node> {
  const session = driver.session();
  try {
    const now = new Date().toISOString();
    const domainId = generateId();
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (m:BusinessModel {id: $modelId})
         CREATE (d:Domain {
           id: $domainId, name: $name, description: $description,
           createdAt: $now, updatedAt: $now, attributes_json: $attrs
         })
         CREATE (d)-[:IN_MODEL {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(m)
         RETURN d`,
        {
          modelId,
          domainId,
          edgeId: generateId(),
          name: input.name,
          description: input.description ?? "",
          now,
          attrs: JSON.stringify(input.attributes ?? {}),
        },
      ),
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("model_not_found", { id: modelId }, 404);
    const props = (rec.get("d") as {
      properties: {
        id: string; name: string; description: string;
        createdAt: string; updatedAt: string; attributes_json: string;
      };
    }).properties;
    return {
      id: props.id,
      label: "Domain",
      name: props.name,
      description: props.description,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      attributes: JSON.parse(props.attributes_json ?? "{}"),
    };
  } finally {
    await session.close();
  }
}
