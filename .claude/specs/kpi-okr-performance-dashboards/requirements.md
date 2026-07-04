---
feature: "kpi-okr-performance-dashboards"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, round-4 View Tree)"
status: "revised"
revision: 2
size: "large"
---

# Requirements: kpi-okr-performance-dashboards

## Summary

A new **Exec** tab `#/exec/performance` (view component
`PerformanceDashboard`, blueprint View Tree round-4 addition, verbatim)
that turns the governed KPI/SLA/OKR surface into a **performance
control** panel: KPI trends with target/breach status, OKR roll-down
performance (assignment / commit / approval state per domain), all
**sliceable by domain / journey / systemKind**. It is a **read /
aggregate** surface — it consumes the routes owned and verified by
`kpi-okr-governance` (`GET /api/v1/kpis`, `/api/v1/kpi-trends/:kpiId`,
`/api/v1/okr-directives`, `/api/v1/okr-performance`,
`/api/v1/roll-down/*`, `/api/v1/domains`) and the `systemKind`
vocabulary from `system-augmentation-model` (`shared/src/schema/system-kind.ts`).
Where those per-KPI routes cannot answer a *portfolio* question
(target/breach status across many KPIs at once, or a systemKind slice
that requires a graph traversal), this spec adds **read-only aggregate
endpoints under `/api/v1/analytics/performance`** — never new
CRUD, never new write paths.

**Not included:** KPI/OKR/SLA CRUD (exists in the adopted surface,
governed by `kpi-okr-governance`); KPI-impact editing / coverage matrix
(`kpi-impact-mapping` owns `DRIVES_KPI` direction+weight editing and
`#/model/kpi-impact`); the `systemKind` schema/badges/`#/explorer/systems`
filter (`system-augmentation-model`); the roll-down *authoring* views
`RollDown.tsx` / `RollDownAnalytics.tsx` (stay `_baseline`-governed —
this spec reads their routes only, it does not touch those views).

## Motivation

1. Blueprint round-4 ("manage the business from this view") calls for a
   single executive performance-control surface: "trends,
   target/breach status, and OKR roll-down control sliceable by
   augmentation kind." No such view exists — today the exec surface has
   per-resource management views (`KpiManagement`, `OkrManagement`,
   `RollDown`) but no consolidated performance dashboard.
2. The building blocks now exist but are scattered: `kpi-trends`
   answers *one KPI at a time*; `okr-performance` answers *one domain at
   a time*; roll-down status is spread across ~24 endpoints. An exec
   needs the portfolio view — "which KPIs are breaching, across which
   domains, driven by which kind of system" — in one place.
3. `system-augmentation-model` (XD-15) makes `systemKind` a required
   enum on every `System`; this is the first consumer that lets an exec
   *slice performance by augmentation kind* (functional / agentic /
   ai_predictive), answering the round-4 ask directly.
4. `kpi-okr-governance` (XD-16) has just made the underlying surface
   trustworthy (verified + integration-tested + list endpoints added);
   building a dashboard on it now is safe rather than building on
   ungoverned routes (the rejected alternative in XD-16).

## Functional Requirements

<!-- Store of record: KPI/OKR/SLA nodes live in Neo4j; KPI measurements
     in Postgres (kpi_measurements table). This spec reads both through
     the governed routes; the FR-05..FR-08 aggregate endpoints read the
     same stores, no new store (XD-02). -->

