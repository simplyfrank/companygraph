---
feature: "kpi-okr-performance-dashboards"
artifact: "tasks.md (revision 5)"
reviewer: "spec-review-agent (fresh — did not author)"
verdict: "approve"
reviewed_at: "2026-07-05"
reviews_requirements_revision: 3
reviews_design_revision: 3
review_pass: "2 of at most 2 (2026-07-05 cycle; supersedes this cycle's pass-1 revise verdict previously at this path)"
---

# Tasks review (2026-07-05 cycle, pass 2): kpi-okr-performance-dashboards

Cold re-review of tasks.md revision 5 against requirements rev 3, design
rev 3, the blueprint (View Tree / XD-02 as amended / UX-*), and current
repo state. Revision 5's stated scope — task-text-only changes resolving
the pass-1 findings, no task added/removed/renumbered, no AC-mapping or
dependency change — checks out: the task list is still T-01..T-19, the
AC→task and NFR→task tables are unchanged, and the dependency graph is
identical to the approved rev-4 graph.

## Pass-1 findings — resolution check

- **~~B-01~~ → resolved.** T-19 is restated append-only: the two owned
  files are appended to the end of the `unit` job's PWA `vitest run`
  enumeration "whatever files that line carries at execution time"; the
  stale two-file/four-file full-line literals are gone; the `ci.yml:23`
  line-number cite is replaced by the stable anchor (the
  `working-directory: pwa` `vitest run` step in the `unit` job — verified
  present, currently `ci.yml:25-26`); an explicit "do not paste a
  full-line literal from this document" instruction closes the exact
  failure mode. The never-remove clause now also appears in T-18's CI-gate
  check ("in addition to every pre-existing entry — none removed"), in
  T-19's own verification, in the pinned-flags T-19 row (co-owned line,
  FILE-OWNERSHIP), and in the validation-checkpoints table. The Revision 2
  history row is retained and correctly tagged "(enumeration has since
  grown; T-19 as amended governs)". Verified against the repo: the
  enumeration currently carries exactly the five entries rev 5 says it
  does (two `kpi-okr-governance`, three `story-spec-core`), and the
  adjacent scoping comment T-19 references exists (`ci.yml:20`). The
  append-only wording is robust to further growth before execution.
- **~~C-01~~ → resolved.** The reading guide's new "Execution
  preconditions" bullet pins that the orchestrator re-stamps
  requirements rev 3 (`status: revised` → `approved`, recorded in
  STATUS.md) **before T-01 begins**, with the correct rationale (stamp
  gap, not content gap; no content re-review). Verified:
  requirements.md rev 3 still carries `status: "revised"` and STATUS.md
  still says "awaiting orchestrator re-stamp" — see Concern C-01 below
  (the pin is right; the action itself is still outstanding).
- **~~C-02~~ → resolved.** T-18's AC-13 ownership check is
  baseline-pinned: `execution_baseline: <sha>` recorded in STATUS.md
  before T-01 (preconditions bullet 2), evaluation via
  `git log --name-only <baseline>..HEAD` on this spec's commits (or
  `git diff <baseline>..HEAD` on a clean spec-only branch). The bare
  `git diff --name-only` wording is gone from T-18 and from its
  verification line and the checkpoints table.
- **~~N-01~~ → resolved.** T-14 now anchors by "the last row of the exec
  `tabs` array" instead of `route.ts:76`. Verified: `okr-management` is
  currently at `route.ts:86` and is still the last exec tab, so the
  anchor rule carries. Retained cites re-verified still exact this pass:
  `driver.ts:36` (`_resetDriver`), `App.tsx:97` (`<main>`),
  `rbac-permissions.ts:32` (`P("GET","analytics/graph","analytics:read")`).
- **~~N-02~~ → resolved.** T-09's count leg carries the edge-case pin:
  two-read shape asserted on fixtures with ≥ 1 directive; an empty
  Read A may legitimately short-circuit Read B (mirroring T-03's
  empty-id-set rule) and is not a budget violation.
