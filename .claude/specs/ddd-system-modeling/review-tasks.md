---
feature: "ddd-system-modeling"
reviewing: "tasks"
artifact: "tasks.md (rev 3 — 2026-07-04, 19 tasks; against approved requirements rev 2 + approved design rev 3)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-05"
review_pass: "re-review of the rev-2 pass (that pass's B-01/C-01/C-02/N-01..N-03 are dispositioned below)"
---

# Tasks Review: ddd-system-modeling (rev 3)

Reviewed cold against the approved `requirements.md` (rev 2), `design.md`
(rev 3), the blueprint (View Tree, XD-*, UX-*), `.claude/CLAUDE.md` house
rules, and the on-disk codebase. Every load-bearing on-disk claim was
re-verified against the real files.

## Prior findings (rev-2 tasks review) — disposition

- ~~**B-01** (T-05 `unknown`-bucket fixture unconstructible)~~ → **resolved,
  per the preferred option**: T-05 exports `bucketSystemKinds` from
  `api/src/storage/system-model.ts` and proves the `unknown` bucket in a new
  unit test (`api/__tests__/system-kind-bucketing.test.ts`, no Neo4j — feeds a
  missing, an invalid `"quantum"`, and a `null` row, asserts `unknown:3`); the
  integration fixture is all-valid-kinds; the sanctioned direct-driver budget
  stays at exactly two; the carry-forward row for the rev-1 C-02 is corrected
  so the false grep-based constructibility claim does not survive as a binding
  decision, and the reading guide carries the B-01 warning explicitly. The
  helper is "the exact function `computeGaps` calls", so the unit test
  exercises the production path, not a copy. Fully landed.
- ~~**C-01** (AC-21 anchored to no task)~~ → **resolved**: new T-19 (final
  validation sweep) owns AC-21 + the full-suite run; the Validation-checkpoints
  final row and the cross-cutting section both point at it; T-19 is blocked by
  every terminal task (T-07, T-10, T-11, T-14..T-18 — verified transitively
  covers the whole graph).