### A. Performance dashboard view (`#/exec/performance`)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | A new Exec-tab route `#/exec/performance` renders the `PerformanceDashboard` view (route + view name taken verbatim from the blueprint round-4 View Tree). The tab is registered as an **additive** row appended to the existing `exec` surface's `tabs` array in `pwa/src/route.ts` (id `performance`, label `Performance`) after the `okr-management` tab — a non-conflicting single-line addition (see FILE-OWNERSHIP note under Scope Boundaries). | must | blueprint View Tree round-4, UX-06 |
| FR-02 | **KPI trend + target/breach status panel** — the dashboard lists KPIs (from `GET /api/v1/kpis`) each showing: current value (latest measurement), target (`target_value` + `unit`), a **status** of `on_target` / `warning` / `breach` / `no_data`, and a compact trend sparkline/line for the selected window. Status is computed from the KPI's `target_direction` (`higher_is_better` / `lower_is_better` / `target_is_exact`), `warning_threshold`, `critical_threshold`, and the latest measurement — the same fields the governed `kpiSchema` (`shared/src/schema/kpi-sla.ts`) already carries. The computation lives server-side in the FR-05 aggregate (single source of truth), not re-derived per client. | must | blueprint round-4 ("KPI trends + target/breach status") |
| FR-03 | **OKR roll-down performance panel** — for the active slice, the dashboard shows OKR directive → key-result → KPI roll-down state: per assigned domain, the **as-built assignment status** `status ∈ {pending, committed, approved, rejected}` and contribution progress, read from `GET /api/v1/roll-down/okr` (+ by-domain), `GET /api/v1/roll-down/contributions`, and `GET /api/v1/okr-performance?domain_id=…`. The stored value on assignment create is `pending` (per `api/src/routes/roll-down.ts` — CREATE sets `status:'pending'`; commit/approve/reject transition to `committed`/`approved`/`rejected`); the UI MAY render `pending` under a friendlier display label (e.g. "Awaiting"), but that is a *display mapping only* — the stored/tested contract remains the four as-built literals, never a re-invented `assigned`/`adjustment_requested` status. **Pending adjustments** are a *separate signal*, not a fifth assignment status: they are `RollDownAdjustment` nodes (`status:'pending'`) created by `POST /api/v1/roll-down/request-adjustment`; if the panel surfaces an "adjustment requested" flag on a domain row it reads that from the adjustment nodes, not from the assignment `status`. How (and whether) to join and expose that adjustment flag is a design-phase concern. No roll-down state is *mutated* here (commit/approve/reject/request-adjustment stay in `RollDown.tsx`). **Resolves: B-01.** | must | blueprint round-4 ("OKR roll-down performance"), as-built `roll-down.ts` |
| FR-04 | **Slicer** — a single slice control set lets the exec filter the whole dashboard by **domain** (from `GET /api/v1/domains`), **journey** (`UserJourney` nodes within the chosen domain), and **systemKind** (`All` / `Functional` / `Agentic` / `AI predictive`, values imported from `SYSTEM_KINDS` in `shared/src/schema/system-kind.ts` — never re-declared, per XD-15). Slice state is **URL-first** on the route query string: `#/exec/performance?domain=<id>&journey=<id>&kind=<functional\|agentic\|ai_predictive>` (same `route.params` pattern as `#/explorer/systems?kind=`), so a sliced view is shareable and survives reload (UX-06). Unknown/absent params fall back to `All` on that axis. | must | blueprint round-4 ("sliceable by domain/journey/systemKind"), UX-06 |

### B. Read-only aggregate endpoints (`/api/v1/analytics/performance`)

