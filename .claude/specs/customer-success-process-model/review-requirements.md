---
feature: "customer-success-process-model"
reviewing: "requirements"
revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
---

# Requirements Review: customer-success-process-model (rev 2)

Review pass 2 of 2. Read the rev-2 requirements cold, re-verified every rev-1
finding's resolution against live code (not just against the author's revision
note), and scanned for issues the revision may have introduced. The rev-2
resolutions are code-accurate, not merely re-stated: every line reference the
spec cites was checked and holds.

**Code re-verification (all confirmed):**
- `scopedNodeIds` uses `MATCH (m:BusinessModel)... (d:Domain)-[:IN_MODEL]->(m)
  ... (d)<-[:PART_OF*0..]-(desc)` — transitive `PART_OF` descendants **are**
  members of the scoped set (`api/src/storage/model-scope.ts:22-33`). B-02's
  "holds by construction" is true: CS `Activity -PART_OF-> UserJourney
  -PART_OF-> Domain(CS)` where CS domain is `IN_MODEL` the operator root.
- `OPERATOR_ROOT_NAME = "SaaS Operator"`, `OPERATOR_ROOT_MARKER =
  "saasOperatorRoot"` (`api/src/seed/ensure-operator-root.ts:18-19`) — exactly
  FR-15's cited lookup; root id is server-generated and discovered, never
  hard-coded.
- `governed-seed-helper.ts` exports `seedRisk`/`seedSla`/`seedComplianceRule`,
  each a plain `postGoverned` POST with **no** lookup/GET/dedup, and **no
  `seedKpi`** — confirming B-03: all idempotency guards are this spec's own code.
- `kpi-crud.ts` — `const id = generateId()` then plain `CREATE (k:KPI …)`, no
  MERGE (verifies FR-05).
- `risk-register.ts:10` — `domain: z.string().min(1)`, free-text (verifies
  FR-11 / C-03); likelihood/impact `int().min(1).max(5)`, status + trend enums,
  `linked_entity_type`/`linked_entity_id` optional — all match FR-11.
- story guard: `MATCH (a:Activity {id}) WHERE a.id IN $scoped` →
  `404 story_activity_not_in_model` (`stories.ts`); capability STRICT arm →
  `scopedNodeIds` + `404 not_found` (`capabilities.ts:390-405`) — both match
  FR-08/FR-12.
- metric-library roster: `metric-nrr`/`metric-grr`/`metric-logo-churn`/
  `metric-revenue-churn` present (design rows 6-9); health-score/CSAT/ticket-SLA
  absent — verifies FR-07/OQ-1. `MEASURES` registered via `ensureMeasuresEdgeType`
  in `seed:saas-metric-library`, `∉ LIFECYCLE_EDGES`, `409
  kpi_metric_already_linked` under OQ-2 (a) — all confirmed against the
  metric-library design.

## Resolved from rev 1

- ~~B-01~~ → **resolved.** FR-15 is a new seed-preamble FR that resolves the
  operator-root `modelId` at seed time via the exact
  `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` lookup; FR-08 and
  FR-12 now explicitly consume the resolved `:operatorRoot` as `:modelId` and
  state they never hard-code it. AC-08/AC-11 assert the resolved-modelId path.
- ~~B-02~~ → **resolved.** FR-15's scoped-set guarantee (plus the inline notes in
  FR-08/FR-12) establishes CS activities are members of
  `scopedNodeIds(:operatorRoot)` "by construction" — verified accurate against
  `model-scope.ts` (transitive `PART_OF*0..`). AC-08/AC-11 assert the write is
  accepted, not `404`. The "live nodes, not a pinned `ModuleInstance` snapshot"
  caveat (DD-09) is correctly noted as non-applicable.
- ~~B-03~~ → **resolved.** FR-05/FR-09/FR-11/NFR-02 now state plainly that the
  lookup-before-create guards are **this spec's own `seed:customer-success`
  code** wrapping the helper's POSTs (or calling `POST /api/v1/kpis` directly),
  not inherited from the foundation's FR-06 helper; the "no `seedKpi` helper"
  fact is stated. OQ-3 extended to cover all four guards (KPI/SLA/risk/story).
