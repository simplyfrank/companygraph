---
feature: "cto-analytics"
created: "2026-07-04"
author: "spec-author (as-built reconciliation)"
status: "revised"
revision: 3
reviewing_requirements_revision: 3
review_pass_1_findings: "1 blocker, 5 concerns, 3 nits — all absorbed in revision 2 (see §1a)"
size: "medium"
reconciliation_of: "_baseline adoption 2026-07-04"
revision_note: "revision 3 (2026-07-04): §10 Open Questions resolved as Resolved Decisions RD-1..RD-7; §7.2 replaced with an explicit per-file BUILD-set table; FR-08/10/11/11a deferred (RD-6); AC-10 re-pointed to T-19."
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
3. **The unbuilt majority is now split into a BUILD set and a deferred set.**
   4 of 12 FRs have any implementation; 8 had none. **Resolved 2026-07-04
   (§10 Resolved Decisions RD-1..RD-7):** the seven open questions are answered
   — the pending design decisions the requirements deferred to this phase are
   now either pinned in scope (matrix virtualisation — T-08, RD-3) or deferred
   with their FR to the follow-up spec `cto-analytics-reporting` (PDF library,
   hash-protocol implementation, scheduler TZ edge-handling — RD-6). The BUILD
   set (T-07..T-14, T-19..T-21) is unblocked; T-15..T-18 are deferral
   ratifications. See §10.

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
| Open-2: endpoint count "Ten" ambiguity | Pinned: originally **10 paths, 11 registrations** (8 report GETs + `GET /settings` + `PATCH /settings` + `GET /snapshot/:last_run_at`). **RD-6 (2026-07-04)** splits these: **BUILD set = 7 report GETs** this spec (`exec-summary.pdf` + `GET/PATCH /settings` + `GET /snapshot/:last_run_at` = 3 paths / 4 registrations **deferred to `cto-analytics-reporting`**). None existed as-built — see §5.1/§5.2/§5.3. |
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
| FR-07 AI-candidate filter + CSV | **not built — open** (placeholder shipped; adjacent partials exist) | `pwa/src/views/analytics/Ai.tsx` at `#/analytics/ai` is a **static preview**: two hardcoded `SAMPLES` cards, non-functional Accept/Reject/Defer buttons, and a `GreyBlock` labelled "Live recommendations — wired by cto-analytics". No attribute filter, no `analytics_ai_candidate_definition`, no CSV export, no empty-state copy. **Adjacent partials (added rev 2 — Resolves: B-01)**: `api/src/chat/tools/ai-candidates.ts` (chat-interface FR-T12) is a **live, rule-based** `ai_candidates` chat tool — one Cypher pass over Activities via `runPassthrough`, then TS-side filter `leverage_score >= min_leverage` (default `0.5`) sorted DESC, returning `repetition`/`data_richness`/`runs_per_week` alongside; and `shared/seed/retail-mini-enriched.json`, whose 32 Activities carry `leverage_score` (0.15–0.83), `runs_per_week`, `repetition: "low"\|"med"\|"high"`, `data_richness: "low"\|"med"\|"high"`. | The as-built view reframes the surface as "Claude-generated proposals" — a scope drift from the rule-based filter in FR-07. **RESOLVED 2026-07-04 (RD-4 + RD-4a):** the analytics tab ships **rule-based**, adopting chat's `leverage_score` ranking (RD-4), and **ratifies the as-built vocabulary** `repetition: "low"\|"med"\|"high"` + `data_richness: "low"\|"med"\|"high"` + `leverage_score` (RD-4a). T-13's default `analytics_ai_candidate_definition` uses these real attributes + a `leverage_score` threshold (default `0.5`); FR-07's empty-state copy and AC-07(a)'s fixture are revised to name them so the enriched seed populates the tab (not empty). The requirements Dependencies table `"med"` vs `"medium"` mismatch is fixed to the seed's `"med"`. **Vocabulary contradiction (historical, rev 2 — Resolves: B-01)**: the as-built data + chat tool use `repetition` (enum string) and richness value `"med"`; FR-07's *original* defaults used `repetitive_key: "repetitive"` matched against boolean `true`, and the Dependencies table spelled the enum `"low"\|"medium"\|"high"` — the source of the zero-row mismatch RD-4a resolves. Binds T-13's default `analytics_ai_candidate_definition` and the AC-07(a) fixture. |
| FR-08 Exec-summary PDF + hash | **not built — open** | Adjacent-but-different: `GET /api/v1/snapshot?at=:iso` (`api/src/routes/snapshot.ts`, risk-compliance RC-2.2 auditor export) computes a SHA-256 over `JSON.stringify` — it does **not** implement the NFR-05 8-rule protocol and is not this spec's endpoint. No PDF pipeline exists; no PDF library is in `api/package.json`. | n/a |
| FR-09 Analytics REST endpoints | **partial** | One endpoint: `GET /api/v1/analytics/graph` (`api/src/router.ts:760` → `api/src/routes/analytics.ts` → `api/src/ontology/analytics/graph.ts`, graphology: density/cycles/SCCs/Louvain/betweenness/pagerank/degree/orphans/bottlenecks). Plus `GET /api/v1/stats` (`api/src/routes/stats.ts`) feeding the Overview view. | None of the 8 FR-09 paths exist. The graphology engine reads Neo4j **directly** via `getDriver()`. **RESOLVED 2026-07-04 (RD-1):** the engine migrates to `api/src/analytics/graph.ts` and reads through the new shared read-only module `api/src/neo4j/read-only-graph.ts`; NFR-02/AC-11 reworded to name that module (no direct `getDriver()`/`driver.session()` inside `api/src/analytics/`). |
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
| DD-02 | **Server-side graph metrics via graphology.** `GET /api/v1/analytics/graph` builds a graphology graph from a full Neo4j read (`api/src/ontology/analytics/graph.ts`) and computes density, elementary cycles, SCCs, Louvain communities, betweenness, pagerank, degree, orphans, bottlenecks. **RD-1 (2026-07-04):** the engine **migrates** to `api/src/analytics/graph.ts` and its direct `getDriver()` read is replaced by the new shared read-only module `api/src/neo4j/read-only-graph.ts` (`fetchGraph()` / `runReadOnlyGraph()` — `defaultAccessMode: "READ"` + tx timeout, no 1000-row cap so the full graph loads). No analytics module calls `getDriver()`/`driver.session()` directly. | FR-09 (partial); adjacent to FR-01/FR-06 | Resolves the former OQ-1 tension: RD-1 reworded NFR-02/AC-11 to name the shared read-only module instead of `POST /api/v1/query/cypher`; AC-11's guard test (T-19) greps `api/src/analytics/` for direct-driver use. |
| DD-03 | **Live computation, no cache.** Every analytics render recomputes from the live graph; there is no precompute, no snapshot id, no staleness envelope. | FR-04 (variant) | Directly diverges from FR-10's cached-nightly model. Acceptable at `retail-mini` scale; FR-10 remains open scope. |
| DD-04 | **Complexity proxy formula** `score = activities + fanOut + fanIn`, bucketed low/med/high/very-high with `Pill` tones. The view's own lede labels it a "quick complexity proxy". | FR-04 (variant) | **RD-2 (2026-07-04):** the proxy is **interim only** — a visible "quick complexity proxy" label until T-10 lands FR-04's canonical weighted `depth × distinct systems × distinct roles`. The weighted formula is canonical (it feeds FR-08's weights-in-hash chain). |
| DD-05 | **Route names as-built**: analytics surface tabs are `overview | matrix | complexity | ai` (`pwa/src/route.ts` surface `analytics`, kbd "5"; `pwa/src/views/index.tsx` VIEWS map). | FR-02, FR-04, FR-07 (routes) | **RD-3 (2026-07-04):** the as-built short names are **kept** (`matrix`, `ai` stay; no rename to `domain-system-matrix`/`ai-candidates`). New tabs use the FR route names `systems`, `consolidation`, `single-system`, `critical-paths`. FR-02/FR-07 + affected AC recipes updated to the short names. |
| DD-06 | **Overview landing tab** (stats KPIs + distributions) exists without an FR here; adopted as the analytics landing view under `_baseline` FR-14. | — (adjacent) | Any future FR for it belongs to a revision of this spec's requirements, not to this reconciliation. |
| DD-07 | **No-auth invariant retired.** Analytics routes sit behind the central OAuth/RBAC gate in `api/src/router.ts` (401/403 before dispatch). `_baseline` DD-02/DD-07 retired graph-core's NFR-08/AC-22 rule and deleted `api/__tests__/no-auth-grep.test.ts`. This spec's NFR-06/AC-14 are **superseded** accordingly. | NFR-06, AC-14 | Leftover: `pwa/src/__tests__/no-auth-grep.test.ts` still exists in the PWA suite and asserts the retired invariant — flagged in §8, cleanup belongs to the auth backfill spec, not here. |
| DD-08 | **Chart rendering via the shared chart kit** (`pwa/src/components/charts`: `PieChartCard`, `BarChartCard`, `HorizontalBarChartCard`, `KpiCard`) + `color-mix` accent heatmap in Matrix. | FR-02, FR-04 (rendering) | Matrix's accent-derived cell shading honours the project's "shades of the single project accent" rule (stated in requirements FR-01, applied here to FR-02's surface — Resolves: N-02). **RD-5 (2026-07-04):** `Complexity.tsx` and `Ai.tsx` hardcode hex chart colors (`#22c55e`, `#3b82f6`, `#f59e0b`, `#ef4444`, `#8b5cf6`) instead of `var(--…)` tokens — detokenised within the pending tasks that already touch those files: T-10 (Complexity), T-13 (Ai); T-21 owns any new ramp tokens the charts consume. |

**Resolved / re-homed (2026-07-04, §10 Resolved Decisions):** the items the
requirements deferred to design now split two ways. **In scope, still to
pin at execution:** matrix virtualisation library (T-08, RD-3). **Deferred to
`cto-analytics-reporting` with RD-6:** PDF library (`@react-pdf/renderer` vs
`pdfkit` vs `puppeteer`) — the choice moves to the follow-up spec — plus the
NFR-05 hash-protocol implementation module, scheduler TZ edge-handling, and the
`analytics_*` SQLite file layout (all part of the deferred FR-08/FR-10/FR-11/FR-11a
chunk). Nothing is deleted; the follow-up spec owns these decisions.

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

### 5.2 Required by FR-09, built this spec (RD-1/RD-3)

The **8 FR-09 report GETs** land under `/api/v1/analytics/` in T-14
(scaffold) + the per-report modules (T-09/T-11/T-12/T-20). Route names
per RD-3 (short as-built names kept where they exist):

`GET /systems`, `GET /matrix` (RD-3: short name, was `domain-system-matrix`),
`GET /consolidation`, `GET /complexity`, `GET /single-system-journeys`,
`GET /critical-paths`, `GET /ai-candidates`, `GET /exec-summary.pdf`
(the exec-summary path is registered by the deferred FR-08 in the
follow-up spec — see §5.3).

### 5.3 Deferred to `cto-analytics-reporting` (RD-6, was open scope)

`GET+PATCH /settings` (FR-11), `GET /snapshot/:last_run_at` (FR-11a),
`GET /exec-summary.pdf` (FR-08), and the nightly scheduler (FR-10) are
**deferred** to the follow-up spec `cto-analytics-reporting` (RD-6,
2026-07-04). Ratification tasks T-15/T-16/T-17/T-18 record the deferral;
they build nothing. AC-10 closes over the **shipped** endpoints (§8.2).

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
  iOS share-sheet CSV download flow (FR-07). The PDF share-sheet suppression
  (FR-08) moves with the RD-6 deferral to `cto-analytics-reporting` (former
  T-17 owner); it is out of this spec's build set.

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

### 7.2 BUILD-set file changes (pending tasks T-07..T-14, T-19, T-20, T-21)

Explicit per-file table — every file a BUILD task creates or modifies is
named here **and** in the owning task's `Files` list (the spec-guard hook,
`enforced: true`, requires both). Paths follow the requirements'
`api/src/analytics/` convention (AC-11/AC-12).

| Path | Action | Task | Serves |
|------|--------|------|--------|
| `api/src/neo4j/read-only-graph.ts` | **new** | T-20 | RD-1 — shared read-only graph reader (`fetchGraph`/`runReadOnlyGraph`, no 1000-row cap), sibling to `read-only-session.ts` |
| `api/src/analytics/graph.ts` | **new (migrated)** | T-20 | RD-1 — graphology engine migrated from `api/src/ontology/analytics/graph.ts`; reads via `read-only-graph.ts` |
| `api/src/analytics/system-map.ts` | new | T-20 | FR-01 — degree centrality + integration count per `System` |
| `api/src/analytics/routes.ts` | new | T-14 | FR-09 — the 8 report GETs, zod-validated, NFR-08 envelope |
| `api/src/analytics/consolidation.ts` | new | T-09 | FR-03 |
| `api/src/analytics/complexity.ts` | new | T-10 | FR-04 — weighted `depth × systems × roles`, code-default weights (RD-6 §10.2) |
| `api/src/analytics/single-system.ts` | new | T-11 | FR-05 |
| `api/src/analytics/critical-path.ts` | new | T-12 | FR-06 — depth-bounded DFS + truncation envelope |
| `api/src/analytics/ai-candidates.ts` | new | T-13 | FR-07 — RD-4/RD-4a rule-based filter + `leverage_score` + CSV |
| `api/src/router.ts` | modify | T-14 | mount `/api/v1/analytics/*` report routes |
| `pwa/src/views/analytics/Systems.tsx` + `Systems.module.css` | new | T-07 | FR-01 system map |
| `pwa/src/views/analytics/Matrix.tsx` + `Matrix.module.css` | modify | T-08 | FR-02 deep-links + virtualisation + filters |
| `pwa/src/views/analytics/Consolidation.tsx` | new | T-09 | FR-03 |
| `pwa/src/views/analytics/Complexity.tsx` | modify | T-10 | FR-04 real formula + hover popover + RD-5 detokenise |
| `pwa/src/views/analytics/Settings.tsx` | new | T-10 | FR-04 weights pane (reads code-default weights; full FR-11 tunability deferred, RD-6) |
| `pwa/src/views/analytics/SingleSystem.tsx` | new | T-11 | FR-05 |
| `pwa/src/views/analytics/CriticalPaths.tsx` | new | T-12 | FR-06 |
| `pwa/src/views/analytics/Ai.tsx` | modify | T-13 | FR-07 live table + CSV + empty state + RD-5 detokenise |
| `pwa/src/styles/companygraph/tokens.css` | modify | T-21 | FR-01 — five `--accent-100/-300/-500/-700/-900` ramp stops |
| `pwa/src/route.ts` | modify | T-09, T-21 | register `consolidation`, `single-system`, `critical-paths`, `systems` tabs (RD-3 names) |
| `pwa/src/views/index.tsx` | modify | T-09, T-21 | VIEWS entries for the new tabs |

Test files created by BUILD tasks (allow-globbed by `.specconfig`, listed
for completeness): `pwa/src/__tests__/analytics-system-map.test.tsx` (T-07),
`pwa/src/__tests__/analytics-matrix.test.tsx` (T-08),
`api/__tests__/analytics-consolidation.integration.test.ts` (T-09),
`pwa/src/__tests__/analytics-complexity.test.tsx` (T-10),
`api/__tests__/analytics-single-system.integration.test.ts` (T-11),
`api/__tests__/analytics-critical-path.test.ts` (T-12),
`api/__tests__/analytics-ai-candidates.test.ts` +
`pwa/src/__tests__/analytics-ai-empty-state.test.tsx` (T-13),
`api/__tests__/analytics-envelope.test.ts` +
`api/__tests__/analytics-no-direct-driver.test.ts` +
`api/__tests__/analytics-no-write-imports.test.ts` (T-19).

**Note (RD-1):** the migrated engine leaves `api/src/ontology/analytics/graph.ts`
and its route wiring `api/src/routes/analytics.ts` in place as the ratified
as-built surface (T-05); T-20's new `api/src/analytics/graph.ts` is the
governed home going forward. The old file is not deleted by this spec (that
cleanup, if wanted, is a separate change) — T-20 re-points the analytics
reads to the new module.

### 7.3 Deferred-set files (NOT built by this spec — RD-6)

T-15/T-16/T-17/T-18 are ratification-only after RD-6; they create **no**
files. Their former target files (`api/src/analytics/scheduler.ts`,
`cache.ts`, `settings.ts`, `hash.ts`, `exec-summary.ts`, `snapshot.ts`;
`pwa/src/views/analytics/ExecSummary.tsx`; the `analytics_*` SQLite tables)
move to the follow-up spec `cto-analytics-reporting`. Nothing here creates
them, so the enforcement hook needs no coverage for them in this spec.

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
| AC-02, AC-04 | **open** — advanced by as-built variants, closed by BUILD tasks T-08/T-10 |
| AC-10 | **open — re-pointed per RD-6 (2026-07-04):** closes over the **shipped** analytics endpoints (the 7 BUILD-set FR-09 report GETs; `exec-summary.pdf` is deferred with FR-08). Advanced by T-14 (scaffold) and **closed at T-19** (`analytics-envelope.test.ts` over the shipped GETs). The former T-16/`/settings` and T-18/`/snapshot/:last_run_at` extensions roll into the follow-up spec `cto-analytics-reporting` with the deferred FR-11/FR-11a. (Supersedes the C-03 disposition that closed AC-10 at T-18.) |
| AC-11, AC-12 | **open** — closed by T-19 (guard tests, split from T-14 per review C-05); T-19's no-direct-driver grep enforces RD-1 over `api/src/analytics/` |
| AC-14 | **superseded** (DD-07) — closed-as-superseded by ratification task T-06; note `pwa/src/__tests__/no-auth-grep.test.ts` still asserts the retired invariant (stale, flagged) |
| AC-01, AC-03, AC-05, AC-06, AC-07, AC-15 | **open** — owned by BUILD tasks T-07/T-09/T-11/T-12/T-13/T-21 with the test paths the requirements name (created at execution; AC-01's recipe per §2 Pin-4; AC-07(a)'s fixture per RD-4a) |
| AC-08, AC-09, AC-13, AC-16, AC-17, AC-18 | **deferred with RD-6** — these close over FR-08/FR-10/FR-11/FR-11a (PDF+hash, scheduler, settings-audit, snapshot), all deferred to `cto-analytics-reporting`. Their ratification tasks (T-15/T-16/T-17/T-18) record the deferral; the ACs are re-homed to the follow-up spec, not closed here. |

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

## 10. Resolved Decisions (owner decisions, 2026-07-04)

All seven open questions were resolved by owner decision on 2026-07-04
(delegated, autonomous completion authorised). The former OQ table is
retained below as a **Resolved Decisions** ledger — RD-1..RD-7 preserve
the OQ-N numbering (RD-N ⇔ former OQ-N; RD-4a ⇔ former OQ-4a) so
cross-references in `tasks.md`/`requirements.md` that read "OQ-N" resolve
unambiguously. Each row records the decision, its rationale, and the
propagation sites.

| RD (was OQ) | Decision | Rationale | Propagated to |
|-------------|----------|-----------|---------------|
| **RD-1** (OQ-1) | **Option (d) — abstract the Neo4j integration behind a shared read-only module.** All analytics graph reads go through a new read-only helper in `api/src/neo4j/`; analytics modules **never** call `getDriver()`/`driver.session()` directly. Because analytics needs the **full** graph (all nodes + edges, > 1000 rows), the helper is a read-only reader (`defaultAccessMode: "READ"` + tx-timeout) **without** `runPassthrough`'s 1000-row cap — a sibling `api/src/neo4j/read-only-graph.ts` exposing `fetchGraph()` / `runReadOnlyGraph()`. The as-built engine `api/src/ontology/analytics/graph.ts` **migrates** into `api/src/analytics/graph.ts` and uses this helper. NFR-02/AC-11 reworded: from the literal "all reads go through `POST /api/v1/query/cypher`" to "all analytics graph reads go through the shared read-only Neo4j module (`api/src/neo4j/read-only-*.ts`); no direct `getDriver()`/`driver.session()` inside `api/src/analytics/`". | The loopback self-HTTP hop buys nothing server-side; the shared read-only module gives the same read-only + timeout guarantees while letting analytics fetch the full graph (which `runPassthrough`'s 1000-row cap would truncate). Cheapest compliant path; DD-02's engine migrates rather than being rewritten. | NFR-02, AC-11 (requirements); DD-02 (design §4); §5, §7.2 (design); T-14, T-19, T-20 Files (tasks); guard test T-19 greps `api/src/analytics/` for direct-driver use |
| **RD-2** (OQ-2) | **Build FR-04's weighted formula** `depth × distinct systems × distinct roles` (T-10). Keep the as-built proxy (`activities + fanOut + fanIn`) only as an **interim visible label** ("quick complexity proxy") until T-10 lands. | The weighted formula is load-bearing for the PDF/hash reproducibility chain (FR-08's hash input includes `weights`); the proxy breaks that chain. | FR-04 (unchanged — already the target); DD-04 (design §4, marked interim); T-03, T-10 (tasks) |
| **RD-3** (OQ-3) | **Keep the as-built short route names** (`overview \| matrix \| complexity \| ai`). The **new** tabs use the FR route names (`systems`, `consolidation`, `single-system`, `critical-paths`). Update FR-02/FR-07 and every AC recipe that references `#/analytics/domain-system-matrix` / `#/analytics/ai-candidates` to the as-built short names. | No deep-links shipped, so renaming buys nothing; keeping the short names avoids breaking existing nav + kbd shortcuts + any future tests. | FR-02, FR-07, AC-02 (requirements); DD-05 (design §4); §6 view tree; T-08, T-13, T-21 (tasks) |
| **RD-4** (OQ-4) | **Rule-based AI candidates** (LLM out of scope per requirements), and analytics **adopts chat's `leverage_score` ranking** so analytics and chat agree on what an "AI candidate" is. `Ai.tsx`'s placeholder becomes the real rule-based tab in T-13. | Rule-based matches AN-3.1 and the persona success criterion; ML/LLM scoring was explicitly deferred in requirements Scope. Adopting chat's ranking keeps the two surfaces consistent. | FR-07 (requirements); §3 FR-07 row (design); T-04, T-13 (tasks) |
| **RD-4a** (OQ-4a) | **Ratify the as-built vocabulary (option a)** — `repetition: "low"\|"med"\|"high"`, `data_richness: "low"\|"med"\|"high"`, `runs_per_week`, `leverage_score` (matching `shared/seed/retail-mini-enriched.json` + `api/src/chat/tools/ai-candidates.ts`). T-13's default `analytics_ai_candidate_definition` uses these real attributes **plus a `leverage_score` threshold** (default `0.5`, matching the chat tool's `min_leverage`). FR-07's empty-state copy and AC-07(a)'s fixture are revised to name the real attributes so the default dashboard is **not** empty on the enriched seed. The `"med"` vs `"medium"` mismatch in the requirements Dependencies table is fixed to the seed's `"med"`. | The as-built seed + chat tool are current truth; migrating them would be a cross-spec change this spec doesn't own. Ratifying keeps analytics ≡ chat and makes the tab populate out of the box. | FR-07, AC-07, Dependencies table (requirements); §3 FR-07 row (design); T-13 (tasks) |
| **RD-5** (OQ-5) | **Detokenize charts within the pending tasks.** `Complexity.tsx` and `Ai.tsx` hardcoded hex (`#22c55e`/`#3b82f6`/`#f59e0b`/`#ef4444`/`#8b5cf6`) → `var(--…)` tokens from `pwa/src/styles/companygraph/tokens.css`. Folded into T-10 (Complexity view) and T-13 (Ai view); T-21 owns any new ramp tokens the charts consume. | Fix at the point the tasks already touch those files rather than a separate sweep; keeps the change traceable to a governing task. | DD-08 (design §4); T-10, T-13, T-21 (tasks) |
| **RD-6** (OQ-6) | **DEFER FR-08, FR-10, FR-11, FR-11a** (tasks T-15, T-16, T-17, T-18) to a follow-up spec **`cto-analytics-reporting`** — modeled on graph-core's T-32 ratified-deferral pattern. Each FR is annotated `priority: deferred` in requirements.md with rationale; T-15/16/17/18 become deferral-ratification tasks (they build nothing; each records the deferral + the follow-up spec name). AC-10 closure is **re-pointed**: it now closes over the **shipped** endpoints at T-19/T-14 (the deferred `/settings`, `/snapshot` roll into the follow-up). No built task depends on a deferred one. | PDF export + nightly scheduler + settings/audit add a runtime PDF dependency and a scheduler/settings subsystem that warrant explicit design sign-off; deferring to a dedicated follow-up spec keeps this spec shippable while nothing is deleted. PDF-library choice moves with the deferral (decided in `cto-analytics-reporting`). | FR-08/FR-10/FR-11/FR-11a `priority: deferred` (requirements); AC-10 (requirements); §8.2 (design); T-15/T-16/T-17/T-18 → deferral tasks (tasks); dependency edges scrubbed |

