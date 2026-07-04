// Glossary term storage — CRUD for glossary terms with conflict detection.
//
// Mirrors the pattern of node-labels.ts and edge-types.ts:
// - Single executeWrite transaction per mutation (NFR-01)
// - Audit + version + event writes in the same transaction
// - Conflict detection between enterprise and subdomain terms

import type { Driver, ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare } from "fast-json-patch";
import type {
  GlossaryTermCreate,
  GlossaryTermPatch,
} from "@companygraph/shared/schema/ontology";
import { generateId } from "../../ids";
import { isConstraintViolation } from "../../errors";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";
import { getGlossaryCollection } from "./glossary-collections";

export interface GlossaryTermRow {
  id: string;
  iri: string;
  local_name: string;
  label: string;
  description: string | null;
  status: string;
  collection_iri: string;
  synonyms: string[];
  tags: string[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

async function readGlossaryTermInTx(
  tx: ManagedTransaction,
  id: string,
): Promise<GlossaryTermRow | null> {
  const res = await tx.run(
    `MATCH (t:_GlossaryTerm {id: $id}) RETURN t`,
    { id },
  );
  const rec = res.records[0];
  if (!rec) return null;

  const t = rec.get("t") as { properties: Record<string, unknown> } | null;
  if (!t) return null;

  return {
    id: t.properties.id as string,
    iri: t.properties.iri as string,
    local_name: t.properties.local_name as string,
    label: t.properties.label as string,
    description: (t.properties.description as string | null) ?? null,
    status: t.properties.status as string,
    collection_iri: t.properties.collection_iri as string,
    synonyms: (t.properties.synonyms as string[]) ?? [],
    tags: (t.properties.tags as string[]) ?? [],
    created_at: t.properties.created_at as string,
    created_by: (t.properties.created_by as string | null) ?? null,
    updated_at: t.properties.updated_at as string,
    updated_by: (t.properties.updated_by as string | null) ?? null,
  };
}

// Check for conflicts with existing terms at higher scope levels
async function checkTermConflicts(
  driver: Driver,
  localName: string,
  collectionIri: string,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // Get the scope level of the target collection
    const collection = await getGlossaryCollection(driver, collectionIri);
    if (!collection) {
      ERROR_CODE_THROWERS.not_found({ name: collectionIri, kind: "glossary_collection" });
    }

    // Check for conflicts with terms in ENTERPRISE scope
    if (collection.scope_level !== "ENTERPRISE") {
      const conflictCheck = await session.run(
        `MATCH (c:_GlossaryCollection {scope_level: 'ENTERPRISE'})<-[:MEMBER_OF]-(t:_GlossaryTerm {local_name: $localName})
         RETURN t.iri AS conflicting_iri, c.iri AS collection_iri`,
        { localName },
      );

      if (conflictCheck.records.length > 0) {
        const conflict = conflictCheck.records[0];
        if (conflict) {
          ERROR_CODE_THROWERS.validation_error({
            message: "Term conflicts with existing enterprise-level term",
            details: {
              local_name: localName,
              conflicting_iri: conflict.get("conflicting_iri"),
              enterprise_collection_iri: conflict.get("collection_iri"),
            },
          });
        }
      }
    }
  } finally {
    await session.close();
  }
}

export async function createGlossaryTerm(
  driver: Driver,
  input: GlossaryTermCreate,
  actor: string,
): Promise<GlossaryTermRow> {
  const session = driver.session();
  try {
    // Check for conflicts before creating
    await checkTermConflicts(driver, input.local_name, input.collection_iri);

    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();

      // Validate collection exists
      const collectionCheck = await tx.run(
        `MATCH (c:_GlossaryCollection {iri: $iri}) RETURN c`,
        { iri: input.collection_iri },
      );
      if (collectionCheck.records.length === 0) {
        ERROR_CODE_THROWERS.not_found({ name: input.collection_iri, kind: "glossary_collection" });
      }

      try {
        await tx.run(
          `CREATE (t:_GlossaryTerm {
             id: $id, iri: $iri, local_name: $local_name, label: $label,
             description: $description, status: $status, collection_iri: $collection_iri,
             synonyms: $synonyms, tags: $tags,
             created_at: $now, updated_at: $now, created_by: $actor, updated_by: $actor
           })
           WITH t
           MATCH (c:_GlossaryCollection {iri: $collection_iri})
           CREATE (t)-[:MEMBER_OF]->(c)`,
          {
            id: input.id,
            iri: input.iri,
            local_name: input.local_name,
            label: input.label,
            description: input.description ?? null,
            status: input.status,
            collection_iri: input.collection_iri,
            synonyms: input.synonyms,
            tags: input.tags,
            now,
            actor,
          },
        );

        const after = await readGlossaryTermInTx(tx, input.id);
        if (!after) {
          throw new Error(`createGlossaryTerm: row not readable post-write for ${input.id}`);
        }

        const version_id = generateId();
        await writeAudit(
          tx,
          actor,
          "create_glossary_term",
          input.id,
          null,
          after,
          version_id,
        );
        await writeVersion(tx, version_id, actor, "create_glossary_term", input);
        await writeEvent(tx, version_id, [
          { op: "add", path: `/glossaryTerms/${input.id}`, value: after },
        ]);
        return after;
      } catch (e) {
        if (isConstraintViolation(e)) {
          ERROR_CODE_THROWERS.name_conflict({ name: input.id });
        }
        throw e;
      }
    });
  } finally {
    await session.close();
  }
}