<!-- These exist ONLY to answer portfolio/slice questions the per-KPI
     governed routes cannot answer in one call. All GET, all additive
     under /api/v1/ (NFR-11 policy). None mutate. -->

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **KPI portfolio status aggregate** — `GET /api/v1/analytics/performance/kpis` returns, for every unarchived KPI (optionally sliced by `?domain=&journey=&kind=` query params), `{kpi_id, name, unit, target_value, target_direction, latest_value, latest_measured_at, status}` where `status ∈ {on_target, warning, breach, no_data}` computed server-side from thresholds + latest measurement (FR-02). Reads KPI nodes from Neo4j and latest measurement from Postgres `kpi_measurements`. This is the single authority for breach status; the view never recomputes it. | must | FR-02, blueprint round-4 |
| FR-06 | **systemKind slice traversal** — because a `KPI` node does not carry `systemKind`, the `?kind=` filter resolves through the graph: a KPI is "in scope" for a systemKind slice when it `CONTRIBUTES_TO` a `UserJourney`/`Activity` whose activities `USES_SYSTEM` a `System` of that `systemKind` (edges `CONTRIBUTES_TO` KPI→UserJourney/Activity, `USES_SYSTEM` Activity→System per `shared/src/schema/edges.ts`; `systemKind` per XD-15). The exact traversal + tie-breaking (a KPI reachable to multiple kinds) is a design-phase decision (recorded as **OQ-2**); the aggregate returns the matched KPIs for the requested kind. When no KPI/System path exists for a KPI, it is excluded from a non-`All` kind slice, never crashed. | must | blueprint round-4 ("slice by systemKind"), XD-15 |
| FR-07 | **OKR roll-down performance aggregate** — `GET /api/v1/analytics/performance/okr?domain=…` returns per-directive roll-down performance already joined for the view: directive, its key results, assigned domains with `{domain_id, status, contribution}` (where `status` is the as-built `{pending,committed,approved,rejected}`, per FR-03), so the view does not fan out N roll-down calls. Composed **read-only** from the governed `roll-down` + `okr-performance` handlers' underlying reads; no new roll-down state. **Fidelity bound (Resolves: C-03):** the governed `okr-performance` handler matches a directive to a domain by `WHERE n.attributes_json CONTAINS $domainId` (a substring match — `okr-crud.ts:90,322`). This aggregate reuses that read as-is and therefore inherits its false-positive envelope: a domain id that is a substring of another field's value can pull an unintended directive onto the panel. This is documented, not fixed here — correcting the substring match belongs to `kpi-okr-governance` (Risk 3); a design reviewer must not treat an inherited false-positive directive as this spec's defect. | should | FR-03 |
| FR-08 | **journey list for the slicer** — the journey axis needs `UserJourney` nodes for a domain. The design phase MUST first check one specific reuse candidate before adding an endpoint: the graph-core/process-explorer journey surface reached via `api/src/router.ts` `journeys*` routes (`api/src/routes/journeys.ts` / `journey-*.ts`) and the generic `/api/v1/nodes/:label` handlers (`api/src/routes/nodes.ts`). As-built, those `journeys/…` routes are single-journey / versions / changes reads and `/nodes/:label` is single-node CRUD — **no route lists `UserJourney` nodes filtered per domain today** (verified 2026-07-04), so the reuse check is a bounded lookup, not an open-ended search. If that check confirms no per-domain journey list exists, `GET /api/v1/analytics/performance/journeys?domain=<id>` returns `{rows:[{id,name}]}` (`UserJourney` `PART_OF` the domain); if a governed route is instead found to serve it, reuse that and drop this endpoint. Either way the view has exactly one source for the journey axis. **Resolves: C-02.** | should | FR-04 |

