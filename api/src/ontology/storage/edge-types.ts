// T-11 — Edge-type storage CRUD (design §4.2).
//
// Five helpers operating on the `_OntologyEdgeType` registry row + its
// child `_OntologyEdgeEndpoint` collection + its `_OntologyAlignment`
// rows. Mirrors T-10's node-label CRUD shape; differences are:
//
//   • The child collection is `_OntologyEdgeEndpoint` (one row per
//     allowed (from_label, to_label) pair), not `_OntologyAttributeSchema`.
//   • `patchEdgeType` runs the symmetric `schema_breaking` guard from
//     FR-04a — dropping an endpoint pair with live edges of that triple
//     throws BEFORE any write so the registry never falls out of sync
//     with the data graph.
//   • `deleteEdgeType` cascade-DETACH-DELETEs endpoints + alignments
//     and drops the per-type `edge_id_unique_<name>` constraint
//     (pass-1 design-review C-04 parallel to deleteNodeLabel's per-label
//     constraint drop).
//
// Pattern is identical to graph-core's storage helpers + the rest of
// the ontology storage layer: every mutation runs inside one
// `session.executeWrite` transaction that ALSO writes the audit /
// version / event rows (NFR-01 + design §4.5).
//
// Cypher safety
// -------------
// Two interpolation sites:
//   1. `MATCH (a:\`${pair.fromLabel}\`)-[r:\`${name}\`]->(b:\`${pair.toLabel}\`)` —
//      live-edge counting for the schema-breaking guard. Both label and
//      edge-type names come from registry rows (so they were validated
//      by `nodeLabelCreateSchema` / `edgeTypeCreateSchema` regexes on
//      insert) but we still backtick-escape defensively, same as
//      graph-core's edge storage.
//   2. `DROP CONSTRAINT edge_id_unique_${name} IF EXISTS` — name comes
//      from the validated registry row.

import type { Driver, ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare } from "fast-json-patch";
import type {
  EdgeTypeCreate,
  EdgeTypePatch,
  EdgeEndpointPair,
} from "@companygraph/shared";
import { generateId } from "../../ids";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { isConstraintViolation } from "../../errors";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";
import {
  insertAlignments,
  replaceAlignments,
  listAlignments,
} from "./alignments";
import { assertDeletePreconditions } from "./preconditions";

