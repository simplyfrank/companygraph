---
feature: "business-model-authoring"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 5
reviewing_requirements_revision: "3 (authored 2026-07-05, pending ratification; rev 2 approved is the fallback — see Execution preconditions)"
reviewing_design_revision: 4
size: "large"
total_tasks: 19
---

# Tasks: business-model-authoring

> **Revision 5 (2026-07-05) — applies the rev-3 fixes to the task bodies.**
> Addresses every finding of `review-tasks.md` (pass 1 on rev 4 — verdict:
> revise). The review's root cause: revision 3's fixes were recorded in the
> rev-3 preamble below but never applied to the task bodies. This revision
> edits the **bodies** (each change is marked "Resolves: <finding>" at the
> task it lands in; verified by grepping the body text, not the preamble):
> - **B-01** → T-06's Steps name the real standalone client exports
>   (`models`/`stories`; **no `modules` client on disk**) and sanction the
>   three thin `json<T>` wrappers (`modules.list`, `models.createDomain`,
>   `models.createInstance`); T-06's Verification covers the wrappers' call
>   shapes; the `api.models.*`/`api.modules.*`/`api.stories.*` spellings are
>   swept out of T-08/T-09/T-14; the sanction is now a **binding
>   carry-forwards row (TR2-B-01)**, not revision-note history.
> - **B-02** → T-11's section is **physically moved directly after T-18**;
>   document order and stated order now agree. T-10 executes after T-11
>   (T-11 added to T-10's `Blocked by`), so T-10's integration file runs
>   green at its own checkpoint; the checkpoint caveat covers exactly
>   T-04/T-05/T-18 and says why T-10 needs none.
> - **B-03** → T-12 rescoped to the house **unit** pattern
>   (`model-authz.test.ts`: `getRoutePermission → hasPermissionByRbac`
>   composition); the "full run succeeds" clause (incl. the Step-4 role
>   search) re-homed into **T-10**'s integration file; design §8's AC-10
>   live-HTTP over-claim recorded as a **Deviations row** (design review
>   cap spent at 2/2 — same mechanism as DD-06).
> - **C-01** → T-15's Files line lists all four touched files. **C-02** →
>   T-19 assertion (2) reworded to what a server-side file can prove.
>   **C-03** → the drifted line-number citations (preconditions, T-06, T-09,
>   T-11, T-12, T-18) replaced by **symbol** citations + a one-time anchor
>   re-verify policy in the Execution preconditions.
> - **N-01** → T-14's phantom "T-16" Blocks annotation deleted. **N-02** →
>   T-13's Verification drops the `git diff` clause (final-sweep only, as
>   T-03 already states). **N-03** → T-07's `Blocked by` corrected to T-01;
>   T-13's redundant T-18 edge dropped.
> No task added or removed; no ID renumbered; no requirement/design contract
> touched.

> **Revision 4 (2026-07-05) — the design-rev-4 touch-up (DR3-C-03 residue).**
> Reconciles this artifact with **design rev 4** (which folded the pass-2/2
> approve verdict's own concerns/nits; review cap reached, no further design
> pass). Three deltas, no task added or removed, no AC renumbered:
> - **DD-09 (orphan-tolerant scope semantics; resolves DR3-C-02, review
>   option (i))** replaces rev 3's step-5 membership test in **T-04**: the
>   per-id decision now comes from the §4.3 resolution query's `modelIds`
>   (anchor-chain walk), rejecting only **provably-foreign** ids
>   (`modelIds` non-empty without `:modelId`); a **no-model orphan**
>   (`modelIds` empty) is re-anchorable and passes — this keeps the
>   echoed-id retry contract (DR2-C-03) honest. Rev 3's wording "exists with
>   a model-scoped label but is not in `scopedNodeIds` → reject" is
>   **superseded** (it would lock out orphan retries forever). **T-16**
>   gains AC-18's recovery assertion (c): scope-rejected anchoring edge →
>   corrected echoed-id retry succeeds, node enters `scopedNodeIds(A)`.
> - **Label-mismatch check (DR3-N-01)** added to T-04 step 5: for
>   `existingId`/re-run-`id` rows, the resolved `labels(n)` must include the
>   claimed `label`; mismatch → per-row `invalid_payload`
>   `details:{labelMismatch:[<id>]}`, row excluded (prevents MERGE minting a
>   duplicate-id node under the claimed label). AC-08's artifact (T-04's
>   integration file) gains the no-duplicate-id assertion; T-01's result
>   schema comment names both `details` shapes.
> - **Label-filtered projection (DR3-N-02)** in T-05: on disk
>   `scopedNodeIds` also collects `ModuleInstance` pin ids
>   (`model-scope.ts:33`) — the `authoring/graph` projection filters by
>   label and never trusts the set's composition.
>
> Design §2.5 (DR3-C-03) directs the fold into "T-04's step-5 logic and
> T-16/T-06's test assertions" — the "T-06" pointer resolves to **T-04's own
> integration file**: design §8 pins the labelMismatch assertion to the AC-08
> artifact `authoring-apply.integration.test.ts` (T-04) and the recovery
> assertion to the AC-18 artifact (T-16); T-06 (the PWA client) has no
> server-side assertion surface and is unchanged. Noted here rather than
> silently dropped.

> **Revision 3 (2026-07-04).** Addresses every finding of the rev-2 task
> review (`review-tasks.md`, pass 1 on rev 2 — verdict: revise):
> - **B-01** (blocker): T-06's client claims corrected against
>   `pwa/src/api.ts` on disk — the mwc/story clients are the **standalone
>   exports `models` (api.ts:1099) and `stories` (:1162)**, not
>   `api.models.*`/`api.stories.*`, and **no `modules` client exists**. T-06
>   now explicitly **sanctions three thin `json<T>` wrappers**
>   (`modules.list`, `models.createDomain`, `models.createInstance`) for the
>   mwc-owned routes the wizard must call — consuming, not duplicating.
>   Spelling sweep applied in T-08/T-09/T-14; T-06's verification extended to
>   the three wrappers' call shapes.
> - **C-01**: T-12's authz test rescoped to the house **unit** pattern
>   (`model-authz.test.ts`: `getRoutePermission → hasPermissionByRbac`
>   composition — a full-HTTP 403 is not reproducible locally); the "full run
>   succeeds" clause re-homed into T-10's integration file.
> - **C-02**: **T-11 moved directly after T-18** in execution order (its only
>   real preconditions are T-04/T-05/T-18), plus an explicit checkpoint note:
>   the T-04/T-05/T-18 integration files are *authored* with their tasks but
>   first *run green* at the T-11 checkpoint.
> - **C-03**: T-15's Files line now lists
>   `pwa/src/views/model/ModelCanvas.tsx` and
>   `pwa/src/__tests__/model-canvas.test.tsx` (4 files, soft-cap breach
>   noted) — its Steps/Verification already edited both.
> - **N-01** (Blocks bookkeeping: T-01 no longer lists T-02; T-14's phantom
>   T-16 edge removed), **N-02** (`git diff` assertions moved out of `bun
>   test` files into the final validation sweep), **N-03** (T-19 assertion
>   (2) reworded to what a server-side file can prove), **N-04** (citations
>   refreshed: `registerModelRoutes` router.ts:398, `registerStoryRoutes`
>   :406, `query/search` dispatch :468, `api.search` api.ts:103).
>
> **Revision 2 (2026-07-04).** Reconciles rev 1 (task review pass 1 = approve,
> 0 blockers) with **design rev 3** and lands every `review-tasks.md` finding:
> **TR-C-01/TR-C-02** (router integration rewritten as the sibling
> `registerAuthoringRoutes` delegate — design §5.1; T-11), **TR-C-03** (AC-09
> now has a dedicated owning task — **T-19**), **TR-N-01** (T-14's Files line
> now lists `pwa/src/views/index.tsx`; 4 files, soft-cap breach accepted for a
> one-line dispatch swap), **TR-N-02** (traceability note: AC-10 = one AC, two
> artifacts), **TR-N-03** (role-picker read pinned to `api.search` →
> `GET /api/v1/query/search?label=Role` — design §4.5). Design rev 3 additions
> folded in: the **domain PATCH route** (DD-08, **T-18**), the **DD-07
> write-side scope validation** (T-04 step 5), `resumeStep` (DR2-N-02, T-07),
> the four-permission-family authz test (DR2-C-01, T-12), and the widened
> AC-04/AC-08/AC-10/AC-18 test artifacts (design §8).
>
> **Superseded rev-1 instructions (do NOT execute the rev-1 wording):**
> 1. Edge-id key is **`"<type>:<from>-><to>"`** (design DR-N-02, §3.2/§4.3
>    step 7 — request tokens verbatim, delimiter `->`), *not* rev 1's
>    `"<type>|<from>|<to>"`.
> 2. A node row with **both** `existingId` and `id` **fails the schema**
>    (`superRefine` → `400 invalid_payload`, design DR-N-03) — rev 1's
>    "precedence: existingId wins" handler rule is dead.
> 3. Id minting uses **`generateId()`** (`api/src/ids.ts:4`), not
>    `Bun.randomUUIDv7()`.
> 4. The review canvas renders **one `JourneyCanvas` per journey with
>    `layoutMode="chain"`** (design §4.8/DD-05) — rev 1's `"multi"`
>    `LayoutMode` instruction is rejected (`"multi"` routes to the explorer's
>    non-model-scoped `MultiJourneyView`, an NFR-03 leak).
> 5. Router wiring is a **sibling delegate block**, never match arms inside
>    mwc's block, and **`api/src/routes/models.ts` is not edited** (TR-C-01/02).
> 6. *(superseded rev-2/3 instruction — rev 4)* Step 5's scope test is **not**
>    "referenced id exists with a model-scoped label but is not in
>    `scopedNodeIds(modelId)` → reject". That wording strands no-model orphans
>    forever (DR3-C-02). The binding rule is **DD-09**: reject only ids whose
>    resolution-query `modelIds` is non-empty **without** `:modelId`
>    (provably foreign); `modelIds` empty (orphan) or containing `:modelId`
>    passes.
>
> Task IDs are stable: T-01..T-17 keep their rev-1 identity (contents
> revised); **T-18/T-19 are new** and are placed in the list at their
> **execution position** (the document order below is the execution order).

