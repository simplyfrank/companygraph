---
feature: "risk-compliance-change"
created: "2026-07-06"
author: "spec-author (blueprint: business-modeling-studio; backfill of _baseline FR-09)"
status: "draft"
size: "large"
---

# Design: risk-compliance-change

## 1. Overview

This is a **backfill** design: the four route files
`api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests}.ts`
are already adopted and running under the central router auth gate. This
spec formalizes their as-built contract (`_baseline` FR-09), pins that
contract with **integration tests against a live Postgres + Neo4j**,
closes the functional/validation gaps verification surfaces (FR-08…FR-12),
and wires the Postgres-backed tests into the existing CI `integration`
job (FR-13/FR-14).

The design is deliberately **conservative**: it changes behavior in only
five narrowly-scoped places and pins everything else. Ordered by blast
radius:

1. **`parseWith` conversion (FR-09)** — the eight bare `.parse()` sites in
   `risk-register.ts` + `change-requests.ts` become `parseWith(schema, body)`
   so their 400 envelope is byte-identical to the rest of the API. No
   schema tightening.
2. **UUIDv7 ids (FR-10, `should`)** — the two Postgres route files swap
   `v4` → `generateId()`; the `uuid` package stays (its permanent consumer
   is `api/src/ids.ts`).
3. **Compliance-rule path-id threading (FR-12)** — three router call sites
   and three handler signatures move the rule id from `?id=` query to the
   `:id` path segment already matched by the `ruleOne` regex.
4. **Change-request transition guard (FR-11, `should`)** — `PATCH` rejects
   out-of-lifecycle status jumps with a new additive `invalid_transition`
   error code; reviews/sign-offs stay advisory (DEC-02).
5. **OpenAPI coverage (FR-08)** — `risk-register`, `change-requests`, and
   `risk-compliance` paths are registered from zod schemas; `compliance-rules`
   is already registered and stays.

Everything else in the four files is **read-and-pin** — the tests assert
the exact as-built shapes (`{data}` / bare / `{data,limit,offset}`
envelopes; snake_case columns; per-report empty shapes) so any future
drift is a visible contract change.

**Store of record per surface** (pinned, not changed):

| Surface | Store | Tables / labels |
|---------|-------|-----------------|
| `risk-register` | Postgres | `risk_register` (migrations 002 + 005) |
| `change-requests` | Postgres | `change_requests`, `reviews`, `sign_offs` (migration 001) |
| `risk-compliance` | Neo4j | process subgraph (`Domain`/`UserJourney`/`Activity`/`Role`/`System`) |
| `compliance-rules` | Neo4j | `_ComplianceRule` nodes (via `api/src/ontology/storage/compliance-rules.ts`) |

## 2. Requirements-review resolutions carried into design

The requirements re-review verdict was **approve** (budget spent). The
two blockers and five concerns it resolved are load-bearing for this
design; they are honored as follows:

| Finding | How this design honors it |
|---------|---------------------------|
| B-01 (five, not eight, aggregations) | §3.2 lists exactly five aggregation handlers/routes; §4.6 OpenAPI registers five; §7 test plan asserts five |
| B-02 (per-report empty shape) | §4.5 documents the three distinct as-built envelopes; §7 asserts empty arrays on the inventory (no `count`) and `count===0` only on the two reports that expose it |
| C-01 (empty-patch codes) | §4.2 keeps `invalid_payload` (risk) / `bad_request` (change-request) for the empty-patch guard; the `parseWith` conversion touches only the zod-rejection path |
| C-02 (transition enum pinned to code) | §4.4 derives the DEC-01 transition set from migration `001:9` + `updateChangeRequestSchema` — the enum is read, not inferred |
| C-03 (`should` off-ramp) | §4.3 (FR-10) and §4.4 (FR-11) each carry a strike-not-fail off-ramp; §8 records the deterministic-gate handling |
| C-04 (partial router ownership) | §4.7 re-anchors the four owned dispatch blocks by section comment and states the merge rule; the ontology block (598–624) is explicitly not owned |
| C-05 (path vs literal `evaluate`) | §4.5.1 threads the path id only into GET/PATCH/DELETE detail handlers; `evaluate` keeps its body/query id-source |

## 3. Data model (as-built — pinned, not changed)

No migration is authored by this spec. The tables and labels below are
documented so the tests assert against a known shape and the OpenAPI
schemas mirror reality.

### 3.1 Postgres `risk_register` (migrations 002 + 005)

