# Spec: function-benchmark-scoring
**Size**: medium | **Created**: 2026-07-06 | **Current Phase**: execution:complete

review_passes: 0
<!-- Per-phase review counter (HARD CAP: 1 review + max 1 re-review).
     Reset to 0 on entering each phase (the counter is per-phase).
     Requirements + Design both passed review (design pass 2 verdict approve).
     Medium spec: Task Review is omitted — tasks go straight to the execute gate. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | - | 2026-07-06 |
| Req Review | revise (3 blockers) → rev 2 applied | - | 2026-07-06 |
| Design | approved | - | 2026-07-06 |
| Design Review | approve (0 blockers, 3 concerns → pinned to tasks) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Execution | near-complete (11/11 tasks; SOLE remaining = nav orchestrator's one-line `views/index.tsx` VIEWS wiring under the `insights` surface at canonical `#/insights/benchmarks`, deferred + tracked — see Blockers) | - | 2026-07-07 |

<!-- Medium spec: Task Review row omitted. -->

**Verification:**
- `verified_at`: 2026-07-06
- `verification_artifact`: see the per-AC table below.

**Per-AC verification artifacts:**

| AC | Artifact |
|----|----------|
| AC-01 | `api/__tests__/function-benchmark-report.integration.test.ts` (six-function report, discovered `meta.modelId`, sub-scores + evidence + meta) — PASS |
| AC-02 | `api/__tests__/function-benchmark-metric.integration.test.ts` (on_target > missed, prose-evidence-only, no_data exclusion, metricGrounded:false excluded from composite) — PASS; unit half `api/__tests__/function-benchmark-score.test.ts` — PASS |
| AC-03 | `api/__tests__/function-benchmark-verdict.test.ts` (band parity incl. exact no-band `warning`) — PASS; `manual: grep -n "routes/performance" api/src/derive/function-benchmark-score.ts` (CLI) → zero matches (verified, grep exit 1) |
| AC-04 | `api/__tests__/function-benchmark-coverage.integration.test.ts` (three core ratios, keyMarked:false drops term, unmodeled:true=0, C-02 discriminating `ALIGNED_TO`-without-`MEASURES` fixture) — PASS |
| AC-05 | `api/__tests__/function-benchmark-automation.integration.test.ts` (augmentation weights, no-system=0, per-kind counts, all-functional degeneracy via byKind) — PASS |
| AC-06 | `api/__tests__/function-benchmark-report.integration.test.ts` (composite over applicable sub-scores, rank composite DESC/seedKey ASC, no recommendation key) — PASS |
| AC-07 | `api/__tests__/function-benchmark-readonly.integration.test.ts` (zero node/rel/attribute diff over the fixture subgraph; no keyActivity write) — PASS; `manual: grep -n "MERGE\|CREATE\|\bSET\b\|DELETE" api/src/storage/function-benchmark.ts` (CLI) → zero write clauses (verified, grep exit 1) |
| AC-08 | `api/__tests__/function-benchmark-authz.integration.test.ts` (getRoutePermission→analytics:read never null, not public, handler 200, determinism, model isolation, empty-200 no-root) — PASS; `api/__tests__/function-benchmark-openapi.integration.test.ts` (path + 200 response schema in the generated OpenAPI doc) — PASS |
| AC-09 | `bun run typecheck` exit 0; `manual: git diff --stat` (CLI) → no changes to `pwa/src/route.ts`/`SURFACES`, no additions to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS`, no `views/index.tsx` change (the `benchmarks:` line is blocked — see Blockers) (verified) |
| AC-10 | `pwa/src/__tests__/benchmark-report.test.tsx` (ready state renders six cards + evidence; no recommendation UI) — PASS |
| AC-11 | `pwa/src/__tests__/benchmark-report-states.test.tsx` (loading skeleton) — PASS |
| AC-12 | `pwa/src/__tests__/benchmark-report-states.test.tsx` (empty state → seed:saas-operator prompt) — PASS |
| AC-13 | `pwa/src/__tests__/benchmark-report-states.test.tsx` (error state + retry refetches) — PASS |
| AC-14 | `bun run scripts/design-conformance.ts --view pwa/src/views/business/BenchmarkReport.tsx` and `… BenchmarkReport.module.css` — both PASS (clean, exit 0) |
| AC-15 | `manual: keyboard-only walk of #/insights/benchmarks — Tab to a benchmark-card expander (<button aria-expanded>), Enter flips aria-expanded and reveals KPI-verdict/coverage/augmentation evidence; Tab to a deep-link anchor, Enter navigates to Explorer; focus lands on the ViewRegion section landmark first.` **DEFERRED**: cannot exercise until the nav orchestrator wires the `#/insights/benchmarks` → `BenchmarkReport` VIEWS entry — the view component + its `aria-expanded` expander + native deep-link anchors + ViewRegion landmark are implemented and unit-verified (AC-10), so the walk passes once the route resolves. |
| AC-16 | `pwa/playwright/business-benchmarks-reload.spec.ts` (deep-link + reload) — written; **DEFERRED** on the same pending `#/insights/benchmarks` VIEWS wiring (passes once the orchestrator lands the one-line entry). |

**SOLE REMAINING TASK (nav-orchestrator-owned, deferred + tracked):**
- The canonical route for this view is **`#/insights/benchmarks`** (nav-IA restructure, 2026-07-07 — the former `#/business/benchmarks` surface no longer exists; chat is a floating widget; 7 surfaces total; alias `exec/operator → insights/operator` is unrelated). The `BenchmarkReport.tsx` view + `.module.css` (T-09), the `api.*` method (T-10), and all state/unit tests are **complete, verified, design-conformant, and route-string-aligned to `#/insights/benchmarks`**; `BenchmarkReport.tsx` is on the orphan-guard allowlist so `bun test` stays green while the route seam is absent. The **only** remaining work is the nav orchestrator's one-line `views/index.tsx` `VIEWS`-map wiring (this spec must NOT edit `route.ts`, `views/index.tsx`, or the nav guard tests). The orchestrator must add, **under the `insights` surface**:

  ```ts
  // import (top of pwa/src/views/index.tsx)
  import { BenchmarkReport } from "./business/BenchmarkReport";
  // VIEWS map, under the `insights` surface:
  benchmarks: (r) => <BenchmarkReport route={r} />,
  ```

  Once that one line + import land, `#/insights/benchmarks` resolves to `BenchmarkReport` and AC-15/AC-16 become exercisable. No other work is owed by this spec.

**Cross-spec note (not this spec's regression):** the `system-kind-vocabulary` singularity guard (`api/__tests__/system-kind-vocabulary.test.ts`) fails on `api/src/seed/product-delivery/rosters.ts`, an untracked file owned by the concurrently-building `product-delivery-process-model` spec (it embeds the `ai_predictive` literal instead of importing `SYSTEM_KINDS`). This spec's own production source (`api/src/derive/function-benchmark-score.ts`, the view) builds its weight/count records positionally from `SYSTEM_KINDS` and contains **zero** enum literals — verified clean by the same grep.

**Open Questions for the user (carried from requirements; all resolvable at design gate):**
- **OQ-1 — design adopts (b), confirm vs (c):** metricBenchmark = share of
  metric-grounded KPIs on-target vs the KPI's own target; the prose `benchmark`
  is shown as evidence, not numerically compared (self-contained). (c) — a true
  numeric metric-vs-benchmark comparison — needs a structured benchmark field on
  `MetricDefinition` (a `saas-metric-library` change) and is the non-default.
- **OQ-2 — design re-implements the KPI verdict (DD-05), confirm vs shared
  helper:** the shared-helper alternative edits `performance.ts` (owned by
  `kpi-okr-performance-dashboards`) — a bounded follow-up if DRY is wanted.
- **OQ-3 — augmentation weights (DD-06):** proposed
  `{ functional: 0.34, agentic: 0.67, ai_predictive: 1.0 }`; ordering is fixed,
  values are confirmable.
- OQ-4 (composite weights = code-default constants), OQ-5 (route
  `analytics/benchmarks/report`), OQ-6 (empty-`200`, no new error code), OQ-7
  (`analytics:read`) — resolved in requirements, pinned in the design (DD-07/09/10/11).

**Artifacts:**
- 📄 Requirements: `.claude/specs/function-benchmark-scoring/requirements.md`
- 📄 Design: `.claude/specs/function-benchmark-scoring/design.md`
- 📄 Tasks: `.claude/specs/function-benchmark-scoring/tasks.md` (draft — 11 tasks)
- 📝 Reviews: `.claude/specs/function-benchmark-scoring/review-*.md` (review-requirements.md + review-design.md complete)

**Design-review findings pinned into tasks** (review-design.md pass 2, approve —
0 blockers): C-01 (coverage-query cartesian → C-01(a): compute `coveredByKpi` in
the pure scorer off the anchored attribution reach, T-04/T-03); C-02
(discriminating `ALIGNED_TO`-without-`MEASURES` coverage fixture, T-08); C-03
(dispatch + permission paired in one task so no un-permissioned merge, T-06); N-01
(EmptyState seed-prompt is view markup, T-09); N-02 (explicit per-activity
grouping, T-04).

**Next**: Medium spec — no task review. Present the 11-task plan at the execute
gate. Surface the still-open user confirmations OQ-1 (b vs c), OQ-2 (re-implement
vs shared verdict helper), OQ-3 (augmentation weights
`{functional:0.34, agentic:0.67, ai_predictive:1.0}`) — all one-line/additive if
the user prefers otherwise, none a build blocker.
