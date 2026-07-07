---
feature: "customer-success-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
size: "medium"
---

<!-- The File Changes table (§9) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file this document names until
     the frontmatter status is "approved". List every file the tasks touch. -->

<!-- Requirements are approved at rev 2 (review-requirements.md, verdict
     `approve`). This design resolves the two design-carry concerns C-05
     (commit to `linkKpiToMetric`, not a raw edge POST) and C-06 (OQ-1 must be
     put to the user before the KPI roster freezes) and closes the five
     design-time OQs (OQ-2..OQ-6). OQ-1 remains the sole BLOCKING open question
     surfaced to the orchestrator; the design pins FR-05/FR-06 to the four
     existing retention metrics until it closes (§2). -->

# Design: customer-success-process-model

## 1. Overview

`customer-success-process-model` is a **wave-2 content spec** of the
SaaS-Operator fan-out (blueprint `.claude/specs/blueprint-saas-operator.md`),
depending on `saas-operator-foundation` (wave 1a) and `saas-metric-library`
(wave 1b). It authors the **full-pipeline Customer Success (CS) function** onto
the graph under the pre-existing **"SaaS Operator" `BusinessModel` root**, inside
the pre-existing **`Customer Success` function `Domain`** (`attributes.seedKey`
`customer_success`, created by the foundation). It builds **no new schema, no new
store, no new route, no new view, and no new RBAC permission** — every artifact
is authored through an existing, as-built governed path:

1. **Process content** (five `UserJourney`s, their `Activity`s, `Role`
   `EXECUTES` assignments, `System` `USES_SYSTEM` usage, `PRECEDES` ordering) —
   a `{nodes, edges}` seed fixture `shared/seed/saas-operator/customer-success.json`
   loaded by the **foundation's directory-iterating loader** via
   `POST /api/v1/import` (`realImport`, MERGE-on-id) with **no loader edit** (the
   loader discovers the file).
2. **CS KPIs** — created via `POST /api/v1/kpis` (`handleKpiPost`), each linked
   to a canonical `MetricDefinition` by a **`MEASURES`** edge written through the
   metric-library's sanctioned `linkKpiToMetric` helper (C-05; the cardinality
   guard lives on that write path, not a raw edge POST).
3. **CS stories + Given/When/Then ACs** — via the `story-spec-core` route family
   (`POST /api/v1/models/:modelId/stories` + `.../acceptance-criteria`).
4. **CS SLA definitions** — via the `sla-crud` API (`POST /api/v1/slas`) wrapped
   by the foundation's `seedSla` helper + aligned via `POST /api/v1/sla-alignments`.
5. **CS risks** — via the `risk-register` API (`POST /api/v1/risk-register`)
   wrapped by the foundation's `seedRisk` helper.
6. **CS DDD mapping** — via the `ddd-system-modeling` capability route family
   (`POST .../capabilities`, `PUT .../needed-by | supported-by | context`).

All non-import authoring runs from a **feature-owned** `seed:customer-success`
step (`api/scripts/seed-customer-success.ts`), which first resolves the operator
root id + CS domain id **at seed time** (never hard-coded — FR-15), then imports
the fixture, then makes the governed-API calls. The design also delivers the
**explicit mapping table** (§4.8) that proves "maps onto the companygraph
representation" (XD-10), and it names all four **feature-owned idempotency
guards** (KPI/SLA/risk/story) — the foundation's helper is POST-only with no
dedup, so these are this spec's own code (B-03, OQ-3).

The design follows four rules:

- **Rule A — compose, never fork.** Every write rides an as-built sanctioned
  route/helper: `POST /api/v1/import` for process content; `POST /api/v1/kpis`
  for KPIs; the metric-library's `linkKpiToMetric` for the `MEASURES` edge; the
  `story-spec-core` / `ddd-system-modeling` routes for stories / capabilities;
  the foundation's `seedSla`/`seedRisk` helpers for SLA/risk rows. **No** edit to
  any owned-elsewhere file, **no** compile-time `NODE_LABELS`/`EDGE_TYPES` entry,
  **no** new runtime registry label/edge (NFR-01).
- **Rule B — resolve-then-write.** The `seed:customer-success` step's **first**
  action is FR-15's id preamble: resolve `:operatorRoot` (by the foundation's
  `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` lookup) and the CS
  `Domain` id (by `attributes.seedKey:"customer_success"`). Everything else
  consumes those two handles. Import precedes every API call (KPIs/stories/DDD
  need the domain + activities to exist; `MEASURES` needs the metric library
  seeded).
- **Rule C — feature-owned idempotency.** The re-run "creates no duplicate"
  behavior is machinery **this spec builds** inside `seed:customer-success`: a
  lookup-before-create guard per governed write (`(name, domain_id)` for KPIs,
  `name` for SLAs, `(name, domain)` for risks, `(persona+action+benefit,
  activity)` for stories). The import path is idempotent for free (MERGE-on
  stable UUIDv7 id).
- **Rule D — stable UUIDv7 seed ids in a dedicated block.** All CS process rows
  carry fixed UUIDv7 ids in the reserved `018f0400-…` block (§3.1) — the import
  path (`nodeCreateSchema`) and the edge write (`edgeCreateSchema`, `fromId`/
  `toId` are `uuidv7`) both require UUIDv7 ids; slug ids like `cs-onboarding`
  would fail validation. The block is disjoint from the metric library's
  `018f0100` block and the foundation's server-generated ids.

Rejected at design level (see §11): raw `POST /api/v1/edges` for the `MEASURES`
link (C-05 — bypasses the cardinality guard); registering health/CSAT/ticket-SLA
`MetricDefinition`s within this slice (OQ-1 c — violates XD-06); slug-style seed
ids (fail the UUIDv7 boundary); relying on the foundation loader alone for the
whole seed (it cannot make the KPI/SLA/risk/story/DDD API calls — OQ-4);
per-activity exhaustive DDD coverage (OQ-6 — XD-10 requires the mapping *proven*,
not complete).

## 2. Prior-review concerns — resolution in this design

Requirements review rev 2 approved with two concerns to carry into design and
five design-time OQs. Their resolution:

| Item | Requirements question / concern | Resolution in this design | Section |
|------|--------------------------------|---------------------------|---------|
| **C-05** | FR-06/AC-06 describe the `MEASURES` write as a raw `POST /api/v1/edges`, but the metric-library ships `linkKpiToMetric` which does the cardinality pre-check | **Adopt `linkKpiToMetric`** (`api/src/seed/link-kpi-metric.ts`, verified exported). The CS seed step imports it; it runs the `MATCH (k:KPI {id})-[m:MEASURES]->() RETURN count(m)` pre-check then POSTs the edge, throwing `KpiMetricAlreadyLinkedError` (`code:"kpi_metric_already_linked"`, `httpStatus:409`) on a second link. AC-06's cardinality assertion now holds on the exact path CS uses. | §4.3, §5.1 |
| **C-06** | OQ-1 (health/CSAT/ticket-SLA metrics missing from the frozen roster) is a user-facing cross-spec decision that must be settled before the KPI roster freezes | **OQ-1 stays BLOCKING and is surfaced to the orchestrator.** This design **pins** FR-05/FR-06 to the **four existing retention metrics** (NRR/GRR/logo/revenue churn) and freezes that roster in §4.4. The three CS-specific KPIs are authored **iff** OQ-1 resolves to option (a) and `saas-metric-library` publishes the three definitions; §4.4 records the exact linkage the (a) arm would use. Until then AC-07's "deferred" arm holds and this spec registers **zero** new ontology label/metric. | §4.4, §10 (OQ-1) |
| **OQ-2** | risk `domain` free-text string is a de-facto cross-spec key | **`domain` = the CS `Domain` node `name` verbatim = `"Customer Success"`.** Recorded here as the canonical convention all six content slices adopt so the wave-3 cockpit's `GROUP BY domain` is stable. | §4.6 |
| **OQ-3** | which natural keys for the four idempotency guards | KPI `(name, domain_id)`; SLA `name`; risk `(name, domain)`; story `(persona+action+benefit, DESCRIBES_ACTIVITY activity)`. All four live in this spec's own seed step. | §5.1 |
| **OQ-4** | seed-step ownership + ordering | **Feature-owned `seed:customer-success` step** (`api/scripts/seed-customer-success.ts` + a `package.json` script), running preamble → import → API calls. Not the foundation loader alone. | §4.1, §7 |
| **OQ-5** | stories hand-authored vs bootstrap-derived | **Hand-authored** curated Given/When/Then stories via `POST .../stories` + `.../acceptance-criteria`. Not `bootstrap`. | §4.5 |
| **OQ-6** | DDD depth | **Representative subset** (four distinctive CS capabilities), not exhaustive per-activity. | §4.7 |

### 2.1 Interface verification (design-time, against the live tree)

Every interface this design targets was verified against the current code:

- **KPI create** — `POST /api/v1/kpis` → `handleKpiPost`
  (`api/src/routes/kpi-crud.ts:26`) validates `kpiCreateRequestSchema`
  (`shared/src/schema/kpi-sla.ts:155`: required `name`, `category`, `unit`,
  `target_value`, `target_direction`, `measurement_frequency`; optional
  `description`, `warning_threshold`, `critical_threshold`, `owner_role`,
  `domain_id`), server-generates the id via `generateId()` (UUIDv7), does a plain
  `CREATE (k:KPI …)` — **no MERGE** (verified `kpi-crud.ts:52`). Idempotency is
  this spec's own guard (Rule C).
- **`MEASURES` link** — `linkKpiToMetric(baseUrl, kpiId, metricId)`
  (`api/src/seed/link-kpi-metric.ts`, exported) pre-checks cardinality then POSTs
  `{type:"MEASURES", fromId, toId}` to `POST /api/v1/edges`; expects `201`;
  throws `KpiMetricAlreadyLinkedError` on a pre-existing link. `MEASURES ∉
  LIFECYCLE_EDGES`, so the generic edge route accepts it (verified via the
  metric-library design + `ensureMeasuresEdgeType` in `seed:saas-metric-library`).
- **Metric ids** — the four retention metrics are **fixed UUIDv7 ids** in the
  `saas-metric-library` fixture (`shared/seed/saas-metric-library/metrics.json`,
  verified): NRR `018f0100-0000-7000-8000-000000000006`, GRR
  `…000000000007`, Logo Churn `…000000000008`, Revenue Churn `…000000000009`.
  This spec references those ids for the `MEASURES` `toId`.
- **SLA create** — `POST /api/v1/slas` → `handleSlaPost` (`sla-crud.ts:25`)
  validates `slaCreateRequestSchema` (`kpi-sla.ts:172`: required `name`,
  `service_type`, `target_value`, `target_unit`, `measurement_window`,
  `window_duration`, `compliance_threshold`; optional `description`,
  `penalty_type`, `penalty_amount`, `domain_id`, `product_type`). Wrapped by the
  foundation's `seedSla(row)` (`governed-seed-helper.ts`, which `slaCreateRequestSchema.parse`s
  then POSTs `/api/v1/slas`).
- **SLA alignment** — `POST /api/v1/sla-alignments` → `handleSlaAlignmentPost`
  (`kpi-sla-alignment.ts`) validates `slaAlignmentCreateRequestSchema`
  (`kpi-sla.ts:201`: `sla_id`, `target_type ∈ {journey, activity}`, `target_id`,
  optional `is_critical`, `alignment_notes`); a missing target → `404 not_found`.
- **Risk create** — `POST /api/v1/risk-register` → `handleRiskRegisterCreate`,
  `createRiskSchema` (`risk-register.ts:6`, **module-private**): required `name`,
  `owner`, `domain` (free-text `z.string().min(1)`), `likelihood`/`impact`
  (int 1–5), `status ∈ {open,mitigating,accepted,resolved}`, `trend ∈
  {up,flat,down}`; optional `description`, `mitigation_plan`, `category`,
  `risk_type ∈ {strategic,operational,financial,compliance,security,technical}`,
  `linked_entity_type`, `linked_entity_id`. Wrapped by the foundation's
  `seedRisk(row)` (`RiskSeedRow` interface matches exactly; hand-constructed
  literal, C-01-clean).
- **Story create** — `POST /api/v1/models/:modelId/stories` → `handleStoryCreate`
  → `createStory` validates `storyCreateSchema` (`shared/src/schema/story-spec.ts:22`:
  required `persona`, `action`, `benefit`, `activityId`; optional `roleId`,
  `description` — there is **no `title`** field; the story name is derived from
  persona/action/benefit). `createStory` writes `DESCRIBES_ACTIVITY` (+ optional
  `STORY_FOR_ROLE`), and enforces the scoped-activity guard: `MATCH (a:Activity
  {id}) WHERE a.id IN $scoped` else `404 story_activity_not_in_model`
  (`stories.ts:157-161`), where `$scoped = scopedNodeIds(driver, modelId)`.
- **AC create** — `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria`
  → `acCreateSchema` (`story-spec.ts:59`: required `given`, `when`, `then`);
  writes `ACCEPTANCE_OF`.
- **Scoped-set guarantee** — `scopedNodeIds` is `(d:Domain)-[:IN_MODEL]->(m)`
  plus transitive `(d)<-[:PART_OF*0..]-(desc)` (verified
  `api/src/storage/model-scope.ts:22-33`). CS `Activity -PART_OF-> UserJourney
  -PART_OF-> Domain(CS)` where CS domain is `IN_MODEL` the operator root, so
  every CS activity is a member — the story guard and the capability STRICT arm
  both accept CS activities **by construction** (B-02).
