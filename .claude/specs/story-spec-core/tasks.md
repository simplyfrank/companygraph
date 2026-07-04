---
feature: "story-spec-core"
created: "2026-07-04"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: "revised (2026-07-04)"
reviewing_design_revision: "draft (2026-07-04), design-review pass 1 = approve (0 blockers, 4 concerns, 3 nits)"
size: "large"
total_tasks: 16
---

# Tasks: story-spec-core

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every file the
  task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css`
  gets its own invocation.
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run under
  `bun test`.

## Hard build-order precondition (design §1.1)

Every `model-workspace-core` surface this spec consumes is a **new file that
does not exist on disk until that spec merges**: `api/src/storage/model-scope.ts`
(`scopedNodeIds`), `api/src/scripts/seed-rbac-roles.ts` (the `business_architect`
role + `RBAC_ROLES` array), `api/src/scripts/register-model-labels.ts`
(`registerModelSchema`, called first in `applySchema`),
`pwa/src/context/ActiveModelContext.tsx` (`useActiveModel`),
`pwa/src/views/model/ModelTabPlaceholder.tsx` + the `stories` slot in
`pwa/src/views/index.tsx` `renderView`, and `POST /api/v1/models/:id/domains`
(`attachDomain`, used by the integration fixtures). **T-01 must not start until
`model-workspace-core` has merged.** Every task below binds to the real files
once they land; the design cites their approved signatures (design §3.1, §4.1,
§4.6, §4.8, §4.10).

## Design-review carry-forwards (design-review pass 1 = approve; 4 concerns, 3 nits)

`review-design.md` closed **approve** with 0 blockers. The four concerns and
three nits are corrections of *rationale/wording* and one contract choice (C-04)
— none changes the architecture. Each is landed here as a binding decision so the
execution agent does not re-derive it.

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **C-01** — DD-04/§3.5/§9's "adding an unreachable code would break `envelope.test.ts` reachability" rationale is **false**: there is no `envelope.test.ts`, and no test asserts every `ERROR_CODES` member is thrown by a live route (`api/__tests__/ontology-envelope.test.ts` is over the *different* `ONTOLOGY_ERROR_CODES` enum; `openapi.integration.test.ts` asserts the *opposite* — every `ERROR_CODES` member must appear in the OpenAPI enum). | The **outcome stands** (activity→story is `1..*` per FR-03, so no route emits `story_duplicate_for_activity`; it is omitted to avoid a dead code). The **rationale is corrected**: `ERROR_CODES` is generated straight into the OpenAPI enum, so adding a code would *not* fail any test — the code is simply omitted because it is unreachable under the `1..*` default. **Do NOT add a task/step that "verifies `envelope.test.ts` still passes"** — that constraint does not exist. | T-04 (no `story_duplicate_for_activity` added), T-05 (`POST /stories` has no duplicate check) |
| **C-02** — parity harness wording couples to a non-existent client `createdAt`/column-order concept. Verified: `formulateUserStories` (`pwa/src/lib/userStories.ts`) picks `roles.filter(r => r.columns.includes(activity.column))[0]` — pure **array-index order** within the filtered list; `JourneyData` has no `createdAt`. | The parity fixture is built so the **projected `JourneyData` `roles`/`locations` arrays are ordered such that array-index-0 is the same node the server selects by `createdAt`-then-`id`**. No behaviour change; the projection is the coupling point, not a client createdAt/column primacy. | T-06 (parity harness) |
| **C-03** — `ErrorState({ message })` (`pwa/src/views/_shared.tsx`) renders **no retry affordance**; §4.10/§6 imply one. | AC-14's retry control is a **local `<Button onClick={refetch}>` rendered by `StoryCatalog` alongside `ErrorState`**, not inside `ErrorState`. `ErrorState` is not modified. | T-14 (error state), T-15 (states test) |
| **C-04** — §4.2's "bad `roleId` → `400 story_activity_required` (or reuse `not_found`)" is half-decided and reuses an *activity*-named code for a *role* failure. | **Decision (design-review recommendation (a)):** a supplied `roleId` that is absent or not a `Role` returns the existing generic **`404 not_found`** with `details.field:"roleId"`. **No new `story_role_required` code.** `story_activity_required` is reserved strictly for the `activityId` precondition. | T-05 (`createStory`/`patchStory`), T-03 (AC-03 assertion) |
| **N-01** — `createNodeLabel`/`createEdgeType` take a required `actor` arg the design's `registerStorySchema(driver)` prose omits. Verified: both are `(driver, input, actor)`. | `registerStorySchema(driver)` passes `actor = "system:story-spec"` to every `createNodeLabel`/`createEdgeType` call. | T-02 |
| **N-02** — §7 file-changes table omits the test files listed in §8. | The per-task Verification fields below are the authoritative list of test files (they are the "test files (per §8)" rows). No behaviour change. | all tasks |
| **N-03** — AC-15 manual→CLI promotion is a requirements deviation needing errata treatment (as `model-workspace-core` did via a Deviations note). | Recorded in **Deviations from requirements** below; AC-15 executes as a **CLI** check (deterministic exit code). Orchestrator lands it as a requirements errata; no behaviour change. | T-14, Deviations |

## Deviations from requirements (orchestrator: land as errata, no ID renumbering)

| Requirement text | Executed as | Why | Source |
|------------------|-------------|-----|--------|
| AC-15 `manual: run … design-conformance.ts …` | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | It is a deterministic script with an exit code; design §8 "AC-15 promotion", design-review N-03 | requirements N-02, design §8 |
| DD-02 / OQ-2 — bootstrap generates **one derived starter AC per story** | **Executed as the recorded default** | Keeps XD-09's "generate-then-edit" spirit strongest; switching to story-only is a one-line change (skip the AC create). **The orchestrator may still surface OQ-2 to the user before execution.** | design DD-02, requirements OQ-2 |

## Task list

### T-01 — Story/AC zod schemas (shared)

- **Files** (1): `shared/src/schema/story-spec.ts` (new)
- **Implements**: design §3.1, §3.2, §5 — supports FR-01, FR-02, FR-05, FR-06,
  FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: — (but see the hard build-order precondition — do not start
  until `model-workspace-core` merges)
- **Blocks**: T-03, T-04, T-05, T-07, T-08, T-11, T-16
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US identifiers).
  **Story**: `storyCreateSchema` = `{ persona: z.string().min(1), action:
  z.string().min(1), benefit: z.string().min(1), activityId: z.string().min(1),
  roleId: z.string().min(1).optional(), description: z.string().optional(),
  attributes: z.record(z.unknown()).optional() }` — **`narrative` is NOT a
  client field** (server-assembled, §4.2); `storyPatchSchema` = all of
  `persona`/`action`/`benefit`/`description`/`attributes`/`activityId`/`roleId`
  optional (omitted → unchanged); `storyReadSchema` = envelope + the six props
  (`persona`, `action`, `benefit`, `narrative`, `derived`, `sourceActivityId`) +
  `activityId`/`activityName`, `roleId?`/`roleName?`, `acCount:int`,
  `detached:boolean` (list rows; detail additionally embeds
  `acceptanceCriteria: acReadSchema[]`). **AC**: `acCreateSchema` = `{ given:
  z.string().min(1), when: z.string().min(1), then: z.string().min(1), ordinal:
  z.number().int().positive().optional() }` (the three `.min(1)` are the single
  NFR-03 enforcement point); `acPatchSchema` = `{ given?, when?, then?, ordinal? }`
  with each clause still `.min(1)` when present; `acReadSchema` = envelope + the
  five props (`given`, `when`, `then`, `ordinal`, `derived`). **Bootstrap**:
  `bootstrapRequestSchema` = `{ activityIds: z.array(z.string().min(1)).optional() }`;
  `bootstrapResultSchema` = `{ created: z.number().int().nonnegative(), skipped:
  z.number().int().nonnegative() }`.
- **Verification**: `shared/src/schema/__tests__/story-spec.test.ts` — parse
  valid/invalid payloads; `storyCreateSchema` rejects a body missing `activityId`
  and **rejects a client-supplied `narrative`** (unknown key stripped or the
  assembled field is server-only); `storyPatchSchema.parse({})` is valid
  (all-optional); `acCreateSchema` rejects a body missing any of `given`/`when`/
  `then` and rejects an empty-string clause; `bootstrapRequestSchema.parse({})`
  is valid.

### T-02 — Register story labels + edges (idempotent) + boot wiring

- **Files** (3): `api/src/scripts/register-story-labels.ts` (new),
  `api/src/neo4j/bootstrap.ts` (modify), `package.json` (modify)
- **Implements**: design §4.6, §7 — closes AC-01, AC-02; supports FR-01, FR-02,
  FR-03, FR-04, NFR-01
- **Complexity**: moderate
- **Blocked by**: — (hard build-order precondition applies)
- **Blocks**: T-04, T-05, T-07
- **Steps**: `registerStorySchema(driver)` calls, **passing `actor =
  "system:story-spec"` to every registry call (resolves review N-01)**: two
  `createNodeLabel` (`UserStory`, `AcceptanceCriterion`; permissive
  `json_schema_doc: {}`) **then** three `createEdgeType` — `DESCRIBES_ACTIVITY`
  (`UserStory → Activity`), `STORY_FOR_ROLE` (`UserStory → Role`),
  `ACCEPTANCE_OF` (`AcceptanceCriterion → UserStory`) with their `_OntologyEdgeEndpoint`
  pairs (design §3.3). Each call is wrapped to swallow `409 name_conflict`
  (already-registered) → **idempotent**. Nodes-before-edges is required because
  `createEdgeType` runs `assertEndpointLabelsExist` (verified in
  `edge-types.ts`). Do **not** touch `NODE_LABELS`/`EDGE_ENDPOINTS` consts
  (NFR-01). In `applySchema` (`api/src/neo4j/bootstrap.ts`): call
  `registerStorySchema` **after** `model-workspace-core`'s `registerModelSchema`
  and after the core-label seed (so `Activity`/`Role`/`UserStory` all exist when
  the edge endpoints are checked). Add a `register:story` script to
  `package.json` invoking `registerStorySchema` standalone.
- **Verification**: `api/__tests__/story-labels.integration.test.ts` (labels
  appear in `GET /api/v1/schema`; `NODE_LABELS` unchanged; re-run adds no
  duplicate label rows — AC-01) + `api/__tests__/story-edges.integration.test.ts`
  (the three edges register via `createEdgeType`; a wrong pair — e.g.
  `DESCRIBES_ACTIVITY` from `UserStory`→`Role` — returns `400
  edge_endpoint_label_mismatch`; `EDGE_ENDPOINTS` const unchanged — AC-02).

### T-03 — Additive error codes

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.5 — closes part of FR-10
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-05, T-07, T-09
- **Steps**: Append **four** additive codes to the closed `ERROR_CODES` array
  (NFR-11; no existing code removed/reordered): `story_not_found` (404),
  `acceptance_criterion_not_found` (404), `story_activity_required` (400),
  `acceptance_criterion_clause_required` (400). **Do NOT add
  `story_duplicate_for_activity`** (design DD-04 — unreachable under the `1..*`
  default; resolves review C-01: it is omitted because it is a dead code, *not*
  because a reachability test would fail — no such test exists). A supplied bad
  `roleId` reuses the **existing** generic `not_found` (design-review C-04, T-05)
  — no new role code. Keep the exhaustive assertion in `errors.ts` happy.
- **Verification**: `api/__tests__/story-openapi.integration.test.ts` (jointly
  with T-12) asserts each of the four new codes is a member of `ERROR_CODES` and
  appears in the OpenAPI `ErrorEnvelope.code` enum; `bun run typecheck` passes
  the exhaustiveness assertion.

### T-04 — Pure story derivation module (Neo4j-free)

- **Files** (1): `api/src/derive/story-derive.ts` (new)
- **Implements**: design §4.5, DD-01 — closes AC-06 (server half); supports FR-08,
  NFR-04
- **Complexity**: moderate
- **Blocked by**: T-01, T-02
- **Blocks**: T-06, T-07
- **Steps**: `deriveStories(inputs: DeriveActivityInput[]): DerivedStory[]` — a
  **pure, I/O-free** port of `formulateUserStories` (`pwa/src/lib/userStories.ts`);
  opens **no** Neo4j session (DD-01 — keeps AC-06 unit-only). Input shape per
  design §4.5 (`activity`, `roles`, `systems`, `locations` each with
  `id`/`name`/`createdAt`, and per-activity `journeyName: string | null`). Per
  activity: **deterministic primary** `Role`/`Location` = lowest `createdAt`, then
  lowest `id` (resolves requirements B-02 tiebreak); `persona =
  primaryRole?.name ?? "user"`; `action = activity.name`; `benefit = "the " +
  journeyName.toLowerCase() + " workflow completes"` when a parent journey
  exists, else **orphan fallback** `benefit = "the workflow completes"` (no
  journey token — resolves requirements C-03, keeps derivation total); `narrative
  = "As a <persona>, I want to <action>, so that <benefit>."`.
- **Verification**: `api/__tests__/story-derive-parity.test.ts` (also T-06) — the
  orphan-fallback narrative case (`"…so that the workflow completes."`) is
  Neo4j-free and asserted here; full client-parity assertion lands in T-06 (same
  file).

### T-05 — Story CRUD storage (top-level props, cascade, derived-clear)

- **Files** (1): `api/src/storage/stories.ts` (new — story half)
- **Implements**: design §4.1, §4.2, §4.4, DD-03, DD-05 — closes AC-03, AC-05;
  supports FR-05, FR-07, NFR-02
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03
- **Blocks**: T-07, T-08, T-11
- **Steps**: Import `scopedNodeIds` from `api/src/storage/model-scope.ts`
  (`model-workspace-core` — consumed, never re-implemented). Story domain fields
  are **top-level Neo4j properties, not `attributes_json`** (DD-03) — write them
  via this module's own parameterized Cypher; the generic `createNode`/`patchNode`
  primitives stay **byte-for-byte unchanged**.
  - `listStories(driver, modelId)` — §4.1 Cypher: `MATCH
    (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity) WHERE a.id IN
    $scopedActivityIds` (the scoped set from `scopedNodeIds(driver, modelId)`),
    OPTIONAL `STORY_FOR_ROLE` + AC count, `ORDER BY s.createdAt ASC`;
    `detached` always `false` on a list row.
  - `createStory(driver, modelId, input)` — (1) confirm `input.activityId` ∈
    `scopedNodeIds(driver, modelId)` **and** is labelled `Activity` (miss → `400
    story_activity_required`); when `roleId` supplied, confirm it is a `Role`
    else **`404 not_found` with `details.field:"roleId"`** (resolves review C-04
    — no new code, no reuse of `story_activity_required` for a role failure).
    (2) assemble `narrative` server-side. (3) `CREATE (s:UserStory {…envelope…,
    persona, action, benefit, narrative, derived:false, sourceActivityId})`.
    (4) wire `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when `roleId`) via the
    existing `createEdge` primitive (runs the endpoint-label whitelist for free).
    → `201` + `storyReadSchema` (`acCount:0`, `detached:false`).
  - `getStory(driver, modelId, storyId)` — resolve by id, verify its
    `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(modelId)` else `404
    story_not_found` (a story of another model is *not found* here — no
    cross-model read); embed ACs `ORDER BY ac.ordinal ASC`; compute `detached`
    (activity unresolved).
  - `patchStory(driver, modelId, storyId, patch)` — model-membership check;
    dynamic SET of supplied fields (omitted untouched, mirrors `patchNode`);
    re-assemble `narrative` if any of persona/action/benefit changed; re-point
    `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE` when `activityId`/`roleId` supplied
    (new `activityId` re-validated scoped; bad `roleId` → `404 not_found`,
    field `roleId`); **always `SET s.derived = false`** (DD-05 — enforced in
    storage, not the route). → `200`.
  - `deleteStory(driver, modelId, storyId)` — model-membership check, then the
    **single-transaction cascade** (design §4.4): `MATCH (s:UserStory
    {id:$storyId}) OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
    DETACH DELETE ac, s` — drops the ACs + all three edge types in one tx; the
    story's `Activity`/`Role` survive. → `204`.
  - **No duplicate check on `createStory`** (DD-04 / review C-01 — `1..*`).
