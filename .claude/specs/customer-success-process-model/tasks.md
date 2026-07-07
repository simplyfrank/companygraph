---
feature: "customer-success-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
reviewing_design_revision: 1
size: "medium"
total_tasks: 16
---

# Tasks: customer-success-process-model

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Deferred-green rule**: this is a **content/seed slice** — every write rides
  the loopback API on `127.0.0.1:8787`, so all behaviour tests are
  `*.integration.test.ts` needing a running API + Neo4j + Postgres
  (`bun run dev`). At each behaviour task's checkpoint run `bun run typecheck`;
  the `*.integration.test.ts` files run green under `bun test:integration` once
  the stack is up **and** the two upstream seeds have run (`seed:saas-operator`,
  `seed:saas-metric-library`). There is **no** PWA slice (NFR-05) — no
  `bun test` component task, no `design-conformance` run, no Playwright spec.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed `*.integration.test.ts` under
  `bun test:integration`.
- **Ownership guard (XD-04/XD-05/XD-08/NFR-01/NFR-03)**: the files under
  "Explicitly NOT edited" in design §9 are off-limits —
  `api/src/routes/{kpi-crud,sla-crud,kpi-sla-alignment,risk-register}.ts`,
  `api/src/routes/stories.ts`, `api/src/storage/stories.ts`,
  `api/src/routes/capabilities.ts`, `api/src/storage/capabilities.ts`,
  `api/src/seed/{governed-seed-helper,link-kpi-metric,ensure-*}.ts`,
  `api/scripts/seed-saas-operator.ts`, `shared/src/schema/{nodes,edges}.ts`,
  `api/src/auth/rbac-permissions.ts`, `api/src/errors.ts`,
  `pwa/src/route.ts`, `pwa/src/views/index.tsx`, and the `SURFACES` list.
  **No task edits any of them.** The foundation's `seedSla`/`seedRisk` and the
  metric-library's `linkKpiToMetric` are **imported, never edited**.

## Design-basis pins (design rev 1 approved)

Design rev 1 is `approved` (`review-design.md` pass 1 = **approve**, zero
blockers). The binding decisions the implementer must not re-derive:

| Design decision (rev 1) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **`MEASURES` link via `linkKpiToMetric` (§4.3, C-05 resolved)** — the KPI→MetricDefinition edge is written **only** through the metric-library's exported `linkKpiToMetric(baseUrl, kpiId, metricId)` helper (`api/src/seed/link-kpi-metric.ts`), which runs the cardinality pre-check then POSTs to `POST /api/v1/edges`. **Never** a raw `POST /api/v1/edges` from this spec. | Import the helper; no hand-rolled edge POST for `MEASURES`. | T-05, T-06 |
| **Four-metric pinned KPI roster (§4.3)** — the unconditional `must` KPIs are exactly **NRR / GRR / Logo Churn / Revenue Churn**, each `MEASURES` one existing metric by fixed id (NRR `018f0100-…-000000000006`, GRR `…7`, Logo Churn `…8`, Revenue Churn `…9`). | Roster is frozen; edit §4.3 + AC-05/AC-06 tests together if it changes. | T-04, T-05, T-06 |
| **Fixed UUIDv7 seed-id block `018f0400-…` (§3.1, Rule D)** — all CS process rows (journeys/activities/CS-specific roles/CS-specific systems + their edges) carry fixed UUIDv7 ids in the `018f0400` block, disjoint from the metric library's `018f0100` block. Slug ids (`cs-onboarding`) fail `nodeCreateSchema`/`edgeCreateSchema` validation. | Fixed UUIDv7 ids only, `018f0400` block. | T-02 |
| **Feature-owned `seed:customer-success` step (§4.1, OQ-4)** — preamble (resolve root+domain) → import → KPIs+`MEASURES` → stories+ACs → SLAs+alignments → risks → DDD, in that order. Not the foundation loader alone. | Feature owns the seed CLI + fixture path `shared/seed/saas-operator/customer-success.json`. | T-03, T-13 |
| **Feature-owned idempotency guards (§5.1, OQ-3, B-03)** — natural keys: KPI `(name, domain_id)`; SLA `name`; risk `(name, domain)`; story `(persona, action, benefit)` per `DESCRIBES_ACTIVITY` activity. `linkKpiToMetric` self-guards `MEASURES`. All live in this spec's seed step (the foundation helpers are plain POSTs with no dedup; there is no `seedKpi`). | Lookup-before-create in the seed step; no governed-route MERGE edit. | T-05, T-07, T-08, T-09 |
| **risk `domain = "Customer Success"` verbatim (§4.6, OQ-2)** — `createRiskSchema.domain` is free-text; every CS risk carries the CS `Domain` node `name` verbatim as the canonical cockpit `GROUP BY domain` key. | `domain:"Customer Success"` on every risk row. | T-09 |
| **Hand-authored stories, representative DDD subset (§4.5, §4.7, OQ-5/OQ-6)** — curated Given/When/Then stories via the story route (not `bootstrap`); four representative CS capabilities (not exhaustive per-activity). | Hand-authored stories; four capabilities. | T-08, T-10 |
| **No new schema/store/route/view/RBAC/error-code (§3, §5, §6, NFR-01/NFR-04/NFR-05)** — zero `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` edit, zero runtime registry label/edge, zero new REST route, zero `pwa/` file, zero RBAC permission string, zero `ERROR_CODES` entry. | Compose only; all boundaries in §9 "NOT edited". | every task |

Full rationale: design §2 (prior-review resolution table), §2.1 (interface
verification), §3.1–§3.4, §4.1–§4.8, §5.1–§5.2, §6, and `review-design.md`
(C-01/C-02, N-01/N-02/N-03).

