# Spec Adopt — Retrofit an Existing Project onto Spec-Driven Governance

You are the conductor that takes an **existing code project** and brings all of
its work under the spec-driven development process. You plan and execute every
step required so that, when you are done:

1. The full spec pipeline (templates, workflow, hooks, config) exists in the repo.
2. There is **one canonical specs location** — `.claude/specs/` (overridable via
   `.specconfig.specs_root`) — that every piece of automation refreshes from.
3. A **single as-built baseline spec** documents the current architecture so
   pre-existing code is governed.
4. **Hard-block enforcement is active**: no source file can be edited without a
   governing approved spec.
5. The spec process **correctly breaks every requirement down into design and
   tasks** — verified mechanically, not by eyeballing.

This skill is project-agnostic. It detects build/test commands and code roots;
it never hardcodes paths. It reuses the `spec-workflow` skill for authoring new
specs going forward.

## Commands

- `/spec-adopt` or `/spec-adopt run` — plan + execute the full retrofit (drives all phases)
- `/spec-adopt status` — show where the retrofit is (config, baseline, enforcement)
- `/spec-adopt refresh` — re-run inventory + traceability sweep from `.claude/specs/`
- `/spec-adopt enforce on|off` — flip the hard-block (`.specconfig.enforced`)

## The plan you execute

Drive these phases proactively. Present each artifact with its path, summarize,
and use AskUserQuestion to gate phase transitions — same cadence as
`spec-workflow`. Do not move past a gate without approval.

### Phase 0 — Bootstrap (idempotent)

1. Run `scripts/spec/spec-bootstrap.sh`. This writes `<specs_root>/.specconfig`,
   `workflow.md`, `templates/`, copies the two enforcement hooks, and registers
   them in `.claude/settings.json` (PreToolUse Write|Edit). Existing files are
   never clobbered.
2. Read back `<specs_root>/.specconfig` and report the detected `build_cmd`,
   `test_cmd`, `code_globs`, and `specs_root`. If detection looks wrong, ask the
   user for the correct commands and edit `.specconfig` before continuing.
3. **Gate**: "Bootstrap done; config detected as <…>. Proceed to inventory?"

### Phase 1 — Inventory & plan

1. Run `scripts/spec/spec-inventory.sh`. Read `<specs_root>/_inventory.md`.
2. Run `scripts/spec/spec-traceability.sh --all` to see which *existing* specs
   (if any) already fail the breakdown contract — these get fixed during refresh,
   not now.
3. Present the coverage map: total / governed / ungoverned code areas, plus the
   list of ungoverned areas that the baseline must cover.
4. **Gate**: "This is the retrofit plan. Approve to write the as-built baseline?"

### Phase 2 — As-built baseline spec

Author **one** spec at `<specs_root>/<baseline_spec>/` (default `_baseline`) that
reverse-documents the system **as it exists today**. Use the real templates.

- `requirements.md` — one FR per major capability/subsystem actually present
  (derive from the inventory + a codebase read). Every FR gets an AC whose
  Verification points to an existing test, or `manual: <procedure>` if none.
- `design.md` — the current architecture: File Changes table lists the real
  top-level modules (action `as-built`), Design Decisions capture load-bearing
  choices already in the code, each `DD`/row tagged with the `FR-xx` it covers.
  Map **every FR** into this document.
- `tasks.md` — for a baseline, tasks are "ratify <area>" entries: each cites the
  `AC-xx` it backs and its Validation Checkpoint is the existing test or a
  written manual procedure. Every FR and every AC must be referenced by ≥1 task.
- `STATUS.md` — generated; Execution = `complete`; set `verified_at` and
  `verification_artifact` (the completion hook blocks otherwise).

Before you write `STATUS.md` complete, **run
`scripts/spec/spec-traceability.sh <specs_root>/<baseline_spec>` yourself** and
fix every gap it reports. The `spec-traceability-check.sh` hook will block the
STATUS edit if you skip this.

**Gate**: present the baseline spec paths + traceability result → approve.

### Phase 3 — Activate enforcement

1. Set `"enforced": true` in `<specs_root>/.specconfig`.
2. Smoke-test the guard: explain that from now on, editing any source file not
   listed in an approved spec (or the baseline) is blocked by
   `.claude/hooks/spec-guard.sh`, and new work must start with `/spec new`.
3. **Gate (explicit, blocking)**: "Activating hard-block enforcement on this
   repo. Every future code edit will require a governing approved spec. Confirm?"
   — only flip `enforced` after an explicit yes.

### Phase 4 — Steady state

- New feature → `/spec new <feature>` (spec-workflow skill). Its `design.md`
  must list the files it touches and reach `status: approved` before the guard
  lets those files be edited.
- `/spec-adopt refresh` re-runs inventory + `spec-traceability.sh --all`.
- Wire `scripts/spec/spec-coverage.sh --base origin/main` into CI so governance
  also holds for changes made outside an interactive session.

## Guardrails

- **NEVER flip `enforced` to true without the explicit Phase 3 confirmation** —
  it changes the blast radius of every subsequent edit in the repo.
- **NEVER hand-wave traceability.** Always run `spec-traceability.sh` and paste
  its real output. "Looks complete" is not acceptance.
- The baseline spec is **as-built documentation**, not a place to design new
  work. Keep it descriptive; new behavior goes in its own spec.
- Everything is additive. If `.specconfig`, `workflow.md`, or templates already
  exist, keep the user's versions — only fill what's missing.
- If `jq` is unavailable, bootstrap prints manual hook-registration steps;
  surface them to the user rather than silently proceeding.

## Artifacts

- ⚙️ `<specs_root>/.specconfig` — canonical config every tool refreshes from
- 📊 `<specs_root>/_inventory.md` — coverage map
- 📄 `<specs_root>/<baseline_spec>/{requirements,design,tasks,STATUS}.md`
- 🪝 `.claude/hooks/spec-guard.sh`, `.claude/hooks/spec-traceability-check.sh`
- 🔧 `scripts/spec/{spec-bootstrap,spec-inventory,spec-traceability,spec-coverage}.sh`
