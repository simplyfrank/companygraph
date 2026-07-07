# Spec: platform-ops-process-model
**Size**: medium | **Created**: 2026-07-06 | **Current Phase**: execution:complete

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user (review pass 1 approve, 0 blockers) | 2026-07-06 |
| Req Review | approve (0 blockers; C-01/C-02/C-03 → design) | - | 2026-07-06 |
| Design | approved | user (review pass 1 approve, 0 blockers) | 2026-07-06 |
| Design Review | approve (0 blockers; C-01..C-04 + N-01..N-03 → tasks) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Execution | complete | implementer (T-01..T-12; 38 integration tests green, typecheck exit 0) | 2026-07-06 |

**review_passes**: 0

**Medium spec**: no Task Review row (per spec-workflow STATUS.md rule) — tasks
go from draft to execution on user approval.

**Verification:**
- `verified_at`: 2026-07-06 (seeded loopback stack: `seed:saas-operator` +
  `seed:saas-metric-library` + `seed:platform-ops` on Neo4j + Postgres +
  API @ 127.0.0.1:8787; `bun test` sweep of all `platform-ops-*` = 38 pass / 0
  fail; `bun run typecheck` exit 0)
- `verification_artifact`: `api/__tests__/platform-ops-*.integration.test.ts`
  (13 files, 38 tests, all green) — per-AC below.

**Per-AC verification artifacts:**

| AC | Verification artifact |
|----|-----------------------|
| AC-01 | `api/__tests__/platform-ops-journeys.integration.test.ts` (one platform_ops domain, five journeys PART_OF it) |
| AC-02 | `api/__tests__/platform-ops-activities.integration.test.ts` (4–7 activities/journey, PRECEDES first→last, Deploy/release Rollback branch) |
| AC-03 | `api/__tests__/platform-ops-roles.integration.test.ts` (every activity ≥1 EXECUTES; four function roles; shared-catalog role count = 1) |
| AC-04 | `api/__tests__/platform-ops-systems.integration.test.ts` (Helm/K8s/PagerDuty by resolved id; 3 function systems with valid systemKind; USES_SYSTEM; ≥1 INTEGRATES_WITH) |
| AC-05 | `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts` (non-lifecycle fixture imports; IN_MODEL variant → 409, nothing written) |
| AC-06 | `api/__tests__/platform-ops-seed-idempotency.integration.test.ts` (double seed net-zero nodes/edges + C-01 named cross-boundary edges; retail subgraph unchanged) |
| AC-07 | `api/__tests__/platform-ops-kpis.integration.test.ts` (5 KPIs via POST /api/v1/kpis; kpiRow parses; no dup per name) |
| AC-08 | `api/__tests__/platform-ops-kpi-measures.integration.test.ts` (4 linked KPIs one MEASURES each to roster metric; MEASURES write 201; INSTANTIATES 409; Backup-success unlinked) |
| AC-09 | `api/__tests__/platform-ops-kpi-alignment.integration.test.ts` (each KPI ALIGNED_TO its target; wrong target → 404 not_found; generic /edges wrong pair → 400 edge_endpoint_label_mismatch) |
| AC-10 | `api/__tests__/platform-ops-stories.integration.test.ts` (≥1 UserStory per journey, DESCRIBES_ACTIVITY a slice activity, ≥2 G/W/T ACs) |
| AC-11 | `api/__tests__/platform-ops-risks.integration.test.ts` (≥1 operational/security/technical risk via POST /api/v1/risk-register, persisted ids; re-run no dup) |
| AC-12 | `api/__tests__/platform-ops-slas.integration.test.ts` (3 SLAs via POST /api/v1/slas returning persisted id on **200**, not 201; re-run no dup) |
| AC-13 | `api/__tests__/platform-ops-capabilities.integration.test.ts` (≥3 Capability CAPABILITY_IN_MODEL; each SUPPORTED_BY ≥1 System + ≥1 NEEDS_CAPABILITY; no BoundedContext created) |
| AC-14 | manual: mapping-table audit — every label/edge/route in `requirements.md` §Mapping table resolves to a real construct (`grep` in `shared/src/schema/*` for core labels/edges; runtime-registered MEASURES/capability edges; routes in `api/src/router.ts`); no invented construct |
| AC-15 | manual: `bun run typecheck` exit 0; `git diff --stat` confined to `shared/seed/saas-operator/platform-ops.json`, `api/scripts/seed-platform-ops-content.ts`, `api/src/seed/platform-ops-content.ts`, `api/__tests__/platform-ops-*` (+ helper `api/__tests__/helpers/platform-ops-fixtures.ts`), `package.json` (one line), and this spec's docs — no schema/router/route/storage/rbac/errors/loader/pwa edit |