## Open design concerns — pinned decisions (from review-design.md)

Design review pass 1 (`approve`) left two Concerns and three Nits for the tasks
author to pin. All are landed below; none reopens the architecture.

| Concern / Nit | Decision | Rationale | Locked in task |
|---------------|----------|-----------|----------------|
| **C-01** — OQ-1 flagged BLOCKING, but the design is fully buildable on the four-metric roster without it | **OQ-1 is downgraded to "non-blocking for this spec's build."** Implementation proceeds to completion on the **four retention KPIs** with zero dependency on OQ-1's answer; the three CS-specific KPIs are a **conditional per-metric arm** (T-06) that authors each iff its metric exists. OQ-1 stays surfaced to the user (it is a real cross-spec product decision owned by `saas-metric-library`), but it does **not** gate T-01…T-16. | Only three optional KPIs hinge on OQ-1; the pinned roster + conditional arm cover both outcomes. | T-05, T-06 |
| **C-02** — the conditional-KPI arm's metric lookup predicate + partial-publication behaviour were underspecified | **The conditional arm looks up each of the three metrics by `attributes.seedKey`** (the stable contract, not the display `name`): `metric-health-score`, `metric-csat`, `metric-ticket-sla-compliance`. Behaviour is **per-metric, not all-or-nothing** — the step authors each CS-specific KPI **independently** based on its own metric's presence. AC-07 asserts per-metric: for each of the three, either it exists → its KPI is authored + `MEASURES` it, or it is absent → the KPI is absent and no ad-hoc `MetricDefinition` was registered. | Fully specifies the conditional arm for the tasks phase without reopening OQ-1; per-metric arm is robust to partial publication. | T-06 |
| **N-01** (nit) — the SLA idempotency lookup `GET /api/v1/slas` has **no** server-side `name` filter | **The SLA guard fetches the full list and filters `name` client-side** (`handleSlaList` supports only `?include_archived`, verified `sla-crud.ts:96-97`). The risk guard likewise fetches `GET /api/v1/risk-register?domain=Customer%20Success` (that route **does** filter by `domain`) and matches `name` client-side. | Prevents a reader mistaking the SLA guard for a query-param filter that does not exist. | T-07, T-09 |
| **N-02** (nit) — §4.3's "(OQ-2 a)" cardinality tag collides with this spec's own OQ-2 | The KPI↔metric single-link cardinality is **`saas-metric-library` OQ-2 (a)**, not this spec's OQ-2 (the risk `domain` key). Tests/comments say "`saas-metric-library` OQ-2 (a)" when referring to the cardinality guard. | Disambiguates two specs' OQ-2. | T-05 |
| **N-03** (nit) — the story idempotency key changed from requirements' "title-per-activity" to `(persona, action, benefit)` | **`(persona, action, benefit)` per `DESCRIBES_ACTIVITY` activity supersedes requirements' "title-per-activity"** — `storyCreateSchema` has **no `title`** field (verified `story-spec.ts:22-33`); the story name is derived server-side from persona/action/benefit. | The right key given no `title` exists; noted so the tasks reviewer does not flag drift. | T-08 |

## Preconditions (upstream seeds — not this spec's tasks)

Every integration test and the seed step itself require, in the live stack:

1. `seed:saas-operator` (foundation) has run — the **"SaaS Operator"
   `BusinessModel` root**, the **`Customer Success` `Domain`** (`attributes.seedKey
   = "customer_success"`), and the **shared System/Persona/Role catalog** (MOMS,
   CRM, data-warehouse, PagerDuty; the shared CS-lead/owner roles) exist.
2. `seed:saas-metric-library` has run — the **`MEASURES` edge type +
   `KPI→MetricDefinition` endpoint pair** are registered, and the **four
   retention `MetricDefinition`s** (NRR/GRR/Logo Churn/Revenue Churn) exist at
   their fixed `018f0100` ids.

If (1) is absent, the FR-15 preamble (T-03) **fails loudly**. If (2) is absent,
the `MEASURES` link (T-05) **fails loudly** (AC-06 registration precondition) —
never a silent skip.

## Task list

### T-01 — CS seed-row catalog data + internal zod input shapes