Columns (all snake_case, id `TEXT PRIMARY KEY`):
`id, name, owner, domain, likelihood, impact, status, trend, description,
mitigation_plan, created_at, updated_at` (002) +
`category, risk_type, linked_entity_type, linked_entity_id, risk_owner_id,
escalation_level` (005).

Pinned facts the tests assert:
- `likelihood`/`impact` DB-checked `BETWEEN 1 AND 5`; zod also enforces `[1,5]`.
- `status ∈ (open, mitigating, accepted, resolved)`, `trend ∈ (up, flat, down)`,
  `risk_type ∈ (strategic, operational, financial, compliance, security, technical)`.
- `escalation_level` DB default `1`, checked `BETWEEN 1 AND 5`; the route
  also coalesces omitted → `1` (`risk-register.ts:151`, `validated.escalation_level || 1`).
- `updated_at` maintained by a DB `BEFORE UPDATE` trigger.

### 3.2 Postgres `change_requests` / `reviews` / `sign_offs` (migration 001)

- `change_requests`: `id, title, description, author, created_at, updated_at,
  status, draft_snapshot (JSONB NOT NULL), base_snapshot (JSONB NOT NULL),
  diff (JSONB NOT NULL), dependency_impacts (JSONB DEFAULT '[]')`.
  `status CHECK IN ('draft','pending_review','approved','rejected','released')`
  — the enum FR-11's guard is derived from (§4.4).
- `reviews`: FK `change_request_id … ON DELETE CASCADE`; `reviewer_role
  CHECK IN ('entity_manager','domain_manager','technical_lead')`; `status
  CHECK IN ('pending','approved','rejected','changes_requested')` — note the
  DB allows `pending` but the route's zod (`createReviewSchema`) only
  emits `('approved','rejected','changes_requested')`; the tests assert the
  **zod** vocabulary (what the API accepts), not the wider DB check (DD-06).
- `sign_offs`: FK cascade; `signer_role CHECK IN ('entity_manager','domain_manager')`;
  `status CHECK IN ('pending','signed','declined')`; route zod emits
  `('signed','declined')`; `signed_at` set iff `status='signed'`
  (`change-requests.ts:247`).

### 3.3 Change-request body field mapping (camelCase body → snake_case column)

Pinned per NFR-04 — the create/patch bodies use camelCase, columns are
snake_case. The tests must round-trip via the camelCase field names:

| Body field (zod) | Column | Notes |
|------------------|--------|-------|
| `draftSnapshot` | `draft_snapshot` | JSONB; `JSON.stringify` on write |
| `baseSnapshot` | `base_snapshot` | JSONB; create-only (no patch field) |
| `diff` | `diff` | JSONB |
| `dependencyImpacts` | `dependency_impacts` | JSONB, defaults `[]` on create |

### 3.4 Neo4j `_ComplianceRule` (unchanged)

Managed by `api/src/ontology/storage/compliance-rules.ts` (private
`_`-prefixed label per NFR-04). Body validated by `complianceRuleSchema` /
`complianceRulePatchSchema` from `shared/src/schema/ontology.ts`
(already OpenAPI-registered). Storage already mints ids with
`generateId()` — FR-10 does **not** touch this file.

### 3.5 `risk-compliance` process subgraph (read-only, unchanged)

Three reports read the process core: `Domain`, `UserJourney`, `Activity`
(`regulatory_tags` list property), `Role` (`EXECUTES`), `System`
(`is_third_party`, vendor/DPA props), and the `CONFLICTS_WITH`
activity→activity edge for SoD. No writes; empty graph → empty
collections (§4.5).

### 3.6 New `invalid_transition` error code (FR-11 only)

One additive member appended to the closed `ERROR_CODES` tuple in
`api/src/errors.ts`. Additive per NFR-11 (non-breaking; no reorder, no
removal). Reached only from the change-request `PATCH` guard. If FR-11 is
descoped (§4.4 off-ramp), this code is **not** added.

## 4. Core logic

### 4.1 Verify-then-fix ordering (governing rule)

Per requirements Risk #1: for every route, the integration test that pins
the as-built contract is written **before** the corresponding gap fix is
applied, so the test proves the fix did not silently change accepted
behavior. In task terms (§ tasks.md will sequence this): pin-test → fix →
re-run. The `must` FRs FR-01…FR-07 are pure pinning; FR-08…FR-12 are the
fixes each pinned test then re-asserts.

### 4.2 `parseWith` conversion — zod → 400 house envelope (FR-09, DD-01)

