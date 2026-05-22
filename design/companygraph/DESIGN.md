# companygraph — design system

Extracted from `companygraph-views.html` (the polished HTML/CSS reference
that the spec owner authored before any React code existed). The intent
of this file is to be the **single source** that the Stitch pipeline
reads when generating new screens — every React component eventually
written for `process-explorer-ui` and the four follow-up specs should
look like it came from the same design.

---

## 1. Tone

Calm, dense, software-tool. Linear / Vercel / Stripe-dashboard cousin. No
gradients, no marketing flourishes. **Numbers and counts are
first-class** — graph products are about quantities and relationships, so
tabular numerics and code-font ids appear everywhere.

---

## 2. Colour — OKLCH tokens (light theme baseline)

| Token | Value | Purpose |
|---|---|---|
| `--bg` | `oklch(99% 0.002 240)` | Page background — neutral very-near-white with a hint of cool. |
| `--surface` | `oklch(100% 0 0)` | Card and panel surface. |
| `--surface-2` | `oklch(98% 0.004 250)` | Hover / striping / subnav. |
| `--fg` | `oklch(18% 0.012 250)` | Body text. |
| `--muted` | `oklch(54% 0.012 250)` | Captions, meta. |
| `--muted-2` | `oklch(70% 0.01 250)` | Disabled, secondary. |
| `--border` | `oklch(92% 0.005 250)` | Default border / divider. |
| `--border-strong` | `oklch(86% 0.008 250)` | Hover border. |
| `--accent` | `oklch(58% 0.18 255)` | Primary action, active tab, link. Blue-violet. |
| `--accent-soft` | `oklch(96% 0.025 255)` | Active background tint. |
| `--good` | `oklch(58% 0.16 145)` | Success, SLA-green, connection-ok lamp. |
| `--warn` | `oklch(70% 0.16 75)` | Warning, near-SLA-breach. |
| `--danger` | `oklch(60% 0.22 25)` | Error, breach, delete. |

Use `color-mix(in oklch, …)` for tinted borders + backgrounds (see
`.pill.accent`, `.chain .sla.warn` in the source). No dark theme yet —
process-explorer-ui will add the dark token set as a follow-up.

---

## 3. Typography

Three faces, OS-native stacks (no web fonts — performance and
no-surprises kerning on macOS):

- **Display** (`--font-display`): SF Pro Display / system-ui. For
  headings + brand. `letter-spacing: -0.022em` on h1, `-0.015em` on h2,
  `-0.01em` on h3.
- **Body** (`--font-body`): SF Pro Text / system-ui. 14 px / 1.5 line
  height. `font-variant-numeric: tabular-nums` globally — every number
  in the product aligns.
- **Mono** (`--font-mono`): SF Mono / ui-monospace. 12.5 px default, 10
  – 12 px for pills + small captions. Used for:
    - All ids (`.id`, `td.id`)
    - All keyboard shortcuts (`.kbd`)
    - All section labels (`.sec-label`, uppercase tracking 0.1 em)
    - All numeric cells (`td.num`)
    - Pill text (`.pill`)

Type ramp:

| Class | Size | Weight |
|---|---|---|
| `.h1` | 24 | 600 |
| `.h2` | 17 | 600 |
| `.h3` | 14 | 600 |
| body | 14 | 400 |
| `.lede` | 13.5 | 400, color `--muted`, max-width 64ch |
| `.sec-label` | 10 | uppercase, tracking 0.1em |

---

## 4. Layout primitives

- **Topbar**: 52 px (`--topbar-h`), 1 px bottom border, `backdrop-filter: saturate(180%) blur(8px)` on a 92 %-opacity surface — gives the iOS-style glass effect.
- **Subnav**: 44 px (`--subnav-h`), holds breadcrumb + tabs + search + actions.
- **Rail** (sidebar): 220 px (`--rail-w`).
- **View padding**: `24px 28px 48px` for the default scrollable view; `view-wide` opts out of padding (used by chat, ERD, full-bleed graph canvas).
- **Card**: 6 px radius, 1 px border, no shadow. Use `card-head` (12 16 padding, 1 px bottom divider) + `card-pad` (16 18 padding) for content.

Layout heuristics:

- Two-column views use `1fr 320px` (main + right panel). Collapse to 1fr at < 1080 px.
- Domain grid: `repeat(auto-fill, minmax(280px, 1fr))` — cards shrink to 280 min.
- Tables (`table.t`) are the default tabular UI; alternate striping is via `tr:hover`, not zebra rows.

---

## 5. Component vocabulary

The HTML mockup defined 30+ first-class components. The keystones the
React pipeline must generate first:

1. **Topbar** — brand mark, surface-nav with active state + keyboard hints (`.kbd`), spacer, env pill, stat block, health lamp, user avatar.
2. **Subnav** — crumb + tabs + right-aligned search + action buttons. Tab underline = 2 px `--accent`.
3. **Card** — `.card` + `.card-head` + `.card-pad`. Composable.
4. **Pill** — `.pill` (neutral) + `.accent / .good / .warn / .danger` variants. Use mono font.
5. **Key-value list** — `.kvs` two-column grid; dt is mono uppercase muted, dd is body fg.
6. **Table** — `table.t` with mono header row, hover-row highlight, numeric cells right-aligned, id cells mono and muted.
7. **Domain card** — `.domain-card` (link-wrapped). Title + meta + row-list of counts.
8. **Activity chain** — `.chain` step list. Connector lines + arrowheads drawn with `::before` / `::after`. Each step has number badge, name, sub-caption, SLA chips, transition pill.
9. **SLA chip** — `.sla` + `.warn / .breach / .good` variants. Pulsing dot for breach.
10. **Buttons** — `.btn` + `.primary / .ghost / .danger` variants. Height 28 px.
11. **Grey block** (placeholder) — diagonal-stripe dashed-border block for "graph canvas goes here" / "chart goes here" stubs. Useful as the React component placeholder until the real renderer lands.
12. **Bound list** — left-rail list with coloured glyph squares (executes = green, uses = accent, at = warn). Used in journey view's right panel.

---

## 6. Screen catalogue (27 views from companygraph-views.html)

Mapped to the four follow-up specs:

### Owned by `process-explorer-ui`

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| explorer / domains | Domain grid landing — domain cards with journey + activity counts. | "Domain index card grid for a retail-process graph." |
| explorer / journey | Journey detail — activity chain + bound roles/systems/locations panel. | "Journey detail view with ordered activity chain and bound entities." |
| explorer / graph | Force-directed graph canvas with filter rail. | "Interactive graph canvas, filter rail, hover details." |
| explorer / systems | Systems index + integration map. | "System index with integration relationship table." |
| explorer / path | Path-finding result view. | "Path-finding result between two nodes with hop list." |

### Owned by `chat-interface`

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| chat / thread | Chat thread with graph citations. | "Chat thread, AI response with subgraph citations." |

### Owned by `ontology-manager`

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| ontology / catalog | Entity catalogue. | "Entity-type catalogue with attribute counts." |
| ontology / erd | ERD-style schema canvas. | "ERD-style schema canvas, draggable entity nodes." |
| ontology / editor | Attribute editor for one entity type. | "Attribute editor for a single entity type." |
| ontology / edges | Relation-type editor. | "Relation-type editor, endpoint label matrix." |
| ontology / versions | Schema version history. | "Schema version history with diff selector." |
| ontology / audit | Audit log. | "Schema-change audit log with actor + diff." |

### Owned by `process-explorer-ui` (SME write paths)

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| sme / review | SME review queue. | "SME review queue card list." |
| sme / add | SME add-entity form. | "SME entity-add form with attribute editor." |
| sme / quarterly | Quarterly sign-off dashboard. | "Quarterly sign-off dashboard, per-domain status." |

### Owned by `cto-analytics`

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| analytics / overview | Analytics overview. | "Analytics overview, KPI tile grid." |
| analytics / matrix | Domain ↔ system alignment matrix. | "Domain ↔ system alignment heatmap matrix." |
| analytics / complexity | Complexity scoring view. | "Graph complexity metrics — centrality, modularity, redundancy." |
| analytics / ai | AI optimisation recommendations. | "AI optimisation recommendations list with rationale + accept/reject." |

### Owned by an `api-explorer` follow-on (or process-explorer-ui)

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| api / endpoints | OpenAPI endpoint explorer. | "OpenAPI endpoint explorer with try-it panel." |
| api / errors | Error-code reference. | "Error-code reference table — code, message, examples." |
| api / import | Bulk import wizard. | "Bulk import upload wizard with phase-1/2 result panel." |

### Owned by `cto-analytics` (exec dashboards)

| `data-view` / `data-tab` | Description | Stitch caption |
|---|---|---|
| exec / ops | Ops dashboard. | "Exec ops dashboard — KPI tiles + recent activity feed." |
| exec / finance | Finance dashboard. | "Exec finance dashboard — domain spend breakdown + trend." |
| exec / people | People dashboard. | "Exec people dashboard — role headcount + ownership map." |
| exec / transform | Transformation dashboard. | "Exec transformation dashboard — programme status grid." |
| exec / risk | Risk dashboard. | "Exec risk dashboard — risk register + heatmap." |

---

## 7. Stitch generation parameters

When generating each screen via `mcp__stitch__generate_screen_from_text`,
prefix the caption with the stack constraint so Stitch emits the right
output:

> "React 18 + TypeScript, no Tailwind, vanilla CSS Modules using OKLCH
> tokens declared in `pwa/src/styles/tokens.css` (see DESIGN.md §2).
> Reuse the topbar/subnav/card/pill primitives. Mono font for all ids
> and numbers. <screen-specific caption>"

Variants per screen (use `mcp__stitch__generate_variants`):
- **Desktop default** (≥ 1080 px width).
- **Compact** (≤ 1100 px — topbar collapses meta away per the media query in line 72 of `companygraph-views.html`).
- **iPad portrait** (768 px width, single-column shell).

---

## 8. Out of scope for this design system

- **Dark theme** — add in `process-explorer-ui` with a parallel OKLCH set.
- **Charts** — `companygraph-views.html` uses `grey-block` placeholders;
  pick a charting library (Visx? Recharts? D3 direct?) when
  `cto-analytics` lands.
- **Graph canvas renderer** — Cytoscape.js vs react-flow vs sigma.js vs
  d3-force is a `process-explorer-ui` decision; this design system
  prescribes the surrounding chrome only.
- **Animation** — only the `slaPulse` keyframe is defined here; broader
  motion vocabulary deferred.
