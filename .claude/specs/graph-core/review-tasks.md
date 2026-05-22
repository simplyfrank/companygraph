---
feature: graph-core
reviewing: tasks
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: graph-core tasks (Pass 2 of 2 — final)

## Summary

Revision 2 of `tasks.md` addresses every pass-1 finding. The two blockers
(B-01 AC-15 orphan, B-02 T-18 phantom file + cycle) are surgically
resolved, the five concerns are each closed with a one-line edit that
matches the pass-1 recommendation, and the four nits are absorbed.

Pass-2 scrutiny of the new material (T-03b naming, T-30 dep chain, the
Cartesian-product test, the seed-idempotent backstop) surfaces three new
findings, all at concern-or-below severity. The most consequential —
an arithmetic mismatch in the task count (frontmatter says 30, the file
actually carries 31 task entries) and an internal inconsistency in T-30's
`Blocked by` description (prose says "every task except T-03b/T-20",
explicit list excludes T-24..T-28) — are both prose cleanups, not
structural defects. The Cartesian-product test in T-27 carries a small
implementer-trap that should be flagged but is not a blocker.

Since pass 3 is not allowed, applying the elevated bar from the prompt:
the remaining issues are all surgical or speculative. They are either
documented in the file itself with enough context for the implementer
to disambiguate at write-time (T-27 Cartesian + T-21 backstop) or are
internal-prose tidy-ups that don't change the DAG (count, T-30
descriptor).

**Verdict: approve.** Findings: 0 blockers, 3 concerns, 2 nits.

## Verdict

**approve** — Tasks.md revision 2 closes all pass-1 blockers and is ready
for execution. Three concerns (one count mismatch, one inconsistency
in T-30's Blocked-by descriptor, one implementer trap in T-27 the
implementer should be aware of) and two nits should be applied as
in-place fixes during execution but do not block sign-off.

## Pass 1 → Pass 2 delta

| Pass-1 finding | Severity | Pass-2 evidence | Status |
|----------------|----------|-----------------|--------|
| **B-01** AC-15 task-orphan | blocker | T-30 added (lines 439-449): `Maps to: AC-15`, manual procedure pins exact AC-15 wording (fresh clone → `bun install && bun run dev` → healthz + PWA banner within 5 min). Explicit pass-1 reference in the Files block: *"closes review pass-1 B-01"*. `Blocks: STATUS.md completion`. | **Closed** |
| **B-02** T-18 phantom file + cycle risk | blocker | T-18 Implementation note rewritten (line 281): *"the OpenAPI generator declares its **own** static `Route[]` array literal inside `openapi.ts`, mirroring design §5.1 — no cross-task module dependency."* T-18 `Blocks: T-19` (line 280) — cycle removed. | **Closed** |
| **C-01** T-03 verification cannot run at DAG position | concern | T-03 split into T-03 (workflow file lands, `actionlint` validates — lines 73-78) and T-03b (live CI verification — `Blocked by: T-03, T-20, T-24`, lines 80-90). Split matches the recommended `T-03a`/`T-03b` pattern from pass 1. | **Closed** |
| **C-02** C-08 pin cites T-12 but fixture is in T-11/T-25 | concern | Pinned-decisions table line 32 now reads: *"Locked in task: T-11 storage layer (semantic) + T-25 fixture in `nodes-crud.integration.test.ts`"*. Reader hunting the table now lands on the right files. | **Closed** |
| **C-03** AC-23 timeout test needs APOC, CI services block has no `NEO4J_PLUGINS` | concern | T-27 complexity prose (line 405) replaced — Cartesian product `MATCH (a),(b),(c),(d),(e),(f) RETURN count(*)` against the 32-activity fixture; explicit note *"No APOC plugin needed in CI"*. Note: design §11 line 1070 still cites `apoc.util.sleep` in its AC-23 verification description — this is a design-doc artifact (not in the canonical compose file) and the tasks-doc override is fine for execution, but if the design is re-edited it should be reconciled. | **Closed**, with a downstream design-doc reconciliation noted in N-2 below |
| **C-04** T-14 `Blocks T-26` rationale wrong | concern | T-14 `Blocks` line (line 231) now reads: *"T-21 (seed loader POSTs to `/api/v1/import`), T-26 (integration tests for `/import` semantics including dry-run + phase errors)"*. Rationale matches each downstream task. | **Closed** |
| **C-05** T-23 4-file count unjustified | concern | T-23 Files header (lines 337-340) now carries a one-paragraph rationale matching T-01 and T-07 patterns, citing the same exception class. | **Closed** |
| **N-01** Execution-sequence diagram lossy | nit | Diagram rewritten (lines 456-487) with explicit edges (`T-08 → T-12`, `T-08 → T-14`, etc.) per inline `Blocks`. Still summarised but explicit edges are now per-task. | **Closed** |
| **N-02** T-09 `Blocks` over-claims | nit | T-09 `Blocks` line (line 170) re-states transitively-blocked tasks explicitly with parenthetical "route handlers T-12/T-13/T-14/T-18 transitively via storage layer". | **Closed** |
| **N-03** C-08 row mis-attribution (subset of C-02) | nit | Subsumed by C-02 fix. | **Closed** |
| **N-04** T-21 NFR-04 backstop manual-only | nit | T-21 verification line 316 now adds `api/__tests__/seed-idempotent.integration.test.ts` automated backstop. See new concern C-03b (pass-2) about whether the test actually exercises the script layer or duplicates T-14/T-26. | **Closed** with one follow-up concern |

