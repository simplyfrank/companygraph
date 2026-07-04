---
feature: "business-model-authoring"
reviewing: "design"
artifact: "design.md (revision 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of 2"
---

# Design Review: business-model-authoring

Reviewed `design.md` (rev 1) cold against the approved `requirements.md`
(rev 2), `blueprint.md`, `.claude/CLAUDE.md`, the upstream dep specs
(`model-workspace-core`, `story-spec-core`), and the codebase. Every
load-bearing interface claim was checked against reality.

**Bottom line:** a strong, unusually well-traced design. All 14 FRs and all
20 ACs map to file changes and tests. Every upstream-interface claim I could
verify on disk is accurate. No blockers. Two concerns worth fixing in the
tasks phase, plus nits.

## Reality checks that passed (so the author gets credit where due)

- `import.ts`: `realImport` is indeed private at line 157; `handleImport` is
  the only export; return shape is `{ imported:{nodes,edges}, errors?:RowError[] }`
  with `RowError = {section,index,code,message,details?}` — exactly as §4.7 states.
  The `export` keyword is the sole edit needed. ✓
- The assembled edge shape `{ id, type, fromId, toId }` (§4.3) matches the real
  `edgeCreateSchema` in `shared/src/schema/edges.ts` (fields `fromId`/`toId`,
  `uuidv7` validators) that `edgeImportSchema` wraps. ✓
- `import`'s node row accepts `label: z.string().min(1)` (registry-permissive),
  so `UserJourney`/`Activity`/`Role` flow through without a compile-time change
  (AC-20). ✓
- `POST /models/:id/domains` → `model:write` and `POST …/module-instances` →
  `module:write` are present verbatim in `api/src/auth/rbac-permissions.ts`
  (lines 263/265) — the §5.2 "consumed, not re-mapped" claim is accurate. ✓
- `module-instances` requires `targetDomainId` and validates it is `IN_MODEL`
  the model (`api/src/storage/modules.ts:520`), confirming C-01 / §4.2's
  "ensure a target domain first" ordering. ✓
- `sourceModelId` + `isReference` exist (`modules.ts:229`, `models.ts:27`);
  `GET /api/v1/modules` (mwc design line 724, `module:read`) + `listModules`
  exist — DD-04's discover-and-loop is feasible. ✓
- Catalog components (`Typeahead`, `Card`, `Modal`, `SidePanel`, `Button`),
  `_shared.tsx` `Loading`/`ErrorState`, `scripts/design-conformance.ts`, and
  `JourneyCanvas` all exist on disk. ✓
- `ERROR_CODES` contains `invalid_payload`, `attribute_violation`,
  `edge_endpoint_label_mismatch`, `model_not_found` — §5.3's "no new code" holds. ✓
- The router `models*` dispatch block (`router.ts:391`, `sub.startsWith("models/")`)
  exists; adding `authoring/apply`/`authoring/graph` arms inside it (§5.1) follows
  the same pattern story-spec-core's design uses. ✓
- `story-spec-core` design's bootstrap route (`POST …/stories/bootstrap`),
  `story:write`/`story:read` mappings, and the `business_architect` grant of
  `story:*` are all present in that spec's design (lines 442–465) — the §4.6 /
  §5.2 citations are accurate to the *design* (the code is not yet on disk; this
  is the correct wave-3 build-order dependency, not a gap).

## Blockers

None.

## Concerns

### C-01 — §4.4 canvas projection shape does not match the real `JourneyData` contract

§4.4 says `authoring/graph` returns
`{ journeys:[{id,name,domainId, activities:[{id,name,order}], …}], roles:[…],
systems:[…], locations:[…], precedes:[…] }` and is "mapped into the `JourneyData`
interface client-side." But the real `JourneyData` (`pwa/src/components/JourneyCanvas.tsx`)
is **column-index-based, per-journey**:
`ActivityNode { id, name, column:number }`, `RoleNode { columns:number[],
durations:Record<column,number> }`, `SystemNode { usages:[{column,…}] }`,
`LocationNode { columns:number[] }`, `PrecedesEdge { from_col, to_col }`.
Roles/systems/locations reference activities by **column position**, not id, and
`JourneyData` is a **single journey's** lane model, not a `journeys[]` collection
(the multi-journey layout mode is a separate concern). The design's server shape
is reasonable, but the id→column mapping (assign columns, resolve each role's
executed columns, map `PRECEDES` id pairs → `from_col`/`to_col`, handle
cross-journey precedes) is nontrivial and entirely unspecified.

**Recommendation:** In the tasks phase, either (a) specify the client mapper
(`GET …/authoring/graph` response → per-journey `JourneyData`) as its own task
with its own DoD, or (b) have `authoring/graph` emit `JourneyData` (or a
`journeyId → JourneyData` map) directly so the client does a pass-through. Name
the layout mode used for multi-journey models (the canvas supports
`"multi"`). AC-11 currently asserts "renders … on JourneyCanvas from
authoring/graph" without pinning this seam — it will pass or fail on an
unspecified transform.

### C-02 — AC-10 was silently renumbered to AC-10a/AC-10b (approved-AC drift)