- **Files** (1): `api/src/seed/customer-success-catalog.ts` (new)
- **Implements**: design §3.4, §4.2, §4.3, §4.4, §4.5, §4.6, §4.7, §5.2 —
  supports FR-05, FR-08, FR-09, FR-11, FR-12
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-02, T-05, T-06, T-07, T-08, T-09, T-10
- **Steps**: pure data + internal shapes — no driver, no fetch.
  1. Export the **internal (non-REST) zod input shapes** (§3.4, §5.2) for the
     seed step's own row data: `CsKpiRow`, `CsSlaRow` (aliasing the exported
     `SlaSeedRow = z.input<slaCreateRequestSchema>`), `CsRiskRow` (matching the
     exported `RiskSeedRow` interface from `governed-seed-helper.ts`),
     `CsStoryRow`, `CsCapabilityRow`. These are **internal to the harness** —
     never a REST boundary shape; every governed write reuses the route's
     as-built zod (`kpiCreateRequestSchema`, `slaCreateRequestSchema`,
     `storyCreateSchema`, `acCreateSchema`, `capabilityCreateSchema`,
     `neededBySchema`, `supportedBySchema`, `contextAssignSchema`, the risk
     route's re-parse). `zod` only, en-US identifiers.
  2. Export the **frozen four-metric KPI roster** `CS_KPIS` — exactly the §4.3
     table: NRR / GRR / Logo Churn / Revenue Churn, each with `name`,
     `category:"retention"`, `unit:"percent"`, `target_value`,
     `target_direction`, `measurement_frequency`, and its `MEASURES` metric id
     (`018f0100-…-000000000006..9`, copied **verbatim** from §4.3). Export the
     **conditional roster** `CS_CONDITIONAL_KPIS` (Health Score / CSAT / Ticket
     SLA Compliance) keyed by metric `seedKey` (`metric-health-score`,
     `metric-csat`, `metric-ticket-sla-compliance`) — authored per-metric only
     if present (C-02, T-06).
  3. Export the **SLA roster** `CS_SLAS` (§4.4a: CS Ticket First-Response SLA,
     CS Ticket Resolution SLA — the frozen `service_type`/`target_value`/
     `target_unit`/`measurement_window`/`window_duration`/`compliance_threshold`
     values), the **risk roster** `CS_RISKS` (§4.6: Net Churn/Retention Risk,
     Support SLA Breach Risk, Onboarding Failure Risk — each
     `domain:"Customer Success"`), the **story roster** `CS_STORIES` (§4.5 table
     of `{persona, action, benefit, activityRef, roleRef?}` + ≥1 Given/When/Then
     each), and the **capability roster** `CS_CAPABILITIES` (§4.7: four
     capabilities + their `neededBy`/`supportedBy`/`context` refs). Refs to
     activities/systems/roles are **seed-key/UUIDv7 references** the seed step
     (T-03) resolves — not concrete server-generated ids.
- **Verification**: `api/__tests__/customer-success-catalog.integration.test.ts`
  (jointly with T-05…T-10) imports `CS_KPIS`/`CS_SLAS`/`CS_RISKS`/`CS_STORIES`/
  `CS_CAPABILITIES`, asserts each parses its internal shape, every `name` is
  unique within its roster, `CS_KPIS` has exactly the four retention entries,
  and every risk row carries `domain:"Customer Success"`. At checkpoint
  `bun run typecheck` passes.

### T-02 — CS process fixture (journeys/activities/roles/systems + edges)

- **Files** (1): `shared/seed/saas-operator/customer-success.json` (new)
- **Implements**: design §3.1, §3.2, §3.3, §4.2 — closes AC-01, AC-02, AC-03,
  AC-04 (fixture source), AC-12 (fixture shape); supports FR-01, FR-02, FR-03,
  FR-04, FR-14
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-03
- **Steps**: author the `{nodes, edges}` process fixture, discoverable by the
  foundation loader's directory scan (**no loader edit**) and imported by the
  seed step (T-03).
  1. **Nodes** — five `UserJourney`s (Onboarding, Health Scoring, Renewals,
     Churn-Save, Support Ticketing), all `Activity`s from the §4.2 roster
     (set-equality is asserted by AC-02 — this roster is authoritative, no
     missing/extra), the **CS-specific** `Role`s (Onboarding Specialist,
     Customer Success Manager, Renewals Manager, Support Agent) and
     **CS-specific** `System`s (CS Platform, Support/Ticketing System, each
     carrying the **required** `attributes.systemKind:"functional"` — verified
     required, `system-kind.ts:30`). All carry **fixed UUIDv7 ids** in the
     `018f0400-…` block (§3.1, Rule D) — slug ids fail validation.
  2. **Edges** — `PART_OF` (UserJourney→Domain, Activity→UserJourney), `PRECEDES`
     (Activity→Activity, where §4.2 specifies an order), `EXECUTES` (Role→
     Activity), `USES_SYSTEM` (Activity→System), each with its own `018f0400-…`
     edge id (cross-type-unique per graph-core).
  3. **Shared-reference encoding (§4.2 note)** — edges pointing at **shared
     catalog** nodes (the CS domain itself; MOMS/CRM/data-warehouse/PagerDuty
     systems; the shared `customer_success_lead`/`customer_success_owner` roles)
     store the endpoint as an **`operatorSeedKey`-keyed sentinel placeholder**
     the seed step (T-03) rewrites to the resolved id before POSTing to
     `realImport` — because those nodes' ids are server-generated, not fixed.
     CS-specific endpoints use their `018f0400` ids directly.
  4. **Contains only process rows** — **no** lifecycle rows
     (`BusinessModel`/`ModuleInstance`/`IN_MODEL`/`INSTANTIATES`), **no**
     `KPI`/`SLA`/`MEASURES`/`UserStory`/`AcceptanceCriterion`/`Capability` rows
     (those are authored via governed routes at seed time, FR-14). The `Domain`
     node itself is **not** created here (foundation owns it) — only referenced.
- **Verification**: `api/__tests__/customer-success-seed-load.integration.test.ts`
  (AC-12) — the fixture imports via `POST /api/v1/import` (no loader edit),
  writing only non-lifecycle process rows; manual:
  `git grep -nE '"label":\s*"(BusinessModel|ModuleInstance|KPI|SLA|UserStory|AcceptanceCriterion|Capability)"' shared/seed/saas-operator/customer-success.json`
  returns nothing (fixture carries no governed/lifecycle rows). At checkpoint
  `bun run typecheck` passes. Deferred-green: `bun test:integration`.

### T-03 — `seed:customer-success` CLI: FR-15 preamble + shared-id resolve + import

- **Files** (2): `api/scripts/seed-customer-success.ts` (new),
  `package.json` (modify)
- **Implements**: design §4.1 (steps 1–3), §7, §5.1 — closes AC-12 (real
  import), AC-15 (script wiring); supports FR-14, FR-15
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-04, T-05, T-06, T-07, T-08, T-09, T-10
- **Steps**: the `bun run seed:customer-success` CLI entrypoint (§4.1), sibling
  to `api/scripts/seed-saas-operator.ts`.
  1. **Preamble — resolve handles (FR-15, §4.1 step 1)** via two
     `POST /api/v1/query/cypher` (`query:read`) reads:
     - operator root: `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m`
       → filter in TS on `JSON.parse(m.attributes_json).saasOperatorRoot === true`
       (mirrors `ensure-operator-root.ts:18-19`) → `operatorRootId`.
     - CS domain: `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$operatorRootId}) RETURN d`
       → filter on `JSON.parse(d.attributes_json).seedKey === "customer_success"`
       → `csDomainId`.
     If either is absent → **fail loudly** (foundation seed must run first).
     Neither is hard-coded (AC-15).
  2. **Resolve shared-catalog ids (§4.1 step 2)** — for each `operatorSeedKey`
     sentinel the fixture (T-02) references (MOMS, CRM, data-warehouse,
     PagerDuty; `customer_success_lead`/`customer_success_owner`), resolve its
     server-generated id via `MATCH (s:System {operatorSeedKey:$k}) RETURN s.id`
     (and `:Role` equivalent). Rewrite the fixture's sentinel endpoints to
     concrete UUIDv7 ids in-memory.
  3. **Import (§4.1 step 3)** — POST the resolved `{nodes, edges}` to
     `POST /api/v1/import` (`realImport`, MERGE-on-id); surface a non-2xx as a
     script failure (a `409 model_lifecycle_route_required` means a malformed
     fixture row, AC-12).
  4. **Wiring** — add
     `"seed:customer-success": "bun --cwd api scripts/seed-customer-success.ts"`
     to the root `package.json` `scripts` (§7 form, matching
     `"seed:saas-operator"`). Sole `package.json` edit. **Leave the
     KPI/story/SLA/risk/DDD phases as stubs called in order** (T-05…T-10 fill
     them); the script's phase ordering (preamble → import → KPIs+`MEASURES` →
     stories+ACs → SLAs+alignments → risks → DDD) is fixed here (Rule B).
