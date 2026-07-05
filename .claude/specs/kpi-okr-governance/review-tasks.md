---
feature: "kpi-okr-governance"
reviewing: "tasks"
reviewing_revision: 4
reviewing_requirements_revision: 2
reviewing_design_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
note: >
  Fresh cold review of tasks.md revision 4 (the second post-execution
  erratum). Supersedes the on-disk rev-3 fresh review (approve, 0
  blockers, C-01/C-02 + N-01/N-02), which is preserved in git at HEAD
  (dae362e) — this time the superseded review IS mechanically
  recoverable, unlike the situation its own C-01 flagged.
---

# Review: kpi-okr-governance / tasks (revision 4, fresh pass 1/2)

## Verdict

**approve** — zero blockers. Revision 4 is a metadata-only erratum
whose diff against the committed revision 3 I verified mechanically
(23 insertions / 3 deletions, exactly the four declared dispositions);
the plan itself remains sound against requirements rev 2, design rev 2,
and the blueprint, and every claim I spot-checked against the executed
tree holds. Two concerns carry forward as first-PR completion
conditions; two nits are stale-wording/metadata residue.

## Scope of this review

Revision 4 dispositions the rev-3 fresh review's findings after
execution completed (T-01…T-21, 2026-07-04). The questions are:

1. **Does rev 4 stay inside the sanctioned envelope?** Yes — and this
   time it is auditable, not just arguable. Revision 3 is committed at
   HEAD (`dae362e`), so `git diff HEAD -- tasks.md` shows the entire
   rev-3→rev-4 delta: the frontmatter revision bump, the "Revision 4"
   erratum section, and one dependency-metadata edit (T-12
   `Blocked by` += T-01). That maps one-to-one onto the declared
   dispositions: C-01/C-02 = no plan change (carried to STATUS.md
   **Next**), N-01 = the T-12 edit (sanctioned by the standing "tidy
   only if the file is touched again" rule), N-02 = a STATUS.md edit
   (verified: `review_passes: 0` with the per-phase-counter comment now
   sits in the STATUS header). No scope, ordering, or verification
   change anywhere in the diff.
2. **Is the plan sound?** Re-derived cold — see the traceability
   section. Same 21 tasks, same stage ordering (plumbing → pin+fix →
   reshape+RBAC → OpenAPI → views → CI/sweep = the XD-16
   verify-then-fix mandate), acyclic dependency graph, every task
   carrying a concrete Verification (test path or `manual:` repro with
   input mode + observable outcome).
3. **Do the artifact's claims match the tree?** Spot checks all pass:
   - `api/src/routes/_helpers.ts:84` `parseWith`; `api/src/router.ts:284`
     `ZodError` backstop branch (T-02).
   - `shared/src/schema/kpi-sla.ts:155-227` — all nine T-01 request/query
     schemas exported, incl. the documentation-only `listQuerySchema`.
   - `scripts/test-integration.sh` carries the ROOT-anchored `.env`
     sourcing verbatim per the pinned design-review N-01 decision (T-03).
   - All 10 integration test files + `rbac-route-permissions.test.ts`
     exist under `api/__tests__/`; describes carry the mandatory
     `integration: ` prefix (`kpi-crud.integration.test.ts:64`).
   - `api/src/auth/rbac-permissions.ts`: all 7 added entries present
     (`:178` domains, `:196-198` KPI trio, `:205-207` SLA trio incl.
     `:205 P("GET","slas","sla:read")`); the stale
     `P("POST","kpis/:id")` / `P("POST","slas/:id")` overload rows are
     gone — the DD-12 route↔RBAC same-task pairing held (T-10/T-11/T-12).
   - `api/src/routes/openapi.ts:86` `export const errorEnvelopeSchema`
     + `:80` import of `registerKpiOkrPaths` — the pinned design C-01
     export decision landed as specified (T-15).
   - `api/src/routes/okr-crud.ts:127` carries the byte-for-byte
     string-contains predicate ordering by `n.createdAt` (T-13, AC-21).
   - `api/src/routes/kpi-crud.ts`: `generateId` (`:43`, FR-14) +
     `z.string().uuid()` guard (`:24`, DD-04).
   - `.github/workflows/ci.yml`: `postgres:16-alpine` service,
     `POSTGRES_URI`, `cd api && bun run …/run-migrations.ts`, the
     hard-asserted healthz boot, and the sanctioned unit-job step
     (`bunx vitest run` on exactly the two pin files,
     `working-directory: pwa`) all present (T-20). Note the boot step
     runs `bun run src/server.ts`, not the design's literal
     `bun run start` — a recorded execution deviation (STATUS.md
     "Execution deviations (2)"), already queued as a design-doc
     amendment in STATUS **Next** item 3; not a tasks.md defect.
   - `pwa/src/App.tsx:97` `<main className={styles.main}>` — the
     shell-provided landmark claim (T-16/T-18/T-21) is accurate, and
     dropping line-number citations was the right call (it has drifted
     94→93→97 across revisions exactly as predicted).
   - Zero `api.cypher` matches in either owned view;
     `error-scenarios/exec/` indeed also holds
     `finance/ ops/ people/ risk/ transform/` — the T-21 narrowed
     sweep scope remains justified.
   - `shared/package.json:12` `"./schema/kpi-sla"` exports entry —
     execution deviation (1), recorded in STATUS.

## Blockers

none

## Concerns

- **C-01 — terminate the erratum → fresh-review → erratum loop.** The
  tasks phase consumed its 1+1 review cap at revision 2. Since then:
  rev 3 (erratum) → out-of-band fresh review → rev 4 (erratum) → this
  out-of-band fresh review. Findings are strictly converging (1B+3C+3N
  → 1C+2N → 2C+2N metadata/process-only → this review's 2C+2N), and
  each erratum has been faithful to its sanctions — but note that rev 4
  itself is self-licensing: the rev-3 review required **no** tasks.md
  change (C-01/C-02 "no plan change", N-01 "only if touched again",
  N-02 a STATUS edit), so the file was touched solely to record
  dispositions, and that touch then licensed the N-01 tidy. Harmless
  and transparent here, but the pattern regenerates review work with
  zero plan effect. **Recommendation:** treat this review as terminal
  for tasks.md absent a substantive change (scope, ordering, or
  verification). Do NOT cut a revision 5 to disposition the findings
  below — the two concerns already live in STATUS.md **Next**, and the
  nits fall under the standing "only if touched again *for another
  reason*" rule.
- **C-02 — AC-19 / NFR-01 remain asserted, not verified (carried from
  the rev-3 review, still true, scope now narrower).** The
  implementation and `ci.yml` are now **committed** at `dae362e` —
  which resolves the provenance half of the rev-3 review's C-01 — but
  no PR exists and the GitHub Actions `integration` job has never run,
  so T-20's declared verification ("open the PR's `integration` job…
  record wall-time") is still unproducible and the NFR-01 <5-min
  budget is unmeasured. STATUS.md correctly keeps both open as
  first-PR completion conditions (Next items 1–2).
  **Recommendation:** raise the PR; confirm the postgres service,
  migration "applied" logs, hard-asserted boot, and green suites;
  record wall-time in the PR description; apply the design §4.8 trim
  levers in order if > ~4 min.

## Nits

- **N-01 — the rev-4 C-01 disposition text is stale against the tree
  it ships in.** It restates the rev-3 review verbatim: "the spec
  directory and the implementation are uncommitted, so superseded plan
  revisions are not mechanically diffable". At rev-4 review time this
  is half-false: the spec directory, the implementation, and revision 3
  itself are committed at HEAD (`dae362e`); only the rev-4 edits to
  `STATUS.md`/`review-design.md`/`tasks.md` are uncommitted, and the
  rev-3→rev-4 delta IS mechanically diffable (this review diffed it).
  What genuinely remains open is the PR/CI half (C-02 above). Reword
  only if the file is touched again for another reason.
- **N-02 — "Last `Blocks`/`Blocked by` asymmetry tidied" overclaims:
  one residue survives.** T-02's `Blocks` lists T-12 (T-12's route file
  consumes `parseWith`), but T-12's `Blocked by` reads
  "T-01, T-03, T-11" — no T-02. Transitively implied via T-11 ← T-02
  and ordering-irrelevant post-execution; same standing rule — tidy
  only on a substantive touch. (Full symmetry sweep of all 21 tasks
  found no other residue.)

## Completeness / Traceability

Re-derived cold from task Steps (not just the artifact's own table),
against requirements rev 2:

| AC | Task(s) | Verified |
|----|---------|----------|
| AC-01 (KPI lifecycle + v7 nibble) | T-11 | covered — lifecycle, per-missing-field 400s, v7 nibble in Steps |
| AC-02 (kpis/slas list + include_archived) | T-11, T-12 | covered |
| AC-03 (detail/archive/audit + retired overloads 404) | T-11 | covered — DEC-01 pin lands in-task (DD-01 i) |
| AC-04 (measurements vs real Postgres) | T-04 | covered — `query()` row assert + `runMigrations()` |
| AC-05 (trends: empty/seeded/404 + DD-04 guard) | T-06 | covered |
| AC-06 (alignments, weight [0,1]) | T-07 | covered — sanctioned tightening with in-task pin (DD-01 ii) |
| AC-07 (SLA lifecycle) | T-12 | covered |
| AC-08 (breaches vs Postgres, enums) | T-05 | covered |
| AC-09 (compliance counting fields only) | T-08 | covered — formulas correctly uncontracted |
| AC-10 (OKR CRUD + okr-performance) | T-13 | covered |
| AC-11 (roll-down P0 flows + rejection table) | T-09 | covered — flatten-mapper deletion + `issues[]` pin in-task (DD-01 iii) |
| AC-12 (zod 400 envelope, all nine files) | T-04, T-05, T-07, T-09, T-11, T-12, T-13 | covered |
| AC-13 (OpenAPI path enumeration) | T-15 | covered |
| AC-14 / AC-15 (view states, jsdom) | T-17, T-19 (+ T-16/T-18) | covered — vitest entry points correct; CI-gated via T-20 unit-job step |
| AC-16 (design conformance) | T-16, T-18, T-21 | covered — pinned two-invocation `--view` form |
| AC-17 (keyboard + landmarks) | T-21 (impl T-16/T-18) | covered — shell `<main>` verified at `App.tsx:97` |
| AC-18 (deep-link reload) | T-21 | covered |
| AC-19 (CI postgres + migrations) | T-20 | covered on paper — final proof pending first PR (C-02) |
| AC-20 (double-run isolation) | T-21 | covered (executed; the Bun.sleep(2) hardening is a recorded test-side fix) |
| AC-21 (unfiltered okr list + domains list) | T-13, T-11 | covered — decoy fixture pins string-contains; `createdAt` casing carried |

| FR / NFR | Task(s) | Verified |
|----------|---------|----------|
| FR-01…FR-09 | T-11, T-04, T-06, T-07, T-12, T-05, T-08, T-13, T-09 | covered |
| FR-10a–d | T-11, T-12, T-13, T-10 | covered — T-13 correctly RBAC-exempt per design §4.10 |
| FR-11a/b | T-01 + conversion tasks / T-02 + swap tasks | covered |
| FR-12 / FR-13 / FR-14 | T-15 / T-11+T-12 / T-04+T-05+T-11+T-12 | covered |
| FR-15 / FR-16 | T-16+T-18 / T-16…T-19+T-21 | covered |
| FR-17 / FR-18 | T-20 / T-03+T-04+T-05+T-20+T-21 | covered |
| NFR-01 | T-20 binding checkpoint + 3 ordered trim levers | covered — measurement pending (C-02) |
| NFR-02…NFR-04 | cross-cutting (zod-only via `parseWith`; typecheck checkpoint after every task; additive-only under `/api/v1/`; snake_case pinned) | covered |
| NFR-05 | T-10…T-14 — every route change paired with its `ROUTE_PERMISSIONS` edit; unit-verified (T-14) | covered — verified in `rbac-permissions.ts` |

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches a task | pass |
| Every AC is closed by a task with Verification | pass |
| Routes/views match the blueprint View Tree verbatim | pass — `#/exec/kpi-management` / `#/exec/okr-management` (blueprint round-4 rows, "existing views, verified + tested"); `pwa/src/route.ts` untouched; no invented/renamed routes |
| UX-* allowances covered | pass — UX-01 (four states + jsdom pins), UX-02 (tokens-only modules + catalog + conformance script), UX-03/04 n/a per requirements Platforms table, UX-05 (tablist ARIA, focus order, shell `main`), UX-06 (deep-link reload) |
| XD-* honoured | pass — XD-16 verify-then-fix stage ordering; XD-17 deterministic gates + DEC/quirk flags consolidated in T-21; XD-02 split-brain documented-not-fixed (DD-05, per final arbitration) |
| No file ownership conflict with another spec | pass — §4.9 co-ownership sections respected; sanctioned narrow touches only (router blocks, domain-crud list handler, openapi 2-line+export hook, rbac sections, pwa/api.ts methods) |
| Dependency order acyclic, top-to-bottom | pass (one metadata asymmetry, N-02) |
| Every task has a Verification artifact | pass — test path or `manual:` repro with input mode + observable outcome on all 21 |

## Summary

- **Solid:** the erratum discipline continues to be exemplary — and
  rev 4 is the first revision whose envelope is provable by `git diff`
  rather than by reconstruction, because the checkpoint commit landed.
  The executed tree matches the artifact at every point checked (RBAC
  pairings, pinned predicates, CI yaml, shell landmark, schema exports).
- **Common thread of the findings:** nothing wrong with the plan —
  both concerns are process-lifecycle items (stop cutting revisions to
  disposition reviews; get the first PR up so AC-19/NFR-01 move from
  asserted to verified), and both nits are wording/metadata residue of
  the erratum chain itself.
- **Do first:** raise the PR (closes C-02 and the STATUS **Next**
  items in one motion). Do not touch tasks.md again for this review.