- **Verification**: `api/__tests__/story-crud.integration.test.ts` — create →
  201 + UUIDv7 + server-assembled `narrative` + `DESCRIBES_ACTIVITY` (and
  `STORY_FOR_ROLE` when `roleId`); a bad `roleId` → **`404 not_found` field
  `roleId`** (C-04); a missing/unscoped `activityId` → `400
  story_activity_required`; list scoped to the model; detail embeds ACs by
  `ordinal`; PATCH preserves omitted fields, re-assembles `narrative`, flips
  `derived`→false; DELETE → 204 (AC-03). Cascade covered in
  `api/__tests__/story-cascade.integration.test.ts` — DELETE story removes ACs +
  all three edge types in one tx (no orphan ACs, no dangling edges); the story's
  `Activity`/`Role` are **not** deleted (AC-05). Fixture domains/activities
  created API-only via `model-workspace-core`'s `POST /api/v1/models` +
  `POST /api/v1/models/:id/domains` + core `POST /api/v1/nodes`/`journeys`
  (design §8 — no direct-driver seeding).

### T-06 — AC CRUD storage + derivation parity harness

- **Files** (2): `api/src/storage/stories.ts` (extend — AC half),
  `api/__tests__/story-derive-parity.test.ts` (extend — parity assertion)
