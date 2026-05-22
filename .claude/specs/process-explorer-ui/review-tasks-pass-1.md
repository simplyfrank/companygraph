---
feature: process-explorer-ui
reviewing: tasks
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-23
pass: 1
---

# Review: process-explorer-ui tasks (Pass 1 of 2)

## Summary

`tasks.md` revision 1 is a well-structured, dependency-aware breakdown
of **25 unique task stems / 34 task rows** (T-00..T-20 with subletters
a/b/c/d) across 10 phases. It implements design rev 2 with high
fidelity: every B-/C-/N- fix from the design pass-1 review is annotated
against the task that ships it, every scaffold-vs-new file is correctly
labelled, the graph-core amendment is filed as four interlocking tasks
(T-03a..T-03d) with explicit cross-spec PR semantics, and the open-
accepted carry-forwards from the design pass-2 review are each pinned
to a specific task.

The cross-reference tables (every FR → task, every AC → task) are
complete with one **documented** carve-out (FR-26 inherited from
graph-core's `<TopBar/>` — `(inherited — no task)`). All 32 ACs
(AC-01..AC-32, including the AC-32 schema:apply idempotency added by
design rev 2) appear in at least one task. The complexity column on
each task row is honest about the heavy lifts (T-11a canvas, T-13a
bulk paste, T-18 service worker, T-19a Safari cross-browser).
Validation checkpoints fire at every phase boundary with the right bun
commands.

The review nonetheless finds **2 blockers**, **6 concerns**, and **6
nits** — none requiring a re-think of any task. Both blockers are
surface-level inheritance bugs from the design rev 2 amendment table
(§11, lines 1647–1649): the design pass-2 absorbed the
`api/src/db/schema.ts` → `api/src/neo4j/bootstrap.ts` fix for B-04 but
missed two adjacent fictional paths in the same block (`api/src/schemas.ts`
and `api/src/openapi.ts` — neither exists; the real generator file is
`api/src/routes/openapi.ts`, and there is no top-level
`schemas.ts`). Tasks faithfully inherited the fiction in T-03a. This
re-introduces exactly the class of error that B-04 fixed.

The second blocker is a one-character cross-reference error inside
T-11b's validation cell ("ships in T-19c" — it ships in T-19a).
T-19c is Lighthouse + canvas-perf, NOT Safari cross-browser. The AC →
task matrix at line 220 correctly maps AC-10 to "T-11b, T-19a", so the
matrix is right and only the prose pointer is wrong.

A third near-blocker that I downgraded to a concern: the **complexity
tally in §"Complexity tally" enumerates tasks in two buckets that the
canonical per-task column lists in only one each**. The header counts
("Simple: 8", "Moderate: 11") don't match the enumerated counts (11
and 15 respectively). The canonical column on each task row is
authoritative and internally consistent; the summary tally is just
arithmetic drift. Not a blocker because the canonical column is the
source of truth, but worth a clean-up before pass 2.

## Verdict

**revise** — 2 blockers (TB-01 fictional file paths in T-03a; TB-02
T-11b → T-19c pointer is wrong). Both are mechanical sed-and-go fixes.
6 concerns are mostly tightening; 6 nits are cosmetic. No
re-architecture needed.

## Blockers

### TB-01 — T-03a targets non-existent files `api/src/schemas.ts` and `api/src/openapi.ts`; the actual paths are `api/src/routes/openapi.ts` (and no top-level `schemas.ts` exists)

`tasks.md:75` (T-03a Files cell):

> `api/src/schemas.ts`, `api/src/routes/query.ts`, `api/src/openapi.ts`

Verified against the actual scaffold (`ls api/src/`):

```
env.ts, errors.ts, ids.ts, logging.ts, neo4j/, ontology/, router.ts,
routes/, server.ts, storage/, validate.ts
```

