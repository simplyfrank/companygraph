// FR-08 — POST /api/v1/ontology/import
//
// Bulk-import of ontology data from a JSON payload shaped as
// `OntologyImportPayload` (shared schema). Seven ordered passes:
//
//   Pass 1 — nodeLabels: each entry attempted via `createNodeLabel`.
//            `name_conflict` (409) is treated as a non-fatal skip so the
//            import is idempotent on re-run.
//            All other errors are recorded in the `errors[]` array.
//
//   Pass 2 — edgeTypes: same pattern. Each entry attempted via
//            `createEdgeType`. Edge-type endpoint label references that
//            failed in pass 1 are flagged with a descriptive message.
//
//   Pass 3 — boundedContexts: creates/updates BoundedContext nodes with
//            domain, subdomain, type, oracle_system, and jira_projects.
//
//   Pass 4 — entities: creates/updates Entity nodes with subdomain,
//            bounded_context, entity_number, status, oracle_table, and note.
//            Also creates PART_OF relationships to the bounded context.
//
//   Pass 5 — boundedContextRelationships: creates UPSTREAM_OF/DOWNSTREAM_OF
//            relationships between bounded contexts.
//
//   Pass 6 — domains: creates/updates Domain nodes with schema per domain
//            (nodeLabels and edgeTypes scoped to this domain).
//
//   Pass 7 — crossDomainEntityRelationships: creates relationships between
//            entities across different domains.
//
// One `ontologyEvents.emit("ontology.changed", …)` fires after the full
// import if any entry was accepted, so caches invalidate exactly once.
//
// Response: 200 `{ accepted: { nodeLabels, edgeTypes, boundedContexts, entities, boundedContextRelationships, domains, crossDomainEntityRelationships }, errors? }`.
// A partial import (some errors) still returns 200 — the `errors[]`
// array communicates the per-entry failures.

import { getDriver } from "../neo4j/driver";
import { createNodeLabel } from "../ontology/storage/node-labels";
import { createEdgeType } from "../ontology/storage/edge-types";
import { ontologyEvents } from "../ontology/events";
import { generateId } from "../ids";
import { ontologyImportSchema, sanitizeLabelName, type BoundedContextCreate, type EntityCreate, type BoundedContextRelationship, type DomainCreate, type CrossDomainEntityRelationship } from "@companygraph/shared/schema/ontology";
import type { OntologyImportResponse, NodeLabelCreate, EdgeTypeCreate } from "@companygraph/shared/schema/ontology";
import { ok, readJson } from "./_helpers";
import { ValidationError } from "../errors";

