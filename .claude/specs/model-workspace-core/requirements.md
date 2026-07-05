---
feature: "model-workspace-core"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 5
size: "large"
---

# Requirements: model-workspace-core

> **Revision 5 (2026-07-05) — orchestrator-side fold of the requirements
> pass-2 review (B-03 + C-12 + C-13 + N-08 + N-09), per the recorded user
> decision.** The earlier rev-5 frontmatter stamp carried no content; this
> note is the actual revision. No IDs renumbered; **AC-22 is new**.
> - **B-03 (user decision 2026-07-05: option 1 — reject at import):**
>   `POST /api/v1/import` joins the FR-08 lifecycle guard set — any payload
>   row whose node label or edge type is in the lifecycle set is rejected
>   `409 model_lifecycle_route_required` with **write-nothing** semantics
>   (pre-scan before phase 1). FR-08 + NFR-04 reworded to be true; new
>   **AC-22** pins it; built by tasks T-23..T-25. Lifecycle-aware
>   backup/restore is explicitly out of scope (owner named in Scope
>   Boundaries).
> - **C-12:** FR-08's generic-node guard parenthetical now includes
>   `POST /api/v1/nodes/:label` (create) — matching the shipped guard; AC-03
>   gains the create arm.
> - **C-13:** FR-06/FR-07 body rows now carry the rev-3 errata D-2/D-3
>   contracts inline (required `targetDomainId`; explicit-version publish
>   mode) instead of errata-only overrides.
> - **N-08:** AC-01 label-count wording fixed (three module labels; four
>   registry additions total incl. `BusinessModel`).
> - **N-09:** traceability note — the additive `POST /api/v1/models/:id/domains`
>   route is exercised as fixture setup by AC-05/AC-06/AC-21/AC-22; that
>   implicit coverage is its sanctioned proof (no dedicated AC).

> **Revision 2 (2026-07-04)** — resolves every finding in
> `review-requirements.md` (pass 1). **B-01** → new **FR-18** + **AC-21** define
> and verify the server-side model-scoped read; **NFR-03** split so its two halves
> each name a building FR. **B-02** (fix option b) → **FR-08** names a *dedicated
> model-scoped write route* as the single fork-enforcement point (core `_baseline`
> node/edge write contracts stay untouched), the generic routes **reject**
> writes/deletes targeting the lifecycle labels/edges (`409
> model_lifecycle_route_required` — so `DELETE /api/v1/nodes/BusinessModel/:id`
> can never bypass FR-05's reference protection, and `PATCH .../BusinessModuleVersion/:id`
> can never mutate a snapshot), **AC-03/AC-06** assert both the fork path and the
> generic-path rejections, and **FR-11** records why Business Architect does NOT
> need `node:write`/`edge:write`. **C-01** → DELETE added to FR-05 + FR-12 +
> AC-03. **C-02** → FR-03/FR-04/AC-02 reworded to the runtime
> `_OntologyEdgeEndpoint` registry (the compile-time `EDGE_ENDPOINTS` const is
> off-limits). **C-03** → `module_downgrade_not_allowed` named in FR-13 + FR-09 +
> AC-07. **C-04** → `ordinal` uniqueness constraint + allocation strategy stated
> in FR-05/FR-10/NFR-02. **C-05** → the reference-node scoping question is
> promoted to a **blocking decision (DEC-01)** the orchestrator must confirm
> before design, with a design-basis default. **C-06** → `moduleInstanceCount`
> added to the FR-05 list response; FR-16 consumes it (no N+1 fetch). Nits:
> **N-01** → AC-06 asserts "checksum-identical" via the FR-02/FR-06 `checksum`;
> **N-02** → ASCII `|` in FR-01's status enum; **N-03** → no change required
> (as-built claims confirmed by the reviewer; the stale `App.tsx` "Alt+1..8"
> comment is flagged for design in Risk 6). No existing stable IDs were
> renumbered; FR-18 and AC-21 are new.

