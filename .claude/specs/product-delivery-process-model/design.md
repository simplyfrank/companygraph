---
feature: "product-delivery-process-model"
created: "2026-07-06"
author: "spec-author"
status: "revised"
reviewing_requirements_revision: 1
reviewing_design_revision: 1
size: "medium"
---

<!-- The File Changes table (§11) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

<!-- This design resolves the four requirements open questions (OQ-1..OQ-4) and
     the three carried review concerns (C-01..C-03) + nits (N-01, N-02). One
     material correction to the requirements' Representation Mapping is folded in
     as a Deviations Register (§2.1): stories, acceptance criteria, capabilities,
     and bounded contexts do NOT ride the `{nodes,edges}` import fixture (M-07,
     M-08, M-10, M-11 said "import fixture"). Their domain fields / membership
     edges (persona/action/benefit; given/when/then; CAPABILITY_IN_MODEL) are
     written only by dedicated model-scoped routes that the generic import path
     cannot reproduce. The fixture therefore carries ONLY journeys, activities,
     roles, systems, and their process edges; everything else is created by this
     spec's self-owned seed step through governed routes. -->

<!-- DESIGN-REVIEW REVISION 1 (review-design.md, pass 1/2, verdict "revise").
     This revision resolves both blockers and all four concerns:
     - B-01 (id scheme): every fixture node + the bounded context now carry a
       hand-authored UUIDv7 `id` plus a human-readable `attributes.seedKey`
       (the retail-mini / metrics.json peer pattern). All roster tables (§4),
       resolve/assert steps (§5.1/§5.4/§5.5/§5.7), and ACs now resolve fixture
       nodes by `seedKey`, never by a human-readable string as an id. A stable
       UUIDv7 id block is pinned in §3.1.1.
     - B-02 (MEASURES resolves seedKey, not id): §5.1/§5.3 resolve each metric's
       real UUIDv7 node id from its `seedKey` before calling `linkKpiToMetric`;
       `PRODUCT_KPI_METRIC_MAP` maps KPI name → metric seedKey.
     - C-01 (edge idempotency): §5.7 makes the `EXISTS`/`MATCH` pre-check on
       `(fromId,type,toId)` load-bearing and drops the false "route dedupes" claim.
     - C-02 (MEASURES re-run vs. AC-06 negative): §5.3 pre-checks the MEASURES
       edge and skips `linkKpiToMetric` when present; the "second link rejected"
       assertion is a dedicated negative test, split from the AC-12 re-run.
     - C-03 (target_value): §4.5 now pins a concrete `target_value` per KPI.
     - C-04 (stale anchors): capability citations corrected — `createCapability`
       at capabilities.ts:281, DDD read at :141/:136, MERGE at :310, route arms
       at api/src/routes/capabilities.ts:50-55.
     No stable IDs (FR-*, AC-*, D-*, OQ-*, M-*) are renumbered. -->

# Design: product-delivery-process-model

## 1. Overview

`product-delivery-process-model` is a **wave-2 content spec** of the
SaaS-Operator fan-out (blueprint `.claude/specs/blueprint-saas-operator.md`),
depending on `saas-operator-foundation` (wave 1a) and `saas-metric-library`
(wave 1b). It authors the **Product function** of the docorg SaaS operator onto
the companygraph process graph at the **mandatory full-pipeline depth** (XD-10):
three journeys → their ordered activities × executing roles → the systems those
activities use → product KPIs that `MEASURES` canonical metrics → user stories +
Given/When/Then acceptance criteria → product/delivery risks → a DDD
capability→system→context mapping — all scoped under the pre-seeded `Product &
Delivery` function `Domain` (foundation FR-03, `attributes.seedKey =
"product_delivery"`) of the "SaaS Operator" `BusinessModel` root (foundation
FR-01).

It builds **no new schema, no new store, no new REST route, no new RBAC
permission, and no `pwa/` file**. It composes existing, as-built subsystems and
lands its content two ways (the split is the central design decision, §3):

1. **A lifecycle-clean `{nodes,edges}` graph fixture**
   `shared/seed/saas-operator/product-delivery.json`, discovered and loaded by
   the **foundation's directory-iterating loader** (`POST /api/v1/import` →
   `realImport`) with **zero loader edit** — carrying **only** the journeys,
   activities, roles, systems, and their process edges (`PART_OF`, `EXECUTES`,
   `USES_SYSTEM`, `PRECEDES`).
2. **A self-owned seed step** `bun run seed:product-delivery`
   (`api/scripts/seed-product-delivery.ts`, sibling to the foundation and
   metric-library seed CLIs) that — **after** the fixture has loaded — creates
   the parts the import path **cannot** carry, each through its governed route:
   **KPIs** (`POST /api/v1/kpis`), **`MEASURES` links** (the metric-library
   `linkKpiToMetric` helper), **`ALIGNED_TO` alignments** (`POST
   /api/v1/kpi-alignments`), **stories + ACs** (`POST
   /api/v1/models/:modelId/stories[/…/acceptance-criteria]`), the **DDD mapping**
   (`POST /api/v1/models/:modelId/capabilities` + the PUT mapping arms, a
   `BoundedContext` via `POST /api/v1/ontology/import`), and **risks** (`POST
   /api/v1/risk-register`).

The design follows five rules:

- **Rule A — compose, never fork.** Every write rides an as-built sanctioned
  path. No new storage primitive, no compile-time `NODE_LABELS`/`EDGE_TYPES`
  entry, no new runtime registry label/edge (this spec registers **none** — all
  labels/edges it uses are already registered at boot or by `saas-metric-library`),
  no edit to any owned-elsewhere file.
- **Rule B — fixture is lifecycle-guard-clean, and carries ONLY import-safe
  process content.** The fixture holds no lifecycle rows and no row whose
  domain fields / membership edges the import path cannot write (stories, ACs,
  capabilities, bounded contexts — §3.2). It rides the foundation loader as-is.
- **Rule C — governed data through governed routes only.** KPIs, alignments,
  stories, ACs, DDD mappings, and risks are created via their dedicated routes;
  no KPI/risk/story/DDD/metric route or storage code is edited (XD-04/XD-08,
  NFR-04).
- **Rule D — resolve by lookup, never hard-code.** The operator root, the
  `product_delivery` domain, the shared System/Role catalog, and the canonical
  `MetricDefinition`s are resolved at seed time by their stable lookup key
  (`saasOperatorRoot:true` / `seedKey` / `name`), never by a hard-coded id
  (foundation FR-01/FR-03/FR-04/FR-05, `saas-metric-library` §4). If any is
  absent (a dependency has not seeded), the step **fails fast** and writes
  nothing (FR-01, NFR-02).
- **Rule E — no view, no route file.** This spec ships zero `pwa/` files and
  edits neither `route.ts`/`SURFACES`/`views/index.tsx` (sole-owned by
  `saas-operator-foundation`, XD-05) nor any sibling view (NFR-04). The Product
  function surfaces through the existing Explorer / FunctionMap / exec views.

Rejected at design level (see §12): landing KPI/story/AC/DDD/risk rows in the
import fixture (the import path cannot set their top-level domain fields or
write `CAPABILITY_IN_MODEL` atomically — §3.2); a foundation-owned seed edit for
the governed-API step (couples two specs, edits a file XD-05 forbids); inventing
a `MetricDefinition` for the three missing Product metrics (owned by
`saas-metric-library`, NFR-01/XD-06); a generic `POST /api/v1/edges` `ALIGNED_TO`
write instead of the governed alignment route (C-02).

## 2. Requirements open questions — resolution in this design

The requirements are approved at rev 1 (`review-requirements.md`, verdict
`approve`) with **one blocking open question (OQ-1)** and three design-time OQs
(OQ-2..OQ-4), plus three carried review concerns (C-01..C-03) and two nits
(N-01, N-02). This design closes all of them.

