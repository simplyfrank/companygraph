---
feature: "story-spec-core"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 4
reviewing_requirements_revision: 3
reviewing_design_revision: 3
size: "large"
total_tasks: 18
---

<!-- rev 4 (2026-07-05): finalizes the phase on review-tasks.md pass 2/2
     (verdict: approve, 0 blockers) and reconciles the artifact with the
     executed state (T-01…T-17 done; STATUS.md deviations D-8…D-13).
     Disposition of the pass-2 recorded findings:
     C-09 → landed in execution (all nine story integration files title their
       describe `integration: …`); the convention is now stated in the reading
       guide so the next author does not rely on copying a neighbor.
     N-05 → landed (story-xd18-role-path deletes ONELOGIN_ISSUER in afterAll —
       STATUS D-13). N-06 → landed (T-17 reads the permission array off the
       seeded (:RBACRole {name:"business_architect"}) node, not a hard-coded
       list). N-07 → fixed here (T-11's Files list gains its test file, the
       T-10/T-15/T-16 bookkeeping convention).
     C-08 → NOT landed in execution: the three pwa story component tests
       (AC-10…AC-14's artifacts) run under vitest and no CI job executes them.
       New task T-18 (the sole open task) wires them into the ci.yml per-file
       vitest gate. Deliberately a separate task rather than the review's
       suggested T-15 amendment: T-15 executed without touching ci.yml, and
       retro-adding a file to a completed task's Files row would make
       /spec audit flag false drift. Reading guide + validation checkpoints
       now state the vitest/Playwright runner split (C-08a).
     No IDs renumbered; no executed task altered behaviorally. -->

<!-- rev 3 (2026-07-04): addresses review-tasks.md pass 1 (against rev 2).
     B-01 → T-17 transport rewritten to in-process `route()` dispatch with
     same-process `createSession` (+ deviations row D-6, the §4.12 errata,
     + a new pinned-decision row); C-05 → T-11 verification reworded to the
     `model-authz.test.ts` unit pattern, e2e 403/200 moved to T-17 step 6,
     AC-09 wording rides the register as D-7; C-06 → deferred first-run gate
     for T-05/T-06/T-07's route-level tests (reading guide + per-task notes +
     T-09 checkpoint); C-07 → T-02 pins the `registerStorySchema` insertion
     point as step 3c, before the step-4 registry iteration; N-03 → T-03
     fixes the stale `errors.ts` header comment in passing; N-04 → AC-12/13/14
     ownership moved to T-15 (T-14 supports). No IDs renumbered; no task
     split; no design change beyond the one-line D-6 errata. -->

<!-- rev 2 (2026-07-04): reconciles tasks rev 1 (written against design rev 1 /
     requirements rev 2) with the APPROVED design rev 3 (review-design.md
     pass 2/2 = approve) and requirements rev 3. Landed: design §2.1 D-3
     deltas (a)–(h); design-review pass-2 concerns delegated to this revision
     (C-05 → deviations row D-4; C-06 → model-existence gate in T-05/T-06/T-07;
     C-07 → pinned prop-less-UserStory decision in T-01/T-14; N-04 → deviations
     row D-5; N-05 → detached-parent AC assertions in T-06); task-review pass-1
     C-01 (Blocks lists are now the exact inverse of Blocked by). Task-review
     C-02/C-03/C-04/N-01/N-02 are landed IN design rev 3 (§4.1, DD-07, DD-10,
     §4.6, §4.10) — no tasks-side overrides of the design remain. New T-17
     closes AC-19 (XD-18). No IDs renumbered. -->