### C. OpenAPI + contract hygiene

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | Every new `/api/v1/analytics/performance/*` endpoint (FR-05..FR-08 as built) is registered in `GET /api/v1/openapi.json`, generated from the same zod schemas used at runtime (no hand-maintained copy). Request query params and response bodies are zod-defined; malformed query params return the standard `400 {error:{code,message,details}}` envelope (the ZodError→400 mapping established by `kpi-okr-governance` FR-11 is reused, not re-invented). | must | `_baseline` FR-02 / graph-core FR-16 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **Read-only contract.** This spec adds **no** write path, no CRUD, no mutation of KPI/OKR/SLA/roll-down state. Every new endpoint is a `GET` under `/api/v1/analytics/performance/`. All changes are additive under `/api/v1/` — no `/api/v2/` bump. | CLAUDE.md versioning / NFR-11; blueprint scope ("reads existing routes") |
| NFR-02 | House rules: `zod` is the only validation library; en-US identifiers (`systemKind`, `breach`, `color`); no `tsc` (`bun run typecheck` green throughout); auth stays in the central router gate (`api/src/router.ts` + `api/src/auth/`) — no per-route auth, no new auth code. Loopback binding `127.0.0.1:8787` retained. | CLAUDE.md |
| NFR-03 | The FR-05 portfolio aggregate returns for a graph of ≤ 200 KPIs with ≤ 10k measurements in **< 500 ms** p95: latest-measurement lookup is a single batched query per store (one Neo4j query for KPI nodes + slice traversal, one Postgres query for latest measurements), not N per-KPI round trips. **Verification (Resolves: C-04):** the wall-clock p95 is a design-phase-verified target; the testable proxy in CI is the **query-count invariant** — the handler issues at most one Neo4j round trip and one Postgres round trip per request regardless of KPI count — asserted in AC-14 (a spied/counted query harness is more robust in CI than a wall-clock measurement). | house perf hygiene |
| NFR-04 | The snake_case field convention of the governed surface (`target_value`, `target_direction`, `warning_threshold`, `created_at`, …) is **kept as-built** in the new aggregate responses — consistent with `kpi-okr-governance` NFR-04; no camelCase remap that would diverge from the routes this reads. | consistency with `kpi-okr-governance` NFR-04 |
| NFR-05 | `systemKind` values appear only via import of `SYSTEM_KINDS`/`systemKindSchema` from `shared/src/schema/system-kind.ts` (XD-15 single vocabulary); the literal strings are never re-declared in this spec's `api/` or `pwa/` sources. | XD-15 / `system-augmentation-model` FR-01, NFR-05 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint round-4 View Tree, verbatim
— NEW exec tab):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/exec/performance` | `PerformanceDashboard` | Exec tab subnav (new `Performance` tab, appended) | AC-08 (loading·error·ready), AC-09 (empty variants) |

**UX allowance conformance** (blueprint UX-*; not re-decided here):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | FR-02/FR-03 render + AC-08 (loading/error/ready), AC-09 (empty: no KPIs, and slice-with-zero-matches) |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-02/FR-03 use catalog chart cards (`LineChartCard`/`AreaChartCard`, `KpiCard`, `Pill`) + `Card`; AC-10 runs `scripts/design-conformance.ts` |
| UX-03 input modes | n/a — no canvas/gesture/drag/custom-shortcut work; slicer is plain select/button controls (see Platforms & Native Conflicts tables) |
| UX-04 responsiveness | n/a: desktop-first per blueprint, no new breakpoints; dashboard reuses the existing exec grid layout |
| UX-05 accessibility | AC-11 (slicer controls keyboard-reachable, focus visible, selected state exposed to AT; status conveyed by text + icon, never color alone) |
| UX-06 navigation (deep links survive reload) | FR-04 URL-first `?domain=&journey=&kind=` → AC-07 (sliced deep link survives reload); route taken verbatim, unrenamed |

## Scope Boundaries

**In scope:**
- New `#/exec/performance` → `PerformanceDashboard` view (KPI trend + status panel FR-02, OKR roll-down panel FR-03, URL-first slicer FR-04, view states, a11y).
- New **read-only** aggregate endpoints under `/api/v1/analytics/performance/` (FR-05..FR-08) with zod schemas + OpenAPI registration (FR-09).
- **FILE-OWNERSHIP — `pwa/src/route.ts`:** `model-workspace-core` owns `route.ts` registration for the `#/model/*` surface only. This spec makes a **narrowly scoped additive edit**: appending one tab entry (`{ id: "performance", label: "Performance" }`) to the existing `exec` surface's `tabs` array. It touches no `#/model/*` row and no other surface. The design phase MUST call this out (comment-anchored, additive, non-conflicting) so Phase C consistency sees a **single clean owner** for the `#/exec/performance` row (this spec) and no ownership collision with `model-workspace-core`.
- New API integration tests for the aggregate endpoints; new PWA unit tests for the view (states, slicer, deep-link).

