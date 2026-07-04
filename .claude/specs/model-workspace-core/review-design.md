---
feature: "model-workspace-core"
reviewing: "design"
reviewing_revision: 4
artifact: "design.md (revision 4, reviewing_requirements_revision: 4)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
---

# Review: model-workspace-core / design (pass 1/2 — revision 4)

Fresh cold review of `design.md` **revision 4**, requested by the orchestrator
as the gate decision on the post-approval reconciliation (STATUS.md "Next"
item 2). Process note: the on-disk history records a completed 2/2 review
cycle that approved revision 3; this pass opens a new 1-of-2 budget scoped to
revision 4. Finding IDs continue the established series (pass 1: B-01,
C-01–C-05, N-01–N-04; pass 2: B-02/B-03, C-06–C-08, N-05–N-09; rev-3 pass:
C-09–C-11, N-10–N-12). New this pass: **C-12, C-13, N-13–N-15**.

Reviewed against: `requirements.md` rev 4 (approved), `blueprint.md` (View
Tree, UX-01..06, XD-01..18), `.claude/CLAUDE.md`, `.claude/specs/_baseline/`
conventions, and the as-built codebase.

**As-built claims re-verified this pass** (not taken on trust from prior
reviews; note execution is mid-flight, so several "new" files already exist —
checked that they agree with the design rather than contradict it):

- `pwa/src/route.ts` — nine pre-existing surfaces `kbd` 1–9; the Model
  surface is appended with `kbd:"0"` and the seven View-Tree tabs
  **verbatim** (`models, canvas, stories, key-activities, kpi-impact,
  systems, export`) — exact match to blueprint + §4.9.
- `pwa/src/App.tsx` — keydown branch now `/^[0-9]$/` with `"0" → index 9`
  and `e.preventDefault()`, exactly the §4.9(a) contract.
- `api/src/errors.ts` — all 9 new codes present, additive, no collisions.
- `api/src/auth/rbac-permissions.ts` — ordered first-match array; the new
  model/module rows are listed specific-before-parameterized (all
  `models/:modelId/module-instances/*` + `models/:id/domains` + `archive`
  before `models/:id`), matching §5's insertion-order paragraph.
- `api/src/router.ts` — `models*`/`modules*` dispatch blocks present; no
  per-route auth (central gate only).
- `api/src/ontology/storage/{node-labels,edge-types}.ts` —
  `createNodeLabel`/`createEdgeType` exist as the §4.1 registration path;
  `shared/src/schema/nodes.ts` `nodeReadSchema.label` is `z.string()` as
  §4.1/Risk 5 claim.
- `scripts/design-conformance.ts` — confirmed **inert without
  `--view`/`--surface`** ("INERT BY DEFAULT" in the file header); the two
  `--view <file>` invocations in §6/§8 are the enforced form (D-5/C-11
  correctly reflected).
- `pwa/src/styles/companygraph/tokens.css`, `pwa/src/views/_shared.tsx`
  (`Loading`/`ErrorState`) — exist as cited (N-01 path fix correct).
- Root `package.json` — `migrate:model`, `register:model`, `typecheck`
  scripts wired as §4.7/§4.1 describe.
- `pwa/src/context/ActiveModelContext.tsx` (already executed) — reads
  `?model=<id>` from the **hash** query string and persists
  `cg.activeModelId`; consistent with §4.9 (see N-14 on wording precision).

## Status of prior findings (rev-3 review residuals → rev 4)

- ~~C-09~~ → **resolved.** Deleted-anchor behavior is specified in §4.4
  (model-scoped write on a dead handle → `404
  module_instance_node_not_member`, never 500, never re-fork) and §4.5
  (missing-anchor forked read → instance envelope with empty content), with
  AC-06 test coverage in §8 — exactly the recommended fix.
- ~~C-10~~ → **resolved (documented-limitation arm).** §4.7 keeps the
  narrow first-run collision guard, adds the requirements rev-4 mandated
  `--down` **`--force` refusal** while non-reference models exist, and
  documents re-apply-after-forced-`--down` as unsupported in the script
  header/help. That is the "or document" arm of the original
  recommendation; acceptable.
- ~~C-11~~ → **resolved.** Requirements rev 3 landed the D-1…D-5 errata +
  the additive `POST /models/:id/domains` route + N-10; rev 4 folded
  D-1/D-4/D-5 into the body. §2.1 is correctly a landed ledger — verified
  against `requirements.md` rev 4 line-by-line (FR-18/AC-21 no-`?model=`,
  FR-08 blob-model guard wording, AC-16 two `--view` invocations, FR-10
  `--force`, AC-08 second-model-survives, four-label counts). The tasks
  half of C-11 is **not** fully closed → C-12 below.
