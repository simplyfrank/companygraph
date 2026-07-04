---
feature: "story-spec-core"
reviewing: "requirements"
artifact: ".claude/specs/story-spec-core/requirements.md (draft, rev 1)"
reviewer: "spec-review-agent"
verdict: "revise"
reviewed_at: "2026-07-04"
review_pass: "1 of 2"
---

# Review: story-spec-core / requirements.md

Reviewed cold against the governing skill (`.claude/skills/spec-review/SKILL.md`),
the app blueprint (`.claude/specs/blueprint.md`), `.claude/CLAUDE.md`, the declared
dependency `model-workspace-core` (requirements + design), and the live codebase
(`pwa/src/lib/userStories.ts`, `pwa/src/components/JourneyCanvas.tsx`,
`api/src/ontology/storage/{node-labels,edge-types}.ts`, `api/src/storage/edges.ts`,
`api/src/errors.ts`, `api/src/auth/rbac-permissions.ts`, `shared/src/schema/`).

This is a strong, house-format-fluent requirements doc: it correctly routes both
new labels + all four edges through the runtime registry (XD-01), keeps the
compile-time consts off-limits (NFR-01/AC-18), enforces structured Given/When/Then
at the boundary (XD-10/NFR-03), takes the route verbatim from the View Tree
(`#/model/stories` → `StoryCatalog`), specs all four view states, and populates the
Platforms/Native-Conflicts tables with a defensible "no new gesture" justification.
Naming was checked: no collision on the two labels, four edges, error codes, or the
`/stories*` routes.

It has, however, **two blocking traceability gaps** where the spec over-claims what
its dependency's helper actually delivers, plus concerns around parity feasibility
and an undecided cardinality dressed as decided-with-default.

---

## Blockers

### B-01 — Model-scoping via `scopedNodeIds` does not reach `UserStory`/`AcceptanceCriterion` nodes as claimed
FR-05, NFR-02, FR-14, and AC-08 all assert that story/AC list isolation is
"server-enforced by FR-05's `scopedNodeIds`" and that "a read for model A never
returns a story/AC that belongs to model B (via `scopedNodeIds`)."

But the dependency's helper (`model-workspace-core` design §4.2, FR-18) is defined
to return **structural** nodes only:

```
MATCH (m:BusinessModel {id:$modelId})
OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
OPTIONAL MATCH (d)<-[:PART_OF*0..]-(desc)   // journeys, activities, forked subtrees
OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
RETURN collect(...) AS ids
```

A `UserStory` attaches to its `Activity` via `DESCRIBES_ACTIVITY` (UserStory→Activity,
FR-03) and an `AcceptanceCriterion` via `ACCEPTANCE_OF` (AC→UserStory) — **neither is
`PART_OF` a Domain**, and neither is a `ModuleInstance`. So a story/AC id will
**never** appear in the `scopedNodeIds(driver, modelId)` set. Filtering stories by
`story.id IN scopedNodeIds(modelId)` therefore returns the empty set, not model A's
stories.

The isolation the spec wants is real and achievable, but the mechanism is
mis-stated: the story list must resolve **stories whose `DESCRIBES_ACTIVITY` target
`Activity` is in `scopedNodeIds(modelId)`** — i.e. the helper scopes the *activities*,
and the story query joins through the edge. That is a different (and more subtle)
query than "the story id is in the scoped set."

**Recommendation:** Restate FR-05/NFR-02/AC-08 so the isolation invariant is
"a story is in model A iff its `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(modelA)`;
an AC is in model A iff its parent story is." Add a note that stories/ACs are *not*
themselves members of `scopedNodeIds`. This also affects the cascade transaction
(FR-07) and bootstrap scope (FR-09), which likewise resolve through activities, not
through story-id membership. Leaving the current wording would send design down a
query that returns nothing.

### B-02 — AC-06 parity test compares two functions with structurally incompatible inputs, with no shared-fixture contract
AC-06 (and NFR-04) require a test where `deriveStories(fixture)` and
`formulateUserStories(fixture, journeyName)` run against **the same shared fixture**
and yield equal `narrative` strings.

Verified against source: `pwa/src/lib/userStories.ts::formulateUserStories(data:
JourneyData, journeyName)` consumes a **column-indexed** `JourneyData`
(`pwa/src/components/JourneyCanvas.tsx`): roles/systems/locations attach to
activities by shared **`column` numbers**, and "primary role" is
`roles.filter(r => r.columns.includes(activity.column))[0]` — order determined by
column membership. The server derivation (FR-08) reads a **Neo4j structural** shape
(`EXECUTES`/`USES_SYSTEM`/`AT_LOCATION`/`PART_OF` edges) that has **no column
concept** and no inherent role ordering.

These two functions cannot literally share one fixture object: one takes
`JourneyData{activities,roles[columns],...}`, the other takes a graph-read shape.
Risk #3 acknowledges the ordering hazard and defers "define a deterministic ordering"
to design — good — but AC-06 as written asserts a mechanism (one shared fixture fed
to both) that is not achievable until design defines (a) the deterministic
primary-role/location selection on the server side and (b) an explicit
fixture-mapping contract (how a `JourneyData` fixture projects to the graph read
shape, or vice versa) so "equal narratives" is a well-defined assertion.

