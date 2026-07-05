---
feature: "model-workspace-core"
reviewing: "tasks"
reviewing_revision: 6
artifact: "tasks.md (revision 6, 25 tasks — T-01…T-22 executed + verified; gated delta T-23…T-25 rewritten per the rev-5 pass-1 review)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-05"
upstream_reviewed: ["requirements.md rev 4 (status: revised — pass-2 revise, B-03 open; rev 5 still pending)", "design.md rev 4 (status: approved)", "review-requirements.md (B-03/C-12 confirmed on disk)", "review-design.md (C-13/N-13 confirmed on disk)", "blueprint.md (View Tree, UX-01..06, XD-01..18)", ".claude/CLAUDE.md", "STATUS.md"]
supersedes: "review-tasks.md pass 1/2 (revise of rev 5, 2026-07-04) — its B-01/C-01/C-02/C-03/N-01/N-02/N-03 are verified resolved (or carried with an honest gate) below"
---

# Review: model-workspace-core / tasks (pass 2/2 — revision 6)

Reviewed cold; I did not author this artifact. This is the final pass under
the review cap, against **tasks rev 6**, whose only change over rev 5 is the
fold of the pass-1 findings into the gated delta T-23…T-25 (T-01…T-22 are
untouched, executed, and verified — pass 1 re-verified their on-disk claims;
I spot-checked again: the T-10 guard call sites at `api/src/routes/nodes.ts:37,56,68`
+ `api/src/routes/edges.ts:14,33`, the guard module
`api/src/storage/model-lifecycle-guard.ts` with the exact `LIFECYCLE_LABELS`/
`LIFECYCLE_EDGES` sets T-23 names, all thirteen `model-*`/`module-*` test
files, and the forced-`--down` coverage T-25 extends at
`api/__tests__/model-migration.integration.test.ts:77-110`). I verified every
rev-6 resolution against the working tree rather than taking the resolutions
table on faith.

## Verdict

**approve** — zero blockers. The pass-1 blocker (B-01, the ineffective
conditional-SET fork gate) is resolved correctly and completely: T-24 now
mandates the lock-first-then-recheck pattern (the dummy `SET i._forkLock`
acquires the node write-lock *before* the `forked` read, which is the
documented workaround for Neo4j's read-committed conditional-SET lost-update
pattern) **and** adopts the previously-declined `forkLocalKey` uniqueness
constraints as the deterministic backstop, with a verification hardened
exactly as pass 1 prescribed (deterministic constraint arm + N≥10
storage-level race loop; the 2-request HTTP race demoted to smoke). Two
concerns and three nits remain — none requires a tasks rev 7 before the
gates in the artifact itself run; the approval is **conditional on those
gates exactly as the artifact states them** (see C-01).

## Status of pass-1 findings (verified against tasks rev 6 and the working tree)

- ~~B-01 (T-24 gate ineffective under read-committed)~~ → **resolved.**
  Steps now (1) forbid building the rev-5 conditional gate by name, (2)
  prescribe the lock-first gate `MATCH (i:ModuleInstance {id:$id}) SET
  i._forkLock = timestamp() WITH i WHERE i.forked = false SET i.forked = true
  RETURN count(i) AS won` with materialization in the **same** transaction
  gated on `won = 1` — correct: the loser blocks on the lock at the dummy
  `SET`, then reads the *committed* `forked = true` and yields `won = 0`;
  and (3) put the uniqueness constraints **in the task** (`DROP INDEX … IF
  EXISTS` × 2, then `CREATE CONSTRAINT … REQUIRE n.forkLocalKey IS UNIQUE`
  on `UserJourney` + `Activity`), superseding T-03's lookup indexes (present
  today at `api/src/neo4j/bootstrap.ts:119-124`; a uniqueness constraint's
  backing RANGE index serves the same equality + `STARTS WITH` lookups —
  §3.4 unaffected; core nodes lack the property, so they are exempt). The
  supersession is recorded in the pins-table §3.4 row. Verification now has
  a deterministic arm (SHOW CONSTRAINTS + direct-driver duplicate `CREATE`
  → `ConstraintValidationFailed` + `applySchema` idempotence) plus the race
  loop. Files 2 → 3 (adds `bootstrap.ts`, still ≤3); complexity honestly
  raised to `complex`.
- ~~C-01 (import pre-scan does not exist on the write path)~~ → **resolved.**
  T-23 Steps now state the write path has no pre-write pass (verified:
  `dryRunPasses` at `api/src/routes/import.ts:107-…` runs only on the
  `?dryRun=true` branch; the real path zod-parses and upserts row-by-row
  with partial-success semantics), name the **new pre-scan loop ahead of
  phase 1** mirroring `dryRunPasses`' shape, and mandate the handler comment
  pinning the payload-atomic-vs-row-level contract divergence. Fixtures are
  now **mixed** (N valid rows + one lifecycle row) in both the node-row and
  `IN_MODEL`-edge-row arms, so the `/api/v1/stats`-unchanged assertion
  proves write-nothing non-vacuously.