- **Verification**: `api/__tests__/customer-success-seed-load.integration.test.ts`
  (AC-12) — running the preamble+import phase resolves `operatorRootId`/
  `csDomainId` from the live graph (not hard-coded) and imports the fixture; an
  absent foundation root → the step throws; manual:
  `cat package.json | grep 'seed:customer-success'` shows the entry (AC-15). At
  checkpoint `bun run typecheck` passes. Deferred-green: `bun test:integration`.

### T-04 — Process-content integration tests (journeys/activities/roles/systems)

- **Files** (4):
  `api/__tests__/customer-success-journeys.integration.test.ts` (new),
  `api/__tests__/customer-success-activities.integration.test.ts` (new),
  `api/__tests__/customer-success-roles.integration.test.ts` (new),
  `api/__tests__/customer-success-systems.integration.test.ts` (new)
- **Implements**: design §4.2, §8 — closes AC-01, AC-02, AC-03, AC-04; supports
  FR-01, FR-02, FR-03, FR-04, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: —
- **Steps**: after the preamble+import phase of `seed:customer-success` (T-03):
  - **AC-01** (journeys) — the five `UserJourney`s are `PART_OF` the CS domain;
    a re-run adds zero (MERGE-on-id idempotency, NFR-02).
  - **AC-02** (activities) — the seeded activity set **equals** the §4.2 roster
    exactly (no missing, no extra — set-equality), and `PRECEDES` edges exist
    where §4.2 specifies an order.
  - **AC-03** (roles) — every activity has ≥1 `Role` `EXECUTES` it; CS-specific
    roles MERGE-once on re-run; shared roles are referenced by resolved id, **not
    duplicated** (assert the shared `customer_success_lead`/`owner` node count is
    unchanged).
  - **AC-04** (systems) — `USES_SYSTEM` links exist; shared systems (MOMS/CRM/
    data-warehouse/PagerDuty) are referenced (not re-created — count unchanged);
    CS-specific systems carry `attributes.systemKind`; a re-run adds no
    duplicate.
- **Verification**: the four listed `api/__tests__/customer-success-{journeys,
  activities,roles,systems}.integration.test.ts` (AC-01…AC-04) — run under
  `bun test:integration` with the seeded stack up. Deferred-green.

### T-05 — CS KPIs + `MEASURES` links (four retention KPIs) in the seed step

- **Files** (1): `api/scripts/seed-customer-success.ts` (extend from T-03)
- **Implements**: design §4.3 (four-metric arm), §5.1 (KPI guard) — closes
  AC-05, AC-06; supports FR-05, FR-06
