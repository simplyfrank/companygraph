---
feature: "business-model-authoring"
created: "2026-07-04"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
reviewing_design_revision: "draft rev 1 (2026-07-04), design-review pass 1 = approve (0 blockers, 2 concerns C-01/C-02, 3 nits N-01/N-02/N-03)"
size: "large"
total_tasks: 17
---

# Tasks: business-model-authoring

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks the STATUS.md
  completion edit without a `verification_artifact`.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every file the
  task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css`
  gets its own invocation (enforced `--view` form, mwc design D-5; AC-16).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run under
  `bun test`; the Playwright spec runs in the PWA e2e job.

## Hard build-order precondition (design §1, requirements Dependencies)

This is a **parallel wave-3** feature. Every surface it composes is a **new file
owned by an upstream wave-1/wave-2 spec** and does **not** exist on disk until
those specs merge. **T-01 must not start until BOTH `model-workspace-core` and
`story-spec-core` have merged.** Specifically the following must be on disk and
carry the approved signatures the design cites:

- `model-workspace-core`: `api/src/storage/model-scope.ts` (`scopedNodeIds`);
  `POST /api/v1/models/:modelId/domains` (`attachDomain`, `model:write`);
  `GET /api/v1/models`, `GET /api/v1/modules`,
  `POST /api/v1/models/:modelId/module-instances` (`module:write`, required
  `targetDomainId` validated `IN_MODEL`), `GET /api/v1/models/:modelId/module-instances`;
  the `models*` router dispatch block (`api/src/router.ts`,
  `sub.startsWith("models/")`); the `business_architect` RBAC role carrying
  `model:read/write` + `module:read/write` (`api/src/scripts/seed-rbac-roles.ts`);
  the `model` surface + `canvas` tab `ModelTabPlaceholder` in
  `pwa/src/views/index.tsx`; `pwa/src/context/ActiveModelContext.tsx`
  (`useActiveModel`); the `409 model_lifecycle_route_required` guard.
- `story-spec-core`: story/AC CRUD + `POST …/stories/bootstrap`
  (`{activityIds?}` → `{created, skipped}`) routes; `story:read`/`story:write`
  `ROUTE_PERMISSIONS` rows; the `business_architect` grant of `story:*`; the
  `api.stories.*` PWA client block; the `derived`-clears-on-edit guarantee.
- graph-core: `api/src/routes/import.ts` (`realImport` private at line 157;
  `handleImport` the only export; shape `{imported:{nodes,edges}, errors?:RowError[]}`
  with `RowError={section,index,code,message,details?}`);
  `api/src/storage/{nodes,edges}.ts` `upsertNode`/`upsertEdge` (MERGE-on-id,
  registry-backed endpoint validator).
- `pwa/src/components/JourneyCanvas.tsx` (`JourneyData` + `LayoutMode`),
  catalog components, `pwa/src/styles/companygraph/tokens.css`,
  `scripts/design-conformance.ts`.

## Design-review carry-forwards (design-review pass 1 = approve; 2 concerns, 3 nits)

`review-design.md` closed **approve** with 0 blockers. Its two concerns and three
nits are landed here as **binding decisions** so the execution agent does not
re-derive them. None changes the architecture.

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **C-01** — §4.4's `authoring/graph` server shape does **not** match the real `JourneyData` contract (`pwa/src/components/JourneyCanvas.tsx`): `JourneyData` is **single-journey, column-index-based** — `ActivityNode{id,name,column:number}`, `RoleNode{columns:number[],durations}`, `SystemNode{usages:[{column}]}`, `LocationNode{columns:number[]}`, `PrecedesEdge{from_col,to_col}` (verified on disk); roles/systems/locations reference activities by **column position**, not id. The id→column transform is nontrivial and was unspecified. | **The server route stays id-based** (a clean model-scoped projection); the **id→column transform is a dedicated client mapper** owned by **T-15** with its own DoD (design-review recommendation (a)). `authoring/graph` (T-05) returns `{ journeys:[{id,name,domainId,activities:[{id,name,order}]}], roles, systems, locations, precedes }` (ids only); T-15's `toJourneyData(graph, journeyId)` assigns one column per activity **ordered by its `order`/`PRECEDES` position**, resolves each role/system/location's executed activity ids → their columns, and maps `PRECEDES` id-pairs → `{from_col,to_col}` — **one `JourneyData` per journey**. Multi-journey models render each journey's `JourneyData` and use `JourneyCanvas`'s existing **`"multi"` `LayoutMode`** (verified present, line 47). Cross-journey `PRECEDES` are dropped from the per-journey `JourneyData` (out of the single-journey lane model). AC-11's "renders on JourneyCanvas from authoring/graph" is pinned to T-15's mapper + its unit test. | T-05 (id-based route), **T-15 (mapper + unit test, own DoD)** |
| **C-02** — the design's §8 test table **split the approved AC-10 into AC-10a/AC-10b** and widened AC-10a with a new `story:write`-403 sub-assertion (C-06), i.e. approved-AC drift dressed as a design detail. Requirements rev 2 (approved) defines a **single AC-10** covering authz (model:write / module:write 403s + business_architect) **and** the OpenAPI assertion. | **Keep the approved id `AC-10`** (do **not** ship AC-10a/AC-10b — `spec-traceability` looks for `AC-10`). AC-10 is verified by **two test files** (authz + openapi), which is allowed (an AC may have multiple artifacts). The **`story:write`-403** coverage is a genuine widening of AC-10 folded in under a **Deviations** note (requirements errata, no renumber): AC-10 now also asserts a session lacking `story:write` is 403'd on the Step 5 bootstrap call. | T-12 (authz), T-13 (openapi), **Deviations** |
| **N-01** — §3.1's schema block omits the optional `id` field that §4.3's "Schema addendum" folds back in (a reader copying §3.1 verbatim cannot support idempotent re-submit). | `authoringNodeSchema` and `authoringEdgeSchema` each carry `id: z.string().uuid().optional()` **inline in the T-01 schema** (drop the addendum). This is the mechanism behind rule 2 / N-04 — the schema is correct as written. | T-01 |
| **N-02** — the edge-id key delimiter is inconsistent (`"<type>:<from>->:<to>"` in §3.2 vs `"<type>:<from>-><to>"` in §4.3 step 6). | **Canonical edge-id key = `"<type>|<from>|<to>"`** (pipe-delimited, three fields, no arrow) — used **identically** in the handler's `ids.edges` map and reconstructed by the client for re-submit. A single delimiter, no arrow ambiguity. | T-02, T-08 |
| **N-03** — a node row can carry `existingId` (pick-existing global Role → no import row) **and** `id` (re-run of a minted node → import row with that id); precedence was unstated. | **Precedence: `existingId` wins.** If a node row has `existingId`, the handler emits **no** import node row and resolves `clientKey → existingId` (the global node already exists); `id` on such a row is ignored. `id` (without `existingId`) is the re-run case: emit an import node row carrying that id (MERGE matches, upsert). Pinned in the T-01 schema comment and the T-08 handler. | T-01, T-08 |

## Deviations from requirements (orchestrator: land as errata, no ID renumbering)

| Requirement text | Executed as | Why | Source |
|------------------|-------------|-----|--------|
| AC-10 asserts authz (model:write/module:write 403s + business_architect) + OpenAPI presence | **Widened**: AC-10 additionally asserts a session lacking **`story:write`** is 403'd on the Step 5 `…/stories/bootstrap` call (mapping owned by `story-spec-core`, asserted in force here, not added by this spec) | Closes the same authz-coverage class B-02 closed for the clone path, for the third exercised permission family (design C-06 / §4.6 / §5.2) | design §2 (C-06), review-design C-02 |
| AC-16 `manual: run … design-conformance.ts …` | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | It is a deterministic script with an exit code; the requirements already name the enforced `--view` form (mwc D-5) | requirements AC-16, design §8 |
| OQ-2 — retail-reference module granularity | **Executed as DD-04 default**: clone instantiates **every** published module whose `sourceModelId` is the `isReference:true` model (count-agnostic loop), presented as one "Clone retail reference" action | Keeps Step 1 one-click; mwc publishes at journey level, so the count = # reference journeys — the clone loops the catalog result. Subset-selection is a deferred `should`-tier follow-up | design §4.2, DD-04; requirements OQ-2 |
| OQ-3 — uncommitted wizard state on reload | **Executed as the commit-per-step default**: each step's Next commits via its route; only committed graph state survives reload; no client-side draft persistence in v1 | Surfaced to the user as a conscious "commit each step" model, not a silent data-loss bug | design §3.3, §6; requirements OQ-3 |

## Task list

### T-01 — Authoring zod schemas (shared)

- **Files** (1): `shared/src/schema/authoring.ts` (new)
- **Implements**: design §3.1, §3.2 — supports FR-07, FR-13
- **Complexity**: moderate
- **Blocked by**: — (but see the hard build-order precondition)
- **Blocks**: T-02, T-04, T-13
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US identifiers).
  **Request** `authoringApplySchema = { nodes: authoringNodeSchema[], edges:
  authoringEdgeSchema[] }` where:
  - `authoringNodeSchema = { clientKey: z.string().min(1), label:
    z.enum(["UserJourney","Activity","Role"]) /* NOT Domain — C-02 delegation
    enforced at the schema boundary */, name: z.string().min(1), description:
    z.string().optional(), attributes: z.record(z.unknown()).optional(),
    existingId: z.string().uuid().optional() /* pick-existing global Role/node,
    FR-05 */, id: z.string().uuid().optional() /* N-01: re-run idempotency; the
    server mints when absent */ }`. **Precedence comment (N-03): if `existingId`
    is present it WINS — no import row emitted, `id` ignored; `id` alone is the
    re-run case.**
  - `authoringEdgeSchema = { type: z.enum(["PART_OF","EXECUTES","PRECEDES"]),
    from: z.string().min(1) /* clientKey OR existing UUID */, to:
    z.string().min(1), id: z.string().uuid().optional() /* N-01 re-run */ }`.
    (`Domain`/`System`/`Location` node labels and `USES_SYSTEM`/`AT_LOCATION`/
    `IN_MODEL`/lifecycle edges are deliberately **absent** — out of this spec's
    `must` set; wrong pairs surface as per-row `edge_endpoint_label_mismatch`,
    not a zod reject.)
  **Response** `authoringApplyResultSchema = { imported: {nodes:int, edges:int},
  errors?: [{section: z.enum(["nodes","edges"]), index:int, code:string,
  message:string, details?:record}], ids: { nodes: z.record(z.string().uuid())
  /* clientKey → UUIDv7 */, edges: z.record(z.string().uuid()) /* "<type>|<from>|<to>"
  → UUIDv7, N-02 canonical key */ } }`. `imported`+`errors` are `realImport`'s
  shape verbatim (C-03); `ids` is the additive N-04 echo. **No new schema is
  persisted** — these are request/response DTOs only (NFR-01).
- **Verification**: `shared/src/schema/__tests__/authoring.test.ts` — parse
  valid/invalid: `authoringApplySchema` **rejects a node row with
  `label:"Domain"`** (enum), accepts `UserJourney`/`Activity`/`Role`; a node row
  with both `existingId` and `id` parses (precedence resolved in the handler, not
  zod); `authoringEdgeSchema` rejects a `type` outside the three; the result
  schema round-trips `{imported, errors, ids}`.

### T-02 — Export `realImport` (the reuse seam)

- **Files** (1): `api/src/routes/import.ts` (modify)
- **Implements**: design §4.7 (OQ-1 (a)) — supports FR-07 (C-03)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-04
- **Steps**: Add the `export` keyword to `realImport`'s declaration (currently
  private at line 157). **This is the sole edit** — the function body, the
  `RowError` shape (`{section,index,code,message,details?}`), the two-phase
  collect-and-continue logic (incl. `phase1FailedIds`), and `handleImport`'s own
  use of it are all **byte-for-byte unchanged** (§4.7). No re-derivation of the
  phase-1/phase-2 blame set; no HTTP loopback (OQ-1 (b)/(c) rejected). Confirm
  `realImport(driver, payload)` accepts the `{nodes:[{id,label,name,…}],
  edges:[{id,type,fromId,toId}]}` `importPayloadSchema` shape T-04 assembles.
- **Verification**: `api/__tests__/import-realimport-export.test.ts` — imports
  `realImport` from `api/src/routes/import.ts` (proves it is now exported) and
  asserts it is a function; `handleImport`'s existing tests still pass unchanged
  (no behaviour regression); `bun run typecheck`.

### T-03 — Verify existing error codes (no new code)

- **Files** (0 source — assertion-only): `api/__tests__/authoring-openapi.integration.test.ts` (new, shared with T-13)
- **Implements**: design §5.3 (N-01 resolved) — supports FR-13
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-13
- **Steps**: **No `ERROR_CODES` edit.** Confirm on disk that `api/src/errors.ts`
  already contains `invalid_payload`, `attribute_violation`,
  `edge_endpoint_label_mismatch`, `model_not_found` (all four verified present in
  the design review). The endpoint reuses these exclusively: envelope parse →
  `invalid_payload`; per-row validation → `invalid_payload`/`attribute_violation`;
  per-row endpoint mismatch → `edge_endpoint_label_mismatch` (from `upsertEdge`);
  missing model → `model_not_found`. **Add no code** — an unreachable code would
  be a dead entry (§5.3, N-01). This task is a guard, not a change: it seeds the
  assertion that this spec's routes surface only pre-existing codes.
- **Verification**: folded into `api/__tests__/authoring-openapi.integration.test.ts`
  (T-13) — assert the four reused codes are members of `ERROR_CODES` and no new
  code was added by this spec (`git diff api/src/errors.ts` shows no addition);
  `bun run typecheck` (exhaustiveness assertion happy).

### T-04 — Authoring-apply handler (id-mint + assemble + realImport)

- **Files** (1): `api/src/routes/authoring.ts` (new — apply half)
- **Implements**: design §4.3, §4.5 — closes AC-05 (server), AC-06 (server),
  AC-08; supports FR-07, NFR-01, NFR-02, NFR-03
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-06, T-07, T-11, T-12, T-13
- **Steps**: `handleAuthoringApply(req, modelId)`:
  1. **No auth check** in the handler — the central router gate enforces
     `model:write` (house rule, NFR-04; mapping added in T-11).
  2. **Model existence**: `MATCH (m:BusinessModel {id:$modelId})` — absent →
     `404 model_not_found` (envelope-level, not a per-row error).
  3. **Parse** the body with `authoringApplySchema` (T-01) → envelope failure
     `400 invalid_payload` (mirrors `import`'s envelope behaviour).
  4. **Mint ids + assemble the import payload (C-04, N-03).** For each node row:
     if `existingId` is present → emit **no** import node row, map
     `clientKey → existingId` (precedence: `existingId` wins, N-03); else if `id`
     is present → emit an import node row with that `id` (re-run upsert), map
     `clientKey → id`; else mint a fresh `Bun.randomUUIDv7()` (the same generator
     the storage layer uses), emit the row with it, map `clientKey → uuid`. For
     each edge row: resolve `from`/`to` through the map (a token that is neither a
     known `clientKey` nor a UUID → per-row `invalid_payload` in `errors[]`); use
     `edge.id` if present else mint a UUIDv7; emit an `import`-shaped edge row
     `{id, type, fromId, toId}`. Assemble exactly the `{nodes:[{id,label,name,
     description?,attributes?}], edges:[{id,type,fromId,toId}]}` shape
     `importPayloadSchema` accepts. **Emit no `Domain` node, no `IN_MODEL` edge**
     (C-02) — `PART_OF` from a journey targets a `Domain` UUID that already
     exists + is `IN_MODEL`-scoped (its id travels as `to`).
  5. **Land it** via the **exported** `realImport(getDriver(), assembled)` (T-02)
     — the same two-phase collect-and-continue writer `POST /api/v1/import` uses;
     returns `{imported, errors?}` **verbatim** (C-03).
  6. **Respond** `200 {imported, errors?, ids}` where `ids.nodes` = the full
     `clientKey → uuid` map (existing-id rows included) and `ids.edges` =
     `"<type>|<from>|<to>" → uuid` (N-02 canonical key). Per `import`'s pinned
     C-09 decision, the response is **200 even when 100 % of rows fail** — row
     failures live in `errors[]`; `400` is reserved for the step-3 envelope parse
     (AC-08).
  **No new label/edge (NFR-01/AC-20):** the assembled payload only ever carries
  `UserJourney`/`Activity`/`Role` node rows + `PART_OF`/`EXECUTES`/`PRECEDES`
  edge rows; call **no** `createNodeLabel`/`createEdgeType`; edit **no**
  compile-time schema array.
- **Verification**: `api/__tests__/authoring-apply.integration.test.ts` (Neo4j):
  a `UserJourney` `PART_OF` a chosen domain persists; a **wrong pair** (e.g.
  `PART_OF` from `Activity`→`Role`) returns `200` with that row under
  `errors:[{section:"edges",index,code:"edge_endpoint_label_mismatch"}]` while
  valid rows persist (collect-and-continue — AC-05); a batch of one bad row →
  `200 {imported, errors:[{section,index,code}]}` (AC-08); each new node/edge
  carries a **server-minted UUIDv7** echoed in `ids`; **re-submitting the same
  step with the echoed ids upserts idempotently** (no duplicate node/edge — AC-08,
  C-04); no `IN_MODEL` edge is written; absent model → `404 model_not_found`.

### T-05 — Authoring-graph read (model-scoped, id-based projection)

- **Files** (1): `api/src/routes/authoring.ts` (extend — graph half)
- **Implements**: design §4.4, DD-01 (C-01: **id-based** shape) — supports FR-09,
  FR-12, NFR-03
- **Complexity**: complex
- **Blocked by**: T-04
- **Blocks**: T-08, T-14, T-15
- **Steps**: `handleAuthoringGraph(req, modelId)` (`GET /api/v1/models/:modelId/
  authoring/graph`, `model:read`):
  1. `404 model_not_found` if the `BusinessModel` is absent.
  2. Compute the model's scoped ids via **mwc's `scopedNodeIds(driver, modelId)`**
     (`api/src/storage/model-scope.ts` — consumed, not re-implemented). That set
     is only `Domain`/`UserJourney`/`Activity` (shared `Role`/`System`/`Location`
     are **excluded** by DEC-01(a)).
  3. Return the **id-based** projection (design-review C-01 decision — the route
     stays id-based; the column transform is T-15's client mapper): `{ journeys:
     [{id, name, domainId, activities:[{id, name, order}]}], roles:[{id, name,
     activityIds:[…]}] /* EXECUTES */, systems:[{id, name, activityIds:[…]}] /*
     USES_SYSTEM */, locations:[{id, name, activityIds:[…]}] /* AT_LOCATION */,
     precedes:[{fromActivityId, toActivityId}] }`. Journeys/activities are read by
     scoped-id membership; roles/systems/locations are read via
     `EXECUTES`/`USES_SYSTEM`/`AT_LOCATION` **from the in-scope activities** (they
     are global nodes, read but not scoped). `order` is the activity's position in
     its journey's `PRECEDES` chain (or its `createdAt` order when unordered).
     **This shape is id-only** — no columns (that is T-15).
- **Verification**: `api/__tests__/authoring-graph.integration.test.ts` (Neo4j):
  after an apply run, `GET …/authoring/graph` returns the model's journeys with
  their activities and each activity's roles/systems/locations by **id**; a wrong
  `:modelId` returns none of another model's journeys/activities (isolation
  smoke, full assertion in T-10); a global `Role` used by two models appears in
  both models' graphs (shared, not leakage); `404` on an absent model.

### T-06 — PWA api client (authoring block)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §7 (File Changes) — supports FR-07, FR-09
- **Complexity**: simple
- **Blocked by**: T-04, T-05
- **Blocks**: T-07, T-08
- **Steps**: Add an `authoring` block to the `api` object, reusing the existing
  `json<T>()` fetch wrapper: `apply(modelId, body: AuthoringApply)` (POST
  `…/authoring/apply`) and `graph(modelId, {signal?})` (GET `…/authoring/graph`).
  Types imported from `shared/src/schema/authoring.ts` (T-01). Reads accept an
  optional `signal`. **Do not** duplicate the mwc/story clients — the wizard
  calls `api.models.*`/`api.modules.*` (mwc) and `api.stories.*` (story-spec-core)
  as-is.
- **Verification**: `bun run typecheck`; consumed + asserted transitively by the
  wizard-step component tests (T-08 → `model-canvas-steps.test.tsx`).

### T-07 — Wizard step model + reducer (pure, in-memory)

- **Files** (2): `pwa/src/views/model/authoring/wizardModel.ts` (new),
  `pwa/src/views/model/authoring/__tests__/wizardModel.test.ts` (new)
- **Implements**: design §3.3 — supports FR-01, FR-12
- **Complexity**: moderate
- **Blocked by**: T-06
- **Blocks**: T-08, T-09
- **Steps**: Pure types + a reducer + `canAdvance`, **no I/O** (design §3.3):
  `WizardStep = "template"|"domains"|"journeys"|"activities"|"stories"`;
  `WIZARD_STEPS` in order; `WizardState { step, template:
  "blank"|"retail-clone"|null, committed:{ domainIds:string[], nodeIds:
  Record<clientKey,uuid>, edgeIds:Record<edgeKey,uuid> }, draft:record, error:
  {code,message}|null }`. The reducer handles `next`/`back`/`setTemplate`/
  `commitDomain`/`commitApply`(merges the `ids` echo into `committed`)/`setDraft`/
  `setError`. **Per-step validation gating (FR-01):** `canAdvance(state)` returns
  `false` when the current step's required draft field is empty (Step 1 needs a
  `template`; Step 2 needs `committed.domainIds.length>=1`; Step 3 needs ≥1
  journey; etc.) → Next disabled + inline message. `draft` is intentionally the
  **only** uncommitted state (not persisted across reload — OQ-3 / FR-12).
- **Verification**: `pwa/src/views/model/authoring/__tests__/wizardModel.test.ts`
  — `canAdvance` blocks Step 2 with zero domains and allows it with ≥1; `next`
  refuses to advance past a step where `canAdvance` is false; `commitApply` merges
  the `ids` echo into `committed.nodeIds`/`edgeIds` so a re-run resubmits the same
  ids (C-04); `setTemplate` sets the two-option choice; reducer is pure (no
  network import).

### T-08 — Wizard shell + steps (Template, Domains, Journeys, Activities×Roles)

- **Files** (3): `pwa/src/views/model/authoring/TemplateStep.tsx` (new),
  `pwa/src/views/model/authoring/DomainsStep.tsx` (new) +
  `pwa/src/views/model/authoring/JourneysStep.tsx` (new)
- **Implements**: design §4.1, §4.2, §4.5, §6 — closes AC-02, AC-03, AC-04
  (component half); supports FR-02, FR-03, FR-04, FR-05, FR-08
- **Complexity**: complex
- **Blocked by**: T-05, T-06, T-07
- **Blocks**: T-09, T-14
- **Steps** (three step components, catalog-first; wizard shell lives in T-14):
  - **TemplateStep (FR-02, FR-08, DD-04)**: exactly **two** options (XD-13) —
    **Blank** and **Clone retail reference** (assert no third). Blank → set
    `template="blank"`, advance to Step 2 with no structure. Clone
    (`template="retail-clone"`): (1) **ensure a target domain** (C-01) via mwc
    `POST /api/v1/models/:modelId/domains` (auto-create/name a "Retail" domain),
    push its id to `committed.domainIds`; (2) discover reference modules —
    `api.models.list()` → the `isReference:true` model; `api.modules.list()` →
    filter to modules whose `sourceModelId` = that id (DD-04); (3) **instantiate
    each** — `POST /api/v1/models/:activeModelId/module-instances` with
    `{moduleId, targetDomainId}` per module (version omitted → latest),
    count-agnostic loop; (4) advance to Step 3 with the cloned journeys listed
    (read via `api.authoring.graph`). **No published module → the clone option is
    disabled with an explanatory affordance** (not an error, FR-08). Touch **no**
    other module-lifecycle route.
  - **DomainsStep (FR-03, C-02)**: add/edit `Domain`s via mwc's `POST
    /api/v1/models/:modelId/domains` **only** (this spec does **not** create
    domains or write `IN_MODEL`); list existing model domains (incl. a
    clone-created "Retail"); `name` required, `description` optional; advancing
    blocked (inline message) until `committed.domainIds.length>=1`.
  - **JourneysStep (FR-04)**: add/edit `UserJourney`s each `PART_OF` a chosen
    active-model `Domain` via `api.authoring.apply` (edge row `{type:"PART_OF",
    from:"<journey clientKey>", to:"<domain id>"}`); `name` + parent domain
    required; cloned journeys appear pre-listed/editable; advancing needs ≥1
    journey. Merge the apply `ids` echo into `committed` (C-04).
  All use catalog components: `Card` shell, `Button` Next/Back, native inputs,
  `Typeahead` for the domain-parent picker; tokens-only CSS in `wizard.module.css`
  (T-14).
- **Verification**: `pwa/src/__tests__/model-canvas-template.test.tsx` — exactly
  two template options, no third (AC-02); Blank → Step 2 with no structure
  (AC-02); Clone (mocked mwc routes) discovers the `isReference` model + its
  `sourceModelId` modules and `POST …/module-instances` per module
  (count-agnostic, DD-04), advances to Step 3; no published module → option
  disabled, not error (AC-03). + `pwa/src/__tests__/model-canvas-steps.test.tsx`
  — Step 2 advance **blocked until ≥1 domain** with an inline message, domain
  created via mwc `POST …/domains` (mocked); Step 3 journey requires a parent
  domain (AC-04 component half).

### T-09 — Activities × Roles step (XD-18 core, pick-or-create-global role)

- **Files** (2): `pwa/src/views/model/authoring/ActivitiesRolesStep.tsx` (new),
  `pwa/src/views/model/authoring/StoriesStep.tsx` (new)
- **Implements**: design §4.5, §4.6 — closes AC-07 (component); supports FR-05,
  FR-06, XD-18
- **Complexity**: complex
- **Blocked by**: T-07, T-08
- **Blocks**: T-14
- **Steps**:
  - **ActivitiesRolesStep (FR-05, XD-18)**: for each `UserJourney`, add/edit
    `Activity`s (`PART_OF` the journey) via `api.authoring.apply`. Per activity,
    the **role picker is pick-or-create-*global*** (B-01, DEC-01(a)): a catalog
    `Typeahead` queries the **global** `Role` catalog (a `GET /api/v1/nodes`-style
    read — roles are **not** model-scoped); **picking** an existing role → an
    apply node row with `existingId` (no new node); **typing a new name** → a
    `label:"Role"` node row (creates a **global** `Role`). Wire `EXECUTES`
    (`{type:"EXECUTES", from:"<role clientKey|existingId>", to:"<activity
    clientKey>"}`). Optionally order two activities with `PRECEDES`. This is the
    named XD-18 path: create Activity → create/pick global Role → wire EXECUTES,
    end-to-end, from the UI; the server round-trip is proven in T-10 (AC-06).
  - **StoriesStep (FR-06, C-05)**: **"Generate stories from graph"** →
    `api.stories.bootstrap(modelId, {activityIds:[…the wizard's activity ids]})`
    (story-spec-core route). Returns `{created, skipped}`; **re-run on
    already-bootstrapped activities returns `created:0` and the step renders that
    as an idempotent "already generated" state surfacing both counts** (e.g.
    "0 new, N already generated"), **not** an error (C-05, AC-07). Inline manual
    story create + Given/When/Then AC create via `api.stories.*` /
    `api.stories.acs.*` — **this spec adds no story/AC route**. Editing a derived
    story/AC surfaces story-spec-core's `derived`-clears-on-edit guarantee (not
    re-implemented). Completing Step 5 returns to the canvas/review state (FR-09).
  All catalog components; tokens-only.