- ~~C-02 (AC-22 does not exist upstream)~~ → **resolved as far as the tasks
  artifact can resolve it; the underlying condition persists** — carried
  forward as C-01 below. Gate #2 now carries the orchestrator diff
  instruction (409 code, write-nothing, lifecycle-free round-trip, C-12
  create arm vs the landed AC-22) and the option-1 confirmation; gate #1
  states option 2 ⇒ **rev 7 re-cutting T-23 before execution, never a
  silent re-cut**; "approval is conditional until requirements rev 5 lands"
  is written into gate #2 verbatim.
- ~~C-03 (T-25 manual-only + stranding repro)~~ → **resolved.** The stderr
  orphan-count warning is now asserted in
  `model-migration.integration.test.ts` (appears with the correct count when
  ≥1 `ModuleInstance` exists; absent when none do); the manual repro is
  demoted to secondary and ends with the recovery step (delete the user
  model, or wipe + `bun run dev` + re-migrate). Files 1 → 2; the delta
  checkpoint row's touched-file count corrected to four.
- ~~N-01~~ → **resolved** (gate #3: "not owed, but may be commissioned";
  on-disk reviews authoritative).
- ~~N-02~~ → **resolved** (T-23 import-seam DoD: add-only, self-contained
  pre-scan block; the `injectSystemKindDefault` injection — confirmed on
  disk in the phase-1 loop — and the per-row loop are not modified).
- ~~N-03~~ → **resolved** (the C-13 §4.4 doc-half hand-off is anchored in
  the Cross-cutting verification section, AC-20-anchor pattern, mirrored in
  STATUS.md hand-off #4).

## Blockers

None.

## Concerns

- **C-01 — approval remains conditional: T-23's AC target (AC-22) still does
  not exist upstream.** `requirements.md` on disk is unchanged since pass 1:
  revision 4, `status: revised`, fresh pass-2 verdict revise with B-03 open
  and the option-1/option-2 user decision pending. The tasks artifact now
  handles this as well as a tasks artifact can (hard execution gates; the
  gate-#2 diff instruction; the explicit rev-7 rule for option 2), so it is
  not a blocker against *this* document — but the approval this review
  grants is **conditional on the rev-5/6 gates running exactly as written**:
  no T-23…T-25 execution and no frontmatter flip (requirements *or* tasks)
  until requirements rev 5 lands with AC-22, the diff passes, and option 1
  is confirmed. If option 2 is chosen, tasks needs rev 7 and (new scope) a
  further review pass may be commissioned. **Recommendation:** the
  orchestrator treats gate #2's diff as a recorded checklist item in
  STATUS.md, not an implicit step.
- **C-02 — STATUS.md is stale relative to rev 6 and to the pass-1 review it
  folds.** STATUS.md (last written before the pass-1 review) still records
  the Task Review row as "fresh cycle pass 1: **approve** of rev 4", the
  Tasks row as "**rev 5 drafted** … no new review pass owed", and the Next
  section as the rev-5 gate wording — all superseded by the on-disk pass-1
  revise-of-rev-5 review, tasks rev 6, and this pass-2 review. The artifact
  correctly refrains from editing STATUS.md (established discipline), so the
  fix is orchestrator-side. **Recommendation:** before gating tasks rev 6 →
  `approved`, update the Phase table (Tasks: rev 6; Task Review: pass 1
  revise of rev 5 + pass 2 approve of rev 6, cap 2/2 consumed) and the Next
  section to the rev-6 gate wording, keeping the on-disk `review-*.md` files
  authoritative per the C-01(rev-5) resolution.

## Nits

- **N-01 — T-24 step 1 should state that `readInstanceRow`'s not-found
  behavior and the snapshot fetch are preserved.** The step says to
  "replace the read-then-write fork check (`readInstanceRow` → `row.forked`
  at modules.ts:765, then materialization in a separate `executeWrite`…)".
  Read naively, dropping `readInstanceRow` entirely would make a nonexistent
  `instanceId` match zero rows in the gate → `won = 0` → read-back path →
  a successful empty-map `ForkResult` instead of today's not-found error
  (and the snapshot JSON still has to come from somewhere). One sentence —
  "`readInstanceRow` still runs first for the 404 + snapshot read (the
  snapshot blob is immutable, so reading it outside the gate is safe); only
  the `forked` *decision* moves inside the gated transaction" — closes the
  misreading. The existing fork tests would likely catch a regression, but
  the task text should not depend on that.
- **N-02 — T-24's `REMOVE i._forkLock` placement is a trap worth one
  clarifying clause.** If the REMOVE is chained onto the gate query after
  the `WITH i WHERE i.forked = false` filter, the **loser's** row is
  filtered out and its `_forkLock` write persists — the verification's
  "no `_forkLock` property remains" assertion would fail on first run.
  State that the REMOVE runs as its own statement
  (`MATCH (i:ModuleInstance {id:$id}) REMOVE i._forkLock`) at the end of
  the transaction on **both** the `won = 1` and `won = 0` paths.