# Tasks: story-spec-core

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`, exact inverses of each other — resolves task-review
  C-01); no out-of-order execution.
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
  gets its own invocation (`--view` checks only the single file passed —
  design §4.10, task-review N-02).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); `api/`/`shared/` unit tests run
  under `bun test`. **pwa component tests run under vitest, not `bun test`**
  (task-review C-08a): `bunx vitest run src/__tests__/<file>` with cwd `pwa/`;
  Playwright specs run via `bunx playwright test <file>` from `pwa/`.
- **Integration-suite naming (task-review C-09):** every integration test's
  `describe` must be titled `integration: …` — suite selection is name-based
  (`scripts/test-integration.sh` runs `bun test --test-name-pattern
  '^integration:'`, and `scripts/test-unit.sh` excludes
  `*.integration.test.ts` at the file level), so a misnamed describe runs in
  **neither** suite and is silently green everywhere. (Executed: all nine
  story integration files carry the prefix.)
- **Deferred first-run gate (task-review C-06):** the T-05/T-06/T-07
  integration tests (`story-crud`, `acceptance-criteria-crud`,
  `story-bootstrap`) are route-level — they assert HTTP verbs, paths, and
  status codes — but the routes only exist after T-08 (handlers) + T-09
  (dispatch). They are **authored with their storage task** (so the storage
  behavior is specified test-first) and their **first green run is gated on
  T-09** — the T-09 validation checkpoint runs all three. Executors: do not
  stall at the T-05/T-06/T-07 checkpoints waiting for green, and do **not**
  rewrite these tests against storage internals to get an early pass.
- **Dependency status (design §1.1, closes rev-1's "hard build-order
  precondition" — D-3(h)):** `model-workspace-core` has **landed**. Every
  consumed interface was re-verified on disk at rev-2 authoring time:
  `scopedNodeIds` (`api/src/storage/model-scope.ts`), `getModel`
  (`api/src/storage/models.ts:134`), `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`), the `business_architect` seed
  (`api/src/scripts/seed-rbac-roles.ts:96`), the `stories` placeholder slot
  (`pwa/src/views/index.tsx:158`), `createSession(…)`
  (`api/src/auth/oauth.ts:151`), and the `register:model` script precedent
  (root `package.json:17`). Implementation is unblocked; no task carries a
  dependency precondition.

## Open design concerns — pinned decisions

Design rev 3 is **approved** (review pass 2/2, 0 blockers). Its review
explicitly delegated C-05/C-06/C-07/N-04/N-05 to this revision; task-review
pass 1 left C-01 for this revision; task-review pass 2 (against rev 2) added
B-01. Each is pinned here as a binding decision.
(Task-review C-02/C-03/C-04/N-01/N-02 and all rev-1 design-review findings are
**landed in design rev 3 itself** — DD-07, DD-10, §4.1's mixed/unlabeled-set
comment, §4.6's `name_conflict`-by-code swallow + `actor` arg, §4.10's
per-file `--view` invocations. The tasks below cite the design directly; no
tasks-side override of the design remains.)

| Concern | Decision (binding for execution) | Rationale | Locked in task |
|---------|----------------------------------|-----------|----------------|
| **design-review C-06** — no `:modelId` existence check; an unknown model id would return `200` (list = all detached rows; bootstrap = `{0,0}`, indistinguishable from the DD-09 pinned-only hint case). | **Every exported function in `api/src/storage/stories.ts` first resolves the model via `getModel(driver, modelId)`** (`api/src/storage/models.ts:134`) — miss throws the **existing** `404 model_not_found` — **before** calling `scopedNodeIds`. One choke point in storage (mirrors DD-05's storage-level enforcement), matching the `handleModelDomainPost` house pattern (`api/src/routes/models.ts:217`). No new error code. | Unknown-model reads must not masquerade as valid empty/detached results; storage-level placement means no handler can bypass it. | T-05, T-06, T-07 (gate); asserted in T-05's `story-crud.integration.test.ts` |
| **design-review C-07** — the generic `POST /api/v1/nodes {label:"UserStory"}` surface can mint a story with no `DESCRIBES_ACTIVITY` edge and none of the §3.1 top-level props; the §4.1 list classifies it detached and lists it in every catalog. | **Accepted risk, documented degrade — no guard in this spec** (consistent with DD-12's edge-surface boundary): the read boundary tolerates prop-less rows — `storyReadSchema` marks `persona`/`action`/`benefit`/`narrative`/`sourceActivityId` `.nullable()` (server-authored stories always populate them); StoryCatalog renders null-safe (`narrative ?? name` on the row/panel). Repair paths are the DD-11 ones: PATCH (sets persona/action/benefit → narrative re-assembled; re-point per DD-08) or DELETE. DD-12's "graph-core contract change" cost rationale is **corrected**: the cheap mechanism, if the user later wants hard closure, is extending mwc's lifecycle-guard pattern (`api/src/storage/model-lifecycle-guard.ts` `LIFECYCLE_LABELS`) to the two labels/three edges — recorded with DD-12 as the future-guard candidate. **The orchestrator may surface the guard-vs-degrade choice to the user; degrade is the recorded default.** | The runtime registry accepting registered labels is the point of XD-01; a prop-less row is visible + repairable, not corrupting. | T-01 (nullable read props), T-14 (null-safe render) |
| **design-review N-05** — §4.3 says a detached story's ACs stay editable during repair, but no test row asserted it. | `acceptance-criteria-crud.integration.test.ts` gains the case: after the parent story's activity is deleted (core node route), **AC create and AC patch on the detached parent succeed** (`201`/`200`). | Cheap add; proves the DD-11 repair window is real for ACs too. | T-06 |
| **design-review C-05** — DD-11's global visibility of detached rows vs FR-14's plain wording. | Recorded as **deviations row D-4** below; the FR-14/NFR-02 guarantee applies to **attached** stories. **Do not "fix" the §4.1 list query back to the rev-2 inner-MATCH shape** — that reintroduced the resolved blocker (detached rows unreachable). | The requirements text was never updated; without this pin, a cold reading of FR-14 invites regressing DD-11. | T-05 (list query), T-10 (isolation asserted for attached stories), T-14 (indicator) |
| **task-review C-01** — rev 1's forward `Blocks` lists disagreed with `Blocked by`. | Every `Blocks` list below is the **exact inverse** of the `Blocked by` graph (recomputed; spurious T-01→T-03, T-05→T-11, T-02/T-03→T-07 edges dropped; T-16 now correctly gated on T-09/T-11/T-14). | One authoritative adjacency; execution follows `Blocked by`. | all tasks |
| **task-review B-01** — T-17's rev-2 recipe (mint a session with `createSession` in the test process, send the cookie to the externally-running server) cannot authenticate: with `ONELOGIN_ISSUER` unset, `dispatch` (`api/src/router.ts:334`) short-circuits to `devSession()` with `permissions:["*"]` and never parses the cookie (test silently vacuous); with it set, sessions live in a per-process in-memory `Map` (`oauth.ts:149` — Redis backing is the `_baseline` NFR-04 accepted-debt stub), so the server process 401s every request. | **T-17 dispatches in-process through the exported `route(req)`** (`api/src/router.ts:259` — the exact function `Bun.serve` wraps in `server.ts`): set `process.env.ONELOGIN_ISSUER` before importing the router, seed roles via `seedRbacRoles()` (precedent: `model-rbac.integration.test.ts`), mint the session with `createSession` **in the same process** so `getSession` resolves it, and pass the cookie header on every `route(new Request(…))` call. Identical gate path (`dispatch` → cookie → `getSession` → `getRoutePermission` → `hasPermissionByRbac`), real Neo4j driver, **no production code change, no stub**. Recorded against design §4.12 as errata row **D-6**. | AC-19/XD-18 demands the end-to-end gate path be *proven, not assumed*; the external-server transport proves nothing (dev fallback) or fails (cross-process session gap). | T-17 |

## Deviations from requirements (orchestrator: land as errata, no ID renumbering)

Continues design §2.1's register (D-1/D-2 restated; D-3 — the tasks-revision
delta list — is **closed by rev 2**; D-4/D-5 landed in rev 2 per the design
review pass 2; D-6/D-7 are new in rev 3 per task-review B-01/C-05).

| # | Requirement text | Executed as | Why | Source |
|---|------------------|-------------|-----|--------|
| D-1 | AC-15 `manual: run … design-conformance.ts …` | **CLI** verification — `bun run scripts/design-conformance.ts --view <file>`, **one invocation per file** (`.tsx` and `.module.css` each; `--view` checks only the file passed) | Deterministic script with an exit code | design §2.1 D-1, task-review N-02 |
| D-2 | OQ-2 — bootstrap starter-AC content | **DD-02 recorded default**: one derived GWT starter AC per story (no-role fallback: `when:"the user performs <activity>"`). Switching to story-only is a one-line change. **Orchestrator may still surface OQ-2 to the user before execution.** | Keeps XD-09's generate-then-edit spirit strongest | design DD-02, requirements OQ-2 |
| D-4 | FR-14 "StoryCatalog only ever shows the active model's stories" / NFR-02 | Detached stories (activity deleted elsewhere) are **model-unattributable** and are listed with `detached:true` under **any** model's route until repaired (DD-11). The FR-14/NFR-02 isolation guarantee applies to **attached** stories; a detached row leaks no other model's content. FR-14/NFR-02 errata pending. | Hiding detached rows stranded them (unreachable/uneditable/undeletable — the rev-2 design blocker); visibility is what makes FR-13's indicator + repair paths real | design DD-11, design-review pass 2 C-05 |
| D-5 | FR-08's literal module path `api/src/storage/story-derive.ts` | **`api/src/derive/story-derive.ts`** (new `derive/` sibling; `storage/` is reserved for Neo4j-touching modules). Sanctioned by requirements Risks row 6 → design DD-01. **Executor: do not "correct" the path back to `storage/`.** | Keeps the parity unit test Neo4j-free | design DD-01, design-review pass 2 N-04 |
| D-6 | Design §4.12's AC-19 transport — mint a session and send it "as the session cookie" to the running API server | **In-process dispatch through the exported `route(req)`** (`api/src/router.ts:259`) with `ONELOGIN_ISSUER` set and `createSession` called in the same test process; cookie header on every `route(new Request(…))` call. One-line design errata on §4.12 — everything else in §4.12 (persona, fixture, assertions) stands. | The external-server transport is either silently vacuous (dev-fallback gate never parses the cookie) or a guaranteed 401 (per-process in-memory session Map) — task-review B-01 | task-review pass 2 B-01; T-17 |
| D-7 | AC-09's literal "a session without `story:write` **gets 403**" | Verified at **two levels**: unit — `story-authz.test.ts` asserts the gate composition (`getRoutePermission` non-null for every route → `hasPermissionByRbac` allow/deny), the same treatment `model-workspace-core` gave its AC-10 (`model-authz.test.ts`, whose header records why a full-HTTP 403 is not reproducible under the local dev-fallback gate); end-to-end — the literal 403/200 statuses are asserted through the real gate in **T-17 step 6** (in-process `route()` dispatch per D-6). AC-09 errata pending. | Under the dev-fallback gate no HTTP 403 is producible against the external server; splitting unit composition + in-process e2e covers both letter and spirit | task-review pass 2 C-05; T-11, T-17 |

## Task list

### T-01 — Story/AC zod schemas (shared)

- **Files** (1): `shared/src/schema/story-spec.ts` (new)
- **Implements**: design §3.1, §3.2, §5 — supports FR-01, FR-02, FR-05, FR-06,
  FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-04, T-05, T-13
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US identifiers).
  **Story**: `storyCreateSchema` = `{ persona: z.string().min(1), action:
  z.string().min(1), benefit: z.string().min(1), activityId: z.string().min(1),
  roleId: z.string().min(1).optional(), description: z.string().optional(),
  attributes: z.record(z.unknown()).optional() }` — **`narrative` is NOT a
  client field** (server-assembled, §4.2); `storyPatchSchema` = all of
  `persona`/`action`/`benefit`/`description`/`attributes`/`activityId`/`roleId`
  optional (omitted → unchanged); `storyReadSchema` = envelope + the six story
  props + join fields, with nullability per DD-11 + the C-07 pin:
  `activityId`/`activityName` **nullable** (null on a detached row) and
  `persona`/`action`/`benefit`/`narrative`/`sourceActivityId` **`.nullable()`**
  (null only for off-surface prop-less nodes; server-authored stories always
  populate them), plus `roleId?`/`roleName?`, `acCount:int`,
  `detached:boolean`; detail additionally embeds
  `acceptanceCriteria: acReadSchema[]`. **AC**: `acCreateSchema` = `{ given:
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
  `then` and rejects an empty-string clause; `storyReadSchema` accepts a
  detached row (`activityId:null`, `detached:true`) and a prop-less row (nulls);
  `bootstrapRequestSchema.parse({})` is valid.

### T-02 — Register story labels + edges (idempotent) + boot wiring

- **Files** (3): `api/src/scripts/register-story-labels.ts` (new),
  `api/src/neo4j/bootstrap.ts` (modify), `package.json` (modify)
- **Implements**: design §4.6, §7 — closes AC-01, AC-02; supports FR-01, FR-02,
  FR-03, FR-04, NFR-01
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-04, T-05
- **Steps**: `registerStorySchema(driver)` calls, passing **`actor =
  "system:story-spec"`** to every registry call (§4.6): two `createNodeLabel`
  (`UserStory`, `AcceptanceCriterion`; permissive `json_schema_doc: {}`)
  **then** three `createEdgeType` — `DESCRIBES_ACTIVITY` (`UserStory →
  Activity`), `STORY_FOR_ROLE` (`UserStory → Role`), `ACCEPTANCE_OF`
  (`AcceptanceCriterion → UserStory`) with their `_OntologyEdgeEndpoint` pairs
  (design §3.3). Each call is wrapped to swallow the already-registered error
  **by code `name_conflict`** — never by HTTP 409 alone (other 409s such as
  `id_conflict`/`would_invalidate` must propagate; §4.6) → **idempotent**.
  Nodes-before-edges is required because `createEdgeType` runs
  `assertEndpointLabelsExist` (verified in `edge-types.ts`). Do **not** touch
  `NODE_LABELS`/`EDGE_ENDPOINTS` consts (NFR-01). In `applySchema`
  (`api/src/neo4j/bootstrap.ts`): insert the `registerStorySchema` call as
  **step 3c — immediately after the step-3b `registerModelSchema` call
  (`bootstrap.ts:63`), and strictly BEFORE the step-4 registry iteration**
  that creates the `node_id_unique_<label>` constraints, with the same
  rationale comment step 3b carries ("runs BEFORE step 4 so the registry
  iteration below creates the per-label id constraints for the new labels on
  the same boot"). **Do not append the call at the end of `applySchema`** —
  that satisfies "after `registerModelSchema`" while deferring the
  `node_id_unique_UserStory`/`node_id_unique_AcceptanceCriterion` constraints
  to the *next* boot (resolves task-review C-07). This placement is also after
  the core-label seed, so `Activity`/`Role`/`UserStory` all exist when the
  edge endpoints are checked. Add a `register:story` script to the root
  `package.json` (mirroring `register:model`, line 17).
- **Verification**: `api/__tests__/story-labels.integration.test.ts` (labels
  appear in `GET /api/v1/schema`; `NODE_LABELS` unchanged; re-run adds no
  duplicate label rows — AC-01) + `api/__tests__/story-edges.integration.test.ts`
  (the three edges register via `createEdgeType`; a wrong pair — e.g.
  `DESCRIBES_ACTIVITY` from `UserStory`→`Role` — returns `400
  edge_endpoint_label_mismatch`; `EDGE_ENDPOINTS` const unchanged — AC-02).

### T-03 — Additive error codes (five)

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.5, DD-08 — closes part of FR-10 (D-3(a))
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-05, T-09, T-12
- **Steps**: Append **five** additive codes to the closed `ERROR_CODES` array
  (NFR-11; no existing code removed/reordered): `story_not_found` (404),
  `acceptance_criterion_not_found` (404), `story_activity_required` (400 —
  strictly the *missing/empty `activityId`* precondition),
  **`story_activity_not_in_model` (404 — supplied `activityId` present but not
  an `:Activity` ∈ `scopedNodeIds(:modelId)`; DD-08)**, and
  `acceptance_criterion_clause_required` (400). **Do NOT add
  `story_duplicate_for_activity`** (DD-04 — a dead code under the `1..*`
  default; no test forbids adding it — the rev-1 `envelope.test.ts` claim was
  false, design-review C-01). A bad `roleId` reuses the **existing** generic
  `not_found` (DD-07); an unknown `:modelId` reuses the **existing**
  `model_not_found` (C-06 pin) — no new codes for either. Keep the exhaustive
  assertion in `errors.ts` happy. **In passing, fix the stale header comment
  at `api/src/errors.ts:1-2`** — it claims "envelope.test.ts asserts every
  code is reachable from at least one route"; no such file exists (only
  `analytics-envelope.test.ts`/`ontology-envelope.test.ts`, which cover
  different enums) and the real assertion runs the opposite direction
  (design-review C-01 / DD-04). Reword to: "Closed registry of error codes
  (NFR-11). Per-surface OpenAPI integration tests assert their codes appear
  in the ErrorEnvelope enum; nothing asserts route-reachability of every
  code." (resolves task-review N-03 — this task already touches the file).
- **Verification**: `api/__tests__/story-openapi.integration.test.ts` (jointly
  with T-12) asserts each of the **five** new codes is a member of `ERROR_CODES`
  and appears in the OpenAPI `ErrorEnvelope.code` enum; `bun run typecheck`
  passes the exhaustiveness assertion.

### T-04 — Pure story derivation module (Neo4j-free)

- **Files** (1): `api/src/derive/story-derive.ts` (new — path per DD-01/D-5,
  **not** `storage/`)
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
  lowest `id` (requirements B-02 tiebreak); `persona = primaryRole?.name ??
  "user"`; `action = activity.name`; `benefit = "the " +
  journeyName.toLowerCase() + " workflow completes"` when a parent journey
  exists, else **orphan fallback** `benefit = "the workflow completes"` (no
  journey token — requirements C-03, derivation stays total); `narrative =
  "As a <persona>, I want to <action>, so that <benefit>."`.
- **Verification**: `api/__tests__/story-derive-parity.test.ts` (also T-06) — the
  orphan-fallback narrative case (`"…so that the workflow completes."`) is
  Neo4j-free and asserted here; full client-parity assertion lands in T-06 (same
  file).

### T-05 — Story CRUD storage (model gate, two-shape gate, cascade, derived-clear)

- **Files** (1): `api/src/storage/stories.ts` (new — story half)
- **Implements**: design §4.1, §4.2, §4.4, DD-03, DD-05, DD-07, DD-08, DD-11,
  DD-12 — closes AC-03, AC-05; supports FR-05, FR-07, NFR-02
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03
- **Blocks**: T-06, T-07, T-08
- **Steps**: Import `scopedNodeIds` from `api/src/storage/model-scope.ts` and
  `getModel` from `api/src/storage/models.ts` (`model-workspace-core` —
  consumed, never re-implemented). **Model-existence gate (C-06 pin): every
  exported function first resolves `getModel(driver, modelId)` — miss →
  existing `404 model_not_found` — before `scopedNodeIds`.** Story domain
  fields are **top-level Neo4j properties, not `attributes_json`** (DD-03) —
  written via this module's own parameterized Cypher; the generic
  `createNode`/`patchNode` primitives stay **byte-for-byte unchanged**.
  - `listStories(driver, modelId)` — the §4.1 query **verbatim in shape**:
    `MATCH (s:UserStory) OPTIONAL MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)`
    then keep rows where `(a IS NOT NULL AND a.id IN $scopedActivityIds) OR a
    IS NULL`; the scoped set is passed **whole** (it is mixed/unlabeled — the
    `:Activity` label in the pattern does the restriction, no JS-side filter);
    OPTIONAL `STORY_FOR_ROLE`; `count(DISTINCT ac)` for `acCount` (DD-12
    hardening); `a IS NULL AS detached`; `ORDER BY s.createdAt ASC`. **Detached
    rows are included by design (DD-11/D-4) — do not re-narrow to an inner
    MATCH.** Attached rows of other models stay excluded (AC-08).
  - `createStory(driver, modelId, input)` — (1) validate: `input.activityId`
    must resolve to an `:Activity` whose id ∈ scoped set (`MATCH (a:Activity
    {id:$activityId}) WHERE a.id IN $scoped`); miss → **`404
    story_activity_not_in_model`, `details.field:"activityId"`** (DD-08 —
    covers "another model's activity" and "scoped id that is not an
    Activity"); when `roleId` supplied, confirm it is a `Role` (existence +
    label only — `Role` is a global reference node, no membership check) else
    **`404 not_found`, `details.field:"roleId"`** (DD-07). (2) assemble
    `narrative` server-side. (3) `CREATE (s:UserStory {…envelope…, persona,
    action, benefit, narrative, derived:false, sourceActivityId:$activityId})`.
    (4) wire `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when `roleId`) via the
    existing `createEdge` primitive — endpoint whitelist runs for free; ids are
    server-generated UUIDv7, so the cross-type uniqueness pre-check
    short-circuits to `false` (`input.id !== undefined` guard,
    `api/src/storage/edges.ts:56` — DD-10, no cost/rejection path). → `201` +
    `storyReadSchema` (`acCount:0`, `detached:false`).
  - **Two-shape membership gate (DD-11)** shared by detail/PATCH/DELETE:
    resolve the story by id, `OPTIONAL MATCH` its `DESCRIBES_ACTIVITY`
    activity; (a) activity **resolves** but ∉ scoped set → `404
    story_not_found` (cross-model isolation); (b) activity **does not
    resolve** → detached, request **proceeds** (repair access under any model
    route).
  - `getStory(driver, modelId, storyId)` — gate as above; embed ACs `ORDER BY
    ac.ordinal ASC`; `detached:true` (+ null activity fields) for a detached
    story — `200`.
  - `patchStory(driver, modelId, storyId, patch)` — gate as above (a detached
    story is patchable — DD-11 repair); dynamic SET of supplied fields (omitted
    untouched, mirrors `patchNode`); re-assemble `narrative` if any of
    persona/action/benefit changed; re-point `DESCRIBES_ACTIVITY`/
    `STORY_FOR_ROLE` when `activityId`/`roleId` supplied (delete old edge if
    present, create new; new `activityId` re-validated per DD-08 → `404
    story_activity_not_in_model`; bad `roleId` → `404 not_found` field
    `roleId`); **every re-point also runs `SET s.sourceActivityId =
    $activityId` in the same tx** (D-3(f) — the denormalized prop tracks the
    edge); **always `SET s.derived = false`** (DD-05 — storage-level, not the
    route). → `200`.
  - `deleteStory(driver, modelId, storyId)` — gate as above (a detached story
    is deletable — DD-11 repair), then the **single-transaction cascade**
    (design §4.4): `MATCH (s:UserStory {id:$storyId}) OPTIONAL MATCH
    (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s) DETACH DELETE ac, s` —
    drops the ACs + all three edge types in one tx; the story's
    `Activity`/`Role` survive. → `204`.
  - **No duplicate check on `createStory`** (DD-04 — `1..*`; no
    `story_duplicate_for_activity`).
- **Verification**: `api/__tests__/story-crud.integration.test.ts` — create →
  201 + UUIDv7 + server-assembled `narrative` + `DESCRIBES_ACTIVITY` (and
  `STORY_FOR_ROLE` when `roleId`); out-of-scope/model-B `activityId` → `404
  story_activity_not_in_model` field `activityId` (DD-08); bad `roleId` →
  `404 not_found` field `roleId` (DD-07); missing `activityId` → `400
  story_activity_required` (route mapping, T-08); **unknown `:modelId` on
  list/create/detail → `404 model_not_found` (C-06)**; list scoped to the
  model; detail embeds ACs by `ordinal`; PATCH preserves omitted fields,
  re-assembles `narrative`, flips `derived`→false; **PATCH re-point updates
  `sourceActivityId` to the new activity id (D-3(f))**; **detached lifecycle
  (DD-11 — the AC-11 integration seam):** delete the story's activity via the
  core node route → list row **and** detail both return `detached:true`
  (activity fields null), PATCH re-point to a scoped activity repairs
  (`detached:false`, `sourceActivityId` updated), DELETE of a detached story →
  204 (AC-03). Cascade covered in
  `api/__tests__/story-cascade.integration.test.ts` — DELETE story removes ACs
  + all three edge types in one tx (no orphan ACs, no dangling edges); the
  story's `Activity`/`Role` are **not** deleted (AC-05). Fixture
  domains/activities created API-only via `POST /api/v1/models` +
  `POST /api/v1/models/:id/domains` + core node/journey routes (design §8 — no
  direct-driver seeding). **Both files are authored here; first green run is
  gated on T-09 (routes live) — reading-guide C-06 run gate; do not rewrite
  against storage internals.**

### T-06 — AC CRUD storage + derivation parity harness

- **Files** (2): `api/src/storage/stories.ts` (extend — AC half),
  `api/__tests__/story-derive-parity.test.ts` (extend — parity assertion)
- **Implements**: design §4.3, §4.5, NFR-03, DD-05, DD-11 — closes AC-04, AC-06;
  supports FR-06
- **Complexity**: complex
- **Blocked by**: T-04, T-05
- **Blocks**: T-07, T-08
- **Steps**: **AC CRUD** in `stories.ts` (top-level props, DD-03; every function
  behind the C-06 `getModel` gate):
  - `createAc(driver, modelId, storyId, input)` — parent story resolved through
    the §4.2 **two-shape gate** (shape (a) cross-model → `404 story_not_found`;
    shape (b) **detached parent → proceeds** — a detached story's ACs stay
    editable during repair, DD-11/N-05); allocate `ordinal =
    coalesce(max(existing.ordinal),0)+1` in-tx when omitted; `CREATE
    (ac:AcceptanceCriterion {…, given, when, then, ordinal, derived:false})`
    then `createEdge` `ACCEPTANCE_OF`. → `201`.
  - `listAcs(driver, modelId, storyId)` — same parent gate; `MATCH
    (ac)-[:ACCEPTANCE_OF]->(s {id:$storyId}) RETURN ac ORDER BY ac.ordinal ASC`.
  - `patchAc(driver, modelId, storyId, acId, patch)` — same parent gate **and**
    the AC is under that story (`(ac {id:$acId})-[:ACCEPTANCE_OF]->(s
    {id:$storyId})`) else `404 acceptance_criterion_not_found`; dynamic SET of
    supplied `given`/`when`/`then`/`ordinal`; **`SET ac.derived=false`** (DD-05).
    Reorder (FR-13) is a `PATCH …/:acId {ordinal}` — no dedicated route. → `200`.
  - `deleteAc(driver, modelId, storyId, acId)` — same membership check; `DETACH
    DELETE ac`. → `204`.
  - **NFR-03 enforcement** is the zod `.min(1)` on each clause (T-01); the route
    handler (T-08) maps that failure to `acceptance_criterion_clause_required`.
  **Parity harness** (extend the T-04 test file; design §4.5): declare one
  **canonical single-journey structural fixture**; map it to (a)
  `DeriveActivityInput[]` for `deriveStories` and (b) a `JourneyData` projection
  for `formulateUserStories(projected, journeyName)` where **the projected
  `roles`/`locations` arrays are ordered so array-index-0 is the same node the
  server selects by `createdAt`-then-`id`** (`formulateUserStories` picks
  `filtered[0]` by array-index order; `JourneyData` has no `createdAt` — the
  projection ordering is the coupling point). Assert **equal `narrative`
  strings** per activity and the same primary role/location. Single-journey
  keeps the client's one `journeyName` argument well-defined.
- **Verification**: `api/__tests__/acceptance-criteria-crud.integration.test.ts`
  — create requires all three clauses (a missing/empty clause → `400
  acceptance_criterion_clause_required`); `ordinal = max+1` when omitted; list
  ASC; PATCH edits a clause and clears `derived`; DELETE → 204; a bad parent
  story → `404 story_not_found`; an AC id not under the named story → `404
  acceptance_criterion_not_found`; **AC create + patch on a detached parent
  succeed (`201`/`200` — DD-11 repair window, design-review N-05)** (AC-04).
  **Authored here; first green run gated on T-09 (reading-guide C-06 run
  gate).** Parity: `api/__tests__/story-derive-parity.test.ts` —
  `deriveStories(structuralFixture)` and
  `formulateUserStories(projectedFixture, journeyName)` yield equal narratives
  + same primary role/location (AC-06, unit — no Neo4j).

### T-07 — Bootstrap endpoint storage (derive → persist editable nodes)

- **Files** (1): `api/src/storage/stories.ts` (extend — `bootstrapStories`)
- **Implements**: design §4.5, DD-02, DD-04, DD-08, DD-09, DD-10 — closes AC-07;
  supports FR-09
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-06
- **Blocks**: T-08, T-17
- **Steps**: `bootstrapStories(driver, modelId, opts?)` (behind the C-06
  `getModel` gate — unknown model → `404 model_not_found`, never a silent
  `{0,0}`):
  1. Fetch the scoped set = `scopedNodeIds(driver, modelId)` and pass it
     **whole** into the Cypher — the set is mixed/unlabeled, so the restriction
     to activities is the `:Activity` label in the query (`MATCH (a:Activity)
     WHERE a.id IN $scoped`), **not** a JS-side filter (design §4.5 step 1).
     Optional body `{activityIds}` narrows to those ids — each must resolve to
     a scoped `:Activity` of `:modelId`, else **`404
     story_activity_not_in_model`, `details.field:"activityIds"`** (DD-08,
     D-3(b)).
  2. **Skip rule (DD-04)**: drop any activity with ≥1 existing
     `DESCRIBES_ACTIVITY` story (`WHERE NOT EXISTS {
     (:UserStory)-[:DESCRIBES_ACTIVITY]->(a) }`) — re-running never
     double-derives (`skipped` counts these).
  3. For each remaining activity, read its structural neighborhood (roles via
     `EXECUTES`, systems via `USES_SYSTEM`, locations via `AT_LOCATION`,
     **parent journey per-activity** via `PART_OF`) into
     `DeriveActivityInput`, then call `deriveStories` (T-04).
  4. Persist each candidate as an **editable** node: `createStory`-equivalent
     with `derived:true`, wire `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when a
     primary role exists), and create **one derived starter AC** (DD-02 default
     — `given:"the <journey> preconditions are met"`, `when:"the <role>
     performs <activity>"` with the **no-role fallback `"the user performs
     <activity>"`**, `then:"the <journey> workflow advances"`, `ordinal:1`,
     `derived:true`; orphan → article-free "the workflow" phrasing) wired
     `ACCEPTANCE_OF`. Edge ids are server-generated UUIDv7 — the cross-type
     uniqueness pre-check never even builds its scan (DD-10); no batching
     change needed.
  5. → `200 { created: N, skipped: M }`. **Pinned-module boundary (DD-09,
     D-3(d)):** activities inside non-forked `ModuleInstance`s live in
     `snapshot_json`, are not in `scopedNodeIds`, and count in **neither**
     `created` nor `skipped` — a pinned-only model returns `{created:0,
     skipped:0}` (response shape unchanged; the fork-first hint is view-side,
     T-14). Persisted nodes are ordinary editable stories/ACs — a later PATCH
     clears `derived` (DD-05).
