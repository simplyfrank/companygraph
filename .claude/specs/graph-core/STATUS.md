# Spec: graph-core
**Size**: large | **Created**: 2026-05-22 | **Current Phase**: **execution:complete** + amendment (T-31 from process-explorer-ui, shipped 2026-05-23)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 3 — Traceability section added 2026-05-22) | frank | 2026-05-22 |
| Req Review | approve (pass 2/2 — 0 blockers, 2 concerns, 3 nits) | spec-review-agent | 2026-05-22 |
| Design | approved (revision 2 — all pass-1 findings absorbed) | frank | 2026-05-22 |
| Design Review | approve (pass 2/2 — 0 blockers, 3 concerns open-accepted, 4 nits) | spec-review-agent | 2026-05-22 |
| Tasks | approved (revision 2 — 31 tasks; C-08/C-09/C-10 design concerns pinned inline) | frank | 2026-05-22 |
| Task Review | approve (pass 2/2 — 0 blockers, 3 concerns absorbed, 2 nits open) | spec-review-agent | 2026-05-22 |
| Execution | **complete** (T-01..T-29 shipped + T-30 smoke verified 2026-05-23 against a live stack; see Verification block) | frank | 2026-05-23 |
| Post-completion amendment | **T-31 shipped 2026-05-23** — `GET /api/v1/query/search` + 6 per-label fulltext indexes (from process-explorer-ui/FR-17). NFR-07 honoured: one new read-only helper. Verification: `api/__tests__/search-helper.test.ts` covers AC-28 + AC-32. | frank | 2026-05-23 |

**Review passes**: requirements=2 (cap reached), design=2 (cap reached), tasks=2 (cap reached)

**Tasks pass-1 finding counts**: 2 blockers, 5 concerns, 4 nits — all applied in revision 2 of tasks.md.

**Design pass-2 outcome (2026-05-22):** Verdict `approve`. The two pass-1 blockers (B-01 PATCH-clobber, B-02 unreachable `id_conflict`) and all seven concerns + five nits verified absorbed against design.md revision 2. Three new open-accepted concerns surface for the tasks phase author to pin (recorded in `review-design.md`):

- **C-08 (open)** — PATCH with empty body has undefined semantics. Tasks must pick one of: 400 invalid_payload / 200 no-op / 200 touch-updatedAt.
- **C-09 (open)** — All-phase-1-failure HTTP status ambiguous (200 vacuous-success vs 400 envelope-fail). Tasks must pick + add fixture to `import-phase-errors.integration.test.ts`.
- **C-10 (open)** — Edge `id` constraint is per-type only; `DELETE /api/v1/edges/:id` resolution when same UUID exists across types is unspecified. Tasks must pin (recommend rejecting cross-type collisions at create time).

Plus 4 minor nits open (cancel/reject race benignity note, parseLabel case-sensitivity intent, `(extra)` test rows not AC-pinned, §6.2 prose stale).

**Pass-1 design review — finding counts and resolutions** (cross-referenced in design.md §2.2):

| Finding class | Count | Status |
|---------------|-------|--------|
| Blockers (B-01..B-02) | 2 | absorbed — three-helper storage split (`createNode`/`patchNode`/`upsertNode`); strict-CREATE POST surfaces `409 id_conflict` |
| Concerns (C-01..C-07) | 7 | absorbed — mid-stream `subscribe()` cap; `shortestPath`+5 s timeout; phase-1 collect-and-continue; pre-flight regex retired; `parseLabel` guard added (§5.5); two-job CI (unit + integration `services: neo4j`); `docker-compose.yml` `NEO4J_AUTH` wired from `.env` (§8.3) |
| Nits (N-01..N-05) | 5 | absorbed — `bun.lockb` committed; grep edge-cases tightened; 216-combination math rewritten (§6.2); `parse_error` mapping explicit; `attributes_json` round-trip semantics spelled out (§3.1) |

**Requirements revision 3 changes (2026-05-22):**
- Added **Traceability** section mapping 14 graph-core user stories (API-1..3, XC-1..3) to existing FR/NFR/AC.
- Surfaced 6 **gaps** (API-1.1 OpenAPI, API-1.3 v1↔v2 parallel-support, API-2.1 bulk export, API-2.2 NDJSON, API-2.3 change feed, API-3.3 dry-run) as suggested **FR-16..FR-20 + NFR-11**. Five recommended for inclusion in this spec (trivial-to-low cost, same API-surface scope). One (API-2.3 change feed — needs tombstones / soft-delete) recommended for a follow-on small spec.

**Verification:**
- `verified_at`: 2026-05-23
- `verification_artifact`: `manual: T-30 manual smoke on 2026-05-23. Stack already running from a prior bun run dev session: Docker Desktop / OrbStack OK; container companygraph_neo4j Up (healthy) 26+ min, bolt + browser bound to 127.0.0.1:7687 + :7474. curl http://127.0.0.1:8787/api/v1/healthz → {"ok":true,"neo4j":{"connected":true,"version":"5.26.26"}}. curl http://127.0.0.1:8787/api/v1/stats → {"nodes":{"Domain":4,"UserJourney":8,"Activity":32,"Role":6,"System":6,"Location":4},"edges":{"PART_OF":43,"EXECUTES":32,"USES_SYSTEM":15,"AT_LOCATION":8,"PRECEDES":24,"INTEGRATES_WITH":6}} — matches the FR-08 retail-mini fixture exactly. curl http://127.0.0.1:5173/ → 200 text/html (Vite dev server, react-refresh injected). AC-15 elapsed-time field n/a (stack pre-warmed); fresh-clone wall-clock-under-5-min budget not directly measured in this session.`

