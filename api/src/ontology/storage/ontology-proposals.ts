// Ontology proposal storage — CRUD for LLM-generated ontology proposals.
//
// Follows the pattern of node-labels.ts and glossary-collections.ts:
// - Single executeWrite transaction per mutation (NFR-01)
// - Audit + version + event writes in the same transaction
// - Status workflow: DRAFT → UNDER_REVIEW → APPROVED/REJECTED → INTEGRATED

import type { Driver, ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare } from "fast-json-patch";
import type {
  OntologyProposalCreate,
  OntologyProposalPatch,
} from "@companygraph/shared/schema/ontology";
import { generateId } from "../../ids";
import { isConstraintViolation } from "../../errors";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";

export interface OntologyProposalRow {
  id: string;
  name: string;
  description: string | null;
  source_scope: string;
  source_id: string;
  status: string;
  owl_content: string;
  classes: string;
  properties: string;
  agent_steps: string;
  llm_model: string;
  llm_usage: string;
  created_at: string;
  created_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  integrated_at: string | null;
}

async function readOntologyProposalInTx(
  tx: ManagedTransaction,
  id: string,
): Promise<OntologyProposalRow | null> {
  const res = await tx.run(
    `MATCH (p:_OntologyProposal {id: $id}) RETURN p`,
    { id },
  );
  const rec = res.records[0];
  if (!rec) return null;

  const p = rec.get("p") as { properties: Record<string, unknown> } | null;
  if (!p) return null;

  return {
    id: p.properties.id as string,
    name: p.properties.name as string,
    description: (p.properties.description as string | null) ?? null,
    source_scope: p.properties.source_scope as string,
    source_id: p.properties.source_id as string,
    status: p.properties.status as string,
    owl_content: p.properties.owl_content as string,
    classes: p.properties.classes as string,
    properties: p.properties.properties as string,
    agent_steps: p.properties.agent_steps as string,
    llm_model: p.properties.llm_model as string,
    llm_usage: p.properties.llm_usage as string,
    created_at: p.properties.created_at as string,
    created_by: (p.properties.created_by as string | null) ?? null,
    reviewed_at: (p.properties.reviewed_at as string | null) ?? null,
    reviewed_by: (p.properties.reviewed_by as string | null) ?? null,
    integrated_at: (p.properties.integrated_at as string | null) ?? null,
  };
}

export async function createOntologyProposal(
  driver: Driver,
  input: OntologyProposalCreate,
  actor: string,
): Promise<OntologyProposalRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      const id = generateId();

      // Validate source entity exists
      let sourceMatch = "";
      if (input.source_scope === "DOMAIN") {
        sourceMatch = "(:Domain)";
      } else if (input.source_scope === "SUBDOMAIN") {
        sourceMatch = "(:Subdomain)";
      } else if (input.source_scope === "JOURNEY") {
        sourceMatch = "(:UserJourney)";
      }

      const sourceCheck = await tx.run(
        `MATCH (e${sourceMatch} {id: $source_id}) RETURN e`,
        { source_id: input.source_id },
      );
      if (sourceCheck.records.length === 0) {
        ERROR_CODE_THROWERS.not_found({
          name: input.source_id,
          kind: input.source_scope.toLowerCase(),
        });
      }

      try {
        await tx.run(
          `CREATE (p:_OntologyProposal {
             id: $id, name: $name, description: $description,
             source_scope: $source_scope, source_id: $source_id,
             status: $status, owl_content: $owl_content,
             classes: $classes, properties: $properties,
             agent_steps: $agent_steps, llm_model: $llm_model,
             llm_usage: $llm_usage,
             created_at: $now, updated_at: $now, created_by: $actor, updated_by: $actor
           })
           WITH p
           MATCH (e${sourceMatch} {id: $source_id})
           CREATE (p)-[:GENERATED_FROM]->(e)`,
          {
            id,
            name: input.name,
            description: input.description ?? null,
            source_scope: input.source_scope,
            source_id: input.source_id,
            status: input.status,
            owl_content: input.owl_content,
            classes: input.classes,
            properties: input.properties,
            agent_steps: input.agent_steps,
            llm_model: input.llm_model,
            llm_usage: input.llm_usage,
            now,
            actor,
          },
        );

        const after = await readOntologyProposalInTx(tx, id);
        if (!after) {
          throw new Error(`createOntologyProposal: row not readable post-write for ${id}`);
        }

        const version_id = generateId();
        await writeAudit(
          tx,
          actor,
          "create_ontology_proposal",
          id,
          null,
          after,
          version_id,
        );
        await writeVersion(tx, version_id, actor, "create_ontology_proposal", input);
        await writeEvent(tx, version_id, [
          { op: "add", path: `/ontologyProposals/${id}`, value: after },
        ]);
        return after;
      } catch (e) {
        if (isConstraintViolation(e)) {
          ERROR_CODE_THROWERS.name_conflict({ name: id });
        }
        throw e;
      }
    });
  } finally {
    await session.close();
  }
}

export async function getOntologyProposal(
  driver: Driver,
  id: string,
): Promise<OntologyProposalRow | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead((tx) => readOntologyProposalInTx(tx, id));
  } finally {
    await session.close();
  }
}

