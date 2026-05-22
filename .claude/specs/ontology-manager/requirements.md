---
feature: "ontology-manager"
created: "2026-05-22"
author: "frank"
status: "in-review"
revision: 3
size: "large"
depends_on: ["graph-core"]
user_stories_source: "companygraph-user-stories.html v0.1 — persona P1 (Maya, Ontology Author), epics OA-1..OA-3, stories OA-1.1..OA-3.3"
reviewing_pass_1_findings: "3 blockers, 4 concerns, 3 nits — all absorbed in revision 2 (see §Pass-1 review resolutions)."
---

# Requirements: ontology-manager

## Summary

`ontology-manager` is the **schema CRUD + governance** spec that lets a
human (persona P1: Maya, the Ontology Author) extend, evolve, version,
and align the canonical retail-process ontology established in
`graph-core` — **without breaking existing data**. It owns the lifecycle
of node labels, edge types, and attribute schemas beyond the six built-in
labels and six edge types defined in `graph-core/FR-03` and `FR-04`.

This spec turns the `graph-core` `NODE_LABELS` / `EDGE_TYPES` / `EDGE_ENDPOINTS`
registries from a compile-time `const` (frozen by `graph-core` §3.1, §3.2)
into a **runtime-mutable, version-aware, audit-logged DB-backed registry**.
The registry's live shape is exposed via two endpoints **owned by this
spec**:

1. `GET /api/v1/schema` — the live ontology (labels + edge types + attribute
   schemas + descriptions + alignment), consumed by `process-explorer-ui`,
   `chat-interface`, and `cto-analytics`.
2. `GET /api/v1/ontology/events` — Server-Sent Events stream of
   schema-change notifications, used by cross-process subscribers (PWA, batch
   workers) to invalidate their caches.

`ontology-manager` deliberately does NOT include any UI surface, any
graph rendering, any chat, or any analytics. The Ontology Author drives
it via REST + YAML/JSON import (FR-08); a thin admin pane inside
`process-explorer-ui` is the eventual visible front-end and is out of
scope here.

## Pass-1 review resolutions (revision 2)

All findings from `review-requirements.md` (pass 1, 2026-05-22) are
absorbed below. Cross-reference table:

| Finding | Disposition | Section |
|---------|-------------|---------|
| **B-01** Attribute-schema storage format undefined | Pinned to **JSON Schema 2020-12** with explicit supported-subset enumeration | FR-01a, FR-04, Dependencies |
| **B-02** Deprecation DELETE preconditions incomplete | Enumerated four explicit preconditions covering both labels and edge types | FR-06 (rewritten), AC-05 (rewritten) |
| **B-03** Runtime-mutable EDGE_ENDPOINTS validator contract missing | New FR-04a pins the live validator contract + latency budget + symmetric `400 schema_breaking` on endpoint removal | FR-04a, AC-16 |
| **C-01** Storage backend deferred but several FRs assumed Neo4j | Soft-default Neo4j-with-`_Ontology*`-namespace promoted into FR-01 | FR-01, Risks #1 |
| **C-02** In-process event vs NFR-02 single-source-of-truth | FR-17 now also exposes `/api/v1/ontology/events` SSE; downstream specs subscribe via SSE (browser) OR in-process EventEmitter (server-side workers) | FR-17 (rewritten) |
| **C-03** Audit-log retention unenforced | New FR-13a — daily archive pass to `data/ontology-audit-archive/YYYY-MM.jsonl.gz` | FR-13a, AC-19 |
| **C-04** AC-15 grep pattern fragile | Rewritten to grep on identifier names (`NODE_LABELS`/`EDGE_TYPES`) with one named allowlist file (`api/src/ontology/seed.ts`); `pwa/src/` removed | AC-15 |
| **N-01** `external_alignment` shape implicit | Pinned as `{source: string, id: string}` free-text, no enumeration | FR-09 |
| **N-02** FR-16 priority misordered | Promoted to `must` (FR-06's removal AC depends on it) | FR-16 |
| **N-03** Test naming convention inconsistent | Unified to `<name>.test.ts` (no `.integration.` infix) per `graph-core` convention | AC table |

## Motivation

`graph-core` ships with a hard-coded ontology — six node labels, six
edge types, the `EDGE_ENDPOINTS` Cartesian whitelist. That is sufficient
for `retail-mini` but is by deliberate design a frozen baseline (per
`graph-core/design.md` §18 risk #4). The moment Maya needs to add a
`Product` node, a `KPI` node, or a `Capability` edge type, the system
must:

1. Accept the change without a code redeploy.
2. Refuse the change if it would invalidate existing rows.
3. Record who changed what, when, with the diff.
4. Allow rollback to a prior schema if a change was mistaken.
5. Surface the catalog as a stable, queryable resource that downstream
   surfaces can render against.

Without this layer, every schema change is a code change, and the
catalog rots within months — a known failure mode for hand-maintained
ontologies and Maya's primary worry (persona-card success criterion:
"zero schema drift after 6 months").

## Functional Requirements

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-01 | **Persistent ontology registry — Neo4j-stored under a `_Ontology*` namespace.** The registry lives in the same Neo4j store as `graph-core`'s data, under reserved labels prefixed `_Ontology`: `_OntologyNodeLabel`, `_OntologyEdgeType`, `_OntologyAttributeSchema`, `_OntologyEdgeEndpoint`, `_OntologyVersion`, `_OntologyAudit`. The `_` prefix excludes them from all analytics + stats queries (the `Domain/UserJourney/.../Location` keyset in `graph-core/FR-11` `/stats` is unchanged). **Single-store rationale**: avoids cross-store transaction risk; rollback (FR-07) is a single Neo4j transaction. (Resolves pass-1 C-01.) | must | OA-1.1, OA-1.2 |
| FR-01a | **Attribute schemas are stored as JSON Schema 2020-12 documents.** Each `_OntologyAttributeSchema` row carries a `json_schema_doc` property (string) with a JSON Schema 2020-12 document. At runtime, the validator converts JSON Schema → zod via the `json-schema-to-zod` library; the resulting zod schema validates `node.attributes` on write. **Supported subset (enforced at schema-register time)**: types `string | number | integer | boolean | null | array | object`; keywords `type, required, properties, additionalProperties, items, format, pattern, minLength, maxLength, minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, enum, default`. **Out of scope (rejected with `400 unsupported_jsonschema_keyword`)**: `oneOf, anyOf, allOf, not, if/then/else, $ref, const, contentEncoding, contentMediaType, dependentSchemas, dependentRequired`. (Resolves pass-1 B-01.) | must | OA-1.1 |
| FR-02 | **Node-label CRUD** — `POST /api/v1/ontology/node-labels` registers a new label with `{name, description, usage_example, json_schema_doc, external_alignment?}`. `GET /api/v1/ontology/node-labels/:name` returns one; `GET /api/v1/ontology/node-labels` returns all. `PATCH /api/v1/ontology/node-labels/:name` mutates the attribute schema or external alignment (name is immutable). Within ≤ 60 s of registration, `graph-core/POST /api/v1/nodes/:label` accepts the new label (story OA-1.1 AC-1). | must | OA-1.1, OA-2.1 |
| FR-03 | **Edge-type CRUD** — `POST /api/v1/ontology/edge-types` registers a new type with `{name, description, usage_example, endpoints: [{fromLabel, toLabel}], external_alignment?}`. The runtime validator enforces the pairs on `graph-core/POST /api/v1/edges` (see FR-04a for the live validator contract). | must | OA-1.2 |
| FR-04 | **Attribute schema enforcement** — required attributes declared in `_OntologyAttributeSchema.json_schema_doc.required[]` are enforced on `graph-core/POST` + `PATCH /api/v1/nodes/:label/:id` writes via the runtime-converted zod schema (FR-01a). Violations return `400 {error:{code:"attribute_violation", details:{missing[], type_mismatch[]}}}`. The validator caches the compiled zod schema per label, invalidated by the `ontology.changed` event (FR-17). | must | OA-1.1 |
| FR-04a | **Runtime edge-write validator contract.** `graph-core/FR-12`'s edge-endpoint label whitelist (currently the compile-time `EDGE_ENDPOINTS` matrix in `graph-core/design.md` §3.2) is refactored in this spec to read from `_OntologyEdgeEndpoint` rows at request time. A 60-second in-process LRU cache (capacity 256, invalidated by the `ontology.changed` event from FR-17) holds the registry snapshot. **Latency budget**: ≤ 1 ms p99 on cache hit; ≤ 50 ms p99 on cache miss. **Symmetric live-data guard**: removing an `_OntologyEdgeEndpoint` row (via `PATCH /api/v1/ontology/edge-types/:name` that drops a pair, OR via `POST /api/v1/ontology/import` that omits a previously-existing pair) while live edges exist for the removed `(type, fromLabel, toLabel)` triple returns `400 {error:{code:"schema_breaking", details:{affected_edge_count, sample_edge_ids: <first 10>}}}` — same shape as FR-08's import-side check. **Supersession of `graph-core/AC-13`**: graph-core's existing edge-pair validation test continues to pass but now exercises the registry-backed path. (Resolves pass-1 B-03.) | must | OA-1.2 |
| FR-05 | **Non-retroactive attribute addition** — adding an attribute to an existing label MUST NOT rewrite existing rows. Historical rows surface that attribute as `null` until backfilled (story OA-1.1 AC-3). | must | OA-1.1 |
| FR-06 | **Deprecation lifecycle with three explicit DELETE preconditions** (revision 3 — pass-1 design-review B-04 dropped the original four-precondition form). `PATCH /api/v1/ontology/{node-labels,edge-types}/:name` with `{deprecated_at: <ISO>}` marks a type deprecated. Reads return the type with the `deprecated_at` field. Writes to deprecated types succeed with HTTP header `Deprecation: <ISO>`. **DELETE preconditions** (all must hold; failure returns `409 {error:{code:"deprecation_required", details:{precondition_failed: <name>, …}}}`): (i) **No live instances** — for node labels: `node_instance_count = 0` AND no edges reference any deleted instance; for edge types: `edge_instance_count = 0`. (ii) **No registry references** — for node labels: no `_OntologyEdgeEndpoint` row references this label as `fromLabel` or `toLabel`. For edge types: no `_OntologyEdgeEndpoint` row carries this type. (iii) **Migration-step requirement IFF deprecated** — if `before.deprecated_at` is set (the type was previously used and marked deprecated), the operator MUST pass `?confirm_migration_step_id=:id` referring to a completed migration row (FR-16). A fresh, never-used type (`deprecated_at` null) DELETEs without any migration step. Rationale: (i) blocks live-data loss; (iii) blocks skipping the migration step on a previously-used type; the dropped original "deprecation marker required if instances ever existed" heuristic relied on audit-row introspection that didn't survive the import path. (Resolves pass-1 B-02 + design pass-1 B-04.) | must | OA-1.3 |
| FR-07 | **Immutable versioning + rollback** — every ontology mutation writes one row to `_OntologyVersion` with `{version_id: <UUIDv7>, parent_version_id, diff_jsonpatch, actor, ts, summary}`. `GET /api/v1/ontology/versions` lists versions; `POST /api/v1/ontology/rollback/:version_id` restores the prior schema in a single Neo4j transaction. **Forward-only history**: rollback writes a NEW version row with `parent_version_id` pointing at the prior tip; the rolled-back-to schema is the new active schema (no history rewrite). **Rollback safety**: if rolling back would invalidate live data (e.g. dropping a label that has live instances, or dropping an edge-endpoint pair that has live edges), the response is `400 {error:{code:"rollback_orphans", details:{label, instance_count, …}}}` — same shape as FR-04a. | must | OA-1.4 |
| FR-08 | **Catalog import / export round-trip** — `POST /api/v1/ontology/import` accepts a YAML or JSON document `{nodeLabels:[…], edgeTypes:[…]}` and applies it idempotently on type `name`. **YAML and JSON are both accepted** on import (content-type sniffing on the `Content-Type` header, with explicit `?format=yaml|json` override); JSON is the canonical export format. Schema-breaking changes (shrinking a required-attribute set, removing an edge-endpoint pair with live edges, deleting a label with live instances) are rejected with `400 schema_breaking` carrying the same `details` shape as FR-04a. `GET /api/v1/ontology/export` returns the canonical JSON form; round-trip is zero-diff for any prior export. | must | OA-2.3 |
| FR-09 | **External-alignment metadata** — each label / edge type may carry an `external_alignment: [{source: string, id: string}]` array. Both fields are **free-text** — no enumeration of allowed sources; the operator owns canonicalisation. Documentation suggests common conventions (`source: "ARTS"`, `"RDS"`, `"ISO20022"`) but does not enforce them. Optional; absence does not block creation. `GET /api/v1/schema?alignment=:source` filters to types carrying at least one alignment row whose `source = :source` (case-sensitive match). (Resolves pass-1 N-01.) | must | OA-2.2 |
| FR-10 | **Mandatory `description` + `usage_example` on creation** — both `node-labels` and `edge-types` require `description` (non-empty, ≤ 2000 chars) and `usage_example` (one-line free text, ≤ 200 chars) at creation. Either blank returns `400 {error:{code:"missing_documentation", details:{field}}}`. | must | OA-2.1 |
| FR-11 | **Dry-run mode** — `?dryRun=true` query param on every mutating endpoint (`POST`/`PATCH`/`DELETE` on `/api/v1/ontology/*` AND `POST /api/v1/ontology/import`) returns `{accepted, rejected:[…], affected:{node_count, edge_count, downstream_changes:[…]}}` without writing. Dry-run does NOT write to the audit log or version table (NFR-08). | must | OA-3.1 |
| FR-12 | **Invalidating-change guard** — adding a required attribute to a label with existing rows is blocked unless `forceBackfill=true` is supplied with a backfill value (literal, or a JSON Patch operation against `node.attributes`). Block returns `409 {error:{code:"would_invalidate", details:{affected_count, sample_node_ids, suggested_backfill}}}`. | must | OA-3.2 |
| FR-13 | **Structured audit log** — every mutation writes one row to `_OntologyAudit` with `{ts, actor, action, target, before, after, diff_jsonpatch, version_id}`. `GET /api/v1/ontology/audit?since=:iso&action=:name&limit=:n&cursor=:c` returns paginated chronological rows. | must | OA-3.3 |
| FR-13a | **Audit log retention.** A daily pass (cron 03:00 in the operator's timezone) archives rows older than `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS` (default 365; `0` disables) into `data/ontology-audit-archive/YYYY-MM.jsonl.gz` (UTF-8, one JSON object per line, gzip-compressed). Archive is append-only — the daily pass is idempotent (re-running on the same day produces zero additional rows). Archived rows are deleted from the live `_OntologyAudit` collection. (Resolves pass-1 C-03.) | must | OA-3.3 |
| FR-14 | **`GET /api/v1/schema` — owned by this spec.** This endpoint did **not** exist in `graph-core` and is **introduced by this spec** (not "extended"). Returns the live registry: all base types (the six labels + six edge types from `graph-core/FR-03..FR-04`) plus any user-defined types, with per-type `{name, description, usage_example, json_schema_doc, endpoints?, external_alignment[], deprecated_at?}`. Shape is stable across versions; new fields are additive only. Available downstream callers: `process-explorer-ui` (schema cache subscription), `chat-interface` (LLM schema context), `cto-analytics` (`Activity.repetitive` / `Activity.data_richness` attribute lookup). (Resolves the cross-spec `/api/v1/schema` ownership question raised in `process-explorer-ui/B-01` and `chat-interface/B-01`.) | must | OA-2.1 |
| FR-15 | **`graph-core` registry refactor** — `graph-core`'s `api/src/neo4j/bootstrap.ts` is refactored to iterate the `_Ontology*` namespace at startup, reconciling against Neo4j constraints + indexes. On startup the bootstrap performs: (a) **seed** — if `_OntologyNodeLabel` is empty, write the six base labels + six base edge types from `graph-core`'s compile-time `NODE_LABELS` / `EDGE_TYPES` const tuples. Idempotent. (b) **reconcile** — for every registry row, ensure a corresponding Neo4j constraint + index exists; create missing ones with `IF NOT EXISTS`. (c) **NEVER drop constraints** — type removal goes through the FR-06 deprecation lifecycle, not the bootstrap. | must | OA-1.1, OA-1.3 |
| FR-16 | **Migration step API** — `POST /api/v1/ontology/migrations` accepts `{type: "rename_attribute" | "remap_value" | "remove_attribute" | "merge_labels" | "split_label", target, transform_expression}`. Migrations execute in a single Neo4j transaction; response is `{migration_id, rows_affected, version_id}`. Used to satisfy FR-06 precondition (iv). Idempotent on `migration_id`. (Promoted to `must` per pass-1 N-02.) | must | OA-1.3 |
| FR-17 | **Schema-change broadcast — dual-channel.** When any mutation lands, the API publishes a `ontology.changed` event carrying `{version_id, diff_jsonpatch}` over **two channels**: (a) **in-process EventEmitter** — `api/src/ontology/events.ts` exports `ontologyEvents: EventEmitter` consumed by in-process code (e.g. the `graph-core` edge-write validator from FR-04a, the chat backend's schema cache). (b) **Server-Sent Events at `GET /api/v1/ontology/events`** — long-lived HTTP/1.1 response with `Content-Type: text/event-stream`. Each event is a JSON line preceded by `data: ` and terminated by `\n\n`. Heartbeat comment `: keepalive` every 30 s. Used by browser callers (`process-explorer-ui/FR-28`, `chat-interface` PWA-side caches if any) that cannot subscribe to the in-process emitter. **Single source of truth still holds (NFR-02)**: both channels emit from the same write path; the SSE endpoint is a serialisation of the in-process event, not a parallel store. (Resolves pass-1 C-02 + the cross-spec SSE-doesn't-exist blocker raised in `process-explorer-ui/B-02` and `chat-interface/B-02`.) | must | OA-1.1, OA-1.2 |

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-01 | All mutations are transactional — registry row, audit log entry, and version row land in **one Neo4j transaction**, or none do. Cross-store transactions impossible because the registry lives in Neo4j (FR-01); single-store eliminates two-phase-commit risk. | data-integrity |
| NFR-02 | The registry (and `GET /api/v1/schema`) is the **only** runtime source of truth for ontology shape. No code path in `process-explorer-ui`, `chat-interface`, or `cto-analytics` may import the `graph-core` compile-time `NODE_LABELS` / `EDGE_TYPES` const tuples — they must call `GET /api/v1/schema` (browser) or subscribe to the in-process EventEmitter (server). The single exception is `api/src/ontology/seed.ts` (the boot-time seed loader from FR-15), which legitimately imports the const tuples to seed the registry on first run. Coverage enforced by AC-15. | architecture |
| NFR-03 | `GET /api/v1/schema` returns within 50 ms p99 against a registry of ≤ 200 types (the realistic ceiling for a retail org). Implementation uses an in-process cache invalidated by `ontology.changed`. Per-write edge validator latency budget (FR-04a) ≤ 1 ms p99 cache-hit, ≤ 50 ms p99 cache-miss. | performance |
| NFR-04 | Version-id is **monotonic** — `_OntologyVersion.version_id` is a UUIDv7 (per `graph-core/NFR-07`); lexicographic ordering matches creation order. Rollback to an earlier version writes a NEW version row (forward-only history); no history rewrite. | audit-integrity |
| NFR-05 | Response envelope follows `graph-core/NFR-05` — success returns the resource (or `{rows:[…]}`); errors return `{error:{code,message,details?}}` with the codes documented in this spec. | api-quality |
| NFR-06 | Read-only operations (`GET`) are **never** transactional writes — they do not touch the audit log or version table. Only `POST`/`PATCH`/`DELETE` write rows. | code-style |
| NFR-07 | The `actor` field on every audit + version row is the single-tenant operator (constant `"operator"` per `graph-core/NFR-08`). The column shape (`actor TEXT`) is forward-compatible with multi-tenant identity migration (data-only, no schema change). | scope |
| NFR-08 | Dry-run (`?dryRun=true`) MUST NOT write to the audit log, version table, OR the registry — it is a true side-effect-free preview. | data-integrity |
| NFR-09 | `GET /api/v1/ontology/events` (SSE) handles ≥ 8 concurrent subscribers without dropping events. Heartbeat keeps the connection alive through corporate proxies. Reconnection: clients use the standard `Last-Event-ID` header; the server replays events from that id (events buffered for ≤ 5 minutes). | reliability |

## Scope Boundaries

**In scope:**
- Persistent runtime registry of node labels, edge types, attribute schemas, edge-endpoint allow-lists (Neo4j `_Ontology*` namespace).
- REST CRUD for the registry (`/api/v1/ontology/*`).
- `GET /api/v1/schema` (this spec OWNS it — not "extends" graph-core).
- `GET /api/v1/ontology/events` (Server-Sent Events) for cross-process subscribers.
- Versioning + rollback + audit log + audit log retention archive.
- YAML/JSON import + JSON export (round-trippable).
- External-alignment metadata.
- Dry-run mode on all mutations.
- Invalidating-change guards + structured rejection codes (`schema_breaking`, `would_invalidate`, `rollback_orphans`, `deprecation_required`).
- Refactor of `graph-core`'s `bootstrap.ts` to iterate the registry.
- Refactor of `graph-core`'s edge-write validator (FR-04a) to consult the registry at request time.
- In-process `EventEmitter` for in-process callers; SSE for cross-process callers.

**Out of scope (tracked elsewhere or deferred):**
- Any UI surface — admin pane lives in `process-explorer-ui` (follow-on).
- Schema-change approval workflow / multi-reviewer sign-off (single-tenant single-operator per `graph-core/NFR-08`).
- Multi-instance / cross-machine pub-sub broadcast of `ontology.changed` — single-process per `graph-core/NFR-08` makes this unnecessary.
- Auto-discovery of external reference models (ARTS, etc.) — those are operator-curated JSON imports.
- Bulk data transformations beyond `POST /api/v1/ontology/migrations` (FR-16) — the operator may resort to raw Cypher / SQL inside a migration row.
- Schema linting / advisory rules (e.g. "this attribute name overlaps with a Neo4j reserved word") — surfaced as warnings in a later spec.
- `oneOf` / `anyOf` / `allOf` / `$ref` JSON Schema keywords (FR-01a).

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | New label creatable; appears in `/api/v1/stats` keyset within ≤ 60 s of registration | n/a (server) | `api/__tests__/ontology-new-label.test.ts` — POST a new `Product` label, poll `/api/v1/stats` until the key appears, assert ≤ 60 s |
| AC-02 | Required attributes enforced on `graph-core` node POST/PATCH; missing → `400 attribute_violation` with `details.missing[]` populated | n/a (server) | `api/__tests__/ontology-attribute-enforcement.test.ts` |
| AC-03 | Existing rows surface as `null` for newly-added attributes (no retro-write of `updatedAt`) | n/a (server) | `api/__tests__/ontology-no-retroactive-rewrite.test.ts` — pre-seed 3 rows, add a non-required attribute, assert no `updatedAt` change on those rows |
| AC-04 | New edge type rejects out-of-allowlist `(fromLabel, toLabel)` with `400 type_pair_violation` via the registry-backed FR-04a validator | n/a (server) | `api/__tests__/ontology-edge-pair-violation.test.ts` |
| AC-05 | DELETE preconditions enforced — three FR-06 preconditions tested individually with the exact 409 error code (revision 3 — was four sub-cases). | n/a (server) | `api/__tests__/ontology-deprecation.test.ts` — separate cases: (i) populated-label DELETE → `precondition_failed: "node_instance_count"`; (ii) label-referenced-by-endpoint DELETE → `"edge_endpoints_referencing"`; (iii) deprecated label without migration_step_id → `"migration_step_required"`; (iii-pass) deprecated label WITH valid `confirm_migration_step_id` → 204; PLUS the never-used path: POST + DELETE on a typo'd label with no instances ever → 204 without prior deprecation |
| AC-06 | Version log captures every mutation with diff + actor + ts; rollback restores prior schema in one Neo4j transaction; rollback writes a NEW version row pointing at the rolled-back-to schema (forward-only — NFR-04) | n/a (server) | `api/__tests__/ontology-versioning.test.ts` — apply 3 mutations, rollback to version[1], assert effective schema matches snapshot[1] AND a 4th version row was written with `parent_version_id = version[3]` |
| AC-07 | Import / export round-trip is zero-diff — YAML in / JSON out / JSON-in / JSON-out / YAML-out (`?format=yaml`) all round-trippable | n/a (server) | `api/__tests__/ontology-import-export.test.ts` — export → import → re-export, deep-equal; also test YAML→JSON conversion preserves semantics |
| AC-08 | `/api/v1/schema?alignment=ARTS` filters to ARTS-aligned types | n/a (server) | `api/__tests__/ontology-alignment-filter.test.ts` |
| AC-09 | Dry-run returns `{accepted, rejected, affected, downstream_changes}` and writes NOTHING to audit / versions / registry / Neo4j | n/a (server) | `api/__tests__/ontology-dry-run.test.ts` — snapshot all `_Ontology*` collection counts before + after dry-run, assert unchanged |
| AC-10 | Invalidating change (required attribute on a populated label) blocks with `409 would_invalidate` unless `forceBackfill=true` + backfill value supplied | n/a (server) | `api/__tests__/ontology-invalidating-guard.test.ts` |
| AC-11 | Audit log writes one row per mutation; `GET /api/v1/ontology/audit?since=` returns chronological rows with pagination | n/a (server) | `api/__tests__/ontology-audit-log.test.ts` |
| AC-12 | Blank `description` OR `usage_example` on creation returns `400 missing_documentation` | n/a (server) | `api/__tests__/ontology-required-docs.test.ts` |
| AC-13 | Read-only `GET /api/v1/schema` never writes audit/version rows (NFR-06) | n/a (server) | Part of `ontology-audit-log.test.ts` — call `/schema` 10× and assert audit/version row counts unchanged |
| AC-14 | `bootstrap.ts` seeds the six base types on first run; reconciles registry to Neo4j constraints idempotently; re-run is a no-op | n/a (server) | `api/__tests__/ontology-bootstrap-reconcile.test.ts` |
| AC-15 | No downstream spec imports `graph-core`'s compile-time `NODE_LABELS` / `EDGE_TYPES` symbols (NFR-02) | n/a (codebase) | `api/__tests__/ontology-no-frozen-import.test.ts` — `grep -rEn 'import\s+\{[^}]*\b(NODE_LABELS\|EDGE_TYPES)\b' api/src/ --include='*.ts'`; the only allowed match is `api/src/ontology/seed.ts` (the boot-time seed loader); all other matches fail. `pwa/src/` is NOT searched because the PWA never imports server-side schema directly. (Pattern uses identifier names, not file paths — file paths can be aliased.) (Resolves pass-1 C-04.) |
| AC-16 | FR-04a edge-write validator reads the registry at request time; symmetric rejection of endpoint-row removal with live edges returns `400 schema_breaking` with `details.affected_edge_count` populated | n/a (server) | `api/__tests__/ontology-edge-validator-runtime.test.ts` — register new edge-endpoint pair, POST an edge using that pair (200), PATCH the edge-type to drop the pair (400 schema_breaking with affected_edge_count=1) |
| AC-17 | `ontology.changed` event fires once per mutation with `{version_id, diff_jsonpatch}` on BOTH the in-process EventEmitter AND the SSE endpoint | n/a (server) | `api/__tests__/ontology-change-event.test.ts` — register an in-process listener AND open an SSE connection; perform a mutation; assert both received the event with matching version_id |
| AC-18 | SSE endpoint handles 8 concurrent subscribers + `Last-Event-ID` replay (NFR-09) | n/a (server) | `api/__tests__/ontology-events-sse.test.ts` — open 8 concurrent SSE connections, perform 3 mutations, assert all 8 receive all 3; disconnect one, reconnect with `Last-Event-ID`, assert missed events replay |
| AC-19 | Audit retention archive: rows > `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS` archived to `data/ontology-audit-archive/YYYY-MM.jsonl.gz`; archive is append-only; daily pass is idempotent | n/a (server) | `api/__tests__/ontology-audit-retention.test.ts` — seed audit rows aged > 366 days, run the daily pass, assert rows moved to archive file (gzipped, one-JSON-per-line); run the pass again, assert archive unchanged |
| AC-20 | Response envelope matches `graph-core/NFR-05` shape (success + error) for every endpoint in this spec | n/a (server) | `api/__tests__/ontology-envelope.test.ts` — one success + one error from each route, assert shape |

## Platforms & Input Modes

This spec is server-only — no PWA surface, no gestures, no keyboard
shortcuts. The Ontology Author interacts via REST and YAML/JSON files.
Table populated for completeness.

| Surface | iPhone Safari | iPad Safari | macOS Safari | macOS Chrome |
|---------|---------------|-------------|--------------|--------------|
| `/api/v1/ontology/*` REST | yes (via fetch from PWA shell; no UI in this spec) | yes | yes | yes |
| `/api/v1/schema` GET (read by downstream specs' caches) | yes | yes | yes | yes |
| `/api/v1/ontology/events` SSE subscription from PWA | yes (Safari supports EventSource) | yes | yes | yes |
| YAML/JSON file import via `curl` / scripted client | n/a | n/a | yes (terminal) | yes (terminal) |
| PWA UI surface for ontology CRUD | no — admin pane lives in `process-explorer-ui` (follow-on) | no | no | no |
| Keyboard shortcuts | no — no UI | no | no | no |
| Drag/drop / gesture input | no | no | no | no |

## Native Conflicts

No PWA surface. No gestures, scroll containers, keyboard shortcuts, or
focus traps in this spec. The SSE endpoint is consumed by code, not
gestures.

| Conflicting native behaviour | Affected surface | Suppression mechanism |
|------------------------------|------------------|------------------------|
| (none) | n/a | n/a |

## Dependencies

| Module/API | How it's affected |
|------------|-------------------|
| `graph-core` | Strong dependency. This spec refactors `graph-core`'s `bootstrap.ts` (registry seed + reconcile) and edge-write validator (`/api/v1/edges` reads `_OntologyEdgeEndpoint` via FR-04a), and adds 14+ routes under `/api/v1/ontology/*` plus `/api/v1/schema` and `/api/v1/ontology/events`. Graph-core's compile-time `NODE_LABELS` + `EDGE_TYPES` const tuples remain as TypeScript narrowing primitives for the registry seed in `seed.ts`, but are no longer consumed at runtime by any other code path (NFR-02). |
| Neo4j 5 (from `graph-core`) | Registry stored in Neo4j under `_Ontology*` namespace. No separate database. |
| `zod` (from `graph-core`) | Wire-level payload validation on the `/api/v1/ontology/*` REST endpoints. |
| `json-schema-to-zod` | **Locked** — runtime conversion of stored JSON Schema 2020-12 documents to zod validators for attribute enforcement (FR-01a, FR-04). |
| `js-yaml` | YAML parsing for FR-08 import. Locked in design phase. |
| `fast-json-patch` | JSON Patch diff generation for the audit log + version log (FR-13). Locked in design phase. |

## Risks & Open Questions

1. **Registry storage now pinned to Neo4j `_Ontology*` namespace (FR-01).**
   Resolves pass-1 C-01. The risk that remains is namespace pollution
   on Neo4j Browser sessions — the operator may see `_OntologyNodeLabel`
   nodes in autocomplete. Design phase should add a Neo4j Browser
   shortcut hint (`MATCH (n) WHERE NOT labels(n)[0] STARTS WITH '_' RETURN n`).

2. **Multi-tenant actor wiring (NFR-07).** Currently constant
   `"operator"`. Design phase should reserve the column shape
   (`actor TEXT NOT NULL`) so a future multi-tenant migration is data-
   only, not schema-changing.

3. **SSE delivery across corporate proxies (NFR-09).** Some corporate
   proxies buffer HTTP/1.1 long-lived connections and break SSE.
   Design phase should verify the 30 s keepalive is sufficient or
   commit to a WebSocket fallback. Most modern proxies pass SSE
   through; this is documented in dependencies.

4. **`graph-core`'s `EDGE_ENDPOINTS` `const satisfies` interaction
   with FR-04a.** `graph-core/design.md` §3.2 uses
   `const satisfies Record<EdgeType, ReadonlyArray<readonly [NodeLabel, NodeLabel]>>`
   for compile-time narrowing. After this spec, the runtime authority
   is the registry. The const tuple stays in `shared/src/schema/edges.ts`
   ONLY as the seed source for `api/src/ontology/seed.ts` (FR-15) and
   as the TypeScript narrowing primitive — never read by runtime
   validators. NFR-02 + AC-15 enforce this boundary.

5. **Rollback affecting live data.** FR-07 already rejects rollback
   that would orphan live data with `400 rollback_orphans`. Risk
   that remains is operator surprise — design phase should commit a
   pre-rollback dry-run (`?dryRun=true` already covers this).

6. **Audit log retention default (FR-13a).** 365 days is the default
   floor. Operators with stricter compliance (7-year SOX, etc.) set
   `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=2557`. Default is documented in
   `.env.example`; raised at design phase.

7. **YAML+JSON dual-accept on import (FR-08).** YAML reads better for
   humans; JSON is canonical for round-trip. Both are accepted on
   import via content-type sniffing; JSON is the canonical export
   format. `js-yaml` is the only YAML parser locked.

8. **JSON Schema supported subset (FR-01a).** Locked: types + 14
   keywords. Out: `oneOf`, `anyOf`, `allOf`, `not`, `if/then/else`,
   `$ref`, `const`. Operator-facing: a `unsupported_jsonschema_keyword`
   error names the rejected keyword precisely so the operator can
   simplify.

9. **`/api/v1/schema` shape stability across versions.** Additive-only
   per FR-14. New fields added by future revisions of this spec MUST
   be optional in the response shape — breaking changes increment
   `/api/v2/schema` per `graph-core/NFR-11`.

10. **SSE event ordering vs in-process emitter ordering.** Both
    channels emit from the same write path (FR-17), so the order of
    events is the same as the order of writes. Concurrent writes are
    serialised by the Neo4j transaction; the SSE replay buffer
    preserves order.