| OQ / concern | Requirements question | Resolution in this design | Section |
|--------------|-----------------------|---------------------------|---------|
| **OQ-1** (BLOCKING) | Three of the four Product metrics (**cycle time**, **feature adoption**, **spec throughput**) are absent from `saas-metric-library`'s **frozen** 20-metric roster (only `Deploy Frequency` ≈ release frequency exists). Add them to the library (a) / map onto nearest existing (b) / defer (c)? | **Split resolution, no dependency edit.** (1) **Release frequency → `Deploy Frequency` (`metric-deploy-frequency`)** — a clean, faithful map; this KPI ships now, `MEASURES` the canonical metric. (2) The **other three KPIs** (cycle time, feature adoption, spec throughput) are **authored as `KPI` nodes now** (so XD-10 full-pipeline depth is met — all four Product KPIs exist, aligned to the process) but their **`MEASURES` link is deferred behind a config flag** until the metric library grows: option (a) — adding `Cycle Time`, `Feature Adoption`, `Spec Throughput` to `saas-metric-library` — is the recommended follow-up and **remains a user decision surfaced as OQ-1' below**, because it edits a dependency's frozen §4 roster + AC-06 mid-execution, which THIS spec cannot do (NFR-01). The seed step reads the metric-id map from a single `PRODUCT_KPI_METRIC_MAP` constant (§5.3); when the three metric seed ids land in the library, one edit to that map turns the deferred links on with no other change. AC-06 asserts exactly the links the map declares (today: one). **This keeps the build deterministic (single-shot, XD-09) with zero dependency edit, meets XD-10 depth, and does not invent a divergent metric (XD-06).** | §5.2, §5.3, OQ-1' |
| **OQ-2** | Sanctioned write path for `UserStory`/`AcceptanceCriterion` instances (top-level domain fields owned by `stories.ts`) — governed route (a) / import fixture top-level props (b) / attributes bag (c)? | **Option (a): the governed model-scoped story routes.** Verified: `createStory` (`api/src/storage/stories.ts:307`) sets `persona`/`action`/`benefit`/server-assembled `narrative` as **top-level** props and wires `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE` in one call; ACs via `POST …/acceptance-criteria` set top-level `given`/`when`/`then`/`ordinal`. The generic import path writes only the node envelope + `attributes_json`, so (b)/(c) are non-viable (N-02). Stories/ACs are created by the self-owned seed step, **not** the fixture (§3.2, §5.4). | §3.2, §5.4 |
| **OQ-3** | Self-owned seed-step placement + wiring + fixture-before-governed-API ordering. | **A feature-owned `bun run seed:product-delivery` CLI** (`api/scripts/seed-product-delivery.ts`), sibling to `seed:saas-operator` / `seed:saas-metric-library`, run **after** them. It (1) resolves the operator root + `product_delivery` domain + shared catalog + metric ids (fail-fast if absent), asserts the fixture has loaded (the journeys/activities exist), then (2) creates KPIs → `MEASURES` links → `ALIGNED_TO` → stories → ACs → DDD → risks **in that order**. The one `package.json` script line is this spec's sole `package.json` edit. The fixture itself rides the foundation loader (no `seed-saas-operator.ts` edit, XD-05). | §5.1, §5.7, §9 |
| **OQ-4** | Risk `linked_entity` targeting — link to the domain/journey/activity, or leave unlinked? | **Link each risk** to the graph entity it concerns: `linked_entity_type = "domain"` + `linked_entity_id` = the resolved `product_delivery` domain id for function-level risks, or `linked_entity_type = "activity"` + the specific at-risk activity id where one is identifiable. This lets the wave-3 cockpit attribute Product risk to the function. `createRiskSchema` accepts both as optional strings (`risk-register.ts:19-20`). | §5.6 |

### 2.1 Deviations Register (requirements corrections folded in here)

The design could not edit `requirements.md`; each divergence below is recorded
for the orchestrator to land as a requirements-errata note. None changes an FR's
intent — only the concrete write path a mapping row names.

| # | Requirements text | As-built reality (verified) | This design |
|---|-------------------|-----------------------------|-------------|
| D-1 | Representation-Mapping rows **M-07** (`UserStory`), **M-08** (`AcceptanceCriterion`), **M-10** (`Capability`), **M-11** (`BoundedContext`) label the write path "import fixture" / "story write path (OQ-2)". FR-12 says the DDD rows ride the "import fixture … `CAPABILITY_IN_MODEL` is not a lifecycle edge, so it is importable". | `CAPABILITY_IN_MODEL` **is** a runtime edge, but a `Capability` node's membership edge is written **atomically inside the create tx** by `createCapability` (`api/src/storage/capabilities.ts:281`, `MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)` at `:310`) — the generic import path creates the node **without** it, leaving an orphan capability the DDD reads (`api/src/storage/capabilities.ts:141` / `:136`, `MATCH (cap)-[:CAPABILITY_IN_MODEL]->(m)`) never return. Likewise a `UserStory` import row would carry no top-level `persona`/`action`/`benefit`/`narrative` (OQ-2/N-02). `BoundedContext` is **not** created by `POST /api/v1/import` at all — its create path is `POST /api/v1/ontology/import` Pass 3 (`api/src/routes/ontology-import.ts:120-160`, MERGE-on-id). | **Stories, ACs, capabilities, and bounded contexts are created by the self-owned seed step via governed routes (§5.4, §5.5), NOT the import fixture.** The fixture (§3.1) carries only journeys/activities/roles/systems + `PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES`. FR-12's "importable via the fixture" claim is corrected: the DDD mapping is created via the model-scoped capability routes (`api/src/routes/capabilities.ts:50-55`) + the ontology-import bounded-context path. No FR intent changes — the labels/edges are identical; only the write path is corrected to the one that populates them. **(C-04: anchors corrected — `createCapability` is `capabilities.ts:281` not `:301-312`; DDD read is `:141`/`:136`; the storage file is `api/src/storage/capabilities.ts`, the route arms `api/src/routes/capabilities.ts`.)** |
| D-2 | Requirements Dependencies name "the `ALIGNED_TO` alignment write path" loosely (C-02). | The governed KPI-alignment route is **`POST /api/v1/kpi-alignments`** (`handleKpiAlignmentPost`, `kpi-sla-alignment.ts:21`; `router.ts:796`) taking `kpiAlignmentCreateRequestSchema` (`kpi-sla.ts:193`: `kpi_id`, `target_type ∈ {journey,activity,domain}`, `target_id`, `weight ∈ [0,1]`, `attribution_type ∈ {direct,indirect,leading,lagging}`). It is **not** a generic `POST /api/v1/edges` `ALIGNED_TO` write. | The seed step POSTs `POST /api/v1/kpi-alignments` with the required `weight` + `attribution_type` (C-02). `domain_id` on the KPI node (`kpiCreateRequestSchema:166`) is a **separate** concern from the `ALIGNED_TO` alignment edge (C-03) — both are set (§5.2, §5.3). |
| D-3 | FR-02 / M-10 parenthetical writes "a capability need → `Capability` + `NEEDS_CAPABILITY`" without the from-side (N-01). | The registered edge direction is **`Activity -[:NEEDS_CAPABILITY]-> Capability`** (`register-capability-labels.ts:64-75`, pairs `Activity→Capability`, `UserStory→Capability`). | The design uses `Activity -[:NEEDS_CAPABILITY]-> Capability` verbatim (§3.2, §5.5); N-01 is cosmetic and resolved. |

### 2.2 OQ-1' — the one remaining user decision (surfaced, non-blocking for THIS build)

**OQ-1' (for the user / the `saas-metric-library` owner):** three of the four
Product KPIs — **cycle time**, **feature adoption**, **spec throughput** — have
no canonical `MetricDefinition` to `MEASURES`. The XD-06-faithful fix is to add
`Cycle Time`, `Feature Adoption`, `Spec Throughput` to `saas-metric-library`'s
frozen §4 roster (each with formula/unit/category/benchmark) and its AC-06
expected set — a **coordinated amendment to a dependency mid-execution** that
THIS spec cannot make (NFR-01; it would edit `metrics.json` + that spec's design
§4 + AC-06). **This design does not block on it:** it authors all four Product
KPIs now (XD-10 depth met, each aligned to the process) and links only the one
that has a canonical metric today (`Deploy Frequency`). The other three links are
**deferred behind a single `PRODUCT_KPI_METRIC_MAP` constant** (§5.3): when the
three `metric-*` seed ids land in the library, one edit to that map (plus AC-06's
expected link set) turns them on — no other change. **Recommendation:** the
orchestrator asks the user to approve option (a) as a follow-up amendment to
`saas-metric-library` and, if approved, pins the three new `metric-*` seed ids
into `PRODUCT_KPI_METRIC_MAP` and AC-06 before this spec's execution — or accepts
the one-link build now and schedules the amendment. Either way the build is
deterministic today.

## 3. The content split — fixture vs. governed seed step

This is the load-bearing design decision. Product content is split by **which
write path can faithfully persist it**.

### 3.1 In the import fixture (`shared/seed/saas-operator/product-delivery.json`)

A single `{nodes, edges}` payload, discovered by the foundation loader
(`seed-saas-operator.ts` step (b), verified `api/scripts/seed-saas-operator.ts:44-62`
posts every `*.json` in `shared/seed/saas-operator/` to `POST /api/v1/import`).
It carries **only** rows the generic import path (`realImport`, `upsertNode`/
`upsertEdge`, MERGE-on-id) persists with full fidelity:

| Rows | Label / edge | Notes |
|------|--------------|-------|
| **Journeys** (3) | `UserJourney` nodes | §4.1 roster; each carries a hand-authored **UUIDv7 `id`** + a human-readable `attributes.seedKey` (§3.1.1) |
| **Journey→Domain** | `UserJourney -[:PART_OF]-> Domain` | **`toId` is the `product_delivery` domain id** — resolved at build time is impossible (server-generated), so this edge is **created by the seed step, not the fixture** (§5.7 ordering note below) |
| **Activities** | `Activity` nodes | §4.2 roster; UUIDv7 `id` + `attributes.seedKey` |
| **Activity→Journey** | `Activity -[:PART_OF]-> UserJourney` | both endpoints in-fixture (both are fixture UUIDv7 ids) |
| **Activity order** | `Activity -[:PRECEDES]-> Activity` | §4.2 order; both endpoints in-fixture (UUIDv7 ids) |
| **Slice-local roles** | `Role` nodes | §4.3 — only roles NOT in the shared catalog; UUIDv7 `id` + `attributes.seedKey` |
| **Role→Activity** | `Role -[:EXECUTES]-> Activity` | shared-role rows resolve the shared-catalog id at seed time (§5.7); slice-local-role rows are fully in-fixture |
| **Slice-local systems** | `System` nodes | §4.4 — only systems NOT in the shared catalog; each with `attributes.systemKind`, UUIDv7 `id` + `attributes.seedKey` |
| **Activity→System** | `Activity -[:USES_SYSTEM]-> System` | shared-system rows resolve the shared-catalog id at seed time (§5.7) |