- **Verification**: `api/__tests__/story-bootstrap.integration.test.ts` —
  bootstrap derives + persists editable `derived:true` story + starter-AC per
  activity-without-story; re-run is idempotent (`{created,skipped}`, no
  doubles); `{activityIds}` scopes to specific activities and an out-of-scope
  id → `404 story_activity_not_in_model` field `activityIds` (DD-08); a
  persisted derived story then PATCHes normally and its `derived` flag clears
  (AC-07). Fixture API-only (design §8). **Authored here; first green run
  gated on T-09 (reading-guide C-06 run gate).**

### T-08 — Story/AC route handlers + code mappings

- **Files** (1): `api/src/routes/stories.ts` (new)
- **Implements**: design §4.3 (clause mapping), §3.5, §4.7 — supports FR-05,
  FR-06, FR-09, FR-10
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
  boundary. **Two zod→code mappings (§3.5, §4.3):** (1) on story create, a zod
  failure whose path includes `activityId` (missing/empty) maps to
  `ValidationError("story_activity_required", {field:"activityId"}, 400)`;
  (2) on AC create/patch, a zod failure whose path includes
  `given`/`when`/`then` maps to
  `ValidationError("acceptance_criterion_clause_required", {field}, 400)` —
  not the generic `invalid_payload` — so AC-04's exact-code assertion holds.
  All other codes (`model_not_found`, `story_not_found`,
  `story_activity_not_in_model`, `not_found`,
  `acceptance_criterion_not_found`) are thrown by the storage layer
  (T-05/T-06/T-07) and pass through.
