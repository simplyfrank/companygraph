---
feature: "customer-success-process-model"
reviewing: "design"
artifact: "design.md (revision 1, against requirements revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of at most 2"
---

# Design Review: customer-success-process-model

## Summary

This is a **content/seed-slice design** that composes entirely against as-built,
owned-elsewhere interfaces — no new route, store, schema array, RBAC permission,
or view. Its correctness therefore rests almost entirely on whether the
interfaces it targets exist and behave as claimed. I verified **every**
load-bearing interface claim against the live tree, and the design is
exceptionally accurate: file paths, line numbers, schema field names, error
codes, seed ids, and even the subtle `operatorSeedKey` (top-level MERGE key) vs
`seedKey` (inside `attributes_json`) distinction all check out. Full FR/AC
traceability is present. No blockers. Two concerns and three nits, all
addressable in-line.

### Interface claims verified against live code

| Design claim | Verified |
|--------------|----------|
| `linkKpiToMetric(baseUrl, kpiId, metricId)` exported, pre-checks cardinality via `MATCH (k:KPI {id})-[m:MEASURES]->() RETURN count(m)`, throws `KpiMetricAlreadyLinkedError` (`code:"kpi_metric_already_linked"`, `httpStatus:409`) | `api/src/seed/link-kpi-metric.ts` — exact match; helper comment even pins "content specs IMPORT this helper" |
| `seedSla(SlaSeedRow)` / `seedRisk(RiskSeedRow)` are plain POSTs, no dedup; **no** `seedKpi` | `api/src/seed/governed-seed-helper.ts:57,95,101` — confirmed; `SlaSeedRow = z.input<slaCreateRequestSchema>` |
| `handleKpiPost` does `CREATE (k:KPI …)` (no MERGE), `generateId()` UUIDv7 | `api/src/routes/kpi-crud.ts:43,51` — confirmed |
| Four retention metric ids NRR/GRR/Logo/Revenue Churn = `018f0100-…-000000000006..9` | `shared/seed/saas-metric-library/metrics.json` — exact ids + names match |
| `OPERATOR_ROOT_MARKER = "saasOperatorRoot"`; root resolved by `name:"SaaS Operator"` + attribute filter in TS | `api/src/seed/ensure-operator-root.ts:18-19` — confirmed |
| CS domain resolved by `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel{id}) RETURN d`, filter TS on `attrs.seedKey === "customer_success"` | `api/src/seed/ensure-function-domains.ts:25,48` — foundation resolves it identically |
| Shared catalog nodes carry **top-level** `operatorSeedKey`; `MATCH (s:System {operatorSeedKey:$k})` is valid | `api/src/seed/ensure-catalog.ts:42,71` — confirmed; `seedKey` lives in `attributes_json` (cannot MERGE on it) |
| `POST /api/v1/query/cypher` (`handleCypher`) takes `{statement, params}`, returns `{rows}`, read-only via `runPassthrough` | `api/src/routes/query.ts:144-159` — confirmed |
| `storyCreateSchema` = `{persona, action, benefit, activityId, roleId?}`, `.strict()`, **no `title`** | `shared/src/schema/story-spec.ts:22-33` — confirmed |
| `acCreateSchema` = `{given, when, then}`; story scope guard `404 story_activity_not_in_model` via `scopedNodeIds` | `story-spec.ts:59`; `api/src/storage/stories.ts:161`, `model-scope.ts` — confirmed |
| `neededBySchema` requires **exactly one** of `{activityId, storyId}` (`.refine`); `supportedBySchema`={systemId}; `contextAssignSchema`={boundedContextId} | `shared/src/schema/ddd-system.ts:100-120` — confirmed |
| `createRiskSchema.domain` is `z.string().min(1)` free-text; `GET /api/v1/risk-register?domain=` filter exists | `api/src/routes/risk-register.ts:10,47` — confirmed |
| `GET /api/v1/slas` (`handleSlaList`) exists | `api/src/routes/sla-crud.ts:96` — confirmed |
| `ensureMeasuresEdgeType` registers `MEASURES` via **runtime** edge-type registry, `∉ LIFECYCLE_EDGES` | `api/src/seed/ensure-measures-edge.ts` — confirmed |
| `realImport` pre-scans + rejects lifecycle rows `409 model_lifecycle_route_required` writing nothing; validates edge endpoints; `edgeCreateSchema` uuidv7 fromId/toId | `api/src/routes/import.ts:12,163-254` — confirmed |
| Referenced error codes (`model_lifecycle_route_required`, `story_activity_not_in_model`, `story_activity_required`, `acceptance_criterion_clause_required`, `edge_endpoint_label_mismatch`) all exist | grep across `api/src` — all present |
| `systemKind` is a **required** registry attribute on `System` (fixture must carry it) | `shared/src/schema/system-kind.ts:30`; design §4.2 carries `systemKind:"functional"` — correct |