- **N-03 — T-25's spawn-based stderr assertion vs the in-process test
  style.** The existing forced-`--down` coverage drives
  `migrateRetailToModel(driver, "down", { force: true })` in-process
  (`model-migration.integration.test.ts:99`); T-25's verification prescribes
  `Bun.spawn` + stderr capture. Both work (the script connects to the same
  live stack), but if the warning is emitted from the library function, an
  in-process stderr/console-error capture keeps the file's style and avoids
  a second down/up cycle in a subprocess. Implementer's choice; the
  observable outcome (count line present when ≥1 instance, absent when 0)
  is what matters.

## Completeness / traceability

| Check | Result |
|-------|--------|
| Every FR reaches a task | **pass** — FR-01…FR-18 + NFR-01…NFR-06 all mapped in the artifact's traceability table; spot-checks agree |
| Every AC closed by a task with Verification | **pass for AC-01…AC-21** (executed; artifacts named per-AC in STATUS.md's verification ledger); **conditional for AC-22** — closed by T-23 once requirements rev 5 lands (C-01) |
| Verification fields (test path or `manual:` repro) | **pass** — all 25 tasks; T-24 hardened (deterministic + race loop + smoke); T-25 now automated with a self-restoring secondary manual repro |
| Dependency order | **pass** — no cycles; delta appended after T-21; T-23 blocked by landed T-10/T-13 + gates #1/#2; T-24 by landed T-08/T-22 + gate #3; T-25 by landed T-16 |
| ≤3 files per task | **pass** — T-23 (3), T-24 (3, honestly raised from 2), T-25 (2) |
| Complexity ratings | **pass** — T-24 raised to `complex` with rationale; T-23 `moderate`, T-25 `simple` are right |
| Validation checkpoints | **pass** — `bun run typecheck` universal; delta row names the four touched integration files (count corrected in rev 6) + the STATUS.md ledger refresh incl. the AC-20 re-run |
| Routes/views vs blueprint View Tree | **pass** (unchanged from pass 1 — delta touches no pwa/ files): `#/model/models` → `ModelWorkspace`; all seven tabs verbatim; six siblings → placeholder naming blueprint owners |
| UX-* allowances | **pass** (unchanged — T-17…T-21 executed): UX-01 four states (AC-13/14/15 + ready), UX-02 tokens + `--view` runs (AC-16), UX-03 n/a (no canvas), UX-04 no new breakpoints, UX-05 keyboard/ARIA (AC-17), UX-06 verbatim routes + reload survival (AC-18) |
| XD-* decisions | **pass** — XD-01 registry-only (T-03/AC-20; T-24's constraints touch Neo4j schema objects, not `NODE_LABELS`); XD-02 Neo4j-only; XD-06/XD-07 lifecycle tasks; XD-08 RBAC (T-15); XD-12 migration honesty improved by T-25; XD-17 gates replace interactive approval correctly |
| Cross-spec file ownership | **pass** — T-23's `import.ts` seam DoD protects the `system-augmentation-model` injection (verified present in the phase-1 loop); no other spec's files touched; the ontology-manager stale-test hand-off remains recorded in STATUS.md |

### Delta-slice map (rev 6)

| Upstream finding | Task | Closes | Status |
|------------------|------|--------|--------|
| req B-03 (import bypass, option 1) + C-12 (create arm) | T-23 | AC-22 (pending rev 5) | gated on #1/#2 — sound as written |
| design C-13 (fork first-edit race) as corrected by tasks B-01 | T-24 | AC-06 hardening; NFR-03b/NFR-04 | gated on #3 — gate pattern correct, backstop deterministic |
| design N-13 (forced-`--down` orphaning) | T-25 | AC-08 honesty; NFR-02 | gated on #3 — automated |

## Summary

- Rev 6 does exactly what pass 1 required, and I verified each resolution
  against the working tree rather than the resolutions table: the fork gate
  is now the documented lock-first pattern with materialization in the same
  transaction, the uniqueness constraints are in the task (superseding the
  two bootstrap indexes that exist on disk today), the import pre-scan is
  specified against the route's real structure with mixed fixtures and a
  seam DoD, and T-25 is test-asserted with a self-restoring manual repro.
- The two concerns are process-side, not document-side: the AC-22 upstream
  gap persists until requirements rev 5 lands (the gates handle it — hold
  them to the letter), and STATUS.md needs its orchestrator-side rewrite
  before the rev-6 gate flips.
- The three nits are one-clause clarifications inside T-24/T-25; they can be
  folded silently at execution time without re-review.
- Review cap for this cycle is now consumed (2/2). Phase closes **approve**.