Today the two Postgres route files call bare `schema.parse(body)`. On
failure that throws a `ZodError`, which the router's global catch
(`router.ts:304`) already converts to a `400 invalid_payload` with
`details.issues[]`. So the **status and code are already correct**; the
only inconsistency is that the shared `parseWith` helper
(`_helpers.ts:84`) throws a `ValidationError` (caught at `router.ts:302`)
whose `issues[]` shape is the canonical one. This design routes both files
through `parseWith` so the envelope is produced by one code path.

Edits (eight `.parse()` sites):
- `risk-register.ts`: `handleRiskRegisterCreate` (`createRiskSchema.parse`
  → `parseWith(createRiskSchema, body)`), `handleRiskRegisterPatch`
  (`updateRiskSchema`).
- `change-requests.ts`: create (`createChangeRequestSchema`), patch
  (`updateChangeRequestSchema`), review create (`createReviewSchema`),
  sign-off create (`createSignOffSchema`).

Import `parseWith` from `./_helpers` in both files.

**Preserved exactly (C-01):** the empty-patch guards keep their as-built
error codes and are **not** routed through `parseWith` (they are not
schema failures):
- risk-register empty patch → `error(400, 'invalid_payload', 'No valid fields to update')` (`risk-register.ts:266`)
- change-request empty patch → `error(400, 'bad_request', 'No valid fields to update')` (`change-requests.ts:187`)

`bad_request` is already in `ERROR_CODES`? — **No.** It is not. This is an
as-built call using a code string; grep confirms `bad_request` is **absent
from the `ERROR_CODES` tuple** (§errors.ts). Because `error()` is typed to
`ErrorCode`, this line only compiles today if the code exists — so either
it does, or the call is currently a type error masked by `bun`'s no-`tsc`
transpile. **DD-07 (design decision):** verify at task time whether
`bad_request` is in `ERROR_CODES`; if it is missing, the minimal
as-built-preserving fix is to **add `bad_request` to `ERROR_CODES`**
(additive, non-breaking) rather than change the emitted code (which would
be a contract change AC-11 explicitly carves out). The design does not
rename the code. (This is the one place the "pin the as-built" rule meets
a possibly-latent type gap; the pin-first test in §7 for change-request
empty-patch will make the real runtime behavior observable before the fix.)

### 4.3 UUIDv7 ids (FR-10, `should`, DD-02)

In `risk-register.ts` and `change-requests.ts`:
- Remove `import { v4 as uuidv4 } from 'uuid';`.
- Add `import { generateId } from '../ids';`.
- Replace every `uuidv4()` call with `generateId()` (risk id; change-request
  id; review id; sign-off id).

The `uuid` **package** stays in `api/package.json` and the lockfile — its
permanent consumer is `api/src/ids.ts:1` (`import { v7 as uuidV7 }`), so
`generateId()` depends on it (requirements N-03). `@types/uuid` stays too.
Existing v4 ids already in Postgres remain valid (id columns are `TEXT`,
no reader asserts a version nibble).

**Off-ramp (C-03):** FR-10 is `should`. If the switch would break a
consumer (none known in-repo), it is dropped — the two files keep minting
v4, AC-12 is **struck (not failed)**, and the v4 retention is recorded as
a known gap in the consolidated report.

### 4.4 Change-request transition guard (FR-11, `should`, DD-03)

`handleChangeRequestPatch` currently SETs whatever `status` the body
carries. This design inserts a guard **after** the existing-row fetch
(`change-requests.ts:141`) and **before** the dynamic SET is assembled,
only when the patch includes a `status`:

```
if (validated.status !== undefined) {
  const from = existing.status as string;
  const to = validated.status;
  if (from !== to && !isAllowedTransition(from, to)) {
    return error(400, 'invalid_transition',
      `change request cannot move from '${from}' to '${to}'`,
      { from, to });
  }
}
```

`isAllowedTransition(from, to)` implements the DEC-01 allowed set, derived
from the verified as-built enum (migration `001:9` + `updateChangeRequestSchema`
both declare `('draft','pending_review','approved','rejected','released')`):

| From | Allowed To |
|------|-----------|
| `draft` | `pending_review` |
| `pending_review` | `approved`, `rejected`, `draft` |
| `approved` | `released` |
| `rejected` | `draft` |

Plus: identity (`from === to`) always allowed; any patch **without** a
`status` field is unaffected. Any other pair (e.g. `draft→released`,
`released→draft`) → `400 invalid_transition`.

`invalid_transition` is added to `ERROR_CODES` (§3.6) — one line, additive.

**Reviews/sign-offs stay advisory (DEC-02):** creating a review or sign-off
does **not** auto-transition the CR. `status` moves only via `PATCH`. This
is documented, not changed.

