# PWA Component Library

> **⚠️ STALE STACK — ported from personalassistant, not yet rewired for companygraph.** Manages the personalassistant vanilla-JS IIFE library (`pwa/components/*.js`, `CATALOG.md`, `storybook.html`) — none of which exist here. companygraph's components are React (`pwa/src/components/*.tsx` + CSS modules), governed by `design-system.manifest.yaml` via `/wireframe-extract`. The gate discipline below (never self-approve, audit before new, semantic-equivalence check) still applies; the paths and file shapes do not. Reconcile against this repo before following any instruction below.

Manage the no-build, vanilla-JS component library at `pwa/components/`. Seven subcommands cover the full lifecycle: net-new design, additive extension of an existing component, view-to-existing-component migration, mechanical pattern extraction, audit, storybook scaffolding, and in-flight-redesign status.

## Reference

- [.claude/patterns/pwa-component.md](../../patterns/pwa-component.md) — IIFE shape, idempotent style guard, token system, acceptance checklist, **and the "when to extend / redesign / spec" decision tree**.
- [design-system.manifest.yaml](../../../design-system.manifest.yaml) — the **scenario → default-component** map with **Status** column tracking which components are stable, extending, redesigning, superseded, or deprecated. Every `/component new`, `/component extend`, and `/component extract` ends with a CATALOG row added or updated. Every other agent (`/add-pwa-view`, anything writing UI) must consult this catalog before hand-rolling markup.
- **Upstream conductor:** when a design artifact in `docs/design/` is being applied, `/design-apply` (`.claude/skills/design-apply/`) is the orchestrator — it calls *this* skill (`new`/`migrate`/`extract`) per surface under a companygraph-conformance gate. If you arrived here from a design drop, prefer running `/design-apply` so the work is tracked + gated.

## Commands

- `/component new <scenario>` — design a net-new component from a stated requirement. **The originating flow.** 5 gates.
- `/component extend <name>` — **additive** (backward-compatible) extension of an existing component, e.g. add a `.tabs()` builder to `card.js`. Gate 0 audits all current consumers to confirm additivity is sufficient; if it isn't, escalates to `/spec`. 6 gates.
- `/component audit` — scan every `pwa/views/*.js`, surface candidate-match **hypotheses** (not recommendations). Read-only. **Do not act on output without `/component migrate` Gate-0 verification.**
- `/component migrate <view> <existing-component>` — switch one view from a hand-rolled implementation to an **existing** catalog component. Gate 0 mandatorily verifies that the hand-rolled markup and the catalog component are *semantically equivalent* (not just class-name-overlapping); only `equivalent` matches proceed. 6 gates. **The command that absorbs `/component audit`'s candidate list.**
- `/component extract <view> <pattern-name>` — lift one pattern out of one view into a **new** `pwa/components/<pattern-name>.js`, swap the view to use it, register everywhere (incl. CATALOG). For when the catalog has no existing default for the scenario.
- `/component story <name>` — add a storybook section for an existing component that lacks one.
- `/component status` — read-only inspector: which components are mid-flight (extending / redesigning), which consumer migrations are pending, what's stale.

## Global rule — never self-approve at a review gate

Every subcommand in this skill has at least one **human review gate** that asks the user to approve a visible artifact (a Storybook story, an extracted view, a CATALOG row). At that gate:

- **Stop and wait for an explicit user response.** Do not write to git, do not commit, do not push, do not call deploy tools — even when other work is queued.
- **Do not infer approval from silence, prior context, or a "go" earlier in the session.** Each review gate is its own decision point. The user said "go" to start the work, not to skip the review.
- **Do not skip the review when working autonomously / "dogfooding".** If a real user is unreachable, surface that explicitly and stop. The gate exists to prevent unreviewed UI from shipping; bypassing it on the basis of "I'm in a dogfood loop" defeats the protocol.
- **Static `storybook.html` is not a sufficient review surface.** Framework Storybook (`localhost:6006`) is canonical because it has hot reload, organized navigation, and the explicit deep links the gates produce. Static is a deploy companion only.

This rule overrides any "go faster" pressure earlier in the session. If the user wants to override, they must say "override review gate" in plain text — never assume it.

## When to use which command

| Situation | Command | Why |
|---|---|---|
| New scenario, no existing default | `/component new` | Originating flow; ends with new CATALOG row. |
| Existing default's API needs additional capability, all current consumers still work | `/component extend` | Backward-compat is the rule; Gate 0 consumer audit confirms it. |
| Existing default's API is fundamentally wrong; consumers diverge | escalate to `/spec` | Multi-PR migration; spec-workflow tracks coordination. See pattern doc. |
| Backend API shape needs to change alongside the component | escalate to `/spec` | Cross-stack coordination; component skill is PWA-only. |
| One view's inline pattern should be a shared component (no existing default) | `/component extract` | Mechanical lift to a NEW component file. |
| One view should switch from hand-rolled to an EXISTING catalog component | `/component migrate` | Gate 0 verifies semantic equivalence first. **The right command for any audit-suggested migration.** |
| Component exists but has no storybook section | `/component story` | Doc-only PR. |
| "Where are we on the design-system migration?" | `/component status` | Read-only summary. |
| `/component audit` flagged something — what's next? | NEVER act directly. ALWAYS run `/component migrate` for each candidate to verify before any code change. | Audit is hypotheses; migrate's Gate 0 is verification. |

