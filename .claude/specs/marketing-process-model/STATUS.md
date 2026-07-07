# Spec: marketing-process-model
**Size**: medium | **Created**: 2026-07-06 | **Current Phase**: execution:complete

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 when advancing to the next phase. Pass 3+ is refused. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | - | 2026-07-06 |
| Req Review | approve (0 blockers) | - | 2026-07-06 |
| Design | approved | - | 2026-07-06 |
| Design Review | approve (0 blockers) | - | 2026-07-06 |
| Tasks | approved | - | 2026-07-06 |
| Execution | **complete** (16/16 tasks; T-06 funnel unblocked — dependency shipped) | - | 2026-07-07 |

<!-- Medium spec: Task Review row omitted (review requirements + design only).
     Medium tasks go requirements+design review → tasks → execute. -->

## Execution summary

**16 of 16 tasks complete + verified.** T-06 (Marketing Demand Funnel) is now
**unblocked** — the `funnel-pipeline-modeling` dependency (wave-1b) shipped its
runtime construct (`Funnel`/`Stage` labels, `HAS_STAGE`/`CONVERTS_TO` edge types
registered idempotently by `api/src/seed/ensure-funnel-ontology.ts`, the
`POST /api/v1/funnels/transitions` route, and `bun run seed:funnel-pipeline`).
Two source files shipped (`shared/seed/saas-operator/marketing.json`,
`api/scripts/seed-marketing.ts`), one `package.json` line (`seed:marketing`),
and 14 integration test files. The `bun run typecheck` gate is green.

**T-06 completion (2026-07-07):** the marketing seed's `seedFunnel` step
(`seed-marketing.ts`, unchanged — it was authored funnel-ready) now runs
assertively once `seed:funnel-pipeline` has registered the ontology. It creates
the **Marketing Demand Funnel** instance: one `Funnel` (scoped by
`modelId`=operator root + `funnelKey`), the four ordered `Stage` nodes
Visitor(0)→Lead(1)→MQL(2)→SQL(3) with funnel-scoped idempotency (N-02), three
`HAS_STAGE` edges, and the three `CONVERTS_TO` transitions
(Visitor→Lead, Lead→MQL, MQL→SQL) via the range-checked
`POST /api/v1/funnels/transitions` route (rates in `[0,1]`,
`conversionRate + dropOffRate ≈ 1`). **No funnel-pipeline-modeling file was
edited** (`funnels.ts`/`ensure-funnel-ontology.ts` untouched) — the marketing
slice only `fetch`es the funnel routes and wires `seedFunnelPipeline` into its
own test `beforeAll` chains (§7 order).

The two funnel-touching test files (`marketing-funnel.integration.test.ts`,
`marketing-mapping-coverage.integration.test.ts`) now register the funnel
ontology in `beforeAll` (`seedSaasOperator → seedSaasMetricLibrary →
seedFunnelPipeline → seedMarketing`) so AC-08/AC-09 and M-12/M-13 assert against
a live funnel. They retain a runtime `funnelConstructReady` probe that cleanly
self-skips when the route is absent (stale/absent DB), matching the prior-slice
degrade posture. Two test queries were corrected during unblock: `CONVERTS_TO`
rates are read from the edge `attributes_json` (the funnel route folds
`conversionRate`/`dropOffRate` there, not as top-level edge props), and the
`CONVERTS_TO`/`HAS_STAGE` counts are scoped to the Marketing Demand Funnel's own
stages (cross-funnel-safe, so a co-resident sales funnel cannot skew the count).

### As-built deviations discovered during execution
- **Metric resolution by seedKey, not id** — the tasks/design pin resolved the
  metric target as `MetricDefinition {id:"metric-cac"}`, but the as-built
  `saas-metric-library` fixture stores `metric-cac` as `attributes.seedKey` (the
  node `id` is a UUIDv7). `seedMeasures` resolves the metric by
  `attributes_json CONTAINS '"seedKey":"metric-cac"'` — the stable roster handle.
- **Persona name collision avoided** — the foundation catalog already seeds a
  Persona `{name:"Marketing Function Owner"}`. The N-03 marketing persona was
  renamed to `Marketing Demand-Gen Persona` (seedKey unchanged,
  `marketing-function-owner`) so `ensurePersonas`'s collision guard does not fire
  when `seed:saas-operator` re-runs. This slice references, never re-authors, the
  foundation persona.

