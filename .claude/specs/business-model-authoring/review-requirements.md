---
feature: "business-model-authoring"
reviewing: "requirements"
reviewing_revision: 3
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
---

# Review: business-model-authoring / requirements — revision 3 (pass 1/2)

Fresh cold review of `requirements.md` **revision 3** (the DD-06 amendment
authored 2026-07-05, awaiting user ratification). This pass supersedes the
prior on-disk review of revision 2. Rev 3's stated deltas — 1→3 routes
(FR-13/FR-14), the domain PATCH as FR-03's edit mechanism, the
`authoring/graph` projection replacing rev 2's unimplementable "graph-core
reads scoped to the active model", and the fold-in of C-06/C-07/C-08 — were
each independently re-verified against the blueprint, the dependency specs
(`model-workspace-core`, `story-spec-core`), the companion `design.md`
(DD-01/DD-06/DD-08/§5.0–§5.2), and the code now on disk. Every factual claim
checked out; findings below are consistency gaps inside the rev-3 text, not
errors of fact.

## Verdict

**approve** — zero blockers. Two concerns (one FR-07/AC-18 wording asymmetry,
one carried-forward clone-re-run gap) and three nits; none blocks ratification,
all are one-sentence fixes the ratification edit or the design re-review can
absorb.

## Blockers

None.

## Concerns

- **C-01 — FR-07's boundary-check enumeration is narrower than what AC-18(b)
  tests: the row's *own* re-used id is not covered.** FR-07 (C-08 clause)
  rejects "a row whose **referenced anchor/endpoint id** (`PART_OF`
  domain/journey anchor, `PRECEDES`/`EXECUTES` endpoint) is neither a member
  of `scopedNodeIds(:modelId)` nor created in the same batch". But AC-18(b)
  additionally asserts "a **node row re-using B's journey id** with a new name
  is rejected per-row" — that is the row's own `id`, not a referenced
  anchor/endpoint. Since the C-07 id-echo mechanism makes client-supplied ids
  legal on apply (re-submission "reuses the ids the client already holds"),
  and the underlying writer is MERGE-on-id, a literal implementation of
  FR-07's check as written would pass while AC-18(b) fails: the foreign node
  id would MERGE onto model B's journey and rename it. The design/tasks
  already carry the wider check (`existingId`/`id` mutual exclusion,
  tasks rev 2), so this is a requirements-text gap only.
  *Recommendation:* add one sentence to FR-07's C-08 clause: "the same check
  applies to a row's **own client-held id** — a node/edge id that is neither
  ∈ `scopedNodeIds(:modelId)` nor minted in this batch is rejected per-row
  (`invalid_payload`, `{outOfModel:[…]}`) before the MERGE."