- **Verification**: `pwa/src/__tests__/model-canvas-stories-step.test.tsx`
  (mocked story routes) — bootstrap scoped to `activityIds`; derived story+AC
  appear editable; **re-run → `{created:0, skipped:N}` renders the idempotent
  "already generated" state (counts surfaced), not an error** (C-05); a manual
  story + G/W/T AC create call the story routes; no story/AC route added — **AC-07**.
  (The ActivitiesRolesStep UI is covered end-to-end by the server round-trip
  T-10/AC-06 and the shell test T-14/AC-01; the pick-or-create-global `Typeahead`
  behaviour is asserted in `model-canvas-steps.test.tsx` extended in T-14.)

### T-10 — Key-activity-per-role round-trip (XD-18 integration)

- **Files** (1): `api/__tests__/authoring-key-activity-per-role.integration.test.ts` (new)
- **Implements**: design §4.5, §4.3, XD-18 — closes AC-06; supports FR-05, NFR-03
- **Complexity**: complex
- **Blocked by**: T-04, T-05
- **Blocks**: —
- **Steps**: The XD-18 verification mandate as a **real-Neo4j** integration test
  (Risk 5 — not a mock). Seed a model + domain + journey API-only (mwc `POST
  /api/v1/models` + `POST …/domains` + `api.authoring.apply` for the journey).
  Then via `POST …/authoring/apply` in **one** batch: create an `Activity`
  (`PART_OF` the journey), **create a new global `Role`** (node row, no
  `existingId`) **and** in a second run **pick that existing global Role** (node
  row with `existingId`), wiring `EXECUTES` (`Role→Activity`) in each; add a
  `PRECEDES` between two activities. **Assert** the persisted
  `(:Role)-[:EXECUTES]->(:Activity)` edge exists and the **`Activity` end ∈
  `scopedNodeIds(driver, modelId)`** while the **`Role` end is NOT in the scoped
  set** (global, DEC-01(a)) — the edge round-trips **via the model-scoped
  `Activity`**, not a "model Role" (B-01). Assert the `PRECEDES` order round-trips
  (readable via `authoring/graph`).
