---
feature: "marketing-process-model"
reviewing: "requirements"
artifact: "requirements.md (revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Review: marketing-process-model / requirements.md (rev 2)

Re-reviewed cold against the codebase and all upstream artifacts (blueprint,
`saas-operator-foundation`, `saas-metric-library`, `funnel-pipeline-modeling`,
`story-spec-core`, `ddd-system-modeling`, `risk-compliance-change`,
`system-augmentation-model`). This revision addresses every rev-1 finding. The
one rev-1 blocker (B-01) is genuinely resolved: I re-verified the frozen metric
roster and the KPI/edge write paths against the delivered code and dependency
specs. All resolutions hold up. No new blocker was introduced. One residual
semantic concern (C-04) and two carried design-phase items remain, none blocking.

## Rev-1 findings — resolution status

- **~~B-01~~ → resolved.** FR-05/FR-06/AC-05/AC-06 now name only metrics that
  provably exist in the frozen roster. I confirmed against
  `saas-metric-library/design.md:246–274`: **`metric-cac`** (row 1) and
  **`metric-pipeline-conversion`** (row 16) are both present in the exact-set
  20-row frozen roster (AC-06 set-equality). CPL / cost-per-lead / cost-per-MQL
  are correctly re-cast as **`MEASURES`-less** supporting KPIs (no roster metric
  exists — confirmed no CPL/cost-per-lead/cost-per-MQL row in the 20). FR-06's
  "exactly one `MEASURES`" is now correctly scoped to metric-grounded KPIs only.
  OQ-2 is recomposed from a deferred hope into a closed decision with no upstream
  dependency — the correct resolution (rev-1 option (b)). AC-06 no longer sets
  itself up to fail.
- **~~C-01~~ → resolved.** FR-04 now states every `System` row this slice authors
  MUST carry a valid `systemKind` from `SYSTEM_KINDS`, and that omission is
  rejected `400 attribute_violation` with payload-atomic abort. I verified
  `shared/src/schema/system-kind.ts`: `SYSTEM_KINDS = ["functional","agentic",
  "ai_predictive"]` and `required: ["systemKind"]` on the System registry doc.
  AC-04 now covers the failure mode explicitly.
- **~~C-02~~ → resolved (carried into design, correctly flagged).** OQ-1 records
  the self-owned `seed:marketing` companion-script decision and hands design the
  precise items to close (name, wiring, per-kind idempotency key). I confirmed
  foundation FR-06 is a POST-to-governed-routes *helper mechanism* and FR-07 is a
  fixed directory scan with **no** per-slice API-driven hook — so a self-owned
  companion step is required and bounded (no owned-elsewhere edit). Flagged to
  the orchestrator below.
- **~~C-03~~ → resolved.** FR-06 now pins the write path to the concrete
  `POST /api/v1/edges {type:"MEASURES",fromId,toId}`. I verified `MEASURES` is
  **not** in `LIFECYCLE_EDGES` (`model-lifecycle-guard.ts:25–31` — the set is
  `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`), so the
  generic edge route accepts it; and this matches `saas-metric-library` FR-03 +
  its OQ-1 option (a) / the XD-06-erratum. FR-06 also correctly states the
  one-metric cardinality is *consumed* from `saas-metric-library` (its OQ-2 /
  AC-05), not enforced here.
- **~~N-01~~ → resolved.** `system-augmentation-model` is reclassified in
  Dependencies as a *consumed as-built constraint* (source of the required
  `systemKind`), not a wave-1b peer.
- **~~N-02~~ → resolved.** M-15 / FR-11 now note `ACCEPTANCE_OF` is route-created
  by the AC write path; this slice authors no `ACCEPTANCE_OF` edge itself.

## Findings

### Blockers

None.

### Concerns