All ten pass-1 findings are addressed. The two new test files
(`seed-idempotent.integration.test.ts` in T-21, the rewritten
Cartesian-product fixture in T-27) and the two new tasks (T-03b, T-30)
land cleanly.

## Blockers

None.

## Concerns

### C-01 (pass-2) — Total-task arithmetic in frontmatter and summary is off by one

The frontmatter says `total_tasks: 30` (line 12). The "Estimated effort"
section says *"Total: **30 tasks** (T-01..T-29 plus T-03b plus T-30;
numbering skips no integer)"* (line 502).

But: T-01..T-29 is **29 tasks**, plus T-03b, plus T-30 = **31 tasks**.
The file actually has 31 `### T-` headers (counted: T-01 through T-29
inclusive is 29 entries, then T-03b and T-30 add two more). The
parenthetical "numbering skips no integer" is true (the numeric IDs
are dense T-01..T-29) but does not justify the 30-vs-31 maths.

**Why it matters:** STATUS.md tracking, the completion hook, and any
spec-traceability script that pattern-matches `^### T-[A-Za-z0-9]+`
will report 31 task entries. Frontmatter mismatch causes a quiet
divergence between the human summary and the machine-readable count.

**Fix (one-line):** Change `total_tasks: 30` → `total_tasks: 31`; change
the closing summary to *"Total: **31 tasks** (29 numeric T-01..T-29 +
T-03b + T-30)"*. The arithmetic in the "simple/moderate/complex"
breakdown (14 + 11 + 5 = 30) is also one short — re-count and bump one
category to 12 (likely `moderate`, since T-26 is double-listed in the
moderate list).

Cites: tasks.md lines 12, 499-502; per-task header count from `grep -c
'^### T-'` = 31.

### C-02 (pass-2) — T-30 `Blocked by` prose contradicts the explicit list

T-30 line 449 reads:
> *"Blocked by: every other task except T-03b and T-20 (which are
> independent meta-checks). Specifically depends on T-01..T-02,
> T-04..T-23, T-29."*

The two sentences disagree:
- Prose form: every task except T-03b and T-20 — would include
  T-24..T-28.
- Explicit list: T-01..T-02, T-04..T-23, T-29 — **skips T-24..T-28**
  (and skips T-03b/T-20, consistent with the prose).

