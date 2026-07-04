---
feature: "system-augmentation-model"
created: "2026-07-04"
author: "spec-author"
status: "approved"
approved_by: "review-gate (XD-17 single-shot, review-requirements.md pass 1: approve)"
approved_at: "2026-07-04"
revision: 1
size: "medium"
---

# Requirements: system-augmentation-model

## Summary

`system-augmentation-model` is **foundation wave 1** of the Business Modeling
Studio (blueprint `.claude/specs/blueprint.md`, XD-15). It establishes the
app's single augmentation vocabulary: every `System` node carries a **required
enum attribute `systemKind`** — `functional` | `agentic` | `ai_predictive` —
declared through the ontology registry's per-label attribute schema (not a new
label, not a subtype), enforced by the existing zod attribute-validation path,
backfilled onto existing systems (default `functional`) by an idempotent
migration, and surfaced as badges + a filter on the existing
`#/explorer/systems` view.

It **does not** ship the SystemModeler UI or capability mapping
(`ddd-system-modeling`), performance dashboards
(`kpi-okr-performance-dashboards`), or any KPI/OKR work (`kpi-okr-governance`).
Those specs consume this vocabulary; this spec only defines and enforces it.

## Motivation

1. Blueprint round 4 ("manage the business from this view") requires every
   augmenting IT system to be classified functional / agentic / AI-predictive.
   Two downstream specs — `ddd-system-modeling` (augmentation mix per
   capability) and `kpi-okr-performance-dashboards` (slice by systemKind) —
   depend on this vocabulary existing *before* they land (blueprint dependency
   graph, foundation wave 1).
2. Without a single shared enum, each consumer would invent per-feature kind
   fields (explicitly rejected in XD-15), and the classification would drift.
3. The ontology registry + attribute-zod enforcement machinery
   (`_OntologyAttributeSchema.json_schema_doc` → compiled zod validator →
   `attribute_violation` on write) already exists and is tested
   (`api/__tests__/ontology-attribute-enforcement.integration.test.ts`). This
   spec is the first production use of that machinery to *tighten* a core
   label's schema — it proves the sanctioned extension path end-to-end.

## Functional Requirements

### Shared vocabulary (XD-15)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | A single compile-time vocabulary in `shared/src/schema/system-kind.ts`: `export const SYSTEM_KINDS = ["functional", "agentic", "ai_predictive"] as const`, a zod enum `systemKindSchema = z.enum(SYSTEM_KINDS)`, and `export type SystemKind`. `api/` and `pwa/` import from here; the literal strings appear in no other production source (downstream specs import, never re-declare). | must | XD-15 |
| FR-02 | The `System` node label's registry row (`_OntologyAttributeSchema.json_schema_doc`) declares `systemKind` as `{type: "string", enum: SYSTEM_KINDS}` with `required: ["systemKind"]` and `additionalProperties: true` (the open attributes map stays open). The doc MUST NOT use the JSON-Schema `default` keyword for `systemKind` — `api/src/storage/nodes.ts` persists the *input* attributes, not zod's parsed output, so a default would validate-pass without ever being stored. The tightened doc is visible via `GET /api/v1/ontology/node-labels` (System row) and the `/api/v1/schema` aggregate. | must | XD-15 |

### API enforcement (write paths)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-03 | `POST /api/v1/nodes/System` with `attributes` lacking `systemKind` returns `400 attribute_violation` with `details.missing` containing `"systemKind"`; a value outside the enum returns `400 attribute_violation` with `details.type_mismatch` containing `"systemKind"`; each of the three valid values returns `201` and round-trips through `GET`. Enforcement rides the existing attribute-zod cache (`api/src/ontology/cache/attribute-zod.ts`) — no new validation layer, no per-route check. | must | XD-15 |
| FR-04 | `PATCH /api/v1/nodes/System/:id` that supplies an `attributes` map lacking or mis-valuing `systemKind` returns `400 attribute_violation`; a valid map returns `200`. A PATCH that omits `attributes` entirely leaves the stored value untouched (existing patch semantics — omitted fields never clobbered). | must | XD-15 |
| FR-05 | `POST /api/v1/import`: `System` node rows whose `attributes` lack `systemKind` have `"systemKind": "functional"` injected before upsert (same semantics as the FR-06 backfill — imported legacy data is "existing systems"), so pre-migration export files remain loadable and the graph-core export→import round-trip property holds. Rows with an *invalid non-missing* value still fail per-row validation (collect-and-continue error surface, unchanged). Applies to dry-run identically. **Pending OQ-1 confirmation** (recommended default recorded here). | must | XD-15 + graph-core FR-17 round-trip |

