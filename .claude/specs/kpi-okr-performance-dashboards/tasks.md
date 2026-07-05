---
feature: "kpi-okr-performance-dashboards"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, round-4 View Tree)"
status: "revised"
revision: 5
reviewing_requirements_revision: 3
reviewing_design_revision: 3
addresses_review: "review-tasks.md (2026-07-05 new cycle, pass 1 on tidied rev 4, verdict revise: B-01, C-01, C-02, N-01, N-02, N-03 — all addressed in rev 5). Prior cycles' findings remain resolved as recorded in the Revision 2/3/4 history sections."
post_approval_tidy: "2026-07-05 — review-tasks.md pass-2 (approve, 0 blockers) residuals applied docs-only: C-01 EOF residue stripped, N-01 Blocks-edge symmetry (T-01 += T-09,T-11; T-05 += T-13), N-02 scoped-run env caveat in the reading guide; N-03 recorded in STATUS.md verification notes. No task/step/AC/verification change; revision unchanged."
addresses: "blueprint FINAL ARBITRATION 2026-07-04 (XD-02 amended), adopted by requirements rev 3 DEC-03 + design rev 3 §4.2/§8 — T-03 Read 2 and T-07 fixtures repointed Postgres kpi_measurements → Neo4j :KPIMeasurement (rev 3); rev 4 repairs the query-count verification mechanics and test invocations per the rev-3 cycle review"
size: "large"
total_tasks: 19
---

# Tasks: kpi-okr-performance-dashboards

## Revision 5 — new-cycle review fixes (2026-07-05 cycle, pass 1)

A fresh review cycle (`review-tasks.md`, 2026-07-05, pass 1 on the tidied
revision 4, verdict **revise**) found that the repo moved underneath T-19
after the prior approve: `story-spec-core` T-18 appended three test files
to the CI `unit` job's PWA `vitest run` enumeration, so T-19's quoted
two-file "current line" and four-file "target line" are both stale — and
pasting the target literal in-place would silently delete another spec's
CI-gated files. One blocker, two concerns, three nits; all six addressed
below, tagged `Resolves: <id> (2026-07-05 cycle)` inline. Task-text-only
changes: no task added, removed, or renumbered; no AC→task mapping,
complexity, dependency edge, or design change.

| Finding | Change |
|---------|--------|
| **B-01 (blocker)** | T-19 is restated as an **append-only** edit: append the two owned files to the end of the `unit` job's PWA `vitest run` enumeration, *whatever files that line carries at execution time*; never remove, replace, or reorder an existing entry — the enumeration is a co-owned line and this spec owns only its two entries (FILE-OWNERSHIP). The stale full-line literals (two-file "current", four-file "target") are deleted, and the `ci.yml:23` line-number cite is replaced by the step's stable anchor (the `working-directory: pwa` `vitest run` step in the `unit` job). T-18's CI-gate check and the pinned-flags T-19 row gain the same never-remove clause ("both owned files present **in addition to** the pre-existing entries"). The Revision 2 history table's B-01 row is left as written (it records what was true then) but tagged "(enumeration has since grown; T-19 as amended governs)". |
| **C-01** | Execution precondition pinned (reading guide, "Execution preconditions" bullet): requirements rev 3 still carries `status: revised`; the orchestrator re-stamps it to `approved` (recorded in STATUS.md) **before T-01 begins**. Per the review this is a stamp gap, not a content gap — the rev-3 repoint was transitively reviewed via the design/tasks rev-3 cycles — so no content re-review is run; but execution does not start against a formally unapproved upstream. |
| **C-02** | T-18's AC-13 ownership check was unevaluable in the current dirty working tree (a bare `git diff --name-only` is dominated by unrelated in-flight churn). The check is now **baseline-pinned**: the execution baseline commit is recorded in STATUS.md before T-01 (same preconditions bullet), and T-18 evaluates **this spec's commits only** via `git log --name-only <baseline>..HEAD` (or `git diff <baseline>..HEAD` on a clean spec-only branch). |
| **N-01** | T-14's `route.ts:76` cite dropped in favor of the stable anchor ("the last row of the exec `tabs` array"); the B-01 fix already drops the `ci.yml:23` cite. Cites the review re-verified as still-exact (`driver.ts:36`, `App.tsx:97`, `rbac-permissions.ts:32`) are retained. |
| **N-02** | T-09's two-read count leg now carries the edge-case pin: the "exactly two reads" shape is asserted on fixtures with ≥ 1 directive (this task's fixtures always seed directives); an empty Read A may legitimately short-circuit Read B — mirroring T-03's empty-id-set rule — and is not a budget violation. |
| **N-03** | Declined (optional nit): the revision-history preambles are retained un-collapsed. They are accurate, and the inline `Resolves:` tags throughout the task bodies anchor into them — collapsing to one-liners would orphan those references for no execution benefit. STATUS.md already carries the cycle history for readers who want the summary. |

## Post-approval tidy (2026-07-05, under the pass-2 approve verdict)

`review-tasks.md` (rev-3 cycle, pass 2 of 2) returned **approve — zero
blockers** on revision 4, with one cosmetic defect and three nits directed
to be addressed during execution with no further review pass (the 2-pass
cap is reached). Applied here as a docs-only tidy — no task added,
removed, or renumbered; no step, file set, AC mapping, complexity, or
verification changed; revision stays 4:

- **C-01 (cosmetic)** — the two stray tool-markup lines (`</content>` /
  `</invoke>`) at end of file are deleted.
- **N-01** — `Blocks` edges made symmetric with their `Blocked by`
  counterparts: T-01 now also lists T-09 and T-11; T-05 now also lists
  T-13. No ordering change (top-to-bottom rule unaffected).
- **N-02** — the reading guide's scoped-integration-run bullet now
  carries the env caveat: `cd api && bun test __tests__/<file>` loads env
  from `api/` (needs `api/.env` or exported `NEO4J_*`), unlike
  `test-integration.sh`, which sources the root `.env`.
- **N-03** — recorded in STATUS.md's verification notes (not here):
  AC-14's literal "asserting no `pg` `query` call" clause is discharged
  by the strictly stronger static no-import assertion
  (`api/__tests__/performance-no-postgres-import.test.ts` — no import →
  no call possible); the `pg` spy remains optional best-effort.
  Requirements is at its review cap, so the AC text is not edited; the
  Phase C consolidated report reconciles the AC's artifact column.

## Revision 4 — task-review fixes (rev-3 cycle, pass 1)

The rev-3 cycle review (`review-tasks.md`, pass 1 on revision 3, verdict
**revise**) found one blocker, two concerns, three nits. All six are
addressed below; inline changes are tagged `Resolves: <id> (rev-3)` to
keep them distinct from the rev-2-cycle finding ids that remain in the
Revision 2/3 history sections.

| Finding | Change |
|---------|--------|
| **B-01 (blocker)** | The T-07/T-09 query-count spy was **cross-process-vacuous**: every `api/__tests__/*.integration.test.ts` reaches the API out-of-process over HTTP (`127.0.0.1:8787`; CI boots the server as a separate background process), so a spy on the **test process's** `getDriver()` singleton (`api/src/neo4j/driver.ts`, module-level `cachedDriver`) can never observe the **server process's** sessions — the AC-14 "≤ 2 round trips" and T-09 "exactly two reads" assertions would observe 0 and pass while proving nothing, and the "`kpi-okr-governance` query-count precedent" they cited **does not exist in the repo** (no integration test there installs a spy or imports a handler in-process). Fix (test mechanics only; the DD-03/§4.2/§4.5 budget contracts are unchanged): T-07 and T-09 now split into a **behavior leg** (unchanged — HTTP end-to-end) and a **query-count leg** that imports the handler and invokes it **in the test process**, where the module-singleton `getDriver()` is genuinely shared and the wrap-the-`session`-factory spy counts real sessions (installed after fixture seeding / asserted as a delta; restored in `afterEach`; `_resetDriver()` at `driver.ts:36` available). The **zero-Postgres** proof is no longer a `pg` spy (Bun ESM namespace exports such as `client.ts:20 export async function query` are read-only bindings — a namespace `spyOn` is brittle): a new **static import assertion** unit test, `api/__tests__/performance-no-postgres-import.test.ts` (T-07, modeled on the as-built `api/__tests__/analytics-no-write-imports.test.ts` pattern), pins that `api/src/routes/performance.ts` never imports `storage/postgres` — design §7 already states that contract. Design §8's spy wording shares the flaw; it is **flagged to the Phase C consolidated report** (pinned flag below), not a design reopen — design is at its review cap and the fix stays inside its stated budgets. |
| **C-01** | T-16's `<main>`-landmark assertion had no workable mount strategy — a jsdom test that mounts `PerformanceDashboard` directly (the sibling exec-view pattern) renders no App shell, so no `<main>` exists to find. Decision pinned in the task body (option (b) of the review's two): **the landmark assertion is dropped from the jsdom file**; the landmark check moves to T-17's AC-11 manual Safari leg (Web Inspector). Mounting the full `App` for one assertion (option (a)) was rejected — it drags the whole shell's fetch surface into this spec's test scope. |
| **C-02** | "`bun test:integration` scoped to `<file>`" was not a real invocation — `scripts/test-integration.sh` is a fixed `exec bun test --test-name-pattern '^integration:' … __tests__ src` and accepts no file argument. Every scoped verification (T-03, T-04, T-05, T-07..T-10, T-13) now states the real scoped command — `cd api && bun test __tests__/<file>` with the stack up via `bun run dev` — and names the full `bun test:integration` as the merge gate. |
| **N-01** | T-14's Files header undercounted its own recorded waiver (said 3, waived 4). The header now enumerates all four files. |
| **N-02** | The `Blocks: T-15` edges on T-07, T-08, T-09, T-10, and T-13 are dropped — T-15 consumes nothing from them; its `Blocked by: T-14` is the true dependency, and the two sides of the graph now agree. Ordering is still enforced by the top-to-bottom rule. |
| **N-03** | The self-declared review-exemption language ("narrow repoint under the pass-2 approve verdict … cap reached, no third review pass") is removed from the frontmatter and the Revision 3 preamble — review scheduling is the orchestrator's call, and the rev-3 cycle review governs. Factual revision history is retained. |