export interface EdgeTypeRow {
  name: string;
  description: string;
  usage_example: string;
  endpoints: ReadonlyArray<EdgeEndpointPair>;
  external_alignment: ReadonlyArray<{ source: string; id: string }>;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

// Neo4j drivers return counts as either a Neo4j Integer (with
// `.toNumber()`) or a plain JS number depending on session config. The
// same coercion pattern as in `preconditions.ts`.
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

// =============================================================================
// Internal read helpers — both operate inside a passed-in transaction so they
// can be reused by patch / delete flows that need the `before` snapshot.
// =============================================================================

async function readEdgeTypeInTx(
  tx: ManagedTransaction,
  name: string,
): Promise<EdgeTypeRow | null> {
  const res = await tx.run(
    `MATCH (e:_OntologyEdgeType {name: $name})
     OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
     OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
     RETURN e, collect(DISTINCT ep) AS eps, collect(DISTINCT a) AS alignments`,
    { name },
  );
  if (res.records.length === 0) return null;
  const rec = res.records[0]!;
  const eRaw = rec.get("e") as {
    properties: {
      name: string;
      description: string;
      usage_example: string;
      deprecated_at?: string | null;
      created_at: string;
      updated_at: string;
    };
  } | null;
  if (eRaw == null) return null;

  const eps = (rec.get("eps") as Array<{
    properties: { from_label: string; to_label: string };
  } | null>)
    .filter((x): x is { properties: { from_label: string; to_label: string } } => x != null)
    .map((x) => ({
      fromLabel: x.properties.from_label,
      toLabel: x.properties.to_label,
    }))
    // Stable sort by from then to so tests + diffs are deterministic.
    .sort((a, b) =>
      a.fromLabel === b.fromLabel
        ? a.toLabel.localeCompare(b.toLabel)
        : a.fromLabel.localeCompare(b.fromLabel),
    );

  const alignments = (rec.get("alignments") as Array<{
    properties: { source: string; external_id: string };
  } | null>)
    .filter((x): x is { properties: { source: string; external_id: string } } => x != null)
    .map((x) => ({ source: x.properties.source, id: x.properties.external_id }))
    .sort((a, b) =>
      a.source === b.source
        ? a.id.localeCompare(b.id)
        : a.source.localeCompare(b.source),
    );

  return {
    name: eRaw.properties.name,
    description: eRaw.properties.description,
    usage_example: eRaw.properties.usage_example,
    endpoints: eps,
    external_alignment: alignments,
    deprecated_at: eRaw.properties.deprecated_at ?? null,
    created_at: eRaw.properties.created_at,
    updated_at: eRaw.properties.updated_at,
  };
}

// Pre-check helper: every endpoint pair's `fromLabel` AND `toLabel` MUST
// exist as `_OntologyNodeLabel` rows. Throws `type_pair_violation` with
// the offending pair + unknown label on first miss.
async function assertEndpointLabelsExist(
  tx: ManagedTransaction,
  endpoints: ReadonlyArray<EdgeEndpointPair>,
): Promise<void> {
  // Collect distinct label names to minimise round-trips.
  const distinct = new Set<string>();
  for (const pair of endpoints) {
    distinct.add(pair.fromLabel);
    distinct.add(pair.toLabel);
  }
  const present = new Set<string>();
  for (const name of distinct) {
    const r = await tx.run(
      `MATCH (l:_OntologyNodeLabel) WHERE l.name = $name RETURN count(l) AS c`,
      { name },
    );
    if (toN(r.records[0]?.get("c")) > 0) {
      present.add(name);
    }
  }
  for (const pair of endpoints) {
    if (!present.has(pair.fromLabel)) {
      ERROR_CODE_THROWERS.type_pair_violation({
        unknown_label: pair.fromLabel,
        pair,
      });
    }
    if (!present.has(pair.toLabel)) {
      ERROR_CODE_THROWERS.type_pair_violation({
        unknown_label: pair.toLabel,
        pair,
      });
    }
  }
}

// Insert one `_OntologyEdgeEndpoint` row per pair + wire its `OF_TYPE`
// link to the parent edge-type node. Same shape as the seed's MERGE
// pattern in seedRegistryFromConstTuples (T-08) but using CREATE since
// the public-write contract is strict-CREATE.
async function createEndpointRows(
  tx: ManagedTransaction,
  name: string,
  endpoints: ReadonlyArray<EdgeEndpointPair>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const pair of endpoints) {
    await tx.run(
      `MATCH (e:_OntologyEdgeType {name: $name})
       CREATE (ep:_OntologyEdgeEndpoint {
         edge_type_name: $name,
         from_label: $from_label,
         to_label: $to_label,
         created_at: $now
       })-[:OF_TYPE]->(e)`,
      { name, from_label: pair.fromLabel, to_label: pair.toLabel, now },
    );
  }
}

// =============================================================================
// createEdgeType — strict CREATE; 409 on duplicate name; 400 type_pair_violation
// if any endpoint references a missing node label.
// =============================================================================
export async function createEdgeType(
  driver: Driver,
  input: EdgeTypeCreate,
  actor: string,
): Promise<EdgeTypeRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      // (1) Pre-check endpoint labels.
      await assertEndpointLabelsExist(tx, input.endpoints);

      // (2) Strict CREATE on `_OntologyEdgeType`. Constraint violation → name_conflict.
      const now = new Date().toISOString();
      try {
        await tx.run(
          `CREATE (e:_OntologyEdgeType {
             name: $name,
             description: $description,
             usage_example: $usage_example,
             created_at: $now,
             updated_at: $now
           })`,
          {
            name: input.name,
            description: input.description,
            usage_example: input.usage_example,
            now,
          },
        );
      } catch (e) {
        if (isConstraintViolation(e)) {
          ERROR_CODE_THROWERS.name_conflict({ name: input.name });
        }
        throw e;
      }

      // (3) Endpoint rows.
      await createEndpointRows(tx, input.name, input.endpoints);

      // (4) Alignments.
      if (input.external_alignment && input.external_alignment.length > 0) {
        await insertAlignments(
          tx,
          "edge_type",
          input.name,
          input.external_alignment,
        );
      }

      // (5) Audit + version + event.
      const version_id = generateId();
      const afterSnapshot = await readEdgeTypeInTx(tx, input.name);
      await writeAudit(
        tx,
        actor,
        "create_edge_type",
        input.name,
        null,
        afterSnapshot,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "create_edge_type", input);
      await writeEvent(
        tx,
        version_id,
        jsonpatchCompare({}, afterSnapshot as unknown as object),
      );

      return afterSnapshot!;
    });
  } finally {
    await session.close();
  }
}