- **No `api/src/schemas.ts`.** Schemas live with their owning modules:
  `nodeCreateSchema`, `nodeUpdateSchema`, `nodeReadSchema` are in
  `@companygraph/shared/schema/nodes`; `edgeCreateSchema`,
  `edgeReadSchema` in `@companygraph/shared/schema/edges`;
  `importPayloadSchema`, `importResponseSchema` in
  `@companygraph/shared/types`. There is no aggregator at the api
  level.
- **No `api/src/openapi.ts`.** The OpenAPI generator file lives at
  `api/src/routes/openapi.ts` (verified — file exists; the openapi
  registry and the `/api/v1/openapi.json` handler are both inside
  this file).

The `tasks.md` files-per-task discipline table at line 254 also
duplicates the fictional paths:

> | T-03a | 3 | schemas.ts, query.ts, openapi.ts |

This is the **exact same class of error** as design pass-1 B-04 (where
`api/src/db/schema.ts` was claimed but the real path was
`api/src/neo4j/bootstrap.ts`). The design pass-2 review verified that
B-04 was absorbed for the index DDL location, but did not re-check the
adjacent amendment-table rows for the schema / OpenAPI paths.
Tasks.md mechanically carried forward the fiction.

**Why this is a blocker**: executing T-03a as written will fail at
file-creation time (the amendment ships against a non-existent module
boundary). A reviewer of the cross-spec PR will see the touchpoints
listed in `.claude/specs/process-explorer-ui/design.md §11` and
`tasks.md §11`, fail to locate them in the codebase, and either
manually re-derive the right paths (effort tax) or push back.

**Fix**:

1. T-03a Files cell → either inline the `searchSchema` zod into
   `api/src/routes/query.ts` (matches how `parseId` lives inside
   `api/src/routes/_helpers.ts` — the project convention), OR co-locate
   in `api/src/routes/_search-schema.ts`. Drop the reference to
   `api/src/schemas.ts`.
2. T-03a Files cell → change `api/src/openapi.ts` to
   `api/src/routes/openapi.ts`.
3. Tasks.md line 254 (files-per-task table) → mirror the corrected
   paths. Files-count stays at ≤ 3 either way.
4. **Surface the same path correction to design.md §11 (lines
   1647–1649)** as a retro-finding — see "Design retro-findings"
   below. The design gate is hard-capped (pass 2 used) so it can't be
   formally re-litigated; but the spec owner should sed the design
   file as part of the tasks-pass-2 commit so the two specs stay in
   sync.

### TB-02 — T-11b's validation says the Safari export regression test "ships in T-19c"; the test actually ships in T-19a

`tasks.md:112` (T-11b validation):

> `canvas-export.test.tsx` (blob shape + filename); the
> Safari-specific regression test ships in **T-19c**

But T-19a (line 142) is the task that lists
`canvas-export.safari.spec.ts`:

> `pwa/playwright/search.spec.ts`,
> `pwa/playwright/canvas-gestures.ipad.spec.ts`,
> `pwa/playwright/canvas-export.safari.spec.ts`

T-19c (line 144) ships `lighthouse.spec.ts` + `canvas-perf.spec.ts` —
NO Safari spec.

The AC → task matrix at line 220 correctly maps AC-10 to
"T-11b, T-19a", so the matrix has the right pointer. The Open-items
section at line 296 also has the **correct** pointer:

> `html-to-image` Safari fallback — if T-11b's PNG fails the Safari
> regression test in T-19a

— contradicting T-11b's body.

**Why this is a blocker**: AC-10 coverage is split across two tasks
(unit test in T-11b, Safari pixel-diff in T-19a). A cross-spec PR
reviewer following T-11b's pointer to T-19c will find no Safari test
and either (a) believe AC-10 is under-tested or (b) lose the trail.
Verification fields exist to be unambiguous; pointing at the wrong
task defeats the purpose.

**Fix**: sed `T-19c` → `T-19a` in T-11b's validation cell (line 112).
Single character change. After fix, verify T-19a's dependency on
T-11a (canvas exists) is sufficient — it is (line 142 already lists
T-11a, T-10a).

## Concerns

### TC-01 — Complexity tally header counts don't match the enumerated lists; the canonical per-task column is authoritative

