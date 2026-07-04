# Spec: kpi-okr-performance-dashboards
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: tasks:draft

**review_passes**: 0

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | review-requirements.md (pass 2, verdict approve) | 2026-07-04 |
| Req Review | approve (0 blockers) | - | 2026-07-04 |
| Design | approved | review-design.md (pass 2, verdict approve) | 2026-07-04 |
| Design Review | approve (0 blockers) | - | 2026-07-04 |
| Tasks | draft | - | 2026-07-04 |
| Task Review | pending | - | - |
| Execution | not started | - | - |

**Verification:**
- `verified_at`: —  ← required when Execution is `complete`
- `verification_artifact`: —  ← required when Execution is `complete`

**Artifacts:**
- 📄 Requirements: `.claude/specs/kpi-okr-performance-dashboards/requirements.md`
- 📄 Design: `.claude/specs/kpi-okr-performance-dashboards/design.md`
- 📄 Tasks: `.claude/specs/kpi-okr-performance-dashboards/tasks.md` (draft — 18 tasks)
- 📝 Reviews: `.claude/specs/kpi-okr-performance-dashboards/review-requirements.md` (approve); review-design.md (pass 2, approve)

**Tasks (18):** T-01 shared zod schemas · T-02 `computeKpiStatus` + unit · T-03 KPI portfolio handler · T-04 OKR roll-down handler (two-read join) · T-05 journey handler + router dispatch + RBAC · T-06 RBAC unit · T-07 KPI integration (status/slice/query-count AC-14) · T-08 systemKind slice integration (AC-03) · T-09 OKR integration (AC-04) · T-10 journey integration (AC-05) · T-11 OpenAPI registration · T-12 `api.performance` client · T-13 OpenAPI integration (AC-06) · T-14 `PerformanceDashboard` view + exec tab · T-15 view behaviour tests (AC-07/08/09/12) · T-16 a11y test (AC-11) · T-17 manual sweep · T-18 full validation + ownership + completion gate.

**Task-review carry-ins pinned (from review-design.md pass 2):**
- C-06 → T-04/T-09: Read B grouping key `(dir.id, a.domain_id, d.name, a.status, a.weight)`; null-`a` rows dropped before schema validation.
- N-04 → T-04/T-14: `?domain` on `/okr` filters directives, not the per-domain assignment columns.

**Design decisions pinned (DD-*):**
- DD-01 read-only/additive/GET-only under `/api/v1/analytics/performance/`
- DD-02 status computed server-side (was DEC-01)
- DD-03 batched cross-store reads (≤1 Neo4j + ≤1 Postgres round trip, AC-14)
- DD-04 reuse governed reads + `parseWith` + `SYSTEM_KINDS`; snake_case kept
- DD-05 one clean owner per shared file (`route.ts` additive exec-tab append)
- DD-06 systemKind slice = inclusive-any (pins OQ-2)
- DD-07 journey axis = new `/analytics/performance/journeys` (FR-08 reuse check confirmed no governed route lists journeys per domain)
- DD-08 sparkline is lazy (one `kpi-trends` fetch on KPI expand)

**Flagged for consolidated report (XD-17):**
- DEC-02 — adds read-only `/api/v1/analytics/performance/*` aggregates (aggregate-endpoint boundary).
- Risk R-1 — portfolio latest value (Postgres) vs sparkline (`kpi-trends` reads Neo4j `:KPIMeasurement`) can disagree until `kpi-okr-governance` unifies the V-02 split-brain. Inherited, not fixed here.
- Risk R-2 — OKR aggregate inherits the governed `attributes_json CONTAINS $domainId` substring-match false-positive envelope (correcting it belongs to `kpi-okr-governance`).

**Next**: Present tasks at the gate → task review (large spec, full review depth), then execution. Blocked at build time on `kpi-okr-governance` + `system-augmentation-model` landing (both on disk; interfaces referenced from their approved designs).
