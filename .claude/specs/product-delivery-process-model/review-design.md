---
feature: "product-delivery-process-model"
reviewing: "design"
reviewing_revision: 1
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-06"
---

# Review: product-delivery-process-model / design (pass 2/2)

## Verdict

**approve** — the design revision resolves both pass-1 blockers and all four
concerns, and every fix checks out against the tree. The two prior blockers
were a single systemic id-scheme defect (human-readable strings used where the
platform enforces UUIDv7 / requires node-id-not-seedKey resolution); the
revision adopts the retail-mini / metrics.json UUIDv7-id + `attributes.seedKey`
pattern the codebase already uses, pins a concrete id-allocation block
(`018f0200-*`), and switches every roster / resolve / AC to `seedKey`-lookup.
The remaining findings are all non-blocking. Zero blockers, two concerns, two
nits. This is a confirmation pass, not a re-litigation.

## Resolved from pass 1

- **~~B-01~~ → resolved.** Fixture nodes + the bounded context now carry a
  hand-authored UUIDv7 `id` (§3.1.1 `018f0200-*` lanes) plus a human-readable
  `attributes.seedKey`; all §4 rosters, §5.1/§5.4/§5.5/§5.7 resolve steps, and
  every AC now resolve **by `seedKey`**, never by a human-readable string as an
  id. Verified against the enforced constraint: `nodeCreateSchema.id` /
  `edgeCreateSchema.fromId|toId` are `uuidv7` (strict regex,
  `shared/src/schema/nodes.ts:26`, `edges.ts:57-58`), and
  `boundedContextCreateSchema.id` is `z.string().uuid()`
  (`shared/src/schema/ontology.ts:295`) — the design's UUIDv7 assignment satisfies
  all three. The peer pattern (`metrics.json:252` `Deploy Frequency` node id
  `018f0100-…-020` + `seedKey:"metric-deploy-frequency"`) is copied faithfully.
- **~~B-02~~ → resolved.** §5.1 step 4 + §5.3 now resolve each metric's real
  UUIDv7 node id from its `seedKey` before calling `linkKpiToMetric`;
  `PRODUCT_KPI_METRIC_MAP` maps KPI name → metric **seedKey** (not id). Verified:
  `linkKpiToMetric(baseUrl, kpiId, metricId)` POSTs
  `{type:"MEASURES", fromId:kpiId, toId:metricId}` to `POST /api/v1/edges`
  (`api/src/seed/link-kpi-metric.ts`), whose `toId` must be a real node id — the
  design now passes the resolved `018f0100-…-020`, correct.
- **~~C-01~~ → resolved.** §5.7 step 3 makes the `(fromId,type,toId)` pre-check
  load-bearing and drops the false "route dedupes" claim. Verified `createEdge`
  is strict CREATE (409 only on duplicate client `id`) and the cross-ref bodies
  carry no `id`, so the explicit pre-check is genuinely what makes re-run
  net-zero.
- **~~C-02~~ → resolved.** §5.3 pre-checks the MEASURES edge and skips
  `linkKpiToMetric` on re-run; the "second link rejected" assertion is split into
  a dedicated negative test (verified `KpiMetricAlreadyLinkedError` is real,
  `link-kpi-metric.ts`), decoupled from the AC-12 idempotency path.
- **~~C-03~~ → resolved.** §4.5 now pins a concrete `target_value` per KPI
  (20 / 5 / 40 / 8). Verified `kpiCreateRequestSchema` requires both
  `target_value: z.number()` and `target_direction: z.string().min(1)`
  (`shared/src/schema/kpi-sla.ts:159-160`) — the lenient string direction accepts
  the design's `up`/`down`.
- **~~C-04~~ → resolved.** Anchors corrected: `createCapability` at
  `capabilities.ts:281` (verified), the atomic
  `MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)` at `:310` (verified), DDD read at
  `:141`/`:136` (verified), route arms at `api/src/routes/capabilities.ts:50-55`
  and the PUT dispatch (verified `neededBy`/`supportedBy`/`context` handlers).

## Concerns

