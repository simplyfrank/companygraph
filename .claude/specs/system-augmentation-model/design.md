---
feature: "system-augmentation-model"
created: "2026-07-04"
author: "spec-author"
status: "approved"
approved_by: "review-gate (review-design.md pass 2/2: approve, 0 blockers)"
approved_at: "2026-07-04"
revision: 3
reviewing_requirements_revision: 1
addresses_review: "review-design.md (pass 1); rev 3 additionally reconciles the post-cap cold re-review (review-design.md on disk, verdict approve)"
amended_at: "2026-07-04"
size: "medium"
---

# Design: system-augmentation-model

## 1. Overview

One vocabulary, zero new machinery. The spec lands a single shared module
(`shared/src/schema/system-kind.ts`) that owns the three literals
`functional | agentic | ai_predictive`, then routes every enforcement,
migration, and UI concern through machinery that already exists and is
tested: the ontology registry's per-label `json_schema_doc`, the
attribute-zod cache, `patchNodeLabel`'s `forceBackfill` path, the import
route's collect-and-continue error surface, and the Explorer PWA's
URL-first filter pattern. The design follows three rules:

1. **The registry is the enforcement point, not code.** No route grows a
   `systemKind` check. Tightening the `System` label's
   `_OntologyAttributeSchema.json_schema_doc` (required + enum, **no
   `default` keyword** — Risk 2) makes `createNode` / `patchNode` /
   `upsertNode` enforce the vocabulary automatically via the existing
   `assertAttributesMatchSchema` path (`api/src/storage/nodes.ts:35`).
2. **Two doors for legacy data, both defaulting to `functional`.** The
   bootstrap migration backfills Systems already in the DB; the import
   route injects the default into System rows that lack the key
   (OQ-1 closed — DD-03). Everything else stays strict: POST/PATCH with a
   missing or invalid `systemKind` is a hard `400 attribute_violation`.
3. **Idempotent and event-quiet on re-run.** The migration checks the
   registry doc before patching; an already-migrated DB gets zero writes,
   zero audit/version/`_OntologyEvent` rows, zero cache churn
   (requirements-review N-01).

Key trade-off taken: dry-run import gains registry attribute validation
for **all** labels (DD-04, resolving requirements-review C-02) — this
changes dry-run results
for any existing payload that would have failed real import anyway, which
we judge a bug fix, not a break (the 200-envelope contract and error
shape are unchanged). Rejected: scoping dry-run parity to System rows only
(incoherent — dry-run would still lie about every other label).

## 2. Review findings — resolution in this design

### 2.1 Requirements-review findings (review-requirements.md)

| Finding | Resolution |
|---------|-----------|
| C-01 (OQ-1 unreachable under XD-17) | **Closed by DD-03**: inject-on-import-only is adopted as decided. FR-05's "pending OQ-1" clause is struck; POST/PATCH stay strict. Surfaced for the consolidated report, not re-asked. |
| C-02 (dry-run validation depth) | **Closed by DD-04**: option (a), all labels. `dryRunPasses` becomes async and runs the same non-throwing attribute check the write path uses (DD-07 extraction). Edge rows stay envelope-only (endpoint existence needs DB state; documented in the route header). |
| C-03 (FR-07 invocation modes had no closing AC) | **Closed by §8 test additions AC-08a/b/c** in `system-kind-migration.integration.test.ts`: (a) `applySchema()` on a stale DB yields the migrated post-conditions (the bootstrap path — `server.ts` awaits `applySchema` before `Bun.serve`); (b) `Bun.spawn` of `api/scripts/migrate-system-kind.ts` exits 0 and migrates; (c) fresh-DB registry seed emits the tightened doc directly with zero backfill/patch event rows. |
| C-04 (iPhone Safari touch declared, never verified) | **Closed by DD-09 (revised — see design-review B-01)**: the house `Button` is a fixed **28 px** control (`Button.module.css:2` — there is no 44 px rule anywhere in the PWA; the prior claim was inherited from a stale test comment). 28 px meets the requirements' bar verbatim ("Tap targets ≥ existing house minimum") and WCAG 2.2 AA 2.5.8 (24 px), not the 44 px AAA/HIG figure. The touch platform is verified by a **manual iPhone Safari repro added to §8** (tap each filter control, verify activation without mis-taps); `touch-targets.test.tsx` is extended for structure/semantics only — and its stale "44px minimum" comment is corrected as part of that edit, not propagated. |
| N-01 (re-run event spam) | Migration is doc-check-first (§4.3 step 2): already-tightened doc → `patchNodeLabel` is never called → no audit/version/event rows. Asserted in AC-08 ("no new `_OntologyEvent` / `_OntologyVersion` rows on second run"). |
| N-02 (grep exclusion phrasing) | The AC-01 grep test excludes `shared/seed/*.json` and `scripts/**` seed **data** files as a class, plus `shared/src/schema/system-kind.ts` itself and `__tests__`/spec files — survives Risk-4 enrichment. |
| N-03 (NFR-03 numbers unverified) | **Aspirational, comment-only** (DD-12). The backfill is a single batched Cypher statement (no per-node round trips) — stated in a code comment; no timed test. A timed assertion on CI-shared Neo4j would flake. |
| N-04 (no rollback note) | **Forward-only** (DD-11). Rollback = `PATCH /api/v1/ontology/node-labels/System` re-loosening the doc to `{type:"object", additionalProperties:true}`; backfilled `"functional"` values are retained (harmless open-map keys). One comment in the migration module records this. |

### 2.2 Design-review pass 1 findings (review-design.md)

Finding IDs below are the design review's own (they are distinct from the
§2.1 requirements-review IDs of the same shape); in-body resolution tags use
the `design-review` prefix to avoid ambiguity.