- **C-02 — clone re-run semantics remain unspecified (carried forward from
  the rev-2 review's nit; two passes have now not addressed it).** FR-02:
  "re-running the wizard on an already-populated model appends rather than
  replacing". For the clone template, "appends" means a second "Clone retail
  reference" run creates **duplicate `ModuleInstance`s and duplicate cloned
  journeys** in the same model — `model-workspace-core` deliberately places
  no uniqueness on `(moduleId, targetDomainId)` (mwc design §3.4, line 360),
  so nothing upstream stops it, and unlike Step 5 (whose FR-06 explicitly
  requires the idempotent "already generated" rendering) Step 1 has no
  specified already-cloned state. The design's resolution ledger resolves
  OQ-2 (granularity, DD-04) but not this.
  *Recommendation:* mirror the FR-06 pattern in FR-02: when the active model
  already holds a `ModuleInstance` of a retail-reference module, the clone
  option shows an "already instantiated" affordance (disabled or
  confirm-to-duplicate — pick one) instead of silently double-cloning; assert
  it in AC-03's mocked-route test.

## Nits

- **N-01 — FR-14's line citation `rbac-permissions.ts:282-287` under-covers
  the rows the wizard exercises.** The story block on disk spans **282–291**;
  the Step 5 story `PATCH` (`models/:modelId/stories/:storyId` → `story:write`)
  sits at line 290, outside the cited range. Cite the block as 282–291 or drop
  the line numbers (they will drift anyway).
- **N-02 — route-param naming inconsistency in the new PATCH row.** mwc's
  existing row is `P("POST", "models/:id/domains", …)` (`:id`); this spec's
  new row will read `models/:modelId/domains/:domainId`. Harmless to
  `matchSegments` (segment-count match), but the mixed `:id`/`:modelId`
  spelling inside one route family is avoidable noise — design/tasks should
  pick one spelling for the new row and say so.
- **N-03 — FR-03's PATCH field set and validation are unstated at the
  requirements level.** AC-04 tests only "changed `name`, `description`
  untouched". Which fields are PATCHable (`name`/`description`/`attributes`?)
  and whether an explicit empty `name` is rejected (`invalid_payload`) is left
  entirely to design DD-08/§4.9. One clause in FR-03 ("partial
  `{name?, description?, attributes?}`; empty `name` rejected; omitted fields
  never clobbered per `patchNode`") would pin the contract where the FR lives.

## Prior findings (rev-2 review) — verified resolved in rev 3

| Prior finding | Where resolved | Verified |
|---|---|---|
| ~~C-06~~ (FR-14 omitted `story:write`) | FR-14 four-family enumeration + AC-10(c) `story:write`-403 assertion | resolved — story rows real at `api/src/auth/rbac-permissions.ts:282-291`; `business_architect` carries `story:*` (`seed-rbac-roles.ts:114-115`) and `query:read` (`seed-rbac-roles.ts:108`); `GET query/search` → `query:read` mapped (`rbac-permissions.ts:58`) and the search route takes a `label` param (`api/src/routes/query.ts:166-187`) |
| ~~C-07~~ (idempotent re-run needs id echo) | FR-07 "Id echo (C-07, rev 3)" — response returns minted `ids` for every row incl. failed; AC-08 round-trips it | resolved — design §3.2/§4.3/§5.1 `{ imported, errors?, ids }` |
| ~~C-08~~ (apply boundary scope check) | FR-07 "Boundary scope check (C-08, rev 3)" + NFR-03 + AC-18 write-side (a)/(b) | resolved for anchors/endpoints; own-id wording gap → **C-01** above |
| ~~N-04~~ (frontmatter pre-declared `approved`) | frontmatter now `status: revised` pending ratification | resolved |
| ~~N-05~~ (clone re-run) | not addressed in rev 3 | **still open → C-02** above |
| ~~N-06~~ (module identification filter) | design DD-04 (`sourceModelId` = reference model) | resolved at design level; requirements OQ-2 default consistent |

## Completeness / Traceability

| FR / NFR | Covered by | Status |
|----------|-----------|--------|
| FR-01 wizard shell, active model, step gating | AC-01, AC-13, AC-17 | pass |
| FR-02 template step (blank + clone, target domain) | AC-02, AC-03 | pass (clone re-run → C-02) |
| FR-03 domains via mwc route + new PATCH | AC-04 | pass (PATCH field set → N-03) |
| FR-04 journeys `PART_OF` | AC-05 | pass |
| FR-05 activities × roles, global `Role` (XD-18 core) | AC-06 | pass |
| FR-06 stories + ACs via story-spec-core, idempotent bootstrap | AC-07 | pass |
| FR-07 `authoring/apply` via import writer, id echo, boundary check | AC-04, AC-05, AC-08, AC-18 | pass (own-id wording → C-01) |
| FR-08 clone via module instantiation only, `module:write` | AC-03, AC-09 | pass |
| FR-09 ModelCanvas review via `authoring/graph` | AC-01, AC-11 | pass |
| FR-10 canvas direct manipulation (should) | AC-15 (should) | pass — correctly outside the must set (NFR-06) |
| FR-11 four view states + tokens/catalog | AC-11, AC-12, AC-13, AC-14, AC-16 | pass |
| FR-12 model scoping + reload survival | AC-18, AC-19 | pass |
| FR-13 three routes, zod, OpenAPI, reused error codes | AC-10 | pass — all five cited codes verified in `api/src/errors.ts` (lines 6, 10, 12, 24, 37) |
| FR-14 four-family permission mapping | AC-10 | pass (line citation → N-01) |
| NFR-01 no new schema/store | AC-20 | pass |
| NFR-02 reuse-never-re-spec | AC-07, AC-08, AC-09 | pass |
| NFR-03 model isolation, enforced at boundary | AC-06, AC-18 | pass (contingent on C-01 wording fix) |
| NFR-04 house rules | AC-10, AC-20 | pass |
| NFR-05 tokens/catalog/desktop-first | AC-16 | pass |
| NFR-06 wizard-first sizing | must/should AC partition (AC-15 only should) | pass |

Every AC (AC-01..AC-20) cites at least one FR; no orphan ACs, no uncovered FRs.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches an AC (requirements-phase check) | pass |
| Every AC is testable with a named artifact or `manual:` repro | pass — 15 test paths + 4 manual repros with input mode + observable outcome |
| Routes/views match the blueprint View Tree verbatim | pass — `#/model/canvas` → `ModelCanvas`, owner `business-model-authoring`, Model tab; no invented/renamed route; `route.ts` ownership stays with mwc |
| UX-* allowances covered in ACs | pass — UX-01 (AC-11..14), UX-02 (AC-16, NFR-05), UX-03 (both tables populated; AC-15/AC-17), UX-04 (NFR-05), UX-05 (AC-17), UX-06 (AC-19) |
| XD-* cross-cutting decisions honoured | pass — XD-01/02 (NFR-01/AC-20), XD-06 (NFR-03/AC-18), XD-08 (business_architect, FR-14), XD-09 (FR-06), XD-13 (FR-02/FR-08, module machinery only), XD-18 (FR-05/AC-06 as real-Neo4j integration test) |
| No file ownership conflict with another spec | pass — `views/index.tsx` `canvas` dispatch swap only (placeholder verified at `pwa/src/views/index.tsx:162`); `route.ts` untouched; new routes live in a sibling `registerAuthoringRoutes` delegate; the domain PATCH is a new route this spec owns, not an edit to mwc's file |

**Interfaces verified on disk this pass:** `realImport` private /
`handleImport` exported / `RowError {section,index,code}`
(`api/src/routes/import.ts:43,66,157-160`); all five reused error codes;
mwc + story-spec-core + query RBAC rows; `business_architect` grants incl.
`query:read` at exactly `seed-rbac-roles.ts:108` as cited;
`api/src/storage/model-scope.ts`; `useActiveModel`
(`pwa/src/context/ActiveModelContext.tsx:121`); `reactflow@^11.11.4`;
`JourneyCanvas.tsx`; `design-conformance.ts` `--view` enforced form;
`GET /api/v1/modules` (`module:read`) + `api/src/storage/modules.ts`.

## Summary

- **What's solid:** rev 3 is a disciplined amendment — the three-route reality
  (DD-06) is stated where the contract lives instead of hiding in the design;
  every "verified present" claim in the text is actually true on disk; the
  C-06/C-07/C-08 fold-ins keep requirements, design, and tasks saying the same
  thing; composition discipline (no new labels/edges/stores, every reused
  interface cited with its real owner) survived the amendment intact.
- **Common thread of the findings:** both concerns are places where an AC or a
  downstream artifact is *stronger* than the FR text (AC-18(b) vs FR-07's
  enumeration; design DD-04 vs FR-02's silence on re-clone) — the fixes are
  sentences, not redesigns.
- **Do first:** fold the C-01 own-id sentence into FR-07 during the
  ratification edit — it is the only finding touching the NFR-03 isolation
  guarantee; C-02 and the nits can ride the design re-review pass.