---

## /component new <scenario>

Goal: design a new component from a stated requirement, get user buy-in on the design before any code, surface in storybook for review, iterate, then deploy and register as the default for the scenario.

This is a **gated workflow** — five gates, each with explicit user confirmation. Don't skip gates. Don't bundle.

### Gate 1 — Capture requirements

If `<scenario>` is terse ("status badge", "card for shopping list row"), ask 2-4 sharp clarifying questions before going further. Cover:
- **Where it appears** (which view, which view region) — needed to confirm scenario isn't already covered by an existing CATALOG row.
- **What states it has** (idle / loading / error / populated / disabled / etc.) — drives storybook examples.
- **What it should *not* do** — e.g. "this is presentational only, no fetch logic". Prevents scope creep into a panel-with-WS-binding when a string-builder would do.
- **What existing component (if any) it replaces or composes with**.

Then:
1. **Check the CATALOG** (`design-system.manifest.yaml`) for any existing scenario row that overlaps. If a default already exists, name it back to the user — they may want `/component story` or `/component extract` instead. Don't create a duplicate default.
2. Propose a **component name** (kebab-case, no `.js`), a **slot in the design system** (badge / card / panel / control / overlay / chrome), and the **public API shape** (factory vs. builder, options object, return type).
3. Present the requirements summary in 4-6 lines. Ask: **Approve → Revise → Reject**.

Don't write any code until the user approves Gate 1.

### Gate 2 — Initial design + storybook scaffold

Once requirements are approved:
1. Create `pwa/components/<name>.js` matching the canonical shape from `pwa-component.md` — IIFE, idempotent style guard, `var(--*)` tokens only, namespaced classes, `esc()` on user-supplied strings.
2. Add a `<script>` tag for the new file in `pwa/index.html` head, before any view that will use it.
3. Add the file to `pwa/sw.js` `PRECACHE_URLS`. Do **not** hand-edit `CACHE_NAME` — it reads `'%%CACHE_VERSION%%'` and CI substitutes a fresh value on every deploy. Adding the line to PRECACHE_URLS is enough; the version bump is automatic.
4. **Write stories on both surfaces:**
   - `pwa/components/<name>.stories.js` — Storybook framework format (local dev, hot reload). One export per realistic state.
   - `pwa/storybook.html` — section in the static live-URL showcase with the same examples.
   - Also append `<script src="/components/<name>.js"></script>` to `pwa/.storybook/preview-head.html` so the framework loads the IIFE.
5. **Surface the design in framework Storybook for human review.** This is the **mandatory review gate** — production deploy is blocked until the user approves what they see in framework Storybook. Static `storybook.html` is a deploy-time companion, not a review surface.
   - If Storybook isn't already running, instruct: `cd pwa && bun install && bun x storybook dev -p 6006`. (Install is one-time; subsequent runs skip it.)
   - Compute the deep link: `http://localhost:6006/?path=/story/<title-kebab>--<story-name-kebab>` where `<title-kebab>` lowercases the title's slot/name (e.g. `Controls/Tab Strip` → `controls-tab-strip`) and `<story-name-kebab>` lowercases the first story export (e.g. `Underline` → `underline`).
   - **Hand the user the link** — not "navigate to the sidebar". Concrete example: `http://localhost:6006/?path=/story/controls-tab-strip--underline`.
6. Ask: **Approve as-is → Iterate → Reject**. Approval is required before any code reaches `git push`. If the user can't open the framework Storybook (machine unavailable, etc.), surface that explicitly — do not silently fall back to the static page.

If Reject → back out the files (`git checkout -- pwa/index.html pwa/sw.js pwa/storybook.html` and `rm pwa/components/<name>.js`), explain what would need to change to restart, stop.

### Gate 3 — Iterate

Iteration loop, capped at **3 rounds** (matches the spec-workflow review-cap discipline — diminishing returns past round 3). The loop happens entirely in framework Storybook with hot reload — that's why we have it.

Each round:
1. User describes what to change ("more compact", "disabled state needs more contrast", "drop the icon slot, add a subtitle slot").
2. Edit `pwa/components/<name>.js` and `pwa/components/<name>.stories.js` (and the static `pwa/storybook.html` section if visual change is meaningful — though static can lag behind iteration if needed). Keep changes scoped to the named feedback — don't drift into adjacent improvements.
3. **Hot reload picks up the change automatically** — Storybook's Vite dev server re-builds the stories iframe in <1s. The user does not need to refresh manually for `.stories.js` edits; for IIFE component file edits, a single browser refresh of the Storybook page is enough.
4. Hand the user the same deep link from Gate 2 (`http://localhost:6006/?path=/story/<title>--<story>`) and ask: **Approve → Iterate again → Stop and ship as-is**.