**Off-ramp (C-03):** FR-11 is `should`. If the guard rejects a real
as-built transition path a consumer depends on, it is dropped — the
free-form status behavior is retained, `invalid_transition` is **not**
added to `ERROR_CODES`, AC-08 is **struck (not failed)**, and the gap is
recorded in the consolidated report.

### 4.5 Pinned read shapes (FR-02, FR-07 — no code change)

**risk-register list (`{data}`):** `ok({ data: risks })`, ordered by
`(likelihood*impact) DESC, created_at DESC`; filters (`owner`, `domain`,
`status`, `category`, `risk_type`, `linked_entity_type`,
`linked_entity_id`, `escalation_level` as `>=`) applied as AND clauses.

**risk-register single (bare):** `ok(risk)` — no wrapper (NFR-04). GET one
on unknown → `404 not_found`.

**Five aggregations** (`ok({ data })`, summary is `ok({ data: result[0] })`):
`aggregation/domain`, `/owner`, `/category`, `/risk-type`, `/summary`.
Domain + owner rollups include `escalated_risks` (`escalation_level >= 3`);
category + risk-type do not. `summary` exposes the four severity buckets
(`critical_risks >=16`, `high_risks 9..15`, `medium_risks 4..8`,
`low_risks <4`), `escalated_risks`, `domains_affected`, `owners_involved`.

**risk-compliance reports — three distinct as-built envelopes (B-02):**

| Report | Populated shape | Empty-graph shape |
|--------|-----------------|-------------------|
| `regulated-activity-inventory` | `{ domains:[…], regulations:[…], matrix:[{domain, <reg>:n, …}] }` | `{ domains:[], regulations:[], matrix:[] }` — **no `count`** (`risk-compliance.ts:59-63`) |
| `sod-violations` | `{ violations:[…], count:N }` | `{ violations:[], count:0 }` (`:100`) |
| `third-party-register` | `{ register:[…], count:N }` | `{ register:[], count:0 }` (`:138`) |

Tests assert empty arrays on all three and `count===0` **only** on the two
that expose `count`; no `count` is invented on the inventory (NFR-04).

### 4.5.1 Compliance-rule path-id threading (FR-12, DD-04)

Two co-located edits close the router/handler id-source mismatch:

1. **Router (`// Compliance rule routes` block, currently ~591–594):** the
   `ruleOne` match already computes `const id = decodeURIComponent(ruleOne[1]!)`
   but the three detail calls discard it. Change them to pass `id`,
   mirroring `handleChangeRequestGet(req, id)`:
   - `handleComplianceRule(req, id)`
   - `handlePatchComplianceRule(req, id)`
   - `handleDeleteComplianceRule(req, id)`

2. **Handlers (`compliance-rules.ts`):** change the three signatures to
   accept `id: string` and drop the `url.searchParams.get("id")` +
   "Missing rule id" guard from each (`:64-71`, `:80-88`, `:108-115`).

**`evaluate` is untouched (C-05):** `handleEvaluateComplianceRule` is
dispatched as the fixed literal `POST /compliance/rules/evaluate`
(`router.ts:596`) — it is **not** a `/rules/:id/evaluate` path. It keeps
reading its rule id from `?id=` (`compliance-rules.ts:131`). FR-12 leaves
that id-source unchanged.

**Retirement (DEC-03):** the undocumented `?id=` query form of
GET/PATCH/DELETE detail routes is retired — no alias kept. No in-repo
consumer uses it; the path form is what the router matches and OpenAPI
documents.

### 4.6 OpenAPI coverage (FR-08, DD-05)

Register the currently-absent surfaces in `api/src/routes/openapi.ts`,
generated from zod (no hand-maintained copy). `compliance-rules` is
already registered (`openapi.ts:497-530`) and stays.

**New zod read/body schemas** live in a new shared module
`shared/src/schema/risk-change.ts` (mirroring `kpi-sla.ts` for the KPI
backfill) so the runtime routes and OpenAPI share one source:
- `riskCreateSchema`, `riskPatchSchema`, `riskReadSchema` (the 18 columns).
- `changeRequestCreateSchema`, `changeRequestPatchSchema`,
  `changeRequestReadSchema`, `reviewCreateSchema`, `reviewReadSchema`,
  `signOffCreateSchema`, `signOffReadSchema`.
- Report response schemas: `regulatedActivityInventorySchema`,
  `sodViolationsSchema`, `thirdPartyRegisterSchema`.

The route files' existing **inline** zod schemas
(`createRiskSchema` etc.) are moved to this shared module and imported by
both the route and `openapi.ts` — this removes the duplicate-definition
drift risk and satisfies "OpenAPI generated from the same zod used at
runtime." (No behavior change: the moved schemas are identical.)

