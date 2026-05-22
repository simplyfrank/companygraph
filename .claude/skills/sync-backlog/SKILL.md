# /sync-backlog — Batch Sync Specs to GitHub Backlog

Scans all spec directories for approved tasks and syncs unsynced ones to the GitHub project board.

## Usage

- `/sync-backlog` — Scan all specs, sync any that are ready
- `/sync-backlog <feature>` — Sync a specific spec
- `/sync-backlog --status` — Show sync status table only (no changes)

## Protocol

### Step 1: Scan specs

Glob `.claude/specs/*/tasks.md` to find all specs with task lists.

For each spec directory, check:
1. **tasks.md frontmatter** — `status` field (draft / in-review / approved)
2. **synced.json** existence — already synced or not
3. **STATUS.md** — current phase

Classify each spec:
- **ready** — tasks.md `status: approved` AND no `synced.json`
- **synced** — `synced.json` exists (already pushed to GitHub)
- **draft** — tasks.md exists but `status` is not `approved`
- **no-tasks** — spec exists but no tasks.md yet

### Step 2: Display status table

```
## Spec Backlog Sync Status

| Spec | Tasks | Status | Synced | Issues |
|------|-------|--------|--------|--------|
| portfolio-planning | 7 | approved | yes | #42-#48 |
| calendar-hardening | 5 | approved | no | - |
| auth-review | 3 | draft | no | - |

**Ready to sync**: 1 spec (calendar-hardening)
```

If `--status` flag, stop here.

### Step 3: Confirm and sync

For each **ready** spec:

1. Ask via AskUserQuestion: "Sync N ready specs to GitHub backlog?" → Sync all / Pick individually / Cancel
2. If "Pick individually", show each spec and ask yes/no
3. For each confirmed spec, invoke the `/plan <feature>` flow:
   - Parse tasks.md
   - Create label
   - Create issues
   - Add to project board
   - Set Status = Todo
   - Write synced.json
   - Update STATUS.md

### Step 4: Summary

```
## Sync Complete

| Spec | Issues Created | Board Link |
|------|---------------|------------|
| calendar-hardening | 5 (#49-#53) | [View](https://github.com/orgs/Myndshare/projects/6) |

**Total**: 5 new issues across 1 spec
```

## Options

| Option | Description |
|--------|-------------|
| `--status` | Show status table only, no sync |
| `--force` | Re-sync specs that already have synced.json (creates duplicates!) |
| `--team <squad>` | Set Team field on all synced items |
| `--start <date>` | Set Start date on all synced items |
| `--target <date>` | Set Target date on all synced items |

## Rules

- Never sync specs whose tasks are not approved (unless `--force`)
- Never re-sync already-synced specs (unless `--force`)
- Always show the status table before taking any action
- Use the `/plan` skill logic for the actual issue creation
- Report partial failures clearly (some specs synced, some failed)