- **Verification**: exercised through the route surface by
  `story-crud.integration.test.ts` (T-05),
  `acceptance-criteria-crud.integration.test.ts` (T-06), and
  `story-bootstrap.integration.test.ts` (T-07); the clause-required exact-code
  mapping is asserted in `acceptance-criteria-crud.integration.test.ts`
  (AC-04); `bun run typecheck`.

### T-09 — Router dispatch (models/:modelId/stories* block)

- **Files** (1): `api/src/router.ts` (modify)
- **Implements**: design §4.7 — supports FR-05, FR-06, FR-09
- **Complexity**: moderate
- **Blocked by**: T-03, T-08
- **Blocks**: T-10, T-11, T-12, T-16, T-17
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
  new route); `bun run typecheck`. **This task's validation checkpoint is the
  first green run of all three T-05/T-06/T-07 integration tests (reading-guide
  C-06 run gate) — run them here.**

### T-10 — Model isolation integration test (read- + write-side)

- **Files** (1): `api/__tests__/story-model-scope.integration.test.ts` (new)
- **Implements**: design §3.4, §4.1, DD-06, DD-08 — closes AC-08; supports NFR-02
- **Complexity**: moderate
- **Blocked by**: T-08, T-09
- **Blocks**: —
- **Steps**: Seed **two** models each with its own activities + stories (API-only:
  `POST /api/v1/models` + `POST /api/v1/models/:id/domains` + core node/journey
  routes — design §8). **Read-side:** assert `GET /api/v1/models/:modelA/stories`
  returns model-A stories (those whose `DESCRIBES_ACTIVITY` activity ∈
  `scopedNodeIds(modelA)`) and **excludes** every **attached** story whose
  activity belongs only to model B (the D-4 carve-out: only *detached* rows are
  globally visible); assert a story id is **not** itself a member of
  `scopedNodeIds` (isolation resolves through the activity join, not story-id
  membership — design §3.4); assert bootstrap on model A derives only from
  model-A scoped activities. **Write-side (requirements rev 3 C-06 / AC-08):**
  `POST /models/:modelA/stories` with a model-B-only `activityId`, and a
  `PATCH` re-pointing an existing model-A story to it, are both rejected `404
  story_activity_not_in_model` and create/move nothing — model B's list is
  unchanged after both attempts.
