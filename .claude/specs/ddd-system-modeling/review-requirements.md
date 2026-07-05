---
feature: "ddd-system-modeling"
reviewing: "requirements"
artifact: ".claude/specs/ddd-system-modeling/requirements.md (rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-05"
review_pass: "cold review of rev 2 (the rev-1 review consumed the first pass; this is the second and final pass under the 1-review + 1-re-review cap)"
---

# Review: ddd-system-modeling / requirements.md (rev 2)

Cold review under `.claude/skills/spec-review/SKILL.md`, checked against
`.claude/CLAUDE.md`, the app blueprint (`.claude/specs/blueprint.md` —
XD-01/02/05/06/08/11/15/17, View Tree, UX-01..06), the dependency specs
(`model-workspace-core`, `story-spec-core`, `system-augmentation-model`), and
the live codebase. Every cross-spec and codebase claim below was re-derived
from its primary source, not taken from the artifact's changelog or from the
previously on-disk review.

**Process note:** the workflow invoked this as "pass 1", but a pass-1 review of
rev 1 (verdict *revise*) is what produced rev 2, and a review of rev 2 was
already on disk. This document supersedes the on-disk rev-2 review; findings it
first recorded that I independently re-verified are carried with their original
IDs (C-05, C-06, N-04..N-07) so IDs stay stable.

## Prior-finding disposition (rev-1 findings, independently verified)

- ~~B-01~~ → **resolved (verified).** `model-workspace-core` FR-08 rejects any
  generic edge write on lifecycle edge types (incl. `IN_MODEL`) with
  `409 model_lifecycle_route_required` — confirmed in
  `.claude/specs/model-workspace-core/requirements.md` FR-08. Rev 2's
  spec-owned `CAPABILITY_IN_MODEL` edge (FR-02d) sidesteps the collision with
  zero coordinated change to the dependency; AC-02/AC-21 assert `IN_MODEL` and
  the frozen consts stay untouched.
- ~~B-02~~ → **resolved (verified).** `model-workspace-core` FR-18 defines
  `scopedNodeIds` exactly as rev 2's FR-06 note restates it (`Domain`s linked
  `IN_MODEL` + transitive `PART_OF` descendants + `ModuleInstance`s and their
  forked-subtree nodes; `System`/`Role`/`Location` shared per DEC-01).
  Membership now rides `CAPABILITY_IN_MODEL`, written in the FR-04 create tx,
  so orphan-sourced capabilities cannot vanish; AC-06b proves it. One residual
  ambiguity in the FR-05 validation leg → new **C-08** below.
- ~~C-01~~ → **resolved (verified).**
  `api/src/routes/ontology-bounded-contexts.ts:22` really collects
  `collect(DISTINCT { type: type(r), target: other.name })` — name-keyed,
  exactly as FR-09 states. The spec's own read resolving
  `{ type, targetId, targetName }` is the right fix; AC-08 asserts the id.
- ~~C-02~~ → **resolved.** FR-03/FR-08 recorded as DECIDED under single-shot
  (XD-17, blueprint:172); OQ-1/OQ-2 closed with the decision inlined, not
  deferred.
- ~~C-03~~ → **resolved.** Capability derivation is a named out-of-scope line
  with rationale (manual-only authoring); cannot creep back at design time.
- ~~C-04~~ → **resolved, with the rationale overstated** → C-05 (carried).
- ~~N-03~~ → **resolved.** NFR-07's 500 ms budget is explicitly non-AC-gated;
  the AC-gated obligation is the bounded-round-trip shape.

## Findings

### Blockers

None.

### Concerns

- **C-05 (carried, re-verified) — FR-11's ordering rationale overstates the
  matcher semantics.** FR-11 claims "A row placed out of this order would let a
  sub-route resolve to the wrong permission." Verified against
  `api/src/auth/rbac-permissions.ts`: `matchSegments` (line 338) rejects on
  **segment count first** (`if (pattern.length !== path.length) return false`),
  and the file's own comment (lines 258–260) says ordering "only bites
  same-length literal-vs-param rows — kept as forward-proofing." The 4-segment
  `.../capabilities/:capabilityId` row can never shadow the 5/6-segment
  sub-routes, and the `system-model/*` literals cannot be shadowed either (the
  literal `capabilities` segment mismatches). The mandated order is harmless
  house convention, but the load-bearing claim is false for this route set.
  **Recommendation:** design keeps the enumerated order as convention and
  states the true matcher semantics so no task wastes effort "proving" a
  precedence the matcher makes moot; AC-09's assertion passes either way.
- **C-06 (carried, re-verified) — FR-05 introduces `PUT` where the API has
  none.** There is no `"PUT"` route anywhere in `api/src/router.ts` or
  `ROUTE_PERMISSIONS` today (grep-verified). Feasible — dispatch and
  `getRoutePermission` are method-generic — but there is zero prior art for
  PUT in router dispatch, the RBAC table, or the OpenAPI generator.
  **Recommendation:** design explicitly covers PUT in the dispatch arm, the
  RBAC rows, and verifies the OpenAPI generator emits `put` operations — or
  switches the idempotent mapping writes to `POST` if it can't. Do not leave
  this to task-time discovery.
