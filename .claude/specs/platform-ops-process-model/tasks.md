---
feature: "platform-ops-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
reviewing_design_revision: 1
size: "medium"
total_tasks: 12
---

# Tasks: platform-ops-process-model

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Nature of this spec**: a wave-2 **content** spec (blueprint
  `.claude/specs/blueprint-saas-operator.md`). It ships **one seed fixture**, a
  **feature-owned content-seed CLI** that drives shipped governed routes, and
  **server-side integration tests** — **no** new REST route, **no** PWA file,
  **no** compile-time or runtime ontology addition (NFR-01, NFR-05). Every write
  rides an as-built route (design §5.1); every governed write is
  lookup-before-create (design §4.8).
- **Deferred-green rule**: every content write drives the loopback API on
  `127.0.0.1:8787`, so the `*.integration.test.ts` files need a running API +
  Neo4j + Postgres (`bun run dev`, or the CI neo4j/postgres services). At each
  task's checkpoint run `bun run typecheck`; the integration tests run green
  under `bun test:integration` once the stack is up **and** the preconditions
  (`seed:saas-operator`, `seed:saas-metric-library`, then `seed:platform-ops`)
  have run.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed integration test. This spec
  touches **no** `pwa/src/views/` file, so `scripts/design-conformance.ts` does
  not apply (NFR-05).
- **Ownership guard (XD-04/XD-05/XD-08, NFR-01/NFR-03/NFR-05)**: the files under
  design §8 "Ownership boundaries — explicitly NOT edited" are off-limits. **No
  task edits any of**: `shared/src/schema/{nodes,edges}.ts` and any other
  `shared/src/schema/*`; `api/src/router.ts`; any `api/src/routes/*` (incl.
  `import.ts`, `edges.ts`, `nodes.ts`, `query.ts`, `kpi-crud.ts`,
  `kpi-sla-alignment.ts`, `sla-crud.ts`, `risk-register.ts`,
  `risk-compliance.ts`, `compliance-rules.ts`, `change-requests.ts`,
  `stories.ts`, `capabilities.ts`, `ontology-bounded-contexts.ts`);
  `api/src/storage/*`; `api/src/auth/rbac-permissions.ts`; `api/src/errors.ts`;
  `api/scripts/seed-saas-operator.ts`; `shared/seed/saas-metric-library/metrics.json`;
  and any `pwa/*` file (incl. `route.ts`, `views/index.tsx`, `App.tsx`, `SURFACES`).
  This spec adds **zero** new RBAC permission strings and **zero** new
  `ERROR_CODES` members (design §5.1).

## Design-basis pins (design rev 1 approved)

Design rev 1 is `approved` (`review-design.md` pass 1 = **approve**, zero
blockers). The binding decisions the implementer must not re-derive:

| Design decision (rev 1) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **Fixture is non-lifecycle-only + carries NO domain row + NO cross-boundary edges** (§3.1, §4.2). The fixture holds journeys, activities, function roles, function systems, and edges whose endpoints are **all in-slice** (`Activity→UserJourney` PART_OF, `PRECEDES`, `EXECUTES`, in-slice `USES_SYSTEM`, in-slice `INTEGRATES_WITH`). It carries **no** `Platform Ops` `Domain` node row and **no** journey→domain / activity→shared-system / function↔shared `INTEGRATES_WITH` cross-boundary edges. Ids under the **`018f0200-…`** slice prefix. | Fixture omits the domain row + all cross-boundary edges; they are created in the content-seed after handle resolution (§4.2a). | T-01, T-04 |
| **Cross-boundary edges created in the content-seed via `POST /api/v1/edges`** after handle resolution (§4.2a), each **lookup-before-create by `(type, fromId, toId)`** (review **C-01** — the one concern with teeth). | Cross-boundary edges are content-seed writes, idempotent by a `(type,fromId,toId)` cypher pre-check. | T-04, T-05 |
| **OQ-1 / C-02 — metric roster gap, self-contained** (§4.3, §11): Error budget burn `MEASURES` **`metric-uptime`** (error budget = 1 − uptime); **Backup success rate** is `should`-tier and ships **unlinked** (no `MEASURES` edge) until `saas-metric-library` adds `metric-backup-success`. The roster gap is flagged **outbound** (§11); this spec **never** seeds a `MetricDefinition`. Uptime→`metric-uptime`, MTTR→`metric-mttr`, Deploy frequency→`metric-deploy-frequency`. | The four linked KPIs point at metrics present in the frozen roster; Backup success ships unlinked. | T-05 |
| **C-01/OQ-5 — dedicated `ALIGNED_TO` route** (§4.4, D-1): `ALIGNED_TO` is written via **`POST /api/v1/kpi-alignments`** (`handleKpiAlignmentPost`, `kpiAlignmentCreateRequestSchema` = `{kpi_id, target_type: journey\|activity\|domain, target_id, weight(0..1), attribution_type, alignment_notes?}`). It returns **`404 not_found`** on a missing/wrong-label target — **not** `400 edge_endpoint_label_mismatch`. The generic `POST /api/v1/edges` `ALIGNED_TO` path keeps the `400` contract as a **supplementary** negative. | Primary path = `kpi-alignments`; AC-09 asserts **404** on a bad target + `400` on the generic-edges wrong-pair. | T-05, T-08 |
| **C-03 / D-2 — SLA path returns 200** (§4.6): SLA definitions are written via **`POST /api/v1/slas`** (`handleSlaPost`), which returns **200, not 201**. AC-12 asserts a **persisted id on a 200** and never asserts 201. Content-seed POSTs the route **directly** (verified as-built path), robust to the foundation helper's internal label. | AC-12 asserts 200 + id; never 201. | T-06, T-10 |
| **C-03 (design-review) — context-map read path** (§4.7): existing bounded contexts are read via **`GET /api/v1/models/:modelId/system-model/context-map`** (`computeContextMap`, `capabilities.ts:47`) — **not** `.../capabilities/context-map` (which does not exist). `ASSIGNED_TO_CONTEXT` is best-effort (OQ-4); a `query/cypher` `:BoundedContext` lookup is an acceptable equivalent read. **No `BoundedContext` is created** (read-only, NFR-04). | Context read = `system-model/context-map` (or `query/cypher`); assignment best-effort; contexts read-only. | T-07 |
| **N-02 — reuse `linkKpiToMetric`** (§4.3): the exported helper `linkKpiToMetric(baseUrl, kpiId, metricId)` (`api/src/seed/link-kpi-metric.ts`, verified exported) with its one-metric-per-KPI pre-check **IS** the `MEASURES` write path — the "if importable / or the seed's own construction" hedge is **dropped**. Import and call it. It throws `KpiMetricAlreadyLinkedError` on a second link (advisory, write-path-scoped). | `MEASURES` writes go through the imported `linkKpiToMetric` helper — single Definition of Done. | T-05 |
| **N-03 — risk lookup is client-side by `name`** (§4.5): `handleRiskRegisterList` accepts `owner`/`domain`/`risk_type`/`linked_entity_*` filters but **not** a `name` filter (verified `risk-register.ts:46-52`). Risk idempotency lookup is therefore `GET /api/v1/risk-register?domain=Platform%20Ops` **+ a client-side `name` match**. | Risk lookup-before-create = list by `domain` + client-side `name` match. | T-06 |
| **N-01 — internal `riskRow` is deliberately stricter than the boundary** (§3.5): the internal `riskRow` narrows `risk_type` to a **required** 3-value enum (`operational\|security\|technical`) — a subset of the shipped 6-value `.optional()` enum. This is an intentional tighter guard on the seed's own inputs, **not** a contradiction of the boundary schema. | Internal shape stricter by design; documented in a code comment. | T-02 |
| **C-04 (design-review) — fixture is intentionally incomplete** (§4.2/§6): after `seed:saas-operator` but **before** `seed:platform-ops`, the five journeys exist **without** a `PART_OF→Domain` edge (orphaned). `seed:platform-ops` is a **required follow-on** to `seed:saas-operator` for the slice to be well-formed; the content-seed **fails loudly** on missing handles. | Ordering note + fail-loud on missing handles; AC-01 asserts the end-state after `seed:platform-ops`. | T-03, T-11 |

