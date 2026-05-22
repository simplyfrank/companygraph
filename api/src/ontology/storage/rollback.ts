// T-19 — Rollback executor (design §4.8, FR-18).
//
// `executeRollback(driver, version_id, actor)` restores the ontology
// registry to the state it was in AT `version_id` by replaying the
// inverse of every audit row committed AFTER that version.
//
// Algorithm (single executeWrite transaction):
//   1. Resolve the target version's `ts` from `_OntologyVersion`.
//   2. Reject if there are no `_OntologyAudit` rows after that ts —
//      nothing to roll back (idempotent / no-op path).
//   3. For each audit row AFTER the target ts, ordered DESC (newest first
//      so we undo in reverse-chronological order):
//      a. If `action` is a create_* → DELETE the created node.
//      b. If `action` is a patch_*  → SET properties back to `before_json`.
//      c. If `action` is a delete_* → MERGE the node back from `before_json`
//         (re-create).
//      d. Migration + seed rows are skipped — their data-graph effects
//         are out of scope for schema rollback (rollback_orphans guard
//         raises 400 if any migration rows exist after the target ts).
//   4. Write a new audit + version + event row for the rollback itself.
//   5. Return { version_id (new), rows_reversed, target_version_id }.
//
// Guards:
//   - `rollback_below_bootstrap`: target version is the seed version or
//     older (checked BEFORE this function by the route handler stub in
//     `ontology-versions.ts`).
//   - `rollback_orphans`: any `_OntologyMigration` rows whose `ts` is
//     AFTER the target version's `ts` — rolling back the schema without
//     un-migrating the data graph would leave orphaned nodes.
//
// Cypher safety: no names from the audit payloads are interpolated into
// Cypher templates. `target` values (label/type names) stored in audit
// rows flow as $target parameters.

import type { Driver } from "neo4j-driver";
import { generateId } from "../../ids";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion, deserializeAudit } from "./audit";
import { writeEvent } from "./events";

export interface RollbackResult {
  version_id: string;
  rows_reversed: number;
  target_version_id: string;
}

const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

