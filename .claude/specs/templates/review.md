---
feature: "<slug>"
reviewing: "<requirements|design|tasks>"
reviewing_revision: <N>
reviewer: "spec-review-agent"
verdict: "<approve|revise|reject>"
review_pass: <1|2>
reviewed_at: "<YYYY-MM-DD>"
---

# Review: <slug> / <phase> (pass <N>/2)

## Verdict

**<approve | revise | reject>** — <one-sentence justification>.

- approve: zero blockers (concerns/nits may remain open).
- revise: ≥1 blocker; author must address every Blocker and Concern.
- reject: fundamentally flawed approach; recommend restart with direction.

## Blockers
<!-- Must fix before approval. Missing critical info, architectural conflict,
     traceability break, security issue, task without a Verification field.
     Quote exact text; cite FR-/AC-/DD-/T- IDs and file:line. Suggest the
     concrete fix, not a vague improvement. Write "none" if none. -->

- **B-01** — <finding + concrete fix>

## Concerns
<!-- Should fix; not blocking on its own. Minor gap, suboptimal pattern,
     missing edge case. Concerns left open at approval are recorded here and
     pinned by the next phase's author. -->

- **C-01** — <finding + suggested resolution>

## Nits
<!-- Optional. Style, naming, doc polish. -->

- **N-01** — <finding>

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | pass / fail: <gaps> |
| Every AC is closed by a task with Verification | pass / fail: <gaps> |
| Routes/views match the blueprint View Tree verbatim | pass / fail / n-a |
| UX-* allowances covered in ACs (pwa/ specs) | pass / fail / n-a |
| XD-* cross-cutting decisions honoured | pass / fail / n-a |
| No file ownership conflict with another spec | pass / fail: <spec> |

## Summary

<3–5 bullets: what's solid, what the findings have in common, what the author
should do first.>
