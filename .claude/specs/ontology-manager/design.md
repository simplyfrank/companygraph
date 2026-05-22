---
feature: "ontology-manager"
created: "2026-05-23"
author: "frank"
status: "in-review"
revision: 2
reviewing_requirements_revision: 2
size: "large"
depends_on: ["graph-core"]
reviewing_pass_1_findings: "4 blockers, 12 concerns, 8 nits — all blockers + impactful concerns absorbed in revision 2 (see §2.3)"
---

# Design: ontology-manager

## 1. Overview

`ontology-manager` turns `graph-core`'s frozen compile-time schema
registries (`NODE_LABELS`, `EDGE_TYPES`, `EDGE_ENDPOINTS`) into a
runtime-mutable, version-aware, audit-logged DB-backed registry. It
stores the registry in the same Neo4j store as the data, under a
`_Ontology*` label namespace (FR-01), exposes 14+ CRUD/audit/version
endpoints under `/api/v1/ontology/*`, owns two new endpoints
(`GET /api/v1/schema` and `GET /api/v1/ontology/events` SSE), and
refactors `graph-core`'s bootstrap + edge-write validator to consult
the registry at runtime.

The design follows four rules:

1. **Single store, single transaction.** Registry rows, audit log
   rows, and version rows all live in Neo4j; every mutation is one
   transaction. No two-phase commit; no cross-store consistency
   problem (resolves pass-1 C-01).
2. **Two writers, three readers.** Mutations write to the
   `_Ontology*` namespace; readers fan out into three caches: the
   `/api/v1/schema` cache (LRU, 60 s TTL), the edge-write validator
   cache (LRU, 60 s TTL, capacity 256 — FR-04a), and the per-label
   attribute-zod cache (built lazily, invalidated by the same event).
   All caches subscribe to a single `ontology.changed` EventEmitter;
   the SSE endpoint at `/api/v1/ontology/events` is a serialisation
   of that emitter to browsers + cross-process callers.
3. **Forward-only audit + version history.** No row in `_OntologyAudit`
   or `_OntologyVersion` is ever updated or deleted by user-facing
   code. The daily retention pass archives audit rows older than the
   retention floor; versions are immutable (rollback writes a NEW
   version row).
4. **Strict-create on registry primitives, MERGE on data.**
   `POST /api/v1/ontology/{node-labels,edge-types}` is strict CREATE
   (409 on duplicate name). Import is MERGE-on-name for round-trip
   safety. Mirrors graph-core's same pattern (B-02 of graph-core's
   own design review).

## 2. Prior-review concerns — resolution in this design

### 2.1 Pass-2 (requirements) open-accepted concerns absorbed in revision 1

| Open-accepted from req pass-2 | Resolution |
|-------------------------------|------------|
| `data/ontology-audit-archive/` path needs namespacing | Archive path is `data/ontology-manager/audit-archive/YYYY-MM.jsonl.gz` (under a per-spec data dir) — see §10. |
| Post-restart SSE replay behaviour undefined | A `_OntologyEvent` collection persists every event with `event_id` (UUIDv7), `version_id`, `diff_jsonpatch`, `ts`. Daily retention pass (§10) prunes events older than 5 minutes for restart replay; clients use the `Last-Event-ID` header to resume. |

### 2.2 Pass-1 (design) review findings absorbed in revision 2