## Reading guide

- **Order**: tasks execute top-to-bottom **as laid out in this document**
  (T-18 runs after T-05; **T-11 sits directly after T-18** — its only real
  preconditions are the three handlers (T-04/T-05/T-18), and the layout
  below now matches this claim, the section having been physically moved in
  rev 5 (**resolves review B-02**); T-19 after T-13 — IDs are stable,
  position is execution order). Dependencies are explicit
  (`Blocked by` / `Blocks`). There is exactly **one** binding order: the
  document layout.
  **Checkpoint caveat (C-02/B-02):** the integration test files authored in
  **T-04/T-05/T-18** — exactly these three — first **run green at the T-11
  checkpoint**: the routes are not dispatched until `registerAuthoringRoutes`
  lands. At the T-04/T-05/T-18 checkpoints, author the file +
  `bun run typecheck` only; run the files at T-11. **T-10 needs no caveat**
  (review B-02): it executes after T-11 (T-11 is in its `Blocked by`), so its
  integration file runs green at T-10's own checkpoint.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks the
  STATUS.md completion edit without a `verification_artifact`.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every** touched
  file under `pwa/src/views/` — each `.tsx` and each `.module.css` gets its own
  invocation (enforced `--view` form, mwc design D-5; AC-16).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run under
  `bun test`; the Playwright spec runs in the PWA e2e job.

## Execution preconditions

1. **Dependencies merged — verified on disk.** Both `model-workspace-core` and
   `story-spec-core` have merged (design rev 3 cites on-disk code throughout):
   the `registerModelRoutes` and `registerStoryRoutes` **delegate blocks** in
   `api/src/router.ts`, `scopedNodeIds` (`api/src/storage/model-scope.ts`),
   the `POST /models/:id/domains` and `POST …/module-instances` rows in
   `api/src/auth/rbac-permissions.ts` (required `targetDomainId` validated
   `IN_MODEL` in `api/src/storage/modules.ts`), `…/stories/bootstrap`
   (`api/src/routes/stories.ts` + its `rbac-permissions.ts` row),
   `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx`),
   `api.search` and the **standalone client exports `models` / `stories`**
   in `pwa/src/api.ts` (note: **no `modules` export exists** and `models`
   has no domain-/instance-create method — review B-01, TR2-B-01),
   `Typeahead` `label` prop (`pwa/src/components/Typeahead.tsx`),
   `JourneyCanvas` `LayoutMode` (`pwa/src/components/JourneyCanvas.tsx`),
   `generateId()` (`api/src/ids.ts`), `realImport` private
   (`api/src/routes/import.ts`), `patchNode` (`api/src/storage/nodes.ts`).
   **Citation policy (resolves review C-03):** anchors in this artifact are
   cited by **symbol**; any line numbers that remain elsewhere (e.g. inside
   design quotes) were last verified 2026-07-05 and drift with the working
   tree — at execution start, do **one** re-verify sweep (grep each symbol)
   and trust the symbol, never a stale line number.