- **Complexity**: moderate
- **Blocked by**: T-01, T-03
- **Blocks**: T-11
- **Steps**: the KPI phase of the seed step, for each `CS_KPIS` row (T-01):
  1. **Idempotency guard (§5.1)** — `POST /api/v1/query/cypher`
     `MATCH (k:KPI {name:$n, domain_id:$d}) RETURN k.id`; if present, reuse the
     id and skip the create.
  2. **Create** — else POST `kpiCreateRequestSchema` to `POST /api/v1/kpis`
     (`kpi:write`) with `domain_id = csDomainId`; capture the server-generated
     `kpiId` (`handleKpiPost` does a plain `CREATE`, no MERGE — verified
     `kpi-crud.ts:43,51`).
  3. **`MEASURES` link (C-05)** — call `linkKpiToMetric(baseUrl, kpiId, metricId)`
     (imported from `api/src/seed/link-kpi-metric.ts`; the metric id is the
     row's fixed `018f0100` id). Never a raw `POST /api/v1/edges`. The helper's
     pre-check rejects a second `MEASURES` from the same KPI with
     `kpi_metric_already_linked` (409) — `saas-metric-library` OQ-2 (a) (N-02).
     If the `MEASURES` edge type / metric are not yet registered, the write
     **fails loudly** (AC-06 registration precondition — never a silent skip).
- **Verification**:
  - `api/__tests__/customer-success-kpis.integration.test.ts` (AC-05) — the four
    retention KPIs exist via `POST /api/v1/kpis` with `domain_id = csDomainId`; a
    re-run adds zero (the `(name, domain_id)` guard, B-03).
  - `api/__tests__/customer-success-kpi-measures.integration.test.ts` (AC-06) —
    with the `MEASURES` type registered, each KPI `MEASURES` **exactly one**
    metric by fixed id (written via `linkKpiToMetric`, not a raw POST, C-05); a
    second link → `409 kpi_metric_already_linked`; a run **before** registration
    fails loudly.
  Deferred-green: `bun test:integration`.

### T-06 — Conditional CS-specific KPIs (per-metric arm, OQ-1) + gap test

- **Files** (2): `api/scripts/seed-customer-success.ts` (extend from T-05),
  `api/__tests__/customer-success-kpi-gap.integration.test.ts` (new)
- **Implements**: design §4.3 (conditional arm), §10 (OQ-1) +
  `review-design.md` C-01/C-02 — closes AC-07; supports FR-05, FR-07, NFR-01
- **Complexity**: moderate
- **Blocked by**: T-01, T-05
- **Blocks**: —
- **Steps**: the **per-metric conditional arm** (C-02 — per-metric, not
  all-or-nothing). For each of the three `CS_CONDITIONAL_KPIS`
  (Health Score / CSAT / Ticket SLA Compliance):
  1. **Lookup by `seedKey`** (C-02 — the stable contract, not the display
     `name`) via `POST /api/v1/query/cypher`:
     `MATCH (m:MetricDefinition) WHERE m.attributes_json CONTAINS $seedKey RETURN m`
     then confirm `JSON.parse(m.attributes_json).seedKey === $seedKey`
     (`metric-health-score` / `metric-csat` / `metric-ticket-sla-compliance`).
  2. **If present** → author its CS KPI (same guard + `POST /api/v1/kpis` +
     `linkKpiToMetric` path as T-05).
  3. **If absent** → skip **that one** KPI (independent per-metric decision); do
     **not** register an ad-hoc `MetricDefinition` (XD-06, NFR-01).
- **Verification**: `api/__tests__/customer-success-kpi-gap.integration.test.ts`
  (AC-07) — **per-metric** assertion: for each of the three, either (present) its
  KPI is authored and `MEASURES` its metric, or (absent) its KPI is absent; and
  in all cases this spec registered **no** new `MetricDefinition` — manual:
  `git diff --stat shared/src/schema` shows no additions and the
  `MetricDefinition` node count is unchanged from the metric-library seed
  (NFR-01). Deferred-green: `bun test:integration`.

### T-07 — CS SLA definitions (+ alignment) in the seed step

- **Files** (1): `api/scripts/seed-customer-success.ts` (extend from T-03)
- **Implements**: design §4.4a, §4.4b, §5.1 (SLA guard) + `review-design.md`
  N-01 — closes AC-09, AC-16; supports FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: T-01, T-03
- **Blocks**: T-11
- **Steps**: the SLA phase of the seed step:
  1. **Idempotency guard (§5.1, N-01)** — `GET /api/v1/slas` (which supports
     only `?include_archived`, no `name` filter — verified `sla-crud.ts:96-97`),
     then filter `name` **client-side**; skip create if present.
  2. **Create (FR-09)** — for each `CS_SLAS` row build a `SlaSeedRow` and call
     the foundation's `seedSla(row)` (imported from `governed-seed-helper.ts`;
     it `slaCreateRequestSchema.parse`s then POSTs `POST /api/v1/slas`) with
     `domain_id = csDomainId`.
  3. **Align (FR-10 `should`, §4.4b)** — for each created SLA, POST
     `{sla_id, target_type:"journey", target_id: <Support Ticketing journey id>}`
     (or a specific activity) to `POST /api/v1/sla-alignments`
     (`slaAlignmentCreateRequestSchema`). A missing target → `404 not_found`
     surfaces. FR-10 is `should` — if deferred, AC-16 alone defers; AC-09 (create)
     stays green independently (N-01 split).
  `sla-crud.ts` and `kpi-sla-alignment.ts` are **not edited** (NFR-03).
- **Verification**:
  - `api/__tests__/customer-success-sla.integration.test.ts` (AC-09) —
    first-response + resolution SLAs created via `POST /api/v1/slas` with
    `domain_id`, present in `GET /api/v1/slas`; a re-run adds no duplicate
    (client-side `name` guard); manual:
    `git diff --stat api/src/routes/sla-crud.ts` shows no change (NFR-03).
  - `api/__tests__/customer-success-sla-alignment.integration.test.ts` (AC-16) —
    each SLA aligned via `POST /api/v1/sla-alignments`; manual:
    `git diff --stat api/src/routes/kpi-sla-alignment.ts` shows no change. If
    FR-10 deferred, this AC alone defers.
  Deferred-green: `bun test:integration`.

### T-08 — CS stories + Given/When/Then ACs in the seed step

- **Files** (1): `api/scripts/seed-customer-success.ts` (extend from T-03)
- **Implements**: design §4.5, §5.1 (story guard), §2.1 + `review-design.md`
  N-03 — closes AC-08; supports FR-08, FR-15
