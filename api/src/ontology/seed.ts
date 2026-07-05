// T-08 — seedRegistryFromConstTuples.
//
// SOLE legal importer of graph-core's compile-time `NODE_LABELS` /
// `EDGE_TYPES` / `EDGE_ENDPOINTS` const tuples per NFR-02 + FR-15.
// AC-15 (`api/__tests__/ontology-no-frozen-import.test.ts`) grep
// enforces this boundary — adding another importer is a CI failure.
//
// Design: §7.1 (post-pass-1 C-12 fix → MERGE-based row idempotency;
// post-pass-1 C-03 fix → single audit + version + event row covering
// the whole seed, not 12-row history pollution).
//
// The seed is a privileged bootstrap path: it does NOT route through
// the public strict-CREATE helpers in `api/src/ontology/storage/*`.
// A mid-loop crash + retry is safe because every MERGE matches on the
// natural key (label name / edge-type name / (type,from,to) triple).
//
// The post-commit `ontologyEvents.emit("ontology.changed", ...)` is
// the responsibility of the caller (T-09 bootstrap refactor); we do
// not emit here because the design centralises emit-after-commit
// ordering at the bootstrap level.

import type { Driver } from "neo4j-driver";
import type { Operation } from "fast-json-patch";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, EDGE_ENDPOINTS } from "@companygraph/shared/schema/edges";
// Legal import — `ontology-no-frozen-import.test.ts` guards only the
// NODE_LABELS / EDGE_TYPES / EDGE_ENDPOINTS const tuples, not the
// system-kind vocabulary module (system-augmentation-model §4.2).
import { SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC } from "@companygraph/shared/schema/system-kind";
import { generateId } from "../ids";
import { writeAudit, writeVersion } from "./storage/audit";
import { writeEvent } from "./storage/events";

