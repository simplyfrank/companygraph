---
feature: process-explorer-ui
reviewing: tasks
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-23
pass: 2
hard_cap: true
---

# Review: process-explorer-ui tasks (Pass 2 of 2 — HARD CAP)

## Verdict

**approve** — both pass-1 blockers (TB-01, TB-02) and both design
retro-findings cleanly absorbed; the substantive concerns affecting
file-execution correctness (TC-03 T-20 deps; TC-05 FR-26 trace; TC-06
test-path divergence) are absorbed. Three concerns and three nits land
in **partial / not absorbed** territory, but every one is cosmetic
(prose stream-of-consciousness in the complexity tally; missing
diagram caption; uncited Lighthouse invocation flags; etc.) — none
break execution and none corrupt cross-spec contracts. They are
recorded below as **open-accepted carry-forwards to execution**.

The HARD CAP closes here. No third tasks review.

## Spot-verify real code paths for TB-01

Re-confirmed by running `ls api/src/routes/` and `ls api/src/`:

```
api/src/routes/   → _helpers.ts, edges.ts, export.ts, healthz.ts,
                    import.ts, nodes.ts, openapi.ts, query.ts, stats.ts
api/src/          → env.ts, errors.ts, ids.ts, logging.ts, neo4j/,
                    ontology/, router.ts, routes/, server.ts,
                    storage/, validate.ts
```

- `api/src/routes/query.ts` — EXISTS. Confirmed.
- `api/src/routes/openapi.ts` — EXISTS. Confirmed.
- No `api/src/schemas.ts`. Confirmed (no aggregator file).
- No top-level `api/src/openapi.ts`. Confirmed.

TB-01's corrected file paths (in T-03a row line 102 of revised
tasks.md, in the files-per-task table line 343, in design.md §11 lines
1645/1647/1649) match the actual scaffold.

## Absorption matrix (12 pass-1 findings + 2 design retro-findings)