export async function listOntologyProposals(
  driver: Driver,
  sourceScope?: string,
  status?: string,
): Promise<ReadonlyArray<OntologyProposalRow>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      let query = `
        MATCH (p:_OntologyProposal)
        RETURN p
        ORDER BY p.created_at DESC
      `;
      const params: Record<string, unknown> = {};

      const conditions: string[] = [];
      if (sourceScope) {
        conditions.push("p.source_scope = $sourceScope");
        params.sourceScope = sourceScope;
      }
      if (status) {
        conditions.push("p.status = $status");
        params.status = status;
      }

      if (conditions.length > 0) {
        query = `
          MATCH (p:_OntologyProposal)
          WHERE ${conditions.join(" AND ")}
          RETURN p
          ORDER BY p.created_at DESC
        `;
      }

      const res = await tx.run(query, params);
      const rows: OntologyProposalRow[] = [];
      for (const rec of res.records) {
        const p = rec.get("p") as { properties: Record<string, unknown> } | null;
        if (!p) continue;
        rows.push({
          id: p.properties.id as string,
          name: p.properties.name as string,
          description: (p.properties.description as string | null) ?? null,
          source_scope: p.properties.source_scope as string,
          source_id: p.properties.source_id as string,
          status: p.properties.status as string,
          owl_content: p.properties.owl_content as string,
          classes: p.properties.classes as string,
          properties: p.properties.properties as string,
          agent_steps: p.properties.agent_steps as string,
          llm_model: p.properties.llm_model as string,
          llm_usage: p.properties.llm_usage as string,
          created_at: p.properties.created_at as string,
          created_by: (p.properties.created_by as string | null) ?? null,
          reviewed_at: (p.properties.reviewed_at as string | null) ?? null,
          reviewed_by: (p.properties.reviewed_by as string | null) ?? null,
          integrated_at: (p.properties.integrated_at as string | null) ?? null,
        });
      }
      return rows;
    });
  } finally {
    await session.close();
  }
}

export async function patchOntologyProposal(
  driver: Driver,
  id: string,
  input: OntologyProposalPatch,
  actor: string,
): Promise<OntologyProposalRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const before = await readOntologyProposalInTx(tx, id);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: id, kind: "ontology_proposal" });
      }

      // Validate status transitions
      if (input.status) {
        const validTransitions: Record<string, string[]> = {
          DRAFT: ["UNDER_REVIEW", "REJECTED"],
          UNDER_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
          APPROVED: ["INTEGRATED"],
          REJECTED: ["DRAFT"],
          INTEGRATED: [],
        };
        const allowed = validTransitions[before.status] || [];
        if (!allowed.includes(input.status)) {
          ERROR_CODE_THROWERS.validation_error({
            message: `Invalid status transition from ${before.status} to ${input.status}`,
            details: { from: before.status, to: input.status, allowed },
          });
        }
      }

      const now = new Date().toISOString();
      const sets: string[] = ["p.updated_at = $now", "p.updated_by = $actor"];
      const params: Record<string, unknown> = { id, now, actor };

      if (input.name !== undefined) {
        sets.push("p.name = $name");
        params.name = input.name;
      }
      if (input.description !== undefined) {
        sets.push("p.description = $description");
        params.description = input.description;
      }
      if (input.status !== undefined) {
        sets.push("p.status = $status");
        params.status = input.status;
        // Set reviewed_at/reviewed_by when moving to review states
        if (["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(input.status)) {
          sets.push("p.reviewed_at = $now");
          sets.push("p.reviewed_by = $actor");
        }
        // Set integrated_at when integrated
        if (input.status === "INTEGRATED") {
          sets.push("p.integrated_at = $now");
        }
      }
      if (input.owl_content !== undefined) {
        sets.push("p.owl_content = $owl_content");
        params.owl_content = input.owl_content;
      }
      if (input.classes !== undefined) {
        sets.push("p.classes = $classes");
        params.classes = input.classes;
      }
      if (input.properties !== undefined) {
        sets.push("p.properties = $properties");
        params.properties = input.properties;
      }

      await tx.run(
        `MATCH (p:_OntologyProposal {id: $id})
         SET ${sets.join(", ")}`,
        params,
      );

      const after = await readOntologyProposalInTx(tx, id);
      if (!after) {
        throw new Error(`patchOntologyProposal: row not readable post-write for ${id}`);
      }

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "patch_ontology_proposal",
        id,
        before,
        after,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "patch_ontology_proposal", {
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

export async function deleteOntologyProposal(
  driver: Driver,
  id: string,
  actor: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const before = await readOntologyProposalInTx(tx, id);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: id, kind: "ontology_proposal" });
      }

      // Prevent deletion of integrated proposals
      if (before.status === "INTEGRATED") {
        ERROR_CODE_THROWERS.validation_error({
          message: "Cannot delete integrated proposal",
          details: { id, status: before.status },
        });
      }

      await tx.run(
        `MATCH (p:_OntologyProposal {id: $id}) DETACH DELETE p`,
        { id },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "delete_ontology_proposal",
        id,
        before,
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "delete_ontology_proposal", { id });
      await writeEvent(tx, version_id, [
        { op: "remove", path: `/ontologyProposals/${id}` },
      ]);
    });
  } finally {
    await session.close();
  }
}
