---
feature: "kpi-okr-performance-dashboards"
reviewing: "requirements"
artifact: "requirements.md (revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "2 of 2"
---

# Review: kpi-okr-performance-dashboards — requirements.md (rev 2)

Re-reviewed cold. Read the revised artifact in full, the pass-1 review, both
upstream dependency specs (`kpi-okr-governance/requirements.md`,
`system-augmentation-model/requirements.md`), the blueprint (View Tree, UX-*,
XD-*), and `.claude/CLAUDE.md`. Re-verified every previously-flagged claim and
every newly-added assertion against the live codebase
(`api/src/routes/{roll-down,okr-crud,kpi-trends}.ts`, `api/src/router.ts`,
`shared/src/schema/{edges,system-kind}.ts`, `pwa/src/route.ts`,
`pwa/src/api.ts`, `pwa/src/components/charts/`).

The one pass-1 blocker and all four concerns are resolved with the correct
as-built facts, and the revision introduced no new blockers. Verdict: **approve**.

---

## Resolution of prior findings

**~~B-01~~ → resolved.** FR-03 and AC-04 no longer invent an
`assigned`/`adjustment_requested` vocabulary. Both now assert the as-built
`status ∈ {pending, committed, approved, rejected}`, explicitly note that a
freshly-created assignment reads back `pending`, and model pending-adjustment
as a *separate* `RollDownAdjustment` signal (from `POST /roll-down/request-adjustment`),
not a fifth assignment status. Verified against `api/src/routes/roll-down.ts`:
CREATE paths set `status:'pending'` (lines 113/129/144/256/…), commit sets the
`z.enum(["committed","rejected"])` value via `SET a.status = $status` (line 467),
approve → `'approved'` (line 1196), reject → `'rejected'` (line 1222); the
adjustment handler (`handleRollDownAdjustmentPost`, line 478) creates a
`:RollDownAdjustment` node. The four-literal contract is now exactly correct and
AC-04 is testable. The "friendlier display label" note correctly frames any UI
relabel as a display mapping only.