- **Verification**: `api/__tests__/authoring-key-activity-per-role.integration.test.ts`
  (Neo4j) — **AC-06, XD-18**.

### T-11 — Router dispatch (authoring arms in the models* block)

- **Files** (1): `api/src/router.ts` (modify)
- **Implements**: design §5.1 — supports FR-07, FR-09
- **Complexity**: moderate
- **Blocked by**: T-04, T-05
- **Blocks**: T-12, T-13
- **Steps**: Inside the existing mwc `models*` dispatch block (`router.ts`,
  `sub.startsWith("models/")`), add **two** `sub.match(/…/)` arms, ordered
  **before** the generic `models/:id` arms so the literal `authoring/apply` /
  `authoring/graph` segments never collide with a `:id` (same multi-spec pattern
  story-spec-core uses in the same block):
  `^models\/([^/]+)\/authoring\/apply$` (POST → `handleAuthoringApply`) and
  `^models\/([^/]+)\/authoring\/graph$` (GET → `handleAuthoringGraph`). No
  per-route auth check (house rule — the gate handles it, T-12).
- **Verification**: covered by the route-surface integration tests
  (`authoring-apply`/`authoring-graph`) and by `api/__tests__/authoring-authz.test.ts`
  (T-12 — `getRoutePermission` resolves each new route, never `null`);
  `bun run typecheck`.

