# Spec Workflow

**When to use:** Multi-phase feature implementation (anything
larger than a single-file bug fix or 1–2 hour change).
**Canonical example:** `.claude/specs/self-improvement-loop/`
**Template:** `.claude/specs/templates/`
**Enforced by:** `.claude/hooks/spec-completion-check.sh`
**Related:** [commit-messages.md](commit-messages.md), the
`spec-workflow` skill (orchestrator).

## Spec directory shape

```
.claude/specs/<feature-name>/
├── requirements.md      FR-01..FR-NN, NFR-01..NFR-NN
├── design.md            DD-01..DD-NN, file-change table, architecture
├── tasks.md             T-01..T-NN, each with files, acceptance, deps
├── STATUS.md            current phase, approvals, verification artifact
└── review-<phase>.md    review agent output, per phase
```

Templates for each file live in `.claude/specs/templates/` — start
there, don't hand-roll the structure.

## Phases (in order)

```
planning
  → requirements
  → requirements-review
  → design
  → design-review
  → tasks
  → tasks-review
  → execution
  → verification
```

A phase does not advance without the prior review's sign-off
recorded in STATUS.md. See the STATUS table in
`.claude/specs/self-improvement-loop/STATUS.md:3-13` for the exact
format (Phase | Status | Approved By | Date).

## Completion gate

`.claude/hooks/spec-completion-check.sh` fires on Write/Edit to
any `*.claude/specs/*/STATUS.md`. It blocks marking Execution
`complete` without two fields:

- `verified_at` (ISO timestamp), AND
- `verification_artifact` — EITHER a test file path, OR the literal
  string `manual: <one-line procedure>`.

Without both, the hook refuses the write. This exists because
prior specs self-marked "complete" with "visual check" /
"manual test" and no test or written procedure was ever captured;
months later nobody could tell whether the feature ever worked or
regressed silently (hook rationale, `:9-13`).

## Review cycle cap

Per the stored feedback in
`memory/feedback_spec_workflow.md`: **1 review per phase,
~2 edit rounds max.** Blockers get fixed. Concerns/nits acknowledged
as open. Don't iterate the review until it approves
unconditionally — diminishing returns. Ship and move to the next
phase.

## Required (acceptance checklist)

- [ ] Spec lives under `.claude/specs/<feature-name>/` with all
      four files + per-phase review files.
- [ ] Each phase reaches an approved status in STATUS.md before
      the next phase begins.
- [ ] `tasks.md` entries reference concrete **files:line-ranges**,
      not other spec docs — an implementer should not have to
      cross-read `design.md` to know what to edit.
- [ ] STATUS is updated after every meaningful implementation
      change; execution drift is visible.
- [ ] When marking Execution complete, STATUS.md includes BOTH
      `verified_at` and `verification_artifact`. The hook will
      block the write otherwise.
- [ ] Commit messages reference the spec: `.claude/specs/<name>/`
      in the body (see commit-messages.md).

## Anti-patterns

- Skipping the review phase because "it's small" — the review
  catches over-scoping (doing more than needed) and under-scoping
  (missing adjacent concerns). Both bite later.
- Three-plus review passes on one phase — ROI drops fast; ship
  the concerns as open items and move on.
- Tasks that say "see design.md DD-05" without the concrete file
  and line range — ambiguous for the implementer; they re-derive
  the plan and drift from design.
- Implementation that diverges from `tasks.md` without updating
  STATUS.md — the spec becomes stale; the next maintainer
  (possibly a later Claude session) can't tell what's current.
- Ad-hoc multi-phase implementation via conversation, never
  written down — acknowledged debt in this repo: the memory
  refactor + test-harness hardening this session should have been
  specs and weren't. Don't repeat.
- Marking Execution complete with `verification_artifact: none` —
  the hook allows the write (string is set), but the field's
  purpose is defeated. If no test exists, write a manual procedure.

## Extending

- New spec: copy `.claude/specs/templates/*.md` into
  `.claude/specs/<name>/`, fill in requirements, open with the
  `spec-workflow` skill or invoke the phase-review agent directly.
- Adding a new review cycle to an existing spec: create
  `review-<phase>-v<N>.md` next to the existing `review-<phase>.md`;
  STATUS table column `Approved By` records who / what approved
  (e.g. `spec-review-agent`, `frank`).
- Moving a spec to done: update STATUS's Execution row to
  `complete`, add `verified_at` + `verification_artifact`, commit
  with `docs(spec): mark <name> complete`.