If T-30 truly depends on the integration test packs (T-24..T-28) being
green, the explicit list is missing five edges. If it doesn't (and the
per-AC tests already cover the system smoke), the prose phrasing
should be tightened.

Reading the design intent: per the note in T-24 (line 358 — *"files
written incrementally during T-09, T-16 above; this task captures the
consolidation pass"*), every integration test consolidated in T-24..T-28
has already landed during its originating per-AC task. So T-30 doesn't
need T-24..T-28's consolidation to have run — the system is already
test-covered by the time T-23 (PWA shell) is done. The explicit list is
the correct one.

**Why it matters:** an implementer reading the prose form will conclude
T-24..T-28 must finish before T-30; the explicit list says otherwise.
The completion hook will use whichever the implementer reads first. The
two phrasings need to agree.

**Fix (one-line):** Drop the "every other task except T-03b and T-20"
sentence; keep only the explicit list. Or, if T-24..T-28 should block,
extend the explicit list to `T-01..T-02, T-04..T-29`. The cheaper read
is the former.

Cites: tasks.md T-30 line 449; T-24 lines 357-358 (incremental write
note).

### C-03 (pass-2) — T-21's "seed-idempotent" test risks duplicating T-14/T-26 if it just POSTs the payload

T-21 verification line 316 reads:
> *"automated backstop: `api/__tests__/seed-idempotent.integration.test.ts`
> — **POSTs the seed payload twice**, asserts `/api/v1/stats` counts
> unchanged on second run (NFR-04 + AC-08 from the script layer —
> orthogonal to the import-handler test in T-14/T-26)."*

But "POSTs the seed payload twice" is exactly what
`import-idempotent.integration.test.ts` (T-14, consolidated in T-26)
does. If the new test simply re-POSTs the payload directly, it duplicates
T-14/T-26 and the "orthogonal to" claim is wrong.

The orthogonality is only real if the new test exercises the **script
entry point** — i.e. invokes `api/scripts/seed.ts`'s main function (or
`bun run seed`) so that any file-discovery, parsing, transformation,
or wrapper logic in the script is also covered. If the script ever
grows beyond "read JSON, POST", the difference becomes load-bearing.

**Why it matters:** if the implementer reads the verification literally
and writes the test to just call `fetch('/api/v1/import', { body:
fs.readFile(...) })`, the test is dead weight. The fix is a one-line
clarification to the verification wording.

**Fix (one-line):** Change the verification to read *"invokes the
script's main function (or `bun run seed`) twice and asserts
`/api/v1/stats` counts unchanged on second run — exercises the seed
script's file-discovery + payload-shaping wrapper, distinct from
T-14/T-26's direct-POST tests."*

Cites: tasks.md T-21 line 316.

## Nits

### N-1 (pass-2) — T-03b non-numeric ID is fine for humans but watch for traceability scripts

T-03b breaks the otherwise-dense `T-\d+` pattern. The pass-1 recommendation
explicitly named `T-03b` so this is intentional and discoverable. Any
traceability script that captures `T-\d+` would miss T-03b; a script
that captures `T-[\w-]+` (or `T-[A-Za-z0-9]+`) catches it.

**Recommendation:** If/when the spec-traceability tooling lands (per the
forward-looking refs in design §15), confirm the regex tolerates non-
numeric suffixes. No file edit needed today.

Cites: tasks.md T-03b lines 80-90.

### N-2 (pass-2) — Design §11 AC-23 line still cites `apoc.util.sleep`, inconsistent with T-27's Cartesian-product pivot

