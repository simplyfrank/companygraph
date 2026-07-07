---
feature: "sales-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 1
reviewing_design_revision: 2
size: "medium"
total_tasks: 16
---

# Tasks: sales-process-model

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Compose-only slice**: this feature authors **no** schema, store, REST route,
  RBAC permission, `ERROR_CODES` member, or PWA view (design §1, Rules A/E;
  NFR-01). The whole permission surface is **two new source files** — the fixture
  `shared/seed/saas-operator/sales.json` and the feature-owned resolver
  `api/scripts/seed-sales.ts` — **one** `package.json` line, and the test files.
  spec-guard blocks any Write/Edit outside design §9's File Changes table.
- **Deferred-green rule**: every behaviour test here is an
  `*.integration.test.ts` that drives the loopback API on `127.0.0.1:8787`, so it
  needs a running API + Neo4j (+ Postgres for risks). At each task's checkpoint
  run `bun run typecheck`; the integration files run green under
  `bun test:integration` once the stack is up (`bun run dev`) **and** the seed
  precondition has run in the pinned order (§7 / NFR-06:
  `funnel-pipeline-modeling` executed → `seed:saas-metric-library` →
  `seed:saas-operator` → `seed:sales`).
- **Execution gate (B-01, NOT a task, NOT a user decision)**: this spec's
  *execution* is sequenced **after `funnel-pipeline-modeling` is unblocked and
  executed** — its `Funnel`/`Stage` labels, `HAS_STAGE`/`CONVERTS_TO` edge types,
  and `POST /api/v1/funnels/transitions` route must be live before T-06 (the
  `funnel()` step) can run, and before AC-07/AC-08 can pass (design §1, §4.6).
  `funnel-pipeline-modeling` is currently `execution:blocked` on `dev`. The
  resolver's `resolve()` step (T-02) probes for those constructs and **fails
  loudly** (non-zero exit) if absent — it never half-writes a funnel against an
  unbuilt subsystem (AC-16). This is a build-ordering gate the design makes
  explicit and fail-loud; it does **not** block tasks approval, only execution
  sequencing. The orchestrator sequences execution exactly as `MEASURES`
  execution follows `saas-metric-library`.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The completion
  hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md updates
  without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. No task touches
  `pwa/src/views/` (this slice ships no view, NFR-01), so no
  `design-conformance.ts` invocation applies.

## Design-basis pins (design rev 2 approved)

Design rev 2 is `approved` (`review-design.md` pass 2/2 = **approve**, zero
blockers, zero carried concerns). The binding decisions the implementer must not
re-derive:

| Design decision (rev 2) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **Rule B — id-free fixture, resolver for everything else** (§3): `sales.json` carries **only** self-contained nodes (`UserJourney`/`Activity`/function-specific `Role`/`System`/`KPI`) + intra-slice edges whose **both** endpoints are stable-id fixture nodes (`PART_OF` Activity→UserJourney, `PRECEDES`, `EXECUTES` from a function-specific role, `USES_SYSTEM`→in-slice System). **Every** id-referencing edge and **every** governed-invariant construct is a resolver write. | Fixture is self-contained process content only; everything else is resolver-only. | T-01, T-03…T-09 |
| **Rule C — governed invariants only through governed routes** (§1, B-02): `MEASURES` via `linkKpiToMetric` (at-most-one); `CONVERTS_TO` via `POST /api/v1/funnels/transitions` (`[0,1]` range); `ALIGNED_TO` via `POST /api/v1/kpi-alignments` (all targets, D-1); stories via `POST /api/v1/models/:modelId/stories` (narrative + scope); ACs via the AC route (Given/When/Then); capabilities via the DDD create route (authoritative `CAPABILITY_IN_MODEL`). **Never** a raw `sales.json` row for any of these. | Each governed-invariant edge goes through its owning route; the fixture grep-empty family (AC-05/08/09/10/13) is airtight. | T-04…T-09 |
| **Rule D — funnel anchored by `attributes.modelId` = operator root id** (§4.6, Resolves review C-01): the `Funnel` node carries `attributes.modelId` = the resolved operator-root id, matching `funnel-pipeline-modeling` FR-09's listing Cypher (`WHERE f.attributes_json CONTAINS $rootIdNeedle` + client-side `modelId===rootId`). The stale reachability-edge disjunct is **closed** — there is **no** anchoring edge. | Funnel anchored by `modelId` only; no `PART_OF`/reachability edge. | T-06 |
| **`MEASURES` not `INSTANTIATES`** (§1, XD-06-erratum): the KPI→MetricDefinition link is created **only** via `linkKpiToMetric` (which emits `MEASURES`). A raw `INSTANTIATES` edge would collide with the lifecycle-guarded module-pin edge and be rejected `409 model_lifecycle_route_required`. This spec authors **no** `INSTANTIATES`. | Link is `MEASURES` via the helper, never `INSTANTIATES`, never a fixture row. | T-04 |
| **FR-05a metric targets are the two present ids** (§4.5, B-01): **Win Rate → `metric-win-rate`**, **Pipeline Conversion → `metric-pipeline-conversion`** (both verified present in the wave-1 library). These two KPIs are **fixture rows** (self-contained) and are grounded by the resolver. | Two unconditional metric-grounded KPIs; both are fixture rows grounded by the resolver. | T-01, T-04 |
| **FR-05b is conditional (OQ-2, §4.5, review C-02)**: the three named KPIs (Sales Cycle, ACV, Quota Attainment) are **not** fixture rows. For each, the resolver **detects** whether `metric-sales-cycle`/`metric-acv`/`metric-quota-attainment` exists via a catalog lookup; **if and only if** present, it creates the KPI via `POST /api/v1/kpis` and `linkKpiToMetric`s it **atomically** in the same step; if absent, the KPI is **not created at all**. No ungrounded KPI is ever authored (AC-05a). | FR-05b KPIs resolver-created-and-grounded atomically, only when their metric exists; else absent (not ungrounded). | T-04 |
| **D-1 — KPI alignment route** (§2.1, §4.7): **every** `ALIGNED_TO` (including the fully-in-slice KPI→journey/activity case) is created via **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema` = `{kpi_id, target_type:"journey"\|"activity"\|"domain", target_id, weight ∈ [0,1]}`), **never** the generic `POST /api/v1/edges` and **never** a fixture row (Rule C). | Alignment via `/api/v1/kpi-alignments` for all targets; no generic edge, no fixture row for `ALIGNED_TO`. | T-04 |
| **D-2 — risks via `seedRisk`** (§2.1, §4.8): Sales risks are created via `seedRisk(row: RiskSeedRow)` (`api/src/seed/governed-seed-helper.ts`, imported read-only) → `POST /api/v1/risk-register`. The resolver does **not** re-declare the risk body schema; the route's own `createRiskSchema` re-parse is the validation contract. Dedupe by **`name` within `domain:"Sales"`** (`GET /api/v1/risk-register?domain=Sales`, then POST only absent names — no `name` filter exists on the route). | Risks via `seedRisk`; dedupe by check-before-POST on `name` within `domain:"Sales"`. | T-07 |
| **Funnel construct is resolver-only** (§4.6, D-2): `Funnel`/`Stage` via `POST /api/v1/nodes/{Funnel,Stage}`, `HAS_STAGE` via `POST /api/v1/edges`, `CONVERTS_TO` **only** via the range-checked `POST /api/v1/funnels/transitions`. **Never** a fixture or generic-edge `CONVERTS_TO` row. | Funnel construct entirely resolver-written; `CONVERTS_TO` never a fixture/generic-edge row. | T-06 |
| **`resolve()` fail-loud id + funnel-subsystem probe** (§4.4, AC-16): one pass resolves the operator root id (`name:"SaaS Operator"` + `attributes.saasOperatorRoot===true` filter), the Sales domain id (`attributes.seedKey==="sales"` under that root), CRM/MOMS (`operatorSeedKey ∈ ["crm","moms"]`), `sales_lead` role (`operatorSeedKey:"sales_lead"`), the metric ids, and in-slice node ids by `name` scoped to the operator root. It **also** probes the funnel subsystem (`Funnel` label registered + `funnels/transitions` route present via a 404-vs-400 probe). Any missing required id or absent funnel subsystem → loud non-zero exit, never a partial write. | All model-scoped ids resolved dynamically; funnel subsystem asserted present; fail-loud before any write. | T-02 |
| **Idempotency by lookup, not MERGE for API rows** (§4.11): fixture rows MERGE-on-id; every resolver write does a **check-before-POST** keyed on a stable natural attribute (per §4.11 table); a re-run is net-zero, including zero duplicate Postgres risk rows. | check-before-POST per kind; no MERGE-on-id for API rows; risk dedupe by name+domain. | T-03…T-09, T-14 |

Full rationale: design §1 (Rules A–E), §2 (prior-review resolutions), §2.1
(deviations D-1/D-2), §3.1–§3.4, §4.1–§4.11, §5, §7, §11, §12, and
`review-design.md` (B-01/C-01…C-04 all resolved; N-01/N-02).

## Open design concerns — pinned decisions (from review-design.md)

Design review pass 2/2 (`approve`, zero blockers, zero carried concerns) left
**two optional nits** for the tasks author. Both are landed below; neither
reopens the architecture.

| Nit | Decision | Rationale | Locked in task |
|-----|----------|-----------|----------------|
| **N-01 (optional)** — `systemKind` is a **required** `System` attribute (`shared/src/schema/system-kind.ts:30`, `required:["systemKind"]`); a fixture `System` row omitting it is rejected `400 attribute_violation` on import, but design §3.1's node-envelope prose surfaces this only implicitly via AC-04. | **Pin it as an explicit fixture obligation**: every function-specific `System` fixture row (CPQ, E-Signature) **must** carry `attributes.systemKind` = a valid `SYSTEM_KINDS` member (`shared/src/schema/system-kind.ts:9`). CRM/MOMS are foundation-shared and already carry `systemKind` — never re-authored. T-01 makes this a hard step; T-05 asserts it (incl. a negative: a `systemKind`-less row → `400 attribute_violation`, nothing written). | Make the fixture author's obligation explicit at author time so import never rejects a Sales system row. | T-01, T-05 |
| **N-02 (optional, orchestrator)** — the §2.1 D-1/D-2 requirements-errata note (point FR-06 at `POST /api/v1/kpi-alignments`, FR-12 at `seedRisk`→`POST /api/v1/risk-register`) is a documentation alignment, not an FR change. | **Non-gating; not a code task.** The design's superset reading already keeps `requirements.md` and `design.md` non-contradictory (D-1/D-2). If the orchestrator lands the one-line errata within the review budget it is the cleaner end state, but **no task depends on it** and the build is correct without it. Recorded here so the tasks author does not treat it as work. | The running seam already matches D-1/D-2; the errata is prose polish, not a build precondition. | — (orchestrator, optional) |

## Task list

### T-01 — Sales self-contained fixture `sales.json`

- **Files** (1): `shared/seed/saas-operator/sales.json` (new)
- **Implements**: design §3.1, §4.1, §4.2, §4.3 (fixture half), §4.5 (FR-05a KPI
  rows), Rule B — closes AC-13 (fixture shape); supports FR-01, FR-02, FR-03,
  FR-04, FR-05a
- **Complexity**: complex
- **Blocked by**: —
- **Blocks**: T-02, T-10, T-11, T-12, T-13
- **Steps**: Author the `{nodes, edges}` import payload (`importPayloadSchema`,
  `import.ts`) carrying **only** self-contained, non-lifecycle process content.
  Every node row has `label` + the standard envelope (`id` = a **stable seed
  UUIDv7**, `name`, `description`, `attributes`); en-US identifiers throughout.
  1. **5 `UserJourney` rows** (FR-01, §4.1): Prospect & Qualify, Demo, Quote &
     Propose, Negotiate & Close, Tenant Provisioning / Handoff. **No**
     `PART_OF`→Domain edge here — the domain id is server-generated, created by
     the resolver (T-03, B-01).
  2. **`Activity` rows** (FR-02, §4.2) — the frozen roster (design §4.2 table):
     Qualify lead (BANT); Run product demo; Build quote → Present proposal
     (`PRECEDES`); Handle objections → Prepare contract → Send for signature →
     Countersign → Close-won (`PRECEDES` chain); Provision tenant on MOMS → Hand
     off to Customer Success (`PRECEDES`). Each `PART_OF` its parent journey
     (fixture edge, both endpoints in-slice).
  3. **4 function-specific `Role` rows** (FR-03, §4.3): Account Executive (AE),
     Sales Development Rep (SDR), Sales Engineer (SE), Deal Desk. The shared
     `sales_lead` role is **not** re-authored (foundation-owned; its `EXECUTES`
     edge is a resolver edge, T-03).
  4. **Function-specific `System` rows** (FR-04, §3.1, **N-01**) — **each with a
     required valid `systemKind`** from `SYSTEM_KINDS` (`system-kind.ts:9`):
     **CPQ / quoting tool** (non-optional — FR-11's *Price and quote a deal*
     capability is `SUPPORTED_BY` it) and **E-Signature** service. A row omitting
     `systemKind` → `400 attribute_violation` on import (AC-04). CRM/MOMS are
     foundation-shared, **referenced by resolved id** (T-03), never re-authored.
  5. **FR-05a `KPI` rows** (FR-05a, §3.3, §4.5) — **Win Rate** and **Pipeline
     Conversion**, each with the KPI attribute envelope matching
     `commercial-domain.json` (`{category, unit, target_value, target_direction,
     measurement_frequency}`). **Omit `domain_id`** (the Sales domain id is
     server-generated — §3.3; the KPI→domain binding is the resolver's
     `ALIGNED_TO` edge, T-04). The three FR-05b KPIs are **not** authored here
     (resolver-created-and-grounded atomically only if their metric exists, T-04).
  6. **Intra-slice edge rows** (§3.1 table, both endpoints stable-id fixture
     nodes): `PART_OF` (Activity→UserJourney), `PRECEDES` (Activity→Activity
     where sequenced), `EXECUTES` (function-specific Role→Activity, **every
     activity ≥1 EXECUTES** counting resolver `sales_lead` edges too),
     `USES_SYSTEM` (Activity→in-slice System — CPQ, E-Signature).
  7. **Excluded from the fixture** (§3.1, §3.2, Rule B/C, NFR-04): **no**
     `PART_OF` UserJourney→Domain; **no** `EXECUTES` from shared `sales_lead`;
     **no** `USES_SYSTEM`→CRM/MOMS; **no** `ALIGNED_TO` (all alignment is
     resolver via `kpi-alignments`, C-01); **no** `MEASURES`; **no**
     `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO`; **no**
     `UserStory`/`AcceptanceCriterion`; **no** `Capability`/`CAPABILITY_IN_MODEL`;
     **no** risk rows (Postgres, not graph); **no** lifecycle node/edge rows
     (`BusinessModel`/`ModuleInstance`/… or `IN_MODEL`/`INSTANTIATES`/… — a
     lifecycle row → `409 model_lifecycle_route_required`, AC-13).
  The file is pure data (no code). Keep the node `name`s aligned with the T-02
  resolver's in-slice `name` lookups.
- **Verification**: `api/__tests__/sales-seed-lifecycle-guard.integration.test.ts`
  (AC-13, fixture-shape half) — the fixture parses as a valid `{nodes,edges}`
  payload, contains **only** self-contained non-lifecycle process rows (no
  lifecycle node/edge rows; no `MEASURES`/`CONVERTS_TO`/`UserStory`/
  `AcceptanceCriterion`/`Capability` rows), and loads via `POST /api/v1/import`.
  `bun run typecheck` passes at checkpoint. Deferred-green: `bun test:integration`.

### T-02 — Resolver skeleton + `resolve()` (id resolution + funnel-subsystem probe) + loopback base URL

- **Files** (1): `api/scripts/seed-sales.ts` (new)
- **Implements**: design §4 (top-level sequence), §4.4, §7, §1 (B-01 funnel
  precondition) — closes nothing alone (precondition for T-03…T-09); supports
  FR-01–FR-12, NFR-05, NFR-06
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-03, T-04, T-05, T-06, T-07, T-08, T-09
- **Steps**: Create the `seed:sales` resolver scaffold, a self-owned sibling of
  `api/scripts/seed-saas-metric-library.ts` (which is **never** edited, Rule E).
  1. **Base URL + auth** — target `http://127.0.0.1:8787` (loopback, house rule),
     reading `HOST`/`API_PORT` env with the loopback default exactly as
     `seed-saas-operator.ts` / `seed-saas-metric-library.ts`. Send **no** auth
     header — DEV-ONLY seed tooling relying on the `ONELOGIN_ISSUER`-unset
     dev-session fallback (`router.ts` `devSession()` → `permissions:["*"]`);
     a header comment states it is never a beyond-localhost path (CLAUDE.md auth
     note). No per-route auth is rolled (NFR-05).
  2. **`resolve()` — required foreign ids** (§4.4) via `POST /api/v1/query/cypher`
     (`query:read`): operator root (`MATCH (m:BusinessModel {name:"SaaS Operator"})`
     then TS-filter `JSON.parse(attributes_json).saasOperatorRoot === true`);
     Sales domain (`MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$root})`
     TS-filter `attributes.seedKey === "sales"`); CRM/MOMS system ids
     (`operatorSeedKey ∈ ["crm","moms"]`); `sales_lead` role
     (`operatorSeedKey:"sales_lead"`); metric ids (`metric-win-rate`,
     `metric-pipeline-conversion`, and the FR-05b ids **if present**); in-slice
     node ids by `name` **scoped to the operator root** so a retail node of the
     same name is never matched. Build an in-memory `{key → id}` map.
  3. **`resolve()` — funnel-subsystem probe** (§4.4, B-01): assert the `Funnel`
     label is registered (`CALL db.labels()` / ontology-registry read) **and**
     `POST /api/v1/funnels/transitions` is routed (a probe POST with an
     empty/invalid body expects a `400` validation response, **not** a `404`
     unrouted response). Absent → throw
     `funnel-pipeline-modeling not executed: <Funnel label unregistered | POST /api/v1/funnels/transitions absent>`.
  4. **Loud fail** — if any **required** foreign id (operator root, Sales domain,
     CRM, MOMS, `sales_lead`, `metric-win-rate`, `metric-pipeline-conversion`)
     resolves to nothing, **or** the funnel-subsystem probe fails, `throw` a clear
     message ("unresolved foundation/library id: `<key>`" or the funnel
     not-executed message) and exit non-zero — **never** a partial write (AC-16).
  5. **`main()` skeleton** — call `resolve()` then the step stubs in §4 order
     (`crossRefEdges` → `kpiLinks` → `funnel` → `stories` → `capabilities` →
     `risks`), each filled by T-03…T-09. Export a small **internal** permissive
     zod input guard for the script's own literal content tables (§3.4) —
     **internal only, never a REST boundary**; the routes re-parse every POST.
     `zod` only; en-US identifiers.