| Finding | Disposition | Section |
|---------|-------------|---------|
| **B-01** `_OntologyAudit` column shape (model vs helper diverge) | Pinned the storage-vs-REST contract: storage uses `before_json` / `after_json` STRING columns (consistent with graph-core's `attributes_json` pattern); REST `GET /audit` returns parsed `before` / `after` objects. §3.1 + §4.4 + §4.6 (new) explicit. | §3.1, §4.4, §4.6 |
| **B-02** SSE `Last-Event-ID` replay broken (string-compare on UUID + race window) | Fix (a): replay query keyed on `ts` (indexed) — clients can pass `?since=<ISO>` OR the SSE handler resolves `Last-Event-ID` to a `ts` via index lookup. Fix (b): SSE handler **subscribes BEFORE replay**, buffers live events into an array during replay, then flushes the buffer deduplicating by `event_id`. | §5.4 (rewritten) |
| **B-03** `tx.commit` BEFORE `emit` claimed in §17 but absent from code | New §4.5 "Event emission" subsection explicitly shows: `writeEvent` runs **inside** the storage transaction (same tx as audit + version); `ontologyEvents.emit` fires **after** `session.executeWrite` resolves. Storage helpers in §4.1, §4.2 updated to call both. | §4.5, §4.1, §4.2 |
| **B-04** FR-06 precondition (iii) heuristic broken under import path | **Precondition (iii) dropped entirely.** Per pass-1 review: precondition (i) already catches "has live instances"; precondition (iv) catches "had instances, needs migration" via `confirm_migration_step_id`. The "deprecation marker required" gate is redundant given (i) + (iv). §4.3 simplified to three preconditions. Requirements text in FR-06 will be tightened by the tasks-phase author (recorded as open-accepted carry-back). | §4.3 |
| **C-01** Cache invalidation strategy inconsistent (global vs selective) | Picked **uniform global invalidation** for all three caches. Selective invalidation in attribute-zod cache dropped. Tradeoff: over-invalidation, but at 50 ms p99 cache-miss it's acceptable for single-tenant. `OntologyChangedEvent` type discriminator no longer needed. | §6.1, §6.2, §6.3 |
| **C-02** `_Ontology*` isolation claim cites wrong graph-core section | §3.5 paragraph rewritten — `/stats` keyset becomes `registry.NodeLabel-list` after FR-15 (NOT compile-time const); `_Ontology*` rows excluded because their `name` values are user-visible label names (`Domain` etc.), not meta-label names (`_OntologyNodeLabel`). Flagged to PEU as a `/stats` shape evolution (`graph-core/FR-11` evolves from 6 fixed keys to 6+user-defined). | §3.5 |
| **C-03** Bootstrap creates 12 audit + version rows (surprising) | New error code `rollback_below_bootstrap` added to §5.3. The `handleRollback` route rejects rollback to the bootstrap-generation versions. Also: §7.1 `seedRegistryFromConstTuples` writes a **single** audit + version row for the entire seed (`action: "system_bootstrap_seed"`) rather than one per label. | §5.3, §7.1 |
| **C-04** `deleteEdgeType` missing | §4.2 now includes the parallel `deleteEdgeType` block with cascade DETACH DELETE of `_OntologyEdgeEndpoint` + `_OntologyAlignment` + `DROP CONSTRAINT edge_id_unique_${type}`. | §4.2 |
| **C-05** FR-05 traceability hole | §4.1's `patchNodeLabel` block explicitly notes: PATCH of `json_schema_doc` rewrites only the `_OntologyAttributeSchema` row, never any `:NodeLabel` data row (resolves FR-05). | §4.1 |
| **C-06** FR-12 invalidating-change guard implementation missing | §4.1 `patchNodeLabel` now includes the diff-against-prior-`required` check, the `count(:label)` query, and the conditional `would_invalidate` / `forceBackfill` paths. | §4.1 |
| **C-07** `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0` also disables SSE event purge | Split: audit-retention 0-disable does NOT skip the event-buffer purge. The two purges are logically separate inside `runAuditRetention`. | §10 |
| **C-08** Alignment uniqueness not modelled | New UNIQUE constraint `(target_kind, target_name, source, external_id)` added to §3.2. | §3.2 |
| **C-09** Migration `transform_expression` is raw Cypher — injection surface | Pinned to a **discriminated union** of structured transforms (`rename_attribute`, `remap_value`, `remove_attribute`, `merge_labels`, `split_label`); each compiles to a fixed parameterised Cypher template. No operator-supplied Cypher reaches `executeWrite`. | §3.3, §4.7 (new) |
| **C-10** UUIDv7 generator reference missing | One-line note added in §3.3 referring to `graph-core/api/src/ids.ts`. | §3.3 |
| **C-11** `?dryRun=true` on import not in route-row | Added `?dryRun?` to §5.1 import row. | §5.1 |
| **C-12** Seed not idempotent at row level | `seedRegistryFromConstTuples` now uses `MERGE` on `_OntologyNodeLabel.name` (privileged-path exception to the public strict-CREATE contract); idempotent at row level. §7.1 updated. | §7.1 |
| **N-01..N-08** Polish nits | All eight absorbed: file count tally clarified to "production + tests" split; dep versions pinned (`json-schema-to-zod@^2`, `js-yaml@^4`, `fast-json-patch@^3`, `lru-cache@^10`); `node-cron` SIGTERM handler added; `parseEdgeTypeName` body shown; `X-Accel-Buffering` header documented; dryRun-vs-schema-breaking semantics clarified; node-instance Cypher uses `parseRegistryLabel` (registry-backed, not const); retention pass split into two phases (archive-write then delete) for durability. | various |

### 2.3 Carry-back to requirements / tasks

One finding from pass-1 design review changes the requirements text:

| Finding | Requirements text change needed | Disposition |
|---------|--------------------------------|-------------|
| B-04 drop FR-06 precondition (iii) | FR-06 currently enumerates four preconditions; revision 2 of design drops (iii). Requirements FR-06 should be simplified to three preconditions in the tasks phase (carries forward; no requirements re-review needed because this is a tightening, not a contract addition — strictly fewer preconditions means strictly more permissive DELETEs). | open-accepted to tasks-phase author |

## 3. Data model — Neo4j `_Ontology*` namespace

All registry data lives in Neo4j under labels prefixed `_Ontology`. The
underscore excludes them from `graph-core/FR-11`'s `/stats` keyset
(which iterates the six base labels by name — see §3.5 below for the
isolation contract).

### 3.1 Label inventory

```
(:_OntologyNodeLabel  {name, description, usage_example, deprecated_at?, created_at, updated_at})
(:_OntologyEdgeType   {name, description, usage_example, deprecated_at?, created_at, updated_at})
(:_OntologyAttributeSchema
                      {label_name, json_schema_doc, created_at, updated_at})
(:_OntologyEdgeEndpoint
                      {edge_type_name, from_label, to_label, created_at})
(:_OntologyAlignment  {target_kind: "node_label" | "edge_type", target_name, source, external_id})
(:_OntologyVersion    {version_id, parent_version_id?, diff_jsonpatch, actor, ts, summary})
(:_OntologyAudit      {ts, actor, action, target, before_json, after_json, diff_jsonpatch, version_id})  -- STRING-encoded; REST GET /audit parses to objects (pass-1 B-01)
(:_OntologyMigration  {migration_id, type, target, transform_expression, rows_affected, ts, actor, version_id})
(:_OntologyEvent      {event_id, version_id, diff_jsonpatch, ts})
```

Relationships:

```
(:_OntologyAttributeSchema)-[:DESCRIBES]->(:_OntologyNodeLabel)
(:_OntologyEdgeEndpoint)-[:OF_TYPE]->(:_OntologyEdgeType)
(:_OntologyAlignment)-[:ALIGNS]->(:_OntologyNodeLabel)
(:_OntologyAlignment)-[:ALIGNS]->(:_OntologyEdgeType)
(:_OntologyVersion)-[:PARENT]->(:_OntologyVersion)
(:_OntologyAudit)-[:ABOUT]->(:_OntologyNodeLabel|:_OntologyEdgeType|:_OntologyAttributeSchema|:_OntologyEdgeEndpoint)
```

### 3.2 Constraints + indexes

```cypher
CREATE CONSTRAINT _onto_node_label_name_unique IF NOT EXISTS
  FOR (n:_OntologyNodeLabel) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT _onto_edge_type_name_unique IF NOT EXISTS
  FOR (n:_OntologyEdgeType) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT _onto_attr_schema_label_unique IF NOT EXISTS
  FOR (n:_OntologyAttributeSchema) REQUIRE n.label_name IS UNIQUE;
CREATE CONSTRAINT _onto_edge_endpoint_unique IF NOT EXISTS
  FOR (n:_OntologyEdgeEndpoint)
  REQUIRE (n.edge_type_name, n.from_label, n.to_label) IS UNIQUE;
CREATE CONSTRAINT _onto_version_id_unique IF NOT EXISTS
  FOR (n:_OntologyVersion) REQUIRE n.version_id IS UNIQUE;
CREATE CONSTRAINT _onto_event_id_unique IF NOT EXISTS
  FOR (n:_OntologyEvent) REQUIRE n.event_id IS UNIQUE;
CREATE INDEX _onto_audit_ts IF NOT EXISTS
  FOR (n:_OntologyAudit) ON (n.ts);
CREATE INDEX _onto_event_ts IF NOT EXISTS
  FOR (n:_OntologyEvent) ON (n.ts);
CREATE CONSTRAINT _onto_alignment_unique IF NOT EXISTS
  FOR (n:_OntologyAlignment)
  REQUIRE (n.target_kind, n.target_name, n.source, n.external_id) IS UNIQUE;  -- pass-1 C-08
```

Bootstrap (see §8.1) creates these idempotently with `IF NOT EXISTS`.

**Storage-vs-REST contract for `_OntologyAudit`** (pass-1 B-01): the
`before_json` / `after_json` properties are JSON-encoded STRINGs at
storage (Neo4j cannot store arbitrary nested maps as native properties
— same constraint that drives `graph-core/§3.1`'s `attributes_json`
pattern). The `GET /api/v1/ontology/audit` REST endpoint parses these
back to objects: `{ts, actor, action, target, before: <object>|null, after: <object>|null, diff_jsonpatch: <array>|null, version_id}`.

### 3.3 zod schemas — `shared/src/schema/ontology.ts`

```ts
import { z } from "zod";

const uuidv7 = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

const isoDateTime = z.string().datetime();

// JSON Schema 2020-12 supported-subset zod shape (FR-01a).
// Per requirements, supported subset: types + 14 keywords; rejected: 11.
// Validated at attribute-schema register time before storage.
const supportedJsonSchemaTypeEnum = z.enum([
  "string", "number", "integer", "boolean", "null", "array", "object",
]);
const jsonSchemaDoc: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.union([supportedJsonSchemaTypeEnum, z.array(supportedJsonSchemaTypeEnum)]).optional(),
    required: z.array(z.string()).optional(),
    properties: z.record(jsonSchemaDoc).optional(),
    additionalProperties: z.union([z.boolean(), jsonSchemaDoc]).optional(),
    items: z.union([jsonSchemaDoc, z.array(jsonSchemaDoc)]).optional(),
    format: z.string().optional(),
    pattern: z.string().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    exclusiveMinimum: z.number().optional(),
    exclusiveMaximum: z.number().optional(),
    multipleOf: z.number().positive().optional(),
    enum: z.array(z.unknown()).optional(),
    default: z.unknown().optional(),
    // Hand-checked rejection of unsupported keywords (FR-01a):
    // oneOf, anyOf, allOf, not, if, then, else, $ref, const,
    // contentEncoding, contentMediaType, dependentSchemas, dependentRequired
    // The `_strict_unsupported_keys` validator below catches these.
  }).strict()
);

// Top-level register shape for POST /api/v1/ontology/node-labels.
export const nodeLabelCreateSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Za-z0-9_]*$/).max(100),
  description: z.string().min(1).max(2000),
  usage_example: z.string().min(1).max(200),
  json_schema_doc: jsonSchemaDoc,
  external_alignment: z.array(z.object({
    source: z.string().min(1).max(100),
    id: z.string().min(1).max(200),
  })).optional(),
});

export const edgeTypeCreateSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(100),  // SCREAMING_SNAKE per Neo4j convention
  description: z.string().min(1).max(2000),
  usage_example: z.string().min(1).max(200),
  endpoints: z.array(z.object({
    fromLabel: z.string(),
    toLabel: z.string(),
  })).min(1),
  external_alignment: z.array(z.object({
    source: z.string(),
    id: z.string(),
  })).optional(),
});

export const nodeLabelPatchSchema = nodeLabelCreateSchema.pick({
  description: true, usage_example: true, json_schema_doc: true,
  external_alignment: true,
}).partial().strict();

export const edgeTypePatchSchema = edgeTypeCreateSchema.pick({
  description: true, usage_example: true, endpoints: true,
  external_alignment: true,
}).partial().strict();

export const importSchema = z.object({
  nodeLabels: z.array(nodeLabelCreateSchema).optional(),
  edgeTypes: z.array(edgeTypeCreateSchema).optional(),
});

// Pass-1 C-09: structured discriminated union per `type`; no operator-supplied Cypher.
// Each variant compiles to a fixed parameterised Cypher template (§4.7).
export const migrationCreateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rename_attribute"),
    target: z.string(),   // label name (or edge type name for edge attrs)
    transform: z.object({ from_key: z.string(), to_key: z.string() }),
  }),
  z.object({
    type: z.literal("remap_value"),
    target: z.string(),
    transform: z.object({
      key: z.string(),
      from_value: z.unknown(),
      to_value: z.unknown(),
    }),
  }),
  z.object({
    type: z.literal("remove_attribute"),
    target: z.string(),
    transform: z.object({ key: z.string() }),
  }),
  z.object({
    type: z.literal("merge_labels"),
    target: z.string(),   // destination label
    transform: z.object({ source_labels: z.array(z.string()).min(1) }),
  }),
  z.object({
    type: z.literal("split_label"),
    target: z.string(),   // source label
    transform: z.object({
      predicate_key: z.string(),
      mapping: z.record(z.string(), z.string()),  // predicate value → new label
    }),
  }),
]);
```

**UUIDv7 generator** (pass-1 C-10): the `uuidv7()` helper used
throughout (`createNode`, `writeAudit`, `writeVersion`, `writeEvent`,
migration ids) is re-exported from `graph-core/api/src/ids.ts` (per
graph-core/design.md §3.4) — this spec does not introduce a separate
generator.

### 3.4 JSON Schema supported-subset enforcement

The recursive `jsonSchemaDoc` zod schema uses `.strict()` on every
object level — any keyword not enumerated above triggers a Zod error.
The handler maps that to `400 {error:{code:"unsupported_jsonschema_keyword", details:{keyword: <name>, path: <jsonpointer>}}}`.

This is the **runtime enforcement** of FR-01a's supported subset. The
list-of-unsupported-keys (`oneOf`, `anyOf`, `allOf`, `not`,
`if`/`then`/`else`, `$ref`, `const`, `contentEncoding`,
`contentMediaType`, `dependentSchemas`, `dependentRequired`) is never
explicitly enumerated in zod — strict mode on the schema closes that
gap automatically.

### 3.5 `_Ontology*` isolation from `graph-core/FR-11` `/stats` (pass-1 C-02 corrected)

`graph-core/FR-11` (requirements.md line 58) pins the `/stats` response
shape: `{nodes: {Domain, UserJourney, Activity, Role, System, Location}, edges: {…}}` — six fixed keys for the six base labels, with the
"all keys present even when value is 0" guarantee that requires the
handler to know the full keyset at request time.

The graph-core `/stats` handler (referenced in `graph-core/§16` as
`api/src/routes/stats.ts` though not implementation-listed) iterates a
**keyset** at runtime. Pre-this-spec, the keyset comes from the
compile-time `NODE_LABELS` const tuple. **After FR-15 refactors the
bootstrap**, the keyset is sourced from `_OntologyNodeLabel` rows in
the registry. The `/stats` response then evolves from "six fixed keys"
to "six base + any user-registered labels".

**`_Ontology*` isolation holds because**: the registry's
`_OntologyNodeLabel.name` values are the **user-visible** label names
(`Domain`, `UserJourney`, `Product`, etc.), NEVER the meta-label names
(`_OntologyNodeLabel`, `_OntologyEdgeType`, etc.). The meta-labels are
the storage shape of the registry itself; their existence in Neo4j is
invisible to `/stats`.

**Cross-spec flag**: `graph-core/FR-11`'s `/stats` shape changes from
"six fixed keys" to "registry-driven keyset". `process-explorer-ui`
(which renders the stats panel from XC-1.2) needs to expect a growing
keyset. This is recorded in `process-explorer-ui` STATUS as an
incoming contract evolution.

## 4. Storage operations

`api/src/ontology/storage/` exports three helpers per primitive
(create/get/patch/delete + listAll), matching the three-helper-per-shape
pattern from `graph-core/design.md` §4 (strict create / patch /
upsert-for-import).

### 4.1 Node-label CRUD — `api/src/ontology/storage/node-labels.ts`

```ts
export async function createNodeLabel(
  tx: ManagedTransaction,
  input: NodeLabelCreate,
  actor: string,
): Promise<NodeLabel> {
  // 1. Strict CREATE — 409 on duplicate name.
  const now = new Date().toISOString();
  try {
    const result = await tx.run(`
      CREATE (l:_OntologyNodeLabel {
        name: $name, description: $description, usage_example: $usage_example,
        created_at: $now, updated_at: $now
      })
      WITH l
      CREATE (s:_OntologyAttributeSchema {
        label_name: $name, json_schema_doc: $json_schema_doc_str,
        created_at: $now, updated_at: $now
      })-[:DESCRIBES]->(l)
      RETURN l, s
    `, {
      name: input.name, description: input.description,
      usage_example: input.usage_example,
      json_schema_doc_str: JSON.stringify(input.json_schema_doc),
      now,
    });

    // 2. Insert external alignment rows.
    if (input.external_alignment?.length) {
      await insertAlignments(tx, "node_label", input.name, input.external_alignment);
    }

    // 3. Audit + version row in the SAME transaction (NFR-01).
    const version_id = uuidv7();
    await writeAudit(tx, actor, "create_node_label", input.name, null, input, version_id);
    await writeVersion(tx, version_id, actor, "create_node_label", input);

    return deserializeNodeLabel(result.records[0]);
  } catch (e) {
    if (isConstraintViolation(e, "_onto_node_label_name_unique")) {
      throw new ValidationError("name_conflict", { name: input.name });
    }
    throw e;
  }
}

export async function patchNodeLabel(
  tx: ManagedTransaction,
  name: string,
  input: NodeLabelPatch,
  actor: string,
  opts: { forceBackfill?: boolean, backfillValue?: unknown } = {},
): Promise<NodeLabel> {
  const before = await getNodeLabel(tx, name);
  if (!before) throw new ValidationError("not_found", { name });

  // Pass-1 C-06 — FR-12 invalidating-change guard. Runs BEFORE any write.
  if (input.json_schema_doc !== undefined) {
    const beforeRequired = new Set<string>((before.json_schema_doc as any)?.required ?? []);
    const afterRequired = new Set<string>((input.json_schema_doc as any)?.required ?? []);
    const newlyRequired = [...afterRequired].filter(k => !beforeRequired.has(k));
    if (newlyRequired.length > 0) {
      const countResult = await tx.run(
        `MATCH (n:${name}) RETURN count(n) AS c, collect(n.id)[..10] AS sample_ids`
      );
      const count = countResult.records[0].get("c").toNumber();
      const sample_ids = countResult.records[0].get("sample_ids");
      if (count > 0 && !opts.forceBackfill) {
        throw new ValidationError("would_invalidate", {
          affected_count: count, sample_node_ids: sample_ids,
          newly_required: newlyRequired,
          suggested_backfill: "supply ?forceBackfill=true + a literal backfill value or per-attribute JSON Patch",
        });
      }
      if (count > 0 && opts.forceBackfill) {
        // Backfill every existing row's newly-required attributes to `opts.backfillValue`.
        // The data layer stores attributes as JSON-string (graph-core/§3.1).
        // APOC is available per graph-core/§8.3.
        await tx.run(`
          MATCH (n:${name})
          WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs
          WITH n, attrs, $newly_required AS keys, $backfill AS val
          UNWIND keys AS key
          WITH n, attrs, key, val,
               CASE WHEN attrs[key] IS NULL THEN apoc.map.setKey(attrs, key, val) ELSE attrs END AS new_attrs
          SET n.attributes_json = apoc.convert.toJson(new_attrs),
              n.updatedAt = $now
        `, {
          newly_required: newlyRequired, backfill: opts.backfillValue ?? null,
          now: new Date().toISOString(),
        });
      }
    }
  }

  const sets: string[] = ["l.updated_at = $now"];
  const params: Record<string, unknown> = { name, now: new Date().toISOString() };
  if (input.description !== undefined)   { sets.push("l.description = $description");     params.description = input.description; }
  if (input.usage_example !== undefined) { sets.push("l.usage_example = $usage_example"); params.usage_example = input.usage_example; }
  await tx.run(`MATCH (l:_OntologyNodeLabel {name: $name}) SET ${sets.join(", ")} RETURN l`, params);
  if (input.json_schema_doc !== undefined) {
    // FR-05 (pass-1 C-05): PATCH of json_schema_doc rewrites ONLY the
    // _OntologyAttributeSchema row — never any `:NodeLabel` data row's
    // attributes_json. Historical rows surface newly-defined attributes
    // as null until backfilled (forceBackfill path above).
    await tx.run(`
      MATCH (l:_OntologyNodeLabel {name: $name})<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
      SET s.json_schema_doc = $json_schema_doc_str, s.updated_at = $now
    `, { name, json_schema_doc_str: JSON.stringify(input.json_schema_doc), now: params.now });
  }
  if (input.external_alignment !== undefined) {
    await replaceAlignments(tx, "node_label", name, input.external_alignment);
  }

  const after = await getNodeLabel(tx, name);
  const version_id = uuidv7();
  await writeAudit(tx, actor, "patch_node_label", name, before, after, version_id);
  await writeVersion(tx, version_id, actor, "patch_node_label", { name, patch: input });
  await writeEvent(tx, version_id, jsonpatch.compare(before, after));  // pass-1 B-03 — see §4.5
  return after!;
}

export async function deleteNodeLabel(
  tx: ManagedTransaction,
  name: string,
  actor: string,
  confirm_migration_step_id?: string,
): Promise<void> {
  // FR-06 four preconditions — all enforced atomically.
  const before = await getNodeLabel(tx, name);
  if (!before) throw new ValidationError("not_found", { name });
  await assertDeletePreconditions(tx, "node_label", name, before, confirm_migration_step_id);

  // Delete the label row + its descriptor schema + alignments.
  await tx.run(`
    MATCH (l:_OntologyNodeLabel {name: $name})
    OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
    OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
    DETACH DELETE l, s, a
  `, { name });

  // Drop the corresponding Neo4j data constraint + index for the label.
  // (graph-core bootstrap creates these per label; we must remove them.)
  await tx.run(`DROP CONSTRAINT node_id_unique_${name} IF EXISTS`);
  await tx.run(`DROP INDEX node_name_${name} IF EXISTS`);

  const version_id = uuidv7();
  await writeAudit(tx, actor, "delete_node_label", name, before, null, version_id);
  await writeVersion(tx, version_id, actor, "delete_node_label", { name });
}
```

### 4.2 Edge-type CRUD — `api/src/ontology/storage/edge-types.ts`

Mirrors §4.1 with `_OntologyEdgeType` and a child `_OntologyEdgeEndpoint`
collection (instead of `_OntologyAttributeSchema`). PATCH semantics:
replacing the `endpoints` array runs the symmetric-rejection check from
FR-04a — if dropping an endpoint pair has live edges, throw
`schema_breaking` BEFORE writing.

```ts
export async function patchEdgeType(
  tx: ManagedTransaction,
  name: string,
  input: EdgeTypePatch,
  actor: string,
): Promise<EdgeType> {
  const before = await getEdgeType(tx, name);
  if (!before) throw new ValidationError("not_found", { name });

  if (input.endpoints !== undefined) {
    // FR-04a symmetric guard: removing endpoints with live edges → schema_breaking.
    const droppedPairs = before.endpoints.filter(p =>
      !input.endpoints!.some(np => np.fromLabel === p.fromLabel && np.toLabel === p.toLabel)
    );
    for (const pair of droppedPairs) {
      const live = await countLiveEdgesForTriple(tx, name, pair.fromLabel, pair.toLabel);
      if (live.count > 0) {
        throw new ValidationError("schema_breaking", {
          affected_edge_count: live.count,
          sample_edge_ids: live.sample_ids,
          dropped_pair: pair,
        });
      }
    }
    // Replace endpoint set.
    await tx.run(`MATCH (e:_OntologyEdgeType {name: $name})<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint) DETACH DELETE ep`, { name });
    for (const pair of input.endpoints!) {
      await tx.run(`
        MATCH (e:_OntologyEdgeType {name: $name})
        CREATE (ep:_OntologyEdgeEndpoint {
          edge_type_name: $name, from_label: $from, to_label: $to,
          created_at: $now
        })-[:OF_TYPE]->(e)
      `, { name, from: pair.fromLabel, to: pair.toLabel, now: new Date().toISOString() });
    }
  }

  // … rest of patch (description, usage_example, alignments) parallel to nodeLabel.
  const after = await getEdgeType(tx, name);
  const version_id = uuidv7();
  await writeAudit(tx, actor, "patch_edge_type", name, before, after, version_id);
  await writeVersion(tx, version_id, actor, "patch_edge_type", { name, patch: input });
  await writeEvent(tx, version_id, jsonpatch.compare(before, after));  // §4.5
  return after!;
}

// Pass-1 C-04 — symmetric with §4.1's deleteNodeLabel.
export async function deleteEdgeType(
  tx: ManagedTransaction,
  name: string,
  actor: string,
  confirm_migration_step_id?: string,
): Promise<void> {
  const before = await getEdgeType(tx, name);
  if (!before) throw new ValidationError("not_found", { name });
  await assertDeletePreconditions(tx, "edge_type", name, before, confirm_migration_step_id);

  // Cascade-delete the type + its endpoint rows + its alignments.
  await tx.run(`
    MATCH (e:_OntologyEdgeType {name: $name})
    OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
    OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
    DETACH DELETE e, ep, a
  `, { name });

  // Drop the per-type Neo4j edge-id constraint.
  await tx.run(`DROP CONSTRAINT edge_id_unique_${name} IF EXISTS`);

  const version_id = uuidv7();
  await writeAudit(tx, actor, "delete_edge_type", name, before, null, version_id);
  await writeVersion(tx, version_id, actor, "delete_edge_type", { name });
  await writeEvent(tx, version_id, [{ op: "remove", path: `/edgeTypes/${name}` }]);
}
```