- **Verification**: `api/__tests__/story-model-scope.integration.test.ts` (AC-08).

### T-11 — Route-permission mapping + RBAC role grant + authz test

- **Files** (3): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify),
  `api/__tests__/story-authz.test.ts` (new — the task's verification artifact
  counts as a task file, per the T-10/T-15/T-16 convention; task-review N-07)
- **Implements**: design §4.8 — closes AC-09 (authz half); supports FR-11
- **Complexity**: moderate
- **Blocked by**: T-09
- **Blocks**: T-12, T-16, T-17
- **Steps**: In `rbac-permissions.ts` add ten `ROUTE_PERMISSIONS` rows
  (`P(method, path, permission)`) for **every** new route, **specific before
  parameterized** (design §4.8): GETs → `story:read`; POST/PATCH/DELETE/bootstrap
  → `story:write`. `matchSegments` rejects on segment-count first, so ordering
  only bites same-length rows — but the security-critical property is that
  **every** new route has a row (an unmapped route → `getRoutePermission`
  returns `null` → router skips the RBAC check → silent open write). No route is
  `public`; auth stays in the central gate (NFR-05 — no per-route check). In
  `seed-rbac-roles.ts` **add** `"story:read"` + `"story:write"` to the existing
  `business_architect` role's permission array (line 96; idempotent MERGE by
  role name — this spec **modifies** the role `model-workspace-core` FR-11
  created; it does not create it).
