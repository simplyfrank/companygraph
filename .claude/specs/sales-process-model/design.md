---
feature: "sales-process-model"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
size: "medium"
---

<!-- The File Changes table (§9) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

<!-- N-01 (house rule): this design uses MEASURES (never "INSTANTIATE") for the
     KPI→MetricDefinition edge throughout, per XD-06-erratum. -->

# Design: sales-process-model

## 1. Overview

`sales-process-model` is a **wave-2 content spec** of the SaaS-Operator
fan-out (blueprint `.claude/specs/blueprint-saas-operator.md`), depending on
`saas-operator-foundation` (wave 1a), `saas-metric-library` and
`funnel-pipeline-modeling` (wave 1b). It authors the **Sales function** of the
docorg SaaS operator at **full-pipeline depth** (XD-10) as **content** under the
existing "SaaS Operator" `BusinessModel` root. It builds **no machinery** — no
new label, edge type, REST route, PWA view, or PWA route (NFR-01).

It ships exactly **three owned artifacts** (plus this spec's own tests):

1. **A self-contained seed slice** `shared/seed/saas-operator/sales.json` — a
   `{nodes,edges}` fixture the foundation's directory-iterating loader discovers
   and imports through the guarded `POST /api/v1/import` (`realImport`). It holds
   **only** the Sales nodes and intra-slice edges that need no server-generated
   foreign id: `UserJourney`, `Activity` (with `PRECEDES`), function-specific
   `Role`, function-specific `System`, and `KPI` rows, plus intra-slice
   `PART_OF`/`PRECEDES`/`EXECUTES`/`USES_SYSTEM`/alignment edges whose **both**
   endpoints are stable-id fixture nodes.
2. **A feature-owned resolver** `api/scripts/seed-sales.ts`, wired
   `bun run seed:sales` — a self-owned sibling of `api/scripts/seed-saas-metric-library.ts`
   (which it does **not** edit). It resolves foundation/library ids by
   `seedKey`/name at runtime and, through the dependencies' **existing governed
   write paths**, creates every id-referencing cross-reference edge, every
   invariant-bearing construct (`MEASURES`, `Funnel`/`Stage`/`CONVERTS_TO`,
   stories/ACs, capabilities), and the Sales risk rows.
3. **The business-action → label/edge mapping table** (XD-10, FR-13) — delivered
   in `requirements.md` and audited by AC-14.

**The authoring split is the spine of this design.** The foundation loader
**throws on any per-row `errors[]`** (verified, `seed-saas-operator.ts:66-68` —
the `errors[]` throw; the `!res.ok` throw is at `:62-64`, N-01), so a single
import row referencing an id that only exists at runtime (a foundation-seeded
domain/system/role, a library metric, the operator root) would abort the whole
`seed:saas-operator` run. Therefore **every id-referencing edge and every
governed-invariant write is created by the resolver, never by `sales.json`.** §3
pins which rows live where; §4 pins how the resolver writes each one.

**Execution preconditions (NFR-06, B-01).** This is a **wave-2 content spec** and
its *execution* — not its design approval — is gated on two upstream subsystems
being **executed** (not merely spec-approved), because the resolver writes ride
their runtime constructs and routes:

1. **`saas-metric-library` executed** — the `MEASURES` edge type is registered and
   the `metric-win-rate` / `metric-pipeline-conversion` `MetricDefinition`s are
   seeded, and `linkKpiToMetric` is present. Verified `execution:complete`.
2. **`funnel-pipeline-modeling` executed** — the `Funnel` / `Stage` runtime labels
   and the `HAS_STAGE` / `CONVERTS_TO` edge types are registered, **and** the
   `POST /api/v1/funnels/transitions` route + its `rbac-permissions` mapping are
   live. **Currently `execution:blocked` upstream** (its T-08 step-1 /
   dependency-ordering guard fails on `dev` — the foundation `#/business`
   `funnels:` surface seam it needs is absent). Until this subsystem is executed,
   `POST /api/v1/nodes/Funnel` returns `unknown_label`,
   `POST /api/v1/edges {type:"HAS_STAGE"}` returns `edge_endpoint_label_mismatch`,
   and `POST /api/v1/funnels/transitions` 404s. **The `funnel()` step of this
   spec's resolver (§4.6) therefore cannot run, and AC-07/AC-08 cannot pass, until
   `funnel-pipeline-modeling` is unblocked and executed.** This design references
   the *planned* interface correctly (`funnel-pipeline-modeling/design.md` Rule D /
   §4.5); it names that subsystem's **execution** as a hard precondition here so
   the CI/test harness ordering (§8) is unambiguous and a premature `seed:sales`
   run fails loudly (§4.6) rather than half-writing the funnel.

   > **Orchestrator note (B-01):** this spec's design can be approved now; its
   > *execution* must be sequenced after `funnel-pipeline-modeling` is unblocked
   > and executed — exactly as `MEASURES` execution is sequenced after
   > `saas-metric-library`. This is a build-ordering gate, not a design defect.

**The seed sequence (NFR-06).** The full Sales subgraph is produced by four
executed subsystems / entrypoints run **in order**:

```
funnel-pipeline-modeling   → (executed upstream) registers Funnel/Stage labels, HAS_STAGE/CONVERTS_TO edges, POST /api/v1/funnels/transitions route
seed:saas-metric-library   → registers MEASURES + seeds MetricDefinitions (win-rate, pipeline-conversion, …)
seed:saas-operator         → ensures Sales domain / CRM / MOMS / sales_lead role + imports the id-free sales.json
seed:sales                 → resolves ids + asserts funnel subsystem present, then writes every cross-reference edge, MEASURES/funnel/story/capability, and risk row
```

`seed:sales` fails loudly (non-zero exit) if a required foundation/library id
cannot be resolved **or if the `Funnel` label / `funnels/transitions` route are
absent** (§4.4, §4.6) — the signal that an earlier step (or the funnel subsystem)
did not run (AC-16).

The design follows five rules:

- **Rule A — compose, never fork.** Every write rides an as-built or wave-1
  governed path: `realImport` for the fixture; `POST /api/v1/edges` for
  cross-reference graph edges; `linkKpiToMetric` for `MEASURES`; the funnel
  transition route for `CONVERTS_TO`; the model-scoped story/AC routes; the DDD
  capability routes; the `kpi-alignments`/`param-bindings` routes; the governed
  `seedRisk` helper. **No** new storage primitive, **no** compile-time
  `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` entry, **no** new runtime registry
  label/edge, **no** new REST route (NFR-01).
- **Rule B — id-free fixture, resolver for everything else.** `sales.json`
  carries only self-contained nodes + intra-slice edges (both endpoints
  stable-id fixture nodes). Every edge whose endpoint is a resolved foreign id,
  and every governed-invariant construct, is a resolver write (B-01).
- **Rule C — governed invariants only through governed routes.** `MEASURES`
  (at-most-one), `CONVERTS_TO` (`[0,1]` range), stories (narrative + scope
  check), ACs (Given/When/Then), capabilities (authoritative `CAPABILITY_IN_MODEL`)
  are created **only** through the owning spec's route that enforces the
  invariant — never as raw import rows (B-02).
- **Rule D — funnel anchored by `attributes.modelId` = operator root id.** Per
  `funnel-pipeline-modeling/design.md` Rule D / §4.5 (approved), the FR-09
  listing scopes on a funnel-carried `attributes.modelId` marker — there is **no**
  reachability edge. The resolver stamps the resolved operator-root id into the
  funnel's `modelId`. The stale reachability-edge disjunct from requirements
  FR-07 is **closed** here (Resolves review C-01).
- **Rule E — owned-elsewhere code is never edited.** No edit to `route.ts` /
  `SURFACES` / `views/index.tsx` (XD-05), the foundation loader / `ensure-*` /
  catalog modules, `seed-saas-metric-library.ts`, any funnel/metric/story/DDD/KPI
  route or storage, or any risk/SLA/change/compliance code (XD-04). The
  resolver **calls** `linkKpiToMetric`, `seedRisk`, and the governed routes; it
  **imports** them read-only, it does not modify them.

## 2. Prior-review concerns — resolution in this design

Requirements are approved at rev 1 (`review-requirements.md`, pass 2/2, verdict
`approve`). Two concerns travel into design:

| Finding | Resolution | Section |
|---------|-----------|---------|
| **C-01** — FR-07/AC-07's funnel-anchor mechanism listed a stale disjunct ("a `modelId` attribute **or** an authored reachability edge") that `funnel-pipeline-modeling`'s approved design has foreclosed (its FR-09 listing scopes only on `attributes.modelId`; the `PART_OF`/reachability branch is rejected, `funnel-pipeline-modeling/design.md:74,681`) | **Pinned to `attributes.modelId` = the resolved operator-root id.** The resolver creates the `Funnel` node with `attributes.modelId` set to the operator root id it resolves at seed time (§4.6); the reachability-edge alternative is dropped. This matches `funnel-pipeline-modeling` §4.5's listing Cypher (`WHERE f.attributes_json CONTAINS $rootIdNeedle` + client-side `modelId===rootId` filter). AC-07 asserts the funnel is returned by that actual listing for the operator root and excluded for retail Model #1. | §4.6, §8 (AC-07) |
| **C-02** — OQ-2 (three named KPIs lack a canonical `MetricDefinition`) is the sole user decision; it gates FR-05b and introduces an off-graph upstream dependency edge | **Design-conditional, not design-blocking.** FR-05a (win-rate, pipeline-conversion) is built unconditionally against the two present metrics. FR-05b's three KPIs (sales-cycle, ACV, quota-attainment) are authored **only if** `saas-metric-library` has seeded `metric-sales-cycle`/`metric-acv`/`metric-quota-attainment`; the resolver **detects presence by a catalog lookup** (§4.5) and skips the FR-05b KPIs if absent, so **no ungrounded KPI is ever authored** (AC-05a). The user decision (add the three metrics vs. defer) does not block this design; it only widens or narrows the seeded KPI set. Recorded as a live gate item (§10 Open items). | §4.5, §8 (AC-05a) |

## 2.1 Deviations Register

Two requirements citations name a write path more loosely than the as-built
router. The design cannot edit `requirements.md`; each divergence is recorded
here for the orchestrator to land as a requirements-errata note. Neither changes
an FR's intent — only the concrete endpoint the resolver targets.

**Doc-consistency resolution (C-04).** To avoid `requirements.md` and `design.md`
reading as contradictory at tasks time, this design **treats the requirements
text as the looser superset**: FR-06's "`ALIGNED_TO` … and/or `PARAM_BINDS`" and
FR-12's "`POST /api/v1/risk-register` … governed-API seed helper" are **satisfied
by** the concrete endpoints named below (`POST /api/v1/kpi-alignments` for
`ALIGNED_TO`; `seedRisk`→`POST /api/v1/risk-register` for risks) — the requirements
name the family, the design names the member. **Recommended orchestrator action:**
land D-1/D-2 as a one-line errata note in `requirements.md` (pointing FR-06/FR-12
at these concrete routes) within the review budget; this is a documentation
alignment, not an FR change, and does not require a requirements re-review pass.
Absent that errata, the superset reading above keeps the two artifacts
non-contradictory.

| # | Requirements text | As-built route (verified) | This design |
|---|-------------------|---------------------------|-------------|
| D-1 | FR-06 says each Sales KPI is bound to structure "via the existing KPI alignment edges `ALIGNED_TO` … and/or `PARAM_BINDS`" and cites `kpi-measurement-alignment` — without naming the concrete route | The `ALIGNED_TO` write path is **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema`: `{kpi_id, target_type: "journey"|"activity"|"domain", target_id, weight ∈ [0,1]}`, `api/src/routes/kpi-sla-alignment.ts:25,53`; mapped `kpi:write`, `rbac-permissions.ts:229`). The `PARAM_BINDS` path is **`POST /api/v1/kpis/:id/param-bindings`** (`rbac-permissions.ts:245`). Both create the edge server-side — a **raw `PARAM_BINDS`/`ALIGNED_TO` import row is not the sanctioned path** | The resolver creates **every** KPI alignment via `POST /api/v1/kpi-alignments` — `target_type:"domain"` for KPI→Sales-domain (the id-referencing case) **and** `target_type:"journey"\|"activity"` for the fully-in-slice journey/activity case (Resolves C-01). The route accepts all three `target_type`s and enforces `weight ∈ [0,1]` + a target-exists check server-side, so no `ALIGNED_TO` edge is authored as a raw fixture row — matching the Rule-C discipline applied to `MEASURES`/`CONVERTS_TO`/stories. AC-06 asserts each KPI has ≥1 `ALIGNED_TO` edge, all route-written |
| D-2 | FR-12 names `POST /api/v1/risk-register` and the "foundation's governed-API seed helper (`saas-operator-foundation` FR-06)" | The helper is `seedRisk(row: RiskSeedRow)` in `api/src/seed/governed-seed-helper.ts` (verified present), which POSTs the hand-constructed object literal to `POST /api/v1/risk-register` (`risk:write`). `RiskSeedRow` = `{name, owner, domain, likelihood 1-5, impact 1-5, status, trend, description?, mitigation_plan?, category?, risk_type?, linked_entity_type?, linked_entity_id?}` | The resolver imports `seedRisk` and calls it per Sales risk (§4.8). It does **not** re-declare the risk body schema; the route's own re-parse (`createRiskSchema`, `risk-register.ts:7`) is the validation contract |

## 3. Data model — the authoring split (Rule B, B-01)

This spec adds **no** compile-time or runtime schema. Every node/edge uses an
existing label/edge (core `NODE_LABELS`/`EDGE_TYPES` for the process core; the
wave-1 runtime-registered `MetricDefinition`/`Funnel`/`Stage`/`UserStory`/
`AcceptanceCriterion`/`Capability` labels and `MEASURES`/`HAS_STAGE`/
`CONVERTS_TO`/`DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF`/
`NEEDS_CAPABILITY`/`SUPPORTED_BY`/`CAPABILITY_IN_MODEL` edge types).

### 3.1 What lives in `sales.json` (self-contained fixture rows)

Node rows (each carries the standard envelope `id` = stable UUIDv7, `name`,
`description`, `attributes`):

| Label | Rows | Notes |
|-------|------|-------|
| `UserJourney` | 5 pipeline-stage journeys (§4.1) | id-free; `PART_OF`→Sales domain is a **resolver** edge (id-referencing) |
| `Activity` | the pipeline steps (§4.2) | intra-slice `PART_OF`→journey + `PRECEDES` are fixture edges (both endpoints in-slice) |
| `Role` | function-specific Sales roles: Account Executive, Sales Development Rep, Sales Engineer, Deal Desk (§4.3) | the shared `sales_lead` role is **not** re-created (foundation-owned) |
| `System` | function-specific systems: **CPQ** (non-optional, FR-04/FR-11) and **E-Signature** (§4.4) | CRM/MOMS are **not** re-created (foundation-shared) |
| `KPI` | the FR-05a KPIs (win-rate, pipeline-conversion) + FR-05b KPIs (conditional, §4.5) | KPI attribute envelope matches `commercial-domain.json` (§3.3) |

Intra-slice edge rows (both endpoints are stable-id fixture nodes):

| Edge type | From → To | FR |
|-----------|-----------|----|
| `PART_OF` | `Activity` → in-slice `UserJourney` | FR-02 |
| `PRECEDES` | `Activity` → `Activity` (same journey) | FR-02 |
| `EXECUTES` | function-specific `Role` → `Activity` | FR-03 |
| `USES_SYSTEM` | `Activity` → in-slice `System` (CPQ, E-Signature) | FR-04 |

`ALIGNED_TO` is **not** a fixture edge (Resolves C-01): **all** KPI alignment —
including the fully-in-slice `KPI`→`UserJourney`/`Activity` case — is written by
the resolver via `POST /api/v1/kpi-alignments` so every alignment goes through the
route's `target_type`/`weight ∈ [0,1]`/target-exists enforcement (Rule C
discipline), never a raw fixture row. See §4.7.

### 3.2 What the resolver creates (id-referencing edges + governed invariants)

| Construct | Write path | FR | Why not a fixture row |
|-----------|-----------|----|-----------------------|
| `PART_OF` `UserJourney`→Sales `Domain` | `POST /api/v1/edges` | FR-01 | domain id is server-generated (foundation) |
| `EXECUTES` shared `sales_lead` `Role`→`Activity` | `POST /api/v1/edges` | FR-03 | role id is server-generated (foundation) |
| `USES_SYSTEM` `Activity`→CRM/MOMS `System` | `POST /api/v1/edges` | FR-04 | CRM/MOMS ids are server-generated (foundation) |
| `MEASURES` `KPI`→`MetricDefinition` | `linkKpiToMetric` (§4.5) | FR-05 | metric id is library-seeded; at-most-one guard lives in the helper (B-02) |
| `ALIGNED_TO` `KPI`→`Domain`/`UserJourney`/`Activity` (all targets) | `POST /api/v1/kpi-alignments` (D-1) | FR-06 | route enforces `target_type`/`weight ∈ [0,1]`/target-exists — no raw fixture row for any alignment (Rule C, C-01) |
| `Funnel` + `Stage` nodes, `HAS_STAGE` edges | `POST /api/v1/nodes/{Funnel,Stage}` + `POST /api/v1/edges` (§4.6) | FR-07 | funnel `attributes.modelId` needs the resolved operator-root id (Rule D) |
| `CONVERTS_TO` stage transitions | `POST /api/v1/funnels/transitions` (§4.6) | FR-08 | `[0,1]` range guard lives in the route (B-02) |
| `UserStory` + `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE` | `POST /api/v1/models/:modelId/stories` (§4.9) | FR-09 | narrative assembly + `activityId ∈ scopedNodeIds` scope check live in the route (B-02) |
| `AcceptanceCriterion` + `ACCEPTANCE_OF` | `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria` (§4.9) | FR-10 | Given/When/Then non-empty enforcement lives in the route (B-02) |
| `Capability` + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`CAPABILITY_IN_MODEL` | DDD capability routes (§4.10) | FR-11 | `CAPABILITY_IN_MODEL` written authoritatively in the create tx (B-02) |
| Sales risk rows (Postgres) | `seedRisk` → `POST /api/v1/risk-register` (§4.8) | FR-12 | Postgres rows, not graph fixture rows; governed API only (XD-04) |

### 3.3 KPI node attribute envelope (FR-05) — matches `commercial-domain.json`

Verified against `shared/seed/commercial-domain.json:109` and the as-built
`kpiCreateRequestSchema` (`shared/src/schema/kpi-sla.ts:155` — lenient: string
`category`/`unit`/`target_direction`/`measurement_frequency`, numeric
`target_value`). KPI nodes are **fixture rows** (self-contained — a `KPI` node
carries no foreign id in its own row; the `domain_id` attribute is the one
exception and is handled below). Each Sales KPI row:

```json
{ "label": "KPI", "id": "<stable-uuidv7>", "name": "Win Rate",
  "description": "Share of qualified opportunities won.",
  "attributes": { "category": "efficiency", "unit": "%",
                  "target_value": 25, "target_direction": "higher_is_better",
                  "measurement_frequency": "monthly" } }
```

**`domain_id` handling (B-01).** `commercial-domain.json` KPIs carry a
`domain_id` attribute pointing at their domain. The Sales domain id is
server-generated, so it **cannot** be a fixture-row attribute. The design omits
`domain_id` from the fixture KPI rows and instead makes the KPI→Sales-domain
association explicit on the graph via the `ALIGNED_TO` `KPI`→`Domain` edge the
resolver creates (§4.7, FR-06) — which is the structural binding the cockpit
rollup reads. (Note: the `attributes` map is open, so a KPI carrying no
`domain_id` is a valid import row.)

### 3.4 No new zod at a REST boundary

The resolver defines **no** REST-boundary zod. It reuses the dependencies'
exported boundary schemas through their routes (`storyCreateSchema`,
`acCreateSchema`, `capabilityCreateSchema`, `neededBySchema`, `supportedBySchema`,
`kpiAlignmentCreateRequestSchema`, `funnelTransitionSchema`) and the
`RiskSeedRow` type from `governed-seed-helper.ts`. Its only internal shapes are
small resolution-lookup helpers (§4.4) — permissive, internal to the seed
harness, never a boundary. The `sales.json` fixture is validated only by
`importPayloadSchema` at `POST /api/v1/import` (the resolver never re-parses it).

## 4. Core logic — the `seed:sales` resolver

`api/scripts/seed-sales.ts` — the CLI entrypoint, wired `bun run seed:sales`
(§7), a self-owned sibling of `seed-saas-metric-library.ts`. It runs as trusted
operator tooling on the loopback API (same posture as the other seed scripts).
Top-level sequence (each step §-referenced below):

```
1. resolve()        — operator root id, Sales domain id, CRM/MOMS/sales_lead ids, metric ids (§4.4)
                      → fail loudly (non-zero exit) on any missing required id (AC-16)
2. crossRefEdges()  — PART_OF→domain, EXECUTES(shared), USES_SYSTEM→CRM/MOMS (§4.7)
3. kpiLinks()       — MEASURES (§4.5) + ALIGNED_TO→domain (§4.7)
4. funnel()         — Funnel + Stages + HAS_STAGE + CONVERTS_TO (§4.6)
5. stories()        — UserStory + AC via model-scoped routes (§4.9)
6. capabilities()   — Capability + NEEDS_CAPABILITY/SUPPORTED_BY (§4.10)
7. risks()          — seedRisk per Sales risk, dedupe by name (§4.8)
```

Each step is **idempotent** (§4.11). The resolver reads its own `sales.json`
node ids by `name` where it needs an in-slice handle (the fixture is loaded by
`seed:saas-operator` before `seed:sales` runs), and reads foreign ids by
`seedKey`/name (§4.4).

### 4.1 Sales pipeline-stage journeys (FR-01) — fixture nodes, resolver edge

Five `UserJourney` fixture rows covering the demo→quote→close→tenant-provision
pipeline:

| Journey `name` | Purpose |
|----------------|---------|
| Prospect & Qualify | inbound/outbound qualification (BANT) |
| Demo | product demonstration |
| Quote & Propose | pricing + proposal (CPQ) |
| Negotiate & Close | contract, signature, close-won |
| Tenant Provisioning / Handoff | provision the won account on MOMS, hand to CS |

Each journey's `PART_OF`→Sales `Domain` edge is created by the resolver
(`crossRefEdges`, §4.7) against the resolved domain id — **not** a fixture row
(B-01). The Sales `Domain` itself is **not** authored here (foundation-owned).

### 4.2 Activities + `PRECEDES` (FR-02) — fixture nodes + intra-slice edges

`Activity` rows are the concrete pipeline steps, each `PART_OF` its parent
journey (fixture edge, both endpoints in-slice). Where a journey has a defined
step order, consecutive activities are chained by `PRECEDES` (fixture edge).
Example roster (frozen at design so AC-02/AC-03 are checkable — N-02):

| Journey | Activities (in `PRECEDES` order where sequenced) |
|---------|--------------------------------------------------|
| Prospect & Qualify | Qualify lead (BANT) |
| Demo | Run product demo |
| Quote & Propose | Build quote → Present proposal |
| Negotiate & Close | Handle objections → Prepare contract → Send for signature → Countersign → Close-won |
| Tenant Provisioning / Handoff | Provision tenant on MOMS → Hand off to Customer Success |

`PRECEDES` expresses **sequence only**; stage-to-stage **conversion** is on the
funnel (`CONVERTS_TO`, §4.6), never conflated with `PRECEDES`.

### 4.3 Roles × activities (FR-03) — fixture roles + fixture/resolver `EXECUTES`

Four function-specific `Role` fixture rows: **Account Executive (AE)**, **Sales
Development Rep (SDR)**, **Sales Engineer (SE)**, **Deal Desk** (frozen roster,
N-02). Every activity gets ≥1 `EXECUTES` edge from a `Role`:

- `EXECUTES` from a **function-specific** role (both endpoints in-slice) → fixture
  edge.
- `EXECUTES` from the **shared `sales_lead`** role (`saas-operator-catalog.ts:59`,
  server-generated id) → **resolver** edge (`crossRefEdges`, §4.7).

Illustrative coverage: SDR executes *Qualify lead*; SE executes *Run product
demo*; AE executes *Build quote*/*Present proposal*/*Handle objections*/
*Close-won*; Deal Desk executes *Prepare contract*; AE (or `sales_lead`) executes
*Provision tenant on MOMS*/*Hand off*.

### 4.4 Id resolution (`resolve()`, AC-16) — by `seedKey`/name

The resolver reads foreign ids via `POST /api/v1/query/cypher` (`query:read`,
the same loopback path the other seed helpers use):

| Handle | Lookup |
|--------|--------|
| operator root id | `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m` → filter TS on `JSON.parse(attributes_json).saasOperatorRoot === true` (mirrors `ensure-operator-root.ts`) |
| Sales domain id | `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$root}) RETURN d` → filter on `attributes.seedKey === "sales"` (mirrors `ensure-function-domains.ts`) |
| CRM/MOMS system ids | `MATCH (s:System) WHERE s.operatorSeedKey IN ["crm","moms"] RETURN s` (the top-level `operatorSeedKey` marker, `ensure-catalog.ts`) |
| `sales_lead` role id | `MATCH (r:Role {operatorSeedKey:"sales_lead"}) RETURN r` |
| metric ids | `MATCH (m:MetricDefinition) WHERE m.id IN [$…] RETURN m.id` (the stable seed ids `metric-win-rate`, `metric-pipeline-conversion`, and the FR-05b ids if present) |
| in-slice node ids | `MATCH (n {name:$name}) WHERE n:UserJourney OR n:Activity OR n:Role OR n:System OR n:KPI RETURN n.id` (scoped by the operator root via a `PART_OF*`/`IN_MODEL` join to avoid retail collisions) |

`resolve()` **also asserts the funnel subsystem is executed** (B-01) before any
funnel write is attempted, mirroring the fail-loud contract for unresolved metric
ids:

- **`Funnel` label registered** — `CALL db.labels() YIELD label WHERE label = "Funnel" RETURN label`
  (or the ontology-registry read the other resolvers use). Absent → throw
  `funnel-pipeline-modeling not executed: Funnel label unregistered`.
- **`funnels/transitions` route present** — a probe `POST /api/v1/funnels/transitions`
  with an empty/invalid body expects a `400` (validation) rather than a `404`
  (route absent); a `404`/unrouted response → throw
  `funnel-pipeline-modeling not executed: POST /api/v1/funnels/transitions absent`.

If any **required** foreign id (operator root, Sales domain, CRM, MOMS,
`sales_lead`, `metric-win-rate`, `metric-pipeline-conversion`) resolves to
nothing, **or** the funnel subsystem assertion fails, the resolver **throws** with
a clear message ("unresolved foundation/library id: `<key>`" or the funnel
not-executed message above) and exits non-zero — never writing a partial subgraph
(AC-16, NFR-06). In-slice ids are resolved by `name` **scoped to the operator
root** so a retail node of the same name is never matched.

### 4.5 KPI → metric `MEASURES` (FR-05, FR-05a, FR-05b) — via `linkKpiToMetric` only

`MEASURES` is created **only** through `saas-metric-library`'s
`linkKpiToMetric(baseUrl, kpiId, metricId)` (`api/src/seed/link-kpi-metric.ts`,
imported read-only) — the sole sanctioned path, whose header states "content
specs IMPORT this helper" and which runs the at-most-one cardinality pre-check
(B-02). **Never** a raw `sales.json` `MEASURES` row (AC-05 greps the fixture
empty).

- **FR-05a (unconditional):** the Win Rate KPI `MEASURES` `metric-win-rate`; the
  Pipeline Conversion KPI `MEASURES` `metric-pipeline-conversion`. Both metric
  ids are verified present in the wave-1 library (`saas-metric-library/design.md`
  §4 rows 16–17).
- **FR-05b (conditional, C-02):** the three named KPIs (Sales Cycle, ACV, Quota
  Attainment) are **not** in `sales.json` — the fixture carries only the two FR-05a
  KPIs (always grounded). For each FR-05b KPI, the resolver first **detects**
  whether its canonical metric exists via a catalog lookup
  `MATCH (m:MetricDefinition {id:$id}) RETURN m` for
  `metric-sales-cycle`/`metric-acv`/`metric-quota-attainment`. **If and only if**
  the metric is present, the resolver **creates** that KPI via `POST /api/v1/kpis`
  (`kpiCreateRequestSchema`, `kpi:write`) and **immediately** `linkKpiToMetric`s
  it, then aligns it (§4.7); if the metric is absent, the KPI is **not created at
  all**. Because an FR-05b KPI is created only in the same step that grounds it,
  the invariant "every authored KPI is grounded" holds by construction — no
  ungrounded KPI is ever authored (AC-05a), and the FR-05b KPIs appear only when
  OQ-2 has landed. (The rejected alternatives — an unconditional fixture row, or
  post-hoc `DELETE` of an ungrounded KPI — are recorded in §12.)

  > This resolves the static-fixture tension the requirements flagged (C-02): the
  > FR-05a KPIs (always present) are fixture rows; the FR-05b KPIs
  > (conditionally present) are resolver-created + grounded atomically. AC-05a
  > enumerates all Sales-domain KPIs and asserts each has a `MEASURES` edge. The
  > single remaining user decision (OQ-2 — add the three metric definitions to
  > `saas-metric-library`, or defer FR-05b) is recorded in §10 Open items and does
  > not block this design.

### 4.6 Sales Pipeline Funnel (FR-07, FR-08) — Rule D anchor

**Precondition (B-01).** This step presupposes `funnel-pipeline-modeling` is
**executed**: the `Funnel`/`Stage` labels and `HAS_STAGE`/`CONVERTS_TO` edge types
are registered and `POST /api/v1/funnels/transitions` is live. `resolve()` (§4.4)
asserts this and fails the whole run loudly if absent, so `funnel()` never
half-writes a funnel against an unbuilt subsystem. Because that subsystem is
currently `execution:blocked` upstream, this step's *execution* is gated on its
unblock (§1); the design itself is complete.

The resolver authors the funnel:

1. **`Funnel` node** — `POST /api/v1/nodes/Funnel` with `name:"Sales Pipeline"`,
   `attributes.modelId = <resolved operator-root id>` (Rule D, Resolves C-01).
   The `Funnel` label declares an optional `modelId` string
   (`funnel-pipeline-modeling/design.md` §3.1), so this is a valid attribute.
2. **`Stage` nodes** — one per stage, `POST /api/v1/nodes/Stage` with the
   required integer `stageOrder` (`funnel-pipeline-modeling` FR-02 / `json_schema_doc`
   `required:["stageOrder"]`). Ordered chain **Lead(1) → Qualified(2) → Demo(3)
   → Proposal(4) → Negotiation(5) → Closed-Won(6)** (strict linear, matching
   `funnel-pipeline-modeling` OQ-2). **Note (N-02): the funnel's six stages are
   deliberately not the five pipeline-stage journeys of §4.1.** A funnel `Stage`
   is a conversion measurement point (a snapshot of pipeline position), whereas a
   `UserJourney` is the process a role executes; the two sets are intentionally
   distinct and are not expected to be 1:1. AC-07 asserts the six-stage chain;
   AC-01 asserts the five journeys — no cross-cardinality assertion couples them.
3. **`HAS_STAGE` edges** — `POST /api/v1/edges` `{type:"HAS_STAGE", fromId:funnel,
   toId:stage}` (generic path; `Funnel→Stage` endpoint pair is registered).
4. **`CONVERTS_TO` transitions** — created **only** via the funnel-owned route
   `POST /api/v1/funnels/transitions` (`funnelTransitionSchema`:
   `{fromId, toId, conversionRate ∈ [0,1], dropOffRate ∈ [0,1]}`), which is the
   sole place the `[0,1]` range guard lives (`400 attribute_violation` on an
   out-of-range value, B-02). **Never** a raw `sales.json` `CONVERTS_TO` row
   (AC-08 greps the fixture empty). Consecutive stages get one transition each,
   with illustrative descriptive rates in `[0,1]` (XD-03 — descriptive, not
   operational).

AC-07 asserts the funnel is returned by `funnel-pipeline-modeling` FR-09's
**actual** listing query for the operator root (`WHERE f.attributes_json CONTAINS
$rootIdNeedle` + `modelId===rootId` filter, `funnel-pipeline-modeling` §4.5) and
**excluded** when that same listing is scoped to retail Model #1.

### 4.7 Cross-reference + alignment edges (FR-03, FR-04, FR-06) — `crossRefEdges`/`kpiLinks`

- **`PART_OF` `UserJourney`→Sales `Domain`** (FR-01), **`EXECUTES` `sales_lead`→
  `Activity`** (FR-03), **`USES_SYSTEM` `Activity`→CRM/MOMS** (FR-04) — each via
  `POST /api/v1/edges` (`edgeCreateSchema`: `{type, fromId, toId}`). The generic
  edge validator enforces the endpoint whitelist (these pairs are all in
  `EDGE_ENDPOINTS`) and cross-type edge-id uniqueness. Idempotency by an
  existence pre-check (§4.11).
- **`ALIGNED_TO` `KPI`→Sales `Domain`/`UserJourney`/`Activity`** (FR-06, D-1;
  Resolves C-01) — **every** alignment, regardless of target, is written via
  `POST /api/v1/kpi-alignments` `{kpi_id, target_type, target_id, weight}` with
  `target_type ∈ {"domain","journey","activity"}`. The KPI→Sales-domain alignment
  is the id-referencing case (`target_type:"domain"`, domain id is foreign); the
  in-slice journey/activity alignments (e.g. Win Rate → Negotiate & Close journey)
  are **also** route-written (`target_type:"journey"`), **not** fixture rows — the
  route's `weight ∈ [0,1]` + target-exists enforcement applies uniformly (Rule C).
  Each Sales KPI gets ≥1 `ALIGNED_TO` edge, all route-written (AC-06).

### 4.8 Sales risks (FR-12) — `seedRisk`, dedupe by name

The resolver imports `seedRisk` from `api/src/seed/governed-seed-helper.ts`
(read-only) and creates the Sales risks as Postgres `risk_register` rows via
`POST /api/v1/risk-register`. The frozen risk roster (N-02):

| `name` | `risk_type` | `linked_entity_*` |
|--------|-------------|-------------------|
| Pipeline-coverage shortfall | `operational` | domain: Sales domain id |
| Discount / margin leakage in Deal Desk | `financial` | journey: Negotiate & Close |
| CRM data-quality / forecast accuracy | `operational` | domain: Sales domain id |
| Key-person dependency on a top AE | `strategic` | domain: Sales domain id |

Each row sets `domain:"Sales"`, an `owner` (e.g. "Sales Function Owner"),
`likelihood`/`impact` ∈ 1–5, `status`, `trend`, and (where it links a graph
entity) `linked_entity_type`/`linked_entity_id` = the resolved Sales domain or a
journey id.

**Idempotent dedupe (NFR-03, OQ-5).** Because risk rows are Postgres (not
MERGE-on-id), the resolver **checks-before-POST on `name` within
`domain:"Sales"`**: `GET /api/v1/risk-register?domain=Sales` (verified: filters
by `domain`, no `name` filter — `risk-register.ts:65`) returns all Sales rows;
the resolver POSTs only names not already present (AC-12). This spec **never**
edits `risk-register.ts` or any risk/SLA/change/compliance code (NFR-02).

### 4.9 User stories + acceptance criteria (FR-09, FR-10) — model-scoped routes only

Stories are created **only** via `story-spec-core`'s model-scoped route
`POST /api/v1/models/:modelId/stories` (`:modelId` = the resolved operator root),
whose `storyCreateSchema` (`shared/src/schema/story-spec.ts:22`, `.strict()`)
takes `{persona, action, benefit, activityId, roleId?}`. The route:

- assembles `narrative` server-side (`assembleNarrative`, `stories.ts:128` →
  `"As a <persona>, I want to <action>, so that <benefit>."`),
- creates the `DESCRIBES_ACTIVITY` (+ optional `STORY_FOR_ROLE`) edges,
- sets `derived:false` (`stories.ts:328` — hand-authored, not bootstrap-derived),
- enforces the write-side scope check `activityId ∈ scopedNodeIds(modelId)`
  (`stories.ts:161` → `404 story_activity_not_in_model`).

Cardinality (verified, `story-spec-core` FR-03): each story has **exactly one**
`DESCRIBES_ACTIVITY` and **at most one** `STORY_FOR_ROLE`; an `Activity` may be
the target of `1..*` stories. Each notable Sales activity gets ≥1 story (e.g.
*"As an Account Executive, I want to build a quote from the qualified
opportunity, so that I can present pricing without leaving the CRM."*). `roleId`
is the resolved executing role id.

ACs are created **only** via `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria`
(`acCreateSchema`: `{given, when, then, ordinal?}`, each clause `min(1)` →
`400 acceptance_criterion_clause_required` on empty, `stories.ts` `parseMapped`).
Every Sales story carries ≥1 AC with all three clauses non-empty (e.g. *Given a
qualified opportunity, When the AE builds a quote, Then a draft quote line-item
set is attached to the CRM record*). **Never** raw import rows (AC-09 greps the
fixture empty for `UserStory`/`AcceptanceCriterion`).

### 4.10 DDD capability mapping (FR-11) — DDD routes only

Capabilities are created **only** via the DDD capability routes (verified
present, `api/src/routes/capabilities.ts`):

1. **Create** — `POST /api/v1/models/:modelId/capabilities`
   (`capabilityCreateSchema`: `{name, description?}`, `capability:write`). The
   create tx writes `CAPABILITY_IN_MODEL`→the operator root **authoritatively**
   (`ddd-system-modeling` FR-04), guaranteeing every capability is scoped-from-birth
   to the operator root (B-02). Capabilities: **Qualify a lead**, **Price and
   quote a deal**, **Close a contract**, **Provision a tenant**.
2. **`NEEDS_CAPABILITY`** — `PUT /api/v1/models/:modelId/capabilities/:capabilityId/needed-by`
   (`neededBySchema`: exactly one of `{activityId}` / `{storyId}`). Each
   capability is needed-by ≥1 Sales `Activity` and/or `UserStory` (e.g. *Price
   and quote* needed-by *Build quote*).
3. **`SUPPORTED_BY`** — `PUT /api/v1/models/:modelId/capabilities/:capabilityId/supported-by`
   (`supportedBySchema`: `{systemId}`). *Price and quote a deal* `SUPPORTED_BY`
   the **CPQ** system (the non-optional function-specific system, FR-04);
   *Provision a tenant* `SUPPORTED_BY` **MOMS**.

**Never** raw `sales.json` `Capability`/`CAPABILITY_IN_MODEL` rows (AC-10 greps
the fixture empty). AC-10 asserts each capability has **exactly one**
`CAPABILITY_IN_MODEL` targeting the operator root and no other `BusinessModel`.

### 4.11 Idempotency (NFR-03, AC-12) — per construct

Re-running the full sequence yields zero net new nodes/edges/risk rows:

| Construct | Idempotency mechanism |
|-----------|-----------------------|
| `sales.json` fixture rows | stable ids → MERGE-on-id via `realImport` (`upsertNode`/`upsertEdge`) |
| resolver graph edges (`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`HAS_STAGE`) | existence pre-check (`MATCH (a)-[r:TYPE]->(b) RETURN r`) before `POST /api/v1/edges`; skip if present |
| `ALIGNED_TO` (all targets, via `kpi-alignments`, C-01) | existence pre-check on `(kpi)-[:ALIGNED_TO]->(target)` before `POST /api/v1/kpi-alignments`; skip if present |
| `MEASURES` | `linkKpiToMetric`'s built-in at-most-one guard (a second link throws `kpi_metric_already_linked`; the resolver treats "already linked" as satisfied) |
| `CONVERTS_TO` | existence pre-check on the `(from)-[:CONVERTS_TO]->(to)` pair before the transition POST |
| `Funnel`/`Stage` nodes | natural-key lookup by `name` scoped to the operator root before create; skip if present |
| FR-05b `KPI` nodes (resolver-created, never fixture — C-02) | create-if-metric-present-and-not-already-created: the resolver creates the KPI (`POST /api/v1/kpis`) only when its metric exists **and** no Sales KPI of that `name` is already present (natural-key lookup scoped to the operator root); a re-run finds it and skips (§4.5) |
| stories/ACs/capabilities | natural-key lookup (story by `narrative`/activity, capability by `name`) before create; skip if present |
| Sales risk rows | check-before-POST on `name` within `domain:"Sales"` (§4.8) |

