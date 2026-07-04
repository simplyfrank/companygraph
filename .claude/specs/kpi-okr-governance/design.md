---
feature: "kpi-okr-governance"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-16)"
status: "approved"
revision: 2
reviewing_requirements_revision: 2
revised_after: "review-design.md pass 1 (verdict: revise) — all findings addressed, see §2"
approved_via: "review-design.md pass 2 (verdict: approve), single-shot gate (XD-17), 2026-07-04"
size: "large"
---

# Design: kpi-okr-governance

## 1. Overview

This design takes the nine adopted KPI/SLA/OKR route files, the shared
`kpi-sla.ts` schema, and the two exec views out of `_baseline`
governance by doing three things in a fixed order: **(1) pin** — write
integration tests that assert the as-built contract exactly as the code
behaves today (documented in §3–§5 from a line-level read of every
file); **(2) fix** — land the enumerated gap fixes (FR-10…FR-14) as
visible contract changes with the pinning tests updated in the same
task; **(3) prove in CI** — add the `postgres` service, a migration
step, and an API-server boot step to the integration job so the whole
surface is regression-tested on every PR.

Five rules govern the design:

1. **Verify-then-fix (DD-01).** No behavior change lands before an
   integration test pins the behavior it replaces. The only intentional
   contract breaks are **(i)** the DEC-01 overload retirement (FR-13),
   **(ii)** the FR-04 weight-bounds enforcement, and **(iii)** the 400
   `details`-shape standardization on `POST /roll-down/sla/domain`,
   whose as-built handler already maps ZodError but with
   `details: e.flatten()` (§4.2, resolves design-review B-02). All
   three land *with* their tests, never silently.
2. **No tightening beyond the documented contract (DD-03).** The zod
   conversion enforces presence + primitive type of the documented
   required fields and nothing more. Enum membership is enforced only
   where the as-built code already enforced it. Snake_case stays
   (requirements NFR-04).
3. **ZodError never escapes as 500 (DD-02).** One shared
   `parseWith(schema, input)` helper converts every schema failure into
   the existing `ValidationError → 400 {error:{code,message,details}}`
   channel; a defensive `ZodError` branch in the router catch backstops
   any future direct `.parse()` call.
4. **Co-ownership by section (DD-11).** `api/src/router.ts`,
   `api/src/routes/domain-crud.ts`, `api/src/routes/openapi.ts`,
   `api/src/auth/rbac-permissions.ts`, and `pwa/src/api.ts` are shared
   files; this spec edits only the enumerated sections in §4.9 and
   adds new code behind one-line hooks elsewhere.

5. **The route surface and the RBAC table move together (DD-12).**
   Every route this spec adds, retires, or re-shapes is mirrored in
   `ROUTE_PERMISSIONS` (`api/src/auth/rbac-permissions.ts`) in the
   same task — the central router gate skips the permission check
   when `getRoutePermission` returns `null`, so an unlisted route is
   an authorization hole in issuer-configured mode, not a safe
   default (§4.10). Resolves: design-review B-01.

Trade-off taken: the roll-down surface (1,483 lines, ~24 endpoints)
gets P0-flow coverage plus table-driven zod rejections, not exhaustive
per-variant tests (requirements Risk 3). Trade-off rejected: unifying
the measurement/breach split-brain stores (§3.4) — that is a contract
change beyond FR-10…FR-14 and is documented + flagged instead (DD-05).

## 2. Prior-review concerns — resolution in this design

Requirements review pass 1 (`review-requirements.md`) was fully
addressed in requirements revision 2. Two findings delegated work to
this design phase:

- **C-04 (router co-ownership)** → §4.9 enumerates the owned dispatch
  blocks of `api/src/router.ts` at comment-anchor granularity and
  states the merge rule. Resolves: C-04.
- **B-01/FR-11b (where the ZodError mapper lives)** → DD-02 in §4.2:
  shared `parseWith` helper in `_helpers.ts` plus a router-catch
  backstop. Resolves the design decision FR-11b left open.
- **DEC-01 / DEC-02** (recorded decisions, no user gate per XD-17) are
  honored as-is: §4.4 implements the clean overload retirement; §4.1
  keeps the placeholder audit endpoints and documents their shape
  honestly in OpenAPI.

Requirements review pass 2 (the approving review) handed two
carry-over concerns to this design (previously unaddressed by name —
design-review B-02):

- **Pass-2 C-01 (existing `roll-down.ts:1313` ZodError mapper).** The
  "no ZodError→400 mapping anywhere" premise has one as-built
  exception: `handleSlaDomainRollDownPost` (`roll-down.ts:1311-1320`)
  already wraps `.parse()` and returns `error(400, "invalid_payload",
  "schema validation failed", e.flatten())`. The FR-11b design
  decision is: **standardize on the `parseWith` `details.issues[]`
  shape everywhere**, making that one endpoint's `details` change
  (`e.flatten()`'s `{formErrors,fieldErrors}` → `{issues:[…]}`, and
  `message` `"schema validation failed"` → `"invalid_payload"`) the
  third sanctioned contract change under DD-01 rule (iii). The
  roll-down pinning test asserts the *new* shape on that endpoint in
  the same task the swap lands (§4.1, §4.2). Rationale in §9 (rejected:
  flatten-compatible emission). Resolves: req-review pass-2 C-01,
  design-review B-02.
- **Pass-2 C-02 (FR-10c top-level predicate semantics).** Decided in
  §4.5: the unfiltered directive list reproduces the view's
  string-contains predicate **byte-for-byte**
  (`NOT n.attributes_json CONTAINS '"domain_id"'`) — bug-compatible
  with the Cypher it replaces, so the view swap in FR-15 is a pure
  transport change with identical row sets. A directive whose
  attribute *values* merely mention the string `"domain_id"` is
  excluded; AC-21's fixtures pin exactly this (one such decoy fixture
  included). Parse-based filtering was considered and rejected (§9) —
  it would silently change which directives the exec view shows, a
  behavior change outside FR-10…FR-14. Resolves: req-review pass-2
  C-02, design-review B-02.

### Design review pass 1 — resolution map

| Finding | Resolution |
|---------|-----------|
| B-01 (RBAC table not updated for new/changed routes) | DD-12; new §4.10 enumerates the `ROUTE_PERMISSIONS` entries added/removed; `api/src/auth/rbac-permissions.ts` + a `getRoutePermission` unit test added to §7; §8 records why the integration suite cannot cover this |
| B-02 (pass-2 carry-overs ignored; third contract change unaccounted) | The two bullets above; §1 rule 1(iii); §4.1/§4.2 roll-down exception recorded and pinned |
| C-01 (`listQuerySchema` coercion vs `parseQueryBool`) | §3.3: schema is OpenAPI-documentation-only, type aligned to `parseQueryBool` semantics; §4.5 names `parseQueryBool` as the sole runtime parser |
| C-02 (CI boot step cannot fail; NFR-01 budget) | §4.8: hard healthz assert + server-log capture on failure; NFR-01 measurement checkpoint + named trim levers |
| C-03 (test-process env for direct driver/pg access) | §4.8a: `scripts/test-integration.sh` sources the root `.env` (tolerant when absent, e.g. CI); script added to §7 |
| N-01 (`created_at` vs `createdAt` on `:OKRDirective`) | §4.5 note; tasks must phrase AC-21 ordering as `createdAt` |
| N-02 (compressed SLA row in §5) | SLA rows expanded to six explicit rows |
| N-03 (okr-management error-scenario claim overstated) | §8 wording corrected |

