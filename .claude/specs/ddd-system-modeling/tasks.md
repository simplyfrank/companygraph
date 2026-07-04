---
feature: "ddd-system-modeling"
created: "2026-07-04"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: "approved (rev 2 — 2026-07-04): 15 FRs, 7 NFRs, 22 ACs (AC-01..21 + AC-06b)"
reviewing_design_revision: "approved (2026-07-04), design-review pass 1 = approve (0 blockers, 3 concerns C-01..C-03, 3 nits N-01..N-03)"
size: "large"
total_tasks: 17
---

# Tasks: ddd-system-modeling

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  completion without one for every AC.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck` (covers
  `api/src/server.ts` + `pwa/src/main.tsx` — no `tsc`); after tasks that ship
  behaviour, also run the listed test. Tasks touching `pwa/src/views/`
  additionally run `bun run scripts/design-conformance.ts --view <file>` for
  **every file the task touches** under `pwa/src/views/` — each `.tsx` and each
  `.module.css` gets its own invocation.
- Integration tests (`*.integration.test.ts`) need Neo4j (`bun test:integration`
  after `bun run dev`); unit/component tests run under `bun test`.

## Hard build-order precondition (design §1.1)

Some surfaces this spec consumes are **new files owned by dependencies that do
not exist on disk until those specs merge**. Verified **present** at authoring
time (`model-workspace-core` + `system-augmentation-model` foundations landed):
`api/src/storage/model-scope.ts` (`scopedNodeIds`), `api/src/storage/models.ts`,
`api/src/storage/model-lifecycle-guard.ts` (`LIFECYCLE_EDGES`),
`api/src/scripts/register-model-labels.ts` (`registerModelSchema`),
`shared/src/schema/system-kind.ts` (`SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`/
`systemKindSchema`). Verified **absent** at authoring time and bound at
implementation time: `pwa/src/context/ActiveModelContext.tsx` (`useActiveModel`,
`model-workspace-core` FR-15), `pwa/src/views/model/*` incl. the model surface's
`systems` tab slot in `pwa/src/views/index.tsx` (`model-workspace-core`), and
**`story-spec-core`'s** `UserStory` label +
`api/src/scripts/register-story-labels.ts` (`registerStorySchema`) +
`api/src/scripts/seed-rbac-roles.ts`'s `business_architect` role +
`DESCRIBES_ACTIVITY` join. **T-01 must not start until `story-spec-core` has
merged** (its wave-2 predecessor; `system-augmentation-model` too). Every task
binds to the real files once they land; the design cites their approved
signatures (design §1.1, §3.1, §4.6, §4.8, §4.10).

## Design-review carry-forwards (design-review pass 1 = approve; 3 concerns, 3 nits)

`review-design.md` closed **approve** with 0 blockers. The three concerns and
three nits are corrections of *interface naming / testability / table hygiene* —
none changes the architecture. Each is landed here as a binding decision so the
execution agent does not re-derive it.

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **C-01** — §4.3's MERGE-path endpoint check names a **private, non-exported** `validateEdge` (`api/src/storage/edges.ts:38`), and §8 lists `edges.ts` under "Not edited (consumed)". As written there is no in-scope call for the check. **Verified**: `getEdgeEndpoints(type, driver)` **is exported** (`api/src/ontology/cache/edge-endpoints.ts:53`) and is the very primitive `validateEdge` itself uses (`edges.ts:49`). | The MERGE paths (`addNeededBy`, `addSupportedBy`, `setContext`) call the **exported `getEdgeEndpoints(type, driver)`** and compare the returned `[fromLabel, toLabel]` pair list against the triple; on miss they throw `edge_endpoint_label_mismatch` (400). **`api/src/storage/edges.ts` is NOT edited** (`validateEdge` stays private; it is not exported). `capabilities.ts` imports `getEdgeEndpoints` directly. | T-04 (mapping edges) |
| **C-02** — §4.6's "detached" state is defined but the design shows a Neo4j edge **cannot** outlive either endpoint (`DETACH DELETE` removes it), so a truly dangling edge is unconstructible for graph-core-deletable nodes; AC-13 asserts a UI "detached indicator" with no way to build the state in a test. | **Decision (design-review recommendation (b)):** `detached` is a **defensively-rendered read-model field** on `getCapability`, unit-tested by feeding a **hand-built label-mismatched edge** (an `ASSIGNED_TO_CONTEXT` edge whose target node's `BoundedContext` label was removed via a direct-driver `REMOVE n:BoundedContext` in the test fixture — the one place a direct-driver write is allowed, and only in a test). The AC-13 **component** test asserts the indicator renders **when the read-model `detached[]` is non-empty** (fed a stub response), decoupling the UI assertion from constructing a live dangling edge. | T-03 (`getCapability` `detached[]` + unit test), T-14/T-15 (component: indicator on non-empty `detached[]`) |
| **C-03** — §3.1's "consumed interfaces (verified signatures)" table mixes true **imports** (`scopedNodeIds`, `createNodeLabel`, `getEdgeEndpoints`, `SYSTEM_KINDS`, `_helpers`) with symbols this spec **edits in place** and that are **module-private** (`getRoutePermission`/`P`/`ROUTE_PERMISSIONS` in `rbac-permissions.ts`). | No behaviour change. Recorded as an **errata note** (below) so the implementer treats `P`/`ROUTE_PERMISSIONS` as *edited-in-place module internals* of `rbac-permissions.ts` (T-08), **not** as importable symbols. `getRoutePermission` remains a consumed export (the router calls it — unchanged). | T-08, Deviations |
| **N-01** — §4.4 `orphanSystems` query traverses only `(:Activity)-[:USES_SYSTEM]->(sys)`; FR-07(c) says "capabilities-**or**-activities". | The capability arm is **vacuous** by definition: a system reached through `SUPPORTED_BY` *is* mapped to a capability, so it cannot be an orphan. The activities-only traversal is correct and complete. Locked as-is with a code comment. | T-05 |
| **N-02** — §4.4 augmentation-mix null/unknown bucket has no AC and no concrete key. | The bucket key is the string literal **`"unknown"`**; `gapsResultSchema` (T-01) includes it; the PWA render (T-13/T-14) reads it. Defensive only (a pre-migration system with a missing/invalid `systemKind`); not asserted by an AC. | T-01, T-05, T-14 |
| **N-03** — §4.10 states the on-disk `"systems"` key collision (explorer's `ExplorerSystems` at `pwa/src/views/index.tsx:62` vs. the model surface's `systems` slot). | Noted as done-well. The **only** `index.tsx` edit is the **model surface's** `systems` slot → `<SystemModeler>`; the **explorer** surface's `systems` → `ExplorerSystems` stays untouched. | T-12 |

## Deviations from requirements / design (orchestrator: land as errata, no ID renumbering)

| Item | Executed as | Why | Source |
|------|-------------|-----|--------|
| AC-17 `manual: run … design-conformance.ts …` | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | It is a deterministic script with an exit code, not a human visual check | requirements AC-17, design §6 |
| AC-20 second clause `manual: git grep …` | **CLI** grep (`git grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx` expects exit 1 / no matches) | Deterministic exit code; not a human check | requirements AC-20 |
| Design §3.1 table hygiene (review C-03) | `P`/`ROUTE_PERMISSIONS` treated as edited-in-place module internals of `rbac-permissions.ts`; `getRoutePermission` stays a consumed export | Table listed edited-in-place private symbols alongside imports | design-review C-03 |

---

## Task list

### T-01 — Capability + mapping + result zod schemas (shared)

- **Files** (1): `shared/src/schema/ddd-system.ts` (new)
- **Implements**: design §3.2, §3.3, §5 — supports FR-01, FR-02, FR-04, FR-05,
  FR-07, FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: — (but see the hard build-order precondition — do not start
  until `story-spec-core` + `system-augmentation-model` merge)
- **Blocks**: T-03, T-04, T-05, T-06, T-09, T-11, T-13
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US identifiers).
  **Capability**: `capabilityCreateSchema` = `{ name: z.string().min(1),
  description: z.string().optional(), attributes: z.record(z.unknown()).optional() }`;
  `capabilityPatchSchema` = `{ name?: z.string().min(1), description?:
  z.string(), attributes?: z.record(z.unknown()) }` (all optional, omitted →
  unchanged, mirrors `patchNode`); `capabilityReadSchema` = envelope
  (`id`/`name`/`description`/`createdAt`/`updatedAt`/`attributes`) **plus** the
  §3.2 derived read fields — list row: `neededByCount:int`,
  `supportingSystemCount:int`, `assignedContextId: z.string().nullable()`,
  `assignedContextName: z.string().nullable()`; detail additionally embeds
  `neededBy: {kind:"activity"|"story", id, name}[]`, `supportedBy: {id, name,
  systemKind: systemKindSchema}[]` (import `systemKindSchema` from
  `shared/src/schema/system-kind.ts` — never a re-declared literal, NFR-03),
  `assignedContext: {id, name, domain, subdomain} | null`, and `detached:
  {kind:"needed-by"|"supported-by"|"context", targetId: string}[]` (review C-02).
  **Mapping bodies**: `neededBySchema` = `{ activityId?: z.string().min(1),
  storyId?: z.string().min(1) }` **with a `.refine` that exactly one is present**
  (design §4.3); `supportedBySchema` = `{ systemId: z.string().min(1) }`;
  `contextAssignSchema` = `{ boundedContextId: z.string().min(1) }`.
  **Result aggregates**: `gapsResultSchema` = `{ unsupportedSteps:
  {activityId, activityName}[], capabilityGaps: {activityId, activityName}[],
  capabilitiesWithoutSystem: {capabilityId, name}[], orphanSystems: {systemId,
  name}[], augmentationMix: { perCapability: {capabilityId, name, counts:
  {functional:int, agentic:int, ai_predictive:int, unknown:int}, shares:{…} }[],
  model: {functional:int, agentic:int, ai_predictive:int, unknown:int} } }` —
  the `unknown` key is present per review N-02; `contextMapResultSchema` = `{
  contexts: {id, name, domain, subdomain, capabilities: {id,name}[],
  relationships: {type, targetId, targetName}[]}[], unassigned: {id, name}[] }`
  (relationship far-end resolved to `targetId`, DD-07/C-01).
- **Verification**: `shared/src/schema/__tests__/ddd-system.test.ts` — parse
  valid/invalid payloads; `capabilityCreateSchema` rejects a body missing `name`
  and one with empty `name`; `capabilityPatchSchema.parse({})` is valid
  (all-optional); `neededBySchema` **rejects** a body with neither `activityId`
  nor `storyId` **and** rejects one with both (the `.refine`);
  `gapsResultSchema`/`contextMapResultSchema` accept a representative fixture
  incl. the `unknown` mix bucket.

### T-02 — Register Capability label + four edges (idempotent) + boot wiring

- **Files** (3): `api/src/scripts/register-capability-labels.ts` (new),
  `api/src/neo4j/bootstrap.ts` (modify), `package.json` (modify)
- **Implements**: design §4.6, §7, DD-01, DD-04 — closes AC-01, AC-02; supports
  FR-01, FR-02, NFR-01
- **Complexity**: moderate
- **Blocked by**: — (hard build-order precondition applies)
- **Blocks**: T-03, T-04, T-05, T-06
- **Steps**: `registerCapabilitySchema(driver)` (export), **passing the required
  `actor` arg to every registry call** (`createNodeLabel`/`createEdgeType` are
  `(driver, input, actor)` — actor = `"system:ddd-system"`): one
  `createNodeLabel` (`Capability`, permissive `json_schema_doc:{}`) **then** four
  `createEdgeType` calls — `NEEDS_CAPABILITY` with its **two** endpoint pairs
  `[{from:"Activity",to:"Capability"},{from:"UserStory",to:"Capability"}]`
  (DD-04 — one type, two `_OntologyEdgeEndpoint` rows), `SUPPORTED_BY`
  (`Capability→System`), `ASSIGNED_TO_CONTEXT` (`Capability→BoundedContext`),
  `CAPABILITY_IN_MODEL` (`Capability→BusinessModel` — this spec's **own**
  membership edge, DD-01; deliberately **not** in `model-lifecycle-guard.ts`'s
  `LIFECYCLE_EDGES`). Nodes-before-edges is required (`createEdgeType` runs
  `assertEndpointLabelsExist`, verified `edge-types.ts:218`). Each call wrapped to
  swallow `409 name_conflict` → **idempotent** (mirror
  `register-model-labels.ts`'s `isNameConflict`). Do **not** touch
  `NODE_LABELS`/`EDGE_ENDPOINTS` consts (NFR-01, AC-21). In `applySchema`
  (`api/src/neo4j/bootstrap.ts`): call `registerCapabilitySchema` **after** both
  `registerModelSchema` (so `BusinessModel` exists for `CAPABILITY_IN_MODEL`) and
  `registerStorySchema` (so `UserStory` exists for the second `NEEDS_CAPABILITY`
  pair) — design §4.6 boot ordering. Add a `register:capability` script to
  `package.json` invoking `registerCapabilitySchema` standalone.
- **Verification**: `api/__tests__/capability-labels.integration.test.ts`
  (`Capability` appears in `GET /api/v1/schema`; `NODE_LABELS` unchanged; re-run
  adds no duplicate label rows — AC-01) +
  `api/__tests__/capability-edges.integration.test.ts` (all four edges register
  via `createEdgeType` incl. **both** `NEEDS_CAPABILITY` pairs; a wrong pair —
  e.g. `SUPPORTED_BY` from `Capability→Role` — returns `400
  edge_endpoint_label_mismatch`; **assert no `Capability→BusinessModel` pair was
  added to `IN_MODEL`** — B-01, DD-01; `EDGE_ENDPOINTS` const unchanged — AC-02).

### T-03 — Additive error codes

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.5 — closes part of FR-10
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-04, T-05, T-06, T-11
- **Steps**: Append **three** additive codes to the closed `ERROR_CODES` array
  (NFR-11; no existing code removed/reordered, exhaustive assertion kept happy):
  `capability_not_found` (404), `bounded_context_not_found` (404),
  `system_not_found` (404). **Reuse** the existing `model_not_found` (verified
  `errors.ts`), `not_found` (bad `activityId`/`storyId` on `needed-by`, with
  `details.field`), `edge_endpoint_label_mismatch` (registry validator), and
  `invalid_payload` — **do not duplicate** them (FR-10). Only reachable codes are
  added: each of the three new codes is thrown by ≥1 route (T-04/T-05).
- **Verification**: `api/__tests__/capability-openapi.integration.test.ts`
  (jointly with T-11) asserts each of the three new codes is a member of
  `ERROR_CODES` and appears in the OpenAPI `ErrorEnvelope.code` enum;
  `bun run typecheck` passes the exhaustiveness assertion.

### T-04 — Capability CRUD + mapping-edge storage (atomic create + membership + MERGE idempotency)

- **Files** (1): `api/src/storage/capabilities.ts` (new)
- **Implements**: design §4.1, §4.2, §4.3, §4.6 (detached), DD-01, DD-02, DD-03,
  DD-06, review C-01 — closes AC-03, AC-04, AC-06b (storage half); supports
  FR-04, FR-05, FR-03, NFR-02
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03
- **Blocks**: T-05, T-06, T-09, T-10
- **Steps**: Import `scopedNodeIds` from `api/src/storage/model-scope.ts`
  (consumed, never re-implemented) and **`getEdgeEndpoints` from
  `api/src/ontology/cache/edge-endpoints.ts`** (the exported endpoint-lookup for
  MERGE-path validation — review C-01; **do not export/edit `validateEdge`**).
  The `Capability` envelope is the plain node envelope (DD-03); write it via this
  module's own parameterized Cypher — the generic `createNode`/`patchNode`
  primitives (`api/src/storage/nodes.ts`) stay **byte-for-byte unchanged** (they
  cannot atomically wire `CAPABILITY_IN_MODEL`). Membership rides
  `(cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})` — a `Capability`
  is **never** in `scopedNodeIds` (DD-02).
  - **`listCapabilities(driver, modelId)`** — §4.1 Cypher: membership `MATCH` +
    `OPTIONAL MATCH` needed-by/supported-by/assigned-context; `RETURN` counts +
    `assignedContextId/Name`; `ORDER BY cap.createdAt ASC`. The membership MATCH
    is the sole model filter (orphan-sourced capability lists correctly — AC-06b).
    Unknown `:modelId` → `[]` (no 404 on reads).
  - **`getCapability(driver, modelId, capabilityId)`** — resolve by id **and**
    membership else `404 capability_not_found` (a capability of another model is
    *not found* here — AC-09). Embed `neededBy`, `supportedBy` (each `systemKind`
    parsed from `sys.attributes_json`'s `systemKind` via `systemKindSchema`),
    `assignedContext`, and `detached` (review C-02: `OPTIONAL MATCH` each mapping
    and report `{kind, targetId}` for any edge whose expected endpoint label is
    absent; normal path → `[]`).
  - **`createCapability(driver, modelId, input)`** — (1) `MATCH (m:BusinessModel
    {id:$modelId})` else `404 model_not_found` (reused). (2) atomic create +
    membership in one write tx: `CREATE (cap:Capability {id:$id (UUIDv7),
    name,description,createdAt,updatedAt,attributes_json}) WITH cap MATCH
    (m:BusinessModel {id:$modelId}) MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)` →
    `201` + full `capabilityReadSchema` (counts 0, `assignedContext:null`,
    `detached:[]`).
  - **`patchCapability`** — membership check; dynamic SET of supplied
    `name`/`description`/`attributes` (omitted untouched, mirrors `patchNode`);
    `SET cap.updatedAt=$now` → `200`.
  - **`deleteCapability`** — membership check, then the single-tx cascade (T-05
    handles the query but the storage entry point lives here; keep the
    `DETACH DELETE` in this module) → `204`.
  - **Mapping edges** — each validates the capability is in `:modelId` first
    (`404 capability_not_found`), then the far-end, then writes via `MERGE`
    (idempotent, DD-06) **after** an explicit endpoint check
    (`getEdgeEndpoints(type, driver)` → assert `(fromLabel,toLabel)` ∈ the list
    else `edge_endpoint_label_mismatch` — review C-01):
    - `addNeededBy(driver, modelId, capabilityId, {activityId?, storyId?})` —
      validate the target belongs to the model: an `Activity` ∈
      `scopedNodeIds(modelId)`; a `UserStory` whose `DESCRIBES_ACTIVITY` activity
      ∈ `scopedNodeIds(modelId)` (consumes `story-spec-core`'s join). Miss →
      `404 not_found` (`details.field`). Then `MERGE (src)-[:NEEDS_CAPABILITY]->(cap)`
      → `200`.
    - `removeNeededBy` — `DELETE r` → `204`.
    - `addSupportedBy(…, {systemId})` — verify `(:System {id})` else `404
      system_not_found`; `MERGE (cap)-[:SUPPORTED_BY]->(sys)` → `200`.
    - `removeSupportedBy(…, systemId)` — `DELETE r` → `204`.
    - `setContext(…, {boundedContextId})` — verify `(:BoundedContext {id})` else
      `404 bounded_context_not_found`; **replace** in one tx (at-most-one, FR-03):
      `OPTIONAL MATCH (cap)-[old:ASSIGNED_TO_CONTEXT]->() DELETE old WITH cap
      MATCH (bc:BoundedContext {id}) MERGE (cap)-[:ASSIGNED_TO_CONTEXT]->(bc)` →
      `200`.
    - `clearContext(…)` — `DELETE r` → `204`.
- **Verification**: `api/__tests__/capability-crud.integration.test.ts` (create →
  201 + UUIDv7 + `CAPABILITY_IN_MODEL` edge even with no mapping; unknown model →
  `404 model_not_found`; list scoped w/ counts; detail embeds needed-by /
  supported-by w/ `systemKind` / assigned context; PATCH preserves omitted;
  DELETE → 204 — AC-03) + `api/__tests__/capability-mapping.integration.test.ts`
  (`PUT needed-by {activityId}` and `{storyId}` idempotent `MERGE`; `PUT
  supported-by {systemId}`; `PUT context` replaces prior at-most-one; each DELETE
  removes; unknown cap/system/context → matching `404 *_not_found`; a forged wrong
  pair → `400 edge_endpoint_label_mismatch` via `getEdgeEndpoints` — AC-04) +
  `api/__tests__/capability-detached.test.ts` (**unit**, review C-02:
  `getCapability` returns a non-empty `detached[]` for a hand-built
  label-mismatched mapping — the fixture removes the `BoundedContext` label from
  the far node via a direct-driver `REMOVE n:BoundedContext`, the sole allowed
  test-only direct-driver write). Fixtures otherwise API-only via
  `model-workspace-core`'s `POST /api/v1/models` + `.../domains` + core
  node/journey routes + `story-spec-core`'s story routes (design §9 — no
  direct-driver seeding).

### T-05 — Support-gap analysis + augmentation mix (system-model read aggregate)

- **Files** (1): `api/src/storage/system-model.ts` (new — gap half)
- **Implements**: design §4.4, DD-05, DD-09, review N-01, N-02 — closes AC-06,
  AC-06b (analysis half), AC-07; supports FR-07, FR-08, NFR-07
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-04
- **Blocks**: T-09, T-10
- **Steps**: `computeGaps(driver, modelId)` — **read-only, deterministic,
  side-effect-free**, a **bounded** set of reads (no per-capability N+1, NFR-07).
  Precompute `scopedActivityIds = [...scopedNodeIds(driver, modelId)]` JS-side.
  - **(a) unsupportedSteps + (b') capabilityGaps (FR-08, DD-09)** — one pass over
    model activities (§4.4 Cypher): per activity count `capPathSystems`
    (`(a)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(capSys:System)`)
    and `directSystems` (`(a)-[:USES_SYSTEM]->(directSys:System)`). Post-classify:
    both 0 → `unsupportedSteps`; capPath 0 & direct >0 → `capabilityGaps`; capPath
    >0 → not flagged.
  - **(b) capabilitiesWithoutSystem** — model-scoped capabilities
    (`CAPABILITY_IN_MODEL`) with `WHERE NOT (cap)-[:SUPPORTED_BY]->(:System)`.
  - **(c) orphanSystems** — `MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
    MATCH (a)-[:USES_SYSTEM]->(sys) WHERE NOT (:Capability)-[:SUPPORTED_BY]->(sys)`
    with a `DISTINCT`. **Add a code comment** (review N-01): the FR-07(c)
    "capabilities-or-activities" capability arm is **vacuous** — a system reached
    via `SUPPORTED_BY` is by definition mapped to a capability, so only the
    activities arm can yield an orphan.
  - **(d) augmentationMix (FR-07d, AC-07)** — per model-scoped capability,
    `collect(sys.attributes_json)`; JS-side parse each, read `systemKind` via
    `systemKindSchema`/`SYSTEM_KINDS` (never a re-declared literal, NFR-03), bucket
    into `{functional, agentic, ai_predictive, unknown}` (the `unknown` bucket
    per review N-02 catches a missing/invalid pre-migration `systemKind`); emit
    per-capability counts + shares and a model-level roll-up (sum over
    capabilities).
  Return `{ unsupportedSteps, capabilityGaps, capabilitiesWithoutSystem,
  orphanSystems, augmentationMix:{perCapability, model} }` — each item carrying
  ids/names to deep-link, matching `gapsResultSchema` (T-01).
- **Verification**: `api/__tests__/system-gap-analysis.integration.test.ts` —
  seed X (capability→system), Y (`USES_SYSTEM` only), Z (neither), capability C
  (no system), system S (used, no capability): gaps returns Z∈`unsupportedSteps`,
  Y∈`capabilityGaps`, C∈`capabilitiesWithoutSystem`, S∈`orphanSystems`, X
  unflagged (AC-06); augmentation mix `{functional:2, agentic:1, ai_predictive:1}`
  + shares + model roll-up, kinds via `SYSTEM_KINDS` (AC-07). Fixture API-only;
  `System.attributes.systemKind` set on seed systems via the core node write
  (default `functional` per `system-augmentation-model`; the mix fixture sets
  explicit kinds).

### T-06 — Context map (system-model read aggregate, id-resolved relationships)

- **Files** (1): `api/src/storage/system-model.ts` (extend — context-map half)
- **Implements**: design §4.5, DD-07, review C-01 (id-resolution) — closes AC-08;
  supports FR-09, NFR-04, NFR-07
- **Complexity**: moderate
- **Blocked by**: T-01, T-04
- **Blocks**: T-09
- **Steps**: `computeContextMap(driver, modelId)` — a **bounded, read-only** join
  of the model's assigned capabilities to the existing bounded-contexts surface
  (design §4.5 Cypher). Contexts with ≥1 model-scoped capability assigned:
  `MATCH (cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId}) MATCH
  (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext) OPTIONAL MATCH
  (bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)` returning
  `capabilities:[{id,name}]` and `relationships:[{type:type(r), targetId:other.id,
  targetName:other.name}]` (**id-resolved**, DD-07/C-01 — **not** the
  bounded-contexts route's name-only `{type,target}`). Filter JS-side the
  `{type:null,…}` rows the `OPTIONAL MATCH` yields for a context with no outgoing
  relationship. Plus an `unassigned` bucket: model capabilities with `WHERE NOT
  (cap)-[:ASSIGNED_TO_CONTEXT]->(:BoundedContext)`. Return `{ contexts:
  [{id,name,domain,subdomain,capabilities,relationships}], unassigned:[{id,name}] }`
  matching `contextMapResultSchema` (T-01). **No `BoundedContext`/relationship is
  created or mutated** (NFR-04, read-only — do not import/call any
  bounded-contexts write path).
- **Verification**: `api/__tests__/context-map.integration.test.ts` — assign two
  model-scoped capabilities to `BC1 Product Catalogue`, one to `BC4 Pricing &
  Markdown`, leave one unassigned; context-map groups under BC1/BC4 (each with its
  existing `domain`/`subdomain`), inter-context `UPSTREAM_OF`/`DOWNSTREAM_OF`
  relationships carry the far context's **`id`** (C-01), the unassigned bucket
  holds the fourth capability; assert **no** `BoundedContext`/relationship was
  created or mutated (AC-08).

### T-07 — Cascade delete integration test

- **Files** (1): `api/__tests__/capability-cascade.integration.test.ts` (new)
- **Implements**: design §4.4 (cascade) — closes AC-05; supports FR-06
- **Complexity**: moderate
- **Blocked by**: T-04
- **Blocks**: —
- **Steps**: Seed a capability wired to all four edge types (a `NEEDS_CAPABILITY`
  in from an activity **and** a story, a `SUPPORTED_BY` to a system, an
  `ASSIGNED_TO_CONTEXT` to a bounded context, and its `CAPABILITY_IN_MODEL`).
  `DELETE /api/v1/models/:modelId/capabilities/:capabilityId` → 204; assert **all
  four** edge types on the capability are gone in one transaction (no dangling
  edges — query the far nodes for any residual relationship of those types
  pointing at the deleted id) and the far-end `Activity`/`UserStory`/`System`/
  `BoundedContext`/`BusinessModel` nodes **still exist** (AC-05). Fixture API-only.
- **Verification**: `api/__tests__/capability-cascade.integration.test.ts`
  (AC-05).

### T-08 — Route-permission mapping + RBAC role grant + authz test

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8, C-04 (precedence), review C-03 — closes AC-09
  (authz half); supports FR-11, NFR-05
- **Complexity**: moderate
- **Blocked by**: T-09 (routes exist to permission-map) — see note
- **Blocks**: T-11
- **Steps**: In `rbac-permissions.ts` add the **13** `ROUTE_PERMISSIONS` rows via
  the in-place `P(...)` helper (review C-03 — `P`/`ROUTE_PERMISSIONS` are
  **edited-in-place module internals**, not imports), in the **exact ordered list
  of design §4.8** — **specific-before-parameterized** because `getRoutePermission`
  is first-match-wins (`matchSegments` requires equal segment count, verified
  `rbac-permissions.ts:309`): the two `system-model/{gaps,context-map}` GETs
  (`capability:read`), the collection GET (`capability:read`) / POST
  (`capability:write`), the six sub-routes
  (`needed-by`/`supported-by`[/:systemId]/`context` — all `capability:write`),
  then the parameterized `capabilities/:capabilityId` GET (`capability:read`) /
  PATCH / DELETE (`capability:write`) **last**. The security-critical property:
  **every** new route has a row (an unmapped route → `getRoutePermission` null →
  router skips the RBAC check → silent open write). No route is `public`; auth
  stays in the central gate (NFR-05 — **no per-route check**). In
  `seed-rbac-roles.ts` **add** `"capability:read"` + `"capability:write"` to the
  existing `business_architect` role's permission array (idempotent MERGE by role
  name — this spec **modifies** the role `model-workspace-core` created; it does
  not create it).
- **Note on order**: T-08 lists T-09 as its blocker so the route strings match the
  dispatch regexes exactly; the `P` rows can be authored from design §4.8 in
  parallel but must be reconciled against T-09's final path literals.
- **Verification**: `api/__tests__/capability-authz.test.ts` — a session without
  `capability:write` → 403 on `POST /capabilities`, `PUT needed-by/supported-by/
  context`, `PATCH`, `DELETE`; a `capability:read` session → 200 on the list GET
  and the two `system-model` GETs; `getRoutePermission` resolves **every** new
  route (never null); the `:capabilityId` GET/PATCH/DELETE resolves to the right
  permission despite the sub-routes (C-04 precedence); the `business_architect`
  role resolves both `capability:*`; no new route `isPublicRoute` (AC-09 authz
  half).

### T-09 — Route handlers + router dispatch (models/:modelId/capabilities* + system-model/*)

- **Files** (2): `api/src/routes/capabilities.ts` (new),
  `api/src/router.ts` (modify)
- **Implements**: design §4.7 — supports FR-04, FR-05, FR-07, FR-09, FR-10
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-06
- **Blocks**: T-08, T-10, T-11
- **Steps**: **Handlers** (`api/src/routes/capabilities.ts`) — the 13 handlers of
  design §4.7 returning the `{error:{code,message,details?}}` envelope via
  `_helpers.ts` (`ok`/`noContent`/`error`/`parseWith`/`fromValidationError`),
  mirroring existing route files: `handleCapabilityList`/`Create`/`Get`/`Patch`/
  `Delete`, `handleNeededByPut`/`Delete`, `handleSupportedByPut`/`Delete`,
  `handleContextPut`/`Delete`, `handleGaps`, `handleContextMap`. Each parses its
  body with the T-01 zod schema at the boundary; error codes delegate to the
  storage layer (T-04/T-05/T-06). **Dispatch** (`api/src/router.ts`) — add a
  `registerCapabilityRoutes(method, sub, req)` block **immediately after** the
  existing `models*` block (which falls through when `registerModelRoutes`
  returns null — verified `router.ts:389`), with a `sub.match(/…/)` chain ordered
  **specific-before-parameterized** exactly per design §4.7: (1)
  `^models\/([^/]+)\/system-model\/gaps$`, (2) `^…\/system-model\/context-map$`,
  (3) `^models\/([^/]+)\/capabilities$`, (4) `…\/:capabilityId\/needed-by$`, (5)
  `…\/supported-by$`, (6) `…\/supported-by\/([^/]+)$`, (7) `…\/context$`, (8)
  `^models\/([^/]+)\/capabilities\/([^/]+)$` — **last**.
- **Verification**: exercised through the route surface by
  `capability-crud`/`capability-mapping`/`system-gap-analysis`/`context-map`
  integration tests (T-04/T-05/T-06) and `capability-authz.test.ts` (T-08 —
  `getRoutePermission` resolves each new route); `bun run typecheck`.

### T-10 — Model isolation + orphan-source integration test

- **Files** (1): `api/__tests__/capability-model-scope.integration.test.ts` (new)
- **Implements**: design §3.4, §4.1, DD-02, DD-08 — closes AC-06b (isolation),
  AC-09 (isolation half); supports NFR-02
- **Complexity**: moderate
- **Blocked by**: T-04, T-05, T-09
- **Blocks**: T-11
- **Steps**: Seed **two** models (API-only: `POST /api/v1/models` + `.../domains`
  + core node/journey routes + story routes). **(AC-06b)** In model A create a
  capability whose **only** `NEEDS_CAPABILITY` source is an activity that is
  **not** `PART_OF` any of model A's domains (i.e. **not** in
  `scopedNodeIds(modelA)`) — assert it **still appears** in `GET
  .../capabilities` and in `.../system-model/gaps` for model A (resolved via
  `CAPABILITY_IN_MODEL`, not source-in-`scopedNodeIds`). **(AC-09 isolation)**
  Give each model its own capabilities; assert `GET
  /api/v1/models/:modelA/capabilities` and `.../system-model/gaps` return only
  model-A capabilities (via each capability's `CAPABILITY_IN_MODEL`) and
  **exclude** every capability whose `CAPABILITY_IN_MODEL` points at model B;
  assert a capability id is **not** itself a member of `scopedNodeIds` (isolation
  rides `CAPABILITY_IN_MODEL`, not `PART_OF`); a shared `System` may appear in
  both models' analyses.
- **Verification**: `api/__tests__/capability-model-scope.integration.test.ts`
  (AC-06b, AC-09 isolation half).

### T-11 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: design §4.9 — closes AC-09 (openapi half); supports FR-10
- **Complexity**: moderate
- **Blocked by**: T-01, T-03, T-08, T-09
- **Blocks**: —
- **Steps**: Register the capability/system-model request+response schemas
  (`capabilityCreateSchema`, `capabilityPatchSchema`, `capabilityReadSchema`,
  `neededBySchema`, `supportedBySchema`, `contextAssignSchema`, `gapsResultSchema`,
  `contextMapResultSchema` — all from T-01) and `registerPath` each of the 13
  routes (design §4.7/§5), generated from the same zod definitions (no
  hand-maintained copy, FR-10). The three new `ERROR_CODES` members surface in the
  shared `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/capability-openapi.integration.test.ts` —
  every new route path and each of the three new `ERROR_CODES` members appears in
  `GET /api/v1/openapi.json` (AC-09 openapi half; also confirms T-03's codes).

### T-12 — PWA api client (capabilities + systemModel blocks)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.11, review N-03 — supports FR-12, FR-13, FR-15
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-13
- **Steps**: Add a `capabilities` block and a `systemModel` block to the `api`
  object (design §4.11), reusing the existing `json<T>()` fetch wrapper (verified
  `api.ts:40`). `capabilities`: `list`/`get`/`create`/`patch`/`remove` (on
  `/api/v1/models/${modelId}/capabilities…`) plus nested `neededBy` (`put`/
  `remove`), `supportedBy` (`put`/`remove(systemId)`), `context` (`put`/`clear`).
  `systemModel`: `gaps`/`contextMap` (on `…/system-model/…`). Each read accepts
  an optional `signal`. Where a system's kind is read for a badge, read
  `attributes.systemKind` via `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`
  (`shared/src/schema/system-kind.ts`) — never the legacy `attributes.kind`
  (FR-15). No production `systemKind` string literal outside the imported
  vocabulary module (AC-20).
- **Verification**: `bun run typecheck`; consumed + asserted transitively by
  `pwa/src/__tests__/system-modeler.test.tsx` (T-13).

### T-13 — SystemModeler view + detail/edit + ready panels + view registration

- **Files** (3): `pwa/src/views/model/SystemModeler.tsx` (new),
  `pwa/src/views/model/SystemModeler.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.10, §6, review C-02 (detached), N-02 (unknown bucket),
  N-03 (index.tsx edit scope) — closes AC-10, AC-11, AC-12, AC-13, AC-20 (view
  half); supports FR-12, FR-13, FR-14, FR-15, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-12
- **Blocks**: T-14, T-15, T-16
- **Steps**: In `pwa/src/views/index.tsx`, **replace the model surface's**
  `systems` slot dispatch (registered by `model-workspace-core` as
  `<ModelTabPlaceholder …/>`) with `"systems": (r) => <SystemModeler route={r} />`
  — the **only** edit to that file; leave the **explorer** surface's `systems`
  → `ExplorerSystems` untouched (review N-03; `route.ts`/`SURFACES` stay
  `model-workspace-core`'s). `SystemModeler` reads the active `BusinessModel` from
  `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx` — **does not
  re-implement model selection**), keys its three fetches (`api.capabilities.list`,
  `api.systemModel.gaps`, `api.systemModel.contextMap`) on `activeModel.id`.
  Render the **ready** state (AC-10/11/12) as three panels: the **capability
  list** (`DataTable`/`Card`; each row: name, needed-by count, supporting systems
  as `systemKind` `Pill`s, assigned context name); the **support-gap panel** (the
  four FR-07 categories with counts + deep-link affordances + the augmentation-mix
  summary, the `unknown` bucket rendered defensively per N-02); the **context-map
  panel** (contexts grouped with their capabilities + inter-context relationships,
  plus the `unassigned` bucket). **Detail + mapping editing** (AC-13): selecting a
  capability opens a catalog `SidePanel`/`Modal` with name/description, its
  `NEEDS_CAPABILITY` sources, `SUPPORTED_BY` systems each with a `systemKind`
  `Pill`, and assigned context; controls: edit (PATCH), add/remove needed-by
  source, add/remove supporting system, set/clear context (all FR-05 routes),
  delete the capability; a mapping whose read-model `detached[]` entry matches
  shows the **"detached" indicator** (review C-02 — driven by the read-model
  field, not a live dangling edge). **Tokens + catalog** (NFR-06, UX-02):
  `SystemModeler.module.css` uses only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; catalog components (`Card`,
  `DataTable`, `Pill`, `Modal`, `SidePanel`, `Button`,
  `Loading`/`ErrorState`/`NotFoundPanel` from `views/_shared.tsx`) before
  inventing new ones. `systemKind` conveyed by `Pill` **text**
  (`SYSTEM_KIND_LABELS`), not color alone (AC-18/AC-20).
- **Verification**: `pwa/src/__tests__/system-modeler.test.tsx` (`#/model/systems`
  → `SystemModeler`, not `ModelTabPlaceholder`; reads `useActiveModel()`; ready
  capability list w/ needed-by count, `systemKind` badges, context name — AC-10) +
  `pwa/src/__tests__/system-modeler-gaps.test.tsx` (four gap categories + counts +
  deep-links + augmentation-mix summary via `systemKind` badges — AC-11) +
  `pwa/src/__tests__/system-modeler-context-map.test.tsx` (capabilities grouped
  under contexts + unassigned bucket + inter-context relationships — AC-12) +
  `pwa/src/__tests__/system-modeler-detail.test.tsx` (detail panel w/ name/desc +
  needed-by + supported-by badges + context; edit PATCHes; add/remove needed-by/
  system + set/clear context call the FR-05 routes and update the panel; detached
  indicator renders when a stub response's `detached[]` is non-empty — AC-13,
  review C-02) + **CLI** (AC-17, AC-20 — deterministic): `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx`
  **and** `--view pwa/src/views/model/SystemModeler.module.css` both exit 0; `git
  grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx`
  → no matches.

### T-14 — SystemModeler view-state tests (loading / empty+create / error+retry)

- **Files** (1): `pwa/src/__tests__/system-modeler-states.test.tsx` (new)
- **Implements**: design §4.10 — closes AC-14, AC-15, AC-16
- **Complexity**: moderate
- **Blocked by**: T-13
- **Blocks**: —
- **Steps**: jsdom component test of the three non-ready states of `SystemModeler`:
  **loading** — skeleton (`Loading` from `views/_shared.tsx`) while the three
  fetches are pending (AC-14); **empty** — no capabilities → empty-state `Card`
  offering a **"New capability"** action (POST `.../capabilities` → the new
  capability appears) and, when the model has activities/stories, a hint to start
  mapping (AC-15); **error** — a failed fetch renders the error state **plus a
  retry affordance** whose click refetches (AC-16 — if `ErrorState` renders no
  retry itself, the retry is a local `<Button onClick={refetch}>` rendered by
  `SystemModeler` alongside it).
- **Verification**: `pwa/src/__tests__/system-modeler-states.test.tsx` (AC-14,
  AC-15, AC-16).

### T-15 — SystemModeler systemKind read-path test

- **Files** (1): `pwa/src/__tests__/system-modeler-kind.test.tsx` (new)
- **Implements**: design §4.11, FR-15 — closes AC-20 (component half); supports
  NFR-03
- **Complexity**: simple
- **Blocked by**: T-13
- **Blocks**: —
- **Steps**: jsdom component test asserting `SystemModeler` reads a system's kind
  from `attributes.systemKind` and renders the badge via
  `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` (`shared/src/schema/system-kind.ts`) — feed
  a capability whose supporting system carries `attributes.systemKind:"agentic"`
  and assert the rendered badge shows the `SYSTEM_KIND_LABELS["agentic"]` **text
  label** (not color-only). Pairs with the T-13 CLI grep (AC-20 has a component +
  CLI half).
- **Verification**: `pwa/src/__tests__/system-modeler-kind.test.tsx` (AC-20
  component half).

### T-16 — SystemModeler model-context reload e2e

- **Files** (1): `pwa/playwright/system-modeler-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-19; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-13
- **Blocks**: —
- **Steps**: Playwright spec: with a non-reference model (model B) active,
  navigate to `#/model/systems`, reload → the same route renders `SystemModeler`
  showing **model B's** capabilities/gaps/context-map (active-model persistence is
  `model-workspace-core` FR-15; this view refetches for the persisted model).
  Assert no cross-model leakage (server-enforced via `CAPABILITY_IN_MODEL`
  membership, §4.1). Seed via the API (models + domains + capability + mapping
  routes).
- **Verification**: `pwa/playwright/system-modeler-context.spec.ts` (AC-19).

### T-17 — SystemModeler keyboard-a11y manual walk

- **Files** (0): no new source; validates T-13's view
- **Implements**: design §4.10, §6 — closes AC-18; supports FR-12, FR-13, UX-05
- **Complexity**: simple
- **Blocked by**: T-13
- **Blocks**: —
- **Steps**: Confirm the view exposes an ARIA landmark; Tab reaches "New
  capability" then the capability list in DOM order; opening a capability detail
  moves focus into the panel and Escape/close returns it (reusing the catalog
  `SidePanel`/`Modal` focus-trap — not re-implemented); mapping controls
  (add/remove needed-by/system, set/clear context) are keyboard-reachable and
  activatable; each `systemKind` badge carries its text label (not color-only).
- **Verification**: `manual: with the stack up (bun run dev), load
  #/model/systems using keyboard only — Tab to "New capability" and activate with
  Enter, Tab into the capability list, Enter to open a capability — expect focus
  enters the detail panel, moves through the mapping controls in order, each
  systemKind badge shows its text label, and Escape returns focus to the
  originating list row.`

## Cross-cutting verification (whole-spec)

- **AC-21** (transpile clean + no compile-time schema-array edit): `bun run
  typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS` or
  `EDGE_ENDPOINTS` for the `Capability` label / four edge types (incl. **no**
  `IN_MODEL` endpoint-pair change — B-01). Not a standalone task — checked at the
  final validation sweep (after T-02).

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-13) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-21 (+AC-06b) sweep + AC-21 (`git diff` NODE_LABELS/EDGE_ENDPOINTS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 Capability label | T-01, T-02 | AC-01, AC-21 |
| FR-02 mapping + scoping edges (4 types) | T-01, T-02 | AC-02, AC-21 |
| FR-03 cardinality (MERGE idempotent / at-most-one / exactly-one) | T-04 | AC-04 |
| FR-04 capability CRUD | T-01, T-04, T-09 | AC-03, AC-15 |
| FR-05 mapping routes | T-01, T-04, T-09 | AC-04, AC-13 |
| FR-06 cascade + detached | T-04 (detached), T-07 (cascade), T-13/T-14 (indicator) | AC-05, AC-13 |
| FR-07 support-gap (4 categories + mix) | T-05, T-09 | AC-06, AC-07, AC-11 |
| FR-08 USES_SYSTEM reconciliation | T-05 | AC-06 |
| FR-09 context map | T-06, T-09 | AC-08, AC-12 |
| FR-10 openapi + error codes | T-03, T-09, T-11 | AC-04, AC-09 |
| FR-11 route-perm + RBAC | T-08 | AC-09 |
| FR-12 SystemModeler + 4 states | T-12, T-13, T-14 | AC-10, AC-14, AC-15, AC-16 |
| FR-13 detail + mapping editing | T-13 | AC-13, AC-18 |
| FR-14 model-scope + reload survival | T-13, T-16 | AC-10, AC-19 |
| FR-15 systemKind read-path repoint | T-12, T-13, T-15 | AC-20 |
| NFR-01 registry-only, no const edit | T-02 | AC-01, AC-02, AC-21 |
| NFR-02 model isolation via CAPABILITY_IN_MODEL | T-04, T-05, T-10 | AC-06b, AC-09 |
| NFR-03 systemKind vocab reuse | T-01, T-05, T-12, T-15 | AC-07, AC-20 |
| NFR-04 bounded-contexts read-only | T-06 | AC-08 |
| NFR-05 house rules (loopback/zod/`/api/v1/`/en-US/central auth) | T-08, T-09, all | AC-09, AC-21 |
| NFR-06 tokens-only + catalog | T-13 | AC-17 |
| NFR-07 bounded round-trips (no N+1) | T-05, T-06 | AC-06, AC-08 |
