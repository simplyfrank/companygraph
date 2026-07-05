---
feature: "business-model-authoring"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 3
size: "large"
---

# Requirements: business-model-authoring

## Summary

**Core promise:** a **guided wizard + review canvas** that walks the **Business
Architect** persona (XD-08) from an empty model to a populated one —
**domains → journeys → activities × roles → stories + acceptance criteria** into
the *active* `BusinessModel` — over **existing write surfaces**, adding **no new
node label, edge type, or store** (N-02). The wizard is the `must` surface; the
`ModelCanvas` at `#/model/canvas` (route verbatim from the blueprint View Tree)
is its four-state review canvas, with direct-manipulation editing a `should`.

`business-model-authoring` is a **parallel wave-3** feature of the Business
Modeling Studio (blueprint `.claude/specs/blueprint.md`). It ships two template
on-ramps — **blank** (start empty) and **retail-reference clone** — both built on
`model-workspace-core`'s module-instantiation machinery (XD-13), never a bespoke
copy path. All persisted data lands through **existing** write surfaces:
`model-workspace-core`'s `POST /models/:id/domains` for domain-attach, graph-core
node/edge writes via `POST /api/v1/import` for journey/activity/role structure,
`model-workspace-core`'s module-instance routes for template cloning, and
`story-spec-core`'s story/AC CRUD + bootstrap for the specification layer.

It **does not** ship key-activity scoring/marking (`key-activity-optimizer`),
KPI attachment (`kpi-impact-mapping`), system/capability modeling
(`ddd-system-modeling`), model/module lifecycle CRUD or the active-model context
(`model-workspace-core`), or the story/AC labels + REST surface
(`story-spec-core`). It is a **composition layer**: an authoring UX over surfaces
those specs own, verified per XD-18 to prove the "domain experts can model key
activities per role end-to-end" mandate for the Role/Activity/EXECUTES + Persona
write paths it exercises.

## Motivation

1. The studio's north star (blueprint Summary) is that a user can *author any
   business's workflows*. `model-workspace-core` gives you an empty model and
   `story-spec-core` gives you story/AC CRUD, but **nothing walks a Business
   Architect from an empty model to a populated one**. Today authoring means
   hand-POSTing nodes and edges or hand-editing seed JSON — there is no guided
   surface. This feature is the on-ramp that makes the pipeline (`author → graph
   → optimize → measure → systematize`) actually start.
2. XD-13 fixes the template strategy: **blank + retail-reference clone**, both via
   the module-instantiation machinery, *not* an industry library and *not*
   blank-only. Cloning the retail reference must exercise the **same code path**
   as ordinary module reuse (`model-workspace-core` FR-06/FR-07) so templates and
   modules cannot drift; this feature is the first consumer that proves that path
   from the UI.
3. The blueprint scopes the canvas deliberately (Risks row 6): **wizard-first;
   canvas reuses JourneyCanvas/react-flow patterns; canvas polish is `should`**.
   Without an explicit split, "author a business" balloons into a full graph
   editor. Making the wizard the `must` surface and the canvas the `should`
   surface keeps this large feature bounded.
4. XD-18 is a **verification mandate**, not a nicety: "domain experts can model
   key activities per role end-to-end" must be proven by explicit ACs here (the
   Role/Activity/`EXECUTES` write paths, exercised through the Business Architect
   persona per platform), not assumed from the as-built surface. This spec is one
   of the two homes (with `story-spec-core`) where that proof lives.
5. The blueprint View Tree assigns `#/model/canvas` → `ModelCanvas` to this spec;
   `model-workspace-core` already registered that route as a `ModelTabPlaceholder`
   and owns `route.ts`. This spec replaces the placeholder with the real wizard +
   canvas surface, scoped to the active model.

## Functional Requirements

<!-- Priorities: must = M2 "author a new business end-to-end"; should = canvas
     polish per blueprint Risks row 6. -->

