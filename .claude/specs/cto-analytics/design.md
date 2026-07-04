---
feature: "cto-analytics"
created: "2026-07-04"
author: "spec-author (as-built reconciliation)"
status: "approved"
revision: 2
reviewing_requirements_revision: 2
review_pass_1_findings: "1 blocker, 5 concerns, 3 nits — all absorbed in revision 2 (see §1a)"
size: "medium"
reconciliation_of: "_baseline adoption 2026-07-04"
---

# Design: cto-analytics — as-built reconciliation

## 1. Overview

This is **not a green-field design**. The spec stalled at
"requirements approved, design pending" on 2026-05-22. Between then and
2026-07-04 an analytics surface was **built off-spec** and ratified by the
`.claude/specs/_baseline/` adoption (its `requirements.md` FR-14 "Analytics +
exec views", `design.md` §4 coverage rows for `pwa/src/views/` and
`api/src/routes/`, `tasks.md` T-13). This document reconciles this spec's
approved requirements against that reality. It follows three rules:

1. **Record, don't invent.** Decisions inherited from the built code are
   captured as DD-* entries marked "(as-built, adopted 2026-07-04)". FRs with
   no implementation get a "not built — open" note — no retroactive design is
   fabricated for them.
2. **Divergence is stated, not laundered.** Where the built code contradicts
   an approved requirement (route names, complexity formula, NFR-02 driver
   use, the retired no-auth invariant), the conflict is named and routed to
   §10 Open Questions rather than silently resolved.
3. **The unbuilt majority stays open scope.** 4 of 12 FRs have any
   implementation; 8 have none. The pending design decisions the requirements
   deferred to this phase (PDF library, hash-protocol implementation,
   scheduler TZ edge-handling, matrix virtualisation) remain **open** — they belong to the
   execution of the pending tasks, gated on §10 answers.

Governance note: the built artifacts listed here are currently governed by
`_baseline` (current truth per `.claude/CLAUDE.md`). This spec's remaining
scope — the pending tasks in `tasks.md` — is what this spec still owns.

## 1a. Pass-1 design-review resolutions (revision 2)

All findings from `review-design.md` (pass 1, 2026-07-04) absorbed:

| Finding | Disposition | Where |
|---------|-------------|-------|
| **B-01** as-built AI-candidate vocabulary missing from the record | FR-07 evidence row extended with the live chat tool (`api/src/chat/tools/ai-candidates.ts`) + enriched-seed vocabulary; contradiction with FR-07 defaults documented (default filter matches zero rows as-built); OQ-4 reframed; new **OQ-4a** carries the vocabulary decision; consequences for T-13's defaults + AC-07(a)'s fixture pinned on the task | §3 FR-07, §10 OQ-4/OQ-4a, tasks T-13 |
| **C-01** AC-01 recipe cites nonexistent `pwa/src/theme.ts` + `--accent-100..900` | Pinned as §2 Pin-4 (same treatment as the AC-02 defect): token home is `pwa/src/styles/companygraph/tokens.css`; ramp stops created by task T-21, asserted by T-07 | §2, tasks T-07/T-21 |
| **C-02** OQ-1 omitted the established server-side read-only pattern | `runPassthrough` (`api/src/neo4j/read-only-session.ts`) added as OQ-1 option (d) | §10 OQ-1 |
| **C-03** T-14 closed AC-10 before `/settings` (T-16) and `/snapshot` (T-18) exist | AC-10 is *advanced* by T-14/T-19; T-16 + T-18 extend the envelope test as part of their DoD; AC-10 finally closes at T-18 | §8.2, tasks T-14/T-16/T-18/T-19 |
| **C-04** Native Conflicts suppressions unowned in tasks | Each suppression assigned to its owning task: T-07 (map touch/viewport/double-tap), T-08 (back-gesture guard + overscroll), T-10 (long-press popover, already owned), T-13 (CSV share-sheet), T-17 (PDF share-sheet) | §6, tasks |
| **C-05** T-14 (5 files) and T-07 (4 files) exceed the 3-file task cap | T-14's guard tests split to new **T-19**; T-07 split: server module → **T-20**, ramp tokens + registration → **T-21**. No existing task renumbered | tasks T-07/T-14/T-19..T-21 |
| **N-01** cron default listed as undecided | §4 corrected: FR-10 pins `0 2 * * *` + operator `TZ`; only TZ edge-handling stays open | §4 |
| **N-02** DD-08 cites FR-01 for an FR-02 surface | DD-08 note now cites the project accent rule (stated in FR-01) applied to FR-02's surface | §4 DD-08 |
| **N-03** §8.1 repeats `_baseline`'s stale "no automated coverage" claim | Parenthetical added naming the two existing Overview tests | §8.1 |

