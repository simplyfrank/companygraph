// Glossary collection storage — CRUD for hierarchical glossary collections.
//
// Mirrors the pattern of node-labels.ts and edge-types.ts:
// - Single executeWrite transaction per mutation (NFR-01)
// - Audit + version + event writes in the same transaction
// - Constraint-based conflict detection

import type { Driver, ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare } from "fast-json-patch";
import type {
  GlossaryCollectionCreate,
  GlossaryCollectionPatch,
} from "@companygraph/shared/schema/ontology";
import { generateId } from "../../ids";
import { isConstraintViolation } from "../../errors";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";

export interface GlossaryCollectionRow {
  iri: string;
  label: string;
  description: string | null;
  collection_type: string;
  scope_level: string;
  source_type: string;
  source_url: string | null;
  parent_collection_iri: string | null;
  is_editable: boolean;
  status: string;
  concept_count: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

async function readGlossaryCollectionInTx(
  tx: ManagedTransaction,
  iri: string,
): Promise<GlossaryCollectionRow | null> {
  const res = await tx.run(
    `MATCH (c:_GlossaryCollection {iri: $iri})
     OPTIONAL MATCH (c)<-[:MEMBER_OF]-(t:_GlossaryTerm)
     RETURN c, count(t) AS concept_count`,
    { iri },
  );
  const rec = res.records[0];
  if (!rec) return null;

  const c = rec.get("c") as { properties: Record<string, unknown> } | null;
  if (!c) return null;
  const conceptCount = rec.get("concept_count") as number;

  return {
    iri: c.properties.iri as string,
    label: c.properties.label as string,
    description: (c.properties.description as string | null) ?? null,
    collection_type: c.properties.collection_type as string,
    scope_level: c.properties.scope_level as string,
    source_type: c.properties.source_type as string,
    source_url: (c.properties.source_url as string | null) ?? null,
    parent_collection_iri: (c.properties.parent_collection_iri as string | null) ?? null,
    is_editable: c.properties.is_editable as boolean,
    status: c.properties.status as string,
    concept_count: conceptCount,
    created_at: c.properties.created_at as string,
    created_by: (c.properties.created_by as string | null) ?? null,
    updated_at: c.properties.updated_at as string,
    updated_by: (c.properties.updated_by as string | null) ?? null,
  };
}

export async function createGlossaryCollection(
  driver: Driver,
  input: GlossaryCollectionCreate,
  actor: string,
): Promise<GlossaryCollectionRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      
      // Validate parent exists if specified
      if (input.parent_collection_iri) {
        const parentCheck = await tx.run(
          `MATCH (c:_GlossaryCollection {iri: $iri}) RETURN c`,
          { iri: input.parent_collection_iri },
        );
        if (parentCheck.records.length === 0) {
          ERROR_CODE_THROWERS.not_found({ name: input.parent_collection_iri, kind: "glossary_collection" });
        }
      }

      try {
        await tx.run(
          `CREATE (c:_GlossaryCollection {
             iri: $iri, label: $label, description: $description,
             collection_type: $collection_type, scope_level: $scope_level,
             source_type: $source_type, source_url: $source_url,
             parent_collection_iri: $parent_collection_iri,
             is_editable: $is_editable, status: $status,
             created_at: $now, updated_at: $now, created_by: $actor, updated_by: $actor
           })`,
          {
            iri: input.iri,
            label: input.label,
            description: input.description ?? null,
            collection_type: input.collection_type,
            scope_level: input.scope_level,
            source_type: input.source_type,
            source_url: input.source_url ?? null,
            parent_collection_iri: input.parent_collection_iri ?? null,
            is_editable: input.is_editable,
            status: input.status,
            now,
            actor,
          },
        );

        const after = await readGlossaryCollectionInTx(tx, input.iri);
        if (!after) {
          throw new Error(`createGlossaryCollection: row not readable post-write for ${input.iri}`);
        }

        const version_id = generateId();
        await writeAudit(
          tx,
          actor,
          "create_glossary_collection",
          input.iri,
          null,
          after,
          version_id,
        );
        await writeVersion(tx, version_id, actor, "create_glossary_collection", input);
        await writeEvent(tx, version_id, [
          { op: "add", path: `/glossaryCollections/${input.iri}`, value: after },
        ]);
        return after;
      } catch (e) {
        if (isConstraintViolation(e)) {
          ERROR_CODE_THROWERS.name_conflict({ name: input.iri });
        }
        throw e;
      }
    });
  } finally {
    await session.close();
  }
}

export async function getGlossaryCollection(
  driver: Driver,
  iri: string,
): Promise<GlossaryCollectionRow | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead((tx) => readGlossaryCollectionInTx(tx, iri));
  } finally {
    await session.close();
  }
}

