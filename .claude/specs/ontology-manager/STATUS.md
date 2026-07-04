# Spec: ontology-manager
**Size**: large | **Created**: 2026-05-22 | **Current Phase**: **execution:complete** (2026-05-23)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 2 — pass-1 findings absorbed; revision 3 dropping FR-06 precondition (iii) is T-00 in tasks) | frank | 2026-05-22 |
| Req Review | pass-1 revise (3B, 4C, 3N) → pass-2 approve (10/10 cleanly absorbed) | spec-review-agent | 2026-05-22 |
| Design | approved (revision 2 — all pass-1 findings absorbed) | frank | 2026-05-23 |
| Design Review | pass-1 revise (4B, 12C, 8N) → pass-2 approve (24/24 cleanly absorbed; 2 new minor nits + 4 open-accepted folded into tasks) | spec-review-agent | 2026-05-23 |
| Tasks | approved (revision 2 — pass-1 findings absorbed; T-18 split into T-18a..d) | frank | 2026-05-23 |
| Task Review | pass-1 revise (1B, 5C, 3N) → pass-2 approve (8/9 cleanly absorbed, 1 cosmetic partial, 0 regressed; 2 minor open-accepted for execution) | spec-review-agent | 2026-05-23 |
| Execution | **complete** (T-00..T-23 of 27 shipped 2026-05-23; T-06 + T-09b folded into T-18c/cache work in parallel sessions; **169 tests across 18 ontology test files, 168 pass / 1 skip / 0 fail / 665 assertions**). Full storage + cache + bootstrap + migrations + ALL 18 REST routes + SSE endpoint + daily audit-retention cron + NFR-02 AC-15 grep + PEU STATUS handoff all shipped and live. Pass-1 design findings (B-01..B-04 + C-01..C-12 + N-01..N-08) verified absorbed end-to-end. graph-core's `EDGE_ENDPOINTS` matrix retired at runtime — registry is the runtime authority. **T-22 final validation: api + shared both `bun build --no-bundle` clean; 169-test run is fully green; 0 regressions in graph-core's existing tests.** | frank | 2026-05-23 |

**Review passes**: requirements=2 (cap reached), design=2 (cap reached), tasks=2 (cap reached)

**Execution highlights (T-00..T-04 shipped 2026-05-23):**
- **T-00** — requirements.md bumped to revision 3 (FR-06 4→3 preconditions; AC-05 reduced sub-cases). No re-review needed (strictly permissive).
- **T-01** — 5 deps installed (`json-schema-to-zod@^2.6.0`, `js-yaml@^4.1.0`, `fast-json-patch@^3.1.1`, `lru-cache@^10.4.3`, `node-cron@^3.0.3`) + 2 env vars + gitignore entry.
- **T-02** — `shared/src/schema/ontology.ts` (227 lines) — supported-subset JSON Schema 2020-12 validator (16 supported keywords, 13 explicitly rejected via `.strict()`), discriminated-union migration schema, node-label + edge-type CRUD shapes. **31/31 unit tests pass.**
- **T-03** — `api/src/ontology/errors.ts` (14-code enum) + `api/src/ontology/error-throwers.ts` (registry replacing the rejected `@uses-error-code` annotation per pass-1 C-02) + `api/__tests__/ontology-envelope.test.ts`. **4/4 unit tests pass, 49 assertions.**
- **T-04** — `api/src/ontology/meta-bootstrap.ts` (7 constraints + 2 indexes) + `api/__tests__/ontology-meta-bootstrap.integration.test.ts`. **4/4 integration tests pass against live Neo4j 5.26.26.** Constraints + indexes live in the database: `_onto_node_label_name_unique`, `_onto_edge_type_name_unique`, `_onto_attr_schema_label_unique`, `_onto_edge_endpoint_unique` (composite), `_onto_version_id_unique`, `_onto_event_id_unique`, `_onto_alignment_unique` (composite — pass-1 C-08), `_onto_audit_ts`, `_onto_event_ts`.