## 2. Prior-review concerns — status at reconciliation

Carried open-accepted items from `review-requirements-pass-2.md`, plus
recipe defects of the same class pinned during design review:

| Item | Status in this reconciliation |
|------|-------------------------------|
| Open-1: AC-06 lacks a `wall_clock` truncation case | Pinned: pending task T-12's test plan must include a wall-clock fixture (slow-query simulation or injected clock). Binding on execution. |
| Open-2: endpoint count "Ten" ambiguity | Pinned: **10 paths, 11 method+path registrations** (8 report GETs + `GET /settings` + `PATCH /settings` + `GET /snapshot/:last_run_at`). None of the 10 exist as-built — see §5. |
| Open-3: AC-02 verification recipe still reads `?system=:id&domain=:id` | Pinned: the binding param names are FR-02's `?system_id=:sid&domain_id=:did`. AC-02 is not renumbered; its verification recipe is corrected at execution (task T-08). |
| Pin-4 (added rev 2 — Resolves: C-01): AC-01's recipe cites `pwa/src/theme.ts` + a `--accent-100..900` ramp | Pinned: **neither exists.** The token home is `pwa/src/styles/companygraph/tokens.css` (per `_baseline` DD-05 and `scripts/design-conformance.ts` `TOKENS_CSS`), which today defines only `--accent`, `--accent-soft`, `--on-accent` — no ramp stops. Binding recipe: the five ramp stops land as new custom properties (`--accent-100/-300/-500/-700/-900`) in `tokens.css` (task T-21), and `pwa/src/__tests__/analytics-system-map.test.tsx` asserts cluster fills against them (task T-07; requirements' `pwa/__tests__/` path also corrected to the actual `pwa/src/__tests__/` layout). AC-01 is not renumbered. |

## 3. Reconciliation map — FR → as-built reality

Status legend: **built (variant)** = a real surface exists but diverges from
the FR text; **partial** = a fragment exists; **not built — open** = nothing
exists; the FR is open scope.

