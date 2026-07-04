# Application Spec Orchestration (`/spec-app`)

`/spec new` plans **one feature**. `/spec-app` plans a **whole application** (or a
large new subsystem): it decomposes an initial prompt into many features, then
fans them out so each is specced through requirements → design → tasks **in
parallel** by companygraph's *existing* spec automation — the same
`spec-workflow` (author) + `spec-review` (reviewer) conventions, the same
`STATUS.md`, the same artifacts under `.claude/specs/<slug>/`.

This is the layer **above** `/spec`. It reuses companygraph's infra; it does not
introduce a parallel spec system. Read `.claude/skills/spec-workflow/SKILL.md`
and `.claude/skills/spec-review/SKILL.md` first — this skill drives them.

> Ported from `docorg/.claude/skills/spec-app`, rewired to companygraph: the
> fan-out agents are companygraph's own agent types (`.claude/agents/spec-author.md`,
> `spec-reviewer.md`, `spec-architect.md`) — thin role wrappers around
> companygraph's own spec skills, not imports of docorg's spec system. The
> `spec-reviewer` agent has no Edit tool, so a reviewer can never modify the
> artifact it judges. The size/review-cap/STATUS rules are companygraph's.

## When to use this

- The user describes an entire application/product (or a large multi-feature
  subsystem) and wants it planned end-to-end.
- The user types `/spec-app <app description>`.
- A single `/spec new` would produce one giant, unparallelizable spec.

For a single feature, use `/spec new <feature>` instead.

## Modes

- **Plan mode (default)** — Phases A→C below. Stops when the app is
  planning-complete; implementation is a separate, user-triggered step.
- **Single-shot mode** — `/spec-app --single-shot <app>` (or the user asks to
  "single-shot" / "one-shot" the app). Same Phase A discussion-driven
  decomposition and the SAME human gate on the blueprint — but after that one
  approval, the fan-out specs **and implements** every feature end-to-end with
  no further interactive gates: launch the workflow with `implement: true`.
  During the run, deterministic gates replace interactive ones — the spec
  Write/Edit hooks, the 2-pass review cap, `bun run typecheck`, `bun test`, and
  `scripts/design-conformance.ts` on every touched PWA view. Phase C becomes
  the single consolidated checkpoint: spec verdicts + build/test/conformance
  results per feature. Human UI review (`/review-ui`, design-vs-screenshot per
  `design-apply`) is **deferred to after Phase C, not skipped** — offer it in
  the report. Because everything downstream runs autonomously, the Phase A gate
  carries the full weight: do not launch single-shot while the blueprint still
  has an open question, a missing View Tree, or unsettled UX-* allowances.

## Layout produced

```
.claude/specs/
├── blueprint.md             # app-level decomposition + dependency graph (this skill)
├── <foundation-slug>/       # each a full /spec output, planned first
│   ├── requirements.md … review-*.md … tasks.md … STATUS.md
├── <feature-slug>/          # each a full /spec output, planned in parallel
│   └── …
└── …
```

`blueprint.md` coexists with the existing `.claude/specs/PROJECT-ROLLUP.md`
(the rollup of specs already in this repo). The blueprint is for the *new* app
or subsystem you are decomposing; never re-spec a feature that already has a
directory under `.claude/specs/`.

---

## The workflow

### Phase A — Decompose (you, the orchestrator)

You do the decomposition inline (companygraph's orchestrators author inline and
only fan reviews/builds out to subagents). For a heavy research lift you MAY
dispatch the `spec-architect` agent (`.claude/agents/spec-architect.md`), but the deliverable is the
same either way.