- **Verification**: `api/__tests__/sales-seed-ordering.integration.test.ts`
  (`resolve()` half, AC-16) — after `seed:saas-metric-library` + `seed:saas-operator`
  and with the funnel subsystem present, `resolve()` returns a non-empty operator
  root id + the `seedKey="sales"` domain id + CRM/MOMS/`sales_lead` ids + the two
  FR-05a metric ids; with the operator root or a required foreign id absent, the
  script exits non-zero and writes nothing; with the `Funnel` label / transitions
  route absent, it exits non-zero with the "funnel-pipeline-modeling not executed"
  message before any write. `bun run typecheck` passes at checkpoint.
  Deferred-green: `bun test:integration`.

### T-03 — Resolver: cross-reference edges (PART_OF→domain, EXECUTES(sales_lead), USES_SYSTEM→CRM/MOMS)

- **Files** (1): `api/scripts/seed-sales.ts` (extend from T-02)
- **Implements**: design §4.7 (`crossRefEdges`), §3.2, §4.1, §4.3, §4.4 — closes
  AC-01 (journeys `PART_OF` domain), AC-03 (shared-role EXECUTES), AC-04 (CRM/MOMS
  USES_SYSTEM); supports FR-01, FR-03, FR-04
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-14
- **Steps**: For every id-referencing graph edge (both are `POST /api/v1/edges`
  with `edgeCreateSchema` `{type, fromId, toId}`; the generic validator enforces
  the `EDGE_ENDPOINTS` whitelist + cross-type edge-id uniqueness):
  1. **`PART_OF` UserJourney→Sales `Domain`** (FR-01) — for each of the five
     resolved journeys, check-before-POST a `PART_OF` to the resolved Sales domain
     id. Idempotency key: existing `(:UserJourney {id})-[:PART_OF]->(:Domain {id})`.
  2. **`EXECUTES` shared `sales_lead`→`Activity`** (FR-03) — check-before-POST
     `EXECUTES` from the resolved `sales_lead` role id to the activities it
     executes (e.g. *Provision tenant on MOMS* / *Hand off*, §4.3). Function-specific
     `EXECUTES` edges are fixture rows (T-01) — not repeated here.
  3. **`USES_SYSTEM` `Activity`→CRM/MOMS** (FR-04) — check-before-POST
     `USES_SYSTEM` from CRM-operating activities to the resolved **CRM** id, and
     from the tenant-provisioning activity to the resolved **MOMS** id. In-slice
     `USES_SYSTEM`→CPQ/E-Signature are fixture rows (T-01).
  Every write is check-before-POST (§4.11) so a re-run is net-zero.