Paths registered (following the `for (const method of …)` registry
pattern at `openapi.ts:446-468`):
- `/api/v1/risk-register` (GET, POST), `/api/v1/risk-register/{id}`
  (GET, PATCH, DELETE), and the five `/api/v1/risk-register/aggregation/{domain,owner,category,risk-type,summary}` (GET).
- `/api/v1/change-requests` (GET, POST), `/api/v1/change-requests/{id}`
  (GET, PATCH, DELETE), `/api/v1/change-requests/{id}/reviews` (POST),
  `/api/v1/change-requests/{id}/sign-offs` (POST).
- `/api/v1/risk-compliance/{regulated-activity-inventory,sod-violations,third-party-register}` (GET).

Response envelopes in the OpenAPI mirror the as-built wrappers
(`{data:[…]}` / bare / `{data,limit,offset}`) — the schema wraps
`riskReadSchema` in the observed envelope, it does not impose `{rows}`.

### 4.7 Co-owned router: owned sections + merge rule (C-04, DD-08)

Ownership of `api/src/router.ts` is **partial** — exactly the four
non-contiguous dispatch blocks below, re-anchored by **section comment**
(line numbers indicative only, they go stale):

1. `// Compliance rule routes` — `compliance/rules`, `compliance/rules/:id`
   (`ruleOne`), `compliance/rules/evaluate`. FR-12's id-threading lives here.
2. `// Change request routes` — `change-requests*`, `.../reviews`, `.../sign-offs`.
3. `// Risk register routes` — `risk-register` CRUD + `riskOne` detail block.
4. `// Risk aggregation routes` + `// Risk & Compliance routes` — the five
   `risk-register/aggregation/*` and three `risk-compliance/*` lines.

The ontology dispatch block (RDF/query/rollback/node-labels/edge-types,
currently 598–624) sits **interleaved between** blocks 1 and 2 and is
owned **elsewhere** — this spec never edits it. Sibling foundation specs
(`kpi-okr-governance`, `model-workspace-core`, `system-augmentation-model`)
own other sections of the same file. **Merge rule:** conflicts resolve by
section ownership, not last-writer-wins; this spec's edits are confined to
the four named comment-anchored blocks (FR-12 is the only functional edit;
all other blocks are read-only pins).

### 4.8 CI: verify Postgres migrations + tests run (FR-13, FR-14, DD-09)

The `integration` job already: provisions a `postgres:16-alpine` service
(`ci.yml:68-73`), sets `POSTGRES_URI` (`:87`), runs
`cd api && bun run src/storage/postgres/run-migrations.ts` (`:94`), boots
the API server, and runs `bun run test:integration` (`:111`).
`run-migrations.ts` reads **every** `*.sql` in
`api/src/storage/postgres/migrations/` sorted (client.ts:77-79), so
migrations 001/002/005 are already applied by that step —
**no CI edit is required if verification confirms this.** FR-13 is a
verify-first requirement: only if the risk/change tables turn out to be
un-migrated in CI does this spec add wiring; the expectation is a no-op
CI change.

The new tests fetch `http://127.0.0.1:8787/api/v1/...` (same convention as
`sla-compliance.integration.test.ts`) — they need the booted server, which
CI already provides.

**Test isolation (FR-14):** every new integration test
- optionally applies migrations idempotently for local runs (the CI step
  already did; `IF NOT EXISTS` migrations are safe to re-run),
- seeds its own fixtures (Postgres rows via the REST API or direct `query`;
  Neo4j nodes via `getDriver().session()`),
- tracks created ids and deletes exactly them in `afterAll`
  (Postgres `DELETE … WHERE id = ANY($1)`; Neo4j `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`),
  mirroring `sla-compliance.integration.test.ts:81-90`.

This makes `bun test:integration` order-independent and re-runnable against
a dirty local stack (AC-15).

## 5. HTTP API surface (as-built — pinned)

No new routes. The table restates the as-built surface this spec owns and
pins; the only reachability change is the compliance-rule detail routes
becoming path-addressable (FR-12).

