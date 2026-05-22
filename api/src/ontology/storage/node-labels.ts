// T-10 — Node-label registry CRUD (design §4.1).
//
// Strict-CREATE on `_OntologyNodeLabel` keyed by `name`. Every mutation
// commits the `_OntologyNodeLabel` row, the linked `_OntologyAttributeSchema`,
// the per-call `_OntologyAlignment` rows (via T-12's helpers), the
// `_OntologyAudit` row, the `_OntologyVersion` row, AND the
// `_OntologyEvent` row in a single `executeWrite` transaction (NFR-01).
//
// The `_OntologyEvent` write on `deleteNodeLabel` is the pass-1 N-09 fix:
// rev-1 of the design called `writeAudit` + `writeVersion` on DELETE but
// skipped `writeEvent`, leaving SSE subscribers blind to deletions.
// Mirrors `deleteEdgeType` per §4.2.
//
// FR-12 invalidating-change guard
// -------------------------------
// `patchNodeLabel` diff-counts newly-required keys against the prior
// `json_schema_doc.required`. If any matching `(:Label)` data rows exist
// AND `forceBackfill` is NOT set → 409 `would_invalidate` (no write).
// If `forceBackfill` IS set → run the APOC backfill Cypher inline so the
// rows now satisfy the new schema before the patch commits.
//
// Cypher safety
// -------------
// `name` is interpolated into `MATCH (n:${name})` for the guard count +
// `DROP CONSTRAINT node_id_unique_${name} IF EXISTS` on DELETE. The
// nodeLabelCreateSchema regex `/^[A-Z][A-Za-z0-9_]*$/` (+ underscore-prefix
// rejection) already constrains the value at the REST boundary. Backtick
// escapes are layered as defence-in-depth, same as graph-core's storage.

import type { Driver, ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare } from "fast-json-patch";
import type {
  NodeLabelCreate,
  NodeLabelPatch,
  ExternalAlignmentEntry,
} from "@companygraph/shared/schema/ontology";
import { generateId } from "../../ids";
import { isConstraintViolation } from "../../errors";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";
import {
  insertAlignments,
  replaceAlignments,
  listAlignments,
} from "./alignments";
import { assertDeletePreconditions } from "./preconditions";

// ---------------------------------------------------------------------------
// Public row shape — what the REST handler returns (parsed JSON, not
// JSON-encoded strings). Mirrors `nodeLabelReadSchema` in shared.
// ---------------------------------------------------------------------------

