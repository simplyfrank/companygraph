---
feature: "funnel-pipeline-modeling"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 3
reviewing_requirements_revision: 3
reviewing_design_revision: 2
size: "large"
total_tasks: 14
---

# Tasks: funnel-pipeline-modeling

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Deferred-green rule**: the registry-ensure, node/edge CRUD, transition-route,
  read, and generic-CRUD-round-trip tasks (T-01…T-07, T-14) drive the loopback API
  on `127.0.0.1:8787`, so their **integration** tests need a running API + Neo4j.
  At each such task's checkpoint
  run `bun run typecheck`; the full `*.integration.test.ts` files run green under
  `bun test:integration` once the stack is up (`bun run dev`). The PWA slice
  (T-08…T-11) runs under `bun test` (component/unit); AC-20 is a Playwright e2e
  needing the full stack + a seeded funnel fixture.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The completion
  hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md updates without
  one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` run `bun run scripts/design-conformance.ts --view <file>` for
  **every** file the task touches under `pwa/src/views/` — each `.tsx` and each
  `.module.css` gets its own invocation.
- **Ownership guard (XD-02/XD-05/NFR-01/NFR-02)**: the files under "Explicitly NOT
  edited" in design §9 are off-limits — `shared/src/schema/{nodes,edges}.ts`,
  `api/src/routes/{edges,nodes,query}.ts`, `api/src/storage/edges.ts`,
  `api/src/routes/ontology-{node-labels,edge-types}.ts`, `api/src/ontology/**`,
  `api/src/errors.ts`, `api/scripts/seed-saas-operator.ts`, `pwa/src/route.ts`,
  the `SURFACES` list, and every **sibling** `VIEWS` entry
  (`metrics`/`benchmarks`/`operator`). **No task edits them.**
  `pwa/src/views/index.tsx` is edited **only** for this feature's single
  `funnels:` `VIEWS` line + its `FunnelBoard` import (XD-05 view seam).
  Two files are **additive-only** exceptions per Deviation D-1 (below):
  `api/src/router.ts` (one dispatch line) and `api/src/auth/rbac-permissions.ts`
  (one `P(...)` mapping line reusing the existing `edge:write` permission).

## Design-basis pins (design rev 1 approved)

Design rev 1 is `approved` (`review-design.md` pass 1 = **approve**, zero
blockers). The binding decisions the implementer must not re-derive:

| Design decision (rev 1) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **Rule A / NFR-01 — registry, never compile-time schema** (§3, §11): `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` are runtime-registry constructs only; **zero** edit to `shared/src/schema/{nodes,edges}.ts`. | No compile-time `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` entry. | T-01, T-02, T-12 |
| **Rule B / B-03 — idempotency = get-then-create guard** (§2, §4.1; requirements rev-3 FR-06a): the public registry-create routes are strict-CREATE (`409 name_conflict` on a duplicate — verified `node-labels.ts:191-193`, `edge-types.ts:206,240`), and this spec adds nothing to the compile-time tuples the seed-loader MERGE covers. `ensureFunnelOntology` therefore **`GET`s each construct by name first and `POST`s only on `404`**; a `200` skips the create (verified no-op). A defensive `409 name_conflict` on the `POST` (get→post race) is also tolerated. Any other non-2xx throws. AC-01 is "the routine run twice leaves exactly one `Funnel` label and errors nothing" — asserting the **routine's** idempotency, not that the strict-CREATE route is itself a no-op. Mirrors `ensureOperatorRoot` (`ensure-operator-root.ts:48`). | Idempotency is the get-then-create guard in the routine, not a bare-POST no-op nor route-level. | T-01 |
| **C-05 — `stageOrder` is a required integer** (§3.2): the `Stage` `json_schema_doc` is `{type:"object", required:["stageOrder"], properties:{stageOrder:{type:"integer"}}, additionalProperties:true}`. Verified: `jsonSchemaDocSchema` accepts `required` (`ontology.ts:71`) and `attribute-zod.ts` compiles it, so a missing/non-integer `stageOrder` fails `400 attribute_violation` at the generic node route. | `required:["stageOrder"]` + integer type in the registered doc. | T-01, T-03 |
| **C-06 — listing scope via a `Funnel.attributes.modelId` marker** (§3.1, §4.5): a `Funnel` carries an optional top-level `modelId` string (the operator root id) set at create time; the listing filters on it. **No** graph attachment edge, **no** new `PART_OF Funnel→Domain` endpoint pair. The `CONTAINS $rootIdNeedle` Cypher is a coarse prefilter; the **authoritative** exclusion is the client-side parse of each row's `attributes_json` (review C-01). | Listing scope = `modelId` marker + client-parse authority. | T-05, T-08, T-10 |
| **Rule C — range check on a funnel-owned seam, delegate to `createEdge`** (§3.4, §4.4): the `[0,1]` range validation lives in a **new** `api/src/routes/funnels.ts`; it never edits `api/src/routes/edges.ts` / `api/src/storage/edges.ts` / `shared/src/schema/edges.ts`. It reads-imports `createEdge` and folds the two rates into the edge `attributes` before delegating. | Range check in the funnel route; delegate to graph-core `createEdge`. | T-04 |
| **D-1 — the new route needs two additive framework wirings** (§2.1, §5, §7): (1) one dispatch line in `api/src/router.ts` (`if (sub === "funnels/transitions" && method === "POST") return handleFunnelTransitionPost(req);` — the router is a hardcoded `if`-chain, no dynamic seam), and (2) one `P("POST","funnels/transitions","edge:write")` mapping in `api/src/auth/rbac-permissions.ts` (an unmapped route returns `null` permission and passes the gate on **any** authenticated session — a security regression). Both are **additive**; **no new permission string** (reuses `edge:write`, `rbac-permissions.ts:57`). Requirements AC-21 as-written forbade both files; the D-1 errata **widens** the AC-21 diff allow-list to permit exactly these two additive lines. | AC-21 boundary uses the **widened** allow-list (permits the two D-1 lines; still forbids schema-array / graph-core-edge / PWA-`route.ts` / new-permission edits). | T-04, T-06, T-11 |
| **FR-11 — strict linear chain, `n/a` degradation** (§4.6, OQ-2): overall funnel conversion = the **product** of per-transition `conversionRate`s along the ordered `Stage` chain. Zero-stage → empty state; one-stage (no transition) → `"n/a"`; a **branch** (a stage with >1 outgoing `CONVERTS_TO`) → per-transition rates render but overall conversion renders the literal `"n/a"` (no multi-path/tree rendering for the `must`). | Linear chain; branch/one-stage → literal `"n/a"`, never undefined/crash. | T-07, T-09 |
| **OQ-3 — keyboard reorder = explicit move-up/down buttons, no arrow capture** (§6.5): reorder is available via pointer drag (pointer events + `setPointerCapture`, not HTML5 DnD) **and** per-card move-up/move-down `<button>`s; no arrow-key capture, so the Native Conflicts arrow-key row is not needed (C-03). | Buttons, not arrow keys; both reorder paths PATCH `stageOrder`. | T-08 |
| **OQ-4 `must` — deep link + active-model survive reload; in-view selection resets to the picker** (§6.1): the route and active-model context survive reload; the in-view funnel selection does not (resets to the picker). | Reload behavior is exactly this; no funnel-id persistence for the `must`. | T-11 |

Full rationale: design §2 (prior-review resolution), §2.1 (Deviation D-1), §3.1–§3.4,
§4.1–§4.6, §5, §6.1–§6.8, §7, and `review-design.md` (C-01…C-04, N-01…N-03).

## Open design concerns — pinned decisions (from review-design.md)

Design review pass 1 (`approve`) left four Concerns and three Nits for the tasks
author to pin. All are landed below; none reopens the architecture.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| **C-01** — the FR-09 listing `CONTAINS $rootIdNeedle` Cypher can false-positive/negative, so the *authoritative* exclusion must be asserted where it actually lives (the client parse), not solely on the `CONTAINS` Cypher | **AC-10 is verified in two places**: the integration test (T-05/T-10) asserts the *Cypher prefilter* returns the operator funnel and carries a `stageCount`; the **authoritative exclusion** (a retail funnel with a different/absent `modelId` is dropped) is asserted in the **PWA** test `funnel-board-states.test.tsx` (T-09) where the client-side `modelId === operatorRootId` filter actually runs. The integration test additionally asserts a parse-level exclusion (a stub retail `Funnel` is excluded after parsing `modelId`), not `CONTAINS` alone. | The authority is the client parse; assert it where it lives so a `CONTAINS` false-positive can't pass unnoticed. | T-08, T-09, T-10 |
| **C-02** — the listing `CONTAINS` scan is unindexed and NFR-06's ≤50 ms p99 bounds only the single-funnel *composition* read, not the listing | **The listing has no perf bound**: `Funnel` cardinality is O(funnels) and small at wave-2 scale (marketing + sales funnels only). Documented as an accepted note; the design-only `query:read` funnel-route fallback is the escape hatch **if** profiling ever shows otherwise (not built). No test asserts a listing latency bound. | Tiny cardinality; premature to index/bound. | T-05, T-10 |
| **C-03** — D-1 widens AC-21's git-diff boundary to permit `api/src/router.ts` + `api/src/auth/rbac-permissions.ts`, which requirements AC-21 as-written lists as forbidden | **The tasks-phase AC-21 verification uses the WIDENED diff allow-list** (design §8/§9): it *permits* exactly the two additive D-1 lines while still forbidding schema-array, graph-core-edge/node/query, PWA-`route.ts`/`SURFACES`, and **new-permission-string** edits. Orchestrator note: land the D-1 errata against requirements AC-21 before execution (the two edits are genuinely necessary and additive — the router gate lets a null-permission route through on any authenticated session). | The two edits are a security necessity, not scope creep; pin the widened boundary so the AC-21 check doesn't fail on a legitimate additive line. | T-04, T-06, T-11 |
| **C-04** — the design assumes `saas-operator-foundation` has pre-registered a `business` surface + a `funnels` `BusinessTabPlaceholder` entry in `views/index.tsx`, which does not exist in the current file (foundation is an unbuilt wave-1a dep) | **Build-time precondition (T-08)**: before `FunnelBoard` replaces the placeholder, confirm the `funnels` `BusinessTabPlaceholder` entry exists in `views/index.tsx` in the shape the diff assumes (a `business`-surface `funnels:` key). If foundation registered it under a different shape, re-check the "one import + one map line" claim at build time. This is a dependency-ordering guard, not a design change. | Foundation must land first (wave 1a barrier); the view-seam diff is only valid once the placeholder exists. | T-10 |
| **N-01** (nit) — the client derivation must *detect* a branch (a stage with >1 outgoing `CONVERTS_TO`) to emit `"n/a"` rather than silently multiplying one arbitrary path | AC-11's PWA test `funnel-board-analytics.test.tsx` includes a **branch case** (a stage with two outgoing `CONVERTS_TO`) asserting overall conversion renders the literal `"n/a"`, alongside the linear `0.5×0.4=0.20` and single-stage `"n/a"` cases. | Makes the branch degradation observable, not implicit. | T-07, T-09 |
| **N-02** (nit) — `invalid_payload` is listed as a route error member but the flow only throws `attribute_violation`/`edge_endpoint_label_mismatch`/`id_conflict` | No action beyond awareness: `readJson` may surface `invalid_payload` generically for a malformed body; it is an existing closed `ERROR_CODES` member, not a new one. `api/src/errors.ts` is untouched. | Harmless; documented so a reader doesn't add an error code. | T-04 |
| **N-03** (nit) — the `uuidv7` import citation (`nodes.ts:26`) checks out | No action; noted correct in review. | — | T-04 |

## Review resolutions (review-tasks.md pass 1)

Revision 2 addresses every Blocker and Concern in `review-tasks.md` pass 1
(verdict **revise**, one Blocker):

| Finding | Resolution | Where |
|---------|------------|-------|
| **B-01** — AC-07 and AC-08 had no closing task; the design's `api/__tests__/funnel-crud.integration.test.ts` file was dropped, and the "every AC has a closing task" claim was false. | New task **T-14** creates `api/__tests__/funnel-crud.integration.test.ts` covering AC-07 (Funnel+Stage POST/GET/PATCH/DELETE round-trip through the generic `/api/v1/nodes/:label` path) and AC-08 (`HAS_STAGE` `Funnel→Stage` via `POST /api/v1/edges`, composition read returns it). Traceability table, per-FR rollup, validation-checkpoints table, and the closing "every AC has a closing task" line corrected. `total_tasks` 13 → 14 (N-01). | T-14; Traceability; Validation checkpoints |
| **C-01** — the final sweep (T-13 step 7) omitted AC-07's `nodes.ts` and AC-08's `edges.ts` diff guards as their own verification. | T-14's verification carries both `git diff --stat` guards explicitly as AC-07/AC-08 word them (`api/src/routes/nodes.ts` → no change; `api/src/routes/edges.ts` → no change), not relying on T-13's aggregate sweep. | T-14 |
| **C-02** — T-08's C-04 foundation-placeholder guard used a bare substring grep, not a shape check. | T-08 step 1 strengthened to assert the specific key shape: the `business`-surface block and a `funnels:` entry returning a `BusinessTabPlaceholder` within it (a shape-not-substring grep), failing loudly on a mismatch. Mirrored in T-08's verification. | T-08 |
| **C-03** — the branch-*detection* computation was implicit; T-09's test could pass on a pre-set flag without exercising detection. | T-09's `funnel-board-analytics.test.tsx` branch case now asserts the *detection*: a composition payload with a fan-out stage (>1 outgoing `CONVERTS_TO`) yields the branch signal → `"n/a"`, so a detection bug (e.g. counting `HAS_STAGE` out-edges instead of `CONVERTS_TO`) fails the test. | T-09 |
| **N-01** (nit) — `total_tasks: 13` had to become 14. | Frontmatter `total_tasks: 14`; task list, Traceability, and checkpoint tables updated. | frontmatter; tables |
| **N-02**, **N-03** (nits) — optional dependency-edge cleanup / seed-dir naming. | No change required (both match the approved design); noted acknowledged. | — |

## Task list

### T-01 — `Funnel` + `Stage` label payloads + `ensureFunnelOntology` registration routine

- **Files** (1): `api/src/seed/ensure-funnel-ontology.ts` (new)
- **Implements**: design §3.1, §3.2, §3.3, §4.1 — closes AC-01, AC-03 (registration
  halves), AC-04 (registration half); supports FR-01, FR-02, FR-03, FR-04, NFR-01, NFR-03
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-02, T-03, T-12
- **Steps**: `ensureFunnelOntology(baseUrl): Promise<void>` — the register-before-use
  routine (Rule B), driving the loopback API as trusted operator tooling (same
  posture as the foundation loader's import POST and the metric-library ensure steps):
  1. Define the four registration payloads inline (single source, consumed by the
     tests too):
     - **`Funnel` label** (§3.1) — `nodeLabelCreateSchema`-conformant:
       `name:"Funnel"`, `description` (§3.1 verbatim), `usage_example` (§3.1),
       `json_schema_doc:{ type:"object", properties:{ modelId:{ type:"string" } }, additionalProperties:true }`.
       `modelId` (optional string) is the **operator-root marker** (C-06).
     - **`Stage` label** (§3.2) — `name:"Stage"`, `description`, `usage_example`,
       `json_schema_doc:{ type:"object", required:["stageOrder"], properties:{ stageOrder:{ type:"integer" } }, additionalProperties:true }`
       (**C-05** — `required` + integer, copied verbatim from §3.2).
     - **`HAS_STAGE` edge type** (§3.3) — `edgeTypeCreateSchema`-conformant:
       `name:"HAS_STAGE"`, `description`, `usage_example`,
       `endpoints:[{ fromLabel:"Funnel", toLabel:"Stage" }]`.
     - **`CONVERTS_TO` edge type** (§3.3) — `name:"CONVERTS_TO"`, `description`,
       `usage_example`, `endpoints:[{ fromLabel:"Stage", toLabel:"Stage" }]`.
  2. Ensure them **in dependency order** (`assertEndpointLabelsExist` requires the
     labels first, §3.3): `Funnel` → `Stage` → `HAS_STAGE` → `CONVERTS_TO`, each
     via a `getThenCreate(getPath, postPath, payload)` helper.
     - `Funnel`/`Stage` → `GET /api/v1/ontology/node-labels/<name>`, then
       `POST /api/v1/ontology/node-labels` only on `404` (`ontology:write`).
     - `HAS_STAGE`/`CONVERTS_TO` → `GET /api/v1/ontology/edge-types/<name>`, then
       `POST /api/v1/ontology/edge-types` only on `404` (`ontology:write`).
  3. **Idempotency (Rule B / B-03 — get-then-create guard, requirements rev-3
     FR-06a)** — for each construct: `GET` by name; a `200` → already registered →
     **skip the POST** (verified no-op); a `404` → `POST` the payload and treat
     `201` as success; a defensive `409 name_conflict` on the `POST` (get→post
     race) → also treat as success; any other non-2xx → throw (surface the
     failure). A second run finds all four via the `GET` and creates nothing —
     exactly one of each construct, erroring nothing (AC-01/AC-03/AC-04). Mirrors
     `ensureOperatorRoot`'s lookup-before-create posture. Edit **no** `NODE_LABELS`/
     `EDGE_TYPES`/`EDGE_ENDPOINTS` entry in `shared/src/schema/{nodes,edges}.ts`
     (NFR-01). `zod` only, en-US identifiers.
- **Verification**: `api/__tests__/funnel-registry.integration.test.ts` (jointly with
  T-03) — after `ensureFunnelOntology`, `GET /api/v1/ontology/node-labels/Funnel`
  and `.../Stage` return them with their `json_schema_doc`; running the routine a
  **second** time leaves exactly one `Funnel` label and throws nothing (the second
  run `GET`s `Funnel` → 200 → skips the create; get-then-create guard,
  B-03); manual: `git diff shared/src/schema/nodes.ts` and `... edges.ts` show no
  additions (NFR-01, AC-01). `bun run typecheck` passes at checkpoint.
  Deferred-green: `bun test:integration`.

### T-02 — `Funnel`/`Stage` registry + `stageOrder` enforcement integration test

- **Files** (1): `api/__tests__/funnel-registry.integration.test.ts` (new)
- **Implements**: design §3.1, §3.2, §4.1, §4.2 — closes AC-01, AC-02; supports
  FR-01, FR-02, FR-06, NFR-01
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: —
- **Steps**: Prove the label registration + the `Stage` attribute enforcement:
  - **AC-01** — call `ensureFunnelOntology` (T-01); assert
    `GET /api/v1/ontology/node-labels/Funnel` returns the label; a **second**
    `ensureFunnelOntology` run is a verified no-op (the second run `GET`s `Funnel`
    → 200 → skips the create, so the strict-CREATE route is never re-hit and no
    `409` surfaces — get-then-create guard, B-03); manual: `git diff
    shared/src/schema/nodes.ts` shows no additions.
  - **AC-02 (C-05)** — after registration, `POST /api/v1/nodes/Stage` (generic
    graph-core node route, `parseRegistryLabel` resolves `Stage`) with a
    **non-integer** `stageOrder` (e.g. `"2"` or `2.5`) and with a **missing**
    `stageOrder` are **both** rejected `400 attribute_violation` (the registered
    `required:["stageOrder"]` + integer type, compiled by the attribute-zod cache);
    a valid integer `stageOrder` (e.g. `2`) **succeeds** (201). This makes the
    `required`-integer enforcement observable.
- **Verification**: `api/__tests__/funnel-registry.integration.test.ts` (AC-01,
  AC-02); manual: `git diff shared/src/schema/nodes.ts` — expect no additions.
  Deferred-green: `bun test:integration`.

### T-03 — `HAS_STAGE`/`CONVERTS_TO` endpoint-whitelist integration test

- **Files** (1): `api/__tests__/funnel-edges.integration.test.ts` (new)
- **Implements**: design §3.3, §4.1, §4.3 — closes AC-03, AC-04; supports FR-03,
  FR-04, NFR-01
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-04
- **Steps**: Prove the registered edge endpoints are enforced by the graph-core
  validator (`getEdgeEndpoints` → `edge_endpoint_label_mismatch`, `edges.ts:91`):
  - **AC-03** — after `ensureFunnelOntology` (T-01), a `HAS_STAGE` edge
    `Funnel→Stage` via `POST /api/v1/edges` **succeeds**; a `HAS_STAGE` edge with
    any other pair (e.g. `Stage→Funnel`) is rejected `400
    edge_endpoint_label_mismatch`; manual: `git diff shared/src/schema/edges.ts`
    shows no additions.
  - **AC-04** — a `CONVERTS_TO` edge `Stage→Stage` (created via the funnel route,
    T-04, or the generic path for this pair-check) is accepted for the registered
    pair; any other pair (e.g. `Funnel→Stage`) is rejected `400
    edge_endpoint_label_mismatch`. Requires `Funnel`/`Stage` node fixtures as the
    edge endpoints (created via the generic `POST /api/v1/nodes/{Funnel,Stage}`).
- **Verification**: `api/__tests__/funnel-edges.integration.test.ts` (AC-03, AC-04);
  manual: `git diff shared/src/schema/edges.ts` — expect no additions.
  Deferred-green: `bun test:integration`.

### T-04 — Funnel-owned transition route (range check + delegate to `createEdge`)

- **Files** (1): `api/src/routes/funnels.ts` (new)
- **Implements**: design §3.4, §4.4, §5 (Rule C) — closes AC-05, AC-06 (route
  halves); supports FR-05, FR-07, NFR-02, NFR-04
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-05, T-06
- **Steps**: `api/src/routes/funnels.ts` — the ownership-safe home for the `[0,1]`
  range check (Rule C):
  1. Define `funnelTransitionSchema` (§3.4) with `zod`, importing the existing
     `uuidv7` primitive from `@companygraph/shared/schema/nodes` (verified export,
     N-03):
     ```ts
     const rate = z.number().min(0).max(1);                     // [0,1], inclusive
     export const funnelTransitionSchema = z.object({
       fromId: uuidv7, toId: uuidv7,
       conversionRate: rate, dropOffRate: rate,
       attributes: z.record(z.unknown()).default({}),
     });
     ```
  2. Export `handleFunnelTransitionPost(req)`:
     - `readJson(req)` → `funnelTransitionSchema.safeParse(body)`. On failure
       (including a rate outside `[0,1]`) → throw
       `ValidationError("attribute_violation", …)` → `400 attribute_violation`
       (existing closed `ERROR_CODES` member; `api/src/errors.ts` **untouched** —
       N-02: a malformed body may surface `invalid_payload` generically). (AC-06.)
     - Fold the two rates into the edge attributes and **delegate to graph-core**:
       ```ts
       const { fromId, toId, conversionRate, dropOffRate, attributes } = parsed.data;
       const edge = await createEdge(getDriver(), {
         type: "CONVERTS_TO", fromId, toId,
         attributes: { ...attributes, conversionRate, dropOffRate },
       });
       return ok(edge, 201);
       ```
       `createEdge` runs `validateEdge` → the FR-04 `Stage→Stage` endpoint
       whitelist (`400 edge_endpoint_label_mismatch`, AC-04) + cross-type edge-id
       uniqueness, then persists the rates as `attributes_json` on the relationship
       (round-trips intact on read, AC-05).
  3. `createEdge` is imported **read-only** from `api/src/storage/edges.ts` (the
     route **calls** the exported function; it does **not** edit that file, nor
     `api/src/routes/edges.ts`, nor `shared/src/schema/edges.ts` — Rule C, NFR-02).
     No `DELETE` route is built for the `must` (a `CONVERTS_TO` edge is deleted via
     the generic `DELETE /api/v1/edges/:id`).
- **Verification**: exercised by `api/__tests__/funnel-edges.integration.test.ts`
  (T-05, AC-05/AC-06) once wired (T-06); `bun run typecheck` passes at checkpoint.

### T-05 — Transition round-trip + range-rejection integration test

- **Files** (1): `api/__tests__/funnel-edges.integration.test.ts` (extend from T-03)
- **Implements**: design §3.4, §4.4 + `review-design.md` C-03 — closes AC-05, AC-06;
  supports FR-05, FR-07, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-04, T-06
- **Steps**: Extend the edge test with the funnel-route write-path proof:
  - **AC-05** — a `CONVERTS_TO` edge via `POST /api/v1/funnels/transitions` with
    valid `conversionRate`/`dropOffRate` (both in `[0,1]`) returns `201`; a read of
    the edge (via composition read or generic edge read) returns
    `conversionRate`/`dropOffRate` intact (round-trip through `attributes_json`).
  - **AC-06** — an out-of-range rate (e.g. `conversionRate:1.2` or `-0.1`) →
    `400 attribute_violation`; an in-range one → `201` persisted; the delegated
    `createEdge` still applies the endpoint whitelist (a wrong pair → `400
    edge_endpoint_label_mismatch`); manual: `git diff --stat api/src/routes/edges.ts
    api/src/storage/edges.ts shared/src/schema/edges.ts` — expect **no change**
    (Rule C, NFR-02). Requires `Stage` node fixtures as the edge endpoints.
- **Verification**: `api/__tests__/funnel-edges.integration.test.ts` (AC-05, AC-06);
  manual: `git diff --stat api/src/routes/edges.ts api/src/storage/edges.ts
  shared/src/schema/edges.ts` — expect no change. Deferred-green: `bun test:integration`.

### T-06 — Wire the transition route into dispatch + RBAC (D-1 additive edits)

- **Files** (2): `api/src/router.ts` (modify, **additive**),
  `api/src/auth/rbac-permissions.ts` (modify, **additive**)
- **Implements**: design §2.1 (D-1), §5, §7 + `review-design.md` C-03 — closes
  AC-06 (dispatch/gate half); supports FR-07, FR-10, NFR-04
- **Complexity**: simple
- **Blocked by**: T-04
- **Blocks**: T-05
- **Steps**: The two **additive** framework wirings the new route needs (D-1). Both
  are single lines; neither is a rewrite:
  1. `api/src/router.ts` — add one dispatch branch with the other resource routes:
     `if (sub === "funnels/transitions" && method === "POST") return handleFunnelTransitionPost(req);`
     (the router is a hardcoded `if (sub === …)` chain with no dynamic route seam —
     verified §2.1). Import `handleFunnelTransitionPost` from
     `./routes/funnels` (T-04).
  2. `api/src/auth/rbac-permissions.ts` — add one mapping line reusing the existing
     `edge:write` permission (no **new** permission string):
     `P("POST", "funnels/transitions", "edge:write")`. Without this, `getRoutePermission`
     returns `null` and the router gate lets the route through on **any**
     authenticated session (`router.ts:386-395`) — a security regression (design
     §11). **C-03 pin**: these are the only two files outside this spec's own new
     files that change; they are additive, and the widened AC-21 allow-list permits
     exactly these two lines (T-11).
- **Verification**: `api/__tests__/funnel-edges.integration.test.ts` (T-05) reaches
  the route through dispatch + the gate (AC-06 — a request without `edge:write`
  permission is `403`, a valid one reaches the range check); manual: `git diff
  api/src/auth/rbac-permissions.ts` — expect exactly one additive `P(...)` line, **no
  new permission string**. `bun run typecheck` passes.

### T-07 — Drop-off analytics derivation (server arithmetic unit test)

- **Files** (2): `api/src/seed/funnel-analytics.ts` (new — pure helper),
  `api/__tests__/funnel-analytics.test.ts` (new — unit)
- **Implements**: design §4.6 + `review-design.md` N-01 — closes AC-11 (server
  half); supports FR-11
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-09
- **Steps**: Author the **pure, DOM-independent** analytics derivation so the same
  logic is shared/verified server-side and re-asserted in the PWA test (T-09):
  1. `overallConversion(transitionRates: number[]): number | "n/a"` — the **product**
     of the ordered per-transition `conversionRate`s (linear chain, OQ-2). Rules
     (FR-11): an **empty** rate list (one-stage funnel, no transition) → `"n/a"`;
     a normal chain → the product (`[0.5, 0.4] → 0.20`); a **branch signal**
     (caller passes a flag or the rate list is flagged non-linear) → `"n/a"`
     (N-01 — the derivation must not silently multiply one arbitrary path). Keep
     the branch-detection contract explicit so the PWA caller (T-09) can pass the
     branch signal it computes from the composition payload.
  2. No writes, no store, no operational records (XD-03) — pure arithmetic over the
     FR-08 payload's parsed rates.
- **Verification**: `api/__tests__/funnel-analytics.test.ts` (AC-11) — asserts the
  product `0.5×0.4=0.20`, the single-stage/empty case → `"n/a"`, and the
  branch-signalled case → `"n/a"` (N-01). Run under `bun test`. `bun run typecheck`
  passes.

### T-08 — Foundation-placeholder precondition + `FunnelBoard` CSS module (tokens-only)

- **Files** (1): `pwa/src/views/business/FunnelBoard.module.css` (new)
- **Implements**: design §6.2, §6.5, §6.7 + `review-design.md` C-04 — closes AC-16
  (css half); supports FR-13, FR-14, NFR-05
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-09
- **Steps**:
  1. **C-04 build precondition (guard, no source edit) — shape check, not
     substring (review-tasks C-02)**: confirm `saas-operator-foundation` has landed
     and `pwa/src/views/index.tsx` carries a `business`-surface `funnels:`
     `BusinessTabPlaceholder` entry **in the exact shape the T-10 diff replaces**.
     Assert the *shape*, not a bare `funnels` substring: verify (a) the `business`
     surface block exists in the `VIEWS` map, and (b) within it a `funnels:` key
     returns a `BusinessTabPlaceholder` (e.g.
     `grep -nE "funnels:\s*\([^)]*\)\s*=>\s*<BusinessTabPlaceholder" pwa/src/views/index.tsx`
     resolving inside the `business` surface, or a one-line node check that the
     `VIEWS` map exposes a `funnels` key under `business` returning a
     `BusinessTabPlaceholder`). If the placeholder is absent, outside the `business`
     surface, or shaped differently (XD-09 single-shot: foundation lands in the same
     run, so a shape mismatch is a live risk), **stop and flag** — the view-seam diff
     (T-10) is only valid once the placeholder exists in this shape
     (dependency-ordering guard). A bare substring match must **not** pass this gate.
  2. Author `FunnelBoard.module.css` using **only** `var(--…)` tokens from
     `pwa/src/styles/companygraph/tokens.css` (the `FunctionMap.module.css`
     precedent) — no raw colors/spacing/fonts. Classes: `.grid`/`.card`/`.handle`/
     `.dragging` (§6.5). The `.handle` carries `touch-action:none` (suppress
     trackpad/touch scroll mid-drag) and `.dragging` carries `user-select:none`
     (suppress native text selection during pointer drag) — the Native Conflicts
     table suppressions (UX-03). Desktop-first, no new breakpoints (UX-04),
     focus-visible affordances for keyboard reachability.
- **Verification**: manual: `bun run scripts/design-conformance.ts --view
  pwa/src/views/business/FunnelBoard.module.css` — expect exit 0 with zero
  token/component violations (AC-16, css half; the `.tsx` half runs at T-11);
  manual (C-04 precondition, **shape check** per review-tasks C-02):
  `grep -nE "funnels:\s*\([^)]*\)\s*=>\s*<BusinessTabPlaceholder" pwa/src/views/index.tsx`
  — expect a match resolving **inside the `business` surface block** (assert the
  key shape, not a bare `funnels` substring); if it does not match this shape,
  **stop and flag** the dependency-ordering guard. `bun run typecheck` passes.

### T-09 — `FunnelBoard` view (four states, picker, stage board, reorder, analytics)

- **Files** (1): `pwa/src/views/business/FunnelBoard.tsx` (new)
- **Implements**: design §6.3, §6.4, §6.5, §6.6, §4.5, §4.6 + `review-design.md`
  C-01, N-01 — closes AC-12, AC-13, AC-14, AC-15, AC-19 (tsx halves), AC-11 (view
  half); supports FR-11, FR-13, FR-14, FR-15
- **Complexity**: complex
- **Blocked by**: T-07, T-08
- **Blocks**: T-10, T-11
- **Steps**: The live interactive stage board at `#/business/funnels` (route already
  registered by foundation, XD-05 — wired in T-10). Follow the `FunctionMap.tsx`
  precedent verbatim:
  - **Imports** — `import { api } from "../../api"`,
    `import { useActiveModel } from "../../context/ActiveModelContext"`,
    `import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared"`,
    `import { Button } from "../../components/Button"`,
    `import styles from "./FunnelBoard.module.css"`, plus the T-07 analytics helper
    (or a mirrored client copy re-asserted by T-09's test — AC-11).
  - **Subject** — consume `useActiveModel()` and resolve the SaaS-Operator root by
    the same OQ-1 marker `FunctionMap` uses (`name:"SaaS Operator"` +
    `attributes.saasOperatorRoot === true`), defaulting to it even when the active
    model is something else (FR-13). Never re-implement active-model context.
  - **Reads** — two `api.cypher(...)` calls:
    1. On mount → the **listing** read (§4.5) → the picker's options (name +
       `stageCount`). **C-01/C-06 pin**: the `CONTAINS $rootIdNeedle` Cypher is a
       coarse prefilter; the view does the **authoritative** filter client-side,
       parsing each row's `attributes_json` and keeping only rows whose
       `modelId === operatorRootId` (a retail funnel with a different/absent
       `modelId` is excluded here — this client filter is where AC-10's authority
       lives, T-09's test).
    2. On funnel select → the **composition** read (§4.5) keyed on the chosen funnel
       `id` → ordered stages + transitions; parse `attributes_json` for `stageOrder`
       and each `CONVERTS_TO` edge's `conversionRate`/`dropOffRate` (mirrors
       `deserializeModel`).
  - **Analytics (AC-11, N-01, review-tasks C-03)** — per-transition
    conversion/drop-off from the parsed rates; overall funnel conversion via the
    T-07 derivation. **Branch detection lives here (C-03)**: count each stage's
    **outgoing `CONVERTS_TO`** edges from the composition payload (not `HAS_STAGE`,
    not incoming edges); a stage with >1 outgoing `CONVERTS_TO` marks the funnel as
    branched, and the view passes that computed branch signal into the T-07 helper
    so overall conversion renders the literal `"n/a"` (N-01 — never silently
    multiply one arbitrary path). one-stage funnel → `"n/a"`; zero-stage → empty
    state. The branch signal is *derived* here, not received pre-set, so the T-09
    branch-case test (below) exercises the detection itself.
  - **States (UX-01, catalog-first)**:
    - **loading** (AC-13) → `<Loading …/>` while the listing or composition fetch is
      in flight.
    - **empty** (AC-14) → `<EmptyState …/>` prompting that content specs
      (marketing/sales) seed funnels, when the operator model resolves but the
      listing returns zero `Funnel` nodes.
    - **error** (AC-15) → `<ErrorState … onRetry={refetch}/>` with a retry that
      refetches (covers a `runPassthrough` timeout/cap hit).
    - **ready** (AC-12) → the picker + the selected funnel's stage cards in
      `stageOrder`, each transition annotated with its `conversionRate`/`dropOffRate`,
      and the overall conversion (or `"n/a"`) as a summary.
  - **Reorder (FR-14, OQ-3)** — two paths, neither pointer-only:
    - **Pointer drag** (AC-17) — a drag handle per card using **pointer events**
      (`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`), not HTML5 DnD.
      On drop, PATCH each **moved** stage's `stageOrder` via `PATCH
      /api/v1/nodes/Stage/:id` (FR-06), then re-run the composition read.
    - **Keyboard move controls** (AC-18) — a move-up + move-down `<Button>` per card;
      Enter/Space swaps with the neighbor, PATCHing the two affected stages and
      re-reading; focus stays on the moved stage's move-up button. **No arrow-key
      capture** (OQ-3, C-03).
  - **Accessibility (AC-19, UX-05)** — the view root is the catalog `ViewRegion`
    landmark; Tab order in DOM order: landmark → picker → each stage's move-up/
    move-down controls in `stageOrder`; every interactive element is a native
    `<button>`/anchor activating on Enter/Space (no pointer-only affordance).
  - **FR-15 (`should`)** — inline stage create/rename/delete + transition-rate edit
    and funnel-id deep-link **may** be added obeying the same view-state/tokens/
    keyboard rules; no AC gates it (built only if wave-2 needs it).
  - Styling via `FunnelBoard.module.css` (T-08), tokens-only.
- **Verification**:
  - `pwa/src/__tests__/funnel-board.test.tsx` (AC-12) — ready state renders the
    picker, ordered stages, per-transition + overall conversion (mocked
    `api.cypher`); view root is a `ViewRegion` landmark; DOM-order Tab reachability
    (AC-19 tsx half).
  - `pwa/src/__tests__/funnel-board-analytics.test.tsx` (AC-11, N-01, **C-03**) —
    the same derivation DOM-independently: `0.5×0.4=0.20`, single-stage → `"n/a"`,
    and a **branch** case → `"n/a"`. **The branch case asserts the *detection*, not a
    pre-set flag (review-tasks C-03)**: feed a composition payload where a stage has
    **two outgoing `CONVERTS_TO`** edges and assert the view derives the branch
    signal → overall conversion renders `"n/a"`; this fails if detection counts
    `HAS_STAGE` (or incoming) out-edges instead of outgoing `CONVERTS_TO`. A test
    that only sets a pre-computed flag is insufficient.
  - `pwa/src/__tests__/funnel-board-states.test.tsx` (AC-13, AC-14, AC-15, and the
    **C-01** client-filter half of AC-10) — loading/empty/error(+retry), and a
    listing payload containing a retail-`modelId` funnel is filtered out by the
    client `modelId === operatorRootId` check (authoritative exclusion, C-01).
  Run component tests under `bun test`.

### T-10 — Wire `FunnelBoard` into the `funnels:` VIEWS line (sole views/index.tsx edit)

- **Files** (1): `pwa/src/views/index.tsx` (modify)
- **Implements**: design §6.1, §6.2 + `review-design.md` C-04 — closes AC-16 (tsx
  half); supports FR-12, NFR-02
- **Complexity**: simple
- **Blocked by**: T-09
- **Blocks**: T-11
- **Steps**: Make **exactly two** changes to `pwa/src/views/index.tsx` (the proven
  `model-workspace-core`/foundation view seam — the whole PWA route-registration diff
  for this feature, XD-05/NFR-02):
  1. Add `import { FunnelBoard } from "./business/FunnelBoard";` to the import block.
  2. Replace the **`funnels:` key** in the `business` surface `VIEWS` map (referenced
     by **key, not line number**, since foundation owns and may re-touch the file —
     C-04):
     ```tsx
     // before (foundation placeholder):
     funnels: (r) => <BusinessTabPlaceholder tab="Funnels" spec="funnel-pipeline-modeling" />,
     // after (this feature):
     funnels: (r) => <FunnelBoard route={r} />,
     ```
  Edit **no other** `VIEWS` entry (`metrics`/`benchmarks`/`operator` stay as their
  `BusinessTabPlaceholder`), and **neither** `pwa/src/route.ts` **nor** the
  `SURFACES` list (sole-owned by `saas-operator-foundation`, XD-05).
- **Verification**:
  - AC-16 (tsx half): manual: `bun run scripts/design-conformance.ts --view
    pwa/src/views/business/FunnelBoard.tsx` — expect exit 0.
  - manual: `git diff --stat pwa/src/views/index.tsx` — expect the change confined
    to the `funnels:` line + the `FunnelBoard` import; `git diff pwa/src/route.ts`
    — expect **no** change (XD-05). `bun run typecheck` exit 0.

### T-11 — Deep-link reload e2e + composition read + listing scope integration tests

- **Files** (2): `pwa/playwright/business-funnels-reload.spec.ts` (new),
  `api/__tests__/funnel-read.integration.test.ts` (new)
- **Implements**: design §4.5, §6.1 + `review-design.md` C-01, C-02 — closes AC-20,
  AC-09, AC-09a, AC-10 (Cypher half); supports FR-08, FR-09, FR-12, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-06, T-10
- **Blocks**: —
- **Steps**:
  - **Composition read (AC-09, AC-09a)** — `api/__tests__/funnel-read.integration.test.ts`:
    seed a `Funnel` + ordered `Stage` nodes (`HAS_STAGE`) + `CONVERTS_TO`
    transitions via the generic/funnel routes; the §4.5 composition Cypher via
    `POST /api/v1/query/cypher` returns the funnel + stages ordered by `stageOrder`
    + the transitions' `conversionRate`/`dropOffRate`. **AC-09a** — with a stub
    "retail" funnel also present, the id-keyed composition read returns **only** the
    SaaS-Operator funnel's stages (scope isolation via the globally-unique funnel
    `id`).
  - **Listing scope (AC-10, C-01/C-02)** — same test file: the §4.5 listing Cypher
    (`CONTAINS $rootIdNeedle` prefilter) returns the operator funnel with a
    `stageCount`; a stub retail `Funnel` (different/absent `modelId`) is **excluded
    after the parse-level `modelId` check** (not trusting `CONTAINS` alone — C-01;
    the authoritative *client-side* exclusion is additionally asserted in T-09's
    `funnel-board-states.test.tsx`). **C-02 note**: no listing-latency bound is
    asserted (`Funnel` cardinality is small).
  - **AC-20 e2e** — `pwa/playwright/business-funnels-reload.spec.ts`: with the full
    stack up and a seeded funnel, navigate to `#/business/funnels`, select a funnel,
    reload; assert the same route re-renders `FunnelBoard`, the active model
    (operator root) is still the subject, and the **in-view funnel selection resets
    to the picker** (OQ-4 `must`).
- **Verification**:
  - `api/__tests__/funnel-read.integration.test.ts` (AC-09, AC-09a, AC-10) — under
    `bun test:integration`.
  - `pwa/playwright/business-funnels-reload.spec.ts` (AC-20) — full stack up +
    seeded funnel.

### T-12 — Feature-owned seed CLI + `seed:funnel-pipeline` package script

- **Files** (2): `api/scripts/seed-funnel-pipeline.ts` (new),
  `package.json` (modify)
- **Implements**: design §4.1, §7 — supports FR-01, FR-02, FR-03, FR-04, NFR-03
  (register-before-use, Risk #5)
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: —
- **Steps**:
  1. `api/scripts/seed-funnel-pipeline.ts` — the `bun run seed:funnel-pipeline` CLI
     entrypoint (sibling to `api/scripts/seed-saas-operator.ts`): call
     `ensureFunnelOntology(baseUrl)` (T-01) so the four constructs are registered
     idempotently **before** any content-wave-2 marketing/sales seed loads (Risk #5).
     It seeds **no** funnel instances (those are content-spec-owned). **Does not
     edit** `api/scripts/seed-saas-operator.ts` (foundation-owned, §4.1).
  2. Add `"seed:funnel-pipeline": "bun --cwd api scripts/seed-funnel-pipeline.ts"`
     to the root `package.json` `scripts` (matching the existing
     `"seed:saas-operator": "bun --cwd api scripts/seed-saas-operator.ts"` form).
     This is the sole `package.json` edit.
- **Verification**: manual: `bun run seed:funnel-pipeline` with the stack up — expect
  the four constructs registered (idempotent; a re-run `GET`s each construct → 200
  → skips the create and reports success), verified by `GET /api/v1/ontology/node-labels/Funnel` /
  `.../edge-types/CONVERTS_TO` returning them; manual: `grep seed:funnel-pipeline
  package.json` shows the entry. `bun run typecheck` passes.

### T-14 — Funnel/Stage node CRUD + `HAS_STAGE` generic-edge round-trip integration test (AC-07, AC-08)

- **Files** (1): `api/__tests__/funnel-crud.integration.test.ts` (new)
- **Implements**: design §4.2 (AC-07), §4.3 (AC-08), §9 — closes AC-07, AC-08;
  supports FR-06, FR-07, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-13
- **Resolves**: **B-01** (the two dropped ACs / dropped design file) and **C-01**
  (the AC-07/AC-08 `nodes.ts`/`edges.ts` diff guards carried on their own task).
- **Steps**: The design (§4.2, §4.3, §9) assigns AC-07 and AC-08 their own file
  `api/__tests__/funnel-crud.integration.test.ts` — proving that `Funnel`/`Stage`
  node CRUD **and** `HAS_STAGE` edge writes ride the **existing generic** graph-core
  routes with **zero** new/edited node- or edge-route code (NFR-02). After
  `ensureFunnelOntology` (T-01):
  - **AC-07 — Funnel/Stage node CRUD round-trip through the generic path**: exercise
    the full lifecycle on **both** labels via `parseRegistryLabel`
    (`api/src/routes/nodes.ts`) — no funnel-owned node route exists:
    - `POST /api/v1/nodes/Funnel` (with a `modelId` marker, C-06) → `201`, returns a
      server-generated `id`; `POST /api/v1/nodes/Stage` (with a valid integer
      `stageOrder`) → `201`.
    - `GET /api/v1/nodes/Funnel/:id` and `.../Stage/:id` → return the created nodes
      with their `attributes` parsed at the REST boundary (`modelId`, `stageOrder`
      intact).
    - `PATCH /api/v1/nodes/Stage/:id` bumping `stageOrder` → `200`, the partial SET
      leaves other fields intact (mirrors the FR-14 reorder PATCH path); a re-`GET`
      confirms the new `stageOrder`.
    - `DELETE /api/v1/nodes/Funnel/:id` (and `Stage`) → `204`/`200` per graph-core
      contract; a subsequent `GET` → `404`.
    - **Boundary (AC-07):** manual `git diff --stat api/src/routes/nodes.ts` → **no
      change** — the CRUD round-trip added no node-route code (NFR-02).
  - **AC-08 — `HAS_STAGE` `Funnel→Stage` via the generic edge route + composition
    read returns it**: with a `Funnel` and a `Stage` node fixture,
    `POST /api/v1/edges` with `{ type:"HAS_STAGE", fromId:<funnel>, toId:<stage> }`
    → `201` (the graph-core validator applies the FR-03 `Funnel→Stage` endpoint
    whitelist — a wrong pair is AC-03's job in T-03; here assert the **happy-path
    generic-route link**). Then read it back: the §4.5 composition read (reuse the
    T-11 read helper) for that funnel `id` returns the linked stage under the funnel
    (the `HAS_STAGE` edge round-trips through the generic path).
    - **Boundary (AC-08):** manual `git diff --stat api/src/routes/edges.ts` → **no
      change** — the `HAS_STAGE` link used the existing generic edge route, added no
      edge-route code (NFR-02).
  - **Distinct from siblings**: T-02 asserts `Stage` attribute *rejection* (AC-02),
    T-03 asserts the edge-endpoint *whitelist* (AC-03/AC-04), T-11 asserts the
    *ordered composition* read (AC-09). T-14 is the requirements-level CRUD
    round-trip + `HAS_STAGE` generic-write proof with its own `nodes.ts`/`edges.ts`
    ownership guards (AC-07/AC-08), which the design gave a dedicated file.
- **Verification**: `api/__tests__/funnel-crud.integration.test.ts` (AC-07, AC-08) —
  under `bun test:integration` (needs `bun run dev` — Neo4j); manual:
  `git diff --stat api/src/routes/nodes.ts` → **no change** (AC-07) and
  `git diff --stat api/src/routes/edges.ts` → **no change** (AC-08).
  `bun run typecheck` passes at checkpoint.

### T-13 — Final validation + boundary sweep (widened AC-21 allow-list)

- **Files** (0): no source files — validation only
- **Implements**: design §8, §9, §10, §2.1 (D-1) + `review-design.md` C-03 — closes
  AC-21, the AC-01…AC-20 sweep; supports all FR/NFR
- **Complexity**: simple
- **Blocked by**: T-01…T-12, T-14
- **Blocks**: —
- **Steps**: With the full stack up (`bun run dev`) and `bun run seed:funnel-pipeline`
  run:
  1. `bun run typecheck` exits 0 (AC-21).
  2. `bun test` (PWA unit/component: `funnel-board*.test.tsx`, `funnel-analytics.test.ts`)
     green.
  3. `bun test:integration` (all `api/__tests__/funnel-*.integration.test.ts`,
     including `funnel-crud.integration.test.ts` from T-14) green. Note AC-07/AC-08
     carry their **own** `git diff --stat api/src/routes/nodes.ts` /
     `... edges.ts` → no-change guards in T-14 (review-tasks C-01); the aggregate
     boundary sweep (step 7) reconfirms them.
  4. `bun run scripts/design-conformance.ts --view pwa/src/views/business/FunnelBoard.tsx`
     and `--view pwa/src/views/business/FunnelBoard.module.css` both exit 0 (AC-16).
  5. `pwa/playwright/business-funnels-reload.spec.ts` passes (AC-20).
  6. Live manual keyboard/pointer sweep (AC-17, AC-18, AC-19): `#/business/funnels`
     — drag the 2nd stage above the 1st (Network tab shows one `PATCH
     /api/v1/nodes/Stage/:id` per moved stage, reload persists order); Tab to the
     2nd stage's move-up, Enter (moves up, focus stays, PATCH fires, reload
     persists); Tab through → landmark → picker → each stage's controls in order,
     each activating on Enter/Space.
  7. **AC-21 boundary check (WIDENED allow-list, C-03)**: `git diff --stat` +
     `git diff` confirm changes are confined to:
     - `pwa/src/views/business/FunnelBoard.tsx` + `.module.css` (new);
     - the one `funnels:` `VIEWS` entry + `FunnelBoard` import in
       `pwa/src/views/index.tsx`;
     - **new** `api/` funnel files (`api/src/routes/funnels.ts`,
       `api/src/seed/ensure-funnel-ontology.ts`, `api/src/seed/funnel-analytics.ts`,
       `api/scripts/seed-funnel-pipeline.ts`, the funnel tests);
     - `package.json` (the one `seed:funnel-pipeline` script);
     - the **two additive D-1 lines**: one dispatch line in `api/src/router.ts`, one
       `P("POST","funnels/transitions","edge:write")` mapping in
       `api/src/auth/rbac-permissions.ts`.

     And confirm **no** edit to `shared/src/schema/{nodes,edges}.ts` (no array
     additions), `pwa/src/route.ts`, `SURFACES`, `api/src/routes/{edges,nodes,query}.ts`,
     `api/src/storage/edges.ts`, `api/src/routes/ontology-*.ts`, `api/src/errors.ts`,
     `api/scripts/seed-saas-operator.ts`; and **no new RBAC permission string**
     (`rbac-permissions.ts` change is exactly one `P(...)` line reusing `edge:write`).
- **Verification**: manual: run steps 1–7 with the seeded stack up — expect
  `typecheck` exit 0, both test suites green, both design-conformance invocations
  exit 0, the Playwright reload spec passes, the live keyboard/pointer sweep behaves
  as AC-17/AC-18/AC-19 describe, and every `git diff` boundary check clean under the
  widened D-1 allow-list (full AC-01…AC-21 sweep).

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.1, §3.2, §3.3, §4.1 | AC-01/AC-03/AC-04 (registration) | FR-01, FR-02, FR-03, FR-04, NFR-01, NFR-03 |
| T-02 | §3.1, §3.2, §4.1, §4.2 | AC-01, AC-02 | FR-01, FR-02, FR-06, NFR-01 |
| T-03 | §3.3, §4.1, §4.3 | AC-03, AC-04 | FR-03, FR-04, NFR-01 |
| T-04 | §3.4, §4.4, §5 | AC-05, AC-06 (route) | FR-05, FR-07, NFR-02, NFR-04 |
| T-05 | §3.4, §4.4, C-03 | AC-05, AC-06 | FR-05, FR-07, NFR-02 |
| T-06 | §2.1 (D-1), §5, §7, C-03 | AC-06 (dispatch/gate) | FR-07, FR-10, NFR-04 |
| T-07 | §4.6, N-01 | AC-11 (server) | FR-11 |
| T-08 | §6.2, §6.5, §6.7, C-04 | AC-16 (css) | FR-13, FR-14, NFR-05 |
| T-09 | §6.3, §6.4, §6.5, §6.6, §4.5, §4.6, C-01, N-01 | AC-11 (view), AC-12, AC-13, AC-14, AC-15, AC-19 (tsx), AC-10 (client half) | FR-11, FR-13, FR-14, FR-15 |
| T-10 | §6.1, §6.2, C-04 | AC-16 (tsx) | FR-12, NFR-02 |
| T-11 | §4.5, §6.1, C-01, C-02 | AC-09, AC-09a, AC-10 (Cypher), AC-20 | FR-08, FR-09, FR-12, NFR-06 |
| T-12 | §4.1, §7 | (register-before-use) | FR-01, FR-02, FR-03, FR-04, NFR-03 |
| T-14 | §4.2, §4.3, §9 | AC-07, AC-08 | FR-06, FR-07, NFR-02 |
| T-13 | §8, §9, §10, §2.1 (D-1), C-03 | AC-17, AC-18, AC-19 (live), AC-21, AC-01…AC-20 sweep | all FR/NFR |

Every FR/NFR from the design is covered: FR-01→T-01/T-02/T-12, FR-02→T-01/T-02/T-12,
FR-03→T-01/T-03/T-12, FR-04→T-01/T-03/T-12, FR-05→T-04/T-05, FR-06→T-02/T-09/T-14,
FR-07→T-04/T-05/T-06/T-14, FR-08→T-11, FR-09→T-11, FR-10→T-06, FR-11→T-07/T-09,
FR-12→T-10/T-11, FR-13→T-08/T-09, FR-14→T-08/T-09, FR-15→T-09 (`should`, no AC);
NFR-01→T-01/T-02/T-03/T-13, NFR-02→T-04/T-05/T-10/T-13/T-14, NFR-03→T-01/T-12,
NFR-04→T-04/T-06/T-13, NFR-05→T-08, NFR-06→T-11.

**Every AC (AC-01…AC-21, incl. AC-09a) now has a closing task** — this claim was
false in revision 1 (AC-07 and AC-08 were unclosed; review-tasks **B-01**). The
per-AC map: AC-01→T-01/T-02, AC-02→T-02, AC-03→T-01/T-03, AC-04→T-01/T-03,
AC-05→T-04/T-05, AC-06→T-04/T-05/T-06, **AC-07→T-14**, **AC-08→T-14**, AC-09→T-11,
AC-09a→T-11, AC-10→T-09/T-11, AC-11→T-07/T-09, AC-12→T-09, AC-13/14/15→T-09,
AC-16→T-08/T-10, AC-17/18/19→T-09/T-13, AC-20→T-11, AC-21→T-13.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with server behaviour (T-02, T-03, T-05, T-06, T-11, T-14) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs `bun run dev` — Neo4j) |
| tasks with pure/PWA behaviour (T-07, T-09) | the task's listed test under `bun test` |
| tasks touching `pwa/src/views/` (T-08, T-09, T-10) | `bun run scripts/design-conformance.ts --view <file>` for **every** touched `.tsx` and `.module.css` |
| T-11 e2e | `pwa/playwright/business-funnels-reload.spec.ts` (full stack up + seeded funnel) |
| final task (T-13) | `bun test` + `bun test:integration` (Neo4j) + full AC-01…AC-21 sweep + the widened-allow-list `git diff` boundary check (D-1, C-03) |
