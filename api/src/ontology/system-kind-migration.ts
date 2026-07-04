// system-augmentation-model T-04 — `runSystemKindMigration` (FR-06, FR-07;
// design §4.3, DD-05/DD-06/DD-11/DD-12/DD-14).
//
// Idempotent, event-quiet on re-run: an already-tightened registry doc
// short-circuits step 3 entirely — zero audit/version/`_OntologyEvent`
// rows and zero data mutations on a second run (requirements-review N-01).
//
// DOWNSTREAM WARNING (DD-14): `patchNodeLabel` SETs `json_schema_doc`
// **wholesale** (api/src/ontology/storage/node-labels.ts ~360). Passing a
// canned doc verbatim would silently clobber any properties/required
// entries an operator or a later spec added to the System doc. This module
// therefore READ-MERGE-WRITES: it splices the systemKind bits into the doc
// it just read. Imitators of this path must do the same.
//
// ROLLBACK (DD-11): forward-only. To loosen, re-patch the System doc
// permissive via `PATCH /api/v1/ontology/node-labels/System`; backfilled
// `"functional"` values remain as harmless open-map keys.
//
// NFR-03 (DD-12): the step-4 drift backfill is a SINGLE batched Cypher
// statement — no per-node round trips. The "<5 s for 10k Systems" figure
// is aspirational and deliberately untested (a wall-clock assertion on
// CI-shared Neo4j would flake).

import type { Driver } from "neo4j-driver";
import {
  SYSTEM_KINDS,
  DEFAULT_SYSTEM_KIND,
} from "@companygraph/shared/schema/system-kind";
import { generateId } from "../ids";
import { ontologyEvents } from "./events";
import { patchNodeLabel } from "./storage/node-labels";

export interface SystemKindMigrationResult {
  registryPatched: boolean; // did we tighten the doc this run?
  backfilledCount: number; // Systems that received systemKind:"functional"
  invalidValueCount: number; // reported, never rewritten (Risk 5)
}

