---
feature: "<slug>"
created: "<YYYY-MM-DD>"
author: "<who>"
status: "draft"
revision: 1
size: "<small|medium|large>"
---

# Requirements: <slug>

<!-- House format template. Frontmatter keys are load-bearing:
     - `created` (quoted ISO date) — spec-traceability-check uses it for the
       grandfathering cutoff; omit and the spec is treated as legacy.
     - `status` walks draft → in-review → revised → approved.
     - `size` drives review depth: small = no design + no reviews;
       medium = review requirements + design; large = review all three.
     Size promotion rule: touches pwa/ AND mentions gestures/keyboard/input
     handlers → at least medium, regardless of file count. -->

## Summary

<2–4 sentences: what this feature is, who it serves, where it sits relative to
other specs. State explicitly what it does NOT include.>

## Motivation

<Why now; what breaks or stays impossible without it. Numbered list is house
style.>

## Functional Requirements

<!-- Group FRs by user story / capability. Every FR has a stable ID, a
     priority, and a source trace. Never renumber existing IDs in revisions. -->

### <Capability group> (<story-id>)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | <one testable statement; name routes/endpoints/limits concretely> | must | <story-id / blueprint XD-* / user ask> |
| FR-02 | … | should | … |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | <perf / footprint / operability bound with a number> | … |

## UI/UX Requirements
<!-- REQUIRED for any spec that touches pwa/. Delete for pure-API specs.
     If this spec belongs to a /spec-app blueprint, the blueprint's View Tree
     and UX-* allowances are law: take routes verbatim, never invent or rename
     one, and satisfy every UX-* row below. -->

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/<…>` | `<Name>` | topbar tab / subnav / deep-link only | <which ACs cover each state> |

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | <AC refs> |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | <AC refs> |
| UX-04 responsiveness | <AC refs or "n/a: desktop-only per blueprint"> |
| UX-05 accessibility | <AC refs> |
| UX-06 navigation (deep links survive reload, back preserves scroll) | <AC refs> |

## Scope Boundaries

**In scope:** <bullets>
**Out of scope:** <bullets — name the spec that owns each excluded item>

## Acceptance Criteria

<!-- Every AC traces to at least one FR. Platforms + Verification columns are
     mandatory. Verification is a test path or
     `manual: <repro with input mode + observable outcome>` — never bare
     "manual test" / "visual check". -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | <observable outcome> (FR-01) | <e.g. iPhone Safari (touch), macOS Chrome (mouse+kb) — or "server (curl)"> | `<path>.test.ts` or manual: <repro> |

## Platforms & Input Modes
<!-- REQUIRED if the spec touches pwa/, gestures, keyboard, or input handlers.
     Fill every cell yes/no — implicit assumptions hide gaps. Delete only for
     pure-API specs. -->

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| <view/interaction> | yes/no | yes/no | yes/no | yes/no | |

## Native Conflicts
<!-- REQUIRED for any gesture/scroll/keyboard/focus work. List every
     conflicting native behavior + its suppression mechanism, or write the
     explicit none-row. An empty section is not acceptable. -->

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

<Upstream specs (with the interfaces consumed — reference their real names),
packages, external services.>

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | … | … | … |
