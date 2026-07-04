---
feature: "cto-analytics-reporting"
created: "2026-07-04"
author: "spec-author"
status: "approved"
size: "large"
total_tasks: 10
reviewing_requirements_status: "approved (inherited from cto-analytics rev 3)"
reviewing_design_status: "revised (pass-1 findings absorbed; awaiting pass-2)"
note: "status:revised — pass-1 design-review findings (B-01/B-02, C-01..C-05, N-01..N-03) absorbed into the paired design + these tasks; awaiting design review pass-2. Tasks are dependency-ordered. Every file each task touches is also listed in design §7; the spec-guard hook (enforced:true) requires both."
---

# Tasks: cto-analytics-reporting

## Reading guide

Ten build tasks, dependency-ordered. IDs start at **T-00** for this spec
(new numbering — not shared with `cto-analytics`'s T-01..T-21). Each task
lists **Files** (must match design §7), **Implements** (FR + DD),
**Closes** (AC), **Depends on**, **Definition of Done**, and
**Verification** (a real test path or `manual:` repro).

**Dependency spine:** T-00 (add `pdfkit`) → T-01 (cache DB + env) →
{ T-02 (hash), T-03 (settings) } → T-04 (scheduler, needs capture+cache+
settings) → T-05 (PDF, needs hash+cache+settings) → T-06 (snapshot,
needs cache+hash) → T-07 (degraded wiring on the 7 GETs, needs cache) →
T-08 (PWA launcher, needs the endpoint) → T-09 (router mounts, needs the
handlers). T-04 is the foundational compute task; T-01/T-02 are the two
lowest-level foundations.

**FR/AC coverage map** (every FR + AC reaches a task):
- FR-08 → T-02, T-05, T-06, T-09 · FR-10 → T-01, T-04, T-07 · FR-11 → T-03, T-09 · FR-11a → T-06, T-09.
- AC-08 → T-05 · AC-09 → T-02 · AC-13 → T-04 · AC-16 → T-04 · AC-17 → T-03 · AC-18 → T-06 · AC-R1 → T-03 · AC-R2 → T-08 · AC-R3 → T-07.

---

### T-00 — Scaffold: add `pdfkit` dependency ✅

- **Files** (1): `api/package.json` (modify — add `pdfkit` to `dependencies`, `@types/pdfkit` to `devDependencies`)
- **Implements**: FR-08 (DD-02 — `pdfkit` chosen over `@react-pdf/renderer`/`puppeteer`); prerequisite for the deterministic PDF generator (T-05)
- **Closes**: — (enabling task)
- **Depends on**: —
- **Complexity**: simple
- **Definition of Done**: `bun add pdfkit @types/pdfkit` run from `api/`; `api/package.json` + `bun.lock` updated; `bun run typecheck` green (imports resolve). No PDF code yet.
- **Verification**: `manual: from api/ run "bun add pdfkit @types/pdfkit" then "bun run typecheck" — expect typecheck to pass and pdfkit to appear in api/package.json dependencies; run "bun -e \"import('pdfkit')\"" — expect the import to resolve without error`
- **Done (2026-07-04)**: `bun add pdfkit` → `pdfkit@^0.19.1` in `api/package.json` dependencies; `bun add -d @types/pdfkit` → `@types/pdfkit@^0.17.6` in devDependencies; `bun.lock` updated. Gates green: `bun run typecheck` passed; `bun -e "import('pdfkit')"` resolved (`pdfkit resolved: function`). No PDF code yet (T-05 owns `exec-summary.ts`).

### T-01 — Cache SQLite module + tables + env var (FR-10 storage) ✅

- **Files** (3): `api/src/analytics/reporting/cache.ts` (new — 5 cache tables `analytics_run`/`analytics_journey_scores`/`analytics_system_metrics`/`analytics_ai_candidates`/`analytics_alerts` — `analytics_run.status` carries `CHECK (status IN ('ok','ai_skipped'))` per N-02, `bun:sqlite` singleton mirroring `chat/persistence.ts`, WAL, one-arg `withCacheEnvelope(body)` + `STALE_THRESHOLD_MS`, and the retention helpers `SNAPSHOT_RETENTION = 7` + `pruneSnapshots()` per DD-12), `api/src/env.ts` (modify — add `analyticsDbPath` from `ANALYTICS_DB_PATH`, default `./data/analytics.sqlite`), `.env.example` (modify — document `ANALYTICS_DB_PATH`)
- **Implements**: FR-10 (DD-06 cache tables, NFR-R1 isolated DB file, DD-10 `withCacheEnvelope`, DD-12 retention helpers)
- **Closes**: — (advances AC-13/AC-R3 — closing tests land in T-04/T-07)
- **Depends on**: —
- **Complexity**: moderate
- **Definition of Done**: `initAnalyticsDb()` creates all 5 tables idempotently in a **separate** file from the chat DB; `withCacheEnvelope(body)` (single argument) returns `body` when fresh and `{...body,degraded:true,last_run_at}` when the latest `analytics_run.last_run_at` is > 25 h old; `pruneSnapshots()` clears `nodes_json`/`edges_json` for all but the latest `SNAPSHOT_RETENTION` (=7) runs; write/read helpers for each table exported and typed; `bun run typecheck` green.
- **Verification**: `api/__tests__/analytics-cache.test.ts` (also listed in design §7.5 — N-01) — (a) init a temp `ANALYTICS_DB_PATH`, `expect` the 5 tables to exist and be distinct from the chat DB path; (b) write a run with `last_run_at` = now, `expect withCacheEnvelope(body)` to omit `degraded`; (c) write a run with `last_run_at` = now−26 h, `expect withCacheEnvelope(body)` to add `degraded:true`+`last_run_at`; (d) write 8 runs then `pruneSnapshots()`, `expect` the oldest run's `nodes_json`/`edges_json` to be empty and the latest 7 to be intact. Plus `bun run typecheck`.
- **Done (2026-07-04)**: `api/src/analytics/reporting/cache.ts` (new — 5 tables with `analytics_run.status CHECK IN ('ok','ai_skipped')` per N-02, `bun:sqlite` WAL singleton mirroring `chat/persistence.ts`, one-arg `withCacheEnvelope(body)` + `STALE_THRESHOLD_MS` (25 h), `SNAPSHOT_RETENTION=7` + `pruneSnapshots()` per DD-12, typed `writeRun`/`writeAlert` + per-table readers), `api/src/env.ts` (added `analyticsDbPath` from `ANALYTICS_DB_PATH`, default `./data/analytics.sqlite`), `.env.example` (documented `ANALYTICS_DB_PATH`). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-cache.test.ts` → **6 pass / 0 fail** (48 asserts); AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 11 pass (new subdir stays clean — cache.ts has no Neo4j driver use). Verification artifact: `api/__tests__/analytics-cache.test.ts`.

### T-02 — Graph-state hash protocol module (FR-08 / NFR-05) ✅

- **Files** (2): `api/src/analytics/reporting/hash.ts` (new — `graphStateHash(input)`, the 8-rule protocol reusing `canonicalStringify` from `api/src/storage/modules.ts` + NFC + id-sort per DD-04), `api/__tests__/analytics-hash-determinism.test.ts` (new)
- **Implements**: FR-08 (hash basis), NFR-05 (8 rules), DD-04
- **Closes**: AC-09
- **Depends on**: —
- **Complexity**: moderate
- **Definition of Done**: `graphStateHash({snapshot_id,nodes,edges,weights})` returns a 64-char lowercase hex SHA-256; deterministic under array-order permutation (rule b), attribute-key permutation (rule d), and Unicode NFD/NFC variance (rule f); weight change flips the hash. `bun run typecheck` green.
- **Verification**: `api/__tests__/analytics-hash-determinism.test.ts` — the five sub-cases in requirements AC-09 verification plus a rule-(g) case: (a) 10× equal; (b) node/edge order permutation → unchanged; (c) attribute-map key-order permutation → unchanged; (d) weight change → changes, revert → reverts; (e) `"Café"` NFD vs NFC → same hash; (f) a string VALUE containing `\r\n` vs the same value with `\n` → same hash (rule g value-CRLF, C-05).
- **Done (2026-07-04)**: `api/src/analytics/reporting/hash.ts` (new — `graphStateHash(input)` reusing `canonicalStringify` from `api/src/storage/modules.ts` for rules a/c/e/g; layered rule (b) id-sort of `nodes`/`edges`, rule (d) already-parsed `attributes` maps, rule (f) recursive NFC, rule (g) value-CRLF→LF via `normalizeString`; `createHash("sha256")…digest("hex")` rule (h); `HashNode`/`HashEdge` shapes match `cache.ts` `SnapshotNode`/`SnapshotEdge` per C-04), `api/__tests__/analytics-hash-determinism.test.ts` (new). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-hash-determinism.test.ts` → **8 pass / 0 fail** (shape + 6 AC-09 sub-cases a–f); AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 10 pass (new `hash.ts` uses no Neo4j driver, no graph-write imports). No pwa view touched → design-conformance n/a. Verification artifact: `api/__tests__/analytics-hash-determinism.test.ts`.

### T-03 — Settings table + audit + GET/PATCH (FR-11) ✅

- **Files** (3): `api/src/analytics/reporting/settings.ts` (new — `analytics_settings` single-row + `analytics_settings_audit` DDL, seed from `ANALYTICS_COMPLEXITY_WEIGHTS`/`ANALYTICS_AI_CANDIDATE_DEFINITION` per DD-08, `getSettingsRow`, `patchSettings(patch, actor="local-operator")` writing an audit row per DD-09, zod `settingsPatchSchema`), `api/src/analytics/reporting-routes.ts` (new — `handleGetSettings` + `handlePatchSettings` using `parseWith`; other handlers added by T-05/T-06), `api/__tests__/analytics-settings-audit.test.ts` (new)
- **Implements**: FR-11 (settings + audit), DD-08 (seed), DD-09 (sentinel actor)
- **Closes**: AC-17, AC-R1
- **Depends on**: T-01 (shares the analytics SQLite DB file/singleton)
- **Complexity**: moderate
- **Definition of Done**: `GET /api/v1/analytics/settings` returns the seeded row (weights 1.0, cron `"0 2 * * *"`, AI-def equal to the code-default); `PATCH` validates via `parseWith` (bad body → `invalid_payload` 400), applies the patch, and writes exactly one `analytics_settings_audit` row with `before`/`after`/`actor`. `bun run typecheck` green.
- **Verification**: `api/__tests__/analytics-settings-audit.test.ts` (AC-17 — PATCH `depth_weight`; `expect` the GET reflects it and one audit row carries prior+new value+actor) **and** `api/__tests__/analytics-settings-seed.test.ts` (new; AC-R1 — fresh DB → GET returns code-default weights/cron/AI-def). Both listed in this task's coverage; the seed test file is created here.

> Note: `analytics-settings-seed.test.ts` is created by this task alongside the audit test (both exercise `settings.ts`); design §7.5 lists both under T-03.

- **Done (2026-07-04)**: `api/src/analytics/reporting/settings.ts` (new — `analytics_settings` single-row + `analytics_settings_audit` DDL, DD-08 seed from `ANALYTICS_COMPLEXITY_WEIGHTS`/`ANALYTICS_AI_CANDIDATE_DEFINITION` + `"0 2 * * *"`, `getSettingsRow`/`patchSettings(patch, actor="local-operator")` writing exactly one audit row per DD-09, `settingsPatchSchema` `.strict()` + `validateSettingsPatch` via `parseWith`; reuses cache.ts `getAnalyticsDb()` singleton — no second SQLite file, no Neo4j driver), `api/src/analytics/reporting-routes.ts` (new sibling handlers module per DD-01 — `handleGetSettings` + `handlePatchSettings`; `ValidationError` caught locally so the 400 renders identically before T-09 wires the router). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-settings-audit.test.ts api/__tests__/analytics-settings-seed.test.ts` → **10 pass / 0 fail** (38 asserts) — AC-17 (PATCH `depth_weight` → GET reflects it + one before/after/`local-operator` audit row; bad body/unknown-field/non-JSON → `invalid_payload` 400, no audit row) and AC-R1 (fresh DB → weights 1.0, cron `"0 2 * * *"`, empty `pdf_brand`, AI-def == code-default; idempotent seed writes no audit row); AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 11 pass (new subdir modules use no Neo4j driver, no graph-write imports). No pwa view touched → design-conformance n/a. Verification artifacts: `api/__tests__/analytics-settings-audit.test.ts` (AC-17), `api/__tests__/analytics-settings-seed.test.ts` (AC-R1).

### T-04 — Nightly precompute scheduler + capture + lock + ontology validation (FR-10) ✅

- **Files** (3): `api/src/analytics/reporting/capture.ts` (new — dedicated snapshot-capture Cypher `SNAPSHOT_QUERY` + `captureSnapshot()` via `runReadOnlyGraph` per DD-05/RD-1; parses `attributes_json`→ the `attributes` field per C-04), `api/src/analytics/reporting/scheduler.ts` (new — `runPrecompute()` with the Promise-mutex lock DD-07, ontology AI-key validation by importing ontology-manager's schema-cache accessor **directly in-process, no HTTP** (N-03), reuse of `cto-analytics` compute engines, cache writes + `analytics_alerts` banner, **`pruneSnapshots()` retention call at the end of `writeRun()`** per DD-12/C-03), `api/src/server.ts` (modify — `initAnalyticsDb()` at bootstrap + register the precompute `cron.schedule(settings.scheduler_cron, runPrecompute)`)
- **Implements**: FR-10 (scheduler + cache write + staleness source + `?refresh=true` recompute + schema-coupling validation), FR-11a (retention → pruned-run snapshot behaviour), DD-05, DD-07, DD-12 (N=7 retention prune)
- **Closes**: AC-13, AC-16
- **Depends on**: T-01 (cache — provides `writeRun`/`pruneSnapshots`/`SNAPSHOT_RETENTION`), T-03 (settings weights + AI definition read)
- **Complexity**: complex
- **Definition of Done**: `runPrecompute()` captures a snapshot, reads weights + AI-def from settings, validates AI keys against the ontology-manager schema cache in-process (skips the AI pass + writes an `analytics_alerts` banner on mismatch), computes journey scores / system metrics / AI candidates via the cto-analytics engines, writes an `analytics_run` header + the three score tables, and **prunes the `nodes_json`/`edges_json` blobs of all but the latest 7 runs (DD-12)**; a concurrent call awaits the in-flight run (single execution). Server bootstrap registers the cron task using `settings.scheduler_cron`. `bun run typecheck` green.
- **Verification**: `api/__tests__/analytics-scheduler.test.ts` (AC-13 — (a) manual invoke → cache rows + fresh `last_run_at`; (b) stale cache → `degraded:true`; (c) concurrent `runPrecompute()` → same run, compute ran once via a spy/counter; (d) AI-key mismatch vs a stubbed schema → AI pass skipped + `analytics_alerts` banner) **and** `api/__tests__/analytics-scheduler-budget.test.ts` (AC-16 — `runPrecompute()` on `retail-mini` wall-clock < 30 min; 10k-node stress `manual:` gated behind `RUN_ANALYTICS_STRESS=1`).
- **Done (2026-07-04)**: `api/src/analytics/reporting/capture.ts` (new — dedicated `SNAPSHOT_QUERY` projecting the hash-basis fields + node `name`; `captureSnapshot()` via `runReadOnlyGraph` per DD-05/RD-1; `partitionSnapshotRows()` parses `attributes_json`→`attributes` (rule (d)/C-04), dedupes nodes, and carries `namesById` alongside so the hash basis stays name-free while the compute engines still get names), `api/src/analytics/reporting/scheduler.ts` (new — `runPrecompute()` with the module-level Promise-mutex lock DD-07, in-process AI-key validation via `getAttributeValidator("Activity")` — no HTTP, N-03; reuses the `cto-analytics` `computeComplexity`/`computeSystemMap`/`computeAiCandidates` engines via `GraphNode`/`GraphEdge` adapters; `writeRun()` header + 3 score tables + `analytics_alerts` banner on AI-key mismatch; `pruneSnapshots()` fires inside `writeRun()` per DD-12/C-03; `_precomputeRunCount()` test seam), `api/src/server.ts` (modify — `initAnalyticsDb()`+`initAnalyticsSettings()` at bootstrap; `cron.schedule(settings.scheduler_cron, runPrecompute)` with `cron.validate` guard + shutdown `precomputeTask.stop()`/`closeAnalyticsDb()`). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-scheduler.test.ts api/__tests__/analytics-scheduler-budget.test.ts` → **5 pass / 1 skip (env-gated stress) / 0 fail** (23 asserts) — AC-13 (a) fresh cache rows + no `degraded`, (b) stale→`degraded:true`, (c) concurrent→same `last_run_at` + single execution (mutex + capture counter), (d) AI-key mismatch→`ai_skipped`+alert banner; AC-16 retail-mini precompute far under the 30-min budget; AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 11 pass (new subdir modules read via `read-only-graph.ts`, import the ontology accessor by function, use no `getDriver()`/graph-write imports). No pwa view touched → design-conformance n/a. Verification artifacts: `api/__tests__/analytics-scheduler.test.ts` (AC-13), `api/__tests__/analytics-scheduler-budget.test.ts` (AC-16). Live scheduler/capture path (needs seeded Neo4j) — `manual: bun run dev + bun run seed, then trigger runPrecompute via GET /api/v1/analytics/complexity?refresh=true (T-07) once wired — expect a fresh last_run_at and an analytics_run row`.

### T-05 — Deterministic exec-summary PDF generator + endpoint (FR-08) ✅

- **Files** (2): `api/src/analytics/reporting/exec-summary.ts` (new — `renderExecSummaryPdf(snapshot):Promise<Uint8Array>` using `pdfkit` with the DD-03 determinism protocol: **all determinism-critical metadata pinned via the `PDFDocument` constructor `info` option** — `CreationDate`/`ModDate` = `new Date(0)`, `Producer`/`Creator` = `"companygraph"` — so pdfkit's `generateFileID` hashes fixed values and the trailer `/ID` is deterministic (B-02); `compress:false`; **standard-14 `Courier` via `doc.font("Courier")`, no `registerFont`, no vendored/embedded font (B-01)**; hash in `/Subject` (set post-construction) + page-1 monospace footer; top-5 complexity / top-3 consolidation / top-3 AI sections from the cache run), `api/src/analytics/reporting-routes.ts` (modify — add `handleExecSummaryPdf` returning `application/pdf`). **No `api/assets/fonts/` asset (B-01 — OQ-1 resolved to standard-14 Courier).**
- **Implements**: FR-08 (PDF + hash placement), NFR-04 (byte-determinism, incl. deterministic trailer `/ID` — B-02), DD-02, DD-03
- **Closes**: AC-08
- **Depends on**: T-00 (`pdfkit`), T-02 (hash), T-01 (cache run source), T-03 (settings weights for the hash `weights`)
- **Complexity**: complex
- **Definition of Done**: `renderExecSummaryPdf` is pure w.r.t. its snapshot argument — two calls with the same snapshot return byte-identical `Uint8Array`s **including the trailer `/ID` array** (achieved by pinning `info` at construction, B-02 — do NOT set the dates post-construction); the PDF uses standard-14 `Courier` with no embedded font stream (B-01); the PDF `/Subject` and the page-1 footer both carry the same 64-hex `graphStateHash`; the endpoint renders from the latest `analytics_run` (triggering a `runPrecompute()` if none) and returns `application/pdf` + `content-disposition: attachment`. `bun run typecheck` green.
- **Verification**: `api/__tests__/analytics-exec-summary-pdf.test.ts` (AC-08 — (a) render twice on the same fixture cache snapshot → deep-equal bytes (whole `Uint8Array`, so the trailer `/ID` is asserted equal too — B-02); (b) mutate weights, re-render on a fresh snapshot → hash footer + bytes change; (c) `/Subject` and footer contain the same hash; (d) `manual:` open the downloaded PDF in macOS Chrome → footer `"graph-state hash: <64-hex> · cache snapshot: <ISO>"` + Get Info `/Subject` carries the same hash).
- **Done (2026-07-04)**: `api/src/analytics/reporting/exec-summary.ts` (new — `renderExecSummaryPdf(snapshot):Promise<Uint8Array>` via `pdfkit` with the DD-03/B-02 determinism protocol: `PDFDocument` constructor `info` pins `CreationDate`/`ModDate`=`new Date(0)` + `Producer`/`Creator`="companygraph" so `generateFileID` hashes fixed values and the trailer `/ID` is deterministic; `compress:false`; standard-14 `Courier` via `doc.font("Courier")` — no `registerFont`, no embedded font, no vendored TTF (B-01); `doc.info.Subject = graphStateHash(...)` set post-construction; page-1 monospace footer `"graph-state hash: <64-hex> · cache snapshot: <ISO>"`; top-5 journeys by complexity `score` / top-3 systems by degree (consolidation) / top-3 AI candidates by leverage — all from the cache run via `getJourneyScores`/`getSystemMetrics`/`getAiCandidates`; deterministic `fmt()` number formatting, no `Date.now`/locale; `hashInputForRun(run)` exported so the endpoint + test build the same `HashInput`), `api/src/analytics/reporting-routes.ts` (modify — add `handleExecSummaryPdf()` reading the latest `analytics_run` (triggering `runPrecompute()` if none / pruned), rendering, and returning `application/pdf` + `content-disposition: attachment`; null-run fallback reuses closed-enum `not_found`, no new `ERROR_CODES`). Verified pdfkit byte-determinism empirically (two renders → identical bytes incl. trailer `/ID`). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-exec-summary-pdf.test.ts` → **4 pass / 0 fail** (13 asserts) — AC-08 (a) two renders on the same snapshot deep-equal incl. explicit `/ID` array equality (B-02); (b) weight mutation flips footer hash + bytes, revert reverts; (c) `/Subject` (indirect object) + hex-decoded page-1 footer carry the same 64-hex hash; plus a B-01 guard (`/Courier` present, no `/FontFile*` stream); AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 11 pass (new `exec-summary.ts` consumes a cache snapshot, uses no Neo4j driver / graph-write imports). No pwa view touched → design-conformance n/a. Verification artifact: `api/__tests__/analytics-exec-summary-pdf.test.ts` (AC-08). Live endpoint path (needs seeded Neo4j + router mount T-09) — `manual: bun run dev + bun run seed, then curl -s 127.0.0.1:8787/api/v1/analytics/exec-summary.pdf -o /tmp/e.pdf; file /tmp/e.pdf — expect "PDF document"; open /tmp/e.pdf in macOS Chrome → footer "graph-state hash: <64-hex> · cache snapshot: <ISO>" + Get Info /Subject carries the same hash`.

### T-06 — Cache-snapshot read endpoint (FR-11a) ✅

- **Files** (2): `api/src/analytics/reporting-routes.ts` (modify — add `handleSnapshot(lastRunAt)` returning the exact `analytics_run` snapshot + score tables + weights keyed at `last_run_at`; **`404 not_found` on an unknown `last_run_at` OR a pruned run (empty `nodes_json`, DD-12/C-03)**), `api/__tests__/analytics-snapshot-endpoint.test.ts` (new)
- **Implements**: FR-11a (cache-snapshot read for hash re-derivation), DD-12 (pruned-run → `not_found`)
- **Closes**: AC-18
- **Depends on**: T-01 (cache), T-02 (hash — the test re-derives it)
- **Complexity**: moderate
- **Definition of Done**: `GET /api/v1/analytics/snapshot/:last_run_at` returns `{snapshot_id,nodes,edges,weights, journey_scores, system_metrics, ai_candidates}` for a known, unpruned `last_run_at`; a `404 not_found` envelope for an unknown one **and for a pruned run whose snapshot blob was cleared beyond the N=7 window** (DD-12). The returned `{snapshot_id,nodes,edges,weights}` re-derives the same hash `hash.ts` produces. `bun run typecheck` green.
- **Verification**: `api/__tests__/analytics-snapshot-endpoint.test.ts` (AC-18 — precompute a run, render the PDF capturing its footer hash, call `/snapshot/:last_run_at`, re-derive via `graphStateHash` → `expect` equal to the PDF hash; unknown `last_run_at` → 404 `not_found`; a pruned run (blob cleared by `pruneSnapshots()`) → 404 `not_found` per DD-12/C-03).
- **Done (2026-07-04)**: `api/src/analytics/reporting-routes.ts` (modify — added `handleSnapshot(lastRunAt)` returning `{snapshot_id,nodes,edges,weights,journey_scores,system_metrics,ai_candidates}` via `getRun`/`getJourneyScores`/`getSystemMetrics`/`getAiCandidates`; `snapshot_id`=`run.last_run_at` (DD-06) so the `{snapshot_id,nodes,edges,weights}` subset is exactly `hash.ts`'s `HashInput` and re-derives the run's PDF footer hash; `404 not_found` on BOTH an unknown `last_run_at` AND a pruned run (`run.pruned`, empty `nodes_json`) per DD-12/C-03 — reuses the closed-enum `not_found`, no new `ERROR_CODES`), `api/__tests__/analytics-snapshot-endpoint.test.ts` (new). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-snapshot-endpoint.test.ts` → **3 pass / 0 fail** — AC-18 (seed a run, render the PDF, capture the footer hash, call `handleSnapshot`, re-derive `graphStateHash` from the body → equal to the PDF hash AND to `hashInputForRun(run)`; full seven-field shape asserted), unknown `last_run_at` → 404 `not_found`, pruned run (N+1 runs seeded so `pruneSnapshots()` clears the oldest blob; header present + `pruned:true`) → 404 `not_found` while the newest stays 200; AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 11 pass (handler consumes the cache, uses no Neo4j driver / graph-write imports). No pwa view touched → design-conformance n/a. Live router-mount path (T-09) — `manual: with the stack up (bun run dev) + seed, curl -si 127.0.0.1:8787/api/v1/analytics/snapshot/nonexistent — expect a 404 not_found envelope; a known last_run_at → a 200 with the seven-field body`. Verification artifact: `api/__tests__/analytics-snapshot-endpoint.test.ts` (AC-18).

### T-07 — Degraded-envelope + refresh wiring on the 7 report GETs (FR-10) ✅

- **Files** (2): `api/src/analytics/routes.ts` (modify — `handleAnalyticsReport` serves from cache, honours `?refresh=true` via `runPrecompute()`, and wraps each of the 7 report bodies through `withCacheEnvelope` per DD-10; a `report:string` → `refresh:boolean` param is threaded), `api/__tests__/analytics-degraded-envelope.test.ts` (new)
- **Implements**: FR-10 (staleness envelope + `?refresh=true` over the shipped 7 GETs), DD-10
- **Closes**: AC-R3
- **Depends on**: T-01 (`withCacheEnvelope`), T-04 (`runPrecompute` for `?refresh=true`)
- **Complexity**: moderate
- **Definition of Done**: each of the 7 report GETs (`systems`, `matrix`, `consolidation`, `complexity`, `single-system-journeys`, `critical-paths`, `ai-candidates`) returns the unchanged NFR-08 success body when the cache is fresh, adds `{degraded:true,last_run_at}` when stale, and returns a fresh (non-degraded) body when called with `?refresh=true`. The existing `cto-analytics` scaffold/report behaviour is preserved. `bun run typecheck` green; the `cto-analytics` `analytics-routes-scaffold.test.ts` + `analytics-envelope.test.ts` still pass.
- **Verification**: `api/__tests__/analytics-degraded-envelope.test.ts` (AC-R3 — for each of the 7 GETs: fresh cache → no `degraded`; stale cache → `degraded:true`+`last_run_at`; `?refresh=true` → fresh `last_run_at`, no `degraded`). Plus `manual: with the stack up (bun run dev) + seed, curl -s "127.0.0.1:8787/api/v1/analytics/complexity?refresh=true" — expect a 200 envelope with a fresh last_run_at and no degraded flag`.
- **Done (2026-07-04)**: `api/src/analytics/routes.ts` (modify — `handleAnalyticsReport(report, refresh=false)` threads the `report:string → refresh:boolean` param per DD-10; each of the 7 report bodies (`systems` live + the 6 scaffold reports) now serves through `wrapEnvelope(body)` → `withCacheEnvelope` (guarded by `getAnalyticsDbPath() !== null` so the driver-free scaffold/envelope harnesses that never boot the cache do not hit a "not initialised" throw); `?refresh=true` awaits `runPrecompute()` before serving so the wrapped body is non-degraded. `scaffoldPending()` refactored to `scaffoldPendingBody()` returning a `Record<string,unknown>` so the envelope wraps it; `SystemMap` spread into a plain record to satisfy `withCacheEnvelope`'s `Record<string,unknown>` bound. `runPrecompute` is imported LAZILY (dynamic `import("./reporting/scheduler")` inside the refresh branch) to avoid closing the eager module cycle `routes.ts → scheduler → settings/complexity/ai-candidates → routes.ts` (the code-default `ANALYTICS_*` consts live in `routes.ts`); `cache.ts` has no back-import so it stays a top-level import), `api/__tests__/analytics-degraded-envelope.test.ts` (new). Gates: `bun run typecheck` PASS; `bun test api/__tests__/analytics-degraded-envelope.test.ts` → **7 pass / 0 fail** (83 asserts) — AC-R3 (fresh run → no `degraded` for all 6 driver-free GETs; stale run (now−26 h) → `degraded:true`+`last_run_at` inside the 200 success envelope; 24 h boundary NOT degraded; post-refresh fresh latest run → non-degraded; `refresh=false` default stays driver-free; unknown report → 404 `not_found`; no cache run at all → 200 non-degraded). DoD preservation: `bun test api/__tests__/analytics-routes-scaffold.test.ts api/__tests__/analytics-envelope.test.ts` → **still pass** (16 tests). AC-11/AC-12 guard tests (`analytics-no-direct-driver`, `analytics-no-write-imports`) → 11 pass (modified `routes.ts` uses no `getDriver()`/graph-write imports). No pwa view touched → design-conformance n/a. Live `systems` + `?refresh=true` recompute (need seeded Neo4j + router thread of the `?refresh` query flag, T-09) — `manual: with the stack up (bun run dev) + seed, curl -s "127.0.0.1:8787/api/v1/analytics/complexity?refresh=true" — expect a 200 envelope with a fresh last_run_at and no degraded flag; hand-age the run > 25 h then curl the same route without ?refresh — expect the body + {degraded:true,last_run_at}`. Verification artifact: `api/__tests__/analytics-degraded-envelope.test.ts` (AC-R3).

### T-08 — PWA exec-summary launcher view + route (FR-08) ✅

- **Files** (4): `pwa/src/views/analytics/ExecSummary.tsx` (new — `ViewHeader` + "Download exec summary" button; fetch `/api/v1/analytics/exec-summary.pdf` → blob → `navigator.canShare` share-sheet on iOS else `<a download>`; **no PDF library imported**), `pwa/src/views/analytics/ExecSummary.module.css` (new — tokens-only styles), `pwa/src/route.ts` (modify — register the `exec-summary/export` tab under the `analytics` surface), `pwa/src/views/index.tsx` (modify — VIEWS entry `"exec-summary/export": () => <AnalyticsExecSummary/>`)
- **Implements**: FR-08 (launcher clause — PWA hits the API, no client-side rendering), DD-05 (PWA §5.8), Native Conflicts (iOS share-sheet download)
- **Closes**: AC-R2
- **Depends on**: T-05 (the endpoint exists), T-09 (router mount) for the live download; the view + test can land before the mount using a fetch mock
- **Complexity**: moderate
- **Definition of Done**: `#/analytics/exec-summary/export` resolves to `<AnalyticsExecSummary>`; clicking the button fetches the PDF endpoint and triggers a download (share-sheet on iOS, `<a download>` fallback); the view imports **no** PDF library. `bun run typecheck` green; `bun run scripts/design-conformance.ts --view pwa/src/views/analytics/ExecSummary.tsx` clean.
- **Verification**: `pwa/src/__tests__/analytics-exec-summary-launcher.test.tsx` (AC-R2 — render, click "Download exec summary" → `expect` a fetch to `/api/v1/analytics/exec-summary.pdf` + a download trigger; grep the view's imports → `expect` no `pdfkit`/`@react-pdf`/`pdf` import). Plus `manual: on iPad Safari tap the button → the Share sheet offers "Save to Files"`.

### T-09 — Router mounts for the 4 new routes (FR-08/FR-11/FR-11a) ✅

- **Files** (1): `api/src/router.ts` (modify — one fenced `// BEGIN cto-analytics-reporting` … `// END` block mounting `GET analytics/exec-summary.pdf`, `GET analytics/settings`, `PATCH analytics/settings`, `GET analytics/snapshot/:last_run_at`, placed ABOVE the existing `analytics/([^/]+)` report regex per DD-11)
- **Implements**: FR-08, FR-11, FR-11a (route dispatch), DD-11
- **Closes**: — (the AC-08/17/18/R1 handlers are exercised via their own tests; this task wires them into the live router)
- **Depends on**: T-03 (settings handlers), T-05 (exec-summary handler), T-06 (snapshot handler)
- **Complexity**: simple
- **Definition of Done**: the four literal routes resolve before the parameterized report regex (so `settings`/`exec-summary.pdf`/`snapshot/...` are not swallowed); each dispatches to its `reporting-routes.ts` handler; the fenced block is self-contained for easy merge. `bun run typecheck` green.
- **Verification**: `manual: with the stack up (bun run dev), curl -s 127.0.0.1:8787/api/v1/analytics/settings — expect a 200 settings envelope; curl -si -X PATCH 127.0.0.1:8787/api/v1/analytics/settings -d '{"depth_weight":2}' -H 'content-type: application/json' — expect a 200 with the updated weight; curl -s 127.0.0.1:8787/api/v1/analytics/exec-summary.pdf -o /tmp/e.pdf; file /tmp/e.pdf — expect "PDF document"; curl -si 127.0.0.1:8787/api/v1/analytics/snapshot/nonexistent — expect a 404 not_found envelope`. (The `settings` route must not be shadowed by the report regex — verify `curl` returns settings JSON, not a report 404.)

## Build order summary

| # | Task | Complexity | Files | Foundational? |
|---|------|-----------|-------|---------------|
| T-00 | add pdfkit | simple | 1 | yes (enables T-05) |
| T-01 | cache DB + env | moderate | 3 | yes (foundation) |
| T-02 | hash protocol | moderate | 2 | yes (foundation) |
| T-03 | settings + audit + GET/PATCH | moderate | 3 | — |
| T-04 | scheduler + capture + lock | complex | 3 | yes (compute core) |
| T-05 | deterministic PDF + endpoint | complex | 2 | — |
| T-06 | snapshot endpoint | moderate | 2 | — |
| T-07 | degraded wiring on 7 GETs | moderate | 2 | — |
| T-08 | PWA launcher view + route | moderate | 4 | — |
| T-09 | router mounts | simple | 1 | — |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks touching `pwa/src/views/` (T-08) | `bun run scripts/design-conformance.ts --view <file>` |
| T-01..T-09 | `scripts/spec/spec-traceability.sh .claude/specs/cto-analytics-reporting` — expect exit 0 |
| final task | `bun test` (unit) + `bun test:integration` (needs Neo4j for scheduler/capture live paths) + full AC sweep |
