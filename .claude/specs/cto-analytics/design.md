---
feature: "cto-analytics"
created: "2026-07-04"
author: "spec-author (as-built reconciliation)"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
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
   deferred to this phase (PDF library, hash-protocol implementation, cron
   default, matrix virtualisation) remain **open** — they belong to the
   execution of the pending tasks, gated on §10 answers.

Governance note: the built artifacts listed here are currently governed by
`_baseline` (current truth per `.claude/CLAUDE.md`). This spec's remaining
scope — the pending tasks in `tasks.md` — is what this spec still owns.

## 2. Prior-review concerns — status at reconciliation

Carried open-accepted items from `review-requirements-pass-2.md`:

| Item | Status in this reconciliation |
|------|-------------------------------|
| Open-1: AC-06 lacks a `wall_clock` truncation case | Pinned: pending task T-12's test plan must include a wall-clock fixture (slow-query simulation or injected clock). Binding on execution. |
| Open-2: endpoint count "Ten" ambiguity | Pinned: **10 paths, 11 method+path registrations** (8 report GETs + `GET /settings` + `PATCH /settings` + `GET /snapshot/:last_run_at`). None of the 10 exist as-built — see §5. |
| Open-3: AC-02 verification recipe still reads `?system=:id&domain=:id` | Pinned: the binding param names are FR-02's `?system_id=:sid&domain_id=:did`. AC-02 is not renumbered; its verification recipe is corrected at execution (task T-08). |

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
| FR-07 AI-candidate filter + CSV | **not built — open** (placeholder shipped) | `pwa/src/views/analytics/Ai.tsx` at `#/analytics/ai` is a **static preview**: two hardcoded `SAMPLES` cards, non-functional Accept/Reject/Defer buttons, and a `GreyBlock` labelled "Live recommendations — wired by cto-analytics". No attribute filter, no `analytics_ai_candidate_definition`, no CSV export, no empty-state copy. | The as-built view also reframes the surface as "Claude-generated proposals" — a scope drift from the rule-based `repetitive`/`data_richness` filter in FR-07 (§10 OQ-4). |
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
| DD-08 | **Chart rendering via the shared chart kit** (`pwa/src/components/charts`: `PieChartCard`, `BarChartCard`, `HorizontalBarChartCard`, `KpiCard`) + `color-mix` accent heatmap in Matrix. | FR-02, FR-04 (rendering) | Matrix's accent-derived cell shading honours FR-01's "shades of the single project accent" intent. Divergence: `Complexity.tsx` and `Ai.tsx` hardcode hex chart colors (`#22c55e`, `#3b82f6`, `#f59e0b`, `#ef4444`, `#8b5cf6`) instead of `var(--…)` tokens — violates `_baseline` DD-05 (§10 OQ-5). |

**Deliberately NOT decided here** (the requirements deferred these to the
design phase; the drift never made them, so they stay open — see §10 and the
pending tasks): PDF library (`@react-pdf/renderer` vs `pdfkit` vs
`puppeteer`), NFR-05 hash-protocol implementation module, scheduler cron
default + TZ handling, matrix virtualisation library, `analytics_*` SQLite
file layout.

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

### 7.2 Open scope (pending tasks T-07..T-18; paths are intended homes, per the requirements' `api/src/analytics/` convention in AC-11/AC-12)

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
exist — consistent with `_baseline` design §5 ("exec/analytics views have no
automated coverage").

### 8.2 AC verification ledger

| AC | Status |
|----|--------|
| AC-02, AC-04 | **open** — advanced by as-built variants, closed only by pending T-08/T-10 |
| AC-14 | **superseded** (DD-07) — closed-as-superseded by ratification task T-06; note `pwa/src/__tests__/no-auth-grep.test.ts` still asserts the retired invariant (stale, flagged) |
| AC-01, AC-03, AC-05..AC-13, AC-15..AC-18 | **open** — owned by pending tasks T-07..T-18 with the test paths the requirements name (created at execution) |

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
| OQ-1 | **NFR-02 vs the as-built graphology engine.** `api/src/ontology/analytics/graph.ts` reads Neo4j via `getDriver()` directly; NFR-02/AC-11 forbid direct driver use for this spec's surface. | (a) Amend NFR-02 to permit server-side read-only driver use inside `api/` (the loopback rationale for the HTTP hop is weaker server-side); (b) refactor the engine through the query service; (c) leave the engine under `_baseline` governance and apply NFR-02 only to new `api/src/analytics/` code (AC-11's grep target as written). |
| OQ-2 | **Complexity formula.** Keep FR-04's weighted `depth × systems × roles` (build T-10, keep the proxy as an interim) or ratify the as-built proxy and revise FR-04? | Weighted formula enables the PDF/hash reproducibility chain (FR-08 depends on weights); the proxy is cheaper but breaks that chain. |
| OQ-3 | **Route naming.** Keep as-built `#/analytics/matrix`/`#/analytics/ai` or rename to FR-02/FR-07's `#/analytics/domain-system-matrix`/`#/analytics/ai-candidates`? | Renames break nothing today (no deep-links shipped) but FR text and AC recipes reference the FR names. |
| OQ-4 | **AI-candidates scope.** FR-07 is a rule-based attribute filter; the shipped placeholder reframes the tab as Claude-generated recommendations. Which is v1? | Rule-based matches AN-3.1 and the persona success criterion; LLM recommendations were explicitly out-of-scope in requirements ("ML-based scoring is its own future spec"). |
| OQ-5 | **Hardcoded chart hex colors** in `Complexity.tsx`/`Ai.tsx` vs the design-token rule (`_baseline` DD-05). Fix inside this spec's pending tasks or a design-conformance sweep? | — |
| OQ-6 | **PDF/hash/scheduler chunk (FR-08, FR-10, FR-11, FR-11a).** Still wanted as this spec's scope, or descope to a follow-up spec? If kept: pick the PDF library (`@react-pdf/renderer` recommended in requirements vs `pdfkit` vs `puppeteer`). | This is ~half the remaining effort; the persona's quarterly-PDF success criterion argues for keeping it. |
