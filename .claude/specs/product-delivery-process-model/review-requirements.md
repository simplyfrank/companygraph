---
feature: "product-delivery-process-model"
reviewing: "requirements"
reviewing_revision: 1
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-06"
---

# Review: product-delivery-process-model / requirements (pass 1/2)

## Verdict

**approve** — every FR maps to a testable AC, every referenced interface
(routes, labels, edges, schemas) was verified to exist as described, and the
ownership/house-rule boundaries are correct; the single blocking metric-mapping
question (OQ-1) is properly surfaced as a user decision that gates *design*, not
requirements approval, so it is recorded as an open concern rather than a
blocker.

## Blockers

none.

The one thing that could have been a blocker — three of the four blueprint
Product KPIs (`cycle time`, `feature adoption`, `spec throughput`) having no
canonical `MetricDefinition` to `MEASURES`, which XD-06 forbids inventing
ad-hoc — is correctly *not* silently resolved. I independently confirmed the
`saas-metric-library` frozen roster (design §4, 20 metrics) contains only
`Deploy Frequency` (`metric-deploy-frequency`) of the four; `cycle time`,
`feature adoption`, and `spec throughput` are genuinely absent. The spec raises
this as OQ-1, forbids itself from adding a `MetricDefinition` (NFR-01), and
pins FR-07/AC-06 as un-finalizable until the user decides. That is the correct
handling of an undecided dependency at requirements stage: it is flagged as
decided-by-someone-else, not dressed up as decided. It becomes a design blocker
if it reaches design unresolved (see C-01).

## Concerns

