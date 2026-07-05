---
feature: "ddd-system-modeling"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 3
reviewing_requirements_revision: "approved (rev 2 — 2026-07-04): 15 FRs, 7 NFRs, 22 ACs (AC-01..21 + AC-06b)"
reviewing_design_revision: "approved rev 3 (2026-07-04) — design-review pass 2/2 = approve (0 blockers; C-01/C-02 + N-01..N-03 folded here as binding task decisions)"
size: "large"
total_tasks: 19
---

# Tasks: ddd-system-modeling

> **Revision 3 (2026-07-04).** Addresses every finding of the rev-2 tasks
> review (`review-tasks.md`, pass 1/2, verdict revise). Findings below are
> cited as **rev-2 tasks-review B-01/C-01/C-02/N-01..N-03** (distinct from the
> rev-1 tasks review's C-01..C-03, whose dispositions are unchanged):
>
> - **B-01 (blocker)** — T-05's `unknown`-bucket fixture was unconstructible:
>   the boot migration (`runSystemKindMigration`, `bootstrap.ts:138`) tightens
>   the System label's `json_schema_doc` so `required` includes `systemKind`,
>   and the generic node write path validates attributes registry-generically
>   (`api/src/storage/nodes.ts` attribute-zod cache → `400
>   attribute_violation` with `missing[]`) — so a kind-less System cannot be
>   created API-only on any booted stack. Rev 2's grep-based constructibility
>   claim was a false inference. **Fixed per the review's preferred option**:
>   the `unknown`-bucket proof is demoted to a **unit test of the exported
>   kind-bucketing helper** (T-05); the integration fixture is all-valid-kinds;
>   the sanctioned direct-driver budget stays at exactly two; the carry-forward
>   row for rev-1 tasks-review C-02 is corrected so the false claim does not
>   survive as a binding decision.
> - **C-01** — AC-21 had no owning task. **New task T-19** (final validation
>   sweep) owns AC-21 and the full-suite run.
> - **C-02** — T-13 was over-packed and its four component-test files were
>   owned by no task. **New task T-18** owns the four AC-10..13 component test
>   suites (`Blocked by: T-13`, sibling of T-14/T-15); T-13 keeps the view +
>   registration + the AC-17/AC-20 CLI checks.
> - **N-01** — T-02's fresh-registry recipe no longer claims to replay
>   `applySchema` "verbatim"; the omitted `seedBoundedContexts` +
>   `runSystemKindMigration` steps and the temporary permissive-System-doc
>   window are now called out explicitly.
> - **N-02** — T-09's router insertion-point neighborhood updated: a
>   `key-activity-optimizer` block now sits between the story block and the
>   `modules*` block.
> - **N-03** — T-12's badge-rendering guidance dropped; the client passes
>   `attributes` through untyped, rendering rules live in T-13.
>
> No task ID renumbered; T-18/T-19 are new IDs appended at the end (they are
> also last in execution order).

> **Revision 2 (2026-07-04).** Refreshes the rev-1 tasks (drafted against
> design rev 1) to the **approved design rev 3** and folds two review artifacts:
> (a) the rev-3 design review (`review-design.md`, pass 2/2, approve — its C-01
> generic-node-surface acknowledgment, C-02 fresh-registry recipe, and
> N-01..N-03 land below as binding decisions); (b) the tasks review of rev 1
> (`review-tasks.md`, approve — its C-01 `Blocks`/`Blocked by` reconciliation is
> done structurally in this revision, its C-02 `unknown`-bucket seed lands in
> T-05, its C-03 table-driven route-permission check lands in T-08). Design
> rev 2/3 deltas absorbed: DD-14 (`BoundedContext` registry row first), DD-15
> (story-mediated support arm + `describingStories` + fixture W), DD-16
> (strict `needed-by` validation + map-then-orphan AC-06b recipe), DD-17/DD-18
> (accepted-risk degradation + per-model `orphanSystems`), DD-11 (explicit
> first-PUT assertions), the router insertion point after the **story** block,
> and the detached fixture folded into the CRUD integration test (design §9
> AC-03). No task ID renumbered; **tasks are listed in execution order**, which
> places T-09 before T-08 (T-08 is `Blocked by: T-09`).

## Reading guide

- **Order**: tasks execute top-to-bottom **as listed** (T-09 precedes T-08 —
  IDs are stable from rev 1, the listing order is the execution order).
  Dependencies are explicit; per the rev-1 tasks review C-01, **`Blocked by` is
  the authoritative field and every `Blocks` list is its exact inverse**.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  completion without one for every AC.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck` (covers
  `api/src/server.ts` + `pwa/src/main.tsx` — no `tsc`); after tasks that ship
  behaviour, also run the listed test. Tasks touching `pwa/src/views/`
  additionally run `bun run scripts/design-conformance.ts --view <file>` for
  **every file the task touches** under `pwa/src/views/` — each `.tsx` and each
  `.module.css` gets its own invocation.
- Integration tests (`*.integration.test.ts`) need Neo4j (`bun test:integration`
  after `bun run dev`); unit/component tests run under `bun test`.
- **Sanctioned direct-driver test writes — exactly two** (design §9): (1) the
  `REMOVE n:BoundedContext` that constructs the detached state (DD-13, T-04's
  crud test); (2) the fresh-registry `_Ontology*` wipe in the AC-01/AC-02 setup
  (DD-14, T-02's tests). All other fixtures are API-only. Note (rev-2
  tasks-review B-01): a System **without** `attributes.systemKind` is **not**
  API-constructible on a booted stack — the boot migration tightens the System
  label's `json_schema_doc` (`required` includes `systemKind`) and the generic
  node write validates registry-generically (`400 attribute_violation`); the
  `unknown` bucket is therefore proven at the **unit** level (T-05's bucketing
  helper test), never via an integration fixture, and no third direct-driver
  op is sanctioned.

## Dependencies — fully landed (design §1.1)

Rev 1's "hard build-order precondition" is **discharged**: every consumed
dependency file exists on disk (re-verified at rev-2 authoring, 2026-07-04) —
`model-workspace-core` **FR-18** →
`api/src/storage/{model-scope,models,model-lifecycle-guard}.ts` (`scopedNodeIds`,
consumed by T-04/T-05/T-07/T-10),
`api/src/scripts/register-model-labels.ts`,
`api/src/scripts/register-story-labels.ts` (`registerStorySchema`; the router
imports `registerStoryRoutes`), `api/src/scripts/seed-rbac-roles.ts`
(`business_architect` at line 96), `pwa/src/context/ActiveModelContext.tsx`
(`useActiveModel`), `model-workspace-core` **FR-17** →
`pwa/src/views/model/ModelTabPlaceholder.tsx` (the model surface's `systems`
slot at `pwa/src/views/index.tsx`, replaced by T-13's SystemModeler), and
`shared/src/schema/system-kind.ts`. Implementation is unblocked; no
bind-at-implementation-time seams remain. (These two `model-workspace-core` FRs
are **consumed dependencies**, not this spec's own requirements — this spec owns
FR-01..FR-15; see requirements §Dependencies.)

## Review carry-forwards (binding decisions — do not re-derive at execution)

Two artifacts feed this table: the **rev-3 design review** (pass 2/2, approve)
and the **tasks review of rev 1** (approve). Each finding is landed as a
binding, task-anchored decision.

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **Design-review C-01** — DD-14's new `_OntologyNodeLabel` rows open the generic `/api/v1/nodes/BoundedContext` + `/api/v1/nodes/Capability` write surface (registry membership is the only gate — `parseRegistryLabel`, `_helpers.ts:61`; neither label is in `LIFECYCLE_LABELS`). | **Accepted risk, same posture as DD-17 / every runtime-registered label** (`UserStory` has the identical property). Degradation is benign and now **asserted**: a `Capability` created via the generic node surface carries **zero** `CAPABILITY_IN_MODEL` edges, fails every membership predicate, and is **invisible to all model-scoped reads** (not leaked into any model); a hand-made `BoundedContext` behaves like a seeded one. T-10 adds the regression guard: `POST /api/v1/nodes/Capability` → the node appears in **no** model's list/gaps. | T-10 |
| **Design-review C-02** — the AC-01/AC-02 "fresh registry" recipe, run as `registerCapabilitySchema` alone against a `NODE_LABELS`-only registry, throws `type_pair_violation` on the `UserStory` pair before it can prove DD-14. | **The fresh-registry setup replays the `applySchema` chain verbatim**: wipe `_Ontology*` rows → `seedRegistryFromConstTuples` → `registerModelSchema` → `registerStorySchema` → `registerCapabilitySchema` (the exact `api/src/neo4j/bootstrap.ts` order, verified lines 45/64/75). **Teardown re-runs `applySchema`** so later integration tests against the same Neo4j instance are not poisoned by the wipe. | T-02 |
| **Design-review N-01** — DD-17(iv) understates the forged cross-model `NEEDS_CAPABILITY` blast radius (the §4.4(a) capability arms are not `CAPABILITY_IN_MODEL`-filtered, so a forged edge to a supported model-B capability would classify a model-A activity as supported). | Exactness clause recorded: unreachable through sanctioned writes (`PUT …/needed-by` validates in-model; `attachDomain` always CREATEs a fresh `Domain`; `IN_MODEL` is lifecycle-guarded); no code change, no test — degradation text only. T-05's code comment on query (a) notes it. | T-05 |
| **Design-review N-02** — the AC-06b fixture's "activity `PART_OF` a scoped domain" is loosely worded: `Activity→Domain` is **not** a registered `PART_OF` pair. | The fixture builds the real chain **`Activity -PART_OF-> UserJourney -PART_OF-> Domain`** and orphans by deleting the **`Activity→UserJourney`** `PART_OF` edge (generic graph-core edge DELETE — a real route). | T-10 |
| **Design-review N-03** — `capPathSystems = count(DISTINCT capSys) + count(DISTINCT storySys)` double-counts a system reached via both arms. | Harmless (only `> 0` is consulted). A one-line Cypher comment says so, so an implementer does not "fix" the sum into a cross-arm-`DISTINCT` refactor mid-task. | T-05 |
| **Tasks-review C-01** — rev 1's `Blocks`/`Blocked by` fields had eleven asymmetries. | Reconciled structurally in this revision: `Blocked by` is authoritative; every `Blocks` list is its exact inverse (spurious T-01/T-02→T-03 and T-10→T-11 edges removed; missing inverses added). | all |
| **Tasks-review C-02 (rev-1 pass) — corrected by rev-2 tasks-review B-01** — the `unknown` augmentation-mix bucket was schema-only; no test proved it populates. Rev 2 landed this on a **false constructibility premise** (the "no `systemKind` reference in `nodes.ts`" grep was a false inference — the write path validates attributes **registry-generically** via the attribute-zod cache, and `runSystemKindMigration` tightens the System doc's `required` at boot, so a kind-less System is rejected with `400 attribute_violation` on every booted stack; `POST /api/v1/import` injects the default). | **The `unknown`-bucket proof is a unit test of the bucketing logic**: T-05 exports its kind-bucketing helper from `api/src/storage/system-model.ts` and a unit test feeds it raw collected rows with a **missing** and an **invalid** `systemKind`, asserting both land in `unknown`. The T-05 integration fixture stays **all-valid-kinds**; AC-07 is unchanged (no AC gates `unknown` — design calls it "defensive only"); the sanctioned direct-driver budget stays at exactly two. Resolves: rev-2 tasks-review B-01. | T-05 |
| **Tasks-review C-03** — T-08's "every route resolves a permission" check risked a hand-enumerated subset; a missed row is a **silent open write** (unmapped route → `getRoutePermission` null → the router skips the RBAC check). | The authz test is **table-driven over the exact 13 method+route literal pairs of T-09's dispatch chain** (single shared const list), asserting `getRoutePermission` returns a non-null `capability:*` permission for **each** — never a subset. | T-08 |
| **Rev-2 tasks-review C-01** — AC-21 lived only in the cross-cutting section with no owning task (an unanchored AC has no owner in a 19-task run). | AC-21 is **owned by T-19** (final validation sweep) — deterministic `bun run typecheck` + the `git diff` guard on `NODE_LABELS`/`EDGE_ENDPOINTS`, plus the full-suite run the Validation checkpoints table describes. Resolves: rev-2 tasks-review C-01. | T-19 |
| **Rev-2 tasks-review C-02** — T-13 packed a three-panel view + detail/edit panel + registration + four **new** component-test suites (owned by no task's file list) into one half-day task (rev-1 review N-02 predicted the overrun). | The four AC-10..13 component test suites are **split into T-18** (`Blocked by: T-13`, sibling of T-14/T-15), which **declares all four test files** in its Files list. T-13 keeps the view + registration + the two deterministic CLI checks (AC-17, AC-20 CLI half). Resolves: rev-2 tasks-review C-02. | T-13, T-18 |

## Deviations from requirements / design (orchestrator: land as errata, no ID renumbering)

| Item | Executed as | Why | Source |
|------|-------------|-----|--------|
| AC-17 `manual: run … design-conformance.ts …` | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | It is a deterministic script with an exit code, not a human visual check | requirements AC-17, design §6 |
| AC-20 second clause `manual: git grep …` | **CLI** grep (`git grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx` expects no matches) | Deterministic exit code; not a human check | requirements AC-20 |
| rev-1 tasks' separate `api/__tests__/capability-detached.test.ts` (unit) | **Folded into `capability-crud.integration.test.ts`** (T-04) | Design rev 3 §9 (AC-03 row) places the detached fixture there, and the `REMOVE n:BoundedContext` fixture needs a live Neo4j — it was never honestly a unit test | design §9, DD-13 |
| Design §3.1 table hygiene | `P`/`ROUTE_PERMISSIONS` treated as edited-in-place module internals of `rbac-permissions.ts`; `getRoutePermission` stays a consumed export | Carried from design rev 2's §3.1 split | design §3.1 |

---

## Task list

### T-01 — Capability + mapping + result zod schemas (shared)

- **Files** (1): `shared/src/schema/ddd-system.ts` (new)
- **Implements**: design §3.2, §3.3, §5, DD-15 — supports FR-01, FR-02, FR-04,
  FR-05, FR-07, FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-04, T-05, T-06, T-11, T-12
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US identifiers).
  **Capability**: `capabilityCreateSchema` = `{ name: z.string().min(1),
  description: z.string().optional(), attributes: z.record(z.unknown()).optional() }`;
  `capabilityPatchSchema` = `{ name?: z.string().min(1), description?:
  z.string(), attributes?: z.record(z.unknown()) }` (all optional, omitted →
  unchanged, mirrors `patchNode`); `capabilityReadSchema` = envelope
  (`id`/`name`/`description`/`createdAt`/`updatedAt`/`attributes`) **plus** the
  §3.2 derived read fields — list row: `neededByCount:int`,
  `supportingSystemCount:int`, `assignedContextId: z.string().nullable()`,
  `assignedContextName: z.string().nullable()`; detail additionally embeds
  `neededBy: {kind:"activity"|"story", id, name}[]`, `supportedBy: {id, name,
  systemKind: systemKindSchema}[]` (import `systemKindSchema` from
  `shared/src/schema/system-kind.ts` — never a re-declared literal, NFR-03),
  `assignedContext: {id, name, domain, subdomain} | null`, and `detached:
  {kind:"needed-by"|"supported-by"|"context", targetId: string}[]` (DD-13).
  **Mapping bodies**: `neededBySchema` = `{ activityId?: z.string().min(1),
  storyId?: z.string().min(1) }` **with a `.refine` that exactly one is present**
  (design §4.3); `supportedBySchema` = `{ systemId: z.string().min(1) }`;
  `contextAssignSchema` = `{ boundedContextId: z.string().min(1) }`.
  **Result aggregates**: `gapsResultSchema` = `{ unsupportedSteps:
  {activityId, activityName, describingStories: {id,name}[]}[], capabilityGaps:
  {activityId, activityName, describingStories: {id,name}[]}[],
  capabilitiesWithoutSystem: {capabilityId, name}[], orphanSystems: {systemId,
  name}[], augmentationMix: { perCapability: {capabilityId, name, counts:
  {functional:int, agentic:int, ai_predictive:int, unknown:int}, shares:{…} }[],
  model: {functional:int, agentic:int, ai_predictive:int, unknown:int} } }` —
  `describingStories` on both step-item shapes is **DD-15** (FR-07(a)'s "(and
  the `UserStory`s that describe them)" is in the payload); the `unknown` key is
  the fixed defensive bucket. `contextMapResultSchema` = `{ contexts: {id, name,
  domain, subdomain, capabilities: {id,name}[], relationships: {type, targetId,
  targetName}[]}[], unassigned: {id, name}[] }` (relationship far-end resolved
  to `targetId`, DD-07).
- **Verification**: `shared/src/schema/__tests__/ddd-system.test.ts` — parse
  valid/invalid payloads; `capabilityCreateSchema` rejects a body missing `name`
  and one with empty `name`; `capabilityPatchSchema.parse({})` is valid
  (all-optional); `neededBySchema` **rejects** a body with neither `activityId`
  nor `storyId` **and** rejects one with both (the `.refine`);
  `gapsResultSchema`/`contextMapResultSchema` accept a representative fixture
  incl. `describingStories` on step items **and** the `unknown` mix bucket.

### T-02 — Register BoundedContext row + Capability label + four edges (idempotent) + boot wiring

- **Files** (3): `api/src/scripts/register-capability-labels.ts` (new),
  `api/src/neo4j/bootstrap.ts` (modify), `package.json` (modify)
- **Implements**: design §4.6, §7, DD-01, DD-04, **DD-14** — closes AC-01,
  AC-02; supports FR-01, FR-02, NFR-01
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-04, T-05
- **Steps**: `registerCapabilitySchema(driver)` (export), **passing the required
  `actor` arg to every registry call** (`createNodeLabel`/`createEdgeType` are
  `(driver, input, actor)` — actor = `"system:ddd-system"`), in **strict DD-14
  order**:
  1. `createNodeLabel("BoundedContext", { json_schema_doc: {} })` — ensures the
     `_OntologyNodeLabel` row that exists **nowhere** today (`NODE_LABELS` has
     no `BoundedContext`; `seedBoundedContexts` MERGEs only data nodes). Without
     it the `ASSIGNED_TO_CONTEXT` `createEdgeType` throws `type_pair_violation`
     at boot (B-01 of the rev-2 design review). Additive: `BoundedContext` now
     appears in `GET /api/v1/schema`; NFR-04-compatible (registry metadata only,
     zero context data touched). The generic-node-write opening this creates is
     an accepted risk per the carry-forward table (design-review C-01; guarded
     in T-10).
  2. `createNodeLabel("Capability", { json_schema_doc: {} })` (permissive, DD-03).
  3. Four `createEdgeType` calls — `NEEDS_CAPABILITY` with its **two** endpoint
     pairs `[{from:"Activity",to:"Capability"},{from:"UserStory",to:"Capability"}]`
     (DD-04 — one type, two `_OntologyEdgeEndpoint` rows), `SUPPORTED_BY`
     (`Capability→System`), `ASSIGNED_TO_CONTEXT` (`Capability→BoundedContext`),
     `CAPABILITY_IN_MODEL` (`Capability→BusinessModel` — this spec's **own**
     membership edge, DD-01; deliberately **not** in `model-lifecycle-guard.ts`'s
     `LIFECYCLE_EDGES`).
  Each call wrapped to swallow `409 name_conflict` → **idempotent** (mirror
  `register-story-labels.ts`'s `isNameConflict`, lines 85-103). Do **not** touch
  `NODE_LABELS`/`EDGE_ENDPOINTS` consts (NFR-01, AC-21). In `applySchema`
  (`api/src/neo4j/bootstrap.ts`): call `registerCapabilitySchema` **after** both
  `registerModelSchema` (line 64 — `BusinessModel` row must pre-exist) and
  `registerStorySchema` (line 75 — `UserStory` row must pre-exist);
  `createEdgeType` runs `assertEndpointLabelsExist`. Add a `register:capability`
  script to `package.json` mirroring `register:model`/`register:story`.
- **Verification**: `api/__tests__/capability-labels.integration.test.ts` +
  `api/__tests__/capability-edges.integration.test.ts` — **both use the binding
  fresh-registry recipe (design-review C-02): setup wipes the `_Ontology*` rows
  → `seedRegistryFromConstTuples` → `registerModelSchema` → `registerStorySchema`
  → `registerCapabilitySchema`; teardown re-runs `applySchema`** (sanctioned
  direct-driver op #2 — the wipe only). Note (rev-2 tasks-review N-01): this
  recipe is the **registry subset** of the `applySchema` chain, not a verbatim
  replay — the real `applySchema` also runs `seedBoundedContexts` (step 3) and
  `runSystemKindMigration` (`bootstrap.ts:138`), both deliberately omitted here.
  Mid-test the System label's `json_schema_doc` is therefore temporarily
  **permissive** (the wipe undoes the migration's `required: ["systemKind"]`
  tightening); this window is **not** the steady state — do not write fixtures
  that assume it (see the B-01 note in the reading guide). The teardown
  `applySchema` re-tightens the doc, so later integration tests against the
  same Neo4j instance are not poisoned. Labels test
  (AC-01): `BoundedContext` **and** `Capability` `_OntologyNodeLabel` rows exist
  afterwards and both appear in `GET /api/v1/schema`; `NODE_LABELS` unchanged;
  idempotent re-run adds no duplicate rows (`409 name_conflict` swallowed).
  Edges test (AC-02): all four `createEdgeType` calls succeed **without**
  `type_pair_violation` (proves the `BoundedContext` row precedes
  `ASSIGNED_TO_CONTEXT` — DD-14); **both** `NEEDS_CAPABILITY` pairs registered;
  a wrong pair (`SUPPORTED_BY` from `Capability→Role`) → `400
  edge_endpoint_label_mismatch`; **no `Capability→BusinessModel` pair added to
  `IN_MODEL`** (DD-01); `EDGE_ENDPOINTS` const unchanged.

### T-03 — Additive error codes

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.5 — closes part of FR-10
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-04, T-11
- **Steps**: Append **three** additive codes to the closed `ERROR_CODES` array
  (NFR-11; no existing code removed/reordered, exhaustive assertion kept happy):
  `capability_not_found` (404), `bounded_context_not_found` (404),
  `system_not_found` (404) — N-04 of the requirements review verified none
  exists anywhere (no duplicate enum entry possible). **Reuse** the existing
  `model_not_found`, `not_found` (bad `activityId`/`storyId` on `needed-by`,
  with `details.field`), `edge_endpoint_label_mismatch`, and `invalid_payload` —
  **do not duplicate** them (FR-10). Only reachable codes are added: each of the
  three is thrown by ≥1 route (T-04). The three codes are additionally walked by
  the existing reachability assertion in
  `api/__tests__/ontology-envelope.test.ts` ("Walk every code…", ~line 29 — the
  real file, N-06).
- **Verification**: `api/__tests__/capability-openapi.integration.test.ts`
  (jointly with T-11) asserts each of the three new codes is a member of
  `ERROR_CODES` and appears in the OpenAPI `ErrorEnvelope.code` enum;
  `bun run typecheck` passes the exhaustiveness assertion.

### T-04 — Capability CRUD + mapping-edge storage (atomic create + membership + MERGE idempotency + detached)

- **Files** (1): `api/src/storage/capabilities.ts` (new)
- **Implements**: design §4.1, §4.2, §4.3, §4.6 (detached), DD-01, DD-02, DD-03,
  DD-06, DD-12, DD-13, DD-16, DD-17 — closes AC-03, AC-04 (storage half);
  supports FR-03, FR-04, FR-05, FR-06, NFR-02
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03
- **Blocks**: T-05, T-06, T-07, T-09, T-10
- **Steps**: Import `scopedNodeIds` from `api/src/storage/model-scope.ts`
  (consumed, never re-implemented) and **`getEdgeEndpoints` from
  `api/src/ontology/cache/edge-endpoints.ts`** (the exported endpoint-lookup for
  MERGE-path validation — DD-12; **do not export/edit `validateEdge`**;
  `api/src/storage/edges.ts` is not touched). The `Capability` envelope is the
  plain node envelope (DD-03); write it via this module's own parameterized
  Cypher — the generic `createNode`/`patchNode` primitives stay byte-for-byte
  unchanged. Membership rides
  `(cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})`; a `Capability`
  is **never** in `scopedNodeIds` (DD-02).
  - **`listCapabilities(driver, modelId)`** — §4.1 Cypher: membership `MATCH` +
    `OPTIONAL MATCH` needed-by/supported-by/assigned-context; `RETURN` `DISTINCT`
    counts + `collect(DISTINCT {id:bc.id,name:bc.name})`; `ORDER BY
    cap.createdAt ASC`. JS-side: filter the `{id:null}` miss row and map to
    `assignedContextId/Name` via **sort-by-name-take-first** — one row per
    capability id, deterministic context even under a DD-17 cardinality
    violation. The membership MATCH is the sole model filter (orphan-sourced
    capabilities list correctly — AC-06b). Unknown `:modelId` → `200 []` (the
    **pinned** list-`[]`-vs-create-404 asymmetry, design §4.1).
  - **`getCapability(driver, modelId, capabilityId)`** — resolve by id **and**
    membership else `404 capability_not_found` (a capability of another model is
    *not found* here — AC-09). Embed `neededBy`, `supportedBy` (each
    `systemKind` parsed from `sys.attributes_json` via `systemKindSchema`),
    `assignedContext`, and `detached` (DD-13: `OPTIONAL MATCH` each mapping edge
    with and without the expected far-end label; report `{kind, targetId}` where
    the expected label is absent; normal path → `[]`).
  - **`createCapability(driver, modelId, input)`** — (1) `MATCH (m:BusinessModel
    {id:$modelId})` else `404 model_not_found` (reused). (2) atomic create +
    membership in one write tx: `CREATE (cap:Capability {id:$id (UUIDv7), name,
    description, createdAt, updatedAt, attributes_json}) WITH cap MATCH
    (m:BusinessModel {id:$modelId}) MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)` →
    `201` + full `capabilityReadSchema` (counts 0, `assignedContext:null`,
    `detached:[]`).
  - **`patchCapability`** — membership check; dynamic SET of supplied
    `name`/`description`/`attributes` (omitted untouched, mirrors `patchNode`);
    `SET cap.updatedAt=$now` → `200`.
  - **`deleteCapability`** — membership check, then the single-tx cascade
    (`MATCH (cap …)-[:CAPABILITY_IN_MODEL]->(…) DETACH DELETE cap`) → `204`.
  - **Mapping edges** — each validates the capability is in `:modelId` first
    (`404 capability_not_found`), then the far-end, then writes via `MERGE`
    (idempotent, DD-06) **after** the explicit endpoint check
    (`getEdgeEndpoints(type, driver)` → assert `(fromLabel,toLabel)` ∈ the pair
    list else `edge_endpoint_label_mismatch` — DD-12):
    - `addNeededBy(driver, modelId, capabilityId, {activityId?, storyId?})` —
      **strict arm only (DD-16)**: an `Activity` must be ∈
      `scopedNodeIds(modelId)`; a `UserStory`'s `DESCRIBES_ACTIVITY` activity
      must be ∈ `scopedNodeIds(modelId)` (consumes `story-spec-core`'s join). An
      orphan activity (or a story describing one) is `404 not_found`
      (`details.field:"activityId"|"storyId"`) — the requirements mechanism
      note's orphan "or…" clause is a recorded, deliberate deviation (DD-16).
      Then `MERGE (src)-[:NEEDS_CAPABILITY]->(cap)` → `200`.
    - `removeNeededBy` — body-carrying DELETE (precedent: the
      `module-instances/:instanceId/edges` DELETE — design §4.3); `DELETE r` →
      `204`.
    - `addSupportedBy(…, {systemId})` — verify `(:System {id})` else `404
      system_not_found`; `MERGE (cap)-[:SUPPORTED_BY]->(sys)` → `200`.
    - `removeSupportedBy(…, systemId)` — `DELETE r` → `204`.
    - `setContext(…, {boundedContextId})` — verify via direct
      `MATCH (:BoundedContext {id})` read (N-05; permitted under NFR-04) else
      `404 bounded_context_not_found`; **replace** in one tx (at-most-one,
      FR-03), deleting **all** prior `ASSIGNED_TO_CONTEXT` edges (DD-17(iii)
      self-heal): `OPTIONAL MATCH (cap)-[old:ASSIGNED_TO_CONTEXT]->() DELETE old
      WITH cap MATCH (bc:BoundedContext {id}) MERGE
      (cap)-[:ASSIGNED_TO_CONTEXT]->(bc)` → `200`.
    - `clearContext(…)` — `DELETE r` → `204`.
- **Verification**: `api/__tests__/capability-crud.integration.test.ts` (create
  → 201 + UUIDv7 + `CAPABILITY_IN_MODEL` edge even with no mapping; unknown
  model → `404 model_not_found` on create **while `GET` list on the same unknown
  model → `200 []`** — the pinned asymmetry; list scoped w/ counts; detail
  embeds needed-by / supported-by w/ `systemKind` / assigned context; PATCH
  preserves omitted; DELETE → 204; **detached fixture (DD-13)**: assign a
  context, then direct-driver `REMOVE n:BoundedContext` on it — sanctioned op #1
  — and assert `getCapability().detached` is non-empty — AC-03) +
  `api/__tests__/capability-mapping.integration.test.ts` (**first-PUT dispatch
  proven end-to-end, DD-11**: `PUT needed-by {activityId}` and `{storyId}`
  idempotent `MERGE` (repeat → no duplicate edge); `PUT supported-by {systemId}`;
  `PUT context` replaces prior at-most-one (incl. all-priors-deleted); each
  DELETE removes; orphan `needed-by` target → `404 not_found` (DD-16 strict
  arm); unknown cap/system/context → matching `404 *_not_found`; a forged wrong
  pair → `400 edge_endpoint_label_mismatch` via the `getEdgeEndpoints` check —
  AC-04). Fixtures API-only via `model-workspace-core`'s `POST /api/v1/models` +
  `.../domains` + core node/journey routes + `story-spec-core`'s story routes
  (design §9), except the one sanctioned `REMOVE` above.

### T-05 — Support-gap analysis + augmentation mix (system-model read aggregate)

- **Files** (2): `api/src/storage/system-model.ts` (new — gap half),
  `api/__tests__/system-kind-bucketing.test.ts` (new — unit, no Neo4j;
  rev-2 tasks-review B-01)
- **Implements**: design §4.4, DD-05, DD-09, **DD-15**, **DD-18**, review N-01/
  N-03 (rev-3 pass) — closes AC-06, AC-07; supports FR-07, FR-08, NFR-07
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-04
- **Blocks**: T-09, T-10
- **Steps**: `computeGaps(driver, modelId)` — **read-only, deterministic,
  side-effect-free**, a **bounded** set of reads (no per-capability N+1, NFR-07).
  Precompute `scopedActivityIds = [...scopedNodeIds(driver, modelId)]` JS-side.
  - **(a) unsupportedSteps + capabilityGaps (FR-08, DD-09, DD-15)** — one pass
    over model activities with **both capability arms** (§4.4 Cypher): the
    direct arm `(a)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(capSys)`
    **and** the story-mediated arm
    `(a)<-[:DESCRIBES_ACTIVITY]-(:UserStory)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(storySys)`
    (`DESCRIBES_ACTIVITY` direction verified `UserStory → Activity`), plus
    `directSystems` via `USES_SYSTEM` and `collect(DISTINCT {id:story.id,
    name:story.name}) AS describingStories` (miss row filtered JS-side).
    `capPathSystems = count(DISTINCT capSys) + count(DISTINCT storySys)` — add
    the **one-line comment** (rev-3 N-03): the sum may double-count a system
    reached via both arms; harmless, only `> 0` is consulted — do **not**
    refactor into a cross-arm `DISTINCT`. Also comment (rev-3 N-01) that the
    arms are deliberately not `CAPABILITY_IN_MODEL`-filtered — a forged
    cross-model `NEEDS_CAPABILITY` is unreachable through sanctioned writes
    (DD-17(iv)). Post-classify: both 0 → `unsupportedSteps`; capPath 0 & direct
    >0 → `capabilityGaps`; capPath >0 → not flagged. Each step item carries
    `{activityId, activityName, describingStories}` (DD-15, deep-linkable).
  - **(b) capabilitiesWithoutSystem** — model-scoped capabilities
    (`CAPABILITY_IN_MODEL`) with `WHERE NOT (cap)-[:SUPPORTED_BY]->(:System)`.
  - **(c) orphanSystems (DD-18 — per-model)** — `MATCH (a:Activity) WHERE a.id
    IN $scopedActivityIds MATCH (a)-[:USES_SYSTEM]->(sys:System) WHERE NOT
    EXISTS { MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel
    {id:$modelId}), (c)-[:SUPPORTED_BY]->(sys) } RETURN DISTINCT …` — the
    no-capability check resolves through **this model's** membership, so a
    system capability-mapped only in model B is still model A's orphan. **Code
    comment** (design N-01, rev-1 pass): the FR-07(c) capability arm is vacuous
    — a system reached via a model-scoped capability's `SUPPORTED_BY` fails the
    `NOT EXISTS` by definition; activities-only traversal is complete.
  - **(d) augmentationMix (FR-07d, AC-07)** — per model-scoped capability,
    `collect(sys.attributes_json)`; JS-side parse each, read `systemKind` via
    `systemKindSchema`/`SYSTEM_KINDS` (never a re-declared literal, NFR-03),
    bucket into `{functional, agentic, ai_predictive, unknown}` (missing/invalid
    → `unknown`, never silently dropped); emit per-capability counts + shares
    and a model-level roll-up. **Export the bucketing helper** (rev-2
    tasks-review B-01): `export function bucketSystemKinds(attributesJsonList:
    (string | null)[]): { functional: number; agentic: number; ai_predictive:
    number; unknown: number }` — the exact function `computeGaps` calls, so the
    unit test exercises the production path, not a copy.
  Return `{ unsupportedSteps, capabilityGaps, capabilitiesWithoutSystem,
  orphanSystems, augmentationMix:{perCapability, model} }` matching
  `gapsResultSchema` (T-01).
- **Verification**: `api/__tests__/system-gap-analysis.integration.test.ts` —
  seed X (activity→capability→system), Y (`USES_SYSTEM` only), Z (neither),
  **W (supported *only* via its describing story's `NEEDS_CAPABILITY` — DD-15)**,
  capability C (no system), system S (used, no capability): gaps returns
  Z∈`unsupportedSteps`, Y∈`capabilityGaps`, C∈`capabilitiesWithoutSystem`,
  S∈`orphanSystems`, X **and W** unflagged; Z's/Y's items carry
  `describingStories` `{id,name}` for their seeded stories (AC-06). **Cross-model
  case (DD-18)**: after model B maps its own capability to S, S **still** ∈
  model A's `orphanSystems`. Augmentation mix
  `{functional:2, agentic:1, ai_predictive:1, unknown:0}` + shares + model
  roll-up, kinds via `SYSTEM_KINDS` (AC-07). The integration fixture is
  **all-valid-kinds** — a kind-less System is not API-constructible on a
  booted stack (rev-2 tasks-review B-01; see the reading-guide note), so the
  fixture never attempts one. Fixture API-only.
  **Plus the unit test** `api/__tests__/system-kind-bucketing.test.ts` (runs
  under `bun test`, no Neo4j — rev-2 tasks-review B-01, replacing rev 2's
  unconstructible integration fixture): feed `bucketSystemKinds` raw collected
  rows — one `attributes_json` **missing** the `systemKind` key, one with an
  **invalid** value (`"quantum"`), one `null`, plus one of each valid kind —
  and assert the missing/invalid/null rows all land in `unknown` (`unknown:3`)
  while the valid kinds bucket correctly and nothing is silently dropped. No
  AC gates `unknown` (design: "defensive only"); this unit test is the
  bucket's sole populated-proof.

### T-06 — Context map (system-model read aggregate, id-resolved relationships)

- **Files** (1): `api/src/storage/system-model.ts` (extend — context-map half)
- **Implements**: design §4.5, DD-07 — closes AC-08; supports FR-09, NFR-04,
  NFR-07
- **Complexity**: moderate
- **Blocked by**: T-01, T-04
- **Blocks**: T-09
- **Steps**: `computeContextMap(driver, modelId)` — a **bounded, read-only**
  join of the model's assigned capabilities to the existing bounded-contexts
  surface (design §4.5 Cypher). Contexts with ≥1 model-scoped capability:
  `MATCH (cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId}) MATCH
  (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext) OPTIONAL MATCH
  (bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)` returning
  `capabilities:[{id,name}]` and `relationships:[{type:type(r),
  targetId:other.id, targetName:other.name}]` (**id-resolved**, DD-07 — **not**
  the bounded-contexts route's name-only `{type,target}`), `ORDER BY bc.name`.
  Filter JS-side the `{type:null,…}` rows the `OPTIONAL MATCH` yields. Plus an
  `unassigned` bucket: model capabilities with `WHERE NOT
  (cap)-[:ASSIGNED_TO_CONTEXT]->(:BoundedContext)`. Return `{ contexts:
  [{id,name,domain,subdomain,capabilities,relationships}], unassigned:
  [{id,name}] }` matching `contextMapResultSchema` (T-01). **No
  `BoundedContext`/relationship is created or mutated** (NFR-04 — do not
  import/call any bounded-contexts write path).
- **Verification**: `api/__tests__/context-map.integration.test.ts` — assign two
  model-scoped capabilities to `BC1 Product Catalogue`, one to `BC4 Pricing &
  Markdown`, leave one unassigned; context-map groups under BC1/BC4 (each with
  its existing `domain`/`subdomain`), inter-context
  `UPSTREAM_OF`/`DOWNSTREAM_OF` relationships carry the far context's **`id`**
  (DD-07), the unassigned bucket holds the fourth capability; assert **no**
  `BoundedContext`/relationship was created or mutated (AC-08).

### T-07 — Cascade delete integration test

- **Files** (1): `api/__tests__/capability-cascade.integration.test.ts` (new)
- **Implements**: design §4.4 (cascade) — closes AC-05; supports FR-06
- **Complexity**: moderate
- **Blocked by**: T-04
- **Blocks**: T-19
- **Steps**: Seed a capability wired to all four edge types (a `NEEDS_CAPABILITY`
  in from an activity **and** a story, a `SUPPORTED_BY` to a system, an
  `ASSIGNED_TO_CONTEXT` to a bounded context, and its `CAPABILITY_IN_MODEL`).
  `DELETE /api/v1/models/:modelId/capabilities/:capabilityId` → 204; assert
  **all four** edge types on the capability are gone in one transaction (no
  dangling edges — query the far nodes for any residual relationship of those
  types pointing at the deleted id) and the far-end `Activity`/`UserStory`/
  `System`/`BoundedContext`/`BusinessModel` nodes **still exist** (AC-05).
  Fixture API-only.
- **Verification**: `api/__tests__/capability-cascade.integration.test.ts`
  (AC-05).

### T-09 — Route handlers + router dispatch (models/:modelId/capabilities* + system-model/*)

- **Files** (2): `api/src/routes/capabilities.ts` (new),
  `api/src/router.ts` (modify)
- **Implements**: design §4.7, DD-11 — supports FR-04, FR-05, FR-07, FR-09,
  FR-10
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-06
- **Blocks**: T-08, T-10, T-11
- **Steps**: **Handlers** (`api/src/routes/capabilities.ts`) — the 13 handlers
  of design §4.7 returning the `{error:{code,message,details?}}` envelope via
  `_helpers.ts` (`ok`/`noContent`/`error`/`parseWith`/`fromValidationError`),
  mirroring existing route files: `handleCapabilityList`/`Create`/`Get`/`Patch`/
  `Delete`, `handleNeededByPut`/`Delete`, `handleSupportedByPut`/`Delete`,
  `handleContextPut`/`Delete`, `handleGaps`, `handleContextMap`. Each parses its
  body with the T-01 zod schema at the boundary; error codes delegate to the
  storage layer. The `PUT` arms are plain `method === "PUT"` string compares —
  the router is method-generic (`req.method.toUpperCase()`, `router.ts:263`); no
  router-core change (DD-11). **Dispatch** (`api/src/router.ts`) — add a
  `registerCapabilityRoutes(method, sub, req)` block **immediately after the
  `story-spec-core` block** (the `if (sub.startsWith("models/"))` →
  `registerStoryRoutes` block at ~`router.ts:404-407`, which falls through on
  `null`). Neighborhood note (rev-2 tasks-review N-02): a
  `key-activity-optimizer` dispatch block now sits **between** the story block
  and the `modules*` block (~`router.ts:417`) — the capability block lands
  after the story block and **before** the `key-activity-optimizer` block;
  ordering relative to that block is collision-free either way
  (`key-activities*` paths are disjoint from `capabilities*` /
  `system-model/*`). Use a `sub.match(/…/)`
  chain ordered **specific-before-parameterized** exactly per design §4.7: (1)
  `^models\/([^/]+)\/system-model\/gaps$` (GET), (2)
  `^…\/system-model\/context-map$` (GET), (3) `^models\/([^/]+)\/capabilities$`
  (GET, POST), (4) `…\/([^/]+)\/needed-by$` (PUT, DELETE), (5)
  `…\/supported-by$` (PUT), (6) `…\/supported-by\/([^/]+)$` (DELETE), (7)
  `…\/context$` (PUT, DELETE), (8) `^models\/([^/]+)\/capabilities\/([^/]+)$`
  (GET, PATCH, DELETE) — **last**. Export (or share via a module const) the
  **exact 13 method+route literal list** so T-08's table-driven authz assertion
  iterates it (tasks-review C-03).
- **Verification**: `api/__tests__/capability-authz.test.ts` (route dispatch +
  permission gate) plus the `capability-crud`/`system-gap-analysis`/`context-map`
  integration tests (T-04/T-05/T-06) that drive these handlers end-to-end;
  `bun run typecheck`.

### T-08 — Route-permission mapping + RBAC role grant + authz test

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8, DD-10, DD-11 — closes AC-09 (authz half);
  supports FR-11, NFR-05
- **Complexity**: moderate
- **Blocked by**: T-09 (the dispatch route literals must exist to
  permission-map; the `P(...)` rows can be drafted from design §4.8 in parallel
  but are reconciled against T-09's final literals before this task closes)
- **Blocks**: T-11
- **Steps**: In `rbac-permissions.ts` add the **13** `ROUTE_PERMISSIONS` rows
  via the in-place `P(...)` helper (`P`/`ROUTE_PERMISSIONS` are edited-in-place
  module internals, not imports — design §3.1), in the design §4.8 ordered list:
  the two `system-model/{gaps,context-map}` GETs (`capability:read`), the
  collection GET (`capability:read`) / POST (`capability:write`), the six
  sub-route rows — **three `P("PUT",…)` rows** (`needed-by`, `supported-by`,
  `context`) plus three DELETEs (`needed-by`, `supported-by/:systemId`,
  `context`), all `capability:write` — then the parameterized
  `capabilities/:capabilityId` GET (`capability:read`) / PATCH / DELETE
  (`capability:write`) **last**. **DD-10**: the ordering is house convention +
  forward-proofing — `matchSegments` disambiguates on segment count first
  (4/5/6-segment rows cannot shadow each other), so spend no effort "proving"
  precedence; the **load-bearing** property is that **every** route has a row
  (an unmapped route → `getRoutePermission` null → the router skips the RBAC
  check → silent open write). No route is `public`; auth stays in the central
  gate (NFR-05 — **no per-route check**). In `seed-rbac-roles.ts` **add**
  `"capability:read"` + `"capability:write"` to the existing
  `business_architect` role's permission array (line 96; idempotent MERGE by
  role name — this spec **modifies** the role `model-workspace-core` created).
- **Verification**: `api/__tests__/capability-authz.test.ts` — **table-driven
  over T-09's exact 13 method+route literal list (tasks-review C-03): for each
  pair, `getRoutePermission` returns a non-null `capability:*` permission —
  never a hand-enumerated subset**; a session without `capability:write` → 403
  on `POST /capabilities`, the three `PUT`s, both body/param DELETEs, `PATCH`,
  `DELETE`; a `capability:read` session → 200 on the list GET and the two
  `system-model` GETs; the `:capabilityId` GET/PATCH/DELETE resolves to the
  right permission; the `business_architect` role resolves both `capability:*`;
  no new route `isPublicRoute` (AC-09 authz half).

### T-10 — Model isolation + orphan-source + generic-surface integration test

- **Files** (1): `api/__tests__/capability-model-scope.integration.test.ts` (new)
- **Implements**: design §3.4, §4.1, DD-02, DD-08, **DD-16**, DD-17 + rev-3
  design-review C-01 — closes AC-06b, AC-09 (isolation half); supports NFR-02
- **Complexity**: moderate
- **Blocked by**: T-04, T-05, T-09
- **Blocks**: T-19
- **Steps**: Seed **two** models (API-only: `POST /api/v1/models` + `.../domains`
  + core node/journey routes + story routes).
  - **(AC-06b — the binding map-then-orphan recipe, DD-16 + rev-3 N-02):**
    (1) build the real scope chain — journey `PART_OF` a scoped domain, activity
    `PART_OF` the journey (`Activity→Domain` is **not** a registered `PART_OF`
    pair; `scopedNodeIds` walks `PART_OF*` from the domain); (2) create the
    capability via POST (gets `CAPABILITY_IN_MODEL`); (3) `PUT …/needed-by
    {activityId}` while the activity is scoped; (4) **orphan** it by `DELETE`ing
    the **`Activity→UserJourney`** `PART_OF` edge via the generic graph-core
    edge surface (a real route, not a driver write); (5) assert the capability
    **still appears** in `GET .../capabilities` and `.../system-model/gaps`
    (membership rides `CAPABILITY_IN_MODEL`, not source-in-`scopedNodeIds`), and
    a **fresh** `PUT …/needed-by` against the now-orphan activity → `404
    not_found` (DD-16's strict arm).
  - **(AC-09 isolation):** give each model its own capabilities; assert `GET
    /api/v1/models/:modelA/capabilities` and `.../system-model/gaps` return only
    model-A capabilities and **exclude** every capability whose
    `CAPABILITY_IN_MODEL` points at model B; assert a capability id is **not**
    itself in `scopedNodeIds`; a shared `System` may appear in both models'
    analyses.
  - **(Generic-node-surface degradation — rev-3 design-review C-01):**
    `POST /api/v1/nodes/Capability` (generic surface, `node:write` session)
    succeeds post-registration but the created node carries **zero**
    `CAPABILITY_IN_MODEL` edges — assert it appears in **neither** model's
    list nor gaps (invisible, benign; the accepted-risk posture of the
    carry-forward table).
- **Verification**: `api/__tests__/capability-model-scope.integration.test.ts`
  (AC-06b, AC-09 isolation half, DD-16 strict arm, C-01 degradation guard).

### T-11 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: design §4.9, DD-11 — closes AC-09 (openapi half); supports
  FR-10
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-08, T-09
- **Blocks**: T-19
- **Steps**: Register the capability/system-model request+response schemas
  (`capabilityCreateSchema`, `capabilityPatchSchema`, `capabilityReadSchema`,
  `neededBySchema`, `supportedBySchema`, `contextAssignSchema`,
  `gapsResultSchema`, `contextMapResultSchema` — all from T-01) and
  `registry.registerPath` each of the 13 routes (design §4.7/§5), generated from
  the same zod definitions (no hand-maintained copy, FR-10). The **three** `PUT`
  routes register with `method: "put"` — the generator's `RouteConfig` `Method`
  union includes `'put'` (verified, DD-11); these are the document's first `put`
  operations. The three new `ERROR_CODES` members surface in the shared
  `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/capability-openapi.integration.test.ts` —
  every new route path and each of the three new `ERROR_CODES` members appears
  in `GET /api/v1/openapi.json`; **asserts
  `paths["/api/v1/models/{modelId}/capabilities/{capabilityId}/needed-by"].put`
  exists** (first-PUT emission, DD-11) (AC-09 openapi half; also confirms
  T-03's codes).

### T-12 — PWA api client (capabilities + systemModel blocks)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.11 — supports FR-12, FR-13, FR-15
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-13
- **Steps**: Add a `capabilities` block and a `systemModel` block to the `api`
  object (design §4.11), reusing the existing `json<T>()` fetch wrapper.
  `capabilities`: `list`/`get`/`create`/`patch`/`remove` (on
  `/api/v1/models/${modelId}/capabilities…`) plus nested `neededBy`
  (`put`/`remove` — `remove` sends the body-carrying DELETE), `supportedBy`
  (`put`/`remove(systemId)`), `context` (`put`/`clear`) — the three `put`s send
  `method:"PUT"` (DD-11). `systemModel`: `gaps`/`contextMap` (on
  `…/system-model/…`). Each read accepts an optional `signal`. The client
  passes `attributes` through untyped — no `systemKind` reading, no vocabulary
  import into `api.ts`; rendering rules (badges via
  `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`) live in T-13 (rev-2 tasks-review N-03).
  No production `systemKind` string literal in this file (AC-20).
- **Verification**: `pwa/src/__tests__/system-modeler.test.tsx` (the client's
  `capabilities`/`systemModel` blocks are consumed + asserted transitively by the
  view's ready-state suite); `bun run typecheck`.

### T-13 — SystemModeler view + detail/edit + ready panels + view registration

- **Files** (3): `pwa/src/views/model/SystemModeler.tsx` (new),
  `pwa/src/views/model/SystemModeler.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.10, §6, DD-13 (indicator), DD-15
  (`describingStories` render) — closes AC-17, AC-20 (CLI half); **implements**
  the view behavior for AC-10, AC-11, AC-12, AC-13, whose component-test
  closure moved to **T-18** (rev-2 tasks-review C-02); supports FR-12, FR-13,
  FR-14, FR-15, UX-01/02/05/06
- **Complexity**: complex (rev-2 tasks-review C-02: the four component test
  suites rev 2 packed in here are now T-18 — this task is view + registration
  + CLI checks only, honestly within the half-day ceiling)
- **Blocked by**: T-12
- **Blocks**: T-14, T-15, T-16, T-17, T-18
- **Steps**: In `pwa/src/views/index.tsx`, **replace the model surface's**
  `systems` slot dispatch (line 165, `<ModelTabPlaceholder tab="Systems" …/>`)
  with `"systems": (r) => <SystemModeler route={r} />` — the **only** edit to
  that file; the **explorer** surface's `systems` → `ExplorerSystems` (line 76)
  and the **analytics** surface's `systems` → `AnalyticsSystems` (line 110) stay
  untouched (`route.ts`/`SURFACES` stay `model-workspace-core`'s). `SystemModeler`
  reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx` — **does not re-implement model
  selection**), keys its three fetches (`api.capabilities.list`,
  `api.systemModel.gaps`, `api.systemModel.contextMap`) on `activeModel.id`.
  Render the **ready** state (AC-10/11/12) as three panels: the **capability
  list** (`DataTable`/`Card`; each row: name, needed-by count, supporting
  systems as `systemKind` `Pill`s, assigned context name); the **support-gap
  panel** (the four FR-07 categories with counts + deep-link affordances —
  step items surface their `describingStories` links (DD-15) — plus the
  augmentation-mix summary, the `unknown` bucket rendered defensively); the
  **context-map panel** (contexts grouped with their capabilities +
  inter-context relationships deep-linked via `targetId`, plus the `unassigned`
  bucket; a grouped list/table, **not** a drag-canvas — requirements Risk 4).
  **Detail + mapping editing** (AC-13): selecting a capability opens a catalog
  `SidePanel`/`Modal` with name/description, its `NEEDS_CAPABILITY` sources,
  `SUPPORTED_BY` systems each with a `systemKind` `Pill`, and assigned context;
  controls: edit (PATCH), add/remove needed-by source, add/remove supporting
  system, set/clear context (all FR-05 routes), delete the capability; a mapping
  whose read-model `detached[]` entry matches shows the **"detached" indicator**
  (DD-13 — driven by the read-model field; a token-styled `<span>`). **Tokens +
  catalog** (NFR-06, UX-02): `SystemModeler.module.css` uses only `var(--…)`
  from the tokens file; catalog components (`Card`, `DataTable`, `Pill`,
  `Modal`, `SidePanel`, `Button`, `Loading`/`ErrorState`/`NotFoundPanel` from
  `views/_shared.tsx`) before inventing new ones. `systemKind` conveyed by
  `Pill` **text** (`SYSTEM_KIND_LABELS`), not color alone (AC-18/AC-20).
  **Prefer rendering kinds directly via `SYSTEM_KIND_LABELS`** — do not reach
  for `pwa/src/lib/journeyData.ts`'s system-render helper (see T-15's
  conditional).
- **Verification**: `pwa/src/__tests__/system-modeler.test.tsx` (the view's
  ready-state suite asserts SystemModeler renders in the `systems` slot) **plus**
  the deterministic CLI half (AC-17, AC-20):
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx`
  **and** `--view pwa/src/views/model/SystemModeler.module.css` both exit 0;
  `git grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx`
  → no matches; `bun run typecheck` exit 0. The full AC-10..13 component test
  suites are **T-18's** deliverable (rev-2 tasks-review C-02) — T-13 is not
  complete for STATUS purposes until T-18's suites pass against it.

### T-14 — SystemModeler view-state tests (loading / empty+create / error+retry)

- **Files** (1): `pwa/src/__tests__/system-modeler-states.test.tsx` (new)
- **Implements**: design §4.10 — closes AC-14, AC-15, AC-16
- **Complexity**: moderate
- **Blocked by**: T-13
- **Blocks**: T-19
- **Steps**: jsdom component test of the three non-ready states of
  `SystemModeler`: **loading** — skeleton (`Loading` from `views/_shared.tsx`)
  while the three fetches are pending (AC-14); **empty** — no capabilities →
  empty-state `Card` offering a **"New capability"** action (POST
  `.../capabilities` → the new capability appears) and, when the model has
  activities/stories, a hint to start mapping (AC-15); **error** — a failed
  fetch renders the error state **plus a retry affordance** whose click
  refetches (AC-16 — if `ErrorState` renders no retry itself, the retry is a
  local `<Button onClick={refetch}>` rendered by `SystemModeler` alongside it).
- **Verification**: `pwa/src/__tests__/system-modeler-states.test.tsx` (AC-14,
  AC-15, AC-16).

### T-15 — SystemModeler systemKind read-path test (+ conditional legacy repoint)

- **Files** (1 + 1 conditional): `pwa/src/__tests__/system-modeler-kind.test.tsx`
  (new); `pwa/src/lib/journeyData.ts` (**conditional modify** — design §8: ONLY
  if T-13 ended up reusing its system-render helper, repoint the `sAttrs.kind`
  read (line 189) to `attributes.systemKind`; if T-13 rendered via
  `SYSTEM_KIND_LABELS` directly — the preferred path — this file stays
  untouched. FR-15 is `should`, scoped to what this spec exercises)
- **Implements**: design §4.11, FR-15 — closes AC-20 (component half); supports
  NFR-03
- **Complexity**: simple
- **Blocked by**: T-13
- **Blocks**: T-19
- **Steps**: jsdom component test asserting `SystemModeler` reads a system's
  kind from `attributes.systemKind` and renders the badge via
  `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` (`shared/src/schema/system-kind.ts`) —
  feed a capability whose supporting system carries
  `attributes.systemKind:"agentic"` and assert the rendered badge shows the
  `SYSTEM_KIND_LABELS["agentic"]` **text label** (not color-only); feed one with
  a legacy `attributes.kind` only and assert it is **not** read as the kind.
  Pairs with the T-13 CLI grep (AC-20 has a component + CLI half).
- **Verification**: `pwa/src/__tests__/system-modeler-kind.test.tsx` (AC-20
  component half).

### T-16 — SystemModeler model-context reload e2e

- **Files** (1): `pwa/playwright/system-modeler-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-19; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-13
- **Blocks**: T-19
- **Steps**: Playwright spec: with a non-reference model (model B) active,
  navigate to `#/model/systems`, reload → the same route renders `SystemModeler`
  showing **model B's** capabilities/gaps/context-map (active-model persistence
  is `model-workspace-core` FR-15; this view refetches for the persisted model).
  Assert no cross-model leakage (server-enforced via `CAPABILITY_IN_MODEL`
  membership, design §4.1). Seed via the API (models + domains + capability +
  mapping routes).
- **Verification**: `pwa/playwright/system-modeler-context.spec.ts` (AC-19).

### T-17 — SystemModeler keyboard-a11y manual walk

- **Files** (0): no new source; validates T-13's view
- **Implements**: design §4.10, §6 — closes AC-18; supports FR-12, FR-13, UX-05
- **Complexity**: simple
- **Blocked by**: T-13
- **Blocks**: T-19
- **Steps**: Confirm the view exposes an ARIA landmark; Tab reaches "New
  capability" then the capability list in DOM order; opening a capability detail
  moves focus into the panel and Escape/close returns it (reusing the catalog
  `SidePanel`/`Modal` focus-trap — not re-implemented); mapping controls
  (add/remove needed-by/system, set/clear context) are keyboard-reachable and
  activatable; each `systemKind` badge carries its text label (not color-only).
- **Verification**: `manual: with the stack up (bun run dev), load
  #/model/systems using keyboard only — Tab to "New capability" and activate
  with Enter, Tab into the capability list, Enter to open a capability — expect
  focus enters the detail panel, moves through the mapping controls in order,
  each systemKind badge shows its text label, and Escape returns focus to the
  originating list row.`

### T-18 — SystemModeler component test suites (ready panels + detail/edit)

- **Files** (4): `pwa/src/__tests__/system-modeler.test.tsx` (new),
  `pwa/src/__tests__/system-modeler-gaps.test.tsx` (new),
  `pwa/src/__tests__/system-modeler-context-map.test.tsx` (new),
  `pwa/src/__tests__/system-modeler-detail.test.tsx` (new)
- **Implements**: design §4.10, DD-13 (indicator), DD-15 (`describingStories`
  render) — closes AC-10, AC-11, AC-12, AC-13 (rev-2 tasks-review C-02: split
  out of T-13 so the four suites have an owning task and a declared file
  list); supports FR-12, FR-13
- **Complexity**: complex
- **Blocked by**: T-13
- **Blocks**: T-19
- **Steps**: Four jsdom component test suites against T-13's `SystemModeler`
  (stub `pwa/src/api.ts` responses; house pattern of the existing
  `pwa/src/__tests__/` suites):
  - `system-modeler.test.tsx` — `#/model/systems` renders `SystemModeler`, not
    `ModelTabPlaceholder`; reads `useActiveModel()`; ready capability list
    shows name, needed-by count, `systemKind` badges (via
    `SYSTEM_KIND_LABELS` text), assigned context name (AC-10).
  - `system-modeler-gaps.test.tsx` — the four FR-07 gap categories render with
    counts + deep-link affordances; step items surface their
    `describingStories` links (DD-15); the augmentation-mix summary renders
    per-kind badges and the `unknown` bucket defensively (AC-11).
  - `system-modeler-context-map.test.tsx` — capabilities grouped under their
    contexts (with `domain`/`subdomain`), the `unassigned` bucket, and
    inter-context relationships deep-linked via `targetId` (AC-12).
  - `system-modeler-detail.test.tsx` — detail panel shows name/description +
    needed-by sources + supported-by systems with `systemKind` badges +
    assigned context; edit PATCHes; add/remove needed-by/system and set/clear
    context call the FR-05 routes and update the panel; **the detached
    indicator renders when a stub response's `detached[]` is non-empty**
    (AC-13, DD-13).
- **Verification**: `pwa/src/__tests__/system-modeler.test.tsx`,
  `pwa/src/__tests__/system-modeler-gaps.test.tsx`,
  `pwa/src/__tests__/system-modeler-context-map.test.tsx`, and
  `pwa/src/__tests__/system-modeler-detail.test.tsx` under `bun test` (AC-10,
  AC-11, AC-12, AC-13).

### T-19 — Final validation sweep (AC-21 + full suite)

- **Files** (0): no new source; whole-spec gate (rev-2 tasks-review C-01:
  AC-21 now has an owning task)
- **Implements**: NFR-01, NFR-05 — closes AC-21
- **Complexity**: simple
- **Blocked by**: T-07, T-10, T-11, T-14, T-15, T-16, T-17, T-18 (every
  terminal task — transitively the whole graph)
- **Blocks**: —
- **Steps**: (1) **AC-21**: `bun run typecheck` exit 0, and `git diff
  shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows **no** additions
  to `NODE_LABELS` or `EDGE_ENDPOINTS` for the `Capability`/`BoundedContext`
  labels / four edge types (incl. **no** `IN_MODEL` endpoint-pair change —
  DD-01). (2) Full-suite run: `bun test` + `bun test:integration` (Neo4j up via
  `bun run dev`). (3) Sweep the AC-01..AC-21 (+AC-06b) table in STATUS.md —
  every AC has its verification artifact recorded before Execution flips to
  complete (`.claude/hooks/spec-completion-check.sh` blocks otherwise).
- **Verification**: manual: run `bun run typecheck` (exit 0), `git diff
  shared/src/schema/nodes.ts shared/src/schema/edges.ts` (expect zero
  `NODE_LABELS`/`EDGE_ENDPOINTS` additions — deterministic diff read, not a
  visual judgment), then `bun test` + `bun test:integration` — expect both suites
  green with every AC's verification artifact recorded (AC-21).

## Cross-cutting verification (whole-spec)

- **AC-21** is owned by **T-19** (rev-2 tasks-review C-01 — previously
  anchored to no task): transpile clean + no compile-time schema-array edit,
  plus the full-suite run. See T-19 for the exact procedure.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-13) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation |
| final task (**T-19** — owns this row, rev-2 tasks-review C-01) | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-21 (+AC-06b) sweep + AC-21 (`git diff` NODE_LABELS/EDGE_ENDPOINTS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 Capability label (registry-only; + `BoundedContext` row, DD-14) | T-01, T-02, T-19 | AC-01, AC-21 |
| FR-02 mapping + scoping edges (4 types) | T-01, T-02, T-19 | AC-02, AC-21 |
| FR-03 cardinality (MERGE idempotent / at-most-one / exactly-one) | T-04 | AC-04 |
| FR-04 capability CRUD (+ pinned list-[]-vs-404 asymmetry) | T-01, T-04, T-09 | AC-03, AC-15 |
| FR-05 mapping routes (strict needed-by validation — DD-16) | T-01, T-04, T-09 | AC-04, AC-13 |
| FR-06 cascade + detached | T-04 (detached + cascade entry), T-07 (cascade test), T-13 (indicator render), T-18 (indicator test) | AC-05, AC-13 |
| FR-07 support-gap (4 categories + mix; story arm + `describingStories` — DD-15; per-model orphans — DD-18) | T-05, T-09 | AC-06, AC-07, AC-11 |
| FR-08 USES_SYSTEM reconciliation | T-05 | AC-06 |
| FR-09 context map | T-06, T-09 | AC-08, AC-12 |
| FR-10 openapi + error codes | T-03, T-09, T-11 | AC-04, AC-09 |
| FR-11 route-perm + RBAC (table-driven no-silent-open check) | T-08 | AC-09 |
| FR-12 SystemModeler + 4 states | T-12, T-13, T-14, T-18 | AC-10, AC-14, AC-15, AC-16 |
| FR-13 detail + mapping editing | T-13, T-18 | AC-13, AC-18 |
| FR-14 model-scope + reload survival | T-13, T-16, T-18 | AC-10, AC-19 |
| FR-15 systemKind read-path repoint (`should`) | T-12, T-13, T-15 | AC-20 |
| NFR-01 registry-only, no const edit | T-02, T-19 | AC-01, AC-02, AC-21 |
| NFR-02 model isolation via CAPABILITY_IN_MODEL (+ generic-surface degradation guard) | T-04, T-05, T-10 | AC-06b, AC-09 |
| NFR-03 systemKind vocab reuse | T-01, T-05, T-12, T-15 | AC-07, AC-20 |
| NFR-04 bounded-contexts data read-only (registry row is metadata — DD-14) | T-02, T-06 | AC-08 |
| NFR-05 house rules (loopback/zod/`/api/v1/`/en-US/central auth) | T-08, T-09, T-19, all | AC-09, AC-21 |
| NFR-06 tokens-only + catalog | T-13 | AC-17 |
| NFR-07 bounded round-trips (no N+1) | T-05, T-06 | AC-06, AC-08 |
