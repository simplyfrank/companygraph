---
feature: "navigation-ia"
reviewing: "tasks.md rev 2"
reviewer: "Claude (spec-workflow auto-review)"
date: "2026-07-06"
verdict: "approve"
revision: 1
---

# Task Review: navigation-ia (pass 1)

## Verdict: **approve** (on rev 2)

0 blockers, 0 concerns, 2 nits (shipped open per spec-workflow rule).

---

## Rev-1 blocker — resolved in rev 2

### B-01 (rev 1): `AgentChat.tsx` modification is not assigned to any task

**Resolved in rev 2.** T-10 now lists 4 files (was 3), adding
`pwa/src/views/chat/AgentChat.tsx` (modify). Step 3 is added with
concrete instructions for the NFR-04(c) exception: change signature to
accept `conversationId` prop, initialize state from prop, add
`useEffect` for history hydration via `api.chat.listMessages`. Step 4
( Thread.tsx ) renumbered accordingly.

---

## Rev-1 concerns — resolved as nits or shipped open

### C-01 (rev 1): T-08 blocked by too many tasks

**Shipped open.** The current ordering works correctly — T-08 is the
integration point and serializing behind its dependencies is safe. The
recommendation to split into T-08a/T-08b would improve parallelism but
is not a correctness issue. The implementer may split at their
discretion during execution.

### C-02 (rev 1): T-18 is a mega-task

**Shipped open.** T-18 touches 6 test files with 15 ACs. The
recommendation to split by test file would improve reviewability but is
not a correctness issue. The implementer may split at their discretion
during execution.

---

## Nits (shipped open)

### N-01: T-13 file count

Fixed in rev 2 — file count corrected from 3 to 4.

### N-02: T-04 transitive dependency on T-11

T-04 is blocked by T-10, which is blocked by T-11. This transitive
dependency is correct and implied by the Blocked-by chain. Not blocking
— the implementer will discover this via the dependency graph.

---

## AC coverage matrix

All 22 ACs covered. No gaps.

| AC | Task(s) | Covered? |
|----|---------|----------|
| AC-01 | T-01, T-08, T-18 | ✅ |
| AC-02 | T-01, T-03, T-08, T-18 | ✅ |
| AC-03 | T-02, T-08, T-18 | ✅ |
| AC-04 | T-02, T-06, T-18 | ✅ |
| AC-05 | T-03, T-18 | ✅ |
| AC-06 | T-09, T-10, T-20 | ✅ |
| AC-07 | T-10, T-20 | ✅ (rev 2: AgentChat.tsx now in T-10) |
| AC-08 | T-02, T-08, T-18 | ✅ |
| AC-09 | T-08, T-12, T-18 | ✅ |
| AC-10 | T-08, T-18 | ✅ |
| AC-11 | T-02, T-08, T-18 | ✅ |
| AC-12 | T-02, T-08, T-18 | ✅ |
| AC-13 | T-04, T-05, T-07, T-19 | ✅ |
| AC-14 | T-06, T-18 | ✅ |
| AC-15 | T-04, T-14, T-15, T-17 | ✅ |
| AC-16 | T-04, T-18 | ✅ |
| AC-17 | T-02, T-18 | ✅ |
| AC-18 | T-02, T-18 | ✅ |
| AC-19 | T-04, T-16, T-18 | ✅ |
| AC-20 | T-11, T-21 | ✅ |
| AC-21 | T-15, T-18 | ✅ |
| AC-22 | T-13, T-22 | ✅ |

---

## File ownership check

No file is modified by two independent tasks. All shared files are
sequenced via Blocked-by. No conflicts.

---

## Summary

Rev 2 resolves the sole blocker (AgentChat.tsx modification added to
T-10). All 22 ACs are covered, file ownership is clean, and the
dependency graph is acyclic. The two shipped-open concerns (T-08 and
T-18 task size) are parallelism recommendations, not correctness issues.
The tasks are ready for execution.