### T-12 — Route-permission mapping + authz test (three exercised families)

- **Files** (1): `api/src/auth/rbac-permissions.ts` (modify) +
  `api/__tests__/authoring-authz.test.ts` (new)
- **Implements**: design §5.2, §4.6 (C-06) — closes AC-10 (authz half); supports
  FR-14
- **Complexity**: moderate
- **Blocked by**: T-11
- **Blocks**: —
- **Steps**: In `rbac-permissions.ts`, add the **two** `ROUTE_PERMISSIONS` rows
  this spec **owns**, inserted **before** mwc's `models/:id` rows
  (specific → parameterized): `P("POST","models/:modelId/authoring/apply",
  "model:write")`, `P("GET","models/:modelId/authoring/graph","model:read")`.
  **Add no RBAC role or permission; re-map no existing route; no `public` route**
  (house rule, XD-08, NFR-04). The `business_architect` role already carries
  `model:read/write` + `module:read/write` + `story:read/write` (mwc FR-11 +
  story-spec-core FR-11), so the persona is fully covered — this spec grants
  nothing. The authz test asserts **all three** exercised permission families
  (C-06): (a) no `model:write` → 403 on `…/authoring/apply`, with it → 200; (b) no
  `module:write` → 403 on `…/module-instances` (the mwc-owned mapping, asserted
  **still in force**, not added here), with it → success; (c) **no `story:write`
  → 403 on `…/stories/bootstrap`** (story-spec-core mapping, asserted in force —
  the C-06/Deviations widening of AC-10); `business_architect` carries all three
  → a full run succeeds; `getRoutePermission` resolves each of this spec's two
  routes (never `null`); neither new route `isPublicRoute`.
