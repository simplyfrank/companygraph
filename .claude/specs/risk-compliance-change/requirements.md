---
feature: "risk-compliance-change"
created: "2026-07-06"
author: "spec-author (blueprint: business-modeling-studio; backfill of _baseline FR-09)"
status: "revised"
size: "large"
review_pass: 1
revised_at: "2026-07-06"
---

# Requirements: risk-compliance-change

## Summary

Governance backfill for the **adopted, currently `_baseline`-governed
risk / compliance / change-management API surface** — the four route
files under `api/src/routes/`:

- `risk-register.ts` — Postgres `risk_register` table (migrations 002 +
  005): CRUD + five read-only aggregation endpoints.
- `change-requests.ts` — Postgres `change_requests` / `reviews` /
  `sign_offs` tables (migration 001): CRUD + nested review and sign-off
  creation.
- `risk-compliance.ts` — Neo4j read-only reports: regulated-activity
  inventory, segregation-of-duties (SoD) violations, third-party
  register.
- `compliance-rules.ts` — Neo4j `_ComplianceRule` nodes (via
  `api/src/ontology/storage/compliance-rules.ts`): CRUD + evaluate.

This spec **takes ownership of those four files from `_baseline`** (per
`_baseline` FR-09, the as-built contract this spec formalizes). It
documents as-built behavior first, verifies it against that contract
with integration tests exercising the routes against a **live
Postgres** (already provisioned in the CI integration job by the
sibling `kpi-okr-governance` backfill), closes the functional and
validation gaps that verification finds, and registers the
Postgres-backed surfaces in `GET /api/v1/openapi.json`.

**Not included** (kept `_baseline`-governed / owned elsewhere):
- the Risk exec PWA views `pwa/src/views/exec/{Risk,RiskDashboard}.tsx`
  (governed by `cto-analytics`/`_baseline` — **do not edit**);
- SLA compliance `api/src/routes/sla-compliance.ts` (governed by
  `kpi-okr-governance` — already has its own integration test);
- auth / RBAC / tenancy hardening (`_baseline`);
- new dashboards or new risk/compliance/change features.

## Motivation

1. **The surface is untested.** `api/__tests__/` contains **no**
   integration test for `risk-register`, `change-requests`,
   `risk-compliance`, or `compliance-rules` (only the sibling
   `sla-compliance.integration.test.ts` exists). `_baseline` AC-06
   verifies just one route (`curl …/change-requests` returns 200) and
   is manual-only. A load-bearing governance surface can regress
   silently.
2. **Two of the four surfaces are absent from OpenAPI.**
   `risk-register` and `change-requests` (with their `reviews` /
   `sign-offs` subpaths) do not appear in `GET /api/v1/openapi.json`,
   breaking the "OpenAPI is the single source of truth for the v1
   contract" rule (`_baseline` FR-02 / graph-core FR-16).
   `compliance-rules` **is** already registered (the `compliance/rules`
   block in `openapi.ts` — its `/rules`, `/rules/{id}`, and
   `/rules/evaluate` entries); `risk-compliance` reports are also absent.
3. **A router/handler path mismatch makes the compliance-rule detail
   routes unreachable by their own contract.** The router matches
   `compliance/rules/:id` and extracts the id from the **path**
   (router.ts §"compliance/rules/:id"), but `handleComplianceRule`,
   `handlePatchComplianceRule`, and `handleDeleteComplianceRule` read
   the id from a **query param** (`url.searchParams.get("id")`). A
   `GET /api/v1/compliance/rules/<id>` therefore returns
   `400 "Missing rule id"` instead of the rule — the OpenAPI-documented
   path shape does not work as-built.
4. **House id-generation rule is violated.** `risk-register` and
   `change-requests` mint ids with the `uuid` v4 package
   (`import { v4 as uuidv4 }`) instead of the house UUIDv7 generator
   `generateId()` (`api/src/ids.ts`). (`compliance-rules` already uses
   `generateId()` in its storage layer.)
5. **Change-request status transitions are unconstrained, and reviews /
   sign-offs do not drive them.** `PATCH /change-requests/:id` accepts
   any `status` in the enum regardless of the current state — a `draft`
   can jump straight to `released` with no review or sign-off. The
   as-built behavior is a free-form status field, not a workflow; this
   spec documents that fact and closes the minimum guard needed to make
   the field trustworthy (see FR-11, DEC-01).
6. **Response envelope is inconsistent.** List handlers return
   `ok({ data: [...] })`; single-resource handlers return `ok(risk)`
   (bare, no wrapper) for `risk-register` and `ok({ ...cr, reviews,
   signOffs })` for `change-requests`. This spec documents the as-built
   shapes and pins them with tests rather than churning callers
   (NFR-04); it does not impose a `{rows}` rename.

