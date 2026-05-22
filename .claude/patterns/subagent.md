# Subagent (Scoped Claude Specialist)

**When to use:** Adding a new scoped Claude CLI specialist — a named agent with isolated
tool access, a fixed system prompt, and optional structured JSON output.
**Canonical example:** `telegram/src/subagents/skills/email.md`, `calendar.md`,
`task.md`, `research.md`, `finance.md`, `code-task.md`
**Spawn / schema parsing:** `telegram/src/subagents/spawn.ts:130` (`spawnSubagent`),
`:232` (`streamSubagent`), `:91` (`addDirsOverride` resolution)
**Cloud fallback:** `telegram/src/cloud/anthropic-fallback.ts:1761` (`spawnSubagentViaCli`)
**Tool registration:** `telegram/src/tools/schemas/subagent.ts` (`/delegate`)
**Related:** [claude-fallback.md](claude-fallback.md), [local-agent-rpc.md](local-agent-rpc.md)

## Shape

Create a markdown file at `telegram/src/subagents/skills/<id>.md` with YAML frontmatter.
The loader (`subagents/loader.ts`) scans the directory and builds the registry
consumed by `spawn.ts`.

```markdown
---
id: my-skill
name: Human Readable Name
description: One-line description used in /delegate help + orchestrator routing.
model: claude-sonnet-4-6        # or claude-opus-4-7 for heavy reasoning
timeout: 90000                  # ms — hard kill for the CLI process
effort: medium                  # low | medium | high → --effort flag
allowedTools:                   # exactly scoped, NOT ["*"]
  - Read
  - Grep
  - Glob
  - "Bash(git:*)"
  - "Bash(gh:*)"
schemaFile: ./schemas/my-skill.json   # optional — produces --json-schema arg
# addDirs: ["/some/read-only/path"]    # optional; overridable per-invocation
---

You are <role>. Your job is <single-sentence scope>.

Rules:
- Be explicit about DOs and DON'Ts.
- If schemaFile is set, the output MUST be JSON matching that schema. Say so here.
- Ban destructive actions unless essential (e.g. code-task.md forbids `git commit`
  and `git push` — the orchestrator handles those).
- State what to do when the task is under-specified (usually: stop and explain;
  never fabricate).
```

Note the **actual frontmatter key is `schemaFile`** (pointing to a JSON schema file in
`subagents/skills/schemas/`), not an inline `json_schema` block. `spawn.ts` reads the
file and passes `--json-schema <content>` to the CLI.

## Integration

- **Spawn (non-streaming):** `spawnSubagent(input: SubagentInput)` — returns
  `{ ok, text, parsed?, durationMs, model, agentType, error? }`.
- **Spawn (streaming):** `streamSubagent(input, onDelta)` — emits text chunks as they
  arrive.
- **Per-invocation worktree:** `input.addDirsOverride?: string[]` wins over the
  config's `addDirs` (spawn.ts:91). The self-improvement loop uses this to scope
  `code-task` into a fresh worktree per backlog item without cloning the skill config.
- **Cloud fallback:** when the Mac is offline, `spawnSubagentViaCli` in
  `anthropic-fallback.ts` runs the same CLI on EC2 using the Max subscription
  credentials written to `~/.claude/.credentials.json` by `load-secrets.ts`.
- **Tool surface:** `/delegate <agent> <task>` is registered in
  `telegram/src/tools/schemas/subagent.ts`. The tool is available to the main chat
  Claude so it can chain specialists.
- **CLI flags assembled by `spawn.ts`:** `--system-prompt <body>`, `--allowedTools <list>`,
  `--json-schema <json>` (if schemaFile), `--effort <level>`, `--model <name>`,
  `--permission-mode bypassPermissions` (safe because tools are already scoped), and
  `--add-dir <path>` per entry in `addDirs` / `addDirsOverride`.

## Required (acceptance checklist)

- [ ] Filename `telegram/src/subagents/skills/<id>.md`, with `id` matching the filename.
- [ ] Frontmatter keys spelled exactly: `id`, `name`, `description`, `model`, `timeout`,
      `effort`, `allowedTools`. Optional: `schemaFile`, `addDirs`. Typos are silent —
      the loader skips unknown keys.
- [ ] `allowedTools` is a **scoped allowlist**, not `["*"]`. Use `"Bash(git:*)"` to
      limit bash to git subcommands. If you genuinely need full access, use
      `claude_execute` instead — that's what it's for.
- [ ] System prompt explicitly forbids destructive or out-of-scope actions. Example:
      `code-task.md` says "DO NOT run `git commit` or `git push`" because the
      orchestrator handles those downstream.
- [ ] If `schemaFile` is set, the system prompt **explicitly requires JSON-only
      output** matching the schema. Otherwise `parseStructuredOutput`
      (spawn.ts:110) falls back to regex extraction and may return `undefined`.
- [ ] The schema file (if any) exists at `subagents/skills/schemas/<id>.json` before
      deploy — the cloud fallback loads skills fresh at runtime, so missing files
      break `spawnSubagentViaCli`.
- [ ] CLAUDE.md "Subagent System" section updated if this adds a new agent family.

## Anti-patterns

- **`allowedTools: ["*"]`** → defeats the entire point of a subagent. Use
  `claude_execute` RPC for full-access work.
- **System prompt that allows arbitrary file writes in a research/analysis agent** →
  research agents should be read-only; extraction / classification shouldn't touch
  disk. `research.md` gets this right.
- **`schemaFile` set but prompt doesn't mention JSON** → the CLI may emit prose
  and the parser falls back to extracting the first `{...}` blob it finds, which
  can be wrong. Be loud in the prompt.
- **Forgetting to commit the skill file before deploying cloud** → `spawnSubagentViaCli`
  reads `subagents/skills/` at runtime on EC2; an uncommitted file means the agent
  silently 404s with "Unknown subagent type" from `getSubagent` (spawn.ts:131).
- **Copying `model`/`timeout`/`effort` without thinking** → opus at 180s for a
  one-sentence triage is wasteful; sonnet at 60s for a deep-research task is slow
  and truncated. Pick by the actual workload, not by the nearest sibling.

## Extending

New skill → drop a `<id>.md` in `subagents/skills/` + (optional) schema file. The
loader picks it up; the registry exposes it to `/delegate`. For a new multi-step
orchestration, add a chain helper to `subagents/orchestrator.ts` alongside
`emailThenCalendar()`, `planAndSchedule()`, `researchAndAnalyze()`.