| Method | Path | Handler | Store | Notes |
|--------|------|---------|-------|-------|
| GET | `/risk-register` | `handleRiskRegisterList` | PG | `{data}`; 8 filters; severity-desc order |
| POST | `/risk-register` | `handleRiskRegisterCreate` | PG | 201 bare; `escalation_level` default 1 |
| GET | `/risk-register/:id` | `handleRiskRegisterGet` | PG | bare; 404 unknown |
| PATCH | `/risk-register/:id` | `handleRiskRegisterPatch` | PG | dynamic SET; empty→400 `invalid_payload` |
| DELETE | `/risk-register/:id` | `handleRiskRegisterDelete` | PG | 200 `{message}`; 404 unknown |
| GET | `/risk-register/aggregation/domain` | `handleRiskAggregationByDomain` | PG | `{data}` |
| GET | `/risk-register/aggregation/owner` | `handleRiskAggregationByOwner` | PG | `{data}` |
| GET | `/risk-register/aggregation/category` | `handleRiskAggregationByCategory` | PG | `{data}` |
| GET | `/risk-register/aggregation/risk-type` | `handleRiskAggregationByRiskType` | PG | `{data}` |
| GET | `/risk-register/aggregation/summary` | `handleRiskAggregationSummary` | PG | `{data: result[0]}` |
| GET | `/change-requests` | `handleChangeRequestsList` | PG | `{data,limit,offset}`; reviews+signOffs per row |
| POST | `/change-requests` | `handleChangeRequestCreate` | PG | 201; status forced `draft` |
| GET | `/change-requests/:id` | `handleChangeRequestGet` | PG | `{...cr,reviews,signOffs}`; 404 |
| PATCH | `/change-requests/:id` | `handleChangeRequestPatch` | PG | +transition guard (FR-11); empty→400 `bad_request` |
| DELETE | `/change-requests/:id` | `handleChangeRequestDelete` | PG | 200; cascade reviews+sign-offs |
| POST | `/change-requests/:id/reviews` | `handleChangeRequestReviewCreate` | PG | 201; role/status enums; 404 parent |
| POST | `/change-requests/:id/sign-offs` | `handleChangeRequestSignOffCreate` | PG | 201; `signed_at` iff signed; 404 parent |
| GET | `/compliance/rules` | `handleComplianceRules` | Neo4j | list; `rule_type`+`enabled` filter |
| POST | `/compliance/rules` | `handleCreateComplianceRule` | Neo4j | create `_ComplianceRule` |
| GET | `/compliance/rules/:id` | `handleComplianceRule` | Neo4j | **path id (FR-12)**; 404 |
| PATCH | `/compliance/rules/:id` | `handlePatchComplianceRule` | Neo4j | **path id (FR-12)** |
| DELETE | `/compliance/rules/:id` | `handleDeleteComplianceRule` | Neo4j | **path id (FR-12)**; 204 |
| POST | `/compliance/rules/evaluate` | `handleEvaluateComplianceRule` | Neo4j | id from `?id=` (unchanged, C-05) |
| GET | `/risk-compliance/regulated-activity-inventory` | `handleRegulatedActivityInventory` | Neo4j | `{domains,regulations,matrix}` |
| GET | `/risk-compliance/sod-violations` | `handleSodViolations` | Neo4j | `{violations,count}` |
| GET | `/risk-compliance/third-party-register` | `handleThirdPartyRegister` | Neo4j | `{register,count}` |

**Auth (NFR-05):** every path above already carries an RBAC permission row
in `api/src/auth/rbac-permissions.ts:129-161` (`compliance:*`,
`change_request:*`, `risk:*`). FR-12 changes no path string, so no
permission row changes. Auth stays in the central router gate.

## 6. UI design

**None.** This spec is API-and-CI only (requirements Platforms table). It
touches no `pwa/` file — in particular not
`pwa/src/views/exec/{Risk,RiskDashboard}.tsx` (governed by
`cto-analytics`/`_baseline`). No View Tree route, no UX-* allowance, no
Native Conflicts entry applies (all n/a). Verification is `curl`/`bun test`.

## 7. Test strategy

All tests are `*.integration.test.ts` (need live Postgres and/or Neo4j),
run by the CI `integration` job. Each is self-provisioning and cleans up
exactly the ids it created (§4.8).

| Test file | Store | Covers (AC) |
|-----------|-------|-------------|
| `api/__tests__/risk-register.integration.test.ts` | Postgres | AC-01 (CRUD round-trip, default escalation, 404s, empty-patch code), AC-02 (order + 8 filters), AC-03 (five aggregations rollup shapes), AC-04 (validation 400 `issues[]`), AC-11 (zod-rejection envelope), AC-12 (UUIDv7 ids + no `uuidv4` import) |
| `api/__tests__/change-requests.integration.test.ts` | Postgres | AC-05 (CRUD, forced draft, JSONB round-trip, cascade), AC-06 (`{data,limit,offset}` + filters + nested arrays), AC-07 (reviews/sign-offs, enums, `signed_at`, 404 parent), AC-08 (transition guard incl. off-ramp strike), AC-11, AC-12 |
| `api/__tests__/compliance-rules.integration.test.ts` | Neo4j | AC-09 (path-form CRUD + literal-path evaluate; previously-400 GET now 200; 404 unknown; invalid create 400), AC-11 |
| `api/__tests__/risk-compliance.integration.test.ts` | Neo4j | AC-10 (three reports over a seeded subgraph; per-report empty shapes) |
| `api/__tests__/openapi.integration.test.ts` (extend) | server | AC-13 (enumerate the newly-registered path list; compliance/rules stays present) |

