# Spec: customer-success-process-model
**Size**: medium | **Created**: 2026-07-06 | **Current Phase**: execution:complete

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user | 2026-07-06 |
| Req Review | approve (0 blockers) | spec-review-agent | 2026-07-06 |
| Design | approved | user | 2026-07-06 |
| Design Review | approve (0 blockers) | spec-review-agent | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Execution | complete | implementer | 2026-07-06 |

**review_passes**: 0

**Tasks**: 16 tasks (T-01…T-16), all executed. Task-count summary: 3
fixture/catalog/CLI (T-01…T-03), 7 seed-phase + test (T-04…T-10), 3
sweep/idempotency tests (T-11…T-13 incl. the mapping-table + lifecycle-guard
checks), 3 boundary/validation/bookkeeping (T-14…T-16). No PWA slice (NFR-05).

**Deliverables shipped:**
- `shared/seed/saas-operator/customer-success.json` — process fixture (5
  journeys, 22 activities, 4 CS-specific roles, 2 CS-specific systems;
  PART_OF/PRECEDES/EXECUTES/USES_SYSTEM in the `018f0400` block). Only concrete-id
  in-slice edges (the foundation loader imports it clean); shared-reference edges
  (journey→domain, shared-role→activity, activity→shared-system) are authored by
  the seed step via lookup-before-create `ensureEdge` (platform-ops-proven
  encoding — the design's §4.2 sentinel-rewrite intent, realised so BOTH run
  modes work).
- `api/src/seed/customer-success-catalog.ts` — row data + internal zod input
  shapes + fixed `018f0400` id constants + cross-boundary edge sets.
- `api/scripts/seed-customer-success.ts` — `bun run seed:customer-success` CLI:
  FR-15 preamble (resolve operator root + CS domain, never hard-coded) → import →
  cross-boundary edges → KPIs+MEASURES (+ per-metric conditional arm) →
  stories+ACs → SLAs+alignments → risks → DDD. Owns all feature-owned idempotency
  guards (Rule C).
- `package.json` — sole edit: the `seed:customer-success` script line.
- 13 `api/__tests__/customer-success-*.integration.test.ts` + a
  `helpers/customer-success-fixtures.ts` precondition-seed helper.

**As-built deviation (design §4.2, XD-07-clean):** the shared CS :Role catalog
carries exactly ONE customer-success role, `customer_success_lead`; "Customer
Success Owner" is seeded as a :Persona, not a :Role (verified
`saas-operator-catalog.ts`). So `SHARED_ROLE_KEYS = ['customer_success_lead']`
and the go-live/renewal-close/executive-escalation shared EXECUTES all use
`customer_success_lead` (the design's "CS Owner (shared)" role assignments map to
the one shared CS role that exists; the CS-specific roles in the fixture cover
the rest). No owned-elsewhere file edited.

**Verification:**
- `verified_at`: 2026-07-06
- `verification_artifact`: all 13 `api/__tests__/customer-success-*.integration.test.ts`
  green under `bun test` (43 pass / 0 fail across 14 files) with the three seeds
  run against the live loopback stack (Neo4j + Postgres); `bun run typecheck`
  exit 0; `git diff` boundary sweep confined to the fixture, catalog, seed
  script, `package.json` seed line, and this spec's own tests.

**Per-AC verification artifacts:**
- AC-01 → `api/__tests__/customer-success-journeys.integration.test.ts`
- AC-02 → `api/__tests__/customer-success-activities.integration.test.ts`
- AC-03 → `api/__tests__/customer-success-roles.integration.test.ts`
- AC-04 → `api/__tests__/customer-success-systems.integration.test.ts`
- AC-05 → `api/__tests__/customer-success-kpis.integration.test.ts`
- AC-06 → `api/__tests__/customer-success-kpi-measures.integration.test.ts`
- AC-07 → `api/__tests__/customer-success-kpi-gap.integration.test.ts` (deferred
  arm: zero CS-specific metrics present → zero conditional KPIs authored, zero new
  MetricDefinition; roster stays at 20)
