---
feature: "kpi-okr-governance"
reviewing: "tasks"
reviewing_revision: 3
reviewing_requirements_revision: 2
reviewing_design_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
note: >
  Fresh cold review of tasks.md revision 3 (the post-approval erratum).
  This file supersedes the prior on-disk review, which was pass 2/2 on
  revision 2 (verdict: approve, 0 blockers, 1 concern C-01 + 2 nits
  N-01/N-02, each explicitly sanctioned for fixing without re-review).
  That history is preserved in "Prior review history" below.
---

# Review: kpi-okr-governance / tasks (revision 3, fresh pass)

## Scope of this review

Revision 3 is unusual: it is a **post-approval erratum** applied after
execution completed (T-01…T-21 done 2026-07-04 per STATUS.md). The
review questions are therefore: (1) does rev 3 stay inside the envelope
the approving pass-2 review sanctioned, (2) is the plan itself sound
against requirements rev 2, design rev 2, the blueprint, and the house
rules, and (3) do the artifact's claims match the working tree. I
re-derived all three cold rather than trusting the revision tables.

**(1) Erratum envelope — holds.** The three rev-3 edits map one-to-one
onto the three pass-2 dispositions, each of which carried an explicit
no-re-review sanction:

- C-01 → T-21 step (1) now pins the sweep to the two owned subtrees
  (`error-scenarios/exec/{kpi-management,okr-management}`); the pass-2
  review said "scope the sweep … No re-review needed — this narrows,
  not widens, the verification." The narrowed command in T-21 and the
  Validation-checkpoints table matches the recommendation exactly.
- N-01 → dependency-metadata tidy only (T-06/T-07/T-08 `Blocked by` +=
  T-01; T-11/T-12 `Blocked by` += T-03 with symmetric `Blocks`); the
  pass-2 review said "Tidy only if the file is touched again" — it was
  (for C-01). No ordering change; T-01/T-03 are Stage 0.
- N-02 → `App.tsx` line-number citations replaced by the element
  description, exactly as recommended. Verified in the tree: the
  `<main className={styles.main}>` wrapper currently sits at
  `pwa/src/App.tsx:97` — the erratum's ":97 now" claim is accurate and
  the drop of line numbers was the right call.

No other substantive text diverges from what the pass-2 review
described (same-task pairings, commands, traceability rows, pinned
decisions were each cross-checked against that review's descriptions
— see C-01 below on why a mechanical diff was impossible).

**(2) Plan soundness — re-verified cold**, summarized in the
traceability section.

**(3) Claims vs working tree — verified.** Spot checks all pass:

- All 10 integration test files + `rbac-route-permissions.test.ts`
  exist under `api/__tests__/`; describes carry the mandatory
  `integration: ` prefix (checked `kpi-crud.integration.test.ts:64`).
- `pwa/src/__tests__/exec-{kpi,okr}-management.test.tsx` exist;
  `pwa/vitest.config.ts` exists; the `error-scenarios/exec/` directory
  indeed also holds `finance/ ops/ people/ risk/ transform/` — the
  pass-2 C-01 narrowing was justified, and rev 3's pinned command is
  correctly scoped.
- `scripts/test-integration.sh` carries the ROOT-anchored `.env`
  sourcing exactly per the pinned design-review N-01 decision (T-03).
- `.github/workflows/ci.yml`: `postgres:16-alpine` service,
  `POSTGRES_URI`, `cd api && bun run src/storage/postgres/run-migrations.ts`,
  and the sanctioned unit-job step (`bunx vitest run` on exactly the
  two pin files, `working-directory: pwa`) are all present (T-20).
- `api/src/routes/_helpers.ts:84` `parseWith`; `router.ts:274` ZodError
  backstop; `openapi.ts:70` `export const errorEnvelopeSchema`,
  `:712 registerKpiOkrPaths(registry)` — the pinned C-01 export
  decision landed as specified (T-02, T-15).
- `rbac-permissions.ts`: all 7 added entries present
  (`:178 GET domains`, `:196-198` KPI trio, `:205-207` SLA trio) and
  the stale `POST kpis/:id` / `POST slas/:id` overload rows are gone
  (comment at `:193` records the removal) — DD-12 pairing held (T-10,
  T-11, T-12).
- Zero `api.cypher` matches in either owned view (T-16/T-18 outcome).

## Prior review history (preserved)

- Pass 1 (rev 1): **revise** — B-01 (pwa tests unrunnable via
  `bun test`), C-01…C-03, N-01…N-03.
