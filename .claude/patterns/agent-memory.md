# Agent Memory Hierarchy

**When to use:** Persisting anything the agent (Claude Code) should
remember across sessions: tool-use patterns, processes the user has
agreed on, project-level rules, user facts, or hard-won discipline
captured from a painful session.
**Canonical example:** `~/.claude/projects/-Users-frank-Documents-coding-personalassistant/memory/MEMORY.md`
(index) and the 17 sibling `.md` files (bodies).
**Tests:** `scripts/__tests__/check-agent-memory.test.ts` (lint check
that enforces every invariant below).
**Related:** [provenance-events.md](provenance-events.md), [decay-job.md](decay-job.md),
spec `agent-memory-protocol-v2`.

## Why this directory exists

The agent's behavior across fresh sessions depends on what it loads at
turn-start. `MEMORY.md` is auto-loaded into every conversation up to
200 lines; the sibling body files are loaded on demand when a pointer
matches. Without enforced shape, the index decays into prose and the
bodies become unparseable. This pattern locks the shape so future-Claude
can mechanically parse, rank, and decay entries.

## The four memory types

Every body file declares one in its frontmatter `type:` field. Pick the
type that maps to **why a future-agent will need this**, not what the
content is "about":

| Type | When to use | Body shape |
|---|---|---|
| `user` | Stable facts about the user (role, preferences, knowledge level, recurring constraints). | Free-form narrative, ≤30 lines. Useful for tailoring explanations + scoping unfamiliarity. |
| `feedback` | A correction, validated approach, or rule the user has agreed on (single point or short rule). | **Lead with the rule itself**, then `**Why:** <one line>` and `**How to apply:** <one line>`. Optional context. |
| `process` | A multi-step procedure with decision points (e.g. "for trip stages, do X first, then Y, then check Z"). | `**Trigger:** <when this applies>` then `**Steps:**` (numbered) then `**Decision points:**` then `**Common mistakes:**`. |
| `project` | Ongoing initiative, bug, or incident that's load-bearing across sessions and not derivable from code/git. | Free-form; lead with the fact or decision; include `**Why:**` (constraint/deadline/stakeholder) and `**How to apply:**` (how it shapes future work). |
| `reference` | Pointers to external systems (Linear projects, Grafana dashboards, Slack channels) — where to look, not what's there. | Free-form; lead with the pointer; one line on what's at that location. |

If a body would qualify as multiple types, it's almost always either
`feedback` (a single rule) or `process` (a sequence). When in doubt
between the two: **does it have steps that must run in order? → process.
Does it have a single rule that applies wherever the trigger fires?
→ feedback.**

## Frontmatter schema

Every body file has YAML frontmatter at the very top:

```markdown
---
name: <kebab-case slug matching the filename without extension>
description: <one-line description, used by future-Claude to decide relevance — be specific>
type: user | feedback | process | project | reference
valid_until: 2026-12-31  # optional; the lint check warns when past
---

<body content per type-specific template below>
```

**Required keys:** `name`, `description`, `type`.
**Optional keys:** `valid_until` (`YYYY-MM-DD`; surfaced in lint as a
decay candidate when past, not auto-deleted).

## Body templates

### `feedback_<topic>.md`

```markdown
---
name: feedback_spec_workflow
description: Cap spec-workflow review cycles at 1 per phase, ~2 edit rounds total
type: feedback
---

The rule: cap requirement/design review cycles at 1 review per phase
and 2 edit rounds total.

**Why:** review agents optimize for finding issues. Each subsequent
pass surfaces smaller and smaller things; by round 3 you're patching
cosmetic nits while real work waits.

**How to apply:** when a phase's review returns blockers, fix them
once and re-review (pass 2/2). If pass 2 still has blockers, ship
with known-open nits and move forward; don't iterate.
```

### `process_<topic>.md`

```markdown
---
name: process_local_agent_restart
description: Restart the local agent without creating an orphan duplicate process
type: process
---

**Trigger:** local agent code on disk is newer than the running
process (e.g. after a git pull or backend deploy).

**Steps:**

1. Check current pid: `launchctl list | grep com.personal.local-agent`
2. Kickstart: `launchctl kickstart -k "gui/$(id -u)/com.personal.local-agent"`
3. Verify new pid + recent start: `ps -p $NEW_PID -o pid,lstart=`

**Decision points:**

- If the user has explicitly asked you to use SSH or `nohup`, follow
  that — but warn them: nohup creates an orphan that launchd can't
  manage.
- If `launchctl list` shows no entry, the agent was never registered
  with launchd; load it via `launchctl load $PLIST` first.

**Common mistakes:**

- Using `nohup bun run agent.ts &` directly. Creates an orphan that
  shows up in `ps` but isn't owned by launchd. The next launchd
  KeepAlive cycle spawns a SECOND copy. Always go through launchctl.
- Killing the process via `kill -9 $PID` — launchd respawns within
  seconds, racing the kill. Use `launchctl kickstart -k` instead.
```

### `user_<topic>.md`