**Out of scope (owning spec named):**
- KPI/OKR/SLA CRUD, list endpoints, roll-down write paths, `KpiManagement`/`OkrManagement`/`RollDown`/`RollDownAnalytics` views → `kpi-okr-governance` (routes) + `_baseline` (the roll-down views). This spec **reads** those routes; it does not modify them.
- `DRIVES_KPI` direction+weight editing, KPI-impact coverage matrix, `#/model/kpi-impact` → `kpi-impact-mapping`.
- The `systemKind` attribute schema, backfill migration, badges, and `#/explorer/systems` filter → `system-augmentation-model`. This spec consumes `SYSTEM_KINDS` only.
- Editing/authoring OKR roll-down assignments from this dashboard (the panel is display + link-out only).
- PDF export (cto-analytics pattern exists if wanted later; not in this spec).

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `GET /api/v1/analytics/performance/kpis` returns one row per unarchived KPI with `status` computed correctly: a `higher_is_better` KPI whose latest value ≥ target → `on_target`; below `critical_threshold` → `breach`; below `warning_threshold` (but above critical) → `warning`; a KPI with no measurements → `no_data`. Mirror cases for `lower_is_better` and `target_is_exact` (FR-02, FR-05) | server (bun test + Neo4j + Postgres) | `api/__tests__/performance-kpis.integration.test.ts` |
| AC-02 | `GET /api/v1/analytics/performance/kpis?domain=<id>` narrows to KPIs scoped to that domain; `?journey=<id>` narrows to that journey; combined filters intersect; an unknown id returns an empty `rows` (not 404) (FR-04, FR-05) | server (bun test + Neo4j + Postgres) | `api/__tests__/performance-kpis.integration.test.ts` |
| AC-03 | `GET /api/v1/analytics/performance/kpis?kind=agentic` returns only KPIs reachable (per the FR-06 traversal) to an `agentic` System; a KPI with no KPI→…→System path is excluded from a non-`All` kind slice; `kind` absent or `all` returns all in-scope KPIs; an unknown `kind` value is treated as `all` (FR-06) | server (bun test + Neo4j) | `api/__tests__/performance-systemkind-slice.integration.test.ts` |
| AC-04 | `GET /api/v1/analytics/performance/okr?domain=<id>` returns per-directive roll-down performance: directive, key results, and assigned domains each with the as-built `status ∈ {pending,committed,approved,rejected}` (a freshly created assignment reads back `pending`; committed/approved/rejected after the respective transition — no `assigned`/`adjustment_requested` literal is ever asserted) and a contribution value, joined server-side (no N+1 client calls). Any per-domain "adjustment requested" flag, if present in the response, derives from `RollDownAdjustment` nodes, not from the assignment `status`. The response's directive→domain matching fidelity is bounded by the governed `okr-performance` handler's `attributes_json CONTAINS $domainId` substring match (FR-07, Risk 3) — the aggregate reuses that read as-is and inherits its false-positive envelope; correcting the substring match is a `kpi-okr-governance` concern, not asserted here (FR-03, FR-07). **Resolves: B-01, C-03.** | server (bun test + Neo4j) | `api/__tests__/performance-okr.integration.test.ts` |
| AC-05 | The journey axis source (`GET /api/v1/analytics/performance/journeys?domain=<id>` OR the reused governed route confirmed in design) returns `UserJourney` rows `PART_OF` the domain, ordered by `name`; unknown domain → empty `rows` (FR-08) | server (bun test + Neo4j) | `api/__tests__/performance-journeys.integration.test.ts` |
| AC-06 | Every new `/api/v1/analytics/performance/*` endpoint appears in `GET /api/v1/openapi.json` (assertion enumerates the expected path list); a malformed query param on a **hard-validated** param (e.g. a bad `domain` shape) returns the standard `400 {error:{code,message,details}}` envelope. Note `?kind` is not hard-validated: an unknown `kind` value is coerced to `all` (per FR-06/AC-03), so `?kind=nonsense` returns 200 with the `all` slice, not a 400 (N-03) (FR-09) | server (bun test) | `api/__tests__/openapi.integration.test.ts` (extended), `api/__tests__/performance-kpis.integration.test.ts` |
| AC-07 | Loading `http://127.0.0.1:5173/#/exec/performance?domain=<id>&journey=<id>&kind=agentic` directly renders the dashboard pre-sliced on all three axes; after a hard reload the same slice is active and the URL is unchanged; clearing a slice axis updates the hash without a full navigation (FR-04, UX-06) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/performance-dashboard.test.tsx` (URL-param parse → slice state) + manual: open that URL in macOS Chrome, press Cmd+R (mouse) — verify all three slicers show active and rows stay filtered |
| AC-08 | The view renders loading (shared `Loading`), error (shared `ErrorState` on a failed aggregate fetch), and ready (KPI status panel + trend cards + OKR roll-down panel) states from mocked aggregate responses (FR-02, FR-03) | jsdom (automated) | `pwa/src/__tests__/performance-dashboard.test.tsx` |
| AC-09 | Empty variants: zero KPIs in the graph → "No KPIs yet" empty state; an active slice matching zero KPIs → distinct zero-match message with a working clear-slice affordance returning to `All` on that axis (FR-04, UX-01) | jsdom (automated) | `pwa/src/__tests__/performance-dashboard.test.tsx` |
| AC-10 | `bun scripts/design-conformance.ts` passes on `pwa/src/views/exec/PerformanceDashboard.tsx` (tokens-only `var(--…)`, catalog chart/card components, no ad-hoc colors) (UX-02) | CLI | manual: run `bun scripts/design-conformance.ts` from repo root — expect exit 0 with the Performance view listed clean and no violations |
| AC-11 | Keyboard: Tab reaches every slicer control (domain select, journey select, systemKind buttons) in DOM order, Enter/Space activates, the active systemKind control exposes selected state to AT (`aria-pressed`/`aria-selected` or a labeled `<select>`); each KPI status is announced by text + icon (e.g. "Breach") not color alone; the view exposes a `main` landmark (FR-04, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | `pwa/src/__tests__/performance-dashboard-a11y.test.tsx` + manual: keyboard-only on macOS Safari — Tab through the three slicers, press Enter on `Agentic`, verify rows narrow, focus ring stays visible, and status pills read as text |
| AC-12 | Slice control click path: selecting a domain then a journey then a systemKind narrows the KPI status panel and OKR panel consistently, and the hash becomes `#/exec/performance?domain=…&journey=…&kind=…`; the trend sparkline for a selected KPI renders from `GET /api/v1/kpi-trends/:kpiId` data (FR-02, FR-03, FR-04) | macOS Chrome (mouse+kb), iPhone Safari (touch — tap targets) | `pwa/src/__tests__/performance-dashboard.test.tsx` + manual: on macOS Chrome click through domain→journey→kind (mouse) — expect both panels + hash update; on iPhone Safari tap the same controls — expect tap targets activate |
| AC-13 | Full transpile + regression: `bun run typecheck` exits 0; existing `api/__tests__/openapi.integration.test.ts` stays green (aggregates additive); no `kpi-okr-governance`-owned route file or exec view is modified by this spec (ownership check) (NFR-01, NFR-02) | CLI | `bun run typecheck` + `git diff --name-only` review: expect no change under the `kpi-okr-governance`-owned route/view paths |
| AC-14 | **Query-count invariant (NFR-03 proxy):** `GET /api/v1/analytics/performance/kpis` over a fixture of ≥ 50 KPIs each with measurements issues **at most one Neo4j round trip and at most one Postgres round trip** — proven by counting driver `session.run` / Postgres `query` calls via a spy/counter, and the count does not grow with KPI count (compare a 50-KPI and a 5-KPI fixture: same round-trip count). Confirms the batched-query shape, not N per-KPI calls (NFR-03) | server (bun test + Neo4j + Postgres) | `api/__tests__/performance-kpis.integration.test.ts` (query-count assertion via driver/pg spy) |

