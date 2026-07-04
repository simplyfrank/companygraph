---
feature: "ddd-system-modeling"
reviewing: "requirements"
artifact: ".claude/specs/ddd-system-modeling/requirements.md (revised, rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "2 of 2"
---

# Review: ddd-system-modeling / requirements.md (rev 2, pass 2)

Re-reviewed cold against the governing skill (`.claude/skills/spec-review/SKILL.md`),
the app blueprint (`.claude/specs/blueprint.md`, XD-01/05/06/08/15/17, View Tree,
UX-01..06), `.claude/CLAUDE.md`, the declared dependencies
(`model-workspace-core` requirements+design, `story-spec-core` requirements,
`system-augmentation-model` schema), and the live codebase
(`api/src/routes/ontology-bounded-contexts.ts`, `api/src/auth/rbac-permissions.ts`,
`api/src/errors.ts`, `api/src/storage/model-scope.ts`,
`shared/src/schema/system-kind.ts`, `pwa/src/components/{Card,DataTable,Pill,Modal,SidePanel}.tsx`).

This is pass 2 of at most 2. Rev 2 states it "addresses every finding in
`review-requirements.md` (pass 1)". I verified each pass-1 finding against reality
rather than accepting the changelog at face value.

---

## Pass-1 findings — disposition (all verified against reality)

### ~~B-01~~ → resolved (verified)
Pass 1 flagged that reusing `model-workspace-core`'s `IN_MODEL` edge for
`Capability → BusinessModel` collides with its lifecycle-edge guard. **Verified:**
`model-workspace-core` FR-08 (requirements.md:134) rejects any generic edge write
targeting a lifecycle edge type — `IN_MODEL` named first — with
`409 model_lifecycle_route_required`. Rev 2 registers a **new, spec-owned**
`CAPABILITY_IN_MODEL` (`Capability → BusinessModel`) edge type (FR-02d), written by
this spec's own capability-create tx (FR-04), with **no** touch to `IN_MODEL`
(NFR-01, AC-02 asserts no `Capability→BusinessModel` pair was added to `IN_MODEL`,
AC-21 asserts no const edit). This is clean ownership with no coordinated change to
the dependency. Correct resolution.

### ~~B-02~~ → resolved (verified)
Pass 1 flagged that the FR-06 note over-stated `scopedNodeIds`'s set and that
membership-through-`NEEDS_CAPABILITY`-source would silently drop a capability whose
only source is an orphan activity. **Verified:** `model-workspace-core` FR-18
(requirements.md:142) + design §4.2 define the set as `Domain`s linked `IN_MODEL`
+ their transitive `PART_OF*` descendants + `ModuleInstance`s, with
`System`/`Role`/`Location` **excluded** (DEC-01(a)); `story-spec-core` FR-08
confirms orphan activities are a real, contemplated state. Rev 2's mechanism note
(under FR-06) now restates the helper's actual set correctly and makes
`CAPABILITY_IN_MODEL` the authoritative membership key, written at create for
**every** capability including orphan-sourced ones; **AC-06b** proves the
orphan-sourced capability still appears. `scopedNodeIds` is retained (consumed, not
re-implemented) only to validate `needed-by` targets and compute the activity-side
gap analysis. Correct and load-bearing resolution.

### ~~C-01~~ → resolved (verified)
Pass 1 flagged name-keyed context relationships as insufficient for deep-linking.
**Verified:** `api/src/routes/ontology-bounded-contexts.ts` collects
`{ type: type(r), target: other.name }` — name-keyed. Rev 2 FR-09 runs this spec's
**own** Neo4j read resolving each `UPSTREAM_OF`/`DOWNSTREAM_OF` target to
`{ type, targetId, targetName }`; AC-08 asserts the far context's `id` is present.
Resolved.

