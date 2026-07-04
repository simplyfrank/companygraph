---
feature: "kpi-okr-performance-dashboards"
artifact: "tasks.md (revision 2)"
reviewer: "spec-review-agent (fresh — did not author)"
verdict: "approve"
reviewed_at: "2026-07-04"
reviews_requirements_revision: 2
reviews_design_revision: 2
review_pass: "2 of at most 2"
---

# Tasks review (pass 2): kpi-okr-performance-dashboards

Reviewed cold against `requirements.md` (rev 2), `design.md` (rev 2),
`.claude/CLAUDE.md`, and the as-built code — re-verifying every claim the
revision-2 change table makes. Confirmed against real files:

- `.github/workflows/ci.yml:23` — the `unit` job runs PWA vitest via **explicit
  file enumeration** (`bunx vitest run src/__tests__/exec-kpi-management.test.tsx
  src/__tests__/exec-okr-management.test.tsx`, `working-directory: pwa`), exactly
  as T-19 describes; new files are genuinely never auto-discovered.
- `api/src/router.ts:803-804` — `// Graph analytics routes` block with
  `sub === "analytics/graph" && method === "GET"`; `sub` is
  `path.slice("/api/v1/".length)` matched by full-string equality (router.ts:375),
  so a three-segment `sub === "analytics/performance/kpis"` literal dispatches
  correctly.
- `api/src/auth/rbac-permissions.ts:31-32` — `analytics:read` precedent
  (`P("GET","analytics/graph","analytics:read")`).
- `pwa/src/route.ts:68-76` — the `exec` surface `tabs` array ends at
  `{ id: "okr-management", … }`; the append point is real.
- `api/src/routes/roll-down.ts` — the OKR topology is verbatim as designed:
  `RollDown {type:'okr'}` → `FOR_OKR` → `OKRDirective`; `HAS_ASSIGNMENT` →
  `RollDownAssignment` → `FOR_DOMAIN` → `Domain`; assignment carries `weight`
  (`z.number().min(0).max(100)`, roll-down.ts:40/127/136) — there is **no**
  `contribution` property; `status:'pending'` on CREATE; `RollDownAdjustment`
  carries a `roll_down_id` property (not an edge).
- `shared/src/schema/system-kind.ts:9-15` — `SYSTEM_KINDS` and
  `SYSTEM_KIND_LABELS` both exported.
- `.claude/specs/kpi-okr-governance/tasks.md` — the T-20 CI-scoping precedent
  the revision cites is real, and the `ci.yml` comment in the repo attributes
  the existing enumerated step to that exact `kpi-okr-governance` T-20 / review
  C-02 fix.

The topology fidelity, RBAC same-task pairing, four status literals,
`attributes_json CONTAINS $domainId` inheritance, APOC availability, and the
vitest/integration naming constraints all check out against real code, as in
pass 1.

## Resolution of pass-1 findings

- **~~B-01~~ → resolved.** Pass 1 blocked because the two PWA vitest files
  (T-15, T-16) were the only automated verification for AC-08/09/11(auto)/12(auto)
  and nothing wired them into the merge gate. Revision 2 adds **T-19**, which
  appends exactly those two owned files to the `ci.yml:23` enumerated `vitest run`
  line — scoped to the two files, explicitly **not** a whole-suite `vitest run`
  (mirroring `kpi-okr-governance` T-20's scoping to avoid dragging in the
  un-triaged legacy `error-scenarios` tree). The AC→task table's new "CI-gated"
  column flips AC-07/08/09/11/12's automated legs to **yes**; T-15/T-16
  traceability and the Validation-checkpoints table now state the CI gate. T-19
  `Blocks: T-18`, and T-18's completion gate re-checks that the `ci.yml`
  enumeration lists both files. The `.github/workflows/ci.yml` File-Changes
  addition is surfaced (revision preamble + pinned-flags). Verified: spec-guard
  will not block this edit (below).
- **~~C-01~~ → resolved.** T-03 and T-04 now carry an explicit note that
  `bun run typecheck` is a transpile (`bun build … --no-bundle`), not a behavior
  check, and that the APOC-only Cypher (`apoc.convert.fromJsonMap`, the
  `{kindFilter}` subquery) is proven only by the paired integration test
  (T-07/T-08 for T-03; T-09 for T-04). The Validation-checkpoints table repeats
  the caveat.
