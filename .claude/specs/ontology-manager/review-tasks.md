---
feature: ontology-manager
reviewing: tasks
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-23
pass: 1
---

# Review: ontology-manager tasks (Pass 1 of 2)

## Summary

`tasks.md` revision 1 breaks the design into 23 numbered tasks
(T-00..T-22) across seven phases, with a dependency graph at the
bottom and a per-phase validation checkpoint. The four open-accepted
carry-forwards from the design pass-2 review are all explicitly
folded into specific tasks (#1 → T-00, #2 → T-11, #3 → T-10, #4 →
T-20). FR/AC traceability is high — every FR/NFR is named by at
least one task's "FR / AC" column, and 18 of 20 ACs map to a
named test file in T-18.

Verdict is **revise**, not approve, because of one blocker (T-18
explodes the 1-3-files-per-task rule by an order of magnitude and
its dependency surface is correspondingly fragile) plus four
concerns that will trip up the implementer if not addressed before
execution. The blocker is structural — T-18 ships 7 route files +
1 router edit + the dryRun cross-cutting fixture, all sequenced
after five upstream tasks. That's not a task; it's a phase. None of
the findings touch correctness of the design — they're all
task-breakdown hygiene.

Three nits round out the list. The header-text-vs-task-count
mismatch (says "18 tasks", ships 23) is the most user-facing nit.

## Verdict

**revise** — 1 blocker + 5 concerns + 3 nits.

## Open-accepted carry-forward verification (the four items)

The user's prompt named four items that must be folded into specific
tasks. Verification walk:

| # | Item | Folded into | Verified? | Concern? |
|---|------|-------------|-----------|----------|
| 1 | FR-06 requirements tightening (drop precondition iii) | T-00 | YES — T-00 explicitly rewrites FR-06 from 4 preconditions to 3 and AC-05 to 3+1-never-used. Validation step asserts the git-diff shape. | none |
| 2 | dryRun + schema_breaking fixture | T-11 | PARTIAL — T-11's validation step at line 61 mentions "PATCH dropping endpoint pair with live edges + `?dryRun=true` returns 200 with `rejected[]` carrying `schema_breaking`, NOT 400". Testable as written. However, T-18 ALSO claims to cover the dryRun cross-cutting via `ontology-dry-run.integration.test.ts`. The PATCH-with-schema-breaking-and-dryRun sub-case is best placed in the edge-types test (T-11) per the design pass-2 review N-06. Slight redundancy — see concern C-04. | minor concern |
| 3 | deleteNodeLabel writeEvent missing | T-10 | YES — T-10's parenthetical says "(incl. cascade DETACH DELETE + DROP CONSTRAINT/INDEX, **incl. `writeEvent` call** per open-accepted #3)". Validation step explicitly says "Verify pass-1 N-09 fix: every successful mutation writes a `_OntologyEvent` row". This is testable. | none |
| 4 | §10 event-purge query cleanup | T-20 | NO — T-20's validation step at line 85 mentions "OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0 test: assert audit untouched, event-buffer still purged" but does NOT mention the single-statement DELETE shape that the open-accepted #4 calls out (replacing the wasteful `WITH e RETURN count(e), collect(e)` pattern in design §10 line 1481 with `DELETE … RETURN count(e)`). The bottom "Open-accepted carry-forward summary" table at line 101 says "code review of single-statement DELETE shape" — but a code review is not a validation step; an implementer reading this task could legitimately ship the original 2-statement shape and pass validation. See concern C-01. | concern |

## FR / NFR / AC coverage walk

### FRs — all 19 traced

Walked every FR including the (a)-suffixed ones: FR-01, FR-01a,
FR-02, FR-03, FR-04, FR-04a, FR-05, FR-06, FR-07, FR-08, FR-09,
FR-10, FR-11, FR-12, FR-13, FR-13a, FR-14, FR-15, FR-16, FR-17. No
orphans. Multi-task coverage where appropriate (e.g. FR-04a hits
T-13 cache + T-14 edges.ts refactor; FR-15 hits T-08 seed + T-09
bootstrap).