After 3 iterations, **do not offer "Iterate again"**. Offer only: "Approve → Stop and ship as-is → Override cap (requires explicit 'override cap' from user)". Document why in the commit body.

### Gate 4 — Deploy

**Pre-deploy gate (blocking):** the user has approved the design in framework Storybook (Gate 2/3). Without that explicit approval, do not commit. If the user reviewed only via the static `storybook.html`, that's not sufficient — framework Storybook is the canonical review surface; the static page is a deploy companion. Surface the gap and get framework-Storybook approval before proceeding.

Once approved:
1. Confirm the acceptance checklist from `pwa-component.md` (walk it explicitly, don't assume).
2. Run the component's test if one exists (`bun test pwa/__tests__/<name>.test.ts`) and the wider PWA suite (`bun test pwa/__tests__`) — broken sw-parity / cross-origin tests catch missing precache entries.
3. Stage: `pwa/components/<name>.js`, `pwa/index.html`, `pwa/sw.js`, `pwa/storybook.html`, `design-system.manifest.yaml` (filled in Gate 5), and the test file if you wrote one.
4. Don't commit yet — Gate 5 needs to land in the same commit.

### Gate 5 — Register as default in CATALOG

This is what "becomes the default component for its usage scenario" means in practice. Edit `design-system.manifest.yaml`:
1. Find the right table (Badges / Cards / Panels / Controls / Overlays / Chrome — match the slot from Gate 1).
2. Add a row: `| <Scenario one-liner> | <name> | <one-line API> | <file:line> |`.
3. **Verify the file:line pointer just before commit.** Edits during Gate 3 iteration shift line numbers — the right command is `grep -n '<API symbol>' pwa/components/<name>.js` immediately before staging, then update the row to match. A stale pointer makes the catalog actively misleading.
4. If the row supersedes an older entry (e.g. a scenario previously routed to a generic primitive), update the older row's "Notes" column with `superseded by <name> on YYYY-MM-DD` rather than deleting.
5. Commit. Single commit, message:
   ```
   feat(pwa): add <name> component for <scenario>

   <one-paragraph design rationale>

   - States: idle, loading, error, populated, …
   - API: <one-line>
   - Registered as default for: <CATALOG scenario row>
   - Storybook: pwa/storybook.html#<name>
   ```
5. Push (CI deploys the storybook + the component to S3 with the rest of the PWA).
6. After CI promotes, tell the user the live storybook URL: `https://app.frankwinkler.me/storybook.html#<name>`.

### Acceptance — done means

- [ ] Component file exists, follows the pattern.
- [ ] All files in the deploy stage updated:
  - `pwa/components/<name>.js` (component)
  - `pwa/components/<name>.stories.js` (framework Storybook stories)
  - `pwa/storybook.html` (static live-URL showcase section)
  - `pwa/.storybook/preview-head.html` (script tag for the IIFE)
  - `pwa/index.html` (script tag, before any view that consumes it)
  - `pwa/sw.js` PRECACHE_URLS (CI templates the cache name; do not hand-edit)
  - `design-system.manifest.yaml` (catalog row with **freshly-verified** file:line pointer)
- [ ] Both surfaces render correctly: `bun x storybook dev` shows the new sidebar entries; `storybook.html` shows the new section.
- [ ] Test file at `pwa/__tests__/<name>.test.ts` exists if the component has any non-trivial logic — regression net for future refactors.
- [ ] Single commit, single push, single deploy.

---

## /component extend <name>

Goal: add new capability to an existing component without breaking any current consumer. The output is one PR for the component (new API + storybook update + CATALOG status `stable → extending`), then one PR per consumer that adopts the new API, then a final flip back to `stable` when the migration is complete.

This is the **right command for additive API extensions** (e.g. `card()` gains a `.tabs()` builder method, `uxState()` gains a `domain` parameter that defaults to the canonical taxonomy). It is **not the right command** for breaking redesigns that change return shapes, remove methods, or require simultaneous backend changes — those escalate to `/spec` per the pattern doc's decision tree.

Six gates. Don't skip Gate 0; that's the gate that stops the wrong tool from being used.

### Gate 0 — Consumer audit (the "is extension actually sufficient?" test)

Before any code:
1. Identify the public API symbols on `window` exposed by `pwa/components/<name>.js`.
2. Grep their use across `pwa/views/*.js`: `grep -nE "(<symbol1>|<symbol2>)\(" pwa/views/*.js` → list of (file, line, call signature) tuples.
3. For each call site, write down what the consumer actually passes and what they do with the return. Three lines max per call site.
4. Map proposed new capability to consumers. **For each consumer, mark one of:**
   - `unchanged` — call site keeps working with the existing API, ignores the new capability.
   - `opt-in` — consumer can adopt the new capability later in its own PR; existing call still works today.
   - `requires-migration` — consumer needs to change call shape because the new capability *replaces* something the consumer relies on.
5. **Decision rule:**
   - All call sites are `unchanged` or `opt-in` → proceed to Gate 1, this is a clean Tier-A extension.
   - Any call site is `requires-migration` → **STOP**. The change is not purely additive. Either redesign the proposed API to be additive, or escalate to `/spec` for a full redesign with proper multi-PR coordination.
6. Report the matrix to the user. Ask: **Approve the audit and proceed → Re-scope the proposal → Escalate to /spec**.

The audit takes 10–20 min and saves the next 6 hours of unwinding the wrong path. Don't skip it.

### Gate 1 — Requirements + extension design

Once Gate 0 approves, write a 4-6 line proposal:
- **What's added:** new method / option / parameter, with signature.
- **Backward-compatibility statement:** "Existing call sites <list>:<line> work unchanged. New capability is opt-in."
- **Migration strategy:** "Consumers adopt opportunistically in follow-up PRs. CATALOG status `extending` until last consumer adopts."
- **Storybook coverage:** "New states added to existing storybook section: <list>."
- **Why not breaking:** one sentence.

Ask: **Approve → Revise → Reject**. Don't write code until approval.

### Gate 2 — Implementation + storybook

1. Edit `pwa/components/<name>.js` to add the new capability. **Do not remove or rename anything that exists today.** New optional parameters, new methods on the same builder, new namespaced helpers (`window.<NS>.<method>`) — never reshape existing exports.
2. Update **both** storybook surfaces with new examples covering the new capability:
   - `pwa/components/<name>.stories.js` — add new exports for each new state. Existing exports must still render exactly as before.
   - `pwa/storybook.html` — add the same new examples to the static section.
3. Update or extend the test file at `pwa/__tests__/<name>.test.ts` — new tests cover new behavior; **all existing tests must still pass**.
4. **Surface the new states in framework Storybook for human review.** This is the **mandatory review gate** — production deploy is blocked until the user approves what they see at framework Storybook. Static `storybook.html` is a deploy-time companion only.
   - If Storybook isn't running, instruct: `cd pwa && bun x storybook dev -p 6006`.
   - Compute and hand the user the deep link to one of the new exports: `http://localhost:6006/?path=/story/<title-kebab>--<new-story-kebab>`.
5. Ask: **Approve as-is → Iterate → Reject**. **Do not self-approve, do not assume approval, do not proceed without an explicit user response.** If the user is unavailable, stop and surface that — the gate exists precisely to prevent unreviewed UI from shipping.

### Gate 3 — Iterate

Same review-cap discipline as `/component new` Gate 3: capped at **3 rounds** of feedback → edit → re-review. The loop happens in framework Storybook with hot reload (Vite re-builds the iframe in <1s on `.stories.js` edits; component-file edits need one browser refresh). Each round ends with the user's explicit `Approve` or `Iterate again` — never self-approve. After the 3-round cap, only "Approve / Stop and ship as-is / Override (explicit)" remain. The cap exists because diminishing returns past 3 rounds are real.

### Gate 4 — Deploy the component

**Pre-deploy gate (blocking):** the user has approved the new states in framework Storybook (Gate 2/3). Without that explicit approval, do not commit. If the user reviewed only via the static `storybook.html`, that's not sufficient — framework Storybook is the canonical review surface; the static page is a deploy companion. Surface the gap and get framework-Storybook approval before proceeding.

Once approved:
1. Walk the pattern's acceptance checklist explicitly.
2. Run `bun test pwa/__tests__/<name>.test.ts` and the wider PWA suite (`bun test pwa/__tests__`).
3. Update `design-system.manifest.yaml`:
   - Update the existing row's "Notes" / "API" column to reflect the new capability.
   - **Flip the row's Status column to `extending` with the date** (e.g. `extending since 2026-04-27`).
   - Verify the file:line pointer with a fresh grep before staging.
4. Single commit, single push.

### Gate 5 — Sequenced consumer migration

Now that the new API is live in storybook + production:
1. Each consuming view that wants to adopt the new capability does so in **its own PR**, using `/component extract` mechanics for the swap (since you're replacing inline markup with a call to the new API).
2. Track progress: every consumer-migration PR's commit message should reference the original `/component extend` PR's SHA so `git log` reads as a coordinated migration.
3. **Cap parallel WIPs at 1** unless the user explicitly authorizes more — multiple in-flight consumer migrations in the same component family are how merge-conflict storms start. Ship one, review, then start the next.
4. After every consumer that *should* migrate has migrated (use `/component status` to verify), proceed to Gate 6.

If a consumer is *intentionally not migrating* (e.g. domain-specific divergence is justified), record the reason in CATALOG.md's notes column. Don't leave the component stuck in `extending` forever waiting for a consumer that won't move.

### Gate 6 — Flip status back to `stable`

1. Run `/component status` — confirm no consumer-migration PRs are still open or pending for this component.
2. Edit `design-system.manifest.yaml`: flip Status from `extending` back to `stable`. Remove the date.
3. If the extension is now the recommended default for a scenario the component didn't previously cover, add a new row pointing to the same component file but with the new scenario.
4. Commit. One-liner: `chore(pwa): mark <name> stable after .<method>() rollout`.

### Acceptance — done means

- [ ] Consumer audit was run; matrix shared with user; no `requires-migration` rows.
- [ ] All existing call sites work unchanged in production after Gate 4.
- [ ] Component file, storybook section, test file, and CATALOG row all updated in one commit at Gate 4.
- [ ] CATALOG status was `extending` during the rollout, flipped back to `stable` at Gate 6.
- [ ] Each consumer migration was its own PR.
- [ ] Final state: zero in-flight WIPs, `/component status` reports the component as stable.

---

## /component status

Goal: read-only inspector showing the design-system migration state at a glance. No edits.

### Steps

1. Read `design-system.manifest.yaml` and parse all rows.
2. Group by Status:
   - `stable` rows — count only.
   - `extending` rows — list with the date in the Status cell.
   - `redesigning` rows — list, cross-reference `.claude/specs/component-*-redesign/` directories for the active spec.
   - `superseded-by:<X>` rows — list with their successor.
   - `deprecated` rows — list with deprecation date if present.
3. For each `extending` row:
   - `git log --since=14days --oneline -- pwa/components/<name>.js` to surface recent activity.
   - Grep `pwa/views/*.js` for the new API symbol — count consumers using the new capability vs. consumers still on the old shape. (The Gate-0 audit matrix from the original extension PR is the source of truth for "who should migrate"; this just measures progress.)
4. Surface stale extensions: any row whose Status date is >30 days old gets flagged with `STALE` so the user can decide to either finish the migration or back out the extension.
5. Cross-reference `.claude/specs/component-*-redesign/` for in-flight Tier-B redesigns. List each with its current spec phase.

### Output

A markdown report printed inline (not written to a file — this is a quick-status command, not an audit). Format:

```
# Component status — YYYY-MM-DD

Stable: <N> components.

Extending (<N>):
  - card.js — extending since 2026-04-27 (3 days)
    .tabs() shipped 3d ago. Consumers migrated: 1/3 (chat ✓, flights ⏳, trips ⏳).

Redesigning (<N>):
  - ux-primitives.js — spec at .claude/specs/component-ux-primitives-redesign/
    Phase: design (in-review).

Superseded:
  - (none today)

Stale extensions (>30d, decide):
  - (none today)

In-flight specs (Tier-B / Tier-C):
  - <list>
```

Do not modify any files.

---

## /component audit

Goal: produce a ranked list of **migration hypotheses** — candidates that *might* belong together based on syntactic patterns. **The output is hypotheses, not recommendations.** Read-only.

### Critical: class-name overlap ≠ semantic equivalence

The audit's matching is regex-based — it spots class-name overlap and inline-style frequency. Two `.status` divs in different views can mean entirely different things. Two views both injecting CSS for "loading" or "skeleton" might be using completely different visual treatments (text loader vs. shimmer block vs. spinner gif) under similar names. **The audit cannot know.**

Every candidate must be verified against the actual CSS rules and visual intent before being classified as a real migration target. The audit produces the punch list; `/component migrate`'s Gate 0 verifies each line on it. Skipping the verification step is what produced today's two false starts (state badges, skeleton loaders) — both audit hypotheses turned out to be class-name coincidences, not semantic matches.

### Known false-positive patterns (cautionary log)

These specific audits produced confident-looking hypotheses that did not survive verification. Any future audit that surfaces similar patterns must mark them with low confidence and require manual review.

- **State pill / state badge across 5 views (2026-04-27 morning audit).** Audit said `automation`, `browser`, `trips`, `chat`, `backlog` should migrate to `uxState()`. Reality on inspection:
  - `automation`'s `.aut-chip` carries domain-specific recipe statuses (`active`, `broken`, `disabled`, `draft`) — not in canonical task-lifecycle taxonomy.
  - `browser` had no state badge at all — the regex over-matched on an unrelated class.
  - `trips`'s `.trv-badge` is trip-status-specific, semantically different from canonical states.
  - `chat`'s state styling is intertwined with task-card layout (per-task accent, pulse animations) — not a simple swap.
  - `backlog` uses stage names overlapping with canonical names but with different intent.
  Lesson: state names happen to overlap; domain semantics do not.

- **Skeleton loader in `mcp` + `files-audit` (2026-04-27 afternoon deep-dive).** Said both should migrate to `uxSkeleton()`. Reality:
  - `files-audit.js` had `.fa-loading` — a *centered text* loader ("Loading audit log…"), not a shimmer.
  - `mcp.js` had `loading` state with **no CSS at all** — the deep-dive synthesized a match that wasn't present.
  Lesson: a class name containing "loading" is not the same as a shimmer placeholder. Class-name regex is structural; visual intent is semantic.

### Steps

1. Glob all `pwa/views/*.js` and `pwa/components/*.js`. Note total LOC and per-file LOC.
2. **Duplicated `<style>` injection.** For every view with an inline `<style>` block (~20 of them), extract the CSS rules. Build a frequency map: which class-name patterns appear in 2+ views? Flag the top 10 by occurrence count. Use this regex starting point: `grep -oE "\.[a-zA-Z][a-zA-Z0-9_-]+\s*\{" pwa/views/<view>.js`.
3. **Hardcoded colors.** Grep `pwa/views/**.js` for hex literals (`#[0-9a-fA-F]{3,8}`) and named colors (e.g. `: red;`, `: white;`). Every match is a token-system violation — either it should reference `var(--*)` or a new token needs adding to the global theme in `pwa/index.html`.
4. **Bare class names.** Grep for class names that aren't namespaced (e.g. `class="title"`, `class="row"`, `class="badge"` without a component prefix). These risk collision and indicate a copy-pasted snippet that needs a component home.
5. **Components missing from `storybook.html`.** Diff `ls pwa/components/*.js` against `<script src="/components/...">` mentions in `pwa/storybook.html`. Any component without a section is a gap — not necessarily a bug, but worth the user's eyes.
6. **Components missing from `sw.js` precache.** Diff `ls pwa/components/*.js` against `pwa/sw.js`. Anything missing won't load offline.

### Output format

A markdown report saved to `~/.claude-relay/component-audit-YYYY-MM-DD.md`. The header must explicitly frame the contents as **hypotheses requiring verification**, not recommendations:

```
# Component Audit — YYYY-MM-DD

> ⚠️ This is a list of **hypotheses**, not recommendations. Every row was
> matched by class-name regex; semantic equivalence is unverified. Run
> `/component migrate <view> <component>` for any candidate before acting —
> Gate 0 of that command compares actual CSS rules and visual intent.

## Migration candidates (hypotheses — verify before acting)
| Hand-rolled in (view) | Catalog candidate | Match confidence | Why this confidence |
|---|---|---|---|
| pwa/views/foo.js `.status` block | uxState() | low — class-name overlap only, values may differ | "completed" appears in both, but rest of taxonomy diverges |
| pwa/views/bar.js `.skeleton` | uxSkeleton() | medium — both use animation; verify keyframes match | foo uses 1.5s pulse, catalog uses 1.5s shimmer |
| ... | ... | ... | ... |

## Confidence rubric (mandatory)

- **high** — class names match AND CSS rules (colors, spacing, animation) match within tolerance AND content semantics match. Migration is mechanical.
- **medium** — structural shape matches but at least one of (CSS rules / content / animation) diverges. Migration needs a small adjustment to the catalog API or to the consumer.
- **low** — class-name overlap only. Visual treatment, content type, or semantics differ. Likely NOT a real migration target. Document why before declaring it one.

A confidence column with no value, or "uncertain", or the audit refusing to classify — that's a row that should be excluded from the report rather than included with hand-waving.

## Color token violations
| File:line | Color | Suggested token |
|---|---|---|
| pwa/views/finance.js:1234 | #34c759 | var(--ok) (already exists) |
| ... | ... | ... |

## Components without a story
- `pwa/components/inbox-panel.js`
- ...

## Components missing from sw.js
- `pwa/components/widget-engine.js`

## Recommended next 3 actions
Only list `high`-confidence migration rows here. If the audit produces zero high-confidence rows, the recommended action is "verify the medium-confidence candidates manually before any migration." Do not pad this list to feel productive.

1. ...
2. ...
3. ...
```

Print the report path at the end. Do not modify any files.

### What the audit is and is NOT

- **Is:** a frequency map of class names + CSS literals across views, paired with rough catalog-overlap hypotheses, surfaced for human verification.
- **Is NOT:** a migration plan. Every row needs `/component migrate` Gate 0 verification before it becomes one.
- **Is NOT:** authoritative. If a row in this audit is acted on without verification and turns out to be a false positive, that's a defect in the verification step, not the audit. Add the failure mode to the "Known false-positive patterns" section above so future audits know to mark it `low`.

---

## /component extract <view> <pattern-name>

Goal: lift one CSS+markup pattern from one source view into a new component file, swap the view, register everywhere. One PR per extraction.

### Pre-flight

1. Confirm `<view>` exists at `pwa/views/<view>.js`.
2. Confirm `<pattern-name>` does **not** already exist at `pwa/components/<pattern-name>.js`. If it does, the user probably meant `/component story` or `/component migrate`.
3. Read [.claude/patterns/pwa-component.md](../../patterns/pwa-component.md) for the canonical shape.

### Steps

1. **Identify the pattern.** Ask the user to point at the lines in `pwa/views/<view>.js`: which class names belong to this pattern? Which markup builder? Don't guess — extracting the wrong slice produces a component that doesn't compose.
2. **Scaffold the component file.** Create `pwa/components/<pattern-name>.js` matching the shape in the pattern doc:
   - IIFE wrapper with `if (window.__<name>Loaded) return;` guard.
   - Single style injection guarded by `document.getElementById(<style-id>)`.
   - All colors converted to `var(--*)` tokens. If a color has no existing token, *do not invent one* — flag for the user, propose adding a new token to `pwa/index.html`'s `:root` block.
   - Class names prefixed with `<pattern-name>-`.
   - Public API on `window.<name>...`, accepts plain options, returns either an HTML string (presentational) or a cleanup function (interactive).
   - JSDoc with usage example.
3. **Swap the source view.** In `pwa/views/<view>.js`:
   - Remove the lifted CSS from the inline `<style>` block.
   - Replace the inline markup builder with calls to the new component's public API.
   - Confirm the view's transpile-equivalent still works (no syntax check needed for `.js` — open the page locally and verify).
4. **Register the component.** Three files:
   - `pwa/index.html`: add `<script src="/components/<pattern-name>.js"></script>` in the head, **before** any `<script src="/views/...">` tag.
   - `pwa/sw.js`: add `'/components/<pattern-name>.js',` to `PRECACHE_URLS`. The `CACHE_NAME` template (`%%CACHE_VERSION%%`) is substituted by CI on every deploy — do not hand-edit.
   - `pwa/storybook.html`: add a section showing the component in 2-3 realistic states (e.g. for a badge: each state variant; for a card: with/without subtitle, with/without buttons).
5. **Surface for human review (mandatory gate).** Storybook framework is the canonical review surface — the user must confirm the extracted component renders correctly and the source view is visually identical before commit:
   - Tell the user to run `cd pwa && bun x storybook dev -p 6006` if not already running.
   - Hand them the deep link to the relevant story: `http://localhost:6006/?path=/story/<title>--<story>`.
   - Also instruct: `cd pwa && python3 -m http.server 8000` → `http://localhost:8000/#/<view>` to confirm the source view still works.
   - Ask: **Approve the extraction → Iterate → Reject**. **Do not self-approve.** No commit before the user replies.
6. **Register in CATALOG.** Edit `design-system.manifest.yaml` — add a row for the scenario this component now serves (ask the user to phrase the scenario in one line; that one line is what every future agent will grep for). Without this row, the component is invisible to the design system and a future agent will hand-roll the same markup again.
7. **Commit.** Single commit, message `feat(pwa): extract <pattern-name> component from <view>`. List the registry files touched in the body, including CATALOG.md.

### Acceptance checklist before declaring done

Each item in the pattern's "Required" checklist must hold. Walk it explicitly:

- [ ] Component file exists, IIFE-wrapped, classic script.
- [ ] Idempotent guard at top.
- [ ] Style injection guarded.
- [ ] All colors are `var(--*)`.
- [ ] Class names prefixed.
- [ ] `esc()` used on any user-supplied string.
- [ ] Registered in `pwa/index.html`.
- [ ] Listed in `pwa/sw.js` precache.
- [ ] Component listed in `pwa/sw.js` PRECACHE_URLS (CI templates the cache name).
- [ ] Storybook section added with multiple states.
- [ ] Source view's inline style/markup removed (no zombie CSS).

If any item fails, fix or back out — don't ship a half-extracted component.

---

## /component migrate <view> <existing-component>

Goal: migrate one view from a hand-rolled implementation to an **existing** catalog component. Different from `/component extract` (which creates a NEW component) — `migrate` consumes an existing default. This is the missing command for "audit said view X should use component Y" — without it, agents either misuse `/component extract` or skip the verification step entirely.

This is the command that absorbs every "candidate match" produced by `/component audit`. Each candidate goes through Gate 0 — if it survives, the migration proceeds; if not, the skill records why and stops.

Six gates. Gate 0 is the most important. **Skipping Gate 0 is what produced today's two false starts.**

### Gate 0 — Verify the match (the gate that prevents false starts)

Before any code change:

1. **Read the consumer's hand-rolled implementation.** Find the `<style>` block in `pwa/views/<view>.js` for the suspected pattern. Read every CSS rule. Read every place the resulting class names are referenced. List:
   - Class names used (`.foo-status.completed`, etc.)
   - Visual properties (color, padding, animation, font-size, …)
   - Content type (text label / icon / shimmer block / spinner / …)
   - Domain values (e.g. for status badges: `active`, `broken`, `disabled`, `draft` — or canonical task-lifecycle states like `completed`, `failed`, `awaiting-approval`)
   - JS that depends on the markup (event handlers, querySelector calls, classList.toggle uses)

2. **Read the catalog component.** Find its public API in `pwa/components/<existing-component>.js`. Read every CSS rule it injects. List:
   - Public symbols + signatures
   - Visual properties produced
   - Content type produced
   - Domain values supported

3. **Compare and classify the match.** Record one of:
   - **`equivalent`** — visual properties match within tolerance, content semantics match, domain values overlap or one is a strict subset. Migration is mechanical.
   - **`partial`** — structural shape matches but visual details diverge OR domain values diverge. Migration would require either extending the component (Tier-A) or accepting visual drift in the view (likely not OK). Surface this — do NOT proceed as a migration.
   - **`divergent`** — class names happen to overlap but the view is rendering something semantically different (e.g. `.fa-loading` is a text loader; `uxSkeleton` is a shimmer block). Migration is wrong. Document why and update CATALOG / audit cautionary log.
   - **`unrelated`** — the audit's regex over-matched; there's no real candidate here. Document and dismiss.

4. **Surface the comparison to the user as the Gate-0 artifact.** Format:
   ```
   ## /component migrate <view> <existing-component> — Gate 0 result

   ### Hand-rolled in <view>
   - Class names: ...
   - Visual: color=..., padding=..., animation=...
   - Content: text "Loading audit log…" / shimmer block / etc.
   - Domain values: active, broken, disabled, draft

   ### Catalog default <existing-component>
   - API: ...
   - Visual: color=..., padding=..., animation=...
   - Content: ...
   - Domain values: completed, failed, in-progress, awaiting-approval, ...

   ### Verdict: <equivalent|partial|divergent|unrelated>

   <one-paragraph justification with specific deltas>
   ```

5. Ask: **Approve verdict and proceed (only if `equivalent`) → Re-classify → Stop.** **Do not self-classify the verdict.** If unsure between two classes, default to the more conservative one.

### Gate 1 — Plan the swap

Only reached when Gate 0 returned `equivalent`.

1. List the exact replacements:
   - Markup: `<div class="x-status completed">…</div>` → `${uxState('completed')}`
   - CSS to delete from the view's inline `<style>` block
   - JS to delete (any handlers attached specifically to the old class names)
2. List anything in the view that the catalog component *doesn't* provide and that needs to be added back externally (e.g. wrapper div, custom positioning).
3. Confirm `pwa/components/<existing-component>.js` is already in `index.html` script tags AND `sw.js` PRECACHE_URLS. If not, fix that as part of the migration.
4. Surface the plan. Ask: **Approve plan → Revise → Reject**.

### Gate 2 — Apply the swap

1. Edit `pwa/views/<view>.js`:
   - Replace markup with calls to the catalog component's API.
   - Delete the orphaned CSS rules from the inline `<style>` block. If the block becomes empty, remove it and the surrounding style-injection plumbing.
   - Delete orphaned JS (handlers, querySelector lookups for the old classes).
2. Run `bun test pwa/__tests__` — wider suite must still pass.
3. Open the view locally (`cd pwa && python3 -m http.server 8000` then `http://localhost:8000/#/<view>`) — visual check. Open the catalog component's framework Storybook story for context.

### Gate 3 — Human review (mandatory)

Surface for review. **Do not self-approve.**

1. Hand the user the framework Storybook deep link for the catalog component (so they see what they're propagating).
2. Hand the user the local PWA URL for the migrated view (so they see the actual change).
3. Ask: **Approve migration → Iterate → Roll back**. Wait for explicit response.

### Gate 4 — Deploy

Only after explicit Gate-3 approval:

1. Walk acceptance checklist (below).
2. Single commit, single push.

### Gate 5 — Update tracking

1. If this migration was triggered by a `/component extend` rollout, update its CATALOG status (consumer migrations counter, status flip-back consideration).
2. Add the consumer to the component's "consumed by" notes in CATALOG if useful.
3. Update audit cautionary log if Gate 0 produced a `divergent` or `unrelated` verdict — that's a real audit false-positive worth documenting.

### Acceptance — done means

- [ ] Gate 0 verdict was `equivalent` and explicitly approved by the user.
- [ ] All hand-rolled markup, CSS, and JS specific to the old impl removed (no zombie code).
- [ ] View visually identical or improved (verified by user, not the skill).
- [ ] Wider PWA test suite still passes.
- [ ] CATALOG and any rollout tracker updated.
- [ ] Single commit, single push.

### Anti-patterns

- Skipping Gate 0 because the audit said it's a candidate. The audit is hypotheses; Gate 0 is verification. Today's misses (state badges, skeleton loaders) all started by trusting the audit.
- Forcing a `partial` match through migration. That's a Tier-A `/component extend` plus a migration, not a single migration. Two PRs.
- Treating `divergent` as failure. It's a successful audit-correction outcome. Document the divergence; the next audit will know to mark it `low` confidence.

---

## /component story <name>

Goal: add a `pwa/storybook.html` section for a component that already exists but isn't showcased.

### Steps

1. Read `pwa/components/<name>.js` to understand its public API and option shape.
2. Identify 2-4 realistic example invocations:
   - For badge-like components: every state variant.
   - For card-like components: empty / minimal / fully-loaded.
   - For panel-like components: idle / loading / error / populated.
3. Read `pwa/storybook.html` to find the right section to insert into. Sections are grouped by component category (badges, cards, panels, controls). Add to the matching group, or create a new group if none fits.
4. Add the section with a heading, a one-line description (lifted from the component file's JSDoc), and the example invocations. Match the existing storybook section style — don't reinvent.
5. Verify locally — open `pwa/storybook.html` in a browser, navigate to the new section, confirm renders.
6. Commit. Single commit: `docs(pwa): add storybook section for <name>`.

---

## Notes

- This skill writes only to `pwa/components/`, `pwa/index.html`, `pwa/sw.js`, `pwa/storybook.html`, the source view being refactored, and (for audits) one report file under `~/.claude-relay/`. Nothing else.
- Each subcommand is one PR. Don't bundle.
- If the pattern doc says one thing and the code says another, the code won the last argument — update the pattern doc, then proceed.
- Storybook is a static HTML file, not the npm `storybook` package. Don't introduce a build step.