- **~~C-02~~ → resolved.** The T-14 4-file view-wiring waiver
  (`PerformanceDashboard.tsx` + `.module.css` + `route.ts` + `views/index.tsx`)
  is now surfaced in a dedicated **"Pinned flags for the phase gate"** section
  for STATUS.md, not only in the task body, with the `kpi-okr-governance` N-02
  precedent named.
- **~~C-03~~ → resolved.** T-07 (AC-14) and T-09 (two-read budget) now pin the
  exact spy seam: wrap `getDriver().session` and assert on the returned session
  object's `run` call count summed across sessions opened during one request
  (and the Postgres `query` singleton the same way), restoring in `afterEach` —
  explicitly not a naked per-`session` spy that would miss a second session or
  double-count a reused one.
- **N-01/N-02 → correctly held (no change).** The T-02→T-03→T-04 same-file
  serialization via the `Blocked by` chain and the T-17 platform-cell match are
  sound.
- **N-03 → resolved.** An NFR→task table (NFR-01/02/05) was added.

## Verification of the one residual risk from B-01's fix

The pass-1 recommendation warned that adding `.github/workflows/ci.yml` to the
touched set might require the design's permission surface (§7 File Changes) to
be regenerated, since design.md §7 does **not** list `ci.yml` and the tasks
author cannot edit the approved design. I checked the actual enforcement:

- `design.md` §7 does not contain `.github/workflows/ci.yml` (confirmed).
- `.claude/hooks/spec-guard.sh` allows an edit if the path matches an
  allow-glob **or** is referenced by an approved spec's `design.md` **or
  `tasks.md`**.
- Two independent allow paths cover `ci.yml`: (1) the `.specconfig`
  `allow_globs` list includes `.github/*`, and (2) spec-guard.sh has a hard
  safety net that unconditionally `exit 0`s on `.github/*` before it ever
  reaches the source-file gate. `.github/workflows/ci.yml` is therefore
  **never** gated regardless of the design table.
- Independently, T-19 names the path in `tasks.md`, so even the spec-referenced
  path check would pass.

So the tasks' cautious hedging ("if the design's permission surface is
regenerated for Phase C, add `.github/workflows/ci.yml`…") is over-conservative
but harmless: the edit will not be blocked at execution time. This closes the
one loose thread the B-01 fix could have left. Recorded as N-01 below (optional
cleanup, not required for approval).

## Nits (optional, non-blocking)

### N-01 — The `ci.yml` "design permission surface" hedging is unnecessary
`spec-guard.sh` unconditionally allows `.github/*` (hard safety net + the
`.specconfig` `allow_globs` entry), so T-19's edit to `.github/workflows/ci.yml`
is never gated and the design §7 table does not need `ci.yml` added for the edit
to land. The revision's repeated "one design-touch this revision requires /
regenerate the permission surface" framing (preamble + pinned-flag) can be
softened to a one-line "additive CI step; not spec-guard-gated." No functional
consequence — the task lands either way.

### N-02 — T-19 physical placement vs. numbering
T-19 appears in the file between T-16 and T-17 (correct by dependency:
`Blocked by: T-15, T-16` → `Blocks: T-18`), so the "tasks execute top-to-bottom"
reading-guide invariant holds, but the numbering is non-monotonic (…T-16, T-19,
T-17, T-18). Harmless; an executor following `Blocked by`/`Blocks` gets the
right order. Optional: renumber, or add a one-line note that T-19 is placed by
dependency, not by number.

## Completeness / Traceability — AC → task

