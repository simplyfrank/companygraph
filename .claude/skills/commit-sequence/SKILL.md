# /commit-sequence - Batch Logical-Group Commits

Walk through `git status`, propose N logical commit groupings, and create them sequentially with conventional-commit format. Each group is confirmed by the user before it lands. Never amends, never force-pushes, never `--no-verify`.

Canonical rules live in [`.claude/patterns/commit-messages.md`](../../patterns/commit-messages.md) — this skill is the interactive wrapper around them.

## Usage

- `/commit-sequence` — interactive: propose groups, confirm each, commit sequentially
- `/commit-sequence --dry-run` — propose groupings only, no commits

## Step-by-Step Procedure

### 1. Analyze working tree

```bash
git status --short
git diff --stat
git diff --cached --stat
```

Build a list of every modified/untracked file. Exclude from the list (never commit):

- `.claude/settings.local.json` — per-developer
- `.claude/scheduled_tasks.lock` — ephemeral runtime
- `.env*`, `*.pem`, `credentials*.json` — secrets
- Files the user explicitly asked to skip

### 2. Propose groupings

Group files by inferred logical unit. Good signals for "same group":

- Same subdirectory (`telegram/src/memory/*` → one memory change)
- Same spec reference (`.claude/specs/<name>/*` together)
- Migration + the memory module that uses its new columns + user-settings default that seeds it
- Test file + the source file it tests
- PWA component + the view that uses it
- Docs-only changes (multiple `*.md` files with no code) — one `docs(...)` commit

Bad signals (split into separate groups):

- Unrelated features touched in the same session
- A bug fix mixed with a refactor
- Code change + unrelated dependency bump

For each group propose: `<type>(<scope>): <1-line subject>` plus the file list.

### 3. Confirm each group

For each proposed group, use `AskUserQuestion` with options:

- **Commit** — proceed with the proposed message
- **Skip** — leave these files unstaged, move to next group
- **Edit message** — user rewrites subject/body before commit
- **Combine with next** — merge this group into the next one (re-propose)

Show the file list + proposed message each time. Don't batch the questions — ask one group at a time so the user sees progress.

### 4. Stage + commit per group

**Always** stage only the specific files for that group. Never `git add .`, never `git add -A`:

```bash
git add path/to/file1.ts path/to/file2.ts
git commit -m "$(cat <<'EOF'
feat(reminders): add snooze column with 24h default

Previous behaviour dropped snoozed reminders on next scheduler tick
because the column didn't exist. Migration 0042 adds snooze_until,
memory module persists it, user_settings seeds 24h default so new
users don't hit null-lookup errors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the `commit-msg` hook rejects (invalid type/scope) or `pre-commit` fails (transpile error):

- **Do not** retry with `--no-verify`.
- **Do not** `git commit --amend`.
- Fix the underlying issue (rename scope, fix the type, repair the broken file), re-stage, create a **new** commit.

### 5. Report

After the last group:

```bash
git log --oneline HEAD~<N>..HEAD
git status --short
```

Show the user the sequence and any remaining unstaged files (the skipped/excluded set).

## Format Rules (Enforced)

### Type (required)

Must be one of exactly these nine (mirrors `scripts/hooks/commit-msg:20`):

```
feat, fix, refactor, docs, style, test, chore, deploy, ci
```

Reject anything else. Examples of invalid types: `security`, `hotfix`, `perf`, `build`, `revert`, `merge`.

### Scope (optional)

Regex: `[a-z0-9_-]+`

**Scope cannot contain dots, slashes, or uppercase.** This bites often:

| Good | Bad | Why bad |
|---|---|---|
| `fix(claude)` | `fix(.claude)` | dot |
| `feat(exec-queue)` | `feat(execQueue)` | uppercase |
| `chore(pwa)` | `chore(pwa/views)` | slash |
| `docs(specs)` | `docs(SPECS)` | uppercase |
| `test(harness)` | `test(test harness)` | space |

### Subject

- Imperative mood: "add X", "fix Y" (not "added" / "fixes").
- Under ~70 chars (`git log --oneline` stays scannable).
- No trailing period.

### Body

- Blank line after subject.
- Wrap at 72 chars.
- Explain **why**, not **what** (the diff shows what).
- Reference commits (7-char SHA), specs (`.claude/specs/<name>/`), or issue links when load-bearing.

### Trailer

Mandatory for Claude-assisted commits with substantive code:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## HEREDOC Boilerplate

Always use this shape for multi-line messages — it preserves newlines and dodges shell escape issues with apostrophes, backticks, and `$`:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject under 70 chars>

<body paragraph explaining why the change matters, wrapped at 72
chars. Reference specs or commits when load-bearing context.>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

The `'EOF'` (single-quoted) disables variable/command substitution inside the body. Do **not** switch to `EOF` (unquoted) — it lets `$var` and backticks expand and will silently corrupt the message.

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| `git add -A` then commit | Sweeps in `settings.local.json`, secrets, unrelated files |
| `git commit --amend` after a prior commit | Rewrites history; if the prior commit was pushed, breaks teammates. **Always** create a new commit — even after hook failures |
| `--no-verify` to "unblock" a push | The hook is catching a real transpile/test/secret failure. Fix it, don't skip it |
| `security:` / `hotfix:` / `perf:` types | Not in the 9-type allowlist — `commit-msg` rejects |
| `feat(.claude): ...` | Dot in scope — regex fails |
| One commit for "improve email + fix flight bug + doc update" | Review-blind, revert-hostile. Split into three |
| Subject lines > 70 chars | Truncates in `git log --oneline` and CI notification summaries |
| Unquoted `EOF` in HEREDOC | Lets `$` and backticks expand — corrupts body text |
| `git push` inside this skill | Push is a separate step. User decides when to push |

## Interaction with Hooks

| Hook | Fires | What it checks |
|---|---|---|
| `pre-commit` | every commit | transpile `relay.ts`, `agent.ts`, PWA `.js` syntax for changed files |
| `commit-msg` | every commit | type/scope regex on subject line |
| `pre-push` | pushes to `main` | transpile + untracked-import + per-file tests + secrets scan |

If a hook fails mid-sequence:

1. The failed commit did **not** land (the commit hook aborts before writing).
2. Fix the underlying issue.
3. Re-stage the same files.
4. Re-run `git commit` with the same message — **new commit attempt, not `--amend`**.
5. Resume the sequence with the next group.

## Acceptance Checklist

For every commit the skill creates:

- [ ] Type is one of `feat, fix, refactor, docs, style, test, chore, deploy, ci`.
- [ ] Scope (if present) matches `[a-z0-9_-]+`.
- [ ] Subject is imperative, under 70 chars, no trailing period.
- [ ] Body explains **why**, wrapped at 72 chars.
- [ ] `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer present.
- [ ] Staged only the specific files for this group (no `git add -A`).
- [ ] `settings.local.json` and `scheduled_tasks.lock` excluded.
- [ ] No `--no-verify`, no `--amend`, no `git push`.
- [ ] Each commit represents one logical change.

## References

- [`.claude/patterns/commit-messages.md`](../../patterns/commit-messages.md) — canonical commit format rules
- `scripts/hooks/commit-msg` — the regex that enforces format
- `scripts/hooks/pre-commit` — transpile check
- `scripts/hooks/pre-push` — full validation before push to `main`