**Verification:**
- `verified_at`: 2026-07-07
- `verification_artifact`: `api/__tests__/marketing-*.integration.test.ts` (14
  files; each self-seeds the chain). AC-08/AC-09/M-12/M-13 verified end-to-end
  against a current-code API instance running the shipped funnel route (all funnel
  assertions PASS: one Funnel, ordered Visitor→Lead→MQL→SQL via HAS_STAGE, three
  CONVERTS_TO with rates in [0,1], overall conversion computes = 0.007, re-run
  net-zero). `bun run typecheck` exit 0. Per-AC below.

### Per-AC verification artifacts
| AC | Verification |
|----|--------------|
| AC-01 | `api/__tests__/marketing-journeys.integration.test.ts` (pass) |
| AC-02 | `api/__tests__/marketing-activities.integration.test.ts` (pass) |
| AC-03 | `api/__tests__/marketing-roles.integration.test.ts` (pass) |
| AC-04 | `api/__tests__/marketing-systems.integration.test.ts` (pass — incl. systemKind-less→400) |
| AC-05 | `api/__tests__/marketing-kpis.integration.test.ts` (pass); manual: `git diff --stat api/src/routes/kpi-crud.ts` → no change |
| AC-06 | `api/__tests__/marketing-kpi-measures.integration.test.ts` (pass) |
| AC-07 | `api/__tests__/marketing-kpi-alignment.integration.test.ts` (pass) |
| AC-08 | `api/__tests__/marketing-funnel.integration.test.ts` (pass — one Funnel; ordered Visitor→Lead→MQL→SQL Stage chain via HAS_STAGE; funnel-composition read returns stages in stageOrder) |
| AC-09 | `api/__tests__/marketing-funnel.integration.test.ts` (pass — three CONVERTS_TO transitions, each rate in [0,1] read from attributes_json; overall conversion = product of per-transition rates computes = 0.007) |
| AC-10 | `api/__tests__/marketing-stories.integration.test.ts` (pass — incl. out-of-scope→404); manual: `git diff --stat api/src/routes/stories.ts` → no change |
| AC-11 | `api/__tests__/marketing-stories.integration.test.ts` (pass — incl. missing-clause→400) |
| AC-12 | `api/__tests__/marketing-risks.integration.test.ts` (pass); manual: `git diff --stat api/src/routes/risk-register.ts` → no change |
| AC-13 | `api/__tests__/marketing-capabilities.integration.test.ts` (pass); manual: `git diff --stat api/src/routes/capabilities.ts` → no change |
| AC-14 | `api/__tests__/marketing-seed.integration.test.ts` (pass — fixture shape + lifecycle-guard negative); manual: `git diff --stat api/scripts/seed-saas-operator.ts` → no change |
| AC-15 | `api/__tests__/marketing-seed.integration.test.ts` (pass — Marketing-scoped net-zero re-run); manual: `bun run seed:marketing` twice → exactly one of each KPI (verified n=1 for all six) |
| AC-16 | `api/__tests__/marketing-boundary.integration.test.ts` (pass — git-diff guards on schema/rbac/router/errors + owned routes all clean) |
| AC-17 | `api/__tests__/marketing-mapping-coverage.integration.test.ts` (pass — M-01…M-17; M-12/M-13 funnel rows now assert against the shipped funnel: HAS_STAGE=4, CONVERTS_TO≥3 scoped to the Marketing Demand Funnel) |

**Artifacts:**
- 📄 Requirements: `.claude/specs/marketing-process-model/requirements.md`
- 📄 Design: `.claude/specs/marketing-process-model/design.md`
- 📄 Tasks: `.claude/specs/marketing-process-model/tasks.md`
- 📝 Reviews: `.claude/specs/marketing-process-model/review-*.md`

**Next**: none — execution is complete. The full seed chain is
`seed:saas-operator` → `seed:saas-metric-library` → `seed:funnel-pipeline` →
`seed:marketing` (§7 ordering); with the funnel dependency shipped, the funnel
step and its tests are assertive. Nav wiring (any `#/insights/*` surface) is the
orchestrator's concern; this slice ships no view and touched no nav or
other-spec file.