export interface NodeLabelRow {
  name: string;
  description: string;
  usage_example: string;
  json_schema_doc: unknown;
  external_alignment: ReadonlyArray<{ source: string; id: string }>;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

// Neo4j may return counts as either a plain JS number (when
// `disableLosslessIntegers: true` on the driver) or as a Neo4j Integer
// (`{low, high}` with `.toNumber()`). The same coercion pattern used in
// `preconditions.ts` + `seed.ts`.
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

// ---------------------------------------------------------------------------
// Tx-scoped read helpers. Used inside the storage helpers to read `before`
// + `after` snapshots that participate in the audit + diff. Exposed as
// `getNodeLabel` (public, opens its own session) below.
// ---------------------------------------------------------------------------

async function readNodeLabelInTx(
  tx: ManagedTransaction,
  name: string,
): Promise<NodeLabelRow | null> {
  const res = await tx.run(
    `MATCH (l:_OntologyNodeLabel {name: $name})
     OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
     RETURN l, s`,
    { name },
  );
  const rec = res.records[0];
  if (!rec) return null;

  const l = rec.get("l") as { properties: Record<string, unknown> } | null;
  const s = rec.get("s") as { properties: Record<string, unknown> } | null;
  if (!l) return null;

  const alignments = await listAlignments(tx, "node_label", name);
  return deserializeNodeLabelProps(l.properties, s?.properties, alignments);
}

function deserializeNodeLabelProps(
  l: Record<string, unknown>,
  s: Record<string, unknown> | undefined,
  alignments: ReadonlyArray<ExternalAlignmentEntry>,
): NodeLabelRow {
  const jsdRaw = (s?.json_schema_doc as string | undefined) ?? null;
  return {
    name: l.name as string,
    description: (l.description as string) ?? "",
    usage_example: (l.usage_example as string) ?? "",
    json_schema_doc: jsdRaw ? JSON.parse(jsdRaw) : null,
    external_alignment: alignments,
    deprecated_at: (l.deprecated_at as string | null | undefined) ?? null,
    created_at: l.created_at as string,
    updated_at: l.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// createNodeLabel — strict CREATE. 409 name_conflict on duplicate.
// ---------------------------------------------------------------------------

export async function createNodeLabel(
  driver: Driver,
  input: NodeLabelCreate,
  actor: string,
): Promise<NodeLabelRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      try {
        await tx.run(
          `CREATE (l:_OntologyNodeLabel {
             name: $name, description: $description, usage_example: $usage_example,
             created_at: $now, updated_at: $now
           })
           WITH l
           CREATE (s:_OntologyAttributeSchema {
             label_name: $name, json_schema_doc: $jsd, created_at: $now, updated_at: $now
           })-[:DESCRIBES]->(l)`,
          {
            name: input.name,
            description: input.description,
            usage_example: input.usage_example,
            jsd: JSON.stringify(input.json_schema_doc ?? {}),
            now,
          },
        );

        if (input.external_alignment && input.external_alignment.length > 0) {
          await insertAlignments(
            tx,
            "node_label",
            input.name,
            input.external_alignment,
          );
        }

        const after = await readNodeLabelInTx(tx, input.name);
        if (!after) {
          throw new Error(
            `createNodeLabel: row not readable post-write for ${input.name}`,
          );
        }

        const version_id = generateId();
        await writeAudit(
          tx,
          actor,
          "create_node_label",
          input.name,
          null,
          after,
          version_id,
        );
        await writeVersion(tx, version_id, actor, "create_node_label", input);
        await writeEvent(tx, version_id, [
          { op: "add", path: `/nodeLabels/${input.name}`, value: after },
        ]);
        return after;
      } catch (e) {
        // Both the `_OntologyNodeLabel.name` and `_OntologyAttributeSchema.label_name`
        // constraints surface as the same Neo4j error code. Either way the
        // failure-mode is "this label already exists" → 409 name_conflict.
        if (isConstraintViolation(e)) {
          ERROR_CODE_THROWERS.name_conflict({ name: input.name });
        }
        throw e;
      }
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// getNodeLabel — single-row read. Null when no match.
// ---------------------------------------------------------------------------

export async function getNodeLabel(
  driver: Driver,
  name: string,
): Promise<NodeLabelRow | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead((tx) => readNodeLabelInTx(tx, name));
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// listNodeLabels — every row, sorted by name.
// ---------------------------------------------------------------------------

export async function listNodeLabels(
  driver: Driver,
): Promise<ReadonlyArray<NodeLabelRow>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      const res = await tx.run(
        `MATCH (l:_OntologyNodeLabel)
         OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
         OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
         WITH l, s, collect(DISTINCT a) AS alignments
         RETURN l, s, alignments
         ORDER BY l.name`,
      );
      const rows: NodeLabelRow[] = [];
      for (const rec of res.records) {
        const l = rec.get("l") as { properties: Record<string, unknown> } | null;
        const s = rec.get("s") as { properties: Record<string, unknown> } | null;
        if (!l) continue;
        const rawAlignments = (rec.get("alignments") as Array<{
          properties: { source: string; external_id: string };
        } | null>)
          .filter((x): x is { properties: { source: string; external_id: string } } => x != null)
          .map((x) => ({ source: x.properties.source, id: x.properties.external_id }))
          .sort((a, b) =>
            a.source === b.source
              ? a.id.localeCompare(b.id)
              : a.source.localeCompare(b.source),
          );
        rows.push(deserializeNodeLabelProps(l.properties, s?.properties, rawAlignments));
      }
      return rows;
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// patchNodeLabel — partial update + FR-12 invalidating-change guard.
// ---------------------------------------------------------------------------

export async function patchNodeLabel(
  driver: Driver,
  name: string,
  input: NodeLabelPatch,
  actor: string,
  opts: { forceBackfill?: boolean; backfillValue?: unknown } = {},
): Promise<NodeLabelRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const before = await readNodeLabelInTx(tx, name);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name, kind: "node_label" });
      }
      const beforeRow = before as NodeLabelRow;

      // ── FR-12 invalidating-change guard ───────────────────────────
      if (input.json_schema_doc !== undefined) {
        const beforeRequired = new Set<string>(
          ((beforeRow.json_schema_doc as { required?: string[] } | null)
            ?.required ?? []) as string[],
        );
        const afterRequired = new Set<string>(
          ((input.json_schema_doc as { required?: string[] } | null)
            ?.required ?? []) as string[],
        );
        const newlyRequired = [...afterRequired].filter(
          (k) => !beforeRequired.has(k),
        );
        if (newlyRequired.length > 0) {
          const countRes = await tx.run(
            `MATCH (n:\`${name}\`)
             RETURN count(n) AS c, collect(n.id)[..10] AS sample_ids`,
          );
          const count = toN(countRes.records[0]?.get("c"));
          const sample_ids =
            (countRes.records[0]?.get("sample_ids") as
              | ReadonlyArray<string>
              | undefined) ?? [];

          if (count > 0 && !opts.forceBackfill) {
            ERROR_CODE_THROWERS.would_invalidate({
              affected_count: count,
              sample_node_ids: sample_ids,
              newly_required: newlyRequired,
              suggested_backfill:
                "supply ?forceBackfill=true + a literal backfill value or per-attribute JSON Patch",
            });
          }

          if (count > 0 && opts.forceBackfill) {
            // APOC-based backfill. graph-core/§8.3 enables APOC on the
            // compose image; tests pre-flight by exercising `apoc.version()`.
            await tx.run(
              `MATCH (n:\`${name}\`)
               WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs,
                    $newly_required AS keys, $backfill AS val, $now AS now
               UNWIND keys AS key
               WITH n, attrs, key, val, now,
                    CASE WHEN attrs[key] IS NULL
                         THEN apoc.map.setKey(attrs, key, val)
                         ELSE attrs END AS new_attrs
               SET n.attributes_json = apoc.convert.toJson(new_attrs),
                   n.updatedAt = now`,
              {
                newly_required: newlyRequired,
                backfill: opts.backfillValue ?? null,
                now: new Date().toISOString(),
              },
            );
          }
        }
      }

      // ── Dynamic SET clause on the _OntologyNodeLabel row ──────────
      const now = new Date().toISOString();
      const sets: string[] = ["l.updated_at = $now"];
      const params: Record<string, unknown> = { name, now };
      if (input.description !== undefined) {
        sets.push("l.description = $description");
        params.description = input.description;
      }
      if (input.usage_example !== undefined) {
        sets.push("l.usage_example = $usage_example");
        params.usage_example = input.usage_example;
      }
      await tx.run(
        `MATCH (l:_OntologyNodeLabel {name: $name})
         SET ${sets.join(", ")}`,
        params,
      );

      // ── Rewrite the _OntologyAttributeSchema row when json_schema_doc
      //    is provided. FR-05 (pass-1 C-05): this NEVER touches any data
      //    `:Label` row's `attributes_json` — historical rows surface
      //    newly-defined attributes as missing until the forceBackfill
      //    path above writes them.
      if (input.json_schema_doc !== undefined) {
        await tx.run(
          `MATCH (l:_OntologyNodeLabel {name: $name})<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
           SET s.json_schema_doc = $jsd, s.updated_at = $now`,
          {
            name,
            jsd: JSON.stringify(input.json_schema_doc),
            now,
          },
        );
      }

      // ── Replace-semantics on the alignment array.
      if (input.external_alignment !== undefined) {
        await replaceAlignments(
          tx,
          "node_label",
          name,
          input.external_alignment,
        );
      }

      const after = await readNodeLabelInTx(tx, name);
      if (!after) {
        throw new Error(
          `patchNodeLabel: row not readable post-write for ${name}`,
        );
      }

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "patch_node_label",
        name,
        beforeRow,
        after,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "patch_node_label", {
        name,
        patch: input,
      });
      await writeEvent(
        tx,
        version_id,
        jsonpatchCompare(
          beforeRow as unknown as object,
          after as unknown as object,
        ) as ReadonlyArray<Record<string, unknown>>,
      );
      return after;
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// deleteNodeLabel — preconditions + cascade DETACH + drop per-label
// constraint + drop per-label index + audit + version + EVENT (pass-1 N-09).
// ---------------------------------------------------------------------------

