---
feature: "business-model-authoring"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 4
reviewing_requirements_revision: 3
size: "large"
---

# Design: business-model-authoring

> **Revision 4 (2026-07-05).** Applies the design re-review — `review-design.md`
> **pass 2/2 on rev 3, verdict: approve** (0 blockers, 3 concerns, 3 nits;
> cited here with a **DR3-** prefix) — without spending a further review pass
> (cap 2/2 reached; each fix stays within the review's own recommendation).
> Changes: **DD-09** (§4.3 step 5) refines DD-07's rejection semantics so a
> stranded no-model orphan stays re-anchorable and the echoed-id retry
> contract holds (DR3-C-02, review option (i)); step 5 gains the
> resolved-label-must-match-claimed-label assertion (DR3-N-01); §4.4 states
> `scopedNodeIds`' real composition incl. `ModuleInstance` pins (DR3-N-02);
> §5.0/DD-06 records that requirements **rev 3 is now authored** (2026-07-05,
> awaiting ratification) and carries the five-code FR-13 list (DR3-C-01,
> DR3-N-03). DR3-C-03 (tasks recut) was already met by tasks rev 2; the DD-09
> + label-check fold into T-04/T-16 is the one residue owed to the tasks
> phase. See §2.5 for the finding-by-finding map.
>
> **Revision 3 (2026-07-04).** Addresses `review-design.md` (verdict: revise —
> 3 blockers, 3 concerns, 3 nits, on rev 2). Those findings are cited here with
> a **DR2-** prefix (DR2-B-01..03, DR2-C-01..03, DR2-N-01..03) because the bare
> `B-*`/`C-*` ids in this document already refer to the *requirements*-review
> findings and MUST NOT be renumbered. Headline changes: an explicit
> **Requirements-deviation subsection (DD-06)** for the route count
> (DR2-B-01), a mechanized **write-side model-scope validation step** in the
> apply handler (§4.3 step 5, DD-07, DR2-B-02), and a **model-scoped domain
> PATCH route** giving FR-03's "editable in place" an implementable path
> (§4.9, DD-08, DR2-B-03). See §2.4 for the finding-by-finding map.
>
> **Revision 2 (2026-07-04)** folded in the rev-1 design review's concerns
> (DR-C-01 canvas-projection seam, DR-C-02 AC-10 renumbering) and nits
> (DR-N-01..03), plus the three **design-rooted** findings the tasks review
> surfaced (TR-C-01 router dispatch, TR-C-02 phantom ordering constraint,
> TR-N-03 unpinned Role catalog read). Both upstream dependencies
> (`model-workspace-core`, `story-spec-core`) have **merged since rev 1**, so
> all interface citations below are to on-disk code, not to dependency
> design documents. See §2 for the finding-by-finding resolution map.

## 1. Overview

`business-model-authoring` is a **composition layer**: it adds exactly
**three** new REST routes (one batch write, one read, one domain patch — a
sanctioned deviation from the approved requirements' "exactly one endpoint"
wording; see **DD-06, §5.0**, DR2-B-01/DR2-B-03) and **one** new PWA view, and
stands up a guided **authoring wizard** that walks the Business Architect
persona from an empty `BusinessModel` to a populated one — **Template →
Domains → Journeys → Activities × Roles → Stories + ACs** — by orchestrating
calls into surfaces that upstream specs already own (`model-workspace-core`,
`story-spec-core`, graph-core `import`). It introduces **no** node label, edge
type, store, RBAC role, or permission (NFR-01, NFR-02); the wizard's
server-side novelty is a thin **model-scoped batch-authoring endpoint**
(`POST /api/v1/models/:modelId/authoring/apply`) that assembles a
graph-core-shaped `{nodes, edges}` payload — after **validating every
referenced pre-existing model-scoped id against the model's scope**
(§4.3 step 5, DD-07 as refined by DD-09, DR2-B-02/DR3-C-02) — and lands it through the **existing**
`POST /api/v1/import` two-phase writer; plus a model-scoped read
(`GET /api/v1/models/:modelId/authoring/graph`) that projects the authored
structure for the review canvas; plus a minimal model-scoped
`PATCH /api/v1/models/:modelId/domains/:domainId` so FR-03's "existing domains
are listed and **editable in place**" has a permission-reachable path for the
persona (§4.9, DD-08, DR2-B-03).

The design follows five rules:

1. **Reuse the proven writer in-process, never re-implement it.** The authoring
   endpoint exports and calls `import.ts`'s currently-private `realImport`
   collect-and-continue core (OQ-1 default (a)); it never HTTP-loopbacks, never
   re-derives phase-1/phase-2 blame logic, and returns `import`'s
   `{ imported, errors? }` shape **verbatim** (C-03). Every other persisted write
   — domain **create**, template clone, stories/ACs — dispatches to an
   **existing** upstream route (C-02, XD-13, XD-09); the one exception is
   domain **edit**, which had no reachable upstream path and gets this spec's
   minimal model-scoped PATCH (§4.9, DD-08, DR2-B-03), itself delegating to
   graph-core's `patchNode` primitive.
2. **The server owns the ids.** Because `import` MERGEs on a **client-supplied**
   id (`upsertNode`/`upsertEdge` are MERGE-on-id), the authoring handler mints a
   **server-side UUIDv7** for every new node/edge — via `generateId()` from
   `api/src/ids.ts`, the same generator the storage layer uses
   (`api/src/storage/nodes.ts:119`) — **before** assembling the payload,
   **echoes the stamped ids in the response** (N-04), and re-submitting a step
   with those same ids upserts idempotently instead of duplicating (C-04).
3. **The server projection is id-based; the column math is one pure client
   mapper.** `authoring/graph` returns a clean id-based model-scoped projection;
   the nontrivial id→column transform into `JourneyCanvas`'s column-indexed
   `JourneyData` contract lives in **one** pure, unit-tested client function
   (`toJourneyData`, §4.8, DD-05) — not smeared across the view (DR-C-01).
4. **The wizard is the authoritative authoring path (`must`); the canvas is a
   read-and-review surface (`must`) with direct-manipulation editing deferred
   (`should`).** This is the blueprint's Risks-row-6 scope guard against
   "author a business" ballooning into a full graph editor.
5. **Model-scoped structure only; shared reference nodes are global.**
   `Domain`/`UserJourney`/`Activity` are model-scoped (via mwc's `IN_MODEL`
   regime, consumed not re-implemented); `Role`/`System`/`Location` are
   **shared/global** (`model-workspace-core` DEC-01 (a)) — the role picker is
   **pick-or-create-global** and isolation is asserted on the model-scoped
   structure only (B-01).

Rejected at design level: an authoring endpoint that itself writes `Domain` +
`IN_MODEL` (duplicates mwc's `POST /models/:id/domains`, C-02); a bespoke
template-copy path (bypasses XD-13's module-instantiation machinery); a
client-side id scheme (breaks `import`'s MERGE-on-id idempotency, C-04); a new
`authoring:write` permission (structural authoring into a model is a
`model:write`, FR-14); reusing the explorer's `MultiJourneyView`/"multi" path
for the review canvas (fed by a non-model-scoped read — NFR-03, §4.8).

## 2. Prior-review concerns — resolution in this design

Three review generations feed this revision. Finding ids are prefixed by their
source to avoid collision: **RR-** = requirements review (pass 2, carried into
rev 1), **DR-** = design review (pass 1, on rev 1), **TR-** = tasks review
(pass 1, findings rooted in this design's §5.1/§4.5).

### 2.1 Requirements-review carry-forwards (resolved in rev 1, kept)

- **RR-C-06 — FR-14 omits `story:write`, which the `must` Step 5 path
  exercises.** Resolved in §5.2 and §4.6: the "permissions the feature
  exercises" enumeration is **four** families (widened from three in rev 3
  per DR2-C-01) — `model:write`/`model:read` (the three new routes, the
  **only** mappings this spec adds), `module:write` (the mwc-owned clone
  route), `story:write`/`story:read` (the story-spec-core-owned Step 5
  routes, now on disk at `api/src/auth/rbac-permissions.ts:282-287`), and
  `query:read` (the Step 4 role-picker search, DR2-C-01). This spec adds and re-maps
  **none** of the story-spec-core or mwc mappings. **AC-10** (single id — see
  DR-C-02) is widened (§8) to assert a session lacking `story:write` is 403'd
  on the Step 5 bootstrap call, closing the same class of gap B-02 closed for
  the clone path.
- **RR-N-04 — idempotency presumes the apply response echoes the
  server-generated ids.** Resolved in §3.2 / §4.3 / §5.1: `POST
  …/authoring/apply` responds with `{ imported, errors?, ids }` where `ids`
  maps each request row to the server-minted UUIDv7; the client keeps and
  re-submits those ids on a step re-run, so the MERGE-on-id upsert is
  idempotent (C-04) rather than aspirational.
- **RR-N-05 — OQ-2 (retail-reference module granularity).** Resolved as DD-04
  in §4.2: the clone instantiates **every** published module whose
  `sourceModelId` is the reference model, one `POST …/module-instances` per
  module, presented as a single count-agnostic "Clone retail reference" action.

### 2.2 Design-review findings (new in rev 2)

- **DR-C-01 — the rev-1 §4.4 canvas projection did not match the real
  `JourneyData` contract.** `JourneyData`
  (`pwa/src/components/JourneyCanvas.tsx:37-45`) is **single-journey and
  column-index-based** — `ActivityNode{id,name,column}`,
  `RoleNode{columns:number[], durations}`, `SystemNode{usages:[{column,…}]}`,
  `LocationNode{columns}`, `PrecedesEdge{from_col,to_col}` — and roles/systems/
  locations reference activities by **column position**, not id. Resolved per
  the review's recommendation (a): the server route stays id-based (§4.4), and
  the id→column transform is a **specified, pure, unit-tested client mapper**
  `toJourneyData(graph, journeyId): JourneyData` with its own contract, column-
  assignment algorithm, cross-journey rule, and rendering decision (one
  `JourneyCanvas` per journey, `layoutMode="chain"`) — §4.8 / DD-05. AC-11's
  seam is pinned to that mapper + its unit test (§8).
- **DR-C-02 — AC-10 was silently split into AC-10a/AC-10b (approved-AC
  drift).** Resolved: this revision **keeps the single approved id `AC-10`**
  everywhere (§2.1, §4.6, §8). AC-10 is one AC closed by **two** test
  artifacts (authz + openapi files) — allowed and explicit — and its authz
  assertion is **widened** (not renumbered) to include the `story:write` 403
  from RR-C-06. No requirements amendment is needed; `spec-traceability` finds
  `AC-10` verbatim. The tasks artifact (rev 1) already reverted to the single
  id; design and tasks now agree.
- **DR-N-01 — §3.1 schema shown without the `id?` field, patched later.**
  Resolved: `id` is inlined into both schema blocks in §3.1; the rev-1
  "schema addendum" is deleted. §3.1 is now correct as written.
- **DR-N-02 — edge-id key format ambiguous (`->:` vs `->`).** Resolved: the
  canonical key is **`"<type>:<from>-><to>"`** (delimiter `->`, no stray
  colon), where `<from>`/`<to>` are the request edge row's `from`/`to` tokens
  **verbatim** (clientKey or UUID, exactly as the client sent them). Used
  identically in §3.2 and §4.3 step 7 (renumbered from 6 when the DD-07 scope
  step was inserted), so the client reconstructs keys deterministically for
  re-submit.
- **DR-N-03 — `existingId` vs `id` precedence on a node row.** Resolved:
  they are **mutually exclusive** and the schema enforces it (§3.1
  `superRefine`): a row carrying both fails envelope validation
  (`400 invalid_payload`). Semantics: `existingId` = "pick an existing global
  node; emit **no** import row"; `id` = "re-run of a previously minted node;
  emit an import row **with** that id". No handler ambiguity remains.

### 2.3 Tasks-review findings rooted in this design (new in rev 2)

- **TR-C-01 — rev-1 §5.1 mis-stated the router integration point** ("add
  match arms inside mwc's `models*` block"). On disk, mwc's block is a 2-line
  **delegation** to `registerModelRoutes` (`api/src/router.ts:396-399`,
  mwc-owned `api/src/routes/models.ts`), and story-spec-core integrated as a
  **sibling delegate block** (`registerStoryRoutes`, `router.ts:404-407`) —
  not by editing mwc's file. Resolved: §5.1 now specifies a third sibling
  delegate, `registerAuthoringRoutes` exported from
  `api/src/routes/authoring.ts`, wired as its own block in `router.ts`.
  **`api/src/routes/models.ts` is not touched.**
- **TR-C-02 — the "order before the generic `models/:id` arms" rationale
  rested on a non-existent collision.** Resolved: dropped. The authoring paths
  are 4 segments (`models/:id/authoring/apply|graph`); no existing arm in
  `registerModelRoutes` or `registerStoryRoutes` matches that shape, and
  delegates return `null` on no-match. §5.1 records: **no ordering constraint**
  — the block is placed after the stories block for reading order only.
- **TR-N-03 — the global-Role catalog read was unpinned** ("a `GET
  /api/v1/nodes`-style read"). Resolved in §4.5: the role picker uses the
  **existing** per-label search read `GET /api/v1/query/search?label=Role&q=…`
  (`handleSearch`, `api/src/router.ts:459`) through the existing
  `api.search(label, q, limit)` client (`pwa/src/api.ts:94`) — which is
  exactly the interface the catalog `Typeahead` already consumes via its
  `label` prop (`pwa/src/components/Typeahead.tsx:20`, "e.g. `Role`,
  `System`, `Location`"). No new read is invented for the picker.

### 2.4 Design-review findings on rev 2 (**DR2-**, new in rev 3)

`review-design.md` (verdict: revise) re-reviewed rev 2. Its findings are
prefixed **DR2-** here to avoid colliding with the requirements-review
`B-*`/`C-*` ids already cited throughout this document (stable ids are never
renumbered).

- **DR2-B-01 — two endpoints shipped where the approved requirements say
  "exactly one" (FR-13/FR-14/Scope Boundaries), with no paper trail.**
  Resolved by **DD-06 (§5.0) — an explicit Requirements-deviation subsection**
  listing every place the approved text and this design disagree (now
  **three** routes, since DR2-B-03's fix adds a domain PATCH), the rationale
  (DD-01's NFR-03 argument, which the review endorsed), and the exact
  amendment the orchestrator must ratify as requirements **revision 3**.
  §5.1 references DD-06; §8's AC-10 openapi assertion is stated against the
  amended (three-route) contract so tooling and requirements text cannot
  disagree once the amendment lands. Surfaced as an **Open Question** to the
  orchestrator — this design does not silently drift.
- **DR2-B-02 — `authoring/apply` never enforced model scope on referenced
  pre-existing ids (cross-model write hole; NFR-03's write-side claim had no
  mechanism).** Resolved by **DD-07**: a new **scope-validation step** in the
  handler (§4.3 step 5) — every raw pre-existing UUID the batch references
  (edge `from`/`to` endpoints, node-row `existingId`, node-row re-run `id`)
  is label-resolved and, when its label is model-scoped
  (`Domain`/`UserJourney`/`Activity`), asserted a member of
  `scopedNodeIds(modelId)` — the same regime mwc's D-2 check applies to
  `targetDomainId` (`api/src/storage/modules.ts:520-532`). Violations are
  **per-row errors** (`invalid_payload`, `details:{outOfModel:[…]}`,
  collect-and-continue, no new code per §5.3); the offending rows are
  excluded from the payload handed to `realImport` with error indexes
  remapped to the canonical assembled order. §4.4's isolation paragraph now
  points at the mechanism, and AC-18 (§8) gains the write-side assertion:
  apply to model A with a `PART_OF` target that is model B's domain id →
  per-row error, **no edge written**.
- **DR2-B-03 — FR-03 "existing domains are listed and editable in place"
  had no implementable path** (`apply` excludes `Domain` by design; mwc has
  no domain PATCH; graph-core's generic node PATCH needs `node:write`, which
  `business_architect` deliberately lacks). Resolved by **DD-08** — review
  option (i): a minimal model-scoped
  `PATCH /api/v1/models/:modelId/domains/:domainId` (`model:write`), a third
  arm in `registerAuthoringRoutes` (mwc's `routes/models.ts` untouched),
  D-2-style `IN_MODEL` membership check, delegating to graph-core's
  `patchNode` (§4.9, §3.5). Folded into the same DD-06 amendment. Option (ii)
  — descoping a must-FR clause — is rejected in §9.
- **DR2-C-01 — §5.2's "full picture" omitted `query:read`** (the Step 4 role
  picker's `GET /api/v1/query/search`). Resolved: §5.2 gains the
  `query:read` row (`rbac-permissions.ts:58`) and now counts **four**
  exercised permission families; AC-10's full-run assertion includes the
  role-picker search succeeding under `business_architect` (§8).
- **DR2-C-02 — journey/activity edit-on-re-run semantics assumed, not pinned
  or tested.** Resolved: §4.3 now states the MERGE **update** semantics
  explicitly (a matched id-set row applies changed `name`/`description`/
  `attributes`), and AC-08's integration test asserts a re-submitted row with
  the echoed `id` and a changed `name` persists the new name (§8).
- **DR2-C-03 — `ids` echo for failed rows unspecified.** Resolved: §3.2 and
  §4.3 state that ids are echoed for **all** rows **including failed ones**;
  re-submitting a failed row with its echoed id **creates** it (MERGE on an
  absent id is a create). This is also why §4.3 step 5 exempts a re-run `id`
  whose node does not exist yet.
- **DR2-N-01** — FR-10 added to the `ModelCanvas.tsx` row's Serves column in
  §7. **DR2-N-02** — the wizard's re-entry step is pinned in §3.4
  (`resumeStep`: first step whose advance-gate is unsatisfied). **DR2-N-03**
  — §5.2's new `ROUTE_PERMISSIONS` rows match their nearest on-disk
  neighbors' param-name style (matching is positional; names are cosmetic).

### 2.5 Design-review findings on rev 3 (**DR3-**, pass 2/2 — verdict approve; new in rev 4)

`review-design.md` (pass 2/2, on rev 3) **approved** the design — zero
blockers — with three concerns and three nits. Rev 4 folds the design-side
fixes in directly; the review cap (2/2) is reached, so no third pass exists
and each fix below deliberately stays within the review's own written
recommendation:

- **DR3-C-01 — DD-06's requirements amendment was proposed, not ratified.**
  A sequencing condition, not an authoring defect (the review says so).
  Status: requirements **revision 3 was authored 2026-07-05** — its Revision
  History §rev-3 carries the exact DD-06 amendment table plus the five-code
  FR-13 error list (per DR3-N-03) — and awaits user ratification. §5.0
  records this; execution stays blocked on ratification (tasks.md
  preconditions). Still an **Open Question** for the orchestrator.
- **DR3-C-02 — DD-07's per-row rejection could strand a fresh node as a
  no-model orphan and then reject its echoed-id retry forever** (an orphan
  is never in `scopedNodeIds(A)`; the same lock-out follows any phase-2 edge
  failure or crash between phases), breaking the retry contract
  (AC-08/AC-14) in exactly the states retries exist for. Resolved by
  **DD-09** (§4.3 step 5 — review option (i)): the membership test rejects
  only ids that are members of a **different** model's scope; an existing
  node of a model-scoped label with **no** `PART_OF*0..→Domain→IN_MODEL`
  chain to any `BusinessModel` is a re-anchorable orphan and passes. §8's
  AC-18 artifact gains the recovery assertion (scope-rejected batch →
  corrected echoed-id retry **succeeds**, node lands in `scopedNodeIds(A)`).
  Option (ii)'s creation-side cascade exclusion is rejected in §9.
- **DR3-C-03 — tasks.md (rev 1) predated design rev 3.** Already met:
  tasks **rev 2** (2026-07-04) re-cut against rev 3 (domain PATCH → T-18,
  DD-07 → T-04/T-16, three-route openapi → T-13, widened AC-04/08/10/18
  artifacts). The one residue from **this** revision: fold DD-09 + the
  DR3-N-01 label check into T-04's step-5 logic and T-16/T-06's assertions —
  flagged to the orchestrator as a tasks touch-up, not a design edit.
- **DR3-N-01 — step 5 never asserted the resolved label matches the row's
  claimed `label`** (a re-run `id` whose id exists under a *different* label
  would ``MERGE (n:`<claimed>` {id})`` a **second node with a duplicate
  id**). Resolved: §4.3 step 5 compares the resolution query's `labels(n)`
  against the claimed label for `existingId`/re-run-`id` rows → mismatch is
  a per-row `invalid_payload` with `details:{labelMismatch:[<id>]}`, row
  excluded; AC-08's test asserts no duplicate-id node is created (§8).
- **DR3-N-02 — on disk, `scopedNodeIds` also collects `ModuleInstance` pin
  ids** (`INSTANCE_IN`, `model-scope.ts:33`). Resolved: §4.4 states the
  set's real composition; the `authoring/graph` projection filters by label
  (`Domain`/`UserJourney`/`Activity`) and never trusts the set to hold only
  structural labels.
- **DR3-N-03 — §5.3 uses five error codes while FR-13's rev-2 text listed
  four.** Already folded into the authored requirements rev 3 (FR-13 lists
  all five, incl. `not_found`); §5.3 is unchanged and now agrees with the
  amended text.

## 3. Data model

This spec adds **no** node label, edge type, or persisted schema (NFR-01). It
introduces two **zod request/response** shapes for its batch-write route, one
projection shape for its read route, one small patch shape for the domain
edit route (§3.5, DR2-B-03), plus the in-memory wizard step model. Everything
persisted is an instance of a label an upstream spec already registered.

### 3.1 Authoring-apply request (`authoringApplySchema`) — FR-07

New file `shared/src/schema/authoring.ts`. The request is a graph-core-shaped
batch of **journeys/activities/roles + their edges** — **never** `Domain` and
**never** `IN_MODEL` (C-02; domains come from mwc's `POST /models/:id/domains`,
§4.1). Complete as written (DR-N-01 — `id` is inline; no addendum):

```ts
// shared/src/schema/authoring.ts
import { z } from "zod";
import { uuidv7 } from "./nodes"; // shared/src/schema/nodes.ts:26 — UUIDv7 zod validator

// A node row the wizard wants created or referenced. `clientKey` is a
// wizard-local handle (e.g. "j0", "a3", "role:cashier") used ONLY to wire
// edges within the same batch before the server has minted ids.
//
// Exactly one of three cases per row (DR-N-03 — mutually exclusive):
//   - neither `existingId` nor `id`  → NEW node: server mints a UUIDv7,
//     emits an import row, echoes the id (C-04).
//   - `existingId` set               → PICK-EXISTING global node (e.g. a
//     Role from the catalog, FR-05): NO import row emitted; clientKey
//     resolves to existingId for edge wiring.
//   - `id` set                       → RE-RUN of a previously minted node:
//     import row emitted WITH that id (MERGE-on-id upsert, C-04).
const authoringNodeSchema = z
  .object({
    clientKey: z.string().min(1),
    label: z.enum(["UserJourney", "Activity", "Role"]), // NOT Domain (C-02)
    name: z.string().min(1),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
    existingId: uuidv7.optional(),
    id: uuidv7.optional(),
  })
  .superRefine((row, ctx) => {
    if (row.existingId !== undefined && row.id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a node row cannot carry both existingId and id",
        path: ["existingId"],
      });
    }
  });

// An edge row addressed by clientKey OR an existing UUID on either end.
// `id` (optional) is the re-run case: reuse the previously echoed edge id.
const authoringEdgeSchema = z.object({
  type: z.enum(["PART_OF", "EXECUTES", "PRECEDES"]), // structural authoring set
  from: z.string().min(1), // clientKey or existing UUID
  to: z.string().min(1),   // clientKey or existing UUID
  id: uuidv7.optional(),
});

export const authoringApplySchema = z.object({
  nodes: z.array(authoringNodeSchema),
  edges: z.array(authoringEdgeSchema),
});
export type AuthoringApply = z.infer<typeof authoringApplySchema>;
```

Notes:
- `label` is a **narrowed enum** (`UserJourney`/`Activity`/`Role`) — the endpoint
  physically cannot create a `Domain`, `System`, `Location`, or any lifecycle
  label, so C-02's delegation is enforced at the schema boundary, not by
  convention. `USES_SYSTEM`/`AT_LOCATION` wiring to existing shared `System`/
  `Location` is out of this spec's `must` set (Scope Boundaries) and is not in
  the edge enum.
- A row with **both** `existingId` and `id` fails the `superRefine` → envelope
  `400 invalid_payload` (DR-N-03; asserted in the schema unit test, §8).
- The **wrong endpoint pair** (e.g. `PART_OF` with `from=Activity, to=Role`) is
  **not** pre-validated in zod — it is caught by the registry-backed edge
  validator inside `upsertEdge` and surfaces as a per-row
  `edge_endpoint_label_mismatch` in `errors[]` (collect-and-continue, AC-05).
- **Model-scope of raw UUIDs is not a zod concern** — a syntactically valid
  UUID passes the schema, and the handler then asserts every referenced
  pre-existing model-scoped node is a member of `scopedNodeIds(:modelId)`
  (§4.3 step 5, DD-07). Zod validates shape; the handler validates scope
  (DR2-B-02).

### 3.2 Authoring-apply response (`authoringApplyResultSchema`) — FR-07, RR-N-04

```ts
export const authoringApplyResultSchema = z.object({
  imported: z.object({ nodes: z.number().int(), edges: z.number().int() }),
  errors: z
    .array(
      z.object({
        section: z.enum(["nodes", "edges"]),
        index: z.number().int(), // index into the ASSEMBLED import payload
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  // RR-N-04: the server-minted ids, so the client can resubmit the exact
  // UUIDv7s on a step re-run (C-04 idempotency).
  ids: z.object({
    // nodes: request row's clientKey -> UUIDv7 (existingId rows included,
    // mapped to their existingId, so every clientKey resolves).
    nodes: z.record(uuidv7),
    // edges: canonical key "<type>:<from>-><to>" -> UUIDv7, where <from>/<to>
    // are the request edge row's tokens VERBATIM (DR-N-02 — single format,
    // delimiter "->", used identically in §4.3 step 7).
    edges: z.record(uuidv7),
  }),
});
```

`imported` + `errors` are `realImport`'s shape verbatim (C-03; the `index`
refers to the **canonical assembled payload's** row order, which the handler
builds deterministically from the request rows — §4.3; rows the scope check
rejects keep their canonical index, and `realImport`'s indexes are remapped
back onto it, §4.3 step 5). `ids` is the additive RR-N-04 echo.

**Failed rows are echoed too (DR2-C-03).** `ids` maps **every** request row —
including rows that landed in `errors[]` (and rows rejected by the scope
check) — to its minted/resolved UUIDv7. Re-submitting a failed row carrying
its echoed `id` is well-defined: `upsertNode`/`upsertEdge` MERGE on the id, and
a MERGE on an id that was never created is a **create**, so the retry lands the
row rather than colliding. The client therefore keeps the full `ids` map
regardless of per-row outcome.

### 3.3 Authoring-graph projection (`authoringGraphSchema`) — FR-09, DR-C-01

The read route's response (also in `shared/src/schema/authoring.ts`) is
**id-based only** — no column math on the server (DD-05, §4.8):

```ts
export const authoringGraphSchema = z.object({
  journeys: z.array(z.object({
    id: uuidv7, name: z.string(), domainId: uuidv7,
    // order: server-computed position — topological over the journey's
    // intra-journey PRECEDES chain; createdAt ascending for unordered ties.
    activities: z.array(z.object({ id: uuidv7, name: z.string(), order: z.number().int() })),
  })),
  roles: z.array(z.object({ id: uuidv7, name: z.string(), executesActivityIds: z.array(uuidv7) })),
  systems: z.array(z.object({ id: uuidv7, name: z.string(), usedByActivityIds: z.array(uuidv7) })),
  locations: z.array(z.object({ id: uuidv7, name: z.string(), activityIds: z.array(uuidv7) })),
  precedes: z.array(z.object({ fromActivityId: uuidv7, toActivityId: uuidv7 })),
});
export type AuthoringGraph = z.infer<typeof authoringGraphSchema>;
```

### 3.4 Wizard step model (PWA, in-memory only) — FR-01, FR-12

`pwa/src/views/model/authoring/wizardModel.ts` (pure types + a reducer, no I/O):

```ts
export type WizardStep = "template" | "domains" | "journeys" | "activities" | "stories";
export const WIZARD_STEPS: WizardStep[] = ["template","domains","journeys","activities","stories"];

export interface WizardState {
  step: WizardStep;
  template: "blank" | "retail-clone" | null; // Step 1 choice (FR-02)
  // committed ids the client holds for idempotent re-submit (C-04, RR-N-04)
  committed: {
    domainIds: string[];            // from mwc POST /models/:id/domains (FR-03)
    nodeIds: Record<string, string>;// clientKey -> UUIDv7 (authoring/apply echo)
    edgeIds: Record<string, string>;// "<type>:<from>-><to>" -> UUIDv7 (§3.2)
  };
  // current step's uncommitted draft fields (NOT persisted across reload, FR-12)
  draft: Record<string, unknown>;
  error: { code: string; message: string } | null;
}
```

Per FR-12, only **committed** graph state survives a reload (re-fetched from the
model); `draft` is intentionally not persisted (the "commit each step" model,
OQ-3). The reducer enforces per-step validation gating (FR-01): a step with an
empty required field cannot advance (`canAdvance(state)` returns false → Next is
disabled + inline message).

**Re-entry step (FR-01 "resumable" — DR2-N-02).** On mount (fresh load, reload,
or active-model switch) the wizard derives its opening step from the fetched
committed graph via a pure `resumeStep(graph: AuthoringGraph, storyCount:
number): WizardStep | "done"` in `wizardModel.ts` (`storyCount` from the
existing `GET /api/v1/models/:modelId/stories` list, story-spec-core-owned,
`story:read`): the **first step whose advance-gate is unsatisfied** — no
domains → `"template"` (Step 1; an empty model still gets the template
choice); ≥1 domain but no journeys → `"journeys"` (Step 3 — Step 2's
≥1-domain gate is already met); ≥1 journey but no activities →
`"activities"` (Step 4); activities but `storyCount === 0` → `"stories"`
(Step 5); else `"done"` → `ModelCanvas` renders the review canvas (ready
state) instead of the wizard, with "Edit in wizard" jumping to any step.
Unit-tested alongside the reducer.

### 3.5 Domain-patch request (`domainPatchSchema`) — FR-03, DR2-B-03

Also in `shared/src/schema/authoring.ts`, for the §4.9 edit-in-place route:

```ts
export const domainPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, {
    message: "at least one of name/description is required",
  });
export type DomainPatch = z.infer<typeof domainPatchSchema>;
```

Deliberately narrow: `name`/`description` only — no `attributes` (the wizard's
domain form has neither an attributes editor nor a requirement for one; keeping
`attributes` out avoids re-stating graph-core's replace-the-whole-map PATCH
semantic on a second surface) and no id/label fields (path-addressed).

## 4. Core logic

### 4.1 Step 2 — Domains via mwc's domain-attach route (FR-03, C-02)

The wizard **does not** create `Domain` nodes or write `IN_MODEL`. Step 2 calls
`model-workspace-core`'s existing `POST /api/v1/models/:modelId/domains`
(on disk: `api/src/routes/models.ts:295-296` → `handleModelDomainPost`; mapped
`model:write` at `api/src/auth/rbac-permissions.ts:266`) with
`{name, description?}`; the mwc route creates the `Domain` + its `IN_MODEL` edge
in one tx and returns the domain envelope. The returned `id` is pushed to
`committed.domainIds` and becomes the `PART_OF` anchor for Step 3 journeys.
Advancing Step 2 requires `committed.domainIds.length >= 1` (FR-03).

**Editing existing domains in place (FR-03, DR2-B-03).** Step 2 lists every
domain already in the active model (from a prior run or the FR-02 clone's
target domain) with an inline edit affordance; saving an edit calls the new
`PATCH /api/v1/models/:modelId/domains/:domainId` (§4.9, DD-08) with the
changed `{name?, description?}`. This is the **only** domain edit path in the
feature: `authoring/apply` excludes `Domain` by design (C-02), and graph-core's
generic `PATCH /nodes/:label/:id` requires `node:write`, which
`business_architect` deliberately does not carry
(`api/src/scripts/seed-rbac-roles.ts:92`).

### 4.2 Step 1 — Template choice + retail clone (FR-02, FR-08, XD-13, DD-04)

Exactly two options (XD-13): **Blank** and **Clone retail reference**.

- **Blank** → set `template="blank"`, advance to Step 2 with no pre-populated
  structure.
- **Clone retail reference** (`template="retail-clone"`) — implemented **only** via
  mwc's module-instantiation machinery (XD-13, NFR-02), in this order:
  1. **Ensure a target domain (C-01).** mwc's `POST …/module-instances` requires a
     **`targetDomainId`** validated `IN_MODEL` the model
     (`api/src/storage/modules.ts:520`). Since Step 1 precedes Step 2, the
     clone first calls `POST /api/v1/models/:modelId/domains` (§4.1) to
     auto-create (or let the user name) a **"Retail"** target domain, pushing its
     id to `committed.domainIds` (so it also appears, pre-listed and editable —
     via §4.9's domain PATCH (DR2-B-03) — in Step 2).
  2. **Discover the reference modules (DD-04).** `GET /api/v1/models` → the model
     with `isReference:true`; `GET /api/v1/modules` → filter to modules whose
     `sourceModelId` equals that reference model's id.
  3. **Instantiate each (DD-04).** For **every** discovered module, `POST
     /api/v1/models/:activeModelId/module-instances` with
     `{moduleId, targetDomainId}` (version omitted → latest). The action is
     count-agnostic (loops the catalog result), so AC-03 asserts "clone
     instantiates the reference module(s)" without a hard-coded count.
  4. Advance to **Step 3** with the cloned journey structure listed (read back via
     `GET …/authoring/graph`, §4.4).
  - **No published module** → the clone option is **disabled** with an explanatory
    affordance (not an error), per FR-08.
  - This spec touches **no** other module-lifecycle route (the
    `409 model_lifecycle_route_required` guard from mwc FR-08 stands, asserted
    intact by AC-09).

Re-running the wizard on an already-populated model **appends** (no destructive
reset): each step's create/instantiate is additive.

### 4.3 The authoring-apply endpoint (FR-07, C-03, C-04, RR-N-04)

`api/src/routes/authoring.ts` → `handleAuthoringApply(req, modelId)`:

1. **Auth** is already enforced by the central router gate (`model:write`, §5.2) —
   the handler contains **no** auth check (house rule, NFR-04).
2. **Model existence.** `MATCH (m:BusinessModel {id:$modelId})` — absent →
   `404 model_not_found` (envelope-level, not a per-row error).
3. **Parse** the body with `authoringApplySchema` → envelope failure `400
   invalid_payload` (mirrors `import`'s envelope behaviour). A node row carrying
   both `existingId` and `id` fails here (§3.1, DR-N-03).
4. **Mint ids + assemble the canonical import payload.** For each request node
   row:
   - `existingId` set → map `clientKey → existingId`; **no** import row (the
     global node already exists, FR-05).
   - `id` set → map `clientKey → id`; emit an import row with that id (re-run
     upsert, C-04).
   - neither → mint via **`generateId()`** (`api/src/ids.ts` — the storage
     layer's own UUIDv7 generator, `storage/nodes.ts:119`); map and emit.
   For each edge row, resolve `from`/`to` through that map (a token that is
   neither a known `clientKey` nor a UUID is a per-row error, surfaced as
   `invalid_payload` in `errors[]`); use the row's `id` if present else mint;
   emit an `import`-shaped edge row `{ id, type, fromId, toId }`. The assembled
   payload is exactly the `{ nodes: [{id,label,name,…}], edges:
   [{id,type,fromId,toId}] }` shape `importPayloadSchema` accepts. Its row
   order is the **canonical index space** every `errors[].index` refers to.
5. **Validate label + model scope of every referenced pre-existing id (DD-07
   as refined by DD-09; DR2-B-02, DR3-C-02, DR3-N-01).** Collect the set of
   **raw pre-existing UUIDs** the batch references: (a) edge endpoints
   supplied as raw-UUID tokens (not clientKeys resolving to rows in this
   batch), (b) node-row `existingId`s, (c) node-row re-run `id`s. One read
   query resolves each to its labels **and** its owning model(s), walking the
   same anchor chain `scopedNodeIds` walks:

   ```cypher
   MATCH (n) WHERE n.id IN $ids
   OPTIONAL MATCH (n)-[:PART_OF*0..]->(d:Domain)-[:IN_MODEL]->(m:BusinessModel)
   RETURN n.id AS id, labels(n) AS labels, collect(DISTINCT m.id) AS modelIds
   ```

   (`scopedNodeIds(getDriver(), modelId)` — mwc-owned,
   `api/src/storage/model-scope.ts:22`, consumed not re-implemented — remains
   the regime for the `authoring/graph` read and the AC-18 assertions; the
   per-id apply decision comes from this resolution query.) Then, for every
   referenced id that **exists**:
   - **Label check (DR3-N-01), all labels:** for an `existingId` or re-run
     `id` node row, the resolved `labels` must include the row's claimed
     `label` — mismatch → **per-row error** `invalid_payload` with
     `details:{ labelMismatch: [<id>] }`, row excluded. Without this,
     ``MERGE (n:`<claimed>` {id})`` on an id that exists under a *different*
     label would mint a **second node with a duplicate id**.
   - **Scope check (DD-09), model-scoped labels only**
     (`Domain`/`UserJourney`/`Activity` — mwc DEC-01; shared
     `Role`/`System`/`Location` are exempt):
     - `modelIds` contains `:modelId` → in scope; allowed.
     - `modelIds` non-empty but **without** `:modelId` → the node belongs to
       a **different** model: **per-row error** on every row referencing it —
       `invalid_payload` with `details:{ outOfModel: [<id>] }` (existing
       code, §5.3 — no new code); the row is **excluded** from the payload
       handed to `realImport`, so the cross-model edge/rename is **never
       written**. This is the same regime mwc's D-2 applies to
       `targetDomainId` (`api/src/storage/modules.ts:520-532`):
       `POST /models/A/authoring/apply` can neither attach a journey
       `PART_OF` model **B**'s domain nor MERGE-rename B's journey/activity
       (NFR-03, FR-12).
     - `modelIds` **empty** → a **no-model orphan** (e.g. a fresh node whose
       anchoring `PART_OF` edge row was rejected on a prior apply, or a
       phase-2 edge failure/crash stranded it): **allowed** — re-anchoring an
       orphan into the current model leaks nothing (it belongs to no model),
       and allowing it is exactly what keeps the echoed-id retry contract
       honest (DR2-C-03, DR3-C-02). A re-run `id` whose node does **not**
       exist at all is likewise allowed — MERGE on an absent id is a create.

   > **Design decision DD-09 — orphan-tolerant rejection semantics (refines
   > DD-07). Resolves: DR3-C-02 (review option (i)).** A rejected anchoring
   > edge row can leave its (valid, persisted) node row stranded as an
   > orphan in **no** model's scope. That state is fail-closed — invisible
   > to every model's reads, so NFR-03 holds — and now **recoverable**: the
   > test above rejects only provably-foreign ids, so the corrected retry
   > with the echoed ids re-anchors the orphan and it enters
   > `scopedNodeIds(:modelId)` (asserted as AC-18's recovery case, §8).
   > Option (ii) — additionally cascade-excluding new-node rows whose only
   > anchoring `PART_OF` edge row was scope-rejected — is rejected in §9: it
   > re-derives `realImport`'s phase-blame logic on the wrong side of the
   > seam, and the no-model allowance is needed anyway for phase-2
   > strandings that no request-side exclusion can prevent.

   Error `index`es use the canonical step-4 order; after `realImport` returns,
   its indexes (which refer to the filtered payload) are **remapped** to the
   canonical order via the kept filtered→canonical map, then merged with the
   scope/label-rejection errors (§3.2).
6. **Land it** by calling the **exported** `realImport(getDriver(), filtered)`
   (§4.7) — the same two-phase collect-and-continue writer `POST /api/v1/import`
   uses (`import.ts:82`), fed the scope-validated payload from step 5. It
   returns `{ imported, errors? }` verbatim (C-03). **Update semantics on a
   matched id (DR2-C-02):** `upsertNode`/`upsertEdge` MERGE on the id and
   **apply the submitted fields on match** — a re-run row with the echoed `id`
   and a changed `name`/`description`/`attributes` **updates** the persisted
   node (this is what makes FR-04/FR-05's "Add/**edit**" real for
   journeys/activities); asserted in AC-08's integration test (§8).
7. **Respond** `200` with `{ imported, errors?, ids }` (§3.2), where `ids.nodes`
   is the `clientKey → uuid` map (existing-id rows included so the client always
   has a resolvable id per key) and `ids.edges` is keyed
   **`"<type>:<from>-><to>"`** with the request tokens verbatim (DR-N-02 — the
   single canonical format, identical to §3.2). Ids are echoed for **all** rows,
   **including** rows that failed (scope-rejected or in `realImport`'s
   `errors[]`) — the retry contract is DR2-C-03 (§3.2). Per `import`'s pinned
   decision (C-09 in `import.ts`), the response is **200 even when 100% of rows
   fail** — row failures live in `errors[]`; `400` is reserved for the envelope
   parse failure in step 3 (AC-08).

**Idempotent re-submit (C-04, RR-N-04).** Because `import` MERGEs on the
supplied id, re-submitting the same step re-uses the `ids` the client kept from
the prior response: the wizard rebuilds each node/edge row with `id` = the
echoed UUIDv7 (reconstructing edge keys deterministically from the canonical
format), so the MERGE matches the existing node/edge and updates rather than
duplicating.

**No `IN_MODEL`, no new label/edge (NFR-01, NFR-02).** The assembled payload only
ever contains `UserJourney`/`Activity`/`Role` node rows and
`PART_OF`/`EXECUTES`/`PRECEDES` edge rows. `PART_OF` from a journey targets a
`Domain` **already** created + `IN_MODEL`-scoped by §4.1 (its UUID travels as
`to`), so the journey attaches under an in-model domain without this endpoint
ever writing the scoping edge (C-02). AC-20 asserts no compile-time schema array
was edited and no `createNodeLabel`/`createEdgeType` is called.

### 4.4 Model-scoped read for the canvas + step lists (FR-09, FR-12, NFR-03)

The canvas and the per-step "already-added" lists read the active model's
structure through mwc's `scopedNodeIds(driver, modelId)` regime
(`api/src/storage/model-scope.ts:22` — consumed, not re-implemented). A read
handler in `api/src/routes/authoring.ts` → `handleAuthoringGraph(req, modelId)`
(`GET /api/v1/models/:modelId/authoring/graph`, `model:read`) returns the
**id-based** `authoringGraphSchema` projection (§3.3, DR-C-01):

- `scopedNodeIds(modelId)` → the model's structural member set. **On disk the
  set holds the model's `Domain`/`UserJourney`/`Activity` ids *plus* its
  `ModuleInstance` pin ids** (`INSTANCE_IN`, `model-scope.ts:33` — DR3-N-02),
  so the projection **filters by label** (`Domain`/`UserJourney`/`Activity`)
  rather than trusting the set's composition. Shared
  `Role`/`System`/`Location` are **excluded** from the set by mwc design
  (DEC-01 (a)) but are still **read** and attached as layers via
  `EXECUTES`/`USES_SYSTEM`/`AT_LOCATION` from the in-scope activities.
- Per journey, `activities[].order` is server-computed: topological order over
  the journey's **intra-journey** `PRECEDES` edges; unordered ties fall back to
  `createdAt` ascending. **No column math on the server** — columns are the
  client mapper's job (§4.8).

> **Design decision DD-01 — a second read route vs. reuse graph-core reads.**
> graph-core's `query/*` reads (`getJourney`, `neighbors`) are **not** model-scoped
> and would leak sibling-model structure (NFR-03). mwc's
> `GET …/module-instances` returns instances, not a canvas projection. So this spec
> adds **one** model-scoped read route (`authoring/graph`, `model:read`)
> alongside its write routes. All new routes are model-scoped by the
> `:modelId` path param and the `scopedNodeIds`/`IN_MODEL` regime. This route
> is one of the DD-06 requirements-deviation items (§5.0, DR2-B-01) — the
> rev-2 review endorsed the direction ("do NOT remove the read route") and
> required only the paper trail. (Alternative — retrofit `?model=` onto
> graph-core reads — is explicitly out of scope per mwc design D-1.)

**Isolation (NFR-03, AC-18) — mechanized on both sides (DR2-B-02).** The
**read** side: `authoring/graph` projects only from `scopedNodeIds(:modelId)`
(above). The **write** side: `authoring/apply` uses `:modelId` for more than
the 404 check — §4.3 step 5 (DD-07/DD-09) rejects per-row every referenced
pre-existing `Domain`/`UserJourney`/`Activity` id that belongs to a
**different** model's scope (in-scope ids and re-anchorable no-model orphans
pass — DD-09), so a wizard run on model A can neither read nor mutate B's
**model-scoped** structure (no `PART_OF` into B's domain, no MERGE-rename of
B's journey). Both mechanisms are tested:
AC-18's integration test now covers the read **and** write sides (§8). Shared
`Role`/`System`/`Location` are legitimately cross-model (DEC-01 (a)) and are
**excluded** from the isolation assertion (AC-18 asserts A's
`Domain`/`UserJourney`/`Activity` are invisible to B, not its roles).

### 4.5 Step 4 — Activities × Roles, the XD-18 core (FR-05, B-01)

The key-activities-per-role authoring path:

1. Create an `Activity` (`authoring/apply` node row, `label:"Activity"`) and wire
   `PART_OF` to a chosen `UserJourney` (edge row `{type:"PART_OF", from:"<activity
   clientKey>", to:"<journey clientKey or id>"}`).
2. **Role — pick-or-create-global (B-01).** The role picker is the catalog
   `Typeahead` with `label="Role"` — its existing per-label interface
   (`pwa/src/components/Typeahead.tsx:20`) backed by the **existing** search
   read `GET /api/v1/query/search?label=Role&q=<term>` (`handleSearch`,
   `api/src/router.ts:459`) via the existing `api.search(label, q, limit)`
   client (`pwa/src/api.ts:94`). **No new read is added for the picker**
   (TR-N-03), but the search route is gated **`query:read`**
   (`rbac-permissions.ts:58`) — a fourth exercised permission family, recorded
   in §5.2 (DR2-C-01). Picking an existing role → node row with `existingId`;
   typing a new name → a `label:"Role"` node row (creates a **global** `Role`,
   DEC-01 (a)). A picked `Role` `existingId` is exempt from §4.3 step 5's
   scope assertion (shared label, DEC-01 (a)).
3. Wire `EXECUTES` (`{type:"EXECUTES", from:"<role clientKey or existingId>",
   to:"<activity clientKey>"}`). The registry validator enforces `Role → Activity`.
4. Optionally order two activities with `PRECEDES` (`{type:"PRECEDES",
   from:"<a0>", to:"<a1>"}`).

The persisted result is a `(:Role)-[:EXECUTES]->(:Activity)` edge whose **`Activity`
end ∈ `scopedNodeIds(activeModelId)`** (the `Role` end is global and excluded from
the set) — this is exactly what AC-06 round-trips as a real-Neo4j integration test.

### 4.6 Step 5 — Stories + ACs via story-spec-core (FR-06, C-05, RR-C-06)

All Step 5 persistence dispatches to **story-spec-core's existing routes**
(now on disk: `api/src/routes/stories.ts`) — this spec adds **no** story/AC
route (NFR-02):

- **Generate from graph** → `POST /api/v1/models/:modelId/stories/bootstrap`
  (`stories.ts:199-200`) with `{ activityIds: [<the wizard's activity ids>] }`.
  Returns `{ created: N, skipped: M }`. **Idempotency (C-05):** re-running on
  already-bootstrapped activities legitimately returns `created:0` — the wizard
  renders that as an **idempotent "already generated"** state surfacing both
  counts (e.g. "0 new, N already generated"), **not** an error (AC-07).
- **Manual create/edit** → `POST/PATCH /api/v1/models/:modelId/stories` and
  `.../acceptance-criteria`. Editing a derived story/AC clears its `derived`
  flag — a story-spec-core guarantee this view **surfaces**, not re-implements.

**Permissions exercised (RR-C-06).** All Step 5 calls map to **`story:write`**
(bootstrap, create, patch) / **`story:read`** (list) — on disk at
`api/src/auth/rbac-permissions.ts:282-287`. This spec **neither adds nor
re-maps** those rows. The `business_architect` role carries `story:read` +
`story:write`, so the persona is fully covered. §5.2 records all three
exercised permission families; **AC-10** (single id, DR-C-02) asserts a session
lacking `story:write` is 403'd on the Step 5 bootstrap call.

### 4.7 Exporting `realImport` — the reuse seam (FR-07, C-03, OQ-1 (a))

`api/src/routes/import.ts` currently exports only `handleImport` (line 66);
`realImport` (line 157) is private. This design **exports** `realImport` (add
`export` to its declaration) so `handleAuthoringApply` can call it in-process
with an assembled `{nodes, edges}` payload. No behaviour change to `import.ts`
— the function body, the `RowError` shape (`{section,index,code,message,
details?}`), the two-phase collect-and-continue logic, and
`POST /api/v1/import`'s own use of it are all untouched; the sole edit is the
`export` keyword. This is OQ-1's default (a): reuse the proven writer +
`errors[]` contract without an HTTP round-trip and without re-deriving
phase-1/phase-2 blame logic.

> **Rejected OQ-1 alternatives:** (b) extract a thinner `upsertNode`/`upsertEdge`
> seam — risks re-deriving the phase-1-failed-id blame set `realImport` already
> maintains (`phase1FailedIds`, import.ts:169); (c) HTTP-loopback to
> `/api/v1/import` — a self-call through the router gate, needless latency + a
> session-forwarding problem. Chose (a).

### 4.8 The `toJourneyData` mapper + canvas rendering (FR-09, DR-C-01, DD-05)

**DD-05 — the id→column seam is one pure client mapper; the canvas renders one
`JourneyCanvas` per journey in `chain` mode.**

The real `JourneyData` contract (`pwa/src/components/JourneyCanvas.tsx:37-45`)
is single-journey and **column-index-based**; `JourneyCanvas` takes `data:
JourneyData` (one journey) and internally implements only the `chain` and
`radial` layouts (branches at lines 622/630). The explorer's `"multi"` layout
mode is **not** a `JourneyCanvas` rendering at all — `JourneyGraph.tsx:679`
routes `"multi"` to a separate `MultiJourneyView` fed by
`loadAllJourneysWithDependencies`, an explorer-owned, **non-model-scoped**
loader. Reusing that path would leak sibling-model structure (NFR-03), so it is
**rejected** for the review canvas.

Pinned seam, in three parts:

1. **Mapper.** `pwa/src/views/model/authoring/toJourneyData.ts` (new, pure —
   no I/O):

   ```ts
   export function toJourneyData(graph: AuthoringGraph, journeyId: string): JourneyData
   ```

   - **Columns:** the journey's `activities` sorted by server-computed `order`
     (§3.3/§4.4); `column` = dense array index `0..n-1`. Build
     `activityId → column` for this journey.
   - **`activities`:** `ActivityNode { id, name, column }`.
   - **`roles`:** for each `graph.roles` entry whose `executesActivityIds`
     intersects this journey's activities → `RoleNode` with `columns` = the
     mapped columns (sorted ascending) and `durations: {}` (no SLA data in
     authoring scope). Roles with no execution in this journey are omitted.
   - **`systems` / `locations`:** same intersection via `usedByActivityIds` /
     `activityIds` → `SystemNode { usages: [{ column }] }` (no
     `target_ms`/`actual_ms`) and `LocationNode { columns }`. Empty arrays are
     legitimate in the `must` scope (the wizard authors neither edge type);
     cloned reference content renders through the same path.
   - **`precedes`:** each `graph.precedes` pair whose **both** ends map to this
     journey's columns → `PrecedesEdge { from_col, to_col }` (no SLA fields).
     **Cross-journey `PRECEDES` pairs are dropped** from the per-journey
     `JourneyData` — they are outside the single-journey lane model; rendering
     them as `cross_journey` chips is FR-10-tier canvas polish, deferred with
     the rest of `should`.
   - `crossDomainRelations` / `integrations` are omitted (optional fields).
2. **Rendering.** `ModelCanvas`'s ready state renders **one
   `<JourneyCanvas data={toJourneyData(graph, j.id)} layoutMode="chain" …/>`
   per journey**, stacked as journey lanes under domain/journey headers. It
   does **not** pass `layoutMode="multi"` (not a `JourneyCanvas`-implemented
   layout — it would fall through to the radial branch) and does **not** mount
   `MultiJourneyView` (non-model-scoped loader, above). This supersedes the
   passing "multi" mention in tasks rev 1 row DR-C-01/T-15 — the tasks
   artifact's own T-15 step ("renders one `JourneyCanvas data={…}` per
   journey") is the operative and consistent instruction.
3. **Verification.** The mapper has its own unit test
   (`pwa/src/views/model/authoring/__tests__/toJourneyData.test.ts`) that
   imports the **real** `JourneyData` type from `JourneyCanvas.tsx` (compile
   error if the contract drifts) and asserts: dense column assignment by
   `order`; role/system/location column resolution; `PRECEDES` id-pair →
   `{from_col,to_col}`; cross-journey pair dropped; role absent from a journey
   it doesn't execute in. AC-11's "renders on `JourneyCanvas` from
   `authoring/graph`" is pinned to this mapper + test (§8).

### 4.9 Domain edit-in-place — the model-scoped domain PATCH (FR-03, DR2-B-03)

> **Design decision DD-08 — how "existing domains … are editable in place"
> (FR-03) is implemented. Resolves: DR2-B-03.** Review option (i). The three
> candidate paths were all closed: `authoring/apply` excludes `Domain` from
> its label enum (C-02 — correct, kept); mwc's surface has no domain PATCH
> (`api/src/routes/models.ts` exposes only `POST /models/:id/domains`, line
> 296, and this spec must not edit that file, TR-C-01); graph-core's generic
> `PATCH /api/v1/nodes/:label/:id` maps to `node:write`
> (`api/src/auth/rbac-permissions.ts:43`), which `business_architect`
> **deliberately does not carry** (`seed-rbac-roles.ts:92` — "Deliberately NO
> node:write / edge:write"). So this spec adds a minimal model-scoped
> `PATCH /api/v1/models/:modelId/domains/:domainId` (`model:write`) as a
> **third arm in `registerAuthoringRoutes`** — sanctioned by the DD-06
> requirements deviation (§5.0). Option (ii) — descoping the must-FR clause
> to create-time naming — is rejected (§9).

`api/src/routes/authoring.ts` → `handleModelDomainPatch(req, modelId,
domainId)`:

1. **Auth** — central gate only (`model:write`, §5.2); no handler auth check
   (NFR-04).
2. **Parse** with `domainPatchSchema` (§3.5) → failure `400 invalid_payload`
   (empty body — neither field — fails the `refine`).
3. **Scope check (D-2 regime).** One query, the exact shape mwc uses for
   `targetDomainId` (`storage/modules.ts:521-525`):
   `MATCH (d:Domain {id:$domainId})-[:IN_MODEL]->(m:BusinessModel {id:$modelId}) RETURN d.id`.
   No match → **`404 not_found`** (existing generic code, `errors.ts:12`) —
   a domain that is absent and a domain scoped to a *different* model are
   deliberately indistinguishable (path-addressed resource; no cross-model
   existence leak, NFR-03). An absent **model** is reported first as
   `404 model_not_found` (same check order as the other two handlers).
4. **Delegate the write** to graph-core's existing storage primitive:
   `patchNode(getDriver(), "Domain", domainId, { name?, description? })`
   (`api/src/storage/nodes.ts:169` — partial dynamic SET; omitted fields are
   never clobbered; `attributes` is never passed so the attributes map is
   untouched). No new write logic, no `IN_MODEL` touch, `updatedAt` handled
   by `patchNode`.
5. **Respond** `200` with the patched node envelope `patchNode` returns.

The wizard's Step 2 edit affordance (§4.1) and the FR-02 clone's "pre-listed
and editable" target domain both call this route via a new `api.ts` client
method (§7). Journeys/activities need no such route — their edit path is the
id-set re-run row through `apply` (§4.3 step 6, DR2-C-02).

## 5. HTTP API surface

Three new routes, all under `/api/v1/`, zod-validated, `{error:{code,message,
details?}}` envelope, registered in `openapi.json` (FR-13). All template-clone,
domain-**create**, and story/AC calls go to **existing** upstream routes.

### 5.0 Requirements deviation — DD-06 (Resolves: DR2-B-01, with DR2-B-03)

> **Design decision DD-06 — this design ships three new endpoints; the
> approved requirements (rev 2) say "exactly one" in three places.** The
> deviation is recorded here explicitly — not silently — and is returned to
> the orchestrator as an **Open Question** to ratify as a requirements
> **amendment (revision 3)**. Silent off-spec drift is a known failure mode
> in this repo; this subsection is the paper trail.
>
> **Where the approved text and this design disagree:**
>
> | Approved requirements (rev 2) text | This design (rev 3) |
> |---|---|
> | FR-13: "this spec introduces exactly one new endpoint" | three: `apply` (write), `graph` (read), `domains/:domainId` PATCH (write) |
> | FR-14: "the **one new** route this spec adds … requiring `model:write`" | three rows: `apply` → `model:write`, `graph` → `model:read`, domain PATCH → `model:write` |
> | Scope Boundaries: "One new model-scoped authoring endpoint `POST …/authoring/apply`" | the same three routes, all model-scoped under `/models/:modelId/` |
> | FR-03: "existing domains … listed and editable in place" (no mechanism named) | mechanism = the new domain PATCH (DD-08, §4.9) |
>
> **Why each extra route exists:**
> - `GET …/authoring/graph` — FR-09's literal "read from graph-core reads
>   scoped to the active model" is unimplementable without leaking sibling
>   models: graph-core reads are not model-scoped, and retrofitting `?model=`
>   is pinned out of scope (mwc D-1). DD-01 (§4.4) holds; the rev-2 review
>   endorsed the direction and objected only to the missing paper trail.
> - `PATCH …/domains/:domainId` — FR-03's must-priority "editable in place"
>   has **no** existing permission-reachable path for `business_architect`
>   (DD-08, §4.9); without this route an executor hits a wall mid-Step-2.
>
> **Proposed amendment for requirements rev 3** (one pass, two FR rows +
> Scope Boundaries): FR-13/FR-14/Scope Boundaries change "exactly one new
> endpoint" to the three routes and permissions in §5.1; FR-03 names the
> domain PATCH as the edit-in-place mechanism. All AC ids stay unchanged;
> AC-04/AC-10/AC-18's *test artifacts* widen as specced in §8. Until the
> amendment is ratified, this design is `revised`, not `approved` —
> traceability tooling and AC-10's openapi assertion (§8) are written against
> the amended three-route contract so they cannot end up disagreeing with the
> requirements text they close.
>
> **Status (rev 4, 2026-07-05 — DR3-C-01, DR3-N-03):** requirements
> **revision 3 is authored** (`requirements.md` frontmatter `revision: 3`,
> `status: revised`, Revision History §rev-3) carrying the exact amendment
> table above **plus** the five-code FR-13 error list (`not_found` included,
> DR3-N-03), so the requirements text and §5.1/§5.3 now say the same thing.
> User **ratification is still pending**; execution stays blocked on it
> (tasks.md preconditions, review-design C-01).

### 5.1 Routes + router dispatch (TR-C-01, TR-C-02; route set per DD-06 §5.0)

| Method | Route | FR | Perm | Request → Response |
|--------|-------|----|------|--------------------|
| POST | `/api/v1/models/:modelId/authoring/apply` | FR-07 | `model:write` | `authoringApplySchema` → `200 { imported, errors?, ids }` (§3.2); envelope fail → `400 invalid_payload`; model absent → `404 model_not_found`; out-of-model referenced ids → per-row `invalid_payload` `{outOfModel}` (§4.3 step 5) |
| GET | `/api/v1/models/:modelId/authoring/graph` | FR-09 | `model:read` | → `200` `authoringGraphSchema` id-based model-scoped projection (§3.3/§4.4); model absent → `404 model_not_found` |
| PATCH | `/api/v1/models/:modelId/domains/:domainId` | FR-03 | `model:write` | `domainPatchSchema` (§3.5) → `200` patched domain envelope; model absent → `404 model_not_found`; domain absent or not `IN_MODEL` this model → `404 not_found` (§4.9) |

**Router integration** (corrected per TR-C-01/TR-C-02, verified on disk):
`api/src/router.ts` dispatches `models/*` through **sibling delegate blocks**,
not inline match arms — mwc's `registerModelRoutes` (router.ts:396-399, owned
by `api/src/routes/models.ts`) and story-spec-core's `registerStoryRoutes`
(router.ts:404-407, owned by `api/src/routes/stories.ts`), each returning
`Response | null` and falling through on `null`. This spec follows the same
pattern:

- `api/src/routes/authoring.ts` exports
  `registerAuthoringRoutes(method, sub, req): Promise<Response | null>` with
  exactly three arms:

  ```
  ^models\/([^/]+)\/authoring\/apply$    (POST)  → handleAuthoringApply
  ^models\/([^/]+)\/authoring\/graph$    (GET)   → handleAuthoringGraph
  ^models\/([^/]+)\/domains\/([^/]+)$    (PATCH) → handleModelDomainPatch  (§4.9, DR2-B-03)
  ```

  The third arm cannot collide with mwc: `registerModelRoutes`' domains arm
  is the **3-segment** `^models\/([^/]+)\/domains$` (POST only,
  `routes/models.ts:295-296`); the PATCH arm is 4-segment, a shape no mwc or
  stories arm matches.

- `api/src/router.ts` gains **one sibling delegate block**, placed after the
  stories block (reading order only):

  ```ts
  // business-model-authoring — /api/v1/models/:modelId/authoring/* (design §5.1)
  if (sub.startsWith("models/")) {
    const res = await registerAuthoringRoutes(method, sub, req);
    if (res) return res;
  }
  ```

- **`api/src/routes/models.ts` is NOT edited** (mwc-owned).
- **No ordering constraint** vs. the mwc/stories blocks (TR-C-02): all three
  authoring paths are 4 segments with literal second-or-third segments
  (`authoring`, `domains`) that no arm in `registerModelRoutes` or
  `registerStoryRoutes` matches at that segment count (mwc's parameterized
  arm is `^models\/([^/]+)$`; mwc's domains arm is 3-segment POST; the
  4-segment stories arms carry the literal `stories`), and all delegates
  return `null` on no-match.

### 5.2 Route-permission mapping (FR-14, RR-C-06, DR2-C-01)

The **only** `ROUTE_PERMISSIONS` rows this spec **adds** (`api/src/auth/
rbac-permissions.ts`) — an unmapped route silently skips the RBAC check
(the file's own SECURITY-CRITICAL note), so all three routes get rows.
Param-name style matches each row's nearest on-disk neighbor (DR2-N-03 —
matching is positional, names are cosmetic; the file already mixes styles):
the authoring rows use `:modelId` like the adjacent `module-instances`/
`stories` rows; the domain PATCH row uses `:id` like its sibling
`P("POST", "models/:id/domains", …)` at line 266:

```ts
P("POST",  "models/:modelId/authoring/apply", "model:write"),
P("GET",   "models/:modelId/authoring/graph", "model:read"),
P("PATCH", "models/:id/domains/:domainId",    "model:write"), // §4.9, DR2-B-03
```

**Permissions the feature exercises** (RR-C-06 — the full picture; only the
first three rows are mappings this spec owns; the rest verified on disk):

| Permission | Route(s) | Owned by | Carried by `business_architect`? |
|-----------|----------|----------|----------------------------------|
| `model:write` | `POST …/authoring/apply` (new) | **this spec** (adds the row) | yes (mwc FR-11) |
| `model:read` | `GET …/authoring/graph` (new) | **this spec** (adds the row) | yes (mwc FR-11) |
| `model:write` | `PATCH …/domains/:domainId` (new, FR-03) | **this spec** (adds the row) | yes (mwc FR-11) |
| `model:write` | `POST …/models/:id/domains` (FR-03) | mwc (`rbac-permissions.ts:266`) | yes |
| `module:write` | `POST …/module-instances` (clone, FR-08) | mwc (`rbac-permissions.ts:268`) | yes |
| `story:write` / `story:read` | `POST …/stories/bootstrap`, `POST/PATCH …/stories[/…/acceptance-criteria]`, `GET …/stories` (Step 5 + `resumeStep`) | story-spec-core (`rbac-permissions.ts:282-287`) | yes |
| `query:read` | `GET /api/v1/query/search?label=Role&q=…` (Step 4 role picker, §4.5) | graph-core/baseline (`rbac-permissions.ts:58`) | yes (`seed-rbac-roles.ts:108`) — **DR2-C-01** |

So a full `must` wizard run touches **four** permission families
(`model:*`, `module:write`, `story:*`, `query:read` — DR2-C-01), **all**
carried by `business_architect`. This spec adds **no** RBAC role or
permission, re-maps **no** existing route, and introduces **no** `public`
route (house rule, XD-08, NFR-04). Auth is enforced **only** by the central
router gate (`api/src/router.ts`) + `api/src/auth/`.

### 5.3 Error codes (FR-13, N-01)

The endpoints reuse **existing** `ERROR_CODES` — `invalid_payload`,
`attribute_violation`, `edge_endpoint_label_mismatch`, `model_not_found`,
`not_found` (all five verified present in `api/src/errors.ts`; `not_found` at
line 12). **No new error code is warranted**: every failure mode is an
existing code — envelope parse (`invalid_payload`), per-row validation
(`invalid_payload`/`attribute_violation`), per-row **out-of-model reference**
(`invalid_payload` with `details:{outOfModel:[…]}`, §4.3 step 5, DR2-B-02 —
consistent with mwc's D-2 use of `invalid_payload` for the same violation),
per-row endpoint mismatch (`edge_endpoint_label_mismatch`, from `upsertEdge`),
missing model (`model_not_found`), missing/out-of-model domain on the PATCH
(`not_found`, §4.9). Adding a code that no route can reach would fail the
envelope reachability test, so this spec adds none.

## 6. UI design

- **View tree placement (FR-01, FR-09, UX-06).** `#/model/canvas` → `ModelCanvas`
  (route verbatim from the blueprint View Tree; owner `business-model-authoring`).
  This spec **replaces** the `ModelTabPlaceholder` mwc registered for the `canvas`
  tab by swapping the `renderView`/`VIEWS` dispatch target in
  `pwa/src/views/index.tsx` (the `model` surface's `canvas` entry →
  `(r) => <ModelCanvas/>`). It does **not** edit `pwa/src/route.ts`/`SURFACES`
  (mwc owns them — the `canvas` tab is already registered).
- **Component plan (UX-02).** `ModelCanvas` and its wizard sub-components reuse
  catalog components first:
  - Wizard shell + step indicator: `Card` + token-styled `<ol>` step list; Next/Back
    are catalog `Button`s.
  - Step forms: native text inputs + catalog `Typeahead` (role picker with
    `label="Role"` backed by `api.search` — §4.5; journey-parent picker),
    `Modal` (create dialogs), `SidePanel` (node detail on the canvas).
    `Loading`/`ErrorState` from `pwa/src/views/_shared.tsx`. Step 2's domain
    list rows carry an inline edit affordance saving through the §4.9 domain
    PATCH (FR-03 "editable in place", DR2-B-03); journey/activity edits go
    through the id-set re-run row (§4.3 step 6).
  - Review canvas: the existing `JourneyCanvas` component — **one instance per
    journey, `layoutMode="chain"`**, fed by the `toJourneyData` mapper
    (§4.8, DD-05). No new canvas component is invented — the
    JourneyCanvas/react-flow patterns are reused (blueprint Risks row 6).
  - Story step: reuses the same story/AC editing affordances story-spec-core's
    `StoryCatalog` establishes; Step 5 embeds a compact create/edit form calling
    `api.stories.*` (story-spec-core's client block).
- **States (UX-01, FR-11).** All four on `ModelCanvas`:
  - **loading** (AC-12) — skeleton while `GET …/authoring/graph` for the active
    model is pending.
  - **empty** (AC-13) — active model has no domains/journeys → empty-state `Card`
    whose primary affordance **opens the wizard on Step 1 (Template)**.
  - **error** (AC-14) — a fetch or authoring write failed → `ErrorState` + a retry
    that refetches/re-submits and **does not discard** the in-progress wizard
    step's entered `draft` fields.
  - **ready** (AC-01/AC-11) — the wizard flow and/or the populated review canvas
    (per-journey `chain` lanes; roles/systems/locations as layers), with an
    **"Edit in wizard"** affordance that reopens the wizard at the relevant step.
- **Active-model + reload (FR-12, UX-06).** `ModelCanvas` reads the active model
  from mwc's shell-owned `useActiveModel()` (`pwa/src/context/
  ActiveModelContext.tsx`) — it does **not** re-implement model selection. With no
  active model it shows a pick/create-a-model prompt (linking `#/model/models`).
  Switching the active model refetches for the new model; deep-linking
  `#/model/canvas` + reload re-renders for the persisted active model (persistence
  is mwc FR-15; this view consumes it). Uncommitted `draft` fields are **not**
  restored across reload (committed graph state is) — FR-12 / OQ-3.
- **Tokens (UX-02, NFR-05).** All new CSS is tokens-only (`var(--…)` from
  `pwa/src/styles/companygraph/tokens.css` — the same path mwc/story-spec-core use).
  `scripts/design-conformance.ts` must pass in its enforced **`--view`** form
  (mwc D-5; the positional form is inert) on `ModelCanvas.tsx` + its
  `.module.css` + each wizard sub-component `.module.css` (AC-16). Desktop-first,
  no new breakpoints (UX-04).
- **Input modes / Native Conflicts (UX-03, UX-05).** The **wizard** introduces no
  new gesture/scroll/global-keyboard handler — native buttons + inputs + catalog
  `Typeahead`/`Modal`/`SidePanel` (whose focus-trap + Escape are reused, not
  re-implemented). Keyboard (AC-17): Tab reaches template options → step inputs →
  Next/Back in DOM order; per-step validation blocks Next with a **focusable**
  inline error; the view exposes an ARIA landmark and the step indicator announces
  the current step. The **canvas drag editing (FR-10, `should`)** is the only new
  gesture surface (AC-15): per the requirements' Native Conflicts table, canvas
  pointer/drag handlers `e.preventDefault()` **scoped to the pane** (not the
  document) so page scroll is not hijacked; pinch/wheel-zoom is contained to the
  canvas viewport; a **keyboard move-up/down equivalent** on a focused activity
  achieves the same `PRECEDES` reorder without a pointer (`JourneyCanvas`'s
  existing `onReorder` callback is the reuse seam). Touch-drag is deferred with
  the rest of FR-10 polish.

## 7. File Changes

The authoritative list. Every FR maps to ≥1 row; every row serves ≥1 FR.

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/authoring.ts` | new | FR-03, FR-07, FR-09, FR-13 | `authoringApplySchema` (+ inline `id?`, `existingId`/`id` mutual exclusion) + `authoringApplyResultSchema` + `authoringGraphSchema` + `domainPatchSchema` (§3.1–3.3, §3.5) |
| `api/src/routes/import.ts` | modify | FR-07 (C-03, OQ-1 a) | **export** `realImport` (line 157) — sole change is the `export` keyword; no behaviour change (§4.7) |
| `api/src/routes/authoring.ts` | new | FR-03, FR-07, FR-09 | `handleAuthoringApply` (§4.3, incl. the DD-07 scope-validation step 5), `handleAuthoringGraph` (§4.4), `handleModelDomainPatch` (§4.9, DR2-B-03), **`registerAuthoringRoutes`** delegate — three arms (§5.1, TR-C-01) |
| `api/src/router.ts` | modify | FR-03, FR-07, FR-09 | **one sibling delegate block** calling `registerAuthoringRoutes`, after the stories block; no edit to `routes/models.ts`; no ordering constraint (§5.1, TR-C-01/02) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-14, RR-C-06 | +3 rows: `…/authoring/apply`→`model:write`, `…/authoring/graph`→`model:read`, `…/domains/:domainId` PATCH→`model:write` (§5.2, DR2-N-03 style); no re-map |
| `api/src/routes/openapi.ts` | modify | FR-13 | register the three new paths (§5.1/DD-06) + their zod schemas |
| `pwa/src/views/index.tsx` | modify | FR-09 | swap the `model` surface's `canvas` dispatch → `<ModelCanvas/>` (replaces `ModelTabPlaceholder`) |
| `pwa/src/views/model/ModelCanvas.tsx` | new | FR-01,09,10,11,12, UX-01/02/05/06 | wizard shell + review canvas (per-journey `chain` `JourneyCanvas`, §4.8) + 4 states; reads `useActiveModel()`; FR-10 `should`-scope drag editing lands here via the `onReorder` seam (§6, DR2-N-01) |
| `pwa/src/views/model/ModelCanvas.module.css` | new | FR-11, NFR-05 | tokens-only |
| `pwa/src/views/model/authoring/wizardModel.ts` | new | FR-01, FR-12 | step types + reducer + `canAdvance` + `resumeStep` (§3.4, DR2-N-02); pure, no I/O |
| `pwa/src/views/model/authoring/toJourneyData.ts` | new | FR-09 (DR-C-01, DD-05) | pure id→column mapper into the **real** `JourneyData` (§4.8) |
| `pwa/src/views/model/authoring/TemplateStep.tsx` | new | FR-02, FR-08 | two-option picker; retail-clone orchestration (§4.2) |
| `pwa/src/views/model/authoring/DomainsStep.tsx` | new | FR-03 | calls mwc `POST …/domains` (§4.1); lists existing domains with inline edit → `PATCH …/domains/:domainId` (§4.9, DR2-B-03) |
| `pwa/src/views/model/authoring/JourneysStep.tsx` | new | FR-04 | journeys `PART_OF` a domain via `authoring/apply` |
| `pwa/src/views/model/authoring/ActivitiesRolesStep.tsx` | new | FR-05, XD-18 | activity×role×EXECUTES×PRECEDES; `Typeahead label="Role"` + `api.search` pick-or-create-global (§4.5) |
| `pwa/src/views/model/authoring/StoriesStep.tsx` | new | FR-06 | calls story-spec-core bootstrap + story/AC CRUD; idempotent "already generated" render (§4.6) |
| `pwa/src/views/model/authoring/wizard.module.css` | new | FR-11, NFR-05 | tokens-only; shared by wizard sub-components |
| `pwa/src/api.ts` | modify | FR-03, FR-07, FR-09 | `authoring.apply` + `authoring.graph` + `authoring.patchDomain` client methods; reuse the existing `json<T>` wrapper (role picker reuses the existing `search`, §4.5) |

**Consumed, not modified** (owned by upstream specs; this spec calls them —
all now verified on disk): mwc `POST /models/:id/domains`
(`routes/models.ts:295`), `GET /models`, `GET /modules`,
`POST …/module-instances`, `GET …/module-instances`, `ActiveModelContext`,
`scopedNodeIds` (`storage/model-scope.ts:22`); story-spec-core
`registerStoryRoutes` + `…/stories*` routes (`routes/stories.ts`);
`handleSearch` (`router.ts:459`) + `api.search`; `JourneyCanvas`, catalog
components, `tokens.css`, `design-conformance.ts`.

## 8. Test strategy

AC ids are the approved requirements ids verbatim — **AC-10 is one AC closed by
two artifacts** (DR-C-02; no `AC-10a`/`AC-10b`).

| AC | Kind | File / procedure |
|----|------|------------------|
| AC-01 | component (jsdom) | `pwa/src/__tests__/model-canvas.test.tsx` — `#/model/canvas`→`ModelCanvas` (not placeholder); wizard opens Step 1 reading `useActiveModel()`; no active model → pick/create prompt |
| AC-02 | component | `pwa/src/__tests__/model-canvas-template.test.tsx` — exactly two template options (no third asserted); Blank → Step 2, no structure |
| AC-03 | component (mocked module routes) | `pwa/src/__tests__/model-canvas-template.test.tsx` — Clone: discovers `isReference` model + its `sourceModelId` modules, `POST …/module-instances` per module (count-agnostic, DD-04), advances to Step 3; no published module → option disabled (not error) |
| AC-04 | integration + component | `api/__tests__/authoring-apply.integration.test.ts` (domain created via mwc `POST …/domains`, `IN_MODEL`-scoped, absent from sibling model; **edit-in-place**: `PATCH …/domains/:domainId` with a changed `name` → readback shows the new name, `description` untouched; PATCH targeting model B's domain through model A's path → `404 not_found`, domain unchanged — §4.9) + `pwa/src/__tests__/model-canvas-steps.test.tsx` (advance blocked until ≥1 domain, inline message; domain list row's edit affordance calls the PATCH) — **Resolves: C-02, DR2-B-03** |
| AC-05 | integration | `api/__tests__/authoring-apply.integration.test.ts` — `UserJourney` `PART_OF` a chosen domain; wrong pair → per-row `edge_endpoint_label_mismatch` in `errors[]`; advance needs ≥1 journey |
| AC-06 | integration (real Neo4j) | `api/__tests__/authoring-key-activity-per-role.integration.test.ts` — Activity + create/pick **global** Role + `EXECUTES` round-trips; asserts the persisted `(:Role)-[:EXECUTES]->(:Activity)` edge with the **`Activity` end ∈ `scopedNodeIds(modelId)`** (Role end global, excluded); `PRECEDES` order round-trips — **Resolves: B-01, XD-18** |
| AC-07 | component (mocked story routes) | `pwa/src/__tests__/model-canvas-stories-step.test.tsx` — bootstrap scoped to `activityIds`; derived story+AC appear editable; re-run → `{created:0, skipped:N}` renders **idempotent "already generated"** (counts surfaced), not error; manual story+G/W/T create via story routes; no story/AC route added — **Resolves: C-05** |
| AC-08 | integration + unit | `api/__tests__/authoring-apply.integration.test.ts` — lands via `realImport`; one bad row → `200 { imported, errors:[{section,index,code}] }` (valid rows persist, collect-and-continue, indexes in canonical assembled order); server-minted UUIDv7 echoed in `ids` **for every row including failed ones** (canonical edge keys, DR-N-02); re-submit with echoed ids upserts idempotently (no duplicate); **re-submit with an echoed `id` and a changed `name` → the persisted node reflects the new name (MERGE-update, DR2-C-02)**; **re-submit of a previously failed row with its echoed id → the node now exists (MERGE-on-absent-id creates, DR2-C-03)**; **a re-run `id` whose id exists under a *different* label → per-row `invalid_payload` `{labelMismatch}` and no duplicate-id node is created (DR3-N-01)**; a row with both `existingId`+`id` → `400 invalid_payload` (DR-N-03, schema unit test); no new label/edge; no `IN_MODEL` written — **Resolves: C-03, C-04, RR-N-04, DR2-C-02, DR2-C-03, DR3-N-01** |
| AC-09 | integration | `api/__tests__/authoring-template-clone.integration.test.ts` — clone uses only `GET /modules` + `POST …/module-instances`; a generic node/edge write to lifecycle state still → `409 model_lifecycle_route_required` (mwc guard intact). (Per tasks review TR-C-03 this file needs a named owning task — tasks phase.) |
| AC-10 | unit + integration (**one AC, two artifacts** — DR-C-02) | `api/__tests__/authoring-authz.test.ts` — no `model:write` → 403 on `…/authoring/apply` **and** on `PATCH …/domains/:domainId` (both this spec's `model:write` rows), with it → success; no `module:write` → 403 on `…/module-instances` (mwc mapping, asserted in force); **no `story:write` → 403 on `…/stories/bootstrap`** (widened per RR-C-06); `business_architect` carries all four exercised families (§5.2, incl. `query:read` — the full run's Step 4 `GET query/search` role-picker call succeeds, DR2-C-01) → full run succeeds; no route `public`. **Plus** `api/__tests__/authoring-openapi.integration.test.ts` — all **three** DD-06 routes (`…/authoring/apply`, `…/authoring/graph`, `PATCH …/domains/:domainId`) + their error codes appear in `GET /api/v1/openapi.json` (asserted against the amended three-route contract, §5.0) — **Resolves: DR2-B-01 (test side), DR2-C-01** |
| AC-11 | unit + component | `pwa/src/views/model/authoring/__tests__/toJourneyData.test.ts` (the DR-C-01 seam: real `JourneyData` type import; column assignment, role/system/location resolution, precedes mapping, cross-journey drop — §4.8) + `pwa/src/__tests__/model-canvas.test.tsx` (ready state renders one per-journey `chain` `JourneyCanvas` from `authoring/graph` via the mapper; "Edit in wizard" reopens at the relevant step) |
| AC-12,13,14 | component | `pwa/src/__tests__/model-canvas-states.test.tsx` — loading skeleton; empty → wizard Step 1; error → retry that refetches/re-submits and preserves in-progress `draft` fields |
| AC-15 (should) | manual | with the stack up + a populated model, load `#/model/canvas`, trackpad-drag an activity onto a new position — **expect** the `PRECEDES` order persists (re-fetch shows new order) and the page does **not** scroll under the drag; then keyboard-only focus an activity and press the documented move-up/down key — **expect** the same reorder persists |
| AC-16 | CLI | `bun run scripts/design-conformance.ts --view <file>` for **each** touched file under `pwa/src/views/` (`ModelCanvas.tsx`, `ModelCanvas.module.css`, each wizard `.tsx`/`.module.css`) — **expect** exit 0, zero token/component violations (enforced `--view` form, mwc D-5) |
| AC-17 | manual | load `#/model/canvas`, keyboard-only: Tab to a template option, Enter; Tab through Step 2 to "Next", Enter with an empty required field — **expect** Next blocked + focus moves to the inline error; complete the field + Enter — **expect** advance to Step 3 |
| AC-18 | integration + component | `api/__tests__/authoring-model-scope.integration.test.ts` — **read side**: model A run; `GET …/authoring/graph` for B returns none of A's `Domain`/`UserJourney`/`Activity`; a `Role` from A's run **is** visible to B by design — excluded from the assertion. **Write side (DR2-B-02)**: `POST /models/A/authoring/apply` with (a) a journey row whose `PART_OF` edge targets **model B's domain id** → per-row `invalid_payload` `{outOfModel:[…]}`, **no edge written** (B's structure unchanged); (b) a node row re-running **B's journey id** with a new name → per-row rejection, B's journey name unchanged (§4.3 step 5); **(c) recovery (DD-09, DR3-C-02): a batch whose anchoring `PART_OF` edge row was scope-rejected strands the new journey as a no-model orphan — retrying with the echoed ids and a corrected in-model domain anchor succeeds and the journey enters `scopedNodeIds(A)`**. Plus `pwa/src/__tests__/model-canvas.test.tsx` (switching active model resets/refetches) — **Resolves: B-01, DR2-B-02, DR3-C-02** |
| AC-19 | e2e | `pwa/playwright/model-canvas-context.spec.ts` — model B active, nav `#/model/canvas`, reload → same route renders `ModelCanvas` for model B; uncommitted wizard input not restored |
| AC-20 | CLI + manual | `bun run typecheck` exit 0; `git diff shared/src/schema/{nodes,edges}.ts` shows no additions; grep confirms no `createNodeLabel`/`createEdgeType` call in this spec's code |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`; the Playwright spec runs in the PWA e2e job.

## 9. Rejected alternatives

- **Authoring endpoint writes `Domain` + `IN_MODEL`** — duplicates mwc's
  `POST /models/:id/domains` (C-02) and re-implements the model-scoping regime.
  Rejected → `authoringApplySchema.label` is narrowed to exclude `Domain`; domains
  come from mwc's route (§4.1).
- **Bespoke template-copy path** — bypasses XD-13's module-instantiation machinery
  and lets templates drift from modules. Rejected → clone is `GET /modules` +
  `POST …/module-instances` only (§4.2, NFR-02).
- **Client-supplied node/edge ids** — `import` MERGEs on id, so client ids risk
  cross-client collision and break idempotency. Rejected → server mints via
  `generateId()` + echoes (rule 2, §4.3, C-04/RR-N-04).
- **HTTP-loopback to `/api/v1/import`** (OQ-1 c) / **thin upsert seam** (OQ-1 b) —
  a self-call through the gate / re-deriving the phase-blame set. Rejected → export
  and call `realImport` in-process (§4.7).
- **Retrofit `?model=` onto graph-core reads for the canvas** — out of scope per
  mwc design D-1; would touch graph-core-owned reads. Rejected → one
  model-scoped `authoring/graph` read route (§4.4, DD-01).
- **Server emits `JourneyData` (columns) directly** (DR-C-01 option b) — bakes a
  PWA component's column-index layout contract into a REST response; any canvas
  change becomes an API change. Rejected → id-based projection + one pure,
  unit-tested client mapper (§4.8, DD-05).
- **Reuse the explorer's `"multi"` mode / `MultiJourneyView` for the review
  canvas** — `"multi"` is not a `JourneyCanvas` layout (it routes to
  `MultiJourneyView` at `JourneyGraph.tsx:679`, fed by a non-model-scoped
  explorer loader — NFR-03 leak). Rejected → one `chain`-mode `JourneyCanvas`
  per journey (§4.8, DD-05).
- **Editing `api/src/routes/models.ts` to add the authoring arms** (rev-1 §5.1
  as misread) — mwc-owned file; TR-C-01. Rejected → sibling
  `registerAuthoringRoutes` delegate in `router.ts` (§5.1).
- **A new `authoring:write` permission** — structural authoring into a model is a
  `model:write`; the persona already carries it. Rejected → reuse `model:write`
  (FR-14).
- **Canvas direct-manipulation as `must`** — blueprint Risks row 6 caps it as
  `should`; making it `must` reopens the scope-explosion risk. Rejected → FR-10 is
  `should`, gated out of the `must` AC set (NFR-06).
- **Shipping the extra routes without a requirements paper trail** (rev 2's
  silent "exactly two" vs. the approved "exactly one") — the exact
  approved-artifact-drift class this repo has been burned by. Rejected → the
  DD-06 deviation subsection (§5.0) + an Open Question for the orchestrator to
  ratify requirements rev 3 (DR2-B-01).
- **Trusting syntactically valid UUIDs in `apply`** (rev 2's step 4 let any
  UUID through to `realImport`) — a cross-model write hole (attach a journey
  `PART_OF` model B's domain via A's endpoint; MERGE-rename B's nodes; silent
  out-of-scope orphans). Rejected → the DD-07 scope-validation step, §4.3
  step 5 (DR2-B-02).
- **Strict `scopedNodeIds`-membership rejection in step 5** (rev 3's DD-07 as
  written) — rejects a no-model orphan's echoed-id retry **forever** (an
  orphan is never in the set), deadlocking the DR2-C-03 retry contract in
  exactly the failure states retries exist for (DR3-C-02). Rejected → DD-09's
  orphan-tolerant test: only provably-foreign ids (member of a *different*
  model's scope) are rejected.
- **Creation-side cascade exclusion for orphan prevention** (DR3-C-02 option
  (ii)) — excluding new-node rows whose only anchoring `PART_OF` edge row was
  scope-rejected re-derives `realImport`'s phase-blame logic outside the seam
  (§4.7), and the no-model allowance is needed anyway for phase-2 edge
  failures/crashes that no request-side exclusion can prevent. Rejected →
  DD-09 (§4.3 step 5) + AC-18's recovery assertion (§8).
- **Descoping FR-03's "editable in place" to create-time naming** (DR2-B-03
  option (ii)) — weakens an approved must-FR clause to avoid one small route,
  and leaves the clone's auto-named "Retail" target domain unrenamable.
  Rejected → the §4.9 model-scoped domain PATCH (DD-08, option (i)).
- **Routing domain edits through graph-core's generic `PATCH
  /nodes/Domain/:id`** — mapped to `node:write`, which `business_architect`
  deliberately lacks (`seed-rbac-roles.ts:92`); granting `node:write` would
  hand the persona unscoped writes to every label. Rejected → the
  model-scoped, `model:write`-gated PATCH with the D-2 `IN_MODEL` check
  (§4.9).
