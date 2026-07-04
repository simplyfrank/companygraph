---
feature: "requirements-export"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-14)"
status: "draft"
revision: 1
size: "small"
---

# Requirements: requirements-export

## Summary

`requirements-export` is the **wave-5** feature of the Business Modeling Studio
(blueprint `.claude/specs/blueprint.md`; milestone M4 — the final feature). It is
the **document** stage that closes the pipeline (**author → graph → optimize →
measure → systematize → document**): having authored a business model's stories,
ranked and marked its key activities, quantified its KPI impact, and modeled its
supporting systems, a Business Architect now **assembles the complete per-model
business specification** — the model's user stories with their Given/When/Then
acceptance criteria, its marked key activities, its quantified KPI impact matrix,
and its system / bounded-context map — into a single document and **exports it as
Markdown + JSON** (XD-14). It ships the **SpecExport** view at `#/model/export`
(blueprint View Tree, verbatim) with all four view states.

Per XD-14 export is **Markdown + JSON only** — **PDF is explicitly out of scope**
(deferred; the cto-analytics PDF pattern exists if wanted later). Per XD-02 no new
store is introduced: this feature **reads** the already-governed per-model REST
surfaces its five dependencies expose (`story-spec-core`,
`key-activity-optimizer`, `kpi-impact-mapping`, `ddd-system-modeling`,
`model-workspace-core`) and composes them into a document — it **owns no domain
data** and writes nothing to the graph. The assembly is a **read-only server-side
composition** returning a deterministic document for a given model.

It **does not** re-spec any upstream data surface: story/AC CRUD
(`story-spec-core`), key-activity scoring/marking (`key-activity-optimizer`), KPI
impact links/matrix/roll-up (`kpi-impact-mapping`), capability/system/gap/context
modeling (`ddd-system-modeling`), or model CRUD + `scopedNodeIds` + active-model
context (`model-workspace-core`). All of those are consumed, never re-implemented,
with named owners below. **PDF export** is out of scope (XD-14).

## Motivation

1. The blueprint north star (Summary) is "the complete specification of a
   business" — but until this feature lands that specification is **scattered**
   across five surfaces (stories at `#/model/stories`, key activities at
   `#/model/key-activities`, KPI impact at `#/model/kpi-impact`, systems at
   `#/model/systems`, the model itself at `#/model/models`). There is **no**
   single artifact a Business Architect can hand to a stakeholder, commit to a
   repo, or diff across model versions. XD-14 fixes this: one document, per model,
   in two formats.
2. **Markdown** is the human-readable artifact (a stakeholder reads it, it renders
   in a PR/wiki, it version-controls as text). **JSON** is the machine-readable
   artifact (another tool ingests it, a future test scaffold reads the
   Given/When/Then ACs, a diff tool compares two model versions structurally).
   XD-14 chose both over PDF precisely because the specification must be **human +
   machine readable**; PDF is deferred.
3. Every upstream surface already exposes a governed, model-scoped read. This
   feature is **pure composition** — it must **not** re-derive stories, re-score
   activities, re-compute the KPI matrix, or re-run gap analysis. It calls the
   dependencies' read routes (server-side, in one place) and lays their payloads
   out as a document. Keeping the assembly read-only and dependency-sourced means
   the exported spec is always consistent with what the five views show.
4. The blueprint View Tree assigns `#/model/export` → `SpecExport` to this spec;
   `model-workspace-core` already registered that route as a `ModelTabPlaceholder`
   and owns `route.ts`. This spec replaces the placeholder with the real export
   view, scoped to the active model, offering a Markdown preview + a download of
   each format.

## Functional Requirements

