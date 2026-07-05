---
feature: "model-workspace-core"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 6
reviewing_requirements_revision: 5
reviewing_design_revision: 4
review_pass_1: "approve (0 blockers, 3 concerns, 3 nits) — all folded into rev 2"
review_pass_2: "revise of rev 2 (4 blockers, 3 concerns, 3 nits) folded into rev 3; final on-disk re-review: approve of rev 3 (0 blockers, 3 concerns, 2 nits; cap 2/2) — residuals + the requirements rev-4 C-10 sync folded into rev 4 (post-approval sync, not a new review pass)"
review_cycle_2_pass_1: "approve of rev 4 (0 blockers, 3 concerns, 2 nits) — fresh post-execution cycle; superseded on disk by the rev-5 review below; its C-01/C-02/C-03/N-01/N-02 are folded into rev 5, which also added the gated delta tasks T-23..T-25 mandated by the fresh requirements pass-2 review (B-03/C-12) and the fresh design review (C-13/N-13)"
review_cycle_3_pass_1: "revise of rev 5 (1 blocker, 3 concerns, 3 nits; pass 1/2 on the delta slice) — B-01 (T-24 gate ineffective under read-committed) + C-01/C-02/C-03 + N-01/N-02/N-03 all folded into rev 6; pass 2/2 remains available to close the phase"
size: "large"
total_tasks: 25
---