- **Verification**:
  - `api/__tests__/sales-journeys.integration.test.ts` (AC-01) — after the full
    seed, the five journeys are `PART_OF` the `seedKey="sales"` domain; exactly
    one `Domain{seedKey:"sales"}` (no dup).
  - `api/__tests__/sales-roles.integration.test.ts` (AC-03) — shared `sales_lead`
    referenced (single, not duplicated) via `EXECUTES`.
  - `api/__tests__/sales-systems.integration.test.ts` (AC-04) — CRM-operating
    activities `USES_SYSTEM`→resolved CRM (single, not duplicated); tenant-provision
    activity `USES_SYSTEM`→MOMS.
  Deferred-green: `bun test:integration`.

### T-04 — Resolver: KPI links — MEASURES (via linkKpiToMetric) + FR-05b conditional KPIs + ALIGNED_TO (via kpi-alignments)

- **Files** (1): `api/scripts/seed-sales.ts` (extend from T-03)
- **Implements**: design §4.5 (`MEASURES` + FR-05b), §4.7 (`ALIGNED_TO`), §2.1
  D-1, XD-06-erratum — closes AC-05, AC-05a, AC-06; supports FR-05, FR-05a,
  FR-05b, FR-06
- **Complexity**: complex
- **Blocked by**: T-03
- **Blocks**: T-14, T-16
- **Steps**:
  1. **FR-05a `MEASURES`** (§4.5) — via `saas-metric-library`'s
     `linkKpiToMetric(baseUrl, kpiId, metricId)` (`api/src/seed/link-kpi-metric.ts`,
     imported **read-only**, the sole sanctioned path with the at-most-one
     cardinality guard): Win Rate KPI → `metric-win-rate`; Pipeline Conversion KPI
     → `metric-pipeline-conversion`. **Never** a raw `sales.json` `MEASURES` row
     (AC-05 greps the fixture empty). Idempotency: the helper treats "already
     linked" (`KpiMetricAlreadyLinkedError`) as satisfied.
  2. **FR-05b conditional KPIs** (§4.5, review C-02, OQ-2) — for each of Sales
     Cycle / ACV / Quota Attainment: **detect** its metric via a catalog lookup
     (`MATCH (m:MetricDefinition {id:$id}) RETURN m` for
     `metric-sales-cycle`/`metric-acv`/`metric-quota-attainment`). **If and only
     if** present, create the KPI via `POST /api/v1/kpis` (`kpiCreateRequestSchema`,
     `kpi:write`) — natural-key guarded on `KPI.name` scoped to the operator root
     — and **immediately** `linkKpiToMetric` it (grounded atomically). If absent,
     the KPI is **not created at all**. No ungrounded KPI is ever authored
     (AC-05a).
  3. **`ALIGNED_TO` — all targets** (FR-06, D-1, §4.7) — for **every** Sales KPI
     (the two FR-05a + any FR-05b), check-before-POST ≥1 alignment via
     **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema` =
     `{kpi_id, target_type:"journey"\|"activity"\|"domain", target_id, weight}`,
     `kpi:write`). Includes the id-referencing KPI→Sales-domain case
     (`target_type:"domain"`) **and** the fully-in-slice KPI→journey/activity case
     (`target_type:"journey"\|"activity"`, e.g. Win Rate → Negotiate & Close
     journey) — **both** route-written, never fixture rows (Rule C, C-01). The
     route enforces `weight ∈ [0,1]` + target-exists server-side. Idempotency key:
     existing `(:KPI {id})-[:ALIGNED_TO]->(:… {id})`.
  `link-kpi-metric.ts`, `kpi-sla-alignment.ts`, and `kpi-crud.ts` are **never
  edited** (NFR-02).
- **Verification**: `api/__tests__/sales-kpi-metric.integration.test.ts`
  (AC-05, AC-05a, AC-06) — Win Rate `MEASURES` `metric-win-rate`, Pipeline
  Conversion `MEASURES` `metric-pipeline-conversion` (via `linkKpiToMetric`); a
  second `MEASURES` on the same KPI is rejected by the helper's at-most-one guard;
  **every** Sales `KPI` has ≥1 `MEASURES` edge (FR-05b KPIs present only if their
  metrics exist, absent — not ungrounded — otherwise); each Sales KPI has ≥1
  `ALIGNED_TO` edge written via `/api/v1/kpi-alignments`; manual:
  `grep '"MEASURES"' shared/seed/saas-operator/sales.json` — expect no matches.
  Deferred-green: `bun test:integration`.

### T-05 — Systems + systemKind enforcement integration test (AC-04)

- **Files** (1): `api/__tests__/sales-systems.integration.test.ts` (extend from
  T-03)
- **Implements**: design §3.1 (N-01 systemKind obligation), §4.4, §8 — closes
  AC-04; supports FR-04
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-13
- **Blocks**: —
- **Steps**: After the seed precondition:
  - `USES_SYSTEM` edges resolve to systems; the shared **CRM**/**MOMS** resolve to
    the **single** foundation-seeded `System` (no duplicate); function-specific
    CPQ/E-Signature resolve to fixture nodes.
  - **N-01 positive** — every function-specific system (CPQ, E-Signature) carries
    a valid `systemKind` from `SYSTEM_KINDS` (`system-kind.ts:9`).
  - **N-01 negative** — POST a hand-constructed `{nodes}` payload with a `System`
    row **omitting** `systemKind` to `POST /api/v1/import`; assert it is rejected
    `400 attribute_violation`, **payload-atomic** (nothing written) — proving the
    real fixture rows are clean *because* the guard would reject a bare one.
- **Verification**: `api/__tests__/sales-systems.integration.test.ts` (AC-04) —
  CRM/MOMS single node (not duplicated); CPQ + E-Signature carry a valid
  `systemKind`; a `systemKind`-less fixture row → `400 attribute_violation`,
  nothing written. Deferred-green: `bun test:integration`.

### T-06 — Resolver: Sales Pipeline Funnel (Funnel/Stage/HAS_STAGE + CONVERTS_TO via transitions route)

- **Files** (1): `api/scripts/seed-sales.ts` (extend from T-02)
- **Implements**: design §4.6 (Rule D `modelId` anchor), §3.2, §2.1 D-2 — closes
  AC-07, AC-08; supports FR-07, FR-08
- **Complexity**: complex
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**: (**Execution precondition, B-01**: `resolve()` (T-02) has asserted
  the `Funnel`/`Stage` labels + `HAS_STAGE`/`CONVERTS_TO` edge types + the
  `POST /api/v1/funnels/transitions` route are live; if not, the run already
  failed loudly in T-02 — this step never half-writes against an unbuilt
  subsystem.)
  1. **`Funnel` node** — resolve-or-create via natural-key lookup on
     `name:"Sales Pipeline"` scoped to the operator root, else
     `POST /api/v1/nodes/Funnel` with `name:"Sales Pipeline"` and
     **`attributes.modelId = <resolved operator-root id>`** (Rule D, Resolves
     review C-01 — the anchor `funnel-pipeline-modeling` FR-09's listing
     traverses; **no** reachability edge).
  2. **6 `Stage` nodes** — a strict linear chain **Lead(1) → Qualified(2) →
     Demo(3) → Proposal(4) → Negotiation(5) → Closed-Won(6)**, each with the
     required integer `stageOrder` (a non-integer → `400 attribute_violation`)
     via `POST /api/v1/nodes/Stage` if absent. **Note (§4.6 N-02): the six funnel
     stages are deliberately distinct from the five §4.1 journeys** — a `Stage` is
     a conversion measurement point, a `UserJourney` is the process a role
     executes; no cross-cardinality assertion couples them.
  3. **`HAS_STAGE` edges** (Funnel→Stage) via `POST /api/v1/edges` if absent
     (generic path; endpoint pair registry-enforced).
  4. **5 `CONVERTS_TO` transitions** (Lead→Qualified, …, Negotiation→Closed-Won)
     **only** via `POST /api/v1/funnels/transitions` (`funnelTransitionSchema` =
     `{fromId, toId, conversionRate ∈ [0,1], dropOffRate ∈ [0,1]}`, the sole place
     the `[0,1]` range guard lives) if absent (checked by a `MATCH
     (a)-[:CONVERTS_TO]->(b)` read). Illustrative **descriptive** rates in `[0,1]`
     (XD-03 — not operational). **Never** a fixture or generic-edge `CONVERTS_TO`
     row (D-2). `funnels.ts` is **never edited** (`funnel-pipeline-modeling`-owned,
     NFR-02).
- **Verification**: `api/__tests__/sales-funnel.integration.test.ts` (AC-07,
  AC-08) — the "Sales Pipeline" `Funnel` with the ordered six-`Stage` chain
  (integer `stageOrder`) all `HAS_STAGE`; the funnel is returned by
  `funnel-pipeline-modeling` FR-09's **actual** operator-root-scoped listing
  (`modelId`=operator root, Rule D) and **excluded** when scoped to retail Model
  #1; each `CONVERTS_TO` has `conversionRate`/`dropOffRate` ∈ `[0,1]` round-tripping
  intact; overall conversion (product) computes; an out-of-range transition POST
  (`conversionRate:1.5`) → `400 attribute_violation`; manual:
  `grep '"CONVERTS_TO"' shared/seed/saas-operator/sales.json` — expect no matches.
  Deferred-green: `bun test:integration` (needs the executed funnel subsystem,
  B-01).

### T-07 — Resolver: Sales stories + Given/When/Then acceptance criteria (model-scoped routes)

- **Files** (1): `api/scripts/seed-sales.ts` (extend from T-02)
- **Implements**: design §4.9 — closes AC-09; supports FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**:
  1. **≥1 `UserStory` per notable Sales activity** via
     `POST /api/v1/models/:modelId/stories` (`storyCreateSchema` =
     `{persona, action, benefit, activityId, roleId?}`, `.strict()`; `story:write`),
     `:modelId` = the resolved operator root. `activityId` = a **scoped** Sales
     activity id (else `404 story_activity_not_in_model`); `roleId` = the resolved
     executing role. The route assembles `narrative` server-side
     (`"As a <persona>, I want to <action>, so that <benefit>."`), sets
     `derived:false`, and emits `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when
     `roleId` set). **Cardinality** (verified `story-spec-core` FR-03): exactly one
     `DESCRIBES_ACTIVITY`, at most one `STORY_FOR_ROLE`; an `Activity` may be the
     target of `1..*` stories. Idempotency key: existing `(:UserStory)` for the
     target activity (natural key by narrative/activity, §4.11).
  2. **≥1 `AcceptanceCriterion` per story** via
     `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria`
     (`acCreateSchema` = `{given, when, then, ordinal?}`, each clause `min(1)`,
     else `400 acceptance_criterion_clause_required`; `story:write`). The route
     emits `ACCEPTANCE_OF`. Idempotency key: existing AC on the story.
  **Never** raw `sales.json` `UserStory`/`AcceptanceCriterion` rows (AC-09 greps
  the fixture empty). `stories.ts` is **never edited** (NFR-02).