## Functional Requirements

### A. Verify the as-built contract with integration tests

Each FR below asserts **as-built** behavior (documented here from code,
not aspiration) so any later change is a visible contract change.
Store of record per route: **Postgres** for `risk-register`
(`risk_register`) and `change-requests` (`change_requests`, `reviews`,
`sign_offs`); **Neo4j** for `risk-compliance` (process-graph reads) and
`compliance-rules` (`_ComplianceRule` nodes).

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Risk register lifecycle verified** — integration tests cover `POST /api/v1/risk-register` (201, row lands in Postgres `risk_register`; `escalation_level` defaults to 1 when omitted), `GET /api/v1/risk-register` (returns `{ data: [...] }` ordered by `(likelihood*impact) DESC, created_at DESC`), `GET /api/v1/risk-register/:id` (bare resource; 404 unknown), `PATCH /api/v1/risk-register/:id` (dynamic SET over the allow-listed fields; 404 unknown; `400 invalid_payload "No valid fields to update"` on an empty patch), `DELETE /api/v1/risk-register/:id` (200 `{message}`; second delete → 404). | must | `_baseline` FR-09 |
| FR-02 | **Risk register filters + aggregations verified** — `GET /api/v1/risk-register` honors the as-built query filters (`owner`, `domain`, `status`, `category`, `risk_type`, `linked_entity_type`, `linked_entity_id`, `escalation_level` as a `>=` threshold); the five read endpoints `risk-register/aggregation/{domain,owner,category,risk-type,summary}` (five handlers `handleRiskAggregationBy{Domain,Owner,Category,RiskType}`/`Summary` at `risk-register.ts:292,311,330,348,366`; five router lines `router.ts:653-657`) return the as-built rollup shapes over seeded rows (counts by status, `avg_severity`/`max_severity`, severity buckets in `summary`). | must | `_baseline` FR-09 (Resolves: B-01) |
| FR-03 | **Risk create/patch validation verified** — `likelihood`/`impact` outside `[1,5]`, `escalation_level` outside `[1,5]`, an unknown `status`/`trend`/`risk_type` enum value, and a missing required field (`name`/`owner`/`domain`/`likelihood`/`impact`/`status`/`trend`) each return `400 invalid_payload`. | must | `_baseline` FR-09 / house zod rule |
| FR-04 | **Change-request lifecycle verified** — `POST /api/v1/change-requests` (201; status forced to `draft`; `draft_snapshot`/`base_snapshot`/`diff` stored as JSONB; `dependency_impacts` defaults to `[]`), `GET /api/v1/change-requests` (`{ data, limit, offset }` with `status`/`author` filters + `limit`/`offset` paging, each CR carrying its `reviews` + `signOffs` arrays), `GET /api/v1/change-requests/:id` (`{ ...cr, reviews, signOffs }`; 404 unknown), `PATCH` (dynamic SET; `400 bad_request "No valid fields to update"` on empty patch; 404 unknown), `DELETE` (200; cascades reviews + sign-offs per the FK `ON DELETE CASCADE`). | must | `_baseline` FR-09 |
| FR-05 | **Review + sign-off creation verified** — `POST /api/v1/change-requests/:id/reviews` (201; `reviewer_role` ∈ {entity_manager, domain_manager, technical_lead}; `status` ∈ {approved, rejected, changes_requested}; 404 when the parent CR is missing) and `POST /api/v1/change-requests/:id/sign-offs` (201; `signer_role` ∈ {entity_manager, domain_manager}; `status` ∈ {signed, declined}; `signed_at` set only when `status = signed`; 404 when the parent CR is missing). | must | `_baseline` FR-09 |
| FR-06 | **Compliance-rule CRUD + evaluate verified** — `POST /api/v1/compliance/rules` (creates a `_ComplianceRule` node; body validated by `complianceRuleSchema` from `shared/src/schema/ontology.ts`; 400 on invalid), `GET /api/v1/compliance/rules` (list with `rule_type` + `enabled` filters), `GET|PATCH|DELETE /api/v1/compliance/rules/:id`, and `POST /api/v1/compliance/rules/evaluate` (evaluates the rule DSL; 404 unknown id). The CRUD detail routes (`GET|PATCH|DELETE /compliance/rules/:id`) are verified through the **path** form after FR-12 fixes the id-source mismatch; `evaluate` is a fixed literal path (`/compliance/rules/evaluate`, no `:id` segment) and receives its rule id from the **request body/query**, not a path segment (see FR-12, C-05). | must | `_baseline` FR-09 |
| FR-07 | **Risk-compliance reports verified** — `GET /api/v1/risk-compliance/regulated-activity-inventory` (domain × regulation matrix from `Activity.regulatory_tags`), `GET /api/v1/risk-compliance/sod-violations` (`CONFLICTS_WITH` activity pairs executed by a same-named role), `GET /api/v1/risk-compliance/third-party-register` (`System {is_third_party:true}` with vendor/DPA fields) each return the as-built shape over a seeded process subgraph, and an empty graph returns empty collections (not an error). | must | `_baseline` FR-09 |