> **Revision 3 (2026-07-04) — errata block only (no ID renumbering).** Lands the
> design rev-3 Deviations Register (design §2.1 D-1…D-5) plus the design-review
> N-10 label-count fix, so tasks + tests execute against one reading. Each entry
> below **overrides** the corresponding frozen rev-2 text where they conflict:
>
> - **D-1 (supersedes FR-18/AC-21 `?model=` text):** no `?model=<id>` query
>   parameter is added to any GET in this spec. Scope resolves from the
>   `:modelId` **path** param; AC-21's isolation proof is the `scopedNodeIds`
>   test + the path-scoped instance list.
> - **D-2 (supersedes FR-07's `{moduleId, version?}` body):** the instantiate
>   body carries a **required `targetDomainId`** third field, validated as a
>   `Domain` linked `IN_MODEL` to the model (bad/foreign domain → `400`).
> - **D-3 (extends FR-06):** publish supports an optional explicit-version mode
>   (`{version?}`); a collision with an existing version → `409
>   module_version_immutable`. Default stays auto-increment `max+1`.
> - **D-4 (supersedes AC-06's generic-path arm):** "generic write on a
>   version-owned node → `409 module_version_immutable`" is unreachable under
>   the blob-snapshot model; a generic write to a `BusinessModuleVersion` node
>   returns `409 model_lifecycle_route_required`. `module_version_immutable` is
>   reachable **only** via the D-3 explicit-version publish collision.
> - **D-5 (supersedes AC-16's literal command):** the positional
>   `design-conformance.ts pwa/src/views/model/` invocation is inert; the
>   enforced form is two `--view <file>` invocations (the `.tsx` **and** the
>   `.module.css`), both exiting 0.
> - **Additive route (design §4.3, review C-06):** `POST /api/v1/models/:id/domains`
>   (`model:write`) creates a `Domain` + its `IN_MODEL` edge in one tx — the
>   minimal sanctioned API path that populates a user-created model; carried
>   here for traceability under FR-07 setup.
> - **N-10 label-count fix:** the lifecycle **node-label** set has **four**
>   members (`BusinessModel`, `BusinessModule`, `BusinessModuleVersion`,
>   `ModuleInstance`), not five; the edge set has five members. Any rev-2
>   "five new labels" phrasing reads as four.

> **Revision 4 (2026-07-04)** — resolves all six pass-2 concerns in
> `review-requirements.md` (verdict: approve; fixes applied without re-review
> per the 2-pass cap) plus nits N-04/N-06/N-07/N-10. Body text is edited in
> place, so where the rev-3 errata entries D-1/D-4/D-5 previously overrode
> frozen rev-2 text, body and errata now **agree** (D-2/D-3 and the additive
> `POST /api/v1/models/:id/domains` route remain errata-only, unaffected). No
> stable IDs renumbered.
>
> - **C-06** → the snapshot representation is fixed as the **blob** model
>   (serialized snapshot content on the `BusinessModuleVersion` node, per the
>   `journey-versions`/`JourneySnapshot` prior art) in FR-06. FR-08's guard set
>   is rewritten accordingly: no "version-owned" graph nodes are generically
>   reachable, so the lifecycle-label rejection is the *complete* generic-path
>   immutability protection, and "stays untouched" is precised to
>   "non-lifecycle write contract unchanged; the guard is a constant-time
>   label pre-check, not a per-write membership scan". AC-06's generic-path
>   arm asserts `model_lifecycle_route_required` only;
>   `module_version_immutable` is proven via the explicit-version publish
>   collision (AC-04, rev-3 D-3). NFR-04 aligned.
> - **C-07** → **DEC-01 is CLOSED** at this approval gate (silent-accept per
>   XD-17): shared reference nodes, model-scoped process structure. Risk 1,
>   FR-18, and Scope Boundaries record it as *decided*; design cites DEC-01 as
>   closed in its frontmatter — it is not carried forward as an open question.
> - **C-08** → the FR-08 membership rejection is a named code:
>   `404 module_instance_node_not_member`, added to FR-13's `ERROR_CODES`
>   additions and asserted in AC-06.
> - **C-09** → FR-18's application surface corrected (agrees with rev-3 D-1):
>   the helper is proven directly (AC-21) plus via the path-scoped FR-07
>   instance list; no `?model=` query parameter on any GET. AC-21 reworded.
> - **C-10** → FR-10 `--down` removes only `IN_MODEL` edges into the Business
>   Model #1 root (never an unqualified sweep) and refuses without `--force`
>   when other models exist; AC-08 asserts a second model survives.
> - **C-11** → AC-16's verification uses the enforced `--view <file>` form
>   (agrees with rev-3 D-5); the bare positional form is inert and proves
>   nothing.
> - Nits: **N-04** → FR-18 states non-forked instance content resolves from
>   the pinned version snapshot, not the scoped node set. **N-06** → FR-05's
>   at-most-one-reference guarantee restated as property-presence or
>   transactional enforcement (no native partial constraint exists). **N-07**
>   → FR-05's delete cascade explicitly includes forked-subtree copy nodes.
>   **N-10** folded into body (NFR-01/AC-20/Dependencies now say four labels).
>   **N-05** → no change required (a caution addressed to downstream specs).

## Summary

`model-workspace-core` is **foundation wave 1** of the Business Modeling Studio
(blueprint `.claude/specs/blueprint.md`). It lets multiple business models
coexist side-by-side in one graph and share **versioned, journey-level business
modules**. It introduces a `BusinessModel` root node that scopes each model's
subgraph, the module lifecycle (publish at a version → instantiate per model →
fork a local instance on in-model edit → upgrade explicitly), an idempotent +
reversible migration that folds today's retail graph into **Business Model #1**,
a new **Business Architect** persona/RBAC role wired through the existing
persona/RBAC subsystem, and the new top-level **Model** PWA surface — the shell,
its `route.ts` registration for *all* Model tabs, the shell-owned active-model
context, and the `ModelWorkspace` view at `#/model/models`.

It **does not** ship stories/acceptance-criteria (`story-spec-core`), the
authoring wizard or `ModelCanvas` (`business-model-authoring`), KPIs
(`kpi-impact-mapping`), or capabilities (`ddd-system-modeling`). It registers
those sibling Model tabs in the nav (one feature owns `route.ts`) but their views
belong to their owning specs.

## Motivation

1. Everything downstream in the studio pipeline (`author → graph → optimize →
   measure → systematize`) assumes it can ask "which business model am I looking
   at?". Without a `BusinessModel` scoping root, every subgraph is global and two
   businesses cannot coexist (blueprint XD-06).
2. Modeling a client's business next to the retail reference requires **reuse
   with isolation**: a journey-level module authored once, published at a version,
   and instantiated into many models — with in-model edits that don't leak across
   models (blueprint XD-07). This is the hardest novel design in the studio and
   must land first, on top of the proven `journey-versions` snapshot pattern.
3. The existing retail graph is unscoped. Adopting one regime ("everything lives
   under a model") means migrating it into Business Model #1 — and that migration
   touches every existing top-level node, so it must be idempotent and reversible
   with a dry-run (blueprint XD-12, Risks row 2).
4. Model-authoring is a distinct write surface. The existing SME persona keeps
   review/annotate; a new **Business Architect** persona owns model/module writes
   via the persona/RBAC subsystem already in the tree (blueprint XD-08).
5. The studio needs a home. A new top-level **Model** surface, its route
   registration, and a shell-level active-model context are prerequisites for
   every wave-2+ Model view; they must be built once, here, and consumed (never
   re-implemented) by the rest.

## Functional Requirements

<!-- Priorities: must = M1 walking skeleton depends on it; should = polish. -->

### Graph domain model — BusinessModel + module labels (XD-01, XD-02)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **`BusinessModel` root label** registered as a **runtime ontology label** via the ontology-manager registry (`createNodeLabel`, `_OntologyNodeLabel`), NOT as a compile-time `NODE_LABELS` addition. Carries the standard node envelope (`id` UUIDv7, `name`, `description`, `createdAt`, `updatedAt`, `attributes`) plus attributes `{ ordinal: number, status: "active"|"archived", isReference: boolean }` (N-02: ASCII `|`, copy-safe into zod). Registration is idempotent (safe to re-run against an existing registry). | must | XD-01, XD-06 |
| FR-02 | **Module label set** registered via the same registry path: `BusinessModule` (catalog entry, journey-level), `BusinessModuleVersion` (an immutable published version of a module), `ModuleInstance` (a per-model instantiation pinned to one version). Each carries the standard envelope; version-specific attributes `{ version: int, publishedAt, checksum }`; instance attributes `{ forked: boolean, pinnedVersion: int }`. | must | XD-01, XD-07 |
| FR-03 | **Scoping edge** `IN_MODEL` registered via the ontology-manager **edge-type** registry (`createEdgeType`), with its endpoint pair `Domain → BusinessModel` written as an `_OntologyEdgeEndpoint` row through that call. (C-02: the compile-time `EDGE_ENDPOINTS` const in `shared/src/schema/edges.ts` is off-limits — `api/src/storage/edges.ts` validates registry-only against `_OntologyEdgeEndpoint` via the T-13 cache; no edit to the frozen const.) A model's subgraph is every `Domain` scoped by `IN_MODEL` plus everything reachable from those domains through the existing `PART_OF` hierarchy (journeys, activities). Descendants inherit scope transitively; they are NOT individually `IN_MODEL`-linked. | must | XD-06 |
| FR-04 | **Module lifecycle edges** registered via the edge-type registry (`createEdgeType`): `HAS_VERSION` (`BusinessModule → BusinessModuleVersion`), `INSTANTIATES` (`ModuleInstance → BusinessModuleVersion`, the pin), `INSTANCE_IN` (`ModuleInstance → BusinessModel`), and `FORKED_FROM` (`ModuleInstance → BusinessModuleVersion`, set when an instance forks). Each endpoint pair is written as an `_OntologyEdgeEndpoint` row (not the frozen `EDGE_ENDPOINTS` const), subject to the same registry-backed endpoint-label validation as core edges (`400 edge_endpoint_label_mismatch` on a wrong pair). | must | XD-07 |

### Model REST surface

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Model CRUD** under `/api/v1/models`: `POST /api/v1/models` (create → 201 + UUIDv7 id, server-assigned `ordinal`), `GET /api/v1/models` (list, ordered by `ordinal` ASC; **each item carries a server-computed `moduleInstanceCount`** so the FR-16 list view renders counts from one fetch, no per-model N+1 — C-06), `GET /api/v1/models/:id`, `PATCH /api/v1/models/:id` (name/description/attributes; never clobbers omitted fields), `POST /api/v1/models/:id/archive` (sets `status:"archived"`, non-destructive — subgraph retained), and **`DELETE /api/v1/models/:id`** (C-01): allowed for a **non-reference** model → `204` and cascades its scoped subgraph (`IN_MODEL` domains + their `PART_OF` descendants + the model's `ModuleInstance`s + any forked-subtree copy nodes those instances own — resolves N-07, so a delete orphans nothing) — published `BusinessModule`/`BusinessModuleVersion` catalog nodes are *not* deleted (they are model-independent); the **reference** model (`isReference:true`) → `409 model_reference_immutable`. Archive remains the non-destructive alternative for non-reference models. All zod-validated at the boundary; consistent `{error:{code,message,details?}}` envelope. **`ordinal` allocation + uniqueness (C-04):** `ordinal` is server-assigned as `max(existing ordinal)+1` inside a single write transaction, and a Neo4j uniqueness constraint on `BusinessModel.ordinal` (plus at-most-one-reference-model enforcement — resolves N-06: this is not expressible as a native Neo4j partial constraint; the feasible mechanisms are setting `isReference` only on the reference model — uniqueness constraints exempt missing properties — or a transactional check; design picks one) makes concurrent creates and the FR-10 MERGE-on-ordinal reliably idempotent; exact constraint DDL is a design item. | must | XD-06, `_baseline` FR-02/FR-10 pattern |
| FR-06 | **Module publish + versions**: `POST /api/v1/modules` registers a `BusinessModule` around a source `UserJourney` subtree in a given model; `POST /api/v1/modules/:id/versions` publishes an **immutable** `BusinessModuleVersion` (snapshot of the journey subtree at publish time, **stored as serialized snapshot content on the version node itself — the blob representation, per the `journey-versions`/`JourneySnapshot` prior art; version content is never materialized as live graph nodes** — resolves C-06, monotonically incremented `version`, `checksum` over the snapshot). Publish also supports the **optional explicit-version mode (rev-3 errata D-3 folded inline per pass-2 C-13)** — a collision with an existing version returns `409 module_version_immutable`. `GET /api/v1/modules` and `GET /api/v1/modules/:id/versions` (ordered `version` DESC) list them. Published versions are never mutated in place (a change is a new version). | must | XD-07, `journey-versions` prior art |
| FR-07 | **Instantiate per model**: `POST /api/v1/models/:modelId/module-instances` with `{ moduleId, targetDomainId, version? }` (**`targetDomainId` required — rev-3 errata D-2 folded inline per pass-2 C-13**) creates a `ModuleInstance` pinned (`INSTANTIATES`) to the requested `BusinessModuleVersion` (default: latest) and linked (`INSTANCE_IN`) to the model. `GET /api/v1/models/:modelId/module-instances` lists them with their pinned version and `forked` flag. Two models instantiating the same version observe identical journey content (read isolation: neither can mutate shared version content). | must | XD-07 |
| FR-08 | **Fork on in-model edit** (B-02 — enforcement point named): in-model edits to an instance's journey subtree go through a **dedicated model-scoped write route** — `PATCH /api/v1/models/:modelId/module-instances/:instanceId/nodes/:nodeId` and the sibling edge route — **not** the generic graph-core `PATCH /api/v1/nodes/:label/:id` / `POST /api/v1/edges` paths, whose write contract for all **non-lifecycle** labels/edges is unchanged (no `_baseline` FR-03 regression; the only generic-path addition is the lifecycle-label guard below — a constant-time label/type pre-check, not a per-write membership scan — resolves C-06's "untouched" tension). This model-scoped route is the *only* place the fork trigger lives: on the **first** such write to a non-forked instance it **forks** — materializes a local, model-scoped copy of the version's subtree (new UUIDv7 ids), sets `FORKED_FROM` to the source version, sets `forked:true`, rewrites the target id to the local copy, and applies the edit there; membership is known because the route resolves `:nodeId` against the instance's subtree (rejecting `404 module_instance_node_not_member` if it is not a member — resolves C-08, code named in FR-13). Subsequent edits are local-only and never touch the shared version or other models' instances. `POST /api/v1/models/:modelId/module-instances/:instanceId/fork` also forks explicitly (idempotent: forking an already-forked instance is a no-op 200). **Guard on the generic routes (B-02, fix option b; reshaped per C-06; create arm added per pass-2 C-12):** any generic node write (`POST /api/v1/nodes/:label`, `PATCH`/`DELETE /api/v1/nodes/:label/:id`) targeting a lifecycle label (`BusinessModel`, `BusinessModule`, `BusinessModuleVersion`, `ModuleInstance`) or generic edge write (`POST /api/v1/edges`, `DELETE /api/v1/edges/:id`) targeting a lifecycle edge type (`IN_MODEL`, `HAS_VERSION`, `INSTANTIATES`, `INSTANCE_IN`, `FORKED_FROM`) is rejected `409 model_lifecycle_route_required`. **The same guard covers the third write surface (pass-2 B-03, user-decided option 1): `POST /api/v1/import` pre-scans every node + edge row before phase 1 and rejects the whole payload `409 model_lifecycle_route_required` with nothing written if any row carries a lifecycle label/edge type** — lifecycle state is mutated *only* through the `/api/v1/models*` / `/api/v1/modules*` routes, so `DELETE /api/v1/nodes/BusinessModel/:id` can never bypass FR-05's reference-model protection and no `node:write` session can corrupt module lifecycle state. Because published version content is a serialized blob on the `BusinessModuleVersion` node (FR-06), no "version-owned" graph node is generically reachable — this lifecycle-label rejection **is** the complete generic-path immutability protection (NFR-04, resolves C-06); `module_version_immutable` is reserved for the explicit-version publish collision (rev-3 D-3), the only operation that can attempt to overwrite a published version. | must | XD-07 |
| FR-09 | **Explicit upgrade**: `POST /api/v1/models/:modelId/module-instances/:instanceId/upgrade` with `{ toVersion }` re-pins a **non-forked** instance from its current version to `toVersion` (must exist → else `404 module_version_not_found`; must be ≥ current — a downgrade without `{allowDowngrade:true}` returns **`400 module_downgrade_not_allowed`**, C-03). Upgrade of a **forked** instance returns `409 module_instance_forked` with guidance (three-way reconciliation deferred — see Scope). Upgrade is explicit only: no instance is ever auto-upgraded when a new version publishes. | must | XD-07 |
| FR-10 | **Retail → Business Model #1 migration**: a script `api/src/scripts/migrate-retail-to-model.ts` (wired as `bun run migrate:model`) that (a) creates Business Model #1 (`ordinal:1`, `isReference:true`, `name:"Retail Reference"`) if absent, (b) scopes every currently-unscoped top-level `Domain` to it via `IN_MODEL`. **Idempotent** (re-run adds zero nodes/edges — `MERGE (:BusinessModel {ordinal:1})`, made reliable by the FR-05 `BusinessModel.ordinal` uniqueness constraint (C-04), plus `MERGE` on the `IN_MODEL` edge keyed by the domain+model id pair), **reversible** (`--down` removes **only** `IN_MODEL` edges whose target is the Business Model #1 root, plus that root itself — never an unqualified `IN_MODEL` sweep, so a later-created model's scoping edges and subgraph survive intact; if any other `BusinessModel` root exists the script warns and refuses unless `--force` is passed — resolves C-10 — with zero loss of domain/journey/activity data), and supports `--dry-run` (reports the node/edge deltas it *would* make, writes nothing). | must | XD-12, blueprint Risks row 2 |

### Model-scoped read (XD-06)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-18 | **Server-side model-scoped read** (B-01 — the enforcement half of NFR-03): a shared scope-resolution helper (`api/src/storage/model-scope.ts`, e.g. `scopedNodeIds(modelId)` / a `WHERE`-fragment builder) computes a model's node set as *the `Domain`s linked `IN_MODEL` to that model, plus their transitive `PART_OF` descendants (journeys, activities), plus that model's `ModuleInstance`s and their forked-subtree nodes* (per FR-03). This spec **applies** it to the FR-07 instance list (`GET /api/v1/models/:modelId/module-instances`), where scope resolves from the `:modelId` **path** parameter, and **proves** the helper directly (AC-21) — no `?model=<id>` query parameter is added to any GET (resolves C-09, agrees with rev-3 D-1: models are roots, so a `?model=` filter on the FR-05 models list/detail filters nothing meaningful). A read scoped to model A never returns nodes scoped only to model B. **Non-forked instance content** is not part of the scoped node set — the journey subtree a non-forked instance presents lives in the shared pinned `BusinessModuleVersion` snapshot, which readers resolve separately via the `INSTANTIATES` pin (resolves N-04). **Cross-cutting reference nodes** (`System`/`Role`/`Location`) are shared across models per **DEC-01 (closed — C-07)**. Retrofitting the *generic* graph-core read routes (`query.ts`, `nodes`, `analytics`) to accept `?model=` is **out of scope** and owned by the specs that add Model-aware reads (they consume this helper) — this FR guarantees the helper exists and is proven, so no wave-2+ spec reinvents scoping. | must | XD-06 |

### Persona / RBAC (XD-08)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | **Business Architect RBAC role + persona** seeded through the existing subsystem: a `business_architect` `RBACRole` (in `api/src/scripts/seed-rbac-roles.ts`) whose permissions include the new `model:read`, `model:write`, `module:read`, `module:write` plus the existing `domain:read/write`, `journey:read/write`, `query:read`, `analytics:read`. (B-02: the role does **not** need the generic `node:write`/`edge:write` — the FR-08 fork trigger and all lifecycle mutations live on dedicated routes mapped to `module:write`/`model:write` in FR-12, and the generic routes reject lifecycle-label writes outright.) A **Business Architect** `Persona` is bound to it (`HAS_RBAC_ROLE`). The existing SME persona is unchanged (keeps review/annotate). Seed is idempotent (MERGE by role/persona name). | must | XD-08 |
| FR-12 | **Route-permission mapping**: every new `/api/v1/models*` and `/api/v1/modules*` route (including `DELETE /api/v1/models/:id` → `model:write`, and the FR-08 model-scoped instance write routes → `module:write`) registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) with the correct `model:*` / `module:*` permission and correct specific-before-parameterized ordering. Reads require `*:read`, writes (incl. archive/delete/fork/upgrade) require `*:write`. Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). No new route is `public`. | must | XD-08, house rule |

### API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | Every route in FR-05..FR-09 is mounted under `/api/v1/`, zod-validated at the boundary, and appears in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). Any new error codes are added to the closed `ERROR_CODES` enum (`api/src/errors.ts`) as additive (non-breaking) changes: at minimum `model_not_found`, `model_reference_immutable`, `module_version_not_found`, `module_instance_forked`, `module_version_immutable`, **`module_downgrade_not_allowed`** (C-03), **`model_lifecycle_route_required`** (B-02, the FR-08 generic-route guard), and **`module_instance_node_not_member`** (resolves C-08 — the `404` returned when an FR-08 model-scoped write's `:nodeId` is not in the instance's subtree). | must | `_baseline` FR-02, NFR-11 |

### PWA — Model surface, shell context, ModelWorkspace

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-14 | **Model surface + route registration**: `model-workspace-core` owns the `route.ts` registration for the entire **Model** surface. Add a `model` surface to `SURFACES` (`pwa/src/route.ts`) with `label:"Model"`, a working surf-jump accelerator (`kbd` — note: all nine `Alt+1..9` slots are taken and the `App.tsx` handler matches `/^[1-9]$/` positionally against `SURFACES`, so the tenth-surface key requires a handler extension; exact key is a design decision, Risk 6), and **all seven** tabs from the blueprint View Tree **verbatim**: `models` (ModelWorkspace), `canvas` (ModelCanvas), `stories` (StoryCatalog), `key-activities` (KeyActivityBoard), `kpi-impact` (KpiImpactMatrix), `systems` (SystemModeler), `export` (SpecExport). Routes follow the existing `#/model/<tab>` hash convention; `parseHash`/`toHash` handle them with no special-casing. | must | Blueprint View Tree, UX-06 |
| FR-15 | **Shell-level active-model context**: a shell-owned React context (mounted above `renderView` in `pwa/src/App.tsx`) holds the active `BusinessModel` id + summary and exposes a setter. It is populated from `GET /api/v1/models`, defaults to Business Model #1, is **persisted so it survives reload** (localStorage keyed per origin, reconciled against a `model=<id>` URL param when present), and is the single source every other Model view consumes (`useActiveModel()` hook). No Model view re-implements model selection. | must | Blueprint (active-model shell concern), UX-06 |
| FR-16 | **ModelWorkspace view** (`pwa/src/views/model/ModelWorkspace.tsx`, route `#/model/models`): lists all business models (ordinal, name, status, reference badge, module-instance count — read from the `moduleInstanceCount` field of the single `GET /api/v1/models` response per FR-05, never via per-model fetches, C-06), lets the user **create** a model, **switch** the active model (updates the shell context + persists), and **archive** a non-reference model. Specs all four view states — **loading** (skeleton while `GET /api/v1/models` is in flight), **empty** (no non-reference models yet — prompts create), **error** (fetch failed — retry affordance), **ready** (list rendered). Tokens-only styling via `var(--…)`; catalog components before new ones; `scripts/design-conformance.ts` passes. | must | Blueprint View Tree, UX-01, UX-02, UX-05 |
| FR-17 | **Sibling-tab ownership boundary**: the six non-`models` Model tabs registered in FR-14 route (through `renderView`) to a shared **`ModelTabPlaceholder`** that names the owning downstream spec and does not error, until each owning spec replaces it. `model-workspace-core` neither implements nor blocks those views; it only guarantees the route resolves and the active-model context is available to them. | should | Blueprint View Tree (one feature owns route.ts) |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | New labels/edges are added **only** through the ontology-manager runtime registry (XD-01); no edits to the compile-time `NODE_LABELS` array in `shared/src/schema/nodes.ts` for these four labels (N-10), and no new store — model/module data lives in Neo4j (XD-02). | XD-01, XD-02 |
| NFR-02 | Migration (FR-10) is idempotent on model ordinal + `IN_MODEL` (re-run yields zero new nodes/edges) and reversible with zero loss of pre-existing domain/journey/activity data; `--dry-run` writes nothing (verified by unchanged `/api/v1/stats`). Idempotency rests on the FR-05 `BusinessModel.ordinal` uniqueness constraint (C-04), which must exist before the migration runs (design applies it via `schema:apply`). | XD-12, house data-integrity |
| NFR-03 | **Model isolation** (two halves, each with a building FR): **(a) read-scoping** — a read scoped to a model via the FR-18 helper never returns nodes scoped only to another model (built + proven here for this spec's own read routes; generic-route retrofit is downstream — see FR-18); **(b) write-isolation** — forked-instance edits in model A (via the FR-08 model-scoped write route) never mutate the shared `BusinessModuleVersion` or any other model's instance, and published-version content is read-only (NFR-04). | XD-06, XD-07 |
| NFR-04 | Published `BusinessModuleVersion` content is **immutable** — no route mutates a version's snapshot in place; a change is always a new version. Enforced server-side (resolves C-06; import arm per pass-2 B-03): the snapshot is serialized content on the version node (FR-06 blob representation), the generic node/edge paths **and `POST /api/v1/import`** reject any lifecycle-label/edge write with `409 model_lifecycle_route_required` (FR-08 — import with write-nothing pre-scan semantics), and the model-scoped write route forks before applying an edit — never in-place version mutation. | XD-07 |
| NFR-05 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only. | CLAUDE.md, `_baseline` NFR-01/02 |
| NFR-06 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/models` | `ModelWorkspace` | Model tab (topbar surf-nav + subnav) | all four — AC-13 (loading), AC-14 (empty), AC-15 (error), AC-11/AC-12 (ready) |

**Routes registered but owned by downstream specs** (FR-14/FR-17 — placeholder only here): `#/model/canvas`, `#/model/stories`, `#/model/key-activities`, `#/model/kpi-impact`, `#/model/systems`, `#/model/export`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-11..AC-15 cover ModelWorkspace loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-16, NFR-06; AC-16 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | n/a here — `ModelCanvas` (the only canvas Model tab) is owned by `business-model-authoring`; this spec ships no canvas/gesture surface. Placeholder tables below reflect that. |
| UX-04 responsiveness | NFR-06 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-17 — keyboard reachability of surf-nav/subnav + ModelWorkspace controls, focus order, ARIA landmarks |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-14 (verbatim routes), FR-15 (context survives reload); AC-18 (deep link + active model survive reload) |

## Scope Boundaries

**In scope:**
- `BusinessModel` root + `BusinessModule`/`BusinessModuleVersion`/`ModuleInstance` labels and the `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM` edges, all via the runtime registry.
- Model REST CRUD; module publish/version/instantiate/fork/upgrade REST.
- Idempotent + reversible retail → Business Model #1 migration with dry-run.
- Business Architect persona + `business_architect` RBAC role + route-permission mappings.
- Model surface shell + `route.ts` registration for all Model tabs; shell-owned active-model context; `ModelWorkspace` view; shared placeholder for sibling tabs.

**Out of scope (owner named):**
- UserStory / AcceptanceCriterion nodes, StoryCatalog view → `story-spec-core`.
- Authoring wizard, `ModelCanvas`, blank/retail template authoring UI → `business-model-authoring`. (This spec's migration doubles as the retail template *source*, but the template-clone UX is not here.)
- Key-activity scoring/marking, KeyActivityBoard → `key-activity-optimizer`.
- KPIs / KpiImpactMatrix → `kpi-impact-mapping`.
- Capabilities / SystemModeler → `ddd-system-modeling`.
- Export document / SpecExport → `requirements-export`.
- **Lifecycle-aware backup/restore** (pass-2 B-03): `GET /api/v1/export` → `POST /api/v1/import` cannot round-trip lifecycle rows — FR-08/AC-22 reject them write-nothing. A sanctioned, invariant-preserving restore path (re-allocating ordinals, re-validating references) is owned by a future `model-backup-restore` spec.
- **Three-way reconciliation of a forked instance against a newer version** — FR-09 blocks it with `409 module_instance_forked`; a future `module-reconcile` spec may add it.
- Per-model duplication of cross-cutting reference nodes (`System`, `Role`, `Location`) — **DEC-01 (closed — C-07)**: reference nodes are *shared*; a future switch to model-scoped reference nodes is a scope change owned by a follow-up spec, not this one.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `BusinessModel` + the three module/version/instance labels (four registry additions total — N-08) register through the ontology-manager registry and appear in `GET /api/v1/schema`; `NODE_LABELS` in `shared/src/schema/nodes.ts` is unchanged (FR-01, FR-02, NFR-01) | server (bun test + Neo4j) | `api/__tests__/model-labels.integration.test.ts` |
| AC-02 | `IN_MODEL` + the four lifecycle edges register through `createEdgeType` with their endpoint pairs written as `_OntologyEdgeEndpoint` rows (the frozen `EDGE_ENDPOINTS` const is unchanged); an edge with a wrong endpoint pair returns `400 edge_endpoint_label_mismatch` (FR-03, FR-04) | server (bun test + Neo4j) | `api/__tests__/model-edges.integration.test.ts` |
| AC-03 | Model CRUD round-trips: create → 201 + UUIDv7 id + server `ordinal` (= max+1, unique); list ordered by ordinal; PATCH preserves omitted fields; archive sets `status:archived` and retains subgraph; **`DELETE` of a non-reference model → 204 and its scoped subgraph is gone while catalog `BusinessModuleVersion`s survive**; `DELETE` of the reference model returns `409 model_reference_immutable`; list items carry `moduleInstanceCount` (C-06); a generic `DELETE /api/v1/nodes/BusinessModel/:id` (any model, reference included) is rejected `409 model_lifecycle_route_required`, **and so is a generic `POST /api/v1/nodes/BusinessModel` create (pass-2 C-12 arm)** — the FR-05 protections cannot be bypassed via the graph-core node routes (B-02) (FR-05, FR-08, FR-13) | server (bun test + Neo4j) | `api/__tests__/model-crud.integration.test.ts` |
| AC-04 | Publishing a module snapshots the journey subtree into an immutable `BusinessModuleVersion` with incrementing `version`; re-publishing creates v2, not a mutation of v1; an explicit-version publish colliding with an existing version returns `409 module_version_immutable` (rev-3 D-3 — the only reachable path for that code, per C-06); versions list DESC (FR-06, NFR-04) | server (bun test + Neo4j) | `api/__tests__/module-publish.integration.test.ts` |
| AC-05 | Instantiating the same version into two models yields two `ModuleInstance`s pinned to that version; both read identical journey content; neither read-path mutates the shared version (FR-07, NFR-03) | server (bun test + Neo4j) | `api/__tests__/module-instantiate.integration.test.ts` |
| AC-06 | A `PATCH` on the **model-scoped instance write route** (FR-08) to a non-forked instance's subtree node forks it: `forked` flips true, `FORKED_FROM` is set, a local copy with new UUIDv7 ids appears in that model, and the shared `BusinessModuleVersion` snapshot plus the *other* model's instance are **checksum-identical to their pre-fork snapshot** (N-01); a second edit stays local. The generic graph-core `PATCH /api/v1/nodes/...` path does **not** fire the fork: a generic write targeting any lifecycle-label node (incl. `BusinessModuleVersion`) is rejected `409 model_lifecycle_route_required` (B-02; resolves C-06 — under the FR-06 blob representation no version-owned graph node is generically reachable, so this is the complete generic-path arm); a model-scoped write whose `:nodeId` is outside the instance subtree returns `404 module_instance_node_not_member` (C-08) (FR-08, NFR-03, NFR-04) | server (bun test + Neo4j) | `api/__tests__/module-fork.integration.test.ts` |
| AC-07 | `upgrade` re-pins a non-forked instance from vN to vM (M≥N); downgrade without `allowDowngrade` returns `400 module_downgrade_not_allowed`; a non-existent `toVersion` returns `404 module_version_not_found`; upgrading a forked instance returns `409 module_instance_forked`; publishing a new version never auto-upgrades any instance (FR-09) | server (bun test + Neo4j) | `api/__tests__/module-upgrade.integration.test.ts` |
| AC-08 | Migration creates Business Model #1 and scopes all unscoped top-level domains; a second run adds zero nodes/edges; `--down` removes only Model #1's `IN_MODEL` edges + its root, leaving domain/journey/activity counts identical to pre-migration, **and a second (non-reference) model created before the down-migration survives with its `IN_MODEL` edges and subgraph intact** — `--down` refuses without `--force` while that model exists (resolves C-10); `--dry-run` leaves `/api/v1/stats` unchanged while reporting the intended deltas (FR-10, NFR-02) | server (CLI + Neo4j) | `api/__tests__/model-migration.integration.test.ts` |
| AC-09 | The `business_architect` RBAC role + Business Architect persona seed idempotently (re-run adds no duplicate role/persona); the persona resolves `model:*`/`module:*` permissions; SME persona is unchanged (FR-11) | server (bun test + Neo4j) | `api/__tests__/model-rbac.integration.test.ts` |
| AC-10 | Router gate enforces permissions on the new routes: a session without `model:write` gets 403 on `POST /api/v1/models`; with it, 201; a `model:read` session gets 200 on `GET /api/v1/models`; no new route is `public`; new routes + error codes appear in `GET /api/v1/openapi.json` (FR-12, FR-13) | server (bun test) | `api/__tests__/model-authz.test.ts` + `api/__tests__/model-openapi.integration.test.ts` |
| AC-11 | Model surface appears in the topbar surf-nav; its subnav shows all seven View-Tree tabs in order; `#/model/models` resolves to `ModelWorkspace` and lists seeded models with ordinal/name/status/reference badge (FR-14, FR-16 ready-state) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/model-workspace.test.tsx` |
| AC-12 | Creating a model in ModelWorkspace POSTs `/api/v1/models` and the new model appears; switching the active model updates the shell context and persists (FR-16, FR-15) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-workspace.test.tsx` |
| AC-13 | ModelWorkspace renders a loading skeleton while `GET /api/v1/models` is pending (FR-16, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-workspace-states.test.tsx` |
| AC-14 | With only the reference model present, ModelWorkspace shows the empty state prompting model creation (FR-16, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-workspace-states.test.tsx` |
| AC-15 | When `GET /api/v1/models` fails, ModelWorkspace shows the error state with a retry affordance that refetches (FR-16, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-workspace-states.test.tsx` |
| AC-16 | `scripts/design-conformance.ts` passes on `ModelWorkspace.tsx` + its CSS module (tokens-only, catalog components) (NFR-06, UX-02) | CLI | manual: `bun scripts/design-conformance.ts --view pwa/src/views/model/ModelWorkspace.tsx` and `bun scripts/design-conformance.ts --view pwa/src/views/model/ModelWorkspace.module.css` — expect both exit 0 with zero token/component violations (resolves C-11 — the bare positional form is inert and always exits 0, proving nothing) |
| AC-17 | ModelWorkspace is keyboard-reachable: Tab reaches create/switch/archive controls in DOM order, the surface has an ARIA landmark, and the surf-nav keyboard shortcut jumps to the Model surface (FR-14, FR-16, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/models`, press the Model-surface `Alt+<kbd>` shortcut then Tab through the view — expect focus lands on the view, moves create→switch→archive in order, and each control activates on Enter/Space |
| AC-18 | Deep link + active model survive reload: navigate to `#/model/models`, switch active model to a non-reference model, reload — expect the same route renders and the active model is still selected (from persisted context reconciled with the URL) (FR-15, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/model-active-context.spec.ts` |
| AC-19 | Sibling Model tabs resolve without error: navigating to each of `#/model/{canvas,stories,key-activities,kpi-impact,systems,export}` renders `ModelTabPlaceholder` naming the owning spec, and the active-model context is available there (FR-17) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-placeholder.test.tsx` |
| AC-20 | Transpile is clean and no compile-time schema arrays were edited for the four new labels (N-10) (NFR-01, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts` shows no additions to `NODE_LABELS` |
| AC-21 | **Model-scoped read isolation** (B-01): seed two models each with its own domain/journey/activity subtree; `scopedNodeIds(modelA)` returns model-A's nodes and **excludes** every node scoped only to model B, and the path-scoped instance list `GET /api/v1/models/:modelA/module-instances` never returns a model-B instance (resolves C-09 — no `?model=` query parameter exists); shared reference nodes are present in both per DEC-01 (closed) (FR-18, NFR-03a) | server (bun test + Neo4j) | `api/__tests__/model-scope.integration.test.ts` |
| AC-22 | **Import lifecycle guard** (pass-2 B-03, option 1): a `POST /api/v1/import` payload containing any lifecycle-labeled node row (`BusinessModel`, `BusinessModule`, `BusinessModuleVersion`, `ModuleInstance`) or lifecycle edge row (`IN_MODEL`, `HAS_VERSION`, `INSTANTIATES`, `INSTANCE_IN`, `FORKED_FROM`) is rejected `409 model_lifecycle_route_required` and **nothing from that payload is written** (pre-scan before phase 1 — no partial success); the same payload with the lifecycle rows removed imports cleanly (FR-08, NFR-04) | server (bun test + Neo4j) | `api/__tests__/model-import-guard.integration.test.ts` |

## Platforms & Input Modes

This spec touches `pwa/` (Model surface shell, `route.ts` registration, active-model context, `ModelWorkspace`) and registers a surface keyboard shortcut, so the tables are populated. It ships **no** canvas/gesture surface (`ModelCanvas` is owned by `business-model-authoring`).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Model surf-nav + subnav | yes | yes | yes | yes | reuses existing TopBar/SubNav; `Alt+<kbd>` surface jump |
| ModelWorkspace list + create/switch/archive controls | yes | yes | yes | yes | desktop-first; standard button/list interactions only |
| Sibling-tab placeholder | yes | yes | yes | yes | static content, no input handling |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | out of scope — owned by `business-model-authoring` (`ModelCanvas`) |

## Native Conflicts

The only new input handling is the surface-level surf-jump shortcut, which extends the existing `App.tsx` global keydown handler. As-built facts (verified): that handler matches `Alt+[1-9]` and indexes `SURFACES` **positionally** (it does not consult the `kbd` field); all nine digits are occupied by the nine existing surfaces, so the tenth (Model) surface requires extending the regex + index mapping (e.g. `Alt+0`) — a design decision (Risk 6). Note the Alt+digit branch fires even while a text input is focused (only the `/` shortcut is typing-guarded); the new key must keep, not silently change, that existing contract. No new gesture, scroll-container, or focus-trap behavior is introduced.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Browser/OS `Alt+<digit>` accelerators (e.g. Windows menu mnemonics, macOS input-source keys) | New Model-surface surf-jump key | `e.preventDefault()` inside the extended `App.tsx` keydown branch — same mechanism the existing `Alt+1..9` branch already uses |
| (no gesture/scroll/canvas handling introduced) | n/a | n/a |

## Dependencies

- **ontology-manager runtime registry** (`api/src/ontology/storage/{node-labels,edge-types}.ts` — `createNodeLabel`, `createEdgeType`; `_baseline` FR-11): the only sanctioned path for the four new labels + five new edges (N-10) (XD-01).
- **graph-core storage primitives + registry-backed edge-endpoint validator** (`api/src/storage/edges.ts` validating against `_OntologyEdgeEndpoint` via the T-13 cache — the compile-time `EDGE_ENDPOINTS` const is off-limits; `_baseline` FR-01/FR-03): create/patch/upsert nodes+edges, endpoint-label whitelist, UUIDv7 ids.
- **journey-versions snapshot pattern** (`api/src/routes/journey-versions.ts`, `HAS_SNAPSHOT`/`JourneySnapshot`): prior art for immutable version snapshots (FR-06).
- **persona/RBAC subsystem** (`api/src/auth/{rbac-permissions,permission-resolver}.ts`, `api/src/routes/persona.ts`, `api/src/scripts/seed-rbac-roles.ts`; `_baseline` FR-05): the only sanctioned path for the new persona/role/permissions (XD-08).
- **Central router gate** (`api/src/router.ts`): all new routes dispatched + auth-gated here; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts`; `_baseline` FR-02) + `ERROR_CODES` (`api/src/errors.ts`).
- **PWA shell** (`pwa/src/route.ts` `SURFACES`, `pwa/src/App.tsx`, `pwa/src/views/index.tsx` `renderView`, TopBar/SubNav catalog, `tokens.css`, `scripts/design-conformance.ts`; `_baseline` FR-15).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **DEC-01 (CLOSED at the requirements approval gate — C-05, resolves C-07): scope of cross-cutting reference nodes.** Are `System`, `Role`, `Location` model-scoped (each model has its own) or global/shared? The blueprint scopes via `Domain` roots (FR-03) but is silent on these. It fixes FR-08's fork copy-boundary (Risk 2), FR-10's migration edge set, and FR-18's scoped node set. | Determines whether module fork + retail migration must also copy/scope referenced systems/roles/locations. | **Decided (recorded at the pass-2 approval gate, silent-accept per XD-17): (a) shared reference nodes, model-scoped process structure (Domain/Journey/Activity).** FR-08/FR-10/FR-18 and AC-06/AC-08/AC-21 are written to this decision; design cites DEC-01 as **closed** in its frontmatter and does not carry it as an open question. A later switch to (b) model-scoped reference nodes is a scope change requiring a new revision + a follow-up spec. |
| 2 | **Fork copy-on-write cost.** Forking materializes a full journey-subtree copy (FR-08). Large journeys mean many new nodes per fork. | Write latency + graph growth. | Bound in design: fork is per-instance and lazy (only on first edit); journeys are journey-level (bounded fan-out). Design must specify the exact subtree boundary copied. |
| 3 | **Fork-then-upgrade reconciliation is hard** (the studio's hardest novel design, blueprint Risks row 3). | Forked instances can't take upstream improvements. | Deliberately deferred: FR-09 returns `409 module_instance_forked`. A `module-reconcile` spec owns three-way merge later. Design must make the 409 path clean + informative. |
| 4 | **Migration touches every existing top-level node** (blueprint Risks row 2). | A bad migration could mis-scope or orphan the retail graph. | FR-10 idempotent + reversible + `--dry-run`; AC-08 asserts down-migration restores exact pre-migration counts. Design runs it behind `bun run migrate:model` with the dry-run default in CI. |
| 5 | **Registry-label additions vs. compile-time expectations in older code** (blueprint Risks row 5). | Some legacy code paths may assume the fixed `NODE_LABELS`. | NFR-01/AC-20 forbid editing `NODE_LABELS`; design verifies read schema already accepts registry labels (`nodeReadSchema.label` is `z.string()`, confirmed) and that validators are registry-backed. |
| 6 | **`kbd` slot for the Model surface.** Existing surfaces already use `kbd` 1–9 (nine surfaces), and the `App.tsx` handler matches `/^[1-9]$/` and maps `Number(e.key)-1` **positionally** into `SURFACES` — it never reads the `kbd` field. | No free single-digit accelerator; naive append leaves the Model surface unreachable by keyboard jump. | Design decision: extend the handler (e.g. accept `0` → index 9, or switch to a `kbd`-field lookup) and assign the Model `kbd` accordingly; requirements only require the surface be keyboard-jumpable (AC-17). Flag for design, not a requirements blocker. |