- **Complexity**: moderate
- **Blocked by**: T-01, T-03
- **Blocks**: —
- **Steps**: the story phase, using the resolved `operatorRootId` as `:modelId`
  (FR-15 — never hard-coded):
  1. **Idempotency guard (§5.1, N-03)** — for each `CS_STORIES` row,
     `GET /api/v1/models/:operatorRootId/stories` then match
     `(persona, action, benefit)` **per `DESCRIBES_ACTIVITY` activity**
     client-side (this key supersedes requirements' "title-per-activity" — there
     is **no `title`** field on `storyCreateSchema`, N-03); skip the story + its
     ACs if present.
  2. **Create story** — else POST `storyCreateSchema`
     (`{persona, action, benefit, activityId, roleId?}` — **no `title`**) to
     `POST /api/v1/models/:operatorRootId/stories`, resolving `activityId` from
     the §4.5 activity ref (a CS activity, so it is in
     `scopedNodeIds(operatorRootId)` **by construction** — accepted, not
     `404 story_activity_not_in_model`, B-02).
  3. **Create ≥1 AC** — POST `acCreateSchema` (`{given, when, then}`) to
     `POST .../stories/:storyId/acceptance-criteria` for each Given/When/Then in
     the row.
  `story-spec-core` route/storage code is **not edited** (NFR-03); the fixture
  (T-02) carries **no** `UserStory`/`AcceptanceCriterion` rows (FR-14).
- **Verification**: `api/__tests__/customer-success-stories.integration.test.ts`
  (AC-08) — stories created via `POST /api/v1/models/:modelId/stories` (resolved
  modelId, not hard-coded); accepted (not `404 story_activity_not_in_model`);
  each carries ≥1 Given/When/Then; a re-run adds no duplicate; the fixture has
  no `UserStory`/`AC` rows. Deferred-green: `bun test:integration`.

### T-09 — CS risks in the seed step

- **Files** (1): `api/scripts/seed-customer-success.ts` (extend from T-03)
- **Implements**: design §4.6, §5.1 (risk guard) + `review-design.md` N-01 —
  closes AC-10; supports FR-11, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-01, T-03
- **Blocks**: T-11
- **Steps**: the risk phase, for each `CS_RISKS` row (T-01):
  1. **Idempotency guard (§5.1, N-01)** — `GET /api/v1/risk-register?domain=Customer%20Success`
     (that route **does** filter by `domain`, verified `risk-register.ts:47`),
     then match `name` **client-side**; skip if present.
  2. **Create (FR-11)** — else build a `RiskSeedRow` and call the foundation's
     `seedRisk(row)` (imported from `governed-seed-helper.ts`; POSTs
     `POST /api/v1/risk-register`) with **`domain:"Customer Success"`** verbatim
     (OQ-2), `owner`/`likelihood`/`impact`/`status`/`trend` per §4.6, and
     `linked_entity_type`/`linked_entity_id` pointing at the resolved CS journey
     id (Renewals / Support Ticketing / Onboarding).
  `risk-register.ts` is **not edited** (NFR-03).
- **Verification**: `api/__tests__/customer-success-risks.integration.test.ts`
  (AC-10) — three risks created via `POST /api/v1/risk-register` with
  `domain:"Customer Success"`; each `linked_entity_id` points at a real CS
  journey/activity; a re-run adds no duplicate (client-side `name` guard within
  the `domain` filter); manual: `git diff --stat api/src/routes/risk-register.ts`
  shows no change (NFR-03). Deferred-green: `bun test:integration` (needs
  Postgres up).

### T-10 — CS DDD capabilities + wiring in the seed step

- **Files** (1): `api/scripts/seed-customer-success.ts` (extend from T-03)
- **Implements**: design §4.7 — closes AC-11; supports FR-12, FR-15
- **Complexity**: moderate
- **Blocked by**: T-01, T-03
- **Blocks**: T-11
- **Steps**: the DDD phase, for each of the four `CS_CAPABILITIES` (§4.7), using
  the resolved `operatorRootId` as `:modelId`:
  1. **Create capability** — POST `capabilityCreateSchema` (`{name, description?}`)
     to `POST /api/v1/models/:operatorRootId/capabilities`; capture `capId`.
  2. **needed-by** — `PUT .../capabilities/:capId/needed-by` with `{activityId}`
     (exactly one of `activityId`/`storyId`, `neededBySchema`), resolving the CS
     activity ref — accepted through `scopedNodeIds(operatorRootId)` (not
     `404 not_found`, B-02).
  3. **supported-by** — `PUT .../supported-by` with `{systemId}` (a CS/shared
     system id resolved at seed time).
  4. **context (graceful degradation)** — `PUT .../context` with
     `{boundedContextId}` referencing an **existing** `BoundedContext` (no create
     route; seeded via `api/src/ontology/seed.ts`) **if one exists**; else skip
     this arm — `NEEDS_CAPABILITY` + `SUPPORTED_BY` still prove the mapping
     (XD-10 requires it *proven*, not complete, OQ-6). Idempotency: capability
     create is guarded by `(name)` lookup on the model's capabilities.
  `ddd-system-modeling` route/storage code is **not edited** (NFR-03).
- **Verification**: `api/__tests__/customer-success-ddd.integration.test.ts`
  (AC-11) — capabilities created via `POST .../capabilities` (resolved modelId);
  `NEEDS_CAPABILITY` accepts a CS activity (not `404 not_found`); `SUPPORTED_BY`
  a system; where a context exists, `ASSIGNED_TO_CONTEXT`; a re-run adds no
  duplicate; manual: `git diff --stat api/src/routes/capabilities.ts
  api/src/storage/capabilities.ts` shows no change (NFR-03). Deferred-green:
  `bun test:integration`.

### T-11 — Full-run idempotency + retail-isolation integration test

- **Files** (1):
  `api/__tests__/customer-success-seed-idempotency.integration.test.ts` (new)
