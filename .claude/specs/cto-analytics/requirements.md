---
feature: "cto-analytics"
created: "2026-05-22"
author: "frank"
status: "approved"
approved_by: "frank"
approved_at: "2026-05-22"
revision: 2
size: "medium"
depends_on: ["graph-core", "ontology-manager", "process-explorer-ui"]
user_stories_source: "companygraph-user-stories.html v0.1 — persona P4 (Karim, CTO / Analyst); epics AN-1..AN-3, stories AN-1.1..AN-3.2"
reviewing_pass_1_findings: "4 blockers, 4 concerns, 5 nits, 3 open-nit-accepted — all absorbed in revision 2 (see §Pass-1 review resolutions)."
---

## Pass-1 review resolutions (revision 2)

All findings from `review-requirements.md` (pass 1, 2026-05-22) absorbed:

| Finding | Disposition | Section |
|---------|-------------|---------|
| **B-01** hash protocol `attributes_json` canonicalisation in Risks not FR | Promoted into NFR-05 — explicit 8-rule hash protocol; AC-09 extended with key-order permutation test | NFR-05, AC-09 |
| **B-02** edge `updatedAt` absent from graph-core export | Resolved by leaning on edge immutability — edge contribution uses `createdAt` only (edges have no PATCH endpoint in graph-core). FR-08 enumerates the exact field list. | FR-08, NFR-05 |
| **B-03** weight tunability not folded into hash input | Hash input is now the tuple `(graph_state, weights)` per NFR-05; AC-09 extended with weight-mutation test | NFR-05, AC-09 |
| **B-04** "same graph" ambiguous across nightly cache boundary | FR-08 + AC-08 pin the hash to the **cache snapshot** used to render the PDF; PDF body includes `last_run_at`. Verifiability claim restricted to "same cache snapshot" — operator can re-derive via the cache-snapshot endpoint introduced in FR-11a. | FR-08, FR-11a, AC-08 |
| **C-01** settings ungated, plus B-03 interaction | FR-11 adds `analytics_settings_audit` table writing on every PATCH; combined with B-03, weight mutations now visibly change the hash | FR-11, AC-X |
| **C-02** CSV BOM in Risks not FR | Pinned in FR-07; byte-level assertion added to AC-07 | FR-07, AC-07 |
| **C-03** critical-path truncation behaviour unspecified | FR-06 pinned: depth cap 20 + 1000-path budget + 4 s wall-clock; truncation surfaces `{has_cycle?, truncated: true, longest_partial}` | FR-06, AC-06 |
| **C-04** ontology-manager attribute schema coupling | FR-07 + FR-10 read attribute key/value from `analytics_ai_candidate_definition` row in `analytics_settings`; FR-10 re-validates against ontology-manager `/api/v1/schema` before each run | FR-07, FR-10 |
| **N-01** AC-01 "visual inspection" vague | Replaced with programmatic ramp-stop assertion against `pwa/src/theme.ts` | AC-01 |
| **N-02** Endpoint count mismatch (8 vs 10) | Updated Scope to 10 endpoints | Scope |
| **N-03** Missing double-tap Native Conflicts row | Added | Native Conflicts |
| **N-04** Deep-link `:id` collision | Renamed query params to `:system_id` / `:domain_id` | FR-02 |
| **N-05** Risk #10 ("Refresh now" button) is a UX decision | Moved into FR-10 as `?refresh=true` query param with lock-protection | FR-10 |
| **Open-nit-1** Hash header location on PDF | Pinned: visible page-1 footer (monospace) + PDF metadata `/Subject` | FR-08 |
| **Open-nit-2** PDF page-count budget | Pinned: top-5 + top-3 + top-3 = ~5 pages; design phase confirms layout |
| **Open-nit-3** `/exec-summary/export` vs API endpoint | FR-08 explicitly: PWA route is a launcher hitting the API; no client-side PDF rendering |

# Requirements: cto-analytics

## Summary

`cto-analytics` is the **analytical dashboard** for persona P4 (Karim,
the CTO / Analyst). It computes and renders three classes of derived
insight over the graph:

1. **System & integration overview (AN-1)** — system map with degree
   centrality, domain↔system alignment matrix, duplicate-purpose
   consolidation candidates.
2. **Complexity & risk metrics (AN-2)** — per-journey complexity score
   (depth × distinct systems × distinct roles), single-system journeys
   for migration assessment, critical-path (longest acyclic `PRECEDES`
   chain) report.