AC-12 runs the full sequence twice and asserts zero net new nodes/edges, zero
duplicate risk rows, **and** subgraph completeness (the cross-reference edges are
present — they come from `seed:sales`, not `seed:saas-operator` alone). No run
mutates retail Model #1's subgraph (a pre/post `/api/v1/stats` diff for a re-run
is zero for the retail root).

## 5. HTTP API surface

This spec adds **no new REST route.** Every write rides an existing route:

| Method | Route | Permission (existing) | FR | Role in this spec |
|--------|-------|-----------------------|----|-------------------|
| POST | `/api/v1/import` (`realImport`) | `data:write` | FR-01..FR-06 | load `sales.json` (via `seed:saas-operator`, not this resolver) |
| POST | `/api/v1/query/cypher` (`runPassthrough`) | `query:read` | all | id resolution + idempotency pre-checks |
| POST | `/api/v1/edges` | `edge:write` | FR-01/03/04/07 | `PART_OF`/`EXECUTES`/`USES_SYSTEM`/`HAS_STAGE` |
| POST | `/api/v1/kpis` | `kpi:write` | FR-05b | conditional FR-05b KPI create (§4.5) |
| POST | `/api/v1/edges` (via `linkKpiToMetric`) | `edge:write` | FR-05 | `MEASURES` (guarded helper) |
| POST | `/api/v1/kpi-alignments` | `kpi:write` | FR-06 | `ALIGNED_TO` KPI→domain (D-1) |
| POST | `/api/v1/nodes/{Funnel,Stage}` | `node:write` | FR-07 | funnel + stage nodes |
| POST | `/api/v1/funnels/transitions` | `edge:write` | FR-08 | `CONVERTS_TO` (range-guarded) |
| POST | `/api/v1/models/:modelId/stories` | `story:write` | FR-09 | stories (narrative + scope) |
| POST | `/api/v1/models/:modelId/stories/:storyId/acceptance-criteria` | `story:write` | FR-10 | ACs (Given/When/Then) |
| POST | `/api/v1/models/:modelId/capabilities` | `capability:write` | FR-11 | capabilities (authoritative scope) |
| PUT | `/api/v1/models/:modelId/capabilities/:capabilityId/needed-by` | `capability:write` | FR-11 | `NEEDS_CAPABILITY` |
| PUT | `/api/v1/models/:modelId/capabilities/:capabilityId/supported-by` | `capability:write` | FR-11 | `SUPPORTED_BY` |
| POST | `/api/v1/risk-register` (via `seedRisk`) | `risk:write` | FR-12 | Sales risk rows |
| GET | `/api/v1/risk-register?domain=Sales` | `risk:read` | FR-12 | risk dedupe pre-check |

