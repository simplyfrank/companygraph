# UI/UX Design Review

Comprehensive, opinionated audit of one PWA view's visual design and interaction quality, scored against named industry-leading references. Read-only on source. Produces a single scorecard report.

## Usage

- `/review-ui <view>` — full audit. `<view>` is a route hash (`#/inbox`), a view file (`pwa/views/inbox.js`), or a free-text feature name.
- `/review-ui <view> --url <url>` — explicit URL to screenshot (defaults to `https://app.frankwinkler.me/<route>`).
- `/review-ui <view> --pillar <pillar>` — single-pillar drill-down.
- `/review-ui <view> --against <refs>` — score against a custom reference set (comma-separated).
- `/review-ui <view> --quick` — top-3 findings only.

Pillar shorthands: `hierarchy` `rhythm` `color` `typography` `density` `states` `motion` `input` `microcopy` `cohesion`.

Default reference systems (override with `--against`):
- **Linear** — information density, keyboard-first, command palette discipline
- **Stripe** — data clarity, dashboard density, financial-grade trust signals
- **Vercel** — empty/loading/error states, motion polish, dark-mode coherence
- **Apple HIG** — touch targets, system-native feel, accessibility defaults

## Canonical reference

The "industry leading" rubric in this skill is **opinionated and subjective**. It reflects what teams shipping at Linear, Stripe, Vercel, Apple, Notion, Arc, and Figma converge on. It is NOT a generic accessibility checklist (WCAG is a *floor*, not the bar). Findings should reference named systems by example, not abstract principles.

The codebase's PWA contract:
- **`.claude/patterns/pwa-view.md`** — vanilla JS, no build step, classic script tag. Constrains *implementation*, not aesthetics.
- **`pwa/index.html`** — app shell, design tokens (CSS variables for color/spacing/type), tab bar, settings sheet. The token system is where most cohesion findings live.
- **`pwa/views/<view>.js`** — the view under review.
- **Other views** in `pwa/views/` are the *internal* reference set — cohesion findings cite them directly ("the inbox uses 12px row gap, this view uses 8px and 16px both — pick one").

## Execution protocol

### Phase 1 — Map the footprint + capture screenshots (parallel)

Discover what composes the view, then render it.

**Source map** (use Glob/Grep):
- `pwa/views/<feature>*.js` — the view module
- `pwa/components/*.js` — shared components it imports
- `pwa/index.html` — design tokens it inherits (CSS variables)
- `pwa/sw.js` — precache version (just for context)
- Related routes touched (does this view share state with another?)

**Screenshot capture** — use Bash + Playwright via npx. Required because the rubric scores rendered output, not source code.

```bash
# Dependencies: npx playwright install chromium  (one-time)
SHOTS_DIR="/tmp/ui-review-<feature>-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SHOTS_DIR"

# Default URL: https://app.frankwinkler.me/<route>  (override with --url)
# Required auth: skill prompts the user for a JWT in localStorage if the route is gated.
URL="${URL:-https://app.frankwinkler.me/#/<route>}"

# Capture at 3 viewports × N states (empty, loading, populated, error if reachable).
# Use --device flag for mobile/tablet emulation.
npx playwright screenshot --viewport-size=375,812 "$URL" "$SHOTS_DIR/mobile.png"
npx playwright screenshot --viewport-size=820,1180 "$URL" "$SHOTS_DIR/tablet.png"
npx playwright screenshot --viewport-size=1440,900 "$URL" "$SHOTS_DIR/desktop.png"
```

**Fallback when Playwright is not viable** (laptop offline, route gated, or capture errors): instruct the user to attach screenshots inline. Skill must NOT fabricate visual findings from source alone — call this out in the report and degrade to a structural-only review.

After capture, the agent reads each PNG via the multimodal `Read` tool. **The screenshots are the primary evidence for findings 1–8 below.** Source code is the evidence for findings 9–10 (microcopy, cohesion).

### Phase 2 — Score against the 10 pillars

