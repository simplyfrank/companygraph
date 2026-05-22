---
feature: ontology-manager
reviewing: tasks
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-23
pass: 2
---

# Review: ontology-manager tasks (Pass 2 of 2 — FINAL)

## Summary

`tasks.md` revision 2 cleanly absorbs all nine pass-1 findings (1
blocker + 5 concerns + 3 nits). The B-01 split converts the
phase-sized T-18 into four 1-3-files tasks with a sound dependency
fan-in at T-18d. The five concerns are each addressed with named,
testable additions to the relevant validation steps. The three nits
are resolved or explicitly dropped with rationale.

Verdict is **approve**. Pass-1 verification matrix: 9 of 9 findings
**cleanly absorbed**; 0 partially absorbed; 0 regressed. Two minor
new concerns (one off-by-one in the summary text, one mild
1-3-files-rule stretch on T-18c) are below the approval threshold
and are flagged as **open-accepted carryovers** for the implementer
to pin at PR-review time.

The §"Pass-1 review resolutions" table at lines 38-48 of revision 2
is the kind of explicit traceability that makes a pass-2 review
fast. Every finding has a row, a disposition, and a target task.

## Verdict

**approve** — pass-1 findings cleanly absorbed; 2 minor new concerns
flagged as open-accepted carryovers (no third revision available per
HARD CAP).

## Pass-1 verification matrix

Walking each of the nine pass-1 findings against revision 2:

| # | Pass-1 finding | Revision-2 disposition | Location in revision 2 | Status |
|---|----------------|------------------------|------------------------|--------|
| **B-01** | T-18 explosion (7 routes + router edit + cross-cutting test) | Split into T-18a (node-labels) + T-18b (edge-types) + T-18c (versions/audit/migrations) + T-18d (import/export/dryRun/router-mount). Each is 1-3 source files (modulo T-18c — see new C-N1 below). T-18d owns the cross-cutting `ontology-dry-run.integration.test.ts`. T-19 dep updated to T-18d. | lines 99-102, 103 | **cleanly absorbed** |
| **C-01** | T-20 event-purge cleanup not testable | T-20's validation step now contains explicit `grep -F 'collect(e)' api/src/ontology/jobs/audit-retention.ts` assertion that must return zero hits, executed via `execSync` from the test file. | line 109 | **cleanly absorbed** |
| **C-02** | T-03's `@uses-error-code` annotation convention not threaded | Switched mechanism entirely: T-03 now ships an `error-throwers.ts` registry (`ERROR_CODE_THROWERS: Record<OntologyErrorCode, ThrowerFn>`). Exhaustiveness verified by the envelope test asserting `Object.keys(ERROR_CODE_THROWERS).sort() === [...ONTOLOGY_ERROR_CODES].sort()` + every value is callable + each thrower's emitted `error.code` matches its key. No per-throw-site annotation requirement spreads to T-07/T-10/T-11/T-16/T-18a..d. | lines 42, 64 | **cleanly absorbed** |
| **C-03** | AC-01's `/stats` keyset gap | T-09 now includes the explicit sub-bullet "audit `api/src/routes/stats.ts`; if it reads from compile-time `NODE_LABELS`/`EDGE_TYPES` const, refactor to read from the schema cache". Files column adds `api/src/routes/stats.ts (edit if compile-time-bound)`. T-09's deps now include T-13 (for the schema-cache import). Validation step includes the AC-01 60-s poll assertion. | line 75 | **cleanly absorbed** |
| **C-04** | dryRun ownership ambiguous between T-11 and T-18 | T-11 explicitly says "the `?dryRun=true` + dropping-endpoint-with-live-edges sub-case lives in **this test file** (`ontology-edge-types.integration.test.ts`); T-18d's `ontology-dry-run.integration.test.ts` covers OTHER mutating endpoints' dryRun behaviour, but NOT this sub-case". T-18d's validation step explicitly excludes the edge-type-specific sub-case. | lines 82, 102 | **cleanly absorbed** |
| **C-05** | FR-10 `missing_documentation` error code shape ambiguous | T-18a and T-18b each include the explicit one-liner: "zod `min(1)` violations on `description` / `usage_example` map to `400 missing_documentation` with `details.field` BEFORE falling through to `invalid_payload`". The dedicated test fixture `ontology-required-docs.integration.test.ts` is named in T-18a's validation. | lines 99 (T-18a), 100 (T-18b) | **cleanly absorbed** |
| **N-01** | Task-count off by 5 | Summary now says "**26 tasks**" (was "18"). However see C-N1 below — actual count is 27, so off-by-one remains. | line 17 | **partially absorbed** — count corrected to within 1 but still wrong. |
| **N-02** | ASCII dep-graph hard to read | Dropped entirely. Replaced with a "Dependencies" section that points to per-task "Depends on" columns as canonical, plus a critical-path line. | lines 128-135 | **cleanly absorbed** |
| **N-03** | §3.5 PEU STATUS cross-spec flag missing a task | New **T-23** ("Cross-spec doc handoff") appended to Phase 7, edits `.claude/specs/process-explorer-ui/STATUS.md`, names T-09 as the landing task. T-22 dep updated to include T-23. | line 116 | **cleanly absorbed** |