- ~~C-01~~ → **resolved.** FR-05 now cross-references FR-07/OQ-1 and pins its
  unconditional `must` set to the four retention KPIs.
- ~~C-02~~ → **resolved.** AC-06 now asserts the `MEASURES` registration
  precondition and requires a pre-registration run to **fail loudly**, never
  silently skip.
- ~~C-03~~ → **resolved.** FR-11 records `domain = "Customer Success"` (Domain
  node `name` verbatim) as the canonical convention all six content slices adopt;
  OQ-2 flags cross-spec confirmation with `cross-function-exec-rollup`.
- ~~C-04~~ → **resolved.** AC-14 now requires each mapping row to name (a)
  label/edge, (b) route/API, and (c) error code — a mechanically checkable gate.
- ~~N-01~~ → **resolved.** FR-09 (`must`) SLA-create split into AC-09; FR-10
  (`should`) SLA-alignment gets its own AC-16 so a deferred `should` can't drag
  the `must` AC red.
- ~~N-02~~ → **resolved.** FR-09 uses `/api/v1/slas` (verified route), flags the
  `sla-crud.ts` file-vs-route naming for design.
- ~~N-03~~ → **resolved.** Wave-3 surfacing marked forward-looking context only;
  no AC depends on it.

## Concerns (carry into design — none blocking)

### C-05 — FR-06/AC-06 describe the `MEASURES` write as a raw `POST /api/v1/edges` but the metric-library design ships a sanctioned `linkKpiToMetric` helper for exactly this
`saas-metric-library` design §5.3 provides
`api/src/seed/link-kpi-metric.ts` → `linkKpiToMetric(baseUrl, kpiId, metricId)`,
a feature-owned thin write helper that does the cardinality pre-check
(`MATCH (k:KPI {id})-[m:MEASURES]->() RETURN count(m)`) then POSTs the edge, and
explicitly says "content specs import this helper (or replicate the two-step
check)." The cardinality guard is **advisory-in-the-helper**, not a graph
constraint — a raw `POST /api/v1/edges` would bypass it and could create a second
`MEASURES` edge. FR-06/AC-06 describe the correct *observable behavior* (`409
kpi_metric_already_linked`, one metric per KPI) but reach it via a bare
`POST /api/v1/edges` and never commit to the helper.
**Recommendation:** design should state the CS seed step uses
`linkKpiToMetric` (the sanctioned path that enforces OQ-2 (a)) rather than a raw
edge POST — otherwise AC-06's "second `MEASURES` rejected `409`" is only true if
the guard is on the write path CS actually uses. Low blast radius; a design-time
mechanism choice, not a requirements defect.

### C-06 — OQ-1 remains the one genuinely user-facing decision and must be surfaced before design
FR-07/OQ-1 is handled well (pinned to the four existing metrics; the other three
conditional), but it is a real cross-spec dependency: authoring health/CSAT/
ticket-SLA KPIs requires an amendment to `saas-metric-library`'s frozen roster,
owned there, not here. This is correctly an OQ, not a blocker for *this* spec's
requirements — but the user must pick option (a) / (b) before CS design freezes
its KPI roster.
**Recommendation:** put OQ-1 to the user before design, as STATUS.md plans;
record the choice so FR-05's KPI count (4 vs 7) and AC-07's arm ("authored" vs
"deferred + absent") are settled.

## Nits

### N-04 — FR-02 activity roster is "frozen exactly at design time" but lives in the requirement prose
FR-02 lists the mandatory-minimum activity set inline and says it is "frozen
exactly at design time." Good for testability (AC-02 asserts no missing/extra),
but the design's mapping table (FR-13/AC-14) is where the frozen roster should be
authoritative. Ensure design and FR-02 don't drift.

## Completeness / Traceability