Design.md line 1070 still contains the pre-pivot wording:
> *"5 s timeout test via a `apoc.util.sleep` Cypher snippet → `400
> query_timeout`"*

T-27 (line 405) overrides this with the Cartesian-product approach.
Tasks-doc decisions supersede design-doc verification descriptions for
execution purposes, but a future re-read of the design will surface
the inconsistency.

**Implementer awareness for the Cartesian product:** the planner can in
some cases skip work for `RETURN count(*)` without label scoping. Mitigation
is straightforward and worth noting in the test's inline comment: add
`WHERE id(a) <> id(b) AND id(b) <> id(c)…` constraints (forces row
materialisation), and/or sum a derived property like `RETURN count(a.id +
b.id + c.id)` to defeat any constant-folding. The math (60⁶ ≈ 4.7×10¹⁰
combinations against the ~60-node fixture, well above the 32⁶ ≈ 10⁹
quoted in T-27) easily exceeds the 5 s budget either way, but the
defensive `WHERE` clause prevents flake on faster CI runners or future
planner versions.

**Recommendation:** Implementer should add an inline `// planner-trap:
forces materialisation` comment + the cross-row inequality `WHERE` clause
when writing `query-caps.integration.test.ts`. No tasks.md edit needed
— the math is sound; this is a write-time guard against planner
optimisation that the implementer can apply at writing.

Cites: tasks.md T-27 line 405; design.md line 1070.

## Strengths

1. **Every pass-1 blocker was closed with the minimal-touch fix the
   reviewer recommended.** T-30 is the smaller add (one new task) and
   T-18's rewrite is two sentences. No spurious re-architecture.

2. **The T-03 → T-03/T-03b split is structurally cleaner than a deferred
   verification clause.** The split makes the "ship the file" step
   shippable on its own (validated by `actionlint`) and treats the live
   CI run as the operator-procedure verification it actually is. The
   `Blocked by: T-03, T-20, T-24` chain (line 90) places T-03b
   correctly: it can run only after the first unit test (T-20) and
   first integration test (T-24) exist, matching the pass-1 critique.

3. **T-30 is a well-shaped end-to-end smoke task.** The manual
   verification names exact commands (`bun install && bun run dev`),
   exact URLs (`http://127.0.0.1:8787/api/v1/healthz`,
   `http://127.0.0.1:5173/`), exact expected JSON shape
   (`{"ok":true,"neo4j":{"connected":true,"version":"5.x.x"}}`), and
   asks the operator to **record the actual elapsed time** in
   STATUS.md's `verification_artifact` field. Operator procedures don't
   get tighter than this without becoming code.

4. **The pinned-decisions table is now internally consistent.** C-08
   row now cites both the storage layer (T-11) and the fixture
   consolidation (T-25); C-09 cites T-14 and the named fixture; C-10
   cites T-10 and the `edges-crud.integration.test.ts` fixture. No more
   pin-vs-implementation drift.

5. **C-03 (APOC dependency) was resolved by changing the test
   approach, not by extending the CI services block.** The Cartesian-
   product pivot is the right call — it avoids the larger CI-services-
   block change and keeps the design's compose-file/CI-block tension
   isolated to the design doc. The math holds and the implementer can
   defend against planner optimisation at write-time (see N-2).

6. **T-18 is now independent of T-19.** The `Blocks: T-19` edge plus
   the "own static `Route[]` array literal" note removes any
   implicit cycle and makes T-18 plant-and-walk — the generator can
   be written and tested in isolation, then T-19 mounts it.

## Pass tracking

- Pass **2 of 2** (cap). Verdict is final per the prompt: pass 3
  is not allowed.
- All pass-1 blockers closed; all pass-1 concerns closed; all pass-1
  nits closed.
- Three new concerns (C-01 count, C-02 T-30 prose, C-03 seed-idempotent
  scope) are all single-line edits and do not justify a `revise`
  verdict under the elevated pass-2 bar.
- Two new nits (T-03b regex consideration, T-27 planner-trap awareness)
  are implementer-level write-time guidance.

## Finding counts

- Blockers: **0**
- Concerns: **3**
- Nits: **2**
- Verdict: **approve**
