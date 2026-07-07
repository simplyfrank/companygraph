---
feature: "marketing-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
reviewing_design_revision: 1
size: "medium"
total_tasks: 16
---

# Tasks: marketing-process-model

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Compose-only slice**: this feature authors **no** schema, store, REST route,
  RBAC permission, or PWA view (design §1, Rule A/E). The whole permission
  surface is **two new source files** — the fixture
  `shared/seed/saas-operator/marketing.json` and the companion script
  `api/scripts/seed-marketing.ts` — **one** `package.json` line, and the test
  files. spec-guard blocks any Write/Edit outside design §9's File Changes table.
- **Deferred-green rule**: every behaviour test here is an
  `*.integration.test.ts` that drives the loopback API on `127.0.0.1:8787`, so it
  needs a running API + Neo4j (+ Postgres for risks). At each task's checkpoint
  run `bun run typecheck`; the integration files run green under
  `bun test:integration` once the stack is up (`bun run dev`) **and** the seed
  precondition has run (`seed:saas-operator` → `seed:saas-metric-library` →
  `seed:funnel-pipeline` → `seed:marketing`, §7 ordering).
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The completion
  hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md updates
  without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. No task touches
  `pwa/src/views/` (this slice ships no view), so no `design-conformance.ts`
  invocation applies.

## Design-basis pins (design rev 1 approved)

Design rev 1 is `approved` (`review-design.md` pass 1 = **approve**, zero
blockers). The binding decisions the implementer must not re-derive:

| Design decision (rev 1) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **Fixture vs. API split** (§4.6): the fixture carries **process-content nodes** (`UserJourney`/`Activity`/`Role`/`System`) + their fixture-local-resolvable edges (`PART_OF` Activity→UserJourney, `PRECEDES`, `EXECUTES`, `USES_SYSTEM`, `INTEGRATES_WITH`, `PERFORMS_AS`, `PARTICIPATES_IN`). **Everything guarded / cross-store / server-id-dependent** (UserJourney→Domain `PART_OF`, KPIs, `MEASURES`, KPI alignment, Funnel/Stage/`HAS_STAGE`/`CONVERTS_TO`, stories/ACs, risks, capabilities) is **API-driven** in the companion script. | Fixture is process-content only; guarded/cross-store data is companion-script only. | T-01, T-03…T-10 |
| **Self-owned companion script** (§4.5, OQ-1/C-02): `api/scripts/seed-marketing.ts`, wired `bun run seed:marketing`, run **after** `seed:saas-operator` + `seed:saas-metric-library` + `seed:funnel-pipeline`. The foundation loader (`seed-saas-operator.ts`) is **never** edited. | Companion script owns all API-driven writes + wiring. | T-02…T-11 |
| **Idempotency by lookup, not MERGE** (§4.5, Rule C): governed routes server-generate ids, so every API-driven write does a **check-before-POST** keyed on a stable natural attribute (per §4.5 table); a re-run is net-zero. | check-before-POST per kind; no MERGE-on-id for API rows. | T-03…T-10, T-14 |
| **`MEASURES` not `INSTANTIATES`** (§3.2, XD-06-erratum): the KPI→MetricDefinition link is `POST /api/v1/edges {type:"MEASURES",…}`; `MEASURES ∉ LIFECYCLE_EDGES` so the generic edge route accepts it. `INSTANTIATES` would be rejected `409 model_lifecycle_route_required`. | Link is `MEASURES`, never `INSTANTIATES`. | T-04 |
| **Metric targets are the two frozen-roster ids** (§3.2, B-01): **CAC → `metric-cac`**, **MQL→SQL conversion → `metric-pipeline-conversion`** (both provably in the frozen `saas-metric-library` roster). CPL / cost-per-MQL / marketing-sourced pipeline / lead volume are **`MEASURES`-less** KPIs — this slice invents **no** local `MetricDefinition` (XD-06). | Two metric-grounded KPIs; four `MEASURES`-less KPIs; never invent a metric. | T-03, T-04 |
| **D-1 — KPI alignment route** (§2.1): `ALIGNED_TO` is created via **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema`), **not** the generic `POST /api/v1/edges`; optional `PARAM_BINDS` via `POST /api/v1/kpis/:id/param-bindings`. | Alignment via `/api/v1/kpi-alignments`; no generic edge for `ALIGNED_TO`. | T-05 |
| **D-2 — funnel construct is API-only** (§2.1, §3.3): `Funnel`/`Stage` nodes, `HAS_STAGE`, and `CONVERTS_TO` are **never** fixture rows. `Funnel`/`Stage` via `POST /api/v1/nodes/{Funnel,Stage}`, `HAS_STAGE` via `POST /api/v1/edges`, `CONVERTS_TO` **only** via the range-checked `POST /api/v1/funnels/transitions`. | Funnel construct entirely companion-script; `CONVERTS_TO` never a fixture/generic-edge row. | T-01, T-06 |
| **Step-0 id resolver** (§4.4, OQ-3): one `POST /api/v1/query/cypher` pass resolves the operator root id (`name:"SaaS Operator"` + `attributes.saasOperatorRoot===true` filter) then the Marketing domain/journey/activity/system ids by `attributes.seedKey`; every later POST reads target ids from that in-memory map. Missing root/domain → loud exit, never a partial write. | All model-scoped ids resolved dynamically at seed time; never hard-coded. | T-02 |

Full rationale: design §1 (Rules A–E), §2 (carry-resolution table), §2.1
(deviations D-1/D-2), §3.1–§3.4, §4.1–§4.6, §5, §7, and `review-design.md`
(C-01/C-02, N-01/N-02/N-03).

## Open design concerns — pinned decisions (from review-design.md)

Design review pass 1 (`approve`, zero blockers) left two Concerns and three Nits
for the tasks author to pin. All are landed below; none reopens the architecture.

| Concern / nit | Decision | Rationale | Locked in task |
|---------------|----------|-----------|----------------|
| **C-01** — design §5's story + AC route rows list the wrong RBAC permission (`model:write`) under a "verified" claim; the real mapping is **`story:write`** (`rbac-permissions.ts:309,312`) | The companion script calls the story + AC routes **as-is** (no permission is authored either way — the script runs against the dev server with `ONELOGIN_ISSUER` unset, `devSession()` grants `["*"]`, C-02). The **tasks** record the corrected permission strings — story/AC routes are `story:write`; the rest of design §5's column (import→`data:write`, edges→`edge:write`, kpis/kpi-alignments/param-bindings→`kpi:write`, nodes/:label→`node:write`, funnels/transitions→`edge:write`, risk-register→`risk:write`, capabilities→`capability:write`, query/cypher→`query:read`) is correct as written. AC-16 asserts **no** new permission string is added regardless. | Correct the documented strings; the running seam is dev-session `["*"]`, so any mapped permission passes; no permission is authored. | T-11, T-15 |
| **C-02** — the companion script's auth/session model is unstated | **The script targets the local dev API `http://127.0.0.1:8787` (loopback, house rule) with `ONELOGIN_ISSUER` unset, inheriting the dev-session grant** exactly as `seed-saas-operator.ts:54` / `seed-saas-metric-library.ts:42` do — **no** auth header, **no** cookie/token. This is DEV-ONLY seed tooling and never a beyond-localhost path (CLAUDE.md auth note). The base URL is read from `HOST`/`API_PORT` env with the loopback default, mirroring the sibling scripts. | The dev-session fallback is the real, working seam the sibling seed scripts already rely on; state it so no reader hunts for a token. | T-02 |
| **N-01** (nit) — design prose cites `ddd-system.ts` for the capability handlers and `funnels.ts` as if it exists | The capability **handlers** live in `api/src/routes/capabilities.ts`; `shared/src/schema/ddd-system.ts` is the **schema** file the line-refs point at. The funnel transition route lives in `api/src/routes/funnels.ts`, **created by `funnel-pipeline-modeling`** (wave-1b) — a forward reference, not this slice's file. The companion script imports **neither** — it only `fetch`es the routes. | Prose-vs-file drift only; §9's "NOT edited" list is already correct. No action beyond awareness. | — |
| **N-02** (nit) — `Stage` idempotency key ("`Stage.name`+funnel linkage") is ambiguous at create time (the `HAS_STAGE` edge doesn't exist yet when the `Stage` is created) | **Pin a stage-scoping attribute at `Stage` create**: every Marketing `Stage` node carries `attributes.funnelKey:"marketing-demand-funnel"`, so the pre-POST existence check is `MATCH (s:Stage) WHERE s.attributes_json CONTAINS '"funnelKey":"marketing-demand-funnel"' AND s.name=$name` — unambiguous within this funnel, cannot collide with a sales/other-funnel "Lead"/"MQL" stage. Mirrors the `Funnel.name+modelId` key. | Make the Stage existence check funnel-scoped so re-run idempotency (AC-15) is exact and cross-funnel-safe. | T-06 |
| **N-03** (nit) — AC-17 (mapping coverage) requires **every** Mapping-Table label/edge instantiated, but M-06 (`PERFORMS_AS`/`PARTICIPATES_IN`) and M-11 (`PARAM_BINDS`) are "optional" in §3.1/§3.2 | **Commit to seeding ≥1 of each so AC-17 is satisfiable against the full table.** The fixture seeds **one** Marketing function-owner `Persona` with **one** `PERFORMS_AS` (→ a Marketing role) and **one** `PARTICIPATES_IN` (→ a journey); the companion script creates **one** `PARAM_BINDS` (e.g. Lead-Volume KPI param-bound to the Capture-Lead activity). AC-17's coverage assertion then covers **all** M-01…M-17 rows, none scoped out. | Every Mapping-Table row is exercised — AC-17 is a faithful, not aspirational, map (FR-15). | T-01, T-05, T-16 |

## Task list

### T-01 — Marketing process-content fixture `marketing.json`

- **Files** (1): `shared/seed/saas-operator/marketing.json` (new)
- **Implements**: design §3.1, §4.1, §4.6 (fixture half) — closes AC-14 (fixture
  shape); supports FR-01, FR-02, FR-03, FR-04, FR-14, and (M-06 persona edges,
  N-03) FR-15
- **Complexity**: complex
- **Blocked by**: —
- **Blocks**: T-02, T-12, T-13, T-14
- **Steps**: Author the `{nodes, edges}` import payload (`importPayloadSchema`,
  `import.ts:17`) carrying **only** non-lifecycle process content. Every node row
  has `label` + the standard envelope (`id` = a **stable seed id**, `name`,
  `description`, `attributes`) and every content node carries
  `attributes.seedKey` so the step-0 resolver (T-02) can key it.
  1. **5 `UserJourney` rows** (FR-01): `seedKey ∈ {content-ops, campaign-lead,
     mql-scoring, webinars-events, abm}`; names per requirements FR-01 (Content
     Operations, Campaign → Lead Capture, MQL Scoring & Handoff, Webinars &
     Events, Account-Based Marketing (ABM)).
  2. **~22 `Activity` rows** (FR-02): the per-journey activities enumerated in
     requirements FR-02, each with a distinct `seedKey` (e.g. `draft-content`,
     `capture-lead`, `qualify-mql`).
  3. **Function-specific `Role` rows** (FR-03) not already in the shared catalog:
     `content-marketer`, `demand-gen-manager`, `marketing-ops`,
     `field-events-marketer`, `abm-strategist`, `marketing-analyst` (each with a
     `seedKey`). Shared roles are **referenced by the foundation's stable seed
     id**, never re-authored.
  4. **Marketing-specific `System` rows** (FR-04) — **each with a required valid
     `systemKind`** from `SYSTEM_KINDS` (`shared/src/schema/system-kind.ts:9`),
     pinned exactly per design §3.1: MAP (`map`)→`functional`, CMS (`cms`)→
     `functional`, Webinar/Events Platform (`webinar-platform`)→`functional`,
     Ad Platform (`ad-platform`)→`functional`, Analytics/Attribution
     (`analytics-attribution`)→`functional`, Lead-Scoring Engine
     (`lead-scoring-ai`)→`ai_predictive`. A row **omitting** `systemKind` would be
     rejected `400 attribute_violation` on import (AC-04) — every authored row
     carries it. Shared systems (CRM, Data Warehouse) are **referenced** by the
     foundation's stable seed ids, never re-authored (they already carry
     `systemKind`).
  5. **One Marketing function-owner `Persona` row** (N-03) with a `seedKey` (e.g.
     `marketing-function-owner`).
  6. **Edge rows** (all in an existing endpoint whitelist, all endpoints
     resolvable from **fixture-local stable ids**, per design §3.1 table):
     `PART_OF` (Activity→UserJourney), `PRECEDES` (Activity→Activity where a real
     sequence exists), `EXECUTES` (Role→Activity, **every activity ≥1**),
     `USES_SYSTEM` (Activity→System), `INTEGRATES_WITH` (System→System, e.g.
     MAP↔CRM referencing the shared CRM by its foundation seed id), `PERFORMS_AS`
     (Persona→Role, **one**, N-03), `PARTICIPATES_IN` (Persona→UserJourney,
     **one**, N-03).
  7. **Excluded from the fixture** (design §4.1, §4.6, D-2): **no**
     UserJourney→Domain `PART_OF` (the domain id is server-generated — created by
     the companion script, T-03); **no** `Funnel`/`Stage`/`HAS_STAGE`/
     `CONVERTS_TO`; **no** KPI/story/AC/risk/capability rows; **no** lifecycle
     node/edge rows (`BusinessModel`/`ModuleInstance`/… or
     `IN_MODEL`/`INSTANTIATES`/… — a lifecycle row → `409
     model_lifecycle_route_required`, AC-14).
  All ids/seedKeys are en-US; the file is pure data (no code). Keep the seedKey
  set aligned with the T-02 resolver.
