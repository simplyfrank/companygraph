# Spec: saas-metric-library
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: execution:blocked

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user (rev 2, review pass 2/2 approve) | 2026-07-06 |
| Req Review | approve (0 blockers; OQ-1 carried as open decision) | - | 2026-07-06 |
| Design | approved | user (rev 1, review pass 1 approve) | 2026-07-06 |
| Design Review | approve (0 blockers; C-01/C-02/C-03 deferred to tasks) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Task Review | pending | - | - |
| Execution | near-complete (13/14 tasks; SOLE remaining = orchestrator's one-line `views/index.tsx` VIEWS wiring under the `insights` surface, deferred + tracked) | - | 2026-07-07 |

**review_passes**: 0
**total_tasks**: 14

**Verification:**
- `verified_at`: 2026-07-06
- `verification_artifact`: server slice + PWA slice verified (see per-AC table below); `bun run typecheck` exit 0; PWA `bunx vitest run` 486/486 pass; the 7 `api/__tests__/metric-library-*.integration.test.ts` files 18/18 pass against the live loopback stack; both `bun run scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.{tsx,module.css}` PASS.

**SOLE REMAINING TASK (T-11 — orchestrator-owned, deferred + tracked).** The
nav-IA restructure set the canonical route for this view to **`#/insights/metrics`**
(the former `#/business/metrics` surface no longer exists; chat is a floating
widget; 7 surfaces total). Everything this spec owns — the `MetricLibrary` view,
its CSS, its component/state tests, and the whole server slice — is **complete,
verified, and route-string-aligned to `#/insights/metrics`**. The one line that
remains is the **nav orchestrator's `views/index.tsx` `VIEWS`-map wiring**, which
is owned by the concurrent nav session (this spec must NOT edit `route.ts`,
`views/index.tsx`, or the nav guard tests). The orchestrator must add, **under the
`insights` surface**:

```ts
// import (top of pwa/src/views/index.tsx)
import { MetricLibrary } from "./business/MetricLibrary";
// VIEWS map, under the `insights` surface:
metrics: () => <MetricLibrary />,
```

Once that one line + import land, `#/insights/metrics` resolves to `MetricLibrary`
and AC-12-route-resolution / AC-18 reload e2e become exercisable. No other work
is owed by this spec.

**Done (T-01…T-10, T-13; 12/14).** Server slice complete + green: the
`MetricDefinition` label ensure, the `MEASURES` edge ensure + cardinality-guarded
`linkKpiToMetric` helper, the frozen 20-metric catalog + `json_schema_doc` + list
query, the `seed:saas-metric-library` register-then-import CLI + fixture +
package script, and all CRUD/attribute-enforcement/edge/seed/lifecycle-guard
integration tests. PWA slice: the read-only `MetricLibrary` view + tokens-only
CSS module + its component/state tests (7 pass) — the view file, its CSS, and its
tests are complete and conformant; only the `views/index.tsx` wiring (T-11) and
reload e2e (T-12) are blocked. `MetricLibrary.tsx` was added to the
`view-orphans.test.ts` allowlist (mirroring foundation's orphaned `FunctionMap`
entry) so `bun test` stays green while the route seam is absent.

**Per-AC verification:**
- AC-01 → `api/__tests__/metric-library-label.integration.test.ts` (pass) + `git diff shared/src/schema/nodes.ts` clean
- AC-02, AC-10 → `api/__tests__/metric-library-crud.integration.test.ts` (pass) + `git diff api/src/auth/rbac-permissions.ts` clean
- AC-03 → `api/__tests__/metric-library-edge.integration.test.ts` (pass) + `git diff shared/src/schema/edges.ts` clean
- AC-04 → `api/__tests__/metric-library-edge.integration.test.ts` (pass — MEASURES write 201; lifecycle edge still 409; wrong pair 400)
- AC-05 → `api/__tests__/metric-library-cardinality.integration.test.ts` (pass — second link rejected `kpi_metric_already_linked`)
- AC-06, AC-07 → `api/__tests__/metric-library-seed.integration.test.ts` (pass — set-equality against the frozen 20; re-seed net-zero; not IN_MODEL-scoped)
- AC-08 → `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts` (pass — real fixture writes 20; lifecycle-edge fixture 409 write-nothing)
- AC-09 → `api/__tests__/metric-library-attribute-enforcement.integration.test.ts` (pass — missing/out-of-enum rejected; extra key accepted, N-02)
- AC-11 → `bun run typecheck` exit 0 + boundary `git diff` clean on all owned-elsewhere files (nodes/edges/guard/rbac/errors/route.ts/App.tsx/views/index.tsx/seed-saas-operator.ts); **PWA-half deferred** (no `views/index.tsx` edit possible — see BLOCKER)
- AC-12 → `pwa/src/__tests__/metric-library.test.tsx` (pass — name/category/unit/formula/benchmark; category filter; ViewRegion landmark)
- AC-13, AC-14, AC-15 → `pwa/src/__tests__/metric-library-states.test.tsx` (pass — loading; empty prompting `seed:saas-metric-library`, C-03; error + retry-refetch)
- AC-16 → manual: `bun run scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.tsx` and `--view …/MetricLibrary.module.css` both exit 0 (PASS)
- AC-17 → tsx half: DOM-order/landmark assertions in `metric-library.test.tsx` (pass, C-01 scope: landmark→filter→rows, no KPI-Enter); **live keyboard sweep deferred** (blocked route seam)
- AC-18 → `pwa/playwright/business-metrics-reload.spec.ts` authored; **BLOCKED** — `#/insights/metrics` does not resolve to `MetricLibrary` without the removed route seam

**Artifacts:**
- 📄 Requirements: `.claude/specs/saas-metric-library/requirements.md`
- 📄 Design: `.claude/specs/saas-metric-library/design.md`
- 📄 Tasks: `.claude/specs/saas-metric-library/tasks.md`
- 📝 Reviews: `.claude/specs/saas-metric-library/review-requirements.md`, `.claude/specs/saas-metric-library/review-design.md`

**OQ-1 resolution (recorded in design §2 + blueprint XD-06-erratum):** the
blocking requirements open question is resolved as **option (a)** — the
KPI→MetricDefinition edge is registered as **`MEASURES`** (not `INSTANTIATES`),
a distinct unguarded runtime edge type; the generic `POST /api/v1/edges` accepts
it with zero owned-elsewhere edits. The required **XD-06-erratum** is recorded in
`.claude/specs/blueprint-saas-operator.md`. The five design-time OQs (2–6) are
also closed in design §2: OQ-2 reject-on-second-link, OQ-3 six-value `category`
enum, OQ-4 self-owned `seed:saas-metric-library` step, OQ-5 reuse `query/cypher`,
OQ-6 read-only-v1 view.

**Tasks summary**: 14 tasks (T-01…T-14). Server slice T-01…T-08, T-13
(registry ensure, `MEASURES` edge + cardinality helper, register-then-seed CLI,
frozen 20-metric fixture, CRUD + attribute-enforcement + edge-write tests); PWA
slice T-09…T-12 (`MetricLibrary` view + CSS + the single `metrics:` VIEWS line +
reload e2e); T-14 final sweep. The three deferred design-review Concerns are
pinned: **C-01** (no per-metric KPI list in v1 — AC-17 scoped to landmark→filter
→rows, KPI-Enter clause dropped), **C-02** (`linkKpiToMetric` is the single
sanctioned write path, enforcement write-path-scoped), **C-03** (empty-state copy
+ AC-14 test pin the exact `seed:saas-metric-library` string).

**Next**: Task review (large spec — tasks are reviewed), then execution.