### B. Close the functional / validation gaps verification finds

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **OpenAPI covers the surface** — every endpoint in FR-01…FR-07 that is **not yet registered** is added to `GET /api/v1/openapi.json`, generated from the same zod schemas used at runtime (no hand-maintained copy): all `risk-register` CRUD + the five aggregation reads, all `change-requests` CRUD + `reviews`/`sign-offs` subpaths, and the three `risk-compliance` reports. `compliance-rules` is already registered and stays so. | must | `_baseline` FR-02 / graph-core FR-16 |
| FR-09 | **zod at every boundary, ZodError → 400 in the house envelope** — `risk-register` and `change-requests` call bare `.parse()`; today those throw `ZodError`, which the router's global `ZodError` catch (router.ts §backstop) turns into a `400 invalid_payload` with `details.issues[]`. This spec (a) converts those `.parse()` sites to the shared `parseWith(schema, body)` helper (`api/src/routes/_helpers.ts`) so the 400 envelope shape is **identical** to the rest of the API (`details.issues[]` with `{path,message,code}`), and (b) verifies via test that a malformed body to every POST/PATCH endpoint on all four route files returns that exact `400 {error:{code,message,details}}` envelope. As-built-accepted payloads MUST continue to be accepted (no tightening beyond documented required fields). The GET-only `risk-compliance` reports have no request body and get no invented schema. | must | house zod rule / `_baseline` NFR-02 |
| FR-10 | **UUIDv7 ids** — `risk-register` and `change-requests` switch id minting from the `uuid` v4 package to the house `generateId()` (`api/src/ids.ts`) for risks, change requests, reviews, and sign-offs. Only the `{ v4 as uuidv4 }` imports in the two route files are removed. The `uuid` **package** itself stays in `api/package.json` regardless — `api/src/ids.ts:1` is a **permanent consumer** (`import { v7 as uuidV7 } from "uuid"`), so `generateId()` depends on it (N-03). The `@types/uuid` dev-dep is likewise retained. The design records `ids.ts` as this permanent consumer so the dep is never removed by mistake; the grep-gate exists only to catch any *other* v4 consumer, not `ids.ts`. Existing v4 ids already in Postgres stay valid — id columns are `TEXT`, not UUID-typed, and no reader asserts a version nibble. | should | graph-core NFR-07 |
| FR-11 | **Change-request status is guarded, not free-form** — `PATCH /change-requests/:id` rejects an out-of-lifecycle transition with `400 invalid_transition` while preserving every transition the as-built code already permitted for legitimate flows. The guard's status vocabulary is **pinned to the verified as-built enum** (see DEC-01): migration `001_create_change_requests.sql:9` declares `CHECK (status IN ('draft','pending_review','approved','rejected','released'))` and the zod `updateChangeRequestSchema` (`change-requests.ts:20`) declares the identical `z.enum(['draft','pending_review','approved','rejected','released'])` — so `pending_review` and every other status in DEC-01's set is a real, verified as-built value, not an inference. The allowed transition set is the recorded decision DEC-01: `draft→pending_review`, `pending_review→{approved,rejected,draft}`, `approved→released`, `rejected→draft`, plus identity (no-op) and any non-`status` patch. Reviews and sign-offs remain **advisory** (they do not auto-transition the CR) — documented as-built (DEC-02), not changed. | should | verification gap (§5 Motivation); Resolves via DEC-01/DEC-02 (Resolves: C-02) |
| FR-12 | **Compliance-rule detail routes reachable by path** — the router already computes `const id = decodeURIComponent(ruleOne[1]!)` at `router.ts:591` but currently **discards it**, calling `handleComplianceRule(req)` / `handlePatchComplianceRule(req)` / `handleDeleteComplianceRule(req)` with no id (router.ts:592–594). The fix threads that id in: change those three call sites to pass `id` (mirroring `handleChangeRequestGet(req, id)` at router.ts:632) **and** change the three handler signatures to read the id from that argument, not from `url.searchParams.get("id")` (`compliance-rules.ts:67,83,111`). Both edits are **in scope** — router.ts:592–594 sits inside the owned `// Compliance rule routes` block (see the router co-ownership rule), and the handlers are in the owned route file. `GET /api/v1/compliance/rules/:id` then returns the rule (or 404), matching the OpenAPI-documented path. **`evaluate` id-source (C-05):** `handleEvaluateComplianceRule` is **not** a `/compliance/rules/:id/evaluate` path — the router dispatches it as the fixed literal `POST /compliance/rules/evaluate` at router.ts:596 (which falls through the `ruleOne` regex because that block handles only GET/PATCH/DELETE). Evaluate therefore keeps taking its rule id from the **request body/query** (`compliance-rules.ts:131` reads `?id=`), and FR-12 leaves that id-source **unchanged**; only the GET/PATCH/DELETE detail handlers move to the path id. The undocumented `?id=` query form of GET/PATCH/DELETE is retired (DEC-03); no in-repo consumer uses it. | must | verification gap (§3 Motivation); Resolves via DEC-03 (Resolves: C-05) |

### C. CI + operations

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **Postgres-backed tests run in CI** — the `integration` job in `.github/workflows/ci.yml` already provisions a `postgres:16-alpine` service and runs `run-migrations.ts` before `bun run test:integration` (added by `kpi-okr-governance` FR-17). This spec **verifies** that the risk/change migrations (001 `change_requests`, 002+005 `risk_register`) are applied by that same step and that the new `risk-register` + `change-requests` integration tests pass in CI. If any migration or env wiring is missing for these tables specifically, this spec adds it; no new service container is introduced. | must | blueprint scope / `_baseline` AC-06 |
| FR-14 | **Tests are self-provisioning and isolated** — every new integration test applies migrations idempotently if needed, seeds its own fixtures (Postgres rows and Neo4j nodes), and deletes exactly the rows/nodes it created (tracked-id cleanup, mirroring `sla-compliance.integration.test.ts`) so `bun test:integration` is order-independent and re-runnable against a dirty local stack. | must | house test conventions |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | Full CI (both jobs) stays under the existing 5-minute budget on `ubuntu-latest`; the Postgres service already exists, so the only added cost is the new test files. | `_baseline` FR-16 |
| NFR-02 | zod is the only validation library; en-US identifiers; no `tsc`; `bun run typecheck` green throughout. | house rules |
| NFR-03 | All API changes are **additive** under `/api/v1/` per the versioning policy, except the two documented retirements (DEC-01 transition guard, DEC-03 `?id=` query form), each claimed as a defect fix on a never-published-or-unreachable contract shape. No change that would require a `/api/v2/` bump. | CLAUDE.md Versioning / NFR-11 |
| NFR-04 | The as-built conventions of this surface are **kept**: snake_case Postgres columns (`mitigation_plan`, `created_at`, …), the camelCase change-request body fields (`draftSnapshot`, `dependencyImpacts`) that map to snake_case columns, the `{data}` / bare / `{data,limit,offset}` response envelopes, and the `_ComplianceRule` private-label prefix. Documented so they are not "fixed" casually; renames are out of scope. | as-built |
| NFR-05 | Auth stays in the central router gate (`api/src/router.ts` + `api/src/auth/`); this spec adds no per-route auth checks. The RBAC permission rows for these routes already exist in `api/src/auth/rbac-permissions.ts` (`risk:*`, `compliance:*`, `change_request:*`); any new/renamed path (none expected) must carry a matching permission row. Loopback binding `127.0.0.1:8787` retained. | house rules / `_baseline` NFR-01 |

## Scope Boundaries

**In scope:**
- Ownership transfer from `_baseline` of: `api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests}.ts`, the `api/src/ontology/storage/compliance-rules.ts` storage module (as consumed by the compliance-rules route), and the risk/compliance/change-request **dispatch blocks** in `api/src/router.ts`.
- **Router co-ownership rule (C-04):** ownership of `api/src/router.ts` is **partial** — exactly the **four (non-contiguous) dispatch blocks** registering this spec's routes. They are **interleaved** with the ontology dispatch block (RDF export/import, `ontology/query`, `ontology/rollback`, `ontology/node-labels`, `ontology/edge-types` at router.ts:598–624), which is owned **elsewhere** and MUST NOT be claimed. The design re-anchors the four owned blocks by their **section comments**, not line numbers:
  1. `// Compliance rule routes` — the `compliance/rules`, `compliance/rules/:id`, and `compliance/rules/evaluate` lines (currently ~587–596, immediately **above** the ontology block); the `ruleOne` id-threading edits of FR-12 live here.
  2. `// Change request routes` — `change-requests*`, `.../reviews`, `.../sign-offs` (currently ~626–639, **below** the ontology block).
  3. `// Risk register routes` — `risk-register` CRUD + the `riskOne` detail block (currently ~641–650).
  4. `// Risk aggregation routes` + `// Risk & Compliance routes` — the five `risk-register/aggregation/*` lines and the three `risk-compliance/*` report lines (currently ~652–662).

  (Line numbers are indicative-only and go stale; the comments are the anchor.) Sibling foundation-wave specs (`kpi-okr-governance`, `model-workspace-core`, `system-augmentation-model`) and the ontology surface own other sections of the same file. This spec never edits dispatch blocks outside these four sections — in particular not the ontology block at 598–624; conflicts resolve by section ownership, not last-writer-wins.