- **DDD capability** — `POST /api/v1/models/:modelId/capabilities` →
  `handleCapabilityCreate`, `capabilityCreateSchema` (`ddd-system.ts:18`:
  `{name, description?, attributes?}`). Link a source: `PUT
  .../capabilities/:capabilityId/needed-by` with `neededBySchema`
  (`ddd-system.ts:100`: **exactly one** of `{activityId}` or `{storyId}`).
  Support: `PUT .../supported-by` with `{systemId}`. Assign a context: `PUT
  .../context` with `{boundedContextId}`. An out-of-scope activity → `404
  not_found` (STRICT arm, `capabilities.ts` + `scopedNodeIds`).
- **BoundedContext** — no create route; contexts are seeded data
  (`api/src/ontology/seed.ts` `seedBoundedContexts`, MERGE-on-id) or created via
  the generic node path. FR-12 is `should` and assigns capabilities to an
  **existing** bounded context by id (referenced, not created — §4.7); if none
  exists, the context arm of AC-11 is the deferred `should` part, and
  `NEEDS_CAPABILITY` + `SUPPORTED_BY` still prove the mapping.

## 3. Data model

This spec adds **no** compile-time or runtime schema (NFR-01). It writes
instances of existing labels/edges only.

### 3.1 Seed-id block (Rule D)

CS process rows use fixed **UUIDv7** ids in the reserved **`018f0400-0000-7000-8000-…`**
block, disjoint from the metric library's `018f0100` block. The import path
(`nodeCreateSchema`, `id: uuidv7.optional()`) accepts them, and the `MEASURES`/
process edges (`edgeCreateSchema`, `fromId`/`toId: uuidv7`) require them — a
slug id like `cs-onboarding` would fail validation. Sub-blocks (illustrative;
frozen exactly in the fixture at implementation):

| Sub-block | Rows |
|-----------|------|
| `018f0400-…-0001x` | 5 `UserJourney`s |
| `018f0400-…-01xxx` | `Activity`s (per §4.2 roster) |
| `018f0400-…-02xxx` | CS-specific `Role`s |
| `018f0400-…-03xxx` | CS-specific `System`s |

`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES` edge rows carry their own
`018f0400-…-04xxx`/`05xxx`/… edge ids (edge ids are also cross-type-unique per
graph-core). KPIs, SLAs, risks, stories, ACs, capabilities, and `MEASURES` edges
are **not** in the fixture — they are authored via governed routes at seed time
and get **server-generated** ids (§4.3–4.7).

### 3.2 Node instances written (existing labels)

| Label | Origin | How created | Envelope |
|-------|--------|-------------|----------|
| `UserJourney` | fixture | `POST /api/v1/import` | id (fixed), name, description, `attributes` (open) |
| `Activity` | fixture | `POST /api/v1/import` | id, name, description, `attributes` |
| `Role` (CS-specific) | fixture | `POST /api/v1/import` | reference node (model-independent, `model-workspace-core` DEC-01) |
| `System` (CS-specific) | fixture | `POST /api/v1/import` | reference node + `attributes.systemKind` (`system-augmentation-model`, one of `functional`/`agentic`/`ai_predictive`) |
| `KPI` | governed | `POST /api/v1/kpis` | server-gen id, `domain_id` = CS domain id |
| `MetricDefinition` | **referenced only** | — | the four retention metrics from `saas-metric-library` (by their fixed ids) |
| `SLA` | governed | `POST /api/v1/slas` (via `seedSla`) | server-gen id, `domain_id` = CS domain id |
| `UserStory` / `AcceptanceCriterion` | governed | `POST .../stories` + `.../acceptance-criteria` | server-gen ids, top-level Neo4j props |
| `Capability` | governed | `POST .../capabilities` | server-gen id |
| risk row | governed | `POST /api/v1/risk-register` (via `seedRisk`) | Postgres `risk_register` row, server-gen id |

Shared-catalog `Role`/`System` nodes (MOMS, Helm, CRM, data-warehouse,
PagerDuty; the shared CS-lead/owner roles) are **referenced by resolved id**, not
re-created — the fixture's `EXECUTES`/`USES_SYSTEM` edges point at ids the seed
step resolves at seed time (§4.1 step 4).

### 3.3 Edges written (existing types)

| Edge | Endpoints | Where |
|------|-----------|-------|
| `PART_OF` | `UserJourney→Domain`, `Activity→UserJourney` | fixture |
| `PRECEDES` | `Activity→Activity` | fixture (where an order exists) |
| `EXECUTES` | `Role→Activity` | fixture |
| `USES_SYSTEM` | `Activity→System` | fixture |
| `MEASURES` | `KPI→MetricDefinition` | governed, via `linkKpiToMetric` |
| `DESCRIBES_ACTIVITY` | `UserStory→Activity` | governed, by `createStory` |
| `STORY_FOR_ROLE` | `UserStory→Role` (optional) | governed, by `createStory` |
| `ACCEPTANCE_OF` | `AcceptanceCriterion→UserStory` | governed, by `createAc` |
| `NEEDS_CAPABILITY` | `Activity→Capability` / `UserStory→Capability` | governed, `PUT .../needed-by` |
| `SUPPORTED_BY` | `Capability→System` | governed, `PUT .../supported-by` |
| `ASSIGNED_TO_CONTEXT` | `Capability→BoundedContext` | governed, `PUT .../context` |

All endpoint pairs are already in the runtime `EDGE_ENDPOINTS` registry
(validated at write time by `getEdgeEndpoints`); this spec adds none.

### 3.4 No new zod at a REST boundary

