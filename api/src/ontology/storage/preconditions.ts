// T-07 — Delete-precondition guard for the ontology registry's storage
// layer (design §4.3, FR-06 revision 3).
//
// Three preconditions (simplified post-pass-1 form; the original
// "deprecation marker required if instances ever existed" heuristic was
// dropped — pass-1 B-04). Throws `409 deprecation_required` with
// `details.precondition_failed` naming the first failure.
//
// (i)   No live instances           — node_label: count(:Label) == 0;
//                                     edge_type: count([:TYPE]) == 0.
// (ii)  No registry references      — node_label only: no
//                                     `_OntologyEdgeEndpoint` row references
//                                     this label as `from_label` or
//                                     `to_label`. Edge-type endpoints
//                                     cascade-DELETE with the type
//                                     (§4.2 deleteEdgeType), so no separate
//                                     check is required.
// (iii) Migration step required IFF deprecated — if `before.deprecated_at`
//                                     is set, the caller MUST pass
//                                     `confirm_migration_step_id`, and the
//                                     referenced `_OntologyMigration` row
//                                     MUST exist + target this `name`.
//                                     Fresh, never-used types (no
//                                     `deprecated_at`) skip this check —
//                                     supports the "POST + DELETE a typo'd
//                                     label" path (AC-05 never-used row).
//
// Cypher safety
// -------------
// `name` is interpolated directly into the Cypher template for both
// `node_label` and `edge_type` paths (`MATCH (n:\`${name}\`)` and
// `MATCH ()-[r:\`${name}\`]-()`). This is safe under the contract: the
// caller (T-13's REST handler) has already validated `name` via
// `parseRegistryLabel` / `parseEdgeTypeName`. Backtick-escaping the name
// is the same defence graph-core's storage uses; even though our
// register-time schema rejects non-`[A-Z][A-Za-z0-9_]*` names, the
// escape costs nothing.

import type { ManagedTransaction } from "neo4j-driver";
import { ERROR_CODE_THROWERS } from "../error-throwers";

export interface NodeLabelBefore {
  name: string;
  deprecated_at?: string | null;
}

export interface EdgeTypeBefore {
  name: string;
  deprecated_at?: string | null;
}

// Neo4j drivers return counts as either a Neo4j Integer (with
// `.toNumber()`) or a plain JS number depending on session config. The
// same coercion pattern as in `ontology-meta-bootstrap.integration.test.ts`.
function toN(v: unknown): number {
  if (typeof v === "number") return v;
  if (
    v != null &&
    typeof (v as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

export async function assertDeletePreconditions(
  tx: ManagedTransaction,
  kind: "node_label" | "edge_type",
  name: string,
  before: NodeLabelBefore | EdgeTypeBefore,
  confirm_migration_step_id?: string,
): Promise<void> {
  // (i) No live instances.
  if (kind === "node_label") {
    const res = await tx.run(
      `MATCH (n:\`${name}\`) RETURN count(n) AS c`,
    );
    const node_instance_count = toN(res.records[0]?.get("c"));
    if (node_instance_count > 0) {
      ERROR_CODE_THROWERS.deprecation_required({
        precondition_failed: "node_instance_count",
        node_instance_count,
        edge_instance_count: 0,
      });
    }
  } else {
    // Directional MATCH so each stored relationship is counted ONCE — an
    // undirected `()-[r]-()` walk returns the edge twice (one per
    // traversal direction) and inflates the count by 2× for self-pairs.
    const res = await tx.run(
      `MATCH ()-[r:\`${name}\`]->() RETURN count(r) AS c`,
    );
    const edge_instance_count = toN(res.records[0]?.get("c"));
    if (edge_instance_count > 0) {
      ERROR_CODE_THROWERS.deprecation_required({
        precondition_failed: "edge_instance_count",
        node_instance_count: 0,
        edge_instance_count,
      });
    }
  }

  // (ii) No registry references — node labels only. Edge-type endpoint
  // rows cascade-DELETE with the type (§4.2 deleteEdgeType).
  if (kind === "node_label") {
    const refs = await tx.run(
      `MATCH (ep:_OntologyEdgeEndpoint)
       WHERE ep.from_label = $name OR ep.to_label = $name
       RETURN count(ep) AS c`,
      { name },
    );
    const ref_count = toN(refs.records[0]?.get("c"));
    if (ref_count > 0) {
      ERROR_CODE_THROWERS.deprecation_required({
        precondition_failed: "edge_endpoints_referencing",
        ref_count,
      });
    }
  }

  // (iii) Migration step required IFF `before.deprecated_at` is set.
  // Never-deprecated types skip this check entirely (supports the
  // "POST + DELETE a typo'd label" path).
  const wasDeprecated =
    before.deprecated_at != null && before.deprecated_at !== "";
  if (wasDeprecated && !confirm_migration_step_id) {
    ERROR_CODE_THROWERS.deprecation_required({
      precondition_failed: "migration_step_required",
      hint: "POST /api/v1/ontology/migrations and pass ?confirm_migration_step_id=:id",
    });
  }
  if (confirm_migration_step_id) {
    const mig = await tx.run(
      `MATCH (m:_OntologyMigration {migration_id: $id, target: $name})
       RETURN m`,
      { id: confirm_migration_step_id, name },
    );
    if (mig.records.length === 0) {
      ERROR_CODE_THROWERS.deprecation_required({
        precondition_failed: "migration_step_not_found",
        migration_id: confirm_migration_step_id,
        target: name,
      });
    }
  }
}