- **C-01** — **OQ-1 must be resolved by the user before design starts, and the
  clean option edits a dependency's frozen artifact.** OQ-1 option (a) (the
  author's recommendation) adds `Cycle Time`, `Feature Adoption`, `Spec
  Throughput` to `saas-metric-library`'s roster. But that roster is *frozen*
  (`saas-metric-library` design §4: "AC-06 asserts set-equality against these 20
  names; adding or removing a metric later is a design-doc change that updates
  this table + AC-06's expected set together"), and `saas-metric-library` is
  already at `execution` (its STATUS.md shows 12/14 tasks done). Adding three
  metrics is therefore a coordinated amendment to a *dependency mid-execution*,
  not a local change — it touches that spec's design §4, its AC-06 expected set,
  and its `metrics.json` fixture. The requirements correctly name this in OQ-1's
  mitigation, but the design cannot proceed until the user picks (a)/(b)/(c) AND,
  if (a), the `saas-metric-library` owner accepts the three-metric roster bump
  and assigns their seed ids. Recommend the design phase not begin until OQ-1 is
  closed and the three new `metric-*` seed ids (if (a)) are pinned into FR-07/
  AC-06. This is a process gate, not a requirements defect.

- **C-02** — **The KPI alignment write path (FR-08) is named only as "the
  `ALIGNED_TO` alignment write path", not the actual route.** I verified the
  as-built path is `POST /api/v1/kpi-alignments` (`kpi-sla-alignment.ts:20`,
  `router.ts:796`), taking `kpiAlignmentCreateRequestSchema`
  (`shared/src/schema/kpi-sla.ts:193`: `kpi_id`, `target_type ∈
  {journey,activity,domain}`, `target_id`, `weight ∈ [0,1]`, `attribution_type ∈
  {direct,indirect,leading,lagging}`) — it is **not** a generic `ALIGNED_TO`
  edge write via `POST /api/v1/edges`. FR-08 and the Dependencies block reference
  "the `ALIGNED_TO` alignment write path" loosely enough that a design author
  could reach for the generic edge route (which would still work — `ALIGNED_TO`
  is a real endpoint pair, `edges.ts:43`) and diverge from the governed KPI
  alignment route the cockpit reads. Recommend the design pin FR-08 to `POST
  /api/v1/kpi-alignments` + `kpiAlignmentCreateRequestSchema` explicitly, and
  note that `weight`/`attribution_type` are required fields the seed step must
  supply. Design-time; does not block requirements.

- **C-03** — **`ALIGNED_TO` is one target per row, but FR-08 phrases alignment as
  "journey/activity/domain" as if a single write.** The alignment route creates
  one alignment per `(kpi_id, target_type, target_id)`; a KPI aligned to both its
  journey *and* its domain is two POSTs. FR-08/AC-07 read as though one alignment
  per KPI suffices. Recommend the design clarify how many alignments each Product
  KPI gets (and that `domain_id` on the KPI node per AC-07 is a *separate*
  concern from the `ALIGNED_TO` edge — `domain_id` is a KPI node property in
  `kpiCreateRequestSchema:166`, the alignment is a graph edge). Both are real and
  distinct; the requirements conflate them slightly. Design-time.

## Nits

- **N-01** — FR-02 and the Representation Mapping table cite
  `Capability -[:NEEDS_CAPABILITY]-> ...` but the registered edge direction is
  `Activity -[:NEEDS_CAPABILITY]-> Capability`
  (`register-capability-labels.ts:70-73`, endpoint pairs
  `Activity→Capability`, `UserStory→Capability`). FR-12 and M-10 have it right
  (`Activity -[:NEEDS_CAPABILITY]-> Capability`); FR-02's parenthetical
  "`a capability need` → `Capability` + `NEEDS_CAPABILITY`" just omits the
  from-side. Cosmetic; the authoritative rows (M-10, FR-12) are correct.

- **N-02** — OQ-2's option (b) proposes authoring `UserStory` domain fields as
  top-level node properties in the import fixture "iff `realImport` preserves
  arbitrary top-level props." Worth noting for the design: the story clause
  fields (`given/when/then/ordinal`) are explicitly documented as owned by
  `api/src/storage/stories.ts` (per `register-story-labels.ts:52`), and the
  generic import path writes the standard envelope + `attributes_json` — so
  option (b) is very likely non-viable and the author's lean to (a) is right.
  Design should verify quickly and not over-invest in (b).

- **N-03** — The frozen-roster discipline for journeys (FR-03) and activities
  (FR-04) is asserted but the actual rosters are deferred to the design ("frozen
  in the design as an enumerated table"). That is the correct split for a
  content spec (requirements set the shape, design freezes the exact set), and
  AC-02/AC-03 assert set-equality — just flagging that the design MUST enumerate
  them or those ACs are untestable.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | n-a (requirements phase); every FR-01..FR-12 has ≥1 AC (see below) |
| Every AC is closed by a task with Verification | n-a (requirements phase); every AC-01..AC-14 carries a Platforms + Verification column (a real test path or a `manual:` repro) — pass |
| Routes/views match the blueprint View Tree verbatim | n-a — spec ships **no** `pwa/` files; Platforms & Input Modes + Native Conflicts tables present and correctly record the no-interactive-surface case (satisfies the spec-workflow requirement that these tables exist even when empty) |
| UX-* allowances covered in ACs (pwa/ specs) | n-a — no views; UX-01..UX-06 are all view-scoped and this spec correctly claims none |
| XD-* cross-cutting decisions honoured | pass — XD-01 (scoped under operator root, retail isolation NFR-02), XD-02 (no new labels/edges NFR-01, verified against `nodes.ts`/`edges.ts`), XD-04 (risk via governed route FR-11, no route edits NFR-04), XD-05 (no `route.ts`/`SURFACES`/`views/index.tsx` edit NFR-04), XD-06 + erratum (KPIs `MEASURES` a `MetricDefinition`, `MEASURES` name confirmed correct — not the lifecycle-guarded `INSTANTIATES`), XD-10 (all seven pipeline layers + reviewable mapping table present) |
| No file ownership conflict with another spec | pass — deliverables confined to `shared/seed/saas-operator/product-delivery.json` + a self-owned `seed:product-delivery` step + `api/__tests__/product-delivery-*`; consumes (never edits) foundation/metric-library/kpi/risk/story/ddd owned code, asserted by AC-10/AC-13/AC-14 diff checks |

### FR → AC coverage (all covered)

FR-01→AC-01, FR-02→AC-13, FR-03→AC-02, FR-04→AC-03, FR-05→AC-04, FR-06→AC-05,
FR-07→AC-06, FR-08→AC-07, FR-09→AC-08, FR-10→AC-09, FR-11→AC-10, FR-12→AC-11;
NFR-01→AC-13/AC-14, NFR-02→AC-12, NFR-03→AC-12, NFR-04→AC-14, NFR-05→AC-14.
No orphan FR, no orphan AC.

### Reality checks performed (claims verified against the codebase)

- `POST /api/v1/kpis` (`router.ts:767`, `handleKpiPost`) + `kpiCreateRequestSchema`
  fields (`name`/`category`/`unit`/`target_value`/`target_direction`/
  `measurement_frequency`/`owner_role`/`domain_id`, `kpi-sla.ts:155-167`) —
  FR-07's field list is accurate.
- `POST /api/v1/risk-register` (`router.ts:646`) + `createRiskSchema`
  (`risk-register.ts:7-23`) — FR-11's field/enum list (`likelihood`/`impact`
  1–5, `status`/`trend`/`risk_type` enums, `linked_entity_*`) is accurate.
- `POST /api/v1/import` → `handleImport`/`realImport` (`router.ts:410`) — FR-03/
  NFR-03 loader path accurate; import is the lifecycle-guarded `{nodes,edges}`
  route, not `ontology/import`.
- `api/src/seed/link-kpi-metric.ts` (`linkKpiToMetric`) already exists — FR-07's
  cardinality-guarded helper reference is real.
- Story labels/edges (`UserStory`/`AcceptanceCriterion` + `DESCRIBES_ACTIVITY`/
  `STORY_FOR_ROLE`/`ACCEPTANCE_OF`) registered in `register-story-labels.ts` —
  FR-09/FR-10 accurate; clause fields owned by `stories.ts` (feeds OQ-2).
- DDD labels/edges (`Capability`/`BoundedContext` + `NEEDS_CAPABILITY`/
  `SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL`) registered in
  `register-capability-labels.ts:61-99`, endpoint pairs match FR-12 exactly;
  `CAPABILITY_IN_MODEL` confirmed **absent** from `LIFECYCLE_EDGES`
  (`model-lifecycle-guard.ts:25-33`), so FR-12's "importable" claim holds.
- `PART_OF [Activity→UserJourney]` and `ALIGNED_TO [KPI→UserJourney/Activity/
  Domain]` present in `EDGE_ENDPOINTS` (`edges.ts:31-43`) — FR-04/FR-08 endpoints
  valid.
- foundation FR-03 (`Product & Delivery` domain, `attributes.seedKey =
  "product_delivery"`, resolved-by-lookup, no hard-coded id) matches FR-01 of
  this spec verbatim — the dependency contract is honoured.
- Risk 5 (foundation `#/business` surface removed by `navigation-ia` commit
  `fb43471`) confirmed real in `saas-metric-library` STATUS.md, and correctly
  assessed here as *not affecting* a no-view spec.