## Platforms & Input Modes

This spec touches `pwa/` (a new exec dashboard view with a slicer). No canvas,
gesture, drag, scroll-jacking, or custom keyboard-shortcut work — the slicer is
plain `<select>`/button controls and the charts are display-only catalog cards.
(Per the size-promotion rule this spec is already `large`; the tables are
provided because it touches `pwa/` + keyboard interaction.)

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| KPI status panel (status pills + values, read-only) | yes | yes | yes | no | Non-interactive; text + icon per status |
| Trend sparkline / line cards | yes | yes | yes | no | Display-only catalog chart cards |
| OKR roll-down performance panel (read-only) | yes | yes | yes | no | Status pills per assigned domain; link-out to `RollDown` view |
| Slicer: domain select, journey select | yes | yes | yes | yes | Native `<select>`; Tab-reachable, Enter/Space |
| Slicer: systemKind buttons (`All`/kinds) | yes | yes | yes | yes | Tap targets ≥ house minimum; `aria-pressed` state |
| Deep link `#/exec/performance?domain=&journey=&kind=` | yes | yes | yes | yes | URL-first state; reload-safe |
| Gestures / drag / new keyboard shortcuts | no | no | no | no | None introduced |

## Native Conflicts

Slicer controls are plain `<select>` elements and buttons; charts are
display-only. No scroll containers, gestures, focus traps, or global shortcut
handlers are introduced.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none — standard selects, buttons, and catalog chart/card components; no gesture/scroll/focus-trap/shortcut work) | n/a | n/a |

## Dependencies