- **Implements**: design §4.3, §4.5, NFR-03, DD-05 — closes AC-04, AC-06;
  supports FR-06
- **Complexity**: complex
- **Blocked by**: T-04, T-05
- **Blocks**: T-07, T-08
- **Steps**: **AC CRUD** in `stories.ts` (top-level props, DD-03):
  - `createAc(driver, modelId, storyId, input)` — verify the parent story exists
    **and** is in `:modelId` (§4.2 membership) else `404 story_not_found`;
    allocate `ordinal = coalesce(max(existing.ordinal),0)+1` in-tx when omitted;
    `CREATE (ac:AcceptanceCriterion {…, given, when, then, ordinal,
    derived:false})` then `createEdge` `ACCEPTANCE_OF`. → `201`.
  - `listAcs(driver, modelId, storyId)` — parent-in-model check; `MATCH
    (ac)-[:ACCEPTANCE_OF]->(s {id:$storyId}) RETURN ac ORDER BY ac.ordinal ASC`.
  - `patchAc(driver, modelId, storyId, acId, patch)` — verify story-in-model
    **and** the AC is under that story (`(ac {id:$acId})-[:ACCEPTANCE_OF]->(s
    {id:$storyId})`) else `404 acceptance_criterion_not_found`; dynamic SET of
    supplied `given`/`when`/`then`/`ordinal`; **`SET ac.derived=false`** (DD-05).
    Reorder (FR-13) is a `PATCH …/:acId {ordinal}` — no dedicated route. → `200`.
  - `deleteAc(driver, modelId, storyId, acId)` — same membership check; `DETACH
    DELETE ac`. → `204`.
  - **NFR-03 enforcement** is the zod `.min(1)` on each clause (T-01); the route
    handler (T-09) maps that failure to `acceptance_criterion_clause_required`.
  **Parity harness** (extend the T-04 test file, resolves review C-02): declare
  one **canonical single-journey structural fixture**; map it to (a)
  `DeriveActivityInput[]` for `deriveStories` and (b) a `JourneyData` projection
  for `formulateUserStories(projected, journeyName)` where **the projected
  `roles`/`locations` arrays are ordered so array-index-0 is the same node the
  server selects by `createdAt`-then-`id`** (C-02 — `formulateUserStories` picks
  `filtered[0]` by array-index order; there is no client `createdAt`/column
  primacy to match). Assert **equal `narrative` strings** per activity and the
  same primary role/location. Single-journey keeps the client's one `journeyName`
  argument well-defined.