- **Verification**: `api/__tests__/story-authz.test.ts` — a **unit** test per
  the `model-authz.test.ts` house pattern (whose header records why: under the
  local dev-fallback gate, `ONELOGIN_ISSUER` unset, the server admits a
  synthetic `*`-permission session and a full-HTTP 403 is not reproducible;
  and a unit test has no Neo4j for a 201 anyway — resolves task-review C-05).
  Asserts: `getRoutePermission` returns **non-null** for **every one of the
  ten** new method+path rows with the expected `story:read`/`story:write`
  permission; `hasPermissionByRbac` allow/deny composition — a permission set
  **with** `story:write` allows the POST/PATCH/DELETE/bootstrap rows, one
  **without** it denies them, and a `story:read`-only set allows the GETs and
  denies the writes; the seeded `business_architect` role's permission array
  contains both `story:read` and `story:write`; `isPublicRoute` is false for
  every new route (AC-09 authz half). The **true end-to-end 403/200 through
  the real gate lives in T-17 step 6** (in-process `route()` dispatch, D-6);
  AC-09's literal "gets 403" wording rides the errata register as **D-7**.

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
  T-01 zod definitions (no hand-maintained copy). The **five** new
  `ERROR_CODES` members (D-3(g) — incl. `story_activity_not_in_model`) surface
  in the shared `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/story-openapi.integration.test.ts` — every new
  route path and every one of the **five** new `ERROR_CODES` members appears in
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
- **Implements**: design §4.10, §6, DD-09, DD-11 — closes AC-10, AC-11, AC-15,
  AC-16; **implements-but-does-not-close AC-12, AC-13, AC-14 (sole closer:
  T-15, whose `story-catalog-states.test.tsx` is the verification artifact for
  all three — resolves task-review N-04)**; supports FR-12, FR-13, FR-14,
  UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-13