| FR | Covered by AC | Upstream / code verified | Notes |
|----|---------------|--------------------------|-------|
| FR-01 journeys | AC-01, AC-12, AC-13 | foundation FR-03 seedKey, `realImport` MERGE | Solid |
| FR-02 activities | AC-02 | core `Activity`/`PART_OF`/`PRECEDES` | Roster frozen at design (N-04) |
| FR-03 roles `EXECUTES` | AC-03 | foundation FR-05 catalog, DEC-01 reference nodes | Solid |
| FR-04 systems `USES_SYSTEM` | AC-04 | foundation FR-04 catalog + `systemKind` | Solid |
| FR-05 KPIs via `POST /kpis` | AC-05, AC-07 | `kpi-crud` plain CREATE (verified) | ~~B-03~~ ~~C-01~~ resolved |
| FR-06 `MEASURES` | AC-06 | `∉ LIFECYCLE_EDGES`, `409 kpi_metric_already_linked` (verified) | ~~C-02~~ resolved; **C-05** (use `linkKpiToMetric`) |
| FR-07 metric gap (OQ-1) | AC-07 | roster verified: 3 metrics absent | ~~C-01~~ resolved; **C-06** (user decision) |
| FR-08 stories | AC-08 | `/models/:modelId/stories`, `404 story_activity_not_in_model` guard (verified) | ~~B-01~~ ~~B-02~~ resolved via FR-15 |
| FR-09 SLA create | AC-09 | `slaCreateRequestSchema`, `/api/v1/slas` route (verified) | ~~B-03~~ ~~N-02~~ resolved |
| FR-10 SLA alignment | AC-16 | `handleSlaAlignmentPost` (verified) | ~~N-01~~ resolved (own AC now) |
| FR-11 risks | AC-10 | `createRiskSchema` free-text `domain` (verified) | ~~B-03~~ ~~C-03~~ resolved |
| FR-12 DDD | AC-11 | `/models/:modelId/capabilities*`, `scopedNodeIds` STRICT arm (verified) | ~~B-01~~ ~~B-02~~ resolved via FR-15 |
| FR-13 mapping table | AC-14 | XD-10 mandate | ~~C-04~~ resolved (label/edge+route+error-code gate) |
| FR-14 seed slice | AC-12, AC-13, AC-15 | foundation FR-07/FR-09 loader + guard (verified) | Solid |
| FR-15 seed-preamble id resolution | AC-08, AC-11 | `ensure-operator-root.ts:18-19`, `model-scope.ts` (verified) | **New — resolves B-01/B-02** |
| NFR-01 no new store/labels | AC-07, AC-15 | — | Solid; git-diff gate |
| NFR-02 idempotency/isolation | AC-01,03,04,05,09,10,13 | helper is POST-only (verified) | ~~B-03~~ resolved (own guards) |
| NFR-03 ownership | AC-09,10,11,15,16 | git-diff gates | Solid, crisp |
| NFR-04 house rules | AC-15 | zod-only, loopback, `/api/v1/`, no new RBAC | Solid |
| NFR-05 no PWA surface | Platforms/Native none-rows | View Tree: content specs add no views | Correct treatment |

**Every AC traces to ≥1 FR; every FR has ≥1 AC. No orphans.** The Platforms &
Input Modes and Native Conflicts none-rows are the correct treatment for a
no-view content spec (blueprint: wave-2 content specs add no views; UX-* attach
to view-owning specs only). Interface claims are code-accurate throughout;
ownership boundaries (NFR-03 git-diff gates against every owned-elsewhere file)
are unusually precise.

## Verdict

**approve.** All three rev-1 blockers (B-01 modelId resolution, B-02 scoped-set
membership, B-03 idempotency machinery) are genuinely resolved — FR-15 is a
correct, code-verified seed-preamble that threads root/domain resolution and
proves scoped-set membership by construction, and FR-05/09/11/NFR-02 now own
their idempotency guards explicitly. All four concerns (C-01..C-04) are resolved
in the requirement text. Two concerns carry into design: **C-05** (commit to the
metric-library's sanctioned `linkKpiToMetric` helper rather than a raw edge POST,
so AC-06's cardinality assertion holds on the path CS uses) and **C-06** (OQ-1
must go to the user before the KPI roster freezes). Neither blocks requirements
approval. This spec is ready to proceed to design.