export async function listGlossaryCollections(
  driver: Driver,
  scopeLevel?: string,
): Promise<ReadonlyArray<GlossaryCollectionRow>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      let query = `
        MATCH (c:_GlossaryCollection)
        OPTIONAL MATCH (c)<-[:MEMBER_OF]-(t:_GlossaryTerm)
        WITH c, count(t) AS concept_count
        RETURN c, concept_count
        ORDER BY c.label
      `;
      const params: Record<string, unknown> = {};

      if (scopeLevel) {
        query = `
          MATCH (c:_GlossaryCollection {scope_level: $scopeLevel})
          OPTIONAL MATCH (c)<-[:MEMBER_OF]-(t:_GlossaryTerm)
          WITH c, count(t) AS concept_count
          RETURN c, concept_count
          ORDER BY c.label
        `;
        params.scopeLevel = scopeLevel;
      }

      const res = await tx.run(query, params);
      const rows: GlossaryCollectionRow[] = [];
      for (const rec of res.records) {
        const c = rec.get("c") as { properties: Record<string, unknown> } | null;
        if (!c) continue;
        const conceptCount = rec.get("concept_count") as number;
        rows.push({
          iri: c.properties.iri as string,
          label: c.properties.label as string,
          description: (c.properties.description as string | null) ?? null,
          collection_type: c.properties.collection_type as string,
          scope_level: c.properties.scope_level as string,
          source_type: c.properties.source_type as string,
          source_url: (c.properties.source_url as string | null) ?? null,
          parent_collection_iri: (c.properties.parent_collection_iri as string | null) ?? null,
          is_editable: c.properties.is_editable as boolean,
          status: c.properties.status as string,
          concept_count: conceptCount,
          created_at: c.properties.created_at as string,
          created_by: (c.properties.created_by as string | null) ?? null,
          updated_at: c.properties.updated_at as string,
          updated_by: (c.properties.updated_by as string | null) ?? null,
        });
      }
      return rows;
    });
  } finally {
    await session.close();
  }
}

export async function patchGlossaryCollection(
  driver: Driver,
  iri: string,
  input: GlossaryCollectionPatch,
  actor: string,
): Promise<GlossaryCollectionRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const before = await readGlossaryCollectionInTx(tx, iri);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: iri, kind: "glossary_collection" });
      }

      const now = new Date().toISOString();
      const sets: string[] = ["c.updated_at = $now", "c.updated_by = $actor"];
      const params: Record<string, unknown> = { iri, now, actor };

      if (input.label !== undefined) {
        sets.push("c.label = $label");
        params.label = input.label;
      }
      if (input.description !== undefined) {
        sets.push("c.description = $description");
        params.description = input.description;
      }
      if (input.is_editable !== undefined) {
        sets.push("c.is_editable = $is_editable");
        params.is_editable = input.is_editable;
      }
      if (input.status !== undefined) {
        sets.push("c.status = $status");
        params.status = input.status;
      }

      await tx.run(
        `MATCH (c:_GlossaryCollection {iri: $iri})
         SET ${sets.join(", ")}`,
        params,
      );

      const after = await readGlossaryCollectionInTx(tx, iri);
      if (!after) {
        throw new Error(`patchGlossaryCollection: row not readable post-write for ${iri}`);
      }

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "patch_glossary_collection",
        iri,
        before,
        after,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "patch_glossary_collection", {
        iri,
        patch: input,
      });
      await writeEvent(
        tx,
        version_id,
        jsonpatchCompare(before as unknown as object, after as unknown as object) as unknown as ReadonlyArray<Record<string, unknown>>,
      );
      return after;
    });
  } finally {
    await session.close();
  }
}

export async function deleteGlossaryCollection(
  driver: Driver,
  iri: string,
  actor: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const before = await readGlossaryCollectionInTx(tx, iri);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: iri, kind: "glossary_collection" });
      }

      // Check for child collections
      const childCheck = await tx.run(
        `MATCH (c:_GlossaryCollection {parent_collection_iri: $iri}) RETURN count(c) AS count`,
        { iri },
      );
      const childCount = childCheck.records[0]?.get("count") as number;
      if (childCount > 0) {
        ERROR_CODE_THROWERS.validation_error({
          message: "Cannot delete collection with child collections",
          details: { child_count: childCount },
        });
      }

      // Check for terms
      const termCheck = await tx.run(
        `MATCH (t:_GlossaryTerm {collection_iri: $iri}) RETURN count(t) AS count`,
        { iri },
      );
      const termCount = termCheck.records[0]?.get("count") as number;
      if (termCount > 0) {
        ERROR_CODE_THROWERS.validation_error({
          message: "Cannot delete collection with terms",
          details: { term_count: termCount },
        });
      }

      await tx.run(
        `MATCH (c:_GlossaryCollection {iri: $iri}) DETACH DELETE c`,
        { iri },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "delete_glossary_collection",
        iri,
        before,
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "delete_glossary_collection", { iri });
      await writeEvent(tx, version_id, [
        { op: "remove", path: `/glossaryCollections/${iri}` },
      ]);
    });
  } finally {
    await session.close();
  }
}