- **Verification**: `api/__tests__/sales-stories.integration.test.ts` (AC-09) —
  notable activities each have ≥1 `UserStory` (`derived:false`, server-assembled
  `narrative`) with exactly one `DESCRIBES_ACTIVITY` + at most one
  `STORY_FOR_ROLE`; a story create with an out-of-scope `activityId` → `404
  story_activity_not_in_model`; each story ≥1 `AcceptanceCriterion` (non-empty
  given/when/then, `ACCEPTANCE_OF`); a missing clause → `400
  acceptance_criterion_clause_required`; manual:
  `grep -E '"UserStory"|"AcceptanceCriterion"' shared/seed/saas-operator/sales.json`
  — expect no matches; manual: `git diff --stat api/src/routes/stories.ts` —
  expect no change. Deferred-green: `bun test:integration`.

### T-08 — Resolver: DDD capabilities + NEEDS_CAPABILITY/SUPPORTED_BY (DDD routes)

- **Files** (1): `api/scripts/seed-sales.ts` (extend from T-02)
- **Implements**: design §4.10 — closes AC-10; supports FR-11
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-16
- **Steps**: Via the model-scoped **capability** routes (handlers in
  `api/src/routes/capabilities.ts`), `:modelId` = the resolved operator root:
  1. **Capabilities** via `POST /api/v1/models/:modelId/capabilities`
     (`capabilityCreateSchema` = `{name, description?}`, `capability:write`):
     **Qualify a lead**, **Price and quote a deal**, **Close a contract**,
     **Provision a tenant**. The create tx writes `CAPABILITY_IN_MODEL`→the
     operator root **authoritatively** (`ddd-system-modeling` FR-04) — every
     capability is scoped-from-birth to the operator root; **never** a raw
     `CAPABILITY_IN_MODEL` fixture row (AC-10). Idempotency key: existing
     `(:Capability {name})` in the model.
  2. **`NEEDS_CAPABILITY`** via
     `PUT /api/v1/models/:modelId/capabilities/:capabilityId/needed-by`
     (`neededBySchema`: exactly one of `{activityId}` / `{storyId}`) — each
     capability needed-by ≥1 Sales `Activity` and/or `UserStory` (e.g. *Price and
     quote a deal* needed-by *Build quote*).
  3. **`SUPPORTED_BY`** via
     `PUT /api/v1/models/:modelId/capabilities/:capabilityId/supported-by`
     (`supportedBySchema`: `{systemId}`) — *Price and quote a deal* `SUPPORTED_BY`
     the **CPQ** system; *Provision a tenant* `SUPPORTED_BY` **MOMS**.
  **Never** raw `sales.json` `Capability`/`CAPABILITY_IN_MODEL` rows (AC-10 greps
  the fixture empty). `capabilities.ts` is **never edited** (NFR-02).