interface JsonSchemaDoc {
  type?: unknown;
  additionalProperties?: unknown;
  required?: string[];
  properties?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

function toN(v: unknown): number {
  if (typeof v === "number") return v;
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

// Step-2 predicate: the doc counts as tightened when the systemKind enum
// deep-equals SYSTEM_KINDS (order included), `required` includes
// "systemKind", and there is NO `default` keyword under
// `properties.systemKind` (Risk 2).
function isTightened(doc: JsonSchemaDoc | null): boolean {
  if (!doc) return false;
  const prop = doc.properties?.systemKind;
  if (!prop) return false;
  const enumVal = prop.enum;
  if (
    !Array.isArray(enumVal) ||
    enumVal.length !== SYSTEM_KINDS.length ||
    !enumVal.every((v, i) => v === SYSTEM_KINDS[i])
  ) {
    return false;
  }
  if (!(doc.required ?? []).includes("systemKind")) return false;
  if ("default" in prop) return false;
  return true;
}

export async function runSystemKindMigration(
  driver: Driver,
): Promise<SystemKindMigrationResult> {
  // ── Step 1: read the System row's json_schema_doc (same Cypher as the
  //    attribute-zod cache loader). Missing row → throw: bootstrap
  //    ordering guarantees the seed ran first; a missing row is a fault.
  const readSession = driver.session({ defaultAccessMode: "READ" });
  let currentDoc: JsonSchemaDoc;
  try {
    const r = await readSession.run(
      `MATCH (l:_OntologyNodeLabel {name: $name})<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
       RETURN s.json_schema_doc AS jsd`,
      { name: "System" },
    );
    if (r.records.length === 0) {
      throw new Error(
        "[system-kind-migration] no _OntologyAttributeSchema row for label 'System' — the registry seed must run before this migration",
      );
    }
    const jsdRaw = r.records[0]!.get("jsd") as string | null;
    currentDoc = jsdRaw != null ? (JSON.parse(jsdRaw) as JsonSchemaDoc) : {};
  } finally {
    await readSession.close();
  }

  // ── Step 2: doc-tightened check. Already tightened → skip step 3
  //    entirely (zero audit/version/event rows on re-run).
  let registryPatched = false;
  if (!isTightened(currentDoc)) {
    // ── Step 3: tighten via the sanctioned path — READ-MERGE-WRITE
    //    (DD-14). Splice the systemKind bits into the doc read in step 1;
    //    all other keys pass through. `properties.systemKind` is replaced
    //    wholesale, which drops any pre-existing `default` under it.
    const mergedDoc: JsonSchemaDoc = {
      ...currentDoc,
      properties: {
        ...currentDoc.properties,
        systemKind: { type: "string", enum: [...SYSTEM_KINDS] },
      },
      required: [...new Set([...(currentDoc.required ?? []), "systemKind"])],
    };
    // One tx: registry rewrite + APOC backfill of missing-key Systems +
    // audit/version/_OntologyEvent rows.
    const row = await patchNodeLabel(
      driver,
      "System",
      { json_schema_doc: mergedDoc },
      "system:migration:system-kind",
      { forceBackfill: true, backfillValue: DEFAULT_SYSTEM_KIND },
    );
    registryPatched = true;
    // Post-commit event with the real diff — the exact shape the route
    // handler emits (routes/ontology-node-labels.ts:121-126) — so the
    // attribute-zod cache clears and SSE subscribers observe the change.
    ontologyEvents.emit("ontology.changed", {
      event_id: generateId(),
      version_id: generateId(),
      ts: new Date().toISOString(),
      diff: [{ op: "replace", path: "/nodeLabels/System", value: row }],
    });
  }

  // ── Step 4: drift backfill (ALWAYS runs — Risk-3 backstop for Systems
  //    written by non-standard paths after the doc was tightened). One
  //    batched statement (NFR-03: no per-node round trips); data-only
  //    repair — NO ontology event rows (the ontology did not change).
  const session = driver.session();
  let backfilledCount = 0;
  try {
    const r = await session.run(
      `MATCH (n:System)
       WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs
       WHERE attrs.systemKind IS NULL
       SET n.attributes_json = apoc.convert.toJson(apoc.map.setKey(attrs, "systemKind", $dflt)),
           n.updatedAt = $now
       RETURN count(n) AS c`,
      { dflt: DEFAULT_SYSTEM_KIND, now: new Date().toISOString() },
    );
    backfilledCount = toN(r.records[0]?.get("c"));
    if (backfilledCount > 0) {
      console.log(
        `[system-kind-migration] drift backfill wrote systemKind:"${DEFAULT_SYSTEM_KIND}" to ${backfilledCount} System node(s)`,
      );
    }
  } finally {
    await session.close();
  }

  // ── Step 5: invalid-value report (Risk 5 — report, don't rewrite).
  //    Hand repair via PATCH /api/v1/nodes/System/:id.
  const reportSession = driver.session({ defaultAccessMode: "READ" });
  let invalidValueCount = 0;
  try {
    const r = await reportSession.run(
      `MATCH (n:System)
       WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs
       WHERE attrs.systemKind IS NOT NULL AND NOT attrs.systemKind IN $kinds
       RETURN count(n) AS c, collect(n.id)[..10] AS sample_ids`,
      { kinds: [...SYSTEM_KINDS] },
    );
    invalidValueCount = toN(r.records[0]?.get("c"));
    if (invalidValueCount > 0) {
      const sampleIds =
        (r.records[0]?.get("sample_ids") as ReadonlyArray<string> | undefined) ?? [];
      console.warn(
        `[system-kind-migration] ${invalidValueCount} System node(s) carry a non-enum systemKind — NOT rewritten (Risk 5); repair via PATCH /api/v1/nodes/System/:id. Sample ids: ${sampleIds.join(", ")}`,
      );
    }
  } finally {
    await reportSession.close();
  }

  return { registryPatched, backfilledCount, invalidValueCount };
}