| FR | Status | As-built evidence | Divergence from requirement |
|----|--------|-------------------|------------------------------|
| FR-01 System map | **not built — open** | Adjacent partials only: `pwa/src/views/explorer/Systems.tsx` (system table with `INTEGRATES_WITH` neighbor count + `USES_SYSTEM` in-degree, owned by process-explorer-ui), `pwa/src/views/data/Map.tsx` (whole-graph force-directed canvas, not system-scoped), `GET /api/v1/analytics/graph` (server-side degree/betweenness/pagerank, §5). No `#/analytics/systems` route, no 5-stop mono-ramp cluster coloring. | n/a — not built |
| FR-02 Domain↔system matrix | **built (variant)** | `pwa/src/views/analytics/Matrix.tsx` + `Matrix.module.css` at `#/analytics/matrix` — plain-table heatmap (cell intensity via `color-mix(in oklch, var(--accent) …)`) + two `HorizontalBarChartCard` totals, fed by `POST /api/v1/query/cypher` (DD-01). | Route is `#/analytics/matrix`, not `#/analytics/domain-system-matrix`; **no** cell deep-links to explorer, **no** virtualised grid, **no** domain/system pre-filters. AC-02 not closed. |
| FR-03 Consolidation candidates | **not built — open** | Nothing. (`Ai.tsx` contains a hardcoded consolidation *sample string* — static copy, not a computed panel.) | n/a |
| FR-04 Complexity score | **built (variant)** | `pwa/src/views/analytics/Complexity.tsx` + `Complexity.module.css` at `#/analytics/complexity` — per-journey table + bucket histogram, computed live via Cypher (DD-01). | Formula is a proxy: `score = activities + fanOut + fanIn` (DD-04), **not** `depth × distinct systems × distinct roles`. No hover formula popover, no tunable weights, no nightly cache, no `#/analytics/settings`. AC-04 not closed. |
| FR-05 Single-system journeys | **not built — open** | Nothing. | n/a |
| FR-06 Critical-path report | **not built — open** | `api/src/ontology/analytics/graph.ts` detects **cycles and SCCs** (graphology), but there is no longest-acyclic-`PRECEDES`-chain report, no depth/path/wall-clock budgets, no truncation envelope. | n/a |
| FR-07 AI-candidate filter + CSV | **not built — open** (placeholder shipped; adjacent partials exist) | `pwa/src/views/analytics/Ai.tsx` at `#/analytics/ai` is a **static preview**: two hardcoded `SAMPLES` cards, non-functional Accept/Reject/Defer buttons, and a `GreyBlock` labelled "Live recommendations — wired by cto-analytics". No attribute filter, no `analytics_ai_candidate_definition`, no CSV export, no empty-state copy. **Adjacent partials (added rev 2 — Resolves: B-01)**: `api/src/chat/tools/ai-candidates.ts` (chat-interface FR-T12) is a **live, rule-based** `ai_candidates` chat tool — one Cypher pass over Activities via `runPassthrough`, then TS-side filter `leverage_score >= min_leverage` (default `0.5`) sorted DESC, returning `repetition`/`data_richness`/`runs_per_week` alongside; and `shared/seed/retail-mini-enriched.json`, whose 32 Activities carry `leverage_score` (0.15–0.83), `runs_per_week`, `repetition: "low"\|"med"\|"high"`, `data_richness: "low"\|"med"\|"high"`. | The as-built view reframes the surface as "Claude-generated proposals" — a scope drift from the rule-based filter in FR-07 (§10 OQ-4). **Vocabulary contradiction (rev 2 — Resolves: B-01)**: the as-built data + chat tool use `repetition` (enum string) and richness value `"med"`; FR-07's defaults use `repetitive_key: "repetitive"` matched against boolean `true`, and the Dependencies table spells the enum `"low"\|"medium"\|"high"`. Consequences: FR-07's default filter matches **zero** rows on the as-built enriched seed (and the basic `retail-mini.json` carries none of these attributes at all), so AC-07(a)'s "seed activities" fixture assumption is wrong as-built; FR-07's empty-state copy names an attribute (`repetitive`) the as-built vocabulary never uses; and an FR-07-as-written build would disagree with chat's `ai_candidates` tool about what an AI candidate is. Decision routed to §10 OQ-4a; binds T-13's default `analytics_ai_candidate_definition` and the AC-07(a) fixture. |
| FR-08 Exec-summary PDF + hash | **not built — open** | Adjacent-but-different: `GET /api/v1/snapshot?at=:iso` (`api/src/routes/snapshot.ts`, risk-compliance RC-2.2 auditor export) computes a SHA-256 over `JSON.stringify` — it does **not** implement the NFR-05 8-rule protocol and is not this spec's endpoint. No PDF pipeline exists; no PDF library is in `api/package.json`. | n/a |
| FR-09 Analytics REST endpoints | **partial** | One endpoint: `GET /api/v1/analytics/graph` (`api/src/router.ts:760` → `api/src/routes/analytics.ts` → `api/src/ontology/analytics/graph.ts`, graphology: density/cycles/SCCs/Louvain/betweenness/pagerank/degree/orphans/bottlenecks). Plus `GET /api/v1/stats` (`api/src/routes/stats.ts`) feeding the Overview view. | None of the 8 FR-09 paths exist. The graphology engine reads Neo4j **directly** via `getDriver()` — contradicts FR-09's "all go through `POST /api/v1/query/cypher`" and NFR-02/AC-11 as written (§10 OQ-1). |
| FR-10 Nightly precompute | **not built — open** | `node-cron` is in the server (`api/src/server.ts:53`) but schedules only the ontology audit-retention job. No `analytics_*` tables, no staleness/`degraded` envelope, no `?refresh=true`, no schema-coupling validation. | n/a |
| FR-11 Settings + audit | **not built — open** | No `analytics_settings`, no `analytics_settings_audit`, no `GET/PATCH /api/v1/analytics/settings`. (Audit-row shape, when built, follows `graph-core/FR-13` structured logging per the requirement.) | n/a |
| FR-11a Cache-snapshot endpoint | **not built — open** | Nothing at `/api/v1/analytics/snapshot/…`. **Naming hazard**: bare `GET /api/v1/snapshot` is taken by risk-compliance; FR-11a's route must stay under the `/api/v1/analytics/` prefix to avoid collision. | n/a |