No new `ERROR_CODES` member and no new `getRoutePermission` mapping — every route
above is already mapped (verified in `rbac-permissions.ts`). Auth via the central
router gate only (NFR-05); the resolver posts over loopback as trusted operator
tooling (same posture as `seed-saas-metric-library.ts`).

## 6. UI design

**None.** This spec ships no PWA view, no PWA route, and touches no `pwa/` file
(NFR-01). Its content is rendered by views owned by other specs (`FunctionMap`,
`FunnelBoard`, `MetricLibrary`, `OperatorCockpit`, Explorer), each carrying its
own view-states / tokens / a11y / input-mode ACs. The requirements' Platforms &
Input Modes and Native Conflicts tables are correctly `n/a` (no `pwa/`, no
gesture/keyboard/input handling). UX-01..UX-06 impose no obligation on this
server-side content spec.

## 7. Wiring

- **`package.json`** — add
  `"seed:sales": "bun --cwd api scripts/seed-sales.ts"` (matches the existing
  `seed:saas-operator` / `seed:saas-metric-library` `bun --cwd api scripts/…`
  form). This is the **only** `package.json` edit.
- **`shared/seed/saas-operator/sales.json`** — the self-contained Sales fixture
  (§3.1), dropped into the foundation loader's scan directory. The foundation
  loader discovers and imports it with **no edit** to the loader (its `readdirSync`
  directory iteration, `seed-saas-operator.ts:44`).
