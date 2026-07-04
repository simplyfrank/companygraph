# Design Apply — Conductor

Ingest whatever design artifacts land in `docs/design/` and apply them to the PWA **meticulously** — either **fresh** (a new view/component) or as a **migration** (an existing surface re-skinned to the improved design) — while **thoroughly enforcing the canonical design system**.

This skill is a **conductor**. It does not re-implement `/component`, `/stitch`, `/review-ui`, or `/add-pwa-view` — it sequences them under one strict design-system contract and adds a deterministic conformance gate that machine-checks "the design was matched **and** the design system was followed", surface-by-surface, with a human review gate before every merge.

## Locked decisions (do not re-litigate without the user)

These were chosen by the user when this skill was commissioned. They are constraints, not defaults.

1. **Canonical design system = companygraph, app-wide.** Tokens live in `.claude/stitch/design-system.yaml` → emitted to `pwa/src/styles/companygraph/tokens.css`. A design drop is **input**, never a replacement DS. If a drop carries its own palette/type (e.g. the `Household Maison Design System` zip), you **map it onto existing companygraph tokens** or **propose a retune of companygraph token slots** — you never introduce a parallel token namespace or a parallel class system. The `.m-*` Maison classes / `Cormorant` serif in `pwa/styles/maison.css` are a **non-canonical experiment**; the conformance gate treats their leakage into a touched surface as a failure unless the user explicitly waives it for an allowlisted scoped container.
2. **Gated per surface.** Plan the whole drop once, then apply one surface at a time. Each surface passes the deterministic conformance gate, then stops at a human review gate (Storybook deep link + `/review-ui` scorecard + design-vs-screenshot) before its merge. Never batch-apply.
3. **The review gate is never self-approved.** Inherit the `/component` rule verbatim (see Global rules).

## Reference

- **Pattern doc:** [.claude/patterns/design-apply.md](../../patterns/design-apply.md) — the ingest → map → reconcile → apply → conformance → review contract, decision tables, anti-patterns. **Read first.**
- **Canonical DS:** [.claude/stitch/design-system.yaml](../../stitch/design-system.yaml) → `pwa/src/styles/companygraph/tokens.css` (generated; never hand-edit). House style: [.claude/stitch/house-style.md](../../stitch/house-style.md). Component vocabulary: [.claude/stitch/component-vocabulary.md](../../stitch/component-vocabulary.md).
- **Component map:** [design-system.manifest.yaml](../../../design-system.manifest.yaml) — scenario → default component, with Status. The conductor never hand-rolls a shape that has a CATALOG row.
- **Delegated skills:** `/add-pwa-view` (fresh route), `/component new|extend|migrate|extract` (component lifecycle), `/stitch tokens-sync|generate-*` (Stitch + token sync), `/review-ui` (scored audit). The conductor calls these; it does not duplicate them.
- **Conformance checker:** `scripts/design-conformance.ts` (deterministic, manifest-driven). Local mirror test: `pwa/__tests__/design-conformance.test.ts`.
- **State (resumable):** `.claude/design-apply/manifest.json` (per-surface plan + status), `.claude/design-apply/state.json`, run-logs at `.claude/design-apply/runs/<ISO-ts>-<surface>.md`. Schema: `.claude/design-apply/manifest.schema.json`.

## Commands