### Migration + seed (default `functional`)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-06 | An idempotent migration for **existing** databases: (a) tightens the `System` registry row to the FR-02 doc (the graph-core registry seed uses `MERGE … ON CREATE SET`, so existing DBs still hold the permissive `{type:"object", additionalProperties:true}` doc); (b) backfills every existing `System` node whose `attributes_json` lacks `systemKind` with `"functional"` in one batched Cypher statement (no per-node round trips); (c) records the registry change through the standard audit + version + `_OntologyEvent` rows so SSE subscribers and the attribute-zod cache (which clears on `ontology.changed`) observe it. A second run changes zero data rows and appends no duplicate backfill. | must | XD-15 |
| FR-07 | The migration runs automatically during server bootstrap (before the API accepts writes) and is also runnable standalone via a `bun run` script, following the `bun run schema:apply` house pattern. Fresh databases get the tightened FR-02 doc directly at registry seed time — no permissive window. | must | XD-15 |
| FR-08 | `shared/seed/retail-mini.json`: all 6 `System` rows gain explicit `"attributes": {"systemKind": "functional"}`. `bun run seed` loads cleanly against the tightened schema; the fixture's exact counts (graph-core FR-08/AC-07) and seed idempotency (graph-core NFR-04) are unchanged. | must | XD-15 |

### Explorer surface (`#/explorer/systems`)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | The existing `ExplorerSystems` view (`pwa/src/views/explorer/Systems.tsx`) gains a **kind** column rendering a systemKind badge per row — catalog `Pill` component, tokens-only styling, human labels `Functional` / `Agentic` / `AI predictive` with visually distinct tones plus the text label (never color-only). A missing/unrecognized value (defensive; should not occur post-migration) renders a neutral "unclassified" badge, not a crash. The view's Cypher is extended to surface `systemKind` from `attributes_json`. | must | blueprint View Tree round-4 row |
| FR-10 | A systemKind filter above the table: `All` / `Functional` / `Agentic` / `AI predictive`. Filter state is **URL-first** via the route query param `#/explorer/systems?kind=<functional\|agentic\|ai_predictive>` (same `route.params` pattern as `#/explorer/activities` multi-filter), so the filtered view is shareable and reload-safe (UX-06). The active filter narrows both the table and the "Activity usage by system" bar chart; `All` (no param) shows everything; an unknown `kind` param is ignored (treated as `All`). | must | blueprint View Tree round-4 row, UX-06 |
| FR-11 | View states per UX-01: loading, error, ready, plus two empty variants — zero systems in the graph ("No systems yet") and zero systems matching the active filter ("No <kind> systems — clear the filter"), the latter offering a clear-filter affordance. | must | UX-01 |
| FR-12 | Accessibility per UX-05: filter controls reachable by Tab in DOM order, activatable with Enter/Space, exposing pressed/selected state to assistive tech (`aria-pressed` or equivalent), with a visible focus indicator; badge meaning conveyed by text, not color alone. | must | UX-05 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | No new node labels, edge types, or datastores — this is an attribute-only change; the label registry and `NODE_LABELS` tuple are untouched (rejected alternative in XD-15: subtype labels). | XD-15, XD-02 |
| NFR-02 | v1-compatible: the top-level REST contract (`nodeCreateSchema`'s open `attributes` map, routes, error-code enum — `attribute_violation` already exists) is unchanged; the tightening lives in runtime registry data via the sanctioned ontology-manager mechanism (its FR-12 invalidate/backfill guard exists for exactly this). No `/api/v2/` bump; `openapi.json` output is unchanged. | CLAUDE.md versioning policy |
| NFR-03 | The FR-06 backfill is one batched Cypher statement completing in < 10 s for 10,000 System nodes; server bootstrap time grows by < 1 s on an already-migrated database (the re-run no-op path). | house perf hygiene |
| NFR-04 | House rules: zod is the only validation library; en-US identifiers (`systemKind`, `SYSTEM_KINDS`); no `tsc`; all writes pass through the central router gate (`api/src/router.ts`) — no per-route auth, no new auth code. | CLAUDE.md |
| NFR-05 | The enum is closed for this app generation: adding a fourth kind is a future spec's registry patch + shared-tuple change, propagated to all consumers via the single FR-01 import point. | XD-15 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree round-4 additions,
verbatim — existing view gains badges + filter; no new route):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/explorer/systems` | `ExplorerSystems` (existing, extended) | Explorer surface, "Systems" subnav tab (existing) | AC-11 (loading·error·ready), AC-12 (both empty variants) |

**UX allowance conformance** (blueprint UX-*; not re-decided):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | FR-11 → AC-11, AC-12 |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-09 uses catalog `Pill`; AC-14 runs `scripts/design-conformance.ts` |
| UX-03 input modes | No canvas/gesture work — Platforms & Input Modes + Native Conflicts tables below |
| UX-04 responsiveness | Desktop-first, no new breakpoints; badge column + filter reuse the existing table layout |
| UX-05 accessibility | FR-12 → AC-13 |
| UX-06 navigation | FR-10 URL-first `?kind=` param → AC-10 (deep link survives reload); route taken verbatim, unrenamed |

## Scope Boundaries

**In scope:**
- `SYSTEM_KINDS` shared vocabulary module (FR-01).
- `System` registry attribute-schema tightening + write-path enforcement via
  the existing attribute-zod machinery (FR-02..FR-04).
- Import defaulting for legacy payloads (FR-05, pending OQ-1).
- Idempotent migration (registry doc + data backfill) wired into bootstrap +
  standalone script; seed-fixture update (FR-06..FR-08).
- `#/explorer/systems` badges, URL-first filter, view states, a11y
  (FR-09..FR-12).