**Phase 2/3 shipped 2026-05-23 via parallel sub-agents:**
- **T-05** — `storage/audit.ts` + `storage/events.ts` + `events.ts` (EventEmitter singleton). **16 unit tests**.
- **T-07** — `storage/preconditions.ts` — `assertDeletePreconditions` with 3 preconditions. **12 unit tests**.
- **T-08** — `seed.ts` — MERGE-based idempotent seed; single audit+version+event per call. **5 integration tests**. Live registry seeded with 6 labels + 6 edge types + 8 endpoint pairs.
- **T-09a** — `neo4j/bootstrap.ts` refactored to iterate the runtime registry. NFR-02 boundary verified (no NODE_LABELS/EDGE_TYPES imports remain). **3 integration tests**. Stats handler refactor (T-09b) deferred to T-13 cache.
- **T-10** — `storage/node-labels.ts` — full CRUD + FR-12 forceBackfill + pass-1 N-09 deleteNodeLabel writeEvent fix. **7 integration tests**.
- **T-11** — `storage/edge-types.ts` — full CRUD + FR-04a symmetric `schema_breaking` guard + pass-1 C-04 cascade DETACH. **8 integration tests**.
- **T-12** — `storage/alignments.ts` — insert/replace/list helpers; uses `MERGE` for row-level idempotency. **7 unit tests**.
- **T-13** — `cache/schema.ts` (LRU 60s/32) + `cache/edge-endpoints.ts` (LRU 60s/256) + `cache/attribute-zod.ts` (lazy unbounded `Map`, `json-schema-to-zod` via `new Function`) + `parseRegistryLabel` / `parseEdgeTypeName` added to `routes/_helpers.ts`. All three caches subscribe to `ontologyEvents.on("ontology.changed", () => clear)`. **15 integration tests** (first-hit miss + populate; second-hit identity cache hit; event-emit clears; alignment-filtered schema entries cached under separate keys; parseRegistryLabel admits runtime-added labels).

**Load-bearing implementation fixes discovered by sub-agents:**
1. **Neo4j 5 forbids `DROP CONSTRAINT` inside `executeWrite` tx** (`Neo.ClientError.Transaction.ForbiddenDueToTransactionType`). The rev-2 design's `deleteNodeLabel` + `deleteEdgeType` Cypher mixed DDL with DML. Fix: cascade DETACH DELETE inside the tx; per-label/type `DROP CONSTRAINT` runs as a separate auto-commit statement AFTER tx commit. Documented in module headers. Single-tenant per NFR-08 means a DDL-fail-after-DML-commit leaves a stale constraint that next bootstrap re-CREATEs as a no-op.
2. **`assertDeletePreconditions` edge-type instance count was double-counting** — undirected `MATCH ()-[r:T]-()` traverses each relationship twice in Neo4j. Changed to directional `->()`. T-11 fix; preconditions.ts unit tests updated.
3. **APOC enabled in `docker-compose.yml`** — `NEO4J_PLUGINS: '["apoc"]'` + unrestricted procedures. Required by FR-12 forceBackfill Cypher (`apoc.convert.fromJsonMap`, `apoc.map.setKey`). Aligns with `graph-core/design.md` §8.3 which already specified the plugin.

**Remaining tasks (T-06, T-09b, T-14..T-23)**: audit REST deserializer (T-06 — small, paired with audit route); stats handler refactor (T-09b — now unblocked by T-13 cache); graph-core edges + nodes refactors (T-14, T-15); migration executor (T-16); routes (T-17 + T-18a..d); SSE endpoint (T-19); retention job (T-20); AC-15 grep (T-21); final validation (T-22); T-23 PEU STATUS handoff.