- **~~N-03~~ → declined, acceptably.** The revision-history preambles are
  retained with a reasoned rationale (inline `Resolves:` tags anchor into
  them; STATUS.md carries the summary). A nit decline with rationale is
  within the author's discretion.

## Blockers

None.

## Concerns

### C-01 — The two execution preconditions are pinned but not yet performed
tasks.md rev 5 correctly conditions T-01 on (1) the requirements rev-3
re-stamp to `approved` and (2) recording `execution_baseline: <sha>` in
STATUS.md — but as of this review neither has happened:
`requirements.md` still reads `status: "revised"` and STATUS.md has no
`execution_baseline`. This is orchestrator housekeeping, not an artifact
defect, and the artifact now makes it impossible to miss.
**Recommendation:** the orchestrator performs both steps and records
them in STATUS.md before authorizing T-01; the phase gate should refuse
execution start otherwise.

### C-02 — STATUS.md describes revision 4 and the prior cycle; update before execution
STATUS.md's Tasks row, artifact list, and review_passes counter still
describe tasks.md rev 4 and the rev-3-cycle reviews ("tasks:approved",
"rev 4, status approved", "cap 2/2 reached" for the *previous* cycle).
With rev 5 and this new cycle's two passes now on record, a reader of
STATUS.md alone would execute against a stale description of the
governing artifact. **Recommendation:** on adopting this verdict, the
orchestrator updates STATUS.md to name tasks rev 5, this cycle's pass-1
(revise) and pass-2 (approve) outcomes, and the two preconditions from
C-01 — one bookkeeping edit, no re-review.

## Nits

### N-01 — Frontmatter carries both this cycle's `addresses_review` and the prior cycle's `post_approval_tidy`
Lines 9-11 of the frontmatter stack three generations of provenance
(`addresses_review` for this cycle, `post_approval_tidy` quoting the
*previous* cycle's pass-2 approve, `addresses` for the rev-3 repoint). All
accurate, but a skim can misread `post_approval_tidy`'s "pass-2 (approve,
0 blockers)" as this cycle's outcome. Optional: prefix it
"(rev-3 cycle)" the way the history sections already do.

### N-02 — T-19's "at this writing it carries five entries" will itself go stale
Harmless — the same sentence already says "other specs may have appended
more by execution time" and the append-only rule is count-independent —
but the concrete count is the one remaining statement in T-19 that decays.
Optional: drop the count, keep the ownership attribution.

## Completeness / Traceability

### AC → task (all 14 ACs from requirements rev 3 covered; unchanged from rev 4)

| AC | Task(s) | Verification artifact | Sound? |
|----|---------|----------------------|--------|
| AC-01 status computation | T-02 (pure fn) + T-07 (HTTP e2e) | `performance-status.test.ts` + `performance-kpis.integration.test.ts` | yes |
| AC-02 domain/journey slice | T-07 | integration, CI | yes |
| AC-03 systemKind inclusive-any | T-08 | integration, CI | yes |
| AC-04 OKR literals + adjustment + two-read | T-09 (behavior HTTP e2e; count leg in-process, ≥ 1-directive pin) | integration, CI | yes |
| AC-05 journey axis | T-10 | integration, CI | yes |
| AC-06 OpenAPI + 400/coercion | T-13 + T-06 (RBAC companion) | integration + unit, CI | yes |
| AC-07 deep link survives reload | T-15 (CI via T-19 append-only) + T-17 manual (macOS Chrome, mouse) | vitest + manual | yes |
| AC-08 loading/error/ready | T-15 | vitest, CI via T-19 | yes |
| AC-09 empty variants | T-15 | vitest, CI via T-19 | yes |
| AC-10 design-conformance | T-14 + T-18 | CLI | yes |
| AC-11 keyboard/a11y | T-16 (auto) + T-17 (manual Safari, incl. relocated `<main>` check) | vitest + manual | yes |
| AC-12 click path + sparkline | T-15 + T-17 (Chrome mouse + iPhone Safari touch) | vitest + manual | yes |
| AC-13 transpile + ownership | T-18 (baseline-pinned diff) | CLI + `git log <baseline>..HEAD` | yes — C-02 (pass 1) closed |
| AC-14 query-count invariant | T-07 in-process count leg + static no-import test | integration + unit, CI | yes |

