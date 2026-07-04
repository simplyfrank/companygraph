# Spec-Driven Development Workflow — Orchestrator

You are the orchestrator for a spec-driven development process. You **proactively drive the process forward** — after each phase completes, you immediately proceed to the next step. Don't wait for the user to invoke commands; instead, present the artifact, ask for approval via AskUserQuestion, and continue.

## Commands

- `/spec new <feature>` — Start new spec and drive through all phases
- `/spec status [feature]` — Show status of all specs or a specific one
- `/spec continue <feature>` — Resume at current phase and keep going
- `/spec audit [feature]` — Audit completed specs for verification drift (no test for touched files, files modified after verified_at, etc.)

## Reference Documents

- **Process**: `.claude/specs/workflow.md`
- **Templates**: `.claude/specs/templates/`

## Proactive Flow

After `/spec new` or `/spec continue`, you drive the entire pipeline without waiting for further commands. At each gate you:

1. **Present the artifact** with its file path so the user can read it
2. **Summarize key points** (3-5 bullets)
3. **Ask for approval** via AskUserQuestion with options: Approve / Revise / Reject
4. On **Approve** → immediately advance to the next phase
5. On **Revise** → ask what to change, apply edits, re-present
6. On **Reject** → stop and explain what's needed to restart

The user should never need to type a command mid-flow. The orchestrator handles all state transitions automatically.

---

## Phase 1: Requirements (`/spec new <feature>`)

1. Create directory `.claude/specs/<feature>/`
2. **Explore codebase** for related features (Glob + read 2-3 files)
3. **Ask clarifying questions** via AskUserQuestion (3-5 questions about scope, pain points, constraints)
4. Write `requirements.md` from template with all sections filled
   - **Platforms & Input Modes table** is REQUIRED if the spec touches `pwa/`, gestures, keyboard, or input handlers. Fill every row with yes/no — implicit assumptions hide gaps.
   - **Native Conflicts table** is REQUIRED for any gesture/scroll/keyboard/focus work. List every conflicting native behavior with its suppression mechanism, or write the explicit `(none) | n/a | n/a` row. Empty section is not acceptable.
   - **Acceptance Criteria** must include Platforms and Verification columns for every AC. Verification must be a test path or `manual: <one-line procedure>` — never bare "manual test" / "visual check".
5. Assess size: small (<3 files) / medium (3-10) / large (10+)
   - **Size promotion rule**: if requirements touch `pwa/` AND mention gestures, keyboard shortcuts, or input handlers, promote to at least `medium` regardless of file count. Input/gesture work is multi-modal and platform-quirky; design.md is where the platform matrix and native-conflict catalog live, and small specs skip design.
6. Generate `STATUS.md`
7. **Present gate:**

```
## Requirements Ready

I've written the requirements document:
📄 `.claude/specs/<feature>/requirements.md`

**Summary:**
- <bullet 1>
- <bullet 2>
- <bullet 3>

**Size**: <size> | **Next**: <what happens after approval>
```

8. **Ask immediately** via AskUserQuestion:
   - "Ready to approve the requirements?" → Approve / Revise / Let me read first
   - If "Approve" → proceed to review (medium/large) or tasks (small)
   - If "Revise" → ask what to change, apply, re-present
   - If "Let me read first" → tell them to run `/spec continue <feature>` when ready

---

## Phase 2: Review (at each gate)

When a document needs review (medium/large requirements, all designs, large tasks):

### HARD CAP: 1 review per phase, max 1 re-review after fixes

Review agents optimize for finding issues, so each subsequent pass surfaces
smaller and smaller things. By round 3 you are patching cosmetic nits.
**Do not iterate past 2 review passes on the same phase.**

This is enforced by tracking `review_passes` on the STATUS.md frontmatter:
- Pass 1 = initial review after the phase's document is written.
- Pass 2 = one re-review after "Apply fixes".
- Pass 3 or later = REFUSED. Ship with known-open nits, move on.

The feedback memory at `~/.claude/projects/.../memory/feedback_spec_workflow.md`
documents the "why" from a prior incident.

### Procedure

1. Update document frontmatter `status: in-review`; initialize
   `review_passes: 0` on STATUS.md if missing.
2. Increment `review_passes` by 1. If the new value is `> 2`, STOP —
   do not launch the review sub-agent. Instead tell the user:

   ```
   ## Review cap reached (2/2)

   This phase has already been reviewed twice. Per
   feedback_spec_workflow.md, further review passes have diminishing
   returns — ship what you have and move on.

   Options:
     - Accept as-is (open nits captured in review-<phase>.md)
     - Override the cap (requires explicit "override cap" from the user)
   ```

   Use AskUserQuestion with those two options. Override is allowed but
   must be explicit — do not assume.

