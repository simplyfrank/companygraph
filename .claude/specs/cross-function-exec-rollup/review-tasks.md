---
feature: "cross-function-exec-rollup"
artifact: "tasks.md (revision 1)"
reviewing: "tasks"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of at most 2"
upstream: "requirements.md rev 2 (approved), design.md rev 1 (approve, pass 2)"
---

# Review: cross-function-exec-rollup — tasks.md (rev 1)

Reviewed cold against `requirements.md` rev 2, `design.md` rev 1,
`blueprint-saas-operator.md` (View Tree + XD-*/UX-*), `.claude/CLAUDE.md`, and the
as-built codebase. Every load-bearing line-number / symbol / precedent the tasks
cite was verified against the tree.

## Verification of cited claims (all confirmed)

| Claim in tasks.md | Reality | Verdict |
|-------------------|---------|---------|
| `computeKpiStatus` exported at `performance.ts:50` | `api/src/routes/performance.ts:50` | ✅ |
| `DOMAIN_FILTER` / `PART_OF*1..2 ->(:Domain {id:$domain})` at `performance.ts:131-135` | confirmed `:131`, `:135` | ✅ |
| `LATEST_MEASUREMENT_CYPHER` at `performance.ts:170` | `:170` | ✅ |
| `handleRiskRegisterList` returns `ok({ data: risks })` at `risk-register.ts:110` | `:44` handler, `:110` return | ✅ |
| `aggregation/{domain,summary}` omit per-cell grid + rows | `:291`/`:366`, return bucketed counts | ✅ |
| `handleSlaComplianceAllGet` at `sla-compliance.ts:351`, returns every SLA **with `domain_id`, incl. null** | `:351`; `RETURN … s.domain_id`, no `domain_id` filter — surfaces null rows | ✅ (B-01 resolution sound) |
| `handleSlaComplianceByDomainGet` filters `MATCH (s:SLA {domain_id:$id})` (can't surface null) | `:233` | ✅ |
| `all` read filters breaches by `window_days` (window-scoped `breachCount`/`health`) | `b.breach_at >= $windowStart` | ✅ (C-05 premise correct) |
| router null-skip: `getRoutePermission` null → RBAC check skipped | `router.ts:382-395` — `if (requiredPermission && …)` | ✅ (P0 exposure real) |
| RBAC entries pattern `rbac-permissions.ts:40-42` | `:40-42` `analytics:read` perf entries | ✅ |
| `analytics/graph` matched first `router.ts:910` | `:910` | ✅ |
| openapi import `:108`, `registerPerformancePaths(registry)` call `:1045` (design's `:141` wrong) | `:108` import, `:1045` call | ✅ (C-07 correct) |
| `views/index.tsx` has `performance: (r) => <PerformanceDashboard route={r}/>` `:130`, **no** `operator`/`exec`/`BusinessTabPlaceholder` key | confirmed `:130`; no operator key | ✅ (C-06 forward-risk real) |
| T-07 precedent `analytics-no-write-imports.test.ts` / `performance-no-postgres-import.test.ts` | both exist | ✅ |
| T-09 precedent `rbac-route-permissions.test.ts` / `performance-rbac.test.ts` | both exist | ✅ |
| `_resetDriver()` exported (`neo4j/driver.ts:36`) | `:36` | ✅ |
| ci.yml `unit` job PWA vitest = explicit file enumeration + `working-directory: pwa` | `.github/workflows/ci.yml:39-40` | ✅ (T-15 anchor real) |
| `test-integration.sh` = fixed `^integration:` pattern, **no file arg** | confirmed | ✅ |
| `test-unit.sh` cds `api/`+`shared/` only, never `pwa/` | confirmed | ✅ |
| `analytics-operator.ts` is genuinely new | absent | ✅ |

This is an unusually well-grounded tasks artifact: every anchor is real, the
same-task RBAC pairing is correctly identified as security-critical (not
bookkeeping), and the three carried-forward design concerns (C-05, C-06, C-07)
plus N-03 are pinned to named-task Definition-of-Done gates with a decision +
rationale table. The line-number vs. anchor discipline (locate by stable anchor,
not stale line number) is correct throughout.

## Findings

### Blockers

None.

### Concerns

**C-01 — Requirements AC-09's named verification artifact (`operator-auth.integration.test.ts`) is silently dropped, not reconciled with a note.**
`requirements.md` AC-09 Verification names
`api/__tests__/operator-auth.integration.test.ts` (a runtime "401 no session /
403 missing permission" assertion). No task creates that file; the AC→task table
(line 727) re-maps AC-09 to T-04 (entries) + T-16 (`git diff`), and the only
runtime-permission assertion is T-09's `getRoutePermission` **unit** test (AC-09a).
This is in fact *defensible* — the codebase confirms the dev-fallback session
(`router.ts:342`, `ONELOGIN_ISSUER` unset → "full permissions") means an
integration test genuinely **cannot** observe a `403`, and T-09's step (lines
451-453) states exactly this. But the tasks silently substitute the artifact the
approved requirement names rather than calling out that the requirement's named
`operator-auth.integration.test.ts` is **infeasible under dev-fallback auth** and
that AC-09's runtime leg is therefore satisfied by the T-09 unit guard.
**Recommendation:** add one line to T-09 (or the AC-09 traceability row) noting
"requirements AC-09 named `operator-auth.integration.test.ts`; that runtime 403
assertion is infeasible under the dev-fallback session (full perms), so the RBAC
contract is proven statically by `getRoutePermission` non-null (T-09) + the
`git diff` no-new-string leg (T-16)." No new task; a traceability note closes it.

**C-02 — T-13 bundles a server integration test (`operator-openapi.integration.test.ts`) into an otherwise PWA-vitest task, crossing two runners and two CI jobs in one task.**
T-13's three files are two `pwa/src/__tests__/*.test.tsx` (vitest/jsdom, `unit`
job via T-15) **plus** `api/__tests__/operator-openapi.integration.test.ts`
(`integration` job). The task is coherent (all three "close AC-10/12/13/14/15")
and within the 3-file cap, but its Verification correctly needs two different
invocations (`bunx vitest run …` **and** `cd api && bun test …`). This is a mild
cohesion smell — the OpenAPI integration test has no dependency on the cockpit
view and could sit in the server-test wave (T-05/T-13-server). Not blocking (the
Verification field does spell out both runs), but a reviewer of the *executed*
work should watch that the openapi integration leg isn't dropped because the task
"feels done" once the two vitest files pass. **Recommendation:** either split the
openapi integration test into its own micro-task or add an explicit checklist
line in T-13 DoD: "T-13 is not done until BOTH the two vitest files AND
`operator-openapi.integration.test.ts` pass."

**C-03 — `sla-compliance/all` returns `breach_at: ""` (empty), so any test asserting `latestBreachAt` MUST source it from the T-06/§4.5 Read-2 Cypher, never from the `all` payload — the tasks assume this but never warn the implementer of the trap.**
Verified: `handleSlaComplianceAllGet` builds its per-breach objects with
`breach_at: ""` (a hard-coded empty string; it never selects `b.breach_at`). The
design/tasks correctly route `latestBreachAt` through a **separate** batched
`MATCH (b:SLABreach) … max(b.breach_at)` Read-2 (DD-11/§4.5, pinned in T-06), so
the contract is right. But an implementer who reasonably reaches for the `all`
read's per-SLA fields to populate `latestBreachAt` will silently get `""`/`null`.
**Recommendation:** add a one-line note to T-06 (and T-04's SLA step): "the
`sla-compliance/all` payload's per-breach `breach_at` is empty (`""`,
`sla-compliance.ts`); `latestBreachAt` comes **only** from the Read-2
`max(breach_at)` Cypher — never from the `all` read." This hardens the C-05 pin.

**C-04 — T-11 is `Blocked by: T-12` but both carry a shared C-06 "blocked on unlanded foundation" gate, and the wave-3 dependency reality is a real risk of the whole task chain stalling at execution with no fallback recorded.**
The reading guide (lines 40-44) and C-06 both correctly state T-11 is *blocked*
on `saas-operator-foundation` landing (record, don't work around). Verified:
`views/index.tsx` today has **no** `operator` key, so T-11 literally cannot
execute against the current tree. This is honestly disclosed and is the correct
posture — but the tasks give no guidance on what the orchestrator does if the
foundation is still unlanded when this spec reaches execution (block indefinitely?
partial-land the server side T-01..T-10?). The server-side tasks (T-01..T-10,
T-13-openapi) do **not** depend on the foundation code and could land; only the
resolver DoD gate (T-02), the view-registration (T-11), and the seeded
integration tests (T-05/T-06/T-08/T-14) need the landed+seeded foundation.
**Recommendation:** add a short "degraded execution order" note to the reading
guide: if the foundation is unlanded, T-01..T-04/T-07/T-09/T-10/T-12 (pure new
code, no seed) may proceed; T-02's DoD gate, T-05/T-06/T-08/T-11/T-14 block on
foundation-landed+seeded, recorded in STATUS.md. This turns a possible hard stall
into an ordered partial-land.

### Nits

**N-01 — T-05's file list header says "SLA file is T-14" but the SLA integration file is authored in T-06, not T-14.**
T-05 Files note (line 309): "*(SLA file is T-14 — split for the C-05 window
semantics; see below)*". But `operator-slas.integration.test.ts` is created by
**T-06** (line 354); T-14 only *modifies* `operator-funnels.integration.test.ts`
and adds the playwright spec. The parenthetical mis-cites T-14 for T-06.
**Recommendation:** change "(SLA file is T-14…)" to "(SLA file is T-06…)".

**N-02 — T-12 is a documented 3-file task but the parenthetical waiver leans on "the perf-dashboard precedent" without citing it.**
T-12 touches 3 files (view + CSS + `api.ts` seam), at the cap. The waiver prose is
fine, but "mirroring the perf-dashboard precedent" would be stronger with the
concrete precedent path (the perf-dashboard tasks under
`.claude/specs/kpi-okr-performance-dashboards/tasks.md` do exist and pair the
view + CSS + `api.ts` block). Optional.

**N-03 — AC-16 CI-gating claim depends on a design-conformance job that the tasks assert exists but don't verify covers `pwa/src/views/exec/`.**
T-12/T-16 assert `scripts/design-conformance.ts --view …` is "the gating CLI step
run in the CI design-conformance job." The script + `--view` flag are confirmed
present; whether a CI `design-conformance` job actually runs it over new
`exec/OperatorCockpit.tsx` at merge is asserted, not shown. Low risk (T-16 runs it
manually as a gate regardless). Optional: T-16 could add "confirm the
design-conformance CI job's view glob includes `pwa/src/views/exec/`."

## Completeness / Traceability

### AC → task coverage (every AC from requirements rev 2 is closed)

| AC | Closed by (tasks) | Status |
|----|-------------------|--------|
| AC-01 | T-02, T-04, T-05 | ✅ |
| AC-02 | T-04, T-05 | ✅ |
| AC-03 | T-03, T-05 | ✅ |
| AC-04 | T-03, T-07, T-08 | ✅ |
| AC-04a | T-08 | ✅ |
| AC-05 | T-03, T-16 (`operator-status-parity.test.ts`) | ✅ |
| AC-06 | T-04, T-05, T-16 | ✅ |
| AC-07 | T-04, T-05 (base), T-14 (slice-fallback) | ✅ |
| AC-08 | T-04, T-06 (incl. C-05 window semantics) | ✅ |
| AC-09 | T-04, T-16 | ⚠️ named artifact substituted — see **C-01** |
| AC-09a | T-09 | ✅ |
| AC-10 | T-10, T-13, T-16 | ✅ |
| AC-11 | T-16 (baseline `git diff`) | ✅ |
| AC-12 | T-11, T-12, T-13 | ✅ |
| AC-13 | T-12, T-13 | ✅ |
| AC-14 | T-12, T-13 | ✅ |
| AC-15 | T-12, T-13 (incl. per-panel error) | ✅ |
| AC-16 | T-12, T-16 | ✅ |
| AC-17 | T-12, T-16 (manual sweep) | ✅ |
| AC-18 | T-11, T-12, T-14 (playwright) | ✅ |

### NFR → task coverage

NFR-01..NFR-07 each mapped in the tasks' own NFR table (lines 741-749) and
independently confirmed: read-only contract (reading-guide + T-07 + T-16 baseline
diff), no new store/labels (T-16 diff), bounded query cost (T-03/T-08), governed
fidelity (T-03 import + T-16 parity), enumerated 4 edits + 1 view line
(T-04/T-10/T-11/T-12 + T-16 confine), house rules (T-01/T-04/T-09), design
conformance (T-12/T-16). ✅

### Design element → task coverage

Every DD (DD-01..DD-15) and design §-section maps to a task: DD-01→T-01/T-02/T-10,
DD-02→T-02, DD-03→T-01, DD-04/DD-05→T-03, DD-06/DD-07→T-04, DD-08/DD-09→T-04/T-14,
DD-10/DD-11→T-04/T-06, DD-12→T-04, DD-13→T-12, DD-14→T-11, DD-15/1-2→T-04,
DD-15/3→T-10, DD-15/4→T-12. OQ-D1 → T-02 gate + T-14 sub-case. No orphan design
element; no task without a governing design element. ✅

### House-rule / blueprint conformance

- Routes verbatim from View Tree: `#/exec/operator` → `OperatorCockpit` (T-11/T-12),
  never invented. ✅
- XD-05 sole-ownership honored: T-11 edits only its one `VIEWS` entry; T-04 makes
  only the enumerated router/RBAC additive edits; `route.ts`/`SURFACES`/schema
  arrays explicitly out (T-16 baseline diff). ✅
- XD-08 read-only: no write path, no `ERROR_CODES` add, no `/api/v2/`, no
  `performance.ts`/governed-file edit (reading-guide contract + T-07 + T-16). ✅
- zod-only, en-US, loopback, central-gate auth, `/api/v1/` (NFR-06 → T-01/T-04/T-09). ✅
- UX-* satisfied in ACs: view states (T-12/T-13, AC-13/14/15 incl. per-panel),
  tokens-only + catalog-first (T-12/T-16, AC-16), a11y keyboard/landmark (T-12/T-16,
  AC-17), URL-first slice survives reload (T-14 playwright, AC-18), input modes
  table (requirements). ✅
- Every task has a Verification field (test path or `manual:` repro with input mode
  + observable outcome) — the completion-hook requirement. ✅ (T-16 and T-11 are
  the only heavily-manual ones; both give a concrete repro with browser + keyboard
  observable outcome.)

### Dependency ordering

T-01 (contracts) → T-02 (resolver) → T-03 (KPI) → T-04 (risk/funnel/SLA + dispatch
+ RBAC) → tests (T-05..T-09) / openapi (T-10) → view (T-12) → registration (T-11)
→ view tests (T-13) → e2e/fallback (T-14) → CI (T-15) → gate (T-16). No cycle
(T-11 `Blocked by T-12` and T-12 `Blocks T-11` are consistent, not circular; T-12
depends only on T-01, T-11 depends on T-12 — correct: the view must exist before
it can be wired). Sequencing is sound. ✅

## Verdict

**approve.**

Zero blockers. The tasks artifact is comprehensive, every AC/NFR/design element is
traced to a task with a real Definition-of-Done and a concrete verification, and
every cited codebase anchor was verified true (including the correction of the
design's stale `openapi.ts:141` line via C-07, and the correct identification of
the P0 RBAC-null-skip via the same-task pairing). The four concerns (C-01 the
substituted AC-09 test artifact, C-02 T-13's cross-runner bundling, C-03 the
`breach_at:""` trap, C-04 the unlanded-foundation degraded-order guidance) are all
execution-hygiene improvements addressable with short notes, not rework — they do
not gate the next phase. Recommend the author fold the C-01/C-03/C-04 notes into
the named tasks on the way to execution; N-01 (the T-14/T-06 mis-cite) is a
trivial text fix.