| Command | Purpose | Mutates |
|---|---|---|
| `/design-apply ingest` | Scan `docs/design/`, classify artifacts, write the design manifest | manifest.json |
| `/design-apply plan` | Resolve each surface → target route/view, decide fresh-vs-migrate, map to catalog components, build the token-reconciliation table; present for one approval | manifest.json |
| `/design-apply apply [surface]` | Apply the next pending surface (or the named one): delegate to the right skill, run the conformance gate, then stop at the human review gate | pwa/*, components, runs/ |
| `/design-apply conformance [surface]` | Run the deterministic gate standalone (no apply) | nothing |
| `/design-apply status` | Read-only: per-surface status table from the manifest | nothing |
| `/design-apply revert <surface>` | Revert just that surface's changes (git checkout of its touched files), mark `reverted` | pwa/* |

## Global rules

These override any "go faster" pressure earlier in the session.

1. **Never self-approve at a review gate.** Verbatim from `/component`: stop and wait for an explicit user response at every human review gate. Do not infer approval from silence, prior context, a "go" earlier in the session, or a dogfood loop. Framework Storybook (`localhost:6006`) is the canonical review surface, not static `storybook.html`. Override requires the user to type "override review gate" in plain text.
2. **Conformance is a hard gate, not advisory.** A surface does **not** reach the human review gate until `scripts/design-conformance.ts` exits 0 for it (or the user has waived a specific finding in writing, recorded in the run-log). No exceptions for "it looks fine".
3. **One surface at a time.** Decision #2 above. Even if the manifest has 12 surfaces, `apply` does exactly one and stops.
4. **Every `apply` writes a run-log, even on failure.** A missing log is worse than a "this failed" log. Mirrors `.claude/stitch/runs/`.
5. **Show before you mutate the design system.** Any token reconciliation that edits `design-system.yaml` goes through `/stitch tokens-sync`'s own Approve→Revise→Cancel gate — print the diff, stop, never silently regenerate `tokens.css`.
6. **No git commit/push/deploy inside this skill.** All commands stop after local file writes + delegated-skill calls. Commits are a separate user step (and follow the worktree convention in `.claude/CLAUDE.md` for non-trivial work).
7. **Empty/skeleton drop → stop.** If `ingest` finds no real design content (e.g. the current `Household Maison Design System.zip` is a 0-byte directory skeleton), report "no design content detected" and stop. Do not invent surfaces.

---

## /design-apply ingest

Goal: turn an unstructured `docs/design/` drop into a typed manifest.

1. **Preflight.** Recursively list `docs/design/` (follow `.zip` — unzip to a temp dir, never into the repo). Classify every file:
   - **design-system source** — palette / type-scale / spacing / token files, font files, a design-system zip, `*.yaml`/`*.json` token sets.
   - **surface design** — an HTML export (Stitch/Figma/hand), a wireframe HTML (e.g. `pwa/docs/*-wireframes.html`), a Stitch screen export, a multi-frame mockup.
   - **reference** — screenshots / PNG / PDF with no extractable structure.
   - If **every** candidate is a 0-byte / directory-only skeleton → apply Global rule 7 and stop.
2. **Detect surfaces.** For each *surface design* artifact, infer the target by name + content: a route hash (`#/wardrobe`), a `pwa/views/<x>.js`, or a free-text feature. One manifest entry per detected surface.
3. **Write the manifest** at `.claude/design-apply/manifest.json` validated against `manifest.schema.json`. Each entry: `id`, `source` (path), `kind` (`surface`|`ds-source`|`reference`), `target` (route/view, or `null` if undecided), `decision` (`fresh`|`migrate`|`unknown`), `catalog_components` (`[]`, filled by `plan`), `status: "pending"`, `touched_files: []`.
4. **Print** the manifest as a table and the next step (`/design-apply plan`). No code changes yet.

## /design-apply plan

Goal: a complete, approvable per-surface plan. One approval for the plan; per-surface approvals still happen at apply time.

For each `kind:"surface"` entry:

1. **Resolve the target.** Grep `pwa/index.html` router + `pwa/views/` for the route/view.
   - Route exists → `decision: "migrate"`, `target` = the existing `pwa/views/<x>.js` (+ its `pwa/styles/<x>.css`).
   - No route → `decision: "fresh"`, target = a new route handed to `/add-pwa-view`.
2. **Map to catalog components.** Diff the design's structural intent against `design-system.manifest.yaml` scenario rows. Fill `catalog_components` with the catalog components each region maps to. Any recurring shape with **no** catalog row → record a `needs_component` flag with the scenario string; that surface's apply step **must** run `/component new <scenario>` first (escalation — never hand-roll a catalog-shaped duplicate).
3. **Token reconciliation (only if a `ds-source` artifact exists).** Build a mapping table: every foreign colour/type/spacing value → the nearest existing companygraph token in `tokens.css`. Where no token is close enough, list it as a **proposed companygraph retune** (a specific `design-system.yaml` slot edit). Do **not** introduce a new `--*` namespace. Output the table into the plan; the retune path runs through `/stitch tokens-sync` at apply time (Global rule 5).
4. **Order surfaces** by blast radius ascending (leaf views before shared chrome; `needs_component` surfaces after the component they depend on).
5. **Present the whole plan** — surfaces, decisions, component maps, token table, order. Header `── Approve → Revise → Cancel ──`. Stop. On approve, persist into `manifest.json`.

## /design-apply apply [surface]

Goal: apply exactly one surface, prove conformance, stop for review.

1. **Pick the surface.** Named arg, else the first `status:"pending"` in manifest order. If a `needs_component` dependency is unmet, switch to that component first.
2. **Delegate** (do not hand-roll):
   - `decision:"fresh"` → run `/add-pwa-view` for the new route; for any `needs_component` scenario run `/component new <scenario>` first and let it complete its own gates.
   - `decision:"migrate"` → run `/component migrate <view> <component>` for each catalog component the design needs (its Gate 0 verifies semantic equivalence), then `/component extract` for any inline pattern that should become shared. Re-skin the view to match the design using **only** `var(--*)` tokens and CATALOG components — no literals, no `.m-*`.
   - Stitch in the loop only if `.claude/patterns/stitch-when-to-use.md` matches; if so, `/stitch generate-*` with its own preview gate.
3. **Conformance gate (hard).** Run `bun run scripts/design-conformance.ts --surface <id>`. It checks the surface's touched files for: zero hex/`rgba(` literals; zero foreign-DS leakage (`.m-` classes / `Cormorant` outside allowlist); every `var(--*)` resolves to a name in `tokens.css`; CATALOG/vocabulary drift. **Non-zero exit → do not proceed.** Fix and re-run, or record an explicit user waiver of the named finding in the run-log. (Global rule 2.)
4. **Human review gate.** Only after conformance is green:
   - Hand the user the framework-Storybook deep link for any new/changed component (`/component` produces these).
   - Run `/review-ui <surface>` and surface its scorecard.
   - Present design-vs-implementation: the source artifact next to a fresh Playwright screenshot of the surface.
   - Header `── Approve → Revise (cap 3 rounds) → Reject ──`. Stop. (Global rule 1.)
5. **Resolve.** Approve → `status:"reviewed"`, write run-log, print next pending surface. Revise → loop (max 3 rounds, matching spec-workflow review-cap). Reject → `/design-apply revert <surface>`, run-log the reason, stop.
6. **Run-log** `.claude/design-apply/runs/<ISO-ts>-<surface>.md`: source artifact, fresh/migrate decision, delegated skills + their outcomes, conformance result (or waiver), review outcome, `touched_files`. Always written (Global rule 4).

## /design-apply conformance [surface]

Standalone gate. Runs `scripts/design-conformance.ts` over the named surface (or every non-`pending` surface in the manifest, or — with `--view <path>` — an ad-hoc file). Prints the findings table. Mutates nothing. Use this to spot-check before/after a manual edit.

## /design-apply status

Read-only. Prints the manifest as: `id · kind · target · decision · status · #touched_files`, plus a one-line "next action" (the first `pending` surface, or "all reviewed — user to commit").

## /design-apply revert \<surface\>

`git checkout --` the surface's `touched_files` (from the manifest), mark `status:"reverted"`, append a run-log entry. Never touches other surfaces' files (the worktree convention keeps indexes separate; this only un-edits the listed paths).

---

## Anti-patterns (the conductor must refuse these)

- **Parallel token namespace.** Adding `--surface-bg` / `--ink-1` / a `maison.css`-style sheet for a drop. Map onto companygraph tokens or propose a YAML retune — never both systems live.
- **Hand-rolled catalog duplicate.** Writing markup that re-implements a CATALOG row because "it's faster than `/component migrate`". Conformance flags it; the gate is hard.
- **Ungated batch.** Applying >1 surface per `apply`, or skipping the review gate because "they all use the same pattern". Decision #2 is non-negotiable.
- **Self-approved review.** Treating Storybook-rendered-fine or a green conformance run as user approval. Conformance green is necessary, not sufficient — a human still reviews.
- **Editing `tokens.css` by hand.** It is generated. Edit `design-system.yaml` and go through `/stitch tokens-sync`.
- **Inventing surfaces from an empty drop.** Global rule 7.