- **Implements**: design §4.1, §5.1, §8 — closes AC-13; supports FR-14, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-05, T-06, T-07, T-08, T-09, T-10
- **Steps**: with the full `seed:customer-success` step assembled (preamble →
  import → KPIs+`MEASURES` → stories+ACs → SLAs+alignments → risks → DDD):
  1. Run `seed:customer-success` **twice** end-to-end.
  2. Assert **net-zero** on the second run: node/edge counts under the CS domain
     are identical pre/post the second run; KPI/SLA/risk/story/capability counts
     unchanged (all five feature-owned guards fire, §5.1).
  3. Assert **retail isolation** — a pre/post `/api/v1/stats` diff for the retail
     `BusinessModel #1` root is **zero**; no other function slice is mutated
     (NFR-02).
- **Verification**:
  `api/__tests__/customer-success-seed-idempotency.integration.test.ts` (AC-13) —
  double `seed:customer-success` → net-zero; retail-root `/api/v1/stats` diff = 0;
  no cross-slice mutation. Deferred-green: `bun test:integration` (Neo4j +
  Postgres up).

### T-12 — Lifecycle-guard negative test (fixture cleanliness proven)

- **Files** (1):
  `api/__tests__/customer-success-seed-load.integration.test.ts` (extend from T-02/T-03)
- **Implements**: design §4.8, §8 — closes AC-12 (negative half); supports FR-14
- **Complexity**: simple
- **Blocked by**: T-03
- **Blocks**: —
- **Steps**: extend the AC-12 test with the **negative** case: feed a
  hand-constructed `{nodes, edges}` fixture carrying a **lifecycle** row (an
  `IN_MODEL` or `INSTANTIATES` edge — both members of `LIFECYCLE_EDGES`) to
  `POST /api/v1/import` and assert it is rejected `409
  model_lifecycle_route_required` with **nothing written** (payload-atomic
  pre-scan, `import.ts:167-185`). This proves the real CS fixture (T-02) is clean
  *because* the guard would reject a dirty one — the module-pin edge + its guard
  are unaffected by this feature.
- **Verification**:
  `api/__tests__/customer-success-seed-load.integration.test.ts` (AC-12 negative
  half) — the lifecycle-row fixture → `409 model_lifecycle_route_required`, zero
  rows written. Deferred-green: `bun test:integration`.

### T-13 — Mapping-table review (FR-13 / XD-10 gate)

- **Files** (0): no source — doc-review verification only (design §4.8 is the
  artifact)