- **Verification**: `api/__tests__/marketing-seed.integration.test.ts` (AC-14) —
  the fixture parses as a valid `{nodes,edges}` payload, contains **only**
  non-lifecycle process rows (no `BusinessModel`/`ModuleInstance` node rows, no
  `IN_MODEL`/`INSTANTIATES`/lifecycle edge rows), and loads via
  `POST /api/v1/import`. `bun run typecheck` passes at checkpoint. Deferred-green:
  `bun test:integration`.

### T-02 — Companion script skeleton + step-0 id resolver + dev-session base URL

- **Files** (1): `api/scripts/seed-marketing.ts` (new)
- **Implements**: design §4.4, §7 + `review-design.md` C-02 — closes nothing
  alone (precondition for T-03…T-10); supports FR-14, NFR-05, and (OQ-3) FR-01–13
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-03, T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-11
- **Steps**: Create the companion script scaffold, sibling to
  `api/scripts/seed-saas-operator.ts`.
  1. **Base URL + auth (C-02 pin)** — target `http://127.0.0.1:8787` (loopback,
     house rule), reading `HOST`/`API_PORT` env with the loopback default exactly
     as `seed-saas-operator.ts:54` / `seed-saas-metric-library.ts:42`. Send
     **no** auth header — the script relies on the `ONELOGIN_ISSUER`-unset
     dev-session fallback (`router.ts` `devSession()` → `permissions:["*"]`).
     DEV-ONLY seed tooling; a header comment states it is never a
     beyond-localhost path.
  2. **Step-0 resolver** (§4.4, OQ-3) — one `POST /api/v1/query/cypher`
     (`query:read`) pass:
     - resolve the operator root: `MATCH (m:BusinessModel {name:"SaaS Operator"})
       RETURN m`, then filter in TS on
       `JSON.parse(m.attributes_json).saasOperatorRoot === true`;
     - resolve the Marketing domain + its journeys/activities by `seedKey` under
       that root (the §4.4 cypher), building an in-memory map `{seedKey → id}` for
       the domain, journeys, activities, and Marketing systems, plus the root id.
  3. **Loud precondition failure** — if the operator root or the Marketing domain
     is absent (foundation seed not run), exit with a clear "run
     `seed:saas-operator` first" error and write **nothing** (never a silent
     partial write).
  4. Export a small internal permissive zod input guard (§3.4) for the script's
     own literal content tables — **internal only, never a REST boundary**; the
     routes re-parse every POST, so this only sanity-checks the script's own data.
     `zod` only; en-US identifiers.
- **Verification**: `api/__tests__/marketing-seed.integration.test.ts` (id
  resolver) — after `seed:saas-operator`, running the script's step-0 resolves a
  non-empty root id + the `seedKey="marketing"` domain id + the five journey ids;
  with the operator root absent, the script exits non-zero and writes nothing.
  `bun run typecheck` passes at checkpoint. Deferred-green: `bun test:integration`.