## Summary

- **Solid and unusually well-grounded.** Every external interface this content
  spec leans on — routes, schemas, runtime labels, edge endpoint pairs,
  lifecycle-guard membership, the `link-kpi-metric` helper, the foundation's
  `seedKey` domain contract — was checked against the tree and matches. The
  ownership discipline (no `route.ts`/`SURFACES`/`views/index.tsx`, no KPI/risk/
  story/DDD route-code edits, governed-API data creation) is correct and
  self-asserted via AC-level diff checks.
- **One real gating question, correctly externalized.** OQ-1 (three missing
  canonical metrics) is the only thing that can derail the build, and the spec
  refuses to paper over it — it forbids inventing a `MetricDefinition` and
  routes the decision to the user + the `saas-metric-library` owner. It is a
  design gate (C-01), not a requirements blocker.
- **Do first for the design author:** (1) get the user's OQ-1 decision and, if
  option (a), the three pinned `metric-*` seed ids from `saas-metric-library`;
  (2) enumerate the frozen journey/activity/role/system/story/AC/capability
  rosters (N-03) so AC-02/AC-03 become testable; (3) pin the alignment write to
  `POST /api/v1/kpi-alignments` + its required `weight`/`attribution_type`
  (C-02/C-03); (4) resolve OQ-2 by verifying the story write path against
  `stories.ts` (N-02).
- **No re-review of requirements needed** — approving with C-01..C-03 recorded
  as open concerns for the design author to pin. Pass 2 of the review budget is
  preserved for design.