- New integration test files for the four route surfaces; extension of `api/__tests__/openapi.integration.test.ts` (if present) to assert the newly registered paths.
- Gap fixes FR-08…FR-12; CI verification FR-13/FR-14.

**Out of scope:**
- **`pwa/src/views/exec/{Risk,RiskDashboard}.tsx`** — governed by `cto-analytics`/`_baseline`; **do not edit**. This spec touches **no** `pwa/` file (see Platforms table).
- **`api/src/routes/sla-compliance.ts`** — governed by `kpi-okr-governance` (already has its own integration test).
- Real audit-trail storage beyond the compliance-rules ontology audit that already exists; no new audit surface for risk/change (DEC-04).
- Converting the change-request status field into a full stateful approval workflow (multi-signer quorum, auto-transition on review/sign-off) — DEC-02 keeps reviews/sign-offs advisory; FR-11 only guards illegal jumps.
- Any envelope/field/casing rename (NFR-04); any auth/RBAC/tenancy hardening.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Risk create→get→patch→delete round-trip against Postgres `risk_register`; POST omitting `escalation_level` stores `1`; GET one on unknown id → 404; empty PATCH → `400 invalid_payload "No valid fields to update"`; second DELETE → 404 (FR-01) | server (bun test + Postgres) | `api/__tests__/risk-register.integration.test.ts` |
| AC-02 | `GET /api/v1/risk-register` returns `{data:[...]}` ordered by `(likelihood*impact) DESC, created_at DESC`; each documented filter (`owner`/`domain`/`status`/`category`/`risk_type`/`linked_entity_*`/`escalation_level` threshold) narrows the set as-built (FR-02) | server (bun test + Postgres) | `api/__tests__/risk-register.integration.test.ts` |
| AC-03 | Each aggregation endpoint (`domain`,`owner`,`category`,`risk-type`,`summary`) returns its as-built rollup over seeded rows: status counts, `avg_severity`/`max_severity` present; `summary` includes the four severity buckets + `escalated_risks` (FR-02) | server (bun test + Postgres) | `api/__tests__/risk-register.integration.test.ts` |
| AC-04 | Risk validation: `likelihood`/`impact`/`escalation_level` out of `[1,5]`, bad `status`/`trend`/`risk_type` enum, and any missing required field each return `400 invalid_payload` with a `details.issues[]` array (FR-03, FR-09) | server (bun test + Postgres) | `api/__tests__/risk-register.integration.test.ts` |
| AC-05 | Change-request create→get→patch→delete against Postgres; POST forces `status:"draft"` and defaults `dependency_impacts` to `[]`; snapshots/diff persist as JSONB and round-trip; DELETE cascades reviews + sign-offs (FR-04) | server (bun test + Postgres) | `api/__tests__/change-requests.integration.test.ts` |
| AC-06 | `GET /api/v1/change-requests` returns `{data,limit,offset}`; `status`/`author` filters and `limit`/`offset` paging behave as-built; each row carries `reviews` + `signOffs` arrays (FR-04) | server (bun test + Postgres) | `api/__tests__/change-requests.integration.test.ts` |
| AC-07 | `POST …/:id/reviews` and `POST …/:id/sign-offs` create rows (201) with role/status enums enforced (bad enum → 400); `sign_offs.signed_at` set iff `status="signed"`; both → 404 when the parent CR is unknown (FR-05, FR-09) | server (bun test + Postgres) | `api/__tests__/change-requests.integration.test.ts` |
| AC-08 | Change-request status guard: `PATCH` with an allowed transition (per DEC-01, e.g. `draft→pending_review`) succeeds; a disallowed jump (e.g. `draft→released`) returns `400 invalid_transition`; a non-`status` patch and an identity `status` patch always succeed (FR-11, **should**). **Off-ramp:** because FR-11 is `should`, if the guard is descoped (see the "`should`-descoping rule" below Acceptance Criteria) this AC is struck, not failed — the free-form status behavior is then recorded as a known gap in the consolidated report. (Resolves: C-03) | server (bun test + Postgres) | `api/__tests__/change-requests.integration.test.ts` |
| AC-09 | Compliance-rule create→get→patch→delete all succeed through the **path** routes `/api/v1/compliance/rules/:id` (not `?id=`): `GET /api/v1/compliance/rules/<id>` on a created rule returns the rule (previously 400 "Missing rule id"); unknown id → 404; invalid create body → 400. **`evaluate` is exercised at its as-built literal path** `POST /api/v1/compliance/rules/evaluate` with the rule id supplied in the **body/query** (not a `:id` path segment — there is no `/compliance/rules/:id/evaluate` route; see FR-12/C-05); it returns the evaluation for a known id and 404 for an unknown id. (FR-06, FR-12) (Resolves: C-05) | server (bun test + Neo4j) | `api/__tests__/compliance-rules.integration.test.ts` |
| AC-10 | The three `risk-compliance` reports return their as-built shapes over a seeded process subgraph (a regulated activity, a `CONFLICTS_WITH` pair sharing a role, a `System{is_third_party:true}`); against an empty/unmatched graph each returns empty collections, not an error, using the report's **own** as-built envelope: `regulated-activity-inventory` → `{ domains:[], regulations:[], matrix:[] }` (**no `count` field** — `risk-compliance.ts:59-63`); `sod-violations` → `{ violations:[], count:0 }` (`risk-compliance.ts:100`); `third-party-register` → `{ register:[], count:0 }` (`risk-compliance.ts:138`). The test asserts empty arrays for the inventory and `count === 0` only for the two reports that expose `count`; no `count` field is invented on the inventory (NFR-04). (FR-07) (Resolves: B-02) | server (bun test + Neo4j) | `api/__tests__/risk-compliance.integration.test.ts` |
| AC-11 | A malformed body (**zod-rejection**: wrong type, out-of-range, bad enum, missing required field) to every POST/PATCH endpoint across all four route files returns `400 {error:{code:"invalid_payload",message,details:{issues:[{path,message,code}]}}}` via the shared `parseWith` channel; an as-built-valid payload still succeeds. **Empty-patch rejections (`No valid fields to update`) are out of scope for this zod-envelope assertion and keep their as-built codes** — `invalid_payload` for risk-register (`risk-register.ts`) and `bad_request` for change-requests (`change-requests.ts:187`, per FR-04/AC-05); AC-11 does not require these two to converge. (FR-09) (Resolves: C-01) | server (bun test + Postgres + Neo4j) | zod-rejection cases inside each `api/__tests__/{risk-register,change-requests,compliance-rules}.integration.test.ts` |
| AC-12 | Created risk, change-request, review, and sign-off ids are UUIDv7 format (version nibble `7`); the `{ v4 as uuidv4 }` import is gone from `risk-register.ts` and `change-requests.ts` (the `uuid` **package** itself stays — `api/src/ids.ts:1` imports `{ v7 as uuidV7 }` from it, per N-03) (FR-10, **should**). **Off-ramp:** because FR-10 is `should`, if the UUIDv7 migration is descoped (see the "`should`-descoping rule" below) this AC is struck, not failed — the two files keep minting v4 ids, recorded as a known gap in the consolidated report. (Resolves: C-03) | server (bun test) | `api/__tests__/risk-register.integration.test.ts`, `api/__tests__/change-requests.integration.test.ts` |
| AC-13 | `GET /api/v1/openapi.json` includes paths for every FR-01…FR-07 endpoint; the assertion enumerates the expected path list (risk-register CRUD + the 5 aggregations, change-requests CRUD + reviews + sign-offs, 3 risk-compliance reports, compliance/rules already-present set) (FR-08) (Resolves: B-01) | server (bun test) | `api/__tests__/openapi.integration.test.ts` (extended) |
| AC-14 | CI integration job applies migrations 001/002/005 and passes the `risk-register` + `change-requests` Postgres-backed tests (FR-13, FR-14) | CI (ubuntu-latest) | manual: open the PR's `integration` job run — verify the `postgres` service starts healthy, the `run-migrations.ts` step logs migrations 001/002/005 applied (or already-applied), and the `risk-register`/`change-requests` integration tests pass |
| AC-15 | `bun test:integration` run twice in a row against the same local stack passes both times (isolation/idempotence) (FR-14) | CLI (local stack) | manual: with `bun run dev` stack up, run `bun test:integration` twice — verify exit 0 both runs, no unique-constraint or leftover-fixture failures in the risk/change/compliance suites |

