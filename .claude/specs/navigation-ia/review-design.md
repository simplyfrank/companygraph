---
feature: "navigation-ia"
reviewing: "design.md rev 2"
reviewer: "Claude (spec-workflow auto-review)"
date: "2026-07-06"
verdict: "approve"
revision: 1
---

# Design Review: navigation-ia (pass 1)

## Verdict: **approve** (on rev 2)

0 blockers, 0 concerns, 3 nits (shipped open per spec-workflow rule).

---

## Rev-1 blockers — resolved in rev 2

### B-01 (rev 1): `analytics/Settings.tsx` cannot be deleted — it is a live dependency of `Complexity.tsx`

**Resolved in rev 2.** The disposition is changed from "delete" to "keep as
internal module." The File Changes table now lists it as `—` (not deleted,
not modified). The orphan guard test allowlist includes `Settings.tsx` as a
shared internal module consumed by `Complexity.tsx`.

### B-02 (rev 1): `analytics/ExecSummary.tsx` cannot be deleted — it is a wired, tested, spec-owned view

**Resolved in rev 2.** The disposition is changed from "delete" to "keep —
wire at `#/insights/exec-summary`." The `insights` surface now has 14 tabs
(with `exec-summary` added to the `reports` group). The alias row
`analytics/exec-summary → insights/overview` is removed. The
`analytics-exec-summary-launcher.test.tsx` is added to the File Changes
table for route update. The blueprint amendment is updated to reflect
retention (not deletion).

---

## Rev-1 concerns — resolved in rev 2

### C-01 (rev 1): `RollDownAnalytics.tsx` embedding mechanism unspecified

**Resolved in rev 2.** `RollDownAnalytics` is wired as a separate tab at
`#/govern/roll-down-analytics` — no interior change to `RollDown.tsx`
needed. The govern surface's tabs array now includes `roll-down-analytics`.
Export name `RollDownAnalytics` is recorded.

### C-02 (rev 1): `RiskDashboard.tsx` + `ExecRisk.tsx` de-duplication requires NFR-04 exception

**Resolved in rev 2.** NFR-04 exception (e) is explicitly added to the
design's rules list (§1, rule 5). The orphan triage table and File Changes
table both reference `NFR-04(e)` for `RiskDashboard.tsx`. The mechanism is
specified: import `ExecRisk` and render it as a "Register" section within
`ExecRiskDashboard`.

### C-03 (rev 1): Export name mismatches not noted

**Resolved in rev 2.** All orphan triage table rows now include the actual
export names: `ExecRollDown`, `RollDownAnalytics`, `ExecRiskDashboard`,
`ProgramManagement`, `ContextAlignment`, `GlossaryManager`,
`ComplianceManager`, `OntologyGenerator`, `AnalyticsExecSummary`.

---

## Nits (shipped open)

### N-01: `TopBar.tsx` local `Surface` interface also has `kbd`

The design says `Surface.kbd` is removed from `route.ts`, but `TopBar.tsx:3-8`
defines its own local `Surface` interface with `kbd?: string`. The design
should note that this local interface is also updated (or the `kbd` field
is made optional and ignored — but cleaner to remove it). Not blocking —
the implementer will discover this via TypeScript.

### N-02: `touch-targets.test.tsx` asserts structure, not 44px

The existing test file's header comment explicitly states: "the catalog
`Button` is a fixed 28px control — there is no 44px rule anywhere in the
PWA." Rev 2 updated the AC-14 test strategy to "structure-only assertions
(existing pattern — jsdom cannot compute CSS; pixel-size verified
manually)." This is consistent with the existing test's approach. Not
blocking — the manual verification covers pixel size.

### N-03: `deep-link.test.tsx` references `journey-detail` tab which will be aliased

Rev 2 added a note to the File Changes table: "update `journey-detail` test
case for alias." Not blocking — the implementer will update this test case
when modifying the file for AC-16.

---

## Prior-review concerns — resolution check

| ID | Status | Notes |
|----|--------|-------|
| Pass-2 C-01 (bare legacy surface hashes) | ✅ Resolved | §4.3 includes four bareSurfaceDefault rows; AC-17 covers exhaustive iteration |
| Pass-2 C-02 (FR-12 "resolves forever" vs FR-04†) | ✅ Resolved | §2 confirms landed branch; blueprint amendment §(c) records retarget |
| Pass-2 N-01 (virtual-tab mechanism) | ✅ Resolved | §4.4 generalizes to per-surface VIRTUAL_TABS map |
| Pass-2 N-02 (breadcrumb landmark + focus trap) | ✅ Resolved | §8 explicitly includes both assertions in named test files |

---

## Summary

Rev 2 resolves all blockers and concerns from the rev-1 review. The design
is thorough, well-structured, and ready for the tasks phase. The three nits
are non-blocking and shipped open per the spec-workflow
ship-with-known-open-nits rule. The `exec-summary` retention is the correct
call — it preserves a working, tested feature from a completed spec. The
NFR-04 exception list is now explicit with five enumerated items. All
export names are recorded for the tasks phase.