Full rationale: design §2 (OQ resolution table + §2.1 Deviations), §3–§4, §5.1,
§8, §11, §12, and `review-design.md` (C-01…C-04, N-01…N-03).

## Task list

### T-01 — Non-lifecycle process fixture (`platform-ops.json`)

- **Files** (1): `shared/seed/saas-operator/platform-ops.json` (new)
- **Implements**: design §3.1, §3.2, §4.2 — supports FR-01, FR-02, FR-03, FR-04, FR-05
- **Complexity**: complex
- **Blocked by**: —
- **Blocks**: T-03, T-04
- **Steps**: Author the `{nodes, edges}` import payload (the as-built
  `importPayloadSchema` shape, same as `shared/seed/retail-mini.json`), carrying
  **only** non-lifecycle labels + core edges (Rule B). All ids are stable,
  author-fixed under the **`018f0200-…`** slice prefix (design §3.1) so
  `realImport`'s MERGE-on-id makes a re-load net-zero (NFR-02).
  1. **5 `UserJourney` nodes**: Fleet observability, Deploy / release, Incident /
     on-call, SLA / status, Backups / DR.
  2. **~25 `Activity` nodes** (4–7 per journey) with `PART_OF (Activity→UserJourney)`
     edges, each ordered by a `PRECEDES (Activity→Activity)` chain
     first→last per journey. **Deploy/release** includes a `Rollback` branch
     (e.g. `Build artifact` → `Promote to staging` → `Canary rollout` →
     `Promote to production` → `Verify & monitor`, with `Rollback` branching from
     canary/production).
  3. **4 function `Role` nodes**: SRE, On-call Engineer, Release Manager,
     Platform Ops Lead, with `EXECUTES (Role→Activity)` so **every** activity has
     ≥1 executing role. (Where the foundation shared-role catalog already
     provides an equivalent role by name, do **not** re-declare it — reference it
     via T-04's rebind; the four above are the in-slice function roles the
     catalog lacks.)
  4. **3 function `System` nodes** each with `attributes.systemKind` (design §3.2):
     Observability stack (`ai_predictive`), Status page (`functional`),
     Backup/restore system (`functional`); plus **in-slice** `USES_SYSTEM
     (Activity→System)` edges to these three, and any function↔function
     `INTEGRATES_WITH`.
  5. **OMIT** the `Platform Ops` `Domain` node row (created by foundation),
     **OMIT** every journey→domain `PART_OF`, activity→shared-system
     `USES_SYSTEM`, and function↔shared `INTEGRATES_WITH` edge — these
     cross-boundary edges are created by the content-seed (§4.2a, T-04) after
     handle resolution. The fixture contains **no** lifecycle row
     (`BusinessModel`/`BusinessModule*`/`ModuleInstance`,
     `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`).
  en-US identifiers throughout (e.g. `systemKind`, no en-GB spellings).
- **Verification**: `api/__tests__/platform-ops-activities.integration.test.ts`
  (T-08, AC-02) reads the fixture-loaded journeys/activities and asserts 4–7
  activities per journey with an ordered `PRECEDES` chain; manual: `bun -e
  "JSON.parse(require('fs').readFileSync('shared/seed/saas-operator/platform-ops.json','utf8'))"`
  parses and returns `{nodes, edges}` with 5 `UserJourney`, ~25 `Activity`, 4
  `Role`, 3 `System`, no `Domain` row, no lifecycle label/edge. `bun run
  typecheck` passes at checkpoint.

### T-02 — Content-seed row data + internal zod input shapes