- **C-07 (new) — `DELETE .../needed-by` is under-identified for a
  many-to-many edge.** FR-03 makes `NEEDS_CAPABILITY` many-to-many, yet FR-05
  specs a single `DELETE .../needed-by` "(removes it)" with no path parameter —
  unlike its sibling `DELETE .../supported-by/:systemId`, which names its
  target. With several needed-by sources, "it" is ambiguous; the only reading
  is a body-carrying DELETE, which is atypical and unprecedented in this API.
  AC-04's "each `DELETE` removes its edge" does not pin the shape either.
  Relatedly, the `PUT` body `{ activityId?, storyId? }` marks both optional
  with no exactly-one-of rule. **Recommendation:** design should (a) shape the
  delete as `DELETE .../needed-by/:sourceId` (mirroring `supported-by`), (b)
  add the corresponding row to FR-11's ordered `ROUTE_PERMISSIONS` enumeration
  (which currently lists `.../needed-by` without a parameterized variant), and
  (c) give the PUT body a zod exactly-one-of refinement
  (`activityId` XOR `storyId`).
- **C-08 (new) — FR-05's orphan-activity validation leg is undefined as
  written.** The FR-06 mechanism note says a `needed-by` target is valid if
  the activity is "∈ `scopedNodeIds(modelId)` **or**, for an orphan activity,
  one reachable from `:modelId` by the story-spec join." But `story-spec-core`
  NFR-02 resolves membership *through* `scopedNodeIds` (a story is in model A
  iff its `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(A)`), so an orphan
  activity — by definition outside `scopedNodeIds` — is not reachable by that
  join either; the second leg is vacuous as specified. The sound reading (and
  the one AC-06b actually exercises, since its orphan mapping is seeded, not
  created via FR-05): scope validation applies **at mapping time** against
  `scopedNodeIds`, and orphanhood is a *later* state (an activity un-parented
  after mapping) that `CAPABILITY_IN_MODEL` membership survives.
  **Recommendation:** design defines the FR-05 validation as
  scopedNodeIds-membership at mapping time only, drops or precisely defines
  the "story-spec join" leg, and AC-06b's test notes state how the orphan
  mapping comes to exist (direct graph seed or scoped-then-orphaned sequence).
  Not a blocker: the governing invariant (visibility rides
  `CAPABILITY_IN_MODEL`, FR-02d/NFR-02) is unambiguous and testable.

### Nits

- **N-04 (carried)** — FR-10 mints `system_not_found`; before design freezes
  the code list, grep sibling wave-3 specs so a duplicate enum entry doesn't
  trip the exhaustiveness assertion. (Verified absent from `api/src/errors.ts`
  today; `model_not_found` is present at line 37 to reuse.)
- **N-05 (carried)** — FR-05's `BoundedContext` existence check has no
  single-lookup route to lean on (only the list route exists); a direct
  `MATCH (:BoundedContext {id:$id})` read is fine under NFR-04. Design note.
- **N-06 (carried, re-verified)** — FR-10 cites "the `envelope.test.ts`
  reachability assertion"; no such file exists. The walk-every-code assertion
  lives in `api/__tests__/ontology-envelope.test.ts`. Cite the real path in
  design so task verification fields point at a real file.
- **N-07 (carried, process)** — the artifact frontmatter pre-declares
  `status: "approved"`. Status should be set by the workflow after the
  verdict, not by the artifact.
- **N-08 (new)** — FR-12 cites bare `tokens.css`; the real path is
  `pwa/src/styles/companygraph/tokens.css` (story-spec-core FR-12 already
  corrected this in its own text). Use the real path in design.
- **N-09 (new, positive-settling)** — Risk row 8 (N-02) defers "one edge type,
  two endpoint pairs" to design with a split-type fallback. Verified settled:
  `createEdgeType` natively takes `endpoints: ReadonlyArray<EdgeEndpointPair>`
  (`api/src/ontology/storage/edge-types.ts:58`), so the one-type default is
  supported and the fallback can be dropped from design consideration.

## Completeness / Traceability