// =============================================================================
// getEdgeType — single Cypher with two OPTIONAL MATCHes for endpoints + alignments.
// =============================================================================
export async function getEdgeType(
  driver: Driver,
  name: string,
): Promise<EdgeTypeRow | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // Re-use the in-tx reader via a read-tx so behaviour stays identical.
    return await session.executeRead(async (tx) => readEdgeTypeInTx(tx, name));
  } finally {
    await session.close();
  }
}

// =============================================================================
// listEdgeTypes — all edge-type rows + their endpoints + alignments, sorted by name.
// =============================================================================
export async function listEdgeTypes(
  driver: Driver,
): Promise<ReadonlyArray<EdgeTypeRow>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      const res = await tx.run(
        `MATCH (e:_OntologyEdgeType)
         OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
         OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
         WITH e, collect(DISTINCT ep) AS eps, collect(DISTINCT a) AS alignments
         RETURN e, eps, alignments
         ORDER BY e.name`,
      );
      const rows: EdgeTypeRow[] = [];
      for (const rec of res.records) {
        const eRaw = rec.get("e") as {
          properties: {
            name: string;
            description: string;
            usage_example: string;
            deprecated_at?: string | null;
            created_at: string;
            updated_at: string;
          };
        } | null;
        if (eRaw == null) continue;
        const eps = (rec.get("eps") as Array<{
          properties: { from_label: string; to_label: string };
        } | null>)
          .filter(
            (x): x is { properties: { from_label: string; to_label: string } } =>
              x != null,
          )
          .map((x) => ({
            fromLabel: x.properties.from_label,
            toLabel: x.properties.to_label,
          }))
          .sort((a, b) =>
            a.fromLabel === b.fromLabel
              ? a.toLabel.localeCompare(b.toLabel)
              : a.fromLabel.localeCompare(b.fromLabel),
          );
        const alignments = (rec.get("alignments") as Array<{
          properties: { source: string; external_id: string };
        } | null>)
          .filter(
            (x): x is { properties: { source: string; external_id: string } } =>
              x != null,
          )
          .map((x) => ({
            source: x.properties.source,
            id: x.properties.external_id,
          }))
          .sort((a, b) =>
            a.source === b.source
              ? a.id.localeCompare(b.id)
              : a.source.localeCompare(b.source),
          );
        rows.push({
          name: eRaw.properties.name,
          description: eRaw.properties.description,
          usage_example: eRaw.properties.usage_example,
          endpoints: eps,
          external_alignment: alignments,
          deprecated_at: eRaw.properties.deprecated_at ?? null,
          created_at: eRaw.properties.created_at,
          updated_at: eRaw.properties.updated_at,
        });
      }
      return rows;
    });
  } finally {
    await session.close();
  }
}

// =============================================================================
// patchEdgeType — symmetric `schema_breaking` guard per FR-04a (design §4.2).
//
// If `input.endpoints` is provided, compute the dropped pairs (in before
// but not in input). For each dropped pair, COUNT live edges of that
// (fromLabel)-[:NAME]->(toLabel) triple in the data graph. If any have
// count > 0, throw `schema_breaking` with sample edge ids BEFORE any
// mutation — never leave the registry inconsistent with live data.
// =============================================================================
export async function patchEdgeType(
  driver: Driver,
  name: string,
  input: EdgeTypePatch,
  actor: string,
): Promise<EdgeTypeRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const before = await readEdgeTypeInTx(tx, name);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name, kind: "edge_type" });
      }

      // Schema-breaking guard for endpoint mutations.
      if (input.endpoints !== undefined) {
        const newPairs = input.endpoints;
        const droppedPairs = before!.endpoints.filter(
          (p) =>
            !newPairs.some(
              (np) =>
                np.fromLabel === p.fromLabel && np.toLabel === p.toLabel,
            ),
        );

        for (const pair of droppedPairs) {
          // Backtick-escape the (validated) label + type names; safe even
          // if Cypher reserved-word collisions ever arise.
          const liveRes = await tx.run(
            `MATCH (a:\`${pair.fromLabel}\`)-[r:\`${name}\`]->(b:\`${pair.toLabel}\`)
             RETURN count(r) AS c, collect(r.id)[..10] AS sample_ids`,
          );
          const live = liveRes.records[0]!;
          const count = toN(live.get("c"));
          if (count > 0) {
            const sample_ids = (live.get("sample_ids") as unknown[]).filter(
              (x): x is string => typeof x === "string",
            );
            ERROR_CODE_THROWERS.schema_breaking({
              affected_edge_count: count,
              sample_edge_ids: sample_ids,
              dropped_pair: pair,
            });
          }
        }

        // All dropped pairs pass — replace the endpoint set.
        await tx.run(
          `MATCH (e:_OntologyEdgeType {name: $name})<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
           DETACH DELETE ep`,
          { name },
        );
        await createEndpointRows(tx, name, newPairs);
      }

      // SET clause for description / usage_example (dynamic).
      const sets: string[] = ["e.updated_at = $now"];
      const params: Record<string, unknown> = {
        name,
        now: new Date().toISOString(),
      };
      if (input.description !== undefined) {
        sets.push("e.description = $description");
        params.description = input.description;
      }
      if (input.usage_example !== undefined) {
        sets.push("e.usage_example = $usage_example");
        params.usage_example = input.usage_example;
      }
      await tx.run(
        `MATCH (e:_OntologyEdgeType {name: $name}) SET ${sets.join(", ")}`,
        params,
      );

      // Alignment replacement.
      if (input.external_alignment !== undefined) {
        await replaceAlignments(
          tx,
          "edge_type",
          name,
          input.external_alignment,
        );
      }

      const after = await readEdgeTypeInTx(tx, name);
      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "patch_edge_type",
        name,
        before,
        after,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "patch_edge_type", {
        name,
        patch: input,
      });
      await writeEvent(
        tx,
        version_id,
        jsonpatchCompare(before as object, after as object),
      );
      return after!;
    });
  } finally {
    await session.close();
  }
}