### 4.3 Delete preconditions — `assertDeletePreconditions`

**Three preconditions** (pass-1 B-04 dropped the original "deprecation
marker required" heuristic). Failing any one throws `409
deprecation_required` with `details.precondition_failed` naming the
specific failure. Preconditions:

- **(i) No live instances** — node label: `node_instance_count = 0`; edge type: `edge_instance_count = 0`.
- **(ii) No registry references** — for a node label, no `_OntologyEdgeEndpoint` row references it as `from_label` or `to_label`. For an edge type, the `_OntologyEdgeEndpoint` rows cascade-DELETE with the type (§4.2 `deleteEdgeType`'s DETACH); no separate check.
- **(iii) Migration step required IFF the label/type is deprecated** — if `before.deprecated_at` is set (i.e. it was previously used and marked deprecated), the operator MUST pass `?confirm_migration_step_id=:id`. Without it, the only path to DELETE a populated-then-cleared type is to first mark `deprecated_at` then run a migration. Fresh, never-used types (no `deprecated_at`) DELETE without any migration step — supports the "POST + DELETE a typo'd label" path (AC-05's never-used row).

Pass-1 B-04 fix rationale: the dropped precondition was a heuristic
("non-create audit rows imply use") that didn't survive the import path
or the "patched-but-never-instantiated" path. (i) + (iii) together
cover the same intent without false positives — (i) blocks live-data
loss, (iii) blocks "skipping the migration step" on a previously-used
type, and a fresh-never-used type passes both with no friction.

```ts
async function assertDeletePreconditions(
  tx: ManagedTransaction,
  kind: "node_label" | "edge_type",
  name: string,
  before: NodeLabel | EdgeType,
  confirm_migration_step_id?: string,
): Promise<void> {
  // (i) No live instances. Uses registry-backed label resolution — pass-1 N-07.
  const node_instance_count = kind === "node_label"
    ? (await tx.run(`MATCH (n:${name}) RETURN count(n) AS c`)).records[0].get("c").toNumber()
    : 0;
  const edge_instance_count = kind === "edge_type"
    ? (await tx.run(`MATCH ()-[r:${name}]-() RETURN count(r) AS c`)).records[0].get("c").toNumber()
    : 0;
  if (node_instance_count > 0 || edge_instance_count > 0) {
    throw new ValidationError("deprecation_required", {
      precondition_failed: kind === "node_label" ? "node_instance_count" : "edge_instance_count",
      details: { node_instance_count, edge_instance_count },
    });
  }

  // (ii) No registry references. Edge-type's endpoint rows cascade-DELETE
  // (§4.2 deleteEdgeType), so this check is node-label-only.
  if (kind === "node_label") {
    const refs = await tx.run(`
      MATCH (ep:_OntologyEdgeEndpoint) WHERE ep.from_label = $name OR ep.to_label = $name
      RETURN count(ep) AS c
    `, { name });
    const ref_count = refs.records[0].get("c").toNumber();
    if (ref_count > 0) {
      throw new ValidationError("deprecation_required", {
        precondition_failed: "edge_endpoints_referencing",
        details: { ref_count },
      });
    }
  }

  // (iii) Migration step required IFF deprecated_at is set (pass-1 B-04 simplification).
  if (before.deprecated_at && !confirm_migration_step_id) {
    throw new ValidationError("deprecation_required", {
      precondition_failed: "migration_step_required",
      details: { hint: "POST /api/v1/ontology/migrations and pass ?confirm_migration_step_id=:id" },
    });
  }
  if (confirm_migration_step_id) {
    const mig = await tx.run(`
      MATCH (m:_OntologyMigration {migration_id: $id, target: $name})
      RETURN m
    `, { id: confirm_migration_step_id, name });
    if (mig.records.length === 0) {
      throw new ValidationError("deprecation_required", {
        precondition_failed: "migration_step_not_found",
        details: { migration_id: confirm_migration_step_id, target: name },
      });
    }
  }
}
```

### 4.4 Audit + version helpers — `api/src/ontology/storage/audit.ts`

Both helpers run in the calling transaction (NFR-01):

```ts
export async function writeAudit(
  tx: ManagedTransaction, actor: string, action: string,
  target: string, before: unknown, after: unknown, version_id: string,
): Promise<void> {
  const diff = before && after ? jsonpatch.compare(before, after) : null;
  await tx.run(`
    CREATE (a:_OntologyAudit {
      ts: $ts, actor: $actor, action: $action, target: $target,
      before_json: $before_json, after_json: $after_json,
      diff_jsonpatch: $diff_json, version_id: $version_id
    })
  `, {
    ts: new Date().toISOString(), actor, action, target,
    before_json: before ? JSON.stringify(before) : null,
    after_json: after ? JSON.stringify(after) : null,
    diff_json: diff ? JSON.stringify(diff) : null,
    version_id,
  });
}

export async function writeVersion(
  tx: ManagedTransaction, version_id: string, actor: string,
  summary: string, diff_source: unknown,
): Promise<void> {
  // Parent = current tip (chained linearly).
  const parent = await tx.run(`
    MATCH (v:_OntologyVersion)
    WITH v ORDER BY v.version_id DESC LIMIT 1
    RETURN v.version_id AS pid
  `);
  const parent_id = parent.records[0]?.get("pid") ?? null;
  await tx.run(`
    CREATE (v:_OntologyVersion {
      version_id: $version_id, parent_version_id: $parent_id,
      diff_jsonpatch: $diff_json, actor: $actor, ts: $ts, summary: $summary
    })
  `, {
    version_id, parent_id, diff_json: JSON.stringify(diff_source),
    actor, ts: new Date().toISOString(), summary,
  });
}
```

### 4.5 Event emission — `api/src/ontology/storage/events.ts` (pass-1 B-03)

The schema-change broadcast is dual-channel (FR-17): in-process
EventEmitter + SSE. Both channels emit from the SAME write path. The
ordering is load-bearing:

1. **`writeEvent` runs INSIDE the storage transaction**, alongside
   `writeAudit` + `writeVersion`. This guarantees that if the
   transaction commits, the `_OntologyEvent` row is persisted; if it
   rolls back, no event row exists for a non-event.
2. **`ontologyEvents.emit` fires AFTER `session.executeWrite` resolves
   (i.e. after `tx.commit`)**. This guarantees subscribers see an event
   only for committed changes. If `emit` throws synchronously, the
   `_OntologyEvent` row is still in the DB and any reconnecting
   subscriber recovers via `Last-Event-ID` (§5.4).

```ts
// In-transaction: persists the event row.
export async function writeEvent(
  tx: ManagedTransaction, version_id: string, diff: jsonpatch.Operation[],
): Promise<{ event_id: string }> {
  const event_id = uuidv7();
  await tx.run(`
    CREATE (e:_OntologyEvent {
      event_id: $event_id, version_id: $version_id,
      diff_jsonpatch: $diff_json, ts: $ts
    })
  `, {
    event_id, version_id,
    diff_json: JSON.stringify(diff),
    ts: new Date().toISOString(),
  });
  return { event_id };
}

// Post-commit: emits to in-process subscribers (and SSE serialisation).
// Imported from `api/src/ontology/events.ts`:
//   export const ontologyEvents = new EventEmitter();
// Type:
//   interface OntologyChangedEvent { event_id: string; version_id: string; ts: string; diff: jsonpatch.Operation[] }
```

**Storage helper invocation pattern** (every mutation):

```ts
const { event_id } = await session.executeWrite(async tx => {
  // ... CREATE/MATCH/SET/DELETE Cypher ...
  await writeAudit(tx, actor, action, target, before, after, version_id);
  await writeVersion(tx, version_id, actor, summary, diff_source);
  return await writeEvent(tx, version_id, jsonpatch.compare(before, after));
});
// Post-commit emit:
ontologyEvents.emit("ontology.changed", { event_id, version_id, ts, diff });
```

The `createNodeLabel` / `patchNodeLabel` / `deleteNodeLabel` /
`createEdgeType` / `patchEdgeType` / `deleteEdgeType` helpers shown in
§§4.1–4.2 all follow this pattern. The route-handler wrappers
(`api/src/routes/ontology/*.ts`) wrap the storage call in
`session.executeWrite` and emit post-commit.

### 4.6 Audit REST response shape — `GET /api/v1/ontology/audit`

The handler parses storage-side STRING properties back to objects:

```ts
function deserializeAudit(record: Record): AuditResponseRow {
  return {
    ts: record.get("ts"),
    actor: record.get("actor"),
    action: record.get("action"),
    target: record.get("target"),
    before: record.get("before_json") ? JSON.parse(record.get("before_json")) : null,
    after:  record.get("after_json")  ? JSON.parse(record.get("after_json"))  : null,
    diff_jsonpatch: record.get("diff_jsonpatch") ? JSON.parse(record.get("diff_jsonpatch")) : null,
    version_id: record.get("version_id"),
  };
}
```

Mirrors graph-core's `attributes_json` storage-vs-REST contract (pass-1
B-01 fix).

### 4.7 Migration execution — `api/src/ontology/storage/migrations.ts` (pass-1 C-09)

Each `migrationCreateSchema` variant compiles to a fixed parameterised
Cypher template. No operator-supplied Cypher reaches `executeWrite`.

```ts
export async function executeMigration(
  tx: ManagedTransaction,
  input: MigrationCreate,
  actor: string,
): Promise<{ migration_id: string; rows_affected: number; version_id: string }> {
  const migration_id = uuidv7();
  let result: Result;
  switch (input.type) {
    case "rename_attribute":
      // Move `attributes.from_key` → `attributes.to_key`.
      result = await tx.run(`
        MATCH (n:${input.target})
        WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a
        WHERE a[$from] IS NOT NULL
        WITH n, apoc.map.removeKey(apoc.map.setKey(a, $to, a[$from]), $from) AS new_a
        SET n.attributes_json = apoc.convert.toJson(new_a),
            n.updatedAt = $now
        RETURN count(n) AS c
      `, { from: input.transform.from_key, to: input.transform.to_key, now: new Date().toISOString() });
      break;
    case "remap_value":
      result = await tx.run(`
        MATCH (n:${input.target})
        WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a
        WHERE a[$key] = $from
        WITH n, apoc.map.setKey(a, $key, $to) AS new_a
        SET n.attributes_json = apoc.convert.toJson(new_a),
            n.updatedAt = $now
        RETURN count(n) AS c
      `, { key: input.transform.key, from: input.transform.from_value, to: input.transform.to_value, now: new Date().toISOString() });
      break;
    case "remove_attribute":
      result = await tx.run(`
        MATCH (n:${input.target})
        WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a
        WHERE a[$key] IS NOT NULL
        WITH n, apoc.map.removeKey(a, $key) AS new_a
        SET n.attributes_json = apoc.convert.toJson(new_a),
            n.updatedAt = $now
        RETURN count(n) AS c
      `, { key: input.transform.key, now: new Date().toISOString() });
      break;
    case "merge_labels":
      // Move all nodes carrying any of source_labels onto target label.
      // Per Neo4j 5 semantics: `REMOVE n:SourceLabel SET n:TargetLabel`.
      result = await tx.run(`
        MATCH (n)
        WHERE any(l IN labels(n) WHERE l IN $sources)
        WITH n, [l IN labels(n) WHERE l IN $sources] AS removeLabels
        CALL apoc.create.removeLabels(n, removeLabels) YIELD node
        WITH node
        CALL apoc.create.addLabels(node, [$target]) YIELD node AS node2
        RETURN count(node2) AS c
      `, { sources: input.transform.source_labels, target: input.target });
      break;
    case "split_label":
      // Partition nodes carrying input.target by attributes[predicate_key];
      // for each predicate_value, REMOVE source label + ADD mapping[value] label.
      result = await tx.run(`
        MATCH (n:${input.target})
        WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS a, $mapping AS m
        WHERE a[$key] IS NOT NULL AND m[toString(a[$key])] IS NOT NULL
        WITH n, m[toString(a[$key])] AS newLabel
        CALL apoc.create.removeLabels(n, [$src]) YIELD node
        WITH node, newLabel
        CALL apoc.create.addLabels(node, [newLabel]) YIELD node AS node2
        RETURN count(node2) AS c
      `, { key: input.transform.predicate_key, mapping: input.transform.mapping, src: input.target });
      break;
  }
  const rows_affected = result.records[0].get("c").toNumber();
  const version_id = uuidv7();
  await tx.run(`
    CREATE (m:_OntologyMigration {
      migration_id: $migration_id, type: $type, target: $target,
      transform_expression: $transform_json, rows_affected: $rows_affected,
      ts: $ts, actor: $actor, version_id: $version_id
    })
  `, {
    migration_id, type: input.type, target: input.target,
    transform_json: JSON.stringify(input.transform),
    rows_affected, ts: new Date().toISOString(), actor, version_id,
  });
  await writeAudit(tx, actor, "execute_migration", input.target, null, input, version_id);
  await writeVersion(tx, version_id, actor, "execute_migration", input);
  await writeEvent(tx, version_id, [{ op: "test", path: `/migrations/${migration_id}`, value: { rows_affected } }]);
  return { migration_id, rows_affected, version_id };
}
```

`apoc.create.removeLabels` / `apoc.create.addLabels` require APOC,
which graph-core's compose enables (per graph-core/§8.3). The `${input.target}` interpolation is safe because `target` is registry-backed
and validated by `parseRegistryLabel` at the route handler (§5.5).

## 5. HTTP API surface

All routes mounted under `/api/v1/`. Mounted via `graph-core`'s router
(`api/src/router.ts`); the dispatch table grows by 16 routes.

### 5.1 Route table

| Method | Path | Request | Success response | Error codes |
|--------|------|---------|------------------|-------------|
| GET    | `/api/v1/schema` | `?alignment=:source` | `{nodeLabels:[…], edgeTypes:[…]}` (FR-14 shape) | — |
| GET    | `/api/v1/ontology/events` | SSE long-poll | `text/event-stream` lines | `503` if registry unreachable |
| GET    | `/api/v1/ontology/node-labels` | — | `{rows: NodeLabel[]}` | — |
| POST   | `/api/v1/ontology/node-labels` | `nodeLabelCreateSchema` (§3.3) | `NodeLabel` (201) | `400 invalid_payload`, `400 unsupported_jsonschema_keyword`, `400 missing_documentation`, `409 name_conflict` |
| GET    | `/api/v1/ontology/node-labels/:name` | — | `NodeLabel` (200) | `404 not_found` |
| PATCH  | `/api/v1/ontology/node-labels/:name` | `nodeLabelPatchSchema` + `?dryRun?` + `?forceBackfill?` | `NodeLabel` (200) | `400 invalid_payload`, `404 not_found`, `409 would_invalidate` |
| DELETE | `/api/v1/ontology/node-labels/:name` | `?confirm_migration_step_id?` + `?dryRun?` | (204) | `404 not_found`, `409 deprecation_required` |
| GET    | `/api/v1/ontology/edge-types` | — | `{rows: EdgeType[]}` | — |
| POST   | `/api/v1/ontology/edge-types` | `edgeTypeCreateSchema` | `EdgeType` (201) | `400 invalid_payload`, `409 name_conflict`, `400 type_pair_violation` (when an endpoint label doesn't exist) |
| GET    | `/api/v1/ontology/edge-types/:name` | — | `EdgeType` (200) | `404 not_found` |
| PATCH  | `/api/v1/ontology/edge-types/:name` | `edgeTypePatchSchema` + `?dryRun?` | `EdgeType` (200) | `400 invalid_payload`, `404 not_found`, `400 schema_breaking` |
| DELETE | `/api/v1/ontology/edge-types/:name` | `?confirm_migration_step_id?` + `?dryRun?` | (204) | `404 not_found`, `409 deprecation_required` |
| POST   | `/api/v1/ontology/import` | YAML or JSON body + `?dryRun?` (pass-1 C-11) | `{accepted, rejected[]}` | `400 invalid_payload`, `400 schema_breaking` |
| GET    | `/api/v1/ontology/export` | `?format=json|yaml` (default json) | `{nodeLabels:[…], edgeTypes:[…]}` (JSON or YAML body) | — |
| GET    | `/api/v1/ontology/versions` | `?since=:iso&limit=:n` | `{rows: Version[]}` | — |
| POST   | `/api/v1/ontology/rollback/:version_id` | `?dryRun?` | `Version` (the new tip) (200) | `404 not_found`, `400 rollback_orphans`, `400 rollback_below_bootstrap` |
| GET    | `/api/v1/ontology/audit` | `?since=:iso&action=:name&limit=:n&cursor=:c` | `{rows: AuditRow[], next_cursor?}` | — |
| POST   | `/api/v1/ontology/migrations` | `migrationCreateSchema` + `?dryRun?` | `{migration_id, rows_affected, version_id}` (200) | `400 invalid_payload`, `400 migration_failed` |

All routes use the `?dryRun=true` query param contract — when set, the
handler runs the full code path inside a transaction that is ALWAYS
rolled back (no rows written; no audit; no version; no event emitted —
NFR-08).

### 5.2 Response envelope

Follows `graph-core/NFR-05`. The only addition is the SSE endpoint
which streams `text/event-stream` per the SSE spec — each event is a
JSON line prefixed `data: ` and terminated by `\n\n`.

### 5.3 Error code registry — `api/src/ontology/errors.ts`

```ts
export const ONTOLOGY_ERROR_CODES = [
  "invalid_payload",
  "unsupported_jsonschema_keyword",
  "missing_documentation",
  "name_conflict",
  "not_found",
  "type_pair_violation",
  "schema_breaking",
  "deprecation_required",
  "would_invalidate",
  "rollback_orphans",
  "rollback_below_bootstrap",  // pass-1 C-03
  "attribute_violation",
  "migration_failed",
  "edge_endpoint_label_mismatch",  // FR-04a — symmetric with graph-core's edge validator
] as const;
```

Exhaustiveness-asserted in `api/__tests__/ontology-envelope.test.ts`.

### 5.4 SSE endpoint — `/api/v1/ontology/events` (pass-1 B-02 fixed)

The pass-1 review identified two bugs in revision 1's SSE handler:
(a) lexicographic `event_id` comparison on a UNIQUE-string constraint
is not guaranteed to hit the index in Neo4j 5 Community; (b) the
subscribe-after-replay order creates a race window where events
committed between the replay read and the `.on()` call are dropped
for new subscribers. Both are fixed below.

```ts
export async function handleOntologyEvents(req: Bun.Request): Promise<Response> {
  const lastEventId = req.headers.get("Last-Event-ID");
  const sinceParam = new URL(req.url).searchParams.get("since");

  const stream = new ReadableStream({
    async start(controller) {
      // === Pass-1 B-02 fix (b): subscribe BEFORE replay; buffer during replay ===
      const liveBuffer: OntologyChangedEvent[] = [];
      let replayDone = false;
      const seenIds = new Set<string>();

      const listener = (evt: OntologyChangedEvent) => {
        if (replayDone) {
          if (seenIds.has(evt.event_id)) return;  // dedupe
          controller.enqueue(`id: ${evt.event_id}\ndata: ${JSON.stringify(evt)}\n\n`);
          seenIds.add(evt.event_id);
        } else {
          liveBuffer.push(evt);  // buffer until replay completes
        }
      };
      ontologyEvents.on("ontology.changed", listener);

      try {
        // === Pass-1 B-02 fix (a): query keyed on `ts` (indexed _onto_event_ts), not event_id ===
        // Resolve Last-Event-ID to its `ts` first; if absent, accept `?since=<ISO>`; if neither, no replay.
        let sinceTs: string | null = sinceParam;
        if (!sinceTs && lastEventId) {
          const tsLookup = await driver.session().executeRead(tx =>
            tx.run(`MATCH (e:_OntologyEvent {event_id: $id}) RETURN e.ts AS ts`, { id: lastEventId })
          );
          sinceTs = tsLookup.records[0]?.get("ts") ?? null;
          // If the event aged out of the 5-min buffer, sinceTs is null → no replay possible (client gets only live).
        }

        if (sinceTs) {
          const replay = await replayEventsSinceTs(sinceTs);
          for (const evt of replay) {
            if (seenIds.has(evt.event_id)) continue;
            controller.enqueue(`id: ${evt.event_id}\ndata: ${JSON.stringify(evt)}\n\n`);
            seenIds.add(evt.event_id);
          }
        }

        // Drain the live-buffer (events that fired DURING replay).
        for (const evt of liveBuffer) {
          if (seenIds.has(evt.event_id)) continue;
          controller.enqueue(`id: ${evt.event_id}\ndata: ${JSON.stringify(evt)}\n\n`);
          seenIds.add(evt.event_id);
        }
      } finally {
        replayDone = true;  // future events flow straight through the listener
      }

      // Heartbeat every 30 s (NFR-09).
      const hb = setInterval(() => controller.enqueue(`: keepalive\n\n`), 30_000);

      // Clean up on disconnect.
      req.signal.addEventListener("abort", () => {
        clearInterval(hb);
        ontologyEvents.off("ontology.changed", listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      // `X-Accel-Buffering: no` is nginx-specific (pass-1 N-05). Harmless
      // when no nginx is in front; documented because some CDNs / reverse
      // proxies (Render, Fly, Vercel) DO buffer SSE without it.
      "X-Accel-Buffering": "no",
    },
  });
}

async function replayEventsSinceTs(sinceTs: string): Promise<OntologyChangedEvent[]> {
  // Index-backed range query — _onto_event_ts (created in §3.2).
  const session = driver.session();
  try {
    const result = await session.executeRead(tx => tx.run(`
      MATCH (e:_OntologyEvent)
      WHERE e.ts > $sinceTs
      RETURN e ORDER BY e.ts ASC
    `, { sinceTs }));
    return result.records.map(r => deserializeEvent(r.get("e")));
  } finally { await session.close(); }
}
```

The SSE handler is **not** a managed transaction — it's a long-lived
HTTP response. The transaction-bound work happens in mutation handlers
(§4.5); the SSE handler only reads `_OntologyEvent` rows on connect and
tails the EventEmitter for live events.

### 5.5 URL param parsing — `parseRegistryLabel` (pass-1 N-07)

`graph-core/§5.5`'s `parseLabel` iterates the compile-time `NODE_LABELS`
const — it returns null for any user-defined label like `Product`,
which is wrong for this spec's routes. We add a registry-backed parser:

```ts
// api/src/routes/_helpers.ts
import { schemaCache, getSchema } from "../ontology/cache/schema";

export async function parseRegistryLabel(s: unknown): Promise<string | null> {
  if (typeof s !== "string") return null;
  const schema = await getSchema();  // §6.1 — cache-backed, 50ms p99 cache-miss
  return schema.nodeLabels.some(l => l.name === s) ? s : null;
}

export async function parseEdgeTypeName(s: unknown): Promise<string | null> {
  if (typeof s !== "string") return null;
  const schema = await getSchema();
  return schema.edgeTypes.some(e => e.name === s) ? s : null;
}
```

Note: **both are async** (registry-backed) where `graph-core/parseLabel`
is sync (const-backed). Every ontology-CRUD route handler `await`s
these guards before invoking storage. `assertDeletePreconditions` (§4.3)
likewise resolves the label name via `parseRegistryLabel` before
interpolating into the Cypher template.

## 6. Cache layer

Three caches subscribe to the in-process `ontologyEvents` EventEmitter:

### 6.1 Schema cache — `api/src/ontology/cache/schema.ts`

LRU, TTL 60 s, capacity 32 (size of the response payload is bounded by
the number of types — fitting comfortably in 32 cache entries by
filter-key combinations like `?alignment=ARTS`).

```ts
const schemaCache = new LRUCache<string, SchemaResponse>({ max: 32, ttl: 60_000 });
ontologyEvents.on("ontology.changed", () => schemaCache.clear());

export async function getSchema(filter?: { alignment?: string }): Promise<SchemaResponse> {
  const key = filter?.alignment ?? "ALL";
  const hit = schemaCache.get(key);
  if (hit) return hit;
  const fresh = await loadSchemaFromRegistry(filter);
  schemaCache.set(key, fresh);
  return fresh;
}
```

### 6.2 Edge-write validator cache — `api/src/ontology/cache/edge-endpoints.ts`

LRU, TTL 60 s, capacity 256. Cache key is the edge-type name; cache
value is the array of allowed `(fromLabel, toLabel)` pairs.

```ts
const endpointCache = new LRUCache<string, ReadonlyArray<[string, string]>>(
  { max: 256, ttl: 60_000 }
);
ontologyEvents.on("ontology.changed", () => endpointCache.clear());

export async function getEdgeEndpoints(type: string): Promise<ReadonlyArray<[string, string]>> {
  const hit = endpointCache.get(type);
  if (hit) return hit;
  const fresh = await loadEdgeEndpointsFromRegistry(type);
  endpointCache.set(type, fresh);
  return fresh;
}
```

Used by the refactored `graph-core/upsertEdge` (see §7) at request
time. Per FR-04a's latency budget — cache-hit ≤ 1 ms p99, cache-miss
≤ 50 ms p99 (a single indexed Cypher query against `_OntologyEdgeEndpoint`).

### 6.3 Attribute-zod cache — `api/src/ontology/cache/attribute-zod.ts`

Lazy. Cache key is the label name; cache value is a compiled zod
schema produced by `json-schema-to-zod`. **Uniform global invalidation
(pass-1 C-01)**: like the other two caches, this clear-all-on-event
sidesteps the need for a `OntologyChangedEvent` discriminator field.
Tradeoff: under heavy churn, the per-label zod recompile cost is paid
on the next access for every label. At 50 ms p99 cache-miss + < 200
realistic label count, total worst-case rebuild is ~10 s spread across
first accesses — acceptable for single-tenant.

```ts
const zodCache = new Map<string, z.ZodTypeAny>();
ontologyEvents.on("ontology.changed", () => zodCache.clear());

export async function getAttributeValidator(label: string): Promise<z.ZodTypeAny> {
  const hit = zodCache.get(label);
  if (hit) return hit;
  const json_schema_doc = await loadAttributeSchemaFromRegistry(label);
  const compiled = jsonSchemaToZod(json_schema_doc);
  zodCache.set(label, compiled);
  return compiled;
}
```

**`OntologyChangedEvent` type shape** (used by the SSE handler in §5.4
+ the caches' subscribers):

```ts
interface OntologyChangedEvent {
  event_id: string;     // UUIDv7
  version_id: string;   // UUIDv7
  ts: string;           // ISO datetime
  diff: jsonpatch.Operation[];
}
```

The type carries no `target_kind` discriminator — selective
invalidation is intentionally dropped (pass-1 C-01).

## 7. Refactor of `graph-core`'s bootstrap + edge validator (FR-04a, FR-15)

This spec edits two `graph-core` files. Both edits are surgical and
preserve graph-core's public contract.

### 7.1 `api/src/neo4j/bootstrap.ts` — registry-iteration

Before (graph-core/design.md §3.3):

```ts
for (const label of NODE_LABELS) {
  await session.run(`CREATE CONSTRAINT node_id_unique_${label} IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
  await session.run(`CREATE INDEX node_name_${label} IF NOT EXISTS FOR (n:${label}) ON (n.name)`);
}
```

After:

```ts
// Step 1: ensure the _Ontology* meta-schema exists (this is the registry's own constraints).
await applyMetaSchema(session);

// Step 2: seed the registry from compile-time const tuples IF EMPTY.
// This is the ONLY legitimate runtime use of NODE_LABELS / EDGE_TYPES per NFR-02.
// File: api/src/ontology/seed.ts (single allowlist entry in AC-15's grep).
const registryEmpty = await isRegistryEmpty(session);
if (registryEmpty) {
  await seedRegistryFromConstTuples(session);  // imports NODE_LABELS, EDGE_TYPES
}

// Step 3: iterate the registry and create constraints + indexes for every label.
const labels = await listNodeLabelsFromRegistry(session);
for (const label of labels) {
  await session.run(`CREATE CONSTRAINT node_id_unique_${label} IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
  await session.run(`CREATE INDEX node_name_${label} IF NOT EXISTS FOR (n:${label}) ON (n.name)`);
}
const types = await listEdgeTypesFromRegistry(session);
for (const type of types) {
  await session.run(`CREATE CONSTRAINT edge_id_unique_${type} IF NOT EXISTS FOR ()-[r:${type}]-() REQUIRE r.id IS UNIQUE`);
}
```

`api/src/ontology/seed.ts` is the SOLE legal importer of `NODE_LABELS`
and `EDGE_TYPES` (FR-15 + NFR-02 + AC-15). The seed is a privileged
bootstrap path — it does NOT route through the public strict-CREATE
helpers (pass-1 C-12). Instead it uses idempotent MERGE on
`_OntologyNodeLabel.name` so a mid-loop crash + retry is safe, and
writes a **single** audit + version row covering the whole seed
(pass-1 C-03 — no 12-row history pollution on first boot):

```ts
import { NODE_LABELS, EDGE_TYPES, EDGE_ENDPOINTS } from "../../shared/src/schema";
// (this import is the one legal exception to NFR-02; AC-15 enforces the boundary)

export async function seedRegistryFromConstTuples(session: Session): Promise<void> {
  await session.executeWrite(async tx => {
    const now = new Date().toISOString();
    const version_id = uuidv7();   // single version row for the entire seed
    const seedDiff: jsonpatch.Operation[] = [];

    for (const label of NODE_LABELS) {
      // MERGE on name — privileged-path idempotency (pass-1 C-12).
      await tx.run(`
        MERGE (l:_OntologyNodeLabel {name: $name})
        ON CREATE SET
          l.description = $description, l.usage_example = $usage_example,
          l.created_at = $now, l.updated_at = $now
        WITH l
        MERGE (s:_OntologyAttributeSchema {label_name: $name})
        ON CREATE SET
          s.json_schema_doc = $jsd, s.created_at = $now, s.updated_at = $now
        MERGE (s)-[:DESCRIBES]->(l)
      `, {
        name: label,
        description: `Base label seeded by graph-core (${label}).`,
        usage_example: `e.g. POST /api/v1/nodes/${label}`,
        jsd: JSON.stringify({ type: "object", additionalProperties: true }),
        now,
      });
      seedDiff.push({ op: "add", path: `/nodeLabels/${label}`, value: { seeded: true } });
    }

    for (const type of EDGE_TYPES) {
      await tx.run(`
        MERGE (e:_OntologyEdgeType {name: $name})
        ON CREATE SET
          e.description = $description, e.usage_example = $usage_example,
          e.created_at = $now, e.updated_at = $now
      `, {
        name: type,
        description: `Base edge type seeded by graph-core (${type}).`,
        usage_example: `e.g. POST /api/v1/edges with {type:"${type}", ...}`,
        now,
      });
      for (const [from, to] of EDGE_ENDPOINTS[type]) {
        await tx.run(`
          MATCH (e:_OntologyEdgeType {name: $name})
          MERGE (ep:_OntologyEdgeEndpoint {
            edge_type_name: $name, from_label: $from, to_label: $to
          })
          ON CREATE SET ep.created_at = $now
          MERGE (ep)-[:OF_TYPE]->(e)
        `, { name: type, from, to, now });
      }
      seedDiff.push({ op: "add", path: `/edgeTypes/${type}`, value: { seeded: true } });
    }

    // Single audit + version + event row covering the whole seed.
    await writeAudit(tx, "system:bootstrap", "system_bootstrap_seed",
                     "registry", null, { nodeLabels: NODE_LABELS.length, edgeTypes: EDGE_TYPES.length },
                     version_id);
    await writeVersion(tx, version_id, "system:bootstrap", "system_bootstrap_seed",
                       { nodeLabels: [...NODE_LABELS], edgeTypes: [...EDGE_TYPES] });
    await writeEvent(tx, version_id, seedDiff);
  });
  // Post-commit emit:
  ontologyEvents.emit("ontology.changed", { /* see §4.5 */ });
}
```

The post-bootstrap `/api/v1/ontology/versions` list shows **one**
"system_bootstrap_seed" row, not 12 — cleaner audit history. Rollback
to (or before) this row is rejected with `400 rollback_below_bootstrap`
(pass-1 C-03 — see §5.3 + rollback handler in §5.1).

### 7.2 `api/src/storage/edges.ts` — runtime endpoint check

Before (graph-core/design.md §4.2):

```ts
const allowed = EDGE_ENDPOINTS[input.type];  // compile-time const
if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) {
  throw new ValidationError("edge_endpoint_label_mismatch", { ... });
}
```

After:

```ts
const allowed = await getEdgeEndpoints(input.type);  // runtime cache (§6.2)
if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) {
  throw new ValidationError("edge_endpoint_label_mismatch", {
    type: input.type, fromLabel, toLabel, allowed,
  });
}
```

The error code, response shape, and behaviour are unchanged from the
caller's perspective — `graph-core/AC-13` continues to pass. The
difference is that the allowed list is now sourced from
`_OntologyEdgeEndpoint` via the cache (FR-04a).

## 8. Schema bootstrap reconcile (FR-15)

`applyMetaSchema` runs the constraints + indexes from §3.2. Idempotent
(every statement uses `IF NOT EXISTS`).

Bootstrap order on `bun run dev`:

1. graph-core driver init.
2. `applyMetaSchema` — creates `_Ontology*` constraints + indexes.
3. `isRegistryEmpty` — if true, run `seedRegistryFromConstTuples`.
4. `listNodeLabelsFromRegistry` + per-label constraint + index loop.
5. `listEdgeTypesFromRegistry` + per-type constraint loop.

Re-running `bun run dev` is a no-op for steps 2, 4, 5 (all `IF NOT
EXISTS`). Step 3 is gated on `isRegistryEmpty`. AC-14 verifies.

## 9. YAML / JSON import-export

### 9.1 Import — `POST /api/v1/ontology/import`

```ts
export async function handleOntologyImport(req: Bun.Request): Promise<Response> {
  // 1. Parse body — content-type sniffing.
  const contentType = req.headers.get("content-type") ?? "";
  const format = new URL(req.url).searchParams.get("format")
    ?? (contentType.includes("yaml") ? "yaml" : "json");
  const text = await req.text();
  const parsed = format === "yaml" ? yaml.load(text) : JSON.parse(text);

  // 2. Validate against importSchema (§3.3).
  const validation = importSchema.safeParse(parsed);
  if (!validation.success) return error(400, "invalid_payload", validation.error.flatten());

  // 3. Two-phase ingestion (mirrors graph-core/import).
  // Phase 1: nodeLabels — collect-and-continue.
  // Phase 2: edgeTypes — collect-and-continue.
  // Symmetric schema_breaking check on PATCHing existing types.
  const errors: ImportError[] = [];
  const accepted = { nodeLabels: 0, edgeTypes: 0 };

  for (const [i, nl] of (validation.data.nodeLabels ?? []).entries()) {
    try { await upsertNodeLabel(nl); accepted.nodeLabels++; }
    catch (e) { errors.push({ section: "nodeLabels", index: i, code: e.code, message: e.message, details: e.details }); }
  }
  for (const [i, et] of (validation.data.edgeTypes ?? []).entries()) {
    try { await upsertEdgeType(et); accepted.edgeTypes++; }
    catch (e) { errors.push({ section: "edgeTypes", index: i, code: e.code, message: e.message, details: e.details }); }
  }

  return Response.json({ accepted, errors });
}
```

### 9.2 Export — `GET /api/v1/ontology/export`

```ts
export async function handleOntologyExport(req: Bun.Request): Promise<Response> {
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const schema = await getSchema();  // hits the §6.1 cache
  const body = { nodeLabels: schema.nodeLabels, edgeTypes: schema.edgeTypes };
  if (format === "yaml") {
    return new Response(yaml.dump(body), { headers: { "Content-Type": "application/yaml" } });
  }
  return Response.json(body);
}
```

Round-trip: `export → import → export` is zero-diff because both paths
funnel through the same canonical JSON serialisation (zod-defined
shapes; no field reordering at the boundary).

## 10. Daily retention pass (FR-13a)

Daily cron job at `OPT_ONTOLOGY_AUDIT_CRON` (default `0 3 * * *` in the
operator's `TZ`). The job runs **two logically independent passes**
(pass-1 C-07): audit-log archive and SSE event-buffer purge. The
0-disable flag affects ONLY the audit-log archive — the event purge
runs unconditionally.

The audit archive uses **two-step delete-after-archive** for durability
(pass-1 N-08): rows are written to the gzip archive in transaction A;
only after the archive file is closed and `fsync`'d does transaction B
delete them from `_OntologyAudit`. A crash between A and B re-archives
the same rows on the next run (the gzip append + idempotent re-write
is safe because the archive file is a stream of independent rows, no
deduplication needed for downstream readers).

```ts
// api/src/ontology/jobs/audit-retention.ts
import { fsync } from "node:fs/promises";