### Authoring wizard — the guided flow (XD-18, blueprint Scope)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Wizard shell** rendered at `#/model/canvas` inside `ModelCanvas` (route verbatim from the View Tree). The wizard is a linear, resumable, **step-indexed** flow with five steps in order — **(1) Template**, **(2) Domains**, **(3) Journeys**, **(4) Activities × Roles**, **(5) Stories + ACs** — with Next/Back navigation, a visible step indicator, and per-step validation gating advance (a step with an invalid/empty required field blocks Next with an inline message; no silent advance). It reads the **active `BusinessModel`** from the shell-owned `useActiveModel()` context (it does **not** re-implement model selection) and authors **into that model**; if no model is active it shows an inline prompt to pick/create one on `#/model/models` (owned by `model-workspace-core`). | must | XD-18, blueprint Scope, UX-06 |
| FR-02 | **Step 1 — Template choice.** The wizard opens on a template picker with exactly two options (XD-13): **Blank** (author from empty) and **Clone retail reference** (instantiate the retail-reference model's journey module(s) into the active model). Choosing **Blank** proceeds to Step 2 with no pre-populated structure. **Choosing "Clone retail reference" requires a *target `Domain`* first (C-01):** `POST /api/v1/models/:modelId/module-instances` takes a **required** `targetDomainId` (mwc design D-2 — a fork anchors its journey `PART_OF` a concrete in-model `Domain`). Since Step 1 runs *before* Step 2 (Domains), the clone action first ensures a target domain exists by calling `model-workspace-core`'s domain-attach route `POST /api/v1/models/:modelId/domains` (C-02) — either auto-creating a default "Retail" domain or letting the user name/pick one inline — and uses the returned `Domain` id as `targetDomainId` for the instantiation (FR-08). It then proceeds to Step 3 (Journeys) with the cloned structure shown as the starting point (the just-created target domain also appears, pre-listed and editable, in Step 2). Exactly one template is chosen per wizard run; re-running the wizard on an already-populated model appends rather than replacing (no destructive reset). **Resolves: C-01.** | must | XD-13, mwc design D-2 |
| FR-03 | **Step 2 — Domains.** Add/edit one or more `Domain` nodes for the active model. **A new `Domain` + its `IN_MODEL` edge is created through `model-workspace-core`'s existing `POST /api/v1/models/:modelId/domains` route (C-02)** — mwc design §4.3 (review C-06) ships this as "the minimal sanctioned API path that populates a user-created model," creating the `Domain` and its `IN_MODEL` edge in one tx (`model:write`). This spec **does not** re-implement domain-to-model scoping and the FR-07 authoring endpoint therefore does **not** create `Domain` nodes or write `IN_MODEL` (it batches only journeys/activities/roles/edges, per revised FR-07). A domain requires a non-empty `name`; `description` optional. Existing domains already in the active model (e.g. from a clone in FR-02) are listed and **editable in place via this spec's `PATCH /api/v1/models/:modelId/domains/:domainId`** (new route, `model:write` — the DD-06 rev-3 amendment names this as the edit mechanism, since no existing permission-reachable path lets `business_architect` edit a domain in place; design §4.9/DD-08). A PATCH targeting a domain that is absent or not `IN_MODEL` the `:modelId` model returns `404 not_found`; an unknown `:modelId` returns `404 model_not_found`. Advancing requires at least one domain in the model. **Resolves: C-02; amended rev 3 per design DD-06/DR2-B-03.** | must | blueprint Scope, XD-18, mwc §4.3, design DD-06 |
| FR-04 | **Step 3 — Journeys.** Add/edit `UserJourney` nodes, each `PART_OF` a chosen `Domain` in the active model (endpoint pair validated by the registry-backed edge validator — a wrong pair returns `400 edge_endpoint_label_mismatch`). A journey requires a non-empty `name` and a parent domain. Cloned journeys (from FR-02) appear pre-listed and editable. Advancing requires at least one journey. | must | blueprint Scope |
| FR-05 | **Step 4 — Activities × Roles (XD-18 core).** For each `UserJourney`, add/edit `Activity` nodes (`PART_OF` the journey) and, per activity, assign one or more `Role`s via the `EXECUTES` edge (`Role → Activity`) and optionally order activities with `PRECEDES` (`Activity → Activity`). **`Role` (like `System`/`Location`) is a *shared, global* reference node — not model-scoped** (`model-workspace-core` design DEC-01 option (a), §1 rule 4, §4.2: `scopedNodeIds` deliberately **excludes** `Role`/`System`/`Location`; only `Domain`/`UserJourney`/`Activity` are model-scoped). The role picker is therefore **pick-or-create-*global***: a role is selected from the **global** `Role` catalog or a new **global** `Role` is created, and only the model-scoped `Activity` and the `EXECUTES` edge into it are new to this model. This is the **"key activities per role"** authoring path the XD-18 mandate names: the wizard MUST let a Business Architect create an `Activity`, create/pick a (global) `Role`, and wire `EXECUTES` between them, end-to-end, and the result MUST be a persisted `(:Role)-[:EXECUTES]->(:Activity)` edge. That edge is reachable from the active model **through the model-scoped `Activity` end** (the `Activity`'s id ∈ `scopedNodeIds(modelId)`; the `Role` end is global and shared), not through a "model Role". Endpoint pairs are validated by the registry-backed validator. **Resolves: B-01.** | must | XD-18, blueprint Scope, `model-workspace-core` DEC-01 |
| FR-06 | **Step 5 — Stories + ACs.** For the activities authored in Step 4, the wizard offers **(a)** a one-click **"Generate stories from graph"** action that calls `story-spec-core`'s bootstrap (`POST /api/v1/models/:modelId/stories/bootstrap`, optionally scoped by `{activityIds}` to the wizard's activities) to derive editable `UserStory` + starter `AcceptanceCriterion` nodes, and **(b)** inline manual create/edit, of a story (`POST/PATCH /api/v1/models/:modelId/stories`) and its Given/When/Then ACs (`.../acceptance-criteria`), all via `story-spec-core`'s existing routes — this spec adds **no** story/AC route. Editing a derived story/AC clears its `derived` flag (a `story-spec-core` guarantee this view surfaces, not re-implements). **Bootstrap is idempotent (C-05):** `story-spec-core` FR-09 **skips** any activity that already has ≥1 story, returning `{ created: N, skipped: M }` (`skipped` counts already-authored activities). Re-running "Generate stories from graph" on already-bootstrapped activities therefore legitimately returns `created:0` — the wizard MUST present that as an idempotent "already generated" state (surfacing `created`/`skipped` counts), **not** as an error or a "nothing happened" failure. Completing Step 5 finishes the wizard and returns the user to the canvas/review state (FR-09). **Resolves: C-05.** | must | XD-09, XD-18, blueprint Scope, story-spec-core FR-09 |
| FR-07 | **Batched authoring write** (`api/src/routes/authoring.ts`): the wizard commits each step's **journey/activity/role structural additions** (Journeys/Activities + their `PART_OF`/`EXECUTES`/`PRECEDES` edges; roles are picked/created as *global* nodes per FR-05) through **one** model-scoped authoring endpoint — `POST /api/v1/models/:modelId/authoring/apply` — that assembles a graph-core-shaped `{nodes, edges}` payload and lands it via the **existing** `POST /api/v1/import` two-phase writer. **`Domain` creation + `IN_MODEL` scoping is NOT done here** — it is delegated to mwc's `POST /models/:modelId/domains` (FR-03, C-02); this endpoint writes only journeys/activities/roles and their edges, `PART_OF`-anchored under domains that already exist and are already `IN_MODEL`-scoped. **Import-reuse seam (C-03):** `realImport` in `api/src/routes/import.ts` is currently **not exported** (only `handleImport` is), and its return shape is `{ imported: { nodes, edges }, errors?: RowError[] }` where each `RowError` carries `{section, index, code}` **under `errors[]`** (not top-level). Design must therefore either **export `realImport`** or extract a shared writer seam over `upsertNode`/`upsertEdge` (default per OQ-1 option (a): export/reuse `realImport`'s collect-and-continue core in-process). **Server-generated ids (C-04):** because `import` MERGEs on a **client-supplied** id (`upsertNode`/`upsertEdge` are MERGE-on-id), the **authoring handler generates a UUIDv7 for each new node/edge server-side, before** assembling the `{nodes, edges}` payload, and stamps it on the row; re-submitting a step reuses the ids the client already holds so a re-run upserts idempotently rather than silently colliding or duplicating. Partial success surfaces `import`'s collect-and-continue result verbatim: HTTP 200 with `errors[]` of `{section, index, code}` for the failed rows while valid rows persist. **Id echo (C-07, rev 3):** the apply response envelope additionally returns the server-minted per-row `ids` for **every** row (including failed ones) — without the echo the client holds nothing to re-submit with, and the idempotent re-run is unimplementable/untestable. **Boundary scope check (C-08, rev 3):** a row whose referenced anchor/endpoint id (`PART_OF` domain/journey anchor, `PRECEDES`/`EXECUTES` endpoint) is neither a member of `scopedNodeIds(:modelId)` nor created in the same batch is rejected per-row with `invalid_payload` (`{outOfModel:[…]}` detail) and nothing is written for it — the NFR-03 isolation guarantee is enforced at this boundary, not merely asserted; an unknown `:modelId` returns `404 model_not_found`. **This endpoint creates no new node label or edge type** — it only writes the existing six core labels/edges (no `IN_MODEL`, no lifecycle labels). **Resolves: C-02, C-03, C-04; rev 3 adds C-07, C-08.** | must | blueprint Scope ("lands via import/module instantiation"), XD-02 |
| FR-08 | **Template clone via module instantiation (XD-13).** "Clone retail reference" (FR-02) is implemented **only** by calling `model-workspace-core`'s module surface: `GET /api/v1/modules` to find the retail-reference model's published journey module(s), then `POST /api/v1/models/:activeModelId/module-instances` with `{moduleId, version?, targetDomainId}` per module, creating `ModuleInstance`(s) in the active model pinned to the reference version. **`targetDomainId` is a *required* field (mwc design D-2) and comes from FR-02's target-domain step: the `Domain` id returned by `POST /api/v1/models/:modelId/domains`** (the auto-created/selected "Retail" target domain), which is already `IN_MODEL`-scoped to the active model — the mwc route rejects a `targetDomainId` not `IN_MODEL` the model. This spec **does not** implement any copy/snapshot logic itself and **does not** touch module lifecycle state through any other path (the `409 model_lifecycle_route_required` guard from `model-workspace-core` FR-08 stands). This clone route is gated by **`module:write`** (mwc design §5, see FR-14), not `model:write`. If the retail reference exposes no published module, the clone option is disabled with an explanatory affordance (it is not an error). **Resolves: C-01, B-02.** | must | XD-13, `model-workspace-core` FR-06/FR-07, mwc design D-2/§5 |

### Workflow canvas — ModelCanvas (blueprint Risks row 6; canvas polish is `should`)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **ModelCanvas review surface** (`pwa/src/views/model/ModelCanvas.tsx`, route `#/model/canvas`) **replaces** the `ModelTabPlaceholder` that `model-workspace-core` registered for the `canvas` tab in `pwa/src/views/index.tsx` `renderView`. Its default (wizard-complete) state renders the active model's authored structure as a **workflow canvas reusing the JourneyCanvas/react-flow patterns** (`pwa/src/components/JourneyCanvas.tsx` layout conventions; `reactflow` is already a dependency) — journeys as columns/lanes, activities as ordered nodes, roles/systems/locations as attached layers — read from **this spec's model-scoped projection route `GET /api/v1/models/:modelId/authoring/graph`** (`model:read`; DD-06 rev-3 amendment — graph-core's generic reads are **not** model-scoped and retrofitting `?model=` onto them is pinned out of scope by mwc D-1, so rev 2's "graph-core reads scoped to the active model" was unimplementable without leaking sibling models). The canvas is **read-and-review** in the `must` scope: it shows the authored graph and offers an "Edit in wizard" affordance that reopens the wizard at the relevant step. | must | blueprint View Tree, blueprint Risks row 6 |
| FR-10 | **Canvas direct-manipulation editing** (polish): drag to reposition/reorder activities (persisting `PRECEDES` order via FR-07), click a node to open a detail/edit panel (catalog `SidePanel`), and drag between nodes to create an `EXECUTES`/`PART_OF`/`PRECEDES` edge (endpoint-validated). This is **`should`** per blueprint Risks row 6 — the wizard is the authoritative authoring path; the canvas edit affordances are polish and may be delivered after the wizard `must` scope. Any drag/gesture handler introduced here MUST satisfy the Native Conflicts table (no page-scroll hijack, keyboard-reachable equivalents). | should | blueprint Risks row 6, UX-03 |

### Views + view states (blueprint View Tree, UX-*)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | **All four view states** on `ModelCanvas` (UX-01): **loading** (skeleton while the active model's structure is being fetched), **empty** (active model has no domains/journeys yet — opens the wizard on Step 1 Template as the primary affordance), **error** (a fetch or authoring write failed — retry/inline-error affordance that does not lose in-progress wizard input), **ready** (wizard flow and/or the populated canvas rendered). Tokens-only styling via `var(--…)` from `tokens.css`; catalog components (`Card`, `Modal`, `SidePanel`, `Button`, `DataTable`, `Typeahead`, `JourneyCanvas`) before inventing new ones; `scripts/design-conformance.ts` passes on the view + its CSS module. | must | UX-01, UX-02 |
| FR-12 | **Model-scoped + reload survival**: the wizard/canvas only ever author into and render the **active** `BusinessModel`; switching the active model (via the shell context) resets/refetches for the new model; deep-linking `#/model/canvas` and reloading re-renders for the persisted active model (persistence is `model-workspace-core` FR-15; this view consumes it). No cross-model leakage of **model-scoped** structure: every read (FR-09's `GET …/authoring/graph`), the FR-07 apply write, the FR-03 domain PATCH, and the mwc domain-attach are scoped by `:modelId` = the active model; new `Domain`s are `IN_MODEL`-scoped to it via mwc's route (not by this spec). Shared/global reference nodes (`Role`/`System`/`Location`, DEC-01(a)) are intentionally cross-model and are not "leakage." In-progress, uncommitted wizard input is **not** persisted across reload (only committed graph state survives — an explicit non-goal, surfaced to the user as a "commit each step" model). | must | UX-06, `model-workspace-core` FR-15 |

### API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **Three new routes (rev 3 — DD-06 amendment; supersedes rev 2's "exactly one new endpoint"):** (1) `POST /api/v1/models/:modelId/authoring/apply` — the FR-07 structural write; (2) `GET /api/v1/models/:modelId/authoring/graph` — the FR-09 model-scoped read projection; (3) `PATCH /api/v1/models/:modelId/domains/:domainId` — the FR-03 domain edit-in-place. All three are mounted under `/api/v1/`, zod-validated at the boundary, and appear in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). They reuse existing `ERROR_CODES` — `invalid_payload`, `attribute_violation`, `edge_endpoint_label_mismatch`, `model_not_found`, `not_found` (all five verified present in `api/src/errors.ts`); design decides whether any genuinely new failure mode warrants an additive (non-breaking, NFR-11) code (N-01). All template-clone and story/AC calls go to **existing** routes (`model-workspace-core`, `story-spec-core`) — this spec introduces exactly these three endpoints and no others. | must | NFR-11, blueprint Scope, design DD-06/§5.1 |
| FR-14 | **Route-permission mapping (rev 3 — DD-06 amendment):** the **three new** routes this spec adds are registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) — `POST …/authoring/apply` → **`model:write`**, `GET …/authoring/graph` → **`model:read`**, `PATCH …/domains/:domainId` → **`model:write`** (structural authoring into a model is a model write/read, per `model-workspace-core` FR-11/FR-12's `model:*` vocabulary — no new permission is minted; an unmapped route silently skips the RBAC check per the file's SECURITY-CRITICAL note, so all three get rows). Beyond its own rows, a full `must` wizard run exercises **four permission families** (C-06): **(a)** `model:read`/`model:write` — the three routes above plus mwc's `POST /models/:id/domains` (FR-03 create); **(b)** `module:write` — the FR-08 clone route `POST …/module-instances` (`model-workspace-core` design §5 maps it — mwc-owned, asserted in force, not re-mapped); **(c)** `story:read`/`story:write` — Step 5's `POST …/stories/bootstrap` + story/AC `POST`/`PATCH` + `GET …/stories` (story-spec-core-owned mappings, `rbac-permissions.ts:282-287` — neither added nor re-mapped here); **(d)** `query:read` — the Step 4 role-picker search `GET /api/v1/query/search?label=Role` (baseline-owned). All four families are already carried by the `business_architect` role (mwc FR-11 grants `model:*` + `module:*`; story-spec-core grants `story:*`; `seed-rbac-roles.ts:108` grants `query:read`), so the persona is fully covered; this spec adds **no** new RBAC role or permission and re-maps **no** existing route. Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check. No new route is `public`. **Resolves: B-02; rev 3 adds C-06 (the `story:write`/`query:read` enumeration gap).** | must | house rule, XD-08, `model-workspace-core` FR-11/FR-12, mwc design §5, design DD-06/§5.2 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new schema, no new store** (XD-01, XD-02): this spec adds **no** compile-time `NODE_LABELS`/`EDGE_ENDPOINTS` entries and **no** runtime ontology label or edge type — it composes the six core labels/edges plus labels/edges already registered by `model-workspace-core` (`BusinessModel`, `IN_MODEL`, `ModuleInstance`, …) and `story-spec-core` (`UserStory`, `AcceptanceCriterion`, …). All data lives in **Neo4j** via existing writers; no Postgres/SQLite touch. | XD-01, XD-02 |
| NFR-02 | **Reuse, never re-spec** (XD-13, composition mandate): template cloning goes through `model-workspace-core`'s module-instantiation routes (FR-08); structural writes go through `POST /api/v1/import`'s writer (FR-07); story/AC authoring goes through `story-spec-core`'s CRUD + bootstrap (FR-06). This spec re-implements none of those — a design that duplicates any of them is a defect. | XD-13, blueprint Scope |
| NFR-03 | **Model isolation**: authoring reads and the FR-07 apply write are scoped to the active model via the `:modelId` path param and `model-workspace-core`'s `scopedNodeIds`/`IN_MODEL` regime (consumed, not re-implemented); a wizard run on model A never mutates or reads **model-scoped** structure (`Domain`/`UserJourney`/`Activity`) scoped only to model B. **The isolation is enforced at the apply boundary (C-08, rev 3)** — referenced anchor/endpoint ids must be ∈ `scopedNodeIds(:modelId)` or created in the same batch; foreign anchors are rejected per-row (FR-07) — not merely asserted by cooperative tests. **Shared/global `Role`/`System`/`Location` (DEC-01(a)) are excluded from `scopedNodeIds` by design and are legitimately visible across models — isolation is asserted on the model-scoped structure, not on shared reference nodes.** | XD-06, `model-workspace-core`'s `scopedNodeIds`/model-scoped-read helper (its own requirement, consumed here — not an owned FR of this spec), DEC-01(a) |
| NFR-04 | **House rules**: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all routes under `/api/v1/`. | CLAUDE.md |
| NFR-05 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |
| NFR-06 | **Wizard-first sizing** (blueprint Risks row 6): the wizard (`must`, FR-01..FR-08) is deliverable and verifiable independently of the canvas direct-manipulation editing (`should`, FR-10). The `must` acceptance set (AC-01..AC-14, AC-16..AC-20) does not depend on FR-10 shipping; canvas polish ACs (AC-15) are explicitly gated `should`. | blueprint Risks row 6 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/canvas` | `ModelCanvas` | Model tab (topbar surf-nav + subnav — registered by `model-workspace-core`) | all four — AC-12 (loading), AC-13 (empty), AC-14 (error), AC-01..AC-08/AC-11 (ready) |

This spec **replaces** the `ModelTabPlaceholder` `model-workspace-core` registered
for the `canvas` tab; it does **not** touch `route.ts` (`model-workspace-core`
owns it) beyond the `renderView` dispatch of the `canvas` tab to `ModelCanvas`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-11..AC-14 cover ModelCanvas loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-11, NFR-05; AC-16 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | **required** — `ModelCanvas` is a canvas surface reusing JourneyCanvas/react-flow patterns with `should`-scope drag editing (FR-10). Platforms & Input Modes + Native Conflicts tables below are populated; AC-17 covers keyboard reachability of the wizard, AC-15 covers canvas drag (should). |
| UX-04 responsiveness | NFR-05 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-17 — keyboard reachability + focus order of the wizard steps and controls; ARIA landmark on the view; canvas nodes have keyboard-reachable equivalents for any drag affordance |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-01/FR-09 (verbatim route), FR-12 (refetch on model change + reload survival); AC-19 (deep link + active model → correct canvas after reload) |

## Scope Boundaries

**In scope:**
- The authoring **wizard** (5 steps: Template → Domains → Journeys → Activities×Roles → Stories+ACs) at `#/model/canvas`, wizard-first.
- **Blank** + **retail-reference clone** templates, clone implemented via `model-workspace-core` module instantiation (XD-13).
- **Three new model-scoped routes (rev 3, DD-06):** `POST /api/v1/models/:modelId/authoring/apply` (lands **journey/activity/role structure** via the existing `POST /api/v1/import` writer), `GET /api/v1/models/:modelId/authoring/graph` (model-scoped read projection for the canvas), `PATCH /api/v1/models/:modelId/domains/:domainId` (domain edit-in-place). Domain-attach + `IN_MODEL` remains delegated to mwc's `POST /models/:id/domains` (C-02).
- The `ModelCanvas` **review** surface (JourneyCanvas/react-flow read view) with all four view states — `must`.
- Canvas **direct-manipulation editing** (drag reorder, click-to-edit panel, drag-to-connect) — `should` (blueprint Risks row 6).
- Route-permission rows for the three new routes (`model:write` × 2, `model:read` × 1) — no new permission minted (FR-14).
- XD-18 verification ACs for the Role/Activity/`EXECUTES` + Business Architect persona write paths.

**Out of scope (owner named):**
- **UserStory/AcceptanceCriterion labels + story/AC REST CRUD + bootstrap derivation** → `story-spec-core` (this spec *calls* those routes from Step 5; it does not define them).
- **Model/module lifecycle CRUD, `scopedNodeIds`, active-model context, the `POST /models/:id/domains` domain-attach + `IN_MODEL` scoping route (C-02), `route.ts`/`SURFACES` edits, the retail→Model #1 migration, module publish/version/instantiate route implementations** → `model-workspace-core` (consumed, never re-implemented).
- **Key-activity scoring/marking + KeyActivityBoard** → `key-activity-optimizer`.
- **KPI attachment / impact links** → `kpi-impact-mapping`.
- **System/capability modeling** → `ddd-system-modeling` (activities may `USES_SYSTEM` an existing `System`, but modeling *systems themselves* is not here).
- **Export document assembly** → `requirements-export`.
- **Persistence of uncommitted in-progress wizard input across reload** — explicitly not a goal (FR-12); only committed graph state survives.
- **Destructive model reset / bulk delete** — the wizard appends; deletion is via `model-workspace-core` model DELETE, not here.

## Acceptance Criteria

<!-- Every AC traces to at least one FR. must = AC-01..AC-14, AC-16..AC-20;
     should = AC-15 (canvas polish). -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `#/model/canvas` resolves to `ModelCanvas` (not `ModelTabPlaceholder`); the wizard opens on Step 1 (Template) reading the active model from `useActiveModel()`; with no active model it shows the pick/create-a-model prompt instead of authoring into an undefined model (FR-01, FR-09) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/model-canvas.test.tsx` |
| AC-02 | Step 1 offers exactly two templates — **Blank** and **Clone retail reference**; choosing Blank advances to Step 2 with no structure pre-populated; the two-option set is asserted (no third option) (FR-02, XD-13) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-canvas-template.test.tsx` |
| AC-03 | Choosing **Clone retail reference** calls `POST /api/v1/models/:activeModelId/module-instances` with the retail-reference module id (via `GET /api/v1/modules`) and, on success, advances to Step 3 with the cloned journey structure listed; if the reference exposes no published module the clone option is disabled with an explanatory affordance (not an error) (FR-02, FR-08, XD-13) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-canvas-template.test.tsx` (mocked module routes) |
| AC-04 | Step 2 (Domains) creates ≥1 `Domain` in the active model via **`model-workspace-core`'s `POST /api/v1/models/:modelId/domains`** route (C-02 — the `authoring/apply` endpoint does **not** create domains or write `IN_MODEL`); the created domain is `IN_MODEL`-scoped to the active model (readable back scoped to it, absent from a sibling model); **edit-in-place (rev 3)**: `PATCH /api/v1/models/:modelId/domains/:domainId` with a changed `name` reads back the new name with `description` untouched, and a PATCH targeting model B's domain through model A's path returns `404 not_found` with the domain unchanged; the domain list row's edit affordance calls the PATCH; advancing is blocked until ≥1 domain exists with an inline message (FR-03, NFR-03) — **Resolves: C-02, DR2-B-03** | server (bun test + Neo4j) + macOS Chrome (mouse+kb) | `api/__tests__/authoring-apply.integration.test.ts` + `pwa/src/__tests__/model-canvas-steps.test.tsx` |
| AC-05 | Step 3 (Journeys) creates `UserJourney` nodes each `PART_OF` a chosen active-model `Domain`; a wrong endpoint pair is rejected `400 edge_endpoint_label_mismatch`; advancing requires ≥1 journey (FR-04, FR-07) | server (bun test + Neo4j) | `api/__tests__/authoring-apply.integration.test.ts` |
| AC-06 | **XD-18 core — key activities per role end-to-end**: Step 4 creates an `Activity` (`PART_OF` a journey), creates/picks a **global** `Role`, and wires `EXECUTES` (`Role → Activity`) through the authoring endpoint; the result is a persisted `(:Role)-[:EXECUTES]->(:Activity)` edge whose `Activity` end **is a member of `scopedNodeIds(activeModelId)`** — i.e. the edge round-trips **via the model-scoped `Activity`** (the `Role` end is a shared/global node and is *not* in `scopedNodeIds`, per DEC-01(a); the test asserts the `Activity` membership and the `EXECUTES` edge, not a "model Role"); a `PRECEDES` order between two activities round-trips (FR-05, XD-18, NFR-03) — **Resolves: B-01** | server (bun test + Neo4j) | `api/__tests__/authoring-key-activity-per-role.integration.test.ts` |
| AC-07 | Step 5 "Generate stories from graph" POSTs `story-spec-core`'s `.../stories/bootstrap` scoped to the wizard's `activityIds`; derived `UserStory` + starter `AcceptanceCriterion` nodes appear and are editable; **re-running the action on already-bootstrapped activities returns `{created:0, skipped:N}` and the wizard renders that as an idempotent "already generated" state (surfacing the counts), not an error** (C-05); a manual story create + Given/When/Then AC create go through `story-spec-core`'s CRUD routes; this spec adds **no** story/AC route (FR-06, XD-09) — **Resolves: C-05** | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-canvas-stories-step.test.tsx` (mocked story routes) |
| AC-08 | The FR-07 authoring endpoint lands structure via the existing `POST /api/v1/import` two-phase writer (reusing `realImport`'s core): a batch with one bad row returns HTTP 200 with the import result shape `{ imported:{nodes,edges}, errors:[{section,index,code}] }` (the failing row(s) under `errors[]`, valid rows persisted — collect-and-continue, C-03); each new node/edge carries a **server-generated UUIDv7** and the response **echoes the minted `ids` for every row, including failed ones** (C-07, rev 3), so re-submitting the same step with the echoed ids upserts idempotently — no duplicates — rather than colliding (C-04); the endpoint creates **no** new node label or edge type and writes **no** `IN_MODEL` (FR-07, NFR-01, NFR-02) — **Resolves: C-03, C-04; rev 3 adds C-07** | server (bun test + Neo4j) | `api/__tests__/authoring-apply.integration.test.ts` |
| AC-09 | Template clone uses **only** `model-workspace-core`'s module routes: the clone path issues `GET /api/v1/modules` + `POST .../module-instances` (the latter gated by **`module:write`**, mwc-owned) and touches **no** other module-lifecycle route; an attempt to mutate lifecycle state via a generic node/edge route is still rejected `409 model_lifecycle_route_required` (guard owned by `model-workspace-core`, asserted intact) (FR-08, NFR-02) | server (bun test + Neo4j) | `api/__tests__/authoring-template-clone.integration.test.ts` |
| AC-10 | Router gate enforces the mappings across the **four exercised permission families** (rev 3): (a) a session without `model:write` gets 403 on `POST …/authoring/apply` **and** on `PATCH …/domains/:domainId` (both this spec's `model:write` rows), and with `model:write` both succeed; (b) a session without `module:write` gets 403 on the clone route `POST …/module-instances` (mwc-owned mapping, asserted still in force) and with `module:write` it succeeds; (c) a session without `story:write` gets 403 on the Step 5 `POST …/stories/bootstrap` (story-spec-core-owned mapping, asserted still in force) (C-06); (d) the `business_architect` role carries all four families (incl. `query:read` for the Step 4 role-picker search) so a full run succeeds; no new route is `public`; all **three** DD-06 routes (`…/authoring/apply`, `…/authoring/graph`, `PATCH …/domains/:domainId`) + their error codes appear in `GET /api/v1/openapi.json` (FR-13, FR-14) — **Resolves: B-02; rev 3 adds C-06** | server (bun test) | `api/__tests__/authoring-authz.test.ts` + `api/__tests__/authoring-openapi.integration.test.ts` (one AC, two artifacts) |
| AC-11 | Wizard-complete ready state: `ModelCanvas` renders the active model's authored structure on the JourneyCanvas/react-flow canvas (journeys as lanes, activities ordered, roles/systems/locations as layers) read from the model-scoped `GET …/authoring/graph` projection (FR-09 rev 3), with an "Edit in wizard" affordance that reopens the wizard at the relevant step (FR-09, FR-11 ready) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/model-canvas.test.tsx` |
| AC-12 | `ModelCanvas` renders a loading skeleton while the active model's structure fetch is pending (FR-11, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-canvas-states.test.tsx` |
| AC-13 | With an empty active model (no domains/journeys), `ModelCanvas` shows the empty state whose primary affordance opens the wizard on Step 1 (Template) (FR-11 empty, FR-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-canvas-states.test.tsx` |
| AC-14 | When a structure fetch or the FR-07 apply write fails, `ModelCanvas` shows the error state with a retry affordance that refetches/re-submits and does **not** discard the in-progress wizard step's entered fields (FR-11, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/model-canvas-states.test.tsx` |
| AC-15 | **(should — canvas polish, FR-10)** On the canvas, dragging an activity reorders it and persists the new `PRECEDES` order via the authoring endpoint; the drag does **not** hijack page scroll (Native Conflicts); a keyboard-reachable equivalent (e.g. move up/down on a focused activity) achieves the same reorder without a pointer (FR-10, UX-03, UX-05) | macOS Chrome (trackpad drag + keyboard), macOS Safari (trackpad drag) | manual: with the stack up and a populated model, load `#/model/canvas`, trackpad-drag an activity node onto a new position — expect the `PRECEDES` order persists (re-fetch shows new order) and the page does not scroll under the drag; then keyboard-only focus an activity and press the documented move-up/down key — expect the same reorder persists |
| AC-16 | `scripts/design-conformance.ts` passes on `ModelCanvas.tsx` + its CSS module + any wizard sub-component modules (tokens-only, catalog components) (NFR-05, UX-02). Uses the **enforced `--view` form** (mwc design D-5: the positional form is inert; `--view` is the checked mode), run once per file (`.tsx` and its `.module.css`) — **Resolves: N-03** | CLI | manual: run `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelCanvas.tsx` then `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelCanvas.module.css` — expect exit 0, zero token/component violations reported |
| AC-17 | The wizard is keyboard-reachable: Tab reaches the template options, each step's inputs, and Next/Back in DOM order; per-step validation blocks Next with a focusable inline error; the view exposes an ARIA landmark and the step indicator announces the current step (FR-01, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/canvas`, keyboard-only: Tab to a template option and activate with Enter, then Tab through Step 2 inputs to "Next" and press Enter with an empty required field — expect Next is blocked and focus moves to the inline error message; complete the field and Enter — expect advance to Step 3 |
| AC-18 | Model isolation: with model A active, a full wizard run creates **model-scoped** structure — domains/journeys/activities and their `PART_OF`/`EXECUTES`/`PRECEDES` edges — scoped to A; `GET`s scoped to model B return none of A's **model-scoped** authored nodes (`Domain`/`UserJourney`/`Activity`). **`Role` is explicitly excluded from this isolation assertion: it is a shared/global node (DEC-01(a)) and is *intentionally* visible to model B** — the test asserts A's model-scoped structure is invisible to B, not that A's roles are; a `Role` created during A's run is a global node by design. **Write side (C-08, rev 3):** `POST /models/A/authoring/apply` with (a) a journey row whose `PART_OF` edge targets **model B's domain id** is rejected per-row `invalid_payload` (`{outOfModel:[…]}`) with **no edge written** (B's structure unchanged), and (b) a node row re-using B's journey id with a new name is rejected per-row with B's journey name unchanged. Switching the active model resets the wizard/canvas for B (FR-12, NFR-03) — **Resolves: B-01; rev 3 adds C-08** | server (bun test + Neo4j) + macOS Chrome (mouse+kb) | `api/__tests__/authoring-model-scope.integration.test.ts` + `pwa/src/__tests__/model-canvas.test.tsx` |
| AC-19 | Deep link + active model survive reload: with model B active, navigate to `#/model/canvas`, reload — expect the same route renders `ModelCanvas` for **model B** (active-model persistence is `model-workspace-core` FR-15; this view refetches for the persisted model); uncommitted wizard input is not restored (committed graph state is) (FR-12, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/model-canvas-context.spec.ts` |
| AC-20 | Transpile is clean and no compile-time schema arrays were edited (no `NODE_LABELS`/`EDGE_ENDPOINTS` additions; no new runtime label/edge registered by this spec) (NFR-01, NFR-04) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no additions; grep confirms this spec's code calls no `createNodeLabel`/`createEdgeType` |

## Platforms & Input Modes

This spec touches `pwa/` and ships a **canvas surface** (`ModelCanvas`) reusing
the JourneyCanvas/react-flow patterns, with wizard form inputs (`must`) and
`should`-scope canvas drag editing (FR-10). The tables are populated in full per
UX-03. The wizard steps are list/form surfaces (native inputs, catalog
components); the canvas adds pointer drag (should) with keyboard-reachable
equivalents.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Wizard step navigation (Next/Back, step indicator, template picker) | yes | yes | yes | yes | standard buttons + radio/option selection; per-step validation gates advance |
| Wizard step forms (domain/journey/activity/role name fields, role/journey pickers via `Typeahead`) | yes | yes | yes | yes | native text inputs + catalog `Typeahead`; Escape closes any modal/panel |
| Step 5 story/AC editing (generate + manual create/edit of narrative + G/W/T) | yes | yes | yes | yes | delegates to `story-spec-core` routes; native inputs |
| ModelCanvas review (read view, click a node → detail panel) | yes | yes | yes | yes | JourneyCanvas/react-flow read layout; click selects, opens `SidePanel` |
| Canvas drag editing (reorder activity, drag-to-connect edge) — **should (FR-10)** | no (deferred) | yes | yes | yes (equivalent) | pointer drag reorder + connect; keyboard move-up/down equivalent (AC-15); touch-drag deferred with the rest of FR-10 polish |

## Native Conflicts

The wizard introduces **no** new gesture/scroll/global-keyboard handler — it uses
native buttons, native text inputs, catalog `Typeahead`/`Modal`/`SidePanel`
(whose focus-trap + Escape behavior already exist and are reused). The **canvas
drag editing (FR-10, `should`)** is the only new gesture surface: reordering
activities and drag-to-connect on a react-flow/JourneyCanvas-style pane. Where
canvas drag is delivered, it must not hijack page scroll and must keep the
document's native scroll/zoom on non-canvas regions; keyboard equivalents (AC-15)
are required so the reorder is achievable without a pointer.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Page/document scroll while dragging on the canvas pane | Canvas activity-drag / drag-to-connect (FR-10, should) | `e.preventDefault()` on the canvas pane's pointer/drag handlers (scoped to the pane, not the document); react-flow's own pane-drag isolation where the react-flow pane is used |
| Trackpad pinch-zoom / wheel-zoom over the canvas | react-flow/JourneyCanvas pan-zoom (if enabled in FR-10) | contain zoom to the canvas pane via the react-flow viewport handlers; do not attach wheel/gesture listeners at document scope |
| Modal/SidePanel focus trap + Escape-to-close | (reused catalog behavior) | n/a — provided by the existing catalog `Modal`/`SidePanel`; reused, not re-implemented |
| (no new global keyboard shortcut introduced; wizard uses native Tab/Enter/Escape) | n/a | n/a |

## Dependencies

> **Hard build-order dependency.** Every surface this spec composes is a **new
> file owned by an upstream wave-1/wave-2 spec** and does not exist on disk at
> this spec's authoring time. This spec **cannot start implementation** until
> both dependencies merge: **`model-workspace-core`** (active-model context,
> `scopedNodeIds`, `IN_MODEL` regime, module-instantiation routes, `ModelCanvas`
> placeholder + `route.ts` registration, `business_architect` role/`model:write`)
> and **`story-spec-core`** (story/AC CRUD + bootstrap routes). This is correct
> wave-3 sequencing, not missing scope.

- **`model-workspace-core`** (foundation wave 1 — transitive dependency via `story-spec-core`): consumed, never re-specced.
  - Active-model shell context + `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx`) — the wizard/canvas author into and render the active model (FR-01, FR-09, FR-12).
  - `scopedNodeIds(driver, modelId)` + `IN_MODEL` scoping regime (`api/src/storage/model-scope.ts`) — active-model-scoped reads (NFR-03). Note `scopedNodeIds` returns only `Domain`/`UserJourney`/`Activity`; `Role`/`System`/`Location` are shared/global and excluded (DEC-01(a)).
  - **`POST /api/v1/models/:modelId/domains`** (`model:write`, mwc design §4.3 / review C-06) — the sanctioned `Domain`+`IN_MODEL`-in-one-tx route reused by Step 2 and the FR-02 clone target (FR-03, C-02). This spec does **not** re-implement domain-to-model scoping.
  - Module surface — `GET /api/v1/modules`, `POST /api/v1/models/:modelId/module-instances` (`{moduleId, version?, targetDomainId}`, gated **`module:write`** per mwc §5) — the retail-reference clone (FR-02, FR-08, XD-13).
  - `business_architect` RBAC role + `model:write` permission (`api/src/scripts/seed-rbac-roles.ts`, `api/src/auth/rbac-permissions.ts`) — the FR-07 route maps to `model:write` (FR-14).
  - Model surface shell + `route.ts`/`SURFACES` + `ModelTabPlaceholder` for the `canvas` tab — replaced by `ModelCanvas` (FR-09).
  - `model-workspace-core` lifecycle-route guard (`409 model_lifecycle_route_required`, FR-08) — asserted intact by AC-09.
- **`story-spec-core`** (foundation wave 2 — declared dependency): consumed, never re-specced.
  - Story/AC CRUD (`POST/GET/PATCH/DELETE /api/v1/models/:modelId/stories*` + `.../acceptance-criteria`) and the bootstrap (`POST .../stories/bootstrap` with `{activityIds?}`) — Step 5 (FR-06).
  - The `derived`-flag-clears-on-edit guarantee (surfaced, not re-implemented).
- **graph-core import + storage** (`api/src/routes/import.ts` — **only `handleImport` is exported; `realImport` is currently private** (C-03); return shape `{ imported:{nodes,edges}, errors?:RowError[] }` with per-row `{section,index,code}` under `errors[]`; `api/src/storage/{nodes,edges}.ts` `upsertNode`/`upsertEdge` are **MERGE-on-client-supplied-id** + registry-backed endpoint validator; `POST /api/v1/import`): the writer the FR-07 authoring endpoint lands structure through (blueprint "lands via import/module instantiation"). Design must export/reuse `realImport` (or a shared writer seam) and generate UUIDv7 ids server-side before the MERGE (FR-07, C-04).
- **JourneyCanvas / react-flow patterns** (`pwa/src/components/JourneyCanvas.tsx`, `JourneyData` shape; `reactflow` ^11.11.4 already in `pwa/package.json`): the canvas layout conventions reused by `ModelCanvas` (FR-09, FR-10).
- **Central router gate** (`api/src/router.ts`) + `ROUTE_PERMISSIONS` (`api/src/auth/rbac-permissions.ts`): the three new routes (FR-13, DD-06) dispatched via a sibling `registerAuthoringRoutes` delegate (same pattern as mwc's `registerModelRoutes` / story-spec-core's `registerStoryRoutes`) + auth-gated centrally; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts`) + `ERROR_CODES` (`api/src/errors.ts`).
- **PWA shell + catalog** (`pwa/src/views/index.tsx` `renderView`, `pwa/src/components/{Card,Modal,SidePanel,Button,DataTable,Typeahead,JourneyCanvas}.tsx`, `tokens.css`, `scripts/design-conformance.ts`).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — `POST /api/v1/import` reuse mechanism.** FR-07's authoring endpoint lands structure through the existing import writer. `realImport` is **not currently exported** (C-03), so option (a) requires a small change. Should design (a) **export `realImport`** and call it in-process with an assembled `{nodes,edges}` payload, (b) extract a thinner shared `upsertNode`/`upsertEdge` writer seam, or (c) HTTP-loopback to `/api/v1/import`? | Determines coupling to `import.ts` internals + whether an export/seam extraction lands. | **Decision needed (default: proceed with (a))** — export `realImport` (or its collect-and-continue core) and call it in-process; the authoring handler generates UUIDv7 ids server-side before assembling the payload (C-04), and does **no** `IN_MODEL` writing (domains come from mwc's route, C-02). (a) reuses the proven two-phase writer + `errors[]` contract without an HTTP round-trip; (b) risks re-deriving the phase-1/phase-2 blame logic; (c) adds a self-call. Design confirms the exact seam + the export. |
| 2 | **OQ-2 — retail-reference module granularity.** XD-13's clone instantiates the retail-reference model's *journey module(s)*. Does the reference expose **one** module spanning all retail journeys, or **one per journey**? `model-workspace-core` publishes modules at journey level (its FR-06). | Affects the clone UX (one click vs. pick-which-journeys) and AC-03. | **Decision needed (default: proceed):** clone **all** published retail-reference journey modules (one `POST .../module-instances` per module), presented as a single "Clone retail reference" action. Alternative: let the user pick a subset. Default keeps Step 1 one-click; subset selection is a should-tier follow-up. Depends on how many modules `model-workspace-core`'s migration publishes — confirm in design against the real reference. |
| 3 | **Canvas scope creep** (blueprint Risks row 6). FR-10 direct-manipulation editing (drag reorder, drag-to-connect) is where "author a business" can balloon into a full graph editor. | Large-spec scope explosion. | FR-10 is explicitly **`should`**; the `must` authoring path is the wizard (FR-01..FR-08). NFR-06 + AC gating keep the `must` set free of FR-10. Canvas edit affordances ship after the wizard or not at all in v1. Native Conflicts table constrains any drag handler introduced. |
| 4 | **OQ-3 — uncommitted wizard state on reload.** FR-12 commits each step's structure to the graph and does **not** persist uncommitted in-progress input across reload. | A mid-step reload loses unsaved field entries. | **Recorded default (proceed):** commit-per-step model — each step's Next commits via FR-07, so only the current step's unsaved fields are ever at risk; no client-side draft persistence in v1. Alternative (localStorage draft) is a follow-up. Surfaced to the user so the "commit each step" model is a conscious choice, not a silent data-loss bug. |
| 5 | **XD-18 verification depth.** The mandate is "domain experts model key activities per role end-to-end … exercised per platform." AC-06 proves the server round-trip; AC-17/AC-01 prove the keyboard/pointer wizard paths. | Under-verifying the mandate would leave XD-18 unmet. | AC-06 (server `EXECUTES` round-trip) + AC-04/AC-05 (domain/journey) + AC-17 (keyboard) + AC-01/AC-11 (pointer) together cover the Role/Activity/`EXECUTES` + persona path per platform. Design/tasks must keep AC-06 an integration test (real Neo4j), not a mock. |
| 6 | **Registry-label additions vs. compile-time expectations** (blueprint Risks row 7). | This spec writes registry labels (`UserStory`, `BusinessModel`) via existing writers. | This spec adds **no** label/edge (NFR-01/AC-20); it only *writes instances* of labels upstream specs registered. The import writer already accepts `z.string()` labels (verified in `import.ts`), so registry labels flow through without a compile-time change. |

## Revision History

**Revision 2 (2026-07-04)** — addresses `review-requirements.md` (pass 1/2). Every
Blocker and Concern reconciled against the approved `model-workspace-core` and
`story-spec-core` interfaces (verified on disk):

| Finding | Resolution |
|---------|-----------|
| **B-01** (`Role` is shared/global, not model-scoped) | FR-05 rewritten to model `Role`/`System`/`Location` as shared/global (DEC-01(a)) with a **pick-or-create-global** role picker; AC-06 re-scoped to round-trip `EXECUTES` via the model-scoped **`Activity`** end (not a "model Role"); AC-18 excludes `Role` from the isolation set; NFR-03/FR-12 clarified that shared reference nodes are legitimately cross-model. |
| **B-02** (clone path needs `module:write`, not `model:write`) | FR-14 now states both `must` write paths — `authoring/apply` → `model:write` **and** the clone route `module-instances` → `module:write` (mwc §5); both carried by `business_architect`. FR-08 + AC-09/AC-10 updated to assert **both** permissions. |
| **C-01** (`targetDomainId` required, but Step 1 runs before Domains) | FR-02 adds a target-domain step: the clone first ensures a `Domain` via mwc's `POST /models/:id/domains` and passes its id as `targetDomainId`; FR-08 names that id's provenance. |
| **C-02** (domain-create duplicates mwc's route) | FR-03 now creates `Domain`+`IN_MODEL` via mwc's `POST /models/:id/domains`; FR-07 no longer creates domains or writes `IN_MODEL`; AC-04, dependency list, and scope updated. |
| **C-03** (`realImport` private; return shape) | FR-07 states `realImport` is not exported and its true shape `{imported:{nodes,edges},errors?:RowError[]}`; design must export/reuse it (OQ-1 default (a) updated); AC-08 asserts the real shape. |
| **C-04** (import MERGEs on client id) | FR-07 states the authoring handler generates a **server-side UUIDv7** per new node/edge before assembling the payload, so re-runs upsert idempotently; AC-08 asserts it. |
| **C-05** (bootstrap idempotent skip) | FR-06 + AC-07 acknowledge `{created:N, skipped:M}` and require the wizard render a re-run's `created:0` as an idempotent "already generated" state, not an error. |
| **N-01** | FR-13 drops the "adds no new code unless…" hedge; leaves the additive-code decision to design. |
| **N-02** | Summary now leads with the core promise; composition disclaimers moved down. |
| **N-03** | AC-16 uses the enforced `--view` form (mwc D-5), run once per `.tsx`/`.module.css`. |

**Revision 3 (2026-07-05)** — the **DD-06 requirements amendment** (design §5.0,
DR2-B-01/DR2-B-03), authored for user ratification; also folds in the three
requirements-review pass-2 concerns (C-06/C-07/C-08) whose resolutions the
approved-direction design already carries, so the requirements text and the
design/tasks contract cannot disagree. **No AC was renumbered; no FR was
removed** — the `must`/`should` split, the AC id set (AC-01..AC-20), and all
rev-2 resolutions stand.

| Change | Where | Driven by |
|--------|-------|-----------|
| "Exactly one new endpoint" → **three routes**: `POST …/authoring/apply` (`model:write`), `GET …/authoring/graph` (`model:read`), `PATCH …/domains/:domainId` (`model:write`) | FR-13, FR-14, Scope Boundaries (in-scope bullets 3 + 7) | design DD-06/§5.0/§5.1 (DR2-B-01) |
| FR-03 names the domain **PATCH** as the edit-in-place mechanism (`404 not_found` off-model; `404 model_not_found` unknown model) | FR-03, AC-04 | design DD-06/DD-08/§4.9 (DR2-B-03) |
| FR-09's "graph-core reads scoped to the active model" (unimplementable — graph-core reads are not model-scoped; `?model=` retrofit pinned out by mwc D-1) → the `GET …/authoring/graph` projection | FR-09, AC-11, FR-12 | design DD-01/DD-06 |
| Apply response **echoes server-minted per-row `ids`** (incl. failed rows) so idempotent re-submit is implementable/testable | FR-07, AC-08 | review C-07 |
| Apply enforces the model boundary: anchors/endpoints ∉ `scopedNodeIds(:modelId)` (and not in-batch) → per-row `invalid_payload` `{outOfModel}` | FR-07, NFR-03, AC-18 | review C-08 |
| Permission enumeration completed to **four families** — adds `story:read`/`story:write` (Step 5) + `query:read` (Step 4 role picker); AC-10 adds the `story:write`-403 assertion + asserts all three routes in openapi | FR-14, AC-10 | review C-06, design §5.2 (DR2-C-01) |
| `not_found` added to the reused `ERROR_CODES` list (domain-PATCH miss) | FR-13 | design §5.1 |

Frontmatter is `status: revised` pending user ratification of the DD-06
amendment; on ratification this revision becomes the approved requirements
(rev 3) and the design rev 3's Execution precondition (1) is cleared.
