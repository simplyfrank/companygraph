// T-16 — Migration executor (FR-16, design §4.7).
//
// Discriminated-union dispatcher over 5 migration types per design
// pass-1 C-09: each variant compiles to a fixed parameterised Cypher
// template. **No operator-supplied Cypher reaches `executeWrite`.**
// The `transform` payload is structured zod-validated data; the migration
// type selects the template; the only way to break this contract is to
// add a new union variant + its corresponding template here.
//
// Per design §4.7, each migration:
//   1. Runs the typed Cypher template inside one `executeWrite` tx.
//   2. Persists a `_OntologyMigration` row (`migration_id`, `type`,
//      `target`, `transform_expression: JSON.stringify(transform)`,
//      `rows_affected`, `ts`, `actor`, `version_id`) in the same tx.
//   3. Writes audit + version + event rows inside the same tx
//      (NFR-01 — all-or-nothing).
//   4. Returns `{migration_id, rows_affected, version_id}`. The
//      post-commit `ontologyEvents.emit(...)` happens at the route
//      handler level (T-18c) — not here, mirroring §4.5.

import type { Driver } from "neo4j-driver";
import * as jsonpatch from "fast-json-patch";
import type { MigrationCreate } from "@companygraph/shared";
import { generateId } from "../../ids";
import { ValidationError } from "../../errors";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";

export interface MigrationResult {
  migration_id: string;
  rows_affected: number;
  version_id: string;
}

// Cypher templates per migration `type` — locked at compile time;
// runtime never builds a string from `input.transform`. All parameters
// flow through Neo4j's parameterised query layer.

interface CompiledMigration {
  cypher: string;
  params: Record<string, unknown>;
}

function compile(input: MigrationCreate, now: string): CompiledMigration {
  switch (input.type) {
    case "rename_attribute": {
      const { from_key, to_key } = input.transform;
      return {
        cypher: `
          MATCH (n:\`${input.target}\`)
          WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a
          WHERE a[$from] IS NOT NULL
          WITH n, apoc.map.removeKey(
                    apoc.map.setKey(a, $to, a[$from]), $from) AS new_a
          SET n.attributes_json = apoc.convert.toJson(new_a),
              n.updatedAt = $now
          RETURN count(n) AS c
        `,
        params: { from: from_key, to: to_key, now },
      };
    }
    case "remap_value": {
      const { key, from_value, to_value } = input.transform;
      return {
        cypher: `
          MATCH (n:\`${input.target}\`)
          WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a
          WHERE a[$key] = $from
          WITH n, apoc.map.setKey(a, $key, $to) AS new_a
          SET n.attributes_json = apoc.convert.toJson(new_a),
              n.updatedAt = $now
          RETURN count(n) AS c
        `,
        params: { key, from: from_value, to: to_value, now },
      };
    }
    case "remove_attribute": {
      const { key } = input.transform;
      return {
        cypher: `
          MATCH (n:\`${input.target}\`)
          WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a
          WHERE a[$key] IS NOT NULL
          WITH n, apoc.map.removeKey(a, $key) AS new_a
          SET n.attributes_json = apoc.convert.toJson(new_a),
              n.updatedAt = $now
          RETURN count(n) AS c
        `,
        params: { key, now },
      };
    }
    case "merge_labels": {
      const { source_labels } = input.transform;
      return {
        cypher: `
          MATCH (n)
          WHERE any(l IN labels(n) WHERE l IN $sources)
          WITH n, [l IN labels(n) WHERE l IN $sources] AS removeLabels
          CALL apoc.create.removeLabels(n, removeLabels) YIELD node
          WITH node
          CALL apoc.create.addLabels(node, [$target]) YIELD node AS node2
          SET node2.updatedAt = $now
          RETURN count(node2) AS c
        `,
        params: { sources: source_labels, target: input.target, now },
      };
    }
    case "split_label": {
      const { predicate_key, mapping } = input.transform;
      // `mapping` is `Record<string, string>` from the zod schema.
      // Stringify the predicate values to match — `toString(a[$key])`
      // covers numeric / boolean predicate values cast to string keys.
      return {
        cypher: `
          MATCH (n:\`${input.target}\`)
          WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a,
               $mapping AS m
          WHERE a[$key] IS NOT NULL AND m[toString(a[$key])] IS NOT NULL
          WITH n, m[toString(a[$key])] AS newLabel
          CALL apoc.create.removeLabels(n, [$src]) YIELD node
          WITH node, newLabel
          CALL apoc.create.addLabels(node, [newLabel]) YIELD node AS node2
          SET node2.updatedAt = $now
          RETURN count(node2) AS c
        `,
        params: {
          key: predicate_key,
          mapping,
          src: input.target,
          now,
        },
      };
    }
  }
}

const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

export async function executeMigration(
  driver: Driver,
  input: MigrationCreate,
  actor: string,
): Promise<MigrationResult> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      const migration_id = generateId();
      const version_id = generateId();

      // Run the typed Cypher template. Any driver-level failure surfaces
      // as `migration_failed` to the caller.
      let rows_affected = 0;
      try {
        const { cypher, params } = compile(input, now);
        const res = await tx.run(cypher, params);
        rows_affected = toN(res.records[0]?.get("c") ?? 0);
      } catch (e) {
        const cypher_error =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
        ERROR_CODE_THROWERS.migration_failed({ migration_id, cypher_error });
      }

      // Persist the migration row.
      await tx.run(
        `CREATE (m:_OntologyMigration {
          migration_id: $migration_id, type: $type, target: $target,
          transform_expression: $transform_json, rows_affected: $rows_affected,
          ts: $now, actor: $actor, version_id: $version_id
        })`,
        {
          migration_id,
          type: input.type,
          target: input.target,
          transform_json: JSON.stringify(input.transform),
          rows_affected,
          now,
          actor,
          version_id,
        },
      );

      // Audit + version + event in the same tx (NFR-01).
      await writeAudit(
        tx,
        actor,
        "execute_migration",
        input.target,
        null,
        input,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "execute_migration", input);
      await writeEvent(tx, version_id, [
        {
          op: "test",
          path: `/migrations/${migration_id}`,
          value: { rows_affected, type: input.type, target: input.target },
        },
      ]);

      return { migration_id, rows_affected, version_id };
    });
  } finally {
    await session.close();
  }
}

// Silence the unused-import lint on `jsonpatch` — kept available for
// future variants that need an explicit diff (e.g. a "patch_attribute"
// shape that surfaces the before/after JSON patch in the event row).
void jsonpatch;
// Silence unused-import on ValidationError — re-exported through
// ERROR_CODE_THROWERS but tools may flag the symbol if not referenced.
void ValidationError;