- **Verification**: `api/__tests__/sales-capabilities.integration.test.ts`
  (AC-10) — the 4 `Capability`s each `NEEDS_CAPABILITY`-linked from ≥1
  Activity/Story, `SUPPORTED_BY` where applicable (Price and quote→CPQ, Provision
  a tenant→MOMS); each has **exactly one** `CAPABILITY_IN_MODEL` → the operator
  root and **no other** `BusinessModel` (verified against retail Model #1
  absence); manual: `grep '"Capability"' shared/seed/saas-operator/sales.json` —
  expect no matches; manual: `git diff --stat api/src/routes/capabilities.ts` —
  expect no change. Deferred-green: `bun test:integration`.

### T-09 — Resolver: Sales risks via the governed risk-register API (seedRisk, dedupe by name)

- **Files** (1): `api/scripts/seed-sales.ts` (extend from T-02)
- **Implements**: design §4.8, §2.1 D-2, XD-04 — closes AC-11; supports FR-12
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-14, T-16
- **Steps**: Import `seedRisk` from `api/src/seed/governed-seed-helper.ts`
  (**read-only**) and create the four Sales risks (§4.8 frozen roster) as Postgres
  `risk_register` rows via `POST /api/v1/risk-register` (`createRiskSchema` is the
  route's own re-parse — the resolver does **not** re-declare it, D-2):
  | `name` | `risk_type` | `linked_entity_*` |
  |--------|-------------|-------------------|
  | Pipeline-coverage shortfall | `operational` | domain: Sales domain id |
  | Discount / margin leakage in Deal Desk | `financial` | journey: Negotiate & Close |
  | CRM data-quality / forecast accuracy | `operational` | domain: Sales domain id |
  | Key-person dependency on a top AE | `strategic` | domain: Sales domain id |
  Each row sets `domain:"Sales"`, an `owner`, `likelihood`/`impact` ∈ 1–5,
  `status`, `trend`, and (where it links a graph entity)
  `linked_entity_type`/`linked_entity_id` = the resolved Sales domain or a journey
  id. **Idempotent dedupe (NFR-03, OQ-5)**: check-before-POST on `name` within
  `domain:"Sales"` — `GET /api/v1/risk-register?domain=Sales` (filters by
  `domain`, **no `name` filter** — verified) returns all Sales rows; POST only
  names not present. This spec **never** edits `risk-register.ts`,
  `risk-compliance.ts`, `compliance-rules.ts`, `change-requests.ts`, or
  `sla-crud.ts` (XD-04/NFR-02).
- **Verification**: `api/__tests__/sales-risks.integration.test.ts` (AC-11) —
  `GET /api/v1/risk-register?domain=Sales` returns the four Sales risks each with
  valid `likelihood`/`impact`/`status`/`risk_type` and `linked_entity_id` where
  applicable; manual: `git diff --stat api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests,sla-crud}.ts api/src/storage/postgres/*`
  — expect no change. Deferred-green: `bun test:integration` (needs Postgres).

### T-10 — Wire `seed:sales` package script

- **Files** (1): `package.json` (modify)
- **Implements**: design §7 — closes AC-15 (loader-untouched / boundary half);
  supports NFR-01, NFR-02
- **Complexity**: simple
- **Blocked by**: T-02
- **Blocks**: T-11, T-16
- **Steps**: Add the single script line to the root `package.json` `scripts`:
  `"seed:sales": "bun --cwd api scripts/seed-sales.ts"` (matching the existing
  `"seed:saas-operator"` / `"seed:saas-metric-library"` `bun --cwd api scripts/…`
  form, §7). This is the **sole** `package.json` edit. Run **after** the funnel
  subsystem is executed and `seed:saas-metric-library` (`MetricDefinition` roster
  + `MEASURES` edge type) and `seed:saas-operator` (operator root + Sales domain +
  shared catalog + loads `sales.json`); the ordering is documented in the script
  header and `resolve()` (T-02) fails loud if a precondition is missing. **No**
  edit to `api/scripts/seed-saas-operator.ts` (foundation loader — the fixture is
  discovered by its directory scan, not registered) or
  `api/scripts/seed-saas-metric-library.ts`.
- **Verification**: manual: `grep '"seed:sales"' package.json` shows the entry and
  `ls api/scripts/seed-sales.ts` exists; manual:
  `git diff --stat api/scripts/seed-saas-operator.ts api/scripts/seed-saas-metric-library.ts`
  — expect no change (AC-15, loaders untouched). `bun run typecheck` passes.

### T-11 — Ordering integration test (AC-16)

- **Files** (1): `api/__tests__/sales-seed-ordering.integration.test.ts` (extend
  from T-02)
- **Implements**: design §1, §4.4, §4.6, §8 + NFR-06 (B-01) — closes AC-16;
  supports FR-05, FR-07, FR-09, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-02, T-10
- **Blocks**: T-16
- **Steps**: Assert the fail-loud cross-entrypoint + funnel-subsystem contract:
  - **Unresolved id** — run `seed:sales` **before** `seed:saas-operator` /
    `seed:saas-metric-library` (Sales domain / shared roles / CRM / `MEASURES` not
    yet present): the script exits non-zero with a clear "unresolved
    foundation/library id" message and writes **no** partial subgraph.
  - **Absent funnel subsystem** — run `seed:sales` when the `Funnel` label /
    `funnels/transitions` route are absent: `resolve()` throws
    "funnel-pipeline-modeling not executed" and exits non-zero **before any funnel
    write** (§4.4/§4.6 probe, B-01).
  - **In-order** — the full sequence (funnel subsystem executed →
    `seed:saas-metric-library` → `seed:saas-operator` → `seed:sales`) succeeds.
- **Verification**: `api/__tests__/sales-seed-ordering.integration.test.ts`
  (AC-16). Deferred-green: `bun test:integration`.

### T-12 — Journeys + activities + roles integration tests (AC-01, AC-02, AC-03)

- **Files** (3): `api/__tests__/sales-journeys.integration.test.ts` (extend from
  T-03), `api/__tests__/sales-activities.integration.test.ts` (new),
  `api/__tests__/sales-roles.integration.test.ts` (extend from T-03)
- **Implements**: design §3.1, §4.1, §4.2, §4.3, §8 — closes AC-01, AC-02, AC-03;
  supports FR-01, FR-02, FR-03
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-10
- **Blocks**: —
- **Steps**: Each test runs the seed precondition then asserts against the seeded
  graph via `POST /api/v1/query/cypher`:
  - **AC-01** (journeys) — the five journeys resolve under the `seedKey="sales"`
    domain, each `PART_OF` the domain (resolver edge); exactly one
    `Domain{seedKey:"sales"}` (no dup).
  - **AC-02** (activities) — every seeded `Activity` is `PART_OF` its journey; the
    intra-journey `PRECEDES` chains resolve (e.g. the Negotiate & Close step
    sequence; no dangling `PRECEDES`); each activity carries the standard node
    envelope; no orphaned activity.
  - **AC-03** (roles) — every `Activity` has ≥1 `EXECUTES` role; the shared
    `sales_lead` referenced resolves to a **single** shared `Role` (no duplicate);
    function-specific AE/SDR/SE/Deal Desk are present (frozen roster, §4.3).
- **Verification**: `api/__tests__/sales-journeys.integration.test.ts` (AC-01),
  `api/__tests__/sales-activities.integration.test.ts` (AC-02),
  `api/__tests__/sales-roles.integration.test.ts` (AC-03). Deferred-green:
  `bun test:integration`.

### T-13 — Seed shape + lifecycle-guard-clean integration test (AC-13)

- **Files** (1): `api/__tests__/sales-seed-lifecycle-guard.integration.test.ts`
  (extend from T-01)
- **Implements**: design §3.1, §3.2, §8 + NFR-04 — closes AC-13; supports NFR-04
- **Complexity**: moderate
- **Blocked by**: T-01, T-10
- **Blocks**: T-05
- **Steps**: Assert the fixture contract:
  - `sales.json` is a valid `{nodes,edges}` import payload containing **only**
    self-contained non-lifecycle process rows (no `BusinessModel`/`ModuleInstance`/…
    node rows; no `IN_MODEL`/`INSTANTIATES`/other lifecycle edge rows; no
    `MEASURES`/`CONVERTS_TO`/`UserStory`/`AcceptanceCriterion`/`Capability` rows);
    loading it via the foundation loader (`POST /api/v1/import`) succeeds and
    writes the Sales process content.
  - **Negative (NFR-04)** — a hand-mutated fixture carrying a lifecycle row
    (`IN_MODEL` or `INSTANTIATES`, both in `LIFECYCLE_EDGES`, or a `BusinessModel`
    node) → `POST /api/v1/import` rejected `409 model_lifecycle_route_required`,
    nothing written (payload-atomic pre-scan), proving the real fixture is clean
    *because* the guard would reject a dirty one.
  - The loader picks up the fixture with **no** `seed-saas-operator.ts` edit.
- **Verification**:
  `api/__tests__/sales-seed-lifecycle-guard.integration.test.ts` (AC-13); manual:
  `grep -E '"IN_MODEL"|"INSTANTIATES"|"BusinessModel"|"ModuleInstance"' shared/seed/saas-operator/sales.json`
  — expect no matches. Deferred-green: `bun test:integration`.

### T-14 — Idempotency + completeness + retail-isolation integration test (AC-12)

- **Files** (1): `api/__tests__/sales-seed-idempotency.integration.test.ts` (new)
- **Implements**: design §4.8, §4.11, §8 + NFR-03/NFR-06 — closes AC-12; supports
  NFR-03, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-03, T-04, T-06, T-07, T-08, T-09, T-10
- **Blocks**: T-16
- **Steps**: Run the **full sequence** (funnel subsystem executed →
  `seed:saas-metric-library` → `seed:saas-operator` → `seed:sales`) **twice** and
  assert:
  - **Idempotency** — zero net new Sales nodes/edges (fixture stable ids MERGE;
    resolver route-writes are existence/natural-key guarded per §4.11) **and**
    zero duplicate Sales risk rows (`GET /api/v1/risk-register?domain=Sales`
    returns the same count after the second run — dedupe by `name` within
    `domain:"Sales"`).
  - **Completeness** — the cross-reference edges
    (`PART_OF`/`USES_SYSTEM`/`EXECUTES`/`MEASURES`) are present after the sequence
    (they are produced by `seed:sales`, not `seed:saas-operator` alone — this is
    the B-01 completeness assertion).
  - **Retail isolation** — a pre/post `/api/v1/stats` diff attributable to a
    re-run is zero for the retail Model #1 root; no run mutates retail's subgraph
    or the retail/commercial seed files (XD-01).
- **Verification**: `api/__tests__/sales-seed-idempotency.integration.test.ts`
  (AC-12). Deferred-green: `bun test:integration` (Neo4j + Postgres).

### T-15 — Boundary / no-new-machinery integration + CLI check (AC-15)

- **Files** (1): `api/__tests__/sales-boundary.integration.test.ts` (new)
- **Implements**: design §3, §5, §6, §9, §11 + NFR-01/NFR-02/NFR-05 — closes
  AC-15; supports NFR-01, NFR-02, NFR-05
- **Complexity**: simple
- **Blocked by**: T-02, T-10
- **Blocks**: T-16
- **Steps**:
  - **No new label/edge type** — assert (via `POST /api/v1/query/cypher` on the
    ontology registry + a `git diff` guard) that this slice added **zero** entries
    to `shared/src/schema/{nodes,edges}.ts` and registered **zero** new runtime
    ontology labels/edge types (it instantiates the wave-1 constructs, NFR-01).
  - **No new REST route / RBAC permission / error code** —
    `git diff api/src/router.ts api/src/auth/rbac-permissions.ts api/src/errors.ts`
    shows **no** additions (every route the resolver calls is already mapped —
    design §5).
  - **No owned-elsewhere edit** — `git diff --stat` is confined to
    `shared/seed/saas-operator/sales.json`, `api/scripts/seed-sales.ts`, the
    `seed:sales` `package.json` line, and this spec's own tests; **no**
    `route.ts`/`SURFACES`/`views/index.tsx` (XD-05), foundation-loader,
    `seed-saas-metric-library.ts`, `ensure-*`/catalog module, or
    risk/funnel/metric/story/DDD/KPI route/storage edit (Rule E).
  - **No pwa touch** — `git diff --stat pwa/` is empty (NFR-01).
- **Verification**: `api/__tests__/sales-boundary.integration.test.ts` +
  `bun run typecheck` exit 0; manual:
  `git diff --stat shared/src/schema/nodes.ts shared/src/schema/edges.ts api/src/auth/rbac-permissions.ts api/src/router.ts api/src/errors.ts`
  — expect no additions (AC-15). Deferred-green: `bun test:integration`.

### T-16 — Mapping-coverage integration test + final validation sweep (AC-14)

- **Files** (1): `api/__tests__/sales-mapping-coverage.integration.test.ts` (new)
- **Implements**: design §3.1–§3.3, §8, §11 + requirements FR-13 — closes AC-14,
  and drives the AC-01…AC-16 sweep; supports FR-13, all FR/NFR
- **Complexity**: moderate
- **Blocked by**: T-04, T-06, T-07, T-08, T-09, T-10, T-11, T-14, T-15
- **Blocks**: —
- **Steps**:
  1. **AC-14 mapping coverage** — over the **whole seeded Sales subgraph**
     (post-`seed:sales`: fixture rows + resolver-created edges + Postgres risk
     rows, **not** `sales.json` alone — Resolves review C-03), assert every
     distinct node label + edge type appears in a mapping-table row (requirements
     "Sales Function → Representation Mapping"), and every mapping-table row is
     instantiated **except** the two reference-only rows (`Domain`,
     `MetricDefinition` — foundation/library-seeded). Do **not** require a
     bijection over `sales.json`'s distinct-type set (the id-referencing edge types
     deliberately do not appear in the fixture). Risk rows checked in Postgres
     `risk_register`; all graph rows via `POST /api/v1/query/cypher`.
  2. **Final sweep** — with the full stack up (`bun run dev`) and the seed chain
     run in order (funnel subsystem executed → `seed:saas-metric-library` →
     `seed:saas-operator` → `seed:sales`): `bun run typecheck` exit 0;
     `bun test:integration` green across all
     `api/__tests__/sales-*.integration.test.ts`; the AC-05/AC-07/AC-08/AC-09/
     AC-10/AC-11/AC-13/AC-15 `git diff` + `grep` boundary checks all clean (no
     owned-elsewhere edit, no schema/RBAC/route/error-code addition, no fixture
     grep-empty violation).
