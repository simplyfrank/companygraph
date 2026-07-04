# Blueprint: <Application Name>

## Status: draft
## Author: spec-app (decompose pass)
## Created: <YYYY-MM-DD>

---

## Summary

<2–4 sentences: what the application is, who it's for, and the core value. Name
the high-level technical approach.>

---

## App-Level Architecture

<The shape of the whole system: major layers/services and how they fit. A
diagram is ideal.>

```
<system / module diagram>
```

---

## View Tree
<!-- REQUIRED when the app has a UI. The canonical navigation/route hierarchy,
settled WITH THE USER during the Phase A discussion and frozen at blueprint
approval. Every feature spec takes its routes/view names from this tree
VERBATIM — a feature spec never invents or renames a route (route drift between
parallel specs is the top consolidation conflict; process-explorer-ui burned
two whole revisions on pure route renames). Each view names the one feature
slug that owns it. -->

```
#/                          → AppShell            [owner: <foundation-slug>]
├── #/<area>                → <ListView>          [owner: <slug>]
│   ├── #/<area>/:id        → <DetailView>        [owner: <slug>]
│   └── #/<area>/<sub>      → <SubView>           [owner: <slug>]
└── #/<area2>               → <View>              [owner: <slug>]
```

| Route | View component | Owner (slug) | Nav surface | States specced |
|-------|----------------|--------------|-------------|----------------|
| `#/<area>` | `<ListView>` | `<slug>` | topbar tab / subnav / deep-link only | loading·empty·error·ready |

---

## UI/UX Allowances
<!-- Global UX requirements every UI-touching feature spec INHERITS and must
satisfy (reference them as UX-*; never re-decide them per spec). Settle these
with the user in Phase A. Delete the section only for UI-less subsystems. -->

| ID | Allowance | Requirement |
|----|-----------|-------------|
| UX-01 | View states | Every view specs loading / empty / error / ready states in its ACs |
| UX-02 | Design system | Tokens only (`var(--…)` from `pwa/src/styles/tokens.css`); components from the catalog (`design-system.manifest.yaml` / `DESIGN.md` vocabulary) before inventing new ones; `scripts/design-conformance.ts` must pass on every touched view |
| UX-03 | Input modes | Platforms & Input Modes + Native Conflicts tables required for any gesture/keyboard/pointer work (spec-workflow rule) |
| UX-04 | Responsiveness | Breakpoints + which views must adapt: <list or "desktop-only"> |
| UX-05 | Accessibility | Keyboard reachability, focus order, ARIA landmarks per view |
| UX-06 | Navigation | Routes come from the View Tree verbatim; deep links survive reload; back preserves scroll |

---

## Cross-Cutting Decisions
<!-- Shared choices every feature spec must honour, so individual specs don't
re-decide (and conflict on) them. Stable IDs XD-01…
companygraph's standing house rules are already law (see .claude/CLAUDE.md):
en-US identifiers, zod-only validation, no tsc, 127.0.0.1 loopback binding,
auth via the central router gate + api/src/auth/ (never per-route), all REST
under /api/v1/. Restate only the app-SPECIFIC decisions here. -->

| ID | Decision | Rationale |
|----|----------|-----------|
| XD-01 | <tech stack / language> | <why> |
| XD-02 | <hosting / infra> | <why> |
| XD-03 | <data store> | <why> |
| XD-04 | <UI surface / design system> | <why> |

---

## Feature Inventory
<!-- Each row becomes its own .claude/specs/<slug>/ spec. Foundation features are
specced first; the rest in parallel. `size` drives review depth in the fan-out:
small = no design + no reviews; medium = review requirements + design; large =
review all three. Do NOT list a slug that already exists under .claude/specs/. -->

| Slug | Feature | Tier | Priority | Size | Depends on | Scope |
|------|---------|------|----------|------|-----------|-------|
| `<slug>` | <name> | foundation | must | medium | — | <one line: in / out> |
| `<slug>` | <name> | feature | must/should/could | small/medium/large | `<slug>`, … | <one line> |

---

## Dependency Graph
<!-- Make the build/plan order explicit. Foundation tier resolves first. -->

```
foundation-a ─┬─> feature-x ──> feature-z
              └─> feature-y
infra ────────────────────────> (all)
```

- **Foundation (plan first):** `<slug>`, `<slug>`
- **Parallel tier:** `<slug>`, `<slug>`, `<slug>`

---

## Build Order / Milestones
<!-- Optional. Grouping of features into delivery milestones. -->

| Milestone | Features | Goal |
|-----------|----------|------|
| M1 | `<slug>`, `<slug>` | Walking skeleton |
| M2 | `<slug>`, `<slug>` | Core user flows |

---

## Risks

| Risk | Mitigation |
|------|------------|
| <app-level risk> | <how handled> |

---

## Open Questions
<!-- App-level decisions for the user, surfaced via AskUserQuestion and resolved
BEFORE fan-out begins. Record the chosen option (and rejected ones, briefly)
once decided. -->

- **Q-01:** <question> — options: <A / B / C with trade-offs>