**~~C-01~~ → resolved.** OQ-1 is promoted to recorded decision **DEC-02** ("add
the read-only `/api/v1/analytics/performance/*` server aggregates"), pinned under
XD-17 single-shot with the client-side alternative retained only as the rejected
option flagged to the consolidated report. The FR-05..FR-09 B-group is no longer
conditional on an open question. OQ-1 is rewritten as "resolved as DEC-02."

**~~C-02~~ → resolved.** FR-08 now names the specific reuse candidates the design
phase must check first — the `journeys*` routes (`api/src/routes/journey-*.ts`)
and the generic `/api/v1/nodes/:label` handler (`api/src/routes/nodes.ts`) — and
records the 2026-07-04 finding that neither lists `UserJourney` per domain today.
I re-verified: `router.ts` `journeys` routes are single-journey / versions /
rollback / changes (lines 656–670) and `/nodes/:label` is single-node CRUD — no
per-domain journey list exists. The reuse check is now a bounded lookup, not an
open-ended search.

**~~C-03~~ → resolved.** FR-07 and AC-04 now explicitly state the aggregate's
directive→domain fidelity is bounded by the governed handler's
`attributes_json CONTAINS $domainId` substring match, that the false-positive
envelope is inherited (not this spec's defect), and that correcting it belongs to
`kpi-okr-governance`. Verified the substring match at `okr-crud.ts:90,322`.

**~~C-04~~ → resolved.** NFR-03 now defines a testable **query-count invariant**
(≤ 1 Neo4j round trip + ≤ 1 Postgres round trip per request, independent of KPI
count) as the CI-robust proxy for the p95 target, and adds **AC-14** proving it
via a driver/pg spy over 50-KPI vs 5-KPI fixtures. The wall-clock p95 is now
honestly marked design-phase-verified.

**~~N-01~~ → resolved** (FR-10c/FR-10d annotated as `kpi-okr-governance` FR ids
inline). **~~N-02~~ → resolved** (`api.getPerformance` noted as per-domain, the
new `/analytics/performance/*` calls as additional client methods). **~~N-03~~ →
resolved** (AC-06 now states plainly that `?kind` is not hard-validated —
`?kind=nonsense` returns 200 with the `all` slice, not 400).

## New findings

None. No blockers, concerns, or nits introduced by the revision. Spot-checked the
new/changed assertions against reality: `SYSTEM_KINDS`/`systemKindSchema` export
shape (`shared/src/schema/system-kind.ts:9-12`), `CONTRIBUTES_TO` KPI→UserJourney/
Activity + `USES_SYSTEM` Activity→System (`edges.ts:13,32,38`), the exec `tabs`
array ending at `okr-management` so the appended `{id:"performance"}` row is a
clean non-conflicting single-line edit with no id collision (`route.ts:69-77`),
and the governed reads `GET /api/v1/kpis` / `/domains` / unfiltered
`/okr-directives` / `okr-performance?domain_id=` / `roll-down/okr` GET /
`roll-down/contributions` GET / `kpi-trends/:id` all present in `router.ts`.

---

## Completeness / Traceability

Re-verified against the live codebase; "real?" = interface exists as described.

| FR / NFR | Covered by AC | Real / feasible? | Notes |
|----------|---------------|------------------|-------|
| FR-01 (route + additive exec tab) | AC-07, AC-13 | ✅ real | exec `tabs` array real, ends at `okr-management`; no `performance` collision; FILE-OWNERSHIP note correct |
| FR-02 (KPI trend + breach status) | AC-01, AC-08, AC-12 | ✅ real | server-side status per DEC-01; `kpiSchema` threshold fields confirmed |
| FR-03 (OKR roll-down panel) | AC-04 | ✅ real (B-01 fixed) | `{pending,committed,approved,rejected}` matches `roll-down.ts`; adjustment modeled as separate `RollDownAdjustment` signal |
| FR-04 (URL-first slicer) | AC-02, AC-07, AC-12 | ✅ real | `route.params` query-string pattern real; `#/explorer/systems?kind=` prior art |
| FR-05 (KPI portfolio aggregate) | AC-01, AC-02, AC-14 | ✅ feasible | new `/analytics/performance/kpis`; namespace unused; pinned by DEC-02 |
| FR-06 (systemKind traversal) | AC-03 | ✅ real | `CONTRIBUTES_TO` + `USES_SYSTEM` edges real; `SYSTEM_KINDS` module real; OQ-2 inclusive-any recommended, correctly deferred |
| FR-07 (OKR roll-down aggregate) | AC-04 | ✅ real (C-03 bounded) | substring-match fidelity documented as inherited |
| FR-08 (journey list) | AC-05 | ✅ real (C-02 named) | reuse candidates named; no per-domain journey list exists today (verified) |
| FR-09 (OpenAPI + zod 400) | AC-06 | ✅ real | ZodError→400 mapper landed; reuse valid |
| NFR-01 (read-only, additive) | AC-13 | ✅ | all-GET under `/api/v1/`; no v2 bump |
| NFR-02 (house rules) | AC-10, AC-13 | ✅ | zod-only, en-US, no tsc, central auth gate |
| NFR-03 (perf p95) | AC-14 | ✅ (C-04 fixed) | query-count invariant is the CI proxy |
| NFR-04 (snake_case kept) | AC-01/AC-04 shapes | ✅ | matches `kpi-okr-governance` NFR-04 |
| NFR-05 (systemKind import-only) | AC-03 | ✅ real | `system-kind.ts` exists; XD-15 honored |
| UX-01 states | AC-08, AC-09 | ✅ | loading/empty/error/ready + zero-match |
| UX-02 tokens/catalog | AC-10 | ✅ real | `LineChartCard`/`AreaChartCard`/`KpiCard`/`Pill`/`Card` all exist |
| UX-05 a11y | AC-11 | ✅ | keyboard/focus/AT/text-not-color-alone |
| UX-06 nav (deep link) | AC-07 | ✅ | URL-first, route verbatim from View Tree |

Every FR maps to ≥ 1 AC; every AC maps back to an FR/NFR/UX allowance. Platforms &
Input Modes and Native Conflicts tables present and appropriate. Blueprint
conformance intact: `#/exec/performance` → `PerformanceDashboard` verbatim
(blueprint.md:103,112) with correct owner slug; XD-02/XD-15/XD-16/XD-17 respected.

**Done well:** the B-01 fix is thorough — it not only corrects the vocabulary but
proactively separates the adjustment signal and documents the display-mapping
seam, which will save the design phase a round-trip. The FILE-OWNERSHIP treatment
of `route.ts` (additive, comment-anchored, carried to Phase C for a single clean
owner) is exactly the coordination the orchestrator asked for. DEC-02 and the
NFR-03 query-count invariant convert the two most slippery pass-1 concerns into
pinned, testable commitments.

---

## Verdict: approve

Zero blockers. All pass-1 findings (B-01 + C-01..C-04 + N-01..N-03) are resolved
against the correct as-built surface, and the revision introduced no new issues.
Two design-phase pins remain honestly recorded (OQ-2 systemKind traversal
semantics with a recommended inclusive-any default; FR-08 reuse-or-add with the
candidate routes named) — both are appropriate for the design phase, not
requirements blockers. Ready to proceed to design.