- **Implements**: design §4.8 — closes AC-14; supports FR-13
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: —
- **Steps**: confirm the design §4.8 **mapping table** is present and complete:
  a row for **every** CS business-action category (journey, activity, role,
  system, KPI↦metric, story/AC, SLA, SLA alignment, risk, DDD capability), each
  naming **(a)** the companygraph **label/edge**, **(b)** the governed
  **route/API**, and **(c)** the expected **error code** on the failure/
  idempotency path (AC-14's strengthened gate — C-04). No code change; the gate
  is that the table exists and is mechanically traceable per FR-01…FR-12
  artifact class.
- **Verification**: manual: open
  `.claude/specs/customer-success-process-model/design.md` §4.8 and confirm one
  mapping row per FR-01…FR-12 artifact class, each naming label/edge + route/API
  + error code — expect every artifact class present with all three columns
  populated (AC-14). Cross-check `scripts/spec/spec-traceability.sh` reports the
  mapping rows if it scans them.

### T-14 — Boundary + house-rules sweep

- **Files** (0): no source — CLI verification only
- **Implements**: design §9, §5, §6 — closes AC-15; supports NFR-01, NFR-03,
  NFR-04, NFR-05
- **Complexity**: simple
- **Blocked by**: T-01…T-13
- **Blocks**: T-15
- **Steps**: prove the change surface is confined (design §9 "Explicitly NOT
  edited"):
  1. `bun run typecheck` exit 0 (NFR-04, no `tsc`).
  2. `git diff --stat` — changes confined to
     `shared/seed/saas-operator/customer-success.json`,
     `api/scripts/seed-customer-success.ts`,
     `api/src/seed/customer-success-catalog.ts`, `package.json`
     (the `seed:customer-success` line only), and this spec's own
     `api/__tests__/customer-success-*.integration.test.ts` files.
  3. `git diff` shows **no** change under `shared/src/schema/{nodes,edges}.ts`
     (NFR-01, no schema-array/registry edit), `api/src/routes/{kpi-crud,sla-crud,
     kpi-sla-alignment,risk-register}.ts`, `api/src/routes/stories.ts`,
     `api/src/storage/stories.ts`, `api/src/routes/capabilities.ts`,
     `api/src/storage/capabilities.ts`,
     `api/src/seed/{governed-seed-helper,link-kpi-metric,ensure-*}.ts`,
     `api/scripts/seed-saas-operator.ts` (NFR-03), `api/src/auth/rbac-permissions.ts`
     (no new permission, NFR-04), `api/src/errors.ts` (no new wire code), and
     **no** `pwa/` file (`route.ts`/`views/index.tsx`/`SURFACES`, NFR-05/XD-05).
- **Verification**: manual: run `bun run typecheck` (expect exit 0) and
  `git diff --stat` + targeted `git diff` of the named files — expect the change
  surface confined exactly to the fixture, seed script, catalog, `package.json`
  seed line, and this spec's tests, with **no** edit to any owned-elsewhere file,
  schema array, RBAC permission, error code, or `pwa/` file (AC-15).

### T-15 — Final validation sweep

- **Files** (0): no source — validation only
- **Implements**: design §8 — closes the AC-01…AC-16 sweep; supports all FR/NFR
- **Complexity**: simple
- **Blocked by**: T-01…T-14
- **Blocks**: —
- **Steps**: with the full stack up (`bun run dev`) and, in order,
  `bun run seed:saas-operator` + `bun run seed:saas-metric-library` +
  `bun run seed:customer-success` run:
  1. `bun run typecheck` exits 0.
  2. `bun test:integration` — all `api/__tests__/customer-success-*.integration.test.ts`
     green (AC-01…AC-13, AC-16).
  3. AC-14 mapping-table review (T-13) confirmed; AC-15 boundary sweep (T-14)
     clean.
  4. The `git diff` boundary checks (AC-15 + the per-task `git diff --stat` of
     `sla-crud.ts`/`risk-register.ts`/`kpi-sla-alignment.ts`/`capabilities.ts`)
     all show clean.
- **Verification**: manual: with the three seeds run against the live stack,
  run steps 1–4 — expect `typecheck` exit 0, every
  `customer-success-*.integration.test.ts` green, the AC-14 mapping table
  present/complete, and every `git diff` boundary check clean (full AC-01…AC-16
  sweep).

### T-16 — Conditional-arm deferral note (OQ-1 surfaced, not gating)

- **Files** (0): no source — STATUS/OQ bookkeeping only
- **Implements**: design §10 (OQ-1, OQ-2) + `review-design.md` C-01 — supports
  FR-07
- **Complexity**: simple
- **Blocked by**: T-06
- **Blocks**: —
- **Steps**: record in STATUS.md that OQ-1 is **surfaced to the user but
  non-blocking for this spec's build** (C-01): the four-metric roster (T-05) is
  complete and green regardless of OQ-1; the three CS-specific KPIs (T-06) are a
  per-metric conditional arm that authors each iff `saas-metric-library`
  publishes its `MetricDefinition` (owned there, amendment to that spec). Confirm
  OQ-2 (risk `domain` = function `Domain` name verbatim) is recorded as the
  canonical cross-slice convention for `cross-function-exec-rollup`.
- **Verification**: manual: open
  `.claude/specs/customer-success-process-model/STATUS.md` and confirm the Open
  Questions block records OQ-1 as non-blocking-for-this-spec (four-metric roster
  green, three conditional KPIs owned by `saas-metric-library`) and OQ-2 as the
  recorded cross-slice `domain` convention — expect both present with their
  disposition.

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.4, §4.2–§4.7, §5.2 | (supports AC-05, AC-08, AC-09, AC-10, AC-11) | FR-05, FR-08, FR-09, FR-11, FR-12 |
| T-02 | §3.1, §3.2, §3.3, §4.2 | AC-01/02/03/04 (fixture), AC-12 (shape) | FR-01, FR-02, FR-03, FR-04, FR-14 |
| T-03 | §4.1 (1–3), §7, §5.1 | AC-12 (import), AC-15 (wiring) | FR-14, FR-15 |
| T-04 | §4.2, §8 | AC-01, AC-02, AC-03, AC-04 | FR-01, FR-02, FR-03, FR-04, NFR-02 |
| T-05 | §4.3 (four-metric), §5.1 | AC-05, AC-06 | FR-05, FR-06 |
| T-06 | §4.3 (conditional), §10, C-01/C-02 | AC-07 | FR-05, FR-07, NFR-01 |
| T-07 | §4.4a, §4.4b, §5.1, N-01 | AC-09, AC-16 | FR-09, FR-10 |
| T-08 | §4.5, §5.1, §2.1, N-03 | AC-08 | FR-08, FR-15 |
| T-09 | §4.6, §5.1, N-01 | AC-10 | FR-11, NFR-02 |
| T-10 | §4.7 | AC-11 | FR-12, FR-15 |
| T-11 | §4.1, §5.1, §8 | AC-13 | FR-14, NFR-02 |
| T-12 | §4.8, §8 | AC-12 (negative) | FR-14 |
| T-13 | §4.8 | AC-14 | FR-13 |
| T-14 | §9, §5, §6 | AC-15 | NFR-01, NFR-03, NFR-04, NFR-05 |
| T-15 | §8 | AC-01…AC-16 sweep | all FR/NFR |
| T-16 | §10, C-01 | (supports AC-07) | FR-07 |

Every FR/NFR from the design is covered: FR-01→T-02/T-04, FR-02→T-02/T-04,
FR-03→T-02/T-04, FR-04→T-02/T-04, FR-05→T-05/T-06, FR-06→T-05, FR-07→T-06/T-16,
FR-08→T-08, FR-09→T-07, FR-10→T-07, FR-11→T-09, FR-12→T-10, FR-13→T-13,
FR-14→T-02/T-03/T-11/T-12, FR-15→T-03/T-08/T-10; NFR-01→T-06/T-14,
NFR-02→T-04/T-09/T-11, NFR-03→T-07/T-09/T-10/T-14, NFR-04→T-14,
NFR-05→T-14. Every AC (AC-01…AC-16) has a closing task: AC-01→T-04, AC-02→T-04,
AC-03→T-04, AC-04→T-04, AC-05→T-05, AC-06→T-05, AC-07→T-06, AC-08→T-08,
AC-09→T-07, AC-10→T-09, AC-11→T-10, AC-12→T-02/T-03/T-12, AC-13→T-11,
AC-14→T-13, AC-15→T-14, AC-16→T-07.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with seed/API behaviour (T-03, T-05, T-06, T-07, T-08, T-09, T-10) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs `bun run dev` — Neo4j + Postgres — and the two upstream seeds) |
| test-only tasks (T-04, T-11, T-12) | the task's listed `*.integration.test.ts` under `bun test:integration` |
| doc/boundary tasks (T-13, T-14, T-16) | manual review / `git diff` per the task's Verification |
| final task (T-15) | `bun test:integration` (all `customer-success-*`) + AC-14 mapping review + the AC-15 `git diff` boundary sweep, with all three seeds run |