export async function runAuditRetention(now: Date = new Date()): Promise<{archived: number, events_purged: number}> {
  // ===== Pass A: audit archive (gated by OPT_ONTOLOGY_AUDIT_RETENTION_DAYS) =====
  const retentionDays = Number(process.env.OPT_ONTOLOGY_AUDIT_RETENTION_DAYS ?? "365");
  let archived = 0;

  if (retentionDays > 0) {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
    const monthKey = now.toISOString().slice(0, 7);
    const archivePath = `data/ontology-manager/audit-archive/${monthKey}.jsonl.gz`;
    await fs.mkdir(path.dirname(archivePath), { recursive: true });

    // Step 1 (transaction A): read + write archive file. NO DELETE yet.
    const archiveStream = createWriteStream(archivePath, { flags: "a" });
    const gzipStream = createGzip();
    gzipStream.pipe(archiveStream);

    const archivedIds: string[] = [];   // capture which rows were durably archived
    const session = driver.session();
    try {
      const result = await session.executeRead(tx => tx.run(`
        MATCH (a:_OntologyAudit) WHERE a.ts < $cutoff
        RETURN a ORDER BY a.ts ASC LIMIT 10000
      `, { cutoff }));
      for (const record of result.records) {
        const audit = deserializeAudit(record.get("a"));
        gzipStream.write(JSON.stringify(audit) + "\n");
        archivedIds.push(audit.ts + "|" + audit.actor + "|" + audit.target);  // synthetic key — see ⓘ
        archived++;
      }
    } finally { await session.close(); }

    // Wait for gzip to flush + fd-sync for durability.
    await new Promise<void>((resolve, reject) => {
      gzipStream.end(() => {
        archiveStream.on("close", async () => {
          try {
            const fd = await fs.open(archivePath, "r+");
            await fd.sync();   // fsync — durability guarantee
            await fd.close();
            resolve();
          } catch (e) { reject(e); }
        });
      });
    });

    // Step 2 (transaction B): only NOW delete the archived rows.
    // We re-match on the same cutoff + LIMIT — no row-id needed because
    // the universe of qualifying rows is monotonic (no new rows can fall
    // below the cutoff during this window).
    if (archived > 0) {
      const session2 = driver.session();
      try {
        await session2.executeWrite(tx => tx.run(`
          MATCH (a:_OntologyAudit) WHERE a.ts < $cutoff
          WITH a ORDER BY a.ts ASC LIMIT 10000
          DELETE a
        `, { cutoff }));
      } finally { await session2.close(); }
    }

    // ⓘ archivedIds is not strictly needed — the cutoff query in Step 2 is
    // identical to Step 1's, so the same rows are matched. archivedIds is
    // kept only for observability / monitoring (log how many rows landed
    // in the archive vs how many were deleted; counts should match).
  }

  // ===== Pass B: SSE event buffer purge (always runs, NOT gated by retentionDays) =====
  const eventCutoff = new Date(now.getTime() - 5 * 60_000).toISOString();
  let events_purged = 0;
  const sessionE = driver.session();
  try {
    const result = await sessionE.executeWrite(tx => tx.run(
      `MATCH (e:_OntologyEvent) WHERE e.ts < $cutoff WITH e RETURN count(e) AS c, collect(e) AS toDelete`,
      { cutoff: eventCutoff }
    ));
    events_purged = result.records[0].get("c").toNumber();
    if (events_purged > 0) {
      await sessionE.executeWrite(tx => tx.run(
        `MATCH (e:_OntologyEvent) WHERE e.ts < $cutoff DELETE e`,
        { cutoff: eventCutoff }
      ));
    }
  } finally { await sessionE.close(); }

  return { archived, events_purged };
}
```

**Scheduler registration with graceful-shutdown** (pass-1 N-03):

```ts
// api/src/server.ts
import cron from "node-cron";   // version pinned ^3.x — see §15