export async function executeRollback(
  driver: Driver,
  targetVersionId: string,
  actor: string,
): Promise<RollbackResult> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      // 1. Resolve target ts.
      const vRes = await tx.run(
        `MATCH (v:_OntologyVersion {version_id: $vid}) RETURN v.ts AS ts`,
        { vid: targetVersionId },
      );
      if (vRes.records.length === 0) {
        ERROR_CODE_THROWERS.not_found({ id: targetVersionId, kind: "version" });
      }
      const targetTs = vRes.records[0]!.get("ts") as string;

      // 2. Guard: any migration rows after target ts → rollback_orphans.
      const migRes = await tx.run(
        `MATCH (m:_OntologyMigration)
         WHERE m.ts > $targetTs
         RETURN collect(DISTINCT m.target) AS affected_labels, count(m) AS c`,
        { targetTs },
      );
      const migCount = toN(migRes.records[0]?.get("c") ?? 0);
      if (migCount > 0) {
        const affectedLabels = (migRes.records[0]?.get("affected_labels") as string[]) ?? [];
        ERROR_CODE_THROWERS.rollback_orphans({
          affected_labels: affectedLabels,
          count: migCount,
        });
      }

      // 3. Collect all audit rows AFTER target ts, ordered newest→oldest.
      const auditRes = await tx.run(
        `MATCH (a:_OntologyAudit)
         WHERE a.ts > $targetTs
         RETURN a.ts AS ts, a.actor AS actor, a.action AS action,
                a.target AS target, a.before_json AS before_json,
                a.after_json AS after_json, a.diff_jsonpatch AS diff_jsonpatch,
                a.version_id AS version_id
         ORDER BY a.ts DESC`,
        { targetTs },
      );

      if (auditRes.records.length === 0) {
        // Already at or past the target state — idempotent no-op.
        const newVersionId = generateId();
        await writeAudit(tx, actor, "rollback_noop", targetVersionId, null, null, newVersionId);
        await writeVersion(tx, newVersionId, actor, "rollback_noop", { target: targetVersionId });
        await writeEvent(tx, newVersionId, []);
        return { version_id: newVersionId, rows_reversed: 0, target_version_id: targetVersionId };
      }

      let rows_reversed = 0;

      for (const rec of auditRes.records) {
        const row = deserializeAudit(rec);
        const action = row.action as string;
        const target = row.target as string;

        // Skip seed + migration audit rows — data-graph effects are out of scope.
        if (
          action === "system_bootstrap_seed" ||
          action === "execute_migration" ||
          action === "rollback_noop"
        ) {
          continue;
        }

        if (action.startsWith("create_")) {
          // Undo create → DELETE the registry node.
          if (action === "create_node_label") {
            await tx.run(
              `MATCH (l:_OntologyNodeLabel {name: $name})
               OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
               OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
               DETACH DELETE l, s, a`,
              { name: target },
            );
          } else if (action === "create_edge_type") {
            await tx.run(
              `MATCH (t:_OntologyEdgeType {name: $name})
               OPTIONAL MATCH (t)-[:HAS_ENDPOINT]->(ep:_OntologyEdgeEndpoint)
               OPTIONAL MATCH (t)<-[:ALIGNS]-(a:_OntologyAlignment)
               DETACH DELETE t, ep, a`,
              { name: target },
            );
          }
          rows_reversed++;
        } else if (action.startsWith("patch_") || action.startsWith("update_")) {
          // Undo patch → restore before snapshot.
          const before = row.before as Record<string, unknown> | null;
          if (!before) continue;

          if (action === "patch_node_label" || action === "update_node_label") {
            await tx.run(
              `MATCH (l:_OntologyNodeLabel {name: $name})
               SET l.description        = $description,
                   l.usage_example      = $usage_example,
                   l.deprecated_at      = $deprecated_at,
                   l.updated_at         = $now`,
              {
                name: target,
                description: before.description ?? null,
                usage_example: before.usage_example ?? null,
                deprecated_at: before.deprecated_at ?? null,
                now: new Date().toISOString(),
              },
            );
          } else if (action === "patch_edge_type" || action === "update_edge_type") {
            await tx.run(
              `MATCH (t:_OntologyEdgeType {name: $name})
               SET t.description   = $description,
                   t.usage_example = $usage_example,
                   t.deprecated_at = $deprecated_at,
                   t.updated_at    = $now`,
              {
                name: target,
                description: before.description ?? null,
                usage_example: before.usage_example ?? null,
                deprecated_at: before.deprecated_at ?? null,
                now: new Date().toISOString(),
              },
            );
          }
          rows_reversed++;
        } else if (action.startsWith("delete_")) {
          // Undo delete → re-create from before snapshot.
          const before = row.before as Record<string, unknown> | null;
          if (!before) continue;
          const now = new Date().toISOString();

          if (action === "delete_node_label") {
            await tx.run(
              `MERGE (l:_OntologyNodeLabel {name: $name})
               ON CREATE SET
                 l.description   = $description,
                 l.usage_example = $usage_example,
                 l.deprecated_at = $deprecated_at,
                 l.created_at    = $created_at,
                 l.updated_at    = $now`,
              {
                name: target,
                description: before.description ?? "",
                usage_example: before.usage_example ?? "",
                deprecated_at: before.deprecated_at ?? null,
                created_at: before.created_at ?? now,
                now,
              },
            );
          } else if (action === "delete_edge_type") {
            await tx.run(
              `MERGE (t:_OntologyEdgeType {name: $name})
               ON CREATE SET
                 t.description   = $description,
                 t.usage_example = $usage_example,
                 t.deprecated_at = $deprecated_at,
                 t.created_at    = $created_at,
                 t.updated_at    = $now`,
              {
                name: target,
                description: before.description ?? "",
                usage_example: before.usage_example ?? "",
                deprecated_at: before.deprecated_at ?? null,
                created_at: before.created_at ?? now,
                now,
              },
            );
          }
          rows_reversed++;
        }
      }

      // 4. Audit + version + event for the rollback itself.
      const newVersionId = generateId();
      await writeAudit(tx, actor, "rollback", targetVersionId, null, null, newVersionId);
      await writeVersion(tx, newVersionId, actor, "rollback", { target: targetVersionId, rows_reversed });
      await writeEvent(tx, newVersionId, [
        { op: "test", path: "/rollback/target", value: targetVersionId },
        { op: "test", path: "/rollback/rows_reversed", value: rows_reversed },
      ]);

      return { version_id: newVersionId, rows_reversed, target_version_id: targetVersionId };
    });
  } finally {
    await session.close();
  }
}
