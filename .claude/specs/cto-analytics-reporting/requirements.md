---
feature: "cto-analytics-reporting"
created: "2026-07-04"
author: "spec-author"
status: "approved"
approved_by: "frank (inherited from cto-analytics revision 3)"
approved_at: "2026-07-04"
size: "large"
depends_on: ["graph-core", "ontology-manager", "cto-analytics"]
inherited_from: "cto-analytics/requirements.md revision 3 (FR-08, FR-10, FR-11, FR-11a deferred by owner decision RD-6)"
user_stories_source: "companygraph-user-stories.html v0.1 — persona P4 (Karim, CTO / Analyst); story AN-3.2 (quarterly exec-summary PDF) + the precompute/settings infra that AN-2.1/AN-3.1 lean on"
requirements_provenance: "The four FRs below are carried VERBATIM (same IDs FR-08/FR-10/FR-11/FR-11a, same ACs AC-08/AC-09/AC-13/AC-16/AC-17/AC-18) from cto-analytics's approved requirements. They are cross-referenced by number across cto-analytics's tasks.md (T-15..T-18 deferral-ratification tasks). Do NOT renumber."
---

# Requirements: cto-analytics-reporting

## Status note — requirements are inherited & pre-approved

This spec is the **follow-up** that `cto-analytics` deferred to (owner
decision **RD-6**, 2026-07-04 — see `cto-analytics/design.md` §10 and its
`tasks.md` T-15..T-18). Its four requirements — **FR-08** (exec-summary
PDF + graph-state hash), **FR-10** (nightly precompute scheduler + cache
tables), **FR-11** (settings + audit), **FR-11a** (cache-snapshot read
endpoint) — were written, reviewed (requirements pass-1 + pass-2), and
**approved** as part of `cto-analytics`'s requirements. They are carried
here **verbatim, keeping the same FR/AC IDs** because they are
cross-referenced by number throughout `cto-analytics` (its T-15..T-18
each cite this spec by name and keep citing AC-08/09/13/16/17/18).

Therefore `requirements.md` here ships `status: approved` (inherited /
pre-reviewed). The **load-bearing new review** for this spec is the
**design** — the PDF pipeline, byte-determinism protocol, scheduler
lock, and cache/settings storage are genuinely new engineering that
warrants explicit design sign-off (that is *why* RD-6 deferred them).
`design.md` and `tasks.md` ship `status: draft` pending that review.

## Summary

`cto-analytics-reporting` adds the **reproducible reporting +
precompute** layer on top of the seven live analytics report GETs that
`cto-analytics` shipped. Four capabilities:

1. **Executive-summary PDF export (FR-08 / AN-3.2)** — a server-side,
   **byte-reproducible** PDF for Karim's quarterly review. `GET
   /api/v1/analytics/exec-summary.pdf` returns `application/pdf`; the PWA
   route `#/analytics/exec-summary/export` is a thin launcher that hits
   the API and triggers a download (no client-side PDF rendering). The
   PDF covers top-5 journeys by complexity (with sub-scores), top-3
   consolidation candidates, top-3 AI candidates, and carries a
   **graph-state hash** (canonical-JSON SHA-256) on a page-1 monospace
   footer and in the PDF `/Subject` metadata so any two renders against
   the same cache snapshot are byte-identical and independently
   verifiable.