**File-Changes addition (rev 4, from B-01 rev-3).** One file joins the
touched set beyond design §7:
`api/__tests__/performance-no-postgres-import.test.ts` (new — T-07), the
static zero-Postgres-import assertion. Additive unit-test file:
`.specconfig` `allow_globs` covers `*/__tests__/*`, so it is not
spec-guard-gated, and it is auto-discovered by `scripts/test-unit.sh`'s
`api/` run — CI's `unit` job gates it with no `ci.yml` change. It pins
the contract design §7 already states for `performance.ts` ("no Postgres
client import — DEC-03"); no design regeneration required.

## Revision 3 — XD-02 conformance (DEC-03)

Conformance pass against **requirements rev 3 / design rev 3** (blueprint
FINAL ARBITRATION 2026-07-04, XD-02 as amended, recorded as DEC-03): the
canonical KPI-measurement source for this dashboard is **Neo4j
`:KPIMeasurement`** — the same source the governed `kpi-trends` route
reads — not Postgres `kpi_measurements`. This is a narrow repoint, not a
re-plan. (An earlier draft of this preamble declared the repoint exempt
from further review; that language is removed — review scheduling is the
orchestrator's call, and the rev-3 cycle review at `review-tasks.md`
governs. Resolves: N-03 (rev-3).) No task is added,
removed, or renumbered; no AC→task mapping changes; the dependency graph,
complexity ratings, and every non-measurement step are untouched.

| Change | Where |
|--------|-------|
| T-03 Read 2 repointed: the rev-2 Postgres `DISTINCT ON (kpi_id)` read → the design rev 3 §4.2 batched Neo4j latest-per-`kpi_id` `:KPIMeasurement` Cypher, keyed by Read 1's id set. Handler budget restated: **≤ 2 Neo4j round trips, 0 Postgres**; `performance.ts` never imports the Postgres client (design §7). | T-03 steps |
| T-03 code-comment note: rev-2 Risk R-1 (cross-store portfolio-vs-sparkline disagreement) is **dissolved** by DEC-03 — replaced by the **Risk R-5** note (REST-recorded Postgres measurements render `no_data` here; requirements Risk 7). | T-03 steps |
| T-07 fixtures: measurements are seeded as **`:KPIMeasurement` nodes via the direct-driver pattern** (`kpi-okr-governance` design §3.4 — the label has no REST write path; AC-01 as revised). No Postgres fixture writes. | T-07 steps |
| T-07 AC-14 spy: assertion restated per AC-14 rev 3 — **at most two Neo4j round trips and zero Postgres `query` calls** per request. *(Superseded in rev 4: the rev-3 cycle review's B-01 found this seam cross-process-vacuous — the count leg now runs in-process and the zero is a static import assertion; see Revision 4.)* | T-07 steps + verification |
| Pass-2 nit **N-01** resolved: the `ci.yml` "design permission surface" hedging is dropped — `spec-guard.sh` unconditionally allows `.github/*` (hard safety net + `.specconfig` `allow_globs`), so the T-19 edit is never gated and design §7 needs no regeneration. | File-Changes note below |
| Pass-2 nit **N-02** resolved: a one-line note records that T-19 is physically placed between T-16 and T-17 **by dependency**, not by number. | Reading guide |

## Revision 2 — task-review pass 1 fixes

Every finding in `review-tasks.md` (pass 1, verdict **revise**) is
addressed; individual changes are tagged `Resolves:` inline.

| Finding | Change |
|---------|--------|
| B-01 (blocker) | The two new PWA vitest files (T-15, T-16) were the only automated verification for AC-08/09/11(auto)/12(auto), but nothing wired them into the merge gate. The CI `unit` job runs PWA vitest via **explicit file enumeration** (`.github/workflows/ci.yml:23`), so new files are never picked up. **New task T-19** appends exactly those two owned files to that line, scoped to the two files (never a whole-suite `vitest run` that would drag in the un-triaged legacy pwa tree) — mirroring `kpi-okr-governance` T-20's scoping. `.github/workflows/ci.yml` is now listed as the one File-Changes addition this revision requires (design §7 permission surface note below). T-15/T-16 traceability and the Validation-checkpoints table now state the CI gate, not just the local run; the AC→task table's "In CI?" column flips to **yes** for AC-07/08/09/11/12. *(Historical record — the two-file `ci.yml:23` state described here was true at the time; the enumeration has since grown (`story-spec-core` T-18 added three files) and the line moved. T-19 as amended in revision 5 (append-only, anchor not line number) governs execution — Resolves: B-01 (2026-07-05 cycle), fix item 3.)* |
| C-01 (concern) | T-03 and T-04 now carry an explicit note that `bun run typecheck` is a transpile (`bun build … --no-bundle`), **not** a behavior check — their opaque APOC-only Cypher (`apoc.convert.fromJsonMap(...)`, the `{kindFilter}` subquery) is only proven by the paired integration test (T-07/T-08 for T-03, T-09 for T-04). An executor must not treat green typecheck as "handler correct." |
| C-02 (concern) | The T-14 4-file view-wiring waiver (`PerformanceDashboard.tsx` + `.module.css` + `route.ts` + `views/index.tsx`) is now surfaced to the phase gate in a dedicated **"Pinned flags for the phase gate"** section below and recorded for STATUS.md, not only buried in the task body. Direct precedent: `kpi-okr-governance` N-02's identical 4-file view waiver. |
| C-03 (concern) | T-07 (AC-14) and T-09 (two-read budget) pinned the exact spy seam: wrap `getDriver().session` and assert on the returned session object's `run` call count. *(Superseded in rev 4: the rev-3 cycle review's B-01 established that this seam sat in the wrong process — the cited "`kpi-okr-governance` query-count precedent" does not exist in the repo — and the pinning, though precise, measured nothing. The seam itself survives, but only for the in-process invocation; see Revision 4.)* |
| N-01 (nit) | No change — the T-02→T-03→T-04 same-file serialization is already correct via the `Blocked by` chain; the spec-guard permission surface has the file "created" by T-02 before T-03/T-04 Edit it. Noted, not altered. |
| N-02 (nit) | No change — T-17's manual-leg platform cells (AC-07 macOS Chrome, AC-11 macOS Safari, AC-12 macOS Chrome + iPhone Safari) already match the requirements AC platform columns verbatim; STATUS.md records pass/fail per platform per AC. |
| N-03 (nit) | Traceability now includes an NFR→task table (NFR-01 read-only, NFR-02 house rules, NFR-05 systemKind import) for completeness. |

**File-Changes addition (from B-01 (rev-2); hedging dropped per rev-2 pass-2 N-01).**
Revision 2 added exactly one file to the touched set that the design §7
File Changes table does not enumerate: `.github/workflows/ci.yml`
(modify — one scoped step appended to the `unit` job), mirroring the
`kpi-okr-governance` T-20 precedent. This is an **additive CI step, not
spec-guard-gated**: `spec-guard.sh` unconditionally allows `.github/*`
(hard safety net + the `.specconfig` `allow_globs` entry), and T-19
names the path in this tasks.md besides — so no design §7 regeneration
is required for the edit to land (Resolves: N-01, rev-2 cycle pass 2).

## Pinned flags for the phase gate

Surfaced here (not only inside task bodies) so the Phase C
consistency/consolidated-report gate sees them explicitly. Record these
in STATUS.md's flags on completion.

| Flag | Detail | Precedent / rationale |
|------|--------|-----------------------|
| **4-file view waiver (T-14, Resolves: C-02 (rev-2))** | T-14 touches four files — `PerformanceDashboard.tsx` (new), `.module.css` (new), `route.ts` (modify — exec-tab append), `views/index.tsx` (modify — factory row) — exceeding the review-checklist "no task > 3 files" rule. The tab row, view, styles, and factory registration are inseparable for a *reachable* view; splitting them lands an unreachable view or an orphan tab. | Identical to `kpi-okr-governance` N-02's recorded 4-file view waiver. |
| **CI gate scope (T-19, Resolves: B-01 (rev-2); append-only per B-01 (2026-07-05 cycle))** | The `unit`-job CI step gates exactly the two owned pwa vitest files (`performance-dashboard.test.tsx`, `performance-dashboard-a11y.test.tsx`) via explicit enumeration — NOT a whole-suite `vitest run`. The enumeration line is **co-owned** (it already carries `kpi-okr-governance`'s and `story-spec-core`'s entries, and may carry more by execution time): this spec **appends its two entries to the end and never removes or reorders an existing one** — other specs own theirs, and deleting an entry un-gates their ACs. The wider un-triaged legacy pwa `error-scenarios` tree is deliberately left out of this spec's merge gate (out of charter). | Mirrors `kpi-okr-governance` T-20 step (4)'s scoping rationale; FILE-OWNERSHIP on the co-owned line. |
| **Exec-tab single owner (T-14/T-18)** | The `#/exec/performance` row is appended by exactly one task (T-14) after `okr-management`; T-18's ownership diff asserts no `#/model/*` `route.ts` row and no `kpi-okr-governance`-owned file is touched — one clean owner for the exec/performance row (FILE-OWNERSHIP). | Design DD-05 / blueprint FILE-OWNERSHIP. |
| **Design §8 spy wording shares the B-01 (rev-3) flaw — flag to Phase C, not a design reopen (Resolves: B-01 (rev-3), recommendation 3)** | Design §8 describes the AC-14 / two-read query-count spy as if an out-of-process HTTP integration test could wrap the server's `getDriver().session`; it cannot — the server runs in a separate process. The fix landed in T-07/T-09 is **test-mechanics-only** (in-process handler invocation for the count legs + a static no-Postgres-import assertion) and stays entirely inside design §4.2/§4.5's stated budgets (≤ 2 Neo4j / 0 Postgres; exactly 2 reads on `/okr`). Design is at its review cap, so per the rev-3 review's recommendation this is recorded here for the Phase C consolidated report instead of regenerating the design. | review-tasks.md (rev-3 cycle) B-01, fix item (3). |

## Reading guide

- **Execution preconditions (Resolves: C-01, C-02 (2026-07-05 cycle))** —
  two things happen **before T-01 begins**, both recorded in STATUS.md:
  1. The orchestrator re-stamps `requirements.md` rev 3 from
     `status: revised` to `approved`. The rev-3 repoint is a binding
     arbitration adoption already transitively reviewed via the design/tasks
     rev-3 cycles — a stamp gap, not a content gap — so no content
     re-review is run; but execution does not start against a formally
     unapproved upstream (the phase gate and spec-guard reason from
     approved upstreams).
  2. The execution baseline commit is recorded
     (`execution_baseline: <sha>` in STATUS.md's verification notes) —
     T-18's AC-13 ownership diff evaluates this spec's commits against
     that baseline, not the surrounding working-tree churn.
- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution. **T-19 is placed
  between T-16 and T-17 by dependency** (`Blocked by: T-15, T-16` →
  `Blocks: T-18`), not by number — the top-to-bottom invariant holds;
  the id is non-monotonic only because T-19 was added in revision 2
  (Resolves: N-02, rev-2 cycle pass 2).
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck` from the
  repo root; after tasks that ship behaviour, also run the listed test. Tasks
  touching `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts` (AC-10 gate).
- **PWA tests are vitest, never `bun test` (same constraint as
  `kpi-okr-governance` tasks)**: root `bun test` runs `scripts/test-unit.sh`,
  which cds into `api/` and `shared/` only and never discovers a `pwa/` file;
  invoking `bun test <pwa path>` uses Bun's runner, which ignores
  `pwa/vitest.config.ts` (no jsdom, no `@`/`@shared` aliases, no `setupFiles`).
  Any test under `pwa/src/__tests__/` is run as
  `cd pwa && bunx vitest run <path relative to pwa/>` (design §8: jsdom/vitest).
- **Integration-test naming**: `scripts/test-integration.sh` selects by
  test-name pattern `^integration:` — every `describe` in a new
  `*.integration.test.ts` file MUST be prefixed `integration: ` or the suite
  silently skips it.
- **Scoped integration runs (Resolves: C-02 (rev-3))**:
  `scripts/test-integration.sh` is a fixed
  `exec bun test --test-name-pattern '^integration:' --max-concurrency 1 __tests__ src`
  and **accepts no file argument** — "`bun test:integration <file>`" is not
  a real invocation. A scoped local run is
  `cd api && bun test __tests__/<file>.integration.test.ts` (Bun's runner
  on an explicit path; Neo4j + Postgres + the API up via `bun run dev`).
  **Env caveat (Resolves: N-02, rev-4 review):** this scoped run loads env
  from the cwd (`api/`), not the repo root — it requires `api/.env` or
  exported `NEO4J_*` vars (`loadEnv()` throws on a missing
  `NEO4J_PASSWORD`); `scripts/test-integration.sh` sources the root `.env`
  explicitly, the scoped run does not.
  The merge gate is always the **full** `bun test:integration`.
- **Query-count legs run in-process (Resolves: B-01 (rev-3))**: behavior
  assertions go over HTTP against `127.0.0.1:8787` (the house pattern),
  but round-trip-count assertions **cannot** — the server is a separate
  process (CI's "Boot API server" step / local `bun run dev`), and a spy
  on the test process's `getDriver()` singleton observes none of its
  sessions; such an assertion passes vacuously (0 ≤ 2). T-07/T-09's count
  legs therefore import the handler and invoke it **in the test process**
  (module-singleton `getDriver()` shared), and the zero-Postgres contract
  is a **static import assertion**
  (`api/__tests__/performance-no-postgres-import.test.ts`, T-07).
- **Same-task pairing (binding, from design §4.7 / DD-05):** every new
  route-surface dispatch lands in the **same task** as its
  `ROUTE_PERMISSIONS` entry. An unlisted route is an authorization hole
  when `ONELOGIN_ISSUER` is set (the router gate skips the check when
  `getRoutePermission` returns `null`). T-05 therefore carries the router
  dispatch and the RBAC section together; the RBAC pinning unit test is T-06.
- **Read-only contract (NFR-01):** no task adds a write path, a CRUD route,
  an `ERROR_CODES` entry, or a `/api/v2/` bump. No task modifies a
  `kpi-okr-governance`-owned route/view file or `RollDown.tsx` /
  `RollDownAnalytics.tsx` (link-out target only) — AC-13 asserts this.

## Open design concerns — pinned decisions

Design review pass 2 (verdict **approve**, `review-design.md`) left one
concern (C-06) and one nit (N-04) for the tasks author to pin. Both are
design-internal and covered by the AC-04 integration test; the decisions
below are binding for execution.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| C-06 — Read B `d`/`a` may be null under the `OPTIONAL MATCH`; implicit grouping key for `count(adj)` | In §4.5 Read B, the aggregation grouping key set is exactly `(dir.id, a.domain_id, d.name, a.status, a.weight)` so `count(adj)` aggregates **per `(directive, domain)`**, never across the whole result. Rows where `a` is null (a `:RollDown` with no assignment) are **dropped in the handler** before `okrDomainAssignmentSchema` validation (the schema requires non-null `domain_id`/`status`). `ORDER BY dir.name, d.name` may carry a null `d.name` for a dropped row — harmless because the row is filtered before projection. | The schema requires non-null `domain_id`; feeding a null row would fail zod at the response boundary. Filtering server-side keeps the response valid and the grouping unambiguous. | T-04 (Read B + join), asserted by AC-04 in T-09 |
| N-04 — `?domain` scope on `/okr`: does it narrow the per-domain assignment columns too? | `?domain` on `/analytics/performance/okr` filters **directives** via the governed `dir.attributes_json CONTAINS $domainId` predicate (§4.5.1); it does **not** re-filter the per-domain assignment rows in Read B. An unsliced `/okr` returns all top-level directives with all their assignment rows. This is the stated exec default; the view author must not assume `?domain` narrows the domain columns. | Faithful to the two governed handlers (directive predicate vs. RollDown walk read disjoint subgraphs); re-filtering Read B by `?domain` would diverge from the surface this spec only reads. | T-04 (directive predicate), documented in the handler; view consumes as-is in T-11 |

## Task list

### T-01 — Shared zod schemas for the performance aggregates

- **Files** (3): `shared/src/schema/performance.ts` (new),
  `shared/package.json` (modify — narrow), `shared/src/index.ts` (modify —
  narrow)
- **Implements**: design §3.2 — the request/response contract for FR-05..FR-09
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-02, T-03, T-04, T-05, T-07, T-09, T-11 (edge symmetry with
  their `Blocked by` — Resolves: N-01, rev-4 review)
- **Steps**:
  - Create `shared/src/schema/performance.ts` exactly per design §3.2:
    `performanceSliceQuerySchema` (`domain`/`journey` as `z.string().uuid().optional()`,
    `kind` as `z.string().optional()` — coerced in the handler, never
    hard-validated), `kpiStatusEnum` (`on_target|warning|breach|no_data`),
    `kpiStatusRowSchema` + `kpiStatusResponseSchema`,
    `rollDownAssignmentStatusEnum` (`pending|committed|approved|rejected` — the
    four as-built literals, never a re-invented `assigned`/`adjustment_requested`),
    `okrDomainAssignmentSchema` (`weight` NOT `contribution`;
    `adjustment_requested: z.boolean()`), `okrPerformanceRowSchema`
    (`key_results[].progress` nullable), `okrPerformanceResponseSchema`,
    `journeyAxisResponseSchema`, and the inferred types.
  - Import `SYSTEM_KINDS` from `./system-kind` only for reference; do not
    re-declare the literals (NFR-05).
  - Add the `"./schema/performance": "./src/schema/performance.ts"` row to the
    `shared/package.json` `exports` map (mirror the existing
    `./schema/system-kind` row) and re-export from `shared/src/index.ts`.
- **Verification**: `bun run typecheck` (schema compiles + exports resolve);
  the schemas are exercised end-to-end by the integration tests in T-07..T-10.

### T-02 — `computeKpiStatus` pure function + unit test

- **Files** (2): `api/src/routes/performance.ts` (new — this task creates the
  file and adds only `computeKpiStatus`; handlers land in T-03/T-04),
  `api/__tests__/performance-status.test.ts` (new)
- **Implements**: design §4.2 status computation (DD-02) — FR-02, FR-05
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-03
- **Steps**:
  - Implement `computeKpiStatus(kpi, latest): KpiStatus` per the §4.2 table:
    `latest == null → no_data`; `higher_is_better` (`v>=target→on_target`,
    `v<critical→breach`, `v<warning→warning`, else `on_target`);
    `lower_is_better` mirror; `target_is_exact` = **exact equality** plus
    absolute deviation bands (`|v-target|>critical→breach`,
    `|v-target|>warning→warning`, else `on_target` when `v===target`, per N-02).
    Null threshold → skip that branch (degrade to the coarser verdict).
    Unrecognized `target_direction` → `no_data` guard, never throw. Repeat the
    exact-equality-plus-absolute-band contract in a code comment (N-02).
  - Unit test `performance-status.test.ts` covers all three directions, the
    breach/warning/on_target boundaries, `no_data` (null latest), null-threshold
    degradation, and the unknown-direction guard.
- **Verification**: `bun test api/__tests__/performance-status.test.ts`
  — closes the AC-01 pure-function leg.

### T-03 — KPI portfolio aggregate handler (`handlePerformanceKpis`)

- **Files** (1): `api/src/routes/performance.ts` (modify — adds `resolveSlice`,
  `handlePerformanceKpis`, and the `{domainFilter}`/`{journeyFilter}`/`{kindFilter}`
  fragment composition)
- **Implements**: design §4.1, §4.2, §4.3 — FR-04, FR-05, FR-02, FR-06
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-05, T-07, T-08
- **Steps**:
  - `resolveSlice(url)` per §4.1: parse `domain`/`journey`/`kind` via
    `parseWith(performanceSliceQuerySchema, …)` (reuse the governed
    `_helpers.parseWith`, DD-04); coerce `kind` to a `SystemKind` only when it
    is in `SYSTEM_KINDS`, else `undefined` (the `all` slice). Malformed
    `domain`/`journey` → `parseWith` throws → standard 400 envelope (AC-06).
  - `handlePerformanceKpis(req)`: **Read 1 (one Neo4j round trip)** — the §4.2
    KPI query with the base `WHERE k.archived_at IS NULL` and each optional
    fragment appended as `AND …` (the fragment composition rule C-03: exactly
    one `WHERE`, fragments never open a second). Include `{domainFilter}` (flat
    `k.domain_id = $domain` OR the `CONTRIBUTES_TO`→`PART_OF*1..2` path, OR
    semantics per §4.2), `{journeyFilter}` (§4.2), and `{kindFilter}` (the §4.3
    `EXISTS` subquery with `apoc.convert.fromJsonMap(...).systemKind = $kind`,
    inclusive-any DD-06). **Read 2 (one Neo4j round trip — DEC-03, design rev 3
    §4.2)** — the batched latest-`:KPIMeasurement` Cypher keyed by Read 1's id
    array:
    `MATCH (m:KPIMeasurement) WHERE m.kpi_id IN $ids WITH m ORDER BY
    m.measured_at DESC WITH m.kpi_id AS kpi_id, collect(m)[0] AS latest RETURN
    kpi_id, latest.value AS value, latest.measured_at AS measured_at`.
    `measured_at` is an ISO-8601 string (`kpiMeasurementSchema`,
    `shared/src/schema/kpi-sla.ts`), so the `ORDER BY … DESC` string ordering
    is chronologically correct — the same convention `handleKpiTrendsGet`
    relies on. Empty id set from Read 1 short-circuits (no Read 2 issued).
    **Budget: ≤ 2 Neo4j round trips, 0 Postgres** (AC-14 as revised) —
    `performance.ts` never imports the Postgres client (design §7; pinned
    permanently by T-07's static import-assertion test,
    `performance-no-postgres-import.test.ts`). The budget's proof is
    T-07's **in-process** count leg — design §8's out-of-process spy
    wording shares the B-01 (rev-3) flaw and is flagged to Phase C via
    the pinned-flags table, not fixed here.
  - In-memory join + `computeKpiStatus` (T-02); rename only `value →
    latest_value` / `measured_at → latest_measured_at` (N-01), all other fields
    keep as-built snake_case (NFR-04). Respond `kpiStatusResponseSchema` rows.
  - Add the code-comment **Risk R-5** note (rev-2 R-1 is dissolved by DEC-03 —
    portfolio and sparkline now share the `:KPIMeasurement` source; the
    surviving consequence is requirements Risk 7: measurements recorded via
    the REST `POST /api/v1/kpi-measurements` route live in Postgres and render
    `no_data` here — documented, not fixed, per the blueprint ruling).
- **C-01 (rev-2) (Resolves):** the post-task `bun run typecheck` is
  `bun build … --no-bundle` — a **transpile, not a behavior check**. The
  `apoc.convert.fromJsonMap(...)` reads and the `{kindFilter}` `EXISTS`
  subquery are opaque Cypher strings; a typo there passes typecheck and
  only surfaces at runtime. This handler's real proof is the paired
  integration test (T-07 for AC-01/02/14, T-08 for the AC-03 systemKind
  slice) — do not treat a green post-task typecheck as "handler correct."
- **Verification**: scoped local run `cd api && bun test
  __tests__/performance-kpis.integration.test.ts` (authored in T-07;
  Neo4j + Postgres + the API up via `bun run dev` — `test-integration.sh`
  takes no file argument, Resolves: C-02 (rev-3)); merge gate: full
  `bun test:integration`. Covers status correctness (AC-01), slice
  narrowing (AC-02), and the AC-14 query-count invariant (in-process
  count leg, B-01 (rev-3)); the systemKind slice is AC-03 in T-08.

### T-04 — OKR roll-down performance handler (`handlePerformanceOkr`)

- **Files** (1): `api/src/routes/performance.ts` (modify — adds
  `handlePerformanceOkr`, Read A + Read B + server-side join)
- **Implements**: design §4.5 (DD-04) — FR-07, FR-03; pins C-06, N-04
- **Complexity**: complex
- **Blocked by**: T-03 (shares the module + `resolveSlice`)
- **Blocks**: T-05, T-09
- **Steps**:
  - **Read A (one Neo4j round trip)** — directive + key-result progress per
    §4.5: `MATCH (dir:OKRDirective) {directivePredicate}` where
    `{directivePredicate}` is the governed `dir.attributes_json CONTAINS
    $domainId` when `?domain` is present, else the governed top-level
    `NOT dir.attributes_json CONTAINS '"domain_id"'` (cite by handler name
    `handleOkrPerformanceGet` / the directive-list handler, not line — C-05).
    `progress` read via `apoc.convert.fromJsonMap(coalesce(kr.attributes_json,
    "{}")).progress` (C-01, inside `attributes_json`, not a top-level prop).
  - **Read B (one Neo4j round trip)** — anchored on `(:RollDown {type:'okr'})`,
    restricted to Read A's directive id set: replay the real topology verbatim
    `(:RollDown{type:'okr'})-[:FOR_OKR]->(:OKRDirective)`,
    `OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)-[:FOR_DOMAIN]->(d:Domain)`,
    `OPTIONAL MATCH (adj:RollDownAdjustment {status:'pending'}) WHERE
    adj.roll_down_id = r.id AND adj.domain_id = a.domain_id`. Project `a.status`
    (four literals), `a.weight` (NOT `contribution`, B-02), and
    `count(adj) > 0 AS adjustment_requested` (derived from the adjustment node,
    never from `status`, FR-03). **C-06:** the grouping key is exactly
    `(dir.id, a.domain_id, d.name, a.status, a.weight)`; drop rows where `a` is
    null in the handler **before** `okrDomainAssignmentSchema` validation.
  - **Server-side join** by `directive_id`: fold Read B rows into each Read A
    directive's `domains: okrDomainAssignmentSchema[]`; directives with no
    roll-down / no assignments get `domains: []`. Respond
    `okrPerformanceResponseSchema`.
  - **N-04 note in the handler:** `?domain` filters directives (Read A
    predicate) only; Read B assignment rows are not re-filtered by `?domain`.
  - **R-2 note in the handler:** the `CONTAINS $domainId` substring match's
    false-positive envelope is inherited from the governed handler, not fixed
    here (correcting it is a `kpi-okr-governance` concern).
  - Round-trip budget: **exactly two Neo4j reads, zero Postgres**, both batched
    over the directive id set — no per-directive N+1 (N-03). Proven by
    T-09's **in-process** count leg (B-01 (rev-3) — an out-of-process spy
    observes nothing; design §8's spy wording is flagged to Phase C via
    the pinned-flags table); zero-Postgres is pinned module-wide by
    T-07's static import assertion.
  - **C-01 (rev-2) (Resolves):** the post-task `bun run typecheck` is a transpile
    (`bun build … --no-bundle`), **not** a behavior check. Read A's
    `apoc.convert.fromJsonMap(coalesce(kr.attributes_json,"{}")).progress`
    and Read B's topology walk are opaque Cypher — a typo passes typecheck.
    This handler's real proof is the paired integration test T-09 (AC-04);
    do not treat a green post-task typecheck as "handler correct."
- **Verification**: scoped local run `cd api && bun test
  __tests__/performance-okr.integration.test.ts` (authored in T-09; stack
  up via `bun run dev` — Resolves: C-02 (rev-3)); merge gate: full
  `bun test:integration`. Covers four-literal status readback, `weight`,
  `progress` from `attributes_json`, `adjustment_requested` from
  adjustment nodes, and the in-process two-read count leg (AC-04).

### T-05 — Journey-axis handler + router dispatch + RBAC entries

- **Files** (3): `api/src/routes/performance.ts` (modify — adds
  `handlePerformanceJourneys`), `api/src/router.ts` (modify — narrow §4.7),
  `api/src/auth/rbac-permissions.ts` (modify — narrow §4.7)
- **Implements**: design §4.4, §4.1, §4.7 (DD-07, DD-05) — FR-08, FR-05..FR-08,
  NFR-02
- **Complexity**: moderate
- **Blocked by**: T-03, T-04
- **Blocks**: T-06, T-10, T-12, T-13 (edge symmetry with T-13's
  `Blocked by` — Resolves: N-01, rev-4 review)
- **Steps**:
  - `handlePerformanceJourneys(req)` per §4.4: `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain
    {id:$domain}) RETURN j.id AS id, j.name AS name ORDER BY j.name`. `$domain`
    required (validated as UUID via `resolveSlice`); absent/unknown domain →
    `{rows:[]}` (never every journey, never 404). Respond
    `journeyAxisResponseSchema`.
  - `api/src/router.ts`: add the three dispatch lines from §4.1 in the
    `// Graph analytics routes` block **immediately after `analytics/graph`**,
    comment-anchored, plus the import of the three handlers. Touch nothing else
    in the router.
  - `api/src/auth/rbac-permissions.ts`: add a `── Performance dashboards ──`
    section with three `P("GET", "analytics/performance/kpis"|"…/okr"|"…/journeys",
    "analytics:read")` entries (mirror `P("GET","analytics/graph","analytics:read")`).
    New section only; do not touch `getRoutePermission`/`matchSegments`. **This
    RBAC edit lands in this same task as the router dispatch** (same-task
    pairing) so no route ships as an authorization hole.
