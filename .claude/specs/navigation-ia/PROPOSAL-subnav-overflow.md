# Proposal: Insights subnav overflow — the 19-tab row needs an overflow strategy

**Raised by:** `/review-ui` on the SaaS-operator operator views (2026-07-09)
**Owner to decide:** navigation-ia
**Severity:** HIGH (discoverability) — not broken (tabs are reachable via scroll), but the 5 newest views are effectively invisible on first load.
**Report:** `~/.claude-relay/ui-review-saas-operator-views-2026-07-09.md` (finding H1)

---

## Problem

The `insights` surface now carries **19 tabs**:

```
overview · systems · matrix · complexity · context-alignment · consolidation ·
single-system · critical-paths · ai · exec-summary · finance · people ·
transform · performance   ← 14 pre-existing (analytics + exec "business" group)
functions · metrics · funnels · benchmarks · operator   ← 5 SaaS-operator (added at Phase-C reconciliation)
```

`SubNav` (`pwa/src/components/SubNav.tsx:69-90`) renders every tab inline in a
single flex row with `overflow-x: auto` (`SubNav.module.css:9`). On a 1440px
viewport the row clips after `performance`/`functions`; **metrics · funnels ·
benchmarks · operator fall off the right edge with no overflow affordance** — no
"More" menu, no visible scroll cue. Users can't tell those views exist.

Evidence: `functions-desktop.png:subnav` in the review — only a clipped "Me…"
(Metrics) is visible past the fold.

### Why it happened

The SaaS-operator blueprint originally froze a **dedicated top-level
`#/business` surface** for these 5 views. The concurrent navigation-ia
restructure (`fb43471`) removed `#/business`/`#/exec` as top-level surfaces
(7-surface IA), so Phase-C reconciliation placed the 5 operator views as **tabs
on `#/insights`** (in the existing `business` group). That was the correct
collision-avoiding call at the time, but it pushed an already-crowded 14-tab
surface to 19.

### Constraints (why this needs the nav-ia owner, not a drive-by fix)

- `route-parse.test.ts` pins `insights.groups.length === 3` — a 4th group breaks it.
- `business-routes.test.ts` / `route-parse.test.ts` assert the 7-surface set and forbid a `#/business`/9th surface.
- `SubNav.tsx`, `route.ts`, and those guards are navigation-ia-owned.

---

## Options

### Option A — "More" overflow menu in SubNav  ⭐ recommended (general fix)

Measure the rendered tab-row width (ResizeObserver on the `nav`); tabs that
don't fit collapse into a trailing **`More ▾`** popover, newest-lowest-priority
first. Mirrors Linear/Notion secondary nav.

- **Pros:** fixes discoverability for the *whole* surface (the 14-tab base was already tight), scales to any count, **no `route.ts`/group restructuring**, no guard-test churn.
- **Cons:** real component work — width measurement + a keyboard-accessible popover (roving tabindex, Esc to close, `aria-expanded`).
- **Touches:** `SubNav.tsx` (+ `.module.css`), a new `useOverflowTabs` hook, a `More`-menu unit test. No `route.ts` change.

Sketch:
```tsx
// SubNav: render measured tabs inline, overflow the rest into a popover.
const { visible, overflow, navRef } = useOverflowTabs(orderedTabs); // ResizeObserver
// ...visible.map(tabButton)... then:
{overflow.length > 0 && <MoreMenu tabs={overflow} activeTab={activeTab} onTab={onTab} />}
// MoreMenu: <button aria-haspopup="menu" aria-expanded>More ▾</button> + role="menu" popover,
//   arrow-key roving, Esc closes, click-outside closes. Active tab, if overflowed, pulls to front.
```

### Option B — dedicated "Operator" group + right-edge scroll cue (stopgap)

Add a 4th group `operator` (functions/metrics/funnels/benchmarks/operator) so
the SubNav divider visually clusters them, plus a fade/gradient on the SubNav
right edge signalling "scroll for more".

- **Pros:** small; keeps everything inline.
- **Cons:** still requires horizontal scroll to reach them (discoverability only partly solved); **must bump `route-parse.test.ts` `groups` 3→4** (and any sibling assertion).
- **Touches:** `route.ts` (insights groups), `SubNav.module.css` (edge fade), `route-parse.test.ts`.

### Option C — restore a dedicated operator surface (most principled IA)

Re-introduce a top-level surface (e.g. `#/operator`, or the blueprint's original
`#/business`) holding the 5 operator views, reversing that slice of the Phase-C
reconciliation. This is the shape the SaaS-operator blueprint originally
intended (a distinct "Business Operations" surface) and keeps `#/insights`
analytics-only.

- **Pros:** cleanest long-term IA; `#/insights` stops growing; the operator cockpit gets a home that matches its distinct product intent.
- **Cons:** largest change — new `SURFACES` entry, update `route-parse`/`business-routes` guards (they currently assert the 7-surface set + forbid `#/business`), add `ROUTE_ALIASES` (`#/insights/{functions,metrics,funnels,benchmarks,operator}` → new surface, and keep the current ones as aliases so deep links survive). Reverses a deliberate nav-ia decision.

---

## Recommendation

**Option A** as the immediate fix — it solves the real problem (an overloaded
`insights` surface, not just the 5 new tabs) without touching `route.ts` or the
IA guards, so it won't collide with navigation-ia's structure. If the nav-ia
owner wants the cleaner long-term IA, **Option C** is the principled shape and
matches the SaaS-operator blueprint's original `#/business` surface intent;
Option A and C compose (ship A now, C later).

Whatever is chosen, the SaaS-operator side is done and route strings are stable
(`#/insights/{functions,metrics,funnels,benchmarks,operator}` + the
`#/exec/operator → #/insights/operator` alias); only the *presentation* of the
tab row is in question here.