- **Verification**: `api/__tests__/authoring-authz.test.ts` — the three-family
  403/allow assertions above + no `public` + `getRoutePermission` non-null
  (**AC-10 authz half**).

### T-13 — OpenAPI registration + code-presence assertion

- **Files** (1): `api/src/routes/openapi.ts` (modify) +
  `api/__tests__/authoring-openapi.integration.test.ts` (new, extends T-03)
- **Implements**: design §5.1, §5.3 — closes AC-10 (openapi half); supports FR-13
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-04, T-11
- **Steps**: In `openapi.ts`, `registerPath` the two authoring routes
  (`…/authoring/apply` POST, `…/authoring/graph` GET) and register their zod
  schemas (`authoringApplySchema`, `authoringApplyResultSchema`, T-01), generated
  from the same zod definitions (no hand-maintained copy, FR-13). The four reused
  `ERROR_CODES` members surface via the shared `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/authoring-openapi.integration.test.ts` — both
  authoring route paths appear in `GET /api/v1/openapi.json`; the four reused
  codes (`invalid_payload`, `attribute_violation`, `edge_endpoint_label_mismatch`,
  `model_not_found`) are present in the `ErrorEnvelope.code` enum; **no new code
  added** (`git diff api/src/errors.ts` empty for this spec — T-03) — **AC-10
  openapi half**.