- AC-08 → `api/__tests__/customer-success-stories.integration.test.ts`
- AC-09 → `api/__tests__/customer-success-sla.integration.test.ts`
- AC-10 → `api/__tests__/customer-success-risks.integration.test.ts`
- AC-11 → `api/__tests__/customer-success-ddd.integration.test.ts`
- AC-12 → `api/__tests__/customer-success-seed-load.integration.test.ts` (positive
  load + negative lifecycle-guard 409)
- AC-13 → `api/__tests__/customer-success-seed-idempotency.integration.test.ts`
- AC-14 → manual: design §4.8 mapping table present, one row per FR-01…FR-12
  artifact class, each naming label/edge + route/API + error code
- AC-15 → manual: `bun run typecheck` exit 0; `git diff --stat` confined to the
  fixture, catalog, seed script, `package.json` seed line, and this spec's tests;
  no edit to `shared/src/schema/{nodes,edges}.ts`,
  `api/src/routes/{kpi-crud,sla-crud,kpi-sla-alignment,risk-register}.ts`,
  `api/src/routes/stories.ts`, `api/src/storage/{stories,capabilities}.ts`,
  `api/src/routes/capabilities.ts`, `api/src/seed/{governed-seed-helper,link-kpi-metric,ensure-*}.ts`,
  `api/scripts/seed-saas-operator.ts`, `api/src/auth/rbac-permissions.ts`,
  `api/src/errors.ts`, or any `pwa/` file
- AC-16 → `api/__tests__/customer-success-sla-alignment.integration.test.ts`

**Artifacts:**
- 📄 Requirements: `.claude/specs/customer-success-process-model/requirements.md`
- 📄 Design: `.claude/specs/customer-success-process-model/design.md`
- 📄 Tasks: `.claude/specs/customer-success-process-model/tasks.md` (draft, 16 tasks)
- 📝 Reviews: `.claude/specs/customer-success-process-model/review-requirements.md` (rev 2, approve); `review-design.md` (pass 1, approve)

**Open Questions (surfaced to orchestrator):**
- **OQ-1 (surfaced; NON-BLOCKING — confirmed at execution, C-01):** health-score /
  CSAT / ticket-SLA-compliance metrics are absent from `saas-metric-library`'s
  frozen 20-metric roster; XD-06 forbids inventing them here. **Executed
  disposition:** the build completed on the **four retention KPIs** (T-05) with
  zero dependency on OQ-1 (all green). The three CS-specific KPIs are a
  **per-metric conditional arm** (T-06) that authors each iff its
  `MetricDefinition` (`metric-health-score`/`metric-csat`/`metric-ticket-sla-compliance`,
  looked up by `seedKey`) exists — **in the current environment all three are
  absent, so zero conditional KPIs were authored and zero new MetricDefinition was
  registered** (AC-07 deferred arm verified;
  `customer-success-kpi-gap.integration.test.ts` green; MetricDefinition count
  unchanged at 20). OQ-1 remains a real user decision but is an **amendment owned
  by `saas-metric-library`** (recommend option (a) — add the three there);
  the CS seed step will author the three KPIs automatically once those metrics
  publish (per-metric, no CS code change needed). It did **not** gate this spec.
- **OQ-2 (recorded convention):** risk `domain` = the function `Domain` node
  `name` verbatim (`"Customer Success"`) — this is the **canonical cross-slice
  `GROUP BY domain` key** all six content slices adopt for the wave-3
  `cross-function-exec-rollup` cockpit. Verified in code: every CS risk row carries
  `domain:"Customer Success"` (`customer-success-risks.integration.test.ts`
  green). Confirm with `cross-function-exec-rollup` if it later needs a stricter
  `seedKey` slug.
- OQ-3..OQ-6 closed in design §2 (idempotency keys, seed-step ownership,
  hand-authored stories, representative DDD subset) — all realised as built.

**Next**: Execution complete. Ready for the app-level Phase C consolidation
(cross-spec consistency + verify). No follow-up owed inside this spec; OQ-1's
three-metric addition is scheduled in `saas-metric-library` (or a follow-up),
after which the CS conditional arm authors the three KPIs with no CS edit.
