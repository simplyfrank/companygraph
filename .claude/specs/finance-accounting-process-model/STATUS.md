# Spec: finance-accounting-process-model
**Size**: medium | **Created**: 2026-07-06 | **Current Phase**: execution:complete

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | - | 2026-07-06 |
| Req Review | approve (0 blockers) | - | 2026-07-06 |
| Design | approved | - | 2026-07-06 |
| Design Review | approve (0 blockers) | - | 2026-07-06 |
| Tasks | approved | - | 2026-07-06 |
| Execution | complete | - | 2026-07-06 |

**review_passes**: 0  (medium spec → tasks phase has no review pass)

**Verification:**
- `verified_at`: 2026-07-06
- `verification_artifact`: five `api/__tests__/finance-*.integration.test.ts`
  files — 21 tests pass under `bun test --test-name-pattern '^integration:'
  --max-concurrency 1` (loopback API + Neo4j + Postgres up); `bun run
  typecheck` exit 0; `git diff --stat` confined to the owned file set.

**Per-AC verification:**

| AC | Verified by | Notes |
|----|-------------|-------|
| AC-01 | `api/__tests__/finance-process-slice.integration.test.ts` (`AC-01: the six journeys are each PART_OF the resolved finance domain`) | 6 journeys PART_OF finance domain (domain-edge half via graph script; structure half via fixture) |
| AC-02 | `api/__tests__/finance-process-slice.integration.test.ts` (`AC-02: 24 activities…`, `AC-02: six acyclic linear PRECEDES chains…`) | 24 activities, 18 PRECEDES, 6 heads/6 tails, zero cycles |
| AC-03 | `api/__tests__/finance-process-slice.integration.test.ts` (`AC-03: five slice roles EXECUTES…`, `AC-03: shared revenue_operations…`) | slice roles EXECUTES their chains; shared role referenced once (not duplicated) |
| AC-04 | `api/__tests__/finance-process-slice.integration.test.ts` (`AC-04: three slice systems…`, `AC-04: shared Stripe system…`) | slice systems carry systemKind+boundedContext; Stripe referenced once |
| AC-05 | `api/__tests__/finance-kpis.integration.test.ts` (`AC-05: the six grounded finance KPIs each carry exactly one MEASURES edge`) | 6 grounded KPIs, one MEASURES each; FinOps excluded |
| AC-06 | `api/__tests__/finance-kpis.integration.test.ts` (`AC-06: a second MEASURES on an already-grounded KPI is rejected kpi_metric_already_linked`) | second link via the guarded `linkKpiToMetric` throws `KpiMetricAlreadyLinkedError` (write-path-scoped cardinality) |
| AC-07 | `api/__tests__/finance-stories.integration.test.ts` (all three tests) | ≥1 story/journey with G/W/T AC under resolved root; control model → `404 story_activity_not_in_model`; partial AC → `acceptance_criterion_clause_required` |
| AC-08 | `api/__tests__/finance-risks.integration.test.ts` (`AC-08: five finance risk rows…`, `AC-08: one finance compliance rule row`) | 5 risk rows (financial+compliance) + 1 compliance rule, persisted ids |
| AC-09 | `api/__tests__/finance-risks.integration.test.ts` (`AC-09: a second seed run adds zero rows…`) | second `seedFinanceRisks` adds 0 rows (name-marker dedup) |
| AC-10 | `api/__tests__/finance-ddd.integration.test.ts` (`AC-10: the three finance systems carry the boundedContext tag…`) | boundedContext tag on 3 finance systems; no DDD route/schema edit |
| AC-11 | `api/__tests__/finance-process-slice.integration.test.ts` (`AC-11: a second graph-script run adds zero net-new edges`) | edge count unchanged across a re-run (edgeExists guard) |
| AC-12 | `api/__tests__/finance-process-slice.integration.test.ts` (`AC-12: a fixture with a lifecycle row is rejected 409…`) | BusinessModel row → `409 model_lifecycle_route_required`, nothing written |
| AC-13 | manual: `bun run typecheck` exit 0 + `git status --porcelain` shows edits confined to `package.json` (two additive script lines), `api/scripts/finance-ids.ts`, `api/scripts/seed-finance-graph.ts`, `api/scripts/seed-finance-risks.ts`, `shared/seed/saas-operator/finance-accounting.json`, the five `api/__tests__/finance-*.integration.test.ts` files — no schema/route/view/owned-elsewhere storage edit | — |
| AC-14 | manual: design §4 Mapping Table traced 1:1 against seeded elements (fixture: 6 journeys / 24 activities / 5 roles / 3 systems / 24 PART_OF / 18 PRECEDES / 24 EXECUTES / 9 USES_SYSTEM; scripts: 6 journey→domain PART_OF, shared USES_SYSTEM/EXECUTES, 7 KPIs + 6 MEASURES + 1 ALIGNED_TO, 6 stories+ACs, 5 risks + 1 compliance rule, 4 boundedContext tags) — no orphan element, no orphan row | — |
| AC-15 | **blocked-on-OQ-1** — `metric-cloud-cost-per-tenant` absent from `saas-metric-library`; the FinOps `Cloud Cost per Tenant` KPI is created ungrounded (observable: `api/__tests__/finance-ddd.integration.test.ts` `OQ-1 flag` + `finance-kpis` AC-15 assert zero MEASURES). Grounding lands once the metric ships. | — |