- **Verification**: `api/__tests__/sales-mapping-coverage.integration.test.ts`
  (AC-14); manual: with the seeded stack up, run `bun run typecheck` (exit 0),
  `bun test:integration` (all `sales-*.integration.test.ts` green), and the
  `git diff --stat` boundary checks on
  `api/src/routes/{funnels,stories,capabilities,kpi-sla-alignment,edges,nodes,import,query,risk-register,risk-compliance,compliance-rules,change-requests,sla-crud}.ts`,
  `api/scripts/{seed-saas-operator,seed-saas-metric-library}.ts`,
  `shared/src/schema/{nodes,edges}.ts`, `api/src/auth/rbac-permissions.ts`,
  `api/src/router.ts`, `api/src/errors.ts`, `pwa/` — expect every one unchanged
  (full AC-01…AC-16 sweep). Deferred-green: `bun test:integration`.

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.1, §4.1, §4.2, §4.3, §4.5, N-01 | AC-13 (fixture shape) | FR-01, FR-02, FR-03, FR-04, FR-05a |
| T-02 | §4, §4.4, §7, §1 (B-01) | (precondition) + AC-16 (resolve half) | FR-01–FR-12, NFR-05, NFR-06 |
| T-03 | §4.7, §4.1, §4.3, §4.4 | AC-01, AC-03, AC-04 | FR-01, FR-03, FR-04 |
| T-04 | §4.5, §4.7, D-1, XD-06-erratum | AC-05, AC-05a, AC-06 | FR-05, FR-05a, FR-05b, FR-06 |
| T-05 | §3.1 (N-01), §4.4, §8 | AC-04 | FR-04 |
| T-06 | §4.6 (Rule D), D-2 | AC-07, AC-08 | FR-07, FR-08 |
| T-07 | §4.9 | AC-09 | FR-09, FR-10 |
| T-08 | §4.10 | AC-10 | FR-11 |
| T-09 | §4.8, D-2, XD-04 | AC-11 | FR-12 |
| T-10 | §7 | AC-15 (loader untouched) | NFR-01, NFR-02 |
| T-11 | §1, §4.4, §4.6, §8 (B-01) | AC-16 | FR-05, FR-07, FR-09, NFR-06 |
| T-12 | §3.1, §4.1, §4.2, §4.3, §8 | AC-01, AC-02, AC-03 | FR-01, FR-02, FR-03 |
| T-13 | §3.1, §3.2, §8, NFR-04 | AC-13 | NFR-04 |
| T-14 | §4.8, §4.11, §8 | AC-12 | NFR-03, NFR-06 |
| T-15 | §3, §5, §6, §9, §11 | AC-15 | NFR-01, NFR-02, NFR-05 |
| T-16 | §3.1–§3.3, §8, §11 | AC-14 (+ AC-01…AC-16 sweep) | FR-13, all FR/NFR |

