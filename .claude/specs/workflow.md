# companygraph spec process

Single source of truth for how a feature moves from idea to verified code.
Skills implement this process (`/spec` via `.claude/skills/spec-workflow/`,
reviews via `.claude/skills/spec-review/`, app-scale fan-out via
`.claude/skills/spec-app/`); hooks enforce it. Templates live in
`.claude/specs/templates/`.

## Pipeline

```
requirements ──(review)──► design ──(review)──► tasks ──(review)──► execute
     ▲                        ▲                    ▲                    │
     └────────── revise loops (max 2 passes per phase) ─────────────────┘
```

Artifacts per feature, under `.claude/specs/<slug>/`:
`requirements.md`, `design.md`, `tasks.md`, `review-<phase>.md`, `STATUS.md`.

## Size rules

Assessed at requirements time; recorded in frontmatter `size:`.

| Size | Files touched | Design phase | Reviews |
|------|---------------|--------------|---------|
| small | <3 | skipped | none |
| medium | 3–10 | yes | requirements + design |
| large | 10+ | yes | requirements + design + tasks |

**Promotion rule:** touches `pwa/` AND mentions gestures, keyboard shortcuts,
or input handlers → at least `medium`, regardless of file count.

## Gates

Two kinds; never confuse them.

- **Interactive gates** (default `/spec` flow): after every artifact the
  orchestrator presents it, summarises, and asks Approve / Revise / Reject via
  AskUserQuestion. Never self-approve.
- **Autonomous review gates** (`/spec-app` fan-out): a fresh reviewer agent's
  verdict is the gate (`revise` loops the author, `approve` advances); humans
  gate at the app level instead — blueprint approval before the fan-out,
  consolidated report after. In single-shot mode the blueprint approval also
  authorizes implementation; the deterministic checks below carry the run.

**Review cap (hard):** 1 initial review + at most 1 re-review per phase.
Pass 3+ is refused — ship with open nits. Tracked as `review_passes` in
STATUS.md; reset to 0 on phase advance. Override only on an explicit
"override cap" from the user.

## Traceability contract

- Every **FR** maps to design file-changes and to at least one task.
- Every **AC** has Platforms + Verification columns and is closed by a task.
- Every **task** cites the AC(s) it closes, touches ≤3 files, and carries a
  **Verification** field: a test path or
  `manual: <repro with input mode + observable outcome>`.
- UI specs: routes/views come **verbatim** from the app blueprint's View Tree;
  ACs cover the blueprint's UX-* allowances.
- Stable IDs (FR-/NFR-/AC-/DD-/T-/XD-/UX-) are never renumbered in revisions.

## Deterministic checks

| Check | When | What it enforces |
|-------|------|------------------|
| `bun run typecheck` | after every task | api + pwa transpile (no tsc) |
| `bun test` / `bun test:integration` | per task's Verification, and at completion | behaviour |
| `bun run scripts/design-conformance.ts --view <file>` | every touched pwa view | tokens-only styling, no foreign design-system leakage |
| `.claude/hooks/spec-gate-check.sh` | Write/Edit on source files | no edits to files a spec's design names until that design is `status: approved` |
| `.claude/hooks/spec-guard.sh` | Write/Edit on source files | (once `.specconfig` exists with `enforced: true`) every source edit needs a governing approved spec |
| `.claude/hooks/spec-traceability-check.sh` | STATUS.md advances to approved/complete | (once `scripts/spec/spec-traceability.sh` exists) FR→design→tasks flow is unbroken |
| `.claude/hooks/spec-completion-check.sh` | STATUS.md marks Execution complete | `verified_at` + non-placeholder `verification_artifact` present |

Note: spec-guard and the traceability gate are **installed but dormant** until
`/spec-adopt` bootstraps `.claude/specs/.specconfig` and
`scripts/spec/spec-traceability.sh`.

## Frontmatter conventions (load-bearing)

- `created: "YYYY-MM-DD"` (quoted) — traceability grandfathering cutoff reads it.
- `status:` walks `draft → in-review → revised → approved`; design's `status`
  is what unblocks source-file edits.
- `revision:` increments on every revise pass; reviews record
  `reviewing_<phase>_revision` so verdicts pin to a concrete revision.

## Templates

| Artifact | Template |
|----------|----------|
| requirements.md | `.claude/specs/templates/requirements.md` |
| design.md | `.claude/specs/templates/design.md` |
| tasks.md | `.claude/specs/templates/tasks.md` |
| review-<phase>.md | `.claude/specs/templates/review.md` |
| STATUS.md | `.claude/specs/templates/STATUS.md` |
| App blueprint | `.claude/skills/spec-app/templates/blueprint.md` |

Worked examples of house format: `.claude/specs/graph-core/` (API-heavy,
large) and `.claude/specs/process-explorer-ui/` (UI-heavy, large).