**Execution notes:**
- Runtime finding (not a code defect): the long-running dev API server caches
  `getEdgeEndpoints` in an in-memory 60 s LRU; a `MEASURES` edge-type registered
  out-of-band after boot can transiently read `allowed:[]`. Each finance
  integration test registers the metric label + MEASURES edge type in its
  `beforeAll`, so a fresh process (CI) grounds correctly. Confirmed end-to-end:
  6 grounded MEASURES, FinOps ungrounded, idempotent re-runs.
- Environment note: the shared `bun run seed:saas-operator` loader currently
  aborts on a **concurrent** spec's malformed `customer-success.json`
  (`fromId`/`toId` objects) — not this spec's file. The finance slice loads
  cleanly on its own (38 nodes, 75 edges) and the tests import it directly, so
  this spec is unaffected.

**Artifacts:**
- 📄 Requirements: `.claude/specs/finance-accounting-process-model/requirements.md`
- 📄 Design: `.claude/specs/finance-accounting-process-model/design.md`
- 📄 Tasks: `.claude/specs/finance-accounting-process-model/tasks.md` (draft — 11 tasks)
- 📝 Reviews: `.claude/specs/finance-accounting-process-model/review-requirements.md` (approve); `review-design.md` (approve, 0 blockers, 5 concerns pinned in tasks)

**Design decisions (DD-*) frozen:**
- **DD-01..DD-04:** three delivery channels — import slice (`finance-accounting.json`),
  governed graph script (`seed-finance-graph.ts` — KPIs/`MEASURES`/stories), governed
  risk script (`seed-finance-risks.ts`). All governed-API-only; zero owned-elsewhere edits.
- **DD-05 (resolves OQ-4):** DDD mapping via the `system.attributes.boundedContext` **tag**
  (option b), not `Capability`/`setContext` — the DDD surface maps Capabilities not Systems
  and BoundedContext nodes are ontology-import-only; FR-12 is `should`, so the tag suffices.
- **DD-06 (resolves OQ-2/OQ-3):** compliance obligations = risk-register rows (`risk_type:"compliance"`)
  + one evaluable `compliance/rules` row; idempotency = lookup-before-create keyed on the `name`
  marker (risk list has no `name` filter → matched in TS over `domain`+`risk_type` filter).

**Open Questions carried to the user / orchestrator:**
- **OQ-1 (cross-spec flag; author recommendation (b)):** `metric-cloud-cost-per-tenant` is
  **absent** from the `saas-metric-library` catalog (confirmed: 20 metrics, no such row).
  XD-06 forbids inventing it here. Recommend flagging `saas-metric-library` to add a canonical
  `metric-cloud-cost-per-tenant`. Design: the FinOps KPI is created **ungrounded** now and its
  grounding is gated behind **AC-15 (blocked-on-OQ-1)**; the other six finance KPIs are grounded
  today (AC-05).
- **OQ-2 (resolved in design as the split; confirm):** compliance obligations modeled as
  risk-register rows with `risk_type:"compliance"` (descriptive) + one `compliance/rules` row
  (the evaluable tax-deadline control).
- **OQ-4 (resolved in design as (b); confirm):** DDD mapping via the `boundedContext` attribute
  tag rather than full `Capability`/`setContext` authoring. Option (a) documented as promotable
  later (design §12).

**Task-phase pins (design review concerns C-01..C-05, landed in tasks.md):**
- **C-01** → T-04: shared `edgeExists(base,type,from,to)` pre-check
  (`MATCH (a{id})-[r:TYPE]->(b{id}) RETURN count(r)`) guards every script-created
  edge so a re-seed adds zero net new edges (AC-11).
- **C-02** → T-01/T-04: slice-local ids are fixture literals from a shared
  `api/scripts/finance-ids.ts` const; only foundation ids use typed
  `ensure*` helpers; the fragile `CONTAINS`-substring lookup is dropped.
- **C-03** → T-05: `GET /api/v1/kpis` returns `{ rows: […properties…] }` with
  no `domain_id` filter (verified) → KPI dedup filters `name`+`domain_id` in TS.
- **C-04** → T-05/T-09: FinOps KPI created ungrounded now (metric absent);
  documented as a knowingly-temporary XD-06 exception (zero `MEASURES` asserted),
  grounded via AC-15 once OQ-1 lands.
- **C-05** → T-05: FR-07 alignment pinned to the verified
  `POST /api/v1/edges {type:"ALIGNED_TO"}` path; the unverified
  `/api/v1/kpis/alignments` name dropped.

**Next**: Execution complete (all 11 tasks landed; 21 integration tests green;
typecheck exit 0; ownership boundary clean). AC-15 (FinOps grounding) stays
blocked-on-OQ-1 until `saas-metric-library` adds `metric-cloud-cost-per-tenant`
— the FinOps KPI ships ungrounded now and its grounding is a one-line follow-up
once the metric exists.