### ~~C-02~~ → resolved
FR-03 (cardinality) and FR-08 (`USES_SYSTEM` reconciliation) are now recorded as
**DECIDED** under single-shot (XD-17, verified in blueprint:34 — "Mode:
single-shot"), no longer "orchestrator to confirm." OQ-1/OQ-2 in Risks are marked
CLOSED with the decision inlined. Resolved.

### ~~C-03~~ → resolved
Capability derivation/bootstrap is now a named out-of-scope line in Scope
Boundaries (closes OQ-3), with the rationale that a capability is a modeling
judgment (not a mechanical activity projection like `story-spec-core`'s bootstrap).
Resolved — it cannot creep in at design time.

### ~~C-04~~ → resolved (verified)
FR-11 now enumerates the full ordered `ROUTE_PERMISSIONS` list (1) `system-model/*`
literals, (2) `.../capabilities` collection, (3) capability sub-routes, (4) last the
parameterized `:capabilityId`. **Verified:** `api/src/auth/rbac-permissions.ts:319`
iterates `ROUTE_PERMISSIONS` first-match-wins, so the precedence is genuinely
load-bearing and the enumerated order is correct (more-specific before
less-specific). AC-09 asserts `:capabilityId` resolves correctly despite its
sub-routes. Resolved.

### ~~N-03~~ → resolved
NFR-07 now explicitly states the < 500 ms budget is a design/perf-hygiene target,
not AC-gated; the AC-gated obligation is the shape (bounded round-trips / no N+1).
Resolved.

N-01 (storage-module home) and N-02 (one-type-two-pairs vs two edge types) remain
correctly deferred to design as design items (Risks 7, 8); ACs are written to the
one-type default and hedge correctly.

---

## New findings (rev 2)

No new blockers. No new concerns. Two optional nits below.

### N-04 (nit) — `system_not_found` vs `model-workspace-core`/graph-core prior art
FR-10 adds `system_not_found` as a new additive code. `model_not_found` already
exists in `api/src/errors.ts:36` (FR-10 correctly says it is reused). Confirm at
design that `system_not_found` is not already introduced by a sibling wave-3 spec
touching systems before minting it, to avoid a duplicate-code enum assertion
failure — FR-10 already states "codes already in the enum are reused, not
duplicated," so this is a design-time grep, not a requirements gap.

### N-05 (nit) — FR-05 bounded-context existence check has no single-lookup route
FR-05 validates the `BoundedContext` exists on `PUT .../context`. The existing
bounded-contexts surface exposes only the list route (`GET
/api/v1/ontology/bounded-contexts`), no `GET /:id`. A direct `MATCH (:BoundedContext
{id})` suffices and NFR-04 (read-and-extend, no CRUD) permits a read; note for
design so it does not reach for a non-existent single-lookup route. Not a
requirements blocker.

---

## Completeness / Traceability

| FR | Covered by | Notes |
|----|-----------|-------|
| FR-01 Capability label (registry) | AC-01, AC-21; NFR-01 | Registry path verified feasible (story-spec-core/model-workspace-core prior art). Idempotent registration. Sound. |
| FR-02 mapping + scoping edges (registry) | AC-02 | Four edge types incl. spec-owned `CAPABILITY_IN_MODEL`; AC-02 asserts `IN_MODEL` untouched (B-01). Sound. |
| FR-03 cardinality (DECIDED) | AC-04 | Now settled under XD-17 (C-02 resolved). Many-to-many `SUPPORTED_BY` underpins AC-07. Sound. |
| FR-04 Capability CRUD | AC-03, AC-06b, AC-15 | Create writes `CAPABILITY_IN_MODEL` at birth; `404 model_not_found` on unknown `:modelId` (code exists, verified). Sound. |
| FR-05 mapping routes | AC-04 | Existence checks → `404 *_not_found`. BC single-lookup — N-05 (design detail). Sound. |
| FR-06 cascade + model-scoping note | AC-05, AC-06b | `DETACH DELETE` over `(cap)`; far-end nodes preserved. Scoping note now matches real `scopedNodeIds` (B-02 resolved). Sound. |
| FR-07 support-gap analysis | AC-06, AC-07, AC-11 | Four categories + augmentation mix; membership via `CAPABILITY_IN_MODEL` (B-02 correct). Sound. |
| FR-08 `USES_SYSTEM` reconciliation (DECIDED) | AC-06 | Dual-path coverage + `capabilityGaps` category; settled under XD-17 (C-02). Sound. |
| FR-09 context map | AC-08, AC-12 | Own read resolves relationship `targetId` (C-01 resolved). Reads bounded-contexts surface (verified). Sound. |
| FR-10 API contract / error codes | AC-09 | `capability_not_found`/`bounded_context_not_found`/`system_not_found` correctly absent from enum (additive); `model_not_found` reused (verified). N-04 design grep. Sound. |
| FR-11 route-permission mapping | AC-09 | Full ordered list enumerated; first-match-wins semantics verified (C-04 resolved). Central-gate-only auth. Sound. |
| FR-12 SystemModeler view | AC-10..AC-17 | Route `#/model/systems` verbatim (blueprint:86/97 verified); all four states; catalog components verified present; `Pill` reuse. Sound. |
| FR-13 detail + mapping editing | AC-13, AC-18 | Keyboard-reachable; detached indicator; inline aug-mix. Sound. |
| FR-14 model-scoped + reload survival | AC-19 | Consumes `useActiveModel()` (dep, expected wave-3 sequencing). Isolation via `CAPABILITY_IN_MODEL`. Sound. |
| FR-15 `systemKind` read-path repoint (should) | AC-20 | Scoped to "where SystemModeler touches system rendering." Sound. |
| NFR-01 registry-only | AC-21 | Consts frozen incl. no `IN_MODEL` pair (B-01). Sound. |
| NFR-02 model isolation | AC-06b, AC-09 | Rides `CAPABILITY_IN_MODEL`, not `scopedNodeIds` membership (B-02). Sound. |
| NFR-03 augmentation vocab reuse | AC-07, AC-20 | Import-only; module verified (`SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`/`systemKindSchema`). Sound. |
| NFR-04 bounded-contexts read-and-extend | AC-08 | Verified surface exists; no CRUD. Sound. |
| NFR-05 house rules | AC-21 | zod-only, loopback, central-gate auth, `/api/v1/`, en-US. Sound. |
| NFR-06 tokens/catalog | AC-17 | design-conformance gate. Sound. |
| NFR-07 perf | — | Non-AC-gated by design (N-03 resolved); shape is AC-gated via integration correctness. Sound. |

**AC coverage:** AC-01..AC-21 each trace to ≥1 FR/NFR; no orphan ACs. View states
loading/empty/error/ready → AC-14/AC-15/AC-16/AC-10-13. Platforms & Input-Modes and
Native-Conflicts tables present and populated with a defensible non-canvas
justification (Risk 4). Every AC carries a Platforms column and a Verification
artifact (test path or `manual:` repro with input mode + observable outcome).

**Done well:** every cross-spec claim is grounded in the real dependency contract
(the `IN_MODEL` lifecycle guard, `scopedNodeIds`'s actual set, the name-keyed
context-relationship shape, the first-match `ROUTE_PERMISSIONS` array, the reused
`model_not_found` code) — verified against the codebase, not asserted; the
route is verbatim from the View Tree; the spec-owned `CAPABILITY_IN_MODEL` edge is
a cleaner ownership model than the rev-1 `IN_MODEL` overload; the orphan-activity
membership gap is explicitly closed with a dedicated AC (AC-06b); decisions are
settled under single-shot rather than left nominally open.

---

## Verdict: approve

All four pass-1 blockers/concerns of substance (B-01, B-02, C-01, C-04) plus C-02,
C-03, and N-03 are resolved, and each resolution was verified against the actual
dependency contracts and live codebase, not merely against the changelog. No new
blockers or concerns surfaced. The two remaining nits (N-04 duplicate-code grep,
N-05 bounded-context single-lookup) are design-time hygiene, not requirements gaps.
The requirements are internally consistent, externally consistent with
`model-workspace-core` / `story-spec-core` / `system-augmentation-model` and the
blueprint (XD-01/05/06/08/15/17, View Tree, UX-*), and ready to proceed to design.
