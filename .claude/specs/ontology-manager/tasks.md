---
feature: "ontology-manager"
created: "2026-05-23"
author: "frank"
status: "in-review"
revision: 2
reviewing_design_revision: 2
size: "large"
depends_on: ["graph-core"]
reviewing_pass_1_findings: "1 blocker, 5 concerns, 3 nits — all absorbed in revision 2 (see §Pass-1 review resolutions)."
---

# Tasks: ontology-manager

## Summary

Implementation of the design.md revision 2 broken into **26 tasks**
ordered by dependency (was 23 in revision 1 — T-18 split into T-18a..d
per pass-1 B-01; new T-23 doc-handoff task per pass-1 N-03). Each
task lists its files (1–3 per task per spec-workflow), the FR/AC it
traces to, its complexity (trivial / simple / moderate / complex), its
dependencies on other tasks, and the validation checkpoint that proves
it works.

Plus **4 open-accepted carry-forward items** from the design pass-2
review folded into the appropriate tasks (FR-06 tightening, dryRun
test fixture, `deleteNodeLabel` `writeEvent` fix, §10 event-purge query
cleanup).

Total: 25 production source files + 20 test files = 45 new files; 6
edits to `graph-core/api`; ~5 edits to `api/package.json` + `.env.example`
+ `.gitignore`.

## Pass-1 review resolutions (revision 2)

All findings from `review-tasks.md` (pass 1, 2026-05-23) absorbed:

| Finding | Disposition | Tasks |
|---------|-------------|-------|
| **B-01** T-18 violates 1-3-files rule (7 routes + router edit + cross-cutting test) | Split into **T-18a** (node-labels routes), **T-18b** (edge-types routes), **T-18c** (versions+audit+migrations routes), **T-18d** (import+export+dryRun-cross-cutting+router-mount). Each is 1-3 files. | T-18a..d |
| **C-01** Open-accepted #4 (event-purge cleanup) not testable in T-20 | Added explicit grep assertion: `grep collect(e) api/src/ontology/jobs/audit-retention.ts` must return zero hits. | T-20 |
| **C-02** T-03's `@uses-error-code` annotation convention not threaded | Switched to registry-based exhaustiveness check: new `api/src/ontology/error-throwers.ts` exports `ERROR_CODE_THROWERS: Record<OntologyErrorCode, ThrowerFn>`; the envelope test verifies the registry is exhaustive over `ONTOLOGY_ERROR_CODES`. No per-throw-site annotations needed. | T-03 |
| **C-03** AC-01 `/api/v1/stats` handler refactor missing | Added an explicit sub-bullet to T-09 (graph-core bootstrap refactor) covering `api/src/routes/stats.ts` — if it reads compile-time `NODE_LABELS`, refactor to read from the registry. | T-09 |
| **C-04** dryRun ownership ambiguous between T-11 and T-18 | Pinned: PATCH-with-schema-breaking-AND-dryRun sub-case stays in `ontology-edge-types.integration.test.ts` (T-11 owns); T-18d's `ontology-dry-run.integration.test.ts` covers other endpoints separately. | T-11, T-18d |
| **C-05** FR-10 `missing_documentation` error code shaping ambiguous | Added one-liner to T-18a + T-18b: map zod `min(1)` violations on `description` / `usage_example` to `missing_documentation` with `details.field` before falling through to `invalid_payload`. | T-18a, T-18b |
| **N-01** Task-count summary off by 5 | Updated to 26 tasks. | (summary) |
| **N-02** ASCII dep-graph hard to read | Dropped the ASCII graph; per-task "Depends on" column is the canonical source. | (dep section removed) |
| **N-03** §3.5 PEU STATUS cross-spec flag has no task | New **T-23** — doc-handoff task that appends a `<process-explorer-ui-incoming-contract-evolution>` block to `process-explorer-ui/STATUS.md`. | T-23 |

Plus task-rating adjustment: **T-17** moderate (was simple — alignment filter + ARTS fixture push it up).