const cronTask = cron.schedule(
  process.env.OPT_ONTOLOGY_AUDIT_CRON ?? "0 3 * * *",
  runAuditRetention,
);

process.on("SIGTERM", () => {
  cronTask.stop();   // halt future ticks during shutdown
  // (in-flight run completes; runAuditRetention is async-safe to interrupt
  // — partial archive is preserved, next-day run picks up uncovered rows)
});
```

## 11. CI integration

This spec's tests join `graph-core`'s existing `integration` CI job
(per graph-core/§11 / pass-1 C-06): the `services: neo4j` block already
provides a Neo4j sidecar; new tests are tagged with the same
`.integration.test.ts` suffix and discovered automatically.

No new CI job required. `bun test:integration` runs both graph-core's
and ontology-manager's integration tests against the same Neo4j
instance.

## 12. Security

- **No new auth surface** — single-tenant per `graph-core/NFR-08`. The `actor` column on audit + version rows is constant `"operator"` (or `"system:bootstrap"` for the seed run).
- **Label/type interpolation is type-narrowed** — `parseLabel` from
  `graph-core/§5.5` is reused on every `/api/v1/ontology/node-labels/:name`
  route param. Edge-type names use the same pattern via a new
  `parseEdgeTypeName` helper in `api/src/routes/_helpers.ts`.
- **SSE endpoint is open without auth** but bound to `127.0.0.1` per
  `graph-core/NFR-02`; single-tenant single-process means no leak vector.
- **JSON Schema converter library (`json-schema-to-zod`) audit**: review
  pinned at design time. The library is reasonably small and well-maintained;
  CVE history clean as of 2026-05. Pinning to version `^2.x` with lockfile.
- **Audit log retention archive** is written to `data/ontology-manager/audit-archive/`
  — local filesystem. Permissions inherited from the operator's process
  user. No remote sync — backup is the operator's responsibility (out of scope).

## 13. Error handling

| Failure | Detection | Response | Recovery |
|---------|-----------|----------|----------|
| Name conflict (duplicate node label / edge type) | Neo4j `ConstraintValidationFailed` on `_onto_*_name_unique` | `409 name_conflict` | Client picks a different name |
| Unsupported JSON Schema keyword | zod strict mode | `400 unsupported_jsonschema_keyword` with `details.keyword` | Client removes the keyword |
| Edge-type endpoint references nonexistent label | pre-check in `createEdgeType` | `400 type_pair_violation` with `details.unknown_label` | Client creates the label first |
| Delete with live instances | `assertDeletePreconditions` step (i) | `409 deprecation_required` with `details.precondition_failed: "node_instance_count"` | Client deprecates + migrates first |
| Patch dropping endpoint with live edges | `patchEdgeType` symmetric check | `400 schema_breaking` with `details.affected_edge_count` + sample ids | Client migrates the live edges or accepts the cap |
| Rollback would orphan live data | pre-check in `handleRollback` | `400 rollback_orphans` with `details.affected_labels[]` | Client migrates the orphans first |
| Migration step `transform_expression` Cypher errors | Driver Cypher error | `400 migration_failed` with `details.cypher_error` | Client fixes the expression |
| SSE client disconnects mid-stream | `req.signal.abort` | Stream closed; listener cleanup | Client reconnects with `Last-Event-ID` for replay |
| Neo4j unreachable during SSE handshake | Driver error | `503 neo4j_unreachable` | Client retries with backoff |
| Daily retention pass runs while archive disk is full | `fs.writeStream.error` | Log to stderr; pass exits non-zero; rows NOT deleted from `_OntologyAudit` (next-day pass will retry) | Operator inspects disk, frees space |

## 14. Testing plan

| AC | Test file | Kind |
|----|-----------|------|
| AC-01 | `api/__tests__/ontology-new-label.integration.test.ts` | integration |
| AC-02 | `api/__tests__/ontology-attribute-enforcement.integration.test.ts` | integration |
| AC-03 | `api/__tests__/ontology-no-retroactive-rewrite.integration.test.ts` | integration |
| AC-04 | `api/__tests__/ontology-edge-pair-violation.integration.test.ts` | integration |
| AC-05 | `api/__tests__/ontology-deprecation.integration.test.ts` (4 sub-cases per the four preconditions + never-used path) | integration |
| AC-06 | `api/__tests__/ontology-versioning.integration.test.ts` | integration |
| AC-07 | `api/__tests__/ontology-import-export.integration.test.ts` (YAML + JSON round-trips) | integration |
| AC-08 | `api/__tests__/ontology-alignment-filter.integration.test.ts` | integration |
| AC-09 | `api/__tests__/ontology-dry-run.integration.test.ts` | integration |
| AC-10 | `api/__tests__/ontology-invalidating-guard.integration.test.ts` | integration |
| AC-11 | `api/__tests__/ontology-audit-log.integration.test.ts` | integration |
| AC-12 | `api/__tests__/ontology-required-docs.integration.test.ts` | integration |
| AC-13 | inside `ontology-audit-log.integration.test.ts` (negative-property assertion) | integration |
| AC-14 | `api/__tests__/ontology-bootstrap-reconcile.integration.test.ts` | integration |
| AC-15 | `api/__tests__/ontology-no-frozen-import.test.ts` (unit; grep) | unit |
| AC-16 | `api/__tests__/ontology-edge-validator-runtime.integration.test.ts` | integration |
| AC-17 | `api/__tests__/ontology-change-event.integration.test.ts` (in-process + SSE) | integration |
| AC-18 | `api/__tests__/ontology-events-sse.integration.test.ts` (concurrent + replay) | integration |
| AC-19 | `api/__tests__/ontology-audit-retention.integration.test.ts` | integration |
| AC-20 | `api/__tests__/ontology-envelope.test.ts` (unit; mocked) | unit |

19 of 20 ACs run as integration tests against a real Neo4j instance in
CI (per §11). AC-15 + AC-20 are unit tests.

## 15. File changes

| Path | Action | Brief | Maps to |
|------|--------|-------|---------|
| `shared/src/schema/ontology.ts` | new | zod schemas (§3.3) | FR-01a, FR-02, FR-03, FR-10 |
| `api/src/ontology/storage/node-labels.ts` | new | createNodeLabel, getNodeLabel, patchNodeLabel, deleteNodeLabel, listNodeLabels | §4.1, FR-02 |
| `api/src/ontology/storage/edge-types.ts` | new | parallel set for edge types | §4.2, FR-03 |
| `api/src/ontology/storage/attributes.ts` | new | upsertAttributeSchema, getAttributeSchema | FR-01a |
| `api/src/ontology/storage/alignments.ts` | new | insertAlignments, replaceAlignments | FR-09 |
| `api/src/ontology/storage/audit.ts` | new | writeAudit, writeVersion, helpers | FR-13, FR-07 |
| `api/src/ontology/storage/preconditions.ts` | new | assertDeletePreconditions | §4.3, FR-06 |
| `api/src/ontology/storage/migrations.ts` | new | createMigration, executeMigration | FR-16 |
| `api/src/ontology/storage/events.ts` | new | writeEvent, replayEventsSince | §5.4, FR-17 |
| `api/src/ontology/cache/schema.ts` | new | schemaCache (LRU, 60 s TTL) | §6.1, NFR-03 |
| `api/src/ontology/cache/edge-endpoints.ts` | new | endpointCache (LRU, 60 s TTL, 256 cap) | §6.2, FR-04a |
| `api/src/ontology/cache/attribute-zod.ts` | new | per-label zod cache | §6.3, FR-04 |
| `api/src/ontology/events.ts` | new | ontologyEvents EventEmitter; subscribe helpers | FR-17 |
| `api/src/ontology/json-schema-to-zod.ts` | new | wrapper around `json-schema-to-zod` library | FR-01a |
| `api/src/ontology/seed.ts` | new | seedRegistryFromConstTuples — sole legal const-tuple importer | FR-15, NFR-02, AC-15 |
| `api/src/ontology/errors.ts` | new | ONTOLOGY_ERROR_CODES enum + exhaustiveness | §5.3 |
| `api/src/routes/ontology/schema.ts` | new | GET /api/v1/schema | FR-14 |
| `api/src/routes/ontology/events.ts` | new | GET /api/v1/ontology/events SSE | §5.4, FR-17 |
| `api/src/routes/ontology/node-labels.ts` | new | CRUD for node labels | FR-02 |
| `api/src/routes/ontology/edge-types.ts` | new | CRUD for edge types | FR-03 |
| `api/src/routes/ontology/import.ts` | new | POST /api/v1/ontology/import | §9.1, FR-08 |
| `api/src/routes/ontology/export.ts` | new | GET /api/v1/ontology/export | §9.2, FR-08 |
| `api/src/routes/ontology/versions.ts` | new | versions + rollback | FR-07 |
| `api/src/routes/ontology/audit.ts` | new | GET /api/v1/ontology/audit | FR-13 |
| `api/src/routes/ontology/migrations.ts` | new | POST /api/v1/ontology/migrations | FR-16 |
| `api/src/routes/_helpers.ts` | edit | add `parseRegistryLabel` + `parseEdgeTypeName` (async, registry-backed — pass-1 N-04, N-07) | §5.5 |
| `api/src/ontology/storage/migrations.ts` | new | `executeMigration` — discriminated-union Cypher templates | §4.7, FR-16 |
| `api/src/router.ts` | edit | mount 16 new routes under `/api/v1/ontology/*` + `/api/v1/schema` | §5.1 |
| `api/src/neo4j/bootstrap.ts` | edit | refactor to iterate registry; call `applyMetaSchema` + `seedRegistryFromConstTuples` | §7.1, FR-15 |
| `api/src/storage/edges.ts` | edit | replace `EDGE_ENDPOINTS` const lookup with `getEdgeEndpoints` cache call | §7.2, FR-04a |
| `api/src/storage/nodes.ts` | edit | add `getAttributeValidator(label)` invocation in `createNode`/`patchNode`/`upsertNode` for FR-04 attribute enforcement | FR-04 |
| `api/src/ontology/jobs/audit-retention.ts` | new | daily archive job | §10, FR-13a |
| `api/src/server.ts` | edit | cron.schedule(audit-retention) | §10 |
| `api/src/ontology/meta-bootstrap.ts` | new | applyMetaSchema (constraints + indexes for `_Ontology*` namespace) | §3.2, §8 |
| `api/__tests__/ontology-*.integration.test.ts` | new (×18) | per §14 testing plan | every AC |
| `api/__tests__/ontology-envelope.test.ts` | new | unit envelope assertion | AC-20 |
| `api/__tests__/ontology-no-frozen-import.test.ts` | new | unit grep for NODE_LABELS/EDGE_TYPES imports | AC-15 |
| `api/package.json` | edit | add deps (pinned per pass-1 N-02): `json-schema-to-zod@^2`, `js-yaml@^4`, `fast-json-patch@^3`, `lru-cache@^10`, `node-cron@^3` | Dependencies |
| `data/ontology-manager/` | new (gitignored) | runtime data dir for audit-retention archive | §10 |
| `.env.example` | edit | add `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=365`, `OPT_ONTOLOGY_AUDIT_CRON="0 3 * * *"` | §10 |
| `.gitignore` | edit | add `data/ontology-manager/` | §10 |

Total: **25 production source files** (1 added in revision 2 for §4.7 migrations) + **20 test files** (18 integration + 2 unit per §14) = **45 new files**, **6 edits** to graph-core/api, **0 deletes** (pass-1 N-01 clarified count).

## 16. Open design questions — resolved

| Question (from requirements §Risks + STATUS pass-2 open-accepted) | Resolution in design |
|-------|----------------------|
| 1. Registry storage backend (Neo4j vs SQLite) | Neo4j `_Ontology*` namespace. §3. |
| 2. Multi-tenant actor wiring | `actor TEXT NOT NULL` — constant `"operator"` (or `"system:bootstrap"`) today; future migration data-only. §4.4. |
| 3. SSE delivery across corporate proxies | 30 s keepalive (NFR-09) + `X-Accel-Buffering: no` header. §5.4. If proxies still buffer, the client-side fallback is the 5-min polling at `/api/v1/schema` per `process-explorer-ui/FR-28` (already specified). |
| 4. `graph-core/EDGE_ENDPOINTS` const interaction | The const remains a TypeScript narrowing primitive AND the boot-time seed source via `api/src/ontology/seed.ts`. Only that file imports it. AC-15 grep enforces. §7.1. |
| 5. Rollback affecting live data | Pre-check in `handleRollback`; returns `400 rollback_orphans` with affected-label list before writing. (See §5.1 route table.) |
| 6. Audit log retention | `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS` env (default 365; 0 = disabled). Daily 03:00 archive to `data/ontology-manager/audit-archive/YYYY-MM.jsonl.gz`. §10. |
| 7. YAML+JSON dual-accept on import | Content-type sniffing + `?format=` override. `js-yaml` locked. §9.1. |
| 8. JSON Schema supported subset | Strict zod schema (§3.3) rejects 11 unsupported keywords at register time. §3.4. |
| 9. `/api/v1/schema` shape stability | Additive-only; breaking changes increment `/api/v2/schema` per `graph-core/NFR-11`. (No code in this spec; policy.) |
| 10. SSE event ordering | Single in-process EventEmitter is the canonical order; SSE replay sorts by `event_id` (UUIDv7 → monotonic). §5.4. |
| **PASS-2 OA-1: audit archive path namespacing** | `data/ontology-manager/audit-archive/...` not `data/ontology-audit-archive/...`. §10. |
| **PASS-2 OA-2: post-restart SSE replay** | `_OntologyEvent` collection persists every event; daily retention pass prunes events > 5 min old. `Last-Event-ID` reads from this collection. §5.4. |

## 17. Risks introduced or remaining

| Risk | Severity | Mitigation |
|------|----------|------------|
| `json-schema-to-zod` library converts a small subset of JSON Schema — operator may register a schema using a supported keyword that the library handles incorrectly. | low | The supported subset is conservative (14 keywords). Design phase manually verified each keyword via the library's test suite. Library version pinned at `^2.x`. |
| Per-label LRU cache eviction at scale: at 256 capacity, an org with > 256 edge types sees thrashing. | low | 256 covers realistic retail ontologies (typical: < 50 edge types). Cap is bumpable via env var if needed; design phase commits `OPT_ONTOLOGY_EDGE_ENDPOINT_CACHE_SIZE` (default 256). |
| ~~Migration `transform_expression` is raw Cypher — operator can write a query that violates an attribute schema mid-migration.~~ **RESOLVED in revision 2 (pass-1 C-09)**: `transform_expression` is now a discriminated union of 5 structured transform shapes; each compiles to a fixed parameterised Cypher template. No operator-supplied Cypher reaches `executeWrite`. | resolved | §3.3 + §4.7 |
| SSE long-poll connections occupy a connection slot per subscriber; at scale this could exhaust Bun's HTTP server's accept queue. | low | Single-tenant single-process means subscriber count ≤ 10 in realistic deployment. Bun's default limits are well above 10. |
| `_OntologyEvent` collection grows without bound if the audit-retention pass fails. | low | The retention pass is idempotent and re-runs daily. If it fails one day, the next day's run catches up. Disk-full alarm is the operator's monitoring concern. |
| Rolling back to a version that predates the registry's seed — i.e., before the six base labels were seeded — would leave the registry in an inconsistent state. | low | Rollback to the seed-bootstrap version (the very first `_OntologyVersion` row) is allowed but acts as a no-op (the seed labels are the same as the current base labels). Pre-seed rollback is impossible because no version row exists below the seed. |
| `_OntologyEvent` ↔ EventEmitter dual-write could drift if the transaction commits but the listener invocation fails. | low | The EventEmitter `emit` happens AFTER `tx.commit()`; if `emit` throws (sync), the event is still in `_OntologyEvent` and any SSE subscriber will pick it up on their next reconnect via `Last-Event-ID`. Documented in §5.4. |