<!-- Priorities: must = M4 deliverable (the feature's reason to exist);
     should = polish. Every FR has a stable ID, a priority, and a source trace. -->

### A. Server-side document assembly (XD-14, XD-02)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Assembled specification document — canonical JSON shape.** A read-only, model-scoped route `GET /api/v1/models/:modelId/spec-export` returns the complete per-model business specification as a single JSON document. `:modelId` must be an existing `BusinessModel` (else `404 model_not_found`, reusing `model-workspace-core`'s existing code — not a duplicate). The document is a zod-validated object `{ model, stories, keyActivities, kpiImpact, systemModel, meta }` where: **`model`** = the model summary (`id`, `name`, `description`, and the reference/template flag) from `GET /api/v1/models/:modelId` (`model-workspace-core` FR-05); **`stories`** = the model's stories each with its embedded ACs as ordered Given/When/Then triples, its linked activity name + role, from `GET /api/v1/models/:modelId/stories` + per-story detail (`story-spec-core` FR-05); **`keyActivities`** = the ranked activities with their composite/sub-scores and the marked/key flag, from `GET /api/v1/models/:modelId/key-activities` (`key-activity-optimizer` FR-06); **`kpiImpact`** = the coverage matrix + `gaps` + roll-up, from `GET /api/v1/models/:modelId/kpi-impact/matrix` and `GET /api/v1/models/:modelId/kpi-impact/rollup` (`kpi-impact-mapping` FR-05/FR-06/FR-08); **`systemModel`** = the capability list, support-gap analysis, and context map, from `GET /api/v1/models/:modelId/capabilities`, `GET /api/v1/models/:modelId/system-model/gaps`, `GET /api/v1/models/:modelId/system-model/context-map` (`ddd-system-modeling` FR-04/FR-07/FR-09); **`meta`** = `{ generatedAt (ISO), modelId, counts: { stories, acceptanceCriteria, keyActivities, kpiLinks, gaps, capabilities }, degraded: { <section>: reason }? }`. All sections are **model-isolated** (each source route is already `scopedNodeIds`-scoped). Response is `application/json`. | must | XD-14, XD-02 |
| FR-02 | **Read-only composition — no writes, no re-derivation, no direct store query.** The assembly (FR-01) **calls the dependencies' governed read routes server-side** (composed in one module, `api/src/routes/spec-export.ts` + a pure assembler `api/src/derive/spec-document.ts`); it **never** writes to Neo4j/Postgres, **never** re-implements story derivation / key-activity scoring / matrix math / gap analysis, and **never** queries a store directly for domain data (it reads only through the upstream routes, exactly as `kpi-impact-mapping` composes `kpi-trends`). The upstream reads may run in-process against the same driver/handlers (default) rather than an HTTP self-loopback (design confirms the seam per OQ-1). No new node label, edge type, `NODE_LABELS`/`EDGE_ENDPOINTS`, or store is introduced. | must | XD-02, XD-14 |
| FR-03 | **Section-level graceful degradation.** If one upstream section read fails or is unavailable (e.g. `kpi-impact` roll-up degrades, or `ddd-system-modeling` routes are absent for a model with no capabilities), the assembly returns the document with that section set to its **empty shape** (`[]` / `{}` as the section's zod schema defines) and records `meta.degraded.<section> = <reason>` rather than 500-ing the whole document. A **missing model** (`404 model_not_found`) still fails fast (FR-01) — degradation applies to **section** failures, not to a bad `:modelId`. This mirrors `kpi-impact-mapping` FR-09's degrade-not-crash contract. | must | XD-14, `kpi-impact-mapping` FR-09 |

### B. Format rendering (XD-14 — Markdown + JSON; NOT PDF)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-04 | **Markdown rendering.** `GET /api/v1/models/:modelId/spec-export?format=markdown` (or `Accept: text/markdown`) returns the same assembled document (FR-01) rendered as a **deterministic Markdown document** with `content-type: text/markdown; charset=utf-8`. The rendering is a **pure function** of the FR-01 JSON (`renderSpecMarkdown(doc)` in `api/src/derive/spec-markdown.ts`, unit-testable without Neo4j) with a fixed section order: (1) a title + model summary header, (2) **User Stories** — each story's narrative followed by its ACs as a Given/When/Then list, (3) **Key Activities** — the ranked/marked activities table, (4) **KPI Impact** — the coverage matrix + a gaps list + the roll-up status, (5) **System Model** — capabilities, support gaps, and the context map. Degraded sections (FR-03) render an explicit "*(section unavailable: `<reason>`)*" note, never a blank heading. `format=json` (default) returns FR-01's JSON. An unknown `?format=` value → `400` zod envelope. **`format=pdf` is not accepted** (returns `400 unsupported_export_format` — PDF is out of scope, XD-14). | must | XD-14 |
| FR-05 | **Determinism.** For a fixed model graph state, both the JSON (FR-01) and the Markdown (FR-04) are **deterministic** — same model + same upstream data → byte-identical Markdown and structurally-equal JSON. All list orderings are stable (stories by their upstream list order which is itself deterministic; ACs by `ordinal`; key activities by rank then the `createdAt`/`id` tiebreak the upstream defines; matrix rows/columns by the upstream matrix order). `meta.generatedAt` is the **only** non-deterministic field and is excluded from the determinism assertion (or clamped in the test). | must | XD-14, `cto-analytics` NFR-04 reproducibility pattern |

### C. API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-06 | **API contract.** The `GET /api/v1/models/:modelId/spec-export` route is mounted under `/api/v1/`, zod-validated at the boundary (the `?format` query + the response document schema), returns the `{error:{code,message,details?}}` envelope on error, and appears in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). New error codes are added to the closed `ERROR_CODES` enum (`api/src/errors.ts`) as **additive** (non-breaking) changes: at minimum `unsupported_export_format` (a `?format=` value that is not `json`/`markdown`, incl. `pdf`); `model_not_found` is **reused** from `model-workspace-core` (not duplicated). Every added code is reachable from ≥1 route so `envelope.test.ts`'s reachability assertion holds. No `/api/v2/` bump (additive). | must | NFR-11, house rule |
| FR-07 | **Route-permission mapping.** The `/api/v1/models/:modelId/spec-export` route is registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) with a new `spec_export:read` permission (read-only — there is no write route). The `business_architect` RBAC role (seeded by `model-workspace-core` FR-11, extended by the wave-2/3/4 specs) gains `spec_export:read` in `api/src/scripts/seed-rbac-roles.ts` (idempotent MERGE by role name). Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). The route is **not** `public`. | must | house rule, XD-08 |