## Findings

### Blockers

None.

### Concerns

**C-01 — OQ-1 is flagged BLOCKING but the design is fully buildable without it;
the "blocking" label risks stalling the pipeline unnecessarily.**
The design surfaces OQ-1 (health/CSAT/ticket-SLA metrics absent from the metric
library) to the orchestrator as the sole BLOCKING open question (§10, §2 C-06).
But the design *itself* resolves the blocker for build purposes: it **pins**
FR-05/FR-06 to the four existing retention metrics, freezes that roster (§4.4),
and makes the three CS-specific KPIs a **conditional arm** the seed step
authors *iff* the metrics exist (§4.3) — with AC-07 asserting the deferred arm
otherwise. In other words, the tasks phase and implementation can proceed to
completion on the four-metric roster with zero dependency on OQ-1's answer. The
only thing OQ-1 gates is *whether three additional KPIs get authored*, which is
an amendment owned by `saas-metric-library`, not this spec.
*Recommendation:* keep OQ-1 surfaced to the user (correct — it's a real
cross-spec product decision), but **downgrade its effect on this spec from
"BLOCKING (design cannot finalize)" to "non-blocking for this spec's build; the
conditional arm covers both outcomes."** Otherwise the orchestrator may hold the
whole slice waiting on a decision that only adds three optional KPIs. Nothing in
§4/§8/§9 actually needs OQ-1 resolved to land.

**C-02 — The conditional-KPI arm reads `MATCH (m:MetricDefinition {name:$n})`
but the three metric names/ids are undefined, so AC-07's "authored" branch is
untestable and the seed step's behavior on partial publication is unspecified.**
§4.3 says the step authors the three CS KPIs "iff `saas-metric-library`
publishes `metric-health-score`/`metric-csat`/`metric-ticket-sla-compliance`
(their fixed ids TBD by that spec)" and looks them up by `name`. But (a) the
metric *names* it will `MATCH` on are not stated (the roster uses display names
like "NRR", not seedKeys — would the lookup be on `name:"Health Score"`? on
`attributes.seedKey`?), and (b) the behavior if **one or two** of the three
exist (partial publication) is undefined — does it author the subset or treat it
as all-or-nothing? As written, only the "deferred/absent" branch of AC-07 is
concretely testable today.
*Recommendation:* in §4.3, state the exact lookup predicate for the conditional
metrics (mirror the retention-metric convention — lookup on `attributes.seedKey`
since seedKeys are the stable contract, not display names), and specify the
partial-publication behavior (recommend: author each of the three independently
based on its own metric's presence, so the arm is per-metric not all-or-nothing;
AC-07 then asserts per-metric). This keeps the conditional arm fully specified
for the tasks phase without reopening OQ-1.

### Nits

**N-01 — §2.1 and the mapping table reference the alignment lookup imprecisely.**
The §5.1 SLA idempotency guard uses `GET /api/v1/slas` filtered "on `name`" in
TS. `handleSlaList` supports only `?include_archived` (verified
`sla-crud.ts:96-97`) — there is no server-side `name` filter, so the guard
fetches the full list and filters client-side. That is fine and matches the
design's intent, but "lookup-by-`name` against `GET /api/v1/slas`" could be read
as a query param. *Recommendation:* add "(client-side filter; the list route has
no `name` query param)" to the §5.1 SLA row and §4.4a for precision.

**N-02 — §2 resolution table mislabels OQ-2's arm as "(OQ-2 a)".** §4.3's
cardinality note is tagged "(OQ-2 a)" but the KPI↔metric single-link cardinality
is `saas-metric-library`'s OQ-2 option (a), not this spec's OQ-2 (which is the
risk `domain` key convention). This is a cross-reference collision between two
specs' OQ-2. *Recommendation:* disambiguate as "(`saas-metric-library` OQ-2 a)"
to avoid confusion with this spec's own OQ-2 in §10.

**N-03 — §4.5 story idempotency key changed from requirements' "title-per-
activity" to `(persona, action, benefit)` without an explicit note.**
Requirements OQ-3(d)/NFR-02 say "title-per-activity", but the story schema has
**no `title`** field (correctly discovered by the design, §2.1). The design
silently substitutes `(persona, action, benefit)` per `DESCRIBES_ACTIVITY`
activity — which is the *right* key given no title exists. *Recommendation:* add
one sentence in §5.1 noting this key supersedes requirements' "title-per-
activity" wording precisely because there is no `title` field (so the tasks
reviewer doesn't flag it as drift).