Lines 169–172:

```
- Trivial: 3 (T-00, T-01, T-03d)
- Simple: 8 (T-02, T-03a, T-03b, T-03c, T-04a, T-04b, T-07, T-10c, T-11b, T-14, T-16a)
- Moderate: 11 (T-05, T-06, T-08, T-09a, T-09b, T-09c, T-10a, T-10b, T-12, T-15, T-16b, T-17, T-19b, T-19c, T-20)
- Complex: 4 (T-11a canvas, T-13a bulk-paste, T-18 service worker, T-19a Safari cross-browser)
```

- "Simple: 8" lists **11 task IDs**.
- "Moderate: 11" lists **15 task IDs**.
- Footnote at line 174: "(Sum ≠ 24 because some categories overlap;
  the canonical list is the single 'complexity' column on each task
  row above.)" — Complexity categories are mutually exclusive per
  task; they cannot overlap. The excuse doesn't hold.

Spot-check against the canonical per-task column:
- T-14 row says "simple" ✓ (matches enum)
- T-19c row says "moderate" ✓ (matches enum)
- T-13b row says "moderate" — but T-13b is **missing** from the
  Moderate enum (so the enum is also incomplete).

The canonical column is consistent; the summary prose has accumulated
arithmetic drift through revision.

**Recount from the canonical per-task column**:
- Trivial: 3 (T-00, T-01, T-03d) ✓
- Simple: 12 (T-02, T-03a, T-03b, T-03c, T-04a, T-04b, T-07, T-09c,
  T-10c, T-11b, T-14, T-16a)
- Moderate: 15 (T-05, T-06, T-08, T-09a, T-09b, T-10a, T-10b, T-12,
  T-13b, T-15, T-16b, T-17, T-19b, T-19c, T-20)
- Complex: 4 (T-11a, T-13a, T-18, T-19a) ✓
- Sum: 3+12+15+4 = **34 task rows** from **25 distinct task stems**.

Also the Summary line 16 says "broken into **24 tasks**" — this should
read "25 tasks (34 rows once sub-lettered tasks are counted per
row)".

**Recommended fix**: rewrite the tally to match the canonical
per-task column. Drop the "categories overlap" footnote.

### TC-02 — Critical-path diagram (lines 152–162) mis-orders task chains as if they were dependencies

The ASCII diagram claims:

```
T-11a → T-11b
              └── T-12 → T-13a → T-13b
                            └── T-14 → T-15
                                       └── T-16a → T-16b
```

But the `Blocked by` columns in the actual task table show:
- T-12 depends on **T-05, T-08** (NOT T-11b)
- T-14 depends on **T-05, T-09a** (NOT T-13b)
- T-16a depends on **T-05, T-09a** (NOT T-15)

The diagram is a **suggested single-implementer execution sequence**,
not the dependency DAG. As written it implies the SME write paths
(T-12 onward) are gated on the canvas (T-11a/b) — they are NOT. With
two implementers, T-11* and T-12* can run in parallel.

Lines 164–165 hint at this ("Some tasks can run in parallel; with two
implementers the path collapses to ~6 working days") but do not
correct the diagram.

**Recommended fix**: add a one-line caption: "This is the
single-implementer execution order, NOT the dependency DAG.
Concurrency is governed by the `Blocked by` column in each task row."

### TC-03 — T-20 depends on T-19a alone; should depend on T-17 + (T-19c or none of T-19*)

`tasks.md:145` (T-20 dependencies): `T-17, T-19a`.

T-20's three test files (`no-auth-grep.test.ts`,
`touch-targets.test.tsx`, `deterministic-hydration.test.tsx`) are
**vitest/jsdom unit tests** — they don't depend on T-19a's playwright
specs at all. The dependency on T-17 (shell + side panel mounted) is
correct because touch-targets / deterministic hydration both depend on
the full mounted app. But the T-19a edge is spurious — those are
playwright specs, not vitest specs.

If the intent is "T-20 runs last for CI ordering", say so explicitly
(use T-19c which is genuinely last in the playwright phase, not T-19a
which is the first of the three) OR drop the playwright edge entirely.