- **Verification**: scoped local run `cd api && bun test
  __tests__/performance-journeys.integration.test.ts` (authored in T-10;
  stack up via `bun run dev` — Resolves: C-02 (rev-3)); merge gate: full
  `bun test:integration` — AC-05; the RBAC mapping is pinned by the unit
  test in T-06.

### T-06 — RBAC route-permission unit test

- **Files** (1): `api/__tests__/performance-rbac.test.ts` (new)
- **Implements**: design §4.7 RBAC rationale — NFR-02
- **Complexity**: simple
- **Blocked by**: T-05
- **Blocks**: —
- **Steps**:
  - Assert `getRoutePermission("GET", ["analytics","performance","kpis"])`
    returns `"analytics:read"` (never `null`); same for `…,"okr"]` and
    `…,"journeys"]`. Mirror `kpi-okr-governance`'s
    `rbac-route-permissions.test.ts`. (Integration runs use the dev-fallback
    session with `ONELOGIN_ISSUER` unset and cannot observe a missing mapping,
    so this unit test is the guard.)
- **Verification**: `bun test api/__tests__/performance-rbac.test.ts` —
  companion to AC-06 (RBAC null-hole closed).

### T-07 — KPI portfolio integration test (status, slice, query-count)

- **Files** (2): `api/__tests__/performance-kpis.integration.test.ts` (new),
  `api/__tests__/performance-no-postgres-import.test.ts` (new — static
  zero-Postgres import assertion, Resolves: B-01 (rev-3); the rev-4
  File-Changes note above records it as the one addition beyond design §7)