- **C-05 — Shared System/Role resolution key: the foundation stores the
  idempotency marker as a top-level `operatorSeedKey`, not `attributes.seedKey`.**
  §4.4/§5.1 step 3 say shared systems (`moms`, `data_warehouse`) and shared roles
  resolve "by `attributes.seedKey`". The foundation actually MERGEs shared
  System/Role nodes on a **top-level** `operatorSeedKey` property
  (`api/src/seed/ensure-catalog.ts:42` `MERGE (s:System {operatorSeedKey:$seedKey})`,
  `:71` for roles) and *also* writes the same value as `seedKey` **inside**
  `attributes_json`. So a `JSON.parse(attributes_json).seedKey === "moms"` TS-side
  filter (the shape §5.1 already uses for the domain/metric resolves) **does**
  resolve them — the design is functionally correct — but the wording "by
  `attributes.seedKey`" is imprecise and a tasks author could mistakenly try to
  MERGE/MATCH on a top-level `seedKey` property that does not exist (the top-level
  key is `operatorSeedKey`). Recommend: state in §5.1 step 3 that shared catalog
  nodes are resolved either by the top-level `operatorSeedKey` marker **or** by a
  TS-side `JSON.parse(attributes_json).seedKey` filter (both carry the same
  value), and note the top-level property is `operatorSeedKey`, not `seedKey`, so
  the resolve query targets the right field. Verified values: `moms` /
  `data_warehouse` exist with exactly those seedKeys
  (`api/src/seed/saas-operator-catalog.ts:45,49`).

- **C-06 — The §5.7 pre-check Cypher uses a parameterized relationship type,
  which Neo4j rejects.** §5.7 step 3 and the §5.3 MEASURES pre-check are written
  as `MATCH (a {id:$fromId})-[r:$type]->(b {id:$toId})`. Neo4j does **not**
  support a parameterized relationship type in a `MATCH` pattern (`[r:$type]` is a
  syntax error without APOC). The existing seed helpers avoid this by hardcoding
  the type per edge (e.g. `link-kpi-metric.ts` writes `[m:MEASURES]` literally).
  This is an implementation detail, not an architectural flaw — but because §5.7
  presents the pre-check as the load-bearing idempotency guard for **every**
  cross-ref edge, the tasks author needs to know each pre-check must be written
  with the literal edge type (one query per edge type: `[:PART_OF]`,
  `[:EXECUTES]`, `[:USES_SYSTEM]`, `[:MEASURES]`), not a single parameterized
  query. Recommend a one-line note in §5.7 that the pre-check type is a literal,
  not a param. (Landable in tasks; does not change the design decision.)

## Nits

- **N-04 — §4.3 ignores the available shared `product_lead` role.** The
  foundation's shared Role catalog contains `product_lead` ("Product Lead") and
  `product_owner` ("Product Function Owner")
  (`api/src/seed/saas-operator-catalog.ts:62,72`). §4.3 creates three slice-local
  product roles (`Product Manager`, `Release Engineer`, `Product Analyst`) that
  conceptually overlap with `Product Lead` and never reference the shared role.
  FR-05 permits function-specific slice-local roles, so this is not a defect —
  but resolving `Product Lead` from the shared catalog for the roadmap/spec
  activities (instead of a fresh `Product Manager`) would honor FR-05's
  "resolve-shared-before-create" intent more closely. Optional. (The design's
  `Software Engineer → resolve-or-create pd-role-swe` hedge is correct: verified
  no generic `Software Engineer` exists in the shared catalog, so it falls back to
  slice-local as designed.)

- **N-05 — §4.5 KPI `target_direction` values (`up`/`down`) differ from the
  richer SLA enum.** `kpiCreateRequestSchema.target_direction` is a lenient
  `z.string().min(1)` (verified `kpi-sla.ts:160`), so `up`/`down` pass. But a
  sibling schema (`slaCreateSchema.target_direction`) uses
  `higher_is_better`/`lower_is_better`/`target_is_exact` (`kpi-sla.ts:14`). Not a
  bug — the KPI create route is intentionally lenient (as-built DD-03) — but the
  tasks author should not accidentally reuse the SLA enum for the KPI body.
  Cosmetic.

## Completeness / Traceability

Every FR and AC maps to a design section and the coverage is complete; the
pass-1 blockers were correctness defects inside covered sections and are now
fixed. Independent verification confirms the design's factual claims.