- ~~N-10~~ → **resolved** (§1 rule 1, §3 intro, §4.1 all say four labels +
  five edges; matches requirements NFR-01 rev 4).
- ~~N-11~~ → **resolved** (§4.4 DELETE-body note + query-param fallback
  recorded).
- ~~N-12~~ → **resolved** (§4.5/§8 define AC-05 identity as identical
  *modulo the projected handles*).

## Blockers

None.

## Concerns

- **C-12 — `tasks.md` rev 3 still lacks the rev-4 T-16 sync.** Design rev 4's
  own header flags it, and STATUS.md "Next" item 1 confirms it is pending:
  tasks T-16 predates the §4.7 `--down --force` refusal and the AC-08
  addition ("a second (non-reference) model survives a forced
  down-migration with its `IN_MODEL` edges + subgraph intact"). This is the
  only contract in rev 4 with no task/DoD carrying it. Not a design defect —
  the design text is complete — but approval of rev 4 must be conditioned on
  the orchestrator landing the T-16 sync **before T-16 executes** (the
  migration script exists on disk already; whether it implements the refusal
  is exactly what the un-synced task would fail to check).
  *Recommendation:* one-line tasks edit: T-16 DoD gains "`--down` without
  `--force` exits non-zero and writes nothing while a non-reference model
  exists" + the AC-08 assertion, verification =
  `api/__tests__/model-migration.integration.test.ts`.

- **C-13 — Concurrent first-edit fork race is unspecified.** §4.4 defines
  `forkInstance` as "idempotent" only for sequential calls. Two concurrent
  first writes to the same non-forked instance (nodes route + edges route,
  or two clients) can both observe `forked=false` and both materialize the
  subtree — producing **duplicate `forkLocalKey` values**, which breaks
  §3.4's "globally unique by construction" (the §4.3 `forkLocalKey` indexes
  are *lookup* indexes, not uniqueness constraints) and makes the §4.5
  anchor read (`{forkLocalKey: <instanceId>::journey}`) return two
  journeys. Likelihood is low on a loopback single-operator stack, and no
  AC exercises concurrency, so this is not blocking — but the fix is one
  sentence. *Recommendation:* state in §4.4 that the fork check-and-set
  runs inside **one `executeWrite`** with a conditional gate on the
  instance node (`MATCH (i:ModuleInstance {id:$id}) WHERE i.forked = false
  SET i.forked = true` as the first write, so Neo4j's node write-lock
  serializes racers; the loser re-reads and takes the already-forked
  path). Pin it in the T-08 implementation notes.

## Nits

- **N-13** — §4.7 `--down` does `DETACH DELETE m` on the reference model
  root but says nothing about `ModuleInstance`s `INSTANCE_IN` Model #1:
  their `INSTANCE_IN` edge dies with the root, leaving orphaned instance
  nodes (and, if forked, live subtrees under now-unscoped domains). AC-08's
  count assertions still pass (domain/journey/activity counts are
  instance-blind). Add one line: either `--down` also deletes Model #1's
  instances, or the script header documents the orphaning as part of the
  same "entered knowingly" limitation.
- **N-14** — §4.9 says the active-model context "reconciles against a
  `?model=<id>` URL param". On this hash-router the param can only
  meaningfully live in the **hash** query string
  (`#/model/models?model=<id>` — `route.ts` parses params from the hash;
  `location.search` is invisible to it). The executed
  `ActiveModelContext.tsx` already picked the hash reading; make the design
  text say "hash query param" so AC-18's playwright spec asserts the right
  URL shape.
- **N-15** — Trivial command drift: requirements AC-16 says
  `bun scripts/design-conformance.ts --view …`, design §6/§8 say
  `bun run scripts/design-conformance.ts --view …`. Both work under Bun;
  harmless, but the tasks/T-20 DoD should quote one form.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | **pass** (table below; C-12 flags the one tasks-side gap for the rev-4 `--force` contract) |
| Every AC is closed by a test artifact in §8 | **pass** — all 21 ACs map to a named test file or a concrete manual repro |
| Routes/views match the blueprint View Tree verbatim | **pass** — `#/model/{models,canvas,stories,key-activities,kpi-impact,systems,export}`, exact; verified against `route.ts` as executed |
| UX-* allowances covered in ACs | **pass** — UX-01 (§6 four states / AC-13–15), UX-02 (tokens + two `--view` runs / AC-16), UX-03 (n/a — no canvas here, tables reflect it), UX-04 (no new breakpoints), UX-05 (AC-17), UX-06 (verbatim routes + reload survival / AC-18) |
| XD-* cross-cutting decisions honoured | **pass** — XD-01/02 (registry-only labels, Neo4j only, `NODE_LABELS` untouched + AC-20 git-diff guard), XD-06 (BusinessModel roots), XD-07 (publish/pin/fork/upgrade exactly as decided), XD-08 (Business Architect via existing RBAC, no `node:write`), XD-12 (idempotent + reversible + dry-run migration), XD-17 (DEC-01 closed at gate, silent-accept recorded) |
| No file ownership conflict with another spec | **pass** — `route.ts` ownership per blueprint ("one feature owns a file"); `seed-rbac-roles.ts` is the known additive coordination hotspot, handled additively |