**`should`-descoping rule (C-03).** Two FRs carry priority `should`:
FR-10 (UUIDv7 ids, AC-12) and FR-11 (transition guard, AC-08). Under
single-shot mode (XD-17) there is no mid-run user gate, so the
deterministic completion gate would otherwise treat AC-08 and AC-12 as
hard must-pass. To give each `should` a defined off-ramp: if — during
design or execution — a `should` FR proves risky (e.g. FR-11's guard
would reject a real as-built transition, or FR-10's id switch would
break a consumer), it may be dropped. When it is dropped, **its AC is
struck (not failed)** and the retained as-built behavior (free-form
status for FR-11; v4 ids for FR-10) is documented as a **known gap in
the consolidated report**. The `must` FRs (FR-01…FR-09, FR-12…FR-14)
have no such off-ramp and their ACs remain hard gates.

## Platforms & Input Modes

This spec is **API-and-CI only**. It touches no `pwa/` file, no
gesture, scroll, keyboard, or focus handler. Interaction is via
`curl` / `bun test` against the REST surface.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| risk-register / change-requests / risk-compliance / compliance-rules REST | n/a | n/a | n/a | n/a | server (curl / bun test); no UI |
| CI integration job | n/a | n/a | n/a | n/a | GitHub Actions |

## Native Conflicts

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none — no gesture/scroll/keyboard/focus work; API + CI only, no `pwa/` surface touched) | n/a | n/a |

