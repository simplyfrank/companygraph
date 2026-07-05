---
feature: "system-augmentation-model"
created: "2026-07-04"
author: "spec-author"
status: "revised"
revision: 2
reviewing_requirements_revision: 1
reviewing_design_revision: 3
addresses_review: "reconciliation amendment — design.md revision 3 (§2.3 cold re-review closures) + STATUS.md execution deviations 1 and 3; non-normative, no task added/removed/renumbered"
amended_at: "2026-07-04"
size: "medium"
total_tasks: 17
---

# Tasks: system-augmentation-model

## Revision 2 — reconciliation amendment (non-normative)

Design revision 3 (§2.3) reconciled the post-cap cold re-review; STATUS.md
records the execution deviations. This tasks revision aligns the task text
with both — **no task is added, removed, renumbered, or semantically
changed**. Three deltas:

1. **T-05 root script form** (cold re-review N-01 = STATUS execution
   deviation 1): the prescribed `bun --cwd api run scripts/…` form is broken
   under Bun 1.3.9 (prints usage; pre-existing `schema:apply` shares the
   defect). T-05 now specifies the working as-built no-`run` form, matching
   design §4.3 rev 3 and root `package.json:16`.
2. **T-06 AC-08c leg** (STATUS execution deviation 3): the original
   "`_OntologyEvent` count grows by exactly 1" assertion was invalidated by
   `model-workspace-core`'s legal bootstrap re-registration on an emptied
   registry. T-06 now states the as-built contract assertion (seed event
   fired via count growth + zero migration-contributed rows via the unique
   `_OntologyVersion` actor `"system:migration:system-kind"`).
