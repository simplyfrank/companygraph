# Commit Messages

**When to use:** Any commit on `main`.
**Canonical example:** `scripts/hooks/commit-msg`
**Enforced by:** `scripts/hooks/commit-msg` (line 20 regex),
`scripts/hooks/pre-commit`, `scripts/hooks/pre-push`
**Related:** [spec-workflow.md](spec-workflow.md)

## Format

```
<type>(<scope>)?: <subject>

<body — optional, blank line above>

<trailer(s) — Co-Authored-By etc.>
```

Allowed types (exact list from `commit-msg:20`):
`feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`,
`deploy`, `ci`.

Merge and Revert subjects are exempt (`commit-msg:11-18`).

## Scope

Optional. Regex `[a-z0-9_-]+` — **no dots, no slashes, no capitals**.

| Good | Bad | Why bad |
|---|---|---|
| `fix(claude)` | `fix(.claude)` | dot not allowed |
| `feat(exec-queue)` | `feat(execQueue)` | capital |
| `chore(pwa)` | `chore(pwa/views)` | slash |

## Subject

- Imperative mood: "add X", "fix Y", not "added" / "fixes".
- Under ~70 chars (keeps `git log --oneline` scannable).
- No trailing period.

## Body

- Blank line after subject.
- Wrap at ~72 chars.
- Explain the **why**, not the **what** — the diff shows the what.
- Reference commits (7-char SHA prefix), specs (`.claude/specs/<name>/`),
  or issue links when load-bearing context.
- Use HEREDOC in Bash to preserve newlines:

```bash
git commit -m "$(cat <<'EOF'
feat(exec-queue): park blocked subtasks in DLQ after 5 retries

Previously the execution queue kept retrying blocked subtasks
indefinitely, which kept them "In Progress" in the UI. After five
dispatcher dispatches with the same blocking reason, park the row
in scheduler_dlq and surface it in #/inbox for human review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Trailers

- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  on Claude-assisted commits where Claude wrote substantial code.
- Issue links (`Refs: <url>`, `Closes: <url>`) when resolving.

## Hooks that fire

| Hook | When | Runs |
|---|---|---|
| `pre-commit` | every commit | transpile (`relay.ts`, `agent.ts`, PWA `.js` syntax) |
| `commit-msg` | every commit | type/scope regex |
| `pre-push` | pushes to `main` only | transpile + untracked-import check + per-file tests for changed files + secrets scan |

`pre-push` runs tests **per-file** (`pre-push:76-82`) for every
`telegram/*.ts` file whose colocated `.test.ts` exists, mirroring
CI. Occasional flakes on intermittent failures — retry the push
**once** before treating it as a real failure.

## Required (acceptance checklist)

- [ ] Conventional type from the 9-element allowlist.
- [ ] Scope (if present) matches `[a-z0-9_-]+` — lowercase only,
      no dots or slashes.
- [ ] Body explains **why** the change matters.
- [ ] `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer on
      Claude-assisted commits with substantive code contribution.
- [ ] No `--no-verify` unless the user explicitly asked — skipping
      hooks is banned.
- [ ] One commit per logical change; unrelated changes split.

## Anti-patterns

- `.claude` as scope — regex fails (dot).
- `security:`, `hotfix:`, `perf:` — not in allowlist, commit-msg
  rejects.
- Amending after push (force-push to main) — banned without
  explicit user ask; rewrites the shared history on the deploy
  branch.
- Batching unrelated changes into one commit — review-blind,
  revert-hostile. Split them.
- Subject lines longer than ~70 chars — truncates in `git log
  --oneline` and in CI notification summaries.
- `--no-verify` to "unblock" a push — the hook is catching a real
  transpile/test/secret failure; fix it, don't skip it.

## Extending

- Adding a new type: edit `scripts/hooks/commit-msg:20`. Then run
  `./scripts/install-hooks.sh` on every dev machine (symlinks the
  repo hooks into `.git/hooks/`). The CI buildspec has no
  equivalent check — it only runs tests — so hook changes are
  developer-side only.
- Adding a new scope: no registration needed; just use it. If
  scopes proliferate (>20), consider a curated list in this file.
