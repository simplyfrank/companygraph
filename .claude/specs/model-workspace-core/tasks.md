---
feature: "model-workspace-core"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 4
reviewing_requirements_revision: 4
reviewing_design_revision: 4
review_pass_1: "approve (0 blockers, 3 concerns, 3 nits) — all folded into rev 2"
review_pass_2: "revise of rev 2 (4 blockers, 3 concerns, 3 nits) folded into rev 3; final on-disk re-review: approve of rev 3 (0 blockers, 3 concerns, 2 nits; cap 2/2) — residuals + the requirements rev-4 C-10 sync folded into rev 4 (post-approval sync, not a new review pass)"
size: "large"
total_tasks: 22
---

# Tasks: model-workspace-core

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit (`Blocked by`
  / `Blocks`); no out-of-order execution. **T-22 is physically slotted between
  T-08 and T-09**, and **T-19 is physically slotted before T-18** (T-18's steps
  consume T-19's `api.ts` methods — resolves final-review C-01); IDs are out of
  numeric sequence because stable IDs are never renumbered.
- **Deferred-green rule (resolves final-review C-02)**: integration tests
  `fetch` a running API on `127.0.0.1:8787`, so **HTTP-level** assertions
  (status codes; fixtures via `POST /models/:id/domains`,
  `PATCH …/nodes/:nodeId`, `POST …/edges`) authored in T-04…T-09/T-22 cannot
  run green until router **dispatch** lands in **T-13**. At each storage task's
  checkpoint run `bun run typecheck` + the storage-level assertions that need
  no route surface; the full test files run green at the **T-13** checkpoint.
  Guard-dependent assertions (the D-4 generic-route 409s) run green when
  **T-10** lands — T-10's verification claims them.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The completion
  hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every file the
  task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css`
  gets its own invocation (resolves review N-03: this sentence now matches the
  checkpoints-table rule from pass-1 C-01).
- Integration tests (`*.integration.test.ts`) need Neo4j (`bun test:integration`
  after `bun run dev`); unit/component tests run under `bun test`.

## Design-basis pins (design rev 4 — §2.1 Deviations Register + resolved findings)

> **Rev-4 basis note.** Requirements rev 4 and design rev 4 are now on disk;
> design rev 4 is a reconciliation of approved rev 3 against the user-approved
> requirements rev 4 (design §2.1 is a landed ledger). The **only** tasks-visible
> contract rev 4 adds is §4.7's `--down` **`--force` refusal** (requirements
> rev-4 C-10) — synced into T-16 in this revision. Everything else in this
> section carries over from rev 3 unchanged.

> **Correction (resolves review B-04(b)).** The rev-2 version of this section
> claimed design review pass 2 ended **revise** with B-02/C-06/C-07 left open
> for the tasks author to pin, with no re-review available. The on-disk
> artifacts say otherwise: `design.md` is **revision 3** and `review-design.md`
> is an **approve of revision 3** — the design phase closed **approve**, and
> B-02, C-06, C-07, N-05, N-06 are all resolved *in the design itself*. The
> former pin labels C-06/C-07 also collided with *different* findings of the
> same IDs in `review-design.md` (there, C-06 = the domains route, C-07 = the
> migration guard). This section is rewritten against rev 3's non-colliding
> IDs — the §2.1 **Deviations Register (D-1…D-5)** and §-references. Where a
> row repeats a rev-3 decision, the design text is authoritative; the row
> exists only to name the locking task and fixture.

| Design decision (rev 3) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **§3.4 (B-02 resolution)** — every materialized fork node carries `forkLocalKey = "<instanceId>::<localKey>"` (the **full instance-qualified synthetic id**, never the bare snapshot key). Membership of a raw UUID = `forkLocalKey STARTS WITH "<instanceId>::"`; synthetic-id resolution = exact `forkLocalKey` equality; the forked read anchors on `{forkLocalKey: "<instanceId>::journey"}`. Index-backed (§4.3). | Fork writes the instance-qualified value; all three resolutions query that one property; the two lookup indexes exist. | T-08 (fork + resolution) + T-03 (indexes) + `module-fork.integration.test.ts` fixture (two instances of one module under one Domain → distinct subtrees) |
| **D-4** — requirements AC-06's "generic write on a version-owned node → `409 module_version_immutable`" arm is unreachable under the blob-snapshot model. A generic write to a `BusinessModuleVersion` node returns `409 model_lifecycle_route_required`; `module_version_immutable` is reachable **only** through the explicit-version publish collision (§4.4). | The AC-06 test asserts exactly this single reading. | T-06 (explicit-version collision — proven in `module-publish.integration.test.ts`) + T-08 + T-10 (generic-write 409s — proven in `module-fork.integration.test.ts` + `model-crud.integration.test.ts`) — crediting fixed per final-review N-02 |
| **D-1** — no `?model=<id>` query param on any GET in this spec; scope resolves from the `:modelId` **path** param. | No GET gains a `?model=` param; isolation proven by the `scopedNodeIds` test + the path-scoped instance list. | T-04 (helper + test) + T-11 (instance list route) + `model-scope.integration.test.ts` |
| **D-2** — instantiate body carries a **required `targetDomainId`** (FR-07's `{moduleId, version?}` is superseded). | `instanceCreateSchema` requires it; bad/foreign domain → 400. | T-01 + T-07 |
| **D-3** — optional explicit-version publish mode (`{version?}`); collision → `409 module_version_immutable`. | Default stays auto-increment `max+1`. | T-06 |
| **D-5** — the requirements' positional `design-conformance.ts pwa/src/views/model/` invocation is inert; only the `--view <file>` form counts. | Tests and checkpoints use `--view` per touched file only. | T-20 |
| **§3.3 (N-05)** — canonical number form = the ECMAScript `Number#toString` form (what `JSON.stringify` emits); deterministic cross-platform. | `canonicalStringify` adds no custom number formatting. | T-06 |
| **§3.4 (N-06)** — the synthetic `<uuid>::a0` travels as the `:nodeId` path segment verbatim; the router splits only on `/`, the handler splits on the literal `::`. | Route-handler comment documents that clients must not URL-mangle `::`. | T-08 |

Full rationale for every row: design §2.1 and the resolution notes at §3.3,
§3.4, §4.2–§4.4. (Resolves review N-01 — no dangling "(see Open Questions)"
pointers; this file has no Open Questions section. Cross-references point at
design §2.1 and `STATUS.md`.)

### Execution preconditions (orchestrator actions — resolves review B-04(d), N-02; status per final-review C-03)

**Both preconditions are LANDED as of rev 4** (final-review C-03 actioned):

1. ~~Land the requirements rev-3 errata~~ — **landed.** `requirements.md` is
   now **rev 4** (approved by the user 2026-07-04): D-1…D-5, the additive
   `POST /api/v1/models/:id/domains` route, and the four-label count (N-10)
   are folded into the body — plus the new **C-10** `--down --force` contract
   this revision syncs into T-16. This artifact's frontmatter pins
   `reviewing_requirements_revision: 4`.
2. ~~Correct STATUS.md~~ — **landed.** STATUS.md now records the design review
   as approve (of rev 3; cap 2/2) and design rev 4 as a post-approval
   reconciliation.

**One orchestrator item remains before further source edits**: gate design
rev 4 (`design.md` frontmatter `status: revised` → `approved`) without a new
review pass — the cap is 2/2, the review approved rev 3, and rev 4 adds no
contract beyond the requirements-mandated `--force`. `spec-gate-check` blocks
source-file edits on design-named files while design status is not `approved`.

## Task-review pass 1 — resolutions (rev 2)

`review-tasks.md` pass 1 verdict: **approve**, 0 blockers. All 3 concerns and
3 nits were folded into rev 2. No IDs renumbered; changes were confined
to Verification/DoD fields and the traceability table.

| Finding | Resolution | Where |
|---------|------------|-------|
| **C-01** — `--view <tsx>` lints only the one file passed; the `.module.css` (where the AC-16 `var(--…)` token rules live) was never scanned | T-20 verification now runs design-conformance **twice** — once against `ModelWorkspace.tsx` **and** once against `ModelWorkspace.module.css` — both must exit 0. The validation-checkpoints table row is updated to "every file the task touches under `pwa/src/views/`". | T-20, checkpoints table |
| **C-02** — ordering claim in T-13 was broader than load-bearing; the real risk is an unmapped route (⇒ `getRoutePermission` returns `null` ⇒ router skips RBAC) or same-length shadowing | T-13 steps scope the ordering note to same-length rows (`matchSegments` rejects on length first); the authz test adds one **explicit shadowing assertion**: `getRoutePermission("PATCH", "/api/v1/models/:modelId/module-instances/:instanceId/nodes/:nodeId")` must resolve to exactly `module:write` — not `null`, not a looser earlier row's permission. | T-13 |
| **C-03** — `routes/models.ts` is created by T-08 but finalized by T-11; the seam must keep the per-task transpile checkpoint honest | T-08 gains an explicit DoD: its slice of `models.ts` compiles standalone under `bun run typecheck` and exports only the fork-trigger handler (`handleInstanceNodePatch`) plus a `registerModelRoutes` partial; T-11 **adds** the remaining handlers without modifying T-08's exported handler. (T-22 rides the same seam — add-only.) | T-08, T-22, T-11 |
| N-01 — traceability table under-credited FR-13 | FR-13 row also credits the routes that make the new `ERROR_CODES` members envelope-reachable per design §5. | Traceability table |
| N-02 — requirements AC-16 cites an inert positional-dir invocation | Noted in T-20 verification: use only the `--view <file>` form; do **not** copy the stale positional phrasing into tests (it exits 0 with "no targets"). | T-20 |
| N-03 — `Alt+0` key→index math proven only manually | T-17 verification adds a unit assertion on the key→index mapping (`"0"` → 9, `"1"` → 0, `"9"` → 8) alongside the manual repro. | T-17 |

## Task-review pass 2 — resolutions (rev 3)

`review-tasks.md` pass 2 verdict: **revise** — 4 blockers, 3 concerns, 3 nits,
all rooted in rev 2 having been authored against superseded design rev 2.
This revision re-syncs the artifact to **design rev 3**. Review budget is
exhausted (2/2); every finding below is landed as written.

| Finding | Resolution | Where |
|---------|------------|-------|
| **B-01** — FR-08 sibling edge routes had no task | New **T-22** (instance-edge storage write/delete + the two edge route handlers, add-only on the T-08 seam) with design §8's AC-06 edge assertions incl. the first-edit-is-an-edge-edit fork path; `instanceEdgeSchema` added to T-01; `module:write` rows added to T-13; openapi paths added to T-14. | T-01, T-22, T-13, T-14 |
| **B-02** — `POST /models/:id/domains` / `attachDomain` had no task | `attachDomain` added to T-05 steps + verification; route handler added to T-11; `model:write` row added to T-13; openapi path added to T-14; domain-attach body schema added to T-01; T-04/T-07/T-08 verifications now state model-B setup goes through `POST /models/:id/domains` (API-only, design §8 — no direct-driver seeding). | T-01, T-04, T-05, T-07, T-08, T-11, T-13, T-14 |
| **B-03** — T-16 implemented the superseded rev-2 migration guard | T-16 guard rewritten to design §4.7 rev 3: abort **only** when the reference model is absent AND a non-reference model exists; with the reference model present, re-runs proceed idempotently forever. Verification adds the re-run-after-user-model and guard-abort assertions. | T-16 |
| **B-04** — stale upstream pinning | (a) frontmatter `reviewing_design_revision: 3`; (b) preamble rewritten against design §2.1 D-1…D-5 with non-colliding IDs; (c) T-03 gains the two `forkLocalKey` lookup indexes + a re-run-idempotence verification line; (d) the pending requirements errata + STATUS.md correction are recorded as explicit orchestrator preconditions. | frontmatter, pins section, preconditions, T-03 |
| **C-01** — design-review C-09 (deleted fork anchor) carried nowhere | T-08 gains a deleted-anchor hardening step (missing-anchor forked read → instance envelope with empty content, never a 500; model-scoped write to such an instance → `404 module_instance_node_not_member`) + one assertion in `module-fork.integration.test.ts`. | T-08 |
| **C-02** — T-07's "read identical content" would be an unpassable deep-equal | T-07 verification reworded to "identical **modulo the projected handles**" per design N-12 (names, descriptions, attributes, `precedes`/ref structure equal — ids differ by construction). | T-07 |
| **C-03** — `listInstances` content resolution had no explicit owner | `listInstances` named in T-07's steps with the §4.5 content resolution (forked read anchored on `{forkLocalKey: <instanceId>::journey}`; non-forked synthetic projection); design N-11's DELETE-body note carried into T-22. | T-07, T-22 |
| N-01 — dangling "(see Open Questions)" pointers | Removed — the pins section points at design §2.1 / STATUS.md. | pins section |
| N-02 — STATUS.md contradicts the on-disk design review | Recorded as orchestrator precondition #2 (this artifact does not edit STATUS.md). | preconditions |
| N-03 — reading-guide checkpoint wording still singular | Reading-guide sentence aligned with the checkpoints-table rule (every touched file gets its own invocation). | reading guide |

## Task-review final pass (approve of rev 3) + design rev-4 sync — resolutions (rev 4)

The final on-disk `review-tasks.md` (pass 2/2) verdict is **approve of rev 3** —
0 blockers, 3 concerns, 2 nits, all flagged as execution-time discipline. Rev 4
folds them into the artifact anyway (a revision was required regardless, for the
requirements rev-4 C-10 sync STATUS.md pinned), so the executed artifact and the
executed order agree on paper. Review budget stays exhausted (2/2); this is a
post-approval sync, not a new review pass.

| Finding | Resolution | Where |
|---------|------------|-------|
| **STATUS.md "Next" #1 — T-16 out of sync with requirements rev-4 C-10 / design §4.7 rev 4** | T-16 `--down` gains the refusal guard: while any non-reference `BusinessModel` exists, `--down` refuses and writes nothing unless `--force` is also passed; verification adds "second model survives a forced down-migration with its `IN_MODEL` edges + subgraph intact". Documented-limitation wording synced to "re-apply after a **forced** `--down`". | T-16 |
| **C-01** — PWA-chain ordering metadata internally inconsistent | T-19 physically slotted before T-18 (top-to-bottom execution now honest); T-17 no longer claims `Blocks: T-19` (`api.ts` needs only T-01 — asymmetry reconciled in T-17's favor of the `Blocked by` fields); T-18's Files list now counts `pwa/src/App.tsx` (2 files, still ≤3). | reading guide, T-17, T-19, T-18 |
| **C-02** — per-task checkpoint timing over-stated for T-05…T-09/T-22 | Deferred-green rule added to the reading guide (HTTP-level assertions green at the **T-13** dispatch checkpoint; D-4 guard assertions green at **T-10**); T-04's green point corrected T-11 → T-13; T-05…T-09/T-22 verifications carry the deferral marker; T-08's D-4 assertion explicitly tagged as landing with T-10. | reading guide, T-04…T-09, T-22 |
| **C-03** — preconditions recorded but not actioned on disk | Actioned: requirements rev 4 + STATUS.md correction are landed; preconditions section updated to reflect it; the one remaining orchestrator item (gate design rev 4) is named there. | preconditions |
| N-01 — T-10's test-edit ownership implicit | Explicit step: T-10 **adds** the two generic-route 409 assertions to the existing test files. | T-10 |
| N-02 — D-4 pins-row credit imprecise | Row now credits T-06's half to `module-publish.integration.test.ts` and T-10's generic-write half to the fork/crud files. | pins table |

## Task list

### T-01 — Model-workspace zod schemas (shared)

- **Files** (1): `shared/src/schema/model-workspace.ts` (new)
- **Implements**: design §3.1–3.4, §3.6, §4.3, §4.4 — supports FR-01, FR-02, FR-05, FR-06, FR-07, FR-08, FR-09, FR-13
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-05, T-06, T-09, T-11, T-12, T-14, T-19, T-22
- **Steps**: Define zod schemas at the REST boundary: `modelCreateSchema`
  (`name` required, `description?`, `attributes?`), `modelPatchSchema` (all
  optional, omitted → unchanged), `modelReadSchema` (server fields + `ordinal:int`,
  `status`, `isReference`, `moduleInstanceCount:int`). Module set:
  `moduleCreateSchema` (`sourceModelId`, `sourceJourneyId`, `name`),
  `versionPublishSchema` (`version?:int` — explicit-version mode, §4.4/D-3),
  `instanceCreateSchema` (`moduleId`, `version?:int`, **`targetDomainId` required** —
  §3.4/D-2), `instanceUpgradeSchema` (`toVersion:int`, `allowDowngrade?:boolean`),
  and read schemas for version + instance (instance read projects `id` as the
  synthetic content-id for non-forked members, §3.4). **`instanceEdgeSchema`
  (resolves review B-01)**: `{type, from, to}` where `type ∈ {"PRECEDES",
  "EXECUTES","USES_SYSTEM","AT_LOCATION"}` (a closed zod enum — lifecycle edge
  types are not members) and `from`/`to` each accept a live UUIDv7 **or** a
  synthetic `<instanceId>::<key>` handle (§4.4). **`domainAttachSchema`
  (resolves review B-02)**: `name` required, `description?`, `attributes?` —
  the `POST /api/v1/models/:id/domains` body (§4.3). en-US identifiers; zod only.
- **Verification**: `shared/src/schema/__tests__/model-workspace.test.ts` — parse
  valid/invalid payloads; `instanceCreateSchema` rejects a body missing
  `targetDomainId`; `modelPatchSchema.parse({})` is valid (all-optional);
  `instanceEdgeSchema` rejects a lifecycle edge type (`IN_MODEL`) and accepts a
  synthetic `<uuid>::a0` handle in `from` (B-01); `domainAttachSchema` requires
  `name` (B-02).

### T-02 — Additive error codes

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.6 — closes part of FR-13
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-08, T-10, T-11, T-12, T-22
- **Steps**: Append the nine additive codes to the closed `ERROR_CODES` array:
  `model_not_found`, `model_reference_immutable`, `module_not_found`,
  `module_version_not_found`, `module_instance_forked`, `module_version_immutable`,
  `module_downgrade_not_allowed`, `model_lifecycle_route_required`,
  `module_instance_node_not_member`. Additive-only (NFR-11) — no existing code
  removed or reordered. Keep the exhaustive-assertion happy.
- **Verification**: `api/__tests__/model-openapi.integration.test.ts` (jointly with
  T-12) asserts each new code is a member of `ERROR_CODES`; `bun run typecheck`
  passes the exhaustiveness assertion.

### T-03 — Register labels + edges; ordinal constraint; forkLocalKey indexes; bootstrap wiring

- **Files** (2): `api/src/scripts/register-model-labels.ts` (new),
  `api/src/neo4j/bootstrap.ts` (modify)
- **Implements**: design §4.1, §4.3 (constraints + indexes) — closes AC-01, AC-02;
  supports FR-01, FR-02, FR-03, FR-04, NFR-01, the FR-05/NFR-02 `ordinal`
  constraint, and the §3.4 B-02 anchor (index-backed)
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-04, T-05, T-06, T-16
- **Steps**: `registerModelSchema(driver)` loops **four** `createNodeLabel`
  (`BusinessModel`, `BusinessModule`, `BusinessModuleVersion`, `ModuleInstance`;
  permissive `json_schema_doc: {}` — four labels per the authoritative
  enumeration, design-review N-10; earlier "five" counts were wrong) then five
  `createEdgeType` with endpoint pairs
  (`IN_MODEL` Domain→BusinessModel, `HAS_VERSION`, `INSTANTIATES`, `INSTANCE_IN`,
  `FORKED_FROM` per §3.5), each wrapped to swallow `409 name_conflict` →
  **idempotent**. Do **not** touch `NODE_LABELS` / `EDGE_ENDPOINTS` consts (NFR-01).
  In `applySchema` (bootstrap): call `registerModelSchema` after the const-seed step,
  then add `CREATE CONSTRAINT business_model_ordinal_unique IF NOT EXISTS FOR
  (m:BusinessModel) REQUIRE m.ordinal IS UNIQUE`, **plus the two `forkLocalKey`
  lookup indexes (resolves review B-04(c); design §4.3, B-02 anchor)**:
  `CREATE INDEX user_journey_fork_local_key IF NOT EXISTS FOR (n:UserJourney)
  ON (n.forkLocalKey)` and `CREATE INDEX activity_fork_local_key IF NOT EXISTS
  FOR (n:Activity) ON (n.forkLocalKey)` — so §3.4's equality and `STARTS WITH`
  resolutions are index-backed. Add `register:model` script (T-14).
- **Verification**: `api/__tests__/model-labels.integration.test.ts` (labels appear
  in `GET /api/v1/schema`; `NODE_LABELS` unchanged; re-run adds no duplicates) +
  `api/__tests__/model-edges.integration.test.ts` (edges via `createEdgeType`;
  wrong endpoint pair → `400 edge_endpoint_label_mismatch`); `applySchema`
  re-run is a no-op — the constraint **and both indexes** are `IF NOT EXISTS`,
  so a second run creates nothing (B-04(c)).

### T-04 — Model-scope read helper

- **Files** (1): `api/src/storage/model-scope.ts` (new)
- **Implements**: design §4.2 — closes AC-21 (part 1); supports FR-18, NFR-03a; pins D-1
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: T-05, T-08, T-11
- **Steps**: `scopedNodeIds(driver, modelId): Promise<Set<string>>` runs the single
  §4.2 Cypher (Domains `IN_MODEL` the model + `PART_OF*0..` descendants + the model's
  `ModuleInstance`s). Returns **structural** nodes only; shared
  `System`/`Role`/`Location` are excluded (DEC-01 (a)). `scopedWhereFragment(alias,
  modelId)` returns an `(alias.id IN $__scopeIds)` fragment + param. **No `?model=`
  query param anywhere (D-1).**
- **Verification**: `api/__tests__/model-scope.integration.test.ts` — two models
  each with its own Domain/journey/activity subtree + shared reference nodes;
  `scopedNodeIds(modelA)` excludes every B-only node and includes the shared
  `System`/`Role`/`Location` (AC-21 part 1). **Fixture is API-only (resolves
  review B-02 setup path; design §8 AC-21)**: both models' domains are created
  through `POST /api/v1/models` + `POST /api/v1/models/:id/domains` — no
  direct-driver seeding. Because the route handlers land in T-11 and router
  **dispatch** lands in T-13, the T-04 checkpoint is `bun run typecheck` + the
  test compiling; the file runs green at the **T-13** checkpoint (deferred-green
  rule, final-review C-02 — the rev-3 "green at T-11" pin was too early).

### T-05 — Model CRUD storage (ordinal, count, cascade delete, domain attach)

- **Files** (1): `api/src/storage/models.ts` (new)
- **Implements**: design §4.3 — supports FR-05, FR-07 setup
- **Complexity**: complex
- **Blocked by**: T-01, T-03, T-04
- **Blocks**: T-11, T-16
- **Steps**: `createModel` (one `executeWrite`; `ordinal = coalesce(max,0)+1`;
  `ConstraintValidationFailed` → bounded retry ≤3; refuse a 2nd `isReference:true`
  in-tx; defaults `status:"active"`, `isReference:false`). `listModels`
  (`ORDER BY ordinal ASC`; `moduleInstanceCount` computed in the same query via
  `INSTANCE_IN` count — no N+1). `getModel`, `patchModel` (dynamic SET, omitted
  fields untouched). `archiveModel` (`SET status="archived"`; subgraph retained).
  `deleteModel` (`isReference` → throw `model_reference_immutable`; else collect
  `scopedNodeIds` set — already excludes shared reference nodes, §4.3 N-03 — and
  `DETACH DELETE` model root + `IN_MODEL` domains + `PART_OF` descendants +
  `ModuleInstance`s; catalog `BusinessModule`/`BusinessModuleVersion` **not** deleted).
  **`attachDomain(modelId, {name, description?, attributes?})` (resolves review
  B-02; design §4.3)** — backs `POST /api/v1/models/:id/domains`: in one tx,
  creates a new `Domain` (server UUIDv7, sanctioned storage path) **and** its
  `IN_MODEL` edge to the model → 201 with the domain envelope; absent model →
  `model_not_found`. The `IN_MODEL` edge is written internally by this function —
  the T-10 guard on the generic edge route is not in its path. This is the
  minimal sanctioned API path that puts a `Domain` into a user-created model
  (without it, `instantiate`'s required `targetDomainId` is unsatisfiable and
  `business_architect` — deliberately without `node:write`/`edge:write`, T-15 —
  cannot populate a model at all). Richer domain authoring stays downstream.
- **Verification**: `api/__tests__/model-crud.integration.test.ts` — create→201+UUIDv7+
  server ordinal (=max+1, unique); list ordered by ordinal with `moduleInstanceCount`;
  PATCH preserves omitted fields; archive sets `status:archived` + retains subgraph;
  DELETE non-ref → 204 + scoped subgraph gone + catalog versions survive; DELETE ref →
  `409 model_reference_immutable` (drives AC-03); **`attachDomain` creates the
  `Domain` + `IN_MODEL` edge in one tx and the domain then appears in
  `scopedNodeIds(model)`; absent model → `model_not_found` (B-02)**.
  Deferred-green (C-02): HTTP-level assertions run green at the T-13 checkpoint;
  run the storage-level halves (direct function calls) at this checkpoint.

### T-06 — Module publish: snapshot + canonical checksum

- **Files** (1): `api/src/storage/modules.ts` (new — publish half)
- **Implements**: design §3.3, §4.4 (`createModule`, `publishVersion`) — closes AC-04;
  supports FR-06, NFR-04; pins D-3, N-05
- **Complexity**: complex
- **Blocked by**: T-01, T-03
- **Blocks**: T-07, T-12
- **Steps**: `createModule({sourceModelId, sourceJourneyId, name})` → `BusinessModule`
  node. `publishVersion(moduleId, {version?})`: read the source journey subtree,
  serialize to the §3.3 `snapshot_json` shape with the **deterministic `localKey`
  walk** (topological `PRECEDES`, ties by `createdAt` then `id`; journey = reserved
  key `journey`; reference edges store the **shared** node id verbatim, DEC-01 (a)).
  `canonicalStringify(value)` = key-sorted (US-ASCII), no insignificant whitespace,
  arrays in stored order, numbers in **ECMAScript `Number#toString` form (N-05)**;
  `checksum = sha-256 hex` over it (covers snapshot object only — not `publishedAt`/
  `version`/ids). Default mode: `version = max+1` (monotonic). Explicit-version mode
  (`{version:n}`, D-3): if `n` already exists for the module → `409 module_version_immutable`
  (the single reachable site, D-4). CREATE immutable `BusinessModuleVersion` +
  `HAS_VERSION`.
- **Verification**: `api/__tests__/module-publish.integration.test.ts` — snapshot
  immutable; version auto-increments (v2 not a mutation of v1); versions list DESC;
  **explicit-version publish of an existing version → 409 `module_version_immutable`**;
  re-publishing an **unchanged** subtree is **checksum-identical** (canonical
  serialization) (AC-04). Deferred-green (C-02): route-surface assertions run
  green at the T-13 checkpoint; storage-level halves run at this checkpoint.

### T-07 — Module instantiate + instance read

- **Files** (1): `api/src/storage/modules.ts` (extend — instantiate + `listInstances`)
- **Implements**: design §4.4 (`instantiate`), §4.5 (`listInstances` content
  resolution) — closes AC-05; supports FR-07
- **Complexity**: moderate
- **Blocked by**: T-06
- **Blocks**: T-08, T-09, T-11
- **Steps**: `instantiate({modelId, moduleId, version?, targetDomainId})` — resolve
  version (default latest → else `module_version_not_found`); validate
  `targetDomainId` is a `Domain` linked `IN_MODEL` the model (else `invalid_payload`,
  §3.4/D-2); CREATE `ModuleInstance {forked:false, pinnedVersion, targetDomainId}` +
  `INSTANTIATES` (pin) + `INSTANCE_IN`. Two models instantiating the same version share
  the immutable blob → identical content, no shared live nodes to mutate.
  **`listInstances(modelId)` (resolves review C-03 — this task owns it; design
  §4.5)**: instances with `pinnedVersion`/`forked` + content resolution —
  **non-forked** → deserialize the pinned `snapshot_json` and project each
  member's `id` as its synthetic content-id (`<instanceId>::journey`,
  `<instanceId>::<localKey>`; pure projection, mints no nodes); **forked** →
  read the live subtree anchored on the journey
  `{forkLocalKey: "<instanceId>::journey"}` + its incoming `PART_OF` activities,
  each node carrying its live UUIDv7 id and its instance-qualified `forkLocalKey`.
- **Verification**: `api/__tests__/module-instantiate.integration.test.ts` — body
  carries required `targetDomainId` (bad/foreign domain → 400); two models instantiate
  the same version and read **identical content modulo the projected handles**
  (each virtual node's `id` is `<instanceId>::<localKey>`, so ids differ by
  construction — compare names, descriptions, attributes, and `precedes`/ref
  structure; design N-12, **resolves review C-02**); neither read-path mutates
  the shared version (AC-05). **Model-B setup goes through
  `POST /models/:id/domains` (API-only, design §8 — B-02).** Deferred-green
  (C-02): HTTP-level assertions run green at the T-13 checkpoint.

### T-08 — Module fork + synthetic-id resolution (B-02 anchor)

- **Files** (2): `api/src/storage/modules.ts` (extend — fork + membership),
  `api/src/routes/models.ts` (new — fork-trigger PATCH handler; extended in T-22, finalized in T-11)
- **Implements**: design §3.4, §4.4 fork path — closes AC-06 (node half); supports
  FR-08, NFR-03b, NFR-04; **pins §3.4 anchor, D-4, N-06**
- **Complexity**: complex
- **Blocked by**: T-02, T-04, T-07
- **Blocks**: T-11, T-22
- **Steps**: `forkInstance(instanceId)` — idempotent; on a non-forked instance:
  deserialize the pinned `snapshot_json`, mint one fresh UUIDv7 per `localKey`
  (journey included), CREATE live `UserJourney` + `Activity` nodes `PART_OF` the
  instance's `targetDomainId`, re-create intra-subtree `PRECEDES`, re-link
  `EXECUTES`/`USES_SYSTEM`/`AT_LOCATION` to the **shared** Role/System/Location ids
  (no copy). **§3.4: write `forkLocalKey = "<instanceId>::<localKey>"`** (instance-
  qualified = the node's synthetic content-id) on each materialized node; `SET
  forked=true`; CREATE `FORKED_FROM` → source version. Already-forked → no-op 200,
  read the `forkLocalKey → id` map back via the `STARTS WITH "<instanceId>::"` prefix.
  Fork-trigger route resolution (§4.4): split `:nodeId` on the **literal `::` (N-06)**;
  non-forked instance accepts only a synthetic `<instanceId>::<key>` that is a snapshot
  member → triggers `forkInstance`, maps `<key>` to the live id, applies the edit;
  forked instance accepts the live UUIDv7 **or** the synthetic id (resolved by exact
  `forkLocalKey` match) → local edit, no fork; non-member → `404
  module_instance_node_not_member`. Version content is never written here (D-4:
  `module_version_immutable` is not reachable on this route).
  **Deleted-anchor hardening (resolves review C-01 / design-review C-09):**
  `UserJourney`/`Activity` are not lifecycle labels, so a `node:write` session can
  generic-`DELETE` a materialized fork journey; when a forked instance's read
  anchor `{forkLocalKey: "<instanceId>::journey"}` matches nothing, the read
  (`listInstances`, T-07 path) returns the instance envelope with **empty
  content — never a 500** — and a model-scoped write to any handle of such an
  instance returns `404 module_instance_node_not_member`.
  **Seam DoD (pass-1 C-03)**: the T-08 slice of `routes/models.ts` must
  compile standalone under `bun run typecheck` at the T-08 checkpoint — it exports
  exactly (a) `handleInstanceNodePatch` (the fork-trigger handler, complete and
  final in this task) and (b) a partial `registerModelRoutes` covering only that
  route. T-22 and T-11 complete the file by **adding** handlers; neither modifies
  T-08's exported handler.
- **Verification**: `api/__tests__/module-fork.integration.test.ts` — non-forked
  instance read surfaces synthetic content ids; PATCH to one forks (forked flips,
  `FORKED_FROM` set, new UUIDv7 nodes with instance-qualified `forkLocalKey`, other
  model's snapshot **checksum-identical**); **two instances of one module under the
  same Domain fork into distinct, separately-addressable subtrees (§3.4 anchor)**; 2nd edit
  stays local; non-member `:nodeId` → 404 `module_instance_node_not_member`; generic
  PATCH on `BusinessModuleVersion` → `409 model_lifecycle_route_required` (D-4);
  **deleted-anchor case (C-01): generic-`DELETE` the fork's journey → instance read
  returns the envelope with empty content (no 500) and a subsequent model-scoped
  write → 404 `module_instance_node_not_member`**. Test fixtures build model
  domains through `POST /models/:id/domains` (API-only, design §8 — B-02).
  AC-06's **edge** coverage lands in T-22 (same test file, extended there).
  Deferred-green (C-02): HTTP-level assertions run green at the **T-13**
  checkpoint; the **D-4 generic-PATCH 409 assertion runs green when T-10 ships
  the guard** (T-10 is not in this task's `Blocked by` — T-10's verification
  claims that assertion; do not expect it green here).

### T-22 — Instance edge routes: storage + handlers (fork trigger for edges)

*(New in rev 3 — resolves review B-01. Slotted here per the review's
dependency-order note: after T-08 — it needs `forkInstance` + membership —
and before T-11/T-13/T-14. The ID is out of numeric sequence because stable
IDs are never renumbered.)*

- **Files** (2): `api/src/storage/modules.ts` (extend — instance-edge write/delete),
  `api/src/routes/models.ts` (extend — the two edge-route handlers; add-only per
  the T-08 seam DoD)
- **Implements**: design §4.4 sibling edge route (B-03 option (a)), §5 edge rows —
  closes AC-06 (edge half); supports FR-08, NFR-03b, NFR-04
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-08
- **Blocks**: T-11, T-13, T-14
- **Steps**: Storage: `createInstanceEdge(instanceId, {type, from, to})` /
  `deleteInstanceEdge(instanceId, {type, from, to})` — instance edges are
  addressed by **`(type, endpoints)`**, never by edge id (snapshot `precedes`/
  `*Refs` rows carry no edge ids; no synthetic edge ids are invented). `type ∈
  {"PRECEDES","EXECUTES","USES_SYSTEM","AT_LOCATION"}` — any other type,
  lifecycle edges included, → `400 invalid_payload` (T-01 `instanceEdgeSchema`
  enforces the enum at the boundary). `from`/`to` each accept a live UUIDv7 or a
  synthetic `<instanceId>::<key>` handle, resolved per §3.4. **Membership**:
  `PRECEDES` → both endpoints must be members of this instance's subtree
  (snapshot key on a non-forked instance; `forkLocalKey STARTS WITH
  "<instanceId>::"` on a live node); reference types → the **subtree-side**
  endpoint (`to` for `EXECUTES`, `from` for the other two) must be a member, the
  other endpoint an existing shared `Role`/`System`/`Location` (missing shared
  node → `404 not_found`; wrong endpoint labels for the type → `400
  edge_endpoint_label_mismatch`); non-member subtree endpoint → `404
  module_instance_node_not_member`. **Non-forked instance → fork-then-apply**:
  `forkInstance` runs first, handles map through the returned `localKey → uuid`
  map, then the edge write applies to the live subtree — this closes the FR-08
  path where the **first** edit to an instance is an edge edit. **Semantics**:
  `POST` MERGEs on `(type, from, to)` → idempotent (`201` created, `200` if
  already present); `DELETE` removes the matched edge → `204`, absent → `404
  not_found`. Neither route ever writes version content (NFR-04, structural).
  Route handlers: `POST` and `DELETE`
  `/api/v1/models/:modelId/module-instances/:instanceId/edges`, zod-validated via
  `instanceEdgeSchema`, standard envelope, **added** to `routes/models.ts`
  without modifying T-08's exports (seam DoD). **DELETE carries a JSON body**
  — RFC 9110 gives DELETE bodies no defined semantics, acceptable on this
  loopback + Vite-proxy stack; document in a handler comment (fall back to
  query params only if a client ever misbehaves) — design N-11, carried per
  review C-03; do not relitigate during execution.
- **Verification**: `api/__tests__/module-fork.integration.test.ts` (extend with
  design §8's AC-06 edge assertions — B-01) — on a **fresh non-forked** instance,
  `POST …/edges {type:"USES_SYSTEM", from:"<instanceId>::a0", to:<sharedSystemId>}`
  **forks the instance and lands the edge on the live copy**
  (first-edit-is-an-edge-edit path); non-member subtree endpoint → `404
  module_instance_node_not_member`; re-POST of the same `(type,from,to)` → `200`
  (idempotent MERGE); `DELETE …/edges` of it → `204`, absent → `404`.
  Deferred-green (C-02): these are HTTP-level assertions — green at the T-13
  checkpoint; exercise `createInstanceEdge`/`deleteInstanceEdge` directly at
  this checkpoint.

### T-09 — Module upgrade

- **Files** (1): `api/src/storage/modules.ts` (extend — upgrade)
- **Implements**: design §4.5 (`upgradeInstance`) — closes AC-07; supports FR-09
- **Complexity**: moderate
- **Blocked by**: T-01, T-07
- **Blocks**: T-11
- **Steps**: `upgradeInstance(instanceId, toVersion, allowDowngrade?)` — forked →
  `409 module_instance_forked` (reconciliation deferred, Risk 3); missing `toVersion`
  → `404 module_version_not_found`; `toVersion < pinnedVersion` without `allowDowngrade`
  → `400 module_downgrade_not_allowed`; else re-point `INSTANTIATES` + `SET
  pinnedVersion=toVersion`. Publishing a new version never auto-upgrades (no write
  touches other instances).
- **Verification**: `api/__tests__/module-upgrade.integration.test.ts` — re-pin M≥N;
  downgrade → 400; missing → 404; forked → 409; publishing v(N+1) leaves existing
  instances pinned (AC-07). Deferred-green (C-02): HTTP-level assertions run
  green at the T-13 checkpoint; call `upgradeInstance` directly at this one.

### T-10 — Generic-route lifecycle guard

- **Files** (3): `api/src/storage/model-lifecycle-guard.ts` (new),
  `api/src/routes/nodes.ts` (modify), `api/src/routes/edges.ts` (modify)
- **Implements**: design §4.6 — supports FR-08 guard, D-4; contributes AC-03, AC-06
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-13
- **Steps**: Export `LIFECYCLE_LABELS`/`LIFECYCLE_EDGES` sets + `assertNotLifecycleLabel`
  / `assertNotLifecycleEdge` throwing `ValidationError("model_lifecycle_route_required",
  …, 409)`. Call `assertNotLifecycleLabel` at the top of `handleNodePost`/`handleNodePatch`/
  `handleNodeDelete` (after `parseRegistryLabel`) and `assertNotLifecycleEdge` in
  `handleEdgePost`/`handleEdgeDelete` (after edge-type resolution). **Storage primitives
  untouched** (no `_baseline` contract change) — additive route-boundary rejection only.
  **Test-edit ownership (final-review N-01): T-10 adds the two generic-route 409
  assertions to the existing test files** (`model-crud.integration.test.ts` and
  `module-fork.integration.test.ts`) — the assertions land with this task, not
  with the tasks that created those files.
- **Verification**: covered in `api/__tests__/model-crud.integration.test.ts` (generic
  `DELETE /api/v1/nodes/BusinessModel/:id` → `409 model_lifecycle_route_required`, AC-03)
  and `module-fork.integration.test.ts` (generic PATCH on `BusinessModuleVersion` → 409,
  AC-06).

### T-11 — Model routes handlers

- **Files** (1): `api/src/routes/models.ts` (finalize — CRUD + domains + instance routes)
- **Implements**: design §5 (models* rows) — supports FR-05, FR-07, FR-08, FR-09;
  applies the FR-18 helper via `:modelId` path param (D-1)
- **Complexity**: complex
- **Blocked by**: T-05, T-08, T-09, T-22
- **Blocks**: T-13, T-14
- **Steps**: Complete the T-08/T-22 partial (seam: **add** handlers only — do not
  modify T-08's exported `handleInstanceNodePatch` or T-22's edge handlers):
  handlers for `POST/GET/GET:id/PATCH/POST:archive/DELETE` on
  `/api/v1/models`, **`POST /api/v1/models/:id/domains` (`attachDomain`, design
  §4.3 — resolves review B-02)**, plus `POST/GET /api/v1/models/:modelId/module-instances`,
  `PATCH .../:instanceId/nodes/:nodeId` (fork trigger, landed in T-08),
  `POST/DELETE .../:instanceId/edges` (landed in T-22),
  `POST .../:instanceId/fork`, `POST .../:instanceId/upgrade`. All zod-validated at the
  boundary (T-01 schemas); consistent `{error:{code,message,details?}}` envelope.
  Instance list scopes via `scopedNodeIds(:modelId)` (path param — **no `?model=`**, D-1)
  so model A never leaks model B's instances; content resolution via T-07's
  `listInstances`.
- **Verification**: `api/__tests__/model-scope.integration.test.ts` part 2 —
  `GET /api/v1/models/:modelId/module-instances` for model A returns only A's
  instances/forked nodes, never B's (AC-21 part 2); both models' domains created
  through `POST /models/:id/domains` (API-only, design §8 — B-02); CRUD/domains/
  fork/upgrade behaviour exercised transitively by T-05/T-08/T-22/T-09
  integration tests. Deferred-green (C-02): the whole file — including the T-04
  part-1 fixture — runs green at the **T-13** checkpoint (router dispatch), not
  here.

### T-12 — Module routes handlers

- **Files** (1): `api/src/routes/modules.ts` (new)
- **Implements**: design §5 (modules* rows) — supports FR-06
- **Complexity**: moderate
- **Blocked by**: T-01, T-06
- **Blocks**: T-13, T-14
- **Steps**: Handlers for `POST/GET /api/v1/modules`, `POST /api/v1/modules/:id/versions`
  (publish, optional `{version?}` explicit-version mode), `GET /api/v1/modules/:id/versions`
  (version DESC). zod-validated; standard envelope.
- **Verification**: exercised by `api/__tests__/module-publish.integration.test.ts`
  (AC-04) through the route surface; `bun run typecheck`.

### T-13 — Router dispatch + route-permission mapping

- **Files** (2): `api/src/router.ts` (modify), `api/src/auth/rbac-permissions.ts` (modify)
- **Implements**: design §5 (dispatch), §4.8 — closes AC-10 (authz half); supports
  FR-12; wires T-10 guard calls
- **Complexity**: moderate
- **Blocked by**: T-10, T-11, T-12, T-22
- **Blocks**: T-14
- **Steps**: Add `models*` and `modules*` dispatch blocks in `router.ts` (mirror
  existing per-resource `sub.match(/…/)` blocks); ensure the generic node/edge handlers
  call the T-10 guards. In `rbac-permissions.ts` add `ROUTE_PERMISSIONS` rows
  (`P(method, path, permission)`) for **every** new route, **specific before
  parameterized** — including **`POST /models/:id/domains` → `model:write`
  (B-02)** and **`POST`/`DELETE
  /models/:modelId/module-instances/:instanceId/edges` → `module:write` (B-01)**.
  Note (pass-1 C-02): `matchSegments` rejects on segment-count first, so ordering only
  bites **same-length** literal-vs-param rows; keep the ordering discipline as
  forward-proofing, but the security-critical property is that **every** new route
  has a row (an unmapped route returns `null` from `getRoutePermission` and the
  router then skips the RBAC check entirely — silent open write). Reads → `*:read`,
  writes (incl. archive/delete/domains/fork/upgrade/edges) →
  `model:write`/`module:write`. No route is `public`; auth stays in the central gate.
- **Verification**: `api/__tests__/model-authz.test.ts` — session without `model:write`
  → 403 on `POST /api/v1/models`; with it → 201; `model:read` session → 200 on
  `GET /api/v1/models`; `getRoutePermission` resolves each new route **including
  the domains route and both edge routes** (never `null` — B-01/B-02);
  **explicit shadowing assertion (pass-1 C-02)**:
  `getRoutePermission("PATCH", "/api/v1/models/:modelId/module-instances/:instanceId/nodes/:nodeId")`
  resolves to exactly `module:write` — not `null`, not a permission inherited from an
  earlier looser same-length row; no new route `isPublicRoute` (AC-10 authz half).

### T-14 — OpenAPI registration + scripts

- **Files** (2): `api/src/routes/openapi.ts` (modify), `package.json` (modify)
- **Implements**: design §5, §7 — closes AC-10 (openapi half); supports FR-13
- **Complexity**: moderate
- **Blocked by**: T-01, T-11, T-12, T-13, T-22
- **Blocks**: —
- **Steps**: Register all model/module paths + request/response schemas in
  `openapi.ts`, generated from the same T-01 zod definitions (no hand-maintained copy) —
  **including the two instance-edge paths (from `instanceEdgeSchema`, B-01) and
  `POST /models/:id/domains` (from `domainAttachSchema`, B-02)**.
  Add root `package.json` scripts: `register:model` (T-03) and `migrate:model` (T-16).
- **Verification**: `api/__tests__/model-openapi.integration.test.ts` — every new route
  path (edge + domains routes included) and every new `ERROR_CODES` member appears in
  `GET /api/v1/openapi.json` (AC-10 openapi half).

### T-15 — Business Architect RBAC role + persona seed

- **Files** (1): `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8 — closes AC-09; supports FR-11
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: —
- **Steps**: Add a `business_architect` role to `RBAC_ROLES` (MERGE by name →
  idempotent) with permissions `["model:read","model:write","module:read",
  "module:write","domain:read","domain:write","journey:read","journey:write",
  "query:read","analytics:read"]` — **no `node:write`/`edge:write`** (FR-11 rationale).
  MERGE a `Business Architect` `Persona` + `HAS_RBAC_ROLE` binding (pattern from
  `migrate-persona-hierarchy.ts`); leave the SME persona unchanged.
- **Verification**: `api/__tests__/model-rbac.integration.test.ts` — role + persona
  seed idempotently (re-run adds no duplicate); persona resolves `model:*`/`module:*`;
  SME persona unchanged (AC-09).

### T-16 — Retail → Business Model #1 migration

- **Files** (1): `api/src/scripts/migrate-retail-to-model.ts` (new)
- **Implements**: design §4.7 (rev 4 — incl. the requirements rev-4 C-10
  `--down --force` refusal) — closes AC-08; supports FR-10, NFR-02
- **Complexity**: complex
- **Blocked by**: T-03, T-05
- **Blocks**: —
- **Steps**: `bun run migrate:model` (wired T-14). Default (apply) — **collision
  guard (resolves review B-03; design §4.7 rev 3 — the rev-2 "abort if any
  non-reference model exists" guard is superseded and must NOT be built)**:
  abort **only when the reference model is absent AND a non-reference
  `BusinessModel` exists** — `NOT EXISTS { (:BusinessModel {isReference:true}) }
  AND EXISTS { (x:BusinessModel) WHERE coalesce(x.isReference,false) = false }`
  — i.e. a user model was created before the first migration ever ran, the one
  state where scoping could land on the wrong root. **When the reference model
  is already present, user models are normal and the script proceeds
  idempotently forever** (NFR-02): the MERGE matches the existing reference
  model and step 3 scopes only still-unscoped domains. Then `MERGE
  (m:BusinessModel {isReference:true}) ON CREATE SET id=uuidv7, name="Retail
  Reference", status="active", ordinal=1, timestamps` (keyed on
  `isReference:true`, **not** `ordinal:1`); for every top-level unscoped
  `Domain`, `MERGE (d)-[:IN_MODEL]->(m)`. **Ordering rule (script header + help
  text)**: the **first** `migrate:model` run must precede the first
  `POST /api/v1/models`; the guard fails loudly if violated; subsequent re-runs
  are unrestricted. Also note in the script header that re-apply after a
  **forced** `--down` while user models exist trips the same guard and is
  unsupported (design-review C-10 — documented, not special-cased; the
  `--force` refusal exists precisely so that state is entered knowingly).
  **`--down` — refusal guard first (requirements rev-4 C-10; design §4.7
  rev 4)**: if any **other** (non-reference) `BusinessModel` exists, `--down`
  **refuses and writes nothing unless `--force` is also passed** — the operator
  must explicitly acknowledge that user models will remain while the reference
  scoping is removed. When it proceeds (no user models, or `--force`):
  `MATCH (d)-[r:IN_MODEL]->(m:BusinessModel {isReference:true}) DELETE r` then
  `DETACH DELETE m` (matched on `isReference:true`, consistent with apply) —
  **never an unqualified `IN_MODEL` sweep**, so a later-created model's
  `IN_MODEL` edges and subgraph survive intact; domain/journey/activity nodes
  untouched (counts identical to pre-migration).
  `--dry-run` runs the MATCHes read-only, prints node/edge deltas, commits
  nothing. Idempotent (MERGE + `ordinal` uniqueness constraint, T-03).
- **Verification**: `api/__tests__/model-migration.integration.test.ts` — apply creates
  + scopes all unscoped domains; 2nd run adds zero nodes/edges; **re-run after a
  user (non-reference) model exists still succeeds and adds zero nodes/edges
  (design §8 AC-08 — B-03)**; **guard-abort case: fresh graph with a user model
  and no reference model → apply aborts loudly and writes nothing (B-03)**;
  `--down` restores exact pre-migration counts; **`--down` while a second
  (non-reference) model exists refuses and writes nothing without `--force`,
  and with `--force` that second model survives the down-migration with its
  `IN_MODEL` edges + subgraph intact (requirements rev-4 C-10; design §8
  AC-08)**; `--dry-run` leaves `/api/v1/stats`
  unchanged while reporting intended deltas (AC-08).

### T-17 — PWA Model surface + surf-jump handler

- **Files** (2): `pwa/src/route.ts` (modify), `pwa/src/App.tsx` (modify)
- **Implements**: design §4.9, §6 — supports FR-14, UX-06; Native-Conflicts row
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-18 *(rev 4, final-review C-01: no longer claims T-19 — `api.ts`
  needs only T-01; the `Blocked by` fields are authoritative)*
- **Steps**: Append a `model` surface to `SURFACES`: `{id:"model", label:"Model",
  kbd:"0", tabs:[models, canvas, stories, key-activities, kpi-impact, systems, export]}`
  — all seven blueprint View-Tree tabs **verbatim**. Extend the `App.tsx` keydown regex
  `/^[1-9]$/` → `/^[0-9]$/` with `idx = e.key === "0" ? 9 : Number(e.key)-1`, keeping
  `e.preventDefault()`; update the stale line-40 comment `Alt+1..8` → `Alt+1..9 / Alt+0`.
  `parseHash`/`toHash` need no special-casing.
- **Verification**: `pwa/src/__tests__/model-workspace.test.tsx` (jointly with T-20)
  asserts the Model surface + its seven-tab subnav render in order **and** unit-asserts
  the key→index mapping (`"0"` → 9, `"1"` → 0, `"9"` → 8) so the positional math is not
  proven only manually (pass-1 N-03); `manual:` load `#/model/models`, press
  `Alt+0` — expect the Model surface activates (keyboard, AC-11 jump portion).

### T-19 — API client methods

*(Physically slotted before T-18 in rev 4 — its dependency position; T-18's
steps consume these methods. Resolves final-review C-01; the ID is out of
numeric sequence because stable IDs are never renumbered.)*

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.9 — supports FR-16
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-18, T-20
- **Steps**: Add `models` client methods: `list`, `get`, `create`, `patch`, `archive`,
  `remove`, `listInstances` (typed against the T-01 shared schemas). No instantiate
  method (instance authoring is downstream, §3.4).
- **Verification**: `bun run typecheck`; consumed + asserted transitively by
  `pwa/src/__tests__/model-workspace.test.tsx` (T-20).

### T-18 — Active-model shell context

- **Files** (2): `pwa/src/context/ActiveModelContext.tsx` (new),
  `pwa/src/App.tsx` (modify — the provider mount; counted per final-review C-01)
- **Implements**: design §4.9 — supports FR-15, UX-06
- **Complexity**: moderate
- **Blocked by**: T-17, T-19
- **Blocks**: T-20, T-21
- **Steps**: `ActiveModelProvider` + `useActiveModel()`. Load `GET /api/v1/models` (via
  T-19 `api.ts`), default to Business Model #1, persist active id in `localStorage`
  (per-origin key `cg.activeModelId`), reconcile against a `?model=<id>` URL param on
  mount so a deep link + reload restore selection. Expose `{activeModel, models,
  setActiveModel, reload, status}`. Mount `<ActiveModelProvider>` above `renderView`
  in `App.tsx` (the mount edit rides with this task).
- **Verification**: `pwa/playwright/model-active-context.spec.ts` — navigate to
  `#/model/models`, switch active model to a non-reference model, reload → same route
  renders + active model still selected (AC-18).

### T-20 — ModelWorkspace view + states

- **Files** (2): `pwa/src/views/model/ModelWorkspace.tsx` (new),
  `pwa/src/views/model/ModelWorkspace.module.css` (new)
- **Implements**: design §6 — closes AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17;
  supports FR-16, UX-01/02/05; pins D-5
- **Complexity**: complex
- **Blocked by**: T-18, T-19
- **Blocks**: —
- **Steps**: Route `#/model/models`. List models (ordinal, name, status, reference
  badge, `moduleInstanceCount` from the single `GET /api/v1/models` — no per-model
  fetch). Actions: **create** (Modal → `POST /api/v1/models` → refresh list +
  context), **switch** active (updates `useActiveModel` + persists), **archive**
  (non-reference only). Four states: **loading** (skeleton), **empty** (only reference
  model → create prompt), **error** (`ErrorState` + retry refetch), **ready**. Reuse
  catalog components (`Card`/`Button`/`Modal`, `Loading`/`ErrorState` from
  `views/_shared.tsx`); **tokens-only** `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`. Keyboard: Tab reaches
  create→switch→archive in DOM order; ARIA landmark on the surface.
- **Verification**: `pwa/src/__tests__/model-workspace.test.tsx` (ready lists models;
  create POSTs + appears; switch updates+persists — AC-11/AC-12) +
  `pwa/src/__tests__/model-workspace-states.test.tsx` (loading/empty/error+retry —
  AC-13/14/15) + **two** design-conformance invocations, both exit 0 (AC-16;
  pass-1 C-01 — `--view` lints only the single file passed, so the CSS
  module where the token rules live must be scanned explicitly):
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelWorkspace.tsx`
  **and** `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/ModelWorkspace.module.css`. Use only the `--view <file>` form —
  the requirements' positional-directory phrasing is inert ("no targets", exits 0
  vacuously) and must not be copied into tests (D-5, pass-1 N-02). + `manual:` keyboard
  walk of `#/model/models` — press `Alt+0`, Tab create→switch→archive in order, each
  activates on Enter/Space (keyboard, AC-17).

### T-21 — Sibling-tab placeholder + view registration

- **Files** (2): `pwa/src/views/model/ModelTabPlaceholder.tsx` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.9, §6 — closes AC-19; supports FR-17
- **Complexity**: simple
- **Blocked by**: T-17, T-18
- **Blocks**: —
- **Steps**: `ModelTabPlaceholder` names the owning downstream spec, calls
  `useActiveModel()` to prove the context is available, and does not error. In
  `views/index.tsx` register `model`: `models → <ModelWorkspace/>` and the six sibling
  tabs (`canvas, stories, key-activities, kpi-impact, systems, export`) →
  `<ModelTabPlaceholder spec="…"/>`.
- **Verification**: `pwa/src/__tests__/model-placeholder.test.tsx` — each of the six
  sibling routes renders the placeholder naming its owning spec and the active-model
  context is available there (AC-19).

## Cross-cutting verification (whole-spec)

- **AC-20** (transpile clean + no `NODE_LABELS` edit): `bun run typecheck` exit 0;
  `manual: git diff shared/src/schema/nodes.ts` shows no additions to `NODE_LABELS`
  (verify after T-03). Not a standalone task — checked at the final validation sweep.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-20) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation (pass-1 C-01) |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-21 sweep + AC-20 (`git diff` NODE_LABELS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 BusinessModel label | T-01, T-03 | AC-01, AC-20 |
| FR-02 module label set | T-01, T-03 | AC-01 |
| FR-03 IN_MODEL edge | T-03 | AC-02 |
| FR-04 lifecycle edges | T-03 | AC-02 |
| FR-05 Model CRUD + ordinal + delete | T-05, T-11 | AC-03 |
| FR-06 module publish/versions | T-06, T-12 | AC-04 |
| FR-07 instantiate (+ domain-attach setup, design §4.3/§5 — B-02) | T-01, T-05, T-07, T-11 | AC-05 |
| FR-08 fork on edit + sibling edge routes + guards | T-08, T-22, T-10, T-11 | AC-06, AC-03 |
| FR-09 explicit upgrade | T-09, T-11 | AC-07 |
| FR-10 retail migration | T-16 | AC-08 |
| FR-11 Business Architect RBAC/persona | T-15 | AC-09 |
| FR-12 route-permission mapping (incl. domains + edge routes) | T-13 | AC-10 |
| FR-13 openapi + error codes | T-02, T-14 (envelope reachability: T-08, T-10, T-11, T-12, T-22) | AC-10 |
| FR-14 Model surface + 7 tabs | T-17 | AC-11 |
| FR-15 active-model context | T-18 | AC-18 |
| FR-16 ModelWorkspace + states | T-19, T-20 | AC-11..AC-17 |
| FR-17 sibling placeholder | T-21 | AC-19 |
| FR-18 model-scope helper | T-04, T-11 | AC-21 |
| NFR-01 registry-only labels | T-03 | AC-01, AC-20 |
| NFR-02 idempotent/reversible migration | T-16 | AC-08 |
| NFR-03a/b isolation | T-04, T-08, T-11, T-22 | AC-21, AC-06 |
| NFR-04 version immutability | T-06, T-08, T-10, T-22 | AC-04, AC-06 |
| NFR-05 house rules | all | AC-20 |
| NFR-06 tokens-only PWA | T-20 | AC-16 |