### FR / NFR → design mapping

| Req | Covered by | Status |
|-----|-----------|--------|
| FR-01 BusinessModel label | §3.1, §4.1, §4.3 | ok |
| FR-02 module label set (four) | §3.2–3.4, §4.1 | ok (N-10 count fixed) |
| FR-03 IN_MODEL edge | §3.5, §4.1 | ok |
| FR-04 lifecycle edges | §3.5, §4.1 | ok |
| FR-05 Model CRUD + ordinal + delete + at-most-one-reference | §3.1, §4.3, §5 | ok — rev-4 N-06 (transactional check picked) + N-07 (forked copies in cascade) landed |
| FR-06 publish/versions (blob) | §3.3, §4.4, §5 | ok — D-3 explicit-version mode in body |
| FR-07 instantiate (+`targetDomainId` D-2, `:id/domains` setup) | §3.4, §4.3, §4.4, §4.5, §5 | ok |
| FR-08 fork trigger + edge route + lifecycle guard | §4.4, §4.6, §5 | ok — deleted-anchor (C-09) specified; fork race → C-13 |
| FR-09 explicit upgrade | §4.5, §5 | ok (N-09 handle warning present) |
| FR-10 migration + `--force` refusal | §4.7 | ok in design; tasks sync pending → C-12; instance orphaning → N-13 |
| FR-11 Business Architect RBAC/persona | §4.8 | ok — verified against as-built seed pattern |
| FR-12 route-permission mapping | §4.8, §5 | ok — every §5 row has a perm; ordering verified in executed `rbac-permissions.ts` |
| FR-13 openapi + error codes | §3.6, §5, §7 | ok — 9 additive codes, each reachable |
| FR-14 Model surface + 7 tabs verbatim | §4.9, §6 | ok — verified verbatim in `route.ts` |
| FR-15 active-model context | §4.9 | ok (N-14 wording) |
| FR-16 ModelWorkspace + 4 states | §4.9, §6 | ok |
| FR-17 sibling-tab placeholder | §4.9, §6 | ok |
| FR-18 model-scope helper, no `?model=` | §4.2 | ok — rev-4 C-09 agreement, body and design now match |
| NFR-01 registry-only | §3, §4.1 | ok |
| NFR-02 idempotent/reversible migration | §4.7 | ok |
| NFR-03a/b isolation | §4.2 / §4.4 | ok |
| NFR-04 version immutability | §3.3, §4.4, §4.6 | ok — single reachability for `module_version_immutable`, guard for the rest |
| NFR-05 house rules | throughout | ok — zod-only, no tsc, central gate, loopback, en-US |
| NFR-06 tokens-only PWA | §6 | ok — `companygraph/tokens.css` path + enforced `--view` form |

## Summary

- **Revision 4 does what it claims and nothing more:** it reconciles the
  approved rev-3 design with the now-approved requirements rev 4, folds in
  every residual finding (C-09/C-10/N-10/N-11/N-12) with the recommended
  mechanics, and adds exactly one contract — the requirements-mandated
  `--down --force` refusal. The §2.1 Deviations Register is verifiably a
  landed ledger: zero divergences between requirements rev 4 and this
  design remain.
- Every as-built claim checked this pass verifies against the codebase, and
  the already-executed slices (route.ts, App.tsx, errors.ts,
  rbac-permissions.ts, router.ts, ActiveModelContext.tsx) **agree with**
  the design rather than drift from it.
- The two concerns are cheap and non-blocking: land the T-16 tasks sync
  before the migration task executes (C-12 — already flagged by the design
  and STATUS.md; this approval is conditioned on it happening), and add the
  one-sentence transactional gate for concurrent first-edit forks (C-13).
- Nits: `--down` instance orphaning note (N-13), "hash query param"
  precision for AC-18 (N-14), one canonical AC-16 command form (N-15).

## Verdict

**approve** — zero blockers. Revision 4 is a faithful, fully-traceable
reconciliation with approved requirements rev 4; routes/views match the
blueprint View Tree verbatim; all UX-* and XD-* obligations are covered by
named ACs; house rules are honoured throughout. Open concerns C-12 (tasks
T-16 sync — must land before T-16 executes) and C-13 (fork-race sentence)
plus nits N-13–N-15 are recorded for the tasks/execution phase; none
requires a design re-review.
