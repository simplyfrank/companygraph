# /parallel-agents - Fan out N independent jobs to N sub-agents

Spawn N parallel sub-agents from a **single** assistant message when you have N
disjoint jobs (different files, independent acceptance). Consolidate results
into N commits.

## Usage

- `/parallel-agents` — interactive: asks for the list of jobs, builds prompts, fans out
- `/parallel-agents <job1> <job2> ...` — shorthand when jobs are already well-defined

## When to use

- Writing N new pattern files under `.claude/patterns/` (each a separate file)
- Adding N sibling test files that exercise disjoint modules
- Generating N independent memory modules (one per table family)
- Refactoring N callers of a renamed helper, each caller in a different file

**Disjoint test (all three must hold):**
1. Each job writes to a file that no other job writes to.
2. No job's output is an input to another job.
3. Acceptance for each job can be evaluated independently (own test, own grep, own lint).

## When NOT to use

- **Dependent jobs** (A produces a type B imports) → run sequentially, or chain
  via `subagents/orchestrator.ts::orchestrate(steps)`.
- **Shared-config edits** (`package.json`, `bunfig.toml`, `.claude/CLAUDE.md`,
  `telegram/src/memory/dimensions.ts` registries) → merge conflict guaranteed;
  do these yourself, one writer.
- **Same file, different sections** → sub-agents can't see each other's edits;
  one agent only.
- **Jobs whose scope is unclear** → write a spec first (`/spec-workflow`), then parallel.

## Procedure

### 1. Gather intent

Ask: "What jobs need to run in parallel? For each, tell me the target file(s) and the
acceptance criterion." If any two jobs touch the same file, or one produces input for
another, **refuse** and recommend sequential execution or an orchestrator chain.

### 2. Define the shared boilerplate

Every sub-agent gets dropped into a fresh context with no memory of this repo.
Give each one a **common boilerplate** block (absolute paths, binary locations,
test command, "do not touch" list) so they don't derive it. Build this once;
paste verbatim into each sub-prompt.

### 3. Build per-agent prompts

Each prompt has three sections: common boilerplate, scope (absolute target files,
reference pattern to mirror, acceptance command), report format. See template below.

### 4. Spawn in a single message

Emit **one** assistant message that contains N parallel `Agent` tool-use blocks —
not N messages, not a loop. Parallel invocation is what makes this a win; serial
loops don't. Each block uses `subagent_type: "general-purpose"` unless a specialized
agent matches the job.

### 5. Enforce file-scope isolation

Every sub-prompt ends with: *"The working tree is shared with other agents running
right now. You may ONLY write the files in your declared target list. Do NOT modify
any other file. Do NOT run `git add -A`, `git add .`, or any command that stages
files outside your scope. Do NOT edit `package.json`, `bunfig.toml`,
`.claude/CLAUDE.md`, or any registry file."*

### 6. Consolidate

When all agents return:

- **Verify existence:** each declared target file exists.
- **Verify acceptance:** run each job's acceptance command (test, grep, lint).
- **Verify no spillover:** `git status` shows only the union of declared target files.
  If an agent touched something outside its scope, revert that file and redo just
  that agent (sequentially now — parallelism broke).
- **Commit per agent:** one commit per agent's file-set, following
  [`.claude/patterns/commit-messages.md`](../../patterns/commit-messages.md) and the
  `/commit-sequence` skill — do not batch all N into one commit. Per-agent commits
  keep revert granular when one job ships a regression.

## Prompt template

Copy this into each sub-prompt. Replace `{{...}}` placeholders per agent.

```
## Absolute context
- Repo: /Users/frank/Documents/coding/personalassistant
- Bun binary: /Users/frank/.bun/bin/bun
- Test runner: cd /Users/frank/Documents/coding/personalassistant/telegram && ./scripts/test-local.sh <path>
- Never run `bun test` at repo root — per-file runner only. See
  `.claude/patterns/test-harness.md` for the reason (mock.module leak).
- Working tree is shared with other parallel agents — DO NOT modify files
  outside your declared target list.
- DO NOT edit: package.json, bunfig.toml, .claude/CLAUDE.md, or any registry file
  (LIFE_DIMENSIONS, MEMORY_SOURCES, SLOT_REGISTRY, CAPABILITIES, JobEntry table).

## Your scope
- Target file(s) you may write: {{absolute_paths}}
- Reference pattern to mirror — read FIRST: {{absolute_path_of_pattern_file}}
- Acceptance (must pass before reporting): {{exact_command_or_grep}}

## Task
{{one_paragraph_describing_the_job}}

## Report format (mandatory)
Under 80 words. Structured as:
- Files written: <absolute paths>
- Acceptance run: <command> → <result>
- Anything you noticed but didn't fix (so the orchestrator can schedule follow-ups)
```

## Parallel-safe constraints

| Constraint | Why |
|---|---|
| File-scope isolation per agent | Shared working tree — two writers on one file = last-writer-wins silent data loss |
| No shared-config edits | `package.json`, `bunfig.toml`, `.claude/CLAUDE.md`, registries — single-writer convention; conflicts here don't surface until build/test |
| Absolute paths only in sub-prompts | Sub-agents don't inherit parent cwd reliably |
| Reference pattern named in prompt | Sub-agent won't grep the whole repo to reverse-engineer the shape |
| Per-agent acceptance command | Orchestrator can verify without re-reading each output |
| Single assistant message, N tool calls | Serial calls defeat the purpose; also easier to audit in transcript |

## Consolidation pattern

```
for agent in agents:
    1. Read agent's report
    2. Verify declared files exist
    3. Run acceptance command — abort if non-zero
    4. git diff --name-only → must be subset of declared scope
    5. If subset: git add <declared files> && commit per commit-messages.md
       If not:  git checkout -- <spillover files>, re-run just this agent sequentially
```

Reference: `/commit-sequence` skill for the per-commit formatting rules.

## Anti-patterns

- **Serial calls in a loop pretending to be parallel** → latency stacks, no win. Parallelism means one assistant message with N concurrent tool-use blocks.
- **One mega-commit at the end** → can't revert a single bad agent's work without reverting the good ones; use per-agent commits.
- **Sub-prompts with relative paths** (`./telegram/src/...`) → sub-agent's cwd is not guaranteed; absolute only.
- **Omitting the "do not touch" list** → sub-agents helpfully update `package.json` to add a dep, and three of them do it with conflicting versions.
- **Letting an agent run `git add -A`** → stages files from other agents' concurrent writes; state corruption.
- **Skipping the spillover check** → a well-meaning agent edits a reference file it read; you discover it at PR review, not at consolidation.
- **Using `/parallel-agents` for dependent work** → output of job A that job B needs is never available; job B invents a stub, which diverges from A's real shape.
- **Boilerplate drift across agents** → each sub-prompt should paste the *same* boilerplate block; forking it per agent means agents use different test commands.

## Related

- `.claude/patterns/README.md` — pattern index (use when telling an agent which pattern to mirror)
- `.claude/patterns/test-harness.md` — per-file test runner contract (cite in boilerplate)
- `.claude/patterns/commit-messages.md` — commit format for consolidation
- `.claude/skills/commit-sequence/` — batch per-agent commits
- `telegram/src/subagents/orchestrator.ts` — `orchestrate()` for sequential chains, `parallelSubagents()` for in-process parallel (different mechanism: scoped Claude CLI subagents, not sub-agent Task spawns)