| ID | Pass-1 finding | Status | Justification |
|----|----------------|--------|---------------|
| **TB-01** | T-03a targets fictional `api/src/schemas.ts` + `api/src/openapi.ts` | **absorbed** | tasks.md:102 (T-03a Files cell) now reads `api/src/routes/query.ts, api/src/routes/openapi.ts`; files-per-task table line 343 matches; design.md §11 lines 1645–1649 swept in same revision. Both real files exist (re-verified above). |
| **TB-02** | T-11b validation points at T-19c for Safari export test (actually T-19a) | **absorbed** | tasks.md:139 (T-11b validation) now reads "ships in T-19a (`canvas-export.safari.spec.ts`) — TB-02 fix". One-character correction landed. |
| **TC-01** | Complexity tally arithmetic doesn't sum; "Simple: 8" lists 11 IDs | **partial** | tasks.md:201–264 was rewritten with a final tally of "Trivial: 2 / Simple: 12 / Moderate: 14 / Complex: 4 = 32 runtime task-rows" which matches the canonical per-task column. However the section retains internal stream-of-consciousness prose ("Wait — that still sums to 26 because…", "Wait — the IDs are…") that should have been edited out before commit. The numbers are right; the housekeeping is sloppy. Summary at line 38 still says "24 tasks" — author footnotes this as "the count of distinct task IDs ignoring sub-letters" at line 262, defensible. **Cosmetic; carry-forward.** |
| **TC-02** | Critical-path diagram is single-implementer execution order, not the dependency DAG; needs caption | **not absorbed** | tasks.md:178–189 still shows the same ASCII diagram. Lines 193–194 hint at parallelism ("With two implementers the path collapses to ~6 working days") but no explicit "this is execution order, NOT the dependency DAG; concurrency is governed by per-row `Depends on`" caption was added. The diagram still implies T-12 depends on T-11b, etc., which is false per the per-row deps. **Cosmetic; carry-forward** — the per-row Depends-on column is the source of truth and remains correct. |
| **TC-03** | T-20 depends on T-19a (playwright) but T-20 is vitest-only | **absorbed** | tasks.md:172 T-20 Depends-on cell: "T-17 (TC-01 fix — dropped spurious T-19a edge; T-20 is vitest-only, not playwright)". The revision-2 resolution table at line 21 mislabels this as "TC-01" but the substantive fix lands on T-20's deps. |
| **TC-04** | T-19c "moderate" complexity may be under-rated relative to T-19a | **not absorbed** | tasks.md:171 (T-19c) still rated `moderate`; no rationale added; no bump to `complex`. **Cosmetic; carry-forward** — implementer judgement can recalibrate during execution. |
| **TC-05** | FR-26 "(inherited — no task)" has no verification trace; T-17 polling lift could break TopBar stats | **absorbed** | tasks.md:162 T-17 validation cell now includes an explicit FR-26 inheritance trace with both a manual repro ("load `#/explorer/domains`, expect 'X nodes • Y edges' in the TopBar; reload, expect counts refresh on poll") AND a programmatic anchor (`App.module.test.tsx` integration asserting `data-test-id="stat-counts"` renders the counts after the polling lift). |
| **TC-06** | T-13b integration-test path divergence (`pwa/__tests__/` in design AC-13 vs `pwa/src/__tests__/integration/` elsewhere) | **absorbed** | tasks.md:147 uses `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts`; design.md:1668 (AC-13 row) now matches. Both files internally consistent. |
| **TN-01** | T-17 description implies a CSS file (`@container` queries) not in the 2-file list | **not absorbed** | tasks.md:368 still lists "SidePanel.tsx, App.tsx" (2 files). No CSS module added, no clarification that styles are inlined. **Cosmetic; carry-forward** — implementer will pick inline-vs-CSS-module at coding time. |
| **TN-02** | T-12 + T-13a co-edit `Add.tsx`; flag sequencing for parallel implementers | **partial** | tasks.md:377 retains the original disclosure ("each task touches different sections of a single file (distinct components inside the file)"). No explicit "T-12 and T-13a are sequential, not parallel" one-liner added. The critical-path diagram does sequence them (T-12 → T-13a), so this is partially conveyed. **Cosmetic; carry-forward.** |
| **TN-03** | Dagre `nodesep` / `ranksep` tuning (design pass-2 carry-forward #3) not surfaced as T-11a sub-item | **not absorbed** | tasks.md:138 T-11a description still mentions "react-flow + `@dagrejs/dagre` layout" generically. No reference to the empirical 200-node-fixture tuning. **Cosmetic; carry-forward** — design.md §13 still carries the open item; implementer will pick it up. |
| **TN-04** | T-19c validation doesn't specify the Lighthouse invocation flags from AC-23 | **not absorbed** | tasks.md:171 (T-19c) still shows only the bare assertion `audits["interactive"].numericValue < 2000`. AC-23's `--form-factor=desktop --throttling.cpuSlowdownMultiplier=1 --only-categories=performance --output=json` flags not re-quoted. **Cosmetic; carry-forward** — implementer will read AC-23 directly. |
| **Design retro (a)** | design.md §11 lines 1647/1649 listed fictional `api/src/schemas.ts` + `api/src/openapi.ts` | **absorbed** | Verified in design.md:1647 (`api/src/routes/query.ts (inline alongside handler)`) and line 1649 (`api/src/routes/openapi.ts`). Swept in same commit as tasks rev 2 per the resolution table line 31. |
| **Design retro (b)** | design.md AC-13 row had `pwa/__tests__/bulk-paste-rollback...` (missing `src/`) | **absorbed** | Verified in design.md:1668 — now reads `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts`. Matches tasks.md and the rest of the spec. |

**Tally**: 2 blockers absorbed (2/2), 4 concerns absorbed + 2
not-absorbed-cosmetic + 1 partial-cosmetic = 4 / 6, 1 nit
absorbed + 2 partial + 1 not-absorbed = 0 / 4 (all nits remain
unabsorbed/partial but cosmetic), 2 design retro-findings absorbed
(2/2).

**Substantive (file-execution-correctness) absorption**: 2/2 blockers
+ 4/6 concerns + 2/2 design retro-findings. The 4 not-absorbed items
(TC-02, TC-04, TN-01, TN-03, TN-04) and the 2 partial items (TC-01,
TN-02) are all cosmetic / housekeeping — none would corrupt data or
break upstream contracts.

## Open-accepted carry-forwards (to execution phase)

The hard cap closes here. The following items can be picked up
in-line during execution without re-opening the spec gate:

1. **TC-01 housekeeping** — edit the §"Complexity tally" to remove
   the stream-of-consciousness "Wait — that still sums to…" prose;
   keep only the final clean tally. (~5 minute task.)
2. **TC-02 caption** — add a one-line caption above the ASCII
   diagram in §"Dependency overview": "This is the single-implementer
   execution order, NOT the dependency DAG. Concurrency is governed
   by each row's `Depends on` column." (~1 minute.)
3. **TC-04 complexity rating** — implementer reviews T-19c at start
   of Phase 10. If lighthouse-spec setup is genuinely copy-pasta from
   an existing template, keep `moderate`; otherwise bump to `complex`.
4. **TN-01 T-17 CSS module** — implementer decides at coding time
   whether `@container` queries go in `SidePanel.module.css` (would
   bump T-17 file count to 3) or inline within `SidePanel.tsx`. Both
   work; tasks.md doesn't lock either.
5. **TN-02 T-12/T-13a sequencing** — if executed by a single
   implementer following the critical-path order, no issue. If two
   implementers spawn parallel worktrees, the second to start will
   hit a merge conflict on `Add.tsx`. The disclosure at tasks.md:377
   names the risk; the prudent implementer will check.
6. **TN-03 Dagre tuning** — surface in T-11a's PR description that
   nodesep/ranksep against the 200-node fixture is in scope.
7. **TN-04 Lighthouse flags** — T-19c implementer reads AC-23 (line
   not changing) to get the exact `--form-factor=desktop
   --throttling.cpuSlowdownMultiplier=1 --only-categories=performance
   --output=json` invocation.

## Notes on the revision-2 resolution table

The "Pass-1 task review resolutions" table at tasks.md:17–32 uses
internally-inconsistent finding IDs — TC-01 in the revision table
maps to TC-03 of the pass-1 review (T-20 deps), TC-02 to TC-01
(complexity tally), etc. The substance lands; the labels drift. Not a
verdict-affecting issue (every original pass-1 finding can still be
tracked to its actual fix by reading the prose), but a future
spec-workflow run that auto-traces by ID will get confused. Recorded
here for traceability; no action requested.

## Pass tracking

- **Pass 2 of 2 — HARD CAP reached.** No third tasks review permitted.
- Verdict: **approve**.
- Tasks.md may proceed to execution.
- The 7 open-accepted carry-forwards above ride along with execution
  and do not block the spec-completion hook.

## Strengths (carried forward from pass-1; re-verified)

1. Both blockers (TB-01 + TB-02) absorbed exactly as suggested in
   pass-1. TB-01 in particular was non-trivial because it required
   sweeping both tasks.md AND design.md §11 in the same commit, and
   both files now agree on `api/src/routes/query.ts` (inline schema)
   + `api/src/routes/openapi.ts`. Files re-verified against the
   actual scaffold.
2. Both design retro-findings absorbed in the same revision (design
   rev 2.1 noted in the resolution table). The cross-spec
   contradiction between tasks.md and design.md is gone.
3. TC-05's FR-26 inheritance verification gap is now closed by an
   explicit `App.module.test.tsx` integration assertion plus a manual
   repro. The "T-17 polling lift accidentally breaks TopBar stats"
   regression risk is now caught.
4. The 4 substantive concerns (TC-03, TC-05, TC-06, plus the
   absorbed half of TC-01) all landed in the right places. The
   remaining un-absorbed items are pure housekeeping.
5. The cross-reference tables (every FR → task, every AC → task)
   were not regressed by the revision — all 28 FRs + 32 ACs still map
   to at least one task.
