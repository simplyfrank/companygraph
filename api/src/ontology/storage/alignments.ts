// T-12 — In-transaction alignment storage helpers (design §4.1 references,
// FR-09 + AC-08).
//
// `_OntologyAlignment` carries a `target_kind` discriminator ("node_label" |
// "edge_type") + the `target_name` it aligns with, plus the free-text
// `(source, external_id)` pair. The composite uniqueness constraint
// `_onto_alignment_unique` (target_kind, target_name, source, external_id)
// prevents duplicate rows for the same external mapping (pass-1 C-08).
//
// `insertAlignments` is for CREATE paths (POST on a fresh label / type).
// `replaceAlignments` is for PATCH paths — it removes the existing rows
// before inserting the new set so callers can express "set this label's
// alignment list to exactly [...]" with a single helper.
//
// Both run inside the calling transaction (NFR-01); the caller is
// responsible for writing the audit / version / event rows that record
// the change in the audit log.

import type { ManagedTransaction } from "neo4j-driver";
import type { ExternalAlignmentEntry } from "@companygraph/shared/schema/ontology";

export type AlignmentTargetKind = "node_label" | "edge_type";

// MERGE on the natural key so the helper is idempotent — re-inserting the
// same (source, id) is a no-op rather than a constraint violation.
export async function insertAlignments(
  tx: ManagedTransaction,
  target_kind: AlignmentTargetKind,
  target_name: string,
  alignments: ReadonlyArray<ExternalAlignmentEntry>,
): Promise<void> {
  if (alignments.length === 0) return;
  const now = new Date().toISOString();
  const targetLabel =
    target_kind === "node_label" ? "_OntologyNodeLabel" : "_OntologyEdgeType";
  for (const a of alignments) {
    await tx.run(
      `MATCH (t:${targetLabel} {name: $target_name})
       MERGE (al:_OntologyAlignment {
         target_kind: $target_kind,
         target_name: $target_name,
         source: $source,
         external_id: $external_id
       })
       ON CREATE SET al.created_at = $now
       MERGE (al)-[:ALIGNS]->(t)`,
      {
        target_kind,
        target_name,
        source: a.source,
        external_id: a.id,
        now,
      },
    );
  }
}

export async function replaceAlignments(
  tx: ManagedTransaction,
  target_kind: AlignmentTargetKind,
  target_name: string,
  alignments: ReadonlyArray<ExternalAlignmentEntry>,
): Promise<void> {
  // Remove the existing alignments for this target. DETACH DELETE clears
  // the [:ALIGNS] edge in the same step.
  await tx.run(
    `MATCH (al:_OntologyAlignment {
       target_kind: $target_kind,
       target_name: $target_name
     })
     DETACH DELETE al`,
    { target_kind, target_name },
  );
  // Insert the new set (no-op if empty — callers can pass [] to clear).
  await insertAlignments(tx, target_kind, target_name, alignments);
}

// Read-only helper for tests + the schema route to surface the alignment
// list per label / type.
export async function listAlignments(
  tx: ManagedTransaction,
  target_kind: AlignmentTargetKind,
  target_name: string,
): Promise<ReadonlyArray<ExternalAlignmentEntry>> {
  const res = await tx.run(
    `MATCH (al:_OntologyAlignment {
       target_kind: $target_kind,
       target_name: $target_name
     })
     RETURN al.source AS source, al.external_id AS external_id
     ORDER BY al.source, al.external_id`,
    { target_kind, target_name },
  );
  return res.records.map((r) => ({
    source: r.get("source") as string,
    id: r.get("external_id") as string,
  }));
}