**Open-accepted for execution** (carried from task pass-2 review):
1. **C-N1 cosmetic**: "26 tasks" string in tasks.md summary is wrong by one (actual count after the T-18 split + T-23 add is **27** — T-00 + T-01..T-22 + T-23). Editorial fix during implementation. Also T-18c lists 4 source files (one over the 1-3 rule, but logically grouped — versions + audit + migrations are a single REST sub-tree). Acceptable as written; if it becomes painful at implementation time, split T-18c into T-18c1 (versions+rollback) and T-18c2 (audit+migrations).
2. **C-N2 phase labelling**: T-09's new T-13 dependency (added per pass-1 C-03 stats-handler fix) effectively moves T-09's *completion* across the Phase 2 → Phase 4 boundary. Phase labels are heuristic; per-task "Depends on" column is the canonical execution order.

**Tasks revision-1 highlights**:
- **22 tasks** (T-00 + T-01..T-21 + final-validation T-22), grouped into 7 phases.
- All four open-accepted items from design pass-2 folded into appropriate tasks: T-00 (FR-06 tightening), T-10 (writeEvent fix + sub-test), T-11 (dryRun+schema_breaking fixture), T-20 (event-purge query cleanup).
- Complexity tally: 4 trivial + 6 simple + 8 moderate + 5 complex.
- Critical-path estimate: **6–9 working days** for a focused single-implementer pass.
- Every task lists files (1–3 per task), FR/AC trace, complexity, dependencies, and validation checkpoint.
- Validation checkpoint after every phase boundary: `bun build --no-bundle` + `bun test` + `bun test:integration` + graph-core regression suite.

**Open-accepted for tasks phase** (carried from design pass-2 review):
1. **FR-06 requirements tightening** — drop precondition (iii) "deprecation marker required if instances ever existed" from requirements.md FR-06. Design absorbed this in §4.3 (three preconditions); requirements text still lists four. Tasks-phase author should bump requirements to revision 3 with the tightening. Strictly fewer preconditions = strictly more permissive = no contract regression.
2. **N-06 dryRun-vs-schema-breaking test fixture** — pin the specific test fixture that exercises PATCH dropping endpoint pair with live edges + `?dryRun=true`. Expect 200 `{accepted, rejected:[{code:"schema_breaking", ...}]}`, NOT 400.
3. **N-09 deleteNodeLabel writeEvent missing** — §4.1 `deleteNodeLabel` writes audit + version but is missing the `writeEvent(tx, version_id, [{op:"remove", ...}])` call (`deleteEdgeType` has it). One-line addition + regression test.
4. **N-10 §10 event-purge query cleanup** — current shape uses `WITH e RETURN count(e), collect(e)` which materialises the collection unnecessarily. Drop to a single-statement DELETE returning `count`.

**Design revision-1 highlights** (resolves all 7 open design questions from requirements + 2 pass-2 open-accepted carryovers):
- **Registry storage**: Neo4j `_Ontology*` label namespace (§3) — single store, single transaction (NFR-01). 8 meta-labels + relationships enumerated.
- **JSON Schema 2020-12 supported-subset**: strict zod schema (§3.3) rejects 11 unsupported keywords at register time (FR-01a).
- **Three-helper storage pattern per primitive**: createNodeLabel / patchNodeLabel / deleteNodeLabel (§4.1) — mirrors graph-core's three-helper pattern.
- **`assertDeletePreconditions`**: four explicit preconditions for FR-06 DELETE (§4.3).
- **`patchEdgeType` symmetric guard**: drops endpoint pair with live edges → `400 schema_breaking` BEFORE write (§4.2).
- **Three caches**: schema (LRU 60s/32), edge-endpoints (LRU 60s/256 — FR-04a), per-label attribute-zod (lazy, selective invalidation) — all subscribe to one EventEmitter (§6).
- **SSE endpoint**: `/api/v1/ontology/events` with 30s keepalive, `_OntologyEvent` collection persisting events for `Last-Event-ID` replay (§5.4); daily 5-min pruning by the audit-retention pass (§10).
- **graph-core refactor**: `bootstrap.ts` iterates the registry (§7.1); `storage/edges.ts` consults the runtime cache (§7.2); `api/src/ontology/seed.ts` is the SOLE legal importer of compile-time `NODE_LABELS`/`EDGE_TYPES` (AC-15).
- **Audit archive**: daily 03:00 cron → `data/ontology-manager/audit-archive/YYYY-MM.jsonl.gz` (§10 — namespaced per pass-2 OA-1).