## Dependencies

- **Upstream specs:** none (this backfill depends on no other feature).
  Consumes the `_baseline` contract (FR-02 OpenAPI, FR-05 router auth
  gate + RBAC rows, FR-06 Postgres layer, FR-09 the surface itself) and
  the CI Postgres service already added by `kpi-okr-governance` FR-17.
- **Downstream dependents:** none declared in the blueprint feature
  inventory (this surface is a foundation-adjacent backfill; the Risk
  exec views that read it are `_baseline`/`cto-analytics`-governed and
  out of scope).
- **Infrastructure:** Neo4j 5 (bolt 7687) for `risk-compliance` +
  `compliance-rules`; Postgres 16 (`postgres` service; migrations 001
  `change_requests`/`reviews`/`sign_offs`, 002+005 `risk_register`) for
  `risk-register` + `change-requests`; Bun 1.1+, `zod`, `pg`.
- **Shared code:** `shared/src/schema/ontology.ts`
  (`complianceRuleSchema` / `complianceRulePatchSchema`, source for
  FR-06/FR-08); `api/src/ids.ts` (`generateId`, FR-10);
  `api/src/routes/_helpers.ts` (`ok`/`error` envelope + `parseWith`
  channel, FR-09); `api/src/router.ts` global `ZodError` catch.

## Risks & Recorded Decisions

**Recorded decisions** (blueprint XD-17 single-shot mode has no mid-run
user gate — deterministic defaults are recorded here and flagged for the
consolidated report):

| ID | Decision | Rationale | Flag for consolidated report |
|----|----------|-----------|------------------------------|
| DEC-01 | FR-11 adds a **minimal transition guard** to `PATCH /change-requests/:id` with this allowed set: `draft→pending_review`, `pending_review→{approved,rejected,draft}`, `approved→released`, `rejected→draft`, plus identity and any non-`status` patch. Disallowed jumps → `400 invalid_transition`. | The as-built field allowed any jump (e.g. `draft→released`), which makes the review/sign-off records meaningless. A minimal guard restores the field's integrity without building a full workflow engine. The status **vocabulary** is verified against code, not inferred: migration `001_create_change_requests.sql:9` and the zod `updateChangeRequestSchema` (`change-requests.ts:20`) both declare the identical enum `('draft','pending_review','approved','rejected','released')`, so all five statuses in the allowed set are real as-built values; only the allowed *edges* between them are the DEC-01 decision. If a future migration changes that enum, this transition set MUST be re-derived from it. | yes — any caller relying on arbitrary status writes (there is no in-repo one) breaks; a new `invalid_transition` error code is needed (additive to `ERROR_CODES`). **Off-ramp (see C-03):** if FR-11 is descoped, AC-08 is struck and the free-form status behavior is documented as a known gap in the consolidated report |
| DEC-02 | Reviews and sign-offs stay **advisory** — creating a review or sign-off does **not** auto-transition the parent change request. `status` is moved explicitly via `PATCH`. | Auto-transition (quorum, multi-signer) is a new workflow feature, not a gap fix; XD-16-style backfill scope is "close gaps verification finds", not "build features". | yes — downstream consumers must not assume a state machine drives status from reviews |
| DEC-03 | FR-12 **retires** the undocumented `?id=` query form of `GET|PATCH|DELETE /api/v1/compliance/rules` in favor of the OpenAPI-documented `/compliance/rules/:id` path form (which is currently unreachable). No alias kept. | The path form is what the router matches and OpenAPI documents; the query form was never documented and has no in-repo consumer. Keeping both perpetuates the exact mismatch this spec closes. | yes — any out-of-repo script using `?id=` breaks |
| DEC-04 | Risk and change-request routes get **no new audit-trail storage**; the compliance-rules ontology audit that already exists is left as-is. | Scope is verify + close gaps, not add features; a real audit log is a new storage shape. | yes — consumers must not assume a risk/change audit trail exists |