- **Files** (1): `api/src/seed/platform-ops-content.ts` (new)
- **Implements**: design §3.3, §3.4, §3.5 — supports FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-13
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-05, T-06, T-07
- **Steps**: Pure data + internal shapes — **no** driver, **no** `fetch`. `zod`
  only; en-US identifiers.
  1. Export the **internal (non-REST) zod input shapes** (design §3.5):
     `kpiRow`, `riskRow`, `slaRow`, plus story/AC and capability row shapes,
     exactly as design §3.5 lists. **N-01 pin**: `riskRow.risk_type` is a
     **required** `z.enum(["operational","security","technical"])` — a
     deliberate tightening of the shipped 6-value `.optional()` enum; add a code
     comment stating it is intentionally stricter than the boundary schema
     (`createRiskSchema`), not a contradiction. These shapes guard the seed's own
     inputs only; the authoritative validation is always each route's own re-parse.
  2. Export the **5 KPI rows** (design §3.3): Fleet uptime (reliability/percent/up,
     `metricSeedKey:"metric-uptime"`, align domain), MTTR (reliability/days/down,
     `metric-mttr`, align Incident/on-call journey), Deploy frequency
     (efficiency/count/up, `metric-deploy-frequency`, align Deploy/release
     journey), Error budget burn (reliability/percent/down,
     `metricSeedKey:"metric-uptime"` per OQ-1, align SLA/status journey), Backup
     success rate (reliability/percent/up, **no `metricSeedKey`** per OQ-1 —
     `should`-tier, unlinked, align Backups/DR journey).
  3. Export the **≥3 risk rows** (design §3.4/§4.5): operational "Cascading fleet
     outage from a bad rollout", security "Compromised control-plane credential",
     technical "Backup restore fails silently" — each with required
     `owner:"Platform Ops Lead"`, `domain:"Platform Ops"`, valid
     `likelihood`/`impact` (1..5), `status`, `trend`, `risk_type`.
  4. Export the **≥3 SLA rows** (design §3.4/§4.6): fleet-uptime
     (`target_value:99.9, target_unit:"percent", measurement_window:"monthly",
     window_duration:"30d", compliance_threshold:99.9`), incident-response (SEV1
     acknowledge within N minutes), backup/restore — each conforming to
     `slaCreateRequestSchema` (`shared/src/schema/kpi-sla.ts:172`).
  5. Export the **≥5 story rows** (design §3.4/FR-09) — ≥1 per journey, each with
     `{persona, action, benefit, activityId-key, roleId?}` and ≥2 AC clauses
     `{given, when, then}` (each `.min(1)`, per `acCreateSchema`,
     `shared/src/schema/story-spec.ts:57`).
  6. Export the **≥3 capability rows** (design §3.4/§4.7): "Roll out a release
     safely", "Detect & resolve an incident", "Restore from backup" — each with a
     `supportedBy` system-key list and a `neededBy` activity/story-key source.

  > **Schema-shape citations (review C-02 pin)**: the boundary schemas these rows
  > must satisfy live under **`shared/src/schema/`**, not `api/src/routes/`:
  > `kpiCreateRequestSchema`/`slaCreateRequestSchema`/`kpiAlignmentCreateRequestSchema`
  > in `shared/src/schema/kpi-sla.ts`; `createRiskSchema` in
  > `api/src/routes/risk-register.ts` (this one **is** in the route file);
  > `storyCreateSchema`/`acCreateSchema` in `shared/src/schema/story-spec.ts`;
  > `capabilityCreateSchema`/`neededBySchema`/`supportedBySchema`/`contextAssignSchema`
  > in `shared/src/schema/ddd-system.ts`; `systemKind` in
  > `shared/src/schema/system-kind.ts`.
- **Verification**: `api/__tests__/platform-ops-kpis.integration.test.ts` (T-05,
  AC-07) imports the KPI rows and asserts all 5 parse `kpiRow`; the risk/SLA/
  story/capability rows are parsed by their integration tests (T-06, T-07). `bun
  run typecheck` passes at checkpoint.

### T-03 — Handle resolution + fixture load/rebind helpers

- **Files** (1): `api/src/seed/platform-ops-content.ts` (extend from T-02)
- **Implements**: design §4.1, §4.2 — closes AC-01 (domain-resolution half); supports FR-01, FR-04
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-04
- **Steps**:
  - `resolveHandles(baseUrl): Promise<Handles>` (§4.1) — read-only lookups via
    `POST /api/v1/query/cypher` (`query:read`):
    1. **Operator root** — `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m`,
       filter in TS on `JSON.parse(m.attributes_json).saasOperatorRoot === true`
       → `modelId`.
    2. **Platform Ops domain** — `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel
       {id:$modelId}) RETURN d`, filter on `seedKey === "platform_ops"` →
       `domainId`.
    3. **Shared systems** — `MATCH (s:System) WHERE s.operatorSeedKey IN
       ['helm','kubernetes','pagerduty'] RETURN s.operatorSeedKey, s.id` → the
       three system ids.
    4. **Metrics** — `MATCH (m:MetricDefinition) RETURN m.id, m.attributes_json`,
       filter on `seedKey ∈ {metric-uptime, metric-mttr, metric-deploy-frequency}`
       → metric ids.
    **C-04 pin**: if any required handle is absent (`seed:saas-operator` or
    `seed:saas-metric-library` not run), **throw** with a message naming the
    missing precondition — never silently skip.
  - `loadPlatformOpsFixture(baseUrl, handles)` (§4.2) — read
    `shared/seed/saas-operator/platform-ops.json`, then POST the (already
    domain-row-omitted, cross-boundary-edge-omitted) `{nodes, edges}` to
    `POST /api/v1/import` (`realImport`, `data:write`). MERGE-on-id makes a
    re-load net-zero (NFR-02). A `409 model_lifecycle_route_required` means a
    malformed fixture — surface + fail (AC-05). (No in-fixture rebind of the
    domain row is needed since the fixture omits it, per §4.2's two-loader
    decision; the cross-boundary edges are created in T-04.)
- **Verification**: `api/__tests__/platform-ops-journeys.integration.test.ts`
  (T-08, AC-01) exercises `resolveHandles` + `loadPlatformOpsFixture` and asserts
  the `platform_ops` domain (resolved, `IN_MODEL` the operator root) exists
  exactly once (no duplicate) with the five journeys attached (after T-04 wires
  the cross-boundary `PART_OF`). `bun run typecheck` passes at checkpoint.

### T-04 — Cross-boundary edges + `(type,fromId,toId)` idempotency guard (review C-01)