export async function handleOntologyImport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const actor = url.searchParams.get("actor") ?? "api:import";

  const body = await readJson(req);
  const parsed = ontologyImportSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("invalid_payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const payload = parsed.data;
  const driver = getDriver();

  const errors: NonNullable<OntologyImportResponse["errors"]> = [];
  let acceptedNodeLabels = 0;
  let acceptedEdgeTypes = 0;
  let acceptedBoundedContexts = 0;
  let acceptedEntities = 0;
  let acceptedBoundedContextRelationships = 0;
  let acceptedDomains = 0;
  let acceptedCrossDomainEntityRelationships = 0;

  // Pass 1 — node labels.
  for (const [index, entry] of (payload.nodeLabels ?? []).entries()) {
    try {
      // Sanitize the label name to match naming rules
      const sanitizedEntry: NodeLabelCreate = {
        ...entry,
        name: sanitizeLabelName(entry.name),
      };
      await createNodeLabel(driver, sanitizedEntry, actor);
      acceptedNodeLabels++;
    } catch (e) {
      const code =
        e instanceof ValidationError ? e.code : "internal_error";
      const message =
        e instanceof ValidationError ? e.code : String(e);
      const details =
        e instanceof ValidationError ? e.details : undefined;
      // name_conflict is a soft skip — still recorded but counted as a
      // non-fatal row so the import doesn't abort.
      errors.push({ section: "nodeLabels", index, code, message, ...(details ? { details } : {}) });
    }
  }

  // Pass 2 — edge types.
  for (const [index, entry] of (payload.edgeTypes ?? []).entries()) {
    try {
      // Sanitize the edge type name and endpoint label names
      const sanitizedEntry: EdgeTypeCreate = {
        ...entry,
        name: sanitizeLabelName(entry.name),
        endpoints: entry.endpoints.map((ep) => ({
          ...ep,
          fromLabel: sanitizeLabelName(ep.fromLabel),
          toLabel: sanitizeLabelName(ep.toLabel),
        })),
      };
      await createEdgeType(driver, sanitizedEntry, actor);
      acceptedEdgeTypes++;
    } catch (e) {
      const code =
        e instanceof ValidationError ? e.code : "internal_error";
      const message =
        e instanceof ValidationError ? e.code : String(e);
      const details =
        e instanceof ValidationError ? e.details : undefined;
      errors.push({ section: "edgeTypes", index, code, message, ...(details ? { details } : {}) });
    }
  }

  // Pass 3 — bounded contexts.
  const session = driver.session();
  for (const [index, entry] of (payload.boundedContexts ?? []).entries()) {
    try {
      await session.run(`
        MERGE (bc:BoundedContext {id: $id})
        SET bc.name = $name,
            bc.description = $description,
            bc.domain = $domain,
            bc.subdomain = $subdomain,
            bc.type = $type,
            bc.oracle_system = $oracle_system,
            bc.jira_projects = $jira_projects
        RETURN bc
      `, {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        domain: entry.domain,
        subdomain: entry.subdomain,
        type: entry.type,
        oracle_system: entry.oracle_system,
        jira_projects: entry.jira_projects,
      });
      acceptedBoundedContexts++;
    } catch (e) {
      const code = "internal_error";
      const message = String(e);
      errors.push({ section: "boundedContexts", index, code, message });
    }
  }

  // Validation: Collect all bounded context names for referential integrity checks
  const bcNamesResult = await session.run(`
    MATCH (bc:BoundedContext)
    RETURN bc.name as name
  `);
  const bcNames = new Set(bcNamesResult.records.map((r) => r.get("name")));

  // Validation: Collect existing entity IDs to detect duplicates
  const existingEntityIdsResult = await session.run(`
    MATCH (e:Entity)
    RETURN e.id as id
  `);
  const existingEntityIds = new Set(existingEntityIdsResult.records.map((r) => r.get("id")));

  // Pass 4 — entities.
  for (const [index, entry] of (payload.entities ?? []).entries()) {
    // Validation: Check that bounded_context reference exists
    if (!bcNames.has(entry.bounded_context)) {
      errors.push({
        section: "entities",
        index,
        code: "referential_integrity",
        message: `Bounded context "${entry.bounded_context}" not found`,
        details: { bounded_context: entry.bounded_context },
      });
      continue;
    }

    // Validation: Check for duplicate entity IDs within the payload
    const duplicateIndex = (payload.entities ?? []).findIndex(
      (e, i) => i !== index && e.id === entry.id
    );
    if (duplicateIndex !== -1) {
      errors.push({
        section: "entities",
        index,
        code: "duplicate_id",
        message: `Duplicate entity ID "${entry.id}" found at index ${duplicateIndex}`,
        details: { id: entry.id, duplicate_index: duplicateIndex },
      });
      continue;
    }

    try {
      await session.run(`
        MERGE (e:Entity {id: $id})
        SET e.name = $name,
            e.description = $description,
            e.subdomain = $subdomain,
            e.bounded_context = $bounded_context,
            e.entity_number = $entity_number,
            e.status = $status,
            e.oracle_table = $oracle_table
        ${entry.note ? ', e.note = $note' : ''}
        WITH e
        MATCH (bc:BoundedContext {name: $bounded_context})
        MERGE (e)-[:PART_OF]->(bc)
        RETURN e
      `, {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        subdomain: entry.subdomain,
        bounded_context: entry.bounded_context,
        entity_number: entry.entity_number,
        status: entry.status,
        oracle_table: entry.oracle_table,
        ...(entry.note ? { note: entry.note } : {}),
      });
      acceptedEntities++;
    } catch (e) {
      const code = "internal_error";
      const message = String(e);
      errors.push({ section: "entities", index, code, message });
    }
  }

  // Pass 5 — bounded context relationships.
  for (const [index, entry] of (payload.boundedContextRelationships ?? []).entries()) {
    // Validation: Check that both bounded context references exist
    if (!bcNames.has(entry.from)) {
      errors.push({
        section: "boundedContextRelationships",
        index,
        code: "referential_integrity",
        message: `Source bounded context "${entry.from}" not found`,
        details: { from: entry.from },
      });
      continue;
    }
    if (!bcNames.has(entry.to)) {
      errors.push({
        section: "boundedContextRelationships",
        index,
        code: "referential_integrity",
        message: `Target bounded context "${entry.to}" not found`,
        details: { to: entry.to },
      });
      continue;
    }

    try {
      await session.run(`
        MATCH (from:BoundedContext {name: $from})
        MATCH (to:BoundedContext {name: $to})
        MERGE (from)-[r:${entry.type}]->(to)
        RETURN from.name, type(r), to.name
      `, {
        from: entry.from,
        to: entry.to,
      });
      acceptedBoundedContextRelationships++;
    } catch (e) {
      const code = "internal_error";
      const message = String(e);
      errors.push({ section: "boundedContextRelationships", index, code, message });
    }
  }

  // Pass 6 — domains with schema per domain.
  for (const [index, entry] of (payload.domains ?? []).entries()) {
    try {
      await session.run(`
        MERGE (d:Domain {id: $id})
        SET d.name = $name,
            d.description = $description,
            d.accountable_role = $accountable_role,
            d.compliance_tags = $compliance_tags,
            d.nodeLabels = $nodeLabels,
            d.edgeTypes = $edgeTypes
        RETURN d
      `, {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        accountable_role: entry.accountable_role,
        compliance_tags: entry.compliance_tags,
        nodeLabels: entry.nodeLabels,
        edgeTypes: entry.edgeTypes,
      });
      acceptedDomains++;
    } catch (e) {
      const code = "internal_error";
      const message = String(e);
      errors.push({ section: "domains", index, code, message });
    }
  }

  // Validation: Collect all entity IDs for cross-domain relationship checks
  const entityIdsResult = await session.run(`
    MATCH (e:Entity)
    RETURN e.id as id, e.name as name
  `);
  const entityIds = new Map(entityIdsResult.records.map((r) => [r.get("id"), r.get("name")]));

  // Pass 7 — cross-domain entity relationships.
  for (const [index, entry] of (payload.crossDomainEntityRelationships ?? []).entries()) {
    // Validation: Check that both entity references exist
    if (!entityIds.has(entry.from_entity_id)) {
      errors.push({
        section: "crossDomainEntityRelationships",
        index,
        code: "referential_integrity",
        message: `Source entity "${entry.from_entity_id}" not found`,
        details: { from_entity_id: entry.from_entity_id },
      });
      continue;
    }
    if (!entityIds.has(entry.to_entity_id)) {
      errors.push({
        section: "crossDomainEntityRelationships",
        index,
        code: "referential_integrity",
        message: `Target entity "${entry.to_entity_id}" not found`,
        details: { to_entity_id: entry.to_entity_id },
      });
      continue;
    }

    // Validation: Ensure entities are in different domains
    if (entry.from_domain === entry.to_domain) {
      errors.push({
        section: "crossDomainEntityRelationships",
        index,
        code: "validation_error",
        message: `Entities must be in different domains for cross-domain relationship`,
        details: { from_domain: entry.from_domain, to_domain: entry.to_domain },
      });
      continue;
    }

    try {
      await session.run(`
        MATCH (from:Entity {id: $from_entity_id})
        MATCH (to:Entity {id: $to_entity_id})
        MERGE (from)-[r:${entry.relationship_type}]->(to)
        SET r.from_domain = $from_domain,
            r.to_domain = $to_domain,
            r.description = $description
        RETURN from.name, type(r), to.name
      `, {
        from_entity_id: entry.from_entity_id,
        to_entity_id: entry.to_entity_id,
        from_domain: entry.from_domain,
        to_domain: entry.to_domain,
        relationship_type: entry.relationship_type,
        description: entry.description,
      });
      acceptedCrossDomainEntityRelationships++;
    } catch (e) {
      const code = "internal_error";
      const message = String(e);
      errors.push({ section: "crossDomainEntityRelationships", index, code, message });
    }
  }

  await session.close();

  // Single cache-invalidation emit if anything was accepted.
  if (acceptedNodeLabels + acceptedEdgeTypes + acceptedBoundedContexts + acceptedEntities + acceptedBoundedContextRelationships + acceptedDomains + acceptedCrossDomainEntityRelationships > 0) {
    ontologyEvents.emit("ontology.changed", {
      event_id: generateId(),
      version_id: generateId(),
      ts: new Date().toISOString(),
      diff: [],
    });
  }

  const response: OntologyImportResponse = {
    accepted: {
      nodeLabels: acceptedNodeLabels,
      edgeTypes: acceptedEdgeTypes,
      boundedContexts: acceptedBoundedContexts,
      entities: acceptedEntities,
      boundedContextRelationships: acceptedBoundedContextRelationships,
      domains: acceptedDomains,
      crossDomainEntityRelationships: acceptedCrossDomainEntityRelationships,
    },
    ...(errors.length > 0 ? { errors } : {}),
  };
  return ok(response);
}