// =============================================================================
// deleteEdgeType — cascade DETACH DELETE per pass-1 design-review C-04.
// Removes the edge-type row + its endpoint rows + its alignment rows in
// a single Cypher; then drops the per-type `edge_id_unique_<name>`
// constraint (graph-core's per-type create-constraint loop must be
// symmetric — see graph-core/§9).
//
// Neo4j 5 rejects mixing schema modifications (DROP CONSTRAINT) and DML
// (CREATE/DELETE/SET) inside the same transaction with
// `Neo.ClientError.Transaction.ForbiddenDueToTransactionType`. The DROP
// runs in a second auto-commit step AFTER the executeWrite tx resolves.
// Failure mode: if the DML tx commits but the DROP fails, the registry
// row + endpoints are gone but the constraint remains; this is recovered
// by the next graph-core bootstrap pass which would re-CREATE the
// constraint as a no-op (the constraint references a relationship-type
// that no longer has registry-registered endpoints, but Neo4j stores
// the constraint by name regardless). A subsequent `deleteEdgeType` call
// for the same name → 404, so manual `DROP CONSTRAINT` is the only
// recovery — acceptable on single-tenant per NFR-08.
// =============================================================================
export async function deleteEdgeType(
  driver: Driver,
  name: string,
  actor: string,
  confirm_migration_step_id?: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const before = await readEdgeTypeInTx(tx, name);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name, kind: "edge_type" });
      }

      // Pass-1 C-04 preconditions: live-edge count + migration-step gate.
      await assertDeletePreconditions(
        tx,
        "edge_type",
        name,
        before!,
        confirm_migration_step_id,
      );

      // Cascade DETACH DELETE in one statement: type + endpoints + alignments.
      await tx.run(
        `MATCH (e:_OntologyEdgeType {name: $name})
         OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
         OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
         DETACH DELETE e, ep, a`,
        { name },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "delete_edge_type",
        name,
        before,
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "delete_edge_type", { name });
      await writeEvent(tx, version_id, [
        { op: "remove", path: `/edgeTypes/${name}` },
      ]);
    });

    // Drop the per-type edge-id-unique constraint AFTER the DML tx commits.
    // Neo4j 5 disallows mixing DDL + DML in one tx; this is a separate
    // auto-commit statement. `IF EXISTS` makes it idempotent + resilient
    // to a partial-rollback recovery path. Constraint operations cannot
    // be parameterised — name is interpolated but came from a validated
    // registry row.
    await session.run(`DROP CONSTRAINT edge_id_unique_${name} IF EXISTS`);
  } finally {
    await session.close();
  }
}

// =============================================================================
// Helper export — useful for the schema-route bundle (read alignments per type).
// =============================================================================
export async function readEdgeTypeAlignments(
  driver: Driver,
  name: string,
): Promise<ReadonlyArray<{ source: string; id: string }>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead((tx) =>
      listAlignments(tx, "edge_type", name),
    );
  } finally {
    await session.close();
  }
}