Every FR/NFR from the design is covered: FR-01→T-03/T-12, FR-02→T-01/T-12,
FR-03→T-01/T-03/T-12, FR-04→T-01/T-03/T-05, FR-05→T-04, FR-05a→T-01/T-04,
FR-05b→T-04, FR-06→T-04, FR-07→T-06, FR-08→T-06, FR-09→T-07, FR-10→T-07,
FR-11→T-08, FR-12→T-09, FR-13→T-16; NFR-01→T-15, NFR-02→T-10/T-15,
NFR-03→T-09/T-14, NFR-04→T-13, NFR-05→T-02/T-15, NFR-06→T-02/T-11/T-14.
Every AC (AC-01…AC-16) has a closing task; AC-15/AC-16 also drive the final
boundary + ordering sweep, AC-14 the full mapping-coverage sweep.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with server behaviour (T-01, T-03…T-09, T-11…T-16) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs the stack up: `bun run dev` + the seed chain: **funnel-pipeline-modeling executed** → `seed:saas-metric-library` → `seed:saas-operator` → `seed:sales`) |
| T-10 (package.json) | `bun run typecheck` + `git diff --stat api/scripts/seed-saas-operator.ts api/scripts/seed-saas-metric-library.ts` (expect no change) |
| T-06 / AC-07 / AC-08 | additionally requires the **executed** `funnel-pipeline-modeling` subsystem (B-01) — `Funnel`/`Stage` labels, `HAS_STAGE`/`CONVERTS_TO` edges, `POST /api/v1/funnels/transitions` route live; else `resolve()` fails loud (T-02) |
| final task (T-16) | `bun test:integration` (all `sales-*.integration.test.ts`, Neo4j + Postgres) + the AC-05/AC-07/AC-08/AC-09/AC-10/AC-11/AC-13/AC-15 `git diff`/`grep` boundary checks + the full AC-01…AC-16 mapping-coverage sweep |