**Tally**: 8 cleanly absorbed, 1 partially absorbed (N-01 — see C-N1), 0 regressed.

## Critical check walk (the eight items from the brief)

| # | Critical check | Result |
|---|----------------|--------|
| 1 | B-01 T-18 split into a/b/c/d, each 1-3 files, sound deps | T-18a/b/c/d all exist; T-18d depends on a+b+c; T-19 depends on T-18d; cross-cutting test owned by T-18d. T-18a = 2 source files (node-labels.ts + router.ts edit). T-18b = 2 (edge-types.ts + router.ts edit). **T-18c = 4 source files** (versions.ts + audit.ts + migrations.ts + router.ts edit) — see C-N1 below. T-18d = 3 (import.ts + export.ts + router.ts edit). | **PASS with one stretch** |
| 2 | C-01 event-purge grep in T-20 | Line 109: `grep -F 'collect(e)' api/src/ontology/jobs/audit-retention.ts` returns ZERO hits, "executed via `execSync`". Testable. | **PASS** |
| 3 | C-02 registry-based exhaustiveness in T-03 | T-03 now: `error-throwers.ts` registry + exhaustive `Object.keys()` assertion + every value callable + per-thrower code-match. No annotation requirement leaks into downstream tasks. | **PASS** |
| 4 | C-03 stats handler refactor in T-09 + AC-01 poll | T-09 files column: `api/src/routes/stats.ts (edit if compile-time-bound)`. Validation step: "AC-01 test: POST a new label, poll `/api/v1/stats` until the key appears, assert ≤ 60 s". | **PASS** |
| 5 | C-04 dryRun ownership pin in T-11 / T-18d | T-11 line 82: PATCH-dryRun-schema-breaking sub-case stays in `ontology-edge-types.integration.test.ts`. T-18d line 102 explicit exclusion: "excluding the edge-type-specific sub-case owned by T-11". | **PASS** |
| 6 | C-05 `missing_documentation` mapping in T-18a + T-18b | T-18a (line 99): "zod `min(1)` violations on `description` / `usage_example` map to `400 missing_documentation` with `details.field` BEFORE falling through to `invalid_payload`". T-18b (line 100): "same `missing_documentation` mapping (pass-1 C-05) as T-18a". | **PASS** |
| 7 | N-01 task count + tally | Summary says 26 tasks; tally sums to 27 (4 trivial + 6 simple + 9 moderate + 8 complex = 27). **Off-by-one remains**. See C-N1. | **PARTIAL** |
| 8 | N-02 ASCII dep-graph | Dropped entirely with explicit rationale at lines 128-133. | **PASS** |
| 9 | N-03 T-23 PEU STATUS edit | T-23 (line 116) exists, files = `.claude/specs/process-explorer-ui/STATUS.md` (edit), validation = "git diff shows the block appended; the block names T-09 as the landing-task". T-22 dep updated to include T-23 (line 117). | **PASS** |

## Dependency graph soundness (post-split)

Walked the new edges:

- T-18a deps: T-10 (node-label storage), T-13 (caches), T-17 (route base) — sound. T-17 is the schema endpoint mount that establishes the router shape T-18a extends.
- T-18b deps: T-11 (edge-type storage), T-13, T-17 — sound.
- T-18c deps: T-05 (audit/version/event helpers), T-16 (migration executor), T-17 — sound.
- T-18d deps: T-18a + T-18b + T-18c — sound fan-in. Cross-cutting test needs all three to exist before it can exercise every mutating endpoint.
- T-19 deps: T-05, T-18d — correctly bumped from "T-17" (revision 1) to "T-18d" so the SSE route mounts after the router-mount finalisation.
- T-22 deps: T-00..T-21, T-23 — comprehensive.