- API integration tests + PWA unit tests for all of the above.

**Out of scope (owning spec named):**
- SystemModeler view, capability mapping, augmentation-mix analysis →
  `ddd-system-modeling`.
- `#/exec/performance` dashboard, slicing analytics by systemKind →
  `kpi-okr-performance-dashboards`.
- KPI/OKR route verification → `kpi-okr-governance`.
- Any BusinessModel scoping of systems → `model-workspace-core`.
- Editing `systemKind` from the PWA (a write UI) — SME/authoring write paths
  belong to `business-model-authoring` / existing SME surfaces; this spec's
  UI is read-only badges + filter.
- Reclassification workflow/audit for changing a system's kind — future work;
  a plain `PATCH /api/v1/nodes/System/:id` suffices for now.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `shared/src/schema/system-kind.ts` exports `SYSTEM_KINDS` tuple (exactly the three XD-15 values, in order), `systemKindSchema`, `SystemKind`; grep shows no other production file declaring the literal `"ai_predictive"` outside imports of this module + the seed fixture (FR-01) | server (bun test) | `api/__tests__/system-kind-vocabulary.test.ts` |
| AC-02 | `GET /api/v1/ontology/node-labels` System row's `json_schema_doc` has `properties.systemKind.enum = SYSTEM_KINDS`, `required` containing `"systemKind"`, and no `default` keyword under `systemKind` (FR-02) | server (bun test vs live Neo4j) | `api/__tests__/system-kind-registry.integration.test.ts` |
| AC-03 | `POST /api/v1/nodes/System` without `systemKind` → `400 attribute_violation`, `details.missing` includes `"systemKind"` (FR-03) | server | `api/__tests__/system-kind-enforcement.integration.test.ts` |
| AC-04 | `POST /api/v1/nodes/System` with `systemKind: "predictive"` (or any non-enum value) → `400 attribute_violation`, `details.type_mismatch` includes `"systemKind"` (FR-03) | server | `api/__tests__/system-kind-enforcement.integration.test.ts` |
| AC-05 | For each of `functional`, `agentic`, `ai_predictive`: POST → `201`, `GET /api/v1/nodes/System/:id` returns the same `attributes.systemKind` (FR-03) | server | `api/__tests__/system-kind-enforcement.integration.test.ts` |
| AC-06 | `PATCH` with `attributes` lacking `systemKind` → `400`; with a valid map → `200`; PATCH of `name` only (no `attributes` key) → `200` and stored `systemKind` unchanged (FR-04) | server | `api/__tests__/system-kind-enforcement.integration.test.ts` |
| AC-07 | `POST /api/v1/import` with a legacy payload (System rows without `systemKind`) succeeds; imported systems read back with `systemKind: "functional"`; a row with `systemKind: 42` lands in `errors[]` while valid rows import; `?dryRun=true` behaves identically without writing (FR-05) | server | `api/__tests__/system-kind-import.integration.test.ts` |
| AC-08 | Migration on a pre-migration DB (permissive System doc + Systems without `systemKind`): after run, registry doc matches FR-02, every System has `systemKind: "functional"`, an `_OntologyEvent` row was emitted; second run mutates zero data rows and emits no duplicate backfill (FR-06, FR-07) | server | `api/__tests__/system-kind-migration.integration.test.ts` |
| AC-09 | `bun run seed` (retail-mini) loads with zero row errors against the tightened schema; all 6 seeded Systems have `systemKind: "functional"`; node/edge counts equal graph-core AC-07's exact counts; seeding twice adds nothing (FR-08) | server | `api/__tests__/system-kind-seed.integration.test.ts` |
| AC-10 | On `#/explorer/systems`, every row shows a kind badge with the correct human label; a row with missing kind shows "unclassified"; clicking the `Agentic` filter narrows table + bar chart to agentic systems and the hash becomes `#/explorer/systems?kind=agentic`; loading that URL directly renders pre-filtered (FR-09, FR-10) | macOS Chrome (mouse+kb), iPhone Safari (touch — tap targets) | `pwa/src/__tests__/system-kind-filter.test.tsx` + manual: open `http://127.0.0.1:5173/#/explorer/systems?kind=agentic` in macOS Chrome and reload (mouse) — expect only agentic rows and the Agentic filter shown active after reload |
| AC-11 | Loading / error / ready states render: pending fetch shows the shared `Loading`, a failed fetch shows `ErrorState`, success shows chart + table (FR-11) | macOS Chrome | `pwa/src/__tests__/system-kind-filter.test.tsx` (mocked fetch states) |
| AC-12 | Empty variants: zero systems → "No systems yet"-style empty state; active filter with zero matches → zero-match message with a working clear-filter affordance returning to `All` (FR-11) | macOS Chrome | `pwa/src/__tests__/system-kind-filter.test.tsx` |
| AC-13 | Keyboard: Tab reaches the filter controls in order, Enter/Space activates, active control exposes `aria-pressed="true"` (or equivalent); badges carry text labels (FR-12) | macOS Chrome (keyboard), macOS Safari (keyboard) | `pwa/src/__tests__/system-kind-badges.test.tsx` (a11y assertions) + manual: keyboard-only on macOS Safari — Tab to `Agentic`, press Enter, verify table narrows and focus ring stays visible |
| AC-14 | `bun scripts/design-conformance.ts` passes on the touched Systems view (tokens-only, catalog components) (UX-02) | n/a (CI/local script) | manual: run `bun scripts/design-conformance.ts` from repo root — expect exit 0 with Systems view listed clean |
| AC-15 | Full transpile + regression: `bun run typecheck` exits 0; existing `api/__tests__/openapi.integration.test.ts` and `export-import-roundtrip.integration.test.ts` stay green (NFR-02, FR-05) | n/a (build/server) | `bun run typecheck` + existing test paths |