2. **DD-06 requirements amendment (BLOCKING for execution).** This artifact is
   written against **design rev 4**'s **three-route** contract (`POST
   …/authoring/apply`, `GET …/authoring/graph`, `PATCH …/domains/:domainId` —
   design §5.0/DD-06), which deviates from the approved requirements rev 2's
   "exactly one new endpoint" wording (FR-13/FR-14/Scope Boundaries) and names
   the domain PATCH as FR-03's edit-in-place mechanism. Requirements **rev 3**
   (authored 2026-07-05, carrying the exact amendment incl. the five-code
   FR-13 list) awaits user ratification. **Do not start T-01 until the
   orchestrator has ratified requirements rev 3 (the DD-06 amendment) and
   design rev 4 is accepted** (the design review cap is reached at 2/2 —
   rev 4 applies the pass-2 approve verdict's own recommendations, so
   acceptance is a user gate, not another review). If ratification is
   refused, T-18 and the third rbac/openapi entries in T-12/T-13 fall away
   and the design must be re-cut — do not improvise.

## Design-review carry-forwards — binding decisions

The rev-1 pinned-decision table is superseded where design rev 3 resolved the
finding in the design itself. What remains binding for execution:

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **DR-C-01** (canvas seam) | Server route stays **id-based** (§3.3/§4.4); the id→column transform is the dedicated client mapper `toJourneyData(graph, journeyId): JourneyData` with its own DoD; **one `JourneyCanvas` per journey, `layoutMode="chain"`**; cross-journey `PRECEDES` dropped; `MultiJourneyView`/`"multi"` rejected (NFR-03 leak) | T-05, T-15 |
| **DR-C-02** (AC-10 drift) | Single approved id **`AC-10`**, closed by **two** artifacts (authz + openapi files) — no `AC-10a`/`AC-10b`; `story:write` 403 folded in under Deviations | T-12, T-13 |
| **DR-N-02** (edge key) | Canonical edge-id key **`"<type>:<from>-><to>"`**, request `from`/`to` tokens verbatim; used identically in the handler `ids.edges` map and by the client for re-submit | T-01, T-04, T-07, T-08 |
| **DR-N-03** (existingId vs id) | **Mutually exclusive**, enforced by `superRefine` → envelope `400 invalid_payload`. `existingId` = pick-existing global node, **no** import row; `id` = re-run of a minted node, import row **with** that id | T-01, T-04 |
| **DD-07 as refined by DD-09 / DR2-B-02, DR3-C-02** (write-side scope) | Apply step 5: every referenced pre-existing model-scoped id (`Domain`/`UserJourney`/`Activity`) is resolved via the §4.3 anchor-chain query (`labels(n)` + `modelIds`); **rejected only if provably foreign** (`modelIds` non-empty without `:modelId`) → per-row `invalid_payload` `details:{outOfModel:[…]}`, rows excluded from the `realImport` payload, indexes remapped to canonical order. **No-model orphans (`modelIds` empty) pass** — re-anchorable, keeps the echoed-id retry honest. Shared `Role`/`System`/`Location` exempt | T-04, T-16 |
| **DR3-N-01** (label check) | Step 5, all labels: an `existingId`/re-run-`id` row whose resolved `labels(n)` does not include the claimed `label` → per-row `invalid_payload` `details:{labelMismatch:[<id>]}`, row excluded (no duplicate-id node ever minted) | T-04 |
| **DR3-N-02** (scoped-set composition) | `scopedNodeIds` also holds `ModuleInstance` pin ids (`model-scope.ts:33`); the `authoring/graph` projection filters by label (`Domain`/`UserJourney`/`Activity`) — never trusts the set's composition | T-05 |
| **DD-08 / DR2-B-03** (domain edit) | FR-03 edit-in-place = the new model-scoped `PATCH …/domains/:domainId` (`model:write`, D-2 `IN_MODEL` check, delegates to `patchNode`); **not** graph-core's `PATCH /nodes/Domain/:id` (needs `node:write`, persona lacks it) | T-18, T-08 |
| **DR2-C-02** (edit-on-re-run) | MERGE **updates** on a matched id: re-run row with echoed `id` + changed `name` persists the new name — this is journeys'/activities' edit path (no PATCH route for them) | T-04, T-08 |
| **DR2-C-03** (failed-row echo) | `ids` echoes **every** row including failed/scope-rejected ones; retry with the echoed `id` creates (MERGE on absent id) | T-01, T-04, T-07 |
| **DR2-N-02** (re-entry) | `resumeStep(graph, storyCount)` in `wizardModel.ts`: first step whose advance-gate is unsatisfied; `storyCount` from the existing `GET …/models/:modelId/stories` list (`story:read`) | T-07, T-14 |
| **TR-N-03** (role catalog read) | Role picker = catalog `Typeahead label="Role"` backed by the existing `api.search(label, q, limit)` → `GET /api/v1/query/search?label=Role&q=…` (`query:read`). No new read | T-09 |
| **TR2-B-01** (rev-2 tasks review B-01; body-applied in rev 5 — resolves rev-4 review B-01) | The PWA mwc/story clients are the **standalone exports** `models` / `stories` in `pwa/src/api.ts` — there is **no** `api.models.*`/`api.stories.*` spelling and **no `modules` client** on disk. T-06 adds exactly **three thin `json<T>` wrappers** for the mwc-owned routes the wizard calls: `modules.list()` → `GET /api/v1/modules`; `models.createDomain(modelId, {name, description?})` → `POST /api/v1/models/:modelId/domains`; `models.createInstance(modelId, {moduleId, targetDomainId})` → `POST …/module-instances`. **Consuming, not duplicating** — no other client method is added, no handler logic re-implemented, no existing method re-spelled | T-06, T-08, T-09, T-14 |

## Deviations from requirements (orchestrator: land as errata / rev-3 amendment, no ID renumbering)

| Requirement text | Executed as | Why | Source |
|------------------|-------------|-----|--------|
| FR-13/FR-14/Scope Boundaries: "exactly one new endpoint" | **Three** routes: `POST …/authoring/apply` (`model:write`), `GET …/authoring/graph` (`model:read`), `PATCH …/domains/:domainId` (`model:write`); FR-03's "editable in place" mechanism = the domain PATCH | FR-09 is unimplementable without a model-scoped read (graph-core reads leak siblings; DD-01); FR-03's must-clause has no permission-reachable path without the PATCH (DD-08). **Pending user ratification as requirements rev 3** (Execution preconditions #2) | design §5.0 DD-06, DR2-B-01/B-03 |
| AC-10 asserts authz (model:write/module:write 403s) + OpenAPI presence | **Widened**: also asserts (a) `story:write`-lacking session 403'd on `…/stories/bootstrap` (RR-C-06), (b) 403 on the domain PATCH without `model:write`, (c) the full run exercises **four** permission families incl. `query:read` (role-picker search), (d) openapi lists all **three** DD-06 routes | Same authz-coverage class B-02 closed for the clone path; the widened surface is exactly what a full `must` run exercises | design §5.2, §8; DR2-C-01 |
| AC-04 (domains via mwc route) | **Widened**: integration test adds edit-in-place via the domain PATCH (changed `name` persists, `description` untouched) + cross-model PATCH → `404 not_found`, unchanged | DD-08 gives FR-03's approved "editable in place" its mechanism; the artifact widens, the criterion id stays | design §8 AC-04 row |
| AC-16 `manual: run … design-conformance.ts …` | **CLI** verification (deterministic exit code), enforced `--view` form per touched file | It is a script with an exit code; requirements already name the `--view` form (mwc D-5) | requirements AC-16, design §8 |
| Design §8 AC-10 row: live-HTTP authz outcomes ("no `model:write` → 403 … with it → success … a full run succeeds") | **Unit-tier composition** in `api/__tests__/authoring-authz.test.ts` per the house `model-authz.test.ts` pattern (`getRoutePermission → hasPermissionByRbac`) — a full-HTTP 403 is not reproducible locally (with no `ONELOGIN_ISSUER` the dev-fallback session carries synthetic permissions). The "full run succeeds" clause, incl. the Step-4 `GET /api/v1/query/search?label=Role` call, lives in **T-10**'s real-Neo4j integration file | Design review cap spent (2/2) — rescope recorded here per review B-03 (same mechanism as the DD-06 row) instead of re-cutting the design; AC-10's authz substance (three mapped routes, four exercised families, no public route) survives intact | review-tasks (rev 4) B-03; design §8 AC-10 row |
| OQ-2 — retail-reference module granularity | **DD-04 default**: clone instantiates **every** published module whose `sourceModelId` is the `isReference:true` model (count-agnostic loop), one "Clone retail reference" action | Keeps Step 1 one-click; count = # reference journeys. Subset-selection deferred (`should`-tier) | design §4.2 DD-04; OQ-2 |
| OQ-3 — uncommitted wizard state on reload | **Commit-per-step default**: each step's Next commits via its route; only committed graph state survives reload; no client draft persistence in v1 | Conscious "commit each step" model, not silent data loss | design §3.4, §6; OQ-3 |

## Task list

### T-01 — Authoring zod schemas (shared)

- **Files** (1): `shared/src/schema/authoring.ts` (new)
- **Implements**: design §3.1, §3.2, §3.3, §3.5 — supports FR-03, FR-07, FR-09,
  FR-13
- **Complexity**: moderate
- **Blocked by**: — (see Execution preconditions)
- **Blocks**: T-04, T-05, T-07 *(added in rev 5 — the pure `wizardModel.ts`
  needs only these shared types; review N-03)*, T-18, T-13 *(T-02 removed —
  its sole edit needs nothing from T-01; review N-01)*
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US
  identifiers), importing the `uuidv7` validator from
  `shared/src/schema/nodes.ts:26`. Copy the shapes **verbatim from design
  §3.1/§3.2/§3.3/§3.5** — they are complete as written:
  - `authoringNodeSchema` — `{ clientKey: min(1), label:
    z.enum(["UserJourney","Activity","Role"]) /* NOT Domain — C-02 enforced at
    the schema boundary */, name: min(1), description?, attributes?,
    existingId?: uuidv7, id?: uuidv7 }` with the **`superRefine` making
    `existingId`/`id` mutually exclusive** (DR-N-03 — both present fails the
    envelope, `400 invalid_payload`). Comment the three-case semantics from
    §3.1 (new / pick-existing-global / re-run).
  - `authoringEdgeSchema` — `{ type: z.enum(["PART_OF","EXECUTES","PRECEDES"]),
    from: min(1), to: min(1), id?: uuidv7 }`. (`Domain`/`System`/`Location`
    labels and `USES_SYSTEM`/`AT_LOCATION`/`IN_MODEL`/lifecycle edges are
    deliberately absent; wrong pairs surface as per-row
    `edge_endpoint_label_mismatch`, not a zod reject.)
  - `authoringApplySchema = { nodes: [...], edges: [...] }` + exported
    `AuthoringApply` type.
  - `authoringApplyResultSchema` — `{ imported:{nodes,edges}, errors?:
    [{section:z.enum(["nodes","edges"]), index, code, message, details?}],
    ids:{ nodes: z.record(uuidv7), edges: z.record(uuidv7) } }`. Comment: edge
    keys are **`"<type>:<from>-><to>"`** with request tokens verbatim
    (DR-N-02); ids echoed for **all** rows including failed ones (DR2-C-03);
    `errors[].index` refers to the canonical assembled payload order;
    `details` carries the step-5 rejection shapes `{outOfModel:[…]}` (DD-07/
    DD-09) and `{labelMismatch:[…]}` (DR3-N-01) — `details` stays an open
    record, no dedicated schema per shape.
  - `authoringGraphSchema` — the **id-based** projection per §3.3 verbatim:
    `journeys[{id,name,domainId,activities[{id,name,order}]}]`,
    `roles[{id,name,executesActivityIds}]`,
    `systems[{id,name,usedByActivityIds}]`, `locations[{id,name,activityIds}]`,
    `precedes[{fromActivityId,toActivityId}]` + `AuthoringGraph` type.
  - `domainPatchSchema` — `{ name?: min(1), description?: z.string() }` with
    the `refine` requiring at least one field (§3.5; no `attributes`, no
    id/label fields) + `DomainPatch` type.
  **No new schema is persisted** — request/response DTOs only (NFR-01).
- **Verification**: `shared/src/schema/__tests__/authoring.test.ts` — rejects a
  node row with `label:"Domain"`; accepts the three labels; **a row with both
  `existingId` and `id` fails parse** (superRefine, DR-N-03); rejects an edge
  `type` outside the three; result schema round-trips `{imported,errors,ids}`;
  `domainPatchSchema` rejects `{}` (refine) and accepts `{name:"x"}`.

### T-02 — Export `realImport` (the reuse seam)

- **Files** (1): `api/src/routes/import.ts` (modify)
- **Implements**: design §4.7 (OQ-1 (a)) — supports FR-07 (C-03)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-04
- **Steps**: Add the `export` keyword to `realImport`'s declaration (private at
  `import.ts:157`). **This is the sole edit** — the function body, the
  `RowError` shape (`{section,index,code,message,details?}`), the two-phase
  collect-and-continue logic (incl. `phase1FailedIds`, line 169), and
  `handleImport`'s own use (line 82) are byte-for-byte unchanged (§4.7). No
  HTTP loopback, no re-derived blame set (OQ-1 (b)/(c) rejected). Confirm
  `realImport(driver, payload)` accepts the `{nodes:[{id,label,name,…}],
  edges:[{id,type,fromId,toId}]}` `importPayloadSchema` shape T-04 assembles.
- **Verification**: `api/__tests__/import-realimport-export.test.ts` — imports
  `realImport` from `api/src/routes/import.ts` (proves the export) and asserts
  it is a function; existing `handleImport` tests pass unchanged;
  `bun run typecheck`.

### T-03 — Verify existing error codes (no new code)

- **Files** (0 source — assertion-only; assertions land in T-13's test file)
- **Implements**: design §5.3 — supports FR-13
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-13
- **Steps**: **No `ERROR_CODES` edit.** Confirm on disk that `api/src/errors.ts`
  contains all **five** reused codes: `invalid_payload`, `attribute_violation`,
  `edge_endpoint_label_mismatch`, `model_not_found`, **`not_found`**
  (`errors.ts:12` — the domain PATCH's missing/out-of-model response, §4.9).
  The three routes reuse these exclusively: envelope parse →
  `invalid_payload`; per-row validation → `invalid_payload`/
  `attribute_violation`; per-row out-of-model reference → `invalid_payload`
  with `details:{outOfModel:[…]}` (DD-07 — same code mwc's D-2 uses); per-row
  endpoint mismatch → `edge_endpoint_label_mismatch` (from `upsertEdge`);
  missing model → `model_not_found`; missing/out-of-model domain on the PATCH
  → `not_found`. **Add no code** — an unreachable code is a dead entry (§5.3).
- **Verification**: folded into `api/__tests__/authoring-openapi.integration.test.ts`
  (T-13) — assert the five reused codes are members of `ERROR_CODES`. The
  "no addition to `errors.ts`" check is **not** a test assertion (shelling
  out to `git diff` inside a `bun test` file is not house pattern and is
  vacuous on a committed tree — review N-02); it lives in the final
  validation sweep alongside AC-20's `git diff` guards. `bun run typecheck`.

### T-04 — Authoring-apply handler (mint + scope-validate + realImport)

- **Files** (1): `api/src/routes/authoring.ts` (new — apply half)
- **Implements**: design §4.3 (7 steps incl. step 5 = DD-07 as refined by
  **DD-09** + the DR3-N-01 label check), §4.5 — closes AC-05 (server), AC-08;
  supports FR-07, NFR-01, NFR-02, NFR-03. **Resolves (rev 4): DR3-C-02,
  DR3-N-01.**
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-05, T-18, T-06, T-11 *(T-07 dropped in rev 5 — it depends
  only on T-01's shared types; review N-03)*
- **Steps**: `handleAuthoringApply(req, modelId)`, exactly design §4.3's seven
  steps:
  1. **No auth check** in the handler — the central gate enforces
     `model:write` (house rule, NFR-04; mapping in T-12).
  2. **Model existence**: `MATCH (m:BusinessModel {id:$modelId})` — absent →
     `404 model_not_found` (envelope-level).
  3. **Parse** with `authoringApplySchema` → envelope failure `400
     invalid_payload`. A row with both `existingId`+`id` fails here (DR-N-03).
  4. **Mint ids + assemble the canonical import payload.** Per node row:
     `existingId` → map `clientKey → existingId`, **no** import row; `id` →
     map + emit an import row with that id (re-run upsert); neither → mint via
     **`generateId()`** (`api/src/ids.ts:4` — the storage layer's own UUIDv7
     generator), map + emit. Per edge row: resolve `from`/`to` through the map
     (a token that is neither a known `clientKey` nor a UUID → per-row
     `invalid_payload` in `errors[]`); `id` if present else mint; emit
     `{id, type, fromId, toId}`. The assembled row order is the **canonical
     index space** all `errors[].index` values refer to. **Emit no `Domain`
     row, no `IN_MODEL` edge** (C-02) — `PART_OF` targets an
     already-`IN_MODEL` `Domain` UUID.
  5. **Label + scope validation (DD-07 as refined by DD-09; DR2-B-02,
     DR3-C-02, DR3-N-01).** Collect every **raw pre-existing UUID** the batch
     references: (a) edge endpoints supplied as raw UUIDs, (b) `existingId`s,
     (c) re-run `id`s. **One resolution query** (§4.3 verbatim) yields each
     id's labels **and** owning model(s) via the same anchor chain
     `scopedNodeIds` walks:
     `MATCH (n) WHERE n.id IN $ids OPTIONAL MATCH
     (n)-[:PART_OF*0..]->(d:Domain)-[:IN_MODEL]->(m:BusinessModel)
     RETURN n.id AS id, labels(n) AS labels, collect(DISTINCT m.id) AS modelIds`.
     (`scopedNodeIds(getDriver(), modelId)` — mwc-owned, `model-scope.ts:22`,
     consumed not re-implemented — remains the regime for the `graph` read
     and T-16's assertions; the **per-id apply decision comes from this
     query**.) For every referenced id that **exists**:
     - **Label check (DR3-N-01), all labels:** for an `existingId`/re-run-`id`
       node row, resolved `labels` must include the claimed `label` —
       mismatch → per-row `invalid_payload`
       `details:{labelMismatch:[<id>]}`, row excluded. (Without it,
       ``MERGE (n:`<claimed>` {id})`` on an id existing under a different
       label mints a **duplicate-id node**.)
     - **Scope check (DD-09), model-scoped labels only** (`Domain`/
       `UserJourney`/`Activity`; shared `Role`/`System`/`Location` exempt):
       `modelIds` contains `:modelId` → allowed. `modelIds` non-empty
       **without** `:modelId` → **provably foreign**: per-row
       `invalid_payload` `details:{outOfModel:[<id>]}` on every referencing
       row, rows excluded. `modelIds` **empty** → a **no-model orphan**
       (e.g. its anchoring `PART_OF` edge row was rejected on a prior apply,
       or a phase-2 failure stranded it): **allowed** — re-anchoring leaks
       nothing and keeps the echoed-id retry contract honest (DR2-C-03,
       DD-09).
     Excluded rows never reach `realImport`; keep a filtered→canonical index
     map. A re-run `id` whose node does **not** exist at all is likewise
     allowed (MERGE on an absent id creates, DR2-C-03).
  6. **Land it** via the exported `realImport(getDriver(), filtered)` (T-02);
     `{imported, errors?}` verbatim (C-03); **remap** `realImport`'s indexes
     back to canonical order and merge with step-5 rejections. MERGE
     **updates** on a matched id (DR2-C-02) — this is the journey/activity
     edit path.
  7. **Respond `200 {imported, errors?, ids}`**: `ids.nodes` = full
     `clientKey → uuid` map (existing-id rows included); `ids.edges` keyed
     **`"<type>:<from>-><to>"`** (request tokens verbatim, DR-N-02). Ids
     echoed for **all** rows including failed/scope-rejected ones (DR2-C-03).
     Per import's pinned C-09: **200 even when 100 % of rows fail**; `400` is
     reserved for step 3.
  **No new label/edge (NFR-01/AC-20):** payload only ever carries
  `UserJourney`/`Activity`/`Role` rows + `PART_OF`/`EXECUTES`/`PRECEDES`; no
  `createNodeLabel`/`createEdgeType`; no compile-time schema-array edit.
- **Verification**: `api/__tests__/authoring-apply.integration.test.ts`
  (Neo4j; **authored here, first runs green at the T-11 checkpoint** — the
  route is not dispatched until then, C-02): journey `PART_OF` a chosen
  domain persists (AC-05); wrong pair
  (`PART_OF` Activity→Role) → `200` with per-row
  `edge_endpoint_label_mismatch` while valid rows persist (AC-05); one bad row
  → `200 {imported, errors:[{section,index,code}]}` with indexes in canonical
  order (AC-08); server-minted UUIDv7 echoed in `ids` **for every row
  including failed ones** (canonical edge keys); re-submit with echoed ids
  upserts idempotently (no duplicates, C-04); **re-submit with an echoed `id`
  + changed `name` → the persisted node reflects the new name (MERGE-update,
  DR2-C-02)**; **re-submit of a previously failed row with its echoed id →
  the node now exists (DR2-C-03)**; **a re-run `id` whose id exists under a
  *different* label → per-row `invalid_payload` with
  `details:{labelMismatch:[…]}` and no duplicate-id node is created
  (DR3-N-01 — assert the node count for that id stays 1)**; both
  `existingId`+`id` → `400 invalid_payload`; no `IN_MODEL` written; absent
  model → `404 model_not_found`. (DD-07/DD-09 cross-model rejections + the
  orphan-recovery case are asserted in T-16.)

### T-05 — Authoring-graph read (model-scoped, id-based projection)

- **Files** (1): `api/src/routes/authoring.ts` (extend — graph half)
- **Implements**: design §4.4, DD-01 — supports FR-09, FR-12, NFR-03.
  **Resolves (rev 4): DR3-N-02.**
- **Complexity**: complex
- **Blocked by**: T-04
- **Blocks**: T-18, T-06, T-08, T-14, T-15
- **Steps**: `handleAuthoringGraph(req, modelId)`
  (`GET /api/v1/models/:modelId/authoring/graph`, `model:read`):
  1. `404 model_not_found` if the `BusinessModel` is absent.
  2. `scopedNodeIds(driver, modelId)` gives the model's structural member
     set — **on disk it holds the `Domain`/`UserJourney`/`Activity` ids
     *plus* `ModuleInstance` pin ids** (`INSTANCE_IN`, `model-scope.ts:33`;
     DR3-N-02): the projection **filters by label**
     (`Domain`/`UserJourney`/`Activity`) and never trusts the set's
     composition. Shared `Role`/`System`/`Location` are excluded from the
     set by DEC-01(a) — read but never scoped.
  3. Return the **id-based** `authoringGraphSchema` projection (T-01, §3.3
     field names verbatim): `journeys[].activities[].order` is
     server-computed — topological over the journey's **intra-journey**
     `PRECEDES` chain, `createdAt` ascending for unordered ties;
     `roles[].executesActivityIds` / `systems[].usedByActivityIds` /
     `locations[].activityIds` are read via `EXECUTES`/`USES_SYSTEM`/
     `AT_LOCATION` **from the in-scope activities**. **No column math on the
     server** — columns are T-15's client mapper.
- **Verification**: `api/__tests__/authoring-graph.integration.test.ts`
  (Neo4j; authored here, first runs green at the T-11 checkpoint — C-02):
  after an apply run, the graph returns the model's journeys +
  activities (with `order`) and each role/system/location by **id** under the
  §3.3 field names; a sibling `:modelId` returns none of the first model's
  journeys/activities (isolation smoke; full assertion in T-16); a global
  `Role` used by two models appears in both graphs (shared, not leakage);
  `404` on an absent model.

### T-18 — Domain PATCH handler (edit-in-place, DD-08) *(new in rev 2)*

- **Files** (1): `api/src/routes/authoring.ts` (extend — patch half)
- **Implements**: design §4.9, §3.5, DD-08 — closes AC-04 (server, widened
  edit-in-place artifact); supports FR-03, NFR-03, NFR-04. **Resolves:
  DR2-B-03; requires the DD-06 amendment (Execution preconditions #2).**
- **Complexity**: moderate
- **Blocked by**: T-01, T-05
- **Blocks**: T-06, T-11
- **Steps**: `handleModelDomainPatch(req, modelId, domainId)`
  (`PATCH /api/v1/models/:modelId/domains/:domainId`, `model:write`), exactly
  design §4.9:
  1. **No handler auth check** (central gate, T-12).
  2. Absent **model** first → `404 model_not_found` (same check order as the
     other two handlers).
  3. **Parse** with `domainPatchSchema` (T-01) → `400 invalid_payload` (empty
     body fails the refine).
  4. **Scope check (D-2 regime)** — one query, the shape mwc uses for
     `targetDomainId` (the `IN_MODEL` check in `api/src/storage/modules.ts`;
     symbol-cited per review C-03):
     `MATCH (d:Domain {id:$domainId})-[:IN_MODEL]->(m:BusinessModel {id:$modelId}) RETURN d.id`.
     No match → **`404 not_found`** (absent domain and other-model domain
     deliberately indistinguishable — no cross-model existence leak, NFR-03).
  5. **Delegate** to graph-core's `patchNode(getDriver(), "Domain", domainId,
     {name?, description?})` (`api/src/storage/nodes.ts` — partial dynamic
     SET; omitted fields never clobbered; `attributes` never passed;
     `updatedAt` handled by `patchNode`). Respond `200` with `patchNode`'s
     envelope.
  **Do not** route domain edits through graph-core's generic
  `PATCH /nodes/Domain/:id` (`node:write` — the persona deliberately lacks
  it; see the `business_architect` entry in
  `api/src/scripts/seed-rbac-roles.ts`, symbol-cited per review C-03).
- **Verification**: `api/__tests__/authoring-apply.integration.test.ts`
  (extends T-04's file — the AC-04 widened assertions, design §8):
  `PATCH …/domains/:domainId` with a changed `name` → readback shows the new
  name and `description` untouched; PATCH targeting model B's domain through
  model A's path → `404 not_found`, domain unchanged; empty body `{}` →
  `400 invalid_payload`; absent model → `404 model_not_found`.

### T-11 — Router integration: `registerAuthoringRoutes` sibling delegate
*(section physically moved directly after T-18 in rev 5 — resolves review
B-02; the document layout and the Reading guide's stated order now agree)*

- **Files** (2): `api/src/routes/authoring.ts` (extend — delegate),
  `api/src/router.ts` (modify)
- **Implements**: design §5.1 (TR-C-01/TR-C-02 resolution) — supports FR-03,
  FR-07, FR-09
- **Complexity**: moderate
- **Blocked by**: T-04, T-05, T-18
- **Blocks**: T-10 *(checkpoint dependency — routes dispatched, review
  B-02)*, T-12, T-13, T-19
- **Steps**: **Resolves: TR-C-01, TR-C-02.**
  1. In `api/src/routes/authoring.ts`, export
     `registerAuthoringRoutes(method, sub, req): Promise<Response | null>`
     with exactly **three** `sub.match` arms (§5.1 verbatim):
     `^models\/([^/]+)\/authoring\/apply$` (POST → `handleAuthoringApply`),
     `^models\/([^/]+)\/authoring\/graph$` (GET → `handleAuthoringGraph`),
     `^models\/([^/]+)\/domains\/([^/]+)$` (PATCH →
     `handleModelDomainPatch`). Return `null` on no-match.
  2. In `api/src/router.ts`, add **one sibling delegate block** — the same
     pattern as mwc's `registerModelRoutes` delegate block and
     story-spec-core's `registerStoryRoutes` delegate block (both in
     `api/src/router.ts`; cited by symbol, review C-03) — placed **after**
     the stories block (reading order only):
     `if (sub.startsWith("models/")) { const res = await
     registerAuthoringRoutes(method, sub, req); if (res) return res; }`.
  3. **`api/src/routes/models.ts` is NOT edited** (mwc-owned). **No ordering
     constraint** vs. the mwc/stories blocks: all three authoring paths are
     4-segment with literal `authoring`/`domains` segments no mwc/stories arm
     matches at that shape (mwc's parameterized arm is `^models\/([^/]+)$`;
     its domains arm is 3-segment POST-only — see `registerModelRoutes` in
     `api/src/routes/models.ts`), and delegates return `null` on no-match.
     No per-route auth check (gate handles it, T-12).
- **Verification**: `api/__tests__/authoring-authz.test.ts` proves all three
  delegated routes resolve through the router gate (`getRoutePermission` returns
  a permission, never `null`) — the as-built proof that
  `registerAuthoringRoutes` is wired into `api/src/router.ts`. The dispatched
  routes are further exercised end-to-end by
  `api/__tests__/authoring-apply.integration.test.ts` and
  `api/__tests__/authoring-graph.integration.test.ts` (these need live Neo4j —
  the checkpoint where the T-04/T-05/T-18 integration files first run green).
  `bun run typecheck` passes; `git diff api/src/routes/models.ts` is empty
  (mwc-owned file untouched).

### T-06 — PWA api client (authoring block)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §7 (File Changes) — supports FR-03, FR-07, FR-09.
  **Resolves (rev 5): review B-01 (TR2-B-01, binding carry-forwards row).**
- **Complexity**: moderate *(rev 5: three sanctioned wrappers added to the
  scope — no longer a single-block edit)*
- **Blocked by**: T-04, T-05, T-18
- **Blocks**: T-08 *(T-07 removed — `wizardModel.ts` is pure and needs only
  T-01's shared types; review N-03)*
- **Steps**: Add an `authoring` block to the `api` object, reusing the existing
  `json<T>()` wrapper: `apply(modelId, body: AuthoringApply)` (POST
  `…/authoring/apply`), `graph(modelId, {signal?})` (GET `…/authoring/graph`),
  and `patchDomain(modelId, domainId, body: DomainPatch)` (PATCH
  `…/domains/:domainId`). Types from `shared/src/schema/authoring.ts` (T-01).
  **Client reality on disk (review B-01 / TR2-B-01):** the mwc/story clients
  are the **standalone exports `models` and `stories`** in `pwa/src/api.ts`
  — there is **no** `api.models.*`/`api.stories.*` spelling, **no `modules`
  client at all**, and `models` has no domain-create or instance-create
  method (`listInstances` is its only instance surface). In the **same
  `pwa/src/api.ts` edit**, add exactly **three thin `json<T>` wrappers** for
  the mwc-owned routes the wizard must call:
  - `modules.list(signal?)` → `GET /api/v1/modules` (a new standalone
    `modules` export, mirroring the `models`/`stories` export style);
  - `models.createDomain(modelId, {name, description?})` →
    `POST /api/v1/models/:modelId/domains`;
  - `models.createInstance(modelId, {moduleId, targetDomainId})` →
    `POST /api/v1/models/:modelId/module-instances`.
  These **consume** mwc's routes — thin fetch wrappers, no logic, no
  re-validation; duplicate no existing method, re-implement no handler,
  touch no other client export. All other mwc/story calls use the existing
  `models.*` / `stories.*` (incl. `stories.acs.*`) methods **as-is**, and
  **do not** add a role-catalog read — the picker reuses the existing
  `api.search` (`pwa/src/api.ts`, symbol-cited per review C-03; TR-N-03).
- **Verification** (as-built): `pwa/src/__tests__/model-canvas.test.tsx` drives
  the `authoring` client through the mounted `ModelCanvas` — it mocks and asserts
  the real call URLs `GET /api/v1/models/:id/authoring/graph`,
  `GET /api/v1/models/:id/stories`, and `GET /api/v1/modules` (the `authoring.graph`
  and `modules.list` wrappers), across the loading/empty/error states. The
  `authoring.apply` wrapper's payload/echo handling is exercised via
  `pwa/src/views/model/authoring/__tests__/wizardModel.test.ts` (`commitApply`
  merges the echoed ids). `bun run typecheck` covers the wrapper type shapes
  (`AuthoringApply`/`DomainPatch` from `shared/src/schema/authoring.ts`).
  *(As-built note, rev 5→backfill: the dedicated per-wrapper shape assertions
  originally scoped for `model-canvas-template.test.tsx` / `model-canvas-steps.test.tsx`
  were consolidated into the single shipped `model-canvas.test.tsx`; the
  `models.createDomain` / `models.createInstance` clone-path wrappers exist in
  `pwa/src/api.ts` but their dedicated shape assertions did not ship — see T-08's
  Verification and the clone-path integration coverage in
  `api/__tests__/authoring-template-clone.integration.test.ts`.)*

### T-07 — Wizard step model + reducer + resumeStep (pure, in-memory)

- **Files** (2): `pwa/src/views/model/authoring/wizardModel.ts` (new),
  `pwa/src/views/model/authoring/__tests__/wizardModel.test.ts` (new)
- **Implements**: design §3.4 — supports FR-01, FR-12
- **Complexity**: moderate
- **Blocked by**: T-01 *(shared types only — `wizardModel.ts` is pure, "no
  I/O"/"no network import" is asserted; the former T-06 edge was ordering
  noise, review N-03)*
- **Blocks**: T-08, T-09, T-14
- **Steps**: Pure types + reducer + `canAdvance` + `resumeStep`, **no I/O**
  (§3.4 verbatim): `WizardStep` five-step union; `WIZARD_STEPS` in order;
  `WizardState { step, template: "blank"|"retail-clone"|null, committed:{
  domainIds, nodeIds: Record<clientKey,uuid>, edgeIds: Record<edgeKey,uuid>
  /* keys "<type>:<from>-><to>", DR-N-02 */ }, draft, error }`. Reducer
  handles `next`/`back`/`setTemplate`/`commitDomain`/`commitApply` (merges the
  `ids` echo — **including failed-row ids** — into `committed`, DR2-C-03)/
  `setDraft`/`setError`. `canAdvance(state)` gates per step (Step 1 needs a
  `template`; Step 2 needs ≥1 domain; Step 3 ≥1 journey; …) → Next disabled +
  inline message (FR-01). **`resumeStep(graph: AuthoringGraph, storyCount:
  number): WizardStep | "done"`** (DR2-N-02): first step whose advance-gate is
  unsatisfied — no domains → `"template"`; ≥1 domain, no journeys →
  `"journeys"`; ≥1 journey, no activities → `"activities"`; activities but
  `storyCount === 0` → `"stories"`; else `"done"`. `draft` is the only
  uncommitted state (not persisted across reload — OQ-3/FR-12).
- **Verification**: `pwa/src/views/model/authoring/__tests__/wizardModel.test.ts`
  — `canAdvance` blocks Step 2 with zero domains, allows with ≥1; `next`
  refuses past an unsatisfied gate; `commitApply` merges the echo so a re-run
  resubmits the same ids (C-04) including a failed row's id (DR2-C-03);
  `resumeStep` returns each of the five outcomes for the matching fixture
  graphs (DR2-N-02); reducer is pure (no network import).

### T-08 — Wizard steps: Template, Domains (create + edit), Journeys

- **Files** (3): `pwa/src/views/model/authoring/TemplateStep.tsx` (new),
  `pwa/src/views/model/authoring/DomainsStep.tsx` (new),
  `pwa/src/views/model/authoring/JourneysStep.tsx` (new)
- **Implements**: design §4.1, §4.2, §6 — closes AC-02, AC-03, AC-04
  (component half); supports FR-02, FR-03, FR-04, FR-08
- **Complexity**: complex
- **Blocked by**: T-05, T-06, T-07
- **Blocks**: T-09, T-14
- **Steps** (three step components, catalog-first; shell lives in T-14):
  - **TemplateStep (FR-02, FR-08, DD-04)**: exactly **two** options (XD-13) —
    **Blank** and **Clone retail reference** (assert no third). Blank →
    `template="blank"`, Step 2, no structure. Clone *(client spellings
    corrected to the on-disk standalone exports + T-06 wrappers — review
    B-01)*: (1) ensure a target domain (C-01) via mwc
    `POST /api/v1/models/:modelId/domains` — called through
    `models.createDomain` (T-06 wrapper) — (auto-create/name "Retail"), push
    id to `committed.domainIds`; (2) `models.list()` (standalone export) →
    the `isReference:true` model; `modules.list()` (T-06 wrapper) → modules
    whose `sourceModelId` = that id (DD-04); (3)
    `models.createInstance(modelId, {moduleId, targetDomainId})` (T-06
    wrapper → `POST …/module-instances`) per module (version omitted →
    latest), count-agnostic loop; (4) advance to Step 3 with cloned
    journeys listed (via `api.authoring.graph`). No published module → clone
    option **disabled** with an explanatory affordance (not an error, FR-08).
    Touch no other module-lifecycle route.
  - **DomainsStep (FR-03, C-02, DD-08)**: create via mwc's `POST …/domains`
    **only** (`models.createDomain`, T-06 wrapper — review B-01); list
    existing model domains (incl. a clone-created "Retail")
    **with an inline edit affordance saving through
    `api.authoring.patchDomain` (T-18's PATCH — the only domain edit path)**;
    `name` required, `description` optional; advance blocked (inline message)
    until ≥1 domain.
  - **JourneysStep (FR-04)**: add/edit `UserJourney`s each `PART_OF` a chosen
    active-model `Domain` via `api.authoring.apply` (edge row
    `{type:"PART_OF", from:"<journey clientKey>", to:"<domain id>"}`); `name`
    + parent domain required; cloned journeys pre-listed/editable (edit =
    re-run row with the echoed `id`, DR2-C-02); advance needs ≥1 journey.
    Merge the `ids` echo into `committed` using the canonical
    `"<type>:<from>-><to>"` edge keys (DR-N-02).
  All catalog components (`Card`, `Button`, native inputs, `Typeahead` for the
  domain-parent picker); tokens-only CSS in `wizard.module.css` (T-14).
- **Verification**: `pwa/src/__tests__/model-canvas-template.test.tsx` —
  exactly two options, no third (AC-02); Blank → Step 2 with no structure
  (AC-02); Clone (mocked mwc routes) discovers the `isReference` model + its
  modules via `models.list()`/`modules.list()`, one
  `models.createInstance(modelId, {moduleId, targetDomainId})` →
  `POST …/module-instances` per module (count-agnostic, DD-04; the T-06
  wrapper call shapes asserted here — review B-01), advances to Step 3; no
  published module → disabled, not error (AC-03). +
  `pwa/src/__tests__/model-canvas-steps.test.tsx` — Step 2 advance blocked
  until ≥1 domain with an inline message; create goes to mwc `POST …/domains`
  via `models.createDomain` (mocked; wrapper call shape asserted — review
  B-01); **a domain row's edit affordance calls
  `PATCH …/domains/:domainId`** (AC-04 component half, widened); Step 3
  journey requires a parent domain.

### T-09 — Activities × Roles step + Stories step (XD-18 UI path)

- **Files** (2): `pwa/src/views/model/authoring/ActivitiesRolesStep.tsx` (new),
  `pwa/src/views/model/authoring/StoriesStep.tsx` (new)
- **Implements**: design §4.5, §4.6 — closes AC-07 (component); supports
  FR-05, FR-06, XD-18
- **Complexity**: complex
- **Blocked by**: T-07, T-08
- **Blocks**: T-14
- **Steps**:
  - **ActivitiesRolesStep (FR-05, XD-18)**: per `UserJourney`, add/edit
    `Activity`s (`PART_OF` the journey) via `api.authoring.apply`. The role
    picker is **pick-or-create-global** (B-01, DEC-01(a)): the catalog
    **`Typeahead` with `label="Role"`** (`pwa/src/components/Typeahead.tsx`),
    backed by the **existing** `api.search("Role", q, …)` →
    `GET /api/v1/query/search?label=Role&q=…` (the `query/search` →
    `handleSearch` dispatch in `api/src/router.ts`, symbol-cited per review
    C-03; `query:read`) — **no new read** (TR-N-03, pinned). Picking an existing role → node row
    with `existingId` (no new node; **never also set `id`** — the pair is
    schema-rejected, DR-N-03); typing a new name → `label:"Role"` node row
    (creates a **global** `Role`). Wire `EXECUTES` (`{type:"EXECUTES",
    from:"<role clientKey|existingId>", to:"<activity clientKey>"}`).
    Optionally order activities with `PRECEDES`. This is the named XD-18 UI
    path; the server round-trip is proven in T-10 (AC-06).
  - **StoriesStep (FR-06, C-05)**: "Generate stories from graph" →
    `stories.bootstrap(modelId, {activityIds:[…wizard activity ids]})` — the
    **standalone `stories` export** in `pwa/src/api.ts`, not an
    `api.stories.*` spelling (review B-01) — (story-spec-core,
    `api/src/routes/stories.ts`). Re-run on already-bootstrapped
    activities → `{created:0, skipped:N}` rendered as the idempotent
    **"already generated"** state surfacing both counts, **not** an error
    (C-05, AC-07). Inline manual story + Given/When/Then AC create via the
    existing `stories.*` / `stories.acs.*` methods (standalone export,
    review B-01) — **no story/AC route added**. Editing a derived story/AC
    surfaces story-spec-core's `derived`-clears-on-edit guarantee. Completing
    Step 5 returns to the canvas/review state (FR-09).
  All catalog components; tokens-only.
- **Verification**: `pwa/src/__tests__/model-canvas-stories-step.test.tsx`
  (mocked story routes) — bootstrap scoped to `activityIds`; derived story+AC
  editable; re-run → idempotent "already generated" with counts, not error
  (**AC-07**); manual story + G/W/T AC create call the story routes; no
  story/AC route added. + `pwa/src/__tests__/model-canvas-steps.test.tsx`
  (extended) — the role `Typeahead` calls `api.search` with `label="Role"`
  (mocked); picking sets `existingId` (and not `id`); typing a new name emits
  a `label:"Role"` node row.

### T-10 — Key-activity-per-role round-trip (XD-18 integration)

- **Files** (1): `api/__tests__/authoring-key-activity-per-role.integration.test.ts` (new)
- **Implements**: design §4.5, §4.3, XD-18 — closes AC-06; supports FR-05,
  NFR-03; carries the AC-10 "full run succeeds" integration clause re-homed
  from T-12 (review B-03, Deviations row)
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-11 *(added in rev 5 — the routes are
  dispatched before this task runs, so its integration file runs green at
  its own checkpoint; review B-02)*
- **Blocks**: —
- **Steps**: The XD-18 mandate as a **real-Neo4j** integration test (Risk 5 —
  not a mock). Seed a model + domain + journey API-only (mwc `POST
  /api/v1/models` + `POST …/domains` + `authoring/apply` for the journey).
  Then via `POST …/authoring/apply`: in one batch create an `Activity`
  (`PART_OF` the journey) + a **new global `Role`** (node row, no
  `existingId`) wired `EXECUTES`; in a second run **pick that existing global
  Role** (node row with `existingId`) against another activity, wiring
  `EXECUTES`; add a `PRECEDES` between two activities. **Assert** the
  persisted `(:Role)-[:EXECUTES]->(:Activity)` edges exist with the
  **`Activity` end ∈ `scopedNodeIds(driver, modelId)`** and the **`Role` end
  NOT in the scoped set** (global, DEC-01(a), B-01); the `PRECEDES` order
  round-trips via `authoring/graph` (`order` reflects the chain).
  **Re-homed from T-12 (review B-03):** the same file also proves the "full
  run succeeds" half of the AC-10 widening for real — the entire seed + two
  apply runs succeed over live HTTP, and the role-picker's read
  `GET /api/v1/query/search?label=Role&q=<the new role's name>` (the Step-4
  call, `query:read`) returns the created global `Role`. This is the
  live-HTTP complement to T-12's unit-tier authz composition (Deviations
  row); a full-HTTP 403 remains out of scope here too (dev-fallback
  sessions carry synthetic permissions).