**File-changes summary**: 24 new files, 6 edits to graph-core, 0 deletes.

**Next**: large-spec design review pass 1 of 2 via the spec-review sub-agent.

**User stories owned** (10): OA-1.1, OA-1.2, OA-1.3, OA-1.4 (Schema curation) · OA-2.1, OA-2.2, OA-2.3 (Catalog management) · OA-3.1, OA-3.2, OA-3.3 (Schema safety)

**Persona**: P1 — Maya, Ontology Author. Owns the canonical model; weekly / ad-hoc cadence; success criterion is "zero schema drift after 6 months; every type has a definition + example."

**Depends on**: `graph-core` (must be approved through design before this spec's design phase opens — this spec mutates `graph-core/api/src/storage/*` and `bootstrap.ts`).

**Sizing rationale**: 17 FRs, 18 ACs, refactors `graph-core`'s storage layer, introduces 6 new tables + 13+ REST endpoints + a YAML/JSON import/export round-trip + a JSON Patch audit log. > 10 files. Classified **large** — requires a design phase + design review + task review.

**Verification:**
- `verified_at`: 2026-05-23
- `verification_artifact`: `bun test shared/__tests__/ontology-schema.test.ts api/__tests__/ontology-*.test.ts api/__tests__/ontology-*.integration.test.ts → 169 tests across 18 files, 168 pass / 1 skip / 0 fail / 665 expect() calls / 3.98 s. Live verification: server running at 127.0.0.1:8787 responds to all 18 ontology routes (GET /api/v1/schema, 5×2 CRUD routes for node-labels + edge-types, /audit /versions /export, POST /rollback/:id /migrations /import, SSE /events). Registry seeded with 6 base labels + 6 edge types + 8 endpoint pairs. AC-15 grep test green — only seed.ts uses NODE_LABELS/EDGE_TYPES as runtime data; other importers are typed-only.`

**Artifacts:**
- 📄 Requirements: `.claude/specs/ontology-manager/requirements.md`
- 📄 Design: `.claude/specs/ontology-manager/design.md` (pending)
- 📄 Tasks: `.claude/specs/ontology-manager/tasks.md` (pending)
- 📝 Reviews: `.claude/specs/ontology-manager/review-*.md` (pending)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — OA-1..OA-3)

**Open design questions** (carried from requirements §Risks for the design phase to resolve):

1. Registry storage backend — Neo4j `_meta` namespace vs separate SQLite. Recommend Neo4j.
2. Multi-tenant actor wiring — schema column shape now, migration data-only later.
3. In-process vs polling cache invalidation for downstream specs.
4. How `graph-core`'s `NODE_LABELS` const continues to provide TS narrowing once it's no longer the runtime authority (NFR-02).
5. Rollback when orphans exist — refuse with `409 rollback_orphans` (recommended) vs accept + surface.
6. Audit-log retention window (default indefinite + daily archive).
7. YAML+JSON dual-accept on import; JSON canonical on export.

**Next**:
1. Requirements gate (this spec) — user approval, then large-spec review pass via the spec-review sub-agent.
2. After approval → design phase, which must resolve the 7 open questions above.

**Changelog:**
- 2026-07-04: traceability backfill (as-built). Two gap tokens annotated in tasks.md trace columns, no scope change: (a) T-19 now cites the `process-explorer-ui/FR-28` browser-consumer contract already named in requirements FR-17 and design §Risks (SSE endpoint shipped in `api/src/routes/ontology-events.ts`, verified by `api/__tests__/ontology-events-sse.integration.test.ts`); (b) T-15 now cites story-level `OA-1.1 AC-3` (non-retroactive attribute addition per FR-05/AC-03, verified as-built by the `"AC-03: schema patch does NOT retroactively rewrite existing rows"` case in `api/__tests__/ontology-attribute-enforcement.integration.test.ts`).