- **Implements**: design §8 — closes AC-01, AC-02, AC-14
- **Complexity**: complex
- **Blocked by**: T-01, T-03
- **Blocks**: — (the `Blocks: T-15` edge is dropped — T-15 consumes nothing
  from this task; Resolves: N-02 (rev-3))
- **Steps**:
  - `describe("integration: performance kpis", …)` (the `integration:` prefix
    is mandatory or the suite skips it). Fixtures via the production
    `getDriver()` (Neo4j) **only** — measurements are seeded as
    **`:KPIMeasurement` nodes via the direct-driver pattern**
    (`kpi-okr-governance` design §3.4; the label has no REST write path —
    DEC-03, AC-01 as revised). **No Postgres fixture writes** — never seed
    through `POST /api/v1/kpi-measurements` (that writes Postgres, which this
    endpoint does not read; requirements Risk 7).
  - **AC-01 (behavior leg — HTTP e2e, unchanged):** seed `higher_is_better` /
    `lower_is_better` / `target_is_exact` KPIs with `:KPIMeasurement` fixtures
    at the on_target / warning / breach boundaries and a KPI with no
    `:KPIMeasurement` node (`no_data`); assert the computed `status` per row
    end-to-end over HTTP against `127.0.0.1:8787`.
  - **AC-02 (behavior leg — HTTP e2e):** `?domain=<id>` narrows;
    `?journey=<id>` narrows; combined filters intersect; an unknown
    well-formed id returns `{rows:[]}` (200, not 404).
  - **AC-14 (query-count leg — IN-PROCESS; Resolves: B-01 (rev-3)):** this
    leg does **not** go over HTTP — the server runs in a separate process
    (CI's "Boot API server" step / local `bun run dev`), so a spy installed
    in the test process can never observe its sessions and would pass
    vacuously (0 ≤ 2). Instead: `import { handlePerformanceKpis } from
    "../src/routes/performance"`, build
    `new Request("http://127.0.0.1:8787/api/v1/analytics/performance/kpis?…")`,
    and invoke the handler **in the test process**, where the
    module-singleton `getDriver()` (`api/src/neo4j/driver.ts`, module-level
    `cachedDriver`) is genuinely shared between test and handler. Install
    the **wrap-the-`session`-factory** spy — wrap the singleton driver's
    `session` method so every session it opens is captured, and sum the
    captured session objects' `run` call counts (not a naked per-`session`
    spy, which misses a second session and can double-count a reused one).
    Install the wrap **after fixture seeding** — or snapshot counts
    immediately before the handler call and assert on the delta — so
    seeding sessions never pollute the count; restore the original
    `session` in `afterEach` (`_resetDriver()`, `driver.ts:36`, is
    available if a clean singleton is needed). The in-process call
    bypasses the router auth gate — acceptable: this leg asserts query
    shape, not authz (T-06 pins RBAC). Assert **at most two Neo4j round
    trips per invocation** (AC-14 as revised, XD-02 as amended), and that
    a 50-KPI fixture and a 5-KPI fixture yield the **same** round-trip
    count (no per-KPI growth).
  - **Zero-Postgres (static leg — IN `performance-no-postgres-import.test.ts`;
    Resolves: B-01 (rev-3)):** a plain unit test (auto-discovered by
    `scripts/test-unit.sh`'s `api/` run — CI's `unit` job gates it with no
    `ci.yml` change) modeled on the as-built
    `api/__tests__/analytics-no-write-imports.test.ts` pattern: read
    `api/src/routes/performance.ts` and assert it contains **no import
    from `storage/postgres`** (match import statements, not bare text, so
    a prose mention in a comment never trips it). This pins design §7's
    "no Postgres client import" contract permanently. Do **not** rely on a
    `pg` `query` spy as the proof — `client.ts:20`'s
    `export async function query` is a read-only Bun ESM namespace binding
    and a namespace `spyOn` is brittle; an in-process `query` spy may be
    kept as best-effort extra evidence only if it demonstrably works.