Extra as-built surface with **no FR in this spec**: `#/analytics/overview`
(`pwa/src/views/analytics/Overview.tsx`) — whole-graph KPI tiles + node/edge
distribution donuts from `GET /api/v1/stats`. Governed by `_baseline` FR-14;
recorded here as DD-06 because it occupies this spec's surface.

## 4. Design decisions

All DD-01..DD-08 are **(as-built, adopted 2026-07-04)** — inherited from the
built code via the `_baseline` ratification, not chosen by this document.

| ID | Decision | Serves | Notes |
|----|----------|--------|-------|
| DD-01 | **Views ride the Cypher passthrough client-side.** `Matrix.tsx` and `Complexity.tsx` call `api.cypher()` (`POST /api/v1/query/cypher`) from the PWA with inline Cypher + `LIMIT 1001`; no per-report REST endpoints. | FR-02, FR-04 (variants) | Complies with NFR-02's routing rule for these two views, but leaves FR-09's endpoint contract unimplemented. Pending T-14 decides whether reports move server-side. |
| DD-02 | **Server-side graph metrics via graphology.** `GET /api/v1/analytics/graph` builds a graphology graph from a full Neo4j read (`api/src/ontology/analytics/graph.ts`) and computes density, elementary cycles, SCCs, Louvain communities, betweenness, pagerank, degree, orphans, bottlenecks. | FR-09 (partial); adjacent to FR-01/FR-06 | Uses `getDriver()` directly — in tension with NFR-02/AC-11 as written (§10 OQ-1). |
| DD-03 | **Live computation, no cache.** Every analytics render recomputes from the live graph; there is no precompute, no snapshot id, no staleness envelope. | FR-04 (variant) | Directly diverges from FR-10's cached-nightly model. Acceptable at `retail-mini` scale; FR-10 remains open scope. |
| DD-04 | **Complexity proxy formula** `score = activities + fanOut + fanIn`, bucketed low/med/high/very-high with `Pill` tones. The view's own lede labels it a "quick complexity proxy". | FR-04 (variant) | NOT ratified as the final formula — FR-04's weighted `depth × systems × roles` stands unless OQ-2 rewrites it. |
| DD-05 | **Route names as-built**: analytics surface tabs are `overview | matrix | complexity | ai` (`pwa/src/route.ts` surface `analytics`, kbd "5"; `pwa/src/views/index.tsx` VIEWS map). | FR-02, FR-04, FR-07 (routes) | Only `complexity` matches an FR route name. §10 OQ-3 decides keep-vs-rename before pending tasks add `systems`, `consolidation`, etc. |
| DD-06 | **Overview landing tab** (stats KPIs + distributions) exists without an FR here; adopted as the analytics landing view under `_baseline` FR-14. | — (adjacent) | Any future FR for it belongs to a revision of this spec's requirements, not to this reconciliation. |
| DD-07 | **No-auth invariant retired.** Analytics routes sit behind the central OAuth/RBAC gate in `api/src/router.ts` (401/403 before dispatch). `_baseline` DD-02/DD-07 retired graph-core's NFR-08/AC-22 rule and deleted `api/__tests__/no-auth-grep.test.ts`. This spec's NFR-06/AC-14 are **superseded** accordingly. | NFR-06, AC-14 | Leftover: `pwa/src/__tests__/no-auth-grep.test.ts` still exists in the PWA suite and asserts the retired invariant — flagged in §8, cleanup belongs to the auth backfill spec, not here. |
| DD-08 | **Chart rendering via the shared chart kit** (`pwa/src/components/charts`: `PieChartCard`, `BarChartCard`, `HorizontalBarChartCard`, `KpiCard`) + `color-mix` accent heatmap in Matrix. | FR-02, FR-04 (rendering) | Matrix's accent-derived cell shading honours the project's "shades of the single project accent" rule (stated in requirements FR-01, applied here to FR-02's surface — Resolves: N-02). Divergence: `Complexity.tsx` and `Ai.tsx` hardcode hex chart colors (`#22c55e`, `#3b82f6`, `#f59e0b`, `#ef4444`, `#8b5cf6`) instead of `var(--…)` tokens — violates `_baseline` DD-05 (§10 OQ-5). |

**Deliberately NOT decided here** (the requirements deferred these to the
design phase; the drift never made them, so they stay open — see §10 and the
pending tasks): PDF library (`@react-pdf/renderer` vs `pdfkit` vs
`puppeteer`), NFR-05 hash-protocol implementation module, scheduler TZ
edge-handling (the cron *default* itself is not open — FR-10 already pins
`0 2 * * *` in the operator's `TZ`, and T-15 uses it; Resolves: N-01), matrix
virtualisation library, `analytics_*` SQLite file layout.

## 5. HTTP API surface

### 5.1 As-built (governed by `_baseline`)

| Method | Route | FR | Notes |
|--------|-------|----|-------|
| GET | `/api/v1/analytics/graph` | FR-09 (partial) | graphology metrics envelope via `ok()` helper (`api/src/routes/_helpers.ts`) — NFR-08-conformant success shape |
| GET | `/api/v1/stats` | — (feeds Overview, DD-06) | label/edge-type counts; graph-core surface |
| POST | `/api/v1/query/cypher` | FR-02, FR-04 via DD-01 | graph-core surface the views ride; 1001-row cap |
| GET | `/api/v1/snapshot?at=:iso` | — (NOT FR-11a) | risk-compliance auditor export; name-adjacent only |

All of these sit behind the router's OAuth session + RBAC permission gate
(DD-07).

### 5.2 Required by FR-09/FR-11/FR-11a, not built (open scope)

`GET /systems`, `GET /domain-system-matrix`, `GET /consolidation`,
`GET /complexity`, `GET /single-system-journeys`, `GET /critical-paths`,
`GET /ai-candidates`, `GET /exec-summary.pdf`, `GET+PATCH /settings`,
`GET /snapshot/:last_run_at` — all under `/api/v1/analytics/` (10 paths, 11
registrations; §2 Open-2).

## 6. UI design (as-built)

- **View tree**: surface `analytics` (kbd "5") with tabs
  `#/analytics/overview`, `#/analytics/matrix`, `#/analytics/complexity`,
  `#/analytics/ai` — registered in `pwa/src/route.ts` and mounted via
  `pwa/src/views/index.tsx` VIEWS map.
- **Components**: `ViewHeader`/`Loading`/`ErrorState` from
  `pwa/src/views/_shared.tsx`; `Card`, `DataTable`, `Pill`, `Button`,
  `GreyBlock`; chart kit per DD-08. CSS Modules per view.
- **States**: Overview/Matrix/Complexity implement loading + error + ready via
  `useFetch`; Ai is static (no states). Empty states are **not** implemented
  anywhere on the surface — FR-07's named empty-state copy is open scope.
- **Input modes**: none of the requirements' Native Conflicts suppressions
  (long-press hover proxy, `touch-action: none` map container,
  `overscroll-behavior-y: contain`, iOS share-sheet download flow) exist —
  they belong to the pending tasks that build the surfaces needing them.
  Ownership assigned per task (Resolves: C-04): **T-07** — `touch-action:
  none` on the map container + the analytics-route-scoped viewport meta +
  double-tap "fit to view" handler (FR-01); **T-08** — left-edge back-gesture
  guard (ignore initial touches within 20 px of the viewport's left edge) +
  `overscroll-behavior-y: contain` on the analytics-route body (FR-02);
  **T-10** — long-press formula popover (FR-04, already owned); **T-13** —
  iOS share-sheet CSV download flow (FR-07); **T-17** — iOS share-sheet PDF
  download flow (FR-08).

## 7. File changes

### 7.1 As-built inventory (ratified via `_baseline`; ratification tasks T-01..T-06)

| Path | Action | Serves |
|------|--------|--------|
| `pwa/src/views/analytics/Overview.tsx` + `Overview.module.css` | as-built | DD-06 |
| `pwa/src/views/analytics/Matrix.tsx` + `Matrix.module.css` | as-built | FR-02 (variant), DD-01, DD-08 |
| `pwa/src/views/analytics/Complexity.tsx` + `Complexity.module.css` | as-built | FR-04 (variant), DD-01, DD-04 |
| `pwa/src/views/analytics/Ai.tsx` + `Ai.module.css` | as-built | FR-07 (placeholder) |
| `pwa/src/route.ts`, `pwa/src/views/index.tsx` (analytics rows) | as-built | DD-05 |
| `api/src/routes/analytics.ts` | as-built | FR-09 (partial), DD-02 |
| `api/src/ontology/analytics/graph.ts` | as-built | FR-09 (partial), DD-02 |
| `api/src/routes/stats.ts` | as-built | DD-06 |

### 7.2 Open scope (pending tasks T-07..T-21; paths are intended homes, per the requirements' `api/src/analytics/` convention in AC-11/AC-12)

| Path | Action | Serves |
|------|--------|--------|
| `api/src/analytics/` (new subsystem: report queries, scoring, scheduler, hash, PDF, settings) | new | FR-01, FR-03..FR-06, FR-08..FR-11, FR-11a |
| `api/src/router.ts` (mount `/api/v1/analytics/*` routes) | modify | FR-09, FR-11, FR-11a |
| `pwa/src/views/analytics/` (new tabs: systems, consolidation, single-system, critical-paths, settings; Matrix/Complexity/Ai completion) | new/modify | FR-01..FR-07 |
| `pwa/src/route.ts` + `pwa/src/views/index.tsx` (new tab registrations) | modify | FR-01, FR-03, FR-05, FR-06 |

## 8. Test strategy

### 8.1 Coverage that actually exists today

| Artifact | Covers |
|----------|--------|
| `pwa/src/__tests__/error-scenarios/analytics/overview/network/analytics-overview-network-stats_loading_failure.test.tsx` | Overview error state on stats fetch failure |
| `pwa/src/__tests__/error-scenarios/analytics/overview/data/analytics-overview-data-metrics_calculation_failure.test.tsx` | Overview resilience to malformed stats payloads |
| `api/__tests__/stats.integration.test.ts` | `GET /api/v1/stats` shape (Overview's data source) |
| `api/__tests__/cypher-passthrough.integration.test.ts`, `api/__tests__/query-caps.integration.test.ts` | The passthrough + row cap Matrix/Complexity ride (DD-01) |

**No** test exists for `GET /api/v1/analytics/graph`, `Matrix.tsx`,
`Complexity.tsx`, or `Ai.tsx`. None of the AC-named test files
(`analytics-system-map.test.tsx`, `analytics-hash-determinism.test.ts`, …)
exist. (`_baseline` design §5's blanket "exec/analytics views have no
automated coverage" is slightly stale against this inventory — the two
Overview error-scenario tests listed above,
`analytics-overview-network-stats_loading_failure.test.tsx` and
`analytics-overview-data-metrics_calculation_failure.test.tsx`, do exist;
everything else on the surface is uncovered. Resolves: N-03.)

### 8.2 AC verification ledger

| AC | Status |
|----|--------|
| AC-02, AC-04 | **open** — advanced by as-built variants, closed only by pending T-08/T-10 |
| AC-10 | **open** — advanced by T-14 (scaffold: the 8 report GETs) + T-19 (envelope test over them); T-16 and T-18 extend `analytics-envelope.test.ts` with `GET/PATCH /settings` and `GET /snapshot/:last_run_at` as part of their DoD; **finally closed at T-18**, when "all analytics endpoints" actually exist (Resolves: C-03) |
| AC-11, AC-12 | **open** — closed by T-19 (guard tests, split from T-14 per review C-05) |
| AC-14 | **superseded** (DD-07) — closed-as-superseded by ratification task T-06; note `pwa/src/__tests__/no-auth-grep.test.ts` still asserts the retired invariant (stale, flagged) |
| AC-01, AC-03, AC-05..AC-09, AC-13, AC-15..AC-18 | **open** — owned by pending tasks T-07..T-21 with the test paths the requirements name (created at execution; AC-01's recipe per §2 Pin-4; AC-07(a)'s fixture per OQ-4a) |

## 9. Rejected alternatives

- **Backdate a full design as if the drift were planned** — rejected: it would
  fabricate a decision record (violates the reconciliation's rule 1) and hide
  the NFR-02/route-name conflicts a reviewer must see.
- **Mark the built variants as closing AC-02/AC-04** — rejected: the variants
  miss testable clauses of those ACs (deep-links, weights, hover formula).
- **Fold the KPI/OKR/SLA/roll-down routes (`api/src/routes/kpi-*`, `okr-crud`,
  `sla-*`, `roll-down`) and exec views into this spec** — rejected: they are
  `_baseline` FR-07/FR-08 governance surfaces, not AN-1..AN-3 stories; their
  backfill spec is separate per CLAUDE.md's "adopted surfaces" list.
- **Deprecate the unbuilt FRs now** — rejected: descoping is a product call
  (§10 OQ-4/OQ-6), not the reconciler's.

## 10. Open Questions (need user decisions before pending tasks execute)

| # | Question | Options / trade-offs |
|---|----------|----------------------|
| OQ-1 | **NFR-02 vs the as-built graphology engine.** `api/src/ontology/analytics/graph.ts` reads Neo4j via `getDriver()` directly; NFR-02/AC-11 forbid direct driver use for this spec's surface. | (a) Amend NFR-02 to permit server-side read-only driver use inside `api/` (the loopback rationale for the HTTP hop is weaker server-side); (b) refactor the engine through the query service; (c) leave the engine under `_baseline` governance and apply NFR-02 only to new `api/src/analytics/` code (AC-11's grep target as written); (d) **(added rev 2 — Resolves: C-02)** route new `api/src/analytics/` reads through `runPassthrough` (`api/src/neo4j/read-only-session.ts`) — the established server-side read-only pattern: read-only session, mid-stream row cap (1000 rows, rejects `result_truncated` at record 1001), 5 s tx timeout; already used by 14 chat tools, the query executor, and `POST /api/v1/query/cypher` itself. Same guarantees as NFR-02's endpoint without a self-HTTP hop; costs only rewording NFR-02/AC-11's literal "through `POST /api/v1/query/cypher`" to name the shared module (AC-11's grep then targets `getDriver()`/`driver.session()` outside `runPassthrough`). Likely the cheapest compliant path. |
| OQ-2 | **Complexity formula.** Keep FR-04's weighted `depth × systems × roles` (build T-10, keep the proxy as an interim) or ratify the as-built proxy and revise FR-04? | Weighted formula enables the PDF/hash reproducibility chain (FR-08 depends on weights); the proxy is cheaper but breaks that chain. |
| OQ-3 | **Route naming.** Keep as-built `#/analytics/matrix`/`#/analytics/ai` or rename to FR-02/FR-07's `#/analytics/domain-system-matrix`/`#/analytics/ai-candidates`? | Renames break nothing today (no deep-links shipped) but FR text and AC recipes reference the FR names. |
| OQ-4 | **AI-candidates scope** (reframed rev 2 — Resolves: B-01). Three surfaces now exist or are specified: (i) FR-07's rule-based attribute filter (`repetitive`/`data_richness` equality match); (ii) the shipped `Ai.tsx` placeholder reframing the tab as Claude-generated recommendations; (iii) chat's **live, rule-based** `ai_candidates` tool ranking by `leverage_score` threshold (§3 FR-07 row). Which definition does the analytics tab ship as v1? | Rule-based matches AN-3.1 and the persona success criterion; LLM recommendations were explicitly out-of-scope in requirements ("ML-based scoring is its own future spec"). If rule-based: decide whether analytics adopts the chat tool's `leverage_score` ranking (analytics and chat then agree on what an AI candidate is) or FR-07's equality filter (then chat and analytics disagree unless chat migrates — a cross-spec change this spec doesn't own). Interacts with OQ-4a (vocabulary). |
| OQ-4a | **(new rev 2 — Resolves: B-01) Canonical AI-candidate attribute vocabulary.** As-built data + chat tool: `repetition: "low"\|"med"\|"high"`, `data_richness: "low"\|"med"\|"high"`, `runs_per_week`, `leverage_score` (per `shared/seed/retail-mini-enriched.json` + `api/src/chat/tools/ai-candidates.ts`). FR-07 defaults + Dependencies table: `repetitive: boolean true`, `data_richness: "low"\|"medium"\|"high"`. On the as-built seeds FR-07's default filter matches **zero** rows. Which vocabulary is canonical? | (a) **Ratify the as-built vocabulary** — T-13's default `analytics_ai_candidate_definition` becomes e.g. `{repetitive_key: "repetition", repetitive_match: "high", richness_key: "data_richness", richness_match: "high"}` (optionally + a `leverage_score` threshold per OQ-4); FR-07's empty-state copy and AC-07(a)'s fixture are revised at execution to name the real attributes; analytics agrees with chat. (b) **Keep FR-07 as written** — the enriched seed and the chat tool must migrate to `repetitive`/`"medium"`, a cross-spec change owned by chat-interface/graph-core seeds, not here; until then the default dashboard renders the empty state. (c) **Lean on the configurable definition** — ship FR-07's literal defaults knowing they match nothing until the operator reconfigures (worst option: the tab is empty out of the box, contradicting the persona's success criterion). Whatever the answer, it binds T-13's defaults and the AC-07(a) fixture. |
| OQ-5 | **Hardcoded chart hex colors** in `Complexity.tsx`/`Ai.tsx` vs the design-token rule (`_baseline` DD-05). Fix inside this spec's pending tasks or a design-conformance sweep? | — |
| OQ-6 | **PDF/hash/scheduler chunk (FR-08, FR-10, FR-11, FR-11a).** Still wanted as this spec's scope, or descope to a follow-up spec? If kept: pick the PDF library (`@react-pdf/renderer` recommended in requirements vs `pdfkit` vs `puppeteer`). | This is ~half the remaining effort; the persona's quarterly-PDF success criterion argues for keeping it. |