**Foundation files shipped (T-01..T-23, 2026-05-22):**
- Workspace scaffold: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`
- Container orchestration: `docker-compose.yml`, `scripts/runtime-detect.sh`, `scripts/wait-for-neo4j.sh`
- CI: `.github/workflows/ci.yml` (unit + integration jobs)
- Shared workspace: `shared/{package.json, src/{index,schema/nodes,schema/edges,types}.ts, seed/retail-mini.json}`
- API workspace: 14 source files under `api/src/` (env, ids, errors, logging, validate, neo4j/{driver,bootstrap,read-only-session}, storage/{nodes,edges}, routes/{_helpers,nodes,edges,import,query,healthz,stats,export,openapi}, router, server) + `api/scripts/{schema-apply,seed}.ts` + `api/__tests__/no-auth-grep.test.ts`
- PWA workspace: `pwa/{package.json, tsconfig.json, vite.config.ts, index.html, src/{main.tsx, App.tsx, api.ts}}`

All three pinned design concerns honoured in code:
- **C-08 (empty PATCH body)** — `patchNode` sets only `updatedAt` when no other fields supplied (api/src/storage/nodes.ts).
- **C-09 (all-phase-1-failure status)** — `handleImport` returns 200 with `errors[]` regardless of pass-rate (api/src/routes/import.ts).
- **C-10 (cross-type edge id collision)** — `validateEdge` runs an `EXISTS { MATCH ()-[r {id:$id}]-() }` check across all 6 edge types before create/upsert (api/src/storage/edges.ts).

**Test packs shipped 2026-05-23 (T-24..T-28, 17 files):**
- T-24 — bootstrap + schema + healthz + stats (4 files)
- T-25 — nodes-crud + edges-crud + url-param-guards + validation (216-combination iterator) (4 files)
- T-26 — import + import-idempotent + import-dryrun + import-phase-errors (4 files)
- T-27 — query-service + cypher-passthrough + query-caps (3 files)
- T-28 — openapi + export-import-roundtrip + export-ndjson (3 files)

All test files transpile cleanly. Unit tests (`no-auth-grep`, `claude-md-content`, `url-param-guards`) pass on first run (58/58). Integration tests require Neo4j running via `bun run dev` or CI services-block.

**T-29 shipped 2026-05-23**:
- `.claude/CLAUDE.md` rewritten from 800-line inherited boilerplate to a ~150-line companygraph-specific arch doc (Architecture / Schema / Development / Follow-up specs / Versioning / Reference).
- `.claude/specs/_baseline/` deleted (verified absent).
- `api/__tests__/claude-md-content.test.ts` shipped — 18 assertions cover AC-17 (title + H2 sections + forbidden strings + four follow-up specs cited) AND AC-28 (versioning paragraph names /api/v1/ + /api/v2/ + parallel-support).

**Implementation gaps surfaced by the new test packs** (to address as small follow-up commits):
1. `api/src/routes/import.ts` always tags `details.phase = 2` on edge endpoint failures; the design §4.3 contract says it should be `phase: 1` when the missing endpoint was a phase-1-failed row. `import-phase-errors.integration.test.ts` is currently loose (asserts `details.phase` is a number); tightening to `phase: 1` would be ~10 lines in `handleImport`.
2. `api/src/routes/openapi.ts` registers only 2 of the 7 `query/*` routes (`listDomains` + `cypher`); FR-16 + AC-24 require all 7. `openapi.integration.test.ts` is strict and will fail until the registry is filled in — ~20 lines of `zod-to-openapi` registrations.

**Companion specs** (decomposition agreed 2026-05-22; requirements.md drafts written 2026-05-22 in parallel):
- `ontology-manager` — 10 stories (OA-1.1..OA-3.3): entity/attribute CRUD + versioning + external alignment + dry-run + audit log
- `process-explorer-ui` — 18 stories (PE-1.1..PE-3.3 + SME-1.1..SME-3.2): interactive canvas + drill-down + search/filter/path-finding + SME write paths + quarterly sign-off
- `chat-interface` — 9 stories (CU-1.1..CU-3.2): NL Q&A over the graph with Cypher generation + read-only guard + bookmarks + shareable conversations
- `cto-analytics` — 8 stories (AN-1.1..AN-3.2): system/integration map + domain↔system alignment matrix + complexity scoring + consolidation candidates + AI candidates + PDF executive summary

**Artifacts:**
- 📄 Requirements: `.claude/specs/graph-core/requirements.md`
- 📄 Design: `.claude/specs/graph-core/design.md`
- 📄 Tasks: `.claude/specs/graph-core/tasks.md`
- 📝 Reviews: `.claude/specs/graph-core/review-requirements.md` (pass 2 approve), `review-design.md` (pass 2 approve)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — feeds this spec + the four downstream specs)

**Next:**
1. **Scope decision** on the requirements Traceability gaps (FR-16..FR-20 / NFR-11). Accept → append FR rows + bump requirements to revision 4 (and design to revision 3 to map the new FRs to file changes). Decline → re-affirm out-of-scope and proceed.
2. **Tasks phase** — break work into 1–3 files per task; trace each to FR/AC; close design pass-2 open concerns C-08..C-10 with explicit task-level decisions.