**C-04 (new, non-blocking) — the MQL→SQL-conversion KPI grounds in
`metric-pipeline-conversion`, whose canonical formula is a sales-win metric, not
a top-of-funnel qualified-conversion metric.** The roster row 16 formula is
*"Deals won ÷ qualified opportunities entering pipeline"* (a bottom-of-funnel win
metric), while the Marketing KPI it grounds is a stage-to-stage
**MQL→SQL** conversion (top-of-funnel). FR-06/§Revision-2 acknowledge this
openly ("the per-qualified-stage conversion metric — semantically honest for a
stage-to-stage qualified-conversion KPI"), which is why this is a concern, not a
blocker: the mapping is transparent and points at a real, frozen roster metric,
so AC-06 will pass. But `metric-pipeline-conversion`'s benchmark/formula is
sales-motion-specific; grounding a *marketing* MQL→SQL KPI in it slightly
overloads the metric's semantics and could confuse the benchmark-scoring wave-3
spec. Recommendation (design/backlog, not blocking): either (a) keep the link but
document in the KPI's `description` that it uses the pipeline-conversion metric as
the nearest canonical proxy, or (b) record MQL→SQL conversion — like CPL — as a
`MEASURES`-less KPI plus an optional backlog item for `saas-metric-library` to add
a dedicated qualified-conversion metric. This does not block requirements
approval; it is a design-time judgment call the author has already surfaced.

### Nits

**N-03 — FR-05 lists "marketing-sourced pipeline" and "lead volume" as
`MEASURES`-less KPIs, but only CPL and cost-per-MQL are named as the
backlog-metric candidates in OQ-2.** Minor: OQ-2 and the §Risks table cite
"CPL / cost-per-MQL" as the gap; the two other un-grounded KPIs (pipeline, lead
volume) are equally `MEASURES`-less but aren't mentioned in the backlog note.
Harmless — they're valid `MEASURES`-less KPIs — but the design should confirm
whether *any* roster metric (e.g. nothing for raw lead volume) fits them before
seeding, to keep the "never invent a local MetricDefinition" invariant (XD-06)
clean. No requirements change needed.

## Completeness / Traceability

Internal traceability remains clean: every FR maps to ≥1 AC and every AC traces
to ≥1 FR. External traceability (the rev-1 defect) is now sound. Every cited
route, schema, edge, error code, and guard was re-verified against the code.

| FR | Covered by | Verified against reality | Status |
|----|-----------|--------------------------|--------|
| FR-01 journeys `PART_OF` domain | AC-01 | foundation FR-03 `seedKey="marketing"` confirmed; `PART_OF` UserJourney→Domain core edge | OK |
| FR-02 activities `PART_OF`/`PRECEDES` | AC-02 | core edges confirmed | OK |
| FR-03 roles `EXECUTES` + persona edges | AC-03 | `EXECUTES`/`PERFORMS_AS`/`PARTICIPATES_IN` non-lifecycle; foundation FR-05 shared catalog by name/seedKey | OK |
| FR-04 systems `USES_SYSTEM`/`INTEGRATES_WITH` + `systemKind` | AC-04 | `system-kind.ts` `required:["systemKind"]` + `400 attribute_violation` confirmed (**C-01 resolved**) | OK |
| FR-05 KPIs via `POST /api/v1/kpis` | AC-05 | `handleKpiPost`+`kpiCreateRequestSchema` confirmed; metric-grounded vs `MEASURES`-less split now roster-honest (**B-01 resolved**) | OK |
| FR-06 `MEASURES` KPI→metric | AC-06 | `metric-cac`+`metric-pipeline-conversion` present in frozen roster; `MEASURES` ∉ `LIFECYCLE_EDGES`; write path pinned to `POST /api/v1/edges` (**B-01/C-03 resolved**; **C-04** on pipeline-conversion semantics) | OK (see C-04) |
| FR-07 `ALIGNED_TO`/`PARAM_BINDS` | AC-07 | alignment edges exist (`kpi-measurement-alignment`) | OK |
| FR-08 Funnel/Stage `HAS_STAGE` | AC-08 | funnel FR-06/FR-07 + node CRUD + `POST /api/v1/edges`; linear-chain `must` matches funnel FR-11 | OK |
| FR-09 `CONVERTS_TO` via transition route | AC-09 | funnel FR-07 `POST /api/v1/funnels/transitions`, `400 attribute_violation` confirmed | OK |
| FR-10 stories via model-scoped route | AC-10 | `stories.ts` + `story_activity_not_in_model` (errors.ts:55) confirmed | OK |
| FR-11 ACs Given/When/Then | AC-11 | `acceptance_criterion_clause_required` (errors.ts:56) confirmed | OK |
| FR-12 risks via `POST /api/v1/risk-register` | AC-12 | `createRiskSchema` fields + `risk_type` enum (incl. `operational`,`compliance`) + `linked_entity_id` confirmed exactly | OK |
| FR-13 capabilities via ddd routes | AC-13 | `capabilities.ts` routes confirmed | OK |
| FR-14 seed slice + companion step | AC-14, AC-15 | foundation loader/import/lifecycle-guard confirmed; companion mechanism carried to design (**C-02 flagged**) | OK (design item) |
| FR-15 mapping table | AC-17 | table present; all labels/edges pre-existing or wave-1b-registered | OK |
| NFR-01 no new labels/edges/store | AC-16 | verified nothing added to `nodes.ts`/`edges.ts` | OK |
| NFR-02 idempotency + retail isolation | AC-15 | plausible; hinges on companion idempotency key (design, C-02) | OK |
| NFR-03 governed-API-only | AC-05/10/12/13/14/16 | ownership boundaries verified against owning specs | OK |
| NFR-04 lifecycle-guard compat | AC-14 | `LIFECYCLE_EDGES` confirmed; `MEASURES` excluded, `INSTANTIATES` included | OK |
| NFR-05 house rules | AC-16 | zod-only, loopback, central-gate auth, no new RBAC string — respected | OK |

**Blueprint / house-rule conformance:** No conflicts. Ships **no** PWA view,
edits **no** `route.ts`/`SURFACES`/`views/index.tsx` (XD-05), registers **no**
label/edge (XD-02/NFR-01), creates owned-elsewhere data only via governed APIs
(XD-04/XD-08), models no operational records (XD-03), delivers the mandated
mapping table (XD-10). The Platforms & Input Modes and Native Conflicts
"no interactive surface" tables are correctly present and justified. All View-Tree
references are accurate. The `MEASURES`-not-`INSTANTIATES` handling matches the
adopted XD-06-erratum precisely.

**Done well:** the B-01 resolution is exemplary — it re-verifies the upstream
frozen roster by line number, re-scopes the cardinality invariant honestly, and
turns the un-grounded KPIs into a valid `MEASURES`-less class rather than forcing
a fictional metric (respecting XD-06's "never invent a local MetricDefinition").
The mapping table remains the strongest artifact: concrete labels, edges, and
per-row write path (fixture vs. governed API). Every cited route/schema/error-code
checked out against the code on re-verification.

## Verdict

**approve** — zero blockers. All six rev-1 findings are resolved and independently
re-verified against the code and dependency specs. One residual non-blocking
concern (C-04: the MQL→SQL KPI grounds in a sales-win-formula roster metric — the
author has already surfaced this and it does not break AC-06) and one nit (N-03)
carry into design as judgment calls. Two items are correctly carried into the
design phase and must be closed there:

1. **OQ-1 / C-02** — pin the self-owned `seed:marketing` companion script: name,
   wiring (`bun run seed:marketing` after `seed:saas-operator`), and the
   per-data-kind idempotency key (lookup-by-name/attribute, since these routes
   server-generate ids). Flag to orchestrator as the design-phase item.
2. **OQ-3** — the companion script's dynamic SaaS-Operator-root-id +
   Marketing-activity-id resolution via `POST /api/v1/query/cypher` before any
   model-scoped POST.

The spec is well-formed, architecturally sound, and ownership-disciplined.