## Platforms & Input Modes

This spec touches `pwa/` (badge column + filter buttons on an existing table
view). No canvas, gesture, drag, or shortcut work.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Systems table + kind badge column (read-only) | yes | yes | yes | yes | Badges are non-interactive text pills |
| systemKind filter controls | yes | yes | yes | yes | Tap targets ≥ existing house minimum (`touch-targets.test.tsx` pattern); Enter/Space activation |
| Bar chart (filter-narrowed) | yes | yes | yes | no | Display-only, unchanged interactivity |
| Deep link `#/explorer/systems?kind=…` | yes | yes | yes | yes | URL-first state; reload-safe |
| Gestures / drag / new keyboard shortcuts | no | no | no | no | None introduced |

## Native Conflicts

Filter controls are plain buttons/links; no scroll containers, gestures,
focus traps, or shortcut handlers are introduced.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

| Dependency | How consumed |
|------------|--------------|
| Blueprint XD-15 (+ XD-02, XD-17) | Binding decisions: attribute-not-label, enum values, default `functional`, single-shot gates |
| graph-core storage (as-built) — `api/src/storage/nodes.ts` attribute enforcement, import upsert path, seed loader | FR-03..FR-05 ride it unchanged; FR-05 touches the import route's System-row pre-processing only |
| ontology-manager registry (as-built) — `_OntologyAttributeSchema`, `patchNodeLabel` forceBackfill/`would_invalidate` machinery, audit/version/`_OntologyEvent` rows, attribute-zod cache with `ontology.changed` invalidation | FR-02, FR-06 use this as the sanctioned tightening path |
| `pwa/src/route.ts` query-param routing + `#/explorer/activities` URL-first filter pattern; catalog components (`Pill`, `DataTable`, `Card`, `_shared` `Loading`/`ErrorState`) | FR-09..FR-11 |
| Auth: central router gate (`api/src/router.ts`) | No changes; writes already gated |
| Downstream consumers (informative): `ddd-system-modeling`, `kpi-okr-performance-dashboards` | Import `SYSTEM_KINDS` from FR-01; never re-declare |

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| OQ-1 | **Import defaulting (decision needed):** should `POST /api/v1/import` inject `systemKind: "functional"` into System rows that lack it (FR-05 as written), or strictly reject them per-row? Inject keeps every pre-migration export/backup loadable and mirrors the migration's "existing systems default to functional" semantics; strict-reject is more explicit but breaks the graph-core round-trip property for old files and forces manual payload surgery. | FR-05, AC-07 | **Recommended: inject on import only** (POST/PATCH stay strict). Orchestrator to confirm with user; if strict-reject is chosen, FR-05/AC-07 flip to rejection semantics. |
| 2 | JSON-Schema `default` foot-gun: `storage/nodes.ts` persists input attributes, not zod output, so `default` in the registry doc would validate-pass while storing nothing. | Silent data gaps | Closed by requirement: FR-02 forbids `default` for `systemKind`; AC-02 asserts its absence; missing → hard 400 (AC-03). |
| 3 | Non-standard write paths could resurrect Systems without `systemKind` (snapshot restore, journey-version restore, `scripts/seed-enriched.ts`, agent tools). | Post-migration invariant erosion | Design phase must inventory every System-writing path and route each through the validated storage helpers (or the FR-05 defaulting rule). AC-08's idempotent migration re-run is the backstop. |
| 4 | Seed monochrome: all 6 retail-mini systems are honestly `functional`, so the filter/badges show no variety on fresh seed data. | Demo value only | Tests exercise all three kinds via created fixtures (AC-05, AC-10). Optional demo enrichment (e.g. an agentic/AI system in `scripts/seed-enriched.ts`) is a nice-to-have for design phase, not a requirement. |
| 5 | Tightening a core label's schema at bootstrap on a DB whose data was hand-edited (Systems with a non-enum `systemKind` already present) would leave rows that fail validation on next write. | Confusing late 400s | Migration backfills only *missing* keys by design (matches registry backfill semantics); design phase decides whether the migration also reports (not rewrites) invalid existing values in its log output. |

## Traceability

| Source | Covered by |
|--------|------------|
| Blueprint XD-15 (required enum via registry; seed default `functional`; rejected: subtype labels, per-feature enums) | FR-01..FR-08, NFR-01, NFR-05 |
| Blueprint View Tree round-4 row — `#/explorer/systems` gains systemKind badges + filter, owner `system-augmentation-model` | FR-09..FR-12 |
| Blueprint UX-01 / UX-02 / UX-05 / UX-06 | FR-11 / AC-14 / FR-12 / FR-10 |
| Blueprint feature inventory scope line ("API validation + tests") | AC-01..AC-09, AC-15 |
| CLAUDE.md versioning policy (additive v1 change) | NFR-02, AC-15 |
