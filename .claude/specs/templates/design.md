---
feature: "<slug>"
created: "<YYYY-MM-DD>"
author: "<who>"
status: "draft"
revision: 1
reviewing_requirements_revision: <N>
size: "<medium|large>"
---

# Design: <slug>

<!-- Small specs skip design entirely. Frontmatter `status` matters beyond
     documentation: spec-gate-check and spec-guard block Write/Edit on any
     source file this document names until status is "approved". So the File
     Changes table below is the permission surface for implementation — list
     every file the tasks will touch. -->

## 1. Overview

<The shape of the solution in 2–3 paragraphs + the 2–4 rules the design
follows. Name the key trade-offs taken and rejected.>

## 2. Prior-review concerns — resolution in this design

<!-- Only in revisions / when requirements review left open concerns. Map each
     open C-xx to how this design resolves or pins it. Delete in a fresh draft. -->

## 3. Data model

<Schemas, types, storage shapes. Reference real files (`shared/src/…`). Every
element here serves an FR — cite them.>

## 4. Core logic

<Per subsystem: how it works, which FR it serves. Use numbered subsections
(4.1, 4.2 …) — reviews cite them.>

## 5. HTTP API surface
<!-- Delete for UI-only specs. Route table + response envelope + error codes.
     All routes under /api/v1/. -->

| Method | Route | FR | Request → Response |
|--------|-------|----|--------------------|
| GET | `/api/v1/…` | FR-xx | … |

## 6. UI design
<!-- REQUIRED for any spec that touches pwa/. Delete for pure-API specs. -->

- **View tree placement:** which blueprint View Tree nodes this spec
  implements, verbatim routes. New nav affordances (tabs, subnav entries) and
  where they mount.
- **Component plan:** per view — which catalog components
  (`design-system.manifest.yaml` / DESIGN.md vocabulary) are reused, which are
  extended, and any genuinely new component (justify why no catalog row fits).
- **States:** loading / empty / error / ready design per view (what renders,
  what's interactive).
- **Tokens:** styling via `var(--…)` from `pwa/src/styles/tokens.css` only;
  `scripts/design-conformance.ts` must pass on every touched view.
- **Input modes:** how the requirements' Platforms & Input Modes and Native
  Conflicts tables are honoured (event handlers, suppression mechanisms,
  keyboard map).

## 7. File Changes

<!-- The authoritative list. Every FR maps to at least one row; every row
     serves at least one FR. spec-guard only allows edits to files listed
     here (or in tasks.md) once status is "approved". -->

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `api/src/…` | new / modify | FR-xx | |
| `pwa/src/views/…` | new / modify | FR-xx, UX-xx | |

## 8. Test strategy

<Which ACs are covered by unit tests (`*.test.ts`), integration tests
(`*.integration.test.ts`, needs Neo4j), e2e/Playwright, and which are
manual-with-repro. Name the test files the tasks will create.>

## 9. Rejected alternatives

<Brief — one bullet per alternative + why not. Saves the next reviser from
re-litigating.>