**Recommendation:** Reword AC-06/NFR-04 to require a **parity harness with a defined
projection**: a single canonical structural fixture, a documented mapping to each
function's input shape, and a **specified deterministic tiebreak** (e.g. primary role
= lowest `createdAt` then `id`) that both sides honor. Without that, "faithful port"
and "equal narrative strings" are untestable, and NFR-04 becomes a promise design
cannot cash. (Note also: the client "primary role" is column-order-dependent and may
not be stable — the spec should state that *bit-for-bit* parity is against a fixture
constructed to make client column-order and server tiebreak agree, not against
arbitrary client input.)

---

## Concerns

### C-01 — OQ-1 ("exactly one story per activity") is an undecided cardinality dressed as decided; it drives an error code, an FR, and bootstrap idempotency
FR-03 says a story has "exactly one `DESCRIBES_ACTIVITY`" (story→activity side).
FR-10 lists `story_duplicate_for_activity` "if enforced — see FR-03." FR-09
idempotency ("never double-creates a story for an activity that already has one")
depends on the *reverse* cardinality (activity→story), which OQ-1 leaves open with a
"proceed default: manual create allows multiple stories per activity." This is the
kind of undecided dependency the review skill flags: whether the reverse is 1:1
changes (a) whether `story_duplicate_for_activity` is a live error path on `POST`
(FR-05) or dead code, (b) what AC-03/AC-07 assert, and (c) how the bootstrap
"skip if any story exists" is phrased.
**Recommendation:** Elevate OQ-1 to a decision recorded in the FR (not the risk
table). If the default (multiple manual stories per activity, bootstrap skips if
≥1 exists) stands, drop `story_duplicate_for_activity` from FR-10's *required* set or
mark it explicitly "reserved, not thrown under the default," and make FR-03 say
"exactly one *per story*, activity→story is 1..* " so FR-09's idempotency rule reads
against a defined cardinality.

### C-02 — `scopedNodeIds` / `scopedWhereFragment` / `ActiveModelContext` / `seed-rbac-roles` are consumed but do not yet exist on disk
The Dependencies section cites `api/src/storage/model-scope.ts`,
`pwa/src/context/ActiveModelContext.tsx`, and `ModelTabPlaceholder` as reused
surfaces. Confirmed against the codebase: none of these files exist yet — they are
**new** files owned by `model-workspace-core` (its design lists them as "new").
That is correct sequencing for foundation wave 2, and `model-workspace-core`'s
requirements FR-11/FR-15/FR-18 do promise them. But the spec should state the
**hard build-order dependency** explicitly (this spec cannot start implementation
until `model-workspace-core` lands those three surfaces + the `stories` placeholder
in `renderView`), since none is verifiable at author time.
**Recommendation:** Add a one-line "unblocked-by" note in Dependencies naming the
exact `model-workspace-core` FRs/files that must be merged first (FR-18 →
`model-scope.ts`; FR-15 → `ActiveModelContext.tsx`; FR-11 → `seed-rbac-roles.ts`
`business_architect`; FR-17 → `ModelTabPlaceholder` + `renderView` `stories` slot).

### C-03 — `formulateUserStories` requires a `journeyName` the server must resolve per-activity; FR-08 assumes one journey
FR-08 computes `benefit = "the <journeyName lower-cased> workflow completes"` and
the client signature is `formulateUserStories(data, journeyName)` — a **single**
journey name for the whole `JourneyData`. On the server an activity reaches its
journey via `PART_OF` (Activity→UserJourney), and a model has *many* journeys, so
`journeyName` is **per-activity**, not per-model. FR-08 says it reads "the parent
`UserJourney` via `PART_OF`" (good), but the parity claim (AC-06/NFR-04) passes a
single `journeyName` to the client — so the fixture must be one-journey to make the
strings agree. Also: what `benefit` results when an activity has **no** parent
journey (orphan activity)? Undefined here.
**Recommendation:** State the per-activity journey resolution in FR-08 and specify
the fallback benefit when an activity has no `PART_OF` journey (e.g. `"the workflow
completes"`), so derivation is total and the parity fixture's single-journey
constraint is explicit.