// Neo4j may return `count(...)` as either a Neo4j Integer (with
// `.toNumber()`) or a plain JS number depending on the driver's
// `disableLosslessIntegers` flag. Coerce safely either way so this
// module stays robust to driver-config drift.
function toN(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

export async function isRegistryEmpty(driver: Driver): Promise<boolean> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (n:_OntologyNodeLabel) RETURN count(n) AS c`,
    );
    const c = toN(result.records[0]?.get("c"));
    return c === 0;
  } finally {
    await session.close();
  }
}

/**
 * Seed bounded contexts from the specification data.
 * This is called during bootstrap after the registry is seeded.
 */
export async function seedBoundedContexts(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    // Check if bounded contexts already exist
    const result = await session.run(
      `MATCH (bc:BoundedContext) RETURN count(bc) AS c`,
    );
    const c = toN(result.records[0]?.get("c"));
    if (c > 0) {
      // Already seeded, skip
      return;
    }

    // Import bounded contexts from the specification data
    const { BOUNDED_CONTEXTS_SPEC } = await import("./bounded-contexts-spec");
    const spec = BOUNDED_CONTEXTS_SPEC;

    // Import bounded contexts
    for (const bc of spec.boundedContexts || []) {
      await session.run(`
        MERGE (bc:BoundedContext {id: $id})
        SET bc.name = $name,
            bc.description = $description,
            bc.domain = $domain,
            bc.subdomain = $subdomain,
            bc.type = $type,
            bc.oracle_system = $oracle_system,
            bc.jira_projects = $jira_projects
      `, {
        id: bc.id,
        name: bc.name,
        description: bc.description,
        domain: bc.domain,
        subdomain: bc.subdomain,
        type: bc.type,
        oracle_system: bc.oracle_system,
        jira_projects: bc.jira_projects,
      });
    }

    // Import entities
    for (const entity of spec.entities || []) {
      await session.run(`
        MERGE (e:Entity {id: $id})
        SET e.name = $name,
            e.description = $description,
            e.subdomain = $subdomain,
            e.bounded_context = $bounded_context,
            e.entity_number = $entity_number,
            e.status = $status,
            e.oracle_table = $oracle_table
        ${entity.note ? ', e.note = $note' : ''}
        WITH e
        MATCH (bc:BoundedContext {name: $bounded_context})
        MERGE (e)-[:PART_OF]->(bc)
      `, {
        id: entity.id,
        name: entity.name,
        description: entity.description,
        subdomain: entity.subdomain,
        bounded_context: entity.bounded_context,
        entity_number: entity.entity_number,
        status: entity.status,
        oracle_table: entity.oracle_table,
        ...(entity.note ? { note: entity.note } : {}),
      });
    }

    // Import bounded context relationships
    for (const rel of spec.boundedContextRelationships || []) {
      await session.run(`
        MATCH (from:BoundedContext {name: $from})
        MATCH (to:BoundedContext {name: $to})
        MERGE (from)-[r:${rel.type}]->(to)
      `, {
        from: rel.from,
        to: rel.to,
      });
    }

    // Import shared domains — reusable workflow components not scoped
    // to a single BusinessModel.  Each shared domain links to its
    // bounded contexts via BELONGS_TO_SHARED_DOMAIN.
    for (const sd of spec.sharedDomains || []) {
      await session.run(`
        MERGE (sd:SharedDomain {id: $id})
        SET sd.name = $name,
            sd.description = $description,
            sd.tags = $tags
      `, {
        id: sd.id,
        name: sd.name,
        description: sd.description,
        tags: sd.tags,
      });
      for (const bcName of sd.bounded_contexts || []) {
        await session.run(`
          MATCH (sd:SharedDomain {id: $sdId})
          MATCH (bc:BoundedContext {name: $bcName})
          MERGE (bc)-[:BELONGS_TO_SHARED_DOMAIN]->(sd)
        `, {
          sdId: sd.id,
          bcName,
        });
      }
    }

    // Import namespaces — business model specific work separation.
    // Each namespace is scoped to a BusinessModel via NAMESPACE_OF and
    // links to its bounded contexts via IN_NAMESPACE.
    for (const ns of spec.namespaces || []) {
      await session.run(`
        MERGE (ns:Namespace {id: $id})
        SET ns.name = $name,
            ns.description = $description,
            ns.model_id = $model_id
      `, {
        id: ns.id,
        name: ns.name,
        description: ns.description,
        model_id: ns.model_id,
      });
      // Link namespace to BusinessModel if it exists
      await session.run(`
        MATCH (ns:Namespace {id: $nsId})
        MATCH (m:BusinessModel {id: $modelId})
        MERGE (ns)-[:NAMESPACE_OF]->(m)
      `, {
        nsId: ns.id,
        modelId: ns.model_id,
      });
      for (const bcName of ns.bounded_contexts || []) {
        await session.run(`
          MATCH (ns:Namespace {id: $nsId})
          MATCH (bc:BoundedContext {name: $bcName})
          MERGE (bc)-[:IN_NAMESPACE]->(ns)
        `, {
          nsId: ns.id,
          bcName,
        });
      }
    }
  } finally {
    await session.close();
  }
}

// system-augmentation-model T-03 (FR-02 / FR-07 fresh-DB path): per-label
// attribute docs for the bootstrap seed. Labels absent from this map get
// the permissive default. A fresh DB therefore NEVER holds a permissive
// System doc — the tightened doc is written before any route serves, so
// the attribute-zod cache compiles the tightened validator from first read.
const SEED_ATTRIBUTE_DOCS: Record<string, unknown> = {
  System: SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC,
};

export async function seedRegistryFromConstTuples(driver: Driver): Promise<{
  version_id: string;
  event_id: string;
  seeded: { nodeLabels: ReadonlyArray<string>; edgeTypes: ReadonlyArray<string> };
}> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      const version_id = generateId();
      const seedDiff: Operation[] = [];

      // ── Node labels + attribute schemas ─────────────────────────
      for (const label of NODE_LABELS) {
        // MERGE on name — privileged-path idempotency (pass-1 C-12).
        await tx.run(
          `MERGE (l:_OntologyNodeLabel {name: $name})
           ON CREATE SET
             l.description = $description, l.usage_example = $usage_example,
             l.created_at = $now, l.updated_at = $now
           WITH l
           MERGE (s:_OntologyAttributeSchema {label_name: $name})
           ON CREATE SET
             s.json_schema_doc = $jsd, s.created_at = $now, s.updated_at = $now
           MERGE (s)-[:DESCRIBES]->(l)`,
          {
            name: label,
            description: `Base label seeded by graph-core (${label}).`,
            usage_example: `e.g. POST /api/v1/nodes/${label}`,
            jsd: JSON.stringify(
              SEED_ATTRIBUTE_DOCS[label] ?? { type: "object", additionalProperties: true },
            ),
            now,
          },
        );
        seedDiff.push({
          op: "add",
          path: `/nodeLabels/${label}`,
          value: { seeded: true },
        });
      }

      // ── Edge types + endpoint rows ─────────────────────────────
      for (const type of EDGE_TYPES) {
        await tx.run(
          `MERGE (e:_OntologyEdgeType {name: $name})
           ON CREATE SET
             e.description = $description, e.usage_example = $usage_example,
             e.created_at = $now, e.updated_at = $now`,
          {
            name: type,
            description: `Base edge type seeded by graph-core (${type}).`,
            usage_example: `e.g. POST /api/v1/edges with {type:"${type}", ...}`,
            now,
          },
        );
        for (const [from, to] of EDGE_ENDPOINTS[type]) {
          await tx.run(
            `MATCH (e:_OntologyEdgeType {name: $name})
             MERGE (ep:_OntologyEdgeEndpoint {
               edge_type_name: $name, from_label: $from, to_label: $to
             })
             ON CREATE SET ep.created_at = $now
             MERGE (ep)-[:OF_TYPE]->(e)`,
            { name: type, from, to, now },
          );
        }
        seedDiff.push({
          op: "add",
          path: `/edgeTypes/${type}`,
          value: { seeded: true },
        });
      }

      // ── Single audit + version + event row for the whole seed ──
      // (pass-1 C-03: no 12-row history pollution on first boot.)
      await writeAudit(
        tx,
        "system:bootstrap",
        "system_bootstrap_seed",
        "registry",
        null,
        { nodeLabels: NODE_LABELS.length, edgeTypes: EDGE_TYPES.length },
        version_id,
      );
      await writeVersion(
        tx,
        version_id,
        "system:bootstrap",
        "system_bootstrap_seed",
        { nodeLabels: [...NODE_LABELS], edgeTypes: [...EDGE_TYPES] },
      );
      const { event_id } = await writeEvent(tx, version_id, seedDiff);

      return {
        version_id,
        event_id,
        seeded: {
          nodeLabels: [...NODE_LABELS],
          edgeTypes: [...EDGE_TYPES],
        },
      };
    });
  } finally {
    await session.close();
  }
}