export async function deleteNodeLabel(
  driver: Driver,
  name: string,
  actor: string,
  confirm_migration_step_id?: string,
): Promise<void> {
  // Neo4j 5 forbids combining schema modifications (`DROP CONSTRAINT` /
  // `DROP INDEX`) with writes in a single transaction
  // (`Neo.ClientError.Transaction.ForbiddenDueToTransactionType`). Split:
  //   1. `executeWrite` — preconditions, cascade DETACH DELETE, audit,
  //      version, event row. All atomic.
  //   2. Post-commit `session.run` — DROP per-label CONSTRAINT + INDEX.
  // If the post-commit step fails (e.g. Neo4j hiccup), the registry rows
  // are already gone; the orphan constraint + index remain. They're
  // harmless (the data labels they guarded no longer exist) and a
  // subsequent re-`createNodeLabel` of the same name would re-`MERGE`
  // them via bootstrap. The audit log records the canonical event.
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const before = await readNodeLabelInTx(tx, name);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name, kind: "node_label" });
      }
      const beforeRow = before as NodeLabelRow;

      await assertDeletePreconditions(
        tx,
        "node_label",
        name,
        beforeRow,
        confirm_migration_step_id,
      );

      // Cascade-delete the row + its descriptor schema + alignments.
      await tx.run(
        `MATCH (l:_OntologyNodeLabel {name: $name})
         OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
         OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
         DETACH DELETE l, s, a`,
        { name },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "delete_node_label",
        name,
        beforeRow,
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "delete_node_label", {
        name,
      });
      // pass-1 N-09 — DELETE MUST emit a remove-shape JSON Patch so SSE
      // subscribers see the deletion. Mirrors `deleteEdgeType` per §4.2.
      await writeEvent(tx, version_id, [
        { op: "remove", path: `/nodeLabels/${name}` },
      ]);
    });

    // Step 2 — schema modifications outside the write tx. Use `session.run`
    // (auto-tx of type SCHEMA) so Neo4j doesn't reject the mix.
    await session.run(`DROP CONSTRAINT node_id_unique_${name} IF EXISTS`);
    await session.run(`DROP INDEX node_name_${name} IF EXISTS`);
  } finally {
    await session.close();
  }
}