**Risks:**

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Converting `.parse()` → `parseWith` (FR-09) or adding the transition guard (FR-11) could unintentionally reject payloads the as-built code accepted | Silent contract tightening breaks callers | FR-09 requires as-built-accepted payloads to keep passing; integration tests are written **before** the conversion (verify-then-fix ordering) to pin the contract; FR-11's allowed set explicitly includes every legitimate as-built transition |
| 2 | Adding `invalid_transition` to the closed `ERROR_CODES` enum (`api/src/errors.ts`) is an additive change but must be asserted-exhaustive-safe | Build break if the exhaustiveness assertion is not updated | Design phase enumerates the one-line `ERROR_CODES` addition + any exhaustiveness switch update; it is additive (non-breaking) per the versioning policy |
| 3 | `api/src/router.ts` is co-owned with wave-1 specs | Merge conflicts / ownership ambiguity | Scope Boundaries records the partial-ownership rule (owned dispatch blocks only); design.md must re-anchor the owned sections by comment/section and state the merge rule before implementation |
| 4 | `compliance-rules` routing/handler change (FR-12) touches how the router passes the id | Regression on the one already-registered surface | AC-09 exercises the full path-form CRUD + evaluate end-to-end; the change mirrors the existing `handleChangeRequestGet(req, id)` argument-passing pattern already proven in the same router |
| 5 | Removing the `uuid` dependency (FR-10) may break another importer | Build break | FR-10 is grep-gated: the dep is removed only if no other consumer remains; otherwise the import is dropped from the two files but the package stays |

## Traceability

| FR | Closed by AC | Notes |
|----|--------------|-------|
| FR-01 | AC-01 | risk CRUD lifecycle |
| FR-02 | AC-02, AC-03 | filters + aggregations |
| FR-03 | AC-04 | risk validation |
| FR-04 | AC-05, AC-06 | change-request CRUD + list |
| FR-05 | AC-07 | reviews + sign-offs |
| FR-06 | AC-09 | compliance-rule CRUD + evaluate |
| FR-07 | AC-10 | risk-compliance reports |
| FR-08 | AC-13 | OpenAPI coverage |
| FR-09 | AC-04, AC-07, AC-11 | zod → 400 envelope everywhere |
| FR-10 | AC-12 | UUIDv7 ids (should) |
| FR-11 | AC-08 | change-request transition guard |
| FR-12 | AC-09 | compliance-rule path routing |
| FR-13 | AC-14 | Postgres tests in CI |
| FR-14 | AC-14, AC-15 | self-provisioning + isolated tests |

## Revision Log

**Pass 1 → revised (2026-07-06)** — addresses every finding in
`review-requirements.md` (verdict: revise; 2 blockers, 5 concerns, 3 nits):

| Finding | Where resolved |
|---------|----------------|
| **B-01** eight→five aggregations | Summary, FR-02, FR-08, AC-13 — all four sites now say **five**; FR-02 cites the five handler + router lines |
| **B-02** untestable `count:0` on inventory | AC-10 rewritten per-report: inventory asserts empty arrays (no `count`), only `sod-violations`/`third-party-register` assert `count===0` |
| **C-01** `bad_request` vs `invalid_payload` empty-patch | AC-11 scoped to zod-rejection only; empty-patch codes kept as-built per report |
| **C-02** inferred transition enum | FR-11 + DEC-01 pin the status vocabulary to migration 001:9 + `updateChangeRequestSchema` (identical verified enum) |
| **C-03** `should` off-ramp missing | New "`should`-descoping rule" paragraph; AC-08 + AC-12 carry explicit strike-not-fail off-ramps |
| **C-04** stale / non-contiguous router anchors | Scope Boundaries co-ownership rule now lists four non-contiguous blocks by section comment and excludes the ontology block at 598–624 |
| **C-05** path-form evaluate ambiguity | FR-06, FR-12, AC-09 clarify evaluate is the literal `/compliance/rules/evaluate` (id from body/query), not a `:id` path; router 592–594 named as in-scope edits |
| **N-01** CI service claim | accurate; no change |
| **N-02** openapi.ts line numbers | Motivation §2 now anchors by "the `compliance/rules` block in `openapi.ts`" |
| **N-03** `ids.ts` permanent `uuid` consumer | FR-10 records `ids.ts` as the permanent consumer; only the `v4` route imports are removed, the package stays |