NFR→task table present (NFR-01/02/05; NFR-03 proxied via AC-14). Every
task declares a verification artifact (test path or `manual:` repro with
input mode + observable outcome) — completion-hook requirement met. No
task exceeds 3 files except T-14's recorded 4-file view-wiring waiver
(pinned flag; precedent `kpi-okr-governance` N-02). Dependency graph
acyclic; `Blocks`/`Blocked by` symmetric; physical order
(…T-15, T-16, T-19, T-17, T-18) satisfies every `Blocked by` under the
top-to-bottom rule.

### Blueprint / house-rule conformance (spot re-verified against code this pass)

- **View Tree verbatim:** `#/exec/performance` → `PerformanceDashboard`
  (blueprint:122/131, owner column matches); T-14 appends after
  `okr-management`, confirmed still the last exec tab (`route.ts:86`),
  now anchored by row not line number. No invented or renamed route.
- **XD-02 as amended / DEC-03:** Neo4j `:KPIMeasurement` only; zero
  Postgres statically pinned by `performance-no-postgres-import.test.ts`
  (modeled on the existing `analytics-no-write-imports.test.ts`,
  verified present), gated by CI `unit` with no ci.yml change.
- **Auth via central gate:** T-05 same-task pairing of router dispatch +
  `ROUTE_PERMISSIONS`; mirror entry
  `P("GET","analytics/graph","analytics:read")` verified at
  `rbac-permissions.ts:32`; T-06's null-hole unit test load-bearing.
- **Catalog components real:** `KpiCard` at
  `pwa/src/components/charts/KpiCard.tsx` with tone union exactly
  `good|warn|danger|neutral` (line 8); `LineChartCard` exported from
  `charts/index.ts`; `ViewHeader`/`Loading`/`ErrorState` in
  `views/_shared.tsx`; `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` in
  `shared/src/schema/system-kind.ts`; `parseWith` at `_helpers.ts:84`.
- **CI reality:** the `unit` job's PWA `vitest run` enumeration carries
  the five entries T-19 attributes (two governance, three
  story-spec-core) with the scoping comment adjacent; the
  `working-directory: pwa` anchor is unique in the job. T-19's
  append-only rule is executable against this state and any grown state.
- **UX allowances:** UX-01 states in T-14/T-15 (loading/error/ready +
  both empty variants); UX-02 tokens-only + catalog-first + AC-10 gate;
  UX-05 in T-16/T-17 (keyboard, `aria-pressed`, text-not-color, `<main>`
  landmark relocated to the manual Safari leg with rationale); UX-06
  URL-first in T-14/T-15/T-17. Platform/input-mode cells match the
  requirements AC columns verbatim.
- `api/src/routes/performance.ts` does not exist yet (correct — T-02
  creates it); tasks.md ends cleanly (prior EOF residue gone).

## Verdict

**approve** — zero blockers. The pass-1 blocker (stale T-19 literal that
would have stripped story-spec-core's CI gates) is fully resolved with an
append-only, anchor-based edit rule that cannot go stale the same way,
and both pass-1 concerns are pinned into executable preconditions. The
two remaining concerns are orchestrator bookkeeping (perform the
pinned preconditions; refresh STATUS.md to rev 5), not artifact changes.
The review cap for this cycle (2/2) is now reached; the nits are optional
and may be folded into execution-time housekeeping without another pass.