3. **AI-leverage candidates (AN-3)** — activities flagged
   `repetitive=true` + `data_richness=high`, plus a quarterly PDF
   executive summary covering top 5 by complexity / top 3 consolidation /
   top 3 AI candidates with a graph-state hash header for verifiability.

This spec is **read-only** — it produces no graph mutations. It depends
on `graph-core` for the data, on `ontology-manager` for the
`repetitive` / `data_richness` attribute schemas (these are user-defined
attributes on `Activity` — the schema must be registered before this
spec's filters work), and on `process-explorer-ui` for deep-links from
the dashboard into the underlying activity lists.

## Motivation

Karim's job is to decide where engineering capital goes. He needs:
- A defensible **system map** showing integration density (which clusters
  are tangled vs which are isolated).
- A **domain↔system matrix** revealing mis-alignment (the same system
  appearing across unrelated domains → a candidate consolidation).
- A **complexity ranking** so re-engineering effort is prioritised by
  evidence, not gut feel.
- A **list of AI-leverage candidates** with quantified evidence — the
  exec summary input for the quarterly review (persona-card success
  criterion: "Top 3 AI candidates surfaced with quantified evidence each
  quarter").

Without this dashboard, the analysis is hand-rolled Excel from CSV
exports of `graph-core` — error-prone, slow, and not reproducible across
runs (which is the load-bearing failure mode the PDF's graph-state hash
addresses).

## Functional Requirements

### System & integration overview (AN-1)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-01 | **System map** — `#/analytics/systems` renders every `System` node with its `INTEGRATES_WITH` neighbours. Each system shows degree-centrality (count of `INTEGRATES_WITH` neighbours) + integration count (sum of edges in + out). Clusters coloured by degree using **shades of the single project accent** — no rainbow palette. Layout is force-directed; cluster colouring uses a 5-stop monochromatic ramp. | must | AN-1.1 |
| FR-02 | **Domain↔system alignment matrix** — `#/analytics/domain-system-matrix` renders a matrix: rows = domains, columns = systems, cell value = count of activities binding them (`USES_SYSTEM` edges traced through `PART_OF` to a journey, then `PART_OF` to a domain). Cells link to the underlying activity list (`process-explorer-ui /#/explorer/activities?system_id=:sid&domain_id=:did` — distinct param names to disambiguate the two ids, resolves pass-1 N-04). **Rendering**: matrix cells render via a virtualised grid (`react-window` or equivalent — locked at design phase) to handle realistic-scale 50×200 = 10k-cell graphs; "Filter by domain" + "Filter by system" controls pre-cut the matrix before render. | must | AN-1.2 |
| FR-03 | **Consolidation candidates panel** — `#/analytics/consolidation` lists activities with ≥ 2 `USES_SYSTEM` edges, sorted by `count(USES_SYSTEM) DESC`. Each row shows the activity + the systems + the parent journey. Deep-link to the activity detail. | must | AN-1.3 |

### Complexity & risk metrics (AN-2)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-04 | **Complexity score per journey** — score = `depth(PRECEDES chain) × distinct(USES_SYSTEM) × distinct(EXECUTES_role)`. Computed nightly (FR-08 scheduler). Rendered in a sortable table at `#/analytics/complexity`. Hover on a score reveals the formula + the three component values. Score weights are tunable via a settings pane (`#/analytics/settings`) — defaults `1.0` each, stored in a `analytics_settings` table. | must | AN-2.1 |
| FR-05 | **Single-system journey report** — `#/analytics/single-system-journeys` enumerates journeys where `count(DISTINCT system across all activities) = 1`. Each row links to the journey detail with the bound system pinned (deep-link query `?system=:id`). | must | AN-2.2 |
| FR-06 | **Critical-path report — depth-bounded DFS with budgeted truncation** (resolves pass-1 C-03). `#/analytics/critical-paths` shows per journey: the longest acyclic `PRECEDES` chain, its length, the start activity, the end activity. **Algorithm**: depth-bounded DFS with memoization, depth cap = 20, path-count budget = 1000 candidate paths, wall-clock budget = 4 seconds. Cyclic journeys are flagged (`has_cycle: true`) but not crashed — the longest acyclic chain is still reported. **Truncation surface**: if the DFS exceeds either budget the response carries `{has_cycle?: true, truncated: true, longest_partial: <chain so far>, truncation_reason: "depth_cap" | "path_budget" | "wall_clock"}` and the PDF flags the truncation visibly. | must | AN-2.3 |

### AI-leverage candidates (AN-3)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-07 | **AI-candidate filter — configurable attribute coupling** (resolves pass-1 C-04). `#/analytics/ai-candidates` reads the filter attribute keys + match values from an `analytics_ai_candidate_definition` row in `analytics_settings` (defaults: `{repetitive_key: "repetitive", repetitive_match: true, richness_key: "data_richness", richness_match: "high"}`). Filter applies `attributes[repetitive_key] == repetitive_match AND attributes[richness_key] == richness_match`. Results render in a table with the activity + parent journey + bound systems + bound roles. **CSV export**: button produces a UTF-8 file with byte-order-mark (`\xEF\xBB\xBF`), CRLF line endings, RFC 4180 quoting (resolves pass-1 C-02). Empty-result state shows explicit copy: `"no activities tagged yet — see ontology-manager to register repetitive + data_richness (or your configured) attributes on Activity"` (NOT a blank screen). | must | AN-3.1 |
| FR-08 | **Executive summary PDF export — cache-snapshot-grounded hash** (resolves pass-1 B-02 + B-04). `#/analytics/exec-summary/export` is a PWA-side **launcher route** that hits the API endpoint `GET /api/v1/analytics/exec-summary.pdf`; **no client-side PDF rendering**. The API endpoint generates the PDF server-side and returns `application/pdf`. PDF covers: top 5 journeys by complexity (with sub-scores), top 3 consolidation candidates (activities with most `USES_SYSTEM` edges), top 3 AI candidates. **Hash basis** (precise field list, derived from `graph-core`'s actual export shape — edge `updatedAt` does NOT exist; edges are immutable post-creation in graph-core): hash input is `{snapshot_id, nodes, edges, weights}` where: (a) `snapshot_id = analytics_journey_scores.last_run_at` (the cache run id — pinning the hash to the cache snapshot, NOT the live graph); (b) `nodes` is the cache-snapshot list of `{id, label, attributes_parsed, updatedAt}` rows; (c) `edges` is the cache-snapshot list of `{id, type, fromId, toId, attributes_parsed, createdAt}` rows (no `updatedAt`); (d) `weights` is the `analytics_settings` weight row at PDF-render time (depth_weight, system_weight, role_weight). PDF body includes `last_run_at` (the cache snapshot timestamp) so a verifier can distinguish "same graph, different cache" from "different graph". **Hash placement**: visible page-1 footer in monospace (e.g. `"graph-state hash: 4f3a…b9c1 · cache snapshot: 2026-05-22T18:30:00Z"`) AND PDF metadata `/Subject` field (the canonical-data location). **Verifiability**: a reader can re-derive the hash by calling the new `GET /api/v1/analytics/snapshot/:last_run_at` endpoint (FR-11a) which returns the exact cache contents. | must | AN-3.2 |

### Backend

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-09 | **Analytics REST endpoints** — under `/api/v1/analytics/*`: `GET /systems`, `GET /domain-system-matrix`, `GET /consolidation`, `GET /complexity`, `GET /single-system-journeys`, `GET /critical-paths`, `GET /ai-candidates`, `GET /exec-summary.pdf`. All read-only; all go through `graph-core/POST /api/v1/query/cypher` for the underlying Cypher (per `graph-core/NFR-06`). | must | AN-1..AN-3 |
| FR-10 | **Nightly precompute scheduler + on-demand refresh** — a job runs nightly at the operator-configured cron expression (default `0 2 * * *` in the operator's `TZ` env var) that computes complexity scores for every journey, integration density for every system, and AI-candidate flags. Results land in `analytics_journey_scores` + `analytics_system_metrics` + `analytics_ai_candidates` (SQLite, isolated from `chat-interface`'s SQLite). Endpoints serve from these tables; if stale (`last_run_at > 25h ago`), endpoints return `{degraded: true, last_run_at}` in the response envelope but still serve the stale data. **On-demand refresh** (resolves pass-1 N-05): every endpoint accepts `?refresh=true` which triggers a lock-protected on-demand recompute; a second concurrent `?refresh=true` call returns the in-progress run's eventual result (no double-execution). **Schema-coupling validation** (resolves pass-1 C-04): before each precompute run, the scheduler validates that the `analytics_ai_candidate_definition` row's `repetitive_key` and `richness_key` exist in `ontology-manager`'s `Activity` attribute schema (`GET /api/v1/schema`). On mismatch, the precompute skips the AI-candidate pass and writes a structured banner row to `analytics_alerts` table (rendered in PWA Overview): `"AI-candidate definition references attribute '<key>' which is not registered on Activity — visit ontology-manager"`. | must | AN-2.1 (implied) |
| FR-11 | **Settings table + audit** — `analytics_settings` stores complexity score weights (depth_weight, system_weight, role_weight; all defaults `1.0`) + scheduler cron expression + PDF brand options + AI-candidate definition. `GET /api/v1/analytics/settings` + `PATCH /api/v1/analytics/settings`. **Audit on every PATCH** (resolves pass-1 C-01): writes a row to `analytics_settings_audit (ts, before, after, actor)` so PDF readers comparing two hash headers can trace which weight change caused the drift. Same shape as `graph-core/FR-13` structured logging. | should | AN-2.1 |
| FR-11a | **Cache-snapshot read endpoint** — `GET /api/v1/analytics/snapshot/:last_run_at` returns the exact cache contents (`analytics_journey_scores`, `analytics_system_metrics`, `analytics_ai_candidates`, `analytics_settings` weights row, all keyed at `last_run_at`) used by FR-08's PDF generation. Used by external verifiers to re-derive the hash. | must | AN-3.2 |

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-01 | TypeScript transpiles cleanly with `bun build --no-bundle`. | reliability |
| NFR-02 | All Cypher queries route through `graph-core/POST /api/v1/query/cypher` — no direct driver use in `cto-analytics/`. Coverage test enforces. | architecture |
| NFR-03 | **No write paths.** Analytics never mutates the graph. Coverage test enforces. (Cache writes to `analytics_*` SQLite tables are isolated and not graph mutations.) | security |
| NFR-04 | PDF generation is **reproducible** — given the same graph-state hash (= same `{snapshot_id, nodes, edges, weights}` tuple per NFR-05), two runs produce byte-identical PDF output (modulo embedded timestamps which are clamped to the cache snapshot's date — `last_run_at` is the only date in the PDF body). | data-integrity |
| NFR-05 | **Graph-state hash protocol — binding requirement** (resolves pass-1 B-01 + B-03). Hash input is the tuple `{snapshot_id, nodes, edges, weights}` serialised by these eight rules: **(a)** outer object keys alphabetically sorted; **(b)** `nodes` and `edges` arrays sorted by `id` ASC (UUIDv7 lexicographic order); **(c)** each node/edge object's keys alphabetically sorted; **(d)** each node/edge's `attributes` field is the **parsed object** (NOT the stored `attributes_json` string) with its keys **recursively** alphabetically sorted before serialisation; **(e)** numeric values serialised without locale-dependent formatting (use `Number.prototype.toString` with no padding/grouping); **(f)** string values UTF-8 NFC-normalised (`String.prototype.normalize("NFC")`); **(g)** embedded newlines use `\n` (LF), never `\r\n`; **(h)** hash algorithm SHA-256; hex-encoded lowercase. Documented inline (no separate `hash-protocol.md` artifact — the contract lives here so it cannot drift). | reproducibility |
| NFR-06 | **No auth code paths** (per `graph-core/NFR-08`). Settings + scheduler are single-tenant; PDF export has no recipient identity (it's a download). | security |
| NFR-07 | Nightly precompute runs within a 30-minute budget on the `retail-mini` seed; should also complete within 30 min on a realistic 10k-node retail org (design phase confirms via a stress fixture). | performance |
| NFR-08 | Response envelope follows `graph-core/NFR-05` — success returns the resource; errors return `{error:{code,message,details?}}`. | api-quality |

## Scope Boundaries

**In scope:**
- System map + degree centrality + integration count.
- Domain↔system alignment matrix.
- Consolidation candidates panel.
- Per-journey complexity score (tunable weights).
- Single-system journey report.
- Critical-path report (longest acyclic chain).
- AI-candidate filter + CSV export.
- Exec-summary PDF with graph-state hash header.
- Nightly precompute scheduler + cached tables.
- Settings pane for score weights.
- **Ten** new `/api/v1/analytics/*` REST endpoints: the eight from FR-09 (`systems`, `domain-system-matrix`, `consolidation`, `complexity`, `single-system-journeys`, `critical-paths`, `ai-candidates`, `exec-summary.pdf`) + `GET/PATCH /settings` (FR-11) + `GET /snapshot/:last_run_at` (FR-11a). (Resolves pass-1 N-02 endpoint-count mismatch.)

**Out of scope (tracked elsewhere or deferred):**
- **Multi-spec consumption.** This spec consumes `Activity.repetitive` and `Activity.data_richness` attribute values; the registration of those attribute schemas is `ontology-manager`'s job (FR-04 there). This spec hard-fails closed if those attributes are not registered — the empty-state copy in FR-07 surfaces this.
- Real-time dashboard refresh (websockets / SSE) — endpoints serve cached precomputed values; the operator refreshes the page. A v2 spec may add live refresh.
- Cross-tenant comparison ("how does our integration density compare to industry?") — out of scope; no industry baseline.
- ML-based AI-candidate scoring — this spec is rule-based (`repetitive=true AND data_richness=high`). ML scoring is its own future spec.
- PDF customisation beyond the brand fields in `analytics_settings` (operator's logo, footer) — minimal customisation in v1.
- Email-the-PDF / Slack-the-PDF — out of scope; download only.
- Historical trend analysis ("complexity score over time") — requires versioning, deferred.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | System map renders every system with degree + integration count; cluster colouring uses the 5-stop monochromatic ramp (FR-01 — pass-1 N-01) | iPhone Safari (degrade — small), iPad Safari (touch), macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | `pwa/__tests__/analytics-system-map.test.tsx` — snapshot test asserts every cluster's fill colour is in the 5-stop ramp `[--accent-100, --accent-300, --accent-500, --accent-700, --accent-900]` defined in `pwa/src/theme.ts`; manual on iPad Safari: open `#/analytics/systems`, expect 6 system nodes (per `retail-mini` seed) |
| AC-02 | Domain↔system matrix renders rows × columns; cell links open the underlying activity list (FR-02) | all four | `pwa/__tests__/analytics-matrix.test.tsx` + integration: click any cell, expect `process-explorer-ui` filter URL with `?system=:id&domain=:id` |
| AC-03 | Consolidation candidates sorted by USES_SYSTEM count DESC (FR-03) | all four | `api/__tests__/analytics-consolidation.integration.test.ts` |
| AC-04 | Complexity score formula + sub-scores visible on hover; weights tunable in settings (FR-04, FR-11) | macOS Safari, macOS Chrome (hover-primary) | `pwa/__tests__/analytics-complexity.test.tsx` + integration round-trip on `PATCH /analytics/settings` |
| AC-05 | Single-system journeys report enumerates journeys with `count(DISTINCT system) = 1` (FR-05) | all four | `api/__tests__/analytics-single-system.integration.test.ts` |
| AC-06 | Critical-path report respects depth cap, path budget, wall-clock budget; cyclic journeys flagged but not crashed (FR-06 — pass-1 C-03) | all four | `api/__tests__/analytics-critical-path.test.ts` — (a) fixture with one cyclic journey → expect `has_cycle: true` + the longest acyclic sub-chain reported, no `truncated` flag; (b) fixture with 30-deep linear journey → expect `truncated: true, truncation_reason: "depth_cap", longest_partial.length = 20`; (c) fixture with high-fan-out branching journey (deliberately exceeds 1000 candidate paths) → expect `truncation_reason: "path_budget"` |
| AC-07 | AI-candidate filter reads attribute keys + match values from `analytics_ai_candidate_definition`; CSV export emits UTF-8 BOM + CRLF + RFC 4180 quoting; empty state shows the named copy (FR-07 — pass-1 C-02 + C-04) | all four | `api/__tests__/analytics-ai-candidates.test.ts` — (a) default-definition test: seed activities, filter applies `repetitive==true AND data_richness=="high"`; (b) reconfigured-definition test: PATCH `analytics_settings.analytics_ai_candidate_definition` to use `{repetitive_key:"manual_repeat", richness_key:"info_density", richness_match:"rich"}`, assert filter switches; (c) CSV byte test: first three bytes of CSV body are `EF BB BF`, line endings are `\r\n`, fields with commas are quoted per RFC 4180; (d) empty-state via `pwa/__tests__/analytics-ai-empty-state.test.tsx` |
| AC-08 | Exec-summary PDF generates with the named sections; hash visible on page 1 footer (monospace) + PDF metadata `/Subject`; two runs against the **same cache snapshot** (`last_run_at` identical) produce byte-identical PDF (modulo the cache snapshot timestamp embedded as `last_run_at` text, which IS deterministic since it's drawn from the same cache row); two runs across a nightly cache refresh produce different PDFs (FR-08, NFR-04, NFR-05) | n/a (server) | `api/__tests__/analytics-exec-summary-pdf.test.ts` — (a) render twice against the same fixture cache, deep-equal the PDF bytes; (b) render once, mutate `analytics_settings` weights, re-render, assert the hash header changes AND the PDF bytes change; (c) manual on macOS Chrome: open the PDF, verify page-1 footer carries `"graph-state hash: <64-char hex> · cache snapshot: <ISO>"`; open Get Info → PDF metadata, verify `/Subject` contains the same hash |
| AC-09 | Graph-state hash protocol robustly deterministic across all 8 NFR-05 rules (NFR-05 — pass-1 B-01 + B-03) | n/a (server) | `api/__tests__/analytics-hash-determinism.test.ts` — given a fixture graph: (a) compute the hash 10×, assert all 10 are equal; (b) permute the input `nodes`/`edges` array order, assert the canonical-ordered hash unchanged; (c) **permute attribute-map key order** on one fixture node (write `{a:1,b:2}` then `{b:2,a:1}` via PATCH), assert hash unchanged; (d) mutate weights via `PATCH /analytics/settings`, re-render the PDF on the same graph, assert the hash header CHANGES; revert weights, assert hash REVERTS to original; (e) introduce a node `name` with a combining-character Unicode form (e.g. `"Café"` vs `"Café"`), assert NFC normalisation gives the same hash |
| AC-10 | All analytics endpoints under `/api/v1/analytics/*`; envelope follows `graph-core/NFR-05` (FR-09, NFR-08) | n/a (server) | `api/__tests__/analytics-envelope.test.ts` |
| AC-11 | All Cypher queries route through `/api/v1/query/cypher`; no direct driver use in `cto-analytics/` source (NFR-02) | n/a (codebase) | `api/__tests__/analytics-no-direct-driver.test.ts` — grep over `api/src/analytics/` for `driver.session()` or any write-helper imports; assert zero hits |
| AC-12 | No write paths from analytics (NFR-03) | n/a (codebase) | `api/__tests__/analytics-no-write-imports.test.ts` — assert no import of `createNode` / `upsertNode` / `createEdge` / `upsertEdge` from `api/src/analytics/` (cache writes to `analytics_*` SQLite tables are permitted) |
| AC-13 | Nightly scheduler runs; endpoints serve from `analytics_journey_scores` etc.; staleness > 25 h is surfaced as `{degraded: true, last_run_at}`; `?refresh=true` triggers on-demand recompute (lock-protected); ontology-manager schema-coupling validated each run (FR-10 — pass-1 C-04, N-05) | n/a (server) | `api/__tests__/analytics-scheduler.test.ts` — (a) trigger the job manually, assert rows in cache tables; (b) freeze time +26 h, GET an endpoint, assert `degraded: true` in response; (c) GET an endpoint with `?refresh=true` while a previous refresh is in-flight, assert the second call returns the same `last_run_at` as the first (no double-execution); (d) remove `repetitive` from ontology-manager `Activity` attribute schema, run the precompute, assert AI-candidate pass skipped and `analytics_alerts` row written with the named banner |
| AC-14 | No auth code paths in `cto-analytics/` source (NFR-06 — extends `graph-core/AC-22`) | n/a (codebase) | `api/__tests__/no-auth-grep.test.ts` (reuses graph-core's pattern; this spec adds `api/src/analytics/` + `pwa/src/views/analytics.tsx` to the include list) |
| AC-15 | Empty-state copy for AI candidates names `ontology-manager` and the attribute schema registration step (FR-07) | all four | Part of `analytics-ai-empty-state.test.tsx` — assert the literal string |
| AC-16 | Nightly precompute completes within 30 min on `retail-mini` (NFR-07) | n/a (server) | `api/__tests__/analytics-scheduler-budget.test.ts` — manual: run the job against a 10k-node stress fixture, assert wall-clock < 30 min (gated by env var since the fixture is large) |
| AC-17 | Every PATCH to `/api/v1/analytics/settings` writes an `analytics_settings_audit (ts, before, after, actor)` row (FR-11 — pass-1 C-01) | n/a (server) | `api/__tests__/analytics-settings-audit.test.ts` — PATCH the depth_weight, assert one audit row appears with the prior + new value |
| AC-18 | `GET /api/v1/analytics/snapshot/:last_run_at` returns the exact cache contents at that timestamp (FR-11a — pass-1 B-04 verifiability) | n/a (server) | `api/__tests__/analytics-snapshot-endpoint.test.ts` — render a PDF (capturing the hash); call `/snapshot/:last_run_at` with the embedded `last_run_at`, re-derive the hash client-side using the NFR-05 protocol, assert it matches the PDF's hash |

## Platforms & Input Modes

The analytics dashboard is a PWA pane with visualisations + tables.
Population row-by-row.

| Surface | iPhone Safari (touch) | iPad Safari (touch + Pencil) | macOS Safari (trackpad + kb) | macOS Chrome (mouse + kb) |
|---------|-----------------------|-------------------------------|-------------------------------|----------------------------|
| System map (FR-01) | degrade — usable but cluster labels small | yes | yes | yes |
| Pan/zoom on system map | yes (touch pan + pinch zoom) | yes | yes (trackpad gestures) | yes (scroll-wheel zoom) |
| Domain↔system matrix (FR-02) | degrade — horizontal scroll for wide matrices | yes | yes | yes |
| Click matrix cell → explorer link | yes | yes | yes | yes |
| Consolidation candidates table (FR-03) | yes | yes | yes | yes |
| Complexity score table (FR-04) | yes (table) — hover-on-score is desktop-only | yes (long-press as hover proxy) | yes | yes |
| Settings pane (FR-11) | yes | yes | yes | yes |
| AI-candidates table + CSV export (FR-07) | yes (download via Files / Share) | yes | yes (download) | yes (download) |
| Exec-summary PDF download (FR-08) | yes | yes | yes | yes |
| Keyboard shortcut: arrow-nav through tables | n/a | yes (external kb) | yes | yes |

## Native Conflicts

Analytics is mostly tables + one visualisation. Conflicts are around
hover, scroll containers, and download triggers.

| Conflicting native behaviour | Affected surface | Suppression mechanism |
|------------------------------|------------------|------------------------|
| Touch devices have no hover — complexity-formula hover tooltip (FR-04) is unreachable | Complexity score table on iPhone/iPad | Long-press treated as hover-equivalent — `onTouchStart` after 500 ms opens the formula popover; `onTouchEnd` keeps it open until tap elsewhere |
| Pinch-zoom on system map zooms the page (iOS Safari default) | System map (FR-01) | `touch-action: none` on the map container + `<meta name="viewport" …user-scalable=no>` on the analytics route only |
| Horizontal scroll on the matrix conflicts with browser back-gesture on iOS Safari | Domain↔system matrix (FR-02) | Matrix's scroll container ignores initial touches within 20 px of viewport's left edge — Safari's back-gesture takes precedence there |
| Pull-to-refresh interferes with table scroll | Tables | `overscroll-behavior-y: contain` on the analytics-route body |
| `<a download>` on Safari iOS sometimes opens the file in-tab instead of downloading | CSV export (FR-07), PDF download (FR-08) | Use the Share sheet flow on iOS (`navigator.share()` if available); fall back to `<a download>` with a clear "tap and choose Save to Files" hint |
| Browser back-button navigates away mid-PDF-generation | Exec-summary PDF endpoint | Generation is fast (< 5 s on `retail-mini`); UX shows a spinner with "generating…" copy. No suppression needed if generation is faster than the operator's patience. |
| Long table on iPhone Safari momentum-scrolls past the scope of the table into the page | Tables | Use a fixed-height scroll container with `overflow-y: auto`; do NOT make the table inherit the page's scroll |
| Double-tap-to-zoom on iOS Safari fires on the system map and fights canvas pan/zoom (pass-1 N-03) | System map (FR-01) | `touch-action: none` on the map container (already there for pinch-zoom suppression — the same property suppresses double-tap-zoom on iOS Safari ≥ 13.4); custom double-tap handler in the map component treats double-tap as "fit to view" |

## Dependencies

| Module/API | How it's affected |
|------------|-------------------|
| `graph-core` | Hard dependency. All Cypher queries routed through `POST /api/v1/query/cypher`. Reads `GET /api/v1/export` for the graph-state hash basis. |
| `ontology-manager` | **Mandatory soft dependency** — the AI-candidate filter (FR-07) hinges on `Activity.repetitive` (boolean) and `Activity.data_richness` (`"low" | "medium" | "high"`) being registered as attributes via `ontology-manager`. If not registered, the empty-state copy in FR-07 surfaces. |
| `process-explorer-ui` | Soft dependency — matrix cells + consolidation rows + critical-path rows + AI-candidate rows all deep-link into explorer routes. If explorer is not yet shipped, the links render as plain text and the operator inspects via REST. |
| PDF library — `pdfkit` (Node-native), `puppeteer` (heavy but flexible), or `@react-pdf/renderer` (React-native, fits the React stack) | Design phase picks one. Recommend `@react-pdf/renderer` to keep the codebase React-coherent. |
| SQLite (separate from Neo4j) | Cache tables (`analytics_journey_scores`, `analytics_system_metrics`, `analytics_ai_candidates`, `analytics_settings`). Isolated from `graph-core`'s Neo4j data + `chat-interface`'s SQLite (separate file). |
| `zod` (from `graph-core`) | Schema validation on the analytics REST endpoints. |

## Risks & Open Questions

1. **Critical-path algorithm on cyclic graphs (FR-06).** The "longest
   acyclic path" problem is NP-hard in the worst case. On a realistic
   retail-process graph (≤ 50 activities per journey, low average
   degree), a depth-limited DFS with memoization completes in < 1 s.
   Design phase commits a depth cap (recommend ≤ 20 — well above any
   realistic journey length) and the algorithm choice (DFS+memo).

2. **Complexity score weights tunability vs reproducibility (FR-04,
   FR-11, NFR-04).** Tunable weights mean two operators with different
   settings produce different PDFs from the same graph. The
   graph-state hash captures the graph but not the weights. Design
   phase: include the weights JSON in the hash input — so the
   PDF's hash represents `(graph_state, weights)`.

3. **Nightly precompute scheduling (FR-10).** Operator's timezone is
   set in `.env` (default `Asia/Bangkok`). The "02:00 ICT" default is
   ICT-specific. Design phase decides: tz-aware string (`"02:00 ICT"`)
   vs `cron` expression. Recommend `cron` for portability.

4. **PDF size on a realistic graph (FR-08).** Top-5 / top-3 / top-3 is
   a fixed budget — PDF stays ~5 pages regardless of graph size.
   Design phase commits the layout + page count.

5. **Domain↔system matrix scale (FR-02).** At 50 domains × 200
   systems = 10,000 cells. Rendering 10k cells in a single SPA route
   on mobile is poor UX. Design phase commits a virtualised renderer
   (e.g. `react-window`) + a "filter by domain" + "filter by system"
   pre-cut.

6. **Graph-state hash determinism on `attributes_json` (NFR-05).**
   `graph-core` stores `attributes` as JSON-string. Two semantically
   equal attribute maps (`{a:1,b:2}` vs `{b:2,a:1}`) hash differently
   unless we canonicalise. The hash protocol must parse `attributes_json`,
   sort keys, re-stringify deterministically. Design phase commits
   this in `hash-protocol.md` per NFR-05.

7. **CSV export charset + Excel UTF-8 BOM (FR-07).** CSV opened in
   Excel without BOM mangles accented characters. Design phase commits:
   write a UTF-8 BOM at file start.

8. **`updatedAt` granularity for hash determinism (NFR-05).** Hash is
   based on `updatedAt` ISO strings. A node updated at `t` and another
   at `t + 1 ns` hash differently — fine. But a node read at `t` and
   re-read at `t + 0 ns` should hash the same — also fine because the
   storage layer doesn't change `updatedAt` on read. Confirmed by
   `graph-core/design.md` §4.1.

9. **AI-candidate attribute schema coupling (FR-07 + Dependencies).**
   This spec couples to `ontology-manager`'s attribute schema for
   `repetitive` + `data_richness`. If those attribute names change in
   `ontology-manager`, this spec breaks. Mitigation: an
   `analytics_ai_candidates_definition` row in `analytics_settings`
   names the attribute keys explicitly + the expected values
   (`{repetitive: true, data_richness: "high"}`). Operator can update
   without a code change.

10. **Real-time staleness window (FR-10).** Cached endpoints serve
    24-hour-stale data. A user who just added 10 activities won't see
    them in the complexity ranking until the next 02:00 run. Design
    phase decides: (a) "Refresh now" button on the dashboard that
    re-runs the precompute on-demand; (b) accept the staleness as the
    operating model. Recommend (a) — a single button is cheap and the
    operator's mental model expects fresh-on-refresh.