## Completeness / Traceability

Every FR maps to a design element and at least one AC; every AC is closed by a
File-Changes test artifact. House rules and blueprint XD-* all honored.

| FR | Design section | ACs | Status |
|----|---------------|-----|--------|
| FR-01 five journeys | §3.2, §4.2 | AC-01, AC-12, AC-13 | covered |
| FR-02 activities + PRECEDES | §4.2 | AC-02 | covered (roster design-frozen, set-equality asserted) |
| FR-03 roles EXECUTES | §3.2, §4.2 | AC-03 | covered (shared vs CS-specific split correct) |
| FR-04 systems USES_SYSTEM | §3.2, §4.2 | AC-04 | covered (`systemKind` required-attr handled) |
| FR-05 KPIs via POST /kpis | §4.3, §5.1 | AC-05, AC-07 | covered; conditional arm underspecified → C-02 |
| FR-06 MEASURES via linkKpiToMetric | §4.3 | AC-06 | covered (C-05 resolved: helper, not raw POST) |
| FR-07 metric-library gap (OQ-1) | §4.3 cond. arm, §10 | AC-07 | covered; blocking-status → C-01, testability → C-02 |
| FR-08 stories + ACs | §4.5, §2.1 | AC-08 | covered (no-title correctly handled) |
| FR-09 SLA create | §4.4a, §5.1 | AC-09 | covered (seedSla + own guard, B-03) |
| FR-10 SLA alignment (should) | §4.4b | AC-16 | covered (split so deferral won't red AC-09) |
| FR-11 risks | §4.6, §5.1 | AC-10 | covered (domain="Customer Success" convention, OQ-2) |
| FR-12 DDD mapping (should) | §4.7 | AC-11 | covered (context arm degrades gracefully if none seeded) |
| FR-13 mapping table | §4.8 | AC-14 | covered (label/edge + route + error code per row — AC-14 gate met) |
| FR-14 seed slice + step | §4.1, §7, §9 | AC-12, AC-13, AC-15 | covered |
| FR-15 seed-preamble id resolution | §4.1 | AC-08, AC-11 | covered (mirrors foundation lookups exactly) |
| NFR-01 no new store/labels | §3, §9 | AC-07, AC-15 | covered |
| NFR-02 idempotency + retail isolation | §4.1, §5.1 | AC-01/03/04/05/09/10/13 | covered (four feature-owned guards named, B-03) |
| NFR-03 ownership boundaries | §9 | AC-09/10/11/15/16 | covered (explicit NOT-edited list is thorough) |
| NFR-04 house rules | §5.2, §6 | AC-15 | covered (zero new zod at REST boundary, zero new permission/error code) |
| NFR-05 no PWA surface | §9 | AC-15 | covered (no `pwa/` file) |

**Prior-review carry-through (verified resolved in this design):**
`~~C-05~~ → resolved` (adopts `linkKpiToMetric`, verified exported).
`~~C-06~~ → resolved` (OQ-1 surfaced + roster pinned; residual = C-01/C-02 here).
`~~OQ-2..OQ-6~~ → resolved` (all closed in §2 with defensible choices).
B-01/B-02/B-03 from the requirements review are structurally handled by FR-15 +
the feature-owned guards, and the design's §2.1 verification proves B-02 "holds
by construction" against the real `scopedNodeIds`.

## What's done well

- The §2.1 interface-verification block is not decoration — every line I spot-
  checked against the tree was accurate to the line number, including the
  non-obvious `operatorSeedKey`-vs-`seedKey` storage split that a less careful
  design would have gotten wrong (and which would have made the shared-catalog
  resolution query silently return nothing).
- The mapping table (§4.8) satisfies AC-14's strengthened gate: every row names
  label/edge **and** route/API **and** the error code on the failure/idempotency
  path.
- Ownership discipline (§9 "Explicitly NOT edited") is exhaustive and matches
  XD-04/XD-05/XD-08 exactly; the File-Changes surface is confined to the fixture,
  one seed script (+ optional co-located catalog), `package.json`, and this
  spec's own tests.
- The two-run-modes note (§4.1) correctly distinguishes the foundation-loader
  path (process content only) from the full `seed:customer-success` step.

## Verdict

**approve.** Zero blockers. The design is buildable as-is against verified
interfaces with full FR/AC traceability. C-01 (OQ-1 blocking-status) and C-02
(conditional-KPI arm testability) should be addressed — ideally folded into the
tasks phase rather than triggering a design re-review, since neither blocks
implementation of the pinned four-metric roster. Recommend the author tighten
C-02's conditional-arm predicate in §4.3 and re-frame OQ-1 (C-01) as
non-blocking-for-this-spec before tasks authoring.
