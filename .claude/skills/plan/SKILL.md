# /plan — Push Spec Tasks to GitHub Backlog

> **⚠️ STALE STACK — ported from personalassistant, not yet rewired for companygraph.** Hardcoded to the `Myndshare/personalassistant` repo and the Myndshare Roadmap project (#6) field/option IDs. Re-point the repo and project/field IDs at this repo's board before using it here. Reconcile against this repo before following any instruction below.

Creates GitHub Issues from a spec's `tasks.md` and adds them to the Myndshare Roadmap project board.

## Usage

- `/plan <feature>` — Push tasks from `.claude/specs/<feature>/tasks.md` to GitHub
- `/plan <feature> --dry-run` — Preview without creating anything
- `/plan <feature> --parent <N>` — Link all issues as sub-issues of issue #N
- `/plan <feature> --team <squad>` — Set Team field (e.g. "Squad 1")
- `/plan <feature> --start <YYYY-MM-DD>` — Set Start date on all items
- `/plan <feature> --target <YYYY-MM-DD>` — Set Target date on all items

## Prerequisites

- `GH_TOKEN` env var with `repo` + `project` scopes
- `GITHUB_ORG` env var (e.g. `Myndshare`)
- `GITHUB_REPO` env var (e.g. `personalassistant`)
- `GITHUB_PROJECT_NUMBER` env var (e.g. `6`)

## Configuration

| Setting | Value |
|---------|-------|
| Project | `https://github.com/orgs/Myndshare/projects/6` |
| Repo | `Myndshare/personalassistant` |
| Project ID | `PVT_kwDOB-SYN84BQrkE` |

### Project Field IDs (verified)

| Field | ID |
|-------|-----|
| Status | `PVTSSF_lADOB-SYN84BQrkEzg-uvbA` |
| Priority | `PVTSSF_lADOB-SYN84BQrkEzg-vFr4` |
| Team | `PVTSSF_lADOB-SYN84BQrkEzg-uvhI` |
| Start date | `PVTF_lADOB-SYN84BQrkEzg-uvhU` |
| Target date | `PVTF_lADOB-SYN84BQrkEzg-uvhY` |

### Status Options

| Option | ID |
|--------|-----|
| Todo | `f75ad846` |
| In progress | `47fc9ee4` |
| Done | `98236657` |

### Priority Options

| Option | ID |
|--------|-----|
| P0 Critical | `8d4cbe82` |
| P1 High | `3b58b4c2` |
| P2 Medium | `437f0bf6` |
| P3 Low | `7435b9ca` |

### Team Options

| Option | ID |
|--------|-----|
| Squad 1 | `9282166a` |
| Squad 2 | `8a5d08e5` |
| Squad 3 | `478d0b17` |

## Protocol

### Step 1: Parse tasks.md

Read `.claude/specs/<feature>/tasks.md` and extract all `### T-NN: <title>` blocks.

For each task, capture:
- **Title**: from the `### T-NN:` heading
- **Description**: the `Description` field
- **Files**: the `Files` field (listed file paths)
- **Acceptance Criteria**: the `Acceptance Criteria` field (AC-* references)
- **Complexity**: simple / moderate / complex
- **Dependencies**: T-NN references

Also read the frontmatter to verify `status: approved` (warn if not approved but allow `--force`).

### Step 2: Preview

Display a summary table:

```
## Plan: <feature> → GitHub Backlog

| # | Title | Complexity | Files | Deps |
|---|-------|-----------|-------|------|
| T-01 | ... | simple | 1 | - |
| T-02 | ... | moderate | 2 | T-01 |

**Label**: `spec:<feature>`
**Project**: Myndshare Roadmap (#6)
**Status**: Todo
```

If `--dry-run`, stop here.

Otherwise, ask for confirmation via AskUserQuestion:
- "Create N issues on GitHub?" → Create / Cancel

### Step 3: Create label

```bash
gh label create "spec:<feature>" --repo Myndshare/personalassistant --color 0075ca --description "Spec: <feature>" --force
```

Use `--force` so it's idempotent (no error if label exists).

### Step 4: Create issues and add to project

For each task in dependency order:

1. **Create issue** using `gh` CLI:
   ```bash
   gh issue create \
     --repo Myndshare/personalassistant \
     --title "T-NN: <title>" \
     --body "<formatted body>" \
     --label "spec:<feature>"
   ```

   The issue body should be formatted as:
   ```markdown
   ## Description
   <description from tasks.md>

   ## Files
   - `path/to/file.ts`

   ## Acceptance Criteria
   - AC-01: <criteria>

   ## Complexity
   <simple|moderate|complex>

   ## Dependencies
   - T-NN: <title> (#<issue_number>)

   ---
   *Generated from `.claude/specs/<feature>/tasks.md`*
   ```

2. **Add to project** (capture the item ID for field edits):
   ```bash
   ITEM_ID=$(gh project item-add 6 --owner Myndshare --url <issue_url> --format json -q '.id')
   ```

3. **Set project fields** using `gh project item-edit`:
   ```bash
   # Set Status = Todo
   gh project item-edit --project-id PVT_kwDOB-SYN84BQrkE --id <item_id> --field-id PVTSSF_lADOB-SYN84BQrkEzg-uvbA --single-select-option-id f75ad846
   ```

   If `--team` provided:
   ```bash
   gh project item-edit --project-id PVT_kwDOB-SYN84BQrkE --id <item_id> --field-id PVTSSF_lADOB-SYN84BQrkEzg-uvhI --single-select-option-id <team_option_id>
   ```

   If `--start` provided:
   ```bash
   gh project item-edit --project-id PVT_kwDOB-SYN84BQrkE --id <item_id> --field-id PVTF_lADOB-SYN84BQrkEzg-uvhU --date <YYYY-MM-DD>
   ```

   If `--target` provided:
   ```bash
   gh project item-edit --project-id PVT_kwDOB-SYN84BQrkE --id <item_id> --field-id PVTF_lADOB-SYN84BQrkEzg-uvhY --date <YYYY-MM-DD>
   ```

4. **Link as sub-issue** (if `--parent` provided):

   First get the parent issue's node_id:
   ```bash
   gh api graphql -f query='query { repository(owner: "Myndshare", name: "personalassistant") { issue(number: <parent_number>) { id } } }' -q '.data.repository.issue.id'
   ```

   Then link via GraphQL mutation (using the child issue's `node_id` from step 1):
   ```bash
   gh api graphql -f query='mutation { addSubIssue(input: { issueId: "<parent_node_id>", subIssueId: "<child_node_id>" }) { issue { id } } }'
   ```

### Step 5: Track created issues

Write `.claude/specs/<feature>/synced.json`:

```json
{
  "feature": "<feature>",
  "syncedAt": "YYYY-MM-DDTHH:MM:SSZ",
  "project": "Myndshare/projects/6",
  "label": "spec:<feature>",
  "issues": [
    {
      "task": "T-01",
      "title": "<title>",
      "issueNumber": 42,
      "issueUrl": "https://github.com/Myndshare/personalassistant/issues/42",
      "projectItemId": "<item_id>"
    }
  ],
  "parent": null
}
```

### Step 6: Update STATUS.md

Add or update the `Backlog Sync` row in `.claude/specs/<feature>/STATUS.md`:

```
| Backlog Sync | done | claude | <date> |
```

### Step 7: Output summary

```
## Backlog Sync Complete

Created **N** issues in `Myndshare/personalassistant`:

| Task | Issue | URL |
|------|-------|-----|
| T-01 | #42 | https://github.com/Myndshare/personalassistant/issues/42 |
| T-02 | #43 | https://github.com/Myndshare/personalassistant/issues/43 |

**Project board**: https://github.com/orgs/Myndshare/projects/6
**Label**: `spec:<feature>`
```

## Error Handling

- If `tasks.md` doesn't exist → error with helpful message
- If tasks frontmatter status is not `approved` → warn but allow with `--force`
- If `synced.json` already exists → warn "Already synced. Use `--force` to re-sync (will create duplicates)."
- If a single issue creation fails → log error, continue with remaining tasks, report partial results
- If `gh` CLI is not available → fall back to `githubCreateIssue()` + `githubAddIssueToProject()` from `github-api.ts`

## Rules

- Always create issues in dependency order (T-01 before T-02 if T-02 depends on T-01)
- Include cross-references: if T-02 depends on T-01, the T-02 body should link to T-01's issue number
- Never create duplicate issues — check `synced.json` first
- Use `gh` CLI commands (available locally) — the API functions in `github-api.ts` are for EC2 where `gh` isn't installed