- **Files** (1): `api/src/seed/platform-ops-content.ts` (extend from T-03)
- **Implements**: design §4.2a, §4.8 + `review-design.md` **C-01** — closes AC-01 (journey→domain half), AC-04 (cross-boundary half), AC-06 (cross-boundary idempotency); supports FR-01, FR-04, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: T-05, T-11
- **Steps**: After the fixture load + handle resolution, create the
  **cross-boundary** core edges via `POST /api/v1/edges` (`handleEdgePost`,
  `edge:write`, returns 201), **each lookup-before-create** — this is the
  review's single-teeth concern (C-01):
  1. Implement `ensureEdge(baseUrl, {type, fromId, toId})` — a
     lookup-before-create wrapper: pre-check via `POST /api/v1/query/cypher`
     (`MATCH (a {id:$fromId})-[r:${type}]->(b {id:$toId}) RETURN count(r) AS n`);
     if `n > 0` skip the POST (already present), else POST
     `{type, fromId, toId}` to `POST /api/v1/edges`. **No fixed edge id is
     supplied** (avoids the cross-type-uniqueness 409), and the cypher pre-check
     guarantees zero duplicate parallel edges on a re-run (AC-06). Add `ensureEdge`
     to the design §4.8 idempotency set (it is the row the review said was missing).
  2. **`PART_OF` (`UserJourney→Domain`) ×5** — each journey (fixture id) →
     `toId = handles.domainId`.
  3. **`USES_SYSTEM` (`Activity→System`)** — activities → resolved
     Helm/K8s/PagerDuty ids (from `handles`), for the activities that use shared
     tooling.
  4. **`INTEGRATES_WITH` (`System→System`)** — function-system → resolved
     shared-system ids (e.g. Observability↔PagerDuty, Backup↔K8s), ≥1 edge.
  These are core, non-lifecycle edge types (`assertNotLifecycleEdge` passes); a
  wrong endpoint pair would return `400 edge_endpoint_label_mismatch`.
- **Verification**:
  - `api/__tests__/platform-ops-journeys.integration.test.ts` (AC-01) — the five
    journeys are `PART_OF` the resolved `platform_ops` domain; no duplicate domain.
  - `api/__tests__/platform-ops-systems.integration.test.ts` (AC-04) — Helm/K8s/
    PagerDuty referenced by resolved id (no duplicate System per shared name);
    `USES_SYSTEM` edges connect activities→shared systems; ≥1 `INTEGRATES_WITH`.
  - `api/__tests__/platform-ops-seed-idempotency.integration.test.ts` (AC-06) —
    a **second** `seed:platform-ops` run adds **zero** net new cross-boundary
    edges (the `ensureEdge` `(type,fromId,toId)` guard skips every existing edge).
  Deferred-green: `bun test:integration`.

### T-05 — KPIs + `MEASURES` + `ALIGNED_TO` (OQ-1, C-01/OQ-5, N-02)

- **Files** (1): `api/src/seed/platform-ops-content.ts` (extend from T-04)
- **Implements**: design §4.3, §4.4, §4.8 — closes AC-07, AC-08, AC-09; supports FR-06, FR-07, FR-08, FR-12
- **Complexity**: complex
- **Blocked by**: T-04
- **Blocks**: T-09
- **Steps**: For each of the 5 KPI rows (T-02), lookup-before-create (§4.8):
  1. **KPI** — `MATCH (k:KPI {name:$name}) WHERE k.domain_id=$domainId` via
     `query/cypher`; if present reuse, else POST `kpiCreateRequestSchema` to
     `POST /api/v1/kpis` (`handleKpiPost`, `kpi:write`, returns **200** with
     `{id,...}`), `domain_id = handles.domainId`.
  2. **`MEASURES`** (OQ-1, N-02) — if the row carries `metricSeedKey`, call the
     **imported** `linkKpiToMetric(baseUrl, kpiId, metricId)`
     (`api/src/seed/link-kpi-metric.ts`, verified exported) — the **single**
     sanctioned `MEASURES` write path with its one-metric-per-KPI pre-check. It
     POSTs `{type:"MEASURES", fromId, toId}` to `POST /api/v1/edges` (returns
     **201**, `MEASURES ∉ LIFECYCLE_EDGES`) and throws `KpiMetricAlreadyLinkedError`
     on a re-run (caught + treated as idempotent success). Uptime→`metric-uptime`,
     MTTR→`metric-mttr`, Deploy frequency→`metric-deploy-frequency`, **Error
     budget burn→`metric-uptime`** (OQ-1); **Backup success rate carries no
     `metricSeedKey` → no `MEASURES` edge** (OQ-1, unlinked `should`-tier KPI).
  3. **`ALIGNED_TO`** (C-01/OQ-5, D-1) — lookup-before-create by
     `(kpiId, targetId)` (`GET /api/v1/kpi-alignments?target_type=&target_id=`
     filtered by `kpi_id`, or a `MATCH (k:KPI {id})-[:ALIGNED_TO]->(t)` cypher),
     then POST **`POST /api/v1/kpi-alignments`** (`handleKpiAlignmentPost`,
     `kpi:write`) `{kpi_id, target_type, target_id, weight:1,
     attribution_type:"direct"}`. Targets per §3.3: Fleet uptime→domain, MTTR→
     Incident/on-call journey, Deploy freq→Deploy/release journey, Error budget→
     SLA/status journey, Backup→Backups/DR journey. **Never** edit
     `kpi-crud.ts`/`kpi-sla-alignment.ts`.
- **Verification**:
  - `api/__tests__/platform-ops-kpis.integration.test.ts` (AC-07) — the 5 KPIs
    exist as `KPI` nodes via `POST /api/v1/kpis`; manual: `git diff --stat
    api/src/routes/kpi-crud.ts` — no change.
  - `api/__tests__/platform-ops-kpi-measures.integration.test.ts` (AC-08) — each
    **linked** KPI (uptime/mttr/deploy-frequency/error-budget→uptime) has exactly
    one `MEASURES` edge to a `MetricDefinition` resolvable in the frozen roster;
    the `POST /api/v1/edges` `MEASURES` write returns **201** (not 409); a
    lifecycle `INSTANTIATES` write via `/edges` is still `409
    model_lifecycle_route_required` (module-pin unaffected); the Backup-success
    KPI is present with **no** `MEASURES` edge (OQ-1 documented).
  - `api/__tests__/platform-ops-kpi-alignment.integration.test.ts` (AC-09) — each
    KPI is `ALIGNED_TO` its process target via `POST /api/v1/kpi-alignments`, read
    back; a `POST /api/v1/kpi-alignments` with a wrong/missing target id →
    **`404 not_found`** (D-1); supplementary: a generic `POST /api/v1/edges`
    `ALIGNED_TO` write with a wrong pair (e.g. `KPI→System`) →
    `400 edge_endpoint_label_mismatch`; manual: `git diff --stat
    api/src/routes/kpi-sla-alignment.ts` — no change.
  Deferred-green: `bun test:integration`.