### T-14 — ModelCanvas view: wizard shell + 4 states + view registration

- **Files** (3): `pwa/src/views/model/ModelCanvas.tsx` (new),
  `pwa/src/views/model/ModelCanvas.module.css` (new) +
  `pwa/src/views/model/authoring/wizard.module.css` (new)
- **Implements**: design §6, §3.3 — closes AC-01, AC-04 (component), AC-12, AC-13,
  AC-14, AC-16, AC-17; supports FR-01, FR-09, FR-11, FR-12, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-08, T-09
- **Blocks**: T-15, T-16, T-17
- **Steps**: **View registration** — in `pwa/src/views/index.tsx`, **replace** the
  `model` surface's `canvas` tab dispatch (`ModelTabPlaceholder`) with `"canvas":
  (r) => <ModelCanvas route={r} />` — the **only** edit to that file
  (`route.ts`/`SURFACES` stay mwc's). `ModelCanvas` reads the active
  `BusinessModel` from **`useActiveModel()`** (`pwa/src/context/
  ActiveModelContext.tsx` — **does not re-implement model selection**); with **no
  active model** it shows a pick/create-a-model prompt linking `#/model/models`
  (AC-01). It hosts the **wizard shell** (step indicator `<ol>` + `Card`, `Button`
  Next/Back, the T-08/T-09 step components), keyed on `activeModel.id`, and fetches
  `api.authoring.graph(modelId)`. **All four states (UX-01, FR-11):** **loading**
  skeleton via `Loading` (`views/_shared.tsx`) while the graph fetch is pending
  (AC-12); **empty** (no domains/journeys) → an empty-state `Card` whose primary
  affordance **opens the wizard on Step 1 (Template)** (AC-13); **error** (a fetch
  or authoring write failed) → `ErrorState` **plus a local `<Button
  onClick={retry}>`** that refetches/re-submits and **does not discard** the
  in-progress wizard step's `draft` fields (AC-14; `ErrorState` renders no retry
  itself — follow story-spec-core's C-03 pattern); **ready** = the wizard flow
  and/or (T-15) the populated review canvas. **Keyboard/a11y (AC-17, UX-05):** Tab
  reaches template options → step inputs → Next/Back in DOM order; per-step
  validation blocks Next with a **focusable** inline error (focus moves to it);
  ARIA landmark on the view; the step indicator announces the current step
  (`aria-current`/live region). **Tokens (AC-16, UX-02):** `ModelCanvas.module.css`
  + `wizard.module.css` use only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; catalog components before new ones.
