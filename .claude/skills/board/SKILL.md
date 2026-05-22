# /board — View Myndshare Roadmap Project Board

Displays the GitHub Projects V2 board items with filtering and status overview.

## Usage

- `/board` — Show all items grouped by status
- `/board --status <status>` — Filter by status (Todo, In progress, Done)
- `/board --label <label>` — Filter by label (e.g. `spec:mcp-marketplace`)
- `/board --team <squad>` — Filter by Team field
- `/board --spec <feature>` — Shorthand for `--label spec:<feature>`

## Configuration

| Setting | Value |
|---------|-------|
| Project | `Myndshare Roadmap (#6)` |
| Owner | `Myndshare` |

## Protocol

### Step 1: Fetch items

```bash
gh project item-list 6 --owner Myndshare --format json -q '.items'
```

### Step 2: Display grouped table

Group items by Status field and display:

```
## Myndshare Roadmap

### In Progress (3)

| # | Title | Labels | Team | Assignee |
|---|-------|--------|------|----------|
| #12 | T-01: Shared Types | spec:mcp-marketplace | Squad 1 | - |
| #15 | Decompose webapp-server | refactor | Squad 1 | - |
| #18 | Fix CalDAV sync | bug | - | - |

### Todo (5)

| # | Title | Labels | Team | Assignee |
|---|-------|--------|------|----------|
| #13 | T-02: SQLite Migrations | spec:mcp-marketplace | Squad 1 | - |
| ... | ... | ... | ... | ... |

### Done (2)

| # | Title | Labels | Team | Assignee |
|---|-------|--------|------|----------|
| #10 | Setup CI/CD | infra | - | - |
| #11 | Add PR previews | infra | - | - |

---
**Total**: 10 items | **Board**: https://github.com/orgs/Myndshare/projects/6
```

### Filtered views

When `--label`, `--spec`, `--team`, or `--status` flags are used, filter the items before grouping. Show the active filter in the heading:

```
## Myndshare Roadmap — spec:mcp-marketplace (19 items)
```

## Alternate commands

- `/board stats` — Show summary counts only:
  ```
  Todo: 5 | In Progress: 3 | Done: 2 | Total: 10
  ```

- `/board open <N>` — Show details for issue #N:
  ```bash
  gh issue view <N> --repo Myndshare/personalassistant
  ```

## Rules

- Always use `gh` CLI (not the API functions in github-api.ts)
- Show issue numbers as `#N` for easy reference
- Sort items within each status group by issue number ascending
- Truncate long titles at 60 characters