### T-06 — Risks + SLAs via governed routes (N-03, C-03/D-2, OQ-2/OQ-3)

- **Files** (1): `api/src/seed/platform-ops-content.ts` (extend from T-05)
- **Implements**: design §4.5, §4.6, §4.8 — closes AC-11, AC-12; supports FR-10, FR-11, FR-12
- **Complexity**: moderate
- **Blocked by**: T-05
- **Blocks**: T-09
- **Steps**:
  - **Risks** (§4.5, N-03) — for each of the ≥3 risk rows (T-02),
    lookup-before-create: `GET /api/v1/risk-register?domain=Platform%20Ops`
    **+ a client-side `name` match** (the list route accepts `owner`/`domain`/
    `risk_type`/`linked_entity_*` but **not** `name` — verified `risk-register.ts:46-52`);
    if absent, POST `createRiskSchema` to `POST /api/v1/risk-register`
    (`handleRiskRegisterCreate`, `risk:write`) with required `owner`/`domain`
    (`.min(1)`) and `risk_type ∈ {operational, security, technical}`. Each returns
    a persisted Postgres id. This spec **may** import + call the foundation
    `seedRisk` helper (`api/src/seed/governed-seed-helper.ts`, exported, POSTs
    `/api/v1/risk-register`) — but wraps it in the lookup-before-create guard; it
    **never** edits `risk-register.ts`/`risk-compliance.ts`/`compliance-rules.ts`/
    `change-requests.ts`.
  - **SLAs** (§4.6, C-03/D-2) — for each of the ≥3 SLA rows (T-02),
    lookup-before-create by `name` (`GET /api/v1/slas` list + client-side name
    match), then POST `slaCreateRequestSchema` to **`POST /api/v1/slas`**
    (`handleSlaPost`, `sla:write`, **returns 200**). Each returns a persisted
    Neo4j `:SLA` id. May reuse the foundation `seedSla` helper (POSTs
    `/api/v1/slas`) wrapped in the guard; **never** edits `sla-crud.ts`. This spec
    creates SLA **definitions** only — **no** breach/measurement records (OQ-2).
- **Verification**:
  - `api/__tests__/platform-ops-risks.integration.test.ts` (AC-11) — ≥1
    operational, ≥1 security, ≥1 technical risk via `POST /api/v1/risk-register`
    conforming to `createRiskSchema`, each with a persisted id; a second seed run
    adds no duplicate (client-side `name` guard); manual: `git diff --stat
    api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests}.ts`
    — no change.
  - `api/__tests__/platform-ops-slas.integration.test.ts` (AC-12) — ≥1 uptime,
    ≥1 incident-response, ≥1 backup/restore SLA via `POST /api/v1/slas`
    conforming to `slaCreateRequestSchema`, each returning a persisted id **on a
    200** (D-2 — the test asserts 200, **not** 201); a second run adds no
    duplicate; manual: `git diff --stat api/src/routes/sla-crud.ts` — no change.
  Deferred-green: `bun test:integration`.

### T-07 — Stories + G/W/T ACs + DDD capabilities (C-03 context path, OQ-4)

- **Files** (1): `api/src/seed/platform-ops-content.ts` (extend from T-06)
- **Implements**: design §3.4, §4.7, §4.8 — closes AC-10, AC-13; supports FR-09, FR-13, FR-12
- **Complexity**: complex
- **Blocked by**: T-06
- **Blocks**: T-09
- **Steps**:
  - **Stories + ACs** (§3.4/FR-09) — for each of ≥5 story rows (T-02),
    lookup-before-create by `persona`+`action`+`activityId` (`GET
    /api/v1/models/:modelId/stories` list filter), then POST `storyCreateSchema`
    = `{persona, action, benefit, activityId, roleId?}` to
    `POST /api/v1/models/:modelId/stories` (`story:write`); `:modelId =
    handles.modelId`; `activityId` = a resolved in-slice activity id (in the
    operator model scope, so the `story_activity_not_in_model` write-side check
    passes). For each story, POST ≥2 `AcceptanceCriterion`
    (`acCreateSchema = {given, when, then, ordinal?}`, each clause `.min(1)`) to
    `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria`,
    lookup-before-create by `(storyId, given+when+then)`. **Never** edit
    `stories.ts`/`storage/stories.ts`.
  - **Capabilities** (§4.7/FR-13, OQ-4, C-03) — for each of ≥3 capability rows
    (T-02):
    1. lookup-before-create by `name` (`GET /api/v1/models/:modelId/capabilities`
       list filter), then POST `capabilityCreateSchema = {name, description?}` to
       `POST /api/v1/models/:modelId/capabilities` (returns **201**; storage
       creates `CAPABILITY_IN_MODEL` to the operator root at create).
    2. **`SUPPORTED_BY`** — `PUT
       /api/v1/models/:modelId/capabilities/:capId/supported-by
       {systemId:<resolved id>}` (≥1 per capability), lookup-before-create by
       `(capId, systemId)`.
    3. **`NEEDS_CAPABILITY`** — `PUT
       /api/v1/models/:modelId/capabilities/:capId/needed-by` with **exactly one**
       of `{activityId}` | `{storyId}` (the `.refine`,
       `shared/src/schema/ddd-system.ts`), ≥1 per capability from this slice's
       activities/stories.
    4. **`ASSIGNED_TO_CONTEXT`** (best-effort, OQ-4, **C-03 pin**) — read existing
       contexts via **`GET /api/v1/models/:modelId/system-model/context-map`**
       (`computeContextMap`, `capabilities.ts:47`) **or** a `query/cypher`
       `:BoundedContext` lookup; where a Platform-Ops-appropriate context exists,
       `PUT /api/v1/models/:modelId/capabilities/:capId/context {boundedContextId}`.
       Where none fits, leave the capability **unassigned** (valid DDD state).
       **No `BoundedContext` is created** (read-only, NFR-04). **Never** edit
       `capabilities.ts`/`storage/capabilities.ts`/`ontology-bounded-contexts.ts`.