**Recommended fix**: drop T-19a from T-20's deps; the substantive
dependency is T-17 (App shell wired). If a CI-order constraint is
needed for the bundle-check assertion at the end, depend on T-19c
instead.

### TC-04 — T-19c "moderate" complexity may be under-rated relative to T-19a "complex"

T-19c (line 144) ships Lighthouse perf assertion (`audits["interactive"].numericValue
< 2000`) and a Performance-API-based canvas perf trace (median frame
time ≤ 16 ms over 5 s). The Lighthouse run is brittle CI plumbing
(needs preview server up, headless Chrome, sometimes locale flake-prone)
and the canvas perf test requires synthetic gesture playback against a
200-node fixture. Marking this "moderate" alongside T-17 (side-panel
CSS) under-states the surface.

T-19a is correctly rated "complex" for the same class of work
(Playwright cross-browser + pixel-diff). T-19c probably belongs there
too.

**Recommended fix**: bump T-19c to `complex`, OR (lighter touch)
document why T-19c is moderate ("lighthouse spec ships as a
copy-pasta from an existing template, so the novel surface is just the
canvas-perf spec"). Right now there is no rationale.

### TC-05 — FR-26 "(inherited — no task)" has no verification trace; if T-17 accidentally breaks TopBar stats counts, no task catches it

`tasks.md:206`:

> | FR-26 | (inherited — no task) |

FR-26 is "Stats counts in shell — XC-1.2: shell renders node + edge
counts from `/api/v1/stats` as a ground-truth indicator above the
nav." The graph-core scaffold ships TopBar with node + edge counts
(verified in `pwa/src/App.tsx:106–111` — the scaffold has a TopBar that
renders stats). Design §9 line 1637 confirms "(inherited from
graph-core `<TopBar/>` — no change needed)".

This is OK as long as the inheritance holds, but T-17 explicitly
"Lift[s] the existing inline polling out of `App.tsx`" — and the
polling lift could plausibly break the stats-count display if the
TopBar reads stats from a polling-driven local state. No task asserts
that the TopBar still shows stats counts after T-17.

**Recommended fix**: add a one-line manual repro to T-17's validation
cell: "manual on macOS Chrome: after lifting the polling, navigate
through `#/explorer/domains` → `#/explorer/journey` → `#/sme/add` and
verify TopBar shows non-zero stats counts on each route". This catches
FR-26 regression without inventing a new task.

### TC-06 — T-13b integration-test path divergence with design.md (`pwa/__tests__/` vs `pwa/src/__tests__/integration/`)

`tasks.md:120` T-13b Files: `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts`.

`design.md:1668` AC-13 row: `pwa/__tests__/bulk-paste-rollback.integration.test.ts`
(notice the missing `src/`).

`design.md:1756` file list: `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts`.

So the **design itself is internally inconsistent** (top-of-file vs
file-list). Tasks.md picked the `pwa/src/__tests__/integration/`
form, which matches the `pwa/src/__tests__/*.test.tsx` convention used
everywhere else in this spec.

**Recommended fix**: tasks.md is consistent internally; this is a
design retro-finding. Surface to spec owner for a future design touch.
No tasks-phase change required.

## Nits

### TN-01 — T-17 lists 2 files but the description implies a CSS file (`@container` queries) that isn't in the file list

T-17 (line 135) description: "Add CSS container-queries for
side-panel responsive layout (desktop ≥ 1024 → right column; tablet ≥
768 → bottom sheet; phone → full-screen modal)". Files: "SidePanel.tsx,
App.tsx" (2). CSS container-queries would conventionally live in
`SidePanel.module.css` (per the project's `pwa/src/views/explorer/Domains.module.css`
etc. existing files). Either add the CSS file to the file list (still
≤ 3) or clarify that the styles are inlined in `SidePanel.tsx` via a
styled object.

### TN-02 — T-12 and T-13a co-edit `Add.tsx`; flag explicit sequencing for parallel implementers