- **No** edit to `seed-saas-operator.ts`, `seed-saas-metric-library.ts`, any
  `ensure-*`/catalog module, or any route/storage file (Rule E).

## 8. Test strategy

All tests are `*.integration.test.ts` (need Neo4j + Postgres) except the CLI
greps. Each runs the full seed sequence (`seed:saas-metric-library` →
`seed:saas-operator` → `seed:sales`) as its setup, unless noted.

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/sales-journeys.integration.test.ts` — 5 pipeline journeys `PART_OF` the `seedKey:"sales"` domain (resolver edge); exactly one `Domain{seedKey:"sales"}` (no dup) |
| AC-02 | integration (Neo4j) | `api/__tests__/sales-activities.integration.test.ts` — every `Activity` `PART_OF` a Sales journey; `PRECEDES` chains present on sequenced journeys (Negotiate & Close step order); no orphaned activity |
| AC-03 | integration (Neo4j) | `api/__tests__/sales-roles.integration.test.ts` — every Sales `Activity` has ≥1 `EXECUTES`; shared `sales_lead` referenced not duplicated; AE/SDR/SE/Deal Desk exist (frozen roster, N-02) |
| AC-04 | integration (Neo4j) | `api/__tests__/sales-systems.integration.test.ts` — CRM-operating activities `USES_SYSTEM`→resolved CRM (not duplicated); tenant-provision activity `USES_SYSTEM`→MOMS; CPQ + E-Signature carry a valid `systemKind` |
| AC-05, AC-05a | integration (Neo4j) + CLI | `api/__tests__/sales-kpi-metric.integration.test.ts` — Win Rate `MEASURES` `metric-win-rate`, Pipeline Conversion `MEASURES` `metric-pipeline-conversion` (via `linkKpiToMetric`); a second `MEASURES` on the same KPI rejected by the helper guard; **every** Sales `KPI` has ≥1 `MEASURES` (FR-05b KPIs present only if their metrics exist); manual: `grep '"MEASURES"' shared/seed/saas-operator/sales.json` → no matches |
| AC-06 | integration (Neo4j) | `api/__tests__/sales-kpi-metric.integration.test.ts` — each Sales `KPI` has ≥1 `ALIGNED_TO`/`PARAM_BINDS` edge to a Sales journey/activity/domain (KPI→domain via `POST /api/v1/kpi-alignments`, D-1) |
| AC-07 | integration (Neo4j) | `api/__tests__/sales-funnel.integration.test.ts` — "Sales Pipeline" `Funnel` with ordered `Stage`s (integer `stageOrder`) all `HAS_STAGE`; returned by `funnel-pipeline-modeling` FR-09's **actual** operator-root-scoped listing (`modelId`=operator root, Rule D); **excluded** when that listing is scoped to retail Model #1 |
| AC-08 | integration (Neo4j) + CLI | `api/__tests__/sales-funnel.integration.test.ts` — consecutive stages `CONVERTS_TO`-linked (via the funnel-owned route) with `conversionRate`/`dropOffRate` ∈ `[0,1]`, round-tripping intact; overall conversion computable (product); an out-of-range transition POST (`conversionRate:1.5`) → `400 attribute_violation`; manual: `grep '"CONVERTS_TO"' shared/seed/saas-operator/sales.json` → no matches |
| AC-09 | integration (Neo4j) + CLI | `api/__tests__/sales-stories.integration.test.ts` — notable activities each have ≥1 `UserStory` (`derived:false`, server-assembled `narrative`, via the model-scoped route) with exactly one `DESCRIBES_ACTIVITY` + at most one `STORY_FOR_ROLE`; an out-of-scope `activityId` story create → `404 story_activity_not_in_model`; each story ≥1 `AcceptanceCriterion` (non-empty given/when/then, `ACCEPTANCE_OF`); manual: `grep -E '"UserStory"\|"AcceptanceCriterion"' shared/seed/saas-operator/sales.json` → no matches |
| AC-10 | integration (Neo4j) + CLI | `api/__tests__/sales-capabilities.integration.test.ts` — the 4 `Capability`s (via DDD create route) each `NEEDS_CAPABILITY`-linked from ≥1 Activity/Story, `SUPPORTED_BY` where applicable (Price and quote→CPQ, Provision a tenant→MOMS); each has **exactly one** `CAPABILITY_IN_MODEL` → operator root, no other `BusinessModel`; manual: `grep '"Capability"' shared/seed/saas-operator/sales.json` → no matches |
| AC-11 | integration (Postgres) + CLI | `api/__tests__/sales-risks.integration.test.ts` — `GET /api/v1/risk-register?domain=Sales` returns the 4 Sales risks each with valid `likelihood`/`impact`/`status`/`risk_type`; manual: `git diff --stat api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests,sla-crud}.ts api/src/storage/postgres/*` → no change |
| AC-12 | integration (Neo4j + Postgres) | `api/__tests__/sales-seed-idempotency.integration.test.ts` — full sequence run **twice** → zero net new Sales nodes/edges (fixture MERGE + resolver guards) + zero duplicate Sales risk rows; asserts completeness (cross-reference `PART_OF`/`USES_SYSTEM`/`EXECUTES`/`MEASURES` present); retail-root `/api/v1/stats` diff zero |
| AC-13 | integration (Neo4j) + CLI | `api/__tests__/sales-seed-lifecycle-guard.integration.test.ts` — `sales.json` imports and writes; a hand-mutated fixture with a lifecycle row (`IN_MODEL`/`INSTANTIATES`/`BusinessModel`/`ModuleInstance`) → `409 model_lifecycle_route_required`, nothing written; manual: `grep -E '"IN_MODEL"\|"INSTANTIATES"\|"BusinessModel"\|"ModuleInstance"' shared/seed/saas-operator/sales.json` → no matches |
| AC-14 | integration (Neo4j + Postgres) | `api/__tests__/sales-mapping-coverage.integration.test.ts` — every distinct label + edge type across the **whole seeded Sales subgraph** (fixture + resolver writes) + the Postgres risk rows appears in a mapping-table row; every mapping row is instantiated except the two reference-only rows (`Domain`, `MetricDefinition`); no bijection over `sales.json` required |
| AC-15 | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` → changes confined to `shared/seed/saas-operator/sales.json`, `api/scripts/seed-sales.ts`, the `seed:sales` `package.json` line, and this spec's tests — **no** schema-array, `route.ts`/`SURFACES`/`views/index.tsx`, foundation-loader, `seed-saas-metric-library.ts`, or risk/funnel/metric/story/DDD route/storage edit |
| AC-16 | integration (server) + CLI | `api/__tests__/sales-seed-ordering.integration.test.ts` — running `seed:sales` **before** `seed:saas-operator`/`seed:saas-metric-library` (Sales domain / shared roles / CRM / `MEASURES` not yet present) fails loudly (non-zero exit, "unresolved foundation/library id") and writes no partial subgraph; **and** running it when the `funnel-pipeline-modeling` subsystem is absent (no `Funnel` label / no `funnels/transitions` route) fails loudly ("funnel-pipeline-modeling not executed", §4.4/§4.6 assertion) before any funnel write — B-01; the in-order full sequence (funnel subsystem executed) succeeds |

**Preconditions.** Every server test brings up Neo4j + Postgres and runs the
seed sequence in setup. **AC-07 and AC-08 additionally presuppose the executed
`funnel-pipeline-modeling` subsystem** (B-01): the `Funnel`/`Stage` labels,
`HAS_STAGE`/`CONVERTS_TO` edge types, and the `POST /api/v1/funnels/transitions`
route must be registered/live before the `funnel()` step runs — the CI/test
harness must sequence this spec's execution after `funnel-pipeline-modeling` is
unblocked and executed, exactly as `MEASURES` is sequenced after
`saas-metric-library`. If the funnel subsystem is absent, `seed:sales` fails loudly
in `resolve()` (§4.4) rather than producing a partial subgraph — the
`sales-seed-ordering` test (AC-16) asserts this fail-loud on a missing funnel
subsystem as well as on missing foundation/library ids. AC-16 additionally runs
`seed:sales` in isolation (no prior steps) to prove fail-loud. The FR-05b half of
AC-05a is exercised both ways: with the three metrics seeded (KPIs present +
grounded) and without (KPIs absent, not ungrounded).

## 9. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/seed/saas-operator/sales.json` | new | FR-01..FR-06 | self-contained Sales fixture: journeys, activities (+`PRECEDES`), function-specific roles/systems, FR-05a KPIs, intra-slice edges (B-01) |
| `api/scripts/seed-sales.ts` | new | FR-01..FR-12 | the `seed:sales` resolver — resolve ids, write cross-ref edges + `MEASURES`/funnel/stories/capabilities via governed routes + risks via `seedRisk` (B-01/B-02) |
| `package.json` | modify | FR-01..FR-12 | add `seed:sales` script (`bun --cwd api scripts/…` form) — the only `package.json` edit |
| `api/__tests__/sales-journeys.integration.test.ts` | new | AC-01 | |
| `api/__tests__/sales-activities.integration.test.ts` | new | AC-02 | |
| `api/__tests__/sales-roles.integration.test.ts` | new | AC-03 | |
| `api/__tests__/sales-systems.integration.test.ts` | new | AC-04 | |
| `api/__tests__/sales-kpi-metric.integration.test.ts` | new | AC-05, AC-05a, AC-06 | |
| `api/__tests__/sales-funnel.integration.test.ts` | new | AC-07, AC-08 | |
| `api/__tests__/sales-stories.integration.test.ts` | new | AC-09 | |
| `api/__tests__/sales-capabilities.integration.test.ts` | new | AC-10 | |
| `api/__tests__/sales-risks.integration.test.ts` | new | AC-11 | |
| `api/__tests__/sales-seed-idempotency.integration.test.ts` | new | AC-12 | |
| `api/__tests__/sales-seed-lifecycle-guard.integration.test.ts` | new | AC-13 | |
| `api/__tests__/sales-mapping-coverage.integration.test.ts` | new | AC-14 | |
| `api/__tests__/sales-seed-ordering.integration.test.ts` | new | AC-16 | |

**Explicitly NOT edited** (ownership boundaries — spec-guard must not allow):
`shared/src/schema/{nodes,edges}.ts` (no compile-time schema, NFR-01);
`api/scripts/seed-saas-operator.ts`, `api/scripts/seed-saas-metric-library.ts`,
`api/src/seed/{ensure-operator-root,ensure-function-domains,ensure-catalog,
saas-operator-catalog}.ts` (foundation-owned — imported/called, never edited);
`api/src/seed/{link-kpi-metric,governed-seed-helper}.ts` (wave-1-owned — imported
read-only); `api/src/routes/{funnels,stories,capabilities,kpi-sla-alignment,
kpi-impact,edges,nodes,import,query,risk-register,sla-crud,compliance-rules,
change-requests,risk-compliance}.ts` + their storage (all owned elsewhere —
called via HTTP, never edited); `pwa/**` (no view/route, NFR-01);
`api/src/auth/rbac-permissions.ts`, `api/src/errors.ts` (no new permission/error
code).

## 10. Open items

One user decision remains open; it is a **live gate item** the orchestrator reads
at the gate (Resolves C-03). It does not block this design's approval.

| # | Open decision | Owner | Effect | Fallback if deferred |
|---|---------------|-------|--------|----------------------|
| **OQ-2** | Add three canonical `MetricDefinition`s (`metric-sales-cycle`, `metric-acv`, `metric-quota-attainment`) to `saas-metric-library`'s catalog, **or** defer them | `saas-metric-library` (catalog addition — this spec does **not** author metrics) | Widens or narrows the seeded Sales KPI set: if landed, the FR-05b KPIs (Sales Cycle, ACV, Quota Attainment) are resolver-created + grounded (§4.5); if deferred, they are simply not authored | **FR-05a ships regardless.** Win Rate + Pipeline Conversion are grounded against the two already-seeded metrics; the Sales function is complete without FR-05b. No ungrounded KPI ever ships (AC-05a). |

A separate **execution** gate (not a user decision) is recorded in §1: this
spec's execution is sequenced after `funnel-pipeline-modeling` is unblocked and
executed (B-01). That is a build-ordering precondition, tracked in that spec's
STATUS, not an open question for the user here.

## 11. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 (journeys `PART_OF` domain, resolver edge) | §3.1, §4.1, §4.7 | AC-01, AC-12 |
| FR-02 (activities + `PRECEDES`, fixture) | §3.1, §4.2 | AC-02 |
| FR-03 (roles × activities `EXECUTES`) | §3.1, §4.3, §4.7 | AC-03 |
| FR-04 (CRM/MOMS `USES_SYSTEM` + CPQ/E-Sign) | §3.1, §4.4, §4.7 | AC-04 |
| FR-05 (KPI `MEASURES` via `linkKpiToMetric`) | §4.5 | AC-05, AC-05a |
| FR-05a (win-rate + pipeline-conversion) | §4.5 | AC-05, AC-05a |
| FR-05b (sales-cycle/ACV/quota, conditional) | §4.5 | AC-05a |
| FR-06 (KPI alignment — all targets via `kpi-alignments`, C-01) | §3.1, §3.2, §4.7 (D-1) | AC-06 |
| FR-07 (Funnel + `HAS_STAGE`, `modelId` anchor, C-01) — **execution gated on `funnel-pipeline-modeling` (B-01, §1)** | §4.6 (Rule D) | AC-07 |
| FR-08 (`CONVERTS_TO` via funnel route, range guard) — **execution gated on `funnel-pipeline-modeling` (B-01, §1)** | §4.6 | AC-08 |
| FR-09 (stories via model-scoped route) | §4.9 | AC-09 |
| FR-10 (ACs Given/When/Then via AC route) | §4.9 | AC-09 |
| FR-11 (capabilities via DDD routes) | §4.10 | AC-10 |
| FR-12 (risks via governed API, dedupe) | §4.8 (D-2) | AC-11, AC-12 |
| FR-13 (mapping table) | requirements §Mapping; audited §8 | AC-14 |
| NFR-01 (no new machinery) | §3, §5, §6, §9 | AC-15 |
| NFR-02 (owned-elsewhere untouched) | §7, §9 (Rule E) | AC-11, AC-15 |
| NFR-03 (idempotency + completeness + isolation) | §4.8, §4.11 | AC-12 |
| NFR-04 (lifecycle-guard compat) | §3.1, §3.2 | AC-13 |
| NFR-05 (house rules) | §3.4, §5 | AC-15 |
| NFR-06 (cross-entrypoint ordering, incl. funnel-subsystem execution precondition, B-01) | §1, §4.4, §4.6, §8 | AC-16 |

## 12. Rejected alternatives

- **Author id-referencing edges as `sales.json` rows** (the naive fixture).
  The foundation loader throws on any per-row `errors[]` (`seed-saas-operator.ts:64-68`),
  so one edge referencing a server-generated foreign id aborts the whole
  `seed:saas-operator` run (B-01). Rejected → the id-free fixture + `seed:sales`
  resolver (Rule B).
- **A stand-in duplicate Sales `Domain`/CRM/`sales_lead` in the fixture** (so the
  edges have in-slice endpoints). Duplicates the foundation-shared catalog,
  fails AC-03/AC-04 ("referenced not duplicated"), and pollutes the graph.
  Rejected → resolve the real foreign ids by `seedKey` (§4.4).
- **Author `MEASURES`/`CONVERTS_TO`/stories/ACs/capabilities as import rows.**
  Each bypasses its governing invariant (at-most-one, `[0,1]` range, narrative +
  scope, Given/When/Then, authoritative `CAPABILITY_IN_MODEL`). Rejected → the
  owning spec's governed route (Rule C, B-02).
- **Anchor the funnel with a reachability edge** (the stale FR-07 disjunct).
  `funnel-pipeline-modeling`'s approved design scopes FR-09 only on
  `attributes.modelId` and explicitly rejects a `PART_OF` `Funnel→Domain`
  endpoint pair (`design.md:681`). A reachability-anchored funnel would never
  appear in `FunnelBoard`. Rejected → `attributes.modelId` = operator root id
  (Rule D, Resolves C-01).
- **Carry the FR-05b KPIs as unconditional fixture rows.** They would be
  ungrounded (no metric) if OQ-2 is deferred, violating XD-06/AC-05a. Rejected →
  resolver-create-then-ground atomically only when the metric exists (§4.5).
- **Put `domain_id` on the fixture KPI rows** (mirroring `commercial-domain.json`).
  The Sales domain id is server-generated — not a fixture-authorable value.
  Rejected → omit `domain_id`; express KPI→domain via the resolver's `ALIGNED_TO`
  edge (§3.3, §4.7).
- **Dedupe risk rows by MERGE-on-id.** Risk rows are Postgres, not graph
  MERGE-on-id nodes. Rejected → check-before-POST on `name` within
  `domain:"Sales"` (§4.8, OQ-5).
- **Edit `seed-saas-operator.ts` to run the resolver.** That file is
  foundation-owned (XD-05/NFR-02) and exposes no resolver hook. Rejected → a
  self-owned `seed:sales` package script (Rule E, §7), the `seed-saas-metric-library.ts`
  precedent.