Verification findings made during this design's code read that the
requirements did not yet name (all handled inside existing FR scope,
flagged for the consolidated report):

| # | Finding | Disposition |
|---|---------|-------------|
| V-01 | `parseId` in `_helpers.ts` validates **UUIDv7 only**, but `kpi-crud`/`sla-crud` mint **v4** ids — as-built, `PATCH/archive/audit` on any KPI/SLA created through the API returns `400 malformed id`. The `_baseline` FR-07 lifecycle is unusable end-to-end. | Fixed under FR-13/FR-14: path-id guard on this surface becomes `z.string().uuid()` (v4+v7), §4.4 / DD-04. Pinning tests assert the *fixed* lifecycle because the as-built one is self-contradictory (the requirements' FR-01 lifecycle is the contract). |
| V-02 | Split-brain stores: `kpi-measurements`/`sla-breaches` write **Postgres**, but `kpi-trends` reads `:KPIMeasurement` nodes and `sla-compliance` reads `:SLABreach` nodes from **Neo4j**. Measurements recorded via REST never feed trends/compliance. | Kept as-built per requirements §A store-of-record table; tests seed each store the reader actually reads (DD-05). Flag for consolidated report. |
| V-03 | The CI `integration` job never starts the API server, yet every `*.integration.test.ts` fetches `http://127.0.0.1:8787`. The job cannot pass as configured. | Fixed under FR-17 (the FR's purpose is "CI can catch regressions"): §4.8 adds a background server-boot + healthz-wait step alongside the postgres service. |
| V-04 | Router matcher shadow: `GET /api/v1/roll-down/kpi/product` (no trailing id) matches the by-domain regex with `domainId="product"`. Same for `okr/product`. | Documented as-built quirk; tests always use the id-suffixed forms. No fix (routes with ids behave correctly). |

## 3. Data model

No new storage shapes. This section documents the as-built model the
tests pin (FR-01…FR-09) and the shared-schema additions (FR-11a).

### 3.1 Neo4j node labels (as-built, this surface)

| Label | Writer | Properties (beyond `id`) | FR |
|-------|--------|--------------------------|----|
| `:KPI` | `kpi-crud` | flat snake_case: `name, description, category, unit, target_value, target_direction, warning_threshold, critical_threshold, measurement_frequency, owner_role, domain_id, created_at, updated_at, archived_at` | FR-01 |
| `:SLA` | `sla-crud` | flat snake_case: `name, description, service_type, target_value, target_unit, measurement_window, window_duration, penalty_type, penalty_amount, compliance_threshold, domain_id, product_type, created_at, updated_at, archived_at` | FR-05 |
| `:OKRDirective` | `okr-crud` | **camelCase core** + `attributes_json` STRING (graph-core convention): `name, description, attributes_json, createdAt, updatedAt`; attributes carry `cycle_name, cycle_start, cycle_end, domain_id?, product_id?, status, review_cadence` | FR-08 |
| `:KeyResult` | `okr-crud` | same convention; attributes carry `baseline_value, target_value, current_value, unit, direction, progress, status`; linked via `(:OKRDirective)-[:HAS_KEY_RESULT]->(:KeyResult)` | FR-08 |
| `:RollDownAssignment` (+ roll-down KPI/OKR copies) | `roll-down` | `status` lifecycle `pending → committed/rejected → approved/rejected`, approval/rejection metadata | FR-09 |
| `:KPIMeasurement` | **nothing in-repo** (see V-02) | read by `kpi-trends` as `{kpi_id, id, measured_at, value}` | FR-03 |
| `:SLABreach` | **nothing in-repo** (see V-02) | read by `sla-compliance` as `{sla_id, id, breach_at, severity, resolution_status, actual_value, target_value}` | FR-07 |

Alignment edges: `(:KPI)-[:ALIGNED_TO {weight, attribution_type, alignment_notes, created_at}]->(:UserJourney|:Activity|:Domain)` and
`(:SLA)-[:ALIGNED_TO {is_critical, alignment_notes, created_at}]->(:UserJourney|:Activity)`. Alignment ids are Neo4j
`elementId(r)` strings, **not UUIDs** — the DELETE path params for
alignments therefore stay opaque strings (no UUID guard).

### 3.2 Postgres tables (migrations 003/004, as-built, unchanged)

- `kpi_measurements (id TEXT PK, kpi_id TEXT, measured_at TIMESTAMPTZ, value NUMERIC, context JSONB, source TEXT, created_at TIMESTAMPTZ)` — FR-02.
- `sla_breaches (id TEXT PK, sla_id TEXT, breach_at TIMESTAMPTZ, actual_value NUMERIC, target_value NUMERIC, severity CHECK minor|major|critical, impact_description, root_cause, resolution_status CHECK open|resolved|mitigated DEFAULT open, resolved_at, resolution_notes, created_at, updated_at + auto-update trigger)` — FR-06.

Note the DB CHECK for `resolution_status` omits `investigating` (the
shared `slaBreachSchema` includes it). The as-built PATCH schema also
omits it. Pinned as-is; flagged with V-02 for the report.

### 3.3 Shared schema additions (`shared/src/schema/kpi-sla.ts`, FR-11a)

New **request** schemas exported next to the existing read shapes so
API validation and OpenAPI generation share one source (graph-core
FR-16 pattern). Per DD-03 they encode the *documented as-built*
contract, not the aspirational read shapes:

```ts
// FR-01 — presence + primitive types of the six documented required
// fields; enums NOT enforced (as-built leniency, DD-03); domain_id
// accepted (as-built extra field missing from kpiSchema).
export const kpiCreateRequestSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1),
  measurement_frequency: z.string().min(1),
  description: z.string().optional(),
  warning_threshold: z.number().optional(),
  critical_threshold: z.number().optional(),
  owner_role: z.string().optional(),
  domain_id: z.string().optional(),
});
export const kpiPatchRequestSchema = kpiCreateRequestSchema
  .omit({ domain_id: true }).partial();          // PATCH allow-list, as-built

// FR-05 — mirrors the as-built seven required SLA fields.
export const slaCreateRequestSchema = z.object({
  name: z.string().min(1),
  service_type: z.string().min(1),
  target_value: z.number(),
  target_unit: z.string().min(1),
  measurement_window: z.string().min(1),
  window_duration: z.string().min(1),
  compliance_threshold: z.number(),
  description: z.string().optional(),
  penalty_type: z.string().optional(),
  penalty_amount: z.number().optional(),
  domain_id: z.string().optional(),
  product_type: z.string().optional(),
});
export const slaPatchRequestSchema = slaCreateRequestSchema
  .omit({ domain_id: true, product_type: true }).partial();

// FR-04 — enums stay enforced (as-built enforced them); weight gains
// the [0,1] bound the shared kpiAlignmentSchema documents (the ONE
// sanctioned tightening, required by AC-06). target_type includes
// "domain" — an as-built extension beyond kpiAlignmentSchema.
export const kpiAlignmentCreateRequestSchema = z.object({
  kpi_id: z.string().min(1),
  target_type: z.enum(["journey", "activity", "domain"]),
  target_id: z.string().min(1),
  weight: z.number().min(0).max(1),
  attribution_type: z.enum(["direct", "indirect", "leading", "lagging"]),
  alignment_notes: z.string().optional(),
});
export const slaAlignmentCreateRequestSchema = z.object({
  sla_id: z.string().min(1),
  target_type: z.enum(["journey", "activity"]),
  target_id: z.string().min(1),
  is_critical: z.boolean().optional(),
  alignment_notes: z.string().optional(),
});

// FR-03 / FR-07 — GET-only surfaces get query/path schemas ONLY
// (requirements N-01). Coercion mirrors the as-built parseInt/parseFloat.
export const kpiTrendsQuerySchema = z.object({
  window_days: z.coerce.number().int().positive().default(30),
  ma_period: z.coerce.number().int().positive().default(7),
  anomaly_threshold: z.coerce.number().positive().default(2.0),
});
export const slaComplianceQuerySchema = z.object({
  window_days: z.coerce.number().int().positive().default(90),
});

// FR-10a/b — list query params. DOCUMENTATION-ONLY schema: it exists
// so FR-12/OpenAPI can describe the param; the handlers parse via the
// existing parseQueryBool ("true"/"1" only, §4.5) and never wire this
// schema in. The type mirrors parseQueryBool semantics exactly —
// z.coerce.boolean() is banned here because it coerces the string
// "false" to true. Resolves: design-review C-01.
export const listQuerySchema = z.object({
  include_archived: z.enum(["true", "1"]).optional(),
});
```

The existing read schemas (`kpiSchema`, `slaSchema`, …) are unchanged
and are registered in OpenAPI as *documented* response shapes with a
description noting the leniency gap (DD-03, DEC-02 honesty rule).

The measurement/breach body schemas stay where they are today
(`kpi-measurements.ts`, `sla-breaches.ts`) but are **exported** so
`openapi-kpi-okr.ts` can register them (FR-12); same for the seven
roll-down body schemas and three `okr-crud` schemas.

### 3.4 Split-brain store (pinned, not fixed — DD-05)

`kpi-trends` and `sla-compliance` read Neo4j; `kpi-measurements` and
`sla-breaches` write Postgres (V-02). Requirements §A fixed the store
of record per route, so:

- FR-03 tests seed `:KPIMeasurement` nodes via `POST /api/v1/query/cypher`? — **no**: the passthrough is read-only. Seeding via the graph-core generic node route is also unavailable (`KPIMeasurement` is not a registered label). Tests seed through the production driver singleton (`getDriver()` from `api/src/neo4j/driver.ts`, the same pattern `neo4j-bootstrap.integration.test.ts` uses) — the only write path that exists for these labels. Cleanup deletes by seeded id. Env for the test process is supplied by `scripts/test-integration.sh` sourcing the root `.env` (§4.8a, resolves design-review C-03).
- FR-07 tests seed `:SLABreach` nodes the same way.
- AC-04/AC-08 assert Postgres rows by importing `query()` from
  `api/src/storage/postgres/client` inside the test (env per §4.8a:
  root `.env` locally, job `env:` block in CI).

## 4. Core logic

### 4.1 Pinned as-built behavior per route file (FR-01…FR-09)

What the integration tests assert, from code (§3 shapes throughout;
"envelope" = `{error:{code,message,details?}}`):

**kpi-crud (FR-01)** — `POST /kpis`: 200 (not 201, as-built) with the
created node's flat properties; missing any of the six required fields
→ 400 `invalid_payload` listing `required`. `PATCH /kpis/:id`: dynamic
SET over the 10-field allow-list, `updated_at` bumped, 404 when absent
or archived. Archive: sets `archived_at`, second call → 404. Audit:
one synthetic row `{action:"view", user_id:"system", …}` (DEC-02),
404 unknown id. Post-fix additions: §4.4 detail/list routes, UUIDv7
ids (§4.6), UUID-any path guard (DD-04).

**sla-crud (FR-05)** — mirror of kpi-crud with the seven SLA required
fields and its own allow-list.

**kpi-measurements (FR-02)** — `POST` 201 + the inserted row (NUMERIC
comes back as string from `pg` on the POST echo; the GETs
`parseFloat` it — pinned exactly); `GET ?kpi_id=` required else 400,
`limit`/`offset` pass-through defaults 100/0; `GET /:id` 404 unknown;
`DELETE /:id` → `{deleted:true}`. Malformed body today → **500**;
after §4.2 → 400 envelope (AC-12).

**sla-breaches (FR-06)** — `POST` 201, `resolution_status` forced
`'open'`; severity enum enforced by zod; list filters `sla_id`
(required) + `resolution_status`; `PATCH` partial resolution updates,
empty patch body → 400 `no fields to update`; `DELETE` →
`{deleted:true}`. Same 500→400 conversion.

**kpi-trends (FR-03)** — `GET /kpi-trends/:kpiId` with
`window_days/ma_period/anomaly_threshold` query params; unknown or
archived KPI → 404; zero measurements → the empty payload
(`trend:null, moving_average:[], anomalies:[]`); with seeded Neo4j
measurements → linear-regression `trend` (slope per **week**),
moving-average series, z-score anomalies. Path guard: as-built
`parseId` (v7-only) → DD-04 widens to any UUID.

**kpi-sla-alignment (FR-04)** — create verifies KPI + target exist
(404s), stores the `ALIGNED_TO` edge, returns `alignment_id =
elementId(r)`; `GET ?target_type&target_id` required else 400, the
`domain` branch lists KPIs by `domain_id` property (not edges) —
pinned; DELETE by elementId, 404 when `deleted === 0`. Post-fix:
weight ∈ [0,1] enforced (AC-06).

**sla-compliance (FR-07)** — `/all`, `/:slaId`, `/domain/:domainId`
compute compliance-rate/risk-score/breach-patterns from Neo4j
`:SLABreach` nodes in the window. Tests seed deterministic breach sets
and assert the counting fields (`breaches.total/open/by_severity`) and
that `compliance_rate ∈ [0,100]`, `risk_score ∈ [0,100]` — the exact
scoring formulas are implementation detail, not contract (kept free to
refactor).

**okr-crud (FR-08)** — creates return the **raw neo4j Node
serialization** (`ok(node)` — `{identity, labels, properties, …}`),
pinned loosely (assert `properties.id` etc., not the wrapper shape);
filtered directive GETs match on `attributes_json CONTAINS $id`
(substring semantics — pinned with a caveat comment); key-result GET
joins via `HAS_KEY_RESULT`; as-built `attributes` in the key-result
list is always `{}` (maps over the Node object, not `.properties` —
as-built defect pinned as-is, flagged for the report); DELETE is
`DETACH DELETE`, returns `{success:true}` even for unknown ids
(pinned). ids already UUIDv7 via `generateId`.

**roll-down (FR-09)** — P0 flows only (Risk 3): KPI
create→get→`/commit` (status `committed`)→`/approve` (status
`approved`); OKR create→get→`/reject`; `GET /contributions` +
`/contributions/:domainId`; table-driven zod rejections: `weight: -1`,
`weight: 101`, missing `domain_assignments`, malformed
`assignment_id`. Product/program variants: covered by the shared
rejection table only (should-level). **As-built exception recorded
(req-review pass-2 C-01):** `handleSlaDomainRollDownPost`
(`roll-down.ts:1311-1320`) is the one handler that already maps
ZodError to 400 — with `details: e.flatten()` and message `"schema
validation failed"`. The §4.2 `parseWith` swap changes that
endpoint's 400 body to the standardized `details.issues[]` shape —
the third sanctioned contract change (DD-01 rule (iii)); the
rejection table includes a `POST /roll-down/sla/domain` malformed-body
row asserting the *new* shape, landing in the same task as the swap.
Resolves: design-review B-02.

### 4.2 ZodError → 400 everywhere (FR-11b, DD-02)

New helper in `api/src/routes/_helpers.ts`:

```ts
import { z } from "zod";
export function parseWith<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new ValidationError("invalid_payload", {
    issues: r.error.issues.map(i => ({ path: i.path.join("."), message: i.message, code: i.code })),
  });
}
```

- All nine route files replace every `schema.parse(body)` with
  `parseWith(schema, body)` and every bare `await req.json()` with the
  existing `readJson(req)` (which already 400s on non-JSON bodies).
  **This includes deleting the one pre-existing try/catch mapper** in
  `handleSlaDomainRollDownPost` (`roll-down.ts:1311-1320`), whose
  `details: e.flatten()` shape is thereby replaced by `issues[]` — a
  sanctioned, pinned contract change, not an accidental one (§2
  pass-2 C-01, §4.1 roll-down, DD-01 rule (iii)). No other handler has
  such a mapper (the `roll-down.ts:1415` catch maps not-found `Error`s
  to 422 and is untouched). Resolves: design-review B-02.
- Backstop in `api/src/router.ts` `route()` catch (a 3-line sanctioned
  touch outside the dispatch blocks, recorded in §4.9): `if (e
  instanceof ZodError)` → same envelope via `error(400,
  "invalid_payload", …)`. This protects future code that calls
  `.parse()` directly.
- Error code stays `invalid_payload` — no `ERROR_CODES` addition, so
  no versioning-policy interaction.

### 4.3 zod conversion of the five hand-rolled files (FR-11a, DD-03)

`kpi-crud`, `sla-crud`, `kpi-sla-alignment` switch their body handling
to `parseWith(<request schema from §3.3>, await readJson(req))`; the
`if (!field)` ladders are deleted. `kpi-trends` and `sla-compliance`
gain **query/path schemas only** (§3.3), replacing the raw
`parseInt/parseFloat` (which as-built yield `NaN` on garbage —
post-fix: 400). Contract-compat rules honored:

- Unknown body keys: zod's default strip mode — accepted and ignored,
  same as-built.
- No enum enforcement where as-built had none (DD-03; candidate
  tightening flagged for the consolidated report).
- The single sanctioned tightening is the FR-04 weight bound.

### 4.4 Detail routes + overload retirement (FR-13, DEC-01) and path-id guard (DD-04)

New handlers `handleKpiGet` / `handleSlaGet` (return the node's flat
properties; 404 unknown — archived KPIs **are** returned by GET-by-id
so archived resources stay inspectable; `archived_at` tells the
caller). Router KPI/SLA blocks become:

```
kpis            POST → create      GET → list (FR-10a)
kpis/:id        GET → resource     PATCH → update
kpis/:id/archive POST → archive
kpis/:id/audit  GET → audit rows (DEC-02 placeholder)
```

The old `POST /kpis/:id` (archive) and `GET /kpis/:id` (audit)
overloads are removed; the subpath regexes are matched **before** the
`:id` regex. `slas` mirrors. Path-id validation on kpi-crud, sla-crud,
kpi-trends, sla-compliance switches from `parseId` (v7-only) to a
local `z.string().uuid()` guard so pre-existing v4 ids remain
addressable (V-01/DD-04); malformed non-UUID ids still 400.

### 4.5 List endpoints (FR-10)

| Endpoint | Handler (new) | Cypher core | Shape |
|----------|--------------|-------------|-------|
| `GET /api/v1/kpis` | `handleKpiList` in `kpi-crud.ts` | `MATCH (k:KPI) WHERE $inclArch OR k.archived_at IS NULL RETURN k ORDER BY k.created_at DESC` | `{rows:[flat props]}` |
| `GET /api/v1/slas` | `handleSlaList` in `sla-crud.ts` | mirror on `:SLA` | `{rows:[…]}` |
| `GET /api/v1/okr-directives` (no filter) | `handleOkrDirectiveList` in `okr-crud.ts` | `MATCH (n:OKRDirective) WHERE NOT n.attributes_json CONTAINS '"domain_id"' RETURN n ORDER BY n.createdAt DESC` — byte-for-byte the predicate `OkrManagement.tsx` runs today | `{rows:[{id,name,description,attributes,createdAt,updatedAt}]}` (mapped, like the filtered GETs) |
| `GET /api/v1/domains` | `handleDomainList` in `domain-crud.ts` (narrow touch) | `MATCH (d:Domain) RETURN d.id AS id, d.name AS name, d.description AS description ORDER BY d.name` | `{rows:[…]}` |

`include_archived` is parsed via the existing `parseQueryBool`
(`_helpers.ts:73-76`, `"true"`/`"1"` only) — the **only** runtime
parser for this param; §3.3's `listQuerySchema` is OpenAPI
documentation, never wired into the handlers (resolves design-review
C-01). The okr-directives predicate is the string-contains form
verbatim — the deliberate bug-compatible choice recorded in §2
(pass-2 C-02); AC-21's fixtures include a decoy directive whose
attribute *value* contains the string `"domain_id"` to pin the
exclusion semantics. Field-name note (design-review N-01):
`:OKRDirective` stores camelCase `createdAt` (graph-core convention);
where requirements FR-10c/AC-21 say "ordered `created_at` DESC" the
property is `n.createdAt` — tasks and test fixtures must use the
camelCase name; there is no snake_case `created_at` on this label.
The unfiltered okr-directives list returns `{rows:[…]}` (enveloped) —
note the *filtered* GETs as-built return a bare array; that asymmetry
is pinned, not harmonized (harmonizing would break `OkrCrud.tsx`).
AC-21 asserts filter params keep dispatching to the as-built handlers.

### 4.6 UUIDv7 ids (FR-14, DD-09)

`kpi-crud`/`sla-crud` drop `crypto.randomUUID()`, `kpi-measurements`/
`sla-breaches` drop `import { v4 } from 'uuid'` — all four use
`generateId()` from `api/src/ids.ts`. The `uuid` + `@types/uuid` deps
**stay** in `api/package.json`: `api/src/ids.ts` itself imports
`{ v7 } from "uuid"` (the FR-14 "if no other consumer remains" clause
resolves to *keep*). AC-01/04/08 assert the version nibble is `7` on
newly created ids.

### 4.7 OpenAPI coverage (FR-12, DD-08)

New module `api/src/routes/openapi-kpi-okr.ts` exporting
`registerKpiOkrPaths(registry: OpenAPIRegistry): void`, which
registers the §3.3 request schemas, the existing read schemas from
`shared/src/schema/kpi-sla.ts`, the exported measurement/breach/okr/
roll-down schemas, and a `registerPath` entry for **every route in the
§5 table**. `api/src/routes/openapi.ts` gains exactly two lines
(import + call inside `getOpenApiDoc()`) — recorded as a sanctioned
narrow touch (§4.9). Responses reference `errorEnvelopeSchema` for
400/404; the audit endpoints document the DEC-02 placeholder row shape
verbatim.

### 4.8 CI: postgres service + migrations + server boot (FR-17/FR-18, DD-10)

`.github/workflows/ci.yml` `integration` job changes:

```yaml
services:
  postgres:
    image: postgres:16-alpine          # matches docker-compose.yml
    env:
      POSTGRES_USER: companygraph
      POSTGRES_PASSWORD: companygraph_ci_password
      POSTGRES_DB: companygraph
    ports: ["5432:5432"]
    options: >-
      --health-cmd "pg_isready -U companygraph"
      --health-interval 5s --health-timeout 3s --health-retries 30
env:
  POSTGRES_URI: postgresql://companygraph:companygraph_ci_password@localhost:5432/companygraph
steps:
  # after bun install:
  - run: cd api && bun run src/storage/postgres/run-migrations.ts   # logs "applied" (AC-19)
  - name: Boot API server
    run: |
      cd api
      (bun run start > "$RUNNER_TEMP/api-server.log" 2>&1 &)
      for i in $(seq 1 60); do
        curl -fsS http://127.0.0.1:8787/api/v1/healthz > /dev/null && break
        sleep 1
      done
      # Hard assert — the wait loop alone exits 0 on timeout. On
      # failure, surface the server log here, not 10 files deep in
      # the test step. Resolves: design-review C-02.
      curl -fsS http://127.0.0.1:8787/api/v1/healthz \
        || { echo "::error::API server failed to boot"; cat "$RUNNER_TEMP/api-server.log"; exit 1; }
  - run: bun run test:integration
```

(`run-migrations.ts` resolves migrations relative to `process.cwd()`,
hence the `cd api`. The server-boot step is V-03 — without it no
HTTP integration test can pass in CI. No `ONELOGIN_ISSUER` is set, so
the router's DEV-ONLY session applies — auth untouched per NFR-05,
but see §4.10/§8 for why that also blinds CI to RBAC-table drift.)

**NFR-01 budget checkpoint (design-review C-02, requirements
Risk 5):** the job adds a postgres service, a migration step, a boot
wait (worst-case 60 s), and ~10 HTTP test files under
`--max-concurrency 1` to a job budgeted < 5 min. The first PR that
turns this job green must record the wall-time in its description;
tasks.md carries this as an explicit checkpoint on the CI task. If
the job exceeds ~4 min, trim in this order: (1) drop the roll-down
should-level product/program rejection rows (Risk 3 names them the
sanctioned cut), (2) collapse the per-file zod rejection tables into
one shared file, (3) reduce the healthz wait ceiling (boot is
observed <5 s locally; 60 s is headroom, not expectation).

### 4.8a Test-process env (FR-18, design-review C-03)

The integration test process needs the same Neo4j/Postgres env the
API server gets, because §3.4 fixtures open a direct `neo4j-driver`
session and import `query()` from `api/src/storage/postgres/client`.
As-built, `scripts/test-integration.sh` runs `bun test` from `api/`
cwd where the only env source is `api/.env` — a **gitignored,
machine-local** file that a fresh clone lacks (and which today omits
`POSTGRES_URI` entirely); `loadEnv()`'s empty-password default then
throws at first `getDriver()`. Mechanism, made explicit:

- `scripts/test-integration.sh` gains three lines before the `exec`,
  run from the repo root prior to `cd api`:

  ```bash
  # Share the API's env with the test process (root .env is the
  # source of truth locally; absent in CI, where the job env applies).
  set -a; [ -f .env ] && . ./.env; set +a
  ```

  Local `bun run dev` stacks therefore satisfy AC-20's double-run
  with zero ceremony; CI is unaffected (`[ -f .env ]` guards the
  missing file, and the job `env:` block already carries `NEO4J_*` +
  `POSTGRES_URI`). The script joins §7 File Changes.
- Test files themselves stay env-loading-free: fixtures call the
  production `getDriver()` singleton (as `neo4j-bootstrap.integration.test.ts`
  already does) and the production `query()` — one env path, no
  test-only config drift.

Test self-provisioning (FR-18): each new Postgres-backed test file's
`beforeAll` awaits `runMigrations()` (idempotent via
`schema_migrations`) so local runs against a fresh Postgres work
without `bun run dev` ceremony. Isolation: every fixture id is a fresh
UUIDv7; every `describe` cleans up its Neo4j nodes/edges (direct
driver `DETACH DELETE` by seeded id) and Postgres rows (`DELETE …
WHERE id = ANY($1)`) in `afterAll` — AC-20's double-run requirement.

### 4.9 Co-owned files: owned sections + merge rule (requirements C-04, DD-11)

**`api/src/router.ts` — owned dispatch blocks** (comment-anchor
granularity; each is a contiguous `// <anchor>` section in
`dispatchInternal`):

| # | Anchor comment | Change here |
|---|----------------|-------------|
| 1 | `// Roll-down routes` | none (pinned) |
| 2 | `// KPI CRUD routes (KPI-SLA-02)` | FR-10a list + FR-13 subpaths/retirement |
| 3 | `// SLA CRUD routes (KPI-SLA-03)` | FR-10b + FR-13 mirror |
| 4 | `// KPI alignment routes (KPI-SLA-04)` | none |
| 5 | `// OKR Directive routes` | FR-10c unfiltered-list fallthrough |
| 6 | `// Key Result routes` | none |
| 7 | `// OKR Performance route` | none |
| 8 | `// SLA alignment routes (KPI-SLA-04)` | none |
| 9 | `// KPI measurement routes (KPI-SLA-05)` | none |
| 10 | `// SLA breach routes (KPI-SLA-06)` | none |
| 11 | `// KPI trend analysis routes (KPI-SLA-07)` | none |
| 12 | `// SLA compliance reporting routes (KPI-SLA-08)` | none |

Sanctioned touches **outside** those blocks (each ≤ 4 lines, additive):
(a) one dispatch line `if (sub === "domains" && method === "GET") return handleDomainList(req);`
inside the `// Domain CRUD routes (US-DM-05)` block (FR-10d — that
block otherwise stays `_baseline`-owned); (b) the `ZodError` branch in
`route()`'s catch (§4.2); (c) import-list additions for the new
handlers.

**Merge rule:** this spec never edits any other section of
`router.ts`. `model-workspace-core` and `system-augmentation-model`
add their own sections; conflicts resolve by **section ownership**
(re-apply each spec's own sections), never last-writer-wins. The same
rule covers the other shared files: `domain-crud.ts` (only
`handleDomainList` + its export), `openapi.ts` (only the two-line
hook), `pwa/src/api.ts` (only the added client methods in §6), and
`api/src/auth/rbac-permissions.ts` (only the `── KPIs ──`,
`── SLAs ──`, and `── Domains ──` comment sections of
`ROUTE_PERMISSIONS`, per §4.10 — the file is otherwise
`_baseline`-owned; `getRoutePermission`/`matchSegments` logic is
untouched).

### 4.10 RBAC route-permission table (DD-12, resolves design-review B-01)

`getRoutePermission` (`rbac-permissions.ts:288-299`) returns `null`
for any unmatched `(method, segments)` pair, and the router gate then
requires only authentication, not a permission (`router.ts:341-353`).
Every §5 route-surface change therefore lands with a matching
`ROUTE_PERMISSIONS` edit **in the same task** (T-mapping in tasks.md),
or `POST /kpis/:id/archive` — a destructive write — would be
reachable by any authenticated session without `kpi:write` in
issuer-configured mode, and the new list endpoints would bypass
`kpi:read`/`sla:read`/`domain:read`.

Entries **added** (permission names follow the file's existing
resource conventions):

| Section | Entry | Guards |
|---------|-------|--------|
| `── KPIs ──` | `P("GET", "kpis", "kpi:read")` | FR-10a list |
| `── KPIs ──` | `P("POST", "kpis/:id/archive", "kpi:write")` | FR-13 archive subpath |
| `── KPIs ──` | `P("GET", "kpis/:id/audit", "kpi:read")` | FR-13 audit subpath |
| `── SLAs ──` | `P("GET", "slas", "sla:read")` | FR-10b list |
| `── SLAs ──` | `P("POST", "slas/:id/archive", "sla:write")` | FR-13 mirror |
| `── SLAs ──` | `P("GET", "slas/:id/audit", "sla:read")` | FR-13 mirror |
| `── Domains ──` | `P("GET", "domains", "domain:read")` | FR-10d list |

Entries **removed** (stale after DEC-01): `P("POST", "kpis/:id",
"kpi:write")` and `P("POST", "slas/:id", "sla:write")` — they pointed
at the retired archive overloads; leaving them would silently grant a
permission mapping to a 404 route and mask future dispatch mistakes.
Entries **unchanged but re-pointed semantically**: `P("GET",
"kpis/:id", "kpi:read")` / `P("GET", "slas/:id", "sla:read")` now
guard the new detail GET instead of the retired audit overload — same
pattern, same permission, no edit needed. Already covered, no edit:
the unfiltered `GET /okr-directives` (FR-10c) matches the existing
`P("GET", "okr-directives", "okr:read")`. `matchSegments` requires
equal segment counts, so the new 3-segment `archive`/`audit` patterns
can never be shadowed by (or shadow) the 2-segment `:id` patterns —
in-section ordering is safe either way; the file's specific-first
convention is kept.

**Verification:** CI and local integration runs execute with
`ONELOGIN_ISSUER` unset (dev-fallback session), so no integration
test can observe a missing permission mapping. The table edit is
verified by a **unit** test instead —
`api/__tests__/rbac-route-permissions.test.ts` calls
`getRoutePermission` directly (pure function, no auth stack) and
asserts: each §5 new/changed route returns its §4.10 permission
(never `null`), and the two retired-overload patterns now resolve the
way the live table says (`POST /api/v1/kpis/:id` → `null`). Runs in
the `unit` CI job.

## 5. HTTP API surface

All routes under `/api/v1/`, auth via the central router gate
(NFR-05) — with every new/changed row mirrored in `ROUTE_PERMISSIONS`
per §4.10, since the gate only enforces permissions for routes the
table knows (design-review B-01). **Bold** = new/changed in this
spec; everything else is pinned as-built. Envelope errors per
`_helpers.error`.

| Method | Route | FR | Request → Response |
|--------|-------|----|--------------------|
| POST | `/kpis` | FR-01 | `kpiCreateRequestSchema` → 200 flat KPI (id now UUIDv7) |
| **GET** | **`/kpis`** | FR-10a | `?include_archived` → 200 `{rows:[KPI]}` ordered `created_at` DESC |
| **GET** | **`/kpis/:id`** | FR-13 | → 200 flat KPI (archived included) \| 404 |
| PATCH | `/kpis/:id` | FR-01 | `kpiPatchRequestSchema` → 200 \| 404 (missing/archived) |
| **POST** | **`/kpis/:id/archive`** | FR-13 | → 200 \| 404 (was `POST /kpis/:id`, retired per DEC-01) |
| **GET** | **`/kpis/:id/audit`** | FR-13 | → 200 `{rows:[placeholder]}` (DEC-02) \| 404 (was `GET /kpis/:id`) |
| POST | `/slas` | FR-05 | `slaCreateRequestSchema` → 200 flat SLA (id now UUIDv7) |
| **GET** | **`/slas`** | FR-10b | `?include_archived` → 200 `{rows:[SLA]}` ordered `created_at` DESC |
| **GET** | **`/slas/:id`** | FR-13 | → 200 flat SLA (archived included) \| 404 |
| PATCH | `/slas/:id` | FR-05 | `slaPatchRequestSchema` → 200 \| 404 (missing/archived) |
| **POST** | **`/slas/:id/archive`** | FR-13 | → 200 \| 404 (was `POST /slas/:id`, retired per DEC-01) |
| **GET** | **`/slas/:id/audit`** | FR-13 | → 200 `{rows:[placeholder]}` (DEC-02) \| 404 (was `GET /slas/:id`) |
| POST | `/kpi-measurements` | FR-02 | body schema → **201** row (Postgres) |
| GET | `/kpi-measurements?kpi_id=&limit=&offset=` | FR-02 | → 200 `{rows}` (`value` parsed to number) |
| GET / DELETE | `/kpi-measurements/:id` | FR-02 | → 200 row / `{deleted:true}` \| 404 |
| POST | `/sla-breaches` | FR-06 | body schema (severity enum) → **201** row, status `open` |
| GET | `/sla-breaches?sla_id=&resolution_status=` | FR-06 | → 200 `{rows}` |
| GET / PATCH / DELETE | `/sla-breaches/:id` | FR-06 | PATCH partial resolution → 200 \| 400 empty \| 404 |
| GET | `/kpi-trends/:kpiId?window_days=&ma_period=&anomaly_threshold=` | FR-03 | → 200 trend payload \| 404 (reads Neo4j, V-02) |
| POST / GET | `/kpi-alignments` | FR-04 | create (weight **[0,1] enforced**) / list by `target_type`+`target_id` |
| DELETE | `/kpi-alignments/:id` | FR-04 | elementId → `{deleted:true}` \| 404 |
| POST / GET / DELETE | `/sla-alignments…` | FR-04 | mirror (`journey\|activity` only) |
| GET | `/sla-compliance/all`, `/sla-compliance/:slaId`, `/sla-compliance/domain/:domainId` | FR-07 | → 200 compliance payloads (reads Neo4j, V-02) |
| POST | `/okr-directives` | FR-08 | schema → 200 raw Node (pinned) |
| **GET** | **`/okr-directives`** (no params) | FR-10c | → 200 `{rows:[mapped]}` top-level only (was 404) |
| GET | `/okr-directives?domain_id=` / `?product_id=` | FR-08 | → 200 bare array (as-built asymmetry pinned) |
| PATCH / DELETE | `/okr-directives/:id` | FR-08 | → 200 \| `{success:true}` |
| POST / GET / PATCH / DELETE | `/key-results…` (`?directive_id=`) | FR-08 | as-built |
| GET | `/okr-performance?domain_id=` | FR-08 | → 200 rows |
| POST/GET | `/roll-down/kpi`, `/roll-down/okr` (+ `/product`, `/program`, `/sla/domain` variants, GET-by-id forms) | FR-09 | as-built (V-04 shadow documented); **`POST /roll-down/sla/domain` 400 `details` standardized to `issues[]`** (§4.2, DD-01 (iii)) |
| POST | `/roll-down/commit`, `/adjustment`, `/approve`, `/reject`, `/notify` | FR-09 | as-built lifecycle |
| GET | `/roll-down/contributions[/:domainId]` | FR-09 | as-built |
| **GET** | **`/domains`** | FR-10d | → 200 `{rows:[{id,name,description}]}` ordered by `name` |

Every row above appears in `GET /openapi.json` after FR-12 (AC-13
enumerates the path list with `{param}` placeholders).

## 6. UI design

- **View tree placement** (blueprint round-4, verbatim — existing
  views, no new routes, no nav changes): `#/exec/kpi-management` →
  `KpiManagement` (`ExecKpiManagement`), `#/exec/okr-management` →
  `OkrManagement` (`ExecOkrManagement`), both already registered in
  `pwa/src/route.ts` under the Exec subnav (ids `kpi-management`,
  `okr-management` — untouched).

- **Data layer (FR-15).** The three `api.cypher(…)` calls are replaced
  by three new typed client methods added to `pwa/src/api.ts`
  (sanctioned narrow touch, §4.9):
  `api.kpi.list()` → `GET /api/v1/kpis`;
  `api.domains.list()` → `GET /api/v1/domains`;
  `api.okr.listDirectives()` → unfiltered `GET /api/v1/okr-directives`.
  Rows now expose `created_at` (KPI) / `createdAt` (OKR mapped shape) —
  the view interfaces are corrected accordingly, fixing the as-built
  `createdAt`-on-snake_case-node mismatch. Existing write-path client
  methods are reused, not duplicated: `api.kpi.create`,
  `api.kpi.createAlignment`, `api.okr.createDirective` (all REST
  already).

- **Component plan** (catalog first, UX-02): `ViewHeader`, `Loading`,
  `ErrorState` from `views/_shared`; `Card`, `Pill`, `Button`,
  `Modal`, `DataTable` from `pwa/src/components/`. The raw
  utility-class `<button>`/`<table>` markup (dead Tailwind-style
  classes — no Tailwind in the PWA) is replaced by catalog `Button` +
  `DataTable`; tab rows become a `role="tablist"` of `Button`s with
  `aria-selected` and an `aria-label` ("KPI management sections" /
  "OKR management sections") satisfying the AC-17 labeled-tab-group
  landmark. No new component is invented. `OkrManagement` keeps
  `OkrPerformanceBoard` on the performance tab and drops its unused
  `OkrCrud` import. The "+ Create KPI" / "+ Create OKR Cycle" buttons
  open a catalog `Modal` form posting through `api.kpi.create` /
  `api.okr.createDirective`, then reload the list (write paths per
  FR-15; the as-built dangling `showCreateModal` state finally renders
  something). Edit/assignment affordances keep their as-built depth.

- **States (UX-01, AC-14/AC-15):** per view —
  *loading*: `<Loading what="…" />` (as-built, kept);
  *error*: `<ErrorState message=… />` on any list-fetch failure
  (existing `error-scenarios` tests keep passing);
  *empty*: new `data-testid="empty-state"` Card ("No KPIs defined yet —
  create the first one" / "No OKR cycles yet") with the create Button
  inline, rendered when the ready list is length 0 (as-built rendered a
  bare table header — non-distinct, fails AC-15);
  *ready*: DataTable of rows.

- **Tokens (UX-02):** all styling moves to two new CSS modules
  (`KpiManagement.module.css`, `OkrManagement.module.css`) using
  `var(--…)` tokens only; zero hex/rgba/oklch literals so
  `bun scripts/design-conformance.ts --view pwa/src/views/exec/KpiManagement.tsx`
  (and OkrManagement) exits 0 (AC-16).

- **Input modes / a11y (UX-03 n/a, UX-05, AC-17/AC-18):** standard
  form/list UI, keyboard + mouse only per the requirements Platforms
  table; no gesture/canvas work, Native Conflicts row is `(none)`.
  Focus order: header → tablist → primary action → table/list (DOM
  order, no tabindex tricks); catalog `Button` supplies the visible
  focus ring; `Modal` supplies the focus trap. Each view renders its
  content inside the app shell's `<main>`; if execution finds the
  shell lacks a `main` landmark, the two owned views wrap their own
  content in `<main>` (verified in AC-17's manual pass). Hash routes
  already survive reload via the router (AC-18 verifies, no code
  expected).

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/kpi-sla.ts` | modify | FR-11a, FR-12 | §3.3 request/query schemas appended; read schemas untouched |
| `api/src/routes/_helpers.ts` | modify | FR-11b | `parseWith` helper (§4.2) |
| `api/src/routes/kpi-crud.ts` | modify | FR-01, FR-10a, FR-11a, FR-13, FR-14 | zod, list, detail/archive/audit split, `generateId`, DD-04 guard |
| `api/src/routes/sla-crud.ts` | modify | FR-05, FR-10b, FR-11a, FR-13, FR-14 | mirror |
| `api/src/routes/kpi-measurements.ts` | modify | FR-02, FR-11b, FR-14 | `parseWith`, `generateId`, export schemas |
| `api/src/routes/sla-breaches.ts` | modify | FR-06, FR-11b, FR-14 | same |
| `api/src/routes/kpi-trends.ts` | modify | FR-03, FR-11a | query schema, DD-04 guard |
| `api/src/routes/kpi-sla-alignment.ts` | modify | FR-04, FR-11a | §3.3 schemas incl. weight bound |
| `api/src/routes/sla-compliance.ts` | modify | FR-07, FR-11a | query schema, DD-04 guard |
| `api/src/routes/okr-crud.ts` | modify | FR-08, FR-10c, FR-11b | `handleOkrDirectiveList`, `parseWith`, export schemas |
| `api/src/routes/roll-down.ts` | modify | FR-09, FR-11b | `parseWith` swap (incl. deleting the `:1311-1320` flatten mapper, §4.2), export schemas |
| `api/src/auth/rbac-permissions.ts` | modify (narrow, §4.10) | FR-10, FR-13, NFR-05 | add 7 entries, remove 2 stale overload entries (B-01) |
| `api/src/routes/domain-crud.ts` | modify (narrow) | FR-10d | `handleDomainList` only (§4.9) |
| `api/src/router.ts` | modify (owned blocks §4.9) | FR-10, FR-11b, FR-13 | dispatch changes + ZodError backstop |
| `api/src/routes/openapi-kpi-okr.ts` | new | FR-12 | `registerKpiOkrPaths` (§4.7) |
| `api/src/routes/openapi.ts` | modify (narrow) | FR-12 | two-line hook |
| `.github/workflows/ci.yml` | modify | FR-17 | postgres service, migrations, server boot with hard healthz assert + log capture (§4.8) |
| `scripts/test-integration.sh` | modify | FR-18 | source root `.env` for the test process (§4.8a, C-03) |
| `api/__tests__/rbac-route-permissions.test.ts` | new | NFR-05 (§4.10) | unit test of `getRoutePermission` over the new/retired routes |
| `api/__tests__/kpi-crud.integration.test.ts` | new | FR-01/10/13/14 | AC-01/02/03/12/21(domains) |
| `api/__tests__/sla-crud.integration.test.ts` | new | FR-05/10/13 | AC-02/07/12 |
| `api/__tests__/kpi-measurements.integration.test.ts` | new | FR-02/14/18 | AC-04/12 |
| `api/__tests__/sla-breaches.integration.test.ts` | new | FR-06/14/18 | AC-08/12 |
| `api/__tests__/kpi-trends.integration.test.ts` | new | FR-03 | AC-05 |
| `api/__tests__/kpi-sla-alignment.integration.test.ts` | new | FR-04 | AC-06/12 |
| `api/__tests__/sla-compliance.integration.test.ts` | new | FR-07 | AC-09 |
| `api/__tests__/okr-crud.integration.test.ts` | new | FR-08/10c | AC-10/12/21 |
| `api/__tests__/roll-down.integration.test.ts` | new | FR-09 | AC-11/12 |
| `api/__tests__/openapi.integration.test.ts` | modify | FR-12 | AC-13 path enumeration appended |
| `pwa/src/api.ts` | modify (narrow) | FR-15 | `kpi.list`, `domains.list`, `okr.listDirectives` (§4.9) |
| `pwa/src/views/exec/KpiManagement.tsx` | modify | FR-15, FR-16, UX-01/02/05 | §6 |
| `pwa/src/views/exec/KpiManagement.module.css` | new | FR-16, UX-02 | tokens-only styles |
| `pwa/src/views/exec/OkrManagement.tsx` | modify | FR-15, FR-16, UX-01/02/05 | §6 |
| `pwa/src/views/exec/OkrManagement.module.css` | new | FR-16, UX-02 | tokens-only styles |
| `pwa/src/__tests__/exec-kpi-management.test.tsx` | new | FR-15/16 | AC-14/15 |
| `pwa/src/__tests__/exec-okr-management.test.tsx` | new | FR-15/16 | AC-14/15 |

Not changed, deliberately: `api/package.json` (`uuid` stays — §4.6),
Postgres migrations (tables as-built), `pwa/src/route.ts` (routes
exist), `pwa/src/components/KpiCrud.tsx` (its internal `api.cypher`
call is component-level, outside the FR-15 view mandate — flagged for
the consolidated report), RollDown/RollDownAnalytics views
(out of scope per requirements).

## 8. Test strategy

**Integration (`api/__tests__/*.integration.test.ts`, run via
`bun run test:integration`, name-prefixed `integration:` per
`scripts/test-integration.sh`, HTTP against `127.0.0.1:8787` +
direct driver/pg fixture access per §3.4/§4.8):**

- AC-01/02/03/12/21d — `kpi-crud.integration.test.ts` (lifecycle, list ordering + `include_archived`, detail/archive/audit subpaths + retired-overload 404s, zod envelope, UUIDv7 nibble, `GET /domains` shape).
- AC-02/07/12 — `sla-crud.integration.test.ts` (mirror).
- AC-04/12 — `kpi-measurements.integration.test.ts` (Postgres row assert via `client.query`, filters, 400 envelope, v7 id, `beforeAll runMigrations()`).
- AC-08/12 — `sla-breaches.integration.test.ts` (enum enforcement, resolution PATCH, Postgres row assert).
- AC-05 — `kpi-trends.integration.test.ts` (Neo4j-seeded measurements → trend/MA/anomalies; empty payload; 404).
- AC-06/12 — `kpi-sla-alignment.integration.test.ts` (create/list/delete both mirrors; weight −0.1/1.1 → 400; bad `target_type` → 400).
- AC-09 — `sla-compliance.integration.test.ts` (seeded breach sets → counting fields, all three endpoints).
- AC-10/12/21c — `okr-crud.integration.test.ts` (directive + key-result CRUD, filters, unfiltered list excludes `domain_id` directives + ordering, `okr-performance`).
- AC-11/12 — `roll-down.integration.test.ts` (P0 flows + rejection table incl. the `POST /roll-down/sla/domain` `issues[]` details-shape pin, §4.1/§4.2).
- AC-13 — `openapi.integration.test.ts` extension (required-path array from §5).

All integration files follow the `nodes-crud.integration.test.ts`
conventions: fresh UUIDv7 fixtures, paired cleanup, order-independent
(AC-20 is the double-run of the whole suite).

**jsdom (vitest, `pwa/src/__tests__/`):** AC-14/AC-15 —
`exec-kpi-management.test.tsx` + `exec-okr-management.test.tsx` mock
`fetch` for `/api/v1/kpis`, `/api/v1/domains`, `/api/v1/okr-directives`;
assert loading → ready rows (dates from `created_at`), zero
`api.cypher` traffic (spy asserts no `/query/cypher` request), empty
state testid on `{rows:[]}`, error state on 500. Existing
`error-scenarios/exec/{kpi-management,okr-management}` suites must
stay green. Accuracy note (design-review N-03): the kpi-management
scenario already stubs `/api/v1/kpis` — written for exactly this
migration; the okr-management scenario stubs `/api/v1/okrs` +
`/query/cypher` with a soft either/or assertion and a `{rows:[]}`
fallback — it stays green by leniency, not by design, so the new
`exec-okr-management.test.tsx` carries the strict assertions for
that view.

**Manual with repro (from requirements):** AC-16 (design-conformance
CLI, exit 0), AC-17 (keyboard walk + devtools a11y pane, both views),
AC-18 (deep-link reload), AC-19 (CI run inspection: postgres service
healthy, "applied" migration logs, Postgres-backed tests pass),
AC-20 (double `bun test:integration` run).

**Unit:** one new file — `api/__tests__/rbac-route-permissions.test.ts`
(§4.10). Both CI and local integration runs execute with
`ONELOGIN_ISSUER` unset, so the dev-fallback session applies and **no
integration test can observe a missing `ROUTE_PERMISSIONS` entry**;
the RBAC-table edit is therefore verified at the unit level by
calling `getRoutePermission` directly against every §5 new/changed
route (and asserting the retired overload patterns no longer map).
Resolves: design-review B-01 (verification clause). Otherwise no new
unit tests — this surface's logic is I/O-bound; the shared request
schemas are exercised through the integration rejection tables
(cheaper than duplicating fixtures).

## 9. Rejected alternatives

- **Central ZodError mapping only in `router.ts`** (no `parseWith`) —
  rejected: leaves the envelope's `details.issues` shape implicit,
  and makes the fix invisible in the nine owned files; the helper
  keeps validation failures on the existing `ValidationError` channel
  the router already maps. The router branch stays as backstop only.
- **`parseWith` emitting a `flatten()`-compatible `details` shape**
  (design-review B-02 option (b)) — rejected: it would freeze the
  whole surface's new 400 contract on the accidental shape of one
  never-published endpoint (`roll-down.ts:1311-1320`), and
  `flatten()` loses the per-issue `path`/`code` that make the
  `issues[]` shape actionable. Standardizing on `issues[]` and
  pinning the one endpoint's change as a third sanctioned contract
  break (DD-01 (iii)) keeps the accounting honest.
- **Parse-based top-level predicate for FR-10c** (req-review pass-2
  C-02's own recommendation) — rejected in §2/§4.5: FR-15 swaps the
  view's transport, and the requirement's promise is "same rows over
  REST"; parsing `attributes_json` would silently change which
  directives the exec view shows — a behavior change outside
  FR-10…FR-14. The string-contains quirk is pinned by an AC-21 decoy
  fixture and flagged for the consolidated report as a
  future-tightening candidate.
- **Enforcing the shared read-schema enums on KPI/SLA create** —
  rejected (DD-03): silent tightening vs the as-built contract
  (requirements Risk 4); flagged as future-spec candidate instead.
- **Reusing `GET /api/v1/query/listDomains` for the KpiManagement
  dropdown instead of FR-10d** — rejected: it orders by `d.id`, caps
  at 1001 via the passthrough, and lives in the query namespace;
  FR-10d is an approved requirement with a name-ordered,
  resource-shaped contract the views and downstream specs
  (`kpi-okr-performance-dashboards`) can rely on.
- **Fixing the trends/compliance split-brain (V-02) by reading
  Postgres** — rejected: a behavior change outside FR-10…FR-14;
  documented + flagged (DD-05) so `kpi-okr-performance-dashboards`
  can decide with eyes open.
- **Deprecation aliases for the retired `POST|GET /kpis/:id`
  overloads** — rejected per DEC-01 (never published, no in-repo
  consumer; aliases would perpetuate the router/handler mismatch).
- **Registering OpenAPI paths inline in `openapi.ts`** — rejected:
  ~40 path registrations would swell a `_baseline`-owned file and
  invite co-ownership conflicts; the two-line hook + owned module
  keeps the §4.9 merge rule clean.
- **Exhaustive roll-down endpoint coverage** — rejected per
  requirements Risk 3 / FR-09 (P0 floor is `must`, variants `should`);
  the shared zod-rejection table gives breadth cheaply.