The author addresses this directly at line 288–291: "Note: the AddTsx
top-half / bottom-half split across T-12 + T-13a is allowed because
each task touches different sections of a single file (distinct
components inside the file)." Fine in spirit, but a parallel
implementer running T-12 and T-13a concurrently in separate worktrees
will hit a merge conflict on `Add.tsx`. The critical-path diagram does
sequence them (T-12 → T-13a), but a one-line note like "T-12 and
T-13a are sequential, not parallel (they share `Add.tsx`)" would make
it explicit for the dependency-graph reader.

### TN-03 — `@dagrejs/dagre` is pinned in T-01 but the layout-tuning carry-forward (design pass-2 #3) isn't called out as T-11a-owned

T-01 description correctly names `@dagrejs/dagre` (NOT deprecated
`dagre`). But the design pass-2 carry-forward #3 (dagre `nodesep` /
`ranksep` tuning against the 200-node fixture) is not surfaced as a
T-11a sub-item. T-11a description mentions react-flow + dagre
"layout" generically but doesn't promise the empirical tuning.

**Recommended fix**: add to T-11a description: "Includes dagre
`nodesep` / `ranksep` empirical tuning against the 200-node fixture
(design §13 item 3)".

### TN-04 — T-19c validation criteria don't specify the Lighthouse invocation

T-19c says: "`audits["interactive"].numericValue < 2000`; canvas
median frame time ≤ 16 ms". Requirements AC-23 specifies the exact
Lighthouse invocation: `lighthouse http://127.0.0.1:5173/
--form-factor=desktop --throttling.cpuSlowdownMultiplier=1
--only-categories=performance --output=json`. T-19c should at minimum
reference AC-23 verbatim or re-quote the flags so the implementer
doesn't drift to different throttling.

### TN-05 — Phase 2 header ("ships in same PR or first") leaves a PR-ordering decision open

`tasks.md:71`: "Phase 2 — Graph-core amendment (T-31, ships in same PR
or first)". The amendment is small (5 touch points per design §5.2
line 1334) and is auditable as a single commit. Suggest pinning to
"same PR" by default, with "split into two PRs" as a documented
fallback when CI for graph-core's repo is queued. Either is fine, but
tasks-phase should not be the place where this is still open.

### TN-06 — T-00 is documentation-only; FR/AC column carries "B-03 fix" (not an FR or AC literal)

T-00 (line 62) carries `FR/AC: B-03 fix`. B-03 is a design pass-1
review code, not an FR or AC. A spec-completion hook that greps the
FR/AC column for `FR-` / `AC-` literals may flag T-00 as having no
FR/AC coverage. The work is genuinely complete (requirements rev-3
already shipped; verified by reading `requirements.md` — AC-15 line
195 says `#/sme/review`, AC-18 line 198 says `#/sme/quarterly`,
AC-25 line 205 says `#/sme/add` — all rename traces present). The
spec-design-pass-2 review's B-03 carry-forward concern (about
AC-15 + AC-18 prose-bleed) is **already resolved** in the requirements
file as it stands today. T-00 correctly observes this.

**Recommended fix**: change the FR/AC cell from `B-03 fix` to
e.g. `AC-15, AC-18, AC-25 (route rename — already shipped 2026-05-23)`.

## Cross-spec amendment scope verification (T-03a..d)

Per design §5.2 line 1334, the amendment scope is:

1. One new endpoint — `GET /api/v1/query/search?label&q&limit`
2. Six fulltext indexes added inside `applySchema()` loop
3. One new zod schema (`searchSchema`)
4. One new OpenAPI route registration
5. One new integration test

Tasks.md mechanically maps:

| Scope item | Task | File(s) claimed | Verdict |
|------------|------|-----------------|---------|
| 1. Endpoint | T-03a | `api/src/routes/query.ts` | correct |
| 2. Indexes | T-03b | `api/src/neo4j/bootstrap.ts` | correct |
| 3. zod schema | T-03a (folded) | `api/src/schemas.ts` (fictional) | BROKEN — TB-01 |
| 4. OpenAPI registration | T-03a (folded) | `api/src/openapi.ts` (fictional) | BROKEN — TB-01 |
| 5. Integration test | T-03c | `api/__tests__/search-helper.test.ts` | correct |