- **Verification**: `api/__tests__/acceptance-criteria-crud.integration.test.ts`
  — create requires all three clauses (a missing/empty clause → `400
  acceptance_criterion_clause_required`); `ordinal = max+1` when omitted; list
  ASC; PATCH edits a clause and clears `derived`; DELETE → 204; a bad parent
  story → `404 story_not_found`; an AC id not under the named story → `404
  acceptance_criterion_not_found` (AC-04). Parity:
  `api/__tests__/story-derive-parity.test.ts` — `deriveStories(structuralFixture)`
  and `formulateUserStories(projectedFixture, journeyName)` yield equal
  narratives + same primary role/location (AC-06, unit — no Neo4j).

### T-07 — Bootstrap endpoint storage (derive → persist editable nodes)

- **Files** (1): `api/src/storage/stories.ts` (extend — `bootstrapStories`)
- **Implements**: design §4.5, DD-02 — closes AC-07; supports FR-09
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-06
- **Blocks**: T-08, T-11
- **Steps**: `bootstrapStories(driver, modelId, opts?)`:
  1. Compute the scoped activity id set = `scopedNodeIds(driver, modelId)`
     filtered to `Activity`. Optional `opts.activityIds` narrows to those ids
     (each must be a scoped activity of `:modelId`, else `400
     story_activity_required`).
  2. **Skip rule (DD-04)**: drop any activity with ≥1 existing
     `DESCRIBES_ACTIVITY` story (`WHERE NOT EXISTS {
     (:UserStory)-[:DESCRIBES_ACTIVITY]->(a) }`) — re-running never
     double-derives (`skipped` counts these).
  3. For each remaining activity, read its structural neighborhood (roles via
     `EXECUTES`, systems via `USES_SYSTEM`, locations via `AT_LOCATION`, **parent
     journey per-activity** via `PART_OF`) into `DeriveActivityInput`, then call
     `deriveStories` (T-04).
  4. Persist each candidate as an **editable** node: `createStory`-equivalent
     with `derived:true`, wire `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when a
     primary role exists), and create **one derived starter AC** (DD-02 default —
     `given:"the <journey> preconditions are met"`, `when:"the <role> performs
     <activity>"`, `then:"the <journey> workflow advances"`, `ordinal:1`,
     `derived:true`; orphan → article-free "the workflow" phrasing) wired
     `ACCEPTANCE_OF`.
  5. → `{ created: N, skipped: M }`. Persisted nodes are ordinary editable
     stories/ACs — a later PATCH clears `derived` (DD-05).