- **Verification**: `pwa/src/__tests__/model-canvas.test.tsx` — `#/model/canvas`
  → `ModelCanvas` (**not** `ModelTabPlaceholder`); wizard opens Step 1 reading
  `useActiveModel()`; no active model → pick/create prompt (AC-01). +
  `pwa/src/__tests__/model-canvas-states.test.tsx` — loading skeleton (AC-12);
  empty → wizard Step 1 (AC-13); error → retry that refetches/re-submits and
  preserves in-progress `draft` fields (AC-14). + **CLI** (AC-16, deterministic
  exit code): `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/ModelCanvas.tsx`, then the same `--view` on
  `ModelCanvas.module.css` and `pwa/src/views/model/authoring/wizard.module.css`
  — each **expect** exit 0, zero token/component violations. + **manual** (AC-17,
  keyboard): with the stack up, load `#/model/canvas`, keyboard-only — Tab to a
  template option and Enter, Tab through Step 2 to "Next" and Enter with an empty
  required field — **expect** Next blocked and focus moves to the inline error;
  complete the field and Enter — **expect** advance to Step 3.

### T-15 — JourneyData mapper (id→column) + review canvas (resolves review C-01)

- **Files** (2): `pwa/src/views/model/authoring/toJourneyData.ts` (new),
  `pwa/src/views/model/authoring/__tests__/toJourneyData.test.ts` (new)
- **Implements**: design §4.4 + **design-review C-01 decision** — closes AC-11;
  supports FR-09
- **Complexity**: complex
- **Blocked by**: T-05, T-14
- **Blocks**: T-17
- **Steps**: **The C-01 seam, its own task with a DoD.** `toJourneyData(graph:
  AuthoringGraph, journeyId: string): JourneyData` maps the **id-based**
  `authoring/graph` response (T-05) into the real **column-index-based**
  `JourneyData` (`pwa/src/components/JourneyCanvas.tsx` — verified shape:
  `ActivityNode{id,name,column}`, `RoleNode{columns:number[],durations}`,
  `SystemNode{usages:[{column}]}`, `LocationNode{columns:number[]}`,
  `PrecedesEdge{from_col,to_col}`). Algorithm: (1) take the journey's activities,
  **assign one column each ordered by `order`** (its `PRECEDES` position; ties by
  `createdAt`) → `column` per activity id; (2) for each role/system/location,
  resolve its `activityIds` (from the graph) that belong to **this** journey →
  their columns (`RoleNode.columns`/`LocationNode.columns`/`SystemNode.usages`);
  (3) map `precedes` id-pairs whose **both** ends are in this journey →
  `{from_col,to_col}`; **drop cross-journey `PRECEDES`** (outside the single-journey
  lane model). `durations`/`target_ms` are left empty (KPI is out of scope —
  `kpi-impact-mapping`). **The review canvas** in `ModelCanvas` (ready state,
  AC-11) renders one `JourneyCanvas data={toJourneyData(graph, j.id)}` per
  journey; multi-journey models use `JourneyCanvas`'s existing **`"multi"`
  `LayoutMode`** (verified present). An **"Edit in wizard"** affordance reopens
  the wizard at the relevant step (FR-09). No new canvas component is invented
  (blueprint Risks row 6 — JourneyCanvas reused).
- **Verification**: `pwa/src/views/model/authoring/__tests__/toJourneyData.test.ts`
  — a fixture `authoring/graph` response with two ordered activities, a role
  executing both, a system on one, and a `PRECEDES` between them maps to a
  `JourneyData` where the activities have columns `0,1`, the role's `columns` are
  `[0,1]`, the system's `usages` column is the right one, and the `PrecedesEdge`
  is `{from_col:0,to_col:1}`; a cross-journey `PRECEDES` is dropped. **DoD: the
  mapper output type-checks against the imported `JourneyData` interface** (not a
  local re-declaration). + `pwa/src/__tests__/model-canvas.test.tsx` (extended,
  AC-11) — ready state renders the authored structure on `JourneyCanvas` from
  `authoring/graph` via `toJourneyData`; "Edit in wizard" reopens at the relevant
  step.

### T-16 — Model-isolation integration test

- **Files** (1): `api/__tests__/authoring-model-scope.integration.test.ts` (new)
- **Implements**: design §4.4 isolation, NFR-03 — closes AC-18 (server half);
  supports FR-12
