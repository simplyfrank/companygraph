# Stitch — When To Use (and When Not To)

**When to use:** Before any UI work, decide whether Stitch is in the loop. This pattern is the canonical decision tree.
**Canonical artifacts:** `.claude/stitch/` (briefs, prompts, vocabulary, design-system).
**Related:** [pwa-component.md](pwa-component.md), [pwa-view.md](pwa-view.md), `.claude/specs/stitch-integration/requirements.md`.

## Why this exists

Stitch produces visual quality the codebase's hand-rolled UI can't match — but every Stitch call costs context-engineering time, and uncritical use generates drift and noise. The rule of thumb: **call Stitch when the visual is the work; skip it when the visual is incidental**.

## Decision tree

```
Is the change visible to the user?
├── No (refactor, infra, types) ─────────────────────────► SKIP Stitch
└── Yes
    │
    Is the change about layout / chrome / density / new component shape?
    ├── No (copy, behavior, data, bugfix, a11y label, perf) ► SKIP Stitch
    └── Yes
        │
        Is there an existing Stitch screen / component for this scenario?
        ├── No  ─► CALL Stitch (generate-shell|section|page|component)
        └── Yes
            │
            Is the existing one good enough?
            ├── Yes ─► SKIP Stitch (use existing as `--from-stitch` ref)
            └── No  ─► CALL Stitch (generate_variants from the existing screen)
```

## Triggers — call Stitch

| Trigger | Stitch call | Notes |
|---|---|---|
| **New view / page from scratch** | `mcp__stitch__generate_screen_from_text` via `/stitch generate-page` | Layout invention is where Stitch shines |
| **Redesign / polish pass** on an existing view | `mcp__stitch__generate_variants` from the current Stitch screen | Tightens visual quality, A/B explores |
| **New shell or main-nav change** (rare) | `/stitch generate-shell` | Treat as a one-shot every 6+ months unless scope changes |
| **New section** (new life-domain or sub-nav redesign) | `/stitch generate-section <domain>` | Always references existing shell |
| **New design component** (e.g. a chart, a stepper, a hero-stat block) | `mcp__stitch__generate_screen_from_text` with a single-component prompt + `generate_variants` | Add result to `component-vocabulary.md` |
| **Token / design-system change** | `mcp__stitch__update_design_system` from `design-system.yaml`, then spot-regenerate one canonical view | Catches whether the token change degrades anything |
| **Spec calls for "polished" / "delightful" / "high-fidelity" UI** | Whichever level matches | The keyword in the spec is the trigger |

## Skip — do NOT call Stitch

| Situation | Why skip |
|---|---|
| Copy / label / placeholder text change | No visual structure changes; edit the view directly |
| Behavior / interaction logic change (e.g. event handlers, validation) | Code-only |
| Bugfix where the broken layout already has a good design | The fix is mechanical |
| Backend / API / data shape change | Visual usually unaffected; if it is, that's a separate Stitch trigger |
| Accessibility-only changes (aria labels, focus order, keyboard navigation) | Token-driven, no redesign needed |
| Adding a new field/column to an existing component or list | Use the existing component's API; if it doesn't support, that's a `/component extend` decision (which may or may not need Stitch) |
| Removing dead UI / cleanup | No design needed |
| Performance / latency tuning | Code-only |
| Refactoring the JS file structure of a view | Visuals unchanged |
| One-off internal admin screen seen by ≤2 people | Use `/component` primitives directly; not worth a Stitch loop |

## Required (acceptance checklist)

Before a PR that touches UI is approved, the author confirms:

- [ ] The trigger above was identified explicitly (the relevant row referenced).
- [ ] If Stitch was called, the run was logged in `.claude/stitch/runs/<timestamp>-*.md` with prompt + screen ID.
- [ ] If Stitch was called, every visible component in the result either matches a row in `.claude/stitch/component-vocabulary.md` or is flagged in the file's "Stitch's invented name" table for review.
- [ ] If Stitch was skipped despite a visible change, one line in the PR description states why (matches a Skip row).
- [ ] If the change is a redesign of an existing view, `/component migrate --from-stitch <screen-id>` was used (or explicitly justified as not applicable).

## Anti-patterns

- **"It's a small visual tweak, I'll just hand-author it"** for something that fits a Trigger row → drift compounds across views; the system gets visually inconsistent. Use the existing Stitch reference as the target.
- **Calling Stitch for behavior-only changes** ("the button should debounce") → wastes a generation, dilutes the run-log signal. Behavior is code, not design.
- **Generating a new view without referencing the shell screen** → Stitch will redesign the chrome and your output won't compose. Always pass `<<SHELL_REF>>` per the prompt template.
- **Editing prompts inline in `/stitch` skill code** instead of in `.claude/stitch/*.md` → the iteration story dies; lessons can't compound. Prompts MUST be markdown artifacts.
- **Letting Stitch invent component names without recording them** → vocabulary drift. Either add the new row (if reusable) or hand-translate into existing primitives.
- **Calling Stitch repeatedly without changing the brief or prompt** → noise. If two consecutive runs produce equivalent output, the next iteration MUST edit `house-style.md` or the relevant brief first.
- **Treating a Stitch screen as the literal target** → Stitch outputs are fast-fashion; the canonical implementation lives in `pwa/components/` + `pwa/views/`. Stitch is a *specification*, not a deliverable.
- **Skipping `tokens-sync` after a `design-system.yaml` change** → Stitch and PWA drift apart visually; same nominal token resolves differently.

## Extending

Discovered a triggering scenario that doesn't fit the table above? Add a row to **Triggers** (or **Skip**) with: scenario · the right Stitch call (or "skip") · one-line note. Don't reword existing rows — append. The table is the agent-facing contract; rewriting in place breaks the trail.

If a triggering category becomes load-bearing enough to warrant its own pattern doc (e.g. `stitch-redesign-loop.md`), spin it out and link from here.

## Iteration loop reference

Every Stitch call produces a run-log entry. The accompanying `/review-ui --target stitch:<id>` cycle ends with prompt-edit suggestions. Capture the lesson in:

- `house-style.md` — when the rule is global (e.g. "no hero images on Overview pages").
- The relevant `briefs/<artifact>.md` — when the rule is artifact-specific.
- `component-vocabulary.md` — when the lesson is "Stitch wants a primitive we don't have".
- This file — when the lesson is about **when to call** vs not.