- **Verification**: `api/__tests__/authoring-key-activity-per-role.integration.test.ts`
  (Neo4j; runs green at this task's own checkpoint — T-11 precedes it) —
  **AC-06, XD-18** + the AC-10 full-run/`query/search` clause (B-03).

### T-12 — Route-permission rows + authz test (four exercised families)

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/__tests__/authoring-authz.test.ts` (new)
- **Implements**: design §5.2 (DR2-C-01, DR2-N-03) — closes AC-10 (authz
  half, **unit tier** per the rev-5 Deviations row); supports FR-14.
  **Resolves (rev 5): review B-03 (prior C-01) — rescoped to the house unit
  pattern; the live "full run" clause re-homed into T-10.**
- **Complexity**: moderate
- **Blocked by**: T-11
- **Blocks**: —
- **Steps**: Add exactly the **three** `ROUTE_PERMISSIONS` rows from §5.2
  (param-name style matches each row's nearest on-disk neighbor, DR2-N-03 —
  matching is positional):
  `P("POST","models/:modelId/authoring/apply","model:write")`,
  `P("GET","models/:modelId/authoring/graph","model:read")`,
  `P("PATCH","models/:id/domains/:domainId","model:write")` (sibling of
  mwc's `models/:id/domains` POST row in `api/src/auth/rbac-permissions.ts`).
  **Add no RBAC role/permission; re-map no route; no `public` route**
  (XD-08, NFR-04). `business_architect` already carries `model:*`,
  `module:*`, `story:*`, `query:read` (`api/src/scripts/seed-rbac-roles.ts`,
  the `business_architect` entry) — this spec grants nothing.
  **The authz test is unit-tier (review B-03)** — the house pattern for
  exactly this file class is `api/__tests__/model-authz.test.ts` (followed
  by `story-authz.test.ts`): with no `ONELOGIN_ISSUER` the local server
  admits a dev-fallback session with synthetic permissions, so a full-HTTP
  403 is **not reproducible locally**; the file asserts the
  `getRoutePermission → hasPermissionByRbac` composition — the same router
  branch production exercises. Assertions (`bun test`, no Neo4j, no live
  server):
  (a) `getRoutePermission` resolves each of this spec's **three** routes to
  its exact permission (`model:write` / `model:read` / `model:write`) —
  never `null` (an unmapped route silently skips the RBAC check);
  (b) **composition**: `hasPermissionByRbac` denies a permission array
  without `model:write` for the apply + domain-PATCH permissions and allows
  with `model:write` / `model:*` / `*` (the 403-vs-success gate at the unit
  level);
  (c) **row-presence for the upstream families the wizard exercises**
  (DR2-C-01): `POST …/module-instances` → `module:write` (mwc) and
  `POST …/stories/bootstrap` → `story:write` (story-spec-core — the AC-10
  Deviations widening) resolve to those exact permissions — asserted
  **still in force**, not added here;
  (d) none of the three routes is `isPublicRoute`;
  (e) the seeded `business_architect` set contains **all four exercised
  families** (`model:write`, `module:write`, `story:write`, `query:read`)
  — asserted via `hasPermissionByRbac` over the role's permission list per
  the `model-authz.test.ts`/`story-authz.test.ts` precedent (the seed
  script's `RBAC_ROLES` const is module-private).
  The live-HTTP "full run succeeds (incl. the Step-4
  `GET /api/v1/query/search?label=Role`)" proof lives in **T-10's**
  integration file (re-homed per review B-03; recorded in the Deviations
  table).
- **Verification**: `api/__tests__/authoring-authz.test.ts` (`bun test`,
  unit tier) — assertions (a)–(e) above (**AC-10 authz half**, unit-tier
  rescope per the Deviations row).

### T-13 — OpenAPI registration + code-presence assertion

- **Files** (2): `api/src/routes/openapi.ts` (modify),
  `api/__tests__/authoring-openapi.integration.test.ts` (new; carries T-03's
  assertions)
- **Implements**: design §5.1, §5.3, DD-06 — closes AC-10 (openapi half);
  supports FR-13
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-11 *(T-18 dropped in rev 5 — T-11 already
  transitively requires it; review N-03)*
- **Blocks**: —
- **Steps**: In `openapi.ts`, `registerPath` the **three** DD-06 routes
  (`…/authoring/apply` POST, `…/authoring/graph` GET,
  `…/domains/:domainId` PATCH) and register their zod schemas
  (`authoringApplySchema`, `authoringApplyResultSchema`,
  `authoringGraphSchema`, `domainPatchSchema` — T-01), generated from the same
  zod definitions (no hand-maintained copy, FR-13). Error responses surface
  via the shared `errorEnvelopeSchema`.
- **Verification**: `api/__tests__/authoring-openapi.integration.test.ts` —
  all **three** route paths appear in `GET /api/v1/openapi.json` (asserted
  against the amended DD-06 contract, §5.0); the **five** reused codes
  (`invalid_payload`, `attribute_violation`, `edge_endpoint_label_mismatch`,
  `model_not_found`, `not_found`) are members of `ERROR_CODES` — **AC-10
  openapi half**. *(The "no new code added" `git diff api/src/errors.ts`
  check is **not** an assertion in this test file — it lives in the final
  validation sweep alongside AC-20's `git diff` guards, exactly as T-03
  states; review N-02.)*

### T-19 — Template-clone integration test (AC-09 owner) *(new in rev 2)*

- **Files** (1): `api/__tests__/authoring-template-clone.integration.test.ts` (new)
- **Implements**: design §4.2, §8 AC-09 row — closes AC-09; supports FR-08,
  NFR-02. **Resolves: TR-C-03 (AC-09 previously had no owning task).**
- **Complexity**: moderate
- **Blocked by**: T-11 (routes dispatched; asserts the apply route is *not*
  part of the clone path)
- **Blocks**: —
- **Steps**: Real-Neo4j integration test of the clone contract, server-side
  (the UI orchestration is T-08; this proves the route surface): seed the
  `isReference:true` model with ≥1 published module (mwc publish routes) + a
  fresh target model + target domain (`POST …/domains`). Execute the clone
  exactly as TemplateStep does: `GET /api/v1/modules` → filter
  `sourceModelId`; one `POST /api/v1/models/:targetId/module-instances`
  `{moduleId, targetDomainId}` per module. **Assert** *(assertion (2)
  reworded in rev 5 to what a server-side file can prove — review C-02,
  prior N-03)*: (1) the instances exist and the cloned journey structure is
  readable via `GET …/authoring/graph` on the target model; (2) the cloned
  structure came into being **without any `authoring/apply` call** — this
  test scripts the clone exactly as TemplateStep does and itself issues
  none, proving the mwc module routes alone suffice (the UI-side "the
  wizard issues **only** these routes" claim is **not** falsifiable here
  and lives in T-08's mocked component test, where fetch interception can
  assert it); (3) a generic node/edge write attempting to mutate
  module-lifecycle state still returns
  **`409 model_lifecycle_route_required`** (mwc guard asserted **intact**,
  not re-implemented) — together, AC-09's server-side substance.
- **Verification**: `api/__tests__/authoring-template-clone.integration.test.ts`
  (Neo4j) — **AC-09**.

### T-14 — ModelCanvas view: wizard shell + 4 states + view registration

- **Files** (4 — TR-N-01: soft-cap breach accepted; the `index.tsx` edit is a
  one-line dispatch swap): `pwa/src/views/model/ModelCanvas.tsx` (new),
  `pwa/src/views/model/ModelCanvas.module.css` (new),
  `pwa/src/views/model/authoring/wizard.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §6, §3.4 — closes AC-01, AC-12, AC-13, AC-14, AC-16,
  AC-17; supports FR-01, FR-09, FR-11, FR-12, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-07, T-08, T-09
- **Blocks**: T-15, T-17 *(the phantom "T-16" annotation deleted in rev 5 —
  T-16 is server-side and its `Blocked by` (T-04/T-05) is correct; review
  N-01)*
- **Steps**: **View registration** — in `pwa/src/views/index.tsx`, replace the
  `model` surface's `canvas` tab dispatch (`ModelTabPlaceholder`) with
  `"canvas": (r) => <ModelCanvas route={r} />` — the **only** edit to that
  file (`route.ts`/`SURFACES` stay mwc's). `ModelCanvas` reads the active
  model from **`useActiveModel()`** (never re-implements selection); no
  active model → pick/create prompt linking `#/model/models` (AC-01). Hosts
  the wizard shell (step indicator `<ol>` + `Card`, `Button` Next/Back, the
  T-08/T-09 step components), keyed on `activeModel.id`; fetches
  `api.authoring.graph(modelId)` **and the story list
  (`stories.list(modelId)` — the standalone `stories` export, review B-01;
  `story:read`) to feed
  `resumeStep(graph, storyCount)`** (DR2-N-02) — the wizard opens on the
  first unsatisfied step, or `"done"` renders the review canvas (T-15).
  **All four states (UX-01, FR-11):** loading skeleton via `Loading`
  (`views/_shared.tsx`) while fetches are pending (AC-12); **empty** (no
  domains/journeys) → empty-state `Card` whose primary affordance opens the
  wizard on Step 1 (AC-13); **error** → `ErrorState` **plus a local
  `<Button onClick={retry}>`** that refetches/re-submits and does **not**
  discard the in-progress step's `draft` fields (AC-14; `ErrorState` has no
  built-in retry — story-spec-core's C-03 pattern); **ready** = wizard flow
  and/or the populated review canvas. **Keyboard/a11y (AC-17, UX-05):** Tab
  order template options → step inputs → Next/Back; per-step validation
  blocks Next with a **focusable** inline error (focus moves to it); ARIA
  landmark; step indicator announces the current step (`aria-current`/live
  region). **Tokens (AC-16, UX-02):** both `.module.css` files use only
  `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog
  components first.
- **Verification**: `pwa/src/__tests__/model-canvas.test.tsx` —
  `#/model/canvas` → `ModelCanvas` (not `ModelTabPlaceholder`); wizard opens
  via `resumeStep` reading `useActiveModel()`; no active model → prompt
  (AC-01). + `pwa/src/__tests__/model-canvas-states.test.tsx` — loading
  (AC-12); empty → wizard Step 1 (AC-13); error → retry preserves `draft`
  (AC-14). + **CLI** (AC-16): `bun run scripts/design-conformance.ts --view
  <f>` for `ModelCanvas.tsx`, `ModelCanvas.module.css`, and
  `authoring/wizard.module.css` — each expect exit 0. + **manual** (AC-17,
  keyboard): stack up, load `#/model/canvas`, keyboard-only — Tab to a
  template option, Enter; Tab through Step 2 to "Next", Enter with an empty
  required field — **expect** Next blocked and focus moves to the inline
  error; complete the field, Enter — **expect** advance to Step 3.

### T-15 — `toJourneyData` mapper (id→column) + review canvas

- **Files** (4 — soft-cap breach noted like T-14; the two modified files
  added in rev 5, review C-01: the Steps/Verification already edited both,
  and the design-conformance checkpoint + coverage tooling key off this
  line): `pwa/src/views/model/authoring/toJourneyData.ts` (new),
  `pwa/src/views/model/authoring/__tests__/toJourneyData.test.ts` (new),
  `pwa/src/views/model/ModelCanvas.tsx` (modify — ready-state rendering),
  `pwa/src/__tests__/model-canvas.test.tsx` (modify — AC-11 extension)
- **Implements**: design §4.8, DD-05 (DR-C-01 seam) — closes AC-11; supports
  FR-09
- **Complexity**: complex
- **Blocked by**: T-05, T-14
- **Blocks**: T-17
- **Steps**: `toJourneyData(graph: AuthoringGraph, journeyId: string):
  JourneyData` maps the id-based `authoring/graph` response into the real
  column-index-based `JourneyData` (`pwa/src/components/JourneyCanvas.tsx:37-45`
  — import the type, never re-declare it). Algorithm (§4.8 verbatim): (1)
  journey's activities sorted by server `order` → dense `column` `0..n-1`;
  (2) each role/system/location whose `executesActivityIds`/
  `usedByActivityIds`/`activityIds` intersect this journey → mapped columns
  (`RoleNode.columns` sorted ascending, `durations: {}`;
  `SystemNode.usages:[{column}]`; `LocationNode.columns`); entries with no
  intersection are omitted; (3) `precedes` pairs with **both** ends in this
  journey → `{from_col,to_col}`; **cross-journey pairs dropped** (rendering
  them is FR-10-tier, deferred). `crossDomainRelations`/`integrations`
  omitted. **Rendering (supersedes rev 1's `"multi"` instruction):**
  `ModelCanvas`'s ready state renders **one
  `<JourneyCanvas data={toJourneyData(graph, j.id)} layoutMode="chain"/>`
  per journey**, stacked as lanes under domain/journey headers — never
  `layoutMode="multi"` (falls through to radial; the explorer's `"multi"`
  path is `MultiJourneyView`, fed by a non-model-scoped loader — NFR-03
  leak) and never `MultiJourneyView`. An **"Edit in wizard"** affordance
  reopens the wizard at the relevant step (FR-09). No new canvas component
  (blueprint Risks row 6).
- **Verification**: `pwa/src/views/model/authoring/__tests__/toJourneyData.test.ts`
  — fixture graph with two ordered activities, a role executing both, a
  system on one, a `PRECEDES` between them → columns `0,1`, role `columns
  [0,1]`, system usage column correct, `PrecedesEdge {from_col:0,to_col:1}`;
  cross-journey `PRECEDES` dropped; role absent from a journey it doesn't
  execute in is omitted. **DoD: output type-checks against the imported
  `JourneyData` interface.** + `pwa/src/__tests__/model-canvas.test.tsx`
  (extended, AC-11) — ready state renders one per-journey **`chain`**
  `JourneyCanvas` from `authoring/graph` via the mapper; "Edit in wizard"
  reopens at the relevant step.

### T-16 — Model-isolation integration test (read + write sides)

- **Files** (1): `api/__tests__/authoring-model-scope.integration.test.ts` (new)
- **Implements**: design §4.4 isolation, §4.3 step 5 (DD-07 as refined by
  **DD-09**), NFR-03 — closes AC-18 (server half, widened incl. the rev-4
  recovery case); supports FR-12. **Resolves (rev 4): DR3-C-02 (AC-18
  recovery assertion).**
- **Complexity**: moderate
- **Blocked by**: T-04, T-05
- **Blocks**: —
- **Steps**: Seed **two** models API-only (`POST /api/v1/models` +
  `POST …/domains` + `authoring/apply` per model); full authoring batch on
  **model A**. **Read side:** `GET /api/v1/models/:modelB/authoring/graph`
  returns **none** of A's model-scoped structure
  (`Domain`/`UserJourney`/`Activity`). **`Role` is excluded from the isolation
  assertion** — a global `Role` from A's run **is** visible to B by design
  (DEC-01(a), B-01). **Write side (DD-07, DR2-B-02 — new in rev 2):**
  (a) `POST /models/A/authoring/apply` with a journey row whose `PART_OF`
  edge targets **model B's domain id** → per-row `invalid_payload` with
  `details:{outOfModel:[…]}`, **no edge written**, B's structure unchanged;
  (b) a node row re-running **B's journey id** with a new name → same
  per-row rejection, B's journey name unchanged; **(c) recovery (DD-09,
  DR3-C-02 — new in rev 4):** the batch from (a) strands its (valid,
  persisted) journey node row as a **no-model orphan** — assert it is
  invisible to both models' `authoring/graph` reads (fail-closed), then
  **retry with the echoed ids** and a corrected in-model `PART_OF` domain
  anchor → the apply **succeeds** (no `outOfModel` rejection of the
  orphan's re-run `id`) and the journey now appears in **A's**
  `authoring/graph` / `scopedNodeIds(A)`. Assert A's runs never mutated B's
  scoped structure.
- **Verification**: `api/__tests__/authoring-model-scope.integration.test.ts`
  (Neo4j) — **AC-18 server half (read + write + DD-09 recovery), B-01,
  DR2-B-02, DR3-C-02**.

### T-17 — Deep-link + active-model reload e2e

- **Files** (1): `pwa/playwright/model-canvas-context.spec.ts` (new)
- **Implements**: design §6 (active-model + reload) — closes AC-18 (component
  half), AC-19; supports FR-12, UX-06
- **Complexity**: moderate
- **Blocked by**: T-14, T-15
- **Blocks**: —
- **Steps**: Playwright spec. Seed via the API (models + domains + a small
  authored structure). (1) **AC-19**: with a non-reference model **B** active,
  navigate `#/model/canvas`, **reload** → same route renders `ModelCanvas`
  for **model B** (active-model persistence is mwc FR-15; this view
  refetches); uncommitted wizard input is **not** restored (committed graph
  state is). (2) **AC-18 component half**: switch the active model → the
  wizard/canvas reset/refetch for the new model (no cross-model leakage of
  model-scoped structure in the rendered canvas).
- **Verification**: `pwa/playwright/model-canvas-context.spec.ts` — deep-link
  + reload renders `ModelCanvas` for persisted model B; switching the active
  model refetches (**AC-18 component half, AC-19**).

## Cross-cutting verification (whole-spec)

- **AC-20** (transpile clean + no compile-time schema-array edit):
  `bun run typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to
  `NODE_LABELS`/`EDGE_ENDPOINTS`; grep confirms this spec's code
  (`api/src/routes/authoring.ts`, the wizard) calls **no**
  `createNodeLabel`/`createEdgeType`. Checked at the final validation sweep
  (after T-04/T-14) — not a standalone task.
- **AC-15 (should — canvas polish, FR-10): not implemented in the `must`
  scope** (blueprint Risks row 6; NFR-06). If FR-10 is delivered, verify —
  `manual:` with the stack up + a populated model, load `#/model/canvas`,
  trackpad-drag an activity node onto a new position — **expect** the
  `PRECEDES` order persists (`authoring/graph` re-fetch shows the new order)
  and the page does **not** scroll under the drag; then keyboard-only focus
  an activity and press the documented move-up/down key — **expect** the same
  reorder persists. Explicitly out of the `must` deliverable set.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-08, T-09, T-14, T-15) | `bun run scripts/design-conformance.ts --view <file>` for **every** touched file under `pwa/src/views/` — each `.tsx` and each `.module.css` gets its own invocation (enforced `--view`) |
| T-11 | `git diff api/src/routes/models.ts` is empty (mwc file untouched) |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + Playwright + full AC-01..AC-20 sweep + AC-20 (`git diff` NODE_LABELS/EDGE_ENDPOINTS + grep no `createNodeLabel`/`createEdgeType`) + `git diff api/src/errors.ts` empty (the T-03 "no new error code" guard — re-homed here from the test files, review N-02) |

## Traceability summary

> **TR-N-02 note:** **AC-10 is one AC intentionally closed by two artifacts**
> (T-12 authz test + T-13 openapi test) — one AC id, two files, allowed; not
> duplicate coverage. **AC-04** is likewise one AC closed by an integration
> file (T-04+T-18) and a component file (T-08).

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 wizard shell + step gating + resume | T-07, T-14 | AC-01, AC-13, AC-17 |
| FR-02 template choice + clone target-domain | T-08 (TemplateStep) | AC-02, AC-03 |
| FR-03 domains via mwc route + edit-in-place PATCH (DD-08) | T-01, T-18, T-08 (DomainsStep) | AC-04 |
| FR-04 journeys PART_OF domain | T-04, T-08 (JourneysStep) | AC-05 |
| FR-05 activities × roles, pick-or-create-global | T-04, T-09, T-10 | AC-06 |
| FR-06 stories via story-spec-core | T-09 (StoriesStep) | AC-07 |
| FR-07 batched authoring write (realImport reuse + DD-07/DD-09 scope + DR3-N-01 label check) | T-01, T-02, T-04, T-06 | AC-05, AC-08 |
| FR-08 clone via module instantiation | T-08 (TemplateStep), T-19 | AC-03, AC-09 |
| FR-09 ModelCanvas review surface | T-05, T-14, T-15 | AC-11 |
| FR-10 canvas direct-manip (should) | — (deferred, NFR-06) | AC-15 (should) |
| FR-11 four view states | T-14 | AC-12, AC-13, AC-14 |
| FR-12 model-scoped + reload survival | T-05, T-07, T-14, T-16, T-17 | AC-18, AC-19 |
| FR-13 routes in openapi, existing codes | T-01, T-03, T-13 | AC-10 |
| FR-14 route-permission mapping | T-11, T-12 | AC-10 |
| NFR-01 no new schema/store | T-01, T-04 | AC-08, AC-20 |
| NFR-02 reuse, never re-spec | T-02, T-04, T-08, T-09, T-19 | AC-08, AC-09 |
| NFR-03 model isolation (read + write, scoped structure only) | T-04 (step 5), T-05, T-10, T-16, T-18 | AC-06, AC-18 |
| NFR-04 house rules | T-11, T-12, all | AC-10, AC-20 |
| NFR-05 tokens-only + conformance | T-08, T-09, T-14, T-15 | AC-16 |
| NFR-06 wizard-first sizing (should gated out) | T-14 (must) vs FR-10 (should) | AC-15 (should) |

**AC → owning task (every AC has a deterministic closing artifact):**
AC-01/12/13/14/16/17 → T-14; AC-02/03 → T-08; AC-04 → T-18 (server) + T-08
(component); AC-05/08 → T-04; AC-06 → T-10; AC-07 → T-09; **AC-09 → T-19**
(TR-C-03 resolved); AC-10 → T-12 + T-13 (one AC, two artifacts; the
live-HTTP "full run" clause rides T-10's file — review B-03 Deviations row);
AC-11 →
T-15; AC-15 → deferred (should, cross-cutting note); AC-18 → T-16 (server) +
T-17 (component); AC-19 → T-17; AC-20 → cross-cutting final sweep.