- **Blocks**: T-15, T-16
- **Steps**: In `pwa/src/views/index.tsx`, **replace** the `stories` tab's
  `<ModelTabPlaceholder tab="Stories" spec="story-spec-core"/>` dispatch
  (line 158) with `"stories": (r) => <StoryCatalog route={r} />` (the **only**
  edit to that file — `route.ts`/`SURFACES` stay `model-workspace-core`'s).
  `StoryCatalog` reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx` — **does not re-implement model
  selection**), keys its fetch on `activeModel.id`, and fetches `GET
  /api/v1/models/:modelId/stories` via `api.stories.*` (T-13). Render **all four
  states**: **loading** (skeleton via `Loading` from `views/_shared.tsx` —
  AC-12); **empty** (no stories → `Card` offering **"Generate from graph"**
  (POST `.../bootstrap`) + a manual **Create** affordance — AC-13; **when a
  bootstrap attempt returns `{created:0, skipped:0}`, the empty state adds the
  fork-first hint** — "no materialized activities — if this model uses pinned
  modules, fork the module first, then generate" — per DD-09/D-3(d)); **error**
  (`ErrorState` from `views/_shared.tsx` **plus a local `<Button
  onClick={refetch}>` retry rendered by `StoryCatalog` alongside it** —
  `ErrorState({message})` renders no retry itself and is not modified; design
  §4.10 — AC-14); **ready** (`DataTable`/`Card` list; each row: narrative,
  linked activity name, role, AC count — AC-10; **null-safe render per the
  C-07 pin: row/panel title falls back `narrative ?? name`** for off-surface
  prop-less nodes). **Detail + edit** (AC-11): selecting a row opens a catalog
  `SidePanel`/`Modal` showing the narrative, activity/role, and ACs as
  **Given/When/Then triples**; controls: edit story (PATCH), add/edit/delete/
  **reorder** ACs (reorder = **up/down buttons → `PATCH …/:acId {ordinal}`,
  keyboard-reachable, no drag handler** per Native Conflicts), delete story,
  per-story **"Generate from graph"** (bootstrap scoped via
  `{activityIds:[activityId]}`); a `derived:true` node shows a **"derived"
  badge** (a hand edit's PATCH response `derived:false` re-renders it away); a
  `detached:true` story shows the **"detached" indicator on the list row and
  in the detail panel** (DD-11 — the list now returns detached rows); the
  repair affordances are the existing edit (re-point) + delete controls — no
  new control. **Tokens + a11y** (AC-15/AC-16): `StoryCatalog.module.css` uses
  only `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog
  components (`Card`, `DataTable`, `Modal`, `SidePanel`, `Button`) before
  inventing new ones; badges are token-styled `<span>`s; ARIA landmark on the
  view; Tab reaches bootstrap/create then the list in DOM order; opening
  detail moves focus into the panel, Escape returns it (reusing the catalog
  `SidePanel`/`Modal` focus-trap — not re-implemented).
- **Verification**: `pwa/src/__tests__/story-catalog.test.tsx` (`#/model/stories`
  → `StoryCatalog`, reads `useActiveModel()`, ready list with narrative/activity/
  role/acCount — AC-10) + `pwa/src/__tests__/story-detail.test.tsx` (detail panel
  with narrative + activity/role + GWT triples; edit PATCHes + clears the derived
  badge; AC add/edit/delete call the FR-06 routes; derived badge; detached
  indicator on row + panel — mocked payload, producible by the real DD-11
  contract per T-05's integration seam — AC-11) + **CLI** (AC-15, D-1 —
  deterministic exit code): `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/StoryCatalog.tsx` **and** `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.module.css`
  — both exit 0, zero token/component violations. + **manual** (AC-16, keyboard):
  load `#/model/stories`, keyboard-only — Tab to "Generate from graph" and
  activate with Enter, Tab into the list, Enter opens a story → expect focus
  enters the detail panel, moves through the AC edit controls in order, and
  Escape returns focus to the originating list row.

### T-15 — StoryCatalog view-state tests (loading / empty+hint / error+retry)

- **Files** (1): `pwa/src/__tests__/story-catalog-states.test.tsx` (new)
- **Implements**: design §4.10, DD-09 — closes AC-12, AC-13, AC-14 (**sole
  owner** for STATUS.md bookkeeping — task-review N-04; T-14 implements the
  states, this task's test file verifies them)
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: T-18
- **Steps**: jsdom component test of the three non-ready states: **loading**
  skeleton while `GET /api/v1/models/:id/stories` is pending (AC-12); **empty**
  state offering "Generate from graph" + manual create, triggering bootstrap
  POSTs `.../bootstrap` and the derived stories then appear (AC-13); **empty +
  fork-first hint** — a mocked bootstrap response `{created:0, skipped:0}`
  renders the DD-09 pinned-module hint text in the empty state; **error**
  state renders `ErrorState` **plus the local retry `<Button>`** whose click
  refetches (AC-14 — the retry lives in `StoryCatalog`, not `ErrorState`;
  design §4.10).
- **Verification**: `pwa/src/__tests__/story-catalog-states.test.tsx` (AC-12,
  AC-13, AC-14).

### T-16 — StoryCatalog model-context reload e2e

- **Files** (1): `pwa/playwright/story-catalog-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-17; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-09, T-11, T-14
- **Blocks**: —
- **Steps**: Playwright spec against the full stack (routes + permissions live —
  hence the T-09/T-11 gates): with a non-reference model (model B) active,
  navigate to `#/model/stories`, reload → the same route renders `StoryCatalog`
  showing **model B's** stories (active-model persistence is
  `model-workspace-core` FR-15; this view refetches for the persisted model).
  Assert no cross-model leakage of **attached** stories (server-enforced,
  §4.1/D-4). Seed via the API (models + domains + stories routes).
- **Verification**: `pwa/playwright/story-catalog-context.spec.ts` (AC-17).

### T-17 — XD-18 end-to-end path test (Business Architect persona, D-3(c))

- **Files** (1): `api/__tests__/story-xd18-role-path.integration.test.ts` (new)
- **Implements**: design §4.12 (executed with the D-6 transport errata) —
  closes AC-19; verifies FR-05, FR-09, FR-11 end-to-end (XD-18 story-surface
  half); carries the e2e 403/200 half of AC-09 (D-7)
- **Complexity**: moderate
- **Blocked by**: T-07, T-09, T-11
- **Blocks**: —
- **Steps**: Integration test exercising the full stack with **no synthetic
  permission stub** (design §4.12), dispatched **in-process** per the B-01
  pinned decision:
  1. **Transport (task-review B-01 pin — binding; deviations D-6):** the test
     does **not** talk to the externally-running server at
     `http://127.0.0.1:8787`. Every request is dispatched **in-process**
     through the exported `route(req)` (`api/src/router.ts:259` — the exact
     function `Bun.serve` wraps in `server.ts`), so the identical gate path
     runs (`dispatch` → cookie parse → `getSession` → `getRoutePermission` →
     `hasPermissionByRbac` on `session.permissions`, verified
     `router.ts:339-366`) against the real Neo4j driver. Why: with
     `ONELOGIN_ISSUER` unset the gate short-circuits to `devSession()`
     (`permissions:["*"]`, cookie never parsed — silently vacuous); with it
     set, sessions live in a per-process in-memory `Map` (`oauth.ts:149`), so
     a cookie minted in the test process 401s against a separate server
     process. Setup: set `process.env.ONELOGIN_ISSUER = "https://test.invalid"`
     (any non-empty value) **before importing `../src/router`**; seed the RBAC
     roles via `seedRbacRoles()` (precedent:
     `model-rbac.integration.test.ts:21`); no production code changes.
  2. **Fixture (API-only, design §8 — same in-process transport):** a model
     with ≥2 activities, each with a **distinct** executing `Role` wired
     `(:Role)-[:EXECUTES]->(:Activity)` (core node/edge routes +
     `POST /api/v1/models/:id/domains`). Fixture seeding authenticates with a
     **second real session** minted via `createSession` with
     `rbacRoles:["admin"]`, `permissions:["*"]` — still through the gate, no
     stub; the XD-18 assertions (steps 4–6) use **only** the Business
     Architect session.
  3. **Session:** a real session bound to the **`business_architect`** RBAC
     role via the real `createSession(userInfo, roles, storeAccess,
     personaAssignments, rbacRoles, permissions)` helper
     (`api/src/auth/oauth.ts:151`) with `rbacRoles: ["business_architect"]`
     and its seeded permission set, minted **in the same process** (so
     `getSession` resolves it) and sent on every request as
     `headers: { cookie: "session=<id>" }` through `route(new Request(…))` —
     authorized **through the central router gate**.
  4. **Bootstrap:** `POST /api/v1/models/:modelId/stories/bootstrap` as that
     session → expect one `derived:true` story **per activity**, each with
     `DESCRIBES_ACTIVITY` to its activity and `STORY_FOR_ROLE` to its
     **executing** role (the `EXECUTES` structure drives §4.5's primary-role
     selection), each with one starter Given/When/Then AC (DD-02).
  5. **Hand edit:** `PATCH …/stories/:id/acceptance-criteria/:acId` (edit one
     clause) as the same session → `200`, and the AC's `derived` flag clears
     (DD-05).
  6. **Gate negative (D-7 — the e2e half T-11's unit test cannot produce):** a
     third real session **without** `story:write` (`permissions:
     ["story:read"]`, `rbacRoles: []`) → **`403`** on the same bootstrap POST
     (and on a story POST), **`200`** on the story list GET — the literal
     AC-09 statuses through the real gate.
  This is additional coverage riding T-05/T-07/T-11 behavior — the `EXECUTES`-
  core half of XD-18 is owned by `business-model-authoring` (its FR-05/AC-06).
- **Verification**: `api/__tests__/story-xd18-role-path.integration.test.ts`
  (AC-19).

### T-18 — CI gate for the pwa story component tests (task-review C-08) — **DONE (2026-07-05)**

- **Files** (1): `.github/workflows/ci.yml` (modify)
- **Implements**: task-review C-08(b) — makes AC-10…AC-14's verification
  artifacts merge-gating; supports FR-12, NFR-05. Closes no AC (the ACs are
  closed by the tests themselves; this task makes them enforceable in CI).
- **Complexity**: simple
- **Blocked by**: T-15
- **Blocks**: —
- **Status**: **done** (2026-07-05) — the three story test files are appended
  to the per-file vitest step in the ci.yml `unit` job, with the
  `story-spec-core T-18 (review C-08)` provenance comment; verification CLI
  green (13/13 tests, grep hit). See STATUS.md.
- **Steps**: The three story component test files
  (`pwa/src/__tests__/story-catalog.test.tsx`, `story-detail.test.tsx`,
  `story-catalog-states.test.tsx`) run under vitest; `scripts/test-unit.sh`
  sweeps only `api/` + `shared/`, so today **no CI job executes them** — they
  would never gate merge. House precedent (kpi-okr-governance T-20 / its
  review C-02): CI gates pwa component tests by **explicit file list**, not
  the whole vitest suite (the legacy error-scenarios tree is un-triaged — do
  not widen the gate). Append the three files to the existing per-file vitest
  step in the `unit` job (`.github/workflows/ci.yml:23`, `working-directory:
  pwa`), yielding: `bunx vitest run src/__tests__/exec-kpi-management.test.tsx
  src/__tests__/exec-okr-management.test.tsx
  src/__tests__/story-catalog.test.tsx src/__tests__/story-detail.test.tsx
  src/__tests__/story-catalog-states.test.tsx`. Extend the step's provenance
  comment with a `story-spec-core T-18 (review C-08)` line. No other ci.yml
  change (the integration job already boots the API server the story
  integration files need).
- **Verification**: CLI — `cd pwa && bunx vitest run
  src/__tests__/story-catalog.test.tsx src/__tests__/story-detail.test.tsx
  src/__tests__/story-catalog-states.test.tsx` exits 0 (the exact invocation
  CI will run), and `grep story-catalog-states .github/workflows/ci.yml`
  returns the wired line (the gate exists).

## Cross-cutting verification (whole-spec)

- **AC-18** (transpile clean + no compile-time schema-array edit): `bun run
  typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS` or
  `EDGE_ENDPOINTS` for the two labels / three edge types (verify after T-02).
  Not a standalone task — checked at the final validation sweep.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) — **exception (C-06):** T-05/T-06/T-07's route-level integration tests are authored at their task but first run green at the **T-09** checkpoint |
| tasks touching pwa views (T-14) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation |
| tasks touching `pwa/src/__tests__/` (T-14, T-15) | `bunx vitest run src/__tests__/<file>` with cwd `pwa/` — the pwa component suite runs under **vitest**, not `bun test` (task-review C-08a); T-16 runs via `bunx playwright test playwright/story-catalog-context.spec.ts` |
| T-18 | the T-18 CLI verification: the three-file `bunx vitest run` exits 0 **and** `grep story-catalog-states .github/workflows/ci.yml` shows the wired gate |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-19 sweep + AC-18 (`git diff` NODE_LABELS/EDGE_ENDPOINTS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 UserStory label | T-01, T-02 | AC-01, AC-18 |
| FR-02 AcceptanceCriterion label (GWT) | T-01, T-02 | AC-01, AC-18 |
| FR-03 story→structure edges + `1..*` | T-02, T-05 | AC-02 |
| FR-04 ACCEPTANCE_OF edge | T-02, T-06 | AC-02 |
| FR-05 Story CRUD (+ write-side scope check) | T-01, T-05, T-08, T-09 | AC-03, AC-08, AC-19 |
| FR-06 AC CRUD | T-01, T-06, T-08, T-09 | AC-04 |
| FR-07 cascade + detached (DD-11) | T-05 (cascade + detached lifecycle), T-14 (indicator) | AC-05, AC-03 (detached seam), AC-11 |
| FR-08 server derivation | T-04, T-06 (parity) | AC-06 |
| FR-09 bootstrap endpoint (+ DD-09 boundary) | T-07, T-08, T-09, T-14 (hint) | AC-07, AC-13, AC-19 |
| FR-10 openapi + five error codes | T-03, T-08 (code mappings), T-12 | AC-04, AC-08, AC-09 |
| FR-11 route-perm + RBAC | T-11 (unit composition), T-17 step 6 (e2e 403/200, D-7) | AC-09, AC-19 |
| FR-12 StoryCatalog + 4 states | T-13, T-14, T-15, T-18 (CI gate for the AC-10…AC-14 artifacts) | AC-10, AC-12, AC-13, AC-14, AC-15 |
| FR-13 detail + edit + AC editing | T-14 | AC-11, AC-16 |
| FR-14 model-scope + reload survival (D-4 carve-out) | T-14, T-16 | AC-17 |
| NFR-01 registry-only, no const edit | T-02 | AC-01, AC-02, AC-18 |
| NFR-02 model isolation via activity join | T-05, T-07, T-10 | AC-08 |
| NFR-03 structured-AC single gate | T-01, T-06, T-08 | AC-04 |
| NFR-04 parity harness | T-04, T-06 | AC-06 |
| NFR-05 house rules | T-09, T-11, all | AC-09, AC-18 |
| NFR-06 tokens-only + conformance | T-14 | AC-15, AC-16 |
| XD-18 verification mandate | T-17 (+ T-07, T-11) | AC-19 |