- **Verification**:
  - `api/__tests__/platform-ops-stories.integration.test.ts` (AC-10) — ≥1
    `UserStory` per journey (5) via `POST /api/v1/models/:modelId/stories`, each
    `DESCRIBES_ACTIVITY` one of this slice's activities (passing the
    `story_activity_not_in_model` scope check), each with ≥2 `AcceptanceCriterion`
    carrying non-empty `given`/`when`/`then`; manual: `git diff --stat
    api/src/routes/stories.ts` — no change.
  - `api/__tests__/platform-ops-capabilities.integration.test.ts` (AC-13) — ≥3
    `Capability` via `POST /api/v1/models/:modelId/capabilities` (each
    `CAPABILITY_IN_MODEL` the operator root), each `SUPPORTED_BY` ≥1 seeded
    System, each with ≥1 `NEEDS_CAPABILITY` source; where a `BoundedContext` fits,
    an `ASSIGNED_TO_CONTEXT` edge (no context created); manual: `git diff --stat
    api/src/routes/{capabilities,ontology-bounded-contexts}.ts` — no change.
  Deferred-green: `bun test:integration`.

### T-08 — `seed:platform-ops` CLI entrypoint + package script

- **Files** (2): `api/scripts/seed-platform-ops-content.ts` (new), `package.json` (modify)
- **Implements**: design §4.0, §6, §7 — closes AC-01 (end-to-end), AC-02, AC-03, AC-05; supports FR-01..FR-13, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-01, T-07
- **Blocks**: T-09, T-10, T-11
- **Steps**:
  1. Author `api/scripts/seed-platform-ops-content.ts` — the CLI entrypoint
     (design §4.0), sibling to `api/scripts/seed-saas-operator.ts` and
     `api/scripts/seed-saas-metric-library.ts`. Sequence (all steps
     lookup-before-create, so a re-run is net-zero, AC-06):
     - `resolveHandles` (T-03) — **fail loudly** if `seed:saas-operator` or
       `seed:saas-metric-library` has not run (C-04).
     - `loadPlatformOpsFixture` (T-03) — load the fixture (self-contained run).
     - `ensureEdge` cross-boundary edges (T-04) → KPIs/`MEASURES`/`ALIGNED_TO`
       (T-05) → risks/SLAs (T-06) → stories/ACs/capabilities (T-07), in that
       dependency order (§4.0).
  2. Add `"seed:platform-ops": "bun --cwd api scripts/seed-platform-ops-content.ts"`
     to the root `package.json` `scripts` (matching the existing
     `"seed:saas-operator"` / `"seed:saas-metric-library"` `bun --cwd api
     scripts/…` form). This is the **sole** `package.json` edit.
  **Never** edit `api/scripts/seed-saas-operator.ts` (foundation loader — it
  discovers `platform-ops.json` by directory scan; no edit needed, XD-04/NFR-03).
- **Verification**:
  - `api/__tests__/platform-ops-journeys.integration.test.ts` (AC-01),
    `platform-ops-activities.integration.test.ts` (AC-02),
    `platform-ops-roles.integration.test.ts` (AC-03) — after
    `seed:saas-operator` + `seed:saas-metric-library` + `seed:platform-ops`, the
    `platform_ops` domain has the five journeys, each with 4–7 ordered activities
    and each activity with ≥1 executing role.
  - `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts` (AC-05) —
    the real fixture (non-lifecycle) imports and writes; a hand-built variant
    with an `IN_MODEL` edge → `409 model_lifecycle_route_required`, nothing
    written.
  - manual: `cat package.json | grep seed:platform-ops` shows the entry;
    `ls api/scripts/seed-platform-ops-content.ts` exists. `bun run typecheck`
    exit 0.
  Deferred-green: `bun test:integration`.

### T-09 — Content integration tests: journeys, activities, roles, stories, capabilities

- **Files** (5): `api/__tests__/platform-ops-journeys.integration.test.ts`,
  `platform-ops-activities.integration.test.ts`,
  `platform-ops-roles.integration.test.ts`,
  `platform-ops-stories.integration.test.ts`,
  `platform-ops-capabilities.integration.test.ts` (all new)
- **Implements**: design §7 — closes AC-01, AC-02, AC-03, AC-10, AC-13
- **Complexity**: moderate
- **Blocked by**: T-05, T-06, T-07, T-08
- **Blocks**: T-12
- **Steps**: Author the five integration tests. Each seeds preconditions
  (`seed:saas-operator` + `seed:saas-metric-library` + `seed:platform-ops`)
  against the live loopback stack, then asserts the design §7 contract:
  - **journeys** (AC-01) — `platform_ops` domain (`IN_MODEL` operator root)
    exists **exactly once** (no duplicate) with the five named journeys each
    `PART_OF` it.
  - **activities** (AC-02) — each journey has 4–7 `Activity` `PART_OF` it; a
    `PRECEDES` path exists first→last per journey; Deploy/release has a `Rollback`
    branch.
  - **roles** (AC-03) — every activity has ≥1 `Role` `EXECUTES` it; the four
    function roles exist; a role duplicating the shared catalog by name is
    referenced (count of that name = 1), not re-created.
  - **stories** (AC-10) — ≥1 story per journey (5) with the
    `DESCRIBES_ACTIVITY`/scope-check + ≥2 G/W/T ACs; `git diff --stat
    api/src/routes/stories.ts` manual = no change.
  - **capabilities** (AC-13) — ≥3 capabilities with `CAPABILITY_IN_MODEL` +
    `SUPPORTED_BY` + `NEEDS_CAPABILITY` (+ best-effort `ASSIGNED_TO_CONTEXT`, no
    context created); `git diff --stat
    api/src/routes/{capabilities,ontology-bounded-contexts}.ts` manual = no change.