- **Verification**: scoped local runs `cd api && bun test
  __tests__/performance-kpis.integration.test.ts` (stack up via
  `bun run dev`) and `cd api && bun test
  __tests__/performance-no-postgres-import.test.ts` (real commands —
  `test-integration.sh` takes no file argument, Resolves: C-02 (rev-3)).
  Merge gates: full `bun test:integration` (integration job — behavior +
  count legs) and `bun test` (unit job — the static zero-Postgres leg).
  Environment: Neo4j + Postgres running for the suite/API boot; the
  endpoint itself issues zero Postgres queries (DEC-03).

### T-08 — systemKind slice integration test (inclusive-any)

- **Files** (1): `api/__tests__/performance-systemkind-slice.integration.test.ts` (new)
- **Implements**: design §4.3, DD-06 — closes AC-03
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: — (`Blocks: T-15` edge dropped — Resolves: N-02 (rev-3))
- **Steps**:
  - `describe("integration: performance systemKind slice", …)`. Because the
    retail seed is monochrome (`functional` only, Risk R-3), create fixtures for
    **all three** kinds: KPIs with `CONTRIBUTES_TO` paths reaching `functional`,
    `agentic`, and `ai_predictive` Systems (`systemKind` set inside
    `attributes_json`, imported from `SYSTEM_KINDS` — never re-declared).
  - Assert `?kind=agentic` returns only KPIs reaching an agentic System
    (inclusive-any — a KPI reaching both functional + agentic still matches);
    a KPI with no KPI→…→System path is excluded from a non-`all` slice;
    `kind` absent / `all` / `nonsense` all return the full in-scope set (200,
    the `all` slice — AC-03/AC-06 N-03), never a 400.