### D. PWA — SpecExport view (blueprint View Tree, UX-*)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **SpecExport view** (`pwa/src/views/model/SpecExport.tsx`, route `#/model/export` — taken **verbatim** from the blueprint View Tree) **replaces** the `ModelTabPlaceholder` that `model-workspace-core` registered for the `export` tab in `pwa/src/views/index.tsx`'s `model` surface dispatch (`VIEWS.model.export`). It reads the active `BusinessModel` from the shell-owned context (`useActiveModel()`, `pwa/src/context/ActiveModelContext.tsx`; it does **not** re-implement model selection) and renders that model's assembled specification from `GET /api/v1/models/:modelId/spec-export?format=markdown` (a Markdown **preview**) plus section-count summary chips (from the JSON `meta`). It specs **all four view states**: **loading** (skeleton while the fetch is in flight), **empty** (the model has no authored content yet — no stories, key activities, KPI links, or capabilities — a message pointing to the authoring/optimize/measure tabs, with export controls disabled), **error** (fetch failed — retry affordance), **ready** (the Markdown preview + download controls). Tokens-only styling via `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog components (`Card`, `Button`, `Loading`/`ErrorState` from `pwa/src/views/_shared.tsx`) before inventing new ones; `scripts/design-conformance.ts` passes on the view + its CSS module. | must | Blueprint View Tree, UX-01, UX-02, UX-06 |
| FR-09 | **Download Markdown + JSON.** SpecExport offers two download controls: **"Download Markdown"** fetches `?format=markdown` and triggers a client-side file download (`<model-name>-spec.md`, `text/markdown`); **"Download JSON"** fetches `?format=json` and downloads `<model-name>-spec.json` (`application/json`). Downloads use a client-side `Blob` + object-URL anchor (no server file storage — the payload is the response body). A degraded section (`meta.degraded`) surfaces a non-blocking banner in the preview ("Some sections were unavailable and exported empty: `<sections>`") so the user knows the artifact is partial before downloading. Both controls are keyboard-reachable (UX-05) and disabled in the empty state (FR-08). | must | XD-14, UX-01, UX-05 |
| FR-10 | **Model-scoped export + reload survival.** SpecExport only ever exports the active model's specification; switching the active model (via the shell context) refetches the preview for the new model; deep-linking `#/model/export` and reloading re-renders the export for the persisted active model (persistence + reconciliation is `model-workspace-core`'s FR-15; this view consumes it and refetches on `activeModel.id` change). No cross-model leakage (server-enforced — every upstream section read is already `scopedNodeIds`-scoped by its owning spec; FR-01 composes only the named model's sections). | must | UX-06, `model-workspace-core` FR-15 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **Model isolation.** The assembled document (FR-01), Markdown (FR-04), and view (FR-08–FR-10) contain **only** the named model's data — each upstream section read is already scoped by its owning spec's `scopedNodeIds(driver, :modelId)` usage (`model-workspace-core` FR-18, consumed transitively; never re-implemented here). A request for model A never returns model B's stories/activities/links/capabilities. This spec adds **no** scoping logic of its own beyond passing `:modelId` to each upstream read. | XD-06, `model-workspace-core` FR-18 |
| NFR-02 | **No new store; no compile-time schema edit; no domain data ownership.** This feature reads the governed upstream routes and composes a document (XD-02). It introduces **no** new store, **no** runtime or compile-time node label / edge type, **no** `NODE_LABELS`/`EDGE_ENDPOINTS` edit, and owns **no** graph data. `shared/src/schema/nodes.ts`/`edges.ts` consts are **not** edited. It may add response-shape zod schemas in a new `shared/src/schema/spec-export.ts` (design decides). | XD-02, XD-14 |
| NFR-03 | **Read-only + resilient.** The route is read-only (FR-02) — no writes to any store. A single failing upstream section degrades that section to empty with a `meta.degraded` note (FR-03); the whole document never 500s on a section failure; a bad `:modelId` fails fast with `404 model_not_found` (FR-01). Deterministic: same model state + same upstream responses → same document (FR-05). | XD-14, `kpi-impact-mapping` FR-09 |
| NFR-04 | **Bounded computation, no cache.** The document assembles live on request at `retail-mini`/single-model scale in < 2 s on the dev box (no cache/precompute/scheduler subsystem — served live, matching `key-activity-optimizer` NFR-05 / `kpi-impact-mapping` NFR-05 / cto-analytics "serve live"). Cost is bounded by the union of the upstream reads it composes (one read per section). | XD-14, `kpi-impact-mapping` NFR-05 |
| NFR-05 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers (`color`, `neighbors`, `behavior`); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all routes under `/api/v1/`. | CLAUDE.md |
| NFR-06 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/export` | `SpecExport` | Model tab (topbar surf-nav + subnav — registered by `model-workspace-core`) | all four — AC-06 (loading), AC-07 (empty), AC-08 (error), AC-05/AC-09 (ready) |

This spec **replaces** the `ModelTabPlaceholder` `model-workspace-core` registered
for the `export` tab (`pwa/src/views/index.tsx` `VIEWS.model.export`); it does
**not** touch `route.ts` (`model-workspace-core` owns it) beyond the `renderView`
dispatch of the `export` tab to `SpecExport`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-05..AC-09 cover SpecExport ready/loading/empty/error |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-08, NFR-06; AC-10 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | n/a — SpecExport is a **preview + download-button** surface (no canvas, no custom gestures, no scroll-hijack, no global keyboard handler). The Platforms & Input Modes + Native Conflicts tables below are populated to record this explicitly (the view still has keyboard/mouse/trackpad interaction: two download buttons, a retry affordance, a scrollable Markdown preview using native scroll). |
| UX-04 responsiveness | NFR-06 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-11 — keyboard reachability of the two download controls + retry affordance, focus order, ARIA landmark on the view; the Markdown preview region is a labeled scrollable landmark |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-08 (verbatim route), FR-10 (refetch on model change + reload survival); AC-12 (deep link + active model → correct export after reload) |

## Scope Boundaries

**In scope:**
- The per-model **assembled specification document** — stories + Given/When/Then
  ACs + marked key activities + quantified KPI impact matrix/gaps/roll-up +
  system/bounded-context map — as a read-only server-side composition.
- **Markdown + JSON** rendering of that document (XD-14), deterministic, from the
  governed upstream reads.
- `spec_export:read` permission + route mapping; grant to `business_architect`.
- `SpecExport` view at `#/model/export` with all four states, a Markdown preview,
  section-count summary, and Markdown + JSON downloads.

**Out of scope (owner named):**
- **PDF export** → deferred (XD-14; the `cto-analytics` / `cto-analytics-reporting`
  server-side PDF pattern exists if the user later wants it). This feature returns
  `400 unsupported_export_format` for `?format=pdf`.
- **Story / AC data + CRUD + bootstrap** → `story-spec-core`. Read here, never
  created/edited.
- **Key-activity scoring / marking** → `key-activity-optimizer`. Read here, never
  computed/written.
- **KPI impact links / matrix / gaps / roll-up** → `kpi-impact-mapping`. Read here,
  never computed/written.
- **Capabilities / support-gap analysis / context map / systemKind** →
  `ddd-system-modeling` (and `system-augmentation-model` for `systemKind`). Read
  here, never modeled/written.
- **Model CRUD, `scopedNodeIds` helper, `IN_MODEL` scoping, active-model context,
  `route.ts`/`SURFACES` edits, RBAC role seeding scaffold** → `model-workspace-core`.
  Consumed here; this spec only adds `spec_export:read` to the seeded role and
  replaces the `export`-tab placeholder.
- **A precompute / cache / scheduler subsystem** — the document assembles live
  (FR-01, NFR-04).
- **Diffing two model versions / export history / stored artifacts** — not in this
  feature (the download is the response body; no server-side artifact storage).

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification columns mandatory.
     Verification is a test path or `manual: <repro with input mode + observable outcome>`. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | **Assembled JSON document** (`GET /api/v1/models/:modelId/spec-export`, default `format=json`): for a seeded model with ≥1 story (+AC), ≥1 marked key activity, ≥1 directional KPI-impact link, and ≥1 capability, returns a zod-valid `{ model, stories, keyActivities, kpiImpact, systemModel, meta }` where `stories[].acceptanceCriteria` are ordered Given/When/Then triples, `keyActivities` carry the composite/sub-scores + key flag, `kpiImpact` carries the matrix + `gaps` + roll-up, and `systemModel` carries capabilities + gaps + context map; `meta.counts` matches the seeded counts; a bad `:modelId` → `404 model_not_found` (FR-01, FR-02, FR-06) | server (bun test + Neo4j) | `api/__tests__/spec-export-document.integration.test.ts` |
| AC-02 | **Section-level degradation** (FR-03): with one upstream section made to fail (e.g. the `kpi-impact` roll-up read errors), `GET …/spec-export` still returns `200` with that section set to its empty shape and `meta.degraded.<section>` carrying the reason — the whole document does **not** 500; a **missing** model still returns `404 model_not_found` (not a degraded document) (FR-03, NFR-03) | server (bun test + Neo4j) | `api/__tests__/spec-export-degradation.integration.test.ts` |
| AC-03 | **Markdown rendering** (`?format=markdown`, `Accept: text/markdown`): returns `content-type: text/markdown; charset=utf-8` with the five ordered sections (model header, User Stories with Given/When/Then lists, Key Activities table, KPI Impact matrix+gaps+roll-up, System Model capabilities+gaps+context-map); a degraded section renders the explicit "*(section unavailable: …)*" note, not a blank heading; `renderSpecMarkdown(doc)` is a pure function of the FR-01 JSON (unit-tested without Neo4j) (FR-04, FR-03) | server (bun test) | `api/__tests__/spec-markdown-render.test.ts` |
| AC-04 | **Format guard + determinism** (FR-04, FR-05): `?format=pdf` → `400 unsupported_export_format` (PDF is out of scope, XD-14); any unknown `?format=` → `400` zod envelope; rendering the **same** FR-01 document twice yields **byte-identical** Markdown and structurally-equal JSON (all orderings stable; `meta.generatedAt` excluded/clamped) (FR-04, FR-05, FR-06) | server (bun test) | `api/__tests__/spec-export-format.test.ts` |
| AC-05 | `#/model/export` resolves to `SpecExport` (not `ModelTabPlaceholder`); it reads the active model from `useActiveModel()` and renders the ready-state Markdown preview plus section-count summary chips from `meta` (FR-08 ready, FR-10) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/spec-export.test.tsx` |
| AC-06 | SpecExport renders a loading skeleton while `GET …/spec-export?format=markdown` is pending (FR-08, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/spec-export-states.test.tsx` |
| AC-07 | With a model that has no authored content (no stories/key activities/KPI links/capabilities), SpecExport shows the empty state pointing to the authoring/optimize/measure tabs, and the download controls are **disabled** (FR-08 empty, FR-09) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/spec-export-states.test.tsx` |
| AC-08 | When `GET …/spec-export` fails, SpecExport shows the error state with a retry affordance that refetches (FR-08, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/spec-export-states.test.tsx` |
| AC-09 | **Downloads + degraded banner** (FR-09): "Download Markdown" fetches `?format=markdown` and triggers a `<model-name>-spec.md` (`text/markdown`) client-side Blob download; "Download JSON" downloads `<model-name>-spec.json` (`application/json`); when the assembled `meta.degraded` is non-empty, a non-blocking "some sections exported empty: …" banner renders above the preview before download (FR-09, FR-03) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/spec-export-download.test.tsx` |
| AC-10 | `scripts/design-conformance.ts` passes on `SpecExport.tsx` + its CSS module (tokens-only, catalog components) (NFR-06, UX-02) | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/SpecExport.tsx` — expect exit 0, zero token/component violations reported |
| AC-11 | SpecExport is keyboard-reachable: Tab reaches "Download Markdown", "Download JSON", and the retry affordance (when in error state) in DOM order; the two download buttons activate with Enter/Space; the Markdown preview is a labeled scrollable region reachable by keyboard; the view exposes an ARIA landmark (FR-08, FR-09, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/export` keyboard-only — Tab to "Download Markdown" and press Enter (expect a `.md` file downloads), Tab to "Download JSON" and press Enter (expect a `.json` file downloads), Tab into the preview region (expect focus enters the labeled scrollable Markdown area and arrow keys scroll it) |
| AC-12 | Deep link + active model survive reload: with model B active, navigate to `#/model/export`, reload — expect the same route renders `SpecExport` showing **model B's** assembled spec (active-model persistence is `model-workspace-core`'s FR-15; this view refetches for the persisted model) (FR-10, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/spec-export-context.spec.ts` |
| AC-13 | **Authz + OpenAPI** (FR-06, FR-07): a session without `spec_export:read` gets `403` on `GET /api/v1/models/:id/spec-export`; a `spec_export:read` session gets `200`; the `business_architect` role resolves `spec_export:read`; no new route is `public`; the new route and the added `unsupported_export_format` code appear in `GET /api/v1/openapi.json` (generated from the same zod schemas), and every added `ERROR_CODES` entry is reachable so `envelope.test.ts`'s reachability assertion holds (FR-06, FR-07) | server (bun test) | `api/__tests__/spec-export-authz.integration.test.ts` + `api/__tests__/spec-export-openapi.integration.test.ts` |
| AC-14 | Transpile is clean and no compile-time schema arrays / new store were introduced (this feature reads upstream routes and composes a document) (NFR-02, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no additions to `NODE_LABELS` or `EDGE_ENDPOINTS` |

## Platforms & Input Modes

This spec touches `pwa/` (the `SpecExport` view + its dispatch in
`renderView`). It ships **no** canvas, custom gesture, scroll-container hijack,
drag, or global keyboard handler — SpecExport is a **Markdown-preview +
download-button** surface reusing catalog components (`Card`, `Button`,
`Loading`/`ErrorState`) and native controls (native buttons, native scroll on the
preview region). The tables are populated to record this explicitly (it still has
keyboard/mouse/trackpad interaction: two download buttons, a retry affordance, and
a natively-scrollable preview).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Markdown preview region | yes | yes | yes | yes | read-only; **native** scroll (no scroll-hijack); labeled scrollable landmark reachable by keyboard |
| Download controls ("Download Markdown", "Download JSON") | yes | yes | yes | yes | native buttons; client-side Blob + object-URL download; disabled in empty state |
| Retry affordance (error state) | yes | yes | yes | yes | native button; refetches the preview |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | none introduced — no canvas surface in this spec |

## Native Conflicts

SpecExport introduces **no new gesture, scroll-hijack, drag, or global keyboard
handler**. It uses native buttons, a natively-scrollable preview region, and
catalog `Card`/`Button`/`Loading`/`ErrorState` components. There is therefore no
native behavior to suppress.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Native scroll on the Markdown preview region | (desired — the preview must scroll) | n/a — native scroll is the intended interaction; not hijacked or suppressed |
| Browser file-download prompt (from the Blob object-URL anchor) | (desired — the export download) | n/a — standard `<a download>` client-side download; not overridden |
| (no new gesture / scroll-hijack / drag / global-keyboard handling introduced) | n/a | n/a |

## Dependencies

> **Hard build-order dependency.** This spec is **wave 5** — the final feature
> (blueprint dependency graph): it cannot start implementation until **all** of its
> dependencies land, because it composes their read routes. The routes below are
> owned upstream and may not exist on disk at this spec's authoring time; this spec
> **consumes** them and never re-specs them.

- **`model-workspace-core`** (foundation wave 1 — transitive dependency): consumed, never re-specced.
  - `GET /api/v1/models/:modelId` (FR-05) — the `model` section of the document (FR-01).
  - `scopedNodeIds(driver, modelId)` (`api/src/storage/model-scope.ts`, FR-18) — the scoping every upstream read already applies (NFR-01); not called directly here.
  - `business_architect` RBAC role (`api/src/scripts/seed-rbac-roles.ts`, FR-11) — this spec adds `spec_export:read` to it (FR-07).
  - `model_not_found` error code (`api/src/errors.ts`, FR-13) — reused by FR-01/FR-06 (not duplicated).
  - Model surface shell + `route.ts`/`SURFACES` registration + `ModelTabPlaceholder` for the `export` tab — replaced by `SpecExport` (FR-08).
  - Shell-owned active-model context + `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx`, FR-15) — consumed by SpecExport (FR-08, FR-10).
- **`story-spec-core`** (wave 2): `GET /api/v1/models/:modelId/stories` + per-story detail (FR-05) — the `stories` section with embedded Given/When/Then ACs. Read only; no story CRUD here.
- **`key-activity-optimizer`** (wave 3): `GET /api/v1/models/:modelId/key-activities` (FR-06) — the `keyActivities` section (ranked, scored, key-marked). Read only; no scoring/marking here.
- **`kpi-impact-mapping`** (wave 4): `GET /api/v1/models/:modelId/kpi-impact/matrix` (FR-05) + `.../kpi-impact/rollup` (FR-08) — the `kpiImpact` section (matrix + gaps + roll-up). Read only; no link/matrix computation here.
- **`ddd-system-modeling`** (wave 3): `GET /api/v1/models/:modelId/capabilities` (FR-04) + `.../system-model/gaps` (FR-07) + `.../system-model/context-map` (FR-09) — the `systemModel` section. Read only; no capability/context modeling here.
- **Central router gate** (`api/src/router.ts`) + `ROUTE_PERMISSIONS` (`api/src/auth/rbac-permissions.ts`): the new route dispatched + auth-gated here; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts`) + `ERROR_CODES` (`api/src/errors.ts`) + `envelope`/route helpers (`api/src/routes/_helpers.ts`).
- **Shared schema** (`shared/src/schema/`): this spec may add a `shared/src/schema/spec-export.ts` with the assembled-document + `?format` request zod schemas (design decides). It reuses the upstream sections' shapes (`story-spec-core`, `key-activity-optimizer`, `kpi-impact-mapping`, `ddd-system-modeling` response types) rather than re-declaring them.
- **PWA shell + catalog** (`pwa/src/views/index.tsx` `model`-surface dispatch, `pwa/src/components/{Card,Button}.tsx` / `pwa/src/views/_shared.tsx` `Loading`/`ErrorState`, `pwa/src/styles/companygraph/tokens.css`, `scripts/design-conformance.ts`, `pwa/src/api.ts` `json<T>()` wrapper).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — upstream-read seam: in-process handler calls vs. HTTP self-loopback.** FR-01/FR-02 compose five specs' read routes server-side. Should the assembler call each route's **handler function in-process** (against the same driver, no HTTP), or make **HTTP self-loopback** requests to `127.0.0.1:8787`? | Determines coupling + performance + how auth/scoping propagate. In-process avoids a network hop and re-auth but couples to each handler's exported signature; loopback is decoupled but re-runs the router gate per section and needs an internal auth context. | **Decided default (proceed): in-process handler composition.** Each upstream route already exposes a testable handler; the assembler imports and calls them with `:modelId` (mirroring how `kpi-impact-mapping` composes `kpi-trends` server-side, not via a self-call). Design confirms the exact exported seam per upstream spec (some may need a small `export`, like `business-model-authoring`'s `realImport`). Flagged for the consolidated report; not a requirements blocker. |
| 2 | **OQ-2 — Markdown renderer: hand-rolled string builder vs. a Markdown library.** FR-04's `renderSpecMarkdown` emits deterministic Markdown from the JSON. | A library adds a dependency; a hand-rolled builder is trivial for this fixed structure but must escape user content (story narratives, AC clauses, activity names may contain `|`, `#`, backticks). | **Decided default (proceed): hand-rolled deterministic string builder** with explicit escaping of Markdown-significant characters in interpolated user content (the sections are a fixed, small set of tables + lists). No new runtime dependency. Design pins the escaping rules; AC-04's determinism + AC-03's render test cover it. Alternative (a Markdown lib) is available if escaping proves fiddly. Not a blocker. |
| 3 | **Cross-spec read-shape coupling.** FR-01 composes five upstream response shapes; if any upstream route's payload changes, this spec's assembler + Markdown render break. | Coupling on five internal read shapes (the most of any studio feature). | Depend only on each upstream route's **documented** response contract (the FRs cited above); AC-01/AC-03 assert the composed shape against seeded fixtures, so an upstream shape change surfaces as a failing integration test, not silent drift. Section-level degradation (FR-03) means one upstream break degrades one section, not the whole export. |
| 4 | **Empty-model export.** A brand-new model (blank template) has no stories/activities/links/capabilities. | The document/preview must be meaningful, not a crash or a blank page. | FR-03 empty-shape sections + FR-08 empty view state + FR-09 disabled downloads cover this; AC-07 verifies the empty view; AC-01's counts allow zero. The document still validates (all sections present as empty). |
| 5 | **N-01 (design item) — module home.** FR-02 places the pure assembler at `api/src/derive/spec-document.ts` and the pure renderer at `api/src/derive/spec-markdown.ts`, with the route at `api/src/routes/spec-export.ts`. | Cosmetic placement + testability. | Design confirms the `derive/` placement (mirrors `key-activity-optimizer` DD-01 / `kpi-impact-mapping` N-01's pure-derive-under-`derive/` convention) so the assembler + renderer are unit-testable against a fixture without Neo4j (AC-03 renders purely). Not a requirements blocker. |
| 6 | **N-02 (tasks item) — AC-10 could be CI, not manual.** AC-10 runs `scripts/design-conformance.ts` as a CLI check with an exit code. | Verification quality. | Tasks may promote AC-10 to an automated CI check. Flagged for the tasks phase (small spec skips design; goes straight to tasks). |