- ~~**C-02** (T-13 over-packed; four component-test files owned by no task)~~ →
  **resolved**: new T-18 (`Blocked by: T-13`, sibling of T-14/T-15) declares
  all four AC-10..13 suites in its Files list; T-13 keeps view + registration +
  the two deterministic CLI checks and is honestly re-scoped ("this task is
  view + registration + CLI checks only"). T-13 additionally pins that it "is
  not complete for STATUS purposes until T-18's suites pass against it" —
  good, that closes the gap a naive split would open.
- ~~**N-01**~~ → resolved (T-02's recipe is now called a "registry subset", the
  omitted `seedBoundedContexts`/`runSystemKindMigration` steps and the
  temporary permissive-System-doc window are spelled out with a do-not-assume
  warning).
- ~~**N-02**~~ → resolved (T-09's neighborhood note names the
  `key-activity-optimizer` block; verified on disk — the block sits between
  the story block and the `modules*` block exactly as described).
- ~~**N-03**~~ → resolved (T-12 now says "the client passes `attributes`
  through untyped … rendering rules live in T-13"; no vocabulary import into
  `api.ts`).

## What checks out (verified against reality)

- **Bootstrap chain** — `seedRegistryFromConstTuples` (bootstrap.ts:45),
  `seedBoundedContexts` (:56), `registerModelSchema` (:64),
  `registerStorySchema` (:75), `runSystemKindMigration` (:138) all match T-02's
  cited order and lines; `NODE_LABELS` has no `BoundedContext` row, so DD-14's
  premise (and T-02 step 1) is real.
- **Registry/actor claims** — `createNodeLabel(driver, input, actor)` usage and
  the `isNameConflict` swallow pattern verified in `register-story-labels.ts`;
  `getEdgeEndpoints` is exported at `edge-endpoints.ts:53` (T-04's DD-12 path).
- **Router / RBAC / PUT** — `req.method.toUpperCase()` at router.ts:263; story
  block ≈404–407; `key-activity-optimizer` block between story and `modules*`;
  the SECURITY-CRITICAL house comment at `rbac-permissions.ts:258–263` says
  exactly what T-08 relies on (unmapped route ⇒ RBAC skipped); `matchSegments`
  rejects on segment count first; **no `"PUT"` route exists anywhere in
  `api/src` today**, so the first-PUT framing (T-09/T-11) is accurate; the
  body-carrying DELETE precedent
  `models/:modelId/module-instances/:instanceId/edges` exists (line 272);
  `business_architect` is in `seed-rbac-roles.ts` (≈line 90–100).
- **B-01 rationale is true** — `api/src/storage/nodes.ts` throws
  `400 attribute_violation` registry-generically (header + thrower at line 84),
  so the rev-3 reading-guide note ("a kind-less System is not
  API-constructible on a booted stack") is correct, and the unit-level
  `unknown` proof is the right shape.
- **Generic-surface guard (T-10)** — `/api/v1/nodes/:label` routes gate only on
  `parseRegistryLabel` (`_helpers.ts:61`), so `POST /api/v1/nodes/Capability`
  will succeed post-registration; the invisibility assertion is the correct
  regression guard for design-review C-01's accepted risk.
- **PWA claims** — `json<T>()` + `withSignal` exist in `pwa/src/api.ts` (T-12);
  `Pill`/`DataTable` and `Loading`/`ErrorState`/`NotFoundPanel` exist;
  `design-conformance.ts --view` takes a single file path per invocation, so
  T-13's per-file (.tsx and .module.css each) instruction is right — and more
  accurate than design §4.10's "checks the co-located `.module.css`" claim;
  `useActiveModel` / `ModelTabPlaceholder` / `system-kind.ts` exports all on
  disk; `.claude/hooks/spec-completion-check.sh` exists.
- **Blueprint conformance** — `#/model/systems` → `SystemModeler` verbatim from
  the View Tree; no `route.ts`/`SURFACES` edit; explorer (`:78`) and analytics
  (`:112`) `systems` slots correctly fenced off. UX-01 (AC-10..16 across
  T-13/T-14/T-18), UX-02 (T-13 tokens + design-conformance, AC-17), UX-05
  (T-17 manual keyboard walk with input mode + observable outcome, AC-18),
  UX-06 (T-16 reload e2e, AC-19) all task-anchored. XD-01/XD-15 guarded by
  T-02/T-19 and T-01/T-05/T-12/T-15; house rules (central auth gate, zod-only,
  no tsc, `/api/v1/`) respected throughout.
- **Dependency graph** — acyclic; every `Blocks` list is the exact inverse of
  its `Blocked by` counterparts (checked all 19 tasks); the listing order
  (T-09 before T-08; T-18/T-19 appended last) is a valid topological order.
- **Verification fields** — all 19 tasks declare a concrete test path or a
  `manual:` repro with input mode + observable outcome; the AC-17/AC-20
  manual→CLI deviations remain honestly recorded in the Deviations table.

## Findings

### Blockers

None.

### Concerns

**C-01 — T-04/T-05/T-06 declare route-surface integration suites as their
verification, but the routes land three tasks later (T-09).** T-04's
verification asserts HTTP semantics ("create → 201", "GET list on the same
unknown model → 200 []", "PUT needed-by … → 404") and its fixtures are
"API-only via `POST /api/v1/models` …", yet T-04/T-05/T-06 all precede T-09
(`api/src/routes/capabilities.ts` + router dispatch) in the execution order —
at those tasks' validation checkpoints the listed suites cannot run green
because `models/:modelId/capabilities*` / `system-model/*` do not dispatch
yet. This collides with the reading guide's own rule ("after tasks that ship
behaviour, also run the listed test"). T-09's verification already leans on
these suites, so the intended reading is discoverable, but an executor
following the checkpoint table literally hits a red suite mid-run with no
stated dispensation.
*Recommendation (one-line fix, no restructuring):* add to T-04/T-05/T-06 a
deferral note — "checkpoint at this task = `bun run typecheck` (+ any
storage-level assertions runnable against the driver); the route-surface
integration suites named here first run green at T-09's checkpoint, which
cites them" — or equivalently mark the suites' first green run as T-09's
checkpoint row in the Validation checkpoints table.

### Nits

**N-01 — stale line anchor for the `systems` slot.** The model surface's
placeholder is now at `pwa/src/views/index.tsx:172`, not `:165` (the file
grew with the story-spec-core / key-activity-optimizer / cto-analytics
edits). The content anchor (`<ModelTabPlaceholder tab="Systems"
spec="ddd-system-modeling" />`) is still unique and correct, so T-13 is
executable as written; update the number so nobody "fixes" the wrong line.

**N-02 — test-file ownership convention is inconsistent after the T-18
split.** T-05 (unit test), T-07, T-10, T-14, T-15, T-16, and T-18 declare
their test files in their Files lists; T-02 (two suites), T-04 (two suites),
T-05's gap suite, T-06, T-08 (`capability-authz.test.ts`), and T-11 name
theirs only in Verification. Nothing is orphaned (every suite is named by
exactly one owning task), but rev-2 C-02 made Files-list ownership the norm —
either normalize, or add one reading-guide line stating that a suite named in
a task's Verification belongs to that task's deliverable.

**N-03 — T-18 declares 4 files, above the ≤3-file checklist guideline.**
Accepted here: they are four cohesive, test-only suites and the shape is
exactly what the rev-2 review's C-02 recommendation prescribed ("a sibling
task … declaring the four test files"). If the executor wants strict
conformance, split 2+2; not worth a revision on its own.

**N-04 — T-19's `git diff` guard is vacuous under per-task commits.** If
intermediate work is committed (the house norm), `git diff
shared/src/schema/nodes.ts shared/src/schema/edges.ts` at sweep time shows an
empty diff regardless of what was merged. The wording is inherited verbatim
from AC-21, so this is not a tasks-phase defect; a more robust deterministic
check is content-based — `git grep -n
"NEEDS_CAPABILITY\|SUPPORTED_BY\|ASSIGNED_TO_CONTEXT\|CAPABILITY_IN_MODEL"
shared/src/schema/edges.ts` and `git grep -n "Capability\|BoundedContext"
shared/src/schema/nodes.ts`, each expecting no matches. Optional; record as
executor guidance if adopted.

## Completeness / Traceability

All 22 ACs (AC-01..AC-21 + AC-06b) are task-anchored with a declared
verification artifact — the rev-2 gap (AC-21) is closed by T-19.

| AC | Task(s) | Verification artifact | Status |
|----|---------|-----------------------|--------|
| AC-01 | T-02 | `capability-labels.integration.test.ts` (fresh-registry, DD-14; teardown re-runs `applySchema`) | covered |
| AC-02 | T-02 | `capability-edges.integration.test.ts` (4 types, 2 `NEEDS_CAPABILITY` pairs, no `IN_MODEL` touch) | covered |
| AC-03 | T-04 | `capability-crud.integration.test.ts` (detached fixture = sanctioned op #1; pinned list-[]-vs-404) | covered — first green at T-09 (C-01) |
| AC-04 | T-04 | `capability-mapping.integration.test.ts` (first-PUT end-to-end, DD-16 strict arm, DD-12 forged pair) | covered — first green at T-09 (C-01) |
| AC-05 | T-07 | `capability-cascade.integration.test.ts` | covered |
| AC-06 | T-05 | `system-gap-analysis.integration.test.ts` (X/Y/Z/W, `describingStories`, DD-18 cross-model) | covered — first green at T-09 (C-01) |
| AC-06b | T-10 | `capability-model-scope.integration.test.ts` (map-then-orphan via real routes) | covered |
| AC-07 | T-05 | gap suite (all-valid-kinds) + `system-kind-bucketing.test.ts` (unit `unknown` proof — rev-2 B-01 resolved) | covered |
| AC-08 | T-06 | `context-map.integration.test.ts` (targetId, no BC mutation) | covered — first green at T-09 (C-01) |
| AC-09 | T-08 + T-10 + T-11 | `capability-authz.test.ts` (13-pair table over T-09's shared const) + model-scope + openapi suites | covered |
| AC-10 | T-13 (impl) + T-18 (test) | `system-modeler.test.tsx` | covered |
| AC-11 | T-13 + T-18 | `system-modeler-gaps.test.tsx` | covered |
| AC-12 | T-13 + T-18 | `system-modeler-context-map.test.tsx` | covered |
| AC-13 | T-13 + T-18 | `system-modeler-detail.test.tsx` (stub-driven detached indicator) | covered |
| AC-14/15/16 | T-14 | `system-modeler-states.test.tsx` | covered |
| AC-17 | T-13 | CLI `design-conformance.ts --view` (.tsx and .module.css, separate invocations) | covered |
| AC-18 | T-17 | `manual:` keyboard-only walk (input mode + observable outcome) | covered |
| AC-19 | T-16 | `pwa/playwright/system-modeler-context.spec.ts` | covered |
| AC-20 | T-13 (CLI grep) + T-15 (component) | `system-modeler-kind.test.tsx` + `git grep` | covered |
| AC-21 | T-19 | `bun run typecheck` + `git diff` guard + full-suite run | covered (see N-04) |

FR/NFR coverage matches the doc's Traceability summary (spot-checked FR-03 →
T-04 mapping tests, FR-08 → T-05 classification, FR-11 → T-08, FR-15 → T-15's
honest conditional, NFR-04 → T-06's no-mutation assertion, NFR-07 → bounded
Cypher in T-05/T-06).

**Done well:** the rev-2 B-01 fix is landed exactly as prescribed and the
false constructibility claim was scrubbed from the carry-forward table rather
than papered over; the sanctioned direct-driver budget stays at two and is
re-fenced in the reading guide; T-18's split keeps T-13 inside the half-day
ceiling while pinning the STATUS coupling; T-19 gives the 19-task run a real
terminal gate; every on-disk line-number claim except one (N-01) still holds.

## Verdict

**approve** — zero blockers. C-01 (the T-04/T-05/T-06 checkpoint-timing
deferral note) should be folded as a one-line erratum at execution start;
N-01..N-04 are optional. The task list is traceable, topologically sound,
verifiable per-task, and conformant with the blueprint's View Tree, UX-*
allowances, and XD-01/02/15 guards.