| FR / AC | Design coverage | Verified | Notes |
|---------|-----------------|----------|-------|
| FR-01 scope / resolve-by-lookup / fail-fast | §5.1, §5.7 | ✔ domain resolve mirrors `ensure-function-domains.ts` (TS-side `JSON.parse` filter, no APOC) | strong |
| FR-02 mapping table | §8 | ✔ every label/edge exists (§7) | — |
| FR-03 journeys | §3.1, §4.1, §5.7 | ✔ UUIDv7 + seedKey (B-01 fixed) | — |
| FR-04 activities / PRECEDES | §3.1, §4.2 | ✔ UUIDv7 + seedKey; PRECEDES chain by seedKey | — |
| FR-05 roles EXECUTES | §3.1, §4.3, §5.7 | ✔ resolve-or-create; shared catalog verified | C-05 (resolve key), N-04 (product_lead) |
| FR-06 systems USES_SYSTEM | §3.1, §4.4, §5.7 | ✔ `moms`/`data_warehouse` seedKeys real; systemKind enum valid | C-05 (resolve key) |
| FR-07 KPIs MEASURES metric | §4.5, §5.2, §5.3 | ✔ seedKey→node-id resolve (B-02 fixed); target_value pinned (C-03 fixed) | C-06 (literal rel type) |
| FR-08 ALIGNED_TO + domain_id | §5.2, §5.3 | ✔ `kpiAlignmentCreateRequestSchema` weight/attribution/target_type incl. `domain` verified (`kpi-sla.ts:193-198`); `domain_id` optional (`:166`) | — |
| FR-09 stories | §3.2, §4.6, §5.4 | ✔ `createStory` (`stories.ts:307`) sets top-level persona/action/benefit/narrative | strong |
| FR-10 ACs | §4.6, §5.4 | ✔ AC route + top-level given/when/then | — |
| FR-11 risks | §4.8, §5.6 | ✔ `createRiskSchema` private (`risk-register.ts:7`), linked_entity optional (`:19-20`) | — |
| FR-12 DDD | §3.2, §4.7, §5.5 | ✔ createCapability atomic membership (`:281`/`:310`); route arms (`:50-55`); bc id UUIDv7 (B-01 fixed) | — |
| NFR-01 no schema/label/edge | §7, §8, §11 | ✔ MEASURES registered by metric-library (`ensure-measures-edge.ts`); all labels pre-registered | — |
| NFR-02 idempotency / retail isolation | §5.1–5.7 | ✔ edge pre-check load-bearing (C-01 fixed); MEASURES re-run guarded (C-02 fixed) | C-06 (rel-type literal) |
| NFR-03 lifecycle-clean fixture | §3.1, §5.7 | ✔ no lifecycle rows; loader throws-on-per-row-error verified (`seed-saas-operator.ts:44-62`) | UUIDv7 fix unblocks the load |
| NFR-04 ownership | §5, §6, §11 | ✔ File-Changes + "NOT edited" list correct; XD-05 route files untouched | — |
| NFR-05 house rules | §5, §6, §7 | ✔ loopback, zod-only, `/api/v1/`, central-gate auth | — |
| OQ-1 → OQ-1' | §2, §2.2, §5.3 | ✔ deferral sound; single-map-constant flip; surfaced to user | non-blocking |
| OQ-2 story path | §5.4 | ✔ governed route confirmed | resolved |
| OQ-3 seed-step wiring | §5.1, §5.7, §9 | ✔ sibling CLI; dir-loader zero-edit verified | resolved |
| OQ-4 risk linking | §5.6 | ✔ linked_entity optional strings | resolved |

**What is done well.** The revision landed both blockers and all four concerns
in a single pass, exactly on the pass-1 recommendation. The id-scheme fix is not
a patch — it correctly reproduces the retail-mini / metrics.json
`UUIDv7-id + seedKey-attribute` pattern (pinned `018f0200-*` allocation lanes,
seedKey as the stable lookup contract), and the metric-node-id resolution now
matches how the foundation resolves its own catalog. The deviations register
(D-1/D-2/D-3) remains accurate against the tree, the OQ-1' deferral behind a
single `PRODUCT_KPI_METRIC_MAP` constant keeps the single-shot build
deterministic, and the AC-13/AC-14 ownership-diff self-checks are exemplary. The
two residual concerns (C-05 resolve-key wording, C-06 literal relationship type)
are implementation clarifications the tasks author can land without another
design revision.

## Re-review budget

This is pass 2 of 2 — the confirmation pass. Both pass-1 blockers and all four
concerns are resolved and verified. C-05 and C-06 are non-blocking clarifications
best folded into the tasks (each is a one-line note or a per-edge-type query);
they do not warrant a third design pass. Approved to proceed to tasks.