- **Verification**: the five files above under `bun test:integration` (AC-01,
  AC-02, AC-03, AC-10, AC-13). Deferred-green: needs the seeded stack up. `bun
  run typecheck` passes at checkpoint.

### T-10 — Content integration tests: systems, KPIs, MEASURES, alignment, risks, SLAs

- **Files** (6): `api/__tests__/platform-ops-systems.integration.test.ts`,
  `platform-ops-kpis.integration.test.ts`,
  `platform-ops-kpi-measures.integration.test.ts`,
  `platform-ops-kpi-alignment.integration.test.ts`,
  `platform-ops-risks.integration.test.ts`,
  `platform-ops-slas.integration.test.ts` (all new)
- **Implements**: design §7 — closes AC-04, AC-07, AC-08, AC-09, AC-11, AC-12
- **Complexity**: moderate
- **Blocked by**: T-05, T-06, T-08
- **Blocks**: T-12
- **Steps**: Author the six integration tests, each seeding preconditions then
  asserting the design §7 contract:
  - **systems** (AC-04) — Helm/K8s/PagerDuty referenced by resolved id (no
    duplicate System per shared name); the three function systems each with a
    valid `systemKind`; `USES_SYSTEM` edges connect activities→systems; ≥1
    `INTEGRATES_WITH`.
  - **kpis** (AC-07) — the 5 KPIs exist via `POST /api/v1/kpis`; `git diff --stat
    api/src/routes/kpi-crud.ts` manual = no change.
  - **kpi-measures** (AC-08) — each **linked** KPI has one `MEASURES` edge to a
    roster metric; the write is **201** (not 409); a lifecycle `INSTANTIATES`
    write via `/edges` still 409 (module-pin unaffected); Backup-success KPI has
    no `MEASURES` edge.
  - **kpi-alignment** (AC-09) — each KPI `ALIGNED_TO` its target via
    `POST /api/v1/kpi-alignments`; a wrong target → **404**; generic-edges
    wrong-pair → `400 edge_endpoint_label_mismatch`; `git diff --stat
    api/src/routes/kpi-sla-alignment.ts` manual = no change.
  - **risks** (AC-11) — ≥1 operational/security/technical via
    `POST /api/v1/risk-register`, each persisted; `git diff --stat
    api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests}.ts`
    manual = no change.
  - **slas** (AC-12) — ≥1 uptime/incident-response/backup SLA via
    `POST /api/v1/slas`, each persisted **on a 200** (D-2, never 201); `git diff
    --stat api/src/routes/sla-crud.ts` manual = no change.
- **Verification**: the six files above under `bun test:integration` (AC-04,
  AC-07, AC-08, AC-09, AC-11, AC-12). Deferred-green: needs the seeded stack up.
  `bun run typecheck` passes at checkpoint.

### T-11 — Lifecycle-guard + seed-idempotency integration tests (review C-01, C-04)

- **Files** (2): `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts`,
  `platform-ops-seed-idempotency.integration.test.ts` (both new)