| Dependency | How consumed (real interface) |
|------------|-------------------------------|
| **`kpi-okr-governance`** (foundation, on disk) — verified routes | Reads `GET /api/v1/kpis` (`{rows: KPI[]}`, `kpiSchema` fields incl. `target_value`/`target_direction`/`warning_threshold`/`critical_threshold`), `GET /api/v1/kpi-trends/:kpiId` (trend/moving_average/anomalies payload), `GET /api/v1/okr-directives` (unfiltered top-level list, **`kpi-okr-governance` FR-10c**; landed as `handleKpiList`/directive list, `api/src/router.ts:677`), `GET /api/v1/okr-performance?domain_id=` (`handleOkrPerformanceGet`), `GET /api/v1/roll-down/okr` + by-domain + `/api/v1/roll-down/contributions`, `GET /api/v1/domains` (**`kpi-okr-governance` FR-10d**; landed as `handleDomainList`, `api/src/router.ts:646`). Reuses that spec's ZodError→400 mapping (FR-11). Blocks on it landing. (N-01: FR-10c/FR-10d are `kpi-okr-governance` FR ids, annotated inline here for self-containment.) |
| **`system-augmentation-model`** (foundation, on disk) — vocabulary | Imports `SYSTEM_KINDS` / `systemKindSchema` / `SystemKind` from `shared/src/schema/system-kind.ts` (FR-01); relies on every `System` carrying `systemKind` (FR-02..FR-08 there) so the FR-06 traversal is total. Blocks on it landing. |
| Blueprint XD-02, XD-15, XD-16, XD-17; View Tree round-4 row; UX-01/02/05/06 | Binding: no new store; single systemKind vocabulary; governed base; single-shot gates; route/view names verbatim; view-state + a11y + deep-link allowances |
| graph-core / process-explorer surface | `UserJourney` `PART_OF` `Domain`, `CONTRIBUTES_TO` KPI→UserJourney/Activity, `USES_SYSTEM` Activity→System (`shared/src/schema/edges.ts`) — the FR-06/FR-08 traversals; design phase confirms whether an existing route already lists journeys per domain (FR-08 reuse-or-add) |
| PWA catalog: `pwa/src/components/charts/` (`LineChartCard`, `AreaChartCard`, `KpiCard`, `PieChartCard`), `pwa/src/views/_shared.tsx` (`ViewHeader`/`Loading`/`ErrorState`), `Pill`, `Card`; `pwa/src/route.ts` query-param routing (`#/explorer/systems?kind=` pattern); `pwa/src/useFetch.ts`; `pwa/src/api.ts` client (`api.kpi.list`, `api.domains.list`, `api.getPerformance`, `kpi-trends`) | FR-01..FR-04 view + client wiring. **N-02:** the as-built `api.getPerformance(domainId)` (`pwa/src/api.ts:1035`) hits `/api/v1/okr-performance?domain_id=` and is **per-domain**, not portfolio; the new `/analytics/performance/*` calls are **additional** client methods, not extensions of `getPerformance`. |
| Auth: central router gate (`api/src/router.ts` + `api/src/auth/`) | No changes; the new GET aggregates are gated by the existing router; no per-route auth |
| Infrastructure: Neo4j 5 (bolt 7687), Postgres 16 (`kpi_measurements` for latest-value lookups), Bun 1.1+, `zod` | FR-05..FR-08 aggregates read both stores |

## Risks & Recorded Decisions

**Recorded decisions** (blueprint XD-17 single-shot mode has no mid-run user
gate; deterministic defaults recorded here and flagged for the consolidated
report where a real product choice exists):

| ID | Decision | Rationale | Flag for consolidated report |
|----|----------|-----------|------------------------------|
| DEC-01 | Target/breach **status is computed server-side** in the FR-05 aggregate (single authority), not in the PWA. `on_target`/`warning`/`breach`/`no_data` derive from `target_direction` + `warning_threshold` + `critical_threshold` + latest measurement. | One implementation, testable in isolation (AC-01); the view stays a pure renderer; matches how `kpi-trends` already computes server-side. | no — internal decision, no external contract exposure |
| DEC-02 | **Add the read-only `/api/v1/analytics/performance/*` server aggregates** (FR-05..FR-08) rather than aggregating client-side. Pinned as the default under XD-17 single-shot (was OQ-1). | Portfolio breach-status (FR-05) needs a single batched latest-measurement join across all sliced KPIs; N per-KPI `kpi-trends` calls would be O(N) round trips and violate NFR-03. The systemKind slice (FR-06) is a graph traversal with no per-KPI governed route. Client-side-only would both breach NFR-03 and duplicate the status logic DEC-01 centralises. The client-side alternative genuinely violates NFR-03, so the default is safe to pin now. | **yes** — records that this spec adds new (read-only, additive) endpoints; surface to the consolidated report so the orchestrator can confirm the aggregate-endpoint boundary |