The only new zod is the seed step's small internal input shapes (§5.2) —
permissive, internal to the harness, never a REST boundary. All governed writes
reuse the existing route zod (`kpiCreateRequestSchema`, `slaCreateRequestSchema`,
`storyCreateSchema`, `acCreateSchema`, `capabilityCreateSchema`,
`neededBySchema`, `supportedBySchema`, `contextAssignSchema`, and the risk
route's re-parse) — NFR-04.

## 4. Core logic

### 4.1 `seed:customer-success` orchestration (FR-14, FR-15, OQ-4)

`api/scripts/seed-customer-success.ts` — the CLI entrypoint, wired
`bun run seed:customer-success` (§7). It runs the whole CS authoring in order:

1. **Preamble — resolve handles (FR-15).** Two read queries via
   `POST /api/v1/query/cypher` (`query:read`):
   - operator root:
     `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m` → filter in TS on
     `JSON.parse(m.attributes_json).saasOperatorRoot === true` (mirrors the
     foundation's `ensure-operator-root.ts:18-19`) → `operatorRootId`.
   - CS domain:
     `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$operatorRootId}) RETURN d`
     → filter on `JSON.parse(d.attributes_json).seedKey === "customer_success"` →
     `csDomainId`.
   If either is absent → **fail loudly** (the foundation seed must run first).
   `operatorRootId` is the `:modelId` for FR-08 stories + FR-12 DDD; `csDomainId`
   is `domain_id` for KPIs/SLAs and `domain`-lookup subject for risks. Neither is
   hard-coded.
2. **Resolve shared-catalog ids** — for each shared `System`/`Role` the fixture's
   edges reference (MOMS, Helm, CRM, data-warehouse, PagerDuty; the shared
   `customer_success_lead`/`customer_success_owner` roles), resolve its
   server-generated id by `operatorSeedKey` lookup
   (`MATCH (s:System {operatorSeedKey:$k}) RETURN s.id`; same for `:Role`). These
   ids are injected into the fixture's edge `toId`/`fromId` before import (the
   fixture stores shared references as `operatorSeedKey` placeholders the step
   rewrites to concrete ids — see §4.2 note).
3. **Import the process fixture** — POST `customer-success.json`'s resolved
   `{nodes, edges}` to `POST /api/v1/import` (`realImport`, MERGE-on-id). This is
   also the path the foundation loader uses to discover the file on a plain
   `bun run seed:saas-operator` run; the CS step calls it explicitly so the API
   phase can follow deterministically in one command.
4. **KPIs** (§4.3) → **`MEASURES` links** (§4.3) → **stories + ACs** (§4.5) →
   **SLAs** (§4.4a) → **SLA alignments** (§4.4b) → **risks** (§4.6) → **DDD**
   (§4.7). Each governed call is preceded by its idempotency guard (§5.1).

**Ordering rationale (Rule B).** The import must precede KPIs/stories/DDD (they
target the domain + activities); `MEASURES` requires `seed:saas-metric-library`
to have registered the edge type + seeded the four metrics; SLAs/risks require
the domain. The step assumes `seed:saas-operator` (foundation) and
`seed:saas-metric-library` have run — it reads their outputs, never re-creates
them.

> **Two run modes.** Under `bun run seed:saas-operator`, the foundation loader
> imports `customer-success.json` (process content only) with no API phase — the
> six domains + CS process graph appear, but KPIs/SLAs/risks/stories/DDD do not.
> Under `bun run seed:customer-success`, the full CS function is authored
> (process + governed content). AC-01/02/03/04/12 exercise the process content
> (either path); AC-05..AC-11/AC-13 exercise the full step.

### 4.2 CS journeys + activities×roles + systems (FR-01, FR-02, FR-03, FR-04)

The fixture holds five `UserJourney`s, each `PART_OF` the CS domain, with the
**design-frozen** activity roster below (AC-02 asserts exact set-equality — no
missing/extra; this table is authoritative, N-04). `PRECEDES` orders activities
within a journey where a natural sequence exists.

| Journey | Activities (in `PRECEDES` order where ordered) | Executing role(s) | Systems used |
|---------|-----------------------------------------------|-------------------|--------------|
| **Onboarding** | kickoff call → environment provisioning verification → data migration validation → admin training → go-live sign-off | Onboarding Specialist (CS-specific); CS Owner (shared) | MOMS, CS Platform (CS-specific) |
| **Health Scoring** | ingest usage/adoption signals → compute health score → flag at-risk accounts → trigger playbook | Customer Success Manager (CS-specific) | CS Platform, Data Warehouse (shared) |
| **Renewals** | renewal forecast → renewal outreach → contract negotiation → renewal close/expansion | Renewals Manager (CS-specific); CS Lead (shared) | CRM (shared), CS Platform |
| **Churn-Save** | churn-risk detection → save-play execution → executive escalation → win-back offer | Customer Success Manager; CS Owner | CS Platform, CRM |
| **Support Ticketing** | ticket intake/triage → first-response → resolution → escalation to engineering → CSAT survey | Support Agent (CS-specific) | Support/Ticketing System (CS-specific), PagerDuty (shared) |

**CS-specific roles** (`Role` reference nodes, fixed ids in the `018f0400-…-02xxx`
sub-block, model-independent): *Onboarding Specialist*, *Customer Success
Manager*, *Renewals Manager*, *Support Agent*. **Shared roles** referenced by
`operatorSeedKey`: `customer_success_lead` ("Customer Success Lead"),
`customer_success_owner` ("Customer Success Owner") — never re-created (FR-03,
NFR-02).

**CS-specific systems** (`System` reference nodes, `018f0400-…-03xxx`, each with
`attributes.systemKind:"functional"` — a health-scoring engine could later be
`ai_predictive`, but the mandatory-minimum uses `functional`): *CS Platform*
(customer-success/health-scoring platform), *Support/Ticketing System*. **Shared
systems** referenced by `operatorSeedKey`: `moms`, `crm`, `data_warehouse`,
`pagerduty` — never re-created (FR-04, NFR-02).

**Shared-reference edge encoding.** Fixture edges to shared catalog nodes cannot
carry a UUIDv7 `toId`/`fromId` for a node whose id is server-generated. §4.1
step 2 resolves those ids at seed time; the fixture stores the shared endpoint as
a sentinel the step rewrites (an `operatorSeedKey`-keyed placeholder), so the
`{nodes, edges}` POSTed to `realImport` carries only concrete UUIDv7 ids
(`edgeCreateSchema` compliant). CS-specific nodes use their fixed `018f0400` ids
directly.

### 4.3 CS KPIs + `MEASURES` links (FR-05, FR-06, C-05, OQ-1)

For each CS KPI, the step (a) guards on `(name, domain_id)` (§5.1), (b) POSTs
`kpiCreateRequestSchema` to `POST /api/v1/kpis` with `domain_id = csDomainId`,
capturing the server-generated `kpiId`, then (c) calls
`linkKpiToMetric(baseUrl, kpiId, metricId)` (the metric-library helper, C-05) to
write the single `MEASURES` edge.

**Pinned KPI roster (frozen until OQ-1 closes).** The four **unconditional
`must`** KPIs, each linked to its existing metric by fixed id:

| CS KPI (`name`) | `category` | `unit` | `MEASURES` MetricDefinition | metric id |
|-----------------|-----------|--------|-----------------------------|-----------|
| Net Revenue Retention | retention | percent | NRR | `018f0100-…-000000000006` |
| Gross Revenue Retention | retention | percent | GRR | `018f0100-…-000000000007` |
| Logo Churn | retention | percent | Logo Churn | `018f0100-…-000000000008` |
| Revenue Churn | retention | percent | Revenue Churn | `018f0100-…-000000000009` |

**Conditional KPIs (OQ-1 arm a only).** *Health Score*, *CSAT*, *Ticket SLA
Compliance* are authored **iff** `saas-metric-library` publishes
`metric-health-score`/`metric-csat`/`metric-ticket-sla-compliance` (their fixed
ids TBD by that spec). The seed step reads the metric catalog
(`MATCH (m:MetricDefinition {name:$n})`) and, if the three exist, authors the
three KPIs + their `MEASURES` links; if absent, it **skips them and asserts it
registered no ad-hoc `MetricDefinition`** (AC-07 deferred arm). It never invents
metric semantics (XD-06).

**Cardinality (OQ-2 a).** `linkKpiToMetric` rejects a second `MEASURES` from the
same KPI with `kpi_metric_already_linked` (409); this spec authors exactly one
per KPI (AC-06).

### 4.4 CS SLA definitions + alignment (FR-09, FR-10)

**(a) Create (FR-09, AC-09).** Two support-ticket SLA definitions for the Support
Ticketing journey, each built as a `SlaSeedRow` and created via the foundation's
`seedSla(row)` (which `slaCreateRequestSchema.parse`s then POSTs `/api/v1/slas`),
preceded by this spec's own **lookup-by-`name`** guard against `GET /api/v1/slas`
(§5.1, B-03 — `seedSla` has no dedup):

| SLA `name` | `service_type` | `target_value` | `target_unit` | `measurement_window` | `window_duration` | `compliance_threshold` | `domain_id` |
|-----------|----------------|---------------|---------------|----------------------|-------------------|------------------------|-------------|
| CS Ticket First-Response SLA | support | 1 | hours | rolling | 30d | 0.95 | `csDomainId` |
| CS Ticket Resolution SLA | support | 24 | hours | rolling | 30d | 0.90 | `csDomainId` |

(Exact numeric targets frozen in the seed step at implementation; the schema
requires `target_value:number`, `target_unit`/`measurement_window`/
`window_duration:string`, `compliance_threshold:number`.)

**(b) Align (FR-10, AC-16 — `should`).** Each SLA is aligned to the Support
Ticketing journey (or a specific activity) via
`POST /api/v1/sla-alignments` with `{sla_id, target_type:"journey"|"activity",
target_id}` (`slaAlignmentCreateRequestSchema`). If FR-10 is deferred, AC-16
alone defers; AC-09 (create) stays green independently (N-01).

`sla-crud.ts` and `kpi-sla-alignment.ts` are **not edited** (NFR-03).

### 4.5 CS stories + ACs (FR-08, OQ-5 hand-authored)

Hand-authored curated stories via `POST /api/v1/models/:operatorRootId/stories`
(`storyCreateSchema` — `{persona, action, benefit, activityId, roleId?}`; there
is **no `title`** field — the story name is derived server-side from
persona/action/benefit), each `DESCRIBES_ACTIVITY` a CS activity (FR-02) and
optionally `STORY_FOR_ROLE` a CS role. Then ≥1 Given/When/Then per story via
`POST .../stories/:storyId/acceptance-criteria` (`acCreateSchema` — `{given,
when, then}`). Representative roster (frozen at implementation):

| persona | action | benefit | `DESCRIBES_ACTIVITY` | `roleId` |
|---------|--------|---------|----------------------|----------|
| Customer Success Manager | see an account's health score | trigger a save-play before renewal | compute health score | CSM |
| Onboarding Specialist | confirm go-live sign-off | close out onboarding cleanly | go-live sign-off | Onboarding Specialist |
| Renewals Manager | forecast upcoming renewals | prioritize outreach | renewal forecast | Renewals Manager |
| Support Agent | send a CSAT survey after resolution | measure service quality | CSAT survey | Support Agent |

**Scoped-activity guard holds by construction (B-02)** — CS activities are
`PART_OF*` descendants of the CS domain (`IN_MODEL` the operator root), so
`scopedNodeIds(operatorRootId)` includes them; the write is accepted, not `404
story_activity_not_in_model`. **Idempotency** is this spec's guard: lookup a
story by `(persona, action, benefit)` per `DESCRIBES_ACTIVITY` activity before
create (§5.1). The seed fixture carries **no** `UserStory`/`AcceptanceCriterion`
rows (FR-14). `story-spec-core` route/storage code is **not edited** (NFR-03).

### 4.6 CS risks (FR-11, OQ-2)

Three risks via the foundation's `seedRisk(row)`
(`POST /api/v1/risk-register`), preceded by this spec's own
**lookup-by-`(name, domain)`** guard against
`GET /api/v1/risk-register?domain=Customer%20Success` (§5.1, B-03):

| `name` | `risk_type` | `owner` | `domain` | `likelihood`/`impact` | `linked_entity` |
|--------|-------------|---------|----------|------------------------|-----------------|
| Net Churn / Retention Risk | strategic | Customer Success Owner | `Customer Success` | 3 / 5 | Renewals journey (`linked_entity_type:"journey"`, id) |
| Support SLA Breach Risk | operational | Customer Success Owner | `Customer Success` | 3 / 4 | Support Ticketing journey |
| Onboarding Failure Risk | operational | Customer Success Owner | `Customer Success` | 2 / 4 | Onboarding journey |

**Canonical `domain` convention (OQ-2 / C-03).** `createRiskSchema.domain` is
free-text (`risk-register.ts:9`), **not** a graph id; every CS risk carries
`domain:"Customer Success"` — the CS `Domain` node `name` **verbatim**. This is
the de-facto key the wave-3 `cross-function-exec-rollup` cockpit groups risk rows
by; the design records **"`domain` = the function `Domain` node `name` verbatim"
as the canonical convention all six content slices must adopt** so the cockpit's
`GROUP BY domain` is stable across functions (to be confirmed with
`cross-function-exec-rollup` if it needs a stricter `seedKey` slug — OQ-2). The
optional `linked_entity_id` carries the relevant CS journey id (resolved at seed
time). `risk-register.ts` is **not edited** (NFR-03).

### 4.7 CS DDD system mapping (FR-12, OQ-6 representative subset — `should`)

A representative subset of four CS capabilities, each authored via
`POST /api/v1/models/:operatorRootId/capabilities` (`{name, description?}`),
then wired:

| Capability | `NEEDS_CAPABILITY` source | `SUPPORTED_BY` system | `ASSIGNED_TO_CONTEXT` |
|-----------|---------------------------|------------------------|------------------------|
| Health-signal ingestion | Activity: ingest usage/adoption signals | CS Platform / Data Warehouse | an existing bounded context (if seeded) |
| Health-score computation | Activity: compute health score | CS Platform | (optional) |
| Ticket routing | Activity: ticket intake/triage | Support/Ticketing System | (optional) |
| Renewal forecasting | Activity: renewal forecast | CRM | (optional) |

- **needed-by** — `PUT .../capabilities/:capId/needed-by` with `{activityId}`
  (exactly one of `activityId`/`storyId`, `neededBySchema`). The STRICT arm
  resolves the activity through `scopedNodeIds(operatorRootId)` → the CS activity
  is accepted (not `404 not_found`, B-02).
- **supported-by** — `PUT .../supported-by` with `{systemId}` (a CS/shared
  system id resolved at seed time).
- **context** — `PUT .../context` with `{boundedContextId}` referencing an
  **existing** `BoundedContext` (contexts have no create route; seeded via
  `api/src/ontology/seed.ts`). If no suitable context exists, this arm is the
  deferred `should` part of AC-11; `NEEDS_CAPABILITY` + `SUPPORTED_BY` still prove
  the mapping (XD-10 requires it *proven*, not complete — OQ-6). At most one
  context per capability (route enforces single `ASSIGNED_TO_CONTEXT`).

`ddd-system-modeling` route/storage code is **not edited** (NFR-03).

### 4.8 Explicit mapping table (FR-13, XD-10, AC-14)

The primary artifact proving "maps onto the companygraph representation." Each
row names **(a)** the companygraph label/edge, **(b)** the governed route/API,
and **(c)** the expected error code on the failure/idempotency path (AC-14 gate).

| Business action | (a) Label / edge | (b) Route / API | (c) Error code (failure/idempotency) |
|-----------------|------------------|-----------------|--------------------------------------|
| A CS journey (e.g. Onboarding) | `UserJourney` `PART_OF` `Domain` | `POST /api/v1/import` (`realImport`) | `409 model_lifecycle_route_required` if a lifecycle row sneaks in; re-run net-zero (MERGE-on-id) |
| An onboarding step | `Activity` `PART_OF` `UserJourney` | `POST /api/v1/import` | as above |
| Ordered process flow | `PRECEDES` `Activity→Activity` | `POST /api/v1/import` | `400 edge_endpoint_label_mismatch` on a wrong pair |
| A CSM owns a step | `Role` `EXECUTES` `Activity` | `POST /api/v1/import` | `400 edge_endpoint_label_mismatch` |
| A step uses MOMS | `Activity` `USES_SYSTEM` `System` | `POST /api/v1/import` | `400 edge_endpoint_label_mismatch` |
| An NRR target | `KPI` (node) | `POST /api/v1/kpis` | re-run skipped by `(name, domain_id)` guard |
| NRR KPI measures the metric | `KPI` `MEASURES` `MetricDefinition` | `linkKpiToMetric` → `POST /api/v1/edges` | `409 kpi_metric_already_linked` on a 2nd link |
| A CS user story | `UserStory` `DESCRIBES_ACTIVITY` `Activity` (+ `STORY_FOR_ROLE`) | `POST /api/v1/models/:modelId/stories` | `404 story_activity_not_in_model` if the activity is out of scope; `400 story_activity_required` if missing |
| A Given/When/Then | `AcceptanceCriterion` `ACCEPTANCE_OF` `UserStory` | `POST .../stories/:id/acceptance-criteria` | `400 acceptance_criterion_clause_required` |
| A first-response SLA | `SLA` (node) | `POST /api/v1/slas` (via `seedSla`) | re-run skipped by `name` guard |
| SLA aligned to a journey | SLA alignment | `POST /api/v1/sla-alignments` | `404 not_found` if the target is absent |
| A churn risk | `risk_register` row (Postgres) | `POST /api/v1/risk-register` (via `seedRisk`) | re-run skipped by `(name, domain)` guard |
| A health-scoring capability | `Capability` `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` | `POST .../capabilities` + `PUT .../{needed-by,supported-by,context}` | `404 not_found` if the activity is out of scope |

## 5. Server-side logic

This spec adds **no new REST route** and **no new RBAC permission string**. All
writes/reads ride existing routes (§6 table).

### 5.1 Idempotency guards (Rule C, OQ-3, B-03) — feature-owned

The foundation's `seedRisk`/`seedSla` are plain POSTs with no dedup, and there is
**no `seedKpi` helper**; every governed create server-generates the id with no
natural-key MERGE. So each guard lives in `seed-customer-success.ts`, run before
its create:

| Artifact | Natural key | Lookup | On present |
|----------|-------------|--------|-----------|
| KPI | `(name, domain_id)` | `POST /api/v1/query/cypher`: `MATCH (k:KPI {name:$n, domain_id:$d}) RETURN k.id` | skip create; reuse id for `MEASURES` guard |
| `MEASURES` | KPI cardinality | `linkKpiToMetric` internal pre-check | throws `kpi_metric_already_linked` |
| SLA | `name` (globally unique per CS naming) | `GET /api/v1/slas` filter on `name` | skip create |
| risk | `(name, domain)` | `GET /api/v1/risk-register?domain=Customer%20Success` filter on `name` | skip create |
| story | `(persona, action, benefit)` per `DESCRIBES_ACTIVITY` activity | `GET /api/v1/models/:modelId/stories` filter | skip create + its ACs |

A full re-run of `seed:customer-success` is therefore net-zero (AC-05/09/10/08/13).

### 5.2 Seed-input zod (internal, §3.4)

`seed-customer-success.ts` (or a small co-located `cs-catalog.ts`) declares
permissive internal shapes for its own KPI/SLA/risk/story/capability row data
(reusing `systemKindSchema`, `slaCreateRequestSchema`'s input type via the
`SlaSeedRow` alias, and the `RiskSeedRow` interface exported by
`governed-seed-helper.ts`). Never a REST boundary.

## 6. HTTP API surface (no new route)

| Method | Route | Permission (existing) | FR | Role in this spec |
|--------|-------|-----------------------|----|-------------------|
| POST | `/api/v1/import` | `data:write` | FR-01/02/03/04, FR-14 | process-fixture load |
| POST | `/api/v1/query/cypher` | `query:read` | FR-15, §5.1 | id preamble + idempotency lookups |
| POST | `/api/v1/kpis` | `kpi:write` | FR-05 | CS KPI create |
| POST | `/api/v1/edges` | `edge:write` | FR-06 | `MEASURES` link (via `linkKpiToMetric`) |
| POST | `/api/v1/models/:modelId/stories` | `story:write`* | FR-08 | CS story create |
| POST | `/api/v1/models/:modelId/stories/:id/acceptance-criteria` | `story:write`* | FR-08 | AC create |
| POST | `/api/v1/slas` | `sla:write` | FR-09 | SLA create (via `seedSla`) |
| GET | `/api/v1/slas` | `sla:read`* | §5.1 | SLA idempotency lookup |
| POST | `/api/v1/sla-alignments` | `sla:write`* | FR-10 | SLA alignment |
| POST | `/api/v1/risk-register` | `risk:write` | FR-11 | risk create (via `seedRisk`) |
| GET | `/api/v1/risk-register` | `risk:read`* | §5.1 | risk idempotency lookup |
| POST | `/api/v1/models/:modelId/capabilities` | `model:write`* | FR-12 | capability create |
| PUT | `/api/v1/models/:modelId/capabilities/:capId/{needed-by,supported-by,context}` | `model:write`* | FR-12 | capability wiring |

`*` = the exact permission string is whatever the as-built route mapping already
assigns (verified present for `kpi:write`/`sla:write`/`risk:write`/`edge:write`/
`query:read`/`data:write`; the story/DDD/alignment routes carry their owning
spec's existing mapping). This spec adds **zero** new permission string and
**zero** `getRoutePermission` mapping (NFR-04). No new `ERROR_CODES` entry
(`kpi_metric_already_linked` is helper-local, not a wire enum — verified in
`link-kpi-metric.ts`).

## 7. Wiring

- **`package.json`** — add
  `"seed:customer-success": "bun --cwd api scripts/seed-customer-success.ts"`
  (matches the existing `seed:saas-operator` / `seed:saas-metric-library`
  `bun --cwd api scripts/…` form). Sole `package.json` edit.
- **`shared/seed/saas-operator/customer-success.json`** — the CS process fixture
  (`{nodes, edges}`), discoverable by the foundation loader's directory scan
  (no loader edit) and imported by the CS seed step.

## 8. Test strategy

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/customer-success-journeys.integration.test.ts` — five journeys `PART_OF` CS domain, re-run adds zero |
| AC-02 | integration (Neo4j) | `api/__tests__/customer-success-activities.integration.test.ts` — exact §4.2 activity set (no missing/extra), `PRECEDES` present where specified |
| AC-03 | integration (Neo4j) | `api/__tests__/customer-success-roles.integration.test.ts` — every activity has ≥1 `Role` `EXECUTES`; CS-specific roles MERGE-once; shared roles referenced by resolved id, not duplicated |
| AC-04 | integration (Neo4j) | `api/__tests__/customer-success-systems.integration.test.ts` — `USES_SYSTEM` links; shared systems referenced (not re-created); CS-specific systems carry `systemKind`; re-run no dup |
| AC-05 | integration (Neo4j) | `api/__tests__/customer-success-kpis.integration.test.ts` — four retention KPIs via `POST /api/v1/kpis` with `domain_id`; re-run no dup (`(name, domain_id)` guard) |
| AC-06 | integration (Neo4j) | `api/__tests__/customer-success-kpi-measures.integration.test.ts` — `MEASURES` registered precondition (fail-loud if absent); each KPI `MEASURES` exactly one metric by fixed id via `linkKpiToMetric` (not raw POST, C-05); 2nd link → `409 kpi_metric_already_linked` |
| AC-07 | integration (Neo4j) + CLI | `api/__tests__/customer-success-kpi-gap.integration.test.ts` — OQ-1 arm: three CS KPIs authored iff the metrics exist, else absent + no ad-hoc `MetricDefinition` registered; `git diff shared/src/schema` no additions (manual) |
| AC-08 | integration (Neo4j) | `api/__tests__/customer-success-stories.integration.test.ts` — stories via `POST /api/v1/models/:modelId/stories` (resolved modelId, not hard-coded); accepted (not `404 story_activity_not_in_model`); ≥1 Given/When/Then; fixture has no `UserStory`/`AC` rows |
| AC-09 | integration (Neo4j) + CLI | `api/__tests__/customer-success-sla.integration.test.ts` — first-response + resolution SLAs via `POST /api/v1/slas`, in `GET /api/v1/slas`; re-run no dup; `git diff --stat api/src/routes/sla-crud.ts` no change (manual) |
| AC-10 | integration (Postgres) + CLI | `api/__tests__/customer-success-risks.integration.test.ts` — three risks via `POST /api/v1/risk-register` with `domain:"Customer Success"`; `linked_entity_id` points at a real journey/activity; re-run no dup; `git diff --stat api/src/routes/risk-register.ts` no change (manual) |
| AC-11 | integration (Neo4j) + CLI | `api/__tests__/customer-success-ddd.integration.test.ts` — capabilities via `POST .../capabilities` (resolved modelId); `NEEDS_CAPABILITY` accepts CS activity (not `404 not_found`); `SUPPORTED_BY` a system; (where set) `ASSIGNED_TO_CONTEXT`; `git diff --stat` no DDD/story/kpi/sla/risk route change (manual) |
| AC-12 | integration (Neo4j) | `api/__tests__/customer-success-seed-load.integration.test.ts` — fixture loads via `POST /api/v1/import` (no loader edit); only non-lifecycle process rows; a hand-built fixture with a lifecycle row → `409 model_lifecycle_route_required`, nothing written |
| AC-13 | integration (Neo4j + Postgres) | `api/__tests__/customer-success-seed-idempotency.integration.test.ts` — full `seed:customer-success` twice → net-zero; pre/post `/api/v1/stats` retail-root diff = 0; no other slice mutated |
| AC-14 | doc review | manual: open `.claude/specs/customer-success-process-model/design.md` §4.8 — a mapping row per FR-01..FR-12 artifact class, each naming label/edge + route/API + error code |
| AC-15 | CLI | `bun run typecheck` exit 0; `git diff --stat` — changes confined to `shared/seed/saas-operator/customer-success.json`, `api/scripts/seed-customer-success.ts` (+ any co-located seed module), and this spec's tests; no change under `shared/src/schema`, `api/src/routes/{sla-crud,kpi-sla-alignment,risk-register,kpi-crud}.ts`, `api/scripts/seed-saas-operator.ts`, `pwa/src/{route.ts,views/index.tsx}` (manual) |
| AC-16 | integration (Neo4j) + CLI | `api/__tests__/customer-success-sla-alignment.integration.test.ts` — each SLA aligned via `POST /api/v1/sla-alignments`; `git diff --stat api/src/routes/kpi-sla-alignment.ts` no change (manual). If FR-10 deferred, this AC alone defers; AC-09 stays green |

**Preconditions.** The integration tests require `seed:saas-operator` (operator
root + CS domain + shared catalog) and `seed:saas-metric-library` (the four
metrics + `MEASURES` edge type) to have run first; the tests invoke
`seed:customer-success` (or its module functions) against the live stack.
AC-06/AC-07 depend on the metric ids being present.

## 9. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/seed/saas-operator/customer-success.json` | new | FR-01, FR-02, FR-03, FR-04, FR-14 | `{nodes, edges}` process fixture; 5 journeys, activities, CS-specific roles/systems, `PART_OF`/`PRECEDES`/`EXECUTES`/`USES_SYSTEM`; UUIDv7 `018f0400` block; no lifecycle/KPI/SLA/story/DDD rows (§3, §4.2) |
| `api/scripts/seed-customer-success.ts` | new | FR-05, FR-06, FR-08, FR-09, FR-10, FR-11, FR-12, FR-14, FR-15 | CLI: preamble (resolve root+domain) → import → KPIs+`MEASURES` (via `linkKpiToMetric`) → stories+ACs → SLAs+alignments (via `seedSla`) → risks (via `seedRisk`) → DDD; owns all four idempotency guards (§4.1, §5.1) |
| `api/src/seed/customer-success-catalog.ts` | new | FR-05, FR-08, FR-09, FR-11, FR-12 | internal seed-row data + zod input shapes for KPI/SLA/risk/story/capability rows (§5.2); optional — may fold into the script |
| `package.json` | modify | FR-14 | add `seed:customer-success` script (§7) |
| `api/__tests__/customer-success-journeys.integration.test.ts` | new | AC-01 | |
| `api/__tests__/customer-success-activities.integration.test.ts` | new | AC-02 | |
| `api/__tests__/customer-success-roles.integration.test.ts` | new | AC-03 | |
| `api/__tests__/customer-success-systems.integration.test.ts` | new | AC-04 | |
| `api/__tests__/customer-success-kpis.integration.test.ts` | new | AC-05 | |
| `api/__tests__/customer-success-kpi-measures.integration.test.ts` | new | AC-06 | |
| `api/__tests__/customer-success-kpi-gap.integration.test.ts` | new | AC-07 | |
| `api/__tests__/customer-success-stories.integration.test.ts` | new | AC-08 | |
| `api/__tests__/customer-success-sla.integration.test.ts` | new | AC-09 | |
| `api/__tests__/customer-success-risks.integration.test.ts` | new | AC-10 | |
| `api/__tests__/customer-success-ddd.integration.test.ts` | new | AC-11 | |
| `api/__tests__/customer-success-seed-load.integration.test.ts` | new | AC-12 | |
| `api/__tests__/customer-success-seed-idempotency.integration.test.ts` | new | AC-13 | |
| `api/__tests__/customer-success-sla-alignment.integration.test.ts` | new | AC-16 | |

**Explicitly NOT edited** (ownership boundaries — spec-guard must block):
`api/src/routes/{kpi-crud,sla-crud,kpi-sla-alignment,risk-register}.ts`
(kpi-okr-governance / risk-compliance-change); `api/src/routes/stories.ts`,
`api/src/storage/stories.ts`, `api/src/routes/capabilities.ts`,
`api/src/storage/capabilities.ts` (story-spec-core / ddd-system-modeling);
`api/src/seed/{governed-seed-helper,link-kpi-metric,ensure-*}.ts`,
`api/scripts/seed-saas-operator.ts` (saas-operator-foundation /
saas-metric-library — reused as-is, imported not edited);
`shared/src/schema/{nodes,edges}.ts` (no schema-array edit, NFR-01);
`api/src/auth/rbac-permissions.ts` (no new permission, NFR-04);
`api/src/errors.ts` (no new wire code); `pwa/src/route.ts`,
`pwa/src/views/index.tsx`, `SURFACES` (sole-owned by saas-operator-foundation,
XD-05); the metric-library label/edge/view.

## 10. Open Questions (surfaced to the orchestrator)

- **OQ-1 (BLOCKING — user decision).** health-score / CSAT / ticket-SLA-compliance
  `MetricDefinition`s are absent from `saas-metric-library`'s frozen roster;
  XD-06 forbids inventing them here. **This design pins FR-05/FR-06 to the four
  existing retention metrics** and treats the three CS-specific KPIs as
  conditional on OQ-1 option (a) (add the three to `saas-metric-library`,
  owned there). Recommend **(a)**. Until closed, AC-07's "deferred" arm holds and
  this spec registers zero new ontology metric. Must be settled before the KPI
  roster in §4.3/§4.4 finalizes.
- **OQ-2 (design-recorded, confirm with wave 3).** risk `domain =` the function
  `Domain` node `name` verbatim (`"Customer Success"`) — recorded as the canonical
  convention all six content slices adopt; confirm with
  `cross-function-exec-rollup` if it needs a stricter `seedKey` slug.

OQ-3..OQ-6 are closed in this design (§2). No new XD decision is reopened.

## 11. Rejected alternatives

- **Raw `POST /api/v1/edges` for the `MEASURES` link (C-05).** Bypasses the
  metric-library's cardinality pre-check; a second link could slip through.
  Rejected → `linkKpiToMetric` (§4.3), the sanctioned path where AC-06's `409`
  holds.
- **Registering health/CSAT/ticket-SLA `MetricDefinition`s in this slice (OQ-1 c).**
  Violates XD-06 ("content specs must not invent metric semantics") and the
  metric-library's single-catalog ownership. Rejected → defer to OQ-1 (a).
- **Slug-style seed ids (`cs-onboarding`).** The import (`nodeCreateSchema`) and
  edge write (`edgeCreateSchema`, `fromId`/`toId: uuidv7`) require UUIDv7 ids;
  slug ids fail validation. Rejected → fixed UUIDv7 `018f0400` block (§3.1).
- **Foundation loader alone for the whole seed (OQ-4).** The loader only does the
  `{nodes, edges}` import — it cannot make the KPI/SLA/risk/story/DDD API calls.
  Rejected → a feature-owned `seed:customer-success` step (§4.1).
- **Bootstrap-derived stories (OQ-5).** `story-spec-core`'s `bootstrap` derives
  one generic story per activity; CS wants curated, domain-meaningful
  Given/When/Then. Rejected → hand-authored (§4.5).
- **Exhaustive per-activity DDD coverage (OQ-6).** XD-10 requires the mapping
  *proven*, not complete. Rejected → representative four-capability subset (§4.7).
- **Editing a governed route to MERGE for idempotency.** Every governed route is
  owned elsewhere (XD-04). Rejected → feature-owned lookup-before-create guards
  (§5.1).

## 12. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 (five CS journeys) | §3.2, §4.2 | AC-01, AC-12, AC-13 |
| FR-02 (activities + `PRECEDES`) | §4.2 | AC-02 |
| FR-03 (roles `EXECUTES`) | §3.2, §4.2 | AC-03 |
| FR-04 (systems `USES_SYSTEM`) | §3.2, §4.2 | AC-04 |
| FR-05 (CS KPIs via `POST /kpis`) | §4.3, §5.1 | AC-05, AC-07 |
| FR-06 (`MEASURES` via `linkKpiToMetric`) | §4.3 | AC-06 |
| FR-07 (metric-library gap, OQ-1) | §4.4 (conditional arm), §10 | AC-07 |
| FR-08 (stories + ACs) | §4.5, §2.1 | AC-08 |
| FR-09 (SLA create) | §4.4a, §5.1 | AC-09 |
| FR-10 (SLA alignment) | §4.4b | AC-16 |
| FR-11 (risks) | §4.6, §5.1 | AC-10 |
| FR-12 (DDD mapping) | §4.7 | AC-11 |
| FR-13 (mapping table) | §4.8 | AC-14 |
| FR-14 (seed slice + step) | §4.1, §7, §9 | AC-12, AC-13, AC-15 |
| FR-15 (seed-preamble id resolution) | §4.1 | AC-08, AC-11 |
| NFR-01 (no new store/labels) | §3, §9 | AC-07, AC-15 |
| NFR-02 (idempotency + retail isolation) | §4.1, §5.1 | AC-01, AC-03, AC-04, AC-05, AC-09, AC-10, AC-13 |
| NFR-03 (ownership boundaries) | §9 | AC-09, AC-10, AC-11, AC-15, AC-16 |
| NFR-04 (house rules) | §5.2, §6 | AC-15 |
| NFR-05 (no PWA surface) | §9 (no `pwa/` file) | AC-15 |