### 10.1 Build set vs deferred (execution scope)

- **BUILD (this spec):** T-07, T-08, T-09, T-10, T-11, T-12, T-13, T-14, T-19, T-20, T-21.
- **RATIFY (as-built, no code):** T-01, T-02, T-03, T-04, T-05, T-06.
- **DEFERRED to `cto-analytics-reporting` (ratification-only, no code):** T-15, T-16, T-17, T-18.

No BUILD task is `Blocked by` a DEFERRED task. T-09/T-11/T-12/T-20/T-19
depend only on T-14 (built). T-10 previously depended on T-16 (settings)
— re-pointed: T-10 stores weights in a minimal `analytics_settings` row
owned by T-14's scaffold (RD-6 note below). T-13 previously depended on
T-16 (definition row) — re-pointed likewise. See §10.2.

### 10.2 Settings/weights storage after the RD-6 deferral

FR-11's full settings subsystem (`analytics_settings` + audit +
`GET`/`PATCH /settings`) is deferred with T-16. But T-10 (weighted
complexity) and T-13 (AI-candidate definition) each need a **read** of a
small config value (score weights; the AI-candidate definition +
`leverage_score` threshold). To avoid a build task depending on a
deferred one, the **defaults live in code** (constant defaults:
`depth_weight=system_weight=role_weight=1.0`; the RD-4a definition +
`0.5` threshold) served by T-14's scaffold as read-only config; runtime
tunability + the audit trail land with FR-11 in `cto-analytics-reporting`.
T-10/T-13 therefore depend on **T-14 only**, never on the deferred T-16.