T-03d adds T-31 to `graph-core/tasks.md` + bumps
`graph-core/STATUS.md`. Verified — `graph-core/STATUS.md` is at
`execution:complete (T-01..T-29 + T-30 smoke verified 2026-05-23)`, so
appending T-31 as a post-completion amendment is the correct mechanism
(B-02 of design pass 1 was that the spec was reading the wrong status;
design rev 2 fixed it; tasks rev 1 honours the fix). T-03d is
correctly scoped.

## FR + AC coverage sample-verify (5 entries)

| FR/AC | Tasks claim | Verified delivers? |
|-------|-------------|-------------------|
| AC-15 (RMW flag-for-review preserves `_verification`) | T-14 | **yes** — T-14 validation: "(a) PATCH body merges with prior `_verification`, (b) post-write read shows both keys". Matches design §10 line 1670 RMW assertion. B-01 fix faithfully carried. |
| AC-19 (bulk sign-off RMW preserves `_review`) | T-16b | **yes** — T-16b validation: "3 journeys with prior `_review`; post-sign-off all carry BOTH `_review` AND `_verification`". Matches design §10 line 1674. |
| AC-21 (SSE→POLL-MODE fallback) | T-06 | **yes** — T-06 validation enumerates 4 paths: happy SSE, 3-strike fallback, 404 silent fall-through, 5xx ErrorState. Covers design §4.4 state machine + §4.3 SchemaBootstrap branch (C-02 + C-03). |
| AC-13 (bulk-paste rollback) | T-13a + T-13b | **yes** — T-13a covers happy path; T-13b validation: "forces `/import` failure; asserts pre-delete chain restored". Matches design §4.11 line 932 snapshot + rollback path. |
| AC-32 (schema:apply idempotency after fulltext-index amendment) | T-03b + T-03c | **yes** — T-03b validation: "second run is idempotent (`SHOW FULLTEXT INDEXES` count stays at 6 + 0 driver warnings)". T-03c repeats "AC-32 sub-assertion". Matches design §10 line 1687. |

**Verdict on coverage**: all 5 sampled entries faithfully deliver the
design pin. The RMW post-write read assertion (B-01 fix) is correctly
threaded into T-14 / T-16a / T-16b validation columns.

## Dependency graph verification

- **T-11a depends on T-09a**: line 111 — "T-01, T-09a". Correct —
  canvas mounts inside the Journey detail view that T-09a builds.
- **T-15 depends on T-14**: line 122 — "T-09c, T-14". Correct —
  review queue uses `FlagForReviewButton` (T-14) and the named cypher
  `reviewQueueForDomain` (T-09c).
- **T-19a depends on T-11a**: line 142 — "T-11a, T-10a". Correct —
  playwright canvas gestures + Safari export specs both need the
  canvas (T-11a) and the search palette (T-10a).
- **No cycles**: traced the full graph from T-01 down to T-20. No
  cycles detected.

One subtle ordering note: T-12 (new-journey form) does not depend on
T-10c (typeahead) even though the new-journey form has a parent-domain
picker. Per design §4.11 line 819 the picker is a `<select>` dropdown,
not a typeahead — so T-12's deps "T-05, T-08" are sufficient. Not a
defect.

## Files-per-task discipline check

All 25 task stems are ≤ 3 files. Spot-checks confirmed. The
T-12/T-13a `Add.tsx` co-edit footnote at line 287 is the right
disclosure — single physical file, two task touchpoints, distinct
sections — and the 3-file cap survives intact.

One minor: T-03a row at line 254 says "3 | schemas.ts, query.ts,
openapi.ts" — inherits TB-01. Once TB-01 resolves to (a) inlined zod
in `routes/query.ts` plus (b) registration in `routes/openapi.ts`,
the count stays at 2 actual files; if a co-located helper file is
chosen instead, it stays at 3. No file-cap breach in either
resolution.

