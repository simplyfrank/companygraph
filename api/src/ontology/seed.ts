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
            jsd: JSON.stringify({ type: "object", additionalProperties: true }),
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