### T-03 — Companion: UserJourney→Domain `PART_OF` + Marketing KPIs create

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-02)
- **Implements**: design §3.2 (KPI table), §4.1 (domain `PART_OF`), §4.2 (steps 1–2),
  §4.5 — closes AC-01, AC-05; supports FR-01, FR-05
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-04, T-05
- **Steps**:
  1. **UserJourney→Domain `PART_OF`** (§4.1) — for each of the five journeys,
     check-before-POST a `PART_OF` (UserJourney→Domain) edge (`POST
     /api/v1/edges`) from the resolved journey id to the resolved Marketing domain
     id (the domain id is server-generated, hence companion-script, not fixture).
     Idempotency key: existing `(:UserJourney {id})-[:PART_OF]->(:Domain {id})`.
  2. **Six Marketing KPIs** (§3.2 table) via `POST /api/v1/kpis`
     (`kpiCreateRequestSchema`), keyed idempotently on `KPI.name` (§4.5): **CAC
     (marketing-attributed)** (`category:cost`, `unit:USD`,
     `lower_is_better`); **MQL→SQL Conversion Rate** (`category:efficiency`,
     `unit:%`, `higher_is_better`, `description` documents the
     `metric-pipeline-conversion` **proxy**, C-04); **CPL** (`cost`/`USD`/
     `lower_is_better`); **Cost per MQL** (`cost`/`USD`/`lower_is_better`);
     **Marketing-Sourced Pipeline** (`other`/`USD`/`higher_is_better`); **Lead
     Volume** (`other`/`count`/`higher_is_better`). `category` is the closed enum
     `efficiency|quality|customer_satisfaction|cost|time|compliance|other`
     (`kpi-sla.ts:11`) — the pinned values above are all in it. `kpi-crud.ts` is
     **never edited** (NFR-03, AC-05).
- **Verification**:
  - `api/__tests__/marketing-journeys.integration.test.ts` (AC-01) — after the
    full seed, the five journeys are `PART_OF` the `seedKey="marketing"` domain.
  - `api/__tests__/marketing-kpis.integration.test.ts` (AC-05) — the six KPIs
    exist via `POST /api/v1/kpis` with valid `kpiCreateRequestSchema` fields (the
    two metric-grounded + the four `MEASURES`-less); manual:
    `git diff --stat api/src/routes/kpi-crud.ts` — expect no change.
  Deferred-green: `bun test:integration`.

### T-04 — Companion: `MEASURES` links for the two metric-grounded KPIs

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-03)
- **Implements**: design §3.2, §4.2 (step 3) + XD-06-erratum — closes AC-06;
  supports FR-06
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: T-16
- **Steps**: For the **two** metric-grounded KPIs only:
  1. Resolve the target `MetricDefinition` by its **stable seed id** via `POST
     /api/v1/query/cypher` (`MATCH (m:MetricDefinition {id:$seedId}) RETURN m`):
     **CAC → `metric-cac`**, **MQL→SQL → `metric-pipeline-conversion`** (both
     provably in the frozen `saas-metric-library` roster, `design.md:246–274`).
  2. Check-before-POST a `MEASURES` edge (`MATCH (k:KPI {name})-[:MEASURES]->(m)`);
     if absent, `POST /api/v1/edges {type:"MEASURES", fromId:kpiId, toId:metricId}`.
     `MEASURES ∉ LIFECYCLE_EDGES` (`model-lifecycle-guard.ts:25–31`) so the
     generic edge route accepts it; the link is **never** typed `INSTANTIATES`
     (which would be rejected `409 model_lifecycle_route_required`).
  3. The **four `MEASURES`-less KPIs** (CPL, cost-per-MQL, marketing-sourced
     pipeline, lead volume) get **zero** `MEASURES` edges and reference **no**
     locally-invented `MetricDefinition` (XD-06, B-01/N-03).
- **Verification**: `api/__tests__/marketing-kpi-measures.integration.test.ts`
  (AC-06) — CAC has exactly one `MEASURES` → `metric-cac`, MQL→SQL exactly one →
  `metric-pipeline-conversion`; **no** Marketing KPI→metric link is typed
  `INSTANTIATES`; the four `MEASURES`-less KPIs have zero `MEASURES` edges and no
  local `MetricDefinition`; a read returns one metric per grounded KPI.
  Deferred-green: `bun test:integration`.