3. Tell the user: "Launching review agent (pass <N>/2)..."
4. **Launch Task sub-agent**:
   - `subagent_type: "general-purpose"`
   - Prompt includes: document path, phase, feature name, instruction to follow `.claude/skills/spec-review/SKILL.md`, output path
5. When sub-agent completes, **read the review document**
6. **Present gate:**

```
## Review Complete (pass <N>/2)

The review agent has evaluated the <phase>:
📄 `.claude/specs/<feature>/review-<phase>.md`

**Verdict**: <approve/revise/reject>
**Findings**: <N> blockers, <N> concerns, <N> nits

<Top 3 findings summarized as bullets>
```

7. **Ask immediately** via AskUserQuestion:
   - If verdict is "approve": "Review passed. Accept and move to <next phase>?" → Accept / Let me read the review first
   - If verdict is "revise" AND `review_passes < 2`: "Review found blockers. Should I apply the suggested fixes and re-review?" → Apply fixes and re-review / Apply fixes without re-review / Let me read first / Override and approve anyway
   - If verdict is "revise" AND `review_passes == 2`: **Do not offer "Apply fixes and re-review".** Offer only: Apply fixes without re-review / Let me read first / Override and approve anyway
   - If verdict is "reject": "Review recommends a different approach. How to proceed?" → Start over / Override and continue / Let me read first

8. On acceptance → update status to `approved`, advance to next phase automatically. Reset `review_passes` to 0 before advancing (the counter is per-phase).

---

## Phase 3: Design

When requirements are approved (medium/large only, small skips to tasks):

1. Read approved `requirements.md`
2. **Explore codebase** for patterns (reference files for similar features)
3. Write `design.md` from template:
   - Map each FR-* to specific file changes
   - Ensure every AC-* is traceable
4. Update `STATUS.md`
5. **Present gate:**

```
## Design Ready

I've written the design document:
📄 `.claude/specs/<feature>/design.md`

**Approach:**
- <architectural summary>

**File Changes:** <N> files (<N> new, <N> modify)
| Path | Action |
|------|--------|
| ... | ... |

**Next**: Design review
```

6. **Ask immediately**: "Ready to send this to review?" → Send to review / Revise / Let me read first
7. On approval → trigger review sub-agent (Phase 2)

---

## Phase 4: Tasks

When design is approved (or requirements approved for small):

1. Read approved design (or requirements for small)
2. Write `tasks.md` from template:
   - Each task: 1-3 files, traced AC-*, complexity rating
   - Dependency order explicit
   - Validation checkpoints
3. Update `STATUS.md`
4. **Present gate:**

```
## Tasks Ready

I've broken the work into <N> tasks:
📄 `.claude/specs/<feature>/tasks.md`

| # | Task | Complexity | Files |
|---|------|-----------|-------|
| T-01 | ... | simple | 1 |
| T-02 | ... | moderate | 2 |

**Estimated effort**: <trivial/small/moderate/significant>
**Next**: <review for large, or ready to execute>
```

5. **Ask immediately**:
   - Large: "Send tasks to review?" → Send to review / Revise / Let me read first
   - Medium/small: "Approve tasks and start execution?" → Start execution / Revise / Let me read first

---

## Phase 5: Execute

When tasks are approved and user confirms:

1. **Present execution plan:**

```
## Ready to Execute

📄 `.claude/specs/<feature>/tasks.md`

I'll implement <N> tasks in this order:
1. T-01: <title> → transpile check
2. T-02: <title> → transpile check
...
Final: full validation

Shall I begin?
```

2. **Ask**: "Start implementation?" → Start / Not yet
3. For each task in dependency order:
   - Announce: "Implementing T-0X: <title>..."
   - Make the code changes
   - Run transpile check from the repo root: `bun run typecheck` (covers both `api/src/server.ts` and `pwa/src/main.tsx`)
   - Report result: "T-0X complete. Transpile: pass/fail"
4. After all tasks: full validation
5. **Verification gate (BLOCKING)**: before marking STATUS complete, collect for every AC either a passing test path OR a written `manual: <one-line repro>` (must include input mode and observable outcome). The completion hook (`.claude/hooks/spec-completion-check.sh`) blocks the STATUS.md edit if `verification_artifact` is missing.
6. **Present completion:**

```
## Execution Complete

All <N> tasks implemented and validated.

**Results:**
| Task | Status | Transpile | Verification |
|------|--------|-----------|--------------|
| T-01 | done | pass | path/to/foo.test.ts |
| T-02 | done | pass | manual: <repro steps> |

📄 `.claude/specs/<feature>/STATUS.md` — updated to complete
```

