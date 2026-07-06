# Spec: saas-metric-library
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: tasks:draft

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user (rev 2, review pass 2/2 approve) | 2026-07-06 |
| Req Review | approve (0 blockers; OQ-1 carried as open decision) | - | 2026-07-06 |
| Design | approved | user (rev 1, review pass 1 approve) | 2026-07-06 |
| Design Review | approve (0 blockers; C-01/C-02/C-03 deferred to tasks) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Task Review | pending | - | - |
| Execution | pending | - | - |

**review_passes**: 0
**total_tasks**: 14

**Verification:**
- `verified_at`: -  ← required when Execution is `complete`
- `verification_artifact`: -  ← required when Execution is `complete`

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
