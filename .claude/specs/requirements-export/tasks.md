---
feature: "requirements-export"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-14)"
status: "approved"
revision: 1
reviewing_requirements_revision: "1 (small spec — no requirements review per size rules; XD-17 single-shot)"
reviewing_design_revision: "n/a (small spec — no design phase; requirements → tasks → execute)"
size: "small"
total_tasks: 11
---

# Tasks: requirements-export

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  completion without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every file the
  task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css`
  gets its own invocation (AC-10).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit + component tests run under
  `bun test`. The pure assembler (T-02) and the pure Markdown renderer (T-03)
  are **Neo4j-free unit-testable** against an in-memory document fixture — no
  store or HTTP required for AC-03/AC-04's render + determinism assertions.

## Hard build-order precondition (requirements Dependencies §; blueprint wave 5)

This is the **wave-5 final feature** (blueprint dependency graph / milestone M4).
Implementation **cannot start until all five declared dependencies plus the
transitive foundation `model-workspace-core` have merged**, because every section
of the assembled document (T-02) composes an upstream read route that is a **new
file owned upstream that may not exist on disk at this spec's authoring time**.
Each task binds to the real upstream files once they land; the requirements cite
their approved response contracts.

Verified against disk at authoring time (2026-07-04):

- **`model_not_found`** is **already** in `ERROR_CODES` (`api/src/errors.ts:36`) —
  reused, **not** re-declared (FR-06, requirements Dependencies). Only
  `unsupported_export_format` is added.
- **`api/src/derive/`** does **not** exist yet — this spec (or an upstream
  `derive`-using spec, e.g. `key-activity-optimizer` / `kpi-impact-mapping`)
  creates it. The pure assembler + renderer live under `api/src/derive/`
  (requirements N-01/OQ-1, pinned below).
- **`pwa/src/views/model/`** and **`pwa/src/context/ActiveModelContext.tsx`** do
  **not** exist yet — both land with `model-workspace-core`. The `export` tab's
  `ModelTabPlaceholder` slot in `pwa/src/views/index.tsx`'s `model`-surface
  dispatch is what this spec replaces (FR-08); it does **not** touch `route.ts`.
- **`api/src/routes/_helpers.ts`** exists (verified: `ok`, `noContent`, `error`,
  `parseWith`, `parseId`) — reused for the envelope + zod→400 mapping (FR-06).
- **`pwa/src/views/_shared.tsx`** exists (verified: `Loading`, `ErrorState`,
  `ViewHeader`) — reused for the loading/error catalog states (FR-08).
- **`pwa/src/api.ts`** exists with a **private** `json<T>()` wrapper and the
  exported `api` object (verified `:40`, `:78`) — a `specExport` block is added
  to `api` reusing `json<T>` internally; `json<T>` is **not** exported/called from
  the view.

Upstream read routes composed by T-02 (owned upstream; consumed, never re-specced):

| Section | Route(s) | Owner (FR) |
|---------|----------|-----------|
| `model` | `GET /api/v1/models/:modelId` | `model-workspace-core` FR-05 |
| `stories` | `GET /api/v1/models/:modelId/stories` + per-story detail (embedded Given/When/Then ACs) | `story-spec-core` FR-05 |
| `keyActivities` | `GET /api/v1/models/:modelId/key-activities` | `key-activity-optimizer` FR-06 |
| `kpiImpact` | `GET /api/v1/models/:modelId/kpi-impact/matrix` + `.../kpi-impact/rollup` | `kpi-impact-mapping` FR-05/FR-06/FR-08 |
| `systemModel` | `GET /api/v1/models/:modelId/capabilities` + `.../system-model/gaps` + `.../system-model/context-map` | `ddd-system-modeling` FR-04/FR-07/FR-09 |

**No task's file writes may start until its upstream dependency has merged.**

## Pinned decisions (requirements Open Questions → binding for execution)

Small spec: no design phase, so the requirements' Open Questions (OQ-1, OQ-2) and
the N-01/N-02 design items are **pinned here** as binding decisions so the
execution agent does not re-derive them. None changes the architecture. The
orchestrator should surface OQ-1/OQ-2 in the consolidated report (XD-17); no task
changes if the user rules the alternative — each is a one-module swap behind a
seam.

| Item | Decision (binding for execution) | Rationale | Locked in task |
|------|----------------------------------|-----------|----------------|
| **OQ-1** — upstream-read seam: in-process handler calls vs HTTP self-loopback | **In-process handler composition.** The assembler (T-02) imports each upstream route's exported handler and calls it with `:modelId` against the same driver (mirrors `kpi-impact-mapping`'s in-process `fetchTrends` composition of `kpi-trends`). **No** HTTP self-loopback to `127.0.0.1:8787`; **no** re-run of the router gate per section; **no** direct store query for domain data (FR-02, NFR-02). Each upstream handler is called behind a per-section `SectionReader` seam (T-02) so a section failure degrades that section (FR-03) and the exact exported signature is bound at merge time (some upstreams may need a small `export`). | Avoids a network hop + re-auth; couples only to each handler's documented response contract (requirements Risk-3); the seam absorbs a handler-signature difference | T-02 (`SectionReader` seam), T-04 (route wires the model-existence pre-check) |
| **OQ-2** — Markdown renderer: hand-rolled string builder vs a Markdown library | **Hand-rolled deterministic string builder** (`renderSpecMarkdown(doc)` in `api/src/derive/spec-markdown.ts`) with **explicit escaping** of Markdown-significant characters (`|`, `` ` ``, `#`, `*`, `_`, `[`, `]`, `\`, and newlines inside table cells) in every interpolated user-content field (story narratives, AC Given/When/Then clauses, activity/role/capability names, notes). **No new runtime dependency.** The sections are a fixed, small set of tables + lists. | Deterministic + dependency-free; determinism (AC-04) + render (AC-03) tests cover the escaping | T-03 (escaping helper + fixed section order) |
| **N-01** — module home for the pure assembler + renderer | Pure assembler at **`api/src/derive/spec-document.ts`** (`assembleSpecDocument`), pure renderer at **`api/src/derive/spec-markdown.ts`** (`renderSpecMarkdown`), route + in-process seam at **`api/src/routes/spec-export.ts`**. Mirrors the `derive/`-for-pure-composition convention (`key-activity-optimizer` / `kpi-impact-mapping` N-01). | Assembler + renderer are Neo4j-free unit-testable against a fixture (AC-03/AC-04 render purely) | T-02, T-03 |
| **N-02** — AC-10 verification kind (requirements Risk-6) | AC-10 is a **CLI** check (`bun run scripts/design-conformance.ts --view …`, deterministic exit code), **not** a manual walk — one invocation per touched `pwa/src/views/` file (`SpecExport.tsx` + its `.module.css`). Landed as an errata below. | It is a deterministic script with an exit code, not a hand walk | T-06, T-08 |

## Task list

### T-01 — Assembled-document + `?format` zod schemas (shared)

- **Files** (1): `shared/src/schema/spec-export.ts` (new)
- **Implements**: requirements FR-01, FR-04 — owns the assembled-document wire
  shape + the `?format` request schema; supports FR-02, FR-05, FR-06, NFR-02
- **Complexity**: moderate
- **Blocked by**: — (hard build-order precondition applies)
- **Blocks**: T-02, T-03, T-04, T-05, T-07
- **Steps**: Define the REST-boundary + response zod schemas (**zod only**;
  **en-US identifiers**; NFR-05). This is the **only** shared-schema file this
  spec adds; it **does not** edit `shared/src/schema/nodes.ts` /
  `shared/src/schema/edges.ts` (`NODE_LABELS` / `EDGE_ENDPOINTS` untouched —
  NFR-02, AC-14).
  - `exportFormatSchema` = `z.enum(["json", "markdown"])` (default `"json"` at the
    route; **`"pdf"` is NOT a member** — an out-of-enum value incl. `pdf` → the
    route maps to `400 unsupported_export_format`, FR-04/FR-06).
  - `specExportQuerySchema` = `z.object({ format: exportFormatSchema.optional() })`.
  - Per-section response schemas. **Reuse the upstream section shapes rather than
    re-declaring domain fields** (requirements Dependencies): import the upstream
    inferred types (`story-spec-core`, `key-activity-optimizer`,
    `kpi-impact-mapping`, `ddd-system-modeling` response schemas) where they are
    exported from `shared/src/schema/*`; where an upstream did not export a shared
    schema, mirror its **documented** response contract with a local zod object
    and a `// mirrors <owner> FR-xx response contract` comment (a change surfaces
    as a failing T-05/T-07 integration test, requirements Risk-3). Each section
    schema must permit its **empty shape** (`[]` / `{}`) so a degraded section
    (FR-03) still validates:
    - `modelSummarySchema` = `{ id, name, description: z.string().nullable(),
      isReference: z.boolean() }` (from `model-workspace-core` FR-05).
    - `storyWithAcsSchema` = `{ id, name, ...narrative fields..., activityName:
      z.string().nullable(), roleName: z.string().nullable(), acceptanceCriteria:
      z.array(acSchema) }`; `acSchema` = `{ ordinal: z.number().int(), given:
      z.string(), when: z.string(), then: z.string() }` (ordered Given/When/Then,
      XD-10; `story-spec-core` FR-05).
    - `keyActivitySchema` = `{ id, name, compositeScore: z.number(), subScores:
      z.record(z.number()), isKeyActivity: z.boolean(), rank: z.number().int() }`
      (`key-activity-optimizer` FR-06).
    - `kpiImpactSectionSchema` = `{ matrix: <kpi-impact matrix shape>, gaps:
      <gap[]>, rollup: <rollup shape> }` (`kpi-impact-mapping` FR-05/FR-06/FR-08).
    - `systemModelSectionSchema` = `{ capabilities: <capability[]>, gaps:
      <support-gap shape>, contextMap: <context-map shape> }`
      (`ddd-system-modeling` FR-04/FR-07/FR-09).
  - `specDocumentMetaSchema` = `{ generatedAt: z.string(), modelId: z.string(),
    counts: z.object({ stories: z.number().int(), acceptanceCriteria:
    z.number().int(), keyActivities: z.number().int(), kpiLinks: z.number().int(),
    gaps: z.number().int(), capabilities: z.number().int() }), degraded:
    z.record(z.string()).optional() }` (FR-01; `degraded` keyed by section name →
    reason, FR-03).
  - `specDocumentSchema` = `z.object({ model: modelSummarySchema, stories:
    z.array(storyWithAcsSchema), keyActivities: z.array(keyActivitySchema),
    kpiImpact: kpiImpactSectionSchema, systemModel: systemModelSectionSchema,
    meta: specDocumentMetaSchema })` (FR-01).
  Export the inferred TS types (`SpecDocument`, `ExportFormat`, section types) for
  the api client (T-07), the assembler (T-02), and the renderer (T-03).
- **Verification**: `shared/src/schema/__tests__/spec-export.test.ts` (new) —
  `exportFormatSchema` **rejects** `"pdf"` and any out-of-enum string, **accepts**
  `"json"`/`"markdown"`; `specDocumentSchema` accepts a fully-empty document (all
  sections empty, `meta.degraded` present) and a fully-populated one; `acSchema`
  requires `given`/`when`/`then`; `bun run typecheck`.

### T-02 — Pure document assembler + per-section in-process reader seam

- **Files** (2): `api/src/derive/spec-document.ts` (new — `assembleSpecDocument`),
  `api/src/routes/spec-export.ts` (new — the `SectionReader` seam wiring; the route
  handler is added in T-04)
- **Implements**: requirements FR-01, FR-02, FR-03, FR-05, NFR-01, NFR-02, NFR-03,
  NFR-04 — closes AC-01 (assembly half) + AC-02 (degradation half); pins OQ-1, N-01
- **Complexity**: complex
- **Blocked by**: T-01 (hard build-order — needs the five upstream read handlers
  merged)
- **Blocks**: T-04, T-05
- **Steps**:
  - Define a `SectionReader` seam (OQ-1, pinned): a small record of async
    functions `{ readModel, readStories, readKeyActivities, readKpiImpact,
    readSystemModel }`, each `(driver, modelId) => Promise<<section>>`. The
    **default** implementation (in `api/src/routes/spec-export.ts`, T-04) imports
    each upstream route's **exported handler** and calls it in-process with
    `:modelId` against the same driver — **no** HTTP self-loopback, **no** router
    re-gate, **no** direct store query for domain data (FR-02, NFR-02). Bind each
    handler's exact signature at merge time (requirements Risk-3). The seam is
    injected into `assembleSpecDocument` so the assembler is **pure + testable with
    fixture readers** (no Neo4j needed for AC-05 determinism).
  - `assembleSpecDocument(modelId, readers): Promise<SpecDocument>` in
    `api/src/derive/spec-document.ts`:
    1. **Model existence is a fast-fail, checked by the caller (T-04), not here** —
       the assembler assumes `:modelId` exists; a missing model → `404
       model_not_found` at the route (FR-01), **not** a degraded document (FR-03).
    2. Call each section reader **independently, wrapped so a section failure is
       caught** (FR-03): on a thrown/rejected section read, set that section to its
       **empty shape** (`[]` / `{}` per T-01's schema) and record
       `meta.degraded[<section>] = <reason string>`. A **missing model** is not a
       section failure — it is pre-checked upstream (T-04). Mirrors
       `kpi-impact-mapping` FR-09's degrade-not-crash contract (requirements
       NFR-03).
    3. Assemble `{ model, stories, keyActivities, kpiImpact, systemModel, meta }`.
       Compute `meta.counts` from the assembled (possibly-degraded) sections
       (`stories = stories.length`, `acceptanceCriteria = Σ story.acceptanceCriteria`,
       `keyActivities = keyActivities.filter(isKeyActivity).length` **or** total —
       pin **total ranked activities** to match AC-01's "≥1 key activity" fixture;
       document the choice in a code comment, `kpiLinks` = matrix linked-cell count,
       `gaps = kpiImpact.gaps.length + systemModel.gaps` per their shapes,
       `capabilities = systemModel.capabilities.length`).
    4. **Determinism (FR-05, NFR-04):** preserve each upstream list's order
       verbatim (stories by upstream list order, ACs by `ordinal`, keyActivities by
       `rank`, matrix rows/columns by upstream matrix order); introduce **no**
       re-sort that could reorder ties. `meta.generatedAt = new Date().toISOString()`
       is the **only** non-deterministic field.
  - **No writes to any store** (FR-02, NFR-03): the assembler only reads through
    the seam. **No** new node label / edge type / store (NFR-02, AC-14).
- **Verification**: `api/__tests__/spec-document-assembler.test.ts` (new,
  Neo4j-free unit — inject fixture `SectionReader`s): a fully-populated set of
  readers → a zod-valid `SpecDocument` with correct `meta.counts` (AC-01 unit
  half); a reader that **throws** (e.g. `readKpiImpact` rejects) → that section is
  its empty shape + `meta.degraded.kpiImpact` carries the reason, the other
  sections unaffected, **no** exception propagates (AC-02 unit half); calling
  `assembleSpecDocument` twice with the same fixture readers → structurally-equal
  documents modulo `meta.generatedAt` (AC-04 determinism, JSON half); `bun run
  typecheck`.

### T-03 — Pure Markdown renderer (`renderSpecMarkdown`) + escaping

- **Files** (1): `api/src/derive/spec-markdown.ts` (new — `renderSpecMarkdown`)
- **Implements**: requirements FR-04, FR-05, FR-03 — closes AC-03 + AC-04
  (determinism, Markdown half); pins OQ-2, N-01
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-04
- **Steps**: `renderSpecMarkdown(doc: SpecDocument): string` — a **pure function of
  the T-01 JSON** (no Neo4j, no HTTP; unit-testable, N-01). Deterministic, fixed
  section order (FR-04):
  1. **Title + model summary header** — `# <model.name> — Business Specification`,
     the model description, and the reference/template flag.
  2. **User Stories** — for each story: its narrative, then its ACs as a
     **Given/When/Then list** (ordered by `ordinal`).
  3. **Key Activities** — a Markdown **table** of the ranked activities (rank,
     name, composite score, key flag).
  4. **KPI Impact** — the coverage **matrix** (table) + a **gaps** list + the
     roll-up status.
  5. **System Model** — **capabilities**, **support gaps**, and the **context
     map**.
  - **Degraded sections (FR-03):** a section whose name appears in `meta.degraded`
    renders an explicit **`*(section unavailable: <reason>)*`** note under its
    heading — **never** a blank heading (AC-03).
  - **Escaping (OQ-2, pinned):** interpolate **every** user-content field
    (story narratives, AC clauses, activity/role/capability/KPI names, notes)
    through an `escapeMarkdown(s)` helper that escapes `|` (esp. inside table
    cells), `` ` ``, `#`, `*`, `_`, `[`, `]`, `\`, and collapses/escapes embedded
    newlines inside table cells. Empty/nullable fields render a stable placeholder
    (`—`), never `undefined`/`null` text.
  - **Determinism (FR-05):** no `Date`, no `Math.random`, no map/set iteration
    that could reorder — iterate the arrays in document order. Same `doc` (modulo
    `meta.generatedAt`, which the renderer either omits from the body or emits
    verbatim so a clamped-`generatedAt` fixture is byte-identical) → **byte-identical**
    Markdown (AC-04).
- **Verification**: `api/__tests__/spec-markdown-render.test.ts` (new, Neo4j-free
  unit): a populated fixture doc renders the five ordered sections with the
  Given/When/Then lists + the key-activity/matrix tables (AC-03); a fixture with
  `meta.degraded.kpiImpact` renders the explicit `*(section unavailable: …)*` note
  under the KPI Impact heading, not a blank heading (AC-03/FR-03); a fixture whose
  story narrative contains `|`/`` ` ``/`#` is escaped (no broken table); rendering
  the same fixture twice → **byte-identical** strings (AC-04 determinism, Markdown
  half); `bun run typecheck`.

### T-04 — Route handler + format negotiation + model pre-check + router dispatch

- **Files** (2): `api/src/routes/spec-export.ts` (extend — `handleSpecExport` +
  the default in-process `SectionReader`), `api/src/router.ts` (modify)
- **Implements**: requirements FR-01, FR-02, FR-03, FR-04, FR-06 — closes AC-01
  (route half), AC-02 (route half), AC-04 (format-guard half)
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03, T-05a (error code — see T-05)
- **Blocks**: T-06, T-07
- **Steps**:
  - `handleSpecExport(req, modelId)` in `api/src/routes/spec-export.ts` returning
    the `{error:{code,message,details?}}` envelope via `_helpers.ts` (`ok`,
    `error`, `parseWith`; verified exports):
    1. **Model existence pre-check (fast-fail, FR-01):** `MATCH (m:BusinessModel
       {id:$modelId})` — a miss → `404 model_not_found` (**reused** from
       `errors.ts:36`, requirements Dependencies; **not** re-declared). This is the
       **only** hard failure; section failures degrade (FR-03).
    2. **Format negotiation (FR-04):** parse `?format` with
       `specExportQuerySchema` (T-01) — an out-of-enum value **incl. `pdf`** →
       `400 unsupported_export_format` (T-05a); default `json`. Also honor `Accept:
       text/markdown` as equivalent to `?format=markdown` (query wins on conflict).
    3. Assemble via `assembleSpecDocument(modelId, defaultReaders)` (T-02) where
       `defaultReaders` calls each upstream handler in-process (OQ-1, pinned).
    4. `format=json` (default) → `ok(doc)` with `application/json` (FR-01).
       `format=markdown` → `renderSpecMarkdown(doc)` (T-03) returned with
       `content-type: text/markdown; charset=utf-8` (FR-04).
  - In `api/src/router.ts` add a `models/:modelId/spec-export` dispatch **after**
    `model-workspace-core`'s `models*` block and the other model-scoped blocks,
    **specific-before-parameterized** so the 3-segment `spec-export` route never
    collides with `model-workspace-core`'s parameterized `models/:id` (2-segment)
    rows: `^models\/([^/]+)\/spec-export$` (GET only). Read-only — **no** write
    dispatch.
- **Verification**: exercised through the route surface by
  `api/__tests__/spec-export-document.integration.test.ts` (T-07, AC-01),
  `spec-export-degradation.integration.test.ts` (T-07, AC-02), and
  `spec-export-format.integration.test.ts` (T-07, AC-04); `bun run typecheck`.

### T-05 — Additive error code + route-permission mapping + RBAC grant

- **Files** (3): `api/src/errors.ts` (modify),
  `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: requirements FR-06, FR-07, NFR-05 — closes AC-13 (authz +
  error-code half)
- **Complexity**: moderate
- **Blocked by**: T-01 (hard build-order — `rbac-permissions.ts` `P()` helper +
  `seed-rbac-roles.ts` `business_architect` role land with `model-workspace-core`)
- **Blocks**: T-04, T-06, T-07
- **Steps**: three sub-changes (grouped: all three are ≤1-line-per-file edits to a
  single closed enum / mapping / seed):
  - **T-05a — `api/src/errors.ts`:** append the single additive code
    `unsupported_export_format` (400 — a `?format=` value that is not
    `json`/`markdown`, incl. `pdf`) to the **closed** `ERROR_CODES` array (NFR-11
    additive; **no existing code removed/reordered**). **Do NOT add
    `model_not_found`** — it is **already present** (`errors.ts:36`, verified);
    reference the existing member (requirements FR-06). The added code is reachable
    from the T-04 route (out-of-enum `?format`) so `envelope.test.ts`'s
    reachability + closed-enum exhaustiveness assertions both hold.
  - **T-05b — `api/src/auth/rbac-permissions.ts`:** add **one** `ROUTE_PERMISSIONS`
    row via the `P(method, path, permission)` helper,
    **specific-before-parameterized**, inserted **before** `model-workspace-core`'s
    parameterized `models/:id` rows:
    `P("GET", "models/:modelId/spec-export", "spec_export:read")`. The
    security-critical property is that the new route **has a row** — an unmapped
    route → `getRoutePermission` returns `null` → the router skips the RBAC check
    (silent open read). **No new route is `public`**; auth stays in the central
    gate (`router.ts` → `getRoutePermission` → RBAC check) — **no per-route check**
    (FR-07, NFR-05).
  - **T-05c — `api/src/scripts/seed-rbac-roles.ts`:** **add** `"spec_export:read"`
    to the existing `business_architect` role's permission array (idempotent `MERGE
    (r:RBACRole {name})` — this spec **modifies** the role `model-workspace-core`
    FR-11 created; it does **not** create it). Read-only permission — there is no
    write route (FR-07).
- **Verification**: `api/__tests__/spec-export-authz.integration.test.ts` (T-07,
  AC-13 — a session without `spec_export:read` → `403`, with it → `200`;
  `business_architect` resolves `spec_export:read`; `getRoutePermission` resolves
  the new route (never `null`); no new route `isPublicRoute`) +
  `spec-export-openapi.integration.test.ts` (T-07 — `unsupported_export_format`
  member of `ERROR_CODES` + in the OpenAPI enum); `bun run typecheck` passes the
  exhaustiveness assertion.

### T-06 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: requirements FR-06 — closes AC-13 (openapi half)
- **Complexity**: moderate
- **Blocked by**: T-01, T-04, T-05
- **Steps**: Register the spec-export request + response schemas
  (`specExportQuerySchema`, `specDocumentSchema`) and `registerPath` the `GET
  /api/v1/models/:modelId/spec-export` route, generated from the **same T-01 zod
  definitions** (no hand-maintained copy, FR-06). Document the two response
  content types (`application/json` for `format=json`; `text/markdown` for
  `format=markdown`) and the `?format` query enum. The added
  `unsupported_export_format` code (and the reused `model_not_found`) surface in
  the shared error-envelope responses.
- **Verification**: `api/__tests__/spec-export-openapi.integration.test.ts` (with
  T-05) — the `spec-export` route path, the `?format` enum, and the added
  `unsupported_export_format` code appear in `GET /api/v1/openapi.json` (AC-13);
  `bun test:integration`.

### T-07 — Server integration tests (document / degradation / format / authz / openapi)

- **Files** (5): `api/__tests__/spec-export-document.integration.test.ts` (new),
  `spec-export-degradation.integration.test.ts` (new),
  `spec-export-format.integration.test.ts` (new),
  `spec-export-authz.integration.test.ts` (new),
  `spec-export-openapi.integration.test.ts` (new)
- **Implements**: requirements FR-01..FR-07 — closes AC-01, AC-02, AC-04
  (format-guard + determinism, server half), AC-13
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-06
- **Blocks**: —
- **Steps**: Seed fixtures **API-only** (mirrors `kpi-impact-mapping` T-11 seeding
  convention): `POST /api/v1/models` + `model-workspace-core`'s domain/journey
  routes + core `POST /api/v1/nodes` (activities) + `story-spec-core`'s story +
  AC routes + `key-activity-optimizer`'s marking route + `kpi-impact-mapping`'s
  link routes + `ddd-system-modeling`'s capability/context routes. Then:
  - `spec-export-document.integration.test.ts` (**AC-01**): for a seeded model with
    ≥1 story (+AC), ≥1 marked key activity, ≥1 directional KPI-impact link, and ≥1
    capability, `GET …/spec-export` (default `format=json`) → a zod-valid
    `{ model, stories, keyActivities, kpiImpact, systemModel, meta }`;
    `stories[].acceptanceCriteria` are ordered Given/When/Then triples;
    `keyActivities` carry composite/sub-scores + key flag; `kpiImpact` carries
    matrix + gaps + roll-up; `systemModel` carries capabilities + gaps +
    context-map; `meta.counts` matches the seeded counts; a **bad `:modelId`** →
    `404 model_not_found` (not a degraded document).
  - `spec-export-degradation.integration.test.ts` (**AC-02**): with one upstream
    section made to fail (e.g. force `readKpiImpact` to error via an injected
    reader / a torn-down source), `GET …/spec-export` still returns `200` with that
    section its empty shape + `meta.degraded.<section>` carrying the reason — the
    whole document does **not** 500; a **missing** model still → `404
    model_not_found`, not a degraded document (FR-03, NFR-03).
  - `spec-export-format.integration.test.ts` (**AC-04**): `?format=markdown`
    (and `Accept: text/markdown`) → `content-type: text/markdown; charset=utf-8`
    with the five ordered sections; `?format=pdf` → `400
    unsupported_export_format`; any unknown `?format=` → `400` zod envelope; two
    successive `format=markdown` requests against an unchanged model → **byte-identical**
    bodies (determinism; `meta.generatedAt` excluded/clamped — the Markdown body
    either omits it or the test clamps it) and two `format=json` requests →
    structurally-equal JSON modulo `meta.generatedAt`.
  - `spec-export-authz.integration.test.ts` (**AC-13**): a session without
    `spec_export:read` → `403` on `GET …/spec-export`; a `spec_export:read` session
    → `200`; the `business_architect` role resolves `spec_export:read`;
    `getRoutePermission` resolves the new route (never `null`); no new route
    `isPublicRoute`.
  - `spec-export-openapi.integration.test.ts` (**AC-13**): the route path, the
    `?format` enum, and `unsupported_export_format` appear in `GET
    /api/v1/openapi.json`.
- **Verification**: the five files above; `bun test:integration`.

### T-08 — SpecExport view + 4 states + Markdown preview + section chips + registration

- **Files** (3): `pwa/src/views/model/SpecExport.tsx` (new),
  `pwa/src/views/model/SpecExport.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: requirements FR-08, FR-10, NFR-06 — closes AC-05, AC-06, AC-07,
  AC-08 (view + ready/loading/empty/error), AC-10 (design-conformance), AC-11
  (a11y half), AC-12 (model-scope half); pins N-02
- **Complexity**: complex
- **Blocked by**: T-07 (hard build-order — `useActiveModel()` +
  `ActiveModelContext.tsx` + the `export` `ModelTabPlaceholder` slot land with
  `model-workspace-core`)
- **Blocks**: T-09, T-10, T-11
- **Steps**: In `pwa/src/views/index.tsx`, **replace** the `export` tab's
  `<ModelTabPlaceholder spec="requirements-export"/>` dispatch with
  `"export": (r) => <SpecExport route={r} />` (the **only** edit to that file —
  `route.ts`/`SURFACES` stay `model-workspace-core`'s, UX-06). `SpecExport` reads
  the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx` — **does not re-implement model
  selection**), keys its fetch on `activeModel.id`, and fetches `GET
  …/spec-export?format=markdown` (Markdown preview) via `api.specExport.markdown`
  (T-09) plus the JSON `meta` (for the section-count chips) via
  `api.specExport.json`. Render **all four states**:
  - **loading** (AC-06) — skeleton via `Loading` from `views/_shared.tsx` while the
    fetch is in flight.
  - **empty** (AC-07) — the model has no authored content (no stories, key
    activities, KPI links, or capabilities; detect via `meta.counts` all-zero) → a
    `Card` message pointing to the authoring/optimize/measure tabs
    (`#/model/canvas`, `#/model/key-activities`, `#/model/kpi-impact`,
    `#/model/systems`) with the **download controls disabled** (FR-09).
  - **error** (AC-08) — `ErrorState` from `views/_shared.tsx` (message only) **plus
    a sibling catalog `Button`** whose click re-invokes the fetch and re-enters
    loading (retry is a sibling, not part of `ErrorState`).
  - **ready** (AC-05) — the **Markdown preview** (a labeled, natively-scrollable
    region rendering the `text/markdown` body) + **section-count summary chips**
    from `meta.counts` (stories / ACs / key activities / KPI links / gaps /
    capabilities).
  **Tokens + catalog (NFR-06, UX-02):** `SpecExport.module.css` uses only
  `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog components
  (`Card`, `Button`, `Loading`/`ErrorState`) **before** inventing new ones — **no
  new catalog component, no catalog component edited** (so `pwa/src/components/*`
  are not touched). The Markdown preview is a **native-scroll** region (no
  scroll-hijack). No canvas / gesture / global-keyboard handler introduced
  (requirements Native Conflicts).
- **Verification**: `pwa/src/__tests__/spec-export.test.tsx` (new: `#/model/export`
  → `SpecExport` not `ModelTabPlaceholder`; reads `useActiveModel()`; ready-state
  Markdown preview + section-count chips from `meta` — AC-05) + **CLI** (AC-10,
  N-02, deterministic exit code): `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/SpecExport.tsx` **and** `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/SpecExport.module.css`
  — both exit 0, zero token/component violations.

### T-09 — PWA api client (`specExport` block)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: requirements FR-08, FR-09 — supports AC-05, AC-09
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-10
- **Steps**: Add a `specExport` block to the exported `api` object, reusing the
  **private** `json<T>()` fetch wrapper internally (the *block* is exported,
  `json` is **not** — do **not** export or call `json<T>` from the view; mirrors
  `kpi-impact-mapping` DD-12). Paths use `encodeURIComponent`:
  - `json(modelId, signal?)` → `json<SpecDocument>("/api/v1/models/" +
    encodeURIComponent(modelId) + "/spec-export?format=json", withSignal(signal))`
    (the assembled document + `meta` for the section chips + degraded banner).
  - `markdown(modelId, signal?)` → a raw-**text** fetch of
    `…/spec-export?format=markdown` (a `text()` read, **not** `json<T>` — the body
    is Markdown; add/reuse a small `text()` variant of the fetch wrapper if `json`
    cannot return text) returning the Markdown string for the preview + the
    Markdown download.
  Types (`SpecDocument`, `ExportFormat`) inferred from the shared T-01 zod schemas.
- **Verification**: `bun run typecheck`; consumed + asserted transitively by
  `pwa/src/__tests__/spec-export.test.tsx` (T-08) and
  `spec-export-download.test.tsx` (T-10).

### T-10 — Download controls + degraded banner + view-state tests

- **Files** (2): `pwa/src/views/model/SpecExport.tsx` (extend — download controls +
  degraded banner), `pwa/src/__tests__/spec-export-download.test.tsx` (new) +
  `pwa/src/__tests__/spec-export-states.test.tsx` (new)
- **Implements**: requirements FR-09, FR-03, UX-01, UX-05 — closes AC-06, AC-07,
  AC-08 (state tests), AC-09 (downloads + degraded banner), AC-11 (a11y half)
- **Complexity**: complex
- **Blocked by**: T-08, T-09
- **Blocks**: T-11
- **Steps**: In `SpecExport.tsx`:
  - Two catalog `Button` download controls (FR-09): **"Download Markdown"** fetches
    `?format=markdown` (`api.specExport.markdown`) and triggers a client-side file
    download — a `Blob([md], { type: "text/markdown" })` + object-URL `<a download>`
    named `<model-name>-spec.md`; **"Download JSON"** fetches
    `api.specExport.json`, `Blob([JSON.stringify(doc, null, 2)], { type:
    "application/json" })`, downloads `<model-name>-spec.json`. **No server file
    storage** — the payload is the response body. Both controls are
    **keyboard-reachable** (native buttons, Enter/Space) and **disabled in the
    empty state** (FR-08/FR-09/AC-07).
  - **Degraded banner (FR-03/AC-09):** when the assembled `meta.degraded` is
    non-empty, a **non-blocking** banner renders **above** the preview ("Some
    sections were unavailable and exported empty: `<sections>`") so the user knows
    the artifact is partial before downloading. Not an error state — the download
    still works.
  - **A11y (AC-11, UX-05):** the view exposes an **ARIA landmark**; Tab reaches
    "Download Markdown" → "Download JSON" → the retry affordance (in the error
    state) in DOM order; the Markdown preview is a **labeled scrollable region**
    reachable by keyboard.
  Tokens-only + catalog components (NFR-06) — no new/edited catalog component.
- **Verification**: `pwa/src/__tests__/spec-export-download.test.tsx` (AC-09 —
  "Download Markdown" click → a `<model>-spec.md` `text/markdown` Blob download is
  triggered (mock `URL.createObjectURL` + anchor click); "Download JSON" → a
  `<model>-spec.json` `application/json` download; a non-empty `meta.degraded` →
  the banner renders above the preview) + `pwa/src/__tests__/spec-export-states.test.tsx`
  (AC-06 loading skeleton while pending; AC-07 empty state pointing to the
  authoring/optimize/measure tabs with downloads **disabled**; AC-08 error state +
  sibling retry `Button` that refetches) + **CLI** (AC-10): `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/SpecExport.tsx`
  (re-run after the edit) exit 0.

### T-11 — Model-context deep-link + reload e2e; keyboard a11y manual

- **Files** (1): `pwa/playwright/spec-export-context.spec.ts` (new)
- **Implements**: requirements FR-10, UX-06, UX-05 — closes AC-12, AC-11 (manual
  keyboard half)
- **Complexity**: moderate
- **Blocked by**: T-08, T-10
- **Blocks**: —
- **Steps**: Playwright spec (**AC-12**): with a non-reference model (model B)
  active, navigate to `#/model/export`, reload → the same route renders
  `SpecExport` showing **model B's** assembled spec (active-model persistence is
  `model-workspace-core` FR-15; this view refetches for the persisted model).
  Assert no cross-model leakage in the preview/chips (server-enforced, every
  upstream read is `scopedNodeIds`-scoped, NFR-01). Seed via the API (models +
  domains + activities + stories + key-activity marks + KPI links + capabilities).
- **Verification**: `pwa/playwright/spec-export-context.spec.ts` (AC-12) +
  **manual** (AC-11, keyboard): with the stack up, load `#/model/export`
  keyboard-only — Tab to "Download Markdown" and press Enter (expect a `.md` file
  downloads), Tab to "Download JSON" and press Enter (expect a `.json` file
  downloads), Tab into the preview region (expect focus enters the labeled
  scrollable Markdown area and arrow keys scroll it).

## Cross-cutting verification (whole-spec)

- **AC-14** (transpile clean + no compile-time schema-array edit + no new store):
  `bun run typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS` or
  `EDGE_ENDPOINTS`, and `git status` shows **no** new store / migration
  (this feature reads upstream routes and composes a document — NFR-02, NFR-05).
  Not a standalone task — checked at the final validation sweep.

## Deviations from requirements (orchestrator: land as errata, no ID renumbering)

| Requirement text | Executed as | Why | Source |
|------------------|-------------|-----|--------|
| AC-10 verification listed as a CLI check | **CLI** (`bun run scripts/design-conformance.ts --view …` per touched view file — deterministic exit code) | It is a deterministic script with an exit code, not a hand walk; requirements Risk-6/N-02 flagged the promotion | requirements AC-10, Risk-6 |
| OQ-1 (in-process handler composition vs HTTP self-loopback), OQ-2 (hand-rolled Markdown vs a library) | **Executed as the recorded requirements defaults** (in-process seam T-02; hand-rolled escaping renderer T-03) | Each is a one-module swap behind a seam if the user prefers otherwise. **The orchestrator should still surface OQ-1/OQ-2 in the consolidated report (XD-17).** | requirements OQ-1, OQ-2 |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-08, T-10) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation (AC-10) |
| final task | `bun test` + `bun test:integration` (needs the **Neo4j** CI service) + full AC-01..AC-14 sweep + AC-14 (`git diff` NODE_LABELS/EDGE_ENDPOINTS + `git status` no new store) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 assembled JSON document | T-01, T-02, T-04, T-07 | AC-01 |
| FR-02 read-only composition (in-process, no re-derivation) | T-02, T-04 | AC-01, AC-02 |
| FR-03 section-level degradation | T-02, T-03, T-04, T-07, T-10 | AC-02, AC-03, AC-09 |
| FR-04 Markdown rendering + format negotiation | T-01, T-03, T-04, T-07 | AC-03, AC-04 |
| FR-05 determinism | T-02, T-03, T-07 | AC-04 |
| FR-06 API contract + openapi + error code | T-01, T-04, T-05, T-06 | AC-04, AC-13 |
| FR-07 route-permission mapping + RBAC grant | T-05 | AC-13 |
| FR-08 SpecExport view + 4 states | T-08, T-09, T-10 | AC-05, AC-06, AC-07, AC-08 |
| FR-09 download Markdown + JSON + degraded banner | T-09, T-10 | AC-09 |
| FR-10 model-scoped export + reload survival | T-08, T-11 | AC-12 |
| NFR-01 model isolation | T-02, T-07, T-11 | AC-01, AC-12 |
| NFR-02 no new store / no compile-time schema edit | T-01, T-02, T-04 | AC-14 |
| NFR-03 read-only + resilient + deterministic | T-02, T-03, T-04, T-07 | AC-02, AC-04 |
| NFR-04 bounded live compute, no cache | T-02, T-04 | AC-01 |
| NFR-05 house rules (central-gate auth, zod, en-US, /api/v1/) | T-05, T-04, all | AC-13, AC-14 |
| NFR-06 tokens-only + conformance | T-08, T-10 | AC-10, AC-11 |