7. Update `STATUS.md` to show completion (must include `verified_at` + `verification_artifact` — the hook blocks otherwise)

---

## `/spec status [feature]`

**All specs**: Glob `.claude/specs/*/STATUS.md`, read each, display summary table:
```
| Feature | Size | Phase | Status | Next Action |
```

**Specific feature**: Read full STATUS.md and display.

---

## `/spec audit [feature]`

Audit specs for verification drift. Two modes:

**No arg** — sweep every spec in `.claude/specs/*/STATUS.md`. For each spec marked complete, report:
- Missing `verification_artifact` or `verified_at` (gate-evading)
- `verified_at` older than 60 days **and** any file in the spec's tasks.md `Files:` rows has been touched since (drift)
- `verification_artifact` points to a path that no longer exists (broken)
- Grandfathered specs (retrofitted Completion Gate) — list separately so the user can prioritize backfill

**With feature arg** — same checks but scoped to one spec, plus:
- For each task with `**Verification**: <path>.test.ts` — confirm the test file exists and contains at least one `test(`/`it(` block referencing the touched files
- For each task with `**Verification**: manual: <repro>` — confirm the repro line includes both an input mode (touch/trackpad/mouse/keyboard/curl/REPL) and an observable outcome word ("expect", "verify", "returns", "shows", "logs")
- Print a table: `| Task | Verification kind | Status | Issue |`

This command is read-only. It does not edit STATUS.md or tasks.md — the user (or `/spec continue`) does that after triage.

---

## `/spec continue <feature>`

Read `STATUS.md` to determine current phase, then **resume the proactive flow** from that point. Don't just show status — actively drive to the next gate.

- `requirements:draft` → present requirements, ask for approval
- `requirements:in-review` → check for review doc, present or launch review
- `requirements:approved` → start design (medium/large) or tasks (small)
- `design:draft` → present design, ask for approval
- `design:in-review` → check for review doc, present or launch review
- `design:approved` → start tasks
- `tasks:draft` → present tasks, ask for approval
- `tasks:in-review` → check for review doc, present or launch review
- `tasks:approved` → present execution plan, ask to start

---

## STATUS.md Generation

Regenerate after every phase transition:

```markdown
# Spec: <feature-name>
**Size**: <size> | **Created**: <date> | **Current Phase**: <phase:status>

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | <status> | <who> | <date> |
| Req Review | <verdict> (<blocker count> blockers) | - | <date> |
| Design | <status> | <who> | <date> |
| Design Review | <verdict> (<blocker count> blockers) | - | <date> |
| Tasks | <status> | <who> | <date> |
| Task Review | <verdict> (<blocker count> blockers) | - | <date> |
| Execution | <status> | - | <date> |

**Verification:**
- `verified_at`: <YYYY-MM-DD>  ← required when Execution is `complete`
- `verification_artifact`: <test path OR `manual: <one-line procedure>`>  ← required when Execution is `complete`

The completion hook (`.claude/hooks/spec-completion-check.sh`) blocks any
edit that sets Execution=complete without both fields populated.

**Artifacts:**
- 📄 Requirements: `.claude/specs/<feature>/requirements.md`
- 📄 Design: `.claude/specs/<feature>/design.md`
- 📄 Tasks: `.claude/specs/<feature>/tasks.md`
- 📝 Reviews: `.claude/specs/<feature>/review-*.md`

**Next**: <what to do next>
```

For small specs, omit Design and Design Review rows. For medium specs, omit Task Review row.

---

## Artifact Links

**Always show the file path** when presenting an artifact so the user can open and read it. Format:
- 📄 `.claude/specs/<feature>/requirements.md`
- 📄 `.claude/specs/<feature>/design.md`
- 📄 `.claude/specs/<feature>/tasks.md`
- 📝 `.claude/specs/<feature>/review-requirements.md`
- 📝 `.claude/specs/<feature>/review-design.md`
- 📝 `.claude/specs/<feature>/review-tasks.md`
- 📊 `.claude/specs/<feature>/STATUS.md`

---

## Rules

- **PROACTIVE**: After each gate approval, immediately proceed to the next phase. Don't wait for commands.
- **NEVER** skip requirements for medium/large features
- **NEVER** start design before requirements are approved
- **NEVER** start implementation before tasks are approved
- **NEVER** implement without explicit user confirmation at the execute phase
- Small features skip design entirely (requirements → tasks → execute)
- Always trace acceptance criteria: requirements AC-* → design file changes → task assignments
- Keep STATUS.md current after every phase transition
- Always show artifact file paths at every gate