- **Complexity**: moderate
- **Blocked by**: T-04, T-05
- **Blocks**: —
- **Steps**: Seed **two** models (API-only: `POST /api/v1/models` + `POST
  …/domains` + `POST …/authoring/apply` per model). Run a full authoring batch on
  **model A** (domains/journeys/activities + `PART_OF`/`EXECUTES`/`PRECEDES`).
  Assert `GET /api/v1/models/:modelB/authoring/graph` returns **none** of A's
  **model-scoped** structure (`Domain`/`UserJourney`/`Activity`). **Explicitly
  exclude `Role` from the isolation assertion:** a global `Role` created during
  A's run **is** visible to B by design (DEC-01(a), B-01) — the test asserts A's
  `Domain`/`UserJourney`/`Activity` are invisible to B, **not** its roles. Assert
  the `authoring/apply` write on A never mutated B's scoped structure.
- **Verification**: `api/__tests__/authoring-model-scope.integration.test.ts`
  (Neo4j) — **AC-18 server half, B-01**.

### T-17 — Deep-link + active-model reload e2e; clone + isolation UI

- **Files** (1): `pwa/playwright/model-canvas-context.spec.ts` (new)
- **Implements**: design §6 (active-model + reload) — closes AC-18 (component
  half), AC-19; supports FR-12, UX-06
- **Complexity**: moderate
- **Blocked by**: T-14, T-15
- **Blocks**: —
- **Steps**: Playwright spec. Seed via the API (models + domains + a small
  authored structure). (1) **AC-19**: with a non-reference model **B** active,
  navigate to `#/model/canvas`, **reload** → the same route renders `ModelCanvas`
  for **model B** (active-model persistence is mwc FR-15; this view refetches);
  uncommitted wizard input is **not** restored (committed graph state is). (2)
  **AC-18 component half**: switch the active model → the wizard/canvas **reset/
  refetch** for the new model (no cross-model leakage of model-scoped structure in
  the rendered canvas).
- **Verification**: `pwa/playwright/model-canvas-context.spec.ts` — deep-link +
  reload renders `ModelCanvas` for the persisted model B; switching the active
  model refetches (**AC-18 component half, AC-19**).

## Cross-cutting verification (whole-spec)

- **AC-20** (transpile clean + no compile-time schema-array edit): `bun run
  typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS`/
  `EDGE_ENDPOINTS`; grep confirms this spec's code (`api/src/routes/authoring.ts`,
  the wizard) calls **no** `createNodeLabel`/`createEdgeType`. Not a standalone
  task — checked at the final validation sweep (verify after T-04/T-14).
- **AC-09** (clone uses only mwc module routes; lifecycle guard intact):
  `api/__tests__/authoring-template-clone.integration.test.ts` — the clone path
  issues only `GET /api/v1/modules` + `POST …/module-instances`; a generic
  node/edge write to lifecycle state still returns `409
  model_lifecycle_route_required` (mwc guard, asserted **intact**). Covered by the
  clone assertions in T-08's route-facing integration setup; if a standalone file
  is cleaner at execution time, the execution agent may split it out — the
  **verification path above is authoritative** for AC-09.
- **AC-15 (should — canvas polish, FR-10)**: **not implemented in the `must`
  scope** (blueprint Risks row 6; NFR-06). If FR-10 is delivered, verify —
  `manual:` with the stack up + a populated model, load `#/model/canvas`,
  trackpad-drag an activity node onto a new position — **expect** the `PRECEDES`
  order persists (re-fetch via `authoring/graph` shows the new order) and the
  page does **not** scroll under the drag; then keyboard-only focus an activity
  and press the documented move-up/down key — **expect** the same reorder
  persists. Explicitly out of the `must` deliverable set.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-08, T-09, T-14, T-15) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css` gets its own invocation (enforced `--view`) |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-20 sweep + AC-20 (`git diff` NODE_LABELS/EDGE_ENDPOINTS + grep no `createNodeLabel`/`createEdgeType`) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 wizard shell + step gating | T-07, T-14 | AC-01, AC-17 |
| FR-02 template choice + clone target-domain | T-08 (TemplateStep) | AC-02, AC-03 |
| FR-03 domains via mwc route | T-08 (DomainsStep) | AC-04 |
| FR-04 journeys PART_OF domain | T-04, T-08 (JourneysStep) | AC-05 |
| FR-05 activities × roles, pick-or-create-global | T-04, T-09, T-10 | AC-06 |
| FR-06 stories via story-spec-core | T-09 (StoriesStep) | AC-07 |
| FR-07 batched authoring write (realImport reuse) | T-01, T-02, T-04, T-06 | AC-05, AC-08 |
| FR-08 clone via module instantiation | T-08 (TemplateStep) | AC-03, AC-09 |
| FR-09 ModelCanvas review surface | T-05, T-14, T-15 | AC-11 |
| FR-10 canvas direct-manip (should) | — (deferred, NFR-06) | AC-15 (should) |
| FR-11 four view states | T-14 | AC-12, AC-13, AC-14 |
| FR-12 model-scoped + reload survival | T-05, T-07, T-14, T-16, T-17 | AC-18, AC-19 |
| FR-13 route in openapi, existing codes | T-01, T-03, T-13 | AC-10 |
| FR-14 route-permission mapping | T-11, T-12 | AC-10 |
| NFR-01 no new schema/store | T-01, T-04 | AC-08, AC-20 |
| NFR-02 reuse, never re-spec | T-02, T-04, T-08, T-09 | AC-08, AC-09 |
| NFR-03 model isolation (scoped structure only) | T-05, T-10, T-16 | AC-06, AC-18 |
| NFR-04 house rules | T-11, T-12, all | AC-10, AC-20 |
| NFR-05 tokens-only + conformance | T-08, T-09, T-14, T-15 | AC-16 |
| NFR-06 wizard-first sizing (should gated out) | T-14 (must) vs FR-10 (should) | AC-15 (should) |
</content>
</invoke>