**Risks & Open Questions:**

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| OQ-1 | **Aggregate-endpoint boundary — now resolved as DEC-02 (Resolves: C-01).** Was: read governed per-KPI/per-domain routes and aggregate client-side vs. add the FR-05..FR-08 `/api/v1/analytics/performance/*` server aggregates. **Pinned: add the server aggregates** (DEC-02) — the FR-05..FR-08 B-group and their ACs are no longer conditional on an open question. The client-side alternative violates NFR-03 (O(N) round trips) and duplicates DEC-01's status logic, so it is not a live option under single-shot; retained here only as the rejected alternative flagged to the consolidated report via DEC-02. | (resolved) | See DEC-02. Surfaced to the consolidated report; no mid-run gate required. |
| OQ-2 | **systemKind traversal semantics (design-phase decision):** a KPI can be reachable to Systems of *multiple* kinds (its journey's activities use both a functional and an agentic system). Does a `?kind=agentic` slice include a KPI if *any* reachable System is agentic (inclusive), or only if *all* are (exclusive)? Recommendation: **inclusive (any reachable System of the kind)** — matches "show me KPIs touched by agentic systems"; exclusive would hide most KPIs. Design phase pins the Cypher; AC-03 asserts the chosen semantics. | FR-06, AC-03 | **Recommended: inclusive-any.** Design phase records the Cypher + tie-break. |
| 3 | The `okr-performance` handler matches directives by `attributes_json CONTAINS $domainId` (substring, not a structured field) — a brittle as-built read the FR-07 aggregate must reuse. | False-positive directive matches on the OKR panel | FR-07 documents it reads the governed handler's logic as-is (no re-inventing the surface); if the substring match proves wrong, that is a `kpi-okr-governance` defect, not this spec's to fix. Note in design; do not silently "improve" the governed read. |
| 4 | Seed monochrome: all 6 retail-mini Systems are `functional` (per `system-augmentation-model` FR-08), so a fresh-seed systemKind slice shows no `agentic`/`ai_predictive` variety. | Demo value only | Tests exercise all three kinds via created fixtures (AC-03); the dashboard's empty/zero-match states (AC-09) cover the "no matches" case honestly. |
| 5 | Latest-measurement lookup crosses stores (KPI nodes in Neo4j, measurements in Postgres); a naive per-KPI Postgres query is O(N). | NFR-03 p95 breach | FR-05 requires one batched Postgres query (`DISTINCT ON (kpi_id) … ORDER BY measured_at DESC` or equivalent) keyed by the sliced KPI id set; design phase pins the query shape. |
| 6 | `pwa/src/route.ts` is owned by `model-workspace-core` for `#/model/*`; this spec appends one `exec` tab entry. | Ownership-gate ambiguity / merge conflict | Scope Boundaries FILE-OWNERSHIP note + design.md must show the additive, comment-anchored, non-`#/model/*` edit so Phase C sees one clean owner for the `#/exec/performance` row. |

## Traceability

| Source | Covered by |
|--------|------------|
| Blueprint View Tree round-4 — `#/exec/performance` → `PerformanceDashboard`, owner `kpi-okr-performance-dashboards` | FR-01, FR-04; AC-07..AC-12 |
| Blueprint round-4 scope ("KPI trends + target/breach status") | FR-02, FR-05; AC-01, AC-08, AC-12 |
| Blueprint round-4 scope ("OKR roll-down performance") | FR-03, FR-07; AC-04 |
| Blueprint round-4 scope ("sliceable by domain/journey/systemKind") | FR-04, FR-06, FR-08; AC-02, AC-03, AC-05, AC-07 |
| Blueprint scope ("reads existing routes; extends read-only aggregates if insufficient") | FR-05..FR-09, NFR-01; DEC-02 (was OQ-1) |
| NFR-03 perf (batched-query invariant) | AC-14 (query-count proxy) |
| XD-15 (single systemKind vocabulary) | FR-04, FR-06, NFR-05 |
| XD-16 (governed KPI/OKR base as dependency) | Dependencies (`kpi-okr-governance`); no route re-spec |
| CLAUDE.md versioning (additive v1, read-only) | NFR-01, FR-09; AC-06, AC-13 |
| Blueprint UX-01/02/05/06 | AC-08/09 / AC-10 / AC-11 / AC-07 |
| FILE-OWNERSHIP (`route.ts` additive exec-tab edit) | Scope Boundaries note, Risk 6; design phase carries it to Phase C |