- **Verification**: `api/__tests__/story-bootstrap.integration.test.ts` —
  bootstrap derives + persists editable `derived:true` story + starter-AC per
  activity-without-story; re-run is idempotent (`{created,skipped}`, no doubles);
  `{activityIds}` scopes to specific activities; a persisted derived story then
  PATCHes normally and its `derived` flag clears (AC-07). Fixture API-only
  (design §8).

### T-08 — Story/AC route handlers + clause-required mapping

- **Files** (1): `api/src/routes/stories.ts` (new)
- **Implements**: design §4.3 (clause mapping), §4.7 — supports FR-05, FR-06,
  FR-09, FR-10
- **Complexity**: complex
- **Blocked by**: T-05, T-06, T-07
- **Blocks**: T-09, T-10, T-12
- **Steps**: Ten handlers returning the `{error:{code,message,details?}}`
  envelope via `_helpers.ts` (`ok`/`noContent`/`error`/`readJson`/
  `fromValidationError`), mirroring existing route files: `handleStoryList`
  (`GET /models/:modelId/stories`), `handleStoryCreate` (`POST …/stories`),
  `handleStoryBootstrap` (`POST …/stories/bootstrap`), `handleStoryGet`
  (`GET …/stories/:storyId`), `handleStoryPatch` (`PATCH …/:storyId`),
  `handleStoryDelete` (`DELETE …/:storyId`), `handleAcList`
  (`GET …/:storyId/acceptance-criteria`), `handleAcCreate` (`POST …`),
  `handleAcPatch` (`PATCH …/acceptance-criteria/:acId`), `handleAcDelete`
  (`DELETE …/:acId`). Each parses its body with the T-01 zod schema at the
  boundary. **Clause-required mapping (design §4.3, NFR-03)**: on an AC
  create/patch, a zod failure whose path includes `given`/`when`/`then` maps to
  `ValidationError("acceptance_criterion_clause_required", {field}, 400)` (not
  the generic `invalid_payload`) so AC-04's exact-code assertion holds; all other
  handlers delegate error codes to the storage layer (T-05/T-06/T-07).