2. **Nightly precompute scheduler + cache tables (FR-10)** — a cron job
   (default `0 2 * * *`, operator `TZ`) that precomputes journey scores,
   system metrics, and AI-candidate flags into four SQLite cache tables
   (isolated from chat's SQLite). Report endpoints serve from cache;
   stale cache (> 25 h) is surfaced as `{degraded:true,last_run_at}` but
   still served. `?refresh=true` triggers a **lock-protected** on-demand
   recompute. Before each run the AI-candidate definition keys are
   validated against `ontology-manager`'s live schema.

3. **Settings + audit (FR-11)** — an `analytics_settings` row
   (complexity weights, scheduler cron, PDF brand options, AI-candidate
   definition) with `GET`/`PATCH /api/v1/analytics/settings`; every
   PATCH writes an `analytics_settings_audit (ts, before, after,
   actor)` row so a PDF reader comparing two hash footers can trace
   which weight change caused the drift.

4. **Cache-snapshot read endpoint (FR-11a)** — `GET
   /api/v1/analytics/snapshot/:last_run_at` returns the exact cache
   contents the PDF was rendered from, so an external verifier can
   re-derive the hash.

This spec is **read-only against the graph** — it never mutates Neo4j
(the inherited no-graph-write invariant). Its only writes are to its own `analytics_*` SQLite
cache/settings/audit tables. It depends on `cto-analytics` for the
complexity / consolidation / AI-candidate compute engines it caches and
renders (`api/src/analytics/{complexity,consolidation,ai-candidates,
system-map}.ts`), and on the shared read-only Neo4j module
(`api/src/neo4j/read-only-graph.ts`, RD-1) for graph reads.

## Inherited decisions (binding, from `cto-analytics`)

These are already-made decisions this spec builds under. Do not re-open.

| Ref | Decision | Source |
|-----|----------|--------|
| RD-1 | All analytics graph reads go through the shared read-only module `api/src/neo4j/read-only-graph.ts`; **no** `getDriver()`/`driver.session()` inside `api/src/analytics/`. This spec's cache-capture read obeys it. | cto-analytics design §10 RD-1 |
| RD-6 | FR-08/FR-10/FR-11/FR-11a are the four deferred FRs; this spec owns them. The BUILD-set report GETs already ship live in `cto-analytics`. | cto-analytics design §10 RD-6 |
| RD-2 | Complexity score is the canonical weighted `depth × distinctSystems × distinctRoles` (`api/src/analytics/complexity.ts`). FR-08's hash `weights` and FR-10's cache reuse this engine. | cto-analytics design §10 RD-2 |
| RD-4a | AI-candidate vocabulary is `repetition`/`data_richness`/`leverage_score` with the code-default definition `{repetition=="high" AND data_richness=="high" AND leverage_score>=0.5}`. FR-10 validates these keys against ontology-manager before each run. | cto-analytics design §10 RD-4a |
| §10.2 | Complexity weights + AI-candidate definition ship as code-default constants (`ANALYTICS_COMPLEXITY_WEIGHTS`, `ANALYTICS_AI_CANDIDATE_DEFINITION` in `api/src/analytics/routes.ts`). FR-11 turns these into the tunable, audited `analytics_settings` row; the code-defaults become the seed defaults for that row. | cto-analytics design §10.2 |
| House rules | en-US identifiers; `zod` is the only validation library; no `tsc` (transpile via `bun build --no-bundle`); all routes under `/api/v1/`; NFR-08 response envelope (`{error:{code,message,details?}}` on error). No auth code paths in this spec's source (settings + scheduler are single-tenant; the PDF download has no recipient identity). | graph-core / CLAUDE.md |

## Functional Requirements

> The four FRs below are carried **verbatim** from `cto-analytics`'s
> approved requirements (revision 3), keeping the same IDs and priority.
> The `priority: deferred` annotation there becomes `priority: must`
> here — this spec is where they get built. The requirement TEXT is
> unchanged; only the "deferred" preamble is dropped.

### Executive-summary PDF (AN-3.2)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-08 | **Executive summary PDF export — cache-snapshot-grounded hash.** `#/analytics/exec-summary/export` is a PWA-side **launcher route** that hits the API endpoint `GET /api/v1/analytics/exec-summary.pdf`; **no client-side PDF rendering**. The API endpoint generates the PDF server-side and returns `application/pdf`. PDF covers: top 5 journeys by complexity (with sub-scores), top 3 consolidation candidates (activities with most `USES_SYSTEM` edges), top 3 AI candidates. **Hash basis** (precise field list, derived from `graph-core`'s actual export shape — edge `updatedAt` does NOT exist; edges are immutable post-creation in graph-core): hash input is `{snapshot_id, nodes, edges, weights}` where: (a) `snapshot_id = analytics_journey_scores.last_run_at` (the cache run id — pinning the hash to the cache snapshot, NOT the live graph); (b) `nodes` is the cache-snapshot list of `{id, label, attributes_parsed, updatedAt}` rows; (c) `edges` is the cache-snapshot list of `{id, type, fromId, toId, attributes_parsed, createdAt}` rows (no `updatedAt`); (d) `weights` is the `analytics_settings` weight row at PDF-render time (depth_weight, system_weight, role_weight). PDF body includes `last_run_at` (the cache snapshot timestamp) so a verifier can distinguish "same graph, different cache" from "different graph". **Hash placement**: visible page-1 footer in monospace (e.g. `"graph-state hash: 4f3a…b9c1 · cache snapshot: 2026-05-22T18:30:00Z"`) AND PDF metadata `/Subject` field (the canonical-data location). **Verifiability**: a reader can re-derive the hash by calling the new `GET /api/v1/analytics/snapshot/:last_run_at` endpoint (FR-11a) which returns the exact cache contents. | must | AN-3.2 |

### Precompute infrastructure

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-10 | **Nightly precompute scheduler + on-demand refresh.** A job runs nightly at the operator-configured cron expression (default `0 2 * * *` in the operator's `TZ` env var) that computes complexity scores for every journey, integration density for every system, and AI-candidate flags. Results land in `analytics_journey_scores` + `analytics_system_metrics` + `analytics_ai_candidates` (SQLite, isolated from `chat-interface`'s SQLite). Endpoints serve from these tables; if stale (`last_run_at > 25h ago`), endpoints return `{degraded: true, last_run_at}` in the response envelope but still serve the stale data. **On-demand refresh**: every endpoint accepts `?refresh=true` which triggers a lock-protected on-demand recompute; a second concurrent `?refresh=true` call returns the in-progress run's eventual result (no double-execution). **Schema-coupling validation**: before each precompute run, the scheduler validates that the `analytics_ai_candidate_definition` row's `repetition_key` and `richness_key` exist in `ontology-manager`'s `Activity` attribute schema (`GET /api/v1/schema`). On mismatch, the precompute skips the AI-candidate pass and writes a structured banner row to `analytics_alerts` table (rendered in PWA Overview): `"AI-candidate definition references attribute '<key>' which is not registered on Activity — visit ontology-manager"`. | must | AN-2.1 (implied) |
| FR-11 | **Settings table + audit.** `analytics_settings` stores complexity score weights (depth_weight, system_weight, role_weight; all defaults `1.0`) + scheduler cron expression + PDF brand options + AI-candidate definition. `GET /api/v1/analytics/settings` + `PATCH /api/v1/analytics/settings`. **Audit on every PATCH**: writes a row to `analytics_settings_audit (ts, before, after, actor)` so PDF readers comparing two hash headers can trace which weight change caused the drift. Same shape as `graph-core`'s structured-logging requirement (its FR for structured logging). | must | AN-2.1 |
| FR-11a | **Cache-snapshot read endpoint.** `GET /api/v1/analytics/snapshot/:last_run_at` returns the exact cache contents (`analytics_journey_scores`, `analytics_system_metrics`, `analytics_ai_candidates`, `analytics_settings` weights row, all keyed at `last_run_at`) used by FR-08's PDF generation. Used by external verifiers to re-derive the hash. | must | AN-3.2 |

## Non-Functional Requirements

> These four NFRs are the subset of `cto-analytics`'s NFRs that the
> deferred FRs depend on, carried forward with the same intent. They keep
> the `cto-analytics` numbering where a direct correspondence exists and
> are re-lettered `NFR-R*` where this spec adds a constraint of its own.

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-04 | **PDF generation is byte-reproducible** — given the same graph-state hash (= same `{snapshot_id, nodes, edges, weights}` tuple per NFR-05), two renders against the **same cache snapshot** produce **byte-identical** PDF output. All non-deterministic PDF internals (CreationDate, ModDate, Producer, Creator, xref timestamps, font subset ordering) MUST be pinned to fixed deterministic values; the only date that varies is the cache snapshot's `last_run_at`, drawn from the cache row (so it too is deterministic for a given snapshot). | data-integrity |
| NFR-05 | **Graph-state hash protocol — binding.** Hash input is the tuple `{snapshot_id, nodes, edges, weights}` serialised by these eight rules: **(a)** outer object keys alphabetically sorted; **(b)** `nodes` and `edges` arrays sorted by `id` ASC (UUIDv7 lexicographic order); **(c)** each node/edge object's keys alphabetically sorted; **(d)** each node/edge's `attributes` field is the **parsed object** (NOT the stored `attributes_json` string) with its keys **recursively** alphabetically sorted before serialisation; **(e)** numeric values serialised without locale-dependent formatting (ECMAScript `Number#toString`, no padding/grouping); **(f)** string values UTF-8 NFC-normalised (`String.prototype.normalize("NFC")`); **(g)** embedded newlines use `\n` (LF), never `\r\n`; **(h)** hash algorithm SHA-256, hex-encoded lowercase. Documented inline in the design (no separate `hash-protocol.md` — the contract lives with the code so it cannot drift). The design MUST reuse `graph-core`'s existing `canonicalStringify` (`api/src/storage/modules.ts`) where its behaviour matches, and document any deltas (attribute-parse + NFC rules). | reproducibility |
| NFR-R3 | **Precompute budget** — a nightly precompute run completes within a 30-minute budget on the `retail-mini` seed; should also complete within 30 min on a realistic 10k-node retail org. (Carries the intent of `cto-analytics`'s precompute-budget NFR.) | performance |
| NFR-R1 | **SQLite isolation** — the `analytics_*` tables live in a **separate** SQLite database file from `chat-interface`'s chat DB (`CHAT_DB_PATH`). A new `ANALYTICS_DB_PATH` env var (default `./data/analytics.sqlite`) resolves the file; the module follows the `api/src/chat/persistence.ts` lifecycle pattern (module-scoped singleton, `CREATE TABLE IF NOT EXISTS` DDL, WAL). | architecture |
| NFR-R2 | **No new closed-enum error code removal** — this spec adds at most additive `ERROR_CODES` entries (non-breaking per NFR-11) and reuses existing codes (`not_found`, `invalid_payload`) wherever possible. The `/settings` PATCH validation rides the shared `parseWith → invalid_payload` channel. | api-quality |
| NFR-08 | Response envelope follows `graph-core/NFR-05` — success returns the resource (via `ok()`); errors return `{error:{code,message,details?}}` (via `error()`). The `degraded` flag (FR-10) rides **inside** a success envelope, never as an error. | api-quality |
| NFR-R5 | TypeScript transpiles cleanly with `bun build --no-bundle` (no `tsc`). | reliability |

## Scope Boundaries

**In scope:**
- Server-side exec-summary PDF generator (`pdfkit`), deterministic; the
  `GET /api/v1/analytics/exec-summary.pdf` endpoint; the tiny PWA
  launcher route + view.
- The graph-state hash protocol module (NFR-05, 8 rules), reused by the
  PDF and re-derivable via the snapshot endpoint.
- The nightly precompute scheduler (hooked into the existing `node-cron`
  in `api/src/server.ts`), the four cache tables, the staleness/`degraded`
  envelope, the `?refresh=true` lock protocol, and the ontology
  schema-coupling validation + `analytics_alerts` banner.
- `analytics_settings` + `analytics_settings_audit`, `GET`/`PATCH
  /api/v1/analytics/settings`.
- `GET /api/v1/analytics/snapshot/:last_run_at` (cache-snapshot read).
- Wiring the **degraded envelope** onto the 7 existing live report GETs
  so they carry `{degraded, last_run_at}` when the cache is stale and
  honour `?refresh=true`.

**Out of scope (tracked elsewhere or deferred):**
- The 7 report compute engines themselves — owned by `cto-analytics`
  (`api/src/analytics/{complexity,consolidation,ai-candidates,
  single-system,critical-path,system-map,graph}.ts`). This spec **caches
  and renders** them; it does not re-implement them.
- The 7 report GETs' route dispatch (`api/src/analytics/routes.ts`) —
  owned by `cto-analytics` T-14. This spec extends the dispatcher's
  behaviour (degraded envelope, refresh) via a minimal edit, not a
  rewrite.
- PDF customisation beyond the `analytics_settings` brand fields
  (operator logo/footer) — minimal v1.
- Email-the-PDF / Slack-the-PDF — download only.
- Historical trend analysis / multi-snapshot diffing — the snapshot
  endpoint serves one snapshot; trend UIs are a future spec.
- Multi-tenant / auth on the settings or PDF — single-tenant, loopback
  (no auth code paths in this spec's source).
- ML-based AI-candidate scoring — the AI pass reuses `cto-analytics`'s
  rule-based engine.

## Acceptance Criteria

> AC-08, AC-09, AC-13, AC-16, AC-17, AC-18 are carried **verbatim** from
> `cto-analytics` (its T-15..T-18 keep citing them so they stay
> traceable). AC-R* are added here for the new surfaces this spec builds
> that `cto-analytics` did not enumerate an AC for (config seeding, the
> launcher route, the degraded-envelope wiring on the 7 report GETs).

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-08 | Exec-summary PDF generates with the named sections (top-5 complexity + top-3 consolidation + top-3 AI); hash visible on page-1 footer (monospace) + PDF metadata `/Subject`; two renders against the **same cache snapshot** (`last_run_at` identical) produce byte-identical PDF; two renders across a nightly cache refresh produce different PDFs (FR-08, NFR-04, NFR-05) | n/a (server) | `api/__tests__/analytics-exec-summary-pdf.test.ts` — (a) render twice against the same fixture cache snapshot, `expect` the two `Uint8Array` PDF bodies deep-equal (byte-identical); (b) render once, mutate `analytics_settings` weights, re-render against a fresh snapshot, `expect` both the hash footer AND the PDF bytes to change; (c) assert the PDF `/Subject` metadata and the page-1 footer text both contain the same 64-char lowercase-hex hash; (d) manual: on macOS Chrome open the downloaded PDF, verify the footer reads `"graph-state hash: <64-hex> · cache snapshot: <ISO>"` and Get Info → PDF metadata `/Subject` carries the same hash |
| AC-09 | Graph-state hash protocol robustly deterministic across all 8 NFR-05 rules (NFR-05) | n/a (server) | `api/__tests__/analytics-hash-determinism.test.ts` — given a fixture snapshot: (a) compute the hash 10× → `expect` all equal; (b) permute input `nodes`/`edges` array order → hash unchanged (rule b); (c) permute an attribute-map key order (`{a:1,b:2}` vs `{b:2,a:1}`) → hash unchanged (rule d); (d) change a weight in `weights` → hash changes; revert → hash reverts (FR-11 tie-in); (e) a node `name` in decomposed vs composed Unicode form (`"Café"` NFD vs NFC) → same hash (rule f) |
| AC-13 | Nightly scheduler runs; report endpoints serve from cache; staleness > 25 h surfaces `{degraded:true,last_run_at}`; `?refresh=true` triggers a lock-protected on-demand recompute (no double-exec); ontology schema-coupling validated each run (FR-10) | n/a (server) | `api/__tests__/analytics-scheduler.test.ts` — (a) invoke `runPrecompute()` manually → `expect` rows in all cache tables + a fresh `last_run_at`; (b) set the cache `last_run_at` to now−26 h, read a report → `expect` `degraded:true` + `last_run_at` in the envelope, data still present; (c) start a `runPrecompute()`, call `runPrecompute()` again while in-flight → `expect` the second call resolves to the SAME run result (single execution — assert the underlying compute ran once via a spy/counter); (d) point the AI-candidate definition at a `repetition_key` absent from a stubbed `GET /api/v1/schema` → `expect` the AI pass skipped and an `analytics_alerts` row with the named banner text |
| AC-16 | A nightly precompute completes within 30 min on `retail-mini` (NFR-R3) | n/a (server) | `api/__tests__/analytics-scheduler-budget.test.ts` — measure `runPrecompute()` wall-clock against the seeded `retail-mini` graph → `expect` < 30 min (the assertion is generous; the real target is seconds at this scale). The 10k-node stress fixture case is `manual:` gated behind `RUN_ANALYTICS_STRESS=1` (env var since the fixture is large) — `expect` wall-clock < 30 min |
| AC-17 | Every PATCH to `/api/v1/analytics/settings` writes an `analytics_settings_audit (ts, before, after, actor)` row (FR-11) | n/a (server) | `api/__tests__/analytics-settings-audit.test.ts` — GET the settings, PATCH `depth_weight` to a new value, `expect` (i) the GET now returns the new value, (ii) exactly one new `analytics_settings_audit` row exists whose `before` carries the prior weight and `after` the new weight, and `actor` is populated (single-tenant default actor) |
| AC-18 | `GET /api/v1/analytics/snapshot/:last_run_at` returns the exact cache contents at that timestamp (FR-11a) | n/a (server) | `api/__tests__/analytics-snapshot-endpoint.test.ts` — precompute a snapshot, render the PDF (capturing its footer hash), call `/snapshot/:last_run_at` with that `last_run_at`, re-derive the hash from the returned `{snapshot_id,nodes,edges,weights}` using the NFR-05 protocol module → `expect` it equals the PDF's hash; an unknown `last_run_at` → `expect` 404 `not_found` envelope |
| AC-R1 | The scheduler + cache module seed `analytics_settings` from the `cto-analytics` code-default constants (`ANALYTICS_COMPLEXITY_WEIGHTS`, `ANALYTICS_AI_CANDIDATE_DEFINITION`) on first init, so the tunable row starts equal to the shipped code-defaults (design §10.2 tie-in) | n/a (server) | `api/__tests__/analytics-settings-seed.test.ts` — init a fresh `analytics.sqlite`, GET `/api/v1/analytics/settings` → `expect` weights `{1.0,1.0,1.0}`, cron `"0 2 * * *"`, and the AI-candidate definition equal to `ANALYTICS_AI_CANDIDATE_DEFINITION` |
| AC-R2 | The exec-summary launcher route `#/analytics/exec-summary/export` exists in the PWA, hits `GET /api/v1/analytics/exec-summary.pdf`, and triggers a download without rendering the PDF client-side (FR-08 launcher clause) | iPhone Safari (touch/Share), iPad Safari (touch), macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | `pwa/src/__tests__/analytics-exec-summary-launcher.test.tsx` — render `<AnalyticsExecSummary>`, click "Download exec summary", `expect` a fetch/navigation to `/api/v1/analytics/exec-summary.pdf` and a download trigger (anchor `download` attr or `navigator.share` on iOS); assert **no** PDF library is imported into the PWA bundle (grep the view's imports). Manual on iPad Safari: tap the button → the Share sheet offers "Save to Files" |
| AC-R3 | The 7 shipped report GETs carry `{degraded,last_run_at}` when the cache is stale and honour `?refresh=true`, while still returning the NFR-08 success envelope (FR-10 wiring over the shipped set) | n/a (server) | `api/__tests__/analytics-degraded-envelope.test.ts` — for each of the 7 report GETs (`systems`, `matrix`, `consolidation`, `complexity`, `single-system-journeys`, `critical-paths`, `ai-candidates`): with a fresh cache → `expect` NO `degraded` flag; with a stale cache → `expect` `degraded:true`+`last_run_at`; with `?refresh=true` → `expect` a fresh `last_run_at` and no `degraded` flag |

## Platforms & Input Modes

Most of this spec is server-side (PDF, scheduler, cache, settings,
snapshot). The single PWA surface is the exec-summary **launcher** view —
a button that triggers a download. No canvas, no gestures, no keyboard
handlers beyond a focusable button.

| Surface | iPhone Safari (touch) | iPad Safari (touch) | macOS Safari (trackpad+kb) | macOS Chrome (mouse+kb) |
|---------|-----------------------|---------------------|-----------------------------|--------------------------|
| Exec-summary launcher button (FR-08) | yes (download via Share sheet) | yes | yes (download) | yes (download) |
| PDF download trigger | yes (`navigator.share` fallback to `<a download>`) | yes | yes | yes |

## Native Conflicts

The only client surface is a download button.

| Conflicting native behaviour | Affected surface | Suppression mechanism |
|------------------------------|------------------|------------------------|
| `<a download>` on Safari iOS sometimes opens the file in-tab instead of downloading | Exec-summary PDF download (FR-08) | Use the Share-sheet flow on iOS (`navigator.share()` / `navigator.canShare` with the fetched `File` blob) when available; fall back to `<a download>` with a "tap and choose Save to Files" hint. (Same mechanism `cto-analytics` T-13 used for the CSV export.) |
| Browser back-button navigates away mid-PDF-generation | Exec-summary launcher | Generation is fast (< 5 s on `retail-mini` cache — the PDF renders from the cache snapshot, not a live graph traversal). Button shows a "generating…" spinner; no hard suppression needed. |
| (none) — no gesture/scroll/keyboard capture on this surface | n/a | n/a |

## Dependencies

| Module/API | How it's affected |
|------------|-------------------|
| `cto-analytics` | **Hard dependency.** Reuses its compute engines (`api/src/analytics/{complexity,consolidation,ai-candidates,system-map}.ts`) for the PDF sections + cache precompute, and its code-default config constants (`ANALYTICS_COMPLEXITY_WEIGHTS`, `ANALYTICS_AI_CANDIDATE_DEFINITION` in `api/src/analytics/routes.ts`) as the settings seed. Extends its route dispatcher (`api/src/analytics/routes.ts`) for the degraded envelope + refresh + the three new endpoints. |
| `graph-core` | Hard dependency. Reuses `canonicalStringify` (`api/src/storage/modules.ts`) as the hash serialiser base (NFR-05). Node/edge cache-capture reads the graph via the shared read-only module. Envelope helpers `ok()`/`error()` (`api/src/routes/_helpers.ts`). |
| `ontology-manager` | Soft dependency — FR-10 validates the AI-candidate definition keys against `GET /api/v1/schema` before each precompute run; on mismatch the AI pass is skipped and an `analytics_alerts` banner is written. |
| `api/src/neo4j/read-only-graph.ts` (RD-1) | The cache-capture read uses this module. **Gap noted for design (DD)**: its current `GRAPH_QUERY` edge projection lacks edge `id`/`attributes_json`/`createdAt` and its node projection carries full `properties` but not a split `updatedAt` — FR-08's hash basis needs those. The design MUST add a dedicated snapshot-capture Cypher (a richer projection) rather than rely on the existing `GRAPH_QUERY`. |
| `pdfkit` + `@types/pdfkit` | **New runtime dependency** (API workspace). Pure-JS, Bun-server-compatible, low-level enough to pin the PDF's internal CreationDate/ModDate/Producer to deterministic values (the byte-reproducibility requirement NFR-04). Install: `bun add pdfkit @types/pdfkit` (scaffolding task). |
| `bun:sqlite` | Cache/settings/audit tables in a **separate** DB file (`ANALYTICS_DB_PATH`, default `./data/analytics.sqlite`), following the `api/src/chat/persistence.ts` pattern. |
| `node-cron` | Already a dependency (`api/src/server.ts` runs the audit-retention job). The nightly precompute registers a second scheduled task in the same server bootstrap. |
| `zod` | Validation on `PATCH /settings` and the snapshot param, via `parseWith`. |
| `.env.example` | Adds `ANALYTICS_DB_PATH` + documents that `TZ` and the scheduler cron govern the precompute time; `env.ts` gains the `analyticsDbPath` field. |

## Risks & Open Questions

Most product/architecture decisions were resolved by `cto-analytics`'s
RD ledger (see Inherited Decisions). The genuinely open items are
**design-phase decisions** for the reviewer, captured here and expanded
in `design.md` §DD / §Open Questions:

1. **PDF byte-determinism (FR-08 / NFR-04).** `pdfkit` by default embeds
   wall-clock CreationDate/ModDate and a Producer/Creator string. The
   design MUST spell out exactly how these are pinned (fixed info-dict
   dates, stable font embedding, no incremental xref timestamp) so two
   renders of the same snapshot are byte-identical. **This is the
   load-bearing design decision the reviewer will scrutinise.**

2. **Snapshot-capture read shape (FR-08 hash basis).** The existing
   `read-only-graph.ts` `GRAPH_QUERY` does not project the exact fields
   the hash needs (edge `id`/`attributes`/`createdAt`, node `updatedAt`).
   Design decides: a dedicated snapshot Cypher in the cache module vs
   extending `GRAPH_QUERY`. Recommend a **dedicated** capture query
   scoped to the cache module to avoid perturbing the shared reader other
   analytics modules depend on.

3. **Refresh lock granularity (FR-10).** A single in-process
   Promise-based mutex (one run at a time, concurrent `?refresh=true`
   awaits the in-flight run) is the recommended design — single-tenant,
   single-process, no cross-process lock needed. Design confirms.

4. **`actor` identity for the audit row (FR-11 / AC-17).** Single-tenant
   with no auth in this spec → `actor` is a fixed sentinel (e.g.
   `"local-operator"`). Design records this; if a future auth spec lands,
   the field is already present to fill.

5. **Scheduler TZ edge-handling (carried from cto-analytics OQ, deferred
   here with RD-6).** `node-cron` interprets the cron expression in the
   operator's `TZ`. Design notes DST/`TZ`-unset behaviour; no code branch
   beyond passing `TZ` through.