**Id scheme (B-01 — resolves the review's blocker).** Every write path this
fixture rides enforces a **strict UUIDv7 regex** on node/edge ids
(`uuidv7 = /^[0-9a-f]{8}-…-7…/`, `shared/src/schema/nodes.ts:26`; the import
node/edge rows parse through `nodeCreateSchema.id`/`edgeCreateSchema.fromId,toId`
which are UUIDv7, `edges.ts:57-58`). A human-readable id such as
`pd-journey-roadmap` would fail `nodeWithLabelSchema.safeParse` per-row, and the
foundation loader **throws loudly on any per-row error** — the whole fixture load
aborts. Therefore, matching the as-built peer fixtures `retail-mini.json`
(`018f0000-0000-7000-8000-000000000001`) and
`saas-metric-library/metrics.json` (`018f0100-0000-7000-8000-000000000020`,
`Deploy Frequency`, `seedKey:"metric-deploy-frequency"`), **every fixture node
carries a hand-authored UUIDv7 `id` in a pinned block (§3.1.1) plus a stable
human-readable `attributes.seedKey`.** The seed step and every AC resolve fixture
nodes **by `seedKey`**, never by a human-readable string as an id. The `seedKey`
values reuse the `pd-*` strings the earlier draft used as ids (e.g.
`pd-journey-roadmap`), so the §4 rosters keep their stable, readable keys — they
are now `seedKey` attributes, not ids.

**The domain-id / shared-catalog-id problem (design pin).** `PART_OF →
Domain`, `EXECUTES` from a shared role, and `USES_SYSTEM` to a shared system all
reference a node whose id is **server-generated by the foundation** (the
`product_delivery` domain, the shared `MOMS`/`Helm`/`Data Warehouse` systems,
the shared roles) and is therefore **not knowable when the static fixture is
authored**. Two options were considered:

- **(rejected) put the whole fixture behind the seed step** and rewrite ids at
  runtime — this abandons the foundation loader's zero-edit discovery, the whole
  point of the fixture.
- **(chosen) a hybrid.** The fixture carries every row whose **both** endpoints
  are fixture-local (journeys, activities, slice-local roles/systems, and the
  edges among them: `Activity→UserJourney PART_OF`, `PRECEDES`, slice-local
  `EXECUTES`/`USES_SYSTEM`). The **cross-reference edges** that point at a
  foundation-seeded node — `UserJourney→Domain PART_OF`, `EXECUTES` from a shared
  role, `USES_SYSTEM` to a shared system — are created by the **seed step**
  (§5.7) via `POST /api/v1/edges` **after** it has resolved the target ids by
  lookup. This keeps the fixture static and loader-discoverable while never
  hard-coding a server-generated id (Rule D). The fixture's journeys/activities
  carry hand-authored UUIDv7 ids + `seedKey`s (§3.1.1) that the seed step
  resolves by `seedKey` and attaches its cross-reference edges to.

  > This mirrors the standing companygraph pattern: `System` and `Domain` are
  > model-independent / server-generated, so content that references them
  > resolves-by-lookup at seed time rather than embedding an id.

**Lifecycle-guard cleanliness (NFR-03, FR-12-corrected).** The fixture carries
**no** `BusinessModel`/`ModuleInstance`/… node and **no** `IN_MODEL`/
`INSTANTIATES`/… edge, so `realImport`'s pre-scan
(`import.ts:167-185`, `assertNotLifecycleLabel`/`assertNotLifecycleEdge`) passes
and nothing returns `409 model_lifecycle_route_required` (AC-12). It also carries
**no** `UserStory`/`AcceptanceCriterion`/`Capability`/`BoundedContext`/`KPI` row
(those are §3.2, governed-route only).

### 3.1.1 Pinned UUIDv7 id block (B-01)

The fixture author hand-assigns a stable UUIDv7 `id` to every fixture node from a
dedicated `018f0200-*` allocation block (peer-consistent: retail-mini uses
`018f0000-*`, the metric library `018f0100-*`; this slice claims `018f0200-*`).
Each id is paired with a human-readable `attributes.seedKey` that the §4 rosters
key on. The allocation lanes:

| Lane | id prefix | seedKey pattern | Roster |
|------|-----------|-----------------|--------|
| Journeys | `018f0200-0001-7000-8000-0000000000NN` | `pd-journey-*` | §4.1 |
| Activities | `018f0200-0002-7000-8000-0000000000NN` | `pd-act-*` | §4.2 |
| Slice-local roles | `018f0200-0003-7000-8000-0000000000NN` | `pd-role-*` | §4.3 |
| Slice-local systems | `018f0200-0004-7000-8000-0000000000NN` | `pd-sys-*` | §4.4 |
| Bounded context | `018f0200-0005-7000-8000-000000000001` | `pd-bc-product-delivery` | §4.7 |

The concrete ids are authored inline in `product-delivery.json` and mirrored as a
`SEED_KEYS` constant in `api/src/seed/product-delivery/rosters.ts` so the seed
step and tests resolve **by `seedKey`** (never by the literal UUIDv7 — the UUIDs
are an implementation detail of the static fixture; `seedKey` is the stable
lookup contract, exactly as the metric library uses `seedKey` to resolve its
`MetricDefinition`s). Fixture in-fixture edges (`PART_OF` act→journey,
`PRECEDES`, slice-local `EXECUTES`/`USES_SYSTEM`) reference these UUIDv7 ids
directly (both endpoints are fixture-local); the edges themselves carry no `id`
(optional), so `upsertEdge` MERGE-on-`(type,fromId,toId)` keeps re-import
net-zero.

### 3.2 In the self-owned seed step (governed routes only)

Everything the import path **cannot** persist with fidelity, created by
`seed-product-delivery.ts` through its governed route:

| Content | Why not the fixture | Governed route |
|---------|---------------------|----------------|
| **KPIs** (4) | `:KPI` is owned by the KPI subsystem; the import path does not set the KPI top-level shape (`category`/`unit`/`target_*`/`domain_id`) | `POST /api/v1/kpis` (§5.2) |
| **`MEASURES` links** | cardinality-guarded; the metric ids are resolved at seed time | `linkKpiToMetric` helper (§5.3) |
| **`ALIGNED_TO` alignments** | governed alignment route with required `weight`/`attribution_type` (D-2) | `POST /api/v1/kpi-alignments` (§5.3) |
| **User stories** | top-level `persona`/`action`/`benefit`/`narrative` set only by `createStory` (OQ-2, N-02) | `POST /api/v1/models/:modelId/stories` (§5.4) |
| **Acceptance criteria** | top-level `given`/`when`/`then`/`ordinal` set only by `createAc` | `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria` (§5.4) |
| **Capabilities** | `CAPABILITY_IN_MODEL` membership written atomically in the create tx (D-1) | `POST /api/v1/models/:modelId/capabilities` + PUT mapping arms (§5.5) |
| **Bounded context** | created only by the ontology-import Pass 3 (D-1) | `POST /api/v1/ontology/import` (§5.5) |
| **Risks** | Postgres-backed `risk_register` row, not a graph node | `POST /api/v1/risk-register` (§5.6) |

## 4. Frozen rosters (N-03 — enumerated so AC-02..AC-05 are testable)

These tables are **frozen here**; the ACs assert set-equality against them.

### 4.1 Journeys (FR-03) — `UserJourney`, `PART_OF → product_delivery` domain

Each journey node carries a UUIDv7 `id` (§3.1.1 lane `018f0200-0001-*`) + the
`attributes.seedKey` below; the ACs resolve by `seedKey`.

| # | `name` | `attributes.seedKey` | Shape |
|---|--------|----------------------|-------|
| 1 | Roadmap & Discovery | `pd-journey-roadmap` | opportunity intake → prioritization → roadmap commit |
| 2 | Spec-Driven Delivery | `pd-journey-delivery` | spec authoring → design/tasks → build → release |
| 3 | Product Analytics | `pd-journey-analytics` | instrumentation → adoption measurement → insight → feedback loop |

AC-02 asserts exactly these three journey names (resolved by `seedKey`) under the
domain.

### 4.2 Activities (FR-04) — `Activity`, `PART_OF → journey`, ordered by `PRECEDES`

Each activity node carries a UUIDv7 `id` (§3.1.1 lane `018f0200-0002-*`) + the
`attributes.seedKey` below; the ACs and `PRECEDES`-chain resolve by `seedKey`.

| Journey | # | `name` | `attributes.seedKey` | `PRECEDES` next (by seedKey) |
|---------|---|--------|----------------------|------------------------------|
| Roadmap & Discovery | 1 | Intake opportunity | `pd-act-intake` | → `pd-act-prioritize` |
| | 2 | Prioritize backlog | `pd-act-prioritize` | → `pd-act-roadmap-commit` |
| | 3 | Commit roadmap | `pd-act-roadmap-commit` | (last) |
| Spec-Driven Delivery | 4 | Author feature spec | `pd-act-author-spec` | → `pd-act-design-review` |
| | 5 | Design & task review | `pd-act-design-review` | → `pd-act-build` |
| | 6 | Build & integrate | `pd-act-build` | → `pd-act-cut-release` |
| | 7 | Cut release | `pd-act-cut-release` | (last) |
| Product Analytics | 8 | Instrument features | `pd-act-instrument` | → `pd-act-measure-adoption` |
| | 9 | Measure adoption | `pd-act-measure-adoption` | → `pd-act-synthesize-insight` |
| | 10 | Synthesize insight | `pd-act-synthesize-insight` | → `pd-act-feedback-loop` |
| | 11 | Feed back to roadmap | `pd-act-feedback-loop` | (last) |

The fixture's `PRECEDES` edges reference the two activities' UUIDv7 ids directly
(both fixture-local); the seedKeys above are the human-readable chain the ACs
assert against. AC-03 asserts each journey's activity set + the `PRECEDES` chain
equals this roster exactly (resolving activities by `seedKey`).

### 4.3 Roles (FR-05) — `Role`, `EXECUTES → Activity`

Shared operator roles are resolved from the foundation catalog by `name` /
`attributes.seedKey` (never duplicated, FR-05); Product-specific roles are
seeded **within this slice** (fixture rows, §3.1). The exact shared-vs-local
split depends on the foundation's final Role catalog — the design pins the
Product-specific set (slice-local); any of these that the foundation catalog
already provides is resolved instead of created (§5.7 resolve-or-create).

Slice-local role nodes carry a UUIDv7 `id` (§3.1.1 lane `018f0200-0003-*`) + the
`attributes.seedKey` below; shared roles are resolved from the foundation catalog
by `name` / `attributes.seedKey`. The `Executes` column names activities by their
§4.2 `seedKey`.

| `name` | `attributes.seedKey` (if slice-local) | Origin | Executes (by activity seedKey) |
|--------|---------------------------------------|--------|--------------------------------|
| Product Manager | `pd-role-pm` | slice-local | intake, prioritize, roadmap-commit, author-spec, feedback-loop |
| Release Engineer | `pd-role-release-eng` | slice-local | build, cut-release |
| Product Analyst | `pd-role-analyst` | slice-local | instrument, measure-adoption, synthesize-insight |
| Software Engineer | resolve-or-create `pd-role-swe` | shared if present, else slice-local | design-review, build |

Every activity (§4.2) has ≥1 `EXECUTES` edge (AC-04). A re-run resolves an
existing role (shared or previously-seeded) and creates no duplicate (NFR-02).

### 4.4 Systems (FR-06) — `System`, `USES_SYSTEM ← Activity`

Shared systems resolve from the foundation catalog by `attributes.seedKey` (never
re-created). Product-specific systems are slice-local fixture rows, each with a
UUIDv7 `id` (§3.1.1 lane `018f0200-0004-*`), an `attributes.seedKey`, and a valid
`attributes.systemKind ∈ {functional, agentic, ai_predictive}`
(`system-kind.ts:9`). The `Used by` column names activities by their §4.2
`seedKey`.

| `name` | `attributes.seedKey` | Origin | `systemKind` | Used by (by activity seedKey) |
|--------|----------------------|--------|--------------|-------------------------------|
| MOMS | `moms` | shared (foundation) | (foundation-set) | instrument, measure-adoption |
| Data Warehouse | `data_warehouse` | shared (foundation) | (foundation-set) | measure-adoption, synthesize-insight |
| Roadmap Tool | `pd-sys-roadmap` | slice-local | `functional` | intake, prioritize, roadmap-commit |
| Spec/Docs System | `pd-sys-spec` | slice-local | `functional` | author-spec, design-review |
| CI/CD Pipeline | `pd-sys-cicd` | slice-local | `functional` | build, cut-release |
| Product Analytics | `pd-sys-analytics` | slice-local | `ai_predictive` | instrument, measure-adoption, synthesize-insight |

AC-05 asserts shared systems resolve by `seedKey` (no duplicate) and slice-local
systems carry a valid `systemKind` + resolve by `seedKey`.

### 4.5 KPIs (FR-07, FR-08) — `:KPI` via `POST /api/v1/kpis`

The `MEASURES` metric column below is the metric's **`seedKey`** (B-02) — the
seed step resolves it to the metric's real UUIDv7 node id before writing the
edge (§5.1/§5.3). `target_value` and `target_direction` are both required by
`kpiCreateRequestSchema` (`kpi-sla.ts:159-160`, C-03), so both are pinned here.

| # | KPI `name` | `category` | `unit` | `target_value` | `target_direction` | `MEASURES` metric seedKey (OQ-1) | Aligned to |
|---|-----------|-----------|--------|----------------|--------------------|----------------------------------|-----------|
| 1 | Release Frequency | efficiency | count | 20 | up | **`metric-deploy-frequency`** (linked now) | Spec-Driven Delivery journey + `cut-release` activity |
| 2 | Cycle Time | efficiency | days | 5 | down | *(deferred — OQ-1', no metric today)* | Spec-Driven Delivery journey |
| 3 | Feature Adoption | retention | percent | 40 | up | *(deferred — OQ-1')* | Product Analytics journey + `measure-adoption` activity |
| 4 | Spec Throughput | efficiency | count | 8 | up | *(deferred — OQ-1')* | Roadmap & Discovery journey |

All four `:KPI` nodes are created with `domain_id` = the resolved
`product_delivery` domain id (FR-08) and the pinned `target_value`/
`target_direction` (C-03). AC-06 asserts the four KPIs exist (with their pinned
targets) and that the `MEASURES` link set — resolved through
`PRODUCT_KPI_METRIC_MAP` (§5.3) to real metric node ids — equals what the map
declares (today: exactly one — KPI 1 → the node whose `seedKey` is
`metric-deploy-frequency`, i.e. `018f0100-0000-7000-8000-000000000020`).

### 4.6 Stories + ACs (FR-09, FR-10) — one story per journey, ≥1 AC each

The `DESCRIBES_ACTIVITY` column names activities by their §4.2 `attributes.seedKey`;
`STORY_FOR_ROLE` names roles by §4.3 `name`/`seedKey`. Stories are governed-route
nodes (server-generated UUIDv7 id, §5.4); the "Story key" column is the seed
step's internal handle for idempotency lookup, not a client-supplied id.

| Story key | Journey | `DESCRIBES_ACTIVITY` (activity seedKey) | `STORY_FOR_ROLE` | persona / action / benefit |
|-----------|---------|-----------------------------------------|------------------|----------------------------|
| `pd-story-roadmap` | Roadmap & Discovery | `pd-act-prioritize` | Product Manager | "As a Product Manager, I want to prioritize the backlog against opportunity value, so that engineering builds the highest-impact features first." |
| `pd-story-delivery` | Spec-Driven Delivery | `pd-act-author-spec` | Product Manager | "As a Product Manager, I want every feature to start from an approved spec, so that delivery is traceable and review-gated." |
| `pd-story-analytics` | Product Analytics | `pd-act-measure-adoption` | Product Analyst | "As a Product Analyst, I want to measure feature adoption after release, so that the roadmap is informed by real usage." |

Each story carries ≥1 Given/When/Then `AcceptanceCriterion` (§5.4). AC-08/AC-09
assert the three stories + their populated top-level fields + ≥1 AC each with
non-empty clauses. (`roleId` is resolved to the executing role's id by `name`;
`activityId` to the fixture activity's id resolved **by `seedKey`** at seed time.)

### 4.7 DDD mapping (FR-12) — `Capability` + one `BoundedContext`

One `BoundedContext` ("Product Delivery Context"), created via `POST
/api/v1/ontology/import`. **Its `id` is a UUIDv7** (B-01):
`boundedContextCreateSchema.id` is `z.string().uuid()` (`ontology.ts:295`), which
accepts a UUIDv7 (a valid RFC-4122 uuid) but rejects the human-readable
`pd-bc-product-delivery`. The context is therefore assigned the §3.1.1 lane-5 id
`018f0200-0005-7000-8000-000000000001`; the seed step + the `PUT …/context` arm
reference that UUIDv7. The human-readable `pd-bc-product-delivery` survives as the
context's stable **seedKey** handle in the roster, not as its id.

At least three `Capability` nodes, each created via `POST
/api/v1/models/:operatorRoot/capabilities` (which writes `CAPABILITY_IN_MODEL →
SaaS-Operator root` atomically, `capabilities.ts:281`/`:310`), then wired via the
PUT arms. The `NEEDS_CAPABILITY` / `SUPPORTED_BY` columns name the activity /
system by their §4.2/§4.4 `attributes.seedKey` (resolved to node ids at seed
time):

| Capability `name` | `NEEDS_CAPABILITY` ← activity (seedKey) | `SUPPORTED_BY` → system (seedKey) | `ASSIGNED_TO_CONTEXT` |
|-------------------|-----------------------------------------|-----------------------------------|-----------------------|
| Roadmap Prioritization | `pd-act-prioritize` | `pd-sys-roadmap` | Product Delivery Context (`018f0200-0005-…001`) |
| Continuous Delivery | `pd-act-cut-release` | `pd-sys-cicd` | Product Delivery Context |
| Product Instrumentation | `pd-act-instrument` | `pd-sys-analytics` | Product Delivery Context |

AC-11 asserts each capability `NEEDS_CAPABILITY`←Activity, `SUPPORTED_BY`→System,
`CAPABILITY_IN_MODEL`→operator root, `ASSIGNED_TO_CONTEXT`→the Product context,
and that the bounded-contexts read returns the Product context with its
capabilities.

### 4.8 Risks (FR-11) — Postgres `risk_register` rows via `POST /api/v1/risk-register`

The `_id` column names the graph entity by its resolve key (domain by `seedKey`,
activity by §4.2 `attributes.seedKey`); the seed step resolves each to the real
node id before POSTing.

| Risk `name` | `risk_type` | likelihood | impact | `linked_entity_type` / `_id` (OQ-4) |
|-------------|-------------|-----------|--------|-------------------------------------|
| Roadmap thrash / shifting priorities | strategic | 3 | 3 | `domain` / resolved `product_delivery` domain id |
| Release regression escaping to production | technical | 2 | 4 | `activity` / activity resolved from seedKey `pd-act-cut-release` |
| Spec-throughput bottleneck starving delivery | operational | 3 | 3 | `activity` / activity resolved from seedKey `pd-act-author-spec` |

Each with `domain = "Product & Delivery"`, valid `status`/`trend`. AC-10 asserts
≥2 rows persist with an id + the diff check that no risk route code changed.

## 5. Seed step logic (`api/scripts/seed-product-delivery.ts`)

Mirrors the dependency seed CLIs exactly: `loadEnv()` → `apiBase =
http://${env.host}:${env.apiPort}` → loopback `fetch` (no auth header — trusted
operator tooling on the dev-mode fallback, the same pattern as
`seed-saas-operator.ts:32-33` and `seed-saas-metric-library.ts:30-31`). Wired
`bun run seed:product-delivery` (§9). All logic lives in small feature-owned
helpers under `api/src/seed/product-delivery/`.

### 5.1 Resolve + assert (FR-01, Rule D)

`resolveContext(driver, apiBase)`:

1. **Operator root** — lookup `MATCH (m:BusinessModel {name:"SaaS Operator"})`,
   filter in TS on `JSON.parse(m.attributes_json).saasOperatorRoot === true`
   (the foundation FR-01 contract). Absent → throw
   `operator_root_not_seeded` (fail-fast, FR-01).
2. **`product_delivery` domain** — `MATCH (d:Domain)-[:IN_MODEL]->(m {id:$rootId})`,
   filter on `JSON.parse(d.attributes_json).seedKey === "product_delivery"`.
   Absent → throw `product_domain_not_seeded` (FR-01, NFR-02: no silent create).
3. **Shared catalog** — resolve shared systems (`moms`, `data_warehouse`) and any
   shared role by `attributes.seedKey`/`name`; build a `seedKey → id` map.
4. **Metric node ids (B-02)** — the metric library stores its lookup key as
   `attributes.seedKey` under `attributes_json`, **not** as the node id (verified
   `metrics.json:253-256`: `"name":"Deploy Frequency"`, `"seedKey":
   "metric-deploy-frequency"`, node `id` `018f0100-…-020`). So for each **declared**
   `PRODUCT_KPI_METRIC_MAP` value (a metric `seedKey`), resolve the metric's real
   UUIDv7 node id by
   `MATCH (m:MetricDefinition) WHERE JSON.parse(m.attributes_json).seedKey = $seedKey RETURN m.id`
   (the same shape Rule D uses for the foundation catalog). A declared seedKey
   whose metric node is absent → throw `metric_not_seeded` (the library has not
   seeded — fail-fast). Build a `metricSeedKey → nodeId` map.
5. **Fixture nodes (B-01)** — the journeys, activities, slice-local roles, and
   slice-local systems are resolved **by `attributes.seedKey`** (never by the
   `pd-*` literal as an id), e.g.
   `MATCH (j:UserJourney) WHERE JSON.parse(j.attributes_json).seedKey = "pd-journey-roadmap" RETURN j.id`.
   This is what makes the fixture's server-persisted UUIDv7 ids addressable from
   the seed step without the seed step ever knowing the concrete UUIDs.

Returns `{ rootId, domainId, systemIds, roleIds, metricNodeIds, fixtureNodeIds }`
(all `seedKey → uuid` maps). This is why a premature run creates nothing
(FR-01/NFR-02).

### 5.2 KPIs (FR-07, FR-08)

For each §4.5 KPI, `POST /api/v1/kpis` with `kpiCreateRequestSchema` fields
(`name`/`category`/`unit`/`target_value`/`target_direction`/
`measurement_frequency`/`owner_role`/`domain_id = resolved domainId`). The
handler returns the created `:KPI` node (`handleKpiPost`, `kpi-crud.ts:27`);
the step captures its server-generated id. **Idempotency:** a pre-create lookup
by `name` + `domain_id` (`MATCH (k:KPI {name:$name, domain_id:$domainId})`)
resolves an existing KPI so a re-run creates none (NFR-02) — KPIs have no MERGE
route, so lookup-before-create supplies idempotency (the foundation-persona
pattern).

### 5.3 `MEASURES` links + `ALIGNED_TO` alignments (FR-07, FR-08, C-02, C-03)

**`MEASURES` (metric link).** A single feature-owned constant declares the
KPI→metric map (OQ-1 lives here):

```ts
// api/src/seed/product-delivery/kpi-metric-map.ts
// OQ-1: only Release Frequency has a canonical metric today. The map value is a
// metric SEEDKEY (B-02) — NOT a node id; the seed step resolves it to the
// metric's real UUIDv7 node id via context.metricNodeIds (§5.1 step 4) before
// calling linkKpiToMetric. The other three are DEFERRED (OQ-1') — add their
// metric-* seedKeys here when saas-metric-library grows Cycle Time /
// Feature Adoption / Spec Throughput, and update AC-06.
export const PRODUCT_KPI_METRIC_MAP: Record<string, string> = {
  "Release Frequency": "metric-deploy-frequency", // seedKey → resolved to 018f0100-…-020
  // "Cycle Time":       "metric-cycle-time",       // OQ-1' — deferred
  // "Feature Adoption": "metric-feature-adoption", // OQ-1' — deferred
  // "Spec Throughput":  "metric-spec-throughput",  // OQ-1' — deferred
};
```

For each entry, resolve the metric **seedKey → node id** through
`context.metricNodeIds` (§5.1 step 4), then call the metric-library helper
`linkKpiToMetric(apiBase, kpiId, resolvedMetricNodeId)`
(`api/src/seed/link-kpi-metric.ts`, verified signature `(baseUrl, kpiId,
metricId) => Promise<string>`; it POSTs `{type:"MEASURES", fromId:kpiId,
toId:metricId}` to `POST /api/v1/edges`, whose `toId` must be a real UUIDv7 node
id — passing the seedKey would 4xx, B-02). The helper is cardinality-guarded — a
second link on the same KPI throws `KpiMetricAlreadyLinkedError`.

**Idempotent re-run (C-02).** Because `linkKpiToMetric` throws on a KPI that is
already linked, a naive re-call would abort the net-zero re-run (AC-12). So the
step **pre-checks the MEASURES edge** —
`MATCH (k:KPI {id:$kpiId})-[:MEASURES]->(m:MetricDefinition {id:$metricNodeId})`
— and **skips** the `linkKpiToMetric` call when the edge already exists (the same
lookup-before-write guard used for KPIs/stories/risks). The AC-06 assertions
split accordingly:
- **AC-12 idempotency path**: a full seed re-run skips the already-present link
  and does not throw.
- **AC-06 negative assertion**: a **dedicated negative test** calls
  `linkKpiToMetric` a second time directly on a linked KPI (bypassing the skip
  guard) and asserts it throws `KpiMetricAlreadyLinkedError` — proving the
  cardinality guard without colliding with the re-run path.

AC-06 asserts exactly the links the map declares (today: one, resolved to the
`018f0100-…-020` node), plus the split negative case above.

**`ALIGNED_TO` (process alignment, D-2/C-03).** Separately from `domain_id`,
each KPI is aligned to the journey/activity it measures (per the §4.5 "Aligned to"
column) via **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema`),
supplying `target_id` = the journey/activity id resolved **by `seedKey`** from
`context.fixtureNodeIds`, the required `weight` (∈ [0,1], design uses `1`) and
`attribution_type` (`direct`).
Per the §4.5 "Aligned to" column, each KPI gets **one or two** alignment rows
(one per `(kpi_id, target_type, target_id)` — a KPI aligned to both its journey
and a specific activity is two POSTs, C-03). Idempotency: a pre-create
`GET /api/v1/kpi-alignments?kpi_id=…` lookup skips an already-present alignment.
AC-07 asserts each KPI carries its declared alignments **and** `domain_id` = the
resolved domain id (the two are distinct, C-03).

### 5.4 Stories + ACs (FR-09, FR-10, OQ-2)

The **model id in the URL is the SaaS-Operator root** (`resolveContext.rootId`).
`createStory` scopes THROUGH the activity's `DESCRIBES_ACTIVITY` edge and asserts
the activity is in the operator-root model (`stories.ts:307-314`,
`assertActivityInScope`) — the Product activities are `PART_OF` the
`product_delivery` domain which is `IN_MODEL` the operator root, so they scope
correctly.

For each §4.6 story: `POST /api/v1/models/{rootId}/stories` with
`storyCreateSchema` (`persona`/`action`/`benefit`/`activityId` = the activity id
resolved **by `seedKey`** from `context.fixtureNodeIds` (§5.1 step 5)/`roleId` =
resolved role id). The server assembles `narrative` and
wires `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`. Capture the returned story id, then
`POST /api/v1/models/{rootId}/stories/{storyId}/acceptance-criteria` with
`acCreateSchema` (`given`/`when`/`then`/`ordinal`) for ≥1 AC. **Idempotency:**
a `GET /api/v1/models/{rootId}/stories` lookup by `sourceActivityId`/`persona`
skips an already-seeded story (NFR-02). AC-08/AC-09 assert the three stories +
ACs with populated top-level fields.

### 5.5 DDD mapping (FR-12, D-1)

1. **Bounded context** — `POST /api/v1/ontology/import` with a
   `{boundedContexts:[{id:"018f0200-0005-7000-8000-000000000001", name:"Product
   Delivery Context", description, domain:"Product & Delivery",
   subdomain:"delivery", type, …}]}` payload (Pass 3 MERGE-on-id, idempotent,
   `api/src/routes/ontology-import.ts:120-160`). **The id is a UUIDv7 (B-01)** —
   `boundedContextCreateSchema.id` is `z.string().uuid()` (`ontology.ts:295`),
   which rejects `pd-bc-product-delivery`; `pd-bc-product-delivery` is retained as
   the context's seedKey handle only. `boundedContextCreateSchema` requires
   `domain`/`subdomain` (`ontology.ts:294-299`).
2. **Capabilities** — for each §4.7 capability, `POST
   /api/v1/models/{rootId}/capabilities` with `capabilityCreateSchema`
   (`name`/`description`), which writes `CAPABILITY_IN_MODEL → operator root`
   atomically (`createCapability`, `api/src/storage/capabilities.ts:281`;
   `MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)` at `:310`, C-04). Capture the id.
3. **Mapping arms** (PUT, per the route dispatch in
   `api/src/routes/capabilities.ts:50-55`, C-04):
   - `PUT …/capabilities/{capId}/needed-by` with `{activityId}` (`neededBySchema`
     — exactly one of activityId/storyId; `activityId` resolved by `seedKey` from
     `context.fixtureNodeIds`) → `Activity -[:NEEDS_CAPABILITY]-> Capability`.
   - `PUT …/capabilities/{capId}/supported-by` with `{systemId}`
     (`supportedBySchema`; `systemId` resolved by `seedKey`) →
     `Capability -[:SUPPORTED_BY]-> System`.
   - `PUT …/capabilities/{capId}/context` with
     `{boundedContextId:"018f0200-0005-7000-8000-000000000001"}`
     (`contextAssignSchema`) → `Capability -[:ASSIGNED_TO_CONTEXT]-> BoundedContext`
     (at-most-one, replaces).

**Idempotency:** `POST …/capabilities` is a strict create (no MERGE), so a
pre-create `GET /api/v1/models/{rootId}/capabilities` lookup by `name` skips an
existing capability; the PUT arms are MERGE/replace (verified at
`api/src/storage/capabilities.ts:310` for the model-membership MERGE; the
needed-by / supported-by / context arms are each MERGE-or-replace in the storage
layer, C-04) so re-applying is net-zero. AC-11 asserts the full mapping + the
bounded-contexts read.

### 5.6 Risks (FR-11, OQ-4)

For each §4.8 risk, `POST /api/v1/risk-register` with the route's shape
(`name`/`owner`/`domain`/`likelihood`/`impact`/`status`/`trend`/`risk_type`/
`linked_entity_type`/`linked_entity_id` per OQ-4; `linked_entity_id` = the
domain/activity id resolved **by `seedKey`** from `context`). `createRiskSchema` is
**module-private** (`risk-register.ts:7`, not exported) — importing it would edit
that file (NFR-04-forbidden), so the risk body is a **hand-constructed object
literal** matching the route shape; the route's own re-parse is the validation
contract (the foundation `seedRisk` precedent, foundation design §4.5).
**Idempotency:** a pre-create `GET /api/v1/risk-register` lookup by `name` +
`domain` skips an existing row (NFR-02). AC-10 asserts ≥2 rows persist. If the
foundation ships the `seedRisk` helper (`api/src/seed/governed-seed-helper.ts`),
this step imports and reuses it; otherwise it inlines the same loopback POST
(the helper is a thin wrapper — either way no risk route code is touched).

### 5.7 Cross-reference edges + ordering (§3.1 pin, OQ-3)

**Order (the seed step's fixed sequence, after the foundation loader has run the
fixture):**

1. `resolveContext` (§5.1) — fail-fast if a dependency is unseeded, including the
   fixture-node resolve (§5.1 step 5, by `seedKey`).
2. **Assert the fixture loaded (B-01)** —
   `MATCH (j:UserJourney) WHERE JSON.parse(j.attributes_json).seedKey = "pd-journey-roadmap" RETURN j.id`
   returns a row (the foundation loader imported `product-delivery.json`); resolve
   **by `seedKey`, not by an id literal**. Absent → throw
   `product_fixture_not_loaded` (run `seed:saas-operator` first).
3. **Cross-reference edges** — `POST /api/v1/edges` for:
   `UserJourney -[:PART_OF]-> Domain` (3 edges, `fromId` = each journey id
   resolved by `seedKey`, `toId = domainId`); `Role -[:EXECUTES]-> Activity` from
   any **shared** role (`fromId` = resolved catalog role id, `toId` = activity id
   resolved by `seedKey`); `Activity -[:USES_SYSTEM]-> System` to any **shared**
   system (`fromId` = activity id by `seedKey`, `toId` = resolved catalog system
   id). Slice-local `EXECUTES`/`USES_SYSTEM` are already in the fixture (both
   endpoints fixture-local).

   **Idempotency is carried by an explicit pre-check, not by the edge route
   (C-01).** `POST /api/v1/edges` → `createEdge` is a **strict CREATE** that
   throws `409 id_conflict` **only on a duplicate client-supplied `id`**
   (`api/src/storage/edges.ts:126-148`). These cross-reference edge bodies are
   `{type, fromId, toId}` with **no `id`** (`id` is `uuidv7.optional()`,
   `edges.ts:51`), so a second POST would create a **duplicate parallel edge** —
   the route does **not** dedupe. Therefore, before **every** cross-reference
   POST, the seed step runs a **load-bearing** pre-check keyed on
   `(fromId, type, toId)` —
   `MATCH (a {id:$fromId})-[r:$type]->(b {id:$toId}) RETURN count(r)` — and
   **skips the POST when a matching edge already exists**. This is what makes the
   cross-ref step net-zero on re-run (NFR-02); it is not belt-and-suspenders.
4. KPIs (§5.2) → `MEASURES` (§5.3) → `ALIGNED_TO` (§5.3).
5. Stories (§5.4) → ACs (§5.4).
6. DDD: bounded context → capabilities → mapping arms (§5.5).
7. Risks (§5.6).

Steps 4–7 all depend on step 2/3 having created the journeys/activities the
alignments, stories, and capabilities reference.

## 6. HTTP API surface (no new route, no new permission)

Every route this spec calls is already mounted + RBAC-mapped (verified in
`router.ts` / `rbac-permissions.ts`):

| Method | Route | Permission | FR | Role in this spec |
|--------|-------|------------|----|-------------------|
| POST | `/api/v1/import` | `data:write` | FR-03/04/05/06 | fixture load (via foundation loader) |
| POST | `/api/v1/edges` | `edge:write` | FR-03/05/06/07 | **two uses of the same route (N-01):** (a) cross-reference `PART_OF`/`EXECUTES`/`USES_SYSTEM` (§5.7); (b) the `MEASURES` KPI→metric link, POSTed **by the `linkKpiToMetric` helper** (§5.3) — one endpoint, two callers |
| POST | `/api/v1/kpis` | `kpi:write` | FR-07 | KPI create (§5.2) |
| POST | `/api/v1/query/cypher` | `query:read` | FR-01/02/…  | all resolve/assert/idempotency reads |
| POST | `/api/v1/kpi-alignments` | `kpi:write`* | FR-08 | `ALIGNED_TO` alignment (§5.3, D-2) |
| POST | `/api/v1/models/:id/stories` | `story:write`* | FR-09 | story create (§5.4) |
| POST | `/api/v1/models/:id/stories/:sid/acceptance-criteria` | `story:write`* | FR-10 | AC create (§5.4) |
| POST | `/api/v1/models/:id/capabilities` | `capability:write`* | FR-12 | capability create (§5.5) |
| PUT | `/api/v1/models/:id/capabilities/:cid/{needed-by,supported-by,context}` | `capability:write`* | FR-12 | DDD mapping arms (§5.5) |
| POST | `/api/v1/ontology/import` | `ontology:write`* | FR-12 | bounded context (§5.5) |
| POST | `/api/v1/risk-register` | `risk:write` | FR-11 | risk rows (§5.6) |

\* the exact permission string is whatever the as-built route mapping assigns
(the seed step calls the route; it never adds or edits a `getRoutePermission`
mapping — NFR-05). No `ERROR_CODES` entry is added. Auth via the central router
gate only.

## 7. Data model

This spec adds **no** compile-time or runtime schema (NFR-01). Every label/edge
it writes already exists — either compile-time core (`shared/src/schema/
{nodes,edges}.ts`: `Domain`/`UserJourney`/`Activity`/`Role`/`System`/`KPI` +
`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES`/`ALIGNED_TO`) or registered at boot
/ by `saas-metric-library` (`UserStory`/`AcceptanceCriterion`/`Capability`/
`BoundedContext`/`MetricDefinition` + `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/
`ACCEPTANCE_OF`/`NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/
`CAPABILITY_IN_MODEL`/`MEASURES`). The only zod this spec authors is small
internal seed-input shapes in `api/src/seed/product-delivery/` (permissive,
never a REST boundary); every governed route re-parses its own body with the
as-built schema (NFR-05).

## 8. Representation Mapping (XD-10) — corrected write paths

Supersedes requirements §"Representation Mapping" M-07/M-08/M-10/M-11 write-path
labels (D-1). Every label/edge already exists (NFR-01).

| # | Product action / artifact | Label | Edge(s) | Write path |
|---|---------------------------|-------|---------|------------|
| M-01 | The Product function | `Domain` (pre-seeded) | `Domain -[:IN_MODEL]-> BusinessModel` | resolved by `seedKey` (foundation) |
| M-02 | A product journey | `UserJourney` | `UserJourney -[:PART_OF]-> Domain` | fixture node + seed-step cross-ref edge (§3.1) |
| M-03 | A step | `Activity` | `Activity -[:PART_OF]-> UserJourney`; `-[:PRECEDES]->` | fixture (§3.1) |
| M-04 | Who performs a step | `Role` | `Role -[:EXECUTES]-> Activity` | fixture (local role) / seed-step edge (shared role) |
| M-05 | A system a step uses | `System` | `Activity -[:USES_SYSTEM]-> System` | fixture (local sys) / seed-step edge (shared sys) |
| M-06 | A KPI grounded in a metric | `KPI` | `KPI -[:MEASURES]-> MetricDefinition`; `KPI -[:ALIGNED_TO]-> UserJourney/Activity` | `POST /api/v1/kpis` + `linkKpiToMetric` + `POST /api/v1/kpi-alignments` (§5.2/5.3) |
| M-07 | A user story | `UserStory` | `UserStory -[:DESCRIBES_ACTIVITY]-> Activity`; `-[:STORY_FOR_ROLE]-> Role` | **`POST /api/v1/models/:id/stories`** (§5.4, D-1) |
| M-08 | A Given/When/Then AC | `AcceptanceCriterion` | `AcceptanceCriterion -[:ACCEPTANCE_OF]-> UserStory` | **`POST …/stories/:sid/acceptance-criteria`** (§5.4, D-1) |
| M-09 | A product/delivery risk | (Postgres `risk_register` row) | `linked_entity_type`/`_id` into the graph (OQ-4) | `POST /api/v1/risk-register` (§5.6) |
| M-10 | A business capability | `Capability` | `Activity -[:NEEDS_CAPABILITY]-> Capability`; `Capability -[:SUPPORTED_BY]-> System`; `-[:CAPABILITY_IN_MODEL]-> BusinessModel` | **`POST /api/v1/models/:id/capabilities`** + PUT arms (§5.5, D-1/D-3) |
| M-11 | A DDD bounded context | `BoundedContext` | `Capability -[:ASSIGNED_TO_CONTEXT]-> BoundedContext` | **`POST /api/v1/ontology/import`** + PUT context arm (§5.5, D-1) |

## 9. Wiring

- **`package.json`** — add
  `"seed:product-delivery": "bun --cwd api scripts/seed-product-delivery.ts"`
  (matches the `seed:saas-operator` / `seed:saas-metric-library` `bun --cwd api
  scripts/…` form). Sole `package.json` edit.
- **`shared/seed/saas-operator/product-delivery.json`** — the lifecycle-clean
  `{nodes,edges}` fixture (§3.1). Dropped into the foundation loader's directory;
  **no** `seed-saas-operator.ts` edit (the loader discovers it, verified
  `seed-saas-operator.ts:44-46`).

## 10. Test strategy

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/product-delivery-scope.integration.test.ts` — domain resolved by `seedKey`; journeys `PART_OF` it; with no `product_delivery` domain the seed step throws `product_domain_not_seeded` and writes nothing |
| AC-02 | integration (Neo4j) | `api/__tests__/product-delivery-journeys.integration.test.ts` — exactly the three §4.1 journeys (resolved by `attributes.seedKey`), each with a UUIDv7 id + `PART_OF` the domain |
| AC-03 | integration (Neo4j) | `api/__tests__/product-delivery-activities.integration.test.ts` — each journey's §4.2 activity set (by `seedKey`) + `PRECEDES` chain exact |
| AC-04 | integration (Neo4j) | `api/__tests__/product-delivery-roles.integration.test.ts` — every activity ≥1 `EXECUTES`; shared role resolved by `seedKey`/`name` (no dup); re-run no dup |
| AC-05 | integration (Neo4j) | `api/__tests__/product-delivery-systems.integration.test.ts` — `USES_SYSTEM` edges; shared systems resolve by `seedKey` (no dup); slice-local carry valid `systemKind` + resolve by `seedKey` |
| AC-06 | integration (Neo4j) + CLI | `api/__tests__/product-delivery-kpis.integration.test.ts` — four `:KPI` via `POST /api/v1/kpis` with pinned `target_value`/`target_direction` (§4.5); `MEASURES` link set == `PRODUCT_KPI_METRIC_MAP` resolved seedKey→node id (today: KPI1→the `metric-deploy-frequency` node `018f0100-…-020`); a **dedicated negative test** asserts a second `linkKpiToMetric` on a linked KPI throws `KpiMetricAlreadyLinkedError` (C-02, split from the AC-12 re-run); `git diff --stat api/src/routes/kpi-crud.ts` no change |
| AC-07 | integration (Neo4j) | `api/__tests__/product-delivery-kpis.integration.test.ts` — each KPI's `ALIGNED_TO` rows (via `POST /api/v1/kpi-alignments`, `target_id` by `seedKey`) match §4.5; each KPI `domain_id` = resolved domain id (distinct from the alignment edge, C-03) |
| AC-08 | integration (Neo4j) | `api/__tests__/product-delivery-stories.integration.test.ts` — three §4.6 stories via `POST /api/v1/models/:root/stories`, each `DESCRIBES_ACTIVITY` + `STORY_FOR_ROLE`, top-level `persona`/`action`/`benefit`/`narrative` populated; no new story label |
| AC-09 | integration (Neo4j) | `api/__tests__/product-delivery-stories.integration.test.ts` — each story ≥1 `AcceptanceCriterion` with non-empty `given`/`when`/`then` via `POST …/acceptance-criteria`, `ACCEPTANCE_OF` linked |
| AC-10 | integration (Postgres) + CLI | `api/__tests__/product-delivery-risks.integration.test.ts` — ≥2 risks via `POST /api/v1/risk-register`, `domain="Product & Delivery"`, linked entity per OQ-4, persisted id; `git diff --stat api/src/routes/risk-register.ts` no change |
| AC-11 | integration (Neo4j) | `api/__tests__/product-delivery-ddd.integration.test.ts` — capabilities `NEEDS_CAPABILITY`←Activity, `SUPPORTED_BY`→System (both resolved by `seedKey`), `CAPABILITY_IN_MODEL`→operator root, `ASSIGNED_TO_CONTEXT`→Product context (UUIDv7 id `018f0200-…-0005-…001`); bounded-contexts read returns the context + capabilities |
| AC-12 | integration (Neo4j) | `api/__tests__/product-delivery-seed-idempotency.integration.test.ts` — fixture loads via the foundation loader with **no per-row UUIDv7 parse error** and no `409 model_lifecycle_route_required`; a full re-run (fixture + seed step) is net-zero — cross-ref edges skipped by the §5.7 pre-check (C-01), `MEASURES` skipped by the §5.3 edge pre-check (C-02); retail Model #1 `/api/v1/stats` diff is zero |
| AC-13 | integration (Neo4j) + CLI | `api/__tests__/product-delivery-no-schema-additions.integration.test.ts` — every label/edge the slice writes already exists; `git diff shared/src/schema/{nodes,edges}.ts` no additions; no runtime label/edge registered by this spec |
| AC-14 | CLI | `bun run typecheck` exit 0; `git diff --stat` — changes confined to `shared/seed/saas-operator/product-delivery.json`, `api/scripts/seed-product-delivery.ts`, `api/src/seed/product-delivery/**`, `package.json` (one line), `api/__tests__/product-delivery-*`; **no** `pwa/**`, `route.ts`/`SURFACES`/`views/index.tsx`, kpi/risk/story/DDD/metric route code, `model-lifecycle-guard.ts`, or schema-array change |

**Preconditions.** Every AC's integration test requires `seed:saas-operator`
(operator root + `product_delivery` domain + shared catalog) and
`seed:saas-metric-library` (`metric-deploy-frequency`) to have run first, then
this spec's fixture loaded + `seed:product-delivery` executed. Tests run these in
a `beforeAll` (or assert their preconditions and skip-with-clear-error if a
dependency is unseeded).

## 11. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/seed/saas-operator/product-delivery.json` | new | FR-03/04/05/06 | lifecycle-clean `{nodes,edges}` fixture: journeys, activities, slice-local roles/systems + `PART_OF`(act→journey)/`PRECEDES`/local `EXECUTES`/`USES_SYSTEM` (§3.1) |
| `api/scripts/seed-product-delivery.ts` | new | FR-01/07/08/09/10/11/12 | CLI: resolve+assert → cross-ref edges → KPIs → MEASURES → ALIGNED_TO → stories → ACs → DDD → risks (§5) |
| `api/src/seed/product-delivery/context.ts` | new | FR-01 | `resolveContext` — root/domain/catalog/metric lookups, fail-fast (§5.1) |
| `api/src/seed/product-delivery/kpi-metric-map.ts` | new | FR-07 | `PRODUCT_KPI_METRIC_MAP` (OQ-1 — one live link, three deferred) (§5.3) |
| `api/src/seed/product-delivery/rosters.ts` | new | FR-03/04/05/06/07/09/12 | the §4 frozen roster data (journeys/activities/roles/systems/KPIs/stories/capabilities/risks) + the `SEED_KEYS` seedKey↔UUIDv7 map mirroring the §3.1.1 fixture id block (B-01) + internal zod shapes (§7) |
| `api/src/seed/product-delivery/steps.ts` | new | FR-05/07/08/09/10/11/12 | the governed-route write helpers (cross-ref edges, KPIs, links, alignments, stories, ACs, DDD, risks) reusing `linkKpiToMetric` + (if present) `seedRisk` (§5.2–5.7) |
| `package.json` | modify | FR-01 | add `seed:product-delivery` script (one line, §9) |
| `api/__tests__/product-delivery-scope.integration.test.ts` | new | AC-01 | |
| `api/__tests__/product-delivery-journeys.integration.test.ts` | new | AC-02 | |
| `api/__tests__/product-delivery-activities.integration.test.ts` | new | AC-03 | |
| `api/__tests__/product-delivery-roles.integration.test.ts` | new | AC-04 | |
| `api/__tests__/product-delivery-systems.integration.test.ts` | new | AC-05 | |
| `api/__tests__/product-delivery-kpis.integration.test.ts` | new | AC-06, AC-07 | |
| `api/__tests__/product-delivery-stories.integration.test.ts` | new | AC-08, AC-09 | |
| `api/__tests__/product-delivery-risks.integration.test.ts` | new | AC-10 | |
| `api/__tests__/product-delivery-ddd.integration.test.ts` | new | AC-11 | |
| `api/__tests__/product-delivery-seed-idempotency.integration.test.ts` | new | AC-12 | |
| `api/__tests__/product-delivery-no-schema-additions.integration.test.ts` | new | AC-13 | |

**Explicitly NOT edited** (ownership boundaries — spec-guard must block):
`shared/src/schema/{nodes,edges}.ts` (no schema-array edit, NFR-01);
`api/src/routes/{kpi-crud,kpi-sla-alignment,stories,capabilities,ontology-import,edges,import,nodes}.ts`
and their storage (graph-core / kpi-okr-governance / story-spec-core /
ddd-system-modeling — reused as-is, NFR-04);
`api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts`
(risk-compliance-change / kpi-okr-governance, XD-04/XD-08);
`api/src/storage/model-lifecycle-guard.ts`;
`api/src/seed/link-kpi-metric.ts`, `api/src/seed/ensure-*.ts`,
`api/scripts/seed-saas-metric-library.ts` (saas-metric-library-owned — consumed);
`api/scripts/seed-saas-operator.ts`, `api/src/seed/ensure-catalog.ts`,
`api/src/seed/governed-seed-helper.ts` (saas-operator-foundation-owned —
consumed); `pwa/**`, `pwa/src/route.ts`, `SURFACES`, `pwa/src/views/index.tsx`,
`pwa/src/App.tsx` (XD-05, NFR-04); `api/src/auth/rbac-permissions.ts`,
`api/src/errors.ts` (no new permission / error code).

## 12. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 (scope under `product_delivery` domain, resolve-by-lookup, fail-fast) | §5.1, §5.7 | AC-01 |
| FR-02 (representation mapping table) | §8 | AC-13 |
| FR-03 (three journeys `PART_OF` domain) | §3.1, §4.1, §5.7 | AC-02 |
| FR-04 (activities `PART_OF` journey, `PRECEDES`) | §3.1, §4.2 | AC-03 |
| FR-05 (roles `EXECUTES`, resolve-or-create shared) | §3.1, §4.3, §5.7 | AC-04 |
| FR-06 (systems `USES_SYSTEM`, shared resolve, `systemKind`) | §3.1, §4.4, §5.7 | AC-05 |
| FR-07 (KPIs `MEASURES` metric, cardinality) | §4.5, §5.2, §5.3 | AC-06 |
| FR-08 (KPI `ALIGNED_TO` + `domain_id`) | §5.2, §5.3 | AC-07 |
| FR-09 (stories via governed route) | §3.2, §4.6, §5.4 | AC-08 |
| FR-10 (Given/When/Then ACs) | §4.6, §5.4 | AC-09 |
| FR-11 (risks via `risk-register` API, linked entity) | §4.8, §5.6 | AC-10 |
| FR-12 (DDD capability→system→context) | §3.2, §4.7, §5.5 | AC-11 |
| NFR-01 (no new store / schema / label / edge) | §7, §8, §11 | AC-13, AC-14 |
| NFR-02 (idempotency + retail isolation) | §5.1–5.7 | AC-12 |
| NFR-03 (lifecycle-clean fixture, loader compat) | §3.1, §5.7 | AC-12 |
| NFR-04 (route-file + owned-file single ownership) | §5, §6, §11 | AC-14 |
| NFR-05 (house rules — zod-only, no tsc, loopback, central-gate auth, /api/v1) | §5, §6, §7 | AC-14 |

## 13. Rejected alternatives

- **KPI/story/AC/DDD/risk rows in the import fixture (requirements M-07/08/10/11
  literal).** The import path writes only the node envelope + `attributes_json`
  and cannot set a story's top-level `persona`/`action`/`benefit`/`narrative`,
  cannot write a capability's `CAPABILITY_IN_MODEL` atomically (`createCapability`
  does it in the create tx; an import-created capability is an orphan the DDD
  reads never return), and does not create a `BoundedContext` at all (that is the
  `POST /api/v1/ontology/import` Pass 3). Rejected → governed model-scoped routes
  in the self-owned seed step (§3.2, D-1).
- **Add `Cycle Time`/`Feature Adoption`/`Spec Throughput` to `saas-metric-library`
  from this spec (OQ-1 option a, executed here).** That edits a dependency's
  frozen §4 roster + AC-06 mid-execution — outside this spec's ownership
  (NFR-01) and would break that spec's set-equality AC. Rejected → author all
  four KPIs, link only the one with a canonical metric today, defer the other
  three behind `PRODUCT_KPI_METRIC_MAP`, and surface the roster amendment as
  OQ-1' (a user decision for the `saas-metric-library` owner). Keeps XD-10 depth,
  XD-06 fidelity, and a deterministic single-shot build.
- **Generic `POST /api/v1/edges` `ALIGNED_TO` write for KPI alignment (C-02).**
  Would diverge from the governed `POST /api/v1/kpi-alignments` the cockpit reads
  and skips the required `weight`/`attribution_type`. Rejected → the governed
  alignment route (§5.3, D-2).
- **Foundation-owned seed edit for the governed-API step (OQ-3 alt).** Couples
  this spec to a `seed-saas-operator.ts` edit XD-05 forbids. Rejected →
  self-owned `seed:product-delivery` CLI (§5, OQ-3).
- **Hard-coding the `product_delivery` domain / shared-catalog / metric ids.**
  All are server-generated by the foundation / metric-library. Rejected →
  resolve-by-lookup with fail-fast (§5.1, Rule D).