## Validation column quality check

Every task carries a concrete `Validation` artifact (test path or
`manual: <repro>`). Spot-checks:

- T-02 → "`bun run -C pwa test` runs (empty suite OK); `bun run -C pwa
  build && bun run -C pwa bundle-check` prints per-chunk size table".
  Concrete.
- T-06 → 4 specific test cases enumerated. Concrete.
- T-11a → `canvas-render.test.tsx` + "manual perf trace on baseline
  machine → median frame time ≤ 16 ms". **Borderline** — observable
  outcome is concrete, but input mode (which fixture? what gesture?
  duration?) is implicit. AC-24 has the full incantation; T-11a should
  cross-reference it.
- T-17 → "Visual: open + close panel from each route on each viewport.
  AC-26: `touch-targets.test.tsx` asserts ≥ 44×44 px hit targets".
  Mixed — the manual is concrete enough; the AC-26 reference smuggles
  T-20's coverage into T-17's validation. See TN-01 + TC-05.
- T-20 → "All three unit tests green; `bundle-check` CI step fails on
  > 300 KB gz main bundle". Concrete.

Overall, **no "tests pass" hand-waves**. The completion-hook gate
will accept all 25 tasks after the borderline T-11a and T-17
validation cells are tightened (recommended in TC-05 + TN-04).

## Design retro-findings (NOT tasks blockers — surface to design author)

The tasks-phase author cannot re-litigate the design (its gate is
hard-capped at pass 2). Surface these for a future design touch:

1. **`api/src/schemas.ts` and `api/src/openapi.ts` in design.md §11
   lines 1647–1649 are fictional paths.** The design pass-2 absorbed
   `api/src/db/schema.ts` → `api/src/neo4j/bootstrap.ts` (B-04 fix)
   but missed these two adjacent fictions in the same amendment-table
   block. Tasks.md mechanically inherited the error. **Surface to
   spec owner: sed-pass design.md §11 lines 1647 and 1649 to
   `api/src/routes/query.ts` (zod inline) or
   `api/src/routes/_search-schema.ts` (co-located helper) and
   `api/src/routes/openapi.ts` respectively.**
2. **`pwa/__tests__/bulk-paste-rollback.integration.test.ts` (design
   line 1668) vs `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts`
   (design line 1756)** — design has internal path inconsistency.
   Tasks picked the latter. Tooling that greps for the literal path
   will miss one or the other. **Surface to spec owner: align the two
   design.md references on one form (recommend `pwa/src/__tests__/integration/`
   to match the rest of the spec).**

## Open-accepted carried for tasks pass 2

If a pass 2 happens, the author should:

1. **TB-01**: fix the T-03a Files cell — drop fictional
   `api/src/schemas.ts` and `api/src/openapi.ts`; either inline the
   zod schema into `routes/query.ts` or co-locate in
   `routes/_search-schema.ts`; route the OpenAPI registration through
   the existing `routes/openapi.ts`. Update the files-per-task table
   row at line 254 to match.
2. **TB-02**: sed `T-19c` → `T-19a` in T-11b's validation cell (line
   112).
3. **TC-01**: rewrite the complexity tally to match the canonical
   per-task column. Drop the "categories overlap" footnote. Update the
   Summary count from "24 tasks" to "25 tasks / 34 rows".
4. **TC-02**: add a caption clarifying that the critical-path diagram
   is single-implementer execution order, not the dependency DAG.
5. **TC-03**: drop T-19a from T-20's deps (or replace with T-19c).
6. **TC-04**: bump T-19c to `complex`, OR add a rationale for
   keeping `moderate`.
7. **TC-05**: add an FR-26 verification trace to T-17 (one-line
   manual repro).
8. **TN-01..TN-06**: cosmetic — pick up if time permits.
9. **Design retro-findings**: not blocking tasks; surface to spec
   owner for a future design touch.

## Strengths

1. **Faithfulness to design rev 2 is high.** All 4 design-pass-1
   blocker fixes are visible in tasks: B-01 RMW pattern is wired into
   T-14 / T-16a / T-16b validation columns with explicit post-write
   read assertions; B-02 graph-core amendment is correctly filed as
   post-completion T-31 (not a fictional deferred backlog); B-04 file
   path `api/src/neo4j/bootstrap.ts` is honoured in T-03b; B-03 route
   renames are propagated through T-12/T-15/T-16b. (TB-01 is the
   exception: design rev 2 absorbed `db/schema.ts` but missed two
   adjacent fictions, and tasks inherited them.)
2. **All 32 ACs + all 28 FRs have at least one task** (FR-26 is
   documented as inherited from graph-core; see TC-05 for the
   verification-trace concern). The cross-reference tables at lines
   179–243 are accurate against the canonical task definitions.
3. **All three design-pass-2 carry-forwards are explicitly addressed**:
   T-08 maps Activities/Roles/Locations as virtual tabs; T-11a takes
   the JourneyGraph.tsx scaffold disposition; T-00 carries the
   requirements rev-3 traceability (and I independently verified the
   rev-3 prose-bleed concern is already resolved in `requirements.md`).
4. **Every task has a concrete Validation column** (no "tests pass"
   hand-waves). The completion-hook gate will accept all 25 tasks
   after the borderline T-11a + T-17 cells are tightened.
5. **3-file rule honoured for every task**; the `Add.tsx` top-half /
   bottom-half split across T-12 / T-13a is honest and disclosed.
6. **Dependency graph is acyclic** and the critical path matches the
   design's §14 phase ordering. Parallel opportunities (T-09a/b/c,
   T-10b/c, T-19a/b/c) are correctly noted.
7. **Cross-spec amendment (T-03a..T-03d) is decomposed correctly**.
   T-03a (endpoint + schema + OpenAPI), T-03b (DDL), T-03c (test +
   AC-32 sub-assertion), T-03d (cross-spec wiki entries in
   `graph-core/tasks.md` + `STATUS.md`) match the design §5.2
   amendment scope. The PR gating ("same PR or first") is documented;
   only quibble is in TN-05.
8. **Phase boundaries + validation cadence** (lines 44–57) are
   exemplary. The four bun commands at each phase boundary make the
   "did this break the build" question single-line answerable.
9. **C-05 bulk-paste rollback is given its own integration test
   (T-13b)**, not folded into T-13a's unit test. Rollback semantics
   are integration-shaped; the split is the right call.

## Finding counts

- **Blockers: 2** (TB-01 fictional file paths in T-03a; TB-02 T-11b →
  T-19c pointer is wrong)
- **Concerns: 6** (TC-01 complexity-tally math + total-task-count;
  TC-02 critical-path-vs-DAG caption; TC-03 T-20 deps; TC-04 T-19c
  complexity; TC-05 FR-26 verification trace; TC-06 bulk-paste integration
  path divergence with design.md)
- **Nits: 6** (TN-01 T-17 CSS file missing; TN-02 T-12/T-13a
  sequencing explicit; TN-03 dagre tuning carry-forward not surfaced
  in T-11a; TN-04 T-19c Lighthouse invocation flags; TN-05 PR-ordering
  open; TN-06 T-00 FR/AC literal)
- **Design retro-findings: 2** (api/src/schemas.ts + api/src/openapi.ts
  fictional in design §11; bulk-paste integration test path divergence
  inside design.md)

## Pass tracking

- This is **pass 1 of 2** for the tasks phase. One more tasks review
  is permitted before the hard cap closes.
- Pass-2 author should focus on the 2 blockers (TB-01 + TB-02) and the
  6 concerns. TB-01 is mechanical (sed-and-go on T-03a's Files cell
  and the matching files-per-task table row); TB-02 is one character.
  TC-01 (complexity tally) takes ~10 minutes to recount.
- The design retro-findings (fictional paths in design.md §11) are
  flagged but cannot be re-litigated in the tasks phase — surface to
  the spec owner for a side-pass on design.md.