export async function getGlossaryTerm(
  driver: Driver,
  id: string,
): Promise<GlossaryTermRow | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead((tx) => readGlossaryTermInTx(tx, id));
  } finally {
    await session.close();
  }
}

export async function listGlossaryTerms(
  driver: Driver,
  collectionIri?: string,
): Promise<ReadonlyArray<GlossaryTermRow>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      let query = `
        MATCH (t:_GlossaryTerm)
        RETURN t
        ORDER BY t.label
      `;
      const params: Record<string, unknown> = {};

      if (collectionIri) {
        query = `
          MATCH (t:_GlossaryTerm {collection_iri: $collectionIri})
          RETURN t
          ORDER BY t.label
        `;
        params.collectionIri = collectionIri;
      }

      const res = await tx.run(query, params);
      const rows: GlossaryTermRow[] = [];
      for (const rec of res.records) {
        const t = rec.get("t") as { properties: Record<string, unknown> } | null;
        if (!t) continue;
        rows.push({
          id: t.properties.id as string,
          iri: t.properties.iri as string,
          local_name: t.properties.local_name as string,
          label: t.properties.label as string,
          description: (t.properties.description as string | null) ?? null,
          status: t.properties.status as string,
          collection_iri: t.properties.collection_iri as string,
          synonyms: (t.properties.synonyms as string[]) ?? [],
          tags: (t.properties.tags as string[]) ?? [],
          created_at: t.properties.created_at as string,
          created_by: (t.properties.created_by as string | null) ?? null,
          updated_at: t.properties.updated_at as string,
          updated_by: (t.properties.updated_by as string | null) ?? null,
        });
      }
      return rows;
    });
  } finally {
    await session.close();
  }
}