3. **Pinned C-01 provenance**: the shadow-`kind` note now also lives in the
   design body (§4.6, closing cold re-review C-03) — the pin below cites it.

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` or `pwa/src/components/` additionally run
  `bun scripts/design-conformance.ts` (AC-14 gate).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run
  under `bun test`.

## Open design concerns — pinned decisions

Design review pass 2 (final in budget, verdict **approve**, 0 blockers) left
one new concern and two nits for the tasks author to pin. The decisions below
are **binding for execution**.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| **C-01 (design-review pass 2; now also design.md §4.6, closing cold re-review C-03)** — pre-existing shadow `kind` vocabulary: `pwa/src/lib/journeyData.ts:189-190` reads `attributes.kind` off System nodes and `pwa/src/components/JourneyCanvas.tsx:796` renders it (CSS class `.systemKind`, `JourneyCanvas.module.css:213`). Latent today (no write path populates it), invisible to the AC-01 grep guard (which hunts `"ai_predictive"`, not `kind`). | **No code change in this spec** (matches the review's recommendation — "the note is the right size"). Binding constraints: (a) T-14's Systems view reads **only** `systemKind` from `attributes_json` — it must never read or write `attributes.kind`; (b) the `kind` → `systemKind` read-path migration is **assigned to the spec that next owns the journey canvas** (`ddd-system-modeling` when it touches system rendering, else the process-explorer-ui surface owner); (c) the consolidated report MUST carry this assignment line so the downstream author cannot mistake `kind` for the vocabulary. | Touching `journeyData.ts`/`JourneyCanvas.tsx` is outside the approved design's file-change table; a scope-creep edit under this spec would itself violate spec governance. Naming + assigning closes the XD-15-spirit gap. | T-14 (constraint a); consolidated report (b, c) |
| **N-01 (design-review pass 2)** — design §4.6 inventory omits `scripts/seed-enriched.ts` by name although requirements Risk 3 named it. | The script PATCHes `{attributes: node.attributes}` via `PATCH /api/v1/nodes/:label/:id` (whole-map replace, strict validation) — it keeps working post-tightening **only because** T-11 gives the enriched fixture's System rows explicit `systemKind` values. T-11's steps state this dependency; T-11 must land before anyone runs `seed-enriched` against a tightened DB. | Makes the implicit §4.6/§4.7 coverage explicit at the point of execution. | T-11 |
| **N-02 (design-review pass 2)** — §4.5 "before zod parsing" phrasing could mislead the implementer into relocating the injection call ahead of the envelope parse. | **Call-site pin**: `injectSystemKindDefault` is applied per raw node row **inside** `dryRunPasses` and `realImport`, i.e. *after* `handleImport`'s envelope-level `importPayloadSchema.safeParse` (`import.ts:63-79`) and *before* per-row `nodeWithLabelSchema` parsing. Do not move it into `handleImport`. | Matches the as-built route's control flow, verified by the reviewer. | T-09 |

Carried forward as mandated by the approved design (DD-13): the **AC-09
verification amendment** text appears verbatim in T-12 and in STATUS.md.

## Task list

### T-01 — Shared systemKind vocabulary module + workspace wiring

- **Files** (3): `shared/src/schema/system-kind.ts` (new),
  `shared/package.json` (modify), `shared/src/index.ts` (modify)
- **Implements**: design §3.1 — supports FR-01, FR-02; closes AC-01 jointly
  with T-02
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-02, T-03, T-04, T-09, T-14
- **Steps**: Create the module exactly as design §3.1: `SYSTEM_KINDS`
  tuple `["functional", "agentic", "ai_predictive"] as const` (this order),
  `SystemKind` type, `systemKindSchema = z.enum(SYSTEM_KINDS)`,
  `DEFAULT_SYSTEM_KIND: SystemKind = "functional"`,
  `SYSTEM_KIND_LABELS` (`Functional` / `Agentic` / `AI predictive`), and
  `SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC` (`type: "object"`,
  `additionalProperties: true`, `required: ["systemKind"]`,
  `properties.systemKind: {type: "string", enum: [...SYSTEM_KINDS]}`) with
  the Risk-2 comment: **deliberately no `default` keyword** —
  `api/src/storage/nodes.ts` persists input attributes, not zod output, so
  `default` would validate-pass while storing nothing. All keywords stay
  inside `jsonSchemaDocSchema`'s allow-list (`shared/src/schema/ontology.ts`).
  Add the exports-map subpath
  `"./schema/system-kind": "./src/schema/system-kind.ts"` to
  `shared/package.json` (the package has an explicit `exports` map — the
  import fails at runtime without this row). Re-export from
  `shared/src/index.ts`. en-US identifiers; zod only.
- **Verification**: `api/__tests__/system-kind-vocabulary.test.ts` (authored
  in T-02; runs jointly)

### T-02 — Vocabulary singularity guard test

- **Files** (1): `api/__tests__/system-kind-vocabulary.test.ts` (new)
- **Implements**: design §4.1 — closes AC-01 (FR-01)
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: —
- **Steps**: Unit test, no Neo4j. (1) `SYSTEM_KINDS` deep-equals
  `["functional", "agentic", "ai_predictive"]` in exact order;
  `systemKindSchema.parse("agentic")` passes;
  `systemKindSchema.safeParse("predictive").success === false`.
  (2) Grep production sources (`api/src`, `pwa/src`, `shared/src`,
  `api/scripts`, `scripts`) for the literal `"ai_predictive"`; fail on any
  hit outside `shared/src/schema/system-kind.ts` itself, seed/fixture
  **data** files (`shared/seed/*.json` as a class — survives T-11's
  enriched-fixture variety), and `__tests__`/spec files. Same mechanism as
  `api/__tests__/no-auth-grep.test.ts` (requirements-review N-02 phrasing).
- **Verification**: `api/__tests__/system-kind-vocabulary.test.ts`

### T-03 — Fresh-DB tightened registry seed + registry shape test

- **Files** (2): `api/src/ontology/seed.ts` (modify),
  `api/__tests__/system-kind-registry.integration.test.ts` (new)
- **Implements**: design §4.2 — closes AC-02 (FR-02, FR-07 fresh-DB path)
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-06, T-08, T-10, T-12
- **Steps**: In `seedRegistryFromConstTuples` (permissive `jsd` currently at
  ~line 172), add the per-label doc picker from §4.2:
  `SEED_ATTRIBUTE_DOCS: Record<string, unknown> = { System: SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC }`,
  then `jsd: JSON.stringify(SEED_ATTRIBUTE_DOCS[label] ?? { type: "object", additionalProperties: true })`
  in the loop. Import from `@companygraph/shared/schema/system-kind`
  (legal — `ontology-no-frozen-import.test.ts` guards only
  `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS`). A fresh DB never holds a
  permissive System doc. Test: via `GET /api/v1/ontology/node-labels`
  (dev-fallback session pattern the existing integration suites use), assert
  the System row's `json_schema_doc` has
  `properties.systemKind.enum` deep-equal `SYSTEM_KINDS`, `required`
  containing `"systemKind"`, and **no `default` keyword** under
  `properties.systemKind`; assert the `/api/v1/schema` aggregate reflects the
  same row.
- **Verification**: `api/__tests__/system-kind-registry.integration.test.ts`

### T-04 — Migration module `runSystemKindMigration`

- **Files** (1): `api/src/ontology/system-kind-migration.ts` (new)
- **Implements**: design §4.3 steps 1–5 (DD-05, DD-06, DD-11, DD-12, DD-14) —
  closes AC-08/AC-08d jointly with T-05/T-06 (FR-06)
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-05
- **Steps**: Export `SystemKindMigrationResult` (`registryPatched`,
  `backfilledCount`, `invalidValueCount`) and
  `runSystemKindMigration(driver)`. Step 1: read the System row's
  `json_schema_doc` (same Cypher as the attribute-zod cache loader); missing
  row → throw (seed ordering guarantees it exists). Step 2: doc-tightened
  check (enum deep-equal, `required` includes `systemKind`, no `default`) —
  if tightened, **skip step 3 entirely** (zero audit/version/event rows on
  re-run). Step 3 (DD-14 read-merge-write): splice the systemKind bits into
  the doc read in step 1 —
  `mergedDoc = { ...currentDoc, properties: { ...currentDoc.properties, systemKind: { type: "string", enum: [...SYSTEM_KINDS] } }, required: dedupe([...(currentDoc.required ?? []), "systemKind"]) }`,
  dropping any pre-existing `default` under `properties.systemKind`; all
  other keys pass through. Then
  `patchNodeLabel(driver, "System", { json_schema_doc: mergedDoc }, "system:migration:system-kind", { forceBackfill: true, backfillValue: DEFAULT_SYSTEM_KIND })`
  (one tx: registry rewrite + APOC backfill of missing-key Systems +
  audit/version/`_OntologyEvent` rows). After commit, emit the route
  handler's exact post-commit event (`routes/ontology-node-labels.ts:121-126`)
  with the real diff:
  `ontologyEvents.emit("ontology.changed", { event_id, version_id, ts, diff: [{ op: "replace", path: "/nodeLabels/System", value: row }] })`.
  Step 4 (always runs — Risk-3 drift backstop): the single batched Cypher
  from §4.3 verbatim (`apoc.convert.fromJsonMap` … `WHERE attrs.systemKind IS NULL` …
  `apoc.map.setKey(attrs, "systemKind", $dflt)`), data-only, **no** ontology
  event rows, count logged. Step 5 (Risk 5 — report, don't rewrite): READ
  count of Systems with non-null, non-enum `systemKind`; `console.warn`
  count + up-to-10 sample ids. Module comment must record: (a)
  `patchNodeLabel` SETs `json_schema_doc` **wholesale** — warning to
  downstream imitators (DD-14); (b) rollback is forward-only — re-loosen via
  `PATCH /api/v1/ontology/node-labels/System`, backfilled `"functional"`
  values remain as harmless open-map keys (DD-11); (c) NFR-03 batched-single-
  statement note, aspirational timing, no timed test (DD-12).
- **Verification**: `api/__tests__/system-kind-migration.integration.test.ts`
  (authored in T-06)

### T-05 — Migration invocations: bootstrap step 5 + standalone script

- **Files** (3): `api/src/neo4j/bootstrap.ts` (modify),
  `api/scripts/migrate-system-kind.ts` (new), `package.json` (root, modify)
- **Implements**: design §4.3 invocations (DD-15) — closes AC-08a/b/c jointly
  with T-06 (FR-07)
- **Complexity**: moderate
- **Blocked by**: T-04
- **Blocks**: T-06
- **Steps**: In `applySchema`, after the registry seed and constraint loop,
  add step 5: `await runSystemKindMigration(driver)` wrapped in its **own**
  try/catch that logs the DD-15 line —
  `console.error("[system-kind-migration] FAILED — System writes are UNVALIDATED until 'bun run migrate:system-kind' succeeds (or restart the server; the migration re-runs on every boot)", e)`
  — then **rethrows** into `server.ts`'s existing warn-and-start catch.
  `server.ts` is NOT touched (house behavior unchanged; the every-boot
  re-run is the self-healing mitigation, and step 4's drift backfill repairs
  Systems written during a failure window). Standalone script: load env,
  build a driver, run the migration, print the result JSON, exit non-zero on
  error. Root `package.json` gains
  `"migrate:system-kind": "bun --cwd api scripts/migrate-system-kind.ts"`
  — **no `run`** (revision 2, per design §4.3 rev 3 / cold re-review N-01 /
  STATUS execution deviation 1: the `bun --cwd <ws> run <script-path>` form
  is broken under Bun 1.3.9, printing usage instead of executing; the
  pre-existing `schema:apply` script shares the defect. The working form
  mirrors the root `seed` script, not `schema:apply`).
- **Verification**: `api/__tests__/system-kind-migration.integration.test.ts`
  (authored in T-06; AC-08a/b legs)

### T-06 — Migration integration test (AC-08 + a/b/c/d)

- **Files** (1): `api/__tests__/system-kind-migration.integration.test.ts` (new)
- **Implements**: design §8 migration suite — closes AC-08, AC-08a, AC-08b,
  AC-08c, AC-08d (FR-06, FR-07)
- **Complexity**: complex
- **Blocked by**: T-03, T-05
- **Blocks**: —
- **Steps**: Six legs against live Neo4j. **AC-08 (stale DB)**: reset the
  System doc permissive + strip `systemKind` from planted Systems, run the
  migration, assert doc matches FR-02, every System `functional`, an
  `_OntologyEvent` row emitted. **Re-run quiet** (requirements-review N-01):
  second run mutates zero data rows and adds zero new
  `_OntologyEvent`/`_OntologyVersion` rows. **AC-08a (bootstrap mode)**: same
  stale setup, run `applySchema(driver)` (the entry `server.ts` awaits),
  assert migrated post-conditions. **AC-08b (standalone mode)**: stale setup,
  `Bun.spawn(["bun", "scripts/migrate-system-kind.ts"])` from `api/`, exit 0,
  same post-conditions. **AC-08c (fresh DB)**: empty registry → `applySchema`
  → System doc already tightened directly, with zero migration-contributed
  patch/backfill rows. Assertion mechanism (revision 2, per STATUS execution
  deviation 3): do **not** assert "`_OntologyEvent` count grows by exactly 1"
  — `model-workspace-core`'s bootstrap step 3b legally re-registers its 4
  labels + 5 edges (with their own events) when the registry is emptied.
  Assert instead that the seed event fired (`_OntologyEvent` count strictly
  grows) AND the migration contributed nothing, detected via its unique
  `_OntologyVersion` actor `"system:migration:system-kind"` (count
  unchanged). **Risk-5 report**: hand-plant
  `systemKind: "bogus"` on one System — counted in `invalidValueCount`, not
  rewritten. **AC-08d (merge-preserve, DD-14)**: pre-plant a System doc that
  is neither permissive nor tightened (extra `properties.owner` +
  `required: ["owner"]`), run the migration, assert the result contains
  **both** the tightened systemKind bits and the untouched `owner`
  property/required entry.
- **Verification**: `api/__tests__/system-kind-migration.integration.test.ts`

### T-07 — Non-throwing checker extraction in storage

- **Files** (1): `api/src/storage/nodes.ts` (modify)
- **Implements**: design §4.4 (DD-07) — supports FR-03, FR-04, FR-05; no
  behavior change
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-08, T-09
- **Steps**: Split the existing `assertAttributesMatchSchema` into an
  exported non-throwing core
  `checkAttributesAgainstSchema(label, attributes): Promise<{ missing: string[]; type_mismatch: string[] } | null>`
  plus the existing throwing wrapper. Wrapper semantics stay byte-for-byte
  identical — including the `not_found → permissive` fallback for
  unregistered labels and the `details` split at `nodes.ts:51-66`
  (missing key → `invalid_type`/`received: "undefined"` → `details.missing`;
  wrong value → `invalid_enum_value` → `details.type_mismatch`).
  `createNode`/`patchNode`/`upsertNode` call sites (`nodes.ts:99/163/211`)
  unchanged. PATCH semantics untouched: `attributes` present → whole-map
  validation; omitted → no validation, stored map untouched.
- **Verification**: `api/__tests__/ontology-attribute-enforcement.integration.test.ts`
  (existing, unmodified — must stay green as the refactor's regression proof)

### T-08 — Write-path enforcement integration test

- **Files** (1): `api/__tests__/system-kind-enforcement.integration.test.ts` (new)
- **Implements**: design §8 enforcement suite — closes AC-03, AC-04, AC-05,
  AC-06 (FR-03, FR-04)
- **Complexity**: moderate
- **Blocked by**: T-03, T-07
- **Blocks**: —
- **Steps**: Against live Neo4j with the tightened doc:
  `POST /api/v1/nodes/System` without `systemKind` →
  `400 attribute_violation`, `details.missing` includes `"systemKind"`
  (AC-03); with `systemKind: "predictive"` → `400`,
  `details.type_mismatch` includes `"systemKind"` (AC-04); each of
  `functional`/`agentic`/`ai_predictive` → `201` and
  `GET /api/v1/nodes/System/:id` round-trips the value (AC-05). PATCH
  matrix (AC-06): `attributes` map lacking `systemKind` → `400`; valid map →
  `200`; name-only PATCH (no `attributes` key) → `200` and stored
  `systemKind` unchanged.
- **Verification**: `api/__tests__/system-kind-enforcement.integration.test.ts`

### T-09 — Import injection + dry-run attribute parity

- **Files** (1): `api/src/routes/import.ts` (modify)
- **Implements**: design §4.5 (DD-03, DD-04) — closes AC-07 jointly with
  T-10 (FR-05); **pins N-02**
- **Complexity**: moderate
- **Blocked by**: T-01, T-07
- **Blocks**: T-10, T-12
- **Steps**: (1) Add the pure helper `injectSystemKindDefault(raw)` verbatim
  from §4.5 (System rows only; non-object `attributes` passed through for
  validation to fail; `"systemKind" in map` — present-even-if-invalid →
  untouched; missing → spread in `DEFAULT_SYSTEM_KIND`). **Call-site pin
  (N-02)**: apply it per raw node row inside **both** `dryRunPasses` and
  `realImport` — after `handleImport`'s envelope
  `importPayloadSchema.safeParse` (`import.ts:63-79`), before per-row
  `nodeWithLabelSchema` parsing. Do not move it into `handleImport`.
  (2) Make `dryRunPasses` async; per node row after `nodeWithLabelSchema`
  passes, call `checkAttributesAgainstSchema(label, attributes)` (registry
  READ, zero writes); non-null → push
  `{ section: "nodes", index, code: "attribute_violation", message: "attribute_violation", details }`
  — same shape as real import. Unregistered labels stay permissive in both
  modes. Edge rows stay envelope-only. (3) Update the route header comment:
  edge endpoint existence remains out of dry-run's contract, and dry-run is
  no longer pure — it requires a reachable registry; a connection error
  mid-loop 500s exactly as real import would (design-review N-03 note).
- **Verification**: `api/__tests__/system-kind-import.integration.test.ts`
  (authored in T-10)

### T-10 — Import integration test

- **Files** (1): `api/__tests__/system-kind-import.integration.test.ts` (new)
- **Implements**: design §8 import suite — closes AC-07 (FR-05)
- **Complexity**: moderate
- **Blocked by**: T-03, T-09
- **Blocks**: —
- **Steps**: Legacy payload (System rows without `systemKind`) imports
  cleanly and reads back `systemKind: "functional"`; a row with
  `systemKind: 42` lands in `errors[]` with code `attribute_violation` while
  valid rows import (collect-and-continue); `?dryRun=true` returns the
  **same per-row verdicts** with zero writes — assert DB row-count unchanged
  after the dry-run call (the DD-04 parity contract).
- **Verification**: `api/__tests__/system-kind-import.integration.test.ts`

### T-11 — Seed fixtures gain explicit systemKind

- **Files** (3): `shared/seed/retail-mini.json` (modify),
  `shared/seed/commercial-domain.json` (modify),
  `shared/seed/retail-mini-enriched.json` (modify)
- **Implements**: design §4.7 (DD-10) — closes AC-09 jointly with T-12
  (FR-08); **pins N-01**
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-12
- **Steps**: `retail-mini.json`: all 6 System rows gain
  `"attributes": {"systemKind": "functional"}` — explicit, not
  injection-reliant; ids, counts, edges unchanged. `commercial-domain.json`:
  same for its 7 System rows (consistency). `retail-mini-enriched.json`:
  same for its 6 rows, except one system classified `"agentic"` and one
  `"ai_predictive"` (Risk-4 demo variety; legal literals in seed **data**
  files per the T-02 grep exclusions). **N-01 pin**: this task is what keeps
  `scripts/seed-enriched.ts` working post-tightening — that script PATCHes
  `{attributes: node.attributes}` whole-map via the strict
  `PATCH /api/v1/nodes/:label/:id` path, so its System rows must carry
  explicit `systemKind` from this fixture edit onward.
- **Verification**: `api/__tests__/system-kind-seed.integration.test.ts`
  (authored in T-12)

### T-12 — Seed integration test (AC-09 as amended by DD-13)

- **Files** (1): `api/__tests__/system-kind-seed.integration.test.ts` (new)
- **Implements**: design §4.7 + §8 seed suite — closes AC-09 (FR-08)
- **Complexity**: moderate
- **Blocked by**: T-03, T-09, T-11
- **Blocks**: —
- **Steps**: POST `shared/seed/retail-mini.json` to `POST /api/v1/import`;
  assert zero row errors against the tightened schema, all 6 Systems read
  back `systemKind: "functional"`, node/edge counts equal graph-core AC-07's
  exact counts, and a second POST adds nothing (idempotency).
- **Verification**: `api/__tests__/system-kind-seed.integration.test.ts` —
  **AC-09 verification amendment (DD-13, carried verbatim as the design
  mandates):** *AC-09 is verified via direct POST of
  `shared/seed/retail-mini.json` to `POST /api/v1/import` (the wire path the
  graph-core seed contract defined) in
  `system-kind-seed.integration.test.ts`; the root seed script's drift is
  owned by `_baseline` and is out of this spec's scope.*

### T-13 — Catalog `Button` gains additive `pressed` prop

- **Files** (1): `pwa/src/components/Button.tsx` (modify)
- **Implements**: design §6 component plan — supports FR-12 (AC-13 closed by
  T-15)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-14
- **Steps**: Add an optional `pressed?: boolean` prop that renders
  `aria-pressed` when provided (the component today has no aria
  passthrough; this is the minimal catalog extension, justified in design §6
  because no toggle-state affordance exists in the catalog). Strictly
  additive — existing call sites compile and render unchanged. No styling
  change; `Button.module.css` untouched (28 px house size stands, DD-09).
- **Verification**: `pwa/src/__tests__/system-kind-badges.test.tsx` (authored
  in T-15; asserts `aria-pressed` on the active filter control)

### T-14 — Systems view: badges, URL-first filter, view states

- **Files** (3): `pwa/src/views/explorer/Systems.tsx` (modify),
  `pwa/src/views/explorer/Systems.module.css` (modify),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §6 — closes AC-10, AC-11, AC-12 jointly with T-15
  (FR-09, FR-10, FR-11, FR-12)
- **Complexity**: complex
- **Blocked by**: T-01, T-13
- **Blocks**: T-15, T-16
- **Steps**: Route wiring: `views/index.tsx` line 62 becomes
  `"systems": (r) => <ExplorerSystems route={r} />`. Data: extend the view's
  single Cypher projection to `s{.id, .name, .description, .attributes_json}`;
  parse `attributes_json` client-side (`JSON.parse` in try/catch → `null`
  kind on failure) and validate the value against `SYSTEM_KINDS` imported
  from `@companygraph/shared/schema/system-kind` — no enum literal in `pwa/`
  source (AC-01). **Pinned C-01 constraint: read only `systemKind`; never
  read or write `attributes.kind` (the legacy journey-canvas shadow key).**
  Badges: local `kindPill(kind)` helper using catalog `Pill` — tones
  `functional → neutral`, `agentic → accent`, `ai_predictive → good`,
  missing/unrecognized → `warn` + text `unclassified`; labels always from
  `SYSTEM_KIND_LABELS` (never color-only). New `kind` column in the existing
  `DataTable`. Filter: catalog `Button` ×4 (`All`/`Functional`/`Agentic`/
  `AI predictive`) in `<div role="group" aria-label="Filter by system kind">`;
  active = `tone="primary"` + `pressed`, inactive = `tone="ghost"` +
  `pressed={false}`; `onClick` rewrites `location.hash` via
  `toHash({surface: "explorer", tab: "systems"}, kind ? {kind} : undefined)`
  — state is URL-first, the view re-renders from `route.params`; unknown
  `?kind=` values → treated as `All`. Filtering is client-side and narrows
  table + `HorizontalBarChartCard` together. States (UX-01): existing
  `Loading`/`ErrorState`; zero rows → "No systems yet — create systems via
  the API or SME surfaces."; active filter with zero matches → "No {label}
  systems — clear the filter to see all systems." + a clear-filter `Button`
  with `href="#/explorer/systems"`. Styling: `Systems.module.css` only,
  tokens (`var(--…)`) only — no inline color/size literals. No custom key
  handlers (native button Enter/Space activation; Tab order = DOM order,
  filter group above the table).
- **Verification**: `pwa/src/__tests__/system-kind-filter.test.tsx` (authored
  in T-15) + `bun scripts/design-conformance.ts` exits 0 on the touched view

### T-15 — PWA component tests: filter, states, badges, a11y

- **Files** (3): `pwa/src/__tests__/system-kind-filter.test.tsx` (new),
  `pwa/src/__tests__/system-kind-badges.test.tsx` (new),
  `pwa/src/__tests__/system-view.test.tsx` (modify)
- **Implements**: design §8 unit suites — closes AC-10 (automated leg),
  AC-11, AC-12, AC-13 (automated leg); regression for AC-15
- **Complexity**: complex
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: `system-kind-filter.test.tsx` (AC-10/11/12): badge per row with
  correct human label; `unclassified` fallback for a missing/bogus kind;
  clicking `Agentic` narrows table + chart data and rewrites the hash to
  `#/explorer/systems?kind=agentic`; rendering with
  `route.params.kind = "agentic"` pre-filters (the deep-link render path);
  unknown `kind` param behaves as `All`; mocked pending/failed/ok fetch →
  `Loading`/`ErrorState`/ready; zero rows → "No systems yet"; active filter
  + zero matches → clear-filter affordance with `href="#/explorer/systems"`.
  `system-kind-badges.test.tsx` (AC-13): active control exposes
  `aria-pressed="true"`, inactive `"false"`; Tab order = DOM order;
  Enter/Space fires the hash rewrite; badge text labels present (not
  color-only). `system-view.test.tsx`: mock rows gain `attributes_json`;
  existing assertions stay green (AC-15 regression).
- **Verification**: `pwa/src/__tests__/system-kind-filter.test.tsx` +
  `pwa/src/__tests__/system-kind-badges.test.tsx`

### T-16 — touch-targets structural extension + stale-comment fix

- **Files** (1): `pwa/src/__tests__/touch-targets.test.tsx` (modify)
- **Implements**: design §6/§8 DD-09 (design-review B-01 closure) — supports
  AC-10 (touch, structural leg)
- **Complexity**: simple
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: Render the filter group; assert each of the four controls is a
  real `<button type="button">` carrying the `.btn` class — **structure
  only**; jsdom cannot compute module CSS, so no size claim is made. In the
  same edit, correct the file's stale "44px minimum" comments (lines 4, 22,
  26) to state the true 28 px house size (`Button.module.css:2`, WCAG 2.2 AA
  2.5.8 ≥ 24 px) and point at the manual iPhone Safari repro (T-17).
- **Verification**: `pwa/src/__tests__/touch-targets.test.tsx`

### T-17 — Final validation + manual verification sweep

- **Files** (0): none — validation only
- **Implements**: design §8 regression + manual legs — closes AC-14, AC-15,
  and the manual legs of AC-10 and AC-13
- **Complexity**: moderate
- **Blocked by**: T-02, T-06, T-08, T-10, T-12, T-15, T-16
- **Blocks**: —
- **Steps**: Run `bun run typecheck` (exit 0); `bun test` (all unit suites);
  `bun test:integration` with Neo4j up — including the unmodified
  `api/__tests__/openapi.integration.test.ts` and
  `api/__tests__/export-import-roundtrip.integration.test.ts` staying green
  (AC-15; confirms no `openapi.json` delta and the export→import round-trip
  under injection); `bun scripts/design-conformance.ts` from repo root, exit
  0 with the Systems view clean (AC-14). Then execute the three manual
  repros below and record outcomes in STATUS.md.
- **Verification**:
  manual: (AC-10 mouse) open `http://127.0.0.1:5173/#/explorer/systems?kind=agentic` in macOS Chrome and reload with the mouse — expect only agentic rows and the Agentic control shown pressed after reload;
  manual: (AC-10 touch) expose the dev PWA via a temporary `vite --host` LAN bind (API stays loopback; Vite proxies `/api/v1`) — or macOS Safari responsive design mode as fallback — open `#/explorer/systems` on iPhone Safari and tap each of the four filter controls in turn — expect each tap to activate the intended control without mis-taps and the table/chart to narrow;
  manual: (AC-13 keyboard) keyboard-only in macOS Safari — Tab to `Agentic`, press Enter — verify the table narrows and the focus ring stays visible;
  plus `bun run typecheck` + `bun test` + `bun test:integration` + `bun scripts/design-conformance.ts` all exiting 0

## Traceability — AC → closing task

| AC | Closed by | Artifact |
|----|-----------|----------|
| AC-01 | T-01 + T-02 | `api/__tests__/system-kind-vocabulary.test.ts` |
| AC-02 | T-03 | `api/__tests__/system-kind-registry.integration.test.ts` |
| AC-03, AC-04, AC-05, AC-06 | T-07 + T-08 (doc via T-03) | `api/__tests__/system-kind-enforcement.integration.test.ts` |
| AC-07 | T-09 + T-10 | `api/__tests__/system-kind-import.integration.test.ts` |
| AC-08 (+a/b/c/d) | T-04 + T-05 + T-06 (fresh path T-03) | `api/__tests__/system-kind-migration.integration.test.ts` |
| AC-09 (as amended by DD-13) | T-11 + T-12 | `api/__tests__/system-kind-seed.integration.test.ts` |
| AC-10 | T-14 + T-15 (automated) + T-16 (touch structural) + T-17 (manual mouse + touch) | `pwa/src/__tests__/system-kind-filter.test.tsx` + manuals in T-17 |
| AC-11, AC-12 | T-14 + T-15 | `pwa/src/__tests__/system-kind-filter.test.tsx` |
| AC-13 | T-13 + T-14 + T-15 (automated) + T-17 (manual keyboard) | `pwa/src/__tests__/system-kind-badges.test.tsx` + manual in T-17 |
| AC-14 | T-14 + T-17 | `bun scripts/design-conformance.ts` exit 0 |
| AC-15 | T-07, T-09, T-15, T-17 | `bun run typecheck` + existing openapi/round-trip suites green |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks shipping behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| T-07 specifically | `bun test:integration api/__tests__/ontology-attribute-enforcement.integration.test.ts` (refactor regression) |
| tasks touching `pwa/src/views/` or `pwa/src/components/` (T-13, T-14) | `bun scripts/design-conformance.ts` |
| T-17 (final) | `bun test` + `bun test:integration` (needs Neo4j) + `bun scripts/design-conformance.ts` + the three manual repros + full AC sweep |

## Notes for the consolidated report (orchestrator)

Carried forward per the approved design + design-review pass 2 — no new
decisions needed from the user, but these three lines must appear in the
consolidated report:

1. **OQ-1 closed as decided (DD-03)**: import injects
   `systemKind: "functional"` into System rows lacking the key; POST/PATCH
   stay strict.
2. **AC-09 verification amendment (DD-13)** — verbatim text carried in T-12
   and STATUS.md.
3. **Shadow `kind` assignment (design-review pass-2 C-01)**: the legacy
   `attributes.kind` read path (`pwa/src/lib/journeyData.ts:189-190`,
   `pwa/src/components/JourneyCanvas.tsx:796`) is NOT the vocabulary; its
   `kind` → `systemKind` migration is assigned to the spec that next owns
   the journey canvas (`ddd-system-modeling` when it touches system
   rendering, else the process-explorer-ui surface owner).