**Fixture seeding specifics:**
- Postgres risk/change tests seed via the REST API (POST) where possible so
  the id-generation + validation paths are exercised, tracking returned ids.
- `compliance-rules` seeds via `POST /compliance/rules` and asserts the
  created rule is retrievable by `GET /compliance/rules/<id>` (the FR-12
  fix — this GET returns `400 "Missing rule id"` before the fix, the rule
  after).
- `risk-compliance` seeds a minimal process subgraph in Neo4j
  (`getDriver().session()`): a `Domain`←`UserJourney`←`Activity`
  (`regulatory_tags:['GDPR']`); a `CONFLICTS_WITH` activity pair each
  `EXECUTES`-linked to a same-named `Role`; a `System {is_third_party:true}`.
  A second assertion runs the three reports against a name-scoped
  empty/unmatched slice and asserts empty collections.

**Verify-then-fix pinning:** the create/patch tests are authored to assert
the current as-built accepted payloads first; they must still pass after
the `parseWith` conversion (FR-09) and the transition guard (FR-11) — that
is the guard against silent tightening.

**CI verification (AC-14):** manual — open the PR's `integration` run,
confirm the `postgres` service is healthy, the `run-migrations.ts` step
logs 001/002/005 applied (or already-applied), and the two Postgres suites
pass.

**Deterministic-gate handling of the two `should` off-ramps (C-03):** AC-08
and AC-12 map to `should` FRs. If either FR is descoped during execution,
its test asserts the retained as-built behavior instead (free-form status /
v4 ids), the AC is struck-not-failed, and the descope is written to the
consolidated report. The `must` ACs (AC-01…AC-07, AC-09…AC-11, AC-13…AC-15)
have no off-ramp.

## 8. File Changes

| Path | Action | FR | Notes |
|------|--------|----|----|
| `api/src/routes/risk-register.ts` | modify | FR-09, FR-10 | `.parse()`→`parseWith`; `v4`→`generateId`; import moved schemas from shared |
| `api/src/routes/change-requests.ts` | modify | FR-09, FR-10, FR-11 | as above + transition guard in `handleChangeRequestPatch` |
| `api/src/routes/compliance-rules.ts` | modify | FR-12 | 3 handler signatures take `id`; drop `?id=` guard (GET/PATCH/DELETE only) |
| `api/src/routes/risk-compliance.ts` | none | FR-07 | read-and-pin; no code change (unless verification finds a defect) |
| `api/src/router.ts` | modify (4 owned blocks) | FR-12 | thread `id` into 3 compliance-rule detail calls; other 3 blocks read-only |
| `api/src/errors.ts` | modify | FR-11, DD-07 | append `invalid_transition` (+ `bad_request` iff verification finds it missing) |
| `shared/src/schema/risk-change.ts` | **new** | FR-08 | zod create/patch/read/report schemas moved from route inline + report shapes |
| `api/src/routes/openapi.ts` | modify | FR-08 | register risk-register, change-requests, risk-compliance paths from the new schemas |
| `api/__tests__/risk-register.integration.test.ts` | **new** | FR-01/02/03/09/10/14 | Postgres |
| `api/__tests__/change-requests.integration.test.ts` | **new** | FR-04/05/09/10/11/14 | Postgres |
| `api/__tests__/compliance-rules.integration.test.ts` | **new** | FR-06/09/12/14 | Neo4j |
| `api/__tests__/risk-compliance.integration.test.ts` | **new** | FR-07/14 | Neo4j |
| `api/__tests__/openapi.integration.test.ts` | modify | FR-08 | extend required-paths list |
| `.github/workflows/ci.yml` | verify (edit only if migrations missing) | FR-13 | expected no-op; the postgres service + migrate step already exist |

**Counts:** 4 new test files + 1 new shared schema module = **5 new**;
7 modify (2 route files, compliance-rules route, router, errors, openapi,
openapi test) + 1 verify-only CI = **8 touched**; `risk-compliance.ts`
untouched barring a verification-found defect.

## 9. Traceability

Every FR maps to file changes and to the ACs that close it.