# Tasks: model-workspace-core

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit (`Blocked by`
  / `Blocks`); no out-of-order execution. **T-22 is physically slotted between
  T-08 and T-09**, and **T-19 is physically slotted before T-18** (T-18's steps
  consume T-19's `api.ts` methods — resolves final-review C-01); IDs are out of
  numeric sequence because stable IDs are never renumbered. **T-23…T-25
  (added in rev 5, revised in rev 6 per the rev-5 tasks review — B-01,
  C-01…C-03) are appended after T-21** and are **gated** — see the rev-5
  preconditions; they never reorder or reopen T-01…T-22, which are executed
  and verified (STATUS.md ledger).
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
| **§3.4 (B-02 resolution)** — every materialized fork node carries `forkLocalKey = "<instanceId>::<localKey>"` (the **full instance-qualified synthetic id**, never the bare snapshot key). Membership of a raw UUID = `forkLocalKey STARTS WITH "<instanceId>::"`; synthetic-id resolution = exact `forkLocalKey` equality; the forked read anchors on `{forkLocalKey: "<instanceId>::journey"}`. Index-backed (§4.3). | Fork writes the instance-qualified value; all three resolutions query that one property; the two lookups are index-backed. *(Rev 6, fresh tasks-review B-01: T-24 supersedes T-03's two lookup indexes with `forkLocalKey` **uniqueness constraints** on `UserJourney`/`Activity` — the constraint-backing RANGE indexes serve the same equality + `STARTS WITH` lookups, and the constraints make "globally unique by construction" deterministic under concurrency.)* | T-08 (fork + resolution) + T-03 (indexes; superseded by T-24's constraints) + `module-fork.integration.test.ts` fixture (two instances of one module under one Domain → distinct subtrees) |
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

**Rev-4 gate history (closed)**: design rev 4 was gated on disk — `design.md`
frontmatter now reads `status: approved`. The former "one remaining item" of
this section is done (fresh-cycle tasks-review C-02, design half).

### Rev-5 gates (block **T-23…T-25 only** — T-01…T-22 are executed + verified)

1. **User decision (requirements pass-2 B-03)**: confirm fix **option 1**
   (`POST /api/v1/import` rejects lifecycle labels/edges with
   `409 model_lifecycle_route_required`, write-nothing; lifecycle-aware
   backup/restore explicitly out of scope with a named future owner) over
   **option 2** (declare `data:write` import the sanctioned bulk/restore
   escape hatch; NFR-04/FR-08 reworded, an AC pins the bypass). T-23 is
   authored to option 1 — the reviewer's recommendation, matching the shipped
   T-10 guard's philosophy. **If the user picks option 2, T-23 as authored is
   invalid** (rev-5 tasks-review C-02): this artifact then requires a further
   revision (rev 7) re-cutting T-23 as a requirements-wording + AC-pinning
   task **before** execution — never a silent re-cut.
2. **Requirements rev 5 lands and is gated** (applied orchestrator-side per
   the pass-2 review's cap note): the chosen B-03 fix text + new **AC-22**,
   the C-12 `POST /api/v1/nodes/:label` guard-arm parenthetical, the C-13
   D-2/D-3 body fold, N-08's label-count wording, N-09's implicit-coverage
   note. `requirements.md` frontmatter flips `revised` → `approved` only then
   (fresh-cycle tasks-review C-02, requirements half — it must NOT flip while
   the pass-2 revise verdict is unaddressed). **At this gate the orchestrator
   additionally diffs the landed AC-22 text against T-23's Verification**
   (rev-5 tasks-review C-02): the `409 model_lifecycle_route_required` code,
   the write-nothing semantics, the lifecycle-free round-trip staying
   unaffected, and the C-12 generic-create arm must all appear in AC-22 as
   landed — and option 1 must be confirmed — before either frontmatter flips.
   Stated plainly: **approval of this artifact is conditional until then** —
   T-23 cites an AC that does not yet exist upstream, so it is unverifiable
   against requirements text until rev 5 lands.
3. **Orchestrator gates tasks rev 6** (`status: revised` → `approved`). A
   further tasks-review pass is **not owed, but may be commissioned** (rev-5
   tasks-review N-01 — new tasks are reviewable scope even when a prior
   pass's verdict was approve; on-disk `review-*.md` files remain
   authoritative over any ledger claim, per the C-01 resolution). The pass
   commissioned on rev 5 returned **revise** (B-01); rev 6 folds every
   finding, and the remaining pass 2/2 can close the phase. The matching
   STATUS.md wording fix is orchestrator-side (this artifact does not edit
   STATUS.md).

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

## Fresh post-execution review cycle (2026-07-04) — resolutions (rev 5)

After T-01…T-22 executed and verified (STATUS.md ledger, 2026-07-04T20:07Z),
the orchestrator commissioned a **fresh review cycle** of all three rev-4
artifacts. On-disk verdicts: requirements pass 2 → **revise** (B-03 + C-12,
C-13, N-08, N-09); design pass 1 → **approve** (C-13 fork race; N-13…N-16);
tasks pass 1 → **approve** (C-01…C-03, N-01, N-02). Rev 5 folds every
tasks-review finding and adds a **gated delta slice (T-23…T-25)** for the
upstream findings that require source changes. The delta tasks execute only
after the rev-5 gates in the preconditions section close.

| Finding | Resolution | Where |
|---------|------------|-------|
| **req B-03** — `POST /api/v1/import` (MERGE-on-id, any label, `data:write`) bypasses the FR-08 lifecycle guard entirely, falsifying FR-08's "only through the lifecycle routes" and NFR-04's "enforced server-side" | New **T-23** implements the reviewer-prescribed **option 1**: import rejects lifecycle labels/edges (`409 model_lifecycle_route_required`, write-nothing), pending the requirements rev-5 fold (FR-08 amendment + new **AC-22** + a backup/restore scope boundary). Option 2 stays open until the user confirms — rev-5 gate #1. | T-23 |
| **req C-12** — FR-08's guard parenthetical omits `POST /api/v1/nodes/:label`; the shipped guard covers it but no test pins the create arm | T-23 adds the generic-create 409 assertion to `model-crud.integration.test.ts` (rides with the same requirements rev-5 text fix). | T-23 |
| **req C-13 / N-08 / N-09** — D-2/D-3 errata-only in the FR-06/FR-07 body rows; AC-01 label-count wording; domains route's implicit AC coverage unnamed | Requirements-text fixes only — no task impact. Owner: requirements rev 5 (orchestrator-side; rev-5 gate #2). | — |
| **design C-13** — concurrent first-edit fork race: the shipped check (`readInstanceRow` → `row.forked`) and the materialization run in **separate** transactions, so two concurrent first edits can both materialize → duplicate `forkLocalKey`, breaking §3.4's "globally unique by construction" | New **T-24**: check-and-set inside **one `executeWrite`** whose first statement is the conditional gate `MATCH (i:ModuleInstance {id:$id}) WHERE i.forked = false SET i.forked = true` — the write-lock serializes racers; the loser takes the already-forked read-back path. The reviewer's belt-and-suspenders alternative (`forkLocalKey` uniqueness constraints) is not taken — flagged to the user. The §4.4 one-sentence doc half belongs to the design author at next touch. **[Superseded in rev 6 — rev-5 tasks-review B-01: that conditional-SET gate is Neo4j's documented lost-update pattern under read-committed (the `WHERE` filter is not re-evaluated after lock acquisition) and does NOT serialize racers. T-24 is rewritten with a lock-first-then-recheck gate AND the uniqueness constraints; see the rev-6 resolutions table and T-24 as now written.]** | T-24 |
| **design N-13** — forced `--down` `DETACH DELETE`s the reference root, silently orphaning Model #1's `ModuleInstance`s (and, if forked, their live subtrees) | New **T-25** (doc-default per the nit's lighter option): script-header limitation under the existing "entered knowingly" block + one stderr warning with the about-to-be-orphaned instance count. The alternative (delete Model #1's instances on `--down`) is flagged to the user in rev-5 gate #1. | T-25 |
| **design N-14/N-15/N-16** — "hash query param" wording (§4.9); `bun` vs `bun run` command drift; §3.3 snapshot example missing activity `description` | `design.md` text fixes; the review confirms shipped code is correct on all three. No task. Owner: design author at next touch. | — |
| **tasks C-01** — the review ledger ("cap 2/2, no further review") and the commissioned fresh pass-1 review of rev 4 contradict each other | Reconciled: frontmatter `review_cycle_2_pass_1` + the rewritten STATUS.md record the fresh cycle explicitly; the **on-disk `review-*.md` files are authoritative**, superseding ledger claims that pointed at the overwritten rev-3 reviews. | frontmatter, STATUS.md |
| **tasks C-02** — execution outran the stated gate: upstream frontmatters read `revised` while design-named source files were already edited | Design half resolved on disk (`design.md` is `approved`). Requirements half deliberately **not** flipped: the fresh pass-2 verdict is revise (B-03), so `requirements.md` stays `revised` until rev 5 folds the findings (rev-5 gate #2). Preconditions section rewritten to the current gates. | preconditions |
| **tasks C-03** — `pwa/src/__tests__/model-workspace.test.tsx` (T-17/T-20 joint) had no creation owner, and T-17's slice risked needing T-21's view registration | Resolved **at execution exactly per the review's own recommendation**: T-17 created the file with the key→index unit assertions + a SURFACES-level render assertion needing no view registration (green at the T-17 checkpoint); T-20 extended it add-only. Recorded here so artifact and history agree; no further action. | this row |
| **tasks N-01** — T-19's verification borrowed its proof wholesale from T-20's test | T-19's Verification now names the concrete assertion credited to it (the ready-state list rendering exercises `api.models.list()`'s typed return shape end-to-end). | T-19 |
| **tasks N-02** — AC-20 (cross-cutting sweep) had no durable completion-hook anchor | Cross-cutting section now names the STATUS.md `verification_artifact` AC-20 line as the durable anchor (populated 2026-07-04). | cross-cutting section |

## Tasks review of rev 5 (pass 1/2, 2026-07-04) — resolutions (rev 6)

The on-disk `review-tasks.md` (pass 1/2 against rev 5, superseding the
approve-of-rev-4 review) verdict is **revise** — 1 blocker, 3 concerns,
3 nits, all confined to the gated delta slice T-23…T-25 (the reviewer
re-verified T-01…T-22's on-disk claims and found them sound). Rev 6 folds
every finding; pass 2/2 remains available to close the phase. No IDs
renumbered; T-01…T-22 are untouched.

| Finding | Resolution | Where |
|---------|------------|-------|
| **B-01** — T-24's prescribed conditional gate (`MATCH … WHERE i.forked = false SET i.forked = true`) is Neo4j's documented conditional-SET lost-update pattern: under read-committed the `WHERE` filter is evaluated **before** the `SET` acquires the node write-lock and is **not re-evaluated after** lock acquisition (Neo4j ops manual "Concurrent data access"; neo4j/neo4j #12823), so two concurrent first edits can both pass the filter and both materialize — reproducing the exact duplicate-`forkLocalKey` race T-24 exists to close. Its 2-request `Promise.all` race test would also routinely pass against the broken gate. | T-24 rewritten adopting **both** reviewer fixes: (1) **lock-first-then-recheck** — the transaction's first statement acquires the node lock with a dummy write **before** reading `forked` (`SET i._forkLock = timestamp()` … `WITH i WHERE i.forked = false SET i.forked = true RETURN count(i) AS won`), so the losing racer blocks, re-reads the committed `true`, and yields `won = 0` → read-back path; materialization stays in the same tx gated on `won = 1`; and (2) the belt-and-suspenders **`forkLocalKey` uniqueness constraints** on `UserJourney`/`Activity` (previously declined — now **in the task**, as the review requires at least one deterministic mechanism): the loser's `CREATE` fails deterministically with `ConstraintValidationFailed` → caught → read-back path; the constraints supersede T-03's two lookup indexes (a uniqueness constraint's backing RANGE index serves the same equality + `STARTS WITH` lookups). Verification hardened: the invariant is now constraint-deterministic, plus an N-iteration storage-level paired-`forkInstance` race loop replaces reliance on the single 2-request HTTP race (kept only as smoke). Files 2 → 3 (adds `api/src/neo4j/bootstrap.ts`; still ≤3). | T-24, pins table (§3.4 row) |
| **C-01** — T-23 assumed a pre-write "validation pass" that `import.ts`'s write path does not have (only `?dryRun=true` has one — `dryRunPasses`, import.ts:112–139; the write path upserts row by row with partial-success semantics, import.ts:177–232), and its whole-payload 409 silently diverges from the route's per-row error-report contract; an all-lifecycle fixture would prove write-nothing vacuously | T-23 Steps now name the **new pre-scan loop** to be added ahead of phase 1 (mirroring `dryRunPasses`' shape over all node + edge rows) and state the **payload-atomic-vs-row-level contract distinction** in a handler comment so the implementer does not "fix" it back to row-level. Verification fixtures are now **mixed** (N valid ordinary rows + one lifecycle row) so the `/api/v1/stats`-unchanged assertion actually proves write-nothing. | T-23 |
| **C-02** — T-23's AC target (AC-22) does not exist upstream yet: requirements is rev 4, `status: revised`, pass-2 B-03 open with the option-1/option-2 user decision pending — so tasks approval is conditional, and option 2 invalidates T-23 as authored | Consequence now stated plainly in the gates: gate #2 gains the orchestrator instruction to **diff the landed AC-22 against T-23's Verification** (409 code, write-nothing, lifecycle-free round-trip, C-12 create arm) and confirm option 1 before flipping either frontmatter; gate #1 states that option 2 requires a **rev 7 re-cutting T-23 before execution, never a silent re-cut**; "approval is conditional until requirements rev 5 lands" is written into gate #2. | Rev-5 gates #1, #2 |
| **C-03** — T-25's stderr warning was verified only manually although `model-migration.integration.test.ts` already exercises the forced `--down` path; and the manual repro stranded the dev stack in the documented-unsupported state (re-apply after forced `--down` with user models trips the apply guard) | T-25 Verification now asserts the warning in `api/__tests__/model-migration.integration.test.ts` (spawn the script, capture stderr; the count line **appears** when ≥1 `ModuleInstance` exists and is **absent** when none do), with the manual repro demoted to a secondary check that now ends with the **recovery step** (delete the user model, or wipe + `bun run dev` + re-migrate) so the checkpoint is self-restoring. Files 1 → 2 (adds the test file, extend). | T-25 |
| N-01 — gate #3 / STATUS.md asserted "no new tasks-review pass is owed", yet the orchestrator correctly commissioned one (new tasks are reviewable scope) | Gate #3 reworded to "not owed, but may be commissioned"; on-disk `review-*.md` files stay authoritative per the C-01 resolution; the STATUS.md wording half is orchestrator-side. | Rev-5 gate #3 |
| N-02 — T-23 makes `import.ts` a third cross-spec coordination hotspot (it already carries `system-augmentation-model`'s `injectSystemKindDefault` injection at import.ts:177–180) with no seam discipline | T-23 gains an explicit **import.ts seam DoD** (add-only, self-contained pre-scan block; the injection and the per-row loop are not modified), mirroring T-08's seam DoD for `routes/models.ts`. | T-23 |
| N-03 — the C-13 "§4.4 one-sentence doc half" hand-off had no durable anchor beyond STATUS.md hand-off #4 | Added to the Cross-cutting verification section (the AC-20-anchor pattern) so it survives ledger rewrites. | Cross-cutting section |

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
- **Verification**: `bun run typecheck`; direct assertion credited to this
  task (rev 5, fresh-cycle N-01): the **ready-state list rendering** in
  `pwa/src/__tests__/model-workspace.test.tsx` consumes `api.models.list()`'s
  typed return shape end-to-end — that assertion is T-19's proof (T-20 owns
  the remainder of the file).

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

### T-23 — Import-route lifecycle guard (requirements pass-2 B-03, option 1)

*(New in rev 5 — **gated**: executes only after rev-5 gates #1 and #2 close.
Appended after T-21; stable IDs are never renumbered.)*

- **Files** (3): `api/src/routes/import.ts` (modify),
  `api/__tests__/model-import-guard.integration.test.ts` (new),
  `api/__tests__/model-crud.integration.test.ts` (extend — the C-12 create arm)
- **Implements**: requirements pass-2 B-03 required fix, option 1 (FR-08
  guard-set extension; closes the forthcoming **AC-22**) + C-12's create-arm
  pin; extends design §4.6's guard to the third write surface; supports NFR-04
- **Complexity**: moderate
- **Blocked by**: T-10 (guard module), T-13 (dispatch) — both landed; **gates:
  rev-5 preconditions #1 + #2**
- **Blocks**: —
- **Steps**: In `api/src/routes/import.ts`, add a **new pre-scan loop ahead
  of phase 1 (resolves rev-5 tasks-review C-01)**: the write path has **no**
  pre-write validation pass today — only the `?dryRun=true` branch has one
  (`dryRunPasses`, import.ts:112–139); the real write path zod-parses and
  upserts **row by row with partial-success semantics** (import.ts:177–232),
  so the guard cannot ride an existing pass. The new pre-scan (mirroring
  `dryRunPasses`' shape) iterates **all** node + edge rows before any
  `upsertNode`/`upsertEdge` executes, running the T-10 guards:
  `assertNotLifecycleLabel(row.label)` for node rows,
  `assertNotLifecycleEdge(row.type)` for edge rows (`LIFECYCLE_LABELS` =
  `BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance`;
  `LIFECYCLE_EDGES` = `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/
  `FORKED_FROM`). A single offending row rejects the **whole payload** with
  `409 model_lifecycle_route_required` and writes nothing. **Contract note
  (C-01 — state it in a handler comment): this payload-atomic rejection is a
  deliberate divergence from the route's established per-row error-report
  contract** — correct for a security guard; do not "fix" it back to
  row-level partial success during execution. **Import-seam DoD (resolves
  rev-5 tasks-review N-02, mirroring T-08's seam DoD)**: `import.ts` is a
  cross-spec coordination hotspot — it already carries
  `system-augmentation-model`'s `injectSystemKindDefault` injection
  (import.ts:177–180); this task is **add-only**: the pre-scan lands as one
  self-contained block ahead of phase 1 and modifies neither the injection
  nor the per-row upsert loop. Storage primitives untouched — additive
  route-boundary rejection only, same philosophy as T-10. Handler comment
  names lifecycle-aware backup/restore as out of scope with the owner the
  requirements rev-5 scope boundary designates. **C-12 arm**: add one
  assertion to `model-crud.integration.test.ts` — generic
  `POST /api/v1/nodes/BusinessModel` → `409 model_lifecycle_route_required`
  (the shipped T-10 guard already sits in the POST handler; this pins it).
- **Verification**: `api/__tests__/model-import-guard.integration.test.ts` —
  a **mixed** import payload (N valid ordinary node/edge rows + one
  `BusinessModel` node row — mixed per C-01, so the stats assertion proves
  write-nothing rather than passing vacuously on an all-lifecycle payload)
  → 409 `model_lifecycle_route_required` **and** `/api/v1/stats` counts
  unchanged, including the N valid rows (write-nothing); a mixed payload
  whose offending row is an `IN_MODEL` edge → 409 + counts unchanged
  likewise; a lifecycle-free payload still imports (round-trip unaffected
  for ordinary graph data); plus the generic-create 409 assertion added to
  `model-crud.integration.test.ts` (AC-22 once requirements rev 5 lands).

### T-24 — Fork first-edit concurrency gate (design-review C-13; rewritten in rev 6 per tasks-review B-01)

*(New in rev 5 — hardening. Not blocked by the B-03 requirements gate;
executes after the orchestrator gates rev 6 — precondition #3. Rev 6
replaces the rev-5 conditional-SET gate, which the rev-5 tasks review proved
ineffective under Neo4j's read-committed isolation — B-01.)*

- **Files** (3): `api/src/storage/modules.ts` (modify),
  `api/src/neo4j/bootstrap.ts` (modify — constraints supersede T-03's
  lookup indexes), `api/__tests__/module-fork.integration.test.ts` (extend)
- **Implements**: fresh design-review C-13 recommendation as corrected by
  rev-5 tasks-review B-01 — makes §3.4's "globally unique by construction"
  true under concurrency; supports FR-08, NFR-03b, NFR-04
- **Complexity**: complex *(rev 6: two coordinated mechanisms + a schema
  supersession — no longer a one-judgment-call change)*
- **Blocked by**: T-08, T-22 (both landed)
- **Blocks**: —
- **Steps** *(resolves rev-5 tasks-review B-01 — both of the review's fixes
  are adopted; the rev-5 conditional gate `MATCH … WHERE i.forked = false
  SET i.forked = true` must NOT be built: under read-committed the filter is
  evaluated before the `SET` acquires the write lock and is not re-evaluated
  after, so both racers pass it — Neo4j ops manual "Concurrent data access";
  neo4j/neo4j #12823)*:
  1. **Lock-first-then-recheck gate** — replace the read-then-write fork
     check (`readInstanceRow` → `row.forked` at modules.ts:765, then
     materialization in a **separate** `executeWrite` at modules.ts:793)
     with check-and-set inside **one `executeWrite`** whose first statement
     acquires the node's write lock via a dummy write **before** the
     `forked` read: `MATCH (i:ModuleInstance {id:$id}) SET i._forkLock =
     timestamp() WITH i WHERE i.forked = false SET i.forked = true RETURN
     count(i) AS won`. The losing racer blocks on the lock at the dummy
     `SET`, then re-reads the committed `forked = true`, is filtered out,
     and returns `won = 0` → take the existing already-forked read-back path
     (`forkLocalKey STARTS WITH "<instanceId>::"`). Materialization stays in
     the **same transaction**, gated on `won = 1`. `REMOVE i._forkLock` as
     the transaction's final statement so no scratch property persists; a
     code comment names `_forkLock` as a lock-acquisition dummy write, never
     projected at the REST boundary. Sequential external behavior is
     unchanged (idempotent no-op on an already-forked instance).
  2. **Deterministic belt-and-suspenders (previously declined; now in the
     task per B-01)** — in `bootstrap.ts` `applySchema`, replace T-03's two
     `forkLocalKey` lookup indexes with **uniqueness constraints**:
     `DROP INDEX user_journey_fork_local_key IF EXISTS` /
     `DROP INDEX activity_fork_local_key IF EXISTS`, then
     `CREATE CONSTRAINT user_journey_fork_local_key_unique IF NOT EXISTS
     FOR (n:UserJourney) REQUIRE n.forkLocalKey IS UNIQUE` and the
     `Activity` twin. Neo4j exempts nodes missing the property, so the core
     graph is unaffected, and the constraint's backing RANGE index serves
     the same §3.4 equality + `STARTS WITH` lookups (the supersession is
     recorded in the pins-table §3.4 row). In `forkInstance`, catch
     `ConstraintValidationFailed` from the materialization `CREATE`s and
     route it to the already-forked read-back path — the loser fails
     deterministically even if any future edit reintroduces a gate bug.
  The one-sentence §4.4 doc half of C-13 belongs to the design author, not
  this task (durable anchor: Cross-cutting verification section, per N-03).
- **Verification** *(hardened per B-01 — a 2-request race is probabilistic
  and would routinely pass against a broken gate)*: extend
  `api/__tests__/module-fork.integration.test.ts` —
  (a) **deterministic constraint arm**: after `applySchema`, `SHOW
  CONSTRAINTS` lists both `forkLocalKey` uniqueness constraints and the two
  superseded lookup indexes are gone; a direct-driver attempt to `CREATE` a
  second node with an existing `forkLocalKey` fails with
  `ConstraintValidationFailed`; re-run `applySchema` → no-op (idempotent,
  matching T-03's discipline). (b) **storage-level race loop**: N (≥10)
  iterations, each on a **fresh** non-forked instance, firing paired
  concurrent `forkInstance` calls (`Promise.all`); after every iteration
  assert exactly **one** materialized subtree — the count of live nodes
  `WHERE n.forkLocalKey STARTS WITH "<instanceId>::"` equals the snapshot
  member count, **no duplicate `forkLocalKey` values**, and both calls
  resolved without error (one won, one took the read-back path); also
  assert no `_forkLock` property remains. (c) **HTTP smoke** (kept from
  rev 5, demoted to smoke): one fresh instance, two concurrent first edits
  via `Promise.all` (node PATCH on `<instanceId>::a0` + edge POST from
  `<instanceId>::a1`) → both succeed, single subtree, no duplicates.

### T-25 — Forced-`--down` orphaning note in the migration script (design-review N-13)

*(New in rev 5 — doc-default resolution per the nit's lighter option; the
alternative — delete Model #1's instances on `--down` — is flagged to the
user in rev-5 gate #1.)*

- **Files** (2): `api/src/scripts/migrate-retail-to-model.ts` (modify),
  `api/__tests__/model-migration.integration.test.ts` (extend — resolves
  rev-5 tasks-review C-03)
- **Implements**: fresh design-review N-13 — documents that `--down`
  `DETACH DELETE`s the reference root while `ModuleInstance`s `INSTANCE_IN`
  it lose that edge and remain orphaned (forked subtrees stay live under
  now-unscoped domains); supports FR-10, NFR-02 (honest reversibility
  contract)
- **Complexity**: simple
- **Blocked by**: T-16 (landed)
- **Blocks**: —
- **Steps**: Script header gains the orphaning limitation under the existing
  "entered knowingly" block (same tier as the re-apply-after-forced-`--down`
  note); the `--down` path prints one stderr warning line with the count of
  `ModuleInstance`s about to be orphaned when that count is > 0 (read-only
  `MATCH` for the count; **no change to what is deleted**; the line is
  absent when the count is 0).
- **Verification** *(automated per rev-5 tasks-review C-03 — the warning is
  a testable output and the covering test already exercises the forced
  `--down` path)*: extend
  `api/__tests__/model-migration.integration.test.ts` — in the existing
  forced-`--down` coverage (AC-08), spawn the script (`Bun.spawn`, capture
  stderr) and assert the orphan-count warning line **appears** (with the
  correct count) when ≥1 `ModuleInstance` exists, and is **absent** when
  none do; plus `grep -n orphan api/src/scripts/migrate-retail-to-model.ts`
  shows the header limitation. Secondary manual check (self-restoring per
  C-03): run `bun run migrate:model --down --force` (keyboard/CLI) against a
  dev stack with one instantiated module — expect the stderr orphan-count
  line and an unchanged exit code; **then recover the stack** (delete the
  user model — or wipe Neo4j + `bun run dev` — and re-run
  `bun run migrate:model`), since re-apply after a forced `--down` while
  user models exist trips the T-16 apply guard by design.

## Cross-cutting verification (whole-spec)

- **AC-20** (transpile clean + no `NODE_LABELS` edit): `bun run typecheck` exit 0;
  `manual: git diff shared/src/schema/nodes.ts` shows no additions to `NODE_LABELS`
  (verify after T-03). Not a standalone task — checked at the final validation sweep.
  **Durable anchor (fresh-cycle N-02)**: the sweep result is recorded on the
  STATUS.md `verification_artifact` AC-20 line (populated 2026-07-04); re-run
  and re-record after the rev-5 delta (T-23…T-25) lands.
- **Design C-13 doc half — open hand-off (durable anchor per rev-5
  tasks-review N-03, same pattern as the AC-20 anchor above)**: `design.md`
  §4.4 still owes the one-sentence note that the fork check-and-materialize
  now runs as lock-first-then-recheck inside a single write transaction,
  backed by the `forkLocalKey` uniqueness constraints (T-24 as rewritten in
  rev 6). Owner: the design author at the next `design.md` touch — not any
  task here. Recorded in this section so the hand-off survives ledger
  rewrites; mirrored in STATUS.md hand-off #4.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-20) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation (pass-1 C-01) |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-21 sweep + AC-20 (`git diff` NODE_LABELS) |
| rev-5/6 delta (T-23…T-25) | `bun run typecheck` per task; `bun test:integration` for the **four** touched integration files (`model-import-guard`, `model-crud`, `module-fork`, `model-migration` — count corrected in rev 6: T-25's stderr assertion is now automated per C-03); the AC-22 arm counts only once requirements rev 5 lands (gate #2 diff, C-02); refresh the STATUS.md verification ledger (incl. the AC-20 anchor) |

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
| FR-08 fork on edit + sibling edge routes + guards (rev 5: + import surface per req B-03/C-12; + concurrency gate per design C-13) | T-08, T-22, T-10, T-11, T-23, T-24 | AC-06, AC-03, AC-22 (pending requirements rev 5) |
| FR-09 explicit upgrade | T-09, T-11 | AC-07 |
| FR-10 retail migration (rev 5: + forced-`--down` orphaning note per design N-13) | T-16, T-25 | AC-08 |
| FR-11 Business Architect RBAC/persona | T-15 | AC-09 |
| FR-12 route-permission mapping (incl. domains + edge routes) | T-13 | AC-10 |
| FR-13 openapi + error codes | T-02, T-14 (envelope reachability: T-08, T-10, T-11, T-12, T-22) | AC-10 |
| FR-14 Model surface + 7 tabs | T-17 | AC-11 |
| FR-15 active-model context | T-18 | AC-18 |
| FR-16 ModelWorkspace + states | T-19, T-20 | AC-11..AC-17 |
| FR-17 sibling placeholder | T-21 | AC-19 |
| FR-18 model-scope helper | T-04, T-11 | AC-21 |
| NFR-01 registry-only labels | T-03 | AC-01, AC-20 |
| NFR-02 idempotent/reversible migration | T-16, T-25 | AC-08 |
| NFR-03a/b isolation | T-04, T-08, T-11, T-22, T-24 | AC-21, AC-06 |
| NFR-04 version immutability (rev 5: import surface closed per req B-03) | T-06, T-08, T-10, T-22, T-23 | AC-04, AC-06, AC-22 (pending) |
| NFR-05 house rules | all | AC-20 |
| NFR-06 tokens-only PWA | T-20 | AC-16 |