- **Verification**: exercised through the route surface by
  `story-crud.integration.test.ts` (T-05), `acceptance-criteria-crud.integration.test.ts`
  (T-06), and `story-bootstrap.integration.test.ts` (T-07); the
  clause-required exact-code mapping is asserted in
  `acceptance-criteria-crud.integration.test.ts` (AC-04); `bun run typecheck`.

### T-09 — Router dispatch (models/:modelId/stories* block)

- **Files** (1): `api/src/router.ts` (modify)
- **Implements**: design §4.7 — supports FR-05, FR-06, FR-09
- **Complexity**: moderate
- **Blocked by**: T-03, T-08
- **Blocks**: T-10, T-12
- **Steps**: Add a `models/:modelId/stories*` block of `sub.match(/…/)` regexes,
  mirroring existing per-resource blocks, **after** `model-workspace-core`'s
  `models*` block. Order specific-before-parameterized: (1)
  `^models\/([^/]+)\/stories$` (GET list, POST create); (2)
  `^models\/([^/]+)\/stories\/bootstrap$` (POST); (3)
  `^models\/([^/]+)\/stories\/([^/]+)\/acceptance-criteria$` (GET, POST); (4)
  `^…\/acceptance-criteria\/([^/]+)$` (PATCH, DELETE); (5)
  `^models\/([^/]+)\/stories\/([^/]+)$` (GET, PATCH, DELETE) — **last**. Dispatch
  to the T-08 handlers. (`bootstrap`/`acceptance-criteria` literals never collide
  with a UUIDv7 `:storyId`, but specific-first is kept per the house convention.)
- **Verification**: covered by the route-surface integration tests
  (`story-crud`/`acceptance-criteria-crud`/`story-bootstrap`) and by
  `api/__tests__/story-authz.test.ts` (T-11 — `getRoutePermission` resolves each
  new route); `bun run typecheck`.

### T-10 — Model isolation integration test

- **Files** (1): `api/__tests__/story-model-scope.integration.test.ts` (new)
- **Implements**: design §3.4, §4.1, DD-06 — closes AC-08; supports NFR-02
- **Complexity**: moderate
- **Blocked by**: T-08, T-09
- **Blocks**: —
- **Steps**: Seed **two** models each with its own activities + stories (API-only:
  `POST /api/v1/models` + `POST /api/v1/models/:id/domains` + core node/journey
  routes — design §8). Assert `GET /api/v1/models/:modelA/stories` returns model-A
  stories (those whose `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(modelA)`)
  and **excludes** every story whose activity belongs only to model B; assert a
  story id is **not** itself a member of `scopedNodeIds` (proving isolation is
  resolved through the activity join, not story-id membership — design §3.4);
  assert bootstrap on model A derives only from model-A scoped activities.
- **Verification**: `api/__tests__/story-model-scope.integration.test.ts` (AC-08).

### T-11 — Route-permission mapping + RBAC role grant + authz test

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8 — closes AC-09 (authz half); supports FR-11
- **Complexity**: moderate
- **Blocked by**: T-09
- **Blocks**: T-12
- **Steps**: In `rbac-permissions.ts` add ten `ROUTE_PERMISSIONS` rows
  (`P(method, path, permission)`) for **every** new route, **specific before
  parameterized** (design §4.8): GETs → `story:read`; POST/PATCH/DELETE/bootstrap
  → `story:write`. `matchSegments` rejects on segment-count first, so ordering
  only bites same-length rows — but the security-critical property is that
  **every** new route has a row (an unmapped route → `getRoutePermission`
  returns `null` → router skips the RBAC check → silent open write). No route is
  `public`; auth stays in the central gate (NFR-05 — no per-route check). In
  `seed-rbac-roles.ts` **add** `"story:read"` + `"story:write"` to the existing
  `business_architect` role's permission array (idempotent MERGE by role name —
  this spec **modifies** the role `model-workspace-core` FR-11 created; it does
  not create it).