| FR / NFR | Covered by | Verified against | Notes |
|----------|-----------|------------------|-------|
| FR-01 `Capability` runtime label | AC-01, AC-21 | `createNodeLabel` (`api/src/ontology/storage/node-labels.ts`); idempotence-by-code precedent real (`api/src/scripts/register-story-labels.ts` swallows `name_conflict` by code) | Sound; XD-01 names `Capability` explicitly (blueprint:156) |
| FR-02 four registry edge types incl. `CAPABILITY_IN_MODEL` | AC-02 | `createEdgeType` + `_OntologyEdgeEndpoint` rows; multi-pair endpoints native (N-09) | Sound; B-01 resolution clean |
| FR-03 cardinality (DECIDED) | AC-03 (exactly-one `CAPABILITY_IN_MODEL`), AC-04 | XD-17 single-shot (blueprint:172) | Sound; premise of AC-07 mix |
| FR-04 Capability CRUD | AC-03, AC-06b, AC-15 | `model_not_found` reusable (`api/src/errors.ts:37`); route pattern precedent `story-spec-core` FR-05 | Sound |
| FR-05 mapping routes | AC-04 | Router method-generic; **no PUT prior art → C-06**; delete shape → **C-07**; orphan leg → **C-08**; BC lookup → N-05 | Sound with concerns pinned for design |
| FR-06 cascade + scoping note | AC-05, AC-06b | `scopedNodeIds` set matches `model-workspace-core` FR-18 verbatim; `api/src/storage/model-scope.ts` on disk | Sound; B-02 resolution load-bearing |
| FR-07 support-gap analysis (4 categories + mix) | AC-06, AC-07, AC-11 | Blueprint feature-inventory scope line (blueprint:186) | Sound |
| FR-08 `USES_SYSTEM` reconciliation (DECIDED) | AC-06 | graph-core `USES_SYSTEM` real | Sound; `capabilityGaps` well-defined, no double-count |
| FR-09 context map, id-keyed relationships | AC-08, AC-12 | `ontology-bounded-contexts.ts:22` name-keyed shape confirmed | Sound; C-01 fix correct |
| FR-10 API contract / additive codes | AC-09 | New codes absent from enum (additive); reachability test path wrong → N-06 | Sound |
| FR-11 route permissions + ordering | AC-09 | First-match loop + segment-count-first matcher → **C-05**; `business_architect` seeded by `model-workspace-core` FR-11, `seed-rbac-roles.ts` on disk | Sound minus overstated rationale; C-07(b) touches the enumeration |
| FR-12 SystemModeler view | AC-10, AC-14..AC-17 | `#/model/systems` → `SystemModeler` verbatim (blueprint:105,116); placeholder real (`pwa/src/views/index.tsx:172`, `spec="ddd-system-modeling"`); catalog `Card`/`DataTable`/`Pill`/`Modal`/`SidePanel` + `scripts/design-conformance.ts` on disk | Sound; tokens path nit N-08 |
| FR-13 detail + mapping editing | AC-13, AC-18 | Catalog `SidePanel`/`Modal` exist | Sound |
| FR-14 model scoping + reload | AC-10, AC-19 | `pwa/src/context/ActiveModelContext.tsx` on disk; dep FR-15 persistence | Sound |
| FR-15 shadow-`kind` repoint (should) | AC-20 | `system-augmentation-model` STATUS.md (lines 169–182) assigns exactly this scope; `pwa/src/lib/journeyData.ts:189` legacy read confirmed | Sound; correctly scoped to "where it touches system rendering" |
| NFR-01 registry-only, no `IN_MODEL` touch | AC-21 | Frozen consts; lifecycle guard confirmed | Sound |
| NFR-02 model isolation via `CAPABILITY_IN_MODEL` | AC-06b, AC-09 | Membership key unambiguous | Sound (C-08 is the only fuzzy edge, validation-side) |
| NFR-03 vocabulary reuse | AC-07, AC-20 | `shared/src/schema/system-kind.ts:9–15` exports confirmed | Sound |
| NFR-04 bounded-contexts read-and-extend | AC-08 | Surface exists; no CRUD | Sound |
| NFR-05 house rules | AC-21 | zod-only, loopback, central gate, `/api/v1/` | Sound |
| NFR-06 tokens/catalog | AC-17 | design-conformance gate real | Sound |
| NFR-07 perf shape | — | Explicitly non-AC-gated (N-03 resolved) | Acceptable |

**AC coverage:** AC-01..AC-21 (incl. AC-06b) each trace to ≥1 FR/NFR; no
orphan ACs, no uncovered must-FRs. UX-01: loading AC-14, empty AC-15, error
AC-16, ready AC-10..AC-13. UX-02 → AC-17; UX-03 → n/a with recorded rationale
(Risk 4, non-canvas context map) and populated Platforms & Input Modes +
Native Conflicts tables; UX-04 → NFR-06; UX-05 → AC-18; UX-06 → AC-19. Every
AC carries a Platforms column and a concrete verification artifact; manual
repros (AC-17/18/20/21) state input mode + observable outcome.

**Done well:** the route is verbatim from the View Tree; all three dependency
contracts are cited by real FR numbers and match their sources exactly; the
spec-owned `CAPABILITY_IN_MODEL` edge is cleaner ownership than overloading
the dependency's guarded lifecycle edge; the orphan-membership gap has a
dedicated proving AC (AC-06b); former open questions are genuinely closed
under XD-17 rather than deferred; scope boundaries name an owner for every
exclusion.

## Verdict: approve

Zero blockers. Four concerns (C-05 matcher-semantics overstatement, C-06 first
PUT routes in the codebase, C-07 under-identified needed-by delete, C-08
vacuous orphan-validation leg) are design-phase obligations with concrete
recommendations recorded above; six nits are optional hygiene. The
requirements are internally consistent, traceable, and externally consistent
with the blueprint (View Tree route verbatim, XD-01/05/06/15/17 honoured, all
UX-* allowances covered) and with the real interfaces of
`model-workspace-core`, `story-spec-core`, and `system-augmentation-model`.
Ready for design, which must close C-05..C-08 explicitly.