**Execution notes:**
- All 12 tasks (T-01..T-12) implemented in dependency order; footprint exactly
  the design §10 File Changes set plus one test-helper
  (`api/__tests__/helpers/platform-ops-fixtures.ts`, mirroring the house
  `helpers/{capability,story}-fixtures.ts` precedent — it makes the
  precondition seeds resilient to cross-spec test pollution of the shared
  Neo4j/Postgres, since sibling specs building in parallel can leave a
  same-named `Persona` without the operator marker that trips the foundation
  `seedSaasOperator` guard; the spec's own `seedPlatformOps` still fails loud on
  a genuinely-absent precondition).
- No file owned elsewhere was edited (verified via `git status`): no
  `shared/src/schema/*`, `api/src/router.ts`, `api/src/routes/*`,
  `api/src/storage/*`, `api/src/auth/rbac-permissions.ts`, `api/src/errors.ts`,
  `api/scripts/seed-saas-operator.ts`, or any `pwa/*` file. The `package.json`
  edit is the single `seed:platform-ops` script line.
- OQ-1 interim binding executed as designed: Error budget burn → `metric-uptime`
  (MEASURES); Backup success rate ships unlinked (should-tier). Outbound gap
  (`metric-error-budget`, `metric-backup-success`) remains for `saas-metric-library`
  (design §11) — this spec never seeds a `MetricDefinition`.

**Artifacts:**
- 📄 Requirements: `.claude/specs/platform-ops-process-model/requirements.md`
- 📄 Design: `.claude/specs/platform-ops-process-model/design.md`
- 📄 Tasks: `.claude/specs/platform-ops-process-model/tasks.md` (12 tasks, draft)
- 📝 Reviews: `.claude/specs/platform-ops-process-model/review-requirements.md`, `review-design.md`

**Design decisions of note (for the reviewer + orchestrator):**
- **C-01/OQ-5 correction** — the review believed no `ALIGNED_TO`-create route
  exists; a **dedicated `POST /api/v1/kpi-alignments`** route DOES exist
  (`kpiAlignmentCreateRequestSchema`, CREATEs `ALIGNED_TO`). Design uses it as the
  primary FR-08 path. AC-09 error contract corrected: the dedicated route returns
  **`404 not_found`** on a wrong target (not `400 edge_endpoint_label_mismatch`);
  the generic `/edges` path keeps the `400` contract as a supplementary negative.
  Recorded as Deviation D-1 (requirements-errata).
- **C-02/OQ-1 resolved self-contained** — metric roster has no
  `metric-error-budget`/`metric-backup-success` (confirmed). Design binds **Error
  budget → `metric-uptime`** and ships **Backup success rate** as `should`-tier,
  **unlinked** until the roster gains `metric-backup-success`. A roster **gap is
  flagged outbound** to `saas-metric-library` (design §11); this spec never seeds
  a `MetricDefinition`.
- **C-03/D-2** — SLA writes pinned to `POST /api/v1/slas` which returns **200**;
  AC-12 asserts a persisted id on 200 (never 201). Content-seed POSTs governed
  routes directly (robust to the foundation helper's internal path label).

**Open Questions (for the user, via the orchestrator):**
- **OQ-1 (needs a nod):** confirm the interim binding — Error budget →
  `metric-uptime`, Backup success unlinked+`should` — and whether to request the
  two roster additions from `saas-metric-library` now (design §11 Gap Register).
  All other OQs (OQ-2 SLA source, OQ-3 field gaps, OQ-4 bounded-context) are
  resolved at design time with no cross-spec dependency.

**Tasks summary (12 tasks):** 1 fixture (T-01), 6 content-seed build steps
(T-02..T-07 in `api/src/seed/platform-ops-content.ts` + T-08 CLI/package), 4
integration-test tasks (T-09..T-11), 1 final audit sweep (T-12). All four
design-review concerns folded into tasks: **C-01** (cross-boundary `/edges`
idempotency guard → T-04 `ensureEdge` by `(type,fromId,toId)` + T-11 named
net-zero assertion — the concern with teeth), **C-02** (schema citations
re-prefixed to `shared/src/schema/…` → T-02), **C-03** (context-map read path
`.../system-model/context-map` → T-07), **C-04** (fixture intentionally
incomplete + `seed:platform-ops` ordering → T-03/T-08 fail-loud). Nits N-01
(stricter internal `riskRow`), N-02 (reuse exported `linkKpiToMetric`), N-03
(risk lookup by `domain` + client-side `name` match) also landed.

**Open Questions (for the user, via the orchestrator):**
- **OQ-1 (needs a nod):** confirm the interim metric binding — Error budget →
  `metric-uptime`, Backup success rate ships **unlinked** + `should`-tier — and
  whether to request the two roster additions (`metric-error-budget`,
  `metric-backup-success`) from `saas-metric-library` now (design §11 Gap
  Register). This is the sole outbound cross-spec item; all other OQs (OQ-2 SLA
  source, OQ-3 field gaps, OQ-4 bounded-context) are resolved at design time with
  no cross-spec dependency.

**Next**: Medium spec → present tasks for approval, then execution (T-01…T-12 in
dependency order). Execution requires the seeded loopback stack
(`seed:saas-operator` + `seed:saas-metric-library` are preconditions).
