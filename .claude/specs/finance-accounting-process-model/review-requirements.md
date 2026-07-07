---
feature: "finance-accounting-process-model"
artifact: "requirements.md (revision 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Review: finance-accounting-process-model — requirements.md (rev 1)

Re-reviewed cold against the blueprint (`blueprint-saas-operator.md`), `.claude/CLAUDE.md`,
and the real interfaces of every named dependency. Every rev-0 finding was re-verified
against the codebase rather than taken on the author's word: the compliance route mount,
the compliance POST handler, the governed seed helper exports, the operator-root ensure,
the KPI→metric `MEASURES` helper, the story model-scope resolver, the risk schema/enum,
the DDD `setContext` write path, and the metric catalog were all read directly.

This is pass 2 of the 2-review budget. The rev-0 verdict was `revise` on two factual
interface errors (B-01, B-02) plus four design-phase concerns (C-01..C-04). All six are
resolved with interfaces that check out against the source. No new blocker surfaced.

## Rev-0 finding disposition (re-verified)

- **~~B-01~~ → resolved.** FR-10, AC-08, NFR-03, the Mapping Table, and Dependencies now
  cite `POST /api/v1/compliance/rules` (slash) with POST handler `handleCreateComplianceRule`.
  Confirmed: `api/src/router.ts:590-591` mounts `compliance/rules` → GET `handleComplianceRules`,
  POST `handleCreateComplianceRule`; `api/src/routes/compliance-rules.ts:32,42` exports both.
  The doc correctly keeps the storage *file* name `compliance-rules.ts` and calls out the
  distinction inline (FR-10, B-01 note).

- **~~B-02~~ → resolved.** FR-08 and AC-07 now require the story `:modelId` to be the
  SaaS-Operator `BusinessModel` **root** id, resolved by lookup via `ensureOperatorRoot`
  (never hard-coded), and add that root handle to Dependencies. Confirmed:
  `api/src/seed/ensure-operator-root.ts:18-48` exports `ensureOperatorRoot` keyed on
  `name:"SaaS Operator"` + `attributes.saasOperatorRoot === true`;
  `api/src/storage/model-scope.ts:22-47` resolves `Domain -[:IN_MODEL]-> model` + transitive
  `PART_OF` descendants; `api/src/storage/stories.ts:148-161` rejects out-of-scope activities
  `404 story_activity_not_in_model`. AC-07 adds the `201`-success + control-`404` assertions.

- **~~C-01~~ → resolved.** FR-12 and OQ-4 now record the discovered mismatch — the as-built
  DDD surface maps `Capability`s into bounded contexts, not `System`s. Confirmed:
  `api/src/routes/capabilities.ts:54,213-216` mounts `PUT models/:modelId/capabilities/:capabilityId/context`
  → `setContext` (Capability→BoundedContext); there is no System→BoundedContext write path.
  FR-12 offers the two OQ-4 paths (author Capabilities + `setContext`, or the
  `system.attributes.boundedContext` tag degrade) and stays `should`, so it cannot block
  the mandatory pipeline.

- **~~C-02~~ → resolved.** FR-11 now pins to importing `seedRisk`/`seedComplianceRule`
  from `api/src/seed/governed-seed-helper.ts` and wrapping a lookup-before-create dedup on
  top. Confirmed those symbols are exported (`governed-seed-helper.ts:95,108`) and post to
  the governed routes, so importing them edits nothing owned-elsewhere; the dedup layer is
  correctly this spec's to own (the helpers are raw POSTs with no MERGE).

- **~~C-03~~ → resolved.** AC-05 now asserts the six catalog-backed KPIs
  (MRR/ARR/DSO/gross-margin/burn/runway) each `MEASURES` exactly one metric, and splits the
  FinOps Cloud-Cost-per-Tenant grounding into AC-15, explicitly **blocked-on-OQ-1**.
  Confirmed OQ-1 is real: `shared/seed/saas-metric-library/metrics.json` has no
  cloud-cost-per-tenant row. AC-05 is now green-able today; AC-15 is honestly gated.

- **~~C-04~~ → resolved.** NFR-06 and the UI/UX section are softened to "surfaced by
  whichever view a downstream spec owns (Explorer at minimum)"; the `#/business/functions`
  render is no longer stated as this spec's deliverable, only carried as the OQ-6 note. No
  AC depends on a render destination.

## Findings (rev 1)

### Blockers

None.

### Concerns

None blocking. The remaining OQs (OQ-1 metric flag, OQ-2 risk-vs-compliance modeling,
OQ-3 dedup mechanism, OQ-4 DDD path) are all correctly scoped as **design-time** decisions
with author recommendations and cannot destabilize the mandatory pipeline (the two `must`
paths they touch — FinOps grounding and DDD — are gated by AC-15/`should` respectively).
They are recorded here so the design closes each explicitly.

### Nits

**N-01 — AC ordering.** AC-15 is listed before AC-14 (lines 273-274). Harmless to
traceability (both IDs are stable and mapped), but the design should present ACs in numeric
order for readability. Optional.