- Pass 2 (rev 2): **approve** — 0 blockers; C-01 (sweep scope) +
  N-01/N-02 handed to the executor with no-re-review sanctions. Cap
  of 1 review + 1 re-review was reached there; rev 3 applies only
  those sanctioned fixes.

## Findings

### Blockers

None.

### Concerns

- **C-01 — no git provenance for the spec or the implementation; the
  erratum's central claim is not mechanically auditable.** The entire
  `.claude/specs/kpi-okr-governance/` directory is untracked (`??` in
  git status), so revision 2 — the plan the approving review actually
  reviewed — no longer exists anywhere; rev 3's claim "the reviewed
  plan is otherwise unchanged" can only be verified indirectly (I did:
  every pairing, command, and anchor the pass-2 review describes is
  present and consistent in rev 3, and the three erratum edits match
  the three sanctioned dispositions exactly — no evidence of scope
  smuggling). The implementation itself is likewise uncommitted (49
  modified tracked files plus untracked test/spec files in the working
  tree). **Recommendation:** commit the spec artifacts at each
  approved revision (or at minimum before/after any post-approval
  erratum) so future errata are diffable, and commit the
  implementation so the T-20 PR-based verification can actually run.
- **C-02 — T-20's verification artifact is not yet producible, but
  STATUS.md already reads `execution: complete`.** T-20's declared
  verification is "open the PR's `integration` job run in GitHub
  Actions" and the binding NFR-01 wall-time checkpoint; with nothing
  committed there is no PR, `ci.yml` is only YAML-parse-validated
  (STATUS.md AC-19 row says "first-PR checkpoint pending"). AC-19 and
  the NFR-01 budget are therefore *asserted*, not *verified*.
  **Recommendation:** keep AC-19 + NFR-01 explicitly open in STATUS.md
  (they are flagged, which is good) and treat the first PR's green
  `integration` job + recorded wall-time as a completion condition,
  not a follow-up nicety; if the job exceeds ~4 min, apply the design
  §4.8 trim levers in order, as T-20 already binds.

### Nits

- **N-01 — one residual `Blocks`/`Blocked by` asymmetry survived the
  rev-3 tidy.** T-01's `Blocks` lists T-12 (T-12 consumes
  `slaCreateRequestSchema`/`slaPatchRequestSchema` from T-01), but
  T-12's `Blocked by` lists only T-03 and T-11. Transitively safe
  (T-12 ← T-11 ← T-01) and ordering-irrelevant post-execution; tidy
  only if the file is touched again — same rule the pass-2 review set.
- **N-02 — STATUS.md metadata self-contradiction.** The header line
  `review_passes: 1` contradicts both this phase's history (pass 2/2
  recorded in STATUS's own phase table) and the prior review file's
  `review_pass: 2` frontmatter. Cosmetic; fix on the next STATUS touch.

## Completeness / Traceability