```markdown
---
name: user_travel_preferences
description: User's travel preferences — base city, preferred carriers, hotel sensibilities
type: user
---

Bangkok-based; frequent Singapore trips for work; Scoot is the
preferred budget carrier (price + schedule beat SQ on the route);
hotel preference favors central locations over loyalty programs.
```

## `MEMORY.md` index discipline

`MEMORY.md` is the single auto-loaded file (up to 200 lines). It is
**an index, not a memory**. Each entry is one line:

```markdown
- [Title](filename.md) — one-line hook (≤150 chars total per line)
```

Entries are grouped under section headings (`## Critical discipline`,
`## Current priority`, `## Active integrations`, `## Design rules`,
`## Operations`, `## Process feedback`, `## Reference`, `## User`).
The lint check enforces:

- Every body file in `MEMORY_DIR` is referenced from `MEMORY.md`.
- Every `MEMORY.md` pointer resolves to an existing body file.
- No body content lives in `MEMORY.md` itself.

When `MEMORY.md` crosses 180 lines, the lint check + the daily 3 AM
rotation job both surface the same advisory:

```
MEMORY.md is N lines (>180); run scripts/memory-archive.sh to archive
the oldest 20 entries.
```

The archival path moves the oldest-by-`updated_at` 20 entries to
`MEMORY_DIR/archive/<YYYY-MM-DD>-batch.md` and replaces them with a
single rolling pointer.

## File-naming convention

- `<type>_<topic>.md` for typed entries that benefit from grouping
  (`feedback_*.md`, `process_*.md`, `user_*.md`).
- `<topic>.md` for project / reference entries where the type is
  obvious from context (`bugs-and-fixes.md`, `ec2-access-via-ssm.md`).
- `archive/<YYYY-MM-DD>-batch.md` for rotated entries.
- `archive/rejected-<YYYY-MM-DD>.md` for distillation candidates the
  user rejected (audit trail; not loaded).

Slugs are kebab-case. The frontmatter `name:` field equals the
filename without `.md`.

## When to write — and when NOT to

**Write a memory** when the rule, fact, or process:

- Came from a painful session where re-deriving cost time.
- Is non-obvious from reading the code or git history.
- Will apply across multiple future sessions (not just this one).
- The user explicitly asked you to remember it.

**Do NOT write a memory** for:

- Code patterns the codebase already documents in `.claude/patterns/`
  or `.claude/CLAUDE.md`.
- Git history or who-changed-what — `git log` / `git blame` are
  authoritative.
- Debugging fixes — the fix is in the code; the commit message
  has the context.
- Ephemeral state from the current conversation — that's what
  TaskCreate / plans are for.

**Before recommending from memory**, verify it's still true. A memory
naming a function or file is a claim about that file at the time the
memory was written. Files get renamed, removed, replaced. If the user
is about to act on your recommendation, grep first.

## Acceptance checklist

When you save (or update) a memory, the lint check enforces these
post-write. You can run the check yourself: `scripts/check-agent-memory.sh
--mode=strict`. Expect exit 0:

- [ ] Body file has frontmatter with `name`, `description`, `type`.
- [ ] If `type: feedback`, body contains `**Why:**` and `**How to apply:**`.
- [ ] If `type: process`, body contains `**Trigger:**`, `**Steps:**`,
      `**Decision points:**`, `**Common mistakes:**`.
- [ ] `MEMORY.md` has a one-line pointer to the body file under the
      appropriate section heading.
- [ ] No content from the body is duplicated in `MEMORY.md`.
- [ ] Filename matches the convention above and `name:` matches the
      filename.

## Anti-patterns

- **Body content in `MEMORY.md`**. The lint will flag it; future-Claude's
  search degenerates from "load the relevant body" to "grep through prose".
- **Frontmatter without `type`**. Future tools that filter by type
  (decay sweeps, dimension dashboards) silently skip the entry.
- **Pointer with no body file**. Looks like an entry but loads nothing.
- **Body file with no pointer**. Never gets loaded; effectively orphaned.
- **`feedback` type without `**Why:**`/`**How to apply:**`**. Reduces
  to "rule with no rationale", which decays in usefulness fast — future-
  Claude can't judge edge cases.
- **`process` type without numbered `Steps:`**. Loses the "do X first,
  then Y" guarantee that distinguishes process from feedback.
- **Indefinitely growing `MEMORY.md`**. At 200 lines the auto-load
  truncates without signal; entries below the cut go invisible. Run
  `scripts/memory-archive.sh` proactively when you see the lint
  warning at 180 lines.

## Distillation flow

Tool-use patterns can be auto-proposed (not auto-written) by the
weekly `agent_memory_distill` scheduler job: it reads
`~/.claude-relay/tool-use-log.ndjson`, asks Claude to propose ≤5
candidate `tool_pattern_*.md` entries, and surfaces them via Telegram
inline buttons (callback prefix `mem:`). Approving creates the body
file + index pointer atomically. Rejecting appends the body to
`archive/rejected-<date>.md` for audit. **No distilled candidate is
written to `MEMORY_DIR` without explicit user approval.**