For each pillar, mark **✅ pass / ⚠️ partial / ❌ fail / N/A**, with a one-line justification, file:line where applicable, and a screenshot reference (`mobile.png:hero` or `desktop.png:row-3`).

**Severity per finding:** `CRITICAL` (broken or unusable), `HIGH` (visibly cheap, costs trust), `MEDIUM` (inconsistent, future-debt), `LOW` (nit), `INFO` (note).

#### 1. Visual hierarchy
- [ ] Is there a single dominant element on first viewport? (Linear's inbox: one thing draws the eye.)
- [ ] Do font weight, size, color, and position agree on the same hierarchy? (Mismatch → "everything is shouting".)
- [ ] Are secondary actions visually demoted vs primary? (Stripe: ghost vs filled buttons, never two filled.)
- [ ] Does scanning a row reveal the most important field first? (Tabular data: lead with the noun, not the metadata.)

#### 2. Spacing & rhythm
- [ ] Is the spacing scale consistent? (4 / 8 / 12 / 16 / 24 / 32 — pick one base. Apple HIG = 8pt grid.)
- [ ] Vertical rhythm: do related items sit closer than unrelated? (Gestalt proximity — the #1 readability hack.)
- [ ] Card padding consistent across siblings? (Mixing 12px and 16px reads as drift, not difference.)
- [ ] Is whitespace earned or accidental? Whitespace should *separate concepts*, not appear because nobody decided.

#### 3. Color & contrast
- [ ] Token discipline: every color comes from `--color-*` CSS variables in `pwa/index.html`, not inline hex.
- [ ] Contrast: WCAG AA (4.5:1) is a floor. Pull primary text contrast > 7:1. Disabled states: still readable, just not active.
- [ ] Semantic palette: success/warning/error consistent across views. (`#16a34a` everywhere or `--color-success`, never both.)
- [ ] Dark mode parity (if app supports it): every contrast pair revalidated in both themes.

#### 4. Typography
- [ ] One sans for UI, optionally one serif for editorial moments — never three.
- [ ] Type scale: 12 / 14 / 16 / 20 / 28 / 36 max. Skipping a step is fine; inventing one is not.
- [ ] Line-height: 1.4–1.5 for body, 1.1–1.2 for headings. Never 1.0 on multi-line.
- [ ] Numbers in tables: tabular-nums (`font-variant-numeric: tabular-nums`). Non-tabular numbers in financial UI is a tell.

#### 5. Density & layout
- [ ] Is information density right for the task? (Inbox = high; settings = medium; first-run = low.) Linear = aggressively dense; Notion = airy; pick deliberately.
- [ ] Alignment: every element on a column edge. Centered + left-aligned in the same view = drift.
- [ ] Grid evidence: card grids snap to a column count, don't wrap orphan cards.
- [ ] Mobile reflow: does the desktop grid degrade gracefully or just stack into one column unpolished?

#### 6. State coverage
- [ ] **Empty state**: not just "no data" — guidance, illustration, or primary CTA. (Vercel: empty states are recruitment for the feature.)
- [ ] **Loading state**: skeleton screens, not spinners, for predictable content shapes. Spinners only for unpredictable wait.
- [ ] **Error state**: typed error → renderable card with retry/recover action, not a raw error string.
- [ ] **Partial state**: 0 of 12 found, 3 of 12 loaded — communicated, not silently truncated.
- [ ] **Populated edge**: 1 item vs 100 items — both look intentional.

#### 7. Motion & micro-interactions
- [ ] Transitions: 150–250ms, ease-out. Anything >300ms feels laggy; anything linear feels mechanical.
- [ ] Affordances: buttons have hover, press, focus, disabled — all four. Most cheap apps skip press + focus.
- [ ] Optimistic UI: actions confirm instantly even when the server roundtrip is pending.
- [ ] No motion that doesn't carry information. Decoration-motion is noise.
- [ ] `prefers-reduced-motion` respected.

#### 8. Touch & input
- [ ] Touch targets ≥ 44pt (Apple HIG). PWA icons that are 24px with no padding are a fail.
- [ ] Focus ring visible and styled (not browser default `outline: auto`). Tab through every interactive element — does keyboard navigation work?
- [ ] Hover: desktop only. Don't gate features behind hover.
- [ ] Input: type=email/tel/url where appropriate (mobile keyboard).
- [ ] Submit on Enter; Esc to close modals. Both reflexive.

#### 9. Microcopy & content
- [ ] Buttons: verbs, not nouns. "Save changes" not "OK". "Delete forever" not "Confirm".
- [ ] Empty/error microcopy: actionable. "No tasks yet — create one to get started" beats "No data".
- [ ] Time/date formatting: relative ("2h ago") for recent, absolute for old. Never a raw ISO string.
- [ ] Numbers: localized commas/decimals; currency symbols inline or aligned.
- [ ] Status labels: plain language. "Failed" beats "ERR_TIMEOUT_3"; the technical id can live in a tooltip.

#### 10. Cohesion (with the rest of this PWA)
- [ ] Does this view feel like the same app as `#/inbox`, `#/finance`, `#/chat`? Cite the specific other view that does it best, then list deltas.
- [ ] Component reuse: is it using `pwa/components/card.js` or rolling its own? Rolling-its-own = future drift.
- [ ] Does it inherit the design tokens from `pwa/index.html`? Inline colors / spacing = future drift.
- [ ] Tab bar / header / settings sheet shape consistent with other views?
- [ ] If it deviates from the rest of the PWA, is the deviation *intentional and justified*, or accidental?

### Phase 3 — Reference comparison

For each named reference system in the `--against` set (or default 4), produce a 2–3 sentence comparison: "vs Linear, this view is denser/airier; the row affordances are similar but the keyboard shortcut layer is missing." Be specific — name the screen you're comparing to ("vs Linear's inbox," "vs Stripe's transactions list").

The goal is to give the user a concrete delta, not "needs more polish." Bad: "less polished than Linear." Good: "Linear's row hover surfaces 4 keyboard shortcuts as ghost icons; this view shows only 'click to open' as a tooltip."

### Phase 4 — Findings, severity-ordered

Group findings into:
- **🔴 Critical** — broken, unusable, or visibly wrong on the first impression. Block ship.
- **🟠 High** — costs trust on first use; visibly cheap.
- **🟡 Medium** — inconsistent, future-debt; users may not notice but the next designer will.
- **🔵 Low / Nit** — refinement opportunities.

Each finding cites:
- **What** — one sentence.
- **Where** — screenshot reference (`mobile.png:hero`) AND file:line for code-side fixes.
- **Why** — what does it cost the user (trust, scannability, accessibility, perceived speed)?
- **Fix** — concrete and Edit-shaped. NOT "use better spacing" — instead `padding: 8px 12px → 12px 16px to match the inbox row pattern at views/inbox.js:147`.

### Phase 5 — Drift signals (cheap meta-checks)

- Inline colors (hex or rgb) inside `pwa/views/<feature>.js` instead of token references — count + sample.
- Inline magic numbers for spacing (`margin: 13px`) instead of multiples of the base scale.
- Repeated style declarations across views that should be a shared component.
- Hard-coded copy strings scattered through render functions (vs. centralized in a single `COPY` const).
- Custom hover/focus styling that diverges from the global rule.

### Phase 6 — Write the report

Single file at `~/.claude-relay/ui-review-<feature>-YYYY-MM-DD.md`:

```
# UI Review: <feature>
Date: <UTC>  |  Reviewer: review-ui  |  Refs: <named systems>

## Footprint
- **View**: pwa/views/<feature>.js (<line count> lines, <last touched>)
- **Components**: <list>
- **Tokens**: inherits from pwa/index.html (color: ✓, spacing: ✓, type: ✓)
- **Sibling views**: closest stylistic kin = `<view>` (cite for cohesion)

## Screenshots
- mobile.png (375×812)
- tablet.png (820×1180)
- desktop.png (1440×900)
- (states captured: empty / loading / populated / error)

## Scorecard
| Pillar | Status | One-line | Severity of worst finding |
|---|---|---|---|
| 1. Visual hierarchy | ⚠️ | hero competes with row affordances | HIGH |
| 2. Spacing & rhythm | ❌ | 4 distinct gap sizes (8/12/14/16) | HIGH |
| 3. Color & contrast | ✅ | tokens consistent, AA met | LOW |
| 4. Typography | ⚠️ | numbers not tabular in finance row | MEDIUM |
| 5. Density & layout | ✅ | grid snaps cleanly | INFO |
| 6. State coverage | ❌ | no empty state; spinner-only loading | CRITICAL |
| 7. Motion & micro-interactions | ⚠️ | hover only, no focus ring on actions | HIGH |
| 8. Touch & input | ✅ | 48pt targets, keyboard nav works | INFO |
| 9. Microcopy & content | ⚠️ | "OK" buttons, raw ISO timestamps | MEDIUM |
| 10. Cohesion | ⚠️ | rolls its own card vs components/card.js | MEDIUM |

## Reference comparison
- **vs Linear** — <2-3 sentences with named screen>
- **vs Stripe** — <…>
- **vs Vercel** — <…>
- **vs Apple HIG** — <…>

## Findings

### 🔴 Critical
- **Empty state is missing entirely** — `desktop.png:viewport`. When no items match the filter, the view shows blank space with no guidance. Fix: render `<EmptyState illustration="..." title="..." cta={...}/>` matching `views/inbox.js:228`.

### 🟠 High
…

### 🟡 Medium
…

### 🔵 Nit
…

## Drift signals
- 7 inline hex colors in views/<feature>.js (lines …)
- 4 distinct gap values where the design system has 3
- …

## Recommended next actions (top 5, ranked by impact ÷ effort)
1. Add empty state — ~30 min, eliminates the CRITICAL.
2. Replace inline hex with --color-* tokens — ~15 min, closes drift.
3. …
```

Print the path of the written report at the end. Do NOT take any actions beyond writing the report.

## Safety rules

- **Read-only on source.** No `Edit`/`Write` against `pwa/`. The only file written is the report under `~/.claude-relay/`.
- **Screenshots are evidence, not decoration.** Every finding under pillars 1–8 must cite a screenshot reference. If Playwright failed, say so and degrade to structural review explicitly — don't fabricate visual findings from source.
- **No inflated severity.** "Critical" means broken or first-impression-cheap. If everything is critical, nothing is.
- **Subjective is OK; vague is not.** "Looks cheap" needs to become "row separator is 1px solid #ddd; Linear uses 1px solid rgb(0 0 0 / 6%); the unattenuated grey reads as cheap on white surfaces."
- **Industry references are anchors, not authority.** Cite specific screens. "Vercel does X" is weak; "Vercel's billing page renders empty as a hero with a 'Add a payment method' primary CTA" is strong.
- **Don't relitigate platform rules.** If the codebase's pwa-view pattern says "no build step, classic script tag," the rubric doesn't grade build choice — only what shipped.

## What this skill is NOT

- Not `/review-feature` — that's architectural. Cite findings here when they overlap, but the lens is different.
- Not a generic WCAG audit — accessibility is one input among ten.
- Not a redesign. The output is *findings + ranked fixes*, not a Figma file.
- Not a substitute for user testing. Heuristics catch obvious failures; user testing catches the surprising ones.

## Acceptance test for the skill itself

A good `/review-ui` run produces a report that:
1. Names a screenshot reference for every visual finding.
2. Cites a specific competitor screen for every reference comparison.
3. Lists at least 3 file:line targets for code-side fixes.
4. Ranks the top 5 actions by impact ÷ effort, not alphabetically.
5. Leaves the user knowing exactly what to change first, in under 200 words of "next actions."