export async function patchGlossaryTerm(
  driver: Driver,
  id: string,
  input: GlossaryTermPatch,
  actor: string,
): Promise<GlossaryTermRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const before = await readGlossaryTermInTx(tx, id);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: id, kind: "glossary_term" });
      }

      // Check for conflicts if local_name is being changed
      if (input.label !== undefined) {
        const newLocalName = input.label.toLowerCase().replace(/\s+/g, "_");
        if (newLocalName !== before.local_name) {
          await checkTermConflicts(driver, newLocalName, before.collection_iri);
        }
      }

      const now = new Date().toISOString();
      const sets: string[] = ["t.updated_at = $now", "t.updated_by = $actor"];
      const params: Record<string, unknown> = { id, now, actor };

      if (input.label !== undefined) {
        sets.push("t.label = $label");
        sets.push("t.local_name = $local_name");
        params.label = input.label;
        params.local_name = input.label.toLowerCase().replace(/\s+/g, "_");
      }
      if (input.description !== undefined) {
        sets.push("t.description = $description");
        params.description = input.description;
      }
      if (input.status !== undefined) {
        sets.push("t.status = $status");
        params.status = input.status;
      }
      if (input.synonyms !== undefined) {
        sets.push("t.synonyms = $synonyms");
        params.synonyms = input.synonyms;
      }
      if (input.tags !== undefined) {
        sets.push("t.tags = $tags");
        params.tags = input.tags;
      }

      await tx.run(
        `MATCH (t:_GlossaryTerm {id: $id})
         SET ${sets.join(", ")}`,
        params,
      );

      const after = await readGlossaryTermInTx(tx, id);
      if (!after) {
        throw new Error(`patchGlossaryTerm: row not readable post-write for ${id}`);
      }

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "patch_glossary_term",
        id,
        before,
        after,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "patch_glossary_term", {
        id,
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

export async function deleteGlossaryTerm(
  driver: Driver,
  id: string,
  actor: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const before = await readGlossaryTermInTx(tx, id);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: id, kind: "glossary_term" });
      }

      // Check for entity associations
      const associationCheck = await tx.run(
        `MATCH (t:_GlossaryTerm {id: $id})-[r:DESCRIBES]->() RETURN count(r) AS count`,
        { id },
      );
      const associationCount = associationCheck.records[0]?.get("count") as number;
      if (associationCount > 0) {
        ERROR_CODE_THROWERS.validation_error({
          message: "Cannot delete term with entity associations",
          details: { association_count: associationCount },
        });
      }

      await tx.run(
        `MATCH (t:_GlossaryTerm {id: $id}) DETACH DELETE t`,
        { id },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "delete_glossary_term",
        id,
        before,
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "delete_glossary_term", { id });
      await writeEvent(tx, version_id, [
        { op: "remove", path: `/glossaryTerms/${id}` },
      ]);
    });
  } finally {
    await session.close();
  }
}

// Entity association functions
export async function associateTermWithEntity(
  driver: Driver,
  termId: string,
  entityLabel: string,
  entityId: string,
  actor: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // Verify term exists
      const term = await readGlossaryTermInTx(tx, termId);
      if (!term) {
        ERROR_CODE_THROWERS.not_found({ name: termId, kind: "glossary_term" });
      }

      // Create DESCRIBES relationship
      await tx.run(
        `MATCH (t:_GlossaryTerm {id: $termId})
         MATCH (e:${entityLabel} {id: $entityId})
         MERGE (t)-[:DESCRIBES]->(e)`,
        { termId, entityId },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "associate_term_entity",
        `${termId}:${entityLabel}:${entityId}`,
        null,
        { termId, entityLabel, entityId },
        version_id,
      );
      await writeVersion(tx, version_id, actor, "associate_term_entity", {
        termId,
        entityLabel,
        entityId,
      });
      await writeEvent(tx, version_id, [
        {
          op: "add",
          path: `/glossaryTerms/${termId}/associations/${entityLabel}/${entityId}`,
          value: { entityLabel, entityId },
        },
      ]);
    });
  } finally {
    await session.close();
  }
}

export async function dissociateTermFromEntity(
  driver: Driver,
  termId: string,
  entityLabel: string,
  entityId: string,
  actor: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // Remove DESCRIBES relationship
      await tx.run(
        `MATCH (t:_GlossaryTerm {id: $termId})-[r:DESCRIBES]->(e:${entityLabel} {id: $entityId})
         DELETE r`,
        { termId, entityId },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "dissociate_term_entity",
        `${termId}:${entityLabel}:${entityId}`,
        { termId, entityLabel, entityId },
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "dissociate_term_entity", {
        termId,
        entityLabel,
        entityId,
      });
      await writeEvent(tx, version_id, [
        {
          op: "remove",
          path: `/glossaryTerms/${termId}/associations/${entityLabel}/${entityId}`,
        },
      ]);
    });
  } finally {
    await session.close();
  }
}

export async function getTermAssociations(
  driver: Driver,
  termId: string,
): Promise<ReadonlyArray<{ entityLabel: string; entityId: string }>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      const res = await tx.run(
        `MATCH (t:_GlossaryTerm {id: $termId})-[r:DESCRIBES]->(e)
         RETURN labels(e)[0] AS entityLabel, e.id AS entityId`,
        { termId },
      );
      const associations: { entityLabel: string; entityId: string }[] = [];
      for (const rec of res.records) {
        associations.push({
          entityLabel: rec.get("entityLabel") as string,
          entityId: rec.get("entityId") as string,
        });
      }
      return associations;
    });
  } finally {
    await session.close();
  }
}
