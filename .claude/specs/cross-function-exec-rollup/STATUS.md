# Spec: cross-function-exec-rollup
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: execution:near-complete (SOLE remaining = orchestrator's one-line `views/index.tsx` VIEWS wiring, deferred + tracked)

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 on advancing to a new phase. Design review reached pass 2/2
     (verdict approve); counter reset for the tasks phase. Pass 3+ is refused. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | - | 2026-07-06 |
| Req Review | revise (1 blocker resolved rev2) | - | 2026-07-06 |
| Design | approved | - | 2026-07-06 |
| Design Review | approve (pass 2/2; 3 concerns C-05/C-06/C-07 carried to tasks) | - | 2026-07-06 |
| Tasks | approved | - | 2026-07-06 |
| Task Review | approve (proceed to execution) | - | 2026-07-06 |
| Execution | near-complete — 15/16 tasks; SOLE remaining = nav orchestrator's one-line `views/index.tsx` VIEWS wiring under the `insights` surface at canonical `#/insights/operator` (deferred + tracked); T-14 playwright leg follows that | - | 2026-07-07 |

**Verification:**
- `verified_at`: 2026-07-06
- `verification_artifact`: `api/__tests__/operator-overview.integration.test.ts` + `api/__tests__/operator-route-permission.test.ts` + `pwa/src/__tests__/operator-cockpit.test.tsx` (per-AC table below)
- `execution_baseline`: `fb434718d101015153f8cb999f69e1a4a4de7930`

**Execution — per-AC verification artifacts:**

| AC | Status | Artifact |
|----|--------|----------|
| AC-01 (overview per-function rows, no-hardcoded-id, all-zero) | pass | `api/__tests__/operator-overview.integration.test.ts` |
| AC-02 (slice; unknown→400; absent→six) | pass | `api/__tests__/operator-slice.integration.test.ts` |
| AC-03 (per-function KPI status + tally + no_data) | pass | `api/__tests__/operator-kpis.integration.test.ts` |
| AC-04 (Neo4j :KPIMeasurement only; batched ≤2 RT; no Postgres) | pass | `api/__tests__/operator-no-postgres-measurement.test.ts` + `api/__tests__/operator-query-count.integration.test.ts` |
| AC-04a (per-entity query-count invariant) | pass | `api/__tests__/operator-query-count.integration.test.ts` |
| AC-05 (status parity with performance.ts; no perf.ts diff) | pass | `api/__tests__/operator-status-parity.test.ts`; manual: `git diff --stat api/src/routes/performance.ts` (clean) |
| AC-06 (risk heatmap grouped by verbatim function name) | pass | `api/__tests__/operator-risks.integration.test.ts` |
| AC-07 (funnel overallConversion/n/a; operator-root scope; slice-fallback) | pass | `api/__tests__/operator-funnels.integration.test.ts` |
| AC-08 (SLA health/breachCount/latestBreachAt; domain_id primary; unattributed; C-05 window semantics) | pass | `api/__tests__/operator-slas.integration.test.ts` |
| AC-09 (every route GET → analytics:read; no new permission string) | pass | `api/__tests__/operator-route-permission.test.ts`; manual: `git diff api/src/auth/rbac-permissions.ts` (five analytics:read entries only) |
| AC-09a (P0: getRoutePermission non-null per route) | pass | `api/__tests__/operator-route-permission.test.ts` |
| AC-10 (openapi paths from zod; no ERROR_CODES add; /api/v1/ only) | pass | `api/__tests__/operator-openapi.integration.test.ts`; manual: `git diff api/src/errors.ts` (clean) |
| AC-11 (change set confined; transpile clean) | pass | `bun run typecheck` exit 0; ownership diff vs `execution_baseline` (only the enumerated allow-list) |
| AC-12 (four panels render; #/insights/operator → OperatorCockpit) | PARTIAL — render legs pass + slicer emits canonical `#/insights/operator?function=…`; route-resolution leg deferred to orchestrator VIEWS wiring | `pwa/src/__tests__/operator-cockpit.test.tsx` (renders four panels + slicer + useActiveModel, mounted directly; hash-rewrite asserts `#/insights/operator`); route resolution deferred to the orchestrator's one-line VIEWS entry |
| AC-13 (loading state) | pass | `pwa/src/__tests__/operator-cockpit-states.test.tsx` |
| AC-14 (empty state) | pass | `pwa/src/__tests__/operator-cockpit-states.test.tsx` |
| AC-15 (error + per-panel error) | pass | `pwa/src/__tests__/operator-cockpit-states.test.tsx` |
| AC-16 (design-conformance on view + CSS) | pass | `bun run scripts/design-conformance.ts --view pwa/src/views/exec/OperatorCockpit.tsx` (+ `.module.css`) exit 0 |
| AC-17 (keyboard-reachable slicer + rows, ViewRegion landmark) | impl done; manual sweep DEFERRED (route reachable only after orchestrator VIEWS wiring) | view uses `ViewRegion` landmarks + focusable slicer/rows; manual Tab sweep needs the live `#/insights/operator` route (orchestrator one-liner) |
| AC-18 (URL-first slice survives reload) | DEFERRED | `pwa/playwright/exec-operator-reload.spec.ts` (written, `test.describe.skip` — needs the orchestrator's `#/insights/operator` VIEWS wiring; assertions target the canonical `#/insights/operator?function=…`) |

**SOLE REMAINING TASK (nav-orchestrator-owned, deferred + tracked):**
- The canonical route for this view is **`#/insights/operator`** (nav-IA restructure 2026-07-07 — the former `#/exec/operator` is now a redirect **alias** to `insights/operator`, `route.ts:204`; chat is a floating widget; 7 surfaces total). The `OperatorCockpit.tsx` view (its slicer now emits the canonical `#/insights/operator?function=…` hash), its client seam, its states, all server aggregates, and its render/state tests are **complete and independently verified**. This spec does **NOT** edit `route.ts`, `views/index.tsx`, or the nav guard tests (`business-routes.test.ts` / `route-parse.test.ts` / `business-placeholder.test.tsx`) — all sole-owned by the concurrent nav session. The **only** remaining work is the nav orchestrator's one-line `views/index.tsx` `VIEWS`-map wiring. The orchestrator must add, **under the `insights` surface**:

  ```ts
  // import (top of pwa/src/views/index.tsx)
  import { OperatorCockpit } from "./exec/OperatorCockpit";
  // VIEWS map, under the `insights` surface:
  operator: (r) => <OperatorCockpit route={r} />,
  ```

  Once that one line + import land, `#/insights/operator` resolves to `OperatorCockpit` and AC-12-route-resolution / AC-17 / AC-18 become exercisable (unskip `exec-operator-reload.spec.ts`). No other work is owed by this spec.

**COMPLETE + VERIFIED (15/16 tasks, all server + view artifacts):** T-01 (shared zod), T-02 (resolver + N-03 seed-truth gate — the foundation stores `saasOperatorRoot`/`seedKey` INSIDE `attributes_json`, so the resolver MATCHes via `apoc.convert.fromJsonMap`, NOT top-level props; fixed to match the as-built seed), T-03 (KPI health), T-04 (risk/funnel/SLA/overview + router dispatch + RBAC), T-05 (integration tests), T-06 (SLA + C-05 window semantics), T-07 (no-Postgres guard), T-08 (query-count invariant), T-09 (RBAC null-hole guard), T-10 (OpenAPI + C-07 anchor), T-12 (OperatorCockpit view + CSS + api.ts seam), T-13 (view render/states tests + openapi test), T-15 (CI vitest enumeration append). Partial: T-11 (VIEWS wiring DEFERRED to nav orchestrator — one line, see above), T-14 (funnel slice-fallback sub-case DONE in `operator-funnels.integration.test.ts`; playwright reload leg follows the orchestrator's VIEWS wiring).

**Artifacts:**
- 📄 Requirements: `.claude/specs/cross-function-exec-rollup/requirements.md`
- 📄 Design: `.claude/specs/cross-function-exec-rollup/design.md`
- 📄 Tasks: `.claude/specs/cross-function-exec-rollup/tasks.md`
- 📝 Reviews: `.claude/specs/cross-function-exec-rollup/review-*.md`

**Next**: The nav orchestrator lands the one-line `views/index.tsx` VIEWS entry `operator: (r) => <OperatorCockpit route={r} />` (+ import) under the `insights` surface for canonical `#/insights/operator`; then unskip `exec-operator-reload.spec.ts` and confirm AC-12 route-resolution + AC-17 + AC-18.

<!-- Tasks-phase carry-forward flags (record on completion):
     - C-05 → T-06 pins latestBreachAt = all-time, breachCount/health = window-scoped (option b).
     - C-06 → T-11 greps the ACTUAL foundation-owned surface-map key/placeholder before rewiring; blocked on saas-operator-foundation if unlanded.
     - C-07 → T-10 places registerOperatorPaths(registry) adjacent to registerPerformancePaths (openapi.ts:1045 anchor, not :141).
     - N-03/OQ-D1 → T-02 resolver property-name DoD gate; T-14 funnel slice-fallback sub-case. -->