## Pre-flight requirements tightening

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| **T-00** | **Requirements tightening (open-accepted from design pass-2 #1).** Bump `ontology-manager/requirements.md` to revision 3: rewrite FR-06 from "four preconditions" to "three preconditions" — drop the "deprecation marker required if instances ever existed" precondition. Update AC-05's four sub-cases to three. No requirements re-review (strictly permissive, no contract addition). | requirements.md | FR-06, AC-05 | trivial | none | git diff shows FR-06 has 3 enumerated preconditions; AC-05 has 3 sub-cases + 1 never-used path |

## Phase 1 — Dependencies + scaffolding (no Neo4j touch)

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-01 | Add 5 dependencies + 2 env vars + gitignore entry | `api/package.json`, `.env.example`, `.gitignore` | Dependencies §15 | trivial | T-00 | `bun install --frozen-lockfile` succeeds; `bun build api/src/server.ts --no-bundle` still clean |
| T-02 | Author the shared zod schemas: NODE_LABELS-of-the-registry types, JSON Schema supported-subset validator (§3.3, §3.4), discriminated union for migrations (§3.3 / pass-1 C-09), import schema, patch schemas | `shared/src/schema/ontology.ts` | FR-01a, FR-02, FR-03, FR-08, FR-10, FR-16 | moderate | T-01 | `bun build --no-bundle` clean; `shared/__tests__/ontology-schema.test.ts` (new) verifies (a) supported keywords accepted, (b) 11 unsupported keywords rejected with `unsupported_jsonschema_keyword`, (c) discriminated-union narrowing on `type` |
| T-03 | Error-code registry + thrower-registry + exhaustiveness test (pass-1 C-02 — registry not annotations). `errors.ts` exports `ONTOLOGY_ERROR_CODES` array. `error-throwers.ts` exports `ERROR_CODE_THROWERS: Record<OntologyErrorCode, () => never>` mapping each code to the thrower function (or function name) that emits it. Envelope test asserts the registry is exhaustive over the codes. Per-task throw sites do NOT need annotations — they import + use the named thrower from `error-throwers.ts`. | `api/src/ontology/errors.ts`, `api/src/ontology/error-throwers.ts`, `api/__tests__/ontology-envelope.test.ts` | §5.3, AC-20 | simple | T-01 | `ontology-envelope.test.ts` verifies `Object.keys(ERROR_CODE_THROWERS).sort() === [...ONTOLOGY_ERROR_CODES].sort()` (exhaustive); + every value is callable; + each thrower's returned `error.code` matches its key |

## Phase 2 — Meta-schema + bootstrap

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-04 | Implement `applyMetaSchema` — creates `_Ontology*` constraints + indexes idempotently (§3.2). Includes the new `_onto_alignment_unique` (pass-1 C-08). | `api/src/ontology/meta-bootstrap.ts` | §3.2, FR-01 | simple | T-01 | `api/__tests__/ontology-meta-bootstrap.integration.test.ts` — run twice against a fresh Neo4j; assert no errors + `SHOW CONSTRAINTS` count unchanged on second run |
| T-05 | Implement audit + version + event helpers in storage layer (§4.4 + §4.5). `writeAudit` + `writeVersion` + `writeEvent` all in-transaction. `OntologyChangedEvent` type pinned (no `target_kind`). | `api/src/ontology/storage/audit.ts`, `api/src/ontology/events.ts` | FR-13, FR-17, §4.4, §4.5 | moderate | T-04 | unit test on `writeAudit` (mocked tx) verifies `before_json` / `after_json` are JSON strings; `writeEvent` returns `{event_id}`; module `ontologyEvents` exports an `EventEmitter` typed `<{ "ontology.changed": [OntologyChangedEvent] }>` |
| T-06 | Implement `deserializeAudit` REST handler shape (§4.6 — pass-1 B-01) | `api/src/ontology/storage/audit.ts` (extends T-05) | FR-13, §4.6 | trivial | T-05 | unit test: feed a row with `before_json='{"a":1}'`, `after_json=null`; assert response has `before:{a:1}, after:null, diff_jsonpatch:null` |
| T-07 | Implement `assertDeletePreconditions` with the three (post-pass-1) preconditions (§4.3) | `api/src/ontology/storage/preconditions.ts` | FR-06, §4.3 | moderate | T-05 | unit-mocked tx tests for: (i) `node_instance_count > 0` → `deprecation_required.precondition_failed: "node_instance_count"`; (ii) `_OntologyEdgeEndpoint` reference → `"edge_endpoints_referencing"`; (iii) `deprecated_at` set + no `confirm_migration_step_id` → `"migration_step_required"`; (iv) fresh-never-used path → succeeds |
| T-08 | Implement seed loader (§7.1) — MERGE-based, single audit+version+event row | `api/src/ontology/seed.ts` | FR-15, §7.1, pass-1 C-03 + C-12 | moderate | T-05 | `api/__tests__/ontology-seed.integration.test.ts` — run twice against an empty registry; assert one `_OntologyVersion` row with `summary: "system_bootstrap_seed"` exists; assert second run yields zero new `_OntologyNodeLabel` / `_OntologyEdgeType` / `_OntologyEdgeEndpoint` rows |
| T-09 | Refactor `graph-core/api/src/neo4j/bootstrap.ts` to call `applyMetaSchema` + `seedRegistryFromConstTuples` + iterate the registry for per-label constraints (§7.1). **Plus (pass-1 C-03)**: audit `api/src/routes/stats.ts`; if it reads from compile-time `NODE_LABELS` / `EDGE_TYPES` const, refactor to read from the schema cache (§6.1) so AC-01's "label appears in `/stats` keyset within 60 s" works. | `api/src/neo4j/bootstrap.ts` (edit), `api/src/routes/stats.ts` (edit if compile-time-bound) | FR-15, AC-01, AC-14, AC-15 | moderate | T-04, T-08, T-13 (for the schema cache import in stats.ts) | `api/__tests__/ontology-bootstrap-reconcile.integration.test.ts` — fresh Neo4j: bootstrap seeds + creates constraints; re-bootstrap: no-op. Plus AC-01 test: POST a new label, poll `/api/v1/stats` until the key appears, assert ≤ 60 s |

## Phase 3 — Node-label CRUD + attribute enforcement

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-10 | Implement node-label storage (§4.1): `createNodeLabel` (strict CREATE), `patchNodeLabel` (incl. FR-12 invalidating-change guard + `forceBackfill` path), `deleteNodeLabel` (incl. cascade DETACH DELETE + DROP CONSTRAINT/INDEX, **incl. `writeEvent` call** per open-accepted #3), `getNodeLabel`, `listNodeLabels` | `api/src/ontology/storage/node-labels.ts` | FR-02, FR-05, FR-06, FR-10, FR-12, AC-05, AC-12 | complex | T-05, T-07 | `api/__tests__/ontology-node-labels.integration.test.ts` — POST, PATCH (description-only + json_schema_doc-only + forceBackfill paths), DELETE preconditions (i)+(ii)+(iii), GET, list. Verify FR-05: a `patch json_schema_doc` does not touch any `:Label.attributes_json`. Verify pass-1 N-09 fix: every successful mutation writes a `_OntologyEvent` row |
| T-11 | Implement edge-type storage (§4.2): `createEdgeType` (strict CREATE), `patchEdgeType` (incl. symmetric `schema_breaking` guard from FR-04a), `deleteEdgeType` (cascade DETACH DELETE + DROP CONSTRAINT — pass-1 C-04), `getEdgeType`, `listEdgeTypes`. Includes `_OntologyEdgeEndpoint` child rows. **Pass-1 C-04 ownership pin**: the `?dryRun=true` + dropping-endpoint-with-live-edges sub-case lives in **this test file** (`ontology-edge-types.integration.test.ts`); T-18d's `ontology-dry-run.integration.test.ts` covers OTHER mutating endpoints' dryRun behaviour, but NOT this sub-case (which is too edge-type-specific). | `api/src/ontology/storage/edge-types.ts` | FR-03, FR-04a, FR-06, FR-10, AC-04, AC-05, AC-16 | complex | T-05, T-07 | `api/__tests__/ontology-edge-types.integration.test.ts` — POST, PATCH endpoint replacement with + without live edges (symmetric guard fires); DELETE preconditions parallel to T-10. Plus the open-accepted #2 fixture: PATCH dropping endpoint pair with live edges + `?dryRun=true` returns 200 with `rejected[]` carrying `schema_breaking`, NOT 400. |
| T-12 | Implement alignment storage helpers — `insertAlignments`, `replaceAlignments` (§4.1 references) | `api/src/ontology/storage/alignments.ts` | FR-09, AC-08 | simple | T-04 | unit-mocked tx tests + part of T-10/T-11 integration coverage |

## Phase 4 — Caches + runtime validator wiring

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-13 | Three caches with uniform global invalidation (§6 + pass-1 C-01): schema cache (60 s TTL, cap 32), edge-endpoint cache (60 s TTL, cap 256), attribute-zod cache (lazy, unbounded). All subscribe to `ontologyEvents`. Plus `parseRegistryLabel` + `parseEdgeTypeName` helpers (§5.5 — pass-1 N-04, N-07). | `api/src/ontology/cache/schema.ts`, `api/src/ontology/cache/edge-endpoints.ts`, `api/src/ontology/cache/attribute-zod.ts` | NFR-03, FR-04a, §6.1, §6.2, §6.3, §5.5 | moderate | T-10, T-11 | unit tests on each cache: first-hit miss + populate; second-hit hit; fire `ontologyEvents.emit("ontology.changed", …)` → assert cache cleared. Plus `api/src/routes/_helpers.ts` edit adds `parseRegistryLabel` + `parseEdgeTypeName` (async, registry-backed) |
| T-14 | Refactor `graph-core/api/src/storage/edges.ts` (§7.2 + FR-04a): replace compile-time `EDGE_ENDPOINTS[type]` lookup with `await getEdgeEndpoints(type)`. Preserves error code + response shape. | `api/src/storage/edges.ts` (edit) | FR-04a, AC-16 | simple | T-13 | `graph-core/AC-13` still passes (existing test). New `api/__tests__/ontology-edge-validator-runtime.integration.test.ts` adds a label via `ontology-manager`, posts an edge using the new pair, assert success; then PATCH the edge-type to drop the pair, post the same edge again, assert `400 edge_endpoint_label_mismatch` |
| T-15 | Refactor `graph-core/api/src/storage/nodes.ts` (FR-04): every `createNode`/`patchNode`/`upsertNode` calls `getAttributeValidator(label)` and validates `input.attributes` against the registry's zod schema before write | `api/src/storage/nodes.ts` (edit) | FR-04, AC-02, AC-03 | moderate | T-13 | `api/__tests__/ontology-attribute-enforcement.integration.test.ts` — register a label with `{required: ["foo"]}`, POST a node missing `foo` → `400 attribute_violation`. Plus AC-03: register a non-required attribute on a populated label, assert no rewrite of existing rows (`updatedAt` unchanged) |
| T-16 | Implement migration executor (§4.7): discriminated-union switch on `type` (`rename_attribute` / `remap_value` / `remove_attribute` / `merge_labels` / `split_label`), each compiles to fixed parameterised Cypher. Writes `_OntologyMigration` row + audit + version + event. | `api/src/ontology/storage/migrations.ts` | FR-16, §4.7 | complex | T-05, T-10, T-11 | `api/__tests__/ontology-migrations.integration.test.ts` — five sub-cases, one per variant; assert `rows_affected` matches + a `_OntologyMigration` row exists with the same `migration_id` |

## Phase 5 — REST API surface

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-17 | Implement `/api/v1/schema` route + handler, hitting the §6.1 cache. Includes `?alignment=:source` filter + ARTS fixture for AC-08. | `api/src/routes/ontology/schema.ts`, `api/src/router.ts` (edit — mount route) | FR-14, AC-08, AC-13 | moderate | T-13 | `api/__tests__/ontology-schema-endpoint.integration.test.ts` — register a label + an aligned edge type with `external_alignment:[{source:"ARTS", id:"X"}]`; GET `/api/v1/schema` returns both; GET `?alignment=ARTS` filters to ARTS-aligned types only; GET `/schema` 10× writes zero audit rows (NFR-06 / AC-13) |
| **T-18a** | Node-labels routes (POST / GET / PATCH / DELETE + list). All call `parseRegistryLabel` for `:name` segments + respect `?dryRun?` via tx-rollback wrapping. **Pass-1 C-05**: zod `min(1)` violations on `description` / `usage_example` map to `400 missing_documentation` with `details.field` BEFORE falling through to `invalid_payload`. | `api/src/routes/ontology/node-labels.ts`, `api/src/router.ts` (edit — mount sub-tree) | FR-02, FR-05, FR-06, FR-10, FR-12, AC-01, AC-02, AC-03, AC-05, AC-09, AC-10, AC-12, AC-20 | complex | T-10, T-13, T-17 | `api/__tests__/ontology-new-label.integration.test.ts`, `ontology-attribute-enforcement.integration.test.ts`, `ontology-no-retroactive-rewrite.integration.test.ts`, `ontology-deprecation.integration.test.ts` (node-label sub-cases), `ontology-required-docs.integration.test.ts` (pass-1 C-05 — assert blank `description` returns 400 `missing_documentation` not `invalid_payload`), `ontology-invalidating-guard.integration.test.ts` |
| **T-18b** | Edge-types routes (POST / GET / PATCH / DELETE + list). Same `parseEdgeTypeName` + `?dryRun?` pattern + same `missing_documentation` mapping (pass-1 C-05) as T-18a. | `api/src/routes/ontology/edge-types.ts`, `api/src/router.ts` (edit) | FR-03, FR-04a, FR-06, FR-10, AC-04, AC-05, AC-16, AC-20 | complex | T-11, T-13, T-17 | `api/__tests__/ontology-edge-pair-violation.integration.test.ts`, `ontology-edge-validator-runtime.integration.test.ts` (overlaps with T-14's test — final landed by T-18b), `ontology-deprecation.integration.test.ts` (edge-type sub-cases). The PATCH-dryRun-schema-breaking sub-case stays in T-11's `ontology-edge-types.integration.test.ts` per pass-1 C-04 |
| **T-18c** | Versions + rollback + audit + migrations routes. Rollback rejects `rollback_below_bootstrap` (pass-1 C-03) and `rollback_orphans` per design §5.1. Migrations POST executes via T-16's `executeMigration` discriminated-union dispatcher. | `api/src/routes/ontology/versions.ts`, `api/src/routes/ontology/audit.ts`, `api/src/routes/ontology/migrations.ts`, `api/src/router.ts` (edit) | FR-07, FR-13, FR-16, AC-06, AC-11, AC-20 | complex | T-05, T-16, T-17 | `api/__tests__/ontology-versioning.integration.test.ts` (incl. `rollback_below_bootstrap` 400 case), `ontology-audit-log.integration.test.ts`, `ontology-migrations.integration.test.ts`. (Note T-16 already ships the storage test; T-18c adds the HTTP layer test) |
| **T-18d** | Import + export + cross-cutting dryRun + router-mount finalisation. Content-type sniffing for YAML+JSON import (pass-1 C-11 `?dryRun?` honoured for import). JSON canonical export. **Plus the cross-cutting `ontology-dry-run.integration.test.ts`**: exercises EVERY mutating endpoint × `?dryRun=true` for the NFR-08 side-effect-free contract (excluding the edge-type-specific sub-case owned by T-11). | `api/src/routes/ontology/import.ts`, `api/src/routes/ontology/export.ts`, `api/src/router.ts` (edit — final mount + 404 fallthrough) | FR-08, FR-11, AC-07, AC-09, AC-20 | complex | T-18a, T-18b, T-18c | `api/__tests__/ontology-import-export.integration.test.ts` (YAML+JSON round-trips), `ontology-dry-run.integration.test.ts` (NFR-08 cross-cutting — snapshot `_OntologyAudit`/`_OntologyVersion`/`_OntologyEvent` row counts before + after every dryRun mutation, assert unchanged) |
| T-19 | Implement SSE endpoint `/api/v1/ontology/events` (§5.4 — pass-1 B-02 race + index fixes). Subscribe-before-replay, live-buffer drain, `ts`-indexed replay query, `Last-Event-ID → ts` resolution OR explicit `?since=<ISO>`. 30 s heartbeat. SIGTERM cleanup. | `api/src/routes/ontology/events.ts`, `api/src/router.ts` (edit) | FR-17, NFR-09, AC-17, AC-18, §5.4 | complex | T-05, T-18d (router mount finalised in T-18d) | `api/__tests__/ontology-events-sse.integration.test.ts` — open 8 concurrent SSE connections, fire 3 mutations, assert all 8 receive all 3 in order. Disconnect one mid-stream, reconnect with `Last-Event-ID`, assert no events lost (including events that fired during the replay-vs-subscribe race window) |

## Phase 6 — Retention job + AC-15 grep

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-20 | Daily retention pass (§10): two-phase (audit archive gated by `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS`; event purge always runs — pass-1 C-07). Two-step delete-after-archive for durability (pass-1 N-08). Single-statement DELETE returning `count` (pass-1 N-10 + open-accepted #4) — no wasteful `WITH e RETURN count(e), collect(e)`. SIGTERM-aware (pass-1 N-03). | `api/src/ontology/jobs/audit-retention.ts`, `api/src/server.ts` (edit — `cron.schedule` + SIGTERM handler) | FR-13a, NFR-09, AC-19, §10 | moderate | T-05 | `api/__tests__/ontology-audit-retention.integration.test.ts` — seed audit rows aged > 365 d, run pass, assert (a) gzipped JSONL file at `data/ontology-manager/audit-archive/YYYY-MM.jsonl.gz`, (b) archived rows deleted from `_OntologyAudit`, (c) idempotent re-run yields zero additional archived rows; `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0` test: assert audit untouched, event-buffer still purged. **Plus pass-1 C-01 grep**: `grep -F 'collect(e)' api/src/ontology/jobs/audit-retention.ts` returns ZERO hits (assertion in the test file itself, executed via `execSync`) |
| T-21 | AC-15 no-frozen-import grep test | `api/__tests__/ontology-no-frozen-import.test.ts` | NFR-02, AC-15 | trivial | T-08 (so `seed.ts` exists for the allowlist) | Grep `api/src/` for `import.*\{[^}]*\b(NODE_LABELS|EDGE_TYPES)\b` allowing exactly one match: `api/src/ontology/seed.ts`. Fail otherwise |

## Phase 7 — Cross-cutting / final validation

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| **T-23** | **Cross-spec doc handoff (pass-1 N-03)**. Append a `## Incoming contract evolutions` block to `process-explorer-ui/STATUS.md` noting that `graph-core/FR-11`'s `/stats` shape will evolve from "six fixed keys" to "registry-driven keyset" after T-09 lands. This is documentation only — no code changes. | `.claude/specs/process-explorer-ui/STATUS.md` (edit) | design §3.5 | trivial | T-09 | git diff shows the block appended; the block names T-09 as the landing-task |
| T-22 | Full validation pass: run `bun run typecheck` + `bun test` + `bun test:integration` against a fresh Neo4j; verify all 20 ACs from §14 pass; verify graph-core's existing AC suite still passes (no regression). | n/a (CI scope) | every AC | simple | T-00..T-21, T-23 | All tests green. CI workflow runs both unit + integration jobs |

## Open-accepted carry-forward summary

| Item | Folded into task | Verification in that task |
|------|------------------|---------------------------|
| #1 FR-06 requirements tightening | **T-00** | git diff of requirements.md |
| #2 dryRun + schema-breaking test fixture | **T-11** | sub-test in `ontology-edge-types.integration.test.ts` |
| #3 deleteNodeLabel writeEvent missing | **T-10** | sub-test asserts `_OntologyEvent` row created on DELETE |
| #4 §10 event-purge query cleanup | **T-20** | grep assertion: `grep -F 'collect(e)' api/src/ontology/jobs/audit-retention.ts` returns zero hits |

## Dependencies

Per-task dependencies are the canonical source — see the "Depends on"
column in each task table above. (Revision 1's ASCII dep graph was
dropped per pass-1 N-02 — it had unconnected branches and misleading
arrows.)

**Critical path**: T-00 → T-01 → T-02 → T-05 → T-07 → T-10 + T-11 → T-13 → T-15 + T-16 → T-17 → T-18a + T-18b + T-18c → T-18d → T-19 → T-22.

**Estimated wall-clock** (single implementer): 7–9 working days for
the critical path (up from 5–7 in revision 1 because T-18 expanded from
one to four tasks per pass-1 B-01). With parallelisation of T-04, T-08,
T-09, T-12, T-20, T-21, T-23, total falls back to **6–9 working days**
for a focused implementation.

## Per-task complexity tally

| Complexity | Tasks | Count |
|------------|-------|------:|
| trivial | T-00, T-01, T-21, T-23 | 4 |
| simple | T-03, T-04, T-06, T-12, T-14, T-22 | 6 |
| moderate | T-02, T-05, T-07, T-08, T-09, T-13, T-15, T-17, T-20 | 9 |
| complex | T-10, T-11, T-16, T-18a, T-18b, T-18c, T-18d, T-19 | 8 |

**26 tasks total** (was 23 in revision 1). **Estimated effort**:
significant (9 moderate + 8 complex tasks; T-18 split inflates the
"complex" count).

## Validation checkpoint after each phase

After every phase boundary (1 → 2, 2 → 3, etc.) the implementer should
run:

1. `bun build --no-bundle api/src/server.ts > /dev/null && bun build --no-bundle pwa/src/main.tsx > /dev/null` — transpile clean.
2. `bun test` — unit tests pass.
3. `bun test:integration` — integration tests for the just-completed phase pass.
4. `graph-core`'s existing test suite continues to pass (no regression).

Failure at any checkpoint stops forward progress until resolved.