- **Verification**: scoped local run `cd api && bun test
  __tests__/performance-systemkind-slice.integration.test.ts` (stack up
  via `bun run dev` — Resolves: C-02 (rev-3)); merge gate: full
  `bun test:integration`.

### T-09 — OKR roll-down integration test (four literals, adjustment, two-read spy)

- **Files** (1): `api/__tests__/performance-okr.integration.test.ts` (new)
- **Implements**: design §4.5, §8 — closes AC-04
- **Complexity**: complex
- **Blocked by**: T-01, T-04
- **Blocks**: — (`Blocks: T-15` edge dropped — Resolves: N-02 (rev-3))
- **Steps**:
  - `describe("integration: performance okr", …)`. Build fixtures through the
    governed roll-down write routes / driver: `(:RollDown{type:'okr'})-[:FOR_OKR]->(:OKRDirective)`,
    `-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)`,
    `(:OKRDirective)-[:HAS_KEY_RESULT]->(:KeyResult)` with a `progress` inside
    `KeyResult.attributes_json`.
  - Assert a fresh assignment reads back `status:'pending'`; after the governed
    commit/approve/reject transitions it reads `committed`/`approved`/`rejected`
    — **no `assigned`/`adjustment_requested` literal is ever asserted** (FR-03).
  - Assert `weight` surfaces from `a.weight` (not `contribution`, B-02);
    `key_results[].progress` surfaces from `attributes_json` (C-01);
    `adjustment_requested` becomes `true` only after
    `POST /roll-down/request-adjustment` creates a pending `:RollDownAdjustment`,
    never derived from `status` (FR-03).
  - **C-06 assertion:** a directive whose `:RollDown` has no assignment yields
    `domains: []` (the null-`a` row is dropped, not surfaced as a null-domain
    row); the response validates against `okrPerformanceResponseSchema`.
  - **Two-read budget (query-count leg — IN-PROCESS; Resolves: B-01
    (rev-3)):** the behavior assertions above stay HTTP end-to-end; this
    count leg does **not** — an out-of-process spy observes nothing of the
    server's driver and passes vacuously. Same mechanics as T-07's count
    leg: `import { handlePerformanceOkr } from
    "../src/routes/performance"`, build the `Request`, invoke in the test
    process, wrap the shared singleton's `getDriver().session` factory
    (sum the captured sessions' `run` call counts — never a naked
    per-`session` spy that would miss a second session or double-count a
    reused one), install the wrap after fixture seeding (or assert on the
    pre/post-invocation delta), restore in `afterEach`
    (`_resetDriver()` available). The in-process call bypasses the router
    auth gate — acceptable: query shape, not authz (T-06 covers RBAC).
    Assert **exactly two Neo4j reads per invocation** regardless of
    directive/assignment count (no per-directive N+1). **Edge-case pin
    (Resolves: N-02 (2026-07-05 cycle)):** assert the two-read shape on
    fixtures with **≥ 1 directive** (this task's fixtures always seed
    directives); an empty directive set from Read A may legitimately
    short-circuit Read B — mirroring T-03's empty-id-set rule — so a
    one-read empty-slice invocation is not a budget violation, and the
    implementer is free to add that short-circuit. Zero-Postgres for
    this handler is pinned module-wide by T-07's static import assertion
    — no per-endpoint `pg` spy.
  - Do **not** assert the substring-match false positive as a defect (R-2 is
    inherited, `kpi-okr-governance`'s to fix).
- **Verification**: scoped local run `cd api && bun test
  __tests__/performance-okr.integration.test.ts` (stack up via
  `bun run dev` — Resolves: C-02 (rev-3)); merge gate: full
  `bun test:integration` (AC-04).

### T-10 — Journey-axis integration test

- **Files** (1): `api/__tests__/performance-journeys.integration.test.ts` (new)
- **Implements**: design §4.4 — closes AC-05
- **Complexity**: simple
- **Blocked by**: T-05
- **Blocks**: — (`Blocks: T-15` edge dropped — Resolves: N-02 (rev-3))
- **Steps**:
  - `describe("integration: performance journeys", …)`. Seed a domain with two
    `UserJourney` nodes `PART_OF` it; assert `?domain=<id>` returns both rows
    ordered by `name`; an unknown domain → `{rows:[]}`; an absent `domain` →
    `{rows:[]}` (not every journey).
- **Verification**: scoped local run `cd api && bun test
  __tests__/performance-journeys.integration.test.ts` (stack up via
  `bun run dev` — Resolves: C-02 (rev-3)); merge gate: full
  `bun test:integration`.

### T-11 — OpenAPI registration for the performance paths

- **Files** (2): `api/src/routes/openapi-performance.ts` (new),
  `api/src/routes/openapi.ts` (modify — narrow §4.7, two lines)
- **Implements**: design §4.6 — FR-09
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-13
- **Steps**:
  - `openapi-performance.ts` exporting
    `registerPerformancePaths(registry: OpenAPIRegistry): void`, mirroring
    `openapi-kpi-okr.ts`. Register the §3.2 request/response schemas and a
    `registerPath` entry for each of the three new routes
    (`/analytics/performance/{kpis,okr,journeys}`); the `kpi-trends` sparkline
    is already registered by `kpi-okr-governance`. 400/404 responses reference
    the existing `errorEnvelopeSchema`.
  - `openapi.ts`: add exactly two lines — the import of
    `registerPerformancePaths` and one call inside `getOpenApiDoc()`. Touch
    nothing else.
- **Verification**: covered by the extended
  `api/__tests__/openapi.integration.test.ts` in T-13 (AC-06); interim check
  is `bun run typecheck`.

### T-12 — PWA data layer: `api.performance` client

- **Files** (1): `pwa/src/api.ts` (modify — narrow §4.7, new `performance`
  object)
- **Implements**: design §6 data layer, §4.7 — FR-02..FR-04
- **Complexity**: simple
- **Blocked by**: T-01, T-05
- **Blocks**: T-14
- **Steps**:
  - Add a new `performance` client object with `kpis(slice, signal)` →
    `GET /analytics/performance/kpis` (serializing `domain`/`journey`/`kind`
    query params), `okr(domainId?, signal)` → `.../okr`,
    `journeys(domainId, signal)` → `.../journeys`. New object only; do **not**
    touch `getPerformance` (per-domain, unchanged — N-02), `kpi.list`, or
    `domains.list`. Import the response types from
    `@companygraph/shared/schema/performance`.
- **Verification**: `bun run typecheck`; exercised by the view tests (T-15) via
  mocked fetches.

### T-13 — OpenAPI integration test extension (path enumeration + 400/coercion)

- **Files** (1): `api/__tests__/openapi.integration.test.ts` (modify)
- **Implements**: design §8 — closes AC-06
- **Complexity**: simple
- **Blocked by**: T-11, T-05
- **Blocks**: — (`Blocks: T-15` edge dropped — Resolves: N-02 (rev-3))
- **Steps**:
  - Extend the existing path-enumeration assertion to require the three new
    `/api/v1/analytics/performance/*` paths in `GET /api/v1/openapi.json`.
  - Assert a malformed hard-validated `domain` (bad UUID shape) on
    `/analytics/performance/kpis` returns the standard
    `400 {error:{code,message,details}}` envelope; assert `?kind=nonsense`
    returns **200 with the `all` slice**, not 400 (N-03).
  - Keep the existing assertions green (aggregates are additive — AC-13).
- **Verification**: scoped local run `cd api && bun test
  __tests__/openapi.integration.test.ts` (stack up via `bun run dev` —
  Resolves: C-02 (rev-3)); merge gate: full `bun test:integration`
  (AC-06).

### T-14 — `PerformanceDashboard` view + exec-tab registration

- **Files** (4 — the recorded pinned-flag waiver; header now enumerates
  all four, Resolves: N-01 (rev-3)):
  `pwa/src/views/exec/PerformanceDashboard.tsx` (new),
  `pwa/src/views/exec/PerformanceDashboard.module.css` (new),
  `pwa/src/route.ts` (modify — narrow §4.7, one exec-tab append),
  `pwa/src/views/index.tsx` (modify — narrow, one factory row)
- **Implements**: design §6 (FR-01..FR-04, UX-01/02/05/06); pins N-04 for the view
- **Complexity**: complex
- **Blocked by**: T-12
- **Blocks**: T-15, T-16
- **Steps**:
  - `pwa/src/route.ts`: append **one** row `{ id: "performance", label:
    "Performance" }` to the `exec` surface's `tabs` array **after
    `{ id: "okr-management", … }`** (the last row of the exec `tabs` array —
    anchor by that row, not a line number; the file shifts as other specs
    land — Resolves: N-01 (2026-07-05 cycle)),
    comment-anchored `// kpi-okr-performance-dashboards: exec performance tab`.
    Touch **no** `#/model/*` row and no other surface (DD-05, FILE-OWNERSHIP —
    one clean owner for the `#/exec/performance` row).
  - `PerformanceDashboard.tsx` (pure renderer): read `route.params.domain /
    .journey / .kind`; slice changes rewrite `location.hash` via
    `toHash({surface:"exec",tab:"performance"}, params)` (same pattern as
    `#/explorer/systems?kind=`); unknown/absent params → `All` on that axis.
    Fetch `api.performance.kpis(slice)`, `.okr(domain)`, `.journeys(domain)`
    plus `api.domains.list()` for the domain axis, via `useFetch` with
    `AbortSignal`; the selected-KPI sparkline lazily fetches `kpi-trends`
    (DD-08). **N-04:** consume `/okr` as-is — `?domain` narrows directives, not
    the domain columns.
  - Components (catalog-first, UX-02): KPI status panel = one `KpiCard` per KPI
    (`tone` mapped `on_target→good|warning→warn|breach→danger|no_data→neutral`)
    plus a text `Pill` per status ("On target"/"Warning"/"Breach"/"No data" —
    text + tone, never color alone); trend = `LineChartCard`; OKR panel = `Card`
    per directive with a status `Pill` per assigned domain (`pending` MAY
    display as "Awaiting" — display mapping only, FR-03) and an
    `adjustment_requested` badge; link-out `Button` to `#/exec/okr-management`
    (display + link-out only, no mutation). Slicer = domain `<select>`, journey
    `<select>` (disabled until a domain is chosen), and a systemKind `<div
    role="group" aria-label="Filter by system kind">` of catalog `Button`s
    (labels from `SYSTEM_KIND_LABELS`, values from `SYSTEM_KINDS` — NFR-05;
    active button `aria-pressed`). `ViewHeader`/`Loading`/`ErrorState` from
    `views/_shared.tsx`.
  - States (UX-01): loading (`<Loading>`), error (`<ErrorState>`), empty-no-KPIs
    ("No KPIs yet"), empty-slice-zero-match (distinct "No KPIs match this slice"
    + a working clear-slice affordance resetting that axis to `All`), ready.
  - `.module.css` uses `var(--…)` tokens only — no hex/rgba/oklch literals.
  - Register the view factory row `"performance": (r) => <PerformanceDashboard
    route={r} />` in `pwa/src/views/index.tsx` (see T-16 note — the factory row
    is added here if `index.tsx` is not otherwise touched; if a same-task file
    budget is tight, the factory row moves to T-16). **Decision: add the factory
    row in this task** so the view is reachable the moment the tab lands.
    (Files list above already accounts for `route.ts`; `views/index.tsx` is the
    accepted 4th narrow file for this view-wiring task — a documented waiver, as
    the tab row, view, styles, and factory registration are inseparable for a
    reachable view.)
- **Verification**: `bun run scripts/design-conformance.ts` exits 0 with
  `PerformanceDashboard.tsx` clean (AC-10); behaviour verified by T-15.

### T-15 — Dashboard behaviour tests (URL slice, states, click-path)

- **Files** (1): `pwa/src/__tests__/performance-dashboard.test.tsx` (new)
- **Implements**: design §8 — closes AC-07, AC-08, AC-09, AC-12 (automated leg)
- **Complexity**: complex
- **Blocked by**: T-14
- **Blocks**: T-17, T-19 (this file must exist before T-19 wires it into CI —
  Resolves: B-01 (rev-2))
- **Steps**:
  - vitest/jsdom (`cd pwa && bunx vitest run src/__tests__/performance-dashboard.test.tsx`).
  - **AC-07**: mounting with `route.params` from
    `#/exec/performance?domain=…&journey=…&kind=agentic` renders pre-sliced on
    all three axes; a slice change rewrites the hash (URL-first) without full
    navigation.
  - **AC-08**: mocked aggregate fetches drive loading / error (failed fetch) /
    ready (KPI status panel + trend cards + OKR panel).
  - **AC-09**: zero KPIs → "No KPIs yet"; an active slice matching zero KPIs →
    distinct zero-match message + a working clear-slice affordance returning to
    `All` on that axis.
  - **AC-12 (automated leg)**: selecting domain→journey→kind narrows both panels
    consistently and updates the hash; a selected KPI's sparkline renders from a
    mocked `kpi-trends` response.
- **Verification**: `cd pwa && bunx vitest run
  src/__tests__/performance-dashboard.test.tsx` green locally; this file is
  wired into the `unit` CI job by T-19 so AC-07/08/09/12's automated legs
  **gate merge** (Resolves: B-01 (rev-2)) — a local-only pass is not the gate.

### T-16 — Dashboard a11y test

- **Files** (1): `pwa/src/__tests__/performance-dashboard-a11y.test.tsx` (new)
- **Implements**: design §6 a11y (UX-05) — closes AC-11 (automated leg)
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: T-17, T-19 (this file must exist before T-19 wires it into CI —
  Resolves: B-01 (rev-2))
- **Steps**:
  - vitest/jsdom. Assert Tab reaches every slicer control (domain select,
    journey select, systemKind buttons) in DOM order; the active systemKind
    button exposes selected state (`aria-pressed`); each KPI status is present
    as text (e.g. "Breach"), not color alone.
  - **Mount strategy pinned (Resolves: C-01 (rev-3)):** this file mounts
    `PerformanceDashboard` **directly** with mocked fetches — the sibling
    exec-view test pattern — which renders **no** App shell and therefore
    no `<main>`. The `<main>`-landmark assertion is **dropped from this
    jsdom file** (option (b) of the review's two): the landmark check
    moves to T-17's AC-11 manual Safari leg. Mounting the full `App` for
    one assertion (option (a)) was rejected — it would drag the whole
    shell's fetch surface into this spec's test scope. No source edit:
    `pwa/src/App.tsx:97` already provides the `<main>` landmark at
    runtime.
- **Verification**: `cd pwa && bunx vitest run
  src/__tests__/performance-dashboard-a11y.test.tsx` green locally; this file is
  wired into the `unit` CI job by T-19 so AC-11's automated leg **gates merge**
  (Resolves: B-01 (rev-2)).

### T-19 — CI: gate the two owned PWA vitest files in the `unit` job

- **Files** (1): `.github/workflows/ci.yml` (modify — narrow: append the two
  owned files to the `unit` job's existing PWA `vitest run` step)
- **Implements**: the CI merge-gate for AC-07, AC-08, AC-09, AC-11 (auto leg),
  AC-12 (auto leg) — Resolves: B-01 (rev-2)
- **Complexity**: simple
- **Blocked by**: T-15, T-16 (both files must exist)
- **Blocks**: T-18
- **Steps**:
  - The `unit` job runs PWA vitest via **explicit file enumeration** — the
    stable anchor is the `bunx vitest run …` step with
    `working-directory: pwa` in the `unit` job (do **not** locate it by line
    number; the line moves as other specs append — Resolves: B-01
    (2026-07-05 cycle)). New PWA test files are **not** discovered unless
    added to that enumeration — root `bun test` / `scripts/test-unit.sh`
    never cds into `pwa/`, so nothing else picks them up. The enumeration
    is a **co-owned line**: at this writing it carries five entries (two
    from `kpi-okr-governance` T-20, three from `story-spec-core` T-18 —
    see the adjacent scoping comments), and other specs may have appended
    more by execution time. This spec owns only its own two entries, never
    the enumeration as a whole (FILE-OWNERSHIP).
  - **Append-only edit (Resolves: B-01 (2026-07-05 cycle)):** append the
    two owned files — `src/__tests__/performance-dashboard.test.tsx` and
    `src/__tests__/performance-dashboard-a11y.test.tsx` — to the **end** of
    the `unit` job's PWA `vitest run` enumeration, **whatever files that
    line carries at execution time**. **Never remove, replace, or reorder
    an existing entry** — other specs own theirs, and deleting one silently
    un-gates their CI-gated ACs. Do not paste a full-line literal from this
    document (any quoted enumeration goes stale the moment another spec
    appends). Extend the adjacent scoping comments with one line noting
    this spec's two files are added under the same scoped-enumeration
    rationale.
  - **Scope discipline (Resolves: B-01 (rev-2) / Pinned flag):** add **exactly** these
    two files. Do **not** switch the step to a whole-suite `vitest run` (no
    args) — that would drag the un-triaged legacy pwa `error-scenarios` tree
    into this spec's merge gate, which is out of charter. Mirror
    `kpi-okr-governance` T-20 step (4)'s scoping decision.
  - Touch nothing else in `ci.yml` (no `integration`-job change — the Postgres
    service, migrations, and API-boot step already exist from
    `kpi-okr-governance` T-20; this spec's integration tests ride them).
- **Verification**: manual: open the PR's `unit` job run in GitHub Actions
  (browser) — verify the `vitest run` step now lists and passes
  `performance-dashboard.test.tsx` and `performance-dashboard-a11y.test.tsx`
  **in addition to every pre-existing entry** (none removed — B-01
  (2026-07-05 cycle)), so AC-07/08/09/11(auto)/12(auto) gate merge; also
  `cd pwa && bunx vitest run src/__tests__/performance-dashboard.test.tsx src/__tests__/performance-dashboard-a11y.test.tsx`
  green locally.

### T-17 — Manual acceptance sweep (deep link, keyboard, click/touch)

- **Files** (0): manual verification only; no source edits
- **Implements**: the manual legs of AC-07, AC-11, AC-12
- **Complexity**: simple
- **Blocked by**: T-15, T-16
- **Blocks**: T-18
- **Steps**:
  - Bring the app up (`bun run dev`), seed if needed, and run the three manual
    repros below. Record pass/fail per AC in STATUS.md's verification notes.
- **Verification**: manual:
  (AC-07) open `http://127.0.0.1:5173/#/exec/performance?domain=<id>&journey=<id>&kind=agentic`
  in macOS Chrome and press Cmd+R (mouse) — verify all three slicers show active
  and rows stay filtered;
  (AC-11) keyboard-only on macOS Safari — Tab through the three slicers, press
  Enter on `Agentic`, verify rows narrow, the focus ring stays visible, and
  status pills read as text; additionally verify in Safari's Web Inspector
  (Develop → Show Web Inspector, Elements panel) that the dashboard content
  sits inside the app shell's `<main>` landmark (`pwa/src/App.tsx` `<main>`)
  — this landmark check moved here from T-16's jsdom file, which mounts the
  view without the shell (Resolves: C-01 (rev-3));
  (AC-12) macOS Chrome click domain→journey→kind (mouse) — expect both panels +
  hash update; iPhone Safari tap the same controls (touch) — expect tap targets
  activate.

### T-18 — Full validation + ownership check + completion gate

- **Files** (0): validation + STATUS.md update only; no source edits
- **Implements**: design §8 regression/gate — closes AC-10, AC-13; final AC sweep
- **Complexity**: moderate
- **Blocked by**: T-17, T-19 (both the manual sweep and the CI wiring must land
  before the completion gate — Resolves: B-01 (rev-2))
- **Blocks**: —
- **Steps**:
  - `bun run typecheck` exits 0 (AC-13).
  - `bun run scripts/design-conformance.ts` exits 0 with the Performance view
    listed clean (AC-10).
  - `bun test` (unit) + `bun test:integration` (Neo4j + Postgres) all green;
    the pre-existing `openapi.integration.test.ts` stays green (aggregates
    additive). The unit run auto-discovers
    `performance-no-postgres-import.test.ts` — the standing zero-Postgres
    guard (B-01 (rev-3)).
  - `cd pwa && bunx vitest run src/__tests__/performance-dashboard.test.tsx src/__tests__/performance-dashboard-a11y.test.tsx`
    green (the two owned view tests; vitest entry point, never root `bun test`).
  - **CI gate check (Resolves: B-01 (rev-2); never-remove clause per B-01
    (2026-07-05 cycle)):** confirm the `unit` job's PWA `vitest run` step in
    `.github/workflows/ci.yml` enumerates both owned files **in addition to
    every pre-existing entry** — T-19 landed append-only; no other spec's
    entry was removed or reordered (other specs own theirs). So
    AC-07/08/09/11(auto)/12(auto) gate merge and are not local-only, and no
    co-owner's gate was stripped. Record this in STATUS.md's flags.
  - **Ownership check (AC-13; baseline-pinned — Resolves: C-02 (2026-07-05
    cycle)):** a bare `git diff --name-only` is unevaluable in a working
    tree carrying unrelated in-flight churn, so the assertion runs against
    this spec's commits only: using the `execution_baseline` commit
    recorded in STATUS.md before T-01 (reading-guide preconditions),
    run `git log --name-only <baseline>..HEAD` scoped to this spec's
    commits (or `git diff --name-only <baseline>..HEAD` when the branch
    carries only this spec's work) and assert **no** change under any
    `kpi-okr-governance`-owned route/view path, `RollDown.tsx`,
    `RollDownAnalytics.tsx`, `system-kind.ts`, or a `#/model/*` `route.ts`
    row — only the additive exec-tab append and the enumerated §7 files
    (plus the two recorded additions: `ci.yml`,
    `performance-no-postgres-import.test.ts`).
  - Populate STATUS.md `verified_at` + `verification_artifact` and mark
    Execution complete (the completion hook blocks otherwise).
- **Verification**: `bun run typecheck` + `bun test` + `bun test:integration` +
  baseline-scoped ownership review (`git log --name-only
  <execution_baseline>..HEAD`, this spec's commits — expect no
  `kpi-okr-governance`-owned or `#/model/*` change; Resolves: C-02
  (2026-07-05 cycle)) — closes AC-10, AC-13.

## Traceability — AC → task

| AC | Closed by | Kind | CI-gated (rev-2 B-01) |
|----|-----------|------|---------------------------|
| AC-01 (status computed correctly) | T-02 (pure fn), T-07 (end-to-end) | unit + integration | yes (`unit` + `integration` jobs) |
| AC-02 (domain/journey slice narrows) | T-07 | integration | yes |
| AC-03 (systemKind inclusive-any slice) | T-08 | integration | yes |
| AC-04 (OKR four literals + adjustment + two-read) | T-09 (behavior legs HTTP e2e; two-read count leg **in-process** — B-01 (rev-3)) | integration | yes |
| AC-05 (journey axis) | T-10 | integration | yes |
| AC-06 (OpenAPI paths + 400/coercion) | T-13, T-06 (RBAC companion) | integration + unit | yes |
| AC-07 (deep-link survives reload) | T-15 (auto, CI via T-19), T-17 (manual) | jsdom + manual | auto leg yes (T-19) |
| AC-08 (loading/error/ready states) | T-15 (CI via T-19) | jsdom | yes (T-19) |
| AC-09 (empty variants) | T-15 (CI via T-19) | jsdom | yes (T-19) |
| AC-10 (design-conformance) | T-14, T-18 | CLI | yes |
| AC-11 (keyboard/a11y) | T-16 (auto, CI via T-19), T-17 (manual — incl. the `<main>`-landmark check moved from T-16, C-01 (rev-3)) | jsdom + manual | auto leg yes (T-19) |
| AC-12 (slice click path + sparkline) | T-15 (auto, CI via T-19), T-17 (manual) | jsdom + manual | auto leg yes (T-19) |
| AC-13 (transpile + ownership) | T-18 | CLI | yes |
| AC-14 (query-count invariant) | T-07 (**in-process** count leg + static no-Postgres-import unit test — B-01 (rev-3)) | integration + unit | yes (`integration` job + `unit` job) |

### Traceability — NFR → task (Resolves: N-03 (rev-2))

| NFR | Guaranteed by |
|-----|---------------|
| NFR-01 (read-only: no write path, no `ERROR_CODES` add, no `/api/v2/`) | reading-guide read-only contract; T-18 ownership diff (no governed route/view file, no `RollDown*.tsx`, no `#/model/*` row); T-07's `performance-no-postgres-import.test.ts` statically pins the DEC-03 single-store read (B-01 (rev-3)) |
| NFR-02 (house rules: zod-only, en-US, auth via central gate + `api/src/auth/`) | T-05 RBAC via `rbac-permissions.ts` (same-task pairing, never per-route); T-01 zod schemas; T-06 RBAC null-hole unit test |
| NFR-05 (systemKind imported, never re-declared) | T-01 imports `SYSTEM_KINDS` for reference only; T-08 fixtures + T-14 slicer use `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` from `system-kind.ts` |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` (repo root) — **transpile only, not behavior** (C-01 (rev-2)): for T-03/T-04 the real proof is the paired integration test, not this checkpoint |
| tasks with API behaviour (T-02..T-13) | the task's listed test — unit: `bun test <path>`; integration scoped local run: `cd api && bun test __tests__/<file>` with the stack up via `bun run dev` (`test-integration.sh` takes no file argument — C-02 (rev-3)); merge gate: full `bun test:integration` |
| tasks touching pwa views (T-14) | `bun run scripts/design-conformance.ts` |
| pwa view/a11y tests (T-15, T-16) | `cd pwa && bunx vitest run <path relative to pwa/>` locally; **gated in CI by T-19** (Resolves: B-01 (rev-2)) |
| CI wiring (T-19) | GitHub Actions `unit` job's PWA `vitest run` step lists + passes the two owned files (`performance-dashboard.test.tsx`, `performance-dashboard-a11y.test.tsx`) **in addition to every pre-existing entry — none removed** (B-01, 2026-07-05 cycle) — AC-07/08/09/11(auto)/12(auto) gate merge |
| final task (T-18) | `bun test` + `bun test:integration` (needs Neo4j + Postgres) + the two owned pwa vitest files + full AC sweep + baseline-scoped ownership check (`git log --name-only <execution_baseline>..HEAD` — C-02, 2026-07-05 cycle) + confirm T-19 CI gate is present append-only |