| FR | File changes (§8) | Closed by AC |
|----|-------------------|--------------|
| FR-01 risk CRUD verified | risk-register test | AC-01 |
| FR-02 risk filters+aggregations | risk-register test | AC-02, AC-03 |
| FR-03 risk validation | risk-register test | AC-04 |
| FR-04 change-request CRUD | change-requests test | AC-05, AC-06 |
| FR-05 reviews+sign-offs | change-requests test | AC-07 |
| FR-06 compliance-rule CRUD+evaluate | compliance-rules test | AC-09 |
| FR-07 risk-compliance reports | risk-compliance test | AC-10 |
| FR-08 OpenAPI coverage | `risk-change.ts` (new), `openapi.ts`, openapi test | AC-13 |
| FR-09 zod→400 envelope | risk-register.ts, change-requests.ts (§4.2) | AC-04, AC-07, AC-11 |
| FR-10 UUIDv7 ids (`should`) | risk-register.ts, change-requests.ts (§4.3) | AC-12 |
| FR-11 transition guard (`should`) | change-requests.ts, errors.ts (§4.4) | AC-08 |
| FR-12 compliance-rule path routing | compliance-rules.ts, router.ts (§4.5.1) | AC-09 |
| FR-13 Postgres tests in CI | ci.yml verify (§4.8) | AC-14 |
| FR-14 self-provisioning tests | all four new test files (§4.8) | AC-14, AC-15 |

## 10. Design Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-01 | Route both Postgres files through the shared `parseWith` so the 400 `issues[]` envelope is produced by one code path; the router's `ZodError` backstop stays as defense-in-depth | One canonical envelope; no per-route error shaping (FR-09) |
| DD-02 | Swap `v4`→`generateId()` in the two route files only; keep the `uuid` package (permanent consumer `ids.ts`) | House UUIDv7 rule without breaking `generateId` (FR-10, N-03) |
| DD-03 | Transition guard is a pure in-handler check with a static allowed-set table; reviews/sign-offs stay advisory | Restores the status field's integrity without a workflow engine (FR-11, DEC-01/DEC-02) |
| DD-04 | Thread the already-computed `ruleOne` path id into the three detail handlers; leave `evaluate` on `?id=` | Closes the router/handler mismatch; `evaluate` is a literal path, not `:id`-shaped (FR-12, C-05) |
| DD-05 | Move the route files' inline zod schemas into a new `shared/src/schema/risk-change.ts` consumed by both route and OpenAPI | "OpenAPI generated from the same zod used at runtime"; kills duplicate-definition drift (FR-08) |
| DD-06 | Tests assert the **zod** enum vocabulary (what the API accepts), not the wider DB `CHECK` (e.g. `reviews.status` allows `pending` in the DB but not in `createReviewSchema`) | The API contract is the zod schema; the DB check is a superset (§3.2) |
| DD-07 | If `bad_request` proves absent from `ERROR_CODES`, add it (additive) rather than change the change-request empty-patch code | Pins the as-built emitted code (AC-11 carve-out); no contract change (§4.2) |
| DD-08 | `router.ts` ownership is partial — four comment-anchored blocks; ontology block (598–624) excluded; conflicts resolve by section ownership | Co-owned file with sibling foundation specs (C-04) |
| DD-09 | FR-13 is verify-first: no CI edit unless verification finds migrations 001/002/005 un-applied; the postgres service + migrate step already exist | Avoid churning shared CI config for a no-op (FR-13) |

## 11. Rejected Alternatives

- **Rename response envelopes to a uniform `{rows}` / `{data}` shape.**
  Rejected (NFR-04): callers depend on the as-built bare/`{data}`/`{data,limit,offset}`
  shapes; a rename is a breaking contract change out of scope for a backfill.
- **Auto-transition the change request on review/sign-off (a real state
  machine).** Rejected (DEC-02): that is a new workflow feature, not a gap
  fix; backfill scope is "close gaps verification finds."
- **Add a `/compliance/rules/:id/evaluate` path for symmetry.** Rejected
  (C-05): the as-built router dispatches `evaluate` as a fixed literal;
  adding a `:id`-path form invents surface this backfill has no mandate for.
- **Keep the `?id=` query alias alongside the path form.** Rejected
  (DEC-03): perpetuates the exact mismatch FR-12 closes; no in-repo consumer.
- **Add a risk/change audit-trail store.** Rejected (DEC-04): a new storage
  shape, not a gap fix.
- **A new Postgres service container for these tests.** Rejected (FR-13):
  the `kpi-okr-governance` backfill already added `postgres:16-alpine` to
  the CI `integration` job; reuse it.