- **Verification**: `api/__tests__/story-authz.test.ts` — a session without
  `story:write` → 403 on `POST /api/v1/models/:id/stories` and on `.../bootstrap`;
  with it → 201/200; a `story:read` session → 200 on the list GET;
  `getRoutePermission` resolves each new route (never `null`); the
  `business_architect` role resolves both `story:*` permissions; no new route
  `isPublicRoute` (AC-09 authz half).

### T-12 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: design §4.9 — closes AC-09 (openapi half); supports FR-10
- **Complexity**: moderate
- **Blocked by**: T-03, T-08, T-11
- **Blocks**: —
- **Steps**: Register the story/AC request+response schemas (`storyCreateSchema`,
  `storyPatchSchema`, `storyReadSchema`, `acCreateSchema`, `acPatchSchema`,
  `acReadSchema`, `bootstrapRequestSchema`, `bootstrapResultSchema`) and
  `registerPath` each of the ten routes (design §4.7), generated from the same
  T-01 zod definitions (no hand-maintained copy). The four new `ERROR_CODES`
  members surface in the shared `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/story-openapi.integration.test.ts` — every new
  route path and every one of the four new `ERROR_CODES` members appears in
  `GET /api/v1/openapi.json` (AC-09 openapi half).

### T-13 — PWA api client (stories block)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.11 — supports FR-12, FR-13
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-14
- **Steps**: Add a `stories` block to the `api` object (design §4.11), reusing
  the existing `json<T>()` fetch wrapper: `list`/`get`/`create`/`patch`/`remove`/
  `bootstrap` (each on `/api/v1/models/${modelId}/stories…`) plus a nested `acs`
  block (`list`/`create`/`patch`/`remove` on `…/acceptance-criteria…`). Each read
  accepts an optional `signal`.
- **Verification**: `bun run typecheck`; consumed + asserted transitively by
  `pwa/src/__tests__/story-catalog.test.tsx` (T-14).

### T-14 — StoryCatalog view + detail/edit + four states + view registration

- **Files** (3): `pwa/src/views/model/StoryCatalog.tsx` (new),
  `pwa/src/views/model/StoryCatalog.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.10, §6 — closes AC-10, AC-11, AC-12, AC-13, AC-14,
  AC-15, AC-16; supports FR-12, FR-13, FR-14, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-13
- **Blocks**: T-15, T-16
- **Steps**: In `pwa/src/views/index.tsx`, **replace** the `stories` tab's
  `<ModelTabPlaceholder spec="story-spec-core"/>` dispatch with `"stories": (r)
  => <StoryCatalog route={r} />` (the **only** edit to that file — `route.ts`/
  `SURFACES` stay `model-workspace-core`'s). `StoryCatalog` reads the active
  `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx` — **does not re-implement model
  selection**), keys its fetch on `activeModel.id`, and fetches `GET
  /api/v1/models/:modelId/stories` via `api.stories.*` (T-13). Render **all four
  states**: **loading** (skeleton via `Loading` from `views/_shared.tsx` — AC-12);
  **empty** (no stories → `Card` offering **"Generate from graph"** (POST
  `.../bootstrap`) + a manual **Create** affordance — AC-13); **error**
  (`ErrorState` from `views/_shared.tsx` **plus a local `<Button
  onClick={refetch}>` retry** — `ErrorState` renders no retry itself; resolves
  review C-03 — AC-14); **ready** (`DataTable`/`Card` list; each row: narrative,
  linked activity name, role, AC count — AC-10). **Detail + edit** (AC-11):
  selecting a row opens a catalog `SidePanel`/`Modal` showing the narrative,
  activity/role, and ACs as **Given/When/Then triples**; controls: edit story
  (PATCH), add/edit/delete/**reorder** ACs (reorder = **up/down buttons →
  `PATCH …/:acId {ordinal}`, keyboard-reachable, no drag handler** per Native
  Conflicts), delete story, per-story **"Generate from graph"** (bootstrap scoped
  via `{activityIds:[activityId]}`); a `derived:true` node shows a **"derived"
  badge** (a hand edit's PATCH response `derived:false` re-renders it away); a
  `detached:true` story shows a **"detached" indicator**. **Tokens + a11y**
  (AC-15/AC-16): `StoryCatalog.module.css` uses only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; catalog components (`Card`,
  `DataTable`, `Modal`, `SidePanel`, `Button`) before inventing new ones; ARIA
  landmark on the view; Tab reaches bootstrap/create then the list in DOM order;
  opening detail moves focus into the panel, Escape returns it (reusing the
  catalog `SidePanel`/`Modal` focus-trap — not re-implemented).
- **Verification**: `pwa/src/__tests__/story-catalog.test.tsx` (`#/model/stories`
  → `StoryCatalog`, reads `useActiveModel()`, ready list with narrative/activity/
  role/acCount — AC-10) + `pwa/src/__tests__/story-detail.test.tsx` (detail panel
  with narrative + activity/role + GWT triples; edit PATCHes + clears the derived
  badge; AC add/edit/delete call the FR-06 routes; derived badge; detached
  indicator — AC-11) + **CLI** (AC-15, resolves review N-03/design §8 promotion —
  deterministic exit code): `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/StoryCatalog.tsx` **and** `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.module.css`
  — both exit 0, zero token/component violations. + **manual** (AC-16, keyboard):
  load `#/model/stories`, keyboard-only — Tab to "Generate from graph" and
  activate with Enter, Tab into the list, Enter opens a story → expect focus
  enters the detail panel, moves through the AC edit controls in order, and
  Escape returns focus to the originating list row.

