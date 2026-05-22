# Parallel Claude Code sessions — CI/CD operating model

**Status:** convention (2026-05-13).
**Why:** every Claude Code session that pushes directly to `main` adds queue
churn, index pollution, and attribution drift. With ≥2 parallel sessions
the bleed is observable — commit `08c44596` swept 28 unrelated files from a
parallel agent's index because both sessions worked in the same checkout.

## The rule

**Every parallel Claude Code session works in its own `git worktree` rooted
on its own branch.** Direct pushes to `main` are reserved for trivial,
one-file fixes invoked by a human at a quiet moment — and even those should
prefer the worktree path.

## The shape

```
~/Documents/coding/personalassistant         (main checkout, always on `main`)
~/Documents/coding/personalassistant-claude/
    └── bookings-redesign/                   (worktree on `claude/bookings-redesign`)
    └── chat-reskin/                         (worktree on `claude/chat-reskin`)
    └── ...
```

The main checkout stays clean (no staged files, always on `main`). Each
session opens its terminal / Claude in its own worktree path; the working
trees can't bleed into each other because git treats them as separate
checkouts.

## Lifecycle

1. **Start:** `./scripts/claude-session-start.sh <slug>` creates the worktree
   at `../personalassistant-claude/<slug>` on branch `claude/<slug>` based
   off the current `main`. Prints the `cd` command for the user to paste.
2. **Work:** Claude edits, commits, runs tests inside the worktree.
   `git status`, `git add`, `git commit` all behave normally — index is
   per-worktree.
3. **Push:** `git push -u origin claude/<slug>`. CI runs on the branch (not
   on `main`), no production deploy.
4. **Merge:** open a PR (`gh pr create`). Squash-merge to `main` once the
   user approves. The CodePipeline run on `main` is then attributable to a
   single, reviewed feature.
5. **Cleanup:** `./scripts/claude-session-finish.sh <slug>` removes the
   worktree + deletes the local + remote branches once merged.

## What this fixes, concretely

| Problem | Worktree fix |
|---|---|
| Index pollution from parallel sessions | Each worktree has its own `.git/index` — `git add` in session A can't pick up session B's staged files |
| Pipeline queue churn | CI runs on the branch; `main` only deploys when a PR merges |
| Bad attribution | Commit author + body match the branch's intent |
| Surprise merge conflicts | `git push` on a branch fails fast if rebased against a moved `main`; no luck-of-the-fast-forward |
| Test failures from parallel-agent drift | Branch CI catches a test break before it lands on `main` |
| Zero visibility into parallel work | `gh pr list --state open --label claude-session` shows every active session at a glance |

## What this does NOT fix

- **Pre-existing lockdown failures** on `main` (e.g. AC-01 no-emoji on
  trip-interior.js, the chat-tokens-only literals). Those exist independent
  of the workflow.
- **Race-y feature interactions** when two branches touch overlapping
  surfaces — but PR review surfaces these instead of "main" doing it.

## Escape hatch

For trivial single-line fixes by a human at a quiet moment, direct-to-main
is still allowed. The convention is "default = worktree-per-session" not
"main is locked".

## Related infrastructure

- `git_worktree_create` / `git_worktree_remove` / `gh_pr_create` RPC methods
  exist on the local agent (originally built for the self-improvement loop,
  see `cloud/improvement-runner.ts`). They can drive this pattern from a
  remote/EC2-side automation later; for now the convention is laptop-side.
- The pre-push hook (`scripts/hooks/pre-push`) gates direct pushes to `main`
  with transpile + tests + secrets checks. It does NOT currently know about
  the worktree convention — that's a follow-up if soft-enforcement isn't
  enough.

## When you (Claude) read this

If you're operating in a Claude Code session and `git rev-parse --show-toplevel`
returns the main checkout path (not a worktree), prefer to ask the user
whether they want you to spin up a worktree first. The exception is a
truly tiny fix where the overhead of branching costs more than the
contamination risk.