1. **Research.** Grep/Glob/Read the codebase for conventions, existing features,
   and reusable pieces. Read `.claude/CLAUDE.md` (architecture + house rules) and
   `.claude/specs/PROJECT-ROLLUP.md` (what's already specced — do not duplicate).
   WebSearch/WebFetch for external/domain facts when the app is greenfield.
2. **Carve along stable, low-coupling seams** (see `templates/blueprint.md`):
   - 4–12 features for a typical app. Each independently valuable and testable.
   - Two features that must edit the same files the same way = one feature, or a
     shared **foundation** feature they both depend on.
   - Tag each feature: `slug`, `name`, `tier` (`foundation` | `feature`),
     `priority` (`must`/`should`/`could`), `depends_on` (slugs), `scope` (one
     line), and an estimated `size` (`small`/`medium`/`large` — drives whether the
     fan-out reviews that spec; see size rules below).
   - Pull shared choices up to **Cross-Cutting Decisions** (`XD-*`) so individual
     specs don't re-decide them. companygraph's house rules (en-US identifiers,
     zod-only, no tsc, loopback binding, auth via the central router gate +
     `api/src/auth/`, REST under `/api/v1/`) are already law — restate the
     app-specific ones (data store, UI surface, etc.).
3. **Draft the View Tree + UI/UX Allowances** (any app with a UI). Propose the
   canonical route/view hierarchy — every view, its route, its owning feature
   slug, its nav surface — and the global `UX-*` allowance table (view states,
   design-system binding, input modes, responsiveness, a11y). These are
   blueprint-level law: feature specs consume them verbatim and never invent or
   rename a route. If wireframes/mocks exist (`design/`,
   `design-system.manifest.yaml`), the tree and component vocabulary come from
   there — reconcile, don't re-imagine.
4. **Write `.claude/specs/blueprint.md`** from `templates/blueprint.md`: summary,
   architecture, view tree, UI/UX allowances, cross-cutting decisions, feature
   inventory table, dependency graph, build order, risks, open questions.
5. **Discussion loop — settle everything incrementally.** Requirements are
   elicited through conversation, not guessed in one pass. Run `AskUserQuestion`
   in themed rounds (≤4 questions each), updating the draft blueprint after
   every round, until no open question remains:
   - Round 1 — product scope: who it's for, must/should/could cut lines, what's
     explicitly out.
   - Round 2 — UI surface: walk the user through the proposed View Tree
     (present it, ask what's missing/wrong), then the UX-* allowances
     (states, breakpoints, a11y bar, input modes).
   - Round 3 — technical: framework, hosting, data store, integration points —
     the XD-* rows.
   - Further rounds as answers open new questions. Record each chosen option
     (and rejected ones, briefly) in the blueprint as you go.
6. **Present the blueprint** — feature inventory, dependency graph, build order —
   and the rough cost ("this will run ~N feature pipelines, M agents"). **GATE:**
   the user must approve the decomposition before any feature is specced. This is
   the single most important human checkpoint; a wrong decomposition multiplies
   downstream.

### Phase B — Fan out (parallel spec pipelines)

Once the decomposition is approved, drive every feature through the spec pipeline
in parallel via the **Workflow engine**. This skill authorizes calling the
`Workflow` tool.

**Inline the feature list into the script body and launch via the `script`
parameter** — do **not** rely on `Workflow({ name: "spec-app", args })`. The
named-workflow path does not reliably propagate `args` to the script's `args`
global in this harness (the run fails immediately with the empty-`features`
error), and workflow scripts have no filesystem access to read the list back. So
read `.claude/workflows/spec-app.js`, replace the `app`/`features` consts with the
architect's real values, and pass the whole thing as `script`:

```
Workflow({ script: "export const meta = {...}\nconst app = '<app-slug>'\nconst features = [ …list… ]\n…rest of spec-app.js…" })
```

(If you prefer, `Workflow({ scriptPath: ".claude/workflows/spec-app.js", args: { app, features } })`
works when `args` propagation is reliable; verify it didn't die in the first
seconds with `args.features must be a non-empty array` — that means the data
didn't reach the script, so fall back to inlining.)

The script, per feature, runs an author→review→revise loop for requirements,
then design, then tasks — authoring via the `spec-author` agent and reviewing
via the `spec-reviewer` agent (no Edit tool), both following companygraph's
`spec-workflow`/`spec-review` SKILLs. It:

- **pipelines** features (one can reach Design while another is in Requirements),
- plans the **foundation tier first** (a barrier) then the rest in parallel,
- orders each tier into **dependency waves** (a dep is fully specced before its
  dependents start),
- honours companygraph's **size rules** — small specs skip design and skip all
  reviews; medium reviews requirements + design (not tasks); large reviews all
  three,
- honours the **2-pass review cap** (1 initial review + at most 1 re-review),
- lets the spec Write/Edit **hooks** (`spec-gate-check`, `spec-traceability-check`,
  `spec-guard`, `spec-completion-check`) gate every artifact, since the agents
  run in-repo,
- in **single-shot mode** (`implement: true` inlined next to `app`/`features`),
  adds an **Execute** stage per feature: once a feature's tasks are done, an
  implementer agent executes them (spec-workflow Phase 5), gated by
  `bun run typecheck`, `bun test`, and `scripts/design-conformance.ts` on
  touched PWA views, and closes STATUS.md with `verified_at` +
  `verification_artifact`. Execution stays inside the dependency waves, so a
  dependent feature starts only after its deps are specced AND built. In-wave
  parallel builds are safe only because of the "one feature owns a file"
  decomposition rule — if two specs' designs claim the same file, fix the
  decomposition before launching.

**Autonomous reviews replace the per-phase human gates here.** During a parallel
fan-out there are too many phases across too many features to gate each one
interactively, so the `spec-review` verdict is the gate: `revise` loops the
author (capped at 2 passes), `approve` advances. The human gates live at the app
level — the decomposition approval (Phase A) and the final consolidated approval
(Phase C). This is consistent with companygraph's "never self-approve at a review
gate" rule because the **reviewer is a separate fresh agent**, never the author.

If the workflow engine is unavailable, fall back to dispatching the per-feature
pipelines with parallel `Agent` calls (foundation tier first, then the rest
concurrently), each agent told to follow `.claude/skills/spec-workflow/SKILL.md`,
with a separate fresh `spec-reviewer` agent per phase following
`.claude/skills/spec-review/SKILL.md`.

### Phase C — Consolidate & report

1. When the fan-out completes, read each feature's `STATUS.md` + `review-*.md`
   and the workflow's returned summary (`planned`, `needsAttention`). Build a
   consolidated status table: per feature → requirements / design / tasks verdict
   + any unresolved blockers.
2. **Cross-spec consistency pass.** Check the parallel specs didn't drift apart:
   no two features claim ownership of the same files in conflicting ways; shared
   foundation interfaces are used consistently; cross-cutting decisions (`XD-*`)
   are honoured everywhere; every route/view a spec names appears **verbatim in
   the blueprint View Tree** and each UI spec's ACs cover the `UX-*` allowances;
   `depends_on` edges are reflected in the dependent specs' designs. Flag
   conflicts; dispatch a `spec-author` agent to reconcile where
   needed.
3. Surface every feature that still has open questions, a `revise`, or a `reject`
   the loop couldn't clear — these need the user.
4. **Refresh `.claude/specs/PROJECT-ROLLUP.md`** so the new specs join the repo's
   rollup.
5. Present the full picture. **GATE:** the user approves the overall plan.

### After approval

**Plan mode:** the application is planning-complete: a blueprint plus one
implementation-ready spec per feature. Offer to begin implementation in
dependency order (foundation first, then parallel features — each can be handed
to `/spec continue <slug>`, an implementation pass, or a worktree), or stop and
leave the plan for the team. Do not write application code until the user
approves the consolidated plan.

**Single-shot mode:** the code already exists — Phase C reports what was built
and what each deterministic gate said. Close the loop: run the app-level checks
yourself (`bun run typecheck`, `bun test`) to confirm the features compose, list
every feature whose execution came back `blocked` or with failing gates, and
offer the deferred human UI review (`/review-ui` per surface, design-vs-
screenshot per `design-apply`). The blueprint approval in Phase A was the
authorization to write code; the Phase C report is where the user judges the
result.

---

## Operating rules

- **Decomposition is the leverage point.** Spend real effort (and a real user
  gate) getting the feature seams right. Everything downstream inherits them.
- **One feature owns a file.** If two features need to edit the same file the same
  way, that's a foundation feature they both depend on — fix the decomposition,
  don't let two parallel specs fight over it.
- **Cross-cutting decisions are app-level law.** Stack, hosting, auth, data store,
  conventions live in `blueprint.md`; companygraph's own house rules (CLAUDE.md)
  bind every feature spec. Don't let a feature spec silently re-decide them.
- **The View Tree and UX-\* allowances are law too.** A feature spec takes its
  routes and view names from the blueprint's View Tree verbatim and satisfies
  every UX-* allowance in its ACs. Parallel specs inventing their own routes is
  the top consolidation conflict (process-explorer-ui spent two revisions on
  pure route renames) — Phase C must diff every spec's routes against the tree.
- **Single-shot shifts trust to the deterministic gates.** Only offer/accept
  single-shot when the blueprint has zero open questions; the hooks, typecheck,
  tests, and design-conformance script are the only gates until Phase C.
- **Foundation before parallel.** Plan shared scaffolding first so dependent
  specs reference real interfaces, not guesses.
- **Reviews gate the fan-out; humans gate the app.** Per-feature review loops run
  autonomously (fresh reviewer ≠ author); the user gates the decomposition and
  the final plan. Reviewer and author are always separate agents.
- **Reuse, don't fork.** The fan-out agents follow companygraph's spec skills and
  produce companygraph artifacts (STATUS.md, review-<phase>.md). Never spin up a
  second, divergent spec format.
- **Resume gracefully.** If `blueprint.md` and some specs already exist, re-read
  them and only run pipelines for missing/incomplete features.
- **Be honest about scale.** A genuinely large app means many agents and real
  token cost. Tell the user roughly how many feature pipelines will run before
  launching the fan-out.

## Reference

| Resource | Location |
|----------|----------|
| Blueprint template | `.claude/skills/spec-app/templates/blueprint.md` |
| Fan-out workflow | `.claude/workflows/spec-app.js` |
| Single-feature orchestrator (authoring conventions) | `.claude/skills/spec-workflow/SKILL.md` |
| Reviewer conventions | `.claude/skills/spec-review/SKILL.md` |
| Existing-spec rollup | `.claude/specs/PROJECT-ROLLUP.md` |
| Architecture + house rules | `.claude/CLAUDE.md` |
