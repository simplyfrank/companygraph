# Stitch — Visual-Design Pipeline

Drive Stitch as the visual-design engine for the PWA. This skill assembles prompts from editable markdown artifacts (so iteration compounds), wraps the Stitch MCP, logs every run for traceability, and keeps `pwa/styles/tokens.css` in sync with `.claude/stitch/design-system.yaml`.

## Reference

- **Spec:** [.claude/specs/stitch-integration/requirements.md](../../specs/stitch-integration/requirements.md) — life-domain navigation, MVP scope (shell + chat panel + Travel domain), iteration loop FRs.
- **Pattern doc:** [.claude/patterns/stitch-when-to-use.md](../../patterns/stitch-when-to-use.md) — decision tree + Triggers/Skip tables. **Read first** before deciding to call any `/stitch generate-*`.
- **Upstream conductor:** when a design artifact lands in `docs/design/`, `/design-apply` (`.claude/skills/design-apply/`) orchestrates application and calls `/stitch generate-*` / `tokens-sync` only when `stitch-when-to-use.md` matches. Token reconciliation from a drop routes through this skill's `tokens-sync` gate — never a parallel token namespace.
- **Artifacts (the editable layer — iterate here, not in this skill):**
  - [.claude/stitch/house-style.md](../../stitch/house-style.md) — global preamble (Voyager Midnight, density, motion, do/don't).
  - [.claude/stitch/component-vocabulary.md](../../stitch/component-vocabulary.md) — canonical components Stitch must reuse, seeded from `pwa/components/CATALOG.md`.
  - [.claude/stitch/design-system.yaml](../../stitch/design-system.yaml) — the canonical token set.
  - [.claude/stitch/briefs/*.md](../../stitch/briefs/) — per-artifact intent (shell, chat-panel, travel-overview, …).
  - [.claude/stitch/prompts/*.md](../../stitch/prompts/) — assembly templates (generate-shell, generate-section, generate-page).
- **State:** `.claude/stitch/state.json` — current Stitch project + canonical screen IDs (shell-master, section-frame:*, page:*).
- **Run log:** `.claude/stitch/runs/<ISO-timestamp>-<level>[-<scope>].md`.

## Commands

| Command | Purpose | Mutates |
|---|---|---|
| `/stitch init` | First-time setup: create/attach Stitch project, push design system, write `state.json` | Stitch (creates project), state.json |
| `/stitch list` | List Stitch projects | nothing |
| `/stitch project [id]` | Show current project (or specified) | nothing |
| `/stitch screen <id>` | Show a screen — title, thumbnail, HTML download URL | nothing |
| `/stitch tokens-sync` | Push `design-system.yaml` to Stitch via `update_design_system`, emit `pwa/styles/tokens.css` | Stitch design system, pwa/styles/tokens.css |
| `/stitch generate-shell [--notes "..."]` | Assemble shell prompt, call `generate_screen_from_text`, write run-log | Stitch (creates screens), runs/ |
| `/stitch generate-section <domain> [--notes "..."]` | Assemble section-frame prompt, call MCP, log | Stitch, runs/ |
| `/stitch generate-page <domain>/<page> [--notes "..."]` | Assemble page-body prompt, call MCP, log | Stitch, runs/ |
| `/stitch variants <screen-id> [--notes "..."]` | Call `generate_variants` to explore a screen further | Stitch, runs/ |
| `/stitch vocab-check` | Diff `component-vocabulary.md` against `pwa/components/CATALOG.md` | nothing |
| `/stitch runs [N]` | List N most recent runs (default 10) | nothing |

## Global rules

These override any "go faster" pressure earlier in the session.

1. **Always show the assembled prompt before sending it to Stitch.** Print the full assembled prompt and ask the user **Approve → Revise → Cancel**. Do not call any `mcp__stitch__generate_*` until the user explicitly says go. The whole iteration premise is "you can see and improve the prompt"; calling without preview defeats it.
2. **Never silently overwrite `pwa/styles/tokens.css`.** `tokens-sync` runs the script in `--dry-run` first, prints a unified diff against the existing file (if any), and asks **Approve → Cancel** before the real write.
3. **`vocab-check` runs automatically after every `generate-page`.** If Stitch's HTML output references components not in `component-vocabulary.md`, surface them as `Stitch's invented name` rows for the user to triage. Do not silently let drift accumulate.
4. **Every `generate-*` call writes a run-log entry, even on failure.** The log captures what was tried; a missing log is worse than a "this attempt failed" log.
5. **Don't commit to git inside this skill.** All commands stop after writing local files / calling Stitch. Commits are a separate user step.
6. **Decide before generating.** When the user invokes `/stitch generate-*`, first state which row of `.claude/patterns/stitch-when-to-use.md` you matched (or which Skip row would apply). If unsure, ask before generating.

## /stitch init

Goal: bootstrap the Stitch side of the pipeline so subsequent `generate-*` and `tokens-sync` calls have somewhere to land.

1. **Check `.claude/stitch/state.json`.** If `current_project_id` is set, ask the user if they want to re-init (uncommon) or attach to a different project. If file is missing, treat as first-time setup.
2. **Choose project**:
   - If `--attach <project-id>` provided: validate via `mcp__stitch__get_project`. Adopt it.
   - Else: ask the user to confirm creating `Personal Assistant — Shell + Travel` via `mcp__stitch__create_project`. Show the proposed name; require Approve → Revise → Cancel.
3. **Apply the design system**:
   - Call `mcp__stitch__list_design_systems`. If a "Voyager Midnight" entry exists, ask whether to reuse or recreate. Else call `mcp__stitch__create_design_system` seeded from `design-system.yaml.stitch_overrides` (primary `#4E7BFF`, secondary `#00D1FF`, tertiary `#8A99B1`, neutral `#0A0B14`).
   - Call `mcp__stitch__apply_design_system` to bind it to the project.
4. **Update state.json** with: `current_project_id`, `design_system_id`, `created_at`, and an empty `screens` map.
5. **Update `design-system.yaml`** — replace the `<TBD: ...>` placeholder under `sync_targets.stitch.project_ids` with the new project ID.
6. **Print a summary**: project ID, design-system ID, link to the Stitch canvas, and the suggested next step (`/stitch tokens-sync` if you intend to push tokens, else `/stitch generate-shell`).

## /stitch list

Wraps `mcp__stitch__list_projects`. The full result can be ~90KB, so:

1. Call the MCP.
2. The MCP saves the result to a tool-results file when oversized. Use `jq` on that file to extract the top 10 most recently-updated projects.
3. Print as a table: name (or `(untitled)`), `projects/<id>`, `updateTime`, `createTime`.

## /stitch project [id]

Wraps `mcp__stitch__get_project`. Default `id` = `state.json.current_project_id`. Prints: title, design system summary, screen count by role-tag (shell-master / section-frame:* / page:*), thumbnail URL.

## /stitch screen \<id\>

Wraps `mcp__stitch__get_screen` for `projects/<current>/screens/<id>`. Prints: title, deviceType, dimensions, thumbnail URL, HTML download URL. If `--download <path>` flag provided, also `curl -sL` the HTML into the path.

## /stitch tokens-sync

Goal: keep Stitch's design system, the local YAML, and the PWA CSS in sync — atomically.

1. **Validate** — read `design-system.yaml` via the script's parser (run `bun run scripts/stitch-tokens-to-css.ts --check` to confirm it parses); if it errors, print the error and stop.
2. **Local diff preview**:
   - Run `bun run scripts/stitch-tokens-to-css.ts --dry-run` and capture stdout.
   - If `pwa/styles/tokens.css` exists, compute and print a unified diff against the dry-run output. Else print "(new file)".
3. **Stitch diff preview** (per project ID in `sync_targets.stitch.project_ids`):
   - Compare `design-system.yaml.stitch_overrides` and the current Stitch design-system overrides on each project.
   - Print which fields will change.
4. **Gate — Approve → Revise → Cancel.** Show the combined preview and stop.
5. **On approve**:
   - Run `bun run scripts/stitch-tokens-to-css.ts` (writes `pwa/styles/tokens.css`).
   - For each project ID in `sync_targets.stitch.project_ids`, call `mcp__stitch__update_design_system` with the YAML's overrides + named colors + typography + roundness.
   - Append a run-log entry `runs/<ts>-tokens-sync.md` listing what changed.
   - Print summary: bytes written, projects updated, suggested next step (`/stitch generate-page <existing>` to spot-regenerate one canonical view and verify the token change didn't degrade anything — per `stitch-when-to-use.md` "Token / design-system change" trigger).

## /stitch generate-shell [--notes "..."]

Goal: produce the application shell screen with three device variants in the current Stitch project.

**Trigger this matches in `stitch-when-to-use.md`:** "New shell or main-nav change". Confirm out loud which row matches before proceeding.

1. **Pre-checks**:
   - `state.json.current_project_id` is set; else stop and tell the user to run `/stitch init`.
   - All four artifacts exist: `house-style.md`, `component-vocabulary.md`, `briefs/shell.md`, `briefs/chat-panel.md`. Stop on any missing.
2. **Assemble the prompt** following the order in `prompts/generate-shell.md`:
   1. House style verbatim.
   2. Component vocabulary verbatim.
   3. Design system reference: `Voyager Midnight` (named).
   4. Shell brief verbatim.
   5. Chat panel brief verbatim (sub-component of shell).
   6. `--notes` value if provided.
   - Wrap with the prompt template's instruction header and footer (the "Generate the shell screen with these device variants" closing block).
3. **Gate — show the assembled prompt**. Print it in full. Print a header line `── Approve → Revise → Cancel ──` and stop. **No MCP call yet.**
4. **On approve**:
   - Call `mcp__stitch__generate_screen_from_text` with `projectId = current_project_id` and the assembled prompt. Stitch generates desktop / tablet / mobile variants in one request.
   - On success: tag returned screen IDs in `state.json.screens.shell-master = [<desktop-id>, <tablet-id>, <mobile-id>]`.
   - Write the run-log entry (see format below).
   - Print summary: screen IDs, Stitch canvas URL, suggested next step (`/stitch generate-section travel`).
5. **On failure** (timeout, MCP error, etc.):
   - Still write a run-log entry with the assembled prompt + error.
   - Print the error and the run-log path; ask the user whether to retry, edit the brief, or escalate.

## /stitch generate-section \<domain\> [--notes "..."]

Goal: generate the section frame for a domain (sub-nav contents) inside the existing shell.

**Trigger:** "New section". Confirm out loud.

1. **Pre-checks**: shell-master screen ID exists in `state.json.screens.shell-master`; else stop and instruct `/stitch generate-shell` first. The brief `briefs/<domain>-section.md` may exist; if not, fall back to extracting the sub-nav definition from `briefs/<domain>-overview.md` (per `prompts/generate-section.md`).
2. **Assemble** per `prompts/generate-section.md`:
   1. House style.
   2. Component vocabulary.
   3. `Voyager Midnight`.
   4. Shell ref: include `state.json.screens.shell-master[0]` as `<<SHELL_REF>>` plus the one-paragraph chrome summary from the prompt template.
   5. Section brief.
   6. `--notes` if provided.
   - Wrap with prompt template's header + footer (including the FORBIDDEN block).
3. **Gate — show the assembled prompt → Approve → Revise → Cancel.**
4. **On approve**:
   - Call `mcp__stitch__generate_screen_from_text`.
   - Tag IDs in `state.json.screens["section-frame:" + domain]`.
   - Write run-log entry.
   - Print summary + next step (`/stitch generate-page <domain>/overview`).

## /stitch generate-page \<domain\>/\<page\> [--notes "..."]

Goal: generate a page body inside an existing section.

**Trigger:** "New view / page from scratch" OR "Redesign / polish pass". Confirm which.

1. **Pre-checks**: shell-master and `section-frame:<domain>` exist in `state.json`; brief `briefs/<domain>-<page>.md` exists.
2. **Assemble** per `prompts/generate-page.md`:
   1. House style.
   2. Component vocabulary.
   3. `Voyager Midnight`.
   4. Shell ref.
   5. Section ref.
   6. Page brief.
   7. `--notes`.
   - Wrap with prompt template's header + footer (FORBIDDEN block included).
3. **Gate — show the assembled prompt → Approve → Revise → Cancel.**
4. **On approve**:
   - Call `mcp__stitch__generate_screen_from_text`.
   - Tag IDs in `state.json.screens["page:" + domain + "/" + page]`.
   - **Run `/stitch vocab-check` automatically.** Append any "invented name" rows to `component-vocabulary.md`'s tracking table (with the user's confirmation if any are non-trivial — see global rule 3).
   - Write run-log entry.
   - Print summary + suggested next step (`/review-ui --target stitch:<screen-id>` once that integration ships, or manual review of the Stitch canvas now).

## /stitch variants \<screen-id\> [--notes "..."]

Goal: explore visual alternatives of an existing screen.

**Trigger:** "Redesign / polish pass" — `generate_variants` from the existing screen, per `stitch-when-to-use.md`.

1. **Pre-checks**: screen exists (call `mcp__stitch__get_screen` to validate).
2. **Assemble**: minimal prompt — just the variant intent (`--notes`) plus a one-line reference to the house style. The variants tool already inherits the source screen's design.
3. **Gate** — show the prompt → Approve → Revise → Cancel.
4. **On approve**: call `mcp__stitch__generate_variants`. Log the run.

## /stitch vocab-check

Goal: detect drift between `component-vocabulary.md` and `pwa/components/CATALOG.md`.

1. Parse the rows in CATALOG.md (every "Default" column entry is the canonical name).
2. Parse the names in `component-vocabulary.md` (the "Name" column of every table).
3. Print a 3-column table: `Name | In CATALOG | In vocabulary`. Highlight rows where the two disagree.
4. Also flag CATALOG rows whose Status is `redesigning` or `superseded by …` and which still appear in vocabulary as a stable entry — Stitch must not generate against those.
5. Read-only: never auto-edit the vocabulary; surface the drift and let the user decide.

## /stitch runs [N]

List the most recent N (default 10) entries from `.claude/stitch/runs/`. Print: timestamp, type (shell/section/page/variants/tokens-sync), scope (e.g. travel/overview), screen IDs, one-line of caller notes if present.

## Run-log format

Every `generate-*` and `tokens-sync` invocation writes one file:

```
.claude/stitch/runs/<ISO-timestamp>-<level>[-<scope>].md
```

Examples:
- `2026-04-27T161200Z-shell.md`
- `2026-04-27T173000Z-section-travel.md`
- `2026-04-27T180000Z-page-travel-overview.md`
- `2026-04-27T210000Z-tokens-sync.md`

Frontmatter + body:

```markdown
---
type: shell | section | page | variants | tokens-sync
timestamp: 2026-04-27T16:12:00Z
project_id: 1552238106417762941
scope: travel/overview          # null for shell, domain for section, domain/page for page
screen_ids: [<id1>, <id2>, <id3>]
caller_notes: "<--notes value or empty>"
status: success | failure
error: null
---

# Run — Generate <Level>

## Parameters
- Variants: desktop, tablet, mobile
- Project: <id>
- Source artifacts: house-style@<hash>, vocabulary@<hash>, brief@<hash>

## Assembled prompt

\`\`\`
<full prompt text exactly as sent to Stitch>
\`\`\`

## Result
- Desktop screen: <id> (https://stitch.../canvas/<project>?screen=<id>)
- Tablet screen: <id>
- Mobile screen: <id>

## Vocabulary drift
- Stitch's invented names this run: <none | list>

## Notes
<lessons / observations from this run, if any>
```

The `@<hash>` source-artifact hashes are the first 8 chars of `git hash-object <file>` — lets us correlate prompt-edits to output quality. If git is unavailable, fall back to the file's mtime.

## state.json shape

```json
{
  "schema_version": 1,
  "current_project_id": "1552238106417762941",
  "design_system_id": "<id>",
  "created_at": "2026-04-27T15:00:00Z",
  "updated_at": "2026-04-27T18:00:00Z",
  "screens": {
    "shell-master": ["<desktop-id>", "<tablet-id>", "<mobile-id>"],
    "section-frame:travel": ["<desktop-id>", "<tablet-id>", "<mobile-id>"],
    "page:travel/overview": ["<desktop-id>", "<tablet-id>", "<mobile-id>"]
  }
}
```

state.json IS committed to git — the canonical project + screen IDs are part of the repo's truth. Never put secrets in this file.

## Anti-patterns

- **Skipping the assembled-prompt gate.** "It's just a quick generate" is the start of context-engineering rot. Always show the prompt first.
- **Editing prompts inline in this SKILL.md.** Prompts live in `.claude/stitch/prompts/`. Edits here are reviewed in PRs of the artifacts, not the skill.
- **Auto-applying `vocab-check` proposals.** Adding a row to `component-vocabulary.md` claims that the new name is now canonical — that's a human decision. The skill surfaces the drift and stops.
- **Calling `generate-*` without checking `state.json` first.** Page-level generations need `section-frame:<domain>`; section-level needs `shell-master`. If those aren't present, the prompt's `<<SHELL_REF>>` slot will be empty and Stitch will redesign the chrome.
- **Forgetting to run `tokens-sync` after editing `design-system.yaml`.** The CSS goes stale silently. `--check` mode in CI is the durable fix; until it's wired, the skill's `tokens-sync` gate is the line of defense.
- **Treating Stitch screens as the deliverable.** They're a *specification*. The deliverable is the PWA component / view that translates the Stitch screen into the codebase via `/component migrate --from-stitch <id>` (when that integration ships) or hand-translation guided by the run log.

## Lessons learned (2026-04-27 session)

Hard-won findings from the first MVP run that should inform every subsequent Stitch session:

### Tool-shape mismatch — Stitch is single-screen, not multi-screen

`generate_screen_from_text` produces **independent** screens. Prompt-prose like "use the chrome from screen X" is advisory only — Stitch re-derives layout, icons, navigation labels, and copy on every call. Across 7 desktop generations of the same shell + Travel sub-pages:
- 0/7 had the correct Material Symbol icon set (Stitch substitutes `home` for `cottage`, `business_center` for `work`, `home_work` for `cottage`).
- 5 different brand wordmarks appeared (none matched the spec).
- Every single screen invented its own chat-panel anatomy and its own hex literal palette.
- 2/7 had completely wrong main-nav structures ("Dashboard / Fleet / Logistics" instead of the 5 life domains).

**Conclusion**: Stitch is an excellent ONE-SHOT screen generator, not a multi-screen design system tool. Plan workflows accordingly.

### The right workflow: master + atomic edits, then stop

1. `generate_screen_from_text` → ONE shell-master desktop screen.
2. Iterate the master via 3–4 atomic `edit_screens` calls (icon swap, wordmark fix, single-component rebuild, token cleanup) until the chrome is correct.
3. **Stop.** All other surfaces — sub-pages, mobile/tablet variants, future domains — are produced by hand-translating to PWA code, NOT by more Stitch generations.

This is the only workflow that produced consistent output. Trying to generate 17 cross-consistent screens via prompts wasted ~30 MCP calls and produced unusable drift.

### Parallelism limits per MCP method

| Method | Parallel ≥3 behavior |
|---|---|
| `generate_screen_from_text` | All calls **time out at the MCP layer**. Generations succeed server-side; recover via `get_project` and identify by screen title. **Don't sequentially retry** — that creates duplicates because the parallel calls already succeeded server-side. |
| `generate_variants` deviceType=MOBILE | Parallel calls succeed synchronously. **Reliable in parallel batches up to 4.** |
| `generate_variants` deviceType=TABLET | Returns async-pending stub IDs (height/width=0, no htmlCode). Renders may complete eventually but synchronous polling within the same session shows them empty. Treat tablet as best-effort, not guaranteed. |
| `edit_screens` | **Single-threaded only.** Parallel calls time out AND the timeout drops the output screen ID. Result: orphan screens we can't reference. **Sequential edit_screens is the only reliable mode.** |

### `edit_screens` complexity ceiling

`edit_screens` reliably handles atomic structural edits — icon swap, label swap, single-component rebuild, token cleanup. It **times out** when asked to populate complex page bodies (e.g., 3 mechanism cards + 4 stat tiles + sample data — about ~30 rows of structured content). The complexity ceiling is roughly: any edit that would describe a full Travel Overview body is too much.

When you hit the ceiling, **stop using `edit_screens`** for that work. The body content goes into a brief like `.claude/stitch/briefs/travel-chat-bubbles.md` instead, and the engineer hand-translates to PWA code.

### Practical token rules

- The design-system binding (Voyager Midnight) only enforces palette tokens at the *theme* level. Stitch still emits raw hex literals (`#0a0a0a`, `#1e293b`, etc.) inside generated HTML on every call. The hex-literal cleanup edit can reduce but not eliminate them.
- For consistent token use across screens, the durable answer is: emit `pwa/styles/tokens.css` from `design-system.yaml` (already done), then enforce token-only via PWA code review — not via Stitch.

### When to stop using Stitch

Once the master is correct (chrome, design system, chat panel anatomy):
- All subsequent UI work happens in PWA code.
- Treat the master as the *visual reference* for hand-translation.
- The detailed body specs (e.g. `briefs/travel-chat-bubbles.md`) are the implementation source-of-truth.
- Each new component goes through the existing `/component` skill flow — that's where consistency is enforceable.

This is the path that produced the first concrete deliverable of the MVP: `pwa/components/flight-card.js`, with stories, sw.js precache, index.html script tag, and CATALOG.md row. It's reliable and reviewable in a way Stitch generations never became.