### T-05 — Companion: KPI alignment (`ALIGNED_TO` via kpi-alignments) + optional `PARAM_BINDS`

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-04)
- **Implements**: design §3.2, §4.2 (step 4), §2.1 D-1 + `review-design.md` N-03
  — closes AC-07; supports FR-07, and (M-11 `PARAM_BINDS`, N-03) FR-15
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: T-16
- **Steps**:
  1. **`ALIGNED_TO`** (D-1) — for each Marketing KPI, check-before-POST an
     alignment via **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema`
     = `{kpi_id, target_type:"journey"|"activity"|"domain", target_id, weight,
     attribution_type, alignment_notes?}`) to the Marketing journey/activity/domain
     the KPI reports on (e.g. CPL → the Campaign→Lead journey; MQL→SQL → the MQL
     Scoring journey). The route writes `ALIGNED_TO` internally and 404s on a
     missing KPI/target (`kpi-sla-alignment.ts:35,48`). Idempotency key: existing
     `(:KPI {name})-[:ALIGNED_TO]->(:… {id})`. **Not** the generic `POST
     /api/v1/edges` (D-1).
  2. **`PARAM_BINDS` (one, N-03)** — create **one** `PARAM_BINDS` via `POST
     /api/v1/kpis/:id/param-bindings` (e.g. Lead-Volume KPI param-bound to the
     Capture-Lead activity) so M-11 is exercised for AC-17. Check-before-POST on
     the existing binding.
  `kpi-sla-alignment.ts` is **never edited** (NFR-03).
- **Verification**: `api/__tests__/marketing-kpi-alignment.integration.test.ts`
  (AC-07) — each KPI is `ALIGNED_TO` real Marketing structure via
  `/api/v1/kpi-alignments` (not a new edge type); the one `PARAM_BINDS` resolves
  to the Capture-Lead activity. Deferred-green: `bun test:integration`.

### T-06 — Companion: Marketing Demand Funnel (Funnel/Stage/`HAS_STAGE`/`CONVERTS_TO`)

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-02)
- **Implements**: design §3.3, §4.3, §2.1 D-2 + `review-design.md` N-02 — closes
  AC-08, AC-09; supports FR-08, FR-09
- **Complexity**: complex
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**: (Precondition: `seed:funnel-pipeline` has run so the `Funnel`/`Stage`
  labels + `HAS_STAGE`/`CONVERTS_TO` edge types exist — §7 ordering; step-0 fails
  loud if a lookup on those labels errors.)
  1. **Funnel** — resolve-or-create via lookup on `name:"Marketing Demand Funnel"`
     + `modelId` (the operator root id, per `funnel-pipeline-modeling` §3.1's
     `modelId` marker), else `POST /api/v1/nodes/Funnel`.
  2. **Four `Stage` nodes** — Visitor(0) → Lead(1) → MQL(2) → SQL(3), a strict
     **linear chain**, each with integer `stageOrder` **and** the scoping
     attribute **`attributes.funnelKey:"marketing-demand-funnel"`** (N-02 pin) so
     the existence check `MATCH (s:Stage) WHERE s.attributes_json CONTAINS
     '"funnelKey":"marketing-demand-funnel"' AND s.name=$name` is
     funnel-scoped and cannot collide with a sales/other-funnel stage. Create via
     `POST /api/v1/nodes/Stage` if absent (a non-integer `stageOrder` → `400
     attribute_violation`).
  3. **`HAS_STAGE`** (Funnel→Stage) via `POST /api/v1/edges` if absent (no range
     attrs, generic route suffices; endpoint whitelist registry-enforced).
  4. **Three `CONVERTS_TO` transitions** (Visitor→Lead, Lead→MQL, MQL→SQL) **only**
     via `POST /api/v1/funnels/transitions` (`funnelTransitionSchema` `{fromId,
     toId, conversionRate, dropOffRate, attributes?}`, rates in `[0,1]`,
     `conversionRate + dropOffRate ≈ 1`, illustrative per OQ-4), if absent
     (checked by a `MATCH (a)-[:CONVERTS_TO]->(b)` read). An out-of-range value →
     `400 attribute_violation` from that route. **Never** a fixture or generic-edge
     `CONVERTS_TO` row (D-2). `funnels.ts` is **never edited** (it is
     `funnel-pipeline-modeling`-owned; NFR-03).
- **Verification**: `api/__tests__/marketing-funnel.integration.test.ts` (AC-08,
  AC-09) — one `Funnel`; the ordered Visitor→Lead→MQL→SQL `Stage` chain via
  `HAS_STAGE`; the funnel-composition read returns stages in `stageOrder`; each
  `CONVERTS_TO` has `conversionRate`/`dropOffRate` in `[0,1]`; the overall
  conversion (product of per-transition rates) computes without error.
  Deferred-green: `bun test:integration`.

### T-07 — Companion: Marketing stories + Given/When/Then acceptance criteria

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-02)
- **Implements**: design §3.2 (stories/ACs), §4.4 — closes AC-10, AC-11; supports
  FR-10, FR-11
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**:
  1. **≥1 story per journey (five)** via `POST /api/v1/models/:modelId/stories`
     (`storyCreateSchema` = `{persona, action, benefit, activityId, roleId?}`,
     `story-spec.ts:22`), `:modelId` = the resolved operator root id, `activityId`
     = a **scoped** Marketing activity id (else `404 story_activity_not_in_model`,
     `errors.ts:55`). The route emits `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE`
     when `roleId` set). Idempotency key: existing `(:UserStory {action})`
     describing the target activity (§4.5).
  2. **≥1 AC per story** via `POST
     /api/v1/models/:modelId/stories/:storyId/acceptance-criteria` (`acCreateSchema`
     = `{given, when, then}`, **all three required**, else `400
     acceptance_criterion_clause_required`, `errors.ts:56`/`stories.ts:65`). The
     route emits `ACCEPTANCE_OF` (route-created, not authored — N-02 of
     requirements). Idempotency key: existing AC on the story.
  `stories.ts` is **never edited** (NFR-03, AC-10).
- **Verification**: `api/__tests__/marketing-stories.integration.test.ts` (AC-10,
  AC-11) — ≥1 story/journey `DESCRIBES_ACTIVITY` a scoped activity; a story
  against an out-of-scope activity id → `404 story_activity_not_in_model`; every
  story has ≥1 AC with non-empty given/when/then; a missing clause → `400
  acceptance_criterion_clause_required`; manual: `git diff --stat
  api/src/routes/stories.ts` — expect no change. Deferred-green:
  `bun test:integration`.

### T-08 — Companion: Marketing risks via the governed risk-register API

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-02)
- **Implements**: design §3.2 (risks) + XD-04 — closes AC-12; supports FR-12
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**: Create **three** Marketing risks via `POST /api/v1/risk-register`
  (`createRiskSchema`, `risk-register.ts:7` = `{name, owner, domain:"Marketing",
  likelihood 1–5, impact 1–5, status ∈ {open,mitigating,accepted,resolved}, trend
  ∈ {up,flat,down}, risk_type?, linked_entity_type?, linked_entity_id?, …}`):
  content/brand-compliance (`risk_type:"compliance"`),
  attribution/lead-data-quality (`risk_type:"operational"`),
  email-deliverability/channel-dependency (`risk_type:"operational"`). Each sets
  `linked_entity_id`/`linked_entity_type` to the relevant Marketing
  journey/activity id where it references one. These are **Postgres** `risk_register`
  rows (M-16), not graph nodes. Idempotency key: `risk_register.name` +
  `domain:"Marketing"` (a `SELECT`/existence check before insert, §4.5). The
  script **never edits** `risk-register.ts`, `risk-compliance.ts`,
  `change-requests.ts`, `compliance-rules.ts`, or `sla-crud.ts` (XD-04/XD-08).
- **Verification**: `api/__tests__/marketing-risks.integration.test.ts` (AC-12) —
  the three risks exist in `risk_register` (`domain:"Marketing"`, likelihood/impact
  1–5) with `linked_entity_id` where applicable; manual: `git diff --stat
  api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts`
  — expect no change. Deferred-green: `bun test:integration` (needs Postgres).

### T-09 — Companion: DDD capabilities + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/context

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-02)
- **Implements**: design §3.2 (capabilities) + N-01 (real handler file) — closes
  AC-13; supports FR-13
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**: Via the model-scoped **capability** routes (handlers in
  `api/src/routes/capabilities.ts`; schemas in `shared/src/schema/ddd-system.ts`,
  N-01), `:modelId` = the operator root id:
  1. **Capabilities** via `POST /api/v1/models/:modelId/capabilities`
     (`capabilityCreateSchema` = `{name, description?}`): e.g. "Capture and
     qualify a lead", "Run a multi-channel campaign", "Score lead intent". The
     route emits `CAPABILITY_IN_MODEL` on create. Idempotency key: existing
     `(:Capability {name})` in the model.
  2. **`NEEDS_CAPABILITY`** via `PUT .../capabilities/:id/needed-by`
     (`neededBySchema` = `{activityId}` **XOR** `{storyId}`) from a Marketing
     activity/story.
  3. **`SUPPORTED_BY`** via `PUT .../capabilities/:id/supported-by`
     (`supportedBySchema` = `{systemId}`) to a system (e.g. lead-capture
     capability supported by MAP + CRM).
  4. **`ASSIGNED_TO_CONTEXT`** (optional, `should`) via `PUT
     .../capabilities/:id/context` (`contextAssignSchema` = `{boundedContextId}`)
     only where a bounded context applies.
  `capabilities.ts` is **never edited** (NFR-03, AC-13).
- **Verification**: `api/__tests__/marketing-capabilities.integration.test.ts`
  (AC-13) — capabilities `CAPABILITY_IN_MODEL`-scoped to the operator root,
  `NEEDS_CAPABILITY` from a Marketing activity/story, `SUPPORTED_BY` a system;
  manual: `git diff --stat api/src/routes/capabilities.ts` — expect no change.
  Deferred-green: `bun test:integration`.

### T-10 — Companion: fixture load + full-seed orchestration + idempotency guards

- **Files** (1): `api/scripts/seed-marketing.ts` (extend from T-02…T-09)
- **Implements**: design §4.1, §4.5, §4.6, §7 — closes AC-15; supports FR-14, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-03, T-04, T-05, T-06, T-07, T-08, T-09
- **Steps**: Assemble the script's `main()` in the pinned order and enforce
  net-zero re-runs:
  1. Confirm the fixture (`marketing.json`, T-01) is loaded by the **foundation
     loader** during `seed:saas-operator` (the loader's directory scan discovers
     it, **no** `seed-saas-operator.ts` edit); the companion script does **not**
     re-import the fixture (Rule B — process content is fixture-loaded, API data
     is companion-loaded).
  2. Run step-0 resolver (T-02) → UserJourney→Domain `PART_OF` (T-03) → KPIs
     (T-03) → `MEASURES` (T-04) → alignment/`PARAM_BINDS` (T-05) → funnel (T-06)
     → stories/ACs (T-07) → risks (T-08) → capabilities (T-09).
  3. **Every** write is check-before-POST keyed per §4.5 (the per-kind
     idempotency table), so a second `bun run seed:marketing` creates **zero** net
     new nodes/edges/rows.
  4. **Retail isolation (Rule D)** — no lookup or write touches retail Business
     Model #1's subgraph or the retail/commercial seed files; all writes scope
     under the resolved operator root or reference shared reference nodes by
     stable id.
- **Verification**: `api/__tests__/marketing-seed.integration.test.ts` (AC-15) —
  running the full Marketing seed (foundation-loaded fixture + companion script)
  **twice** yields zero net new nodes/edges/risk rows; a pre/post `/api/v1/stats`
  diff for retail Model #1 across the run is zero. Deferred-green:
  `bun test:integration` (Neo4j + Postgres).

### T-11 — Wire `seed:marketing` package script

- **Files** (1): `package.json` (modify)
- **Implements**: design §7 + `review-design.md` C-01 (documented-permission
  correction is a doc-only pin) — closes AC-14 (loader-untouched half); supports
  FR-14
- **Complexity**: simple
- **Blocked by**: T-02
- **Blocks**: T-12, T-16
- **Steps**: Add the single script line to the root `package.json` `scripts`:
  `"seed:marketing": "bun --cwd api scripts/seed-marketing.ts"` (matching the
  existing `"seed:saas-operator": "bun --cwd api scripts/seed-saas-operator.ts"`
  form, §7). This is the **sole** `package.json` edit. Run **after**
  `seed:saas-operator` (operator root + Marketing domain + shared catalog + loads
  `marketing.json`), `seed:saas-metric-library` (the `MetricDefinition` roster +
  `MEASURES` edge type), and `seed:funnel-pipeline` (`Funnel`/`Stage` labels +
  `HAS_STAGE`/`CONVERTS_TO` edge types); the ordering is documented in the script
  header and the step-0 resolver fails loud if a precondition is missing. **No**
  edit to `api/scripts/seed-saas-operator.ts` (foundation loader — the fixture is
  discovered, not registered).
- **Verification**: manual: `cat package.json | grep '"seed:marketing"'` shows
  the entry and `ls api/scripts/seed-marketing.ts` exists; manual: `git diff
  --stat api/scripts/seed-saas-operator.ts` — expect no change (AC-14, loader
  untouched). `bun run typecheck` passes.

### T-12 — Journeys + activities + roles integration tests (AC-01…AC-03)

- **Files** (3): `api/__tests__/marketing-journeys.integration.test.ts` (extend
  from T-03), `api/__tests__/marketing-activities.integration.test.ts` (new),
  `api/__tests__/marketing-roles.integration.test.ts` (new)
- **Implements**: design §3.1, §4.1, §8 — closes AC-01, AC-02, AC-03; supports
  FR-01, FR-02, FR-03
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-11
- **Blocks**: —
- **Steps**: Each test runs the seed precondition (`seed:saas-operator` scaffold +
  fixture, then `seed:marketing`) then asserts against the seeded graph via
  `POST /api/v1/query/cypher`:
  - **AC-01** (journeys) — the five journeys resolve under the
    `seedKey="marketing"` domain, each `PART_OF` the domain.
  - **AC-02** (activities) — every seeded `Activity` is `PART_OF` its journey; the
    intra-journey `PRECEDES` chains resolve (no dangling `PRECEDES`); each activity
    carries the standard node envelope (`id`/`name`/`description`/`attributes`).
  - **AC-03** (roles) — every `Activity` has ≥1 `EXECUTES` role; a role referencing
    the shared catalog resolves to a **single** shared `Role` (no duplicate);
    function-specific roles are present; the `PERFORMS_AS`/`PARTICIPATES_IN`
    persona edges resolve (N-03 — they are seeded).
- **Verification**: `api/__tests__/marketing-journeys.integration.test.ts`
  (AC-01), `api/__tests__/marketing-activities.integration.test.ts` (AC-02),
  `api/__tests__/marketing-roles.integration.test.ts` (AC-03). Deferred-green:
  `bun test:integration`.

### T-13 — Systems + `systemKind` enforcement integration test (AC-04)

- **Files** (1): `api/__tests__/marketing-systems.integration.test.ts` (new)
- **Implements**: design §3.1 (per-system kind table), §4.1 + requirements C-01 —
  closes AC-04; supports FR-04
- **Complexity**: moderate
- **Blocked by**: T-01, T-11
- **Blocks**: —
- **Steps**: After the seed precondition:
  - `USES_SYSTEM` edges resolve to systems; shared systems (CRM, Data Warehouse)
    resolve to the **single** foundation-seeded `System` (no duplicate); any
    `INTEGRATES_WITH` pair (e.g. MAP↔CRM) resolves.
  - Every Marketing-specific system carries a valid `systemKind` from
    `SYSTEM_KINDS` (`functional`/`agentic`/`ai_predictive`) matching the design
    §3.1 pin.
  - **Negative** — POST a hand-constructed `{nodes,edges}` fixture with a `System`
    row **omitting** `systemKind` to `POST /api/v1/import`; assert it is rejected
    `400 attribute_violation`, **payload-atomic** (nothing written).
- **Verification**: `api/__tests__/marketing-systems.integration.test.ts` (AC-04)
  — `USES_SYSTEM` resolves; shared CRM/DW single node; every Marketing system has
  a valid `systemKind`; a `systemKind`-less fixture row → `400 attribute_violation`,
  nothing written; `INTEGRATES_WITH` pairs resolve. Deferred-green:
  `bun test:integration`.

### T-14 — Seed shape + lifecycle-guard-clean integration test (AC-14)

- **Files** (1): `api/__tests__/marketing-seed.integration.test.ts` (extend from
  T-01/T-02/T-10)
- **Implements**: design §3.1, §4.1, §8 + NFR-04 — closes AC-14; supports FR-14,
  NFR-04
- **Complexity**: moderate
- **Blocked by**: T-01, T-11
- **Blocks**: —
- **Steps**: Assert the fixture contract:
  - `marketing.json` is a valid `{nodes,edges}` import payload containing **only**
    non-lifecycle process rows (no `BusinessModel`/`ModuleInstance`/… node rows,
    no `IN_MODEL`/`INSTANTIATES`/other lifecycle edge rows); loading it via the
    foundation loader (`POST /api/v1/import`) succeeds and writes the Marketing
    process content.
  - **Negative (NFR-04)** — a hand-constructed fixture carrying a lifecycle edge
    row (`IN_MODEL` or `INSTANTIATES`, both in `LIFECYCLE_EDGES`) → `POST
    /api/v1/import` rejected `409 model_lifecycle_route_required`, nothing written
    (payload-atomic pre-scan), proving the real fixture is clean *because* the
    guard would reject a dirty one.
  - The loader picks up the fixture with **no** `seed-saas-operator.ts` edit.
- **Verification**: `api/__tests__/marketing-seed.integration.test.ts` (AC-14);
  manual: `git diff --stat api/scripts/seed-saas-operator.ts` — expect no change.
  Deferred-green: `bun test:integration`.

### T-15 — Boundary / no-new-schema-or-permission integration + CLI check (AC-16)

- **Files** (1): `api/__tests__/marketing-boundary.integration.test.ts` (new)
- **Implements**: design §5, §9, §11 + `review-design.md` C-01 — closes AC-16;
  supports NFR-01, NFR-03, NFR-05
- **Complexity**: simple
- **Blocked by**: T-02, T-11
- **Blocks**: T-16
- **Steps**:
  - **No new label/edge type** — assert (via `POST /api/v1/query/cypher` on the
    ontology registry and a `git diff` guard) that this slice added **zero**
    entries to `shared/src/schema/{nodes,edges}.ts` and registered **zero** new
    runtime ontology labels/edge types (it instantiates the foundation +
    wave-1b constructs, NFR-01).
  - **No new RBAC permission** — `git diff api/src/auth/rbac-permissions.ts` shows
    no additions; the story/AC routes the script calls map to **`story:write`**
    (C-01 correction to design §5's `model:write`), and no permission is authored.
  - **No route dispatch edit** — `git diff` on `api/src/router.ts`,
    `api/src/errors.ts` shows no additions.
- **Verification**: `api/__tests__/marketing-boundary.integration.test.ts` +
  `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts api/src/auth/rbac-permissions.ts api/src/router.ts
  api/src/errors.ts` — expect no additions (AC-16). Deferred-green:
  `bun test:integration`.

### T-16 — Mapping-coverage integration test + final validation sweep (AC-17)

- **Files** (1): `api/__tests__/marketing-mapping-coverage.integration.test.ts` (new)
- **Implements**: design §3.1–§3.3, §8, §10 + requirements FR-15/N-03 — closes
  AC-17, and drives the AC-01…AC-17 sweep; supports FR-15, all FR/NFR
- **Complexity**: moderate
- **Blocked by**: T-04, T-05, T-06, T-07, T-08, T-09, T-11, T-15
- **Blocks**: —
- **Steps**:
  1. **AC-17 mapping coverage** — for **every** row M-01…M-17 of the requirements
     Mapping Table, assert the named label(s)/edge(s) is instantiated by ≥1
     seeded node/edge/row after the full seed (N-03 pin: the optional M-06
     `PERFORMS_AS`/`PARTICIPATES_IN` and M-11 `PARAM_BINDS` are seeded, so **no**
     row is scoped out — the assertion covers the whole table). Risk rows (M-16)
     are checked in Postgres `risk_register`; all graph rows via `POST
     /api/v1/query/cypher`.
  2. **Final sweep** — with the full stack up (`bun run dev`) and the seed chain
     run (`seed:saas-operator` → `seed:saas-metric-library` → `seed:funnel-pipeline`
     → `seed:marketing`): `bun run typecheck` exit 0; `bun test:integration` green
     across all `api/__tests__/marketing-*.integration.test.ts`; the AC-05/AC-10/
     AC-12/AC-13/AC-14/AC-16 `git diff` boundary checks all clean (no
     owned-elsewhere edit, no schema/RBAC/route/error-code addition).
- **Verification**: `api/__tests__/marketing-mapping-coverage.integration.test.ts`
  (AC-17); manual: with the seeded stack up, run `bun run typecheck` (exit 0),
  `bun test:integration` (all `marketing-*.integration.test.ts` green), and the
  `git diff --stat` boundary checks on `api/src/routes/{kpi-crud,stories,capabilities,risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts`,
  `api/scripts/seed-saas-operator.ts`, `shared/src/schema/{nodes,edges}.ts`,
  `api/src/auth/rbac-permissions.ts`, `api/src/router.ts` — expect every one
  unchanged (full AC-01…AC-17 sweep). Deferred-green: `bun test:integration`.

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.1, §4.1, §4.6 | AC-14 (fixture shape) | FR-01, FR-02, FR-03, FR-04, FR-14, FR-15 |
| T-02 | §4.4, §7, C-02 | (precondition) | FR-14, NFR-05 |
| T-03 | §3.2, §4.1, §4.2, §4.5 | AC-01, AC-05 | FR-01, FR-05 |
| T-04 | §3.2, §4.2 | AC-06 | FR-06 |
| T-05 | §3.2, §4.2, D-1, N-03 | AC-07 | FR-07, FR-15 |
| T-06 | §3.3, §4.3, D-2, N-02 | AC-08, AC-09 | FR-08, FR-09 |
| T-07 | §3.2, §4.4 | AC-10, AC-11 | FR-10, FR-11 |
| T-08 | §3.2 (risks) | AC-12 | FR-12 |
| T-09 | §3.2 (capabilities), N-01 | AC-13 | FR-13 |
| T-10 | §4.1, §4.5, §4.6, §7 | AC-15 | FR-14, NFR-02 |
| T-11 | §7, C-01 | AC-14 (loader untouched) | FR-14 |
| T-12 | §3.1, §4.1, §8 | AC-01, AC-02, AC-03 | FR-01, FR-02, FR-03 |
| T-13 | §3.1, §4.1, C-01(req) | AC-04 | FR-04 |
| T-14 | §3.1, §4.1, §8, NFR-04 | AC-14 | FR-14, NFR-04 |
| T-15 | §5, §9, §11, C-01 | AC-16 | NFR-01, NFR-03, NFR-05 |
| T-16 | §3.1–§3.3, §8, §10, N-03 | AC-17 (+ AC-01…AC-17 sweep) | FR-15, all FR/NFR |

Every FR/NFR from the design is covered: FR-01→T-03/T-12, FR-02→T-01/T-12,
FR-03→T-01/T-12, FR-04→T-01/T-13, FR-05→T-03, FR-06→T-04, FR-07→T-05,
FR-08→T-06, FR-09→T-06, FR-10→T-07, FR-11→T-07, FR-12→T-08, FR-13→T-09,
FR-14→T-01/T-10/T-11/T-14, FR-15→T-01/T-05/T-16; NFR-01→T-15,
NFR-02→T-10, NFR-03→T-07/T-08/T-09/T-15, NFR-04→T-14, NFR-05→T-02/T-15.
Every AC (AC-01…AC-17) has a closing task; AC-16/AC-17 also drive the final
boundary + coverage sweep.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with server behaviour (T-01…T-10, T-12…T-16) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs the stack up: `bun run dev` + the seed chain `seed:saas-operator` → `seed:saas-metric-library` → `seed:funnel-pipeline` → `seed:marketing`) |
| T-11 (package.json) | `bun run typecheck` + `git diff --stat api/scripts/seed-saas-operator.ts` (expect no change) |
| final task (T-16) | `bun test:integration` (all `marketing-*.integration.test.ts`, Neo4j + Postgres) + the AC-05/AC-10/AC-12/AC-13/AC-14/AC-16 `git diff` boundary checks + the full AC-01…AC-17 mapping-coverage sweep |