### C-04 — Pre-existing `userStoryKPI` link schema keys off "user story" but no `UserStory` label existed until now
`shared/src/schema/kpi-sla.ts` already defines a `userStoryKPI` link ("Links KPIs to
user stories"). Story↔KPI is correctly out of scope (→ `kpi-impact-mapping`), but the
existing link schema presumably references a story identity. This spec introduces the
first real `UserStory` node label. Whoever picks up `kpi-impact-mapping` will need
this spec's `UserStory.id` to be the join key.
**Recommendation:** Add a scope-boundary note that this spec's `UserStory.id` is the
identity `kpi-impact-mapping`'s existing `userStoryKPI` link will attach to; no change
here, but flag it so the downstream spec does not invent a parallel story id.

### C-05 — Cascade delete atomicity (FR-07) vs. the registry-backed edge validator's cross-type id-uniqueness scan
FR-07 requires deleting a story to remove its ACs + all four edge types "in a single
write transaction." That is achievable with `DETACH DELETE` over the story + its ACs.
No blocker — but the spec should confirm the delete path uses graph-core's
`DETACH DELETE`-style primitive (not per-edge `DELETE /api/v1/edges/:id` calls, which
would be N round-trips and non-atomic).
**Recommendation:** Note in FR-07 that the cascade is one Cypher `DETACH DELETE`
transaction over `(story)` + `(:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(story)`,
matching the graph-core cascade pattern, so "single transaction / no orphans" is a
storage-primitive guarantee, not a route-orchestration hope.

---

## Nits

### N-01 — FR-08 module path
FR-08 places the derivation at `api/src/storage/story-derive.ts`. The dependency's
scope helper lives at `api/src/storage/model-scope.ts`, so `api/src/storage/` is an
established home — consistent. Just confirm in design whether pure derivation belongs
under `storage/` (it does no I/O) or a `derive/`/`lib/` sibling; minor.

### N-02 — AC-15 verification is `manual:` for a CLI check that could be a test
AC-15 runs `scripts/design-conformance.ts` as a manual repro. Since it is a
deterministic CLI with exit code, it could be an automated check in CI rather than
manual. Not required at requirements stage; flag for tasks.

### N-03 — "four edge types it participates in" (FR-07) counts three types
FR-07 says a story participates in "all four edge types" but lists three
(`DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF`) — the "four" counts each
AC's `ACCEPTANCE_OF` as separate but there are only three *types*. Wording nit:
"all edges across its three participating types (`DESCRIBES_ACTIVITY`,
`STORY_FOR_ROLE`, and the `ACCEPTANCE_OF` from each AC)."

---

## Completeness / Traceability

Every FR maps to ≥1 AC and every AC back to ≥1 FR; view states are all covered.
Gaps flagged inline above.

| FR | Covered by AC | Notes |
|----|---------------|-------|
| FR-01 UserStory label (registry) | AC-01, AC-18 | OK — registry path verified in codebase |
| FR-02 AcceptanceCriterion label (G/W/T) | AC-01, AC-04, AC-18 | OK — NFR-03 enforcement point clear |
| FR-03 story→structure edges | AC-02 | **C-01**: reverse cardinality undecided |
| FR-04 AC→story edge | AC-02, AC-04 | OK |
| FR-05 Story CRUD | AC-03, AC-08 | **B-01**: scoping mechanism mis-stated |
| FR-06 AC CRUD | AC-04 | OK |
| FR-07 cascade + integrity | AC-05 | **C-05** atomicity note; **N-03** wording |
| FR-08 server derivation | AC-06 | **B-02** parity feasibility; **C-03** journeyName |
| FR-09 bootstrap endpoint | AC-07, AC-13 | idempotency depends on **C-01** |
| FR-10 API contract / error codes | AC-04, AC-09 | `story_duplicate_for_activity` gated on **C-01** |
| FR-11 route-permission mapping | AC-09 | OK — `ROUTE_PERMISSIONS` + `seed-rbac-roles` verified |
| FR-12 StoryCatalog view + 4 states | AC-10, AC-12, AC-13, AC-14, AC-15 | OK — route verbatim from View Tree |
| FR-13 detail + edit + AC editing | AC-11, AC-16 | OK |
| FR-14 model-scoped catalog + reload | AC-10, AC-17 | **B-01**: "no cross-model leakage … via scopedNodeIds" |
| NFR-01 registry-only, no const edits | AC-01, AC-02, AC-18 | OK |
| NFR-02 model isolation | AC-08 | **B-01** |
| NFR-03 structured-AC invariant | AC-04 | OK |
| NFR-04 derivation fidelity | AC-06 | **B-02** |
| NFR-05 house rules | AC-18 | OK — loopback/zod/no-tsc/central-gate all honored |
| NFR-06 tokens-only styling | AC-15 | OK |

Well done: XD-01/XD-02/XD-08/XD-09/XD-10 all honored; UX-01..UX-06 each mapped in the
UX conformance table; Platforms & Native-Conflicts tables present and justified;
routes taken verbatim from the frozen View Tree; no compile-time schema edits; no
per-route auth (central gate + `api/src/auth/` only).

---

## Verdict: revise

Two blockers (B-01 mechanism mis-statement on model scoping; B-02 untestable parity
assertion) must be corrected before design — both would send design down an
unimplementable path (an empty-set story query; a two-shapes-one-fixture parity test).
The five concerns are addressable in the same revision. On re-review (pass 2 of 2)
I will confirm B-01/B-02 are reworded and C-01's cardinality is decided in an FR;
the remaining concerns/nits can carry into design as recorded items.