- **Implements**: design §4.2, §4.8, §7 + `review-design.md` **C-01/C-04** — closes AC-05, AC-06
- **Complexity**: moderate
- **Blocked by**: T-04, T-08
- **Blocks**: T-12
- **Steps**:
  - **lifecycle-guard** (AC-05) — load the real (non-lifecycle) fixture via
    `POST /api/v1/import` and assert the content writes; feed a hand-constructed
    `{nodes, edges}` variant carrying a lifecycle row (e.g. an `IN_MODEL` edge) to
    `POST /api/v1/import` and assert `409 model_lifecycle_route_required` with
    **nothing written** (payload-atomic pre-scan).
  - **seed-idempotency** (AC-06, **C-01 pin**) — run `seed:platform-ops`
    **twice**; assert **zero** net new nodes/edges/rows across a pre/post
    `/api/v1/stats` diff **and** explicit counts of: the cross-boundary
    `PART_OF`/`USES_SYSTEM`/`INTEGRATES_WITH` edges (the `ensureEdge`
    `(type,fromId,toId)` guard — the review's teeth concern), KPIs, `MEASURES`
    edges, `ALIGNED_TO` alignments, stories, ACs, risks, SLAs, capabilities +
    their mapping edges. Assert the **retail Business Model #1 subgraph is
    unchanged**. Include the **C-01 assertion by name**: the five journey→domain
    `PART_OF` edges and every activity→shared-system `USES_SYSTEM` edge count is
    identical before and after the second run.
  - **manual (AC-06 boundary)**: `git diff --stat` after seeding — changes
    confined to `shared/seed/saas-operator/platform-ops.json`,
    `api/scripts/seed-platform-ops-content.ts`, `api/src/seed/platform-ops-content.ts`,
    `api/__tests__/platform-ops-*.integration.test.ts`, `package.json` (one line),
    and this spec's docs; **no** schema/route/loader edit.
- **Verification**: `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts`
  (AC-05) + `api/__tests__/platform-ops-seed-idempotency.integration.test.ts`
  (AC-06, incl. the C-01 named cross-boundary-edge net-zero assertion); manual:
  `git diff --stat` after a double seed — boundary confined as above. Deferred-green:
  `bun test:integration`.

### T-12 — Mapping-table audit + final boundary/transpile sweep

- **Files** (0): no source files — validation + doc audit only
- **Implements**: design §8, §9, §10, §11 + `review-design.md` C-02/C-04 — closes AC-14, AC-15; supports FR-14, NFR-01, NFR-03, NFR-04, NFR-05
- **Complexity**: simple
- **Blocked by**: T-01..T-11
- **Blocks**: —
- **Steps**: With the full stack up (`bun run dev`) and the three seeds run
  (`seed:saas-operator`, `seed:saas-metric-library`, `seed:platform-ops`):
  1. **AC-14 mapping-table audit** — read `requirements.md` §Mapping table;
     for every row confirm the named label/edge/route resolves to a real
     construct: `grep` each label/edge in `shared/src/schema/*` (or the owning
     spec's `requirements.md`) and each route in `api/src/routes/*`. Confirm **no**
     row introduces a new construct (every target exists in the codebase or a
     landed dependency).
  2. **AC-15 transpile + boundary** — `bun run typecheck` exit 0; `git diff
     --stat` confirms changes are confined to
     `shared/seed/saas-operator/platform-ops.json`,
     `api/scripts/seed-platform-ops-content.ts`,
     `api/src/seed/platform-ops-content.ts`,
     `api/__tests__/platform-ops-*.integration.test.ts`, `package.json` (one
     line), and `.claude/specs/platform-ops-process-model/*`. Confirm **no** edit
     to `shared/src/schema/*` (no `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS`
     addition), `pwa/*`, `api/src/router.ts`, `api/src/routes/*`,
     `api/src/storage/*`, `api/src/auth/rbac-permissions.ts`, `api/src/errors.ts`,
     or `api/scripts/seed-saas-operator.ts`.
  3. **Full AC sweep** — run `bun test:integration` for all
     `api/__tests__/platform-ops-*.integration.test.ts` (AC-01…AC-13) green.
- **Verification**: manual: with the seeded stack up, run steps 1–3 — expect
  every mapping-table row resolves to a real construct (AC-14), `bun run
  typecheck` exit 0 and `git diff --stat` boundary confined exactly as above with
  no schema/pwa/route/storage/RBAC/error-code/loader edit (AC-15), and all
  `api/__tests__/platform-ops-*.integration.test.ts` green (AC-01…AC-13 sweep).

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.1, §3.2, §4.2 | (supports AC-02, AC-04) | FR-01, FR-02, FR-03, FR-04, FR-05 |
| T-02 | §3.3, §3.4, §3.5 | (supports AC-07..AC-13) | FR-06..FR-11, FR-13 |
| T-03 | §4.1, §4.2 | AC-01 (resolution) | FR-01, FR-04 |
| T-04 | §4.2a, §4.8, C-01 | AC-01 (journey→domain), AC-04 (cross-boundary), AC-06 (cross-boundary idempotency) | FR-01, FR-04, NFR-02 |
| T-05 | §4.3, §4.4, §4.8 | AC-07, AC-08, AC-09 | FR-06, FR-07, FR-08, FR-12 |
| T-06 | §4.5, §4.6, §4.8 | AC-11, AC-12 | FR-10, FR-11, FR-12 |
| T-07 | §3.4, §4.7, §4.8 | AC-10, AC-13 | FR-09, FR-13, FR-12 |
| T-08 | §4.0, §6, §7 | AC-01 (e2e), AC-02, AC-03, AC-05 | FR-01..FR-13, NFR-02 |
| T-09 | §7 | AC-01, AC-02, AC-03, AC-10, AC-13 | FR-01, FR-02, FR-03, FR-09, FR-13 |
| T-10 | §7 | AC-04, AC-07, AC-08, AC-09, AC-11, AC-12 | FR-04, FR-06..FR-08, FR-10, FR-11 |
| T-11 | §4.2, §4.8, §7, C-01/C-04 | AC-05, AC-06 | FR-05, NFR-02, NFR-03 |
| T-12 | §8, §9, §10, §11 | AC-14, AC-15 | FR-14, NFR-01, NFR-03, NFR-04, NFR-05 |

Every FR/NFR from the design is covered: FR-01→T-01/T-03/T-04, FR-02→T-01,
FR-03→T-01, FR-04→T-01/T-04, FR-05→T-01/T-08/T-11, FR-06→T-05, FR-07→T-05,
FR-08→T-05, FR-09→T-07, FR-10→T-06, FR-11→T-06, FR-12→T-05/T-06/T-07,
FR-13→T-07, FR-14→T-12; NFR-01→T-12, NFR-02→T-04/T-11, NFR-03→T-11/T-12,
NFR-04→T-12, NFR-05→T-12. Every AC (AC-01…AC-15) has a closing task.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with server behaviour (T-03, T-04, T-05, T-06, T-07, T-08) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs the seeded stack: `seed:saas-operator` + `seed:saas-metric-library` + `seed:platform-ops`) |
| test-authoring tasks (T-09, T-10, T-11) | the task's listed `*.integration.test.ts` under `bun test:integration` |
| final task (T-12) | mapping-table audit (AC-14) + `bun run typecheck` + `git diff --stat` boundary check (AC-15) + full `api/__tests__/platform-ops-*.integration.test.ts` sweep (AC-01…AC-13) |

## Review findings folded in (review-design.md pass 1 — approve, 0 blockers)

| Finding | Where folded |
|---------|--------------|
| **C-01** (cross-boundary `/edges` writes missing from the §4.8 idempotency guard — the one concern with teeth) | T-04 adds `ensureEdge` (lookup-before-create by `(type,fromId,toId)`, no fixed id); T-11's idempotency test asserts these specific edges are net-zero on re-run **by name**. |
| **C-02** (schema citations pointed at non-existent `api/src/routes/{kpi-sla,ddd-system,system-kind}.ts`) | T-02 re-prefixes every schema-shape citation to `shared/src/schema/…` (route handlers stay cited at their real `api/src/routes/*` paths). |
| **C-03** (wrong context-map read path) | T-07 pins `GET /api/v1/models/:modelId/system-model/context-map` (or a `query/cypher` `:BoundedContext` lookup) — not `.../capabilities/context-map`. |
| **C-04** (fixture intentionally incomplete; ordering) | T-03/T-08 fail loudly on missing handles; T-11 asserts the end-state; the design-basis pin records `seed:platform-ops` as a required follow-on to `seed:saas-operator`. |
| **N-01** (internal `riskRow` stricter than boundary) | T-02 adds a code comment stating the tightening is intentional. |
| **N-02** (reuse `linkKpiToMetric` vs hand-roll) | T-05 imports and calls the exported `linkKpiToMetric` helper as the single `MEASURES` write path — hedge dropped. |
| **N-03** (risk lookup can't filter by `name`) | T-06 uses `GET /api/v1/risk-register?domain=…` + a client-side `name` match. |