| Finding | Resolution |
|---------|-----------|
| B-01 (DD-09's 44 px premise is false; test extension vacuous) | **DD-09 rewritten — option 2 of the review's menu.** House buttons stay 28 px (`Button.module.css:2`) and the design now says so truthfully: 28 px satisfies the requirements' literal bar ("≥ existing house minimum") and WCAG 2.2 AA 2.5.8 (24 px). AC-10's touch leg is verified by a new **manual iPhone Safari repro** (§8). The `touch-targets.test.tsx` extension is re-scoped to what jsdom can honestly prove (button semantics, `type="button"`, `.btn` class presence — structure, not size), and the file's stale "44px minimum" comment is corrected in the same edit. Options 1 (per-view 44 px hit-area) and 3 (global `.btn` change) recorded as rejected in §9. |
| C-01 (bootstrap migration failure silently degrades) | **DD-15**: the `applySchema` step 5 call is wrapped in its own try/catch that logs a distinct, actionable line naming the module and the consequence ("System writes are UNVALIDATED until `bun run migrate:system-kind` succeeds"), then rethrows into the existing `server.ts` warn-and-start catch (no `server.ts` behavior change). §4.3 now states explicitly that the every-boot re-run is the self-healing mitigation for a transient step-5 failure. |
| C-02 (AC-09's literal text verified by no artifact) | **DD-13**: the deviation is recorded as an explicit, traceable AC-09 verification amendment — not a design footnote. tasks.md and STATUS.md MUST carry the amendment text verbatim, and it goes in the consolidated report. Script re-point rejected (blast radius on suites expecting commercial-domain seeding); see §4.7. |
| C-03 (step 3 clobbers the whole System doc) | **DD-14**: step 3 becomes **read-merge-write** — the systemKind property + `required` entry are spliced into the *current* doc; operator/later-spec additions survive. `patchNodeLabel`'s wholesale `SET json_schema_doc` semantics are documented in the migration module comment as a warning to downstream imitators. §4.3 step 3 rewritten; merge-preserve asserted in §8 (AC-08d). |
| N-01 (path citations) | §4.3 and §4.6 now cite `api/src/ontology/storage/migrations.ts` and `api/src/ontology/storage/node-labels.ts` (~317–337) in full. |
| N-02 (empty event diff) | §4.3 step 3 now emits the route handler's exact diff shape: `[{op: "replace", path: "/nodeLabels/System", value: row}]` (`routes/ontology-node-labels.ts:121-126` — verified). |
| N-03 (dry-run gains a DB dependency) | §4.5 note added: the updated route header comment states that dry-run now requires a reachable registry (a READ per node row) and 500s if the DB is down mid-loop — parity with real import, but a change from the previously pure `dryRunPasses`. |

### 2.3 Post-cap cold re-review findings (review-design.md on disk, verdict approve) — revision 3 reconciliation

The `review-design.md` now on disk is a **cold re-review** performed after
implementation (its own provenance note records this; it is labeled
`review_pass: 1` but is in fact a third look, post the 2-pass cap). Verdict
approve, zero blockers. This revision-3 amendment is **non-normative** — no
FR/AC/DD semantics change; it reconciles the design text with the review's
findings and the recorded execution deviations. Finding IDs below are the
cold re-review's own (distinct from §2.1/§2.2 IDs of the same shape).

| Finding | Resolution |
|---------|-----------|
| C-01 (review provenance / frontmatter self-approval) | **Orchestrator-level; recorded in STATUS.md.** The true pass history is: pass 1 (revise) → pass 2 (approve, cap reached) → post-cap cold re-review (approve). The frontmatter `approved_by`/`approved_at` above are the gate's rev-2 fields, preserved verbatim — this amendment does not write a new approval. STATUS.md carries the reconciliation note. |
| C-02 (implementation preceded this review) | **Recorded; condition discharged.** The review's approval was conditional on the deterministic gates passing on the built state — STATUS.md's verification block records them green (`bun run typecheck` exit 0, both test suites, `design-conformance` clean on the touched view — AC-14/AC-15). The consolidated report states that the cold re-review post-dates implementation. |
| C-03 (shadow `kind` vocabulary absent from §4.6) | **Closed in this revision**: §4.6 gains the legacy read-path note naming `pwa/src/lib/journeyData.ts:189-190` + `JourneyCanvas` and assigning the `kind` → `systemKind` migration to the canvas-owning spec. Matches the binding pin already in tasks.md ("Open design concerns" C-01 row) and STATUS.md consolidated-report line 3. |
| N-01 (root script text drift) | **Closed in this revision**: §4.3 now specifies the as-built no-`run` form `"bun --cwd api scripts/migrate-system-kind.ts"` — not merely cosmetic: the `run` form is broken under Bun 1.3.9 (prints usage; same defect as the pre-existing `schema:apply`), per STATUS.md execution deviation 1. |
| N-02 (§4.5 "before zod parsing" phrasing) | **Closed in this revision**: §4.5 now pins the call site — after `handleImport`'s envelope-level `importPayloadSchema` parse, before per-row `nodeWithLabelSchema` parsing, inside `dryRunPasses`/`realImport` (never hoisted into `handleImport`). Matches the as-built `import.ts` and the tasks.md N-02 pin. |

## 3. Data model

No new node labels, edge types, or stores (NFR-01). Two data artifacts:

### 3.1 `shared/src/schema/system-kind.ts` (new — FR-01, FR-02)

```ts
import { z } from "zod";

export const SYSTEM_KINDS = ["functional", "agentic", "ai_predictive"] as const;
export type SystemKind = (typeof SYSTEM_KINDS)[number];
export const systemKindSchema = z.enum(SYSTEM_KINDS);
export const DEFAULT_SYSTEM_KIND: SystemKind = "functional";

// Human labels — one rendering vocabulary for pwa/ + downstream dashboards.
export const SYSTEM_KIND_LABELS: Record<SystemKind, string> = {
  functional: "Functional",
  agentic: "Agentic",
  ai_predictive: "AI predictive",
};

// FR-02 tightened doc for the System registry row. Deliberately NO
// `default` keyword under systemKind: api/src/storage/nodes.ts persists
// INPUT attributes, not zod's parsed output, so `default` would
// validate-pass while storing nothing (requirements Risk 2).
export const SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC = {
  type: "object",
  additionalProperties: true,          // open attributes map stays open
  required: ["systemKind"],
  properties: {
    systemKind: { type: "string", enum: [...SYSTEM_KINDS] },
  },
} as const;
```

Wiring: `shared/package.json` gains the export subpath
`"./schema/system-kind": "./src/schema/system-kind.ts"` (the package uses
an explicit exports map — without this row the import fails at runtime);
`shared/src/index.ts` re-exports. The doc stays inside the
`jsonSchemaDocSchema` supported-keyword subset (`type`, `required`,
`properties`, `additionalProperties`, `enum` — all in
`shared/src/schema/ontology.ts`'s allow-list), so it passes register-time
validation and compiles via `json-schema-to-zod` in the attribute-zod
cache. zod classification check (drives the `details` split in
`storage/nodes.ts:51-66`): missing key → `invalid_type` with
`received: "undefined"` → `details.missing`; wrong value →
`invalid_enum_value` → `details.type_mismatch`. Matches AC-03/AC-04.

### 3.2 Registry + node storage shape (unchanged mechanics)

- `_OntologyAttributeSchema {label_name: "System"}` row's
  `json_schema_doc` string becomes `JSON.stringify(SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC)`
  — via fresh seed (§4.2) or migration (§4.3). Visible through
  `GET /api/v1/ontology/node-labels` and the `/api/v1/schema` aggregate
  (both read the same row; no route change — AC-02).
- System nodes keep storing `attributes_json` STRING; `systemKind` is an
  ordinary key inside it. No new Neo4j constraint or index (enum
  enforcement is write-path zod, per the registry's design).

## 4. Core logic

### 4.1 Vocabulary singularity guard (FR-01 / AC-01)

`api/__tests__/system-kind-vocabulary.test.ts` (unit, no Neo4j):
1. Asserts `SYSTEM_KINDS` deep-equals `["functional","agentic","ai_predictive"]`
   (exact order), `systemKindSchema.parse("agentic")` passes,
   `.safeParse("predictive").success === false`.
2. Greps production sources (`api/src`, `pwa/src`, `shared/src`,
   `api/scripts`, `scripts`) for the literal `"ai_predictive"` and fails
   on any hit outside: `shared/src/schema/system-kind.ts`, seed/fixture
   **data** files (`shared/seed/*.json`), and test files
   (requirements-review N-02 phrasing).
   Same mechanism as `api/__tests__/no-auth-grep.test.ts`.

### 4.2 Fresh-DB registry seed — no permissive window (FR-07)

`api/src/ontology/seed.ts` `seedRegistryFromConstTuples` currently writes
the same permissive doc for every label
(`jsd: JSON.stringify({type:"object", additionalProperties:true})`,
line ~172). Change: a per-label doc picker —

```ts
import { SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC } from "@companygraph/shared/schema/system-kind";

const SEED_ATTRIBUTE_DOCS: Record<string, unknown> = {
  System: SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC,
};
// in the loop:
jsd: JSON.stringify(SEED_ATTRIBUTE_DOCS[label] ?? { type: "object", additionalProperties: true }),
```

`seed.ts` remains the sole importer of the graph-core const tuples
(`ontology-no-frozen-import.test.ts` guards `NODE_LABELS`/`EDGE_TYPES`/
`EDGE_ENDPOINTS` only — importing the system-kind module elsewhere is
legal and expected). A fresh DB therefore never holds a permissive System
doc (requirements-review C-03 iii), and because the seed writes it
before any route serves,
the attribute-zod cache compiles the tightened validator from first read.

### 4.3 Migration for existing DBs (FR-06, FR-07 — DD-05, DD-06)

New module `api/src/ontology/system-kind-migration.ts`:

```ts
export interface SystemKindMigrationResult {
  registryPatched: boolean;   // did we tighten the doc this run?
  backfilledCount: number;    // Systems that received systemKind:"functional"
  invalidValueCount: number;  // reported, never rewritten (Risk 5)
}
export async function runSystemKindMigration(driver: Driver): Promise<SystemKindMigrationResult>
```

Algorithm (each step idempotent):

1. **Read** the System row's `json_schema_doc` (same Cypher as the
   attribute-zod cache loader). Registry row missing → throw: bootstrap
   ordering guarantees the seed ran first; a missing row is a real fault.
2. **Doc-tightened check**: parsed doc has
   `properties.systemKind.enum` deep-equal `SYSTEM_KINDS`, `required`
   includes `"systemKind"`, and no `default` key under
   `properties.systemKind`. If tightened → skip step 3 entirely
   (no audit/version/event rows on re-run — requirements-review N-01).
3. **Tighten via the sanctioned path — read-merge-write** (DD-14,
   resolves design-review C-03). `patchNodeLabel` SETs
   `json_schema_doc` **wholesale** (`api/src/ontology/storage/node-labels.ts`
   ~360), so passing `SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC` verbatim would
   silently clobber any properties/required entries an operator or a
   later spec added to the System doc. Instead, build the doc to write
   by splicing the systemKind bits into the doc read in step 1:
   `mergedDoc = { ...currentDoc, properties: { ...currentDoc.properties, systemKind: { type: "string", enum: [...SYSTEM_KINDS] } }, required: dedupe([...(currentDoc.required ?? []), "systemKind"]) }`
   (dropping any pre-existing `default` under `properties.systemKind`;
   `additionalProperties` and all other keys pass through untouched).
   On the permissive baseline doc, `mergedDoc` deep-equals
   `SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC`, so AC-08's post-conditions are
   unchanged; on an enriched doc, the additions survive (AC-08d).
   Because the current doc already passed register-time
   `jsonSchemaDocSchema` validation and the splice only adds allow-listed
   keywords, `mergedDoc` stays inside the supported subset. Then:
   `patchNodeLabel(driver, "System", { json_schema_doc: mergedDoc }, "system:migration:system-kind", { forceBackfill: true, backfillValue: DEFAULT_SYSTEM_KIND })`.
   This single tx (a) rewrites the `_OntologyAttributeSchema` row,
   (b) runs the existing APOC backfill over Systems missing the key
   (`api/src/ontology/storage/node-labels.ts` ~317–337 — only
   `attrs[key] IS NULL` rows are touched), and (c) writes audit +
   version + `_OntologyEvent` rows. After commit, emit the route
   handler's exact post-commit event
   (`routes/ontology-node-labels.ts:121-126`), **including its diff
   shape** (design-review N-02 — not an empty diff):
   `ontologyEvents.emit("ontology.changed", { event_id: generateId(), version_id: generateId(), ts, diff: [{ op: "replace", path: "/nodeLabels/System", value: row }] })`
   — so the attribute-zod cache clears and SSE subscribers observe the
   real change. The module comment documents `patchNodeLabel`'s
   wholesale-SET semantics as a warning to downstream specs imitating
   this path (DD-14).
4. **Drift backfill (always runs)** — the Risk-3 backstop for Systems
   created by non-standard paths after the doc was tightened. One batched
   statement (NFR-03: no per-node round trips; APOC is on the compose
   image per graph-core §8.3 and already used by `patchNodeLabel` +
   `api/src/ontology/storage/migrations.ts` — design-review N-01 path
   correction):

   ```cypher
   MATCH (n:System)
   WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs
   WHERE attrs.systemKind IS NULL
   SET n.attributes_json = apoc.convert.toJson(apoc.map.setKey(attrs, "systemKind", $dflt)),
       n.updatedAt = $now
   RETURN count(n) AS c
   ```

   Data-only repair: **no** ontology event rows (the ontology did not
   change); count logged. On the run where step 3 executed, this finds 0.
5. **Invalid-value report (Risk 5 — report, don't rewrite)**: READ query
   counting Systems whose `attrs.systemKind` is non-null and outside
   `SYSTEM_KINDS`; `console.warn` with count + up-to-10 sample ids. Hand
   repair via `PATCH /api/v1/nodes/System/:id`.

**Invocations** (requirements-review C-03):
- **Bootstrap**: `api/src/neo4j/bootstrap.ts` `applySchema` gains step 5,
  after the registry seed and constraint loop:
  `await runSystemKindMigration(driver)`. `server.ts` awaits
  `applySchema` before `Bun.serve`, satisfying "before the API accepts
  writes" on the success path. The existing warn-and-start-anyway catch
  in `server.ts` (`server.ts:14-18`) is house behavior and is not
  changed by this spec.
  **Partial-failure honesty (DD-15, resolves design-review C-01):** the
  uncovered case is a reachable DB where the seed succeeds but
  `runSystemKindMigration` throws (transient APOC/tx error) — the server
  would then accept System writes under a still-permissive doc until the
  next restart. Mitigation, without changing `server.ts`: the step-5
  call in `bootstrap.ts` is wrapped in its own try/catch that logs a
  distinct, actionable line —
  `console.error("[system-kind-migration] FAILED — System writes are UNVALIDATED until 'bun run migrate:system-kind' succeeds (or restart the server; the migration re-runs on every boot)", e)`
  — and rethrows, so the generic `[bootstrap]` warn still fires and boot
  proceeds as today. The **every-boot re-run is the self-healing
  mitigation**: the next restart (or a standalone
  `bun run migrate:system-kind`) closes the window, and step 4's drift
  backfill repairs any Systems written during it.
- **Standalone**: `api/scripts/migrate-system-kind.ts` — loads env,
  builds a driver, runs the migration, prints the result JSON, exits
  non-zero on error. Root `package.json` gains
  `"migrate:system-kind": "bun --cwd api scripts/migrate-system-kind.ts"`
  (no `run` — the `bun --cwd <ws> run <script-path>` form is broken under
  Bun 1.3.9, printing usage instead of executing; the pre-existing
  `schema:apply` script shares the defect. The working form mirrors the
  root `seed` script — cold re-review N-01, STATUS execution deviation 1).

**Rollback** (requirements-review N-04 / DD-11): forward-only. To loosen, re-patch the System
doc permissive via the ontology REST surface; backfilled `"functional"`
values remain as ordinary open-map keys.

### 4.4 Write-path enforcement — shared checker extraction (FR-03, FR-04 — DD-07)

No new validation layer. One refactor in `api/src/storage/nodes.ts`:
split the existing `assertAttributesMatchSchema` into

```ts
// Non-throwing core — returns null when valid, or the classified issue split.
export async function checkAttributesAgainstSchema(
  label: string,
  attributes: Record<string, unknown> | undefined,
): Promise<{ missing: string[]; type_mismatch: string[] } | null>
```

plus the existing throwing wrapper (unchanged semantics, including the
`not_found → permissive` fallback for unregistered labels). The wrapper
keeps serving `createNode`/`patchNode`/`upsertNode` byte-for-byte
identically; the new export additionally serves dry-run (§4.5). PATCH
semantics are untouched: `attributes` present → whole-map validation;
`attributes` omitted → stored map untouched, no validation (AC-06).

### 4.5 Import defaulting + dry-run parity (FR-05 — DD-03, DD-04)

`api/src/routes/import.ts`, two additions:

1. **Injection (OQ-1 closed — inject on import only).** Pure helper
   applied to each raw node row **inside both** `realImport` and
   `dryRunPasses` — i.e. *after* `handleImport`'s envelope-level
   `importPayloadSchema` parse and *before* per-row `nodeWithLabelSchema`
   parsing (cold re-review N-02: the call site is pinned; do not hoist it
   into `handleImport`):

   ```ts
   function injectSystemKindDefault(raw: unknown): unknown {
     if (typeof raw !== "object" || raw === null) return raw;
     const row = raw as Record<string, unknown>;
     if (row.label !== "System") return raw;
     const attrs = row.attributes;
     if (attrs !== undefined && (typeof attrs !== "object" || attrs === null)) return raw; // let validation fail it
     const map = (attrs ?? {}) as Record<string, unknown>;
     if ("systemKind" in map) return raw;              // present (even if invalid) → untouched
     return { ...row, attributes: { ...map, systemKind: DEFAULT_SYSTEM_KIND } };
   }
   ```

   Missing key → injected `functional` (legacy exports load; graph-core
   round-trip holds). Present-but-invalid (`systemKind: 42`) → flows to
   validation → `errors[]` row, collect-and-continue unchanged (AC-07).

2. **Dry-run attribute validation, all labels (requirements-review C-02
   option a).**
   `dryRunPasses` becomes async. Per node row, after
   `nodeWithLabelSchema` passes: call `checkAttributesAgainstSchema(label,
   attributes)` (§4.4 — a registry READ; zero writes preserved). Non-null
   result → push `{ section:"nodes", index, code:"attribute_violation",
   message:"attribute_violation", details }` — the same shape real import
   produces when `upsertNode` throws. Unregistered labels remain
   permissive in both modes (identical divergence-free behavior). Edge
   rows stay envelope-only; the route header comment is updated to state
   the remaining documented limitation (edge endpoint existence needs DB
   state, out of dry-run's contract) **and** (design-review N-03) that
   dry-run is no longer pure: it now requires a reachable registry — a
   thrown connection error mid-loop 500s the request, exactly as real
   import would on a down DB (parity holds, but the previous
   zero-DB-dependency property of `dryRunPasses` is gone by design).

The `/api/v1/export` route is untouched: post-migration every System
carries `systemKind`, so export→import round-trips exactly; pre-migration
export files round-trip via injection (AC-15 keeps
`export-import-roundtrip.integration.test.ts` green).

### 4.6 System-writing path inventory (Risk 3)

| Path | How it writes Systems | Covered by |
|------|----------------------|-----------|
| `POST /api/v1/nodes/System`, `PATCH .../System/:id` | `createNode`/`patchNode` | attribute-zod (strict 400) |
| `POST /api/v1/import` | `upsertNode` | injection (§4.5) + attribute-zod |
| Seed loaders (`bun run seed`, fixtures via `/api/v1/import`) | import route | injection + explicit fixture attributes (§4.7) |
| `POST /api/v1/ontology/import` (current `bun run seed` target) | writes BoundedContext/Entity/Domain rows only — **no System nodes** (verified: passes 1-7 in `routes/ontology-import.ts`) | n/a |
| `seedBoundedContexts` (bootstrap) | BoundedContext/Entity only | n/a |
| Ontology migrations executor (`api/src/ontology/storage/migrations.ts`) | attribute transforms on existing rows; cannot delete a required key without an operator choosing to | migration step 4 drift backfill (backstop) |
| Any future raw-Cypher path | uncontrolled | migration step 4 drift backfill on every boot + step 5 report |

**Legacy read-path note (not a write path — cold re-review C-03, XD-15
shadow vocabulary):** `pwa/src/lib/journeyData.ts:189-190` reads a legacy
`attributes.kind` key off System nodes and the journey canvas renders it
(`pwa/src/components/JourneyCanvas.tsx`, CSS class `.systemKind` in
`JourneyCanvas.module.css`). That `kind` key is NOT the vocabulary: no
write path populates it, the AC-01 grep guard cannot catch it (it hunts
`"ai_predictive"`, not `kind`), and this spec's Systems view reads only
`systemKind` from `attributes_json` (binding constraint in tasks.md T-14).
The `kind` → `systemKind` read-path migration is **assigned to the spec
that next owns the journey canvas** (`ddd-system-modeling` when it touches
system rendering, else the process-explorer-ui surface owner) — carried in
the consolidated report so a downstream author cannot mistake `kind` for
the vocabulary. No code change in this spec (scope-creep edits outside the
§7 table would themselves violate spec governance).

### 4.7 Seed fixtures (FR-08 — DD-10)

- `shared/seed/retail-mini.json`: all 6 System rows gain
  `"attributes": {"systemKind": "functional"}` (FR-08 — explicit, not
  injection-reliant). Counts, ids, edges unchanged (AC-09 asserts
  graph-core AC-07's exact counts + double-seed idempotency).
- `shared/seed/commercial-domain.json` (7 System rows) and
  `shared/seed/retail-mini-enriched.json` (6 System rows): same explicit
  attribute added for consistency. In the enriched fixture, one system is
  classified `agentic` and one `ai_predictive` (Risk-4 demo variety —
  legal literals in seed **data** files per the N-02 grep phrasing).
- **AC-09 verification amendment (DD-13, resolves design-review C-02)** —
  an explicit, traceable deviation, not a footnote. The root
  `bun run seed` script currently posts `shared/seed/commercial-domain.json`
  to `/api/v1/ontology/import` (`_baseline`-era drift; root
  `package.json:13` → `api/scripts/seed.ts`) — a path that writes **no
  System data nodes** (§4.6), so AC-09's literal text ("`bun run seed`
  (retail-mini) loads…") is verifiable by no artifact as-built.
  **Amendment adopted**: *AC-09 is verified via direct POST of
  `shared/seed/retail-mini.json` to `POST /api/v1/import` (the wire path
  the graph-core seed contract defined) in
  `system-kind-seed.integration.test.ts`; the root seed script's drift is
  owned by `_baseline` and is out of this spec's scope.* This amendment
  text MUST be carried verbatim in tasks.md (under the AC-09 task's
  verification), in STATUS.md, and in the consolidated report, so the
  traceability chain shows the deviation. Re-pointing the one-line root
  script was considered and **rejected**: this spec has no requirement
  over the ontology seed, and suites/dev flows that expect
  commercial-domain seeding would be silently broken (blast radius
  outside scope).

## 5. HTTP API surface

**No new routes, no removed routes, no error-code changes**
(`attribute_violation` already exists in the closed `ERROR_CODES` enum),
no `openapi.json` delta — the tightening is runtime registry data
(NFR-02). Behavior deltas on existing routes:

| Method | Route | FR | Behavior delta |
|--------|-------|----|----------------|
| POST | `/api/v1/nodes/System` | FR-03 | missing `systemKind` → `400 attribute_violation` `details.missing:["systemKind"]`; non-enum value → `details.type_mismatch:["systemKind"]`; valid → `201` (unchanged mechanics, tightened registry data) |
| PATCH | `/api/v1/nodes/System/:id` | FR-04 | `attributes` map present → must satisfy tightened doc; omitted → untouched (existing semantics) |
| POST | `/api/v1/import` (`?dryRun=true` too) | FR-05 | System rows lacking `systemKind` get `"functional"` injected pre-validation; dry-run now also reports `attribute_violation` rows for all labels (DD-04) |
| GET | `/api/v1/ontology/node-labels` | FR-02 | System row's `json_schema_doc` shows the tightened doc (data change only) |
| GET | `/api/v1/schema` | FR-02 | aggregate reflects the same row (data change only) |

Auth: all of the above already sit behind the central router gate
(`api/src/router.ts`); zero auth code in this spec (NFR-04).

## 6. UI design

- **View tree placement** (blueprint round-4 additions, verbatim):
  `#/explorer/systems` → `ExplorerSystems` — **existing view extended**;
  no new route, no nav change; the "Systems" SubNav tab already exists in
  `pwa/src/route.ts` SURFACES. New URL state: query param
  `?kind=functional|agentic|ai_predictive` read via `route.params`
  (central parse — UX-06, same pattern as `#/explorer/activities`).
  Wiring change: `pwa/src/views/index.tsx` line 62 becomes
  `"systems": (r) => <ExplorerSystems route={r} />` (the factory already
  receives the route; the view simply hasn't consumed it until now).

- **Component plan** (catalog first — UX-02):
  - **Badge** = catalog `Pill` with tone map
    `functional → neutral`, `agentic → accent`, `ai_predictive → good`,
    unrecognized/missing → `warn` + text `unclassified` (defensive,
    FR-09). Text label always rendered from `SYSTEM_KIND_LABELS` — never
    color-only. Local `kindPill(kind)` helper inside `Systems.tsx`; no
    new component file (downstream `ddd-system-modeling` may extract it
    when a second consumer exists).
  - **Filter** = catalog `Button` ×4 (`All`, `Functional`, `Agentic`,
    `AI predictive`) in a `<div role="group" aria-label="Filter by system
    kind">`. `Button` is extended **additively** with an optional
    `pressed?: boolean` prop that renders `aria-pressed` (the component
    today accepts no aria passthrough; this is the minimal catalog
    extension, justified because a toggle-state affordance has no
    existing catalog row). Active control: `tone="primary"` +
    `pressed`; inactive: `tone="ghost"` + `pressed={false}`. `onClick`
    rewrites `location.hash` via `toHash({surface:"explorer",
    tab:"systems"}, kind ? {kind} : undefined)` — state stays URL-first;
    the view re-renders from `route.params` (FR-10).
  - **Chart** = existing `HorizontalBarChartCard`, fed the
    filter-narrowed rows. **Table** = existing `DataTable` with a new
    `kind` column (Pill cell). `Card`, `ViewHeader`, `Loading`,
    `ErrorState` from `_shared` unchanged.

- **Data**: the view's single Cypher adds `.attributes_json` to the
  projection (`s{.id, .name, .description, .attributes_json}`); the view
  parses it client-side (`JSON.parse` in try/catch → `null` kind on
  failure) and validates the value against `SYSTEM_KINDS` imported from
  `@companygraph/shared/schema/system-kind` — no enum literal in `pwa/`
  source (AC-01). Filtering is client-side over the fetched rows (view
  already caps at 1001 rows; single-tenant scale) and narrows table +
  chart together. Unknown `?kind=` values → treated as `All` (FR-10).

- **States** (UX-01 / FR-11):
  - *loading*: `<Loading what="systems" />` (existing).
  - *error*: `<ErrorState message={…} />` (existing).
  - *empty (no systems)*: fetched rows length 0 → "No systems yet —
    create systems via the API or SME surfaces." inside the `Card`.
  - *empty (filter zero-match)*: active kind with 0 matching rows →
    "No {label} systems — clear the filter to see all systems." + a
    `Button` (`href="#/explorer/systems"`) as the clear-filter affordance.
  - *ready*: filter row + chart + table with badges.

- **Tokens** (UX-02): any new styling lands in
  `pwa/src/views/explorer/Systems.module.css` using `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css` only; no inline color/size
  literals. Gate: `bun scripts/design-conformance.ts` on the touched view
  (AC-14).

- **Input modes** (requirements Platforms & Input Modes table): badges
  are non-interactive text; filter controls are plain buttons — tap,
  mouse click, Enter/Space (native button activation, no custom key
  handlers), Tab order = DOM order (filter group above the table),
  `aria-pressed` exposes state, focus ring from the existing button
  styles (FR-12).
  **Touch-target honesty (DD-09 revised — resolves design-review
  B-01):** the catalog `Button` is a fixed **28 px** control
  (`Button.module.css:2`, `height: 28px`; no `min-height`/`min-width`
  or 44 px rule exists anywhere in the PWA). 28 px IS the "existing
  house minimum" the requirements' Platforms table demands and meets
  WCAG 2.2 AA 2.5.8 (24 px minimum); it does not meet the 44 px
  AAA/Apple-HIG figure, and this design does not claim it does. AC-10's
  iPhone Safari touch leg is therefore verified **manually** (§8: tap
  each of the four filter controls on an iPhone, verify each activates
  without mis-taps); the automated `touch-targets.test.tsx` extension
  asserts only what jsdom can honestly prove — button semantics,
  `type="button"`, and `.btn` class presence — and the file's stale
  "44px minimum" comment is corrected in the same edit.
  Native Conflicts: none introduced — no scroll containers, gestures,
  focus traps, or shortcuts (matches the requirements' `(none)` row).

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/system-kind.ts` | new | FR-01, FR-02 | §3.1 — tuple, zod enum, type, default, labels, tightened doc |
| `shared/package.json` | modify | FR-01 | add `./schema/system-kind` export subpath |
| `shared/src/index.ts` | modify | FR-01 | re-export the module |
| `api/src/ontology/seed.ts` | modify | FR-07 | per-label seed doc: System gets tightened doc (§4.2) |
| `api/src/ontology/system-kind-migration.ts` | new | FR-06, FR-07 | §4.3 `runSystemKindMigration` |
| `api/src/neo4j/bootstrap.ts` | modify | FR-07 | `applySchema` step 5 runs the migration; distinct failure log + rethrow (DD-15) |
| `api/scripts/migrate-system-kind.ts` | new | FR-07 | standalone runner |
| `package.json` | modify | FR-07 | root `migrate:system-kind` script |
| `api/src/storage/nodes.ts` | modify | FR-03, FR-04, FR-05 | DD-07 non-throwing `checkAttributesAgainstSchema` extraction (no behavior change) |
| `api/src/routes/import.ts` | modify | FR-05 | §4.5 injection + async dry-run attribute validation |
| `shared/seed/retail-mini.json` | modify | FR-08 | 6 System rows gain explicit `systemKind: "functional"` |
| `shared/seed/commercial-domain.json` | modify | FR-08 (consistency) | 7 System rows, same |
| `shared/seed/retail-mini-enriched.json` | modify | FR-08 (Risk-4 variety) | 6 rows; one `agentic`, one `ai_predictive` |
| `pwa/src/views/explorer/Systems.tsx` | modify | FR-09..FR-12 | badges, filter, states, Cypher projection |
| `pwa/src/views/explorer/Systems.module.css` | modify | FR-09, UX-02 | filter-row styling, tokens only |
| `pwa/src/views/index.tsx` | modify | FR-10 | pass `route` to `ExplorerSystems` |
| `pwa/src/components/Button.tsx` | modify | FR-12 | additive `pressed?: boolean` → `aria-pressed` |
| `api/__tests__/system-kind-vocabulary.test.ts` | new | AC-01 | unit — tuple + grep guard |
| `api/__tests__/system-kind-registry.integration.test.ts` | new | AC-02 | registry doc shape via node-labels route |
| `api/__tests__/system-kind-enforcement.integration.test.ts` | new | AC-03..AC-06 | POST/PATCH/GET round-trips |
| `api/__tests__/system-kind-import.integration.test.ts` | new | AC-07 | legacy payload, invalid row, dry-run parity |
| `api/__tests__/system-kind-migration.integration.test.ts` | new | AC-08 (+a/b/c/d) | stale-DB, re-run quiet, bootstrap/script/fresh-seed modes, merge-preserve (DD-14) |
| `api/__tests__/system-kind-seed.integration.test.ts` | new | AC-09 | retail-mini via `POST /api/v1/import`, exact counts, idempotency |
| `pwa/src/__tests__/system-kind-filter.test.tsx` | new | AC-10, AC-11, AC-12 | filter, deep link, states, empty variants |
| `pwa/src/__tests__/system-kind-badges.test.tsx` | new | AC-13 | badge labels, aria-pressed, keyboard activation |
| `pwa/src/__tests__/touch-targets.test.tsx` | modify | AC-10 (touch, structural leg), DD-09 | filter controls: button semantics + `.btn` class (structure only — jsdom cannot measure size); **corrects the stale "44px minimum" comment** (design-review B-01); size verified manually on iPhone Safari (§8) |
| `pwa/src/__tests__/system-view.test.tsx` | modify | AC-15 regression | mock rows gain `attributes_json`; assertions stay green |

## 8. Test strategy

**Unit (`bun test`, no Neo4j):**
- `system-kind-vocabulary.test.ts` → AC-01 (tuple exactness + literal grep).
- `pwa` vitest suites: `system-kind-filter.test.tsx` → AC-10 (badge per
  row, `unclassified` fallback, filter narrows table + chart data,
  rendering with `route.params.kind="agentic"` pre-filters — the
  deep-link render path), AC-11 (mocked pending/failed/ok fetch →
  Loading/ErrorState/ready), AC-12 (zero rows → "No systems yet"; active
  filter + zero matches → clear-filter affordance whose href is
  `#/explorer/systems`). `system-kind-badges.test.tsx` → AC-13
  (aria-pressed on active control, Tab-order = DOM order, Enter/Space
  fires the hash rewrite, badge text labels present).
  `touch-targets.test.tsx` extension → DD-09 **structural leg only**
  (renders the filter group; asserts each control is a real `<button
  type="button">` carrying the `.btn` class — jsdom cannot compute
  module CSS, so no size claim is made; the stale "44px minimum"
  comment in that file is rewritten to state the true 28 px house size
  and point at the manual iPhone repro). Size/touch leg → manual (below).

**Integration (`bun test:integration`, live Neo4j; auth via the existing
dev-fallback session pattern the current integration suites use):**
- `system-kind-registry.integration.test.ts` → AC-02: System row doc has
  the enum, `required` contains `systemKind`, **no `default` keyword**.
- `system-kind-enforcement.integration.test.ts` → AC-03..AC-06 exactly as
  tabulated in requirements (three valid values round-trip; missing →
  `details.missing`; `"predictive"` → `details.type_mismatch`; PATCH
  matrix incl. name-only PATCH leaving stored value untouched).
- `system-kind-import.integration.test.ts` → AC-07: legacy payload
  (no `systemKind`) imports and reads back `functional`; `systemKind: 42`
  row lands in `errors[]` with code `attribute_violation` while valid
  rows import; `?dryRun=true` returns the **same per-row verdicts** with
  zero writes (DB row-count unchanged) — the DD-04 parity contract.
- `system-kind-migration.integration.test.ts` → AC-08 plus the
  requirements-review C-03 closures: **AC-08a** — reset the System doc
  permissive + strip
  `systemKind` from seeded Systems, run `applySchema(driver)` (the
  bootstrap entry `server.ts` awaits), assert doc tightened, all Systems
  `functional`, an `_OntologyEvent` row exists; **AC-08b** — same stale
  setup, `Bun.spawn(["bun", "scripts/migrate-system-kind.ts"])` from
  `api/`, exit 0, same post-conditions; **AC-08c** — empty registry →
  `applySchema` → System doc already tightened, `registryPatched` would
  be false on a follow-up run, zero patch/backfill event rows beyond the
  single bootstrap-seed event; **re-run quiet** (requirements-review
  N-01) — second run:
  zero data-row mutations, zero new `_OntologyEvent`/`_OntologyVersion`
  rows; **Risk-5 report** — a hand-planted `systemKind:"bogus"` row is
  counted in `invalidValueCount` and not rewritten; **AC-08d
  (merge-preserve, DD-14 — design-review C-03)** — pre-plant a System
  doc that is neither permissive nor tightened (an extra
  `properties.owner` entry + `required: ["owner"]`), run the migration,
  assert the resulting doc contains **both** the tightened systemKind
  bits and the untouched `owner` property/required entry.
- `system-kind-seed.integration.test.ts` → AC-09 **as amended by DD-13**
  (§4.7 — amendment text carried into tasks.md/STATUS.md/consolidated
  report): POST `shared/seed/retail-mini.json` to `/api/v1/import`,
  zero row errors, 6 Systems all `functional`, node/edge counts equal
  graph-core AC-07, second POST adds nothing.

**Regression (AC-15):** `bun run typecheck`;
`api/__tests__/openapi.integration.test.ts` and
`export-import-roundtrip.integration.test.ts` unmodified and green.

**Manual (with repro, from requirements):** AC-10 (mouse/reload) — open
`http://127.0.0.1:5173/#/explorer/systems?kind=agentic` in macOS Chrome,
reload (mouse) — expect only agentic rows and the Agentic control
pressed. **AC-10 (touch — DD-09, resolves design-review B-01)** —
iPhone Safari via a temporary `vite --host` LAN exposure of the dev
PWA only (the API stays loopback-bound; Vite's `/api/v1` proxy runs on
the Mac), or macOS Safari responsive design mode as fallback: open
`#/explorer/systems`, tap each of the four filter controls in turn —
expect each tap to activate the intended control without mis-taps and
the table/chart to narrow accordingly.
AC-13 — keyboard-only macOS Safari: Tab to `Agentic`, Enter, verify
table narrows and focus ring stays visible. AC-14 —
`bun scripts/design-conformance.ts` from repo root, exit 0.

## 9. Rejected alternatives

- **Subtype labels / per-feature enums** — rejected in blueprint XD-15;
  not re-litigated (NFR-01).
- **JSON-Schema `default` for `systemKind`** — silent data gap:
  `storage/nodes.ts` persists input attributes, not zod output (Risk 2;
  AC-02 asserts absence).
- **Strict-reject import** (OQ-1 alternative) — breaks the graph-core
  export→import round-trip for pre-migration files and contradicts
  XD-15's "existing systems default to functional"; review C-01 directed
  adoption of inject-on-import.
- **Dry-run parity scoped to System rows only** (requirements-review
  C-02 option b) —
  dry-run would remain a liar for every other label; the all-labels read
  is free of writes and aligns dry-run with real import.
- **Standalone backfill Cypher instead of `patchNodeLabel`** for the
  registry step — would duplicate the audit/version/event plumbing and
  skip the `would_invalidate` machinery this spec is meant to prove
  end-to-end (requirements Motivation 3).
- **Neo4j constraint for the enum** — property-value constraints on a
  JSON-string sub-key don't exist in Community edition; write-path zod is
  the registry's designed enforcement point.
- **New `SystemKindBadge` component** — one consumer today; catalog
  `Pill` + a local helper suffices, extraction deferred to the second
  consumer (`ddd-system-modeling`).
- **Timed NFR-03 assertion** — a wall-clock test on shared CI Neo4j
  flakes; the batched-single-statement property is the real guarantee
  (requirements-review N-03: aspirational, comment-only).
- **Per-view 44 px hit-area for the filter controls** (design-review
  B-01 option 1) — would make the four filter buttons the only
  outsized controls in an app of uniformly 28 px buttons, an
  inconsistency with no requirement behind it (the requirements demand
  "≥ existing house minimum", which 28 px is); rejected in favor of
  honest phrasing + manual iPhone verification (option 2).
- **Global `.btn` 44 px minimum** (design-review B-01 option 3) — blast
  radius across every view in the PWA; out of this spec's scope. If the
  house wants HIG-size targets, that is its own spec.
- **Wholesale doc overwrite in migration step 3** (the revision-1
  design) — clobbers operator/later-spec additions to the System doc
  because `patchNodeLabel` SETs `json_schema_doc` wholesale; replaced
  by DD-14 read-merge-write (design-review C-03).
- **Re-pointing the root `bun run seed` script at retail-mini** to make
  AC-09's literal text true (design-review C-02) — one line, but it
  silently changes what every dev flow and suite seeds
  (commercial-domain via `/api/v1/ontology/import` today); the drift is
  `_baseline`-owned. Rejected in favor of the explicit DD-13 AC-09
  verification amendment.