Requirements rev 2 (approved) defines a single **AC-10** covering both authz
(model:write / module:write 403s + business_architect) **and** the OpenAPI
assertion ("the authoring/apply route + any error codes appear in
`GET /api/v1/openapi.json`"). The design's §8 test table splits this into
**AC-10a** (authz, now also adding a `story:write` 403 assertion from C-06) and
**AC-10b** (OpenAPI), and §2/§4.6 reference "AC-10a" as if it were an approved
id. Renumbering/splitting an approved AC inside the design — and adding a new
sub-assertion (the story:write 403) — is requirements drift dressed as a design
detail. The added story:write coverage is *good*, but it changes the approved
AC set without an amendment note.

**Recommendation:** Either keep the id **AC-10** and note that the design widens
its assertion to include the story:write 403 (folding the C-06 resolution into
the existing AC), or explicitly record "AC-10 → split into AC-10a/AC-10b
(proposed requirements amendment)" so traceability tooling and the tasks author
don't see a phantom id. Right now `spec-traceability` will look for AC-10 and
find AC-10a/AC-10b instead.

## Nits

### N-01 — §3.1 schema is shown without the `id?` field, then patched in §4.3

The `authoringNodeSchema`/`authoringEdgeSchema` code block in §3.1 omits the
optional `id` field; §4.3's "Schema addendum" folds it back in. A reader who
copies §3.1 verbatim gets a schema that cannot support idempotent re-submit
(the whole point of rule 2 / N-04). Recommend inlining `id: z.string().uuid().optional()`
into the §3.1 block so it is correct as written, and dropping the addendum.

### N-02 — §4.4 edge-id key format is ambiguous vs §3.2

§3.2 says edge ids are keyed `"<type>:<fromClientKeyOrId>->:<toClientKeyOrId>"`
(note the stray `->:`), while §4.3 step 6 says `"<type>:<from>-><to>"`. Pick one
delimiter and use it in both places so the client can reconstruct keys
deterministically for re-submit.

### N-03 — `existingId` (§3.1) vs `id` (§4.3) both live on a node row

A node row can now carry `existingId` (pick-an-existing global Role, no import
row emitted) **and** `id` (re-run of a previously-minted node, import row emitted
with that id). These are different cases with opposite emit behaviour. §4.3
handles both, but the schema comments should state the precedence (if both are
present, which wins?) so the handler has no ambiguity. Minor — pin it in tasks.

## Completeness / Traceability

### FR → design coverage

| FR | Covered by | Status |
|----|-----------|--------|
| FR-01 wizard shell + step gating | §3.3 (`wizardModel.ts`, `canAdvance`), §6, File Changes | ✓ |
| FR-02 template choice + clone target-domain | §4.2 (ensure-domain → discover → instantiate) | ✓ |
| FR-03 domains via mwc route | §4.1 | ✓ (verified route exists, `model:write`) |
| FR-04 journeys PART_OF domain | §4.5 step 1 / §3.1 edge enum, File Changes (JourneysStep) | ✓ |
| FR-05 activities × roles, pick-or-create-global | §4.5, §3.1 (`existingId`), B-01 handling | ✓ (matches DEC-01(a)) |
| FR-06 stories via story-spec-core | §4.6 | ✓ (dep design cited accurately) |
| FR-07 batched authoring write | §3.1/§3.2/§4.3/§4.7 | ✓ (realImport reuse verified) |
| FR-08 clone via module instantiation | §4.2, DD-04 | ✓ |
| FR-09 ModelCanvas review surface | §4.4, §6, DD-01 | ⚠ see C-01 (projection seam) |
| FR-10 canvas direct-manip (should) | §6 Input modes, Native Conflicts | ✓ (gated should) |
| FR-11 four view states | §6 States | ✓ |
| FR-12 model-scoped + reload survival | §3.3, §4.4 isolation, §6 active-model | ✓ |
| FR-13 route in openapi, existing codes | §5.1, §5.3 | ✓ |
| FR-14 route-permission mapping | §5.2 | ✓ (no new perm, no re-map — verified) |
| NFR-01..06 | §3 intro, §4.3 no-IN_MODEL, §6 tokens/a11y, §9 | ✓ |

### AC → test coverage (§8)

| AC | Test artifact | Status |
|----|--------------|--------|
| AC-01,02,03,11 | model-canvas*.test.tsx | ✓ |
| AC-04,05,08 | authoring-apply.integration.test.ts | ✓ (real shape asserted) |
| AC-06 | authoring-key-activity-per-role.integration.test.ts (real Neo4j) | ✓ (XD-18 kept as integration, per Risk 5) |
| AC-07 | model-canvas-stories-step.test.tsx | ✓ |
| AC-09 | authoring-template-clone.integration.test.ts | ✓ |
| AC-10 | **renumbered → AC-10a + AC-10b** | ⚠ see C-02 |
| AC-12,13,14 | model-canvas-states.test.tsx | ✓ |
| AC-15 (should) | manual repro | ✓ |
| AC-16 | design-conformance `--view` | ✓ (enforced form) |
| AC-17 | manual keyboard repro | ✓ |
| AC-18 | authoring-model-scope.integration.test.ts | ✓ (Role excluded correctly) |
| AC-19 | model-canvas-context.spec.ts (e2e) | ✓ |
| AC-20 | typecheck + git diff + grep | ✓ |

**Gap:** AC-10 appears in the design only as AC-10a/AC-10b (C-02). Every other
approved AC is present with a matching id.

### Blueprint / house-rule conformance

- Route `#/model/canvas` + view `ModelCanvas` taken verbatim from the View Tree,
  owner `business-model-authoring`. ✓
- No new route outside `/api/v1/`; auth via central gate + `api/src/auth/` only;
  zod-only; no tsc; en-US identifiers. ✓
- Tokens-only + catalog-first + design-conformance `--view` (AC-16). ✓
- No new node label / edge type / store (NFR-01, AC-20). ✓
- XD-13 (clone via module instantiation, not bespoke copy) honoured. ✓

## Verdict

**approve** — zero blockers. C-01 (canvas projection seam) and C-02 (AC-10
renumbering) are real and should be resolved in the tasks phase; neither
requires a design re-review. Fold the C-01 mapper into its own task with a DoD,
and reconcile the AC-10/AC-10a/AC-10b numbering against the approved
requirements (as an amendment note or by keeping AC-10 and widening it).