**No cycles. No skipped wiring.** T-18d is the synchronisation point; T-19's `router.ts (edit)` is a separate later edit (additive mount), not in conflict with T-18d's "final mount + 404 fallthrough" because T-19 lands AFTER T-18d.

**Critical-path estimate**: tasks.md says 7-9 working days for the critical path (line 137), 6-9 with parallelisation (line 140). Plausible given the T-18 expansion.

## New concerns (carryovers for execution)

**C-N1 — Off-by-one task count + T-18c stretches the 1-3-files rule.**

Two minor structural issues remain after revision 2:

1. **Task count off by one.** Summary at line 17 says "**26 tasks**". Actual count: T-00 + T-01..T-17 + T-18a/b/c/d + T-19..T-23 = 1 + 17 + 4 + 5 = **27 tasks**. The complexity tally at lines 146-150 sums to the same 27 (4 trivial + 6 simple + 9 moderate + 8 complex = 27). The summary text is the wrong one; tally is correct. (Was off-by-5 in revision 1; off-by-1 now — a real improvement but the bug isn't gone.)

2. **T-18c at 4 source files.** T-18c (line 101) lists `versions.ts` + `audit.ts` + `migrations.ts` + `router.ts (edit)` = 4 source files. The 1-3-files rule asks for ≤3. Pass-1 B-01 was 8 files (3× over); T-18c is 4 files (1× over). The three new files are logically grouped (system-meta routes that all read from `_OntologyAudit`/`_OntologyVersion`/`_OntologyMigration` and share rollback semantics), so a further split into T-18c1 (versions+audit) + T-18c2 (migrations) would also be defensible. Not blocking — call this a stretch, not a violation.

**Open-accepted carryover** (no third revision available): the implementer should (a) fix the "26 tasks" string to "27 tasks" at PR time, (b) decide at execution whether T-18c warrants a further split based on actual file size.

**C-N2 — T-09's dependency on T-13 creates a backwards-looking arrow.**

T-09 (line 75) now depends on T-04, T-08, **and T-13**. T-13 (line 89) in turn depends on T-10 + T-11. T-10 and T-11 depend on T-05 + T-07. T-09 is the bootstrap refactor that calls `applyMetaSchema` + `seedRegistryFromConstTuples`, which traditionally would run before any storage code is wired. By pinning T-09 to T-13's schema cache (for the `/stats` handler refactor), the critical path now reads:

```
T-00 → T-01 → T-02 → T-04 + T-05 → T-07 → T-10 + T-11 → T-13 → T-09 (!) → T-15 + T-16 → T-17 → T-18a/b/c → T-18d → T-19 → T-22
```

T-09 effectively moves from "Phase 2" to "post-Phase 4". This is the right ordering for correctness (bootstrap re-runs after schema cache exists so `/stats` reads from the registry, not the const), but the phase labelling at line 67 ("Phase 2 — Meta-schema + bootstrap") now misrepresents when T-09 actually runs. Compare with the critical-path text at line 135 which has T-13 before T-09's effective lands.

**Open-accepted carryover**: at execution time, either (a) renumber T-09 into a later phase, or (b) split it into T-09a (bootstrap refactor only, no stats edit) under Phase 2 + T-09b (stats handler refactor) under Phase 4. The current shape works but the phase labels are now misleading.

## Open-accepted carryover summary (for execution)

| ID | Concern | Severity | Implementer action |
|----|---------|----------|--------------------|
| C-N1 | "26 tasks" text says 26, tally sums to 27. T-18c lists 4 source files (1 over rule). | low | At PR time: fix the count string; assess T-18c split need. |
| C-N2 | T-09's new T-13 dep makes Phase-2 labelling misleading (T-09 effectively runs post-Phase 4). | low | At PR time: consider splitting T-09 or relabelling phases. |

Both are PR-review-time pinning items, not blockers. Neither introduces a correctness gap; they're hygiene.

## FR / NFR / AC coverage walk (delta from pass 1)

Pass 1 verified 19/19 FRs, 9/9 NFRs, 20/20 ACs, and 20/21 design § covered. Revision 2 changes:

- **AC-01** now has an explicit landing task (T-09's stats handler audit), upgrading from "implicit via cache + T-13" to **explicit + named test**.
- **§3.5 PEU STATUS** now has T-23 — upgrades design § coverage to **21/21**.
- **AC-20 (error envelope shape)** is now explicitly under T-03's exhaustive registry test rather than spread across throw sites — cleaner.

No FR/NFR/AC regressed.

## Task-size audit (post-split)

| Task | Files | Within 1-3 rule? |
|------|-------|------------------|
| T-00..T-17 | unchanged from pass-1 | yes |
| **T-18a** | `node-labels.ts` + `router.ts` edit | yes (2) |
| **T-18b** | `edge-types.ts` + `router.ts` edit | yes (2) |
| **T-18c** | `versions.ts` + `audit.ts` + `migrations.ts` + `router.ts` edit | **stretch (4)** |
| **T-18d** | `import.ts` + `export.ts` + `router.ts` edit + cross-cutting test | yes (3 source + 1 test = 3 source-file) |
| T-19..T-23 | unchanged shape | yes |

26 of 27 honour the rule strictly; T-18c stretches by one file. Compared to revision 1's hard violation at T-18, this is a substantial improvement.

## Validation-checkpoint specificity (delta)

Pass 1 flagged T-18 and T-20 as vague. Revision 2:

- **T-18a/b/c/d** each name explicit test files (e.g. `ontology-new-label.integration.test.ts`, `ontology-edge-pair-violation.integration.test.ts`, `ontology-versioning.integration.test.ts`, `ontology-import-export.integration.test.ts`) — all concrete.
- **T-20** now has the explicit grep assertion (C-01 fix) — concrete.

No validation step in revision 2 is genuinely vague except T-22 ("all tests green"), which is acceptable as a final-pass CI step.

## Complexity ratings audit (delta)

Pass 1 flagged T-17 as possibly moderate (was simple). Revision 2 line 50 says: "task-rating adjustment: **T-17** moderate (was simple — alignment filter + ARTS fixture push it up)" — **acknowledged and corrected**.

Pass 1 flagged T-18 as "phase, not a task". The split into 4 complex tasks at the right granularity resolves this.

All other ratings remain plausible.

## Strengths of revision 2

1. **Explicit pass-1 resolution table** (lines 38-48) makes pass-2 verification fast.
2. **B-01 split is well-shaped**: T-18a/b/c/d boundaries match logical surfaces (node-labels / edge-types / versions+audit+migrations / import+export+cross-cutting). T-18d as the fan-in synchronisation point owns the cross-cutting test naturally.
3. **C-02's registry switch is cleaner than annotations** — single source of truth, exhaustive at compile time, no per-throw-site convention to enforce across 6+ tasks.
4. **C-03's fix is properly scoped**: edits the actual file (`stats.ts`), gates the dep correctly (T-09 → T-13), and adds the AC-01 60-s poll assertion.
5. **C-04 + C-05 fixes are testable one-liners** that close the contract gaps without adding structural complexity.
6. **N-02 drop with rationale** is the right call — the per-task "Depends on" column is the canonical source, and the ASCII graph was misleading.

## Finding counts

- **Pass-1 findings cleanly absorbed**: 8 of 9
- **Pass-1 findings partially absorbed**: 1 of 9 (N-01 — count now off by 1 instead of 5)
- **Pass-1 findings regressed**: 0
- **New blockers introduced**: 0
- **New concerns introduced**: 2 (C-N1 task-count + T-18c stretch; C-N2 T-09 phase-label drift)
- **New nits introduced**: 0
- **FR coverage**: 19/19
- **NFR coverage**: 9/9
- **AC coverage**: 20/20 (AC-01 now explicit)
- **Design § coverage**: 21/21 (§3.5 now under T-23)
- **Open-accepted carryovers for execution**: 2 (C-N1, C-N2)

## Pass tracking

- This is **pass 2 of 2** (FINAL) for the tasks phase.
- Verdict: **approve**. Pass-1 findings cleanly absorbed (8/9) or partially absorbed (1/9 — count off-by-1 only); two new minor concerns flagged as open-accepted carryovers for the implementer to pin at PR-review time. No third revision available per HARD CAP.
- **Implementer carryovers** (PR-time):
  1. Fix "26 tasks" → "27 tasks" in tasks.md line 17.
  2. Decide whether T-18c (4 source files) warrants a further split.
  3. Decide whether T-09's new T-13 dep warrants a phase relabel or a T-09a/T-09b split.
- All other guidance is execution-ready.