### NFRs — all 9 traced

NFR-01..NFR-09 all covered. NFR-02 → T-21 grep test (good). NFR-06
(reads never write audit) → T-17 covers as a sub-test of the
schema-endpoint integration test ("GET `/schema` 10× writes zero
audit rows (NFR-06 / AC-13)"). NFR-08 (dryRun side-effect-free) →
T-18's cross-cutting `ontology-dry-run.integration.test.ts`. NFR-09
(SSE 8 concurrent) → T-19.

### ACs — 20 of 20 traced

AC-01..AC-20 all map to a task's validation step or a named test
file. AC-01 (new label appears in `/stats` keyset within 60s) maps
through T-18's "ten remaining integration tests from §14" — this
includes `ontology-new-label.integration.test.ts` per design §14
line 1561. Acceptable but implicit; see concern C-03 below.

### Design § — 20 of 21 sections traced

Walked every numbered section: §3.1, §3.2, §3.3, §3.4, §3.5, §4.1,
§4.2, §4.3, §4.4, §4.5, §4.6, §4.7, §5.1, §5.2, §5.3, §5.4, §5.5,
§6.1, §6.2, §6.3, §7.1, §7.2, §8, §9.1, §9.2, §10. All 21 covered
except:

- **§3.5 (`_Ontology*` isolation from `graph-core/FR-11`'s
  `/stats`)** — this is a cross-spec contract change flagged to
  `process-explorer-ui` STATUS. No task updates that downstream
  spec. See nit N-03.

## Findings

### Blockers

**B-01 — T-18 is a phase, not a task.**

T-18 (line 78) lists **7 production route files** in one row:
`api/src/routes/ontology/{node-labels,edge-types,audit,versions,migrations,import,export}.ts` PLUS the `api/src/router.ts` edit. That's 8 files in one task. The spec-workflow rule is 1-3 files
per task; T-18 exceeds that by 2.5×. Its dependency surface is also
the largest in the spec — depends on T-10, T-11, T-13, T-16, T-17
(five upstream tasks). Its FR/AC traceability column lists 15 FRs
and 13 ACs.

The validation step is correspondingly vague: "the ten remaining
integration tests from §14" + a cross-cutting dryRun test. Counting
forward: §14 lists 18 integration tests; T-10 covers 3, T-11 covers
2, T-14 covers 1, T-15 covers 2 (with overlap on T-10's no-retroactive-rewrite), T-19 covers 2, T-20 covers 1. T-17 covers 1
(schema endpoint). That leaves 8-9 for T-18, not 10. "Ten" is
approximately right but the implementer has to do this counting
themselves.

**Why this is a blocker, not a concern**: an implementer picking up
T-18 cold has no obvious sequencing within the 7 routes (do you
ship node-labels first? versions before audit? what if a route
fails validation midway?). The single "complex" rating is
load-bearing but unhelpful — five complex tasks at this granularity
get treated very differently from one phase-sized one.

**Fix**: split T-18 into four tasks, one per logical surface:

- T-18a: node-labels routes (POST/GET/PATCH/DELETE + list) — depends T-10, T-13
- T-18b: edge-types routes (POST/GET/PATCH/DELETE + list) — depends T-11, T-13
- T-18c: versions + rollback + audit + migrations routes — depends T-05, T-16
- T-18d: import + export + cross-cutting dryRun test + router-mount edit — depends T-18a, T-18b, T-18c

Each is 1-3 files. Sequencing is forced by deps. T-19's existing
"depends on T-17" upgrades to "depends on T-18d" naturally.

### Concerns

**C-01 — Open-accepted #4 (event-purge query cleanup) is not
testable as written in T-20.**

T-20's validation step (line 85) covers the archive + 0-disable
paths but not the single-statement DELETE shape from open-accepted
#4. The bottom carry-forward table at line 101 says "code review of
single-statement DELETE shape" — that's not a runnable validation;
it relies on a human catching the shape during PR review.

The open-accepted item from the design pass-2 review (review-design-pass-2.md line 285) is specifically about replacing
design §10 line 1481's:

```cypher
MATCH (e:_OntologyEvent) WHERE e.ts < $cutoff WITH e RETURN count(e) AS c, collect(e) AS toDelete
```

(followed by a second DELETE statement) with a single

```cypher
MATCH (e:_OntologyEvent) WHERE e.ts < $cutoff DELETE e RETURN count(e) AS c
```

**Fix**: add an explicit assertion to T-20's validation step: e.g.
"Grep `api/src/ontology/jobs/audit-retention.ts` for the string
`collect(e)` — should return zero matches (open-accepted #4)." Or
fold it into a code-shape unit test.

**C-02 — T-03 introduces an `@uses-error-code` annotation
convention that the design never mentions.**

T-03's validation step says: "ontology-envelope.test.ts walks
`ONTOLOGY_ERROR_CODES` + asserts every code has a corresponding
error-thrower somewhere (using a `// @uses-error-code: …`
annotation grep)". The design's §5.3 lists the 14 codes but never
prescribes an annotation. The implementer of T-03 would have to (a)
invent the annotation, (b) add it at every `throw new ValidationError(...)` site across T-07, T-10, T-11, T-16, T-18,
(c) wire the test. That's prescriptive work spread across 6+ later
tasks and never named in their validation steps.

Either the annotation is the contract (in which case T-10, T-11,
T-16, T-18 each need an `add @uses-error-code annotations to every
throw site` bullet in their validation steps), OR T-03 should use a
different exhaustiveness check (e.g. an in-source `ERROR_CODE_THROWERS` registry that every code maps to a thrower
function — which the design also doesn't prescribe).

**Fix**: pick one mechanism. If annotations: thread the requirement
through every throwing task. If registry: add a sub-task to T-03
that names the registry file. The current shape is "T-03 invents a
convention, T-10..T-18 silently inherit it" — the implementer of
T-10 has no way to know.

**C-03 — AC-01's "appears in `/stats` keyset within 60s" assertion
has no explicit task.**

AC-01 requires "POST a new `Product` label, poll `/api/v1/stats`
until the key appears, assert ≤ 60 s". This depends on the
`/api/v1/stats` handler being refactored to read from the registry
(design §3.5 — "the keyset is sourced from `_OntologyNodeLabel`
rows in the registry"). No task in tasks.md explicitly edits
`api/src/routes/stats.ts` (or wherever the stats handler lives in
graph-core). The closest is T-09 ("Refactor `api/src/neo4j/bootstrap.ts`") — but bootstrap.ts is not stats.ts.

The cache invalidation (60s TTL on schema cache from T-13) propagates
the change to `/api/v1/stats` only if the stats handler is reading
from the same cache. Without an explicit edit task, an implementer
might leave the stats handler reading from compile-time const, and
AC-01 would silently fail with a stale `/stats` response.

**Fix**: add a sub-bullet to T-13 ("audit `/api/v1/stats` handler;
if it reads from compile-time `NODE_LABELS`, refactor to read from
schema cache") OR add a new T-13a task. Note this also overlaps
with AC-15 enforcement — if the grep at T-21 fails because
`api/src/routes/stats.ts` imports `NODE_LABELS`, the implementer
will discover the gap there, but T-21 is far downstream.

**C-04 — Redundant dryRun coverage between T-11 and T-18, with
unclear ownership.**

T-11 line 61 includes the "PATCH dropping endpoint pair with live
edges + `?dryRun=true` returns 200" sub-case (open-accepted #2).
T-18's validation also includes a cross-cutting `ontology-dry-run.integration.test.ts` "covers EVERY mutating
endpoint × `?dryRun=true`". If the PATCH-with-schema-breaking-and-dryRun case lives in BOTH `ontology-edge-types.integration.test.ts` (T-11) and `ontology-dry-run.integration.test.ts` (T-18), that's
fine — but if the implementer of T-11 sees T-18 covers dryRun
cross-cuttingly and drops the open-accepted #2 sub-case, the
intent is lost.

**Fix**: explicit one-liner in T-11 that the schema-breaking-with-dryRun assertion stays in `ontology-edge-types.integration.test.ts` even though T-18 also covers
dryRun. (One-line clarification, not a structural change.)

**C-05 — FR-10's `missing_documentation` error code shaping is
ambiguous between T-02 (zod) and T-10/T-11 (handlers).**

FR-10 says blank `description` OR `usage_example` returns `400
{error:{code:"missing_documentation", details:{field}}}`. The
zod schema in T-02 enforces `.min(1).max(2000)` and `.min(1).max(200)` — but a zod failure naturally maps to
`invalid_payload`, not `missing_documentation`. AC-12 verifies the
specific code. No task explicitly names the error-shape mapping
("if the zod failure is due to a min(1) violation on
`description` or `usage_example`, remap to `missing_documentation`
with `details.field`").

T-10 + T-11 list AC-12 in their FR/AC column — implicitly the
handler-level mapping lives in their route logic. But the mapping
itself isn't called out in the validation steps. An implementer
who reads T-02's zod schema and ships the natural `invalid_payload`
response will pass T-02's validation and fail AC-12 in T-22.

**Fix**: add a one-liner to T-10 and T-11 (or T-18's route layer):
"Map zod min(1) violations on `description`/`usage_example` to
error code `missing_documentation` with `details.field`."

### Nits

**N-01 — Summary task count off by 5.**

Line 16: "Implementation of the design.md revision 2 broken into
**18 tasks**". Counts in the file: T-00 + T-01..T-22 = 23 tasks.
The complexity tally at lines 134-138 sums correctly: 4 + 6 + 8 + 5
= 23. The "18" reads like an artifact of a pre-T-00 / pre-T-21 /
pre-T-22 draft. Trivial fix.

**N-02 — Dependency graph ASCII is hard to read at lines 105-124.**

The graph has unconnected branches (T-20 in column 1 with no
parent path drawn) and the arrows don't all align. Not blocking,
but a competent implementer trying to map T-XX → predecessors
ends up parsing the per-row "Depends on" column instead. Either
fix the ASCII or drop it — the per-row column is the canonical
source.

**N-03 — §3.5 cross-spec STATUS flag to `process-explorer-ui` is
not in any task.**

Design §3.5 line 321-326 says: "`graph-core/FR-11`'s `/stats`
shape changes from 'six fixed keys' to 'registry-driven keyset'.
`process-explorer-ui` (which renders the stats panel from XC-1.2)
needs to expect a growing keyset. This is recorded in
`process-explorer-ui` STATUS as an incoming contract evolution."
No task in tasks.md updates the PEU STATUS file. This is a
documentation handoff to a downstream spec, not implementation
work, so it's properly a nit — but if it's forgotten, PEU's spec
author won't know to adapt. Add a sub-bullet to T-22 or
freestanding T-23 doc-task.

## Task-size audit (1-3 files rule)

| Task | Files | Within rule? |
|------|-------|--------------|
| T-00 | 1 (requirements.md) | yes |
| T-01 | 3 (package.json, .env.example, .gitignore) | yes (boundary) |
| T-02 | 1 + 1 test | yes |
| T-03 | 2 | yes |
| T-04 | 1 + 1 test | yes |
| T-05 | 2 | yes |
| T-06 | 1 (edit of T-05's file) | yes |
| T-07 | 1 + tests | yes |
| T-08 | 1 + 1 test | yes |
| T-09 | 1 edit + 1 test | yes |
| T-10 | 1 + 1 test | yes |
| T-11 | 1 + 1 test | yes |
| T-12 | 1 + tests | yes |
| T-13 | 3 + 1 helper edit + tests | yes (boundary) |
| T-14 | 1 edit + 1 test | yes |
| T-15 | 1 edit + 1 test | yes |
| T-16 | 1 + 1 test | yes |
| T-17 | 1 + 1 router edit + 1 test | yes (boundary) |
| **T-18** | **7 routes + 1 router edit + cross-cutting test** | **NO — 8 files** |
| T-19 | 1 + 1 router edit + 1 test | yes (boundary) |
| T-20 | 1 + 1 server edit + 1 test | yes (boundary) |
| T-21 | 1 test | yes |
| T-22 | n/a (CI scope) | yes |

22 of 23 tasks honour the rule; T-18 breaks it. (See B-01.)

## Dependency graph soundness

Walked the deps:

- No cycles detected.
- T-09 depends on T-04 + T-08 — correct (needs applyMetaSchema +
  seed loader).
- T-13 depends on T-10 + T-11 — but T-13 is the CACHE layer that
  T-10/T-11 don't need at storage level. Reverse direction is
  also fine: T-13 needs `getNodeLabel` / `getEdgeType` /
  `getEdgeEndpoints` to populate caches; those live in T-10 +
  T-11. OK as written.
- T-14 depends on T-13 — correct (uses getEdgeEndpoints).
- T-15 depends on T-13 — correct (uses getAttributeValidator).
- T-16 depends on T-05 + T-10 + T-11 — note: §4.7 line 877-879
  says `parseRegistryLabel` (which lives in T-13) gates the
  `${input.target}` interpolation. T-16 itself ships the storage
  helper that interpolates; the route handler that calls
  `parseRegistryLabel` lives in T-18. So T-16 → T-13 is NOT a
  storage-layer dependency, only a route-layer one (handled
  transitively via T-18 → T-13). Acceptable but worth a
  one-liner in T-16's note column.
- T-19 depends on T-05 + T-17 — T-17 brings in the router mount;
  T-19 piggybacks. If B-01's T-18 split goes through, T-19's
  dependency should bump to the new T-18d (router mount task) or
  T-17 + T-18d.
- T-22 depends on T-00..T-21 — correct.

Critical-path estimate (5-7 working days for a single implementer)
is plausible for the listed depths; if B-01's split is adopted,
T-18 expands from one moderate-sized task to four 1-day tasks,
adding ~2 days to wall-clock unless run in parallel. Updated
estimate after split: 7-9 working days critical path, 8-11 total.

## Validation-checkpoint specificity

Audited each task's validation step for testability:

- **Specific + testable**: T-00 (git-diff shape), T-02 (sub-case
  enumeration), T-04 (count constraints), T-06 (object-equality on
  parsed audit), T-07 (4 sub-cases), T-08 (idempotency assertion),
  T-09 (no-op on re-run), T-10 (multi-path enumeration), T-11
  (sub-cases incl. open-accepted #2), T-15 (AC-02 + AC-03 split),
  T-17 (10× call → 0 audit), T-19 (8 conns + race-window
  assertion), T-21 (allowlist count).
- **Specific but with hidden prerequisites**: T-03 (introduces
  annotation convention — see C-02), T-13 (mentions cache hit/miss
  fire but not the helper-edit details), T-14 (assumes graph-core's
  AC-13 file path).
- **Vague**: T-18 ("ten remaining integration tests" without
  naming which — see B-01), T-20 (covers archive but not query
  shape — see C-01), T-22 ("all tests green" — true but
  unhelpful as a regression catch).

## Complexity ratings audit

Walked the tally (line 132-139):

| Task | Listed | Actual scope | Verdict |
|------|--------|--------------|---------|
| T-00 | trivial | 1 markdown rewrite | accurate |
| T-01 | trivial | 3 config files | accurate |
| T-02 | moderate | recursive zod schema + discriminated union | accurate (could argue complex) |
| T-03 | trivial | error codes + grep test | accurate if C-02 is resolved without expanding scope |
| T-04 | simple | 8 Cypher constraints + idempotency | accurate |
| T-05 | moderate | 3 helpers + EventEmitter wiring | accurate |
| T-06 | trivial | one deserializer | accurate |
| T-07 | moderate | 3-branch precondition logic | accurate |
| T-08 | moderate | seed loader + single-row audit | accurate |
| T-09 | moderate | bootstrap refactor | accurate |
| T-10 | complex | CRUD + FR-12 + backfill + writeEvent | accurate |
| T-11 | complex | CRUD + endpoint replacement + FR-04a | accurate |
| T-12 | simple | 2 helpers, mostly tested via T-10/T-11 | accurate |
| T-13 | moderate | 3 caches + 2 helpers | accurate (boundary; could argue complex) |
| T-14 | simple | one-function refactor | accurate |
| T-15 | moderate | refactor 3 storage methods + AC-02 + AC-03 | accurate |
| T-16 | complex | 5-variant discriminated-union executor | accurate |
| **T-17** | **simple** | **schema endpoint + cache wiring** | **could be moderate — `?alignment=:source` filter + 10× NFR-06 test + ARTS fixture** |
| **T-18** | **complex** | **7 routes + cross-cutting dryRun test + router mount** | **misrated — this is 4 complex tasks under one number** |
| T-19 | complex | SSE handler + B-02 race fix | accurate |
| T-20 | moderate | 2-phase retention + SIGTERM handler | accurate |
| T-21 | trivial | grep test | accurate |
| T-22 | simple | run everything | accurate |

Two mis-rates: T-17 leans moderate; T-18 is structurally underrated
because the rating system doesn't have a slot for "phase".

## Execution-readiness pulse-check

A competent implementer reading tasks.md cold could pick up T-00
through T-17 and produce working code with the per-task "Files +
Validation" pair. They would stumble at:

1. **T-03 → T-10/T-11/T-16/T-18 hidden contract** — the
   `@uses-error-code` annotation isn't named anywhere except in
   T-03's validation step (C-02).
2. **T-18** — would need to invent their own ordering, file
   naming, and per-route test sequencing (B-01).
3. **T-20 final cleanup** — would likely ship the original
   2-statement event-purge shape, then fail review at the carry-forward summary table (C-01).
4. **AC-01 stats keyset** — implementer follows T-09 (bootstrap
   refactor), notices `/api/v1/stats` is untouched, doesn't know
   whether to touch it (C-03).
5. **FR-10 missing_documentation code shape** — implementer
   relies on zod's natural `invalid_payload`, fails AC-12 (C-05).

All five gaps are fixable with one-line additions to existing
tasks. None require restructuring (except B-01, which does).

## Strengths

1. **The dependency graph is mostly sound** — single critical
   path, no cycles, depths reasonable.
2. **Open-accepted carry-forwards are explicitly folded** — every
   one of the four design-pass-2 items has a named home, and three
   of four are testable in-task (the fourth is C-01).
3. **Per-task FR/AC traceability** — every task names which FRs
   and ACs it serves, making the coverage walk straightforward.
4. **Validation steps are concrete more often than not** — 13 of
   23 tasks have specific test fixtures or assertions called out;
   only 3 are genuinely vague (T-18, T-20, T-22).
5. **The complexity tally is honest** — 5 complex + 8 moderate +
   6 simple + 4 trivial reflects the actual scope; the tasks
   author isn't hiding effort.

## Finding counts

- Blockers: **1** (T-18 explosion)
- Concerns: **5** (C-01 event-purge testability; C-02 annotation
  contract; C-03 stats handler gap; C-04 dryRun ownership;
  C-05 missing_documentation mapping)
- Nits: **3** (task count off-by-5; dep-graph ASCII; PEU STATUS
  flag)
- Open-accepted items folded correctly: **3 of 4** (item #4 has a
  testability gap — see C-01)
- FR coverage: **19 of 19**
- NFR coverage: **9 of 9**
- AC coverage: **20 of 20** (with C-03 caveat on AC-01)
- Design § coverage: **20 of 21** (§3.5 PEU flag missing)

## Pass tracking

- This is **pass 1 of 2** for the tasks phase (large spec — task
  review mandated by spec-workflow).
- Verdict: **revise**. Recommend tasks-phase author splits T-18
  per B-01's outline, addresses concerns C-01..C-05 with the named
  one-line additions, and updates the task count + dep-graph
  rendering for pass 2.
- Estimated turnaround: 30-60 minutes of edits; no structural
  redesign of the underlying tasks needed beyond the T-18 split.