**N-02 — AC-07 control story needs a second model to exist.** The "posted under a
non-root/other model id → `404`" control assertion presumes a second `BusinessModel`
(e.g. retail Model #1) is present in the test DB. That is true under the seed, but the
design's test setup should make the control model's existence explicit so the `404` proves
scope-mismatch, not `model_not_found`. Design-time detail, not a requirements gap.

**N-03 — `sla-crud.ts` in the never-edit lists (FR-09, NFR-03, AC-08).** This spec creates
no SLAs; the `sla-crud.ts` mention is defensive scope-noise (carried from rev-0 N-02). Fine
to leave as a belt-and-suspenders boundary assertion.

## Completeness / Traceability

Every FR maps to ≥1 AC and every AC traces to ≥1 FR. Re-verified against real interfaces:

| FR | Covered by | Interface verified | Status |
|----|-----------|--------------------|--------|
| FR-01 journeys `PART_OF` domain | AC-01, AC-11, AC-12 | `finance_accounting` seedKey real (`ensure-function-domains.ts:24`); import lifecycle guard real | OK |
| FR-02 activities in `PRECEDES` | AC-02 | `PRECEDES` core edge; roster frozen at design | OK |
| FR-03 roles `EXECUTES` | AC-03 | `EXECUTES` core edge; shared role catalog referenced by seedKey | OK |
| FR-04 systems `USES_SYSTEM` | AC-04 | `USES_SYSTEM` core edge; shared Stripe referenced, slice systems added | OK |
| FR-05 KPIs via `POST /api/v1/kpis` | AC-05 | `handleKpiPost` + `kpiCreateRequestSchema` fields real (`kpi-sla.ts:155`) | OK |
| FR-06 `MEASURES` grounding | AC-05, AC-06, AC-15 | `linkKpiToMetric` + `KpiMetricAlreadyLinkedError` + `MEASURES` KPI→MetricDefinition real | OK (FinOps → AC-15, OQ-1) |
| FR-07 optional `ALIGNED_TO`/`PARAM_BINDS` | (should; enrichment, no dedicated AC) | as-built alignment edges | OK |
| FR-08 stories/ACs | AC-07 | story route model-scoped; root `:modelId` via `ensureOperatorRoot`; `story_activity_not_in_model` real | OK (B-02 resolved) |
| FR-09 risks via risk-register | AC-08, AC-09 | `handleRiskRegisterCreate` + `createRiskSchema` + `risk_type` enum (`financial`/`compliance`) real | OK |
| FR-10 compliance rows | AC-08 | route `compliance/rules` + `handleCreateComplianceRule` real | OK (B-01 resolved) |
| FR-11 idempotent seed script | AC-08, AC-09 | `seedRisk`/`seedComplianceRule` exported; risk-register `domain`/`name` filter for dedup | OK (C-02 resolved) |
| FR-12 DDD mapping | AC-10 | `setContext` maps Capability→context (`capabilities.ts:213`); OQ-4 documents mismatch | OK (should; C-01 resolved) |
| FR-13 mapping table | AC-14 | skeleton present; complete roster frozen in design | OK |
| NFR-01 no new store/label/route/view | AC-01, AC-13 | data-only via governed routes | OK |
| NFR-02 idempotency/isolation | AC-09, AC-11 | stable-seed MERGE via import upsert; script dedup | OK |
| NFR-03 governed-API-only | AC-08, AC-10, AC-13 | boundary clean; paths correct | OK |
| NFR-04 lifecycle-guard compat | AC-12 | `realImport` guard real | OK |
| NFR-05 house rules | AC-13 | `bun run typecheck`; zod-only; loopback; central-gate auth | OK |
| NFR-06 no view/route edit | AC-13 | softened; no render destination claimed | OK (C-04 resolved) |

Platforms & Input Modes and Native Conflicts tables carry the correct explicit
all-`no`/`(none)` rows for a no-`pwa/` content spec — the workflow requirement is satisfied.

Done well: the doc names real helpers and schemas verbatim, tags every rev-1 change inline
with the finding it closes, keeps stable IDs unrenumbered, and gates the one genuinely
open KPI grounding (FinOps/OQ-1) behind a separate, explicitly-blocked AC rather than
weakening the testable AC-05. XD-06-erratum (`MEASURES` not `INSTANTIATES`) is honored
throughout.

## Verdict

**approve.** Both rev-0 blockers are resolved with interfaces verified correct against the
source, and all four concerns are addressed. Open questions OQ-1..OQ-4 are legitimately
design-time and carry author recommendations; none can destabilize the mandatory pipeline.
Requirements are ready to proceed to design. Recorded open items for design to close:
OQ-1 (flag `saas-metric-library` for `metric-cloud-cost-per-tenant`), OQ-2 (risk vs
compliance modeling), OQ-3 (dedup mechanism), OQ-4 (DDD Capability-map vs attribute-tag).
