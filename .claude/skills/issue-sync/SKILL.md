# /issue-sync — Sync Spec Execution to GitHub Issues

Updates GitHub issue status and project board fields as spec tasks are completed.

## Usage

- `/issue-sync <feature>` — Sync current execution progress to GitHub
- `/issue-sync <feature> --task T-NN done` — Mark a specific task as done
- `/issue-sync <feature> --task T-NN in-progress` — Mark as in progress
- `/issue-sync <feature> --close-done` — Close all completed issues

## Prerequisites

- Spec must have been synced via `/plan` (i.e. `synced.json` exists)
- `synced.json` contains the task-to-issue mapping

## Protocol

### Step 1: Load sync data

Read `.claude/specs/<feature>/synced.json` to get the issue number mapping.
Read `.claude/specs/<feature>/STATUS.md` to get the current execution progress.

### Step 2: Determine status changes

Parse STATUS.md execution table for each task's status:

| STATUS.md Status | GitHub Issue State | Board Status |
|-----------------|-------------------|--------------|
| pending | open | Todo |
| in-progress | open | In progress |
| done | open → closed | Done |
| skipped | open → closed | Done |

Compare with current GitHub state to find what needs updating.

### Step 3: Preview changes

```
## Issue Sync: mcp-marketplace

| Task | Issue | Current | Target | Action |
|------|-------|---------|--------|--------|
| T-01 | #42 | Todo | Done | close + set Done |
| T-02 | #43 | Todo | In progress | set In progress |
| T-03 | #44 | Todo | Todo | no change |

**Changes**: 2 issues to update
```

Ask for confirmation via AskUserQuestion:
- "Apply N status changes to GitHub?" → Apply / Cancel

### Step 4: Apply changes

For each issue that needs updating:

1. **Update board status**:
   ```bash
   gh project item-edit --project-id PVT_kwDOB-SYN84BQrkE --id <item_id> --field-id PVTSSF_lADOB-SYN84BQrkEzg-uvbA --single-select-option-id <option_id>
   ```

   Status option IDs:
   - Todo: `f75ad846`
   - In progress: `47fc9ee4`
   - Done: `98236657`

2. **Close issue** (if done/skipped):
   ```bash
   gh issue close <N> --repo Myndshare/personalassistant --reason completed
   ```

3. **Add completion comment** (if closing):
   ```bash
   gh issue comment <N> --repo Myndshare/personalassistant --body "Completed as part of spec execution. See \`.claude/specs/<feature>/STATUS.md\` for details."
   ```

### Step 5: Update synced.json

Add a `lastSyncedAt` timestamp and per-issue status:

```json
{
  "feature": "mcp-marketplace",
  "syncedAt": "...",
  "lastSyncedAt": "2026-03-03T15:00:00Z",
  "issues": [
    {
      "task": "T-01",
      "issueNumber": 42,
      "issueUrl": "...",
      "projectItemId": "...",
      "status": "done",
      "closedAt": "2026-03-03T15:00:00Z"
    }
  ]
}
```

### Step 6: Summary

```
## Sync Complete

Updated **2** issues for `mcp-marketplace`:
- #42 T-01: Shared Types → Done (closed)
- #43 T-02: SQLite Migrations → In progress

**Board**: https://github.com/orgs/Myndshare/projects/6/views/1?filterQuery=label:spec:mcp-marketplace
```

## Automatic Integration

When the spec-workflow executes tasks (Phase 5 of workflow.md), each completed task should trigger an issue-sync update. This happens via:

1. After each task in STATUS.md is marked as done
2. Run the issue-sync logic for that specific task
3. No user confirmation needed for automatic updates during execution

## Error Handling

- If `synced.json` doesn't exist → error: "Run `/plan <feature>` first to sync tasks to GitHub"
- If issue was already closed → skip, log as "already done"
- If board item not found → warn, try re-adding to project
- Rate limit → wait 60s and retry once

## Rules

- Never close an issue that STATUS.md shows as pending or in-progress
- Always preview before applying (unless called automatically during execution)
- Keep synced.json updated as the source of truth for the mapping
- Use `gh` CLI commands (not API functions)