Every AC and FR mapped, cross-checked against task Steps (not just the
artifact's own table):

| AC | Task(s) | Verified |
|----|---------|----------|
| AC-01 (KPI lifecycle + v7 nibble) | T-11 | covered — lifecycle, 400-per-missing-field, v7 nibble all in T-11 Steps |
| AC-02 (kpis/slas list + include_archived) | T-11, T-12 | covered |
| AC-03 (detail/archive/audit + retired overloads 404) | T-11 | covered — DEC-01 pin in same task (DD-01 i) |
| AC-04 (measurements vs real Postgres) | T-04 | covered — `query()` row assert, `runMigrations()` in beforeAll |
| AC-05 (trends) | T-06 | covered — empty payload + seeded set + 404 + DD-04 guard |
| AC-06 (alignments, weight bound) | T-07 | covered — sanctioned tightening lands with pin (DD-01 ii) |
| AC-07 (SLA lifecycle) | T-12 | covered |
| AC-08 (breaches vs Postgres, enums) | T-05 | covered |
| AC-09 (compliance, counting fields only) | T-08 | covered — scoring formulas correctly left uncontracted |
| AC-10 (OKR CRUD + performance) | T-13 | covered |
| AC-11 (roll-down P0 flows) | T-09 | covered — flatten-mapper deletion + `issues[]` pin same task (DD-01 iii) |
| AC-12 (zod 400 envelope, all nine files) | T-04, T-05, T-07, T-09, T-11, T-12, T-13 | covered |
| AC-13 (OpenAPI enumeration) | T-15 | covered — §5-table path enumeration |
| AC-14/AC-15 (view states, jsdom) | T-17, T-19 (+T-16/T-18) | covered — vitest entry points correct; CI-gated via T-20 unit-job step |
| AC-16 (design conformance) | T-16, T-18, T-21 | covered — pinned two-invocation `--view` form (design-review N-02) |
| AC-17 (keyboard + landmarks) | T-21 (impl in T-16/T-18) | covered — shell-provided `main` verified in tree (`App.tsx:97`) |
| AC-18 (deep-link reload) | T-21 | covered |
| AC-19 (CI postgres + migrations) | T-20 | covered on paper; see C-02 — final proof pending first PR |
| AC-20 (double-run isolation) | T-21 | covered |
| AC-21 (unfiltered okr list + domains list) | T-13, T-11 | covered — decoy fixture pins string-contains semantics; `createdAt` casing note carried |

| FR / NFR | Task(s) | Verified |
|----------|---------|----------|
| FR-01…FR-09 | T-11, T-04, T-06, T-07, T-12, T-05, T-08, T-13, T-09 | covered |
| FR-10a–d | T-11, T-12, T-13, T-10 | covered — T-13 correctly RBAC-exempt per design §4.10 |
| FR-11a/b | T-01 + conversion tasks / T-02 + swap tasks | covered |
| FR-12 / FR-13 / FR-14 | T-15 / T-11+T-12 / T-04+T-05+T-11+T-12 | covered |
| FR-15 / FR-16 | T-16+T-18 / T-16…T-19+T-21 | covered |
| FR-17 / FR-18 | T-20 / T-03+T-04+T-05+T-20+T-21 | covered |
| NFR-01 | T-20 binding checkpoint + 3 ordered trim levers | covered (pending measurement — C-02) |
| NFR-02…NFR-04 | cross-cutting (zod-only via `parseWith`; typecheck after every task; no error-code additions; snake_case pinned) | covered |
| NFR-05 | T-10…T-14 — every route change paired with its `ROUTE_PERMISSIONS` edit, RBAC verified at unit level | covered; verified in `rbac-permissions.ts` |

**Blueprint conformance:** routes `#/exec/kpi-management` /
`#/exec/okr-management` match the View Tree verbatim (blueprint:125 —
"existing views, verified + tested"); no invented/renamed routes,
`pwa/src/route.ts` untouched. UX-01 (four states + jsdom pins), UX-02
(tokens-only CSS modules, catalog components, conformance script),
UX-03/UX-04 (n/a per requirements Platforms table — correct), UX-05
(tablist ARIA, focus order, shell `main` landmark), UX-06 (deep-link
reload) all carried into tasks. XD-16 (verify-then-fix stage ordering
holds: Stage 0 plumbing → pin+fix → reshape+pin → OpenAPI → views →
CI/sweep) and XD-17 (deterministic gates; DEC-01/DEC-02 + all pinned
quirks flagged for the consolidated report in T-21) honored. House
rules: zod-only, en-US identifiers, no tsc, loopback binding
untouched, auth exclusively via the central router gate +
`ROUTE_PERMISSIONS` (no per-route auth anywhere in the plan), all API
changes additive under `/api/v1/`.

**Dependency graph:** acyclic; top-to-bottom order consistent with
every `Blocked by` edge; one metadata-only asymmetry (N-01). Every
task declares a Verification with a concrete test path or a
`manual:` repro carrying input mode + observable outcome — the
completion-hook requirement is met. Complexity ratings realistic; the
T-11/T-12 4-file waiver remains well-argued (pairing rules DD-01/DD-12
genuinely make the four files inseparable).

**Done well:** the erratum discipline is exemplary — each rev-3 edit
cites the sanctioning review text, records what execution actually did
(the full-tree sweep that happened to pass), and pins the narrowed
form as binding for re-runs instead of rewriting history. The reading
guide's runner rationale (vitest vs `bun test`) and the
integration-test naming trap are exactly the kind of executable
knowledge task docs usually omit.

## Verdict

**approve.** Zero blockers. Revision 3 is a faithful application of
the pass-2 sanctioned dispositions to an otherwise-approved plan; the
executed tree matches the artifact's claims at every point checked.
C-01 (commit the spec + implementation so provenance and the T-20 PR
verification exist) and C-02 (AC-19/NFR-01 remain open until the first
green CI run) should be closed in the first PR, not deferred.