### T-15 — StoryCatalog view-state tests (loading / empty / error+retry)

- **Files** (1): `pwa/src/__tests__/story-catalog-states.test.tsx` (new)
- **Implements**: design §4.10 — closes AC-12, AC-13, AC-14
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: jsdom component test of the three non-ready states: **loading**
  skeleton while `GET /api/v1/models/:id/stories` is pending (AC-12); **empty**
  state offering "Generate from graph" + manual create, and triggering bootstrap
  POSTs `.../bootstrap` and the derived stories then appear (AC-13); **error**
  state renders `ErrorState` **plus the local retry `<Button>`** whose click
  refetches (AC-14 — the retry lives in `StoryCatalog`, not `ErrorState`; review
  C-03).
- **Verification**: `pwa/src/__tests__/story-catalog-states.test.tsx` (AC-12,
  AC-13, AC-14).

### T-16 — StoryCatalog model-context reload e2e

- **Files** (1): `pwa/playwright/story-catalog-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-17; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-01, T-14
- **Blocks**: —
- **Steps**: Playwright spec: with a non-reference model (model B) active,
  navigate to `#/model/stories`, reload → the same route renders `StoryCatalog`
  showing **model B's** stories (active-model persistence is `model-workspace-core`
  FR-15; this view refetches for the persisted model). Assert no cross-model
  leakage (server-enforced, §4.1). Seed via the API (models + domains + stories
  routes).
- **Verification**: `pwa/playwright/story-catalog-context.spec.ts` (AC-17).

## Cross-cutting verification (whole-spec)

- **AC-18** (transpile clean + no compile-time schema-array edit): `bun run
  typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS` or
  `EDGE_ENDPOINTS` for the two labels / three edge types (verify after T-02). Not
  a standalone task — checked at the final validation sweep.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-14) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-18 sweep + AC-18 (`git diff` NODE_LABELS/EDGE_ENDPOINTS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 UserStory label | T-01, T-02 | AC-01, AC-18 |
| FR-02 AcceptanceCriterion label (GWT) | T-01, T-02 | AC-01, AC-18 |
| FR-03 story→structure edges + `1..*` | T-02, T-05 | AC-02 |
| FR-04 ACCEPTANCE_OF edge | T-02, T-06 | AC-02 |
| FR-05 Story CRUD | T-01, T-05, T-08, T-09 | AC-03 |
| FR-06 AC CRUD | T-01, T-06, T-08, T-09 | AC-04 |
| FR-07 cascade + detached | T-05 (cascade), T-14 (detached indicator) | AC-05 |
| FR-08 server derivation | T-04, T-06 (parity) | AC-06 |
| FR-09 bootstrap endpoint | T-07, T-08, T-09 | AC-07 |
| FR-10 openapi + error codes | T-03, T-08 (clause mapping), T-12 | AC-04, AC-09 |
| FR-11 route-perm + RBAC | T-11 | AC-09 |
| FR-12 StoryCatalog + 4 states | T-13, T-14, T-15 | AC-10, AC-12, AC-13, AC-14, AC-15 |
| FR-13 detail + edit + AC editing | T-14 | AC-11, AC-16 |
| FR-14 model-scope + reload survival | T-14, T-16 | AC-17 |
| NFR-01 registry-only, no const edit | T-02 | AC-01, AC-02, AC-18 |
| NFR-02 model isolation via activity join | T-05, T-07, T-10 | AC-08 |
| NFR-03 structured-AC single gate | T-01, T-06, T-08 | AC-04 |
| NFR-04 parity harness | T-04, T-06 | AC-06 |
| NFR-05 house rules | T-09, T-11, all | AC-09, AC-18 |
| NFR-06 tokens-only + conformance | T-14 | AC-15, AC-16 |