| AC | Task(s) | Automated gate | In CI? | Notes |
|----|---------|----------------|--------|-------|
| AC-01 | T-02 (pure fn), T-07 (e2e) | `bun test` + integration | yes | both legs present |
| AC-02 | T-07 | integration | yes | domain/journey narrow + unknown-id→empty |
| AC-03 | T-08 | integration | yes | inclusive-any + all-slice coercion; monochrome-seed worked around with fixtures |
| AC-04 | T-09 | integration | yes | four literals, `weight` (not `contribution`), adjustment node, two-read spy — matches real topology |
| AC-05 | T-10 | integration | yes | journeys PART_OF domain |
| AC-06 | T-13, T-06 | integration + unit | yes | path enum + 400/coercion + RBAC null-hole |
| AC-07 | T-15 (auto), T-17 (manual) | vitest | **yes (T-19)** | ~~was NO in pass 1~~ — auto leg now gated |
| AC-08 | T-15 | vitest | **yes (T-19)** | loading/error/ready |
| AC-09 | T-15 | vitest | **yes (T-19)** | empty variants |
| AC-10 | T-14, T-18 | design-conformance CLI | yes | token/catalog gate |
| AC-11 | T-16 (auto), T-17 (manual) | vitest | **yes (T-19)** | a11y auto leg now gated; `<main>` from App.tsx |
| AC-12 | T-15 (auto), T-17 (manual) | vitest | **yes (T-19)** | slice click-path + sparkline |
| AC-13 | T-18 | typecheck + `git diff` | yes | transpile + ownership |
| AC-14 | T-07 | integration | yes | query-count proxy; spy seam now pinned (C-03) |

Every AC maps to at least one task; every task declares a concrete verification
(test path or `manual:` repro with input mode + observable outcome), so the
completion-hook requirement is met. The pass-1 systemic gap (four ACs gated only
by ungated PWA vitest) is closed by T-19.

### NFR coverage
NFR-01 (read-only), NFR-02 (house rules / RBAC via central gate), NFR-05
(systemKind imported not re-declared) are now tabulated in the tasks' NFR→task
table and enforced by the reading-guide read-only contract, T-05/T-06 RBAC, and
T-01/T-08/T-14 import discipline. NFR-03 is proxied by AC-14 (T-07); NFR-04
snake_case is enforced by the T-01 schemas + T-03 rename discipline.

### Design-element → task coverage (spot check)
- §3.2 zod schemas → T-01 (incl. export-map wiring). §4.1 dispatch +
  `resolveSlice` → T-03 + T-05 (RBAC same-task pairing). §4.2/4.3 KPI + kind →
  T-03. §4.4 journeys → T-05. §4.5 OKR two-read → T-04. §4.6 OpenAPI → T-11.
  §4.7 co-owned files → distributed narrow additive sections across
  T-01/T-05/T-11/T-12/T-14. §6 view → T-12 (client) + T-14 (view/tab/factory).
  All present; no design element without a task; no task serves a phantom
  element.

## House-rule / blueprint conformance
- View Tree verbatim: `#/exec/performance` → `PerformanceDashboard`, appended
  after `okr-management` (route.ts:76). Correct.
- FILE-OWNERSHIP: T-14 appends exactly one exec-tab row, no `#/model/*` touch;
  T-18 ownership diff asserts no governance-owned or `#/model/*` change. Single
  clean owner for the `#/exec/performance` row. Correct.
- Read-only / additive / no `/api/v2/` / no `ERROR_CODES` add / auth via central
  gate + `api/src/auth/` (never per-route): honored (DD-01, T-05 RBAC section).
- zod-only, en-US, systemKind imported not re-declared: T-01/T-08/T-14.
- Dependency graph acyclic; T-18 is the terminal completion gate depending on
  both T-17 (manual sweep) and T-19 (CI wiring). No cycle.
- No blueprint / CLAUDE.md conflict found.

## Verdict

**approve** — the one pass-1 blocker (B-01) is fully and correctly resolved by
T-19, with the CI enumeration point, the `kpi-okr-governance` T-20 scoping
precedent, and the AC→CI-gating flip all verified against real files. The three
pass-1 concerns (C-01 typecheck-is-not-behavior, C-02 4-file waiver surfaced,
C-03 spy seam pinned) are addressed. I additionally confirmed the residual risk
from the B-01 fix — that `ci.yml` is absent from design §7 — is a non-issue:
`spec-guard.sh` unconditionally allows `.github/*`, so the T-19 edit will land.
Two optional nits (N-01 over-cautious `ci.yml` framing; N-02 non-monotonic task
numbering) do not affect execution. Ready for Phase C.
