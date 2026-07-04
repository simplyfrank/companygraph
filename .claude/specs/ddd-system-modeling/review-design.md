---
feature: "ddd-system-modeling"
reviewing: "design"
artifact: "design.md (rev 1 — 2026-07-04, traces requirements rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of 2"
---

# Design Review: ddd-system-modeling

Reviewed cold against the approved `requirements.md` (rev 2), `blueprint.md`
(View Tree, UX-*, XD-*), `.claude/CLAUDE.md` house rules, and the on-disk
codebase. I verified every load-bearing claim in §3.1 and the DD-* table against
the real files.

## Summary

This is a strong, self-aware design. The four prior-review blockers/concerns
carried into the requirements (B-01/B-02/C-01/C-04) are each resolved in the FRs
**and** landed correctly in the design (DD-01/DD-02/DD-07/§4.8), and I confirmed
the key mechanisms against reality:

- **DD-01 verified** — `IN_MODEL` is in `LIFECYCLE_EDGES`
  (`api/src/storage/model-lifecycle-guard.ts:26`) and `CAPABILITY_IN_MODEL` is
  deliberately absent, so this spec's own membership edge never trips the
  `409 model_lifecycle_route_required` guard. B-01 is genuinely closed.
- **DD-02 verified** — `scopedNodeIds` (`api/src/storage/model-scope.ts:22-47`)
  returns exactly `Domain` + `PART_OF*` descendants + `ModuleInstance`s
  (System/Role/Location excluded), matching the design's statement to the letter.
  Resolving membership through `CAPABILITY_IN_MODEL` (not the source) correctly
  keeps orphan-sourced capabilities visible (AC-06b).
- **DD-04 verified** — `createEdgeType` accepts a multi-pair `endpoints` array and
  writes one `_OntologyEdgeEndpoint` row per pair
  (`api/src/ontology/storage/edge-types.ts:185`), so one-type/two-pair
  `NEEDS_CAPABILITY` is supported as designed.
- **DD-07 verified** — the bounded-contexts route collects
  `{ type: type(r), target: other.name }` (name-keyed, display-only) at
  `api/src/routes/ontology-bounded-contexts.ts`, justifying this spec's own
  `{type,targetId,targetName}` read. `bc.domain`/`bc.subdomain` are returned by
  that route and exist on the node, so the context-map read's field access holds.
- **C-04 precedence verified** — `matchSegments`
  (`api/src/auth/rbac-permissions.ts:309`) requires equal segment count and
  first-match-wins in `getRoutePermission` (line 322); the §4.8 ordered list and
  its precedence proof are correct. `P(...)` and `ROUTE_PERMISSIONS` exist as
  described (line 11 / 18).
- **`createEdge` signature verified** — `EdgeCreateInput` uses `fromId`/`toId`
  (`shared/src/schema/edges.ts:51-52`), exactly as §3.1 cites.

Every FR-01..15, NFR-01..07, and AC-01..21 (+06b) is addressed, and §9 maps all
22 ACs to a concrete test artifact. The build-order gating (§1.1) is honest:
`pwa/src/context/ActiveModelContext.tsx`, `pwa/src/views/model/*`,
`api/src/scripts/register-story-labels.ts`, and `business_architect` in
`seed-rbac-roles.ts` are indeed absent on disk today, and the design correctly
declares the spec cannot start until `story-spec-core` merges. That is correct
wave-3 sequencing, not missing scope.

No blockers. Verdict: **approve** with concerns to fold into the tasks phase.

## Findings

### Blockers

None.

### Concerns

**C-01 — §4.3 relies on a private `validateEdge`; the exported path exists but is
unnamed.** §4.3 says `capabilities.ts` "calls the shared endpoint validator
(`validateEdge`-equivalent lookup over `_OntologyEdgeEndpoint`, the same the
registry uses)" before each `MERGE`. But `validateEdge` in
`api/src/storage/edges.ts:38` is **module-private (not exported)**, and the File
Changes table (§8, line 734) lists `api/src/storage/edges.ts` under **"Not edited
(consumed)."** So the design as written has no concrete, in-scope call for the
MERGE-path endpoint check. The real exported primitive is `getEdgeEndpoints`
(`api/src/ontology/cache/edge-endpoints.ts:53`), which `validateEdge` itself uses.
*Recommendation:* name `getEdgeEndpoints(type, driver)` explicitly in §3.1's
interface table and in §4.3 as the endpoint-lookup the MERGE paths call (compare
the returned pair list against `(fromLabel,toLabel)`, throw
`edge_endpoint_label_mismatch` on miss) — or state that `validateEdge` will be
exported and add `edges.ts` to the File Changes table. As written, an implementer
would either re-implement the lookup or silently edit a "not edited" file.

**C-02 — §4.6 "detached" state is defined but not shown to be reachable/testable.**
The design correctly reasons that a Neo4j relationship cannot outlive either
endpoint, so `DETACH DELETE` on a far node removes the edge — meaning a literally
dangling `SUPPORTED_BY`/`NEEDS_CAPABILITY`/`ASSIGNED_TO_CONTEXT` edge "cannot
exist for graph-core-deletable nodes." It then redefines "detached" as covering
"an id reused, or a partial import" (a label no longer matching). But AC-13
asserts the view renders a "detached indicator," and §9's AC-13 test says
"detached indicator" — with no described way to *construct* the detached state in
a test. *Recommendation:* in the tasks phase, either (a) specify the exact fixture
that produces a label-mismatch/partial-import mapping so AC-13's detached branch
is exercisable, or (b) downgrade the detached indicator to a defensively-rendered
read-model field with a unit test on `getCapability`'s `detached[]` computation
(feeding a hand-built mismatched edge), rather than an end-to-end UI assertion.

**C-03 — §3.1 lists non-exported, in-place-edited symbols in the "verified
signatures / consumed interfaces" table.** `getRoutePermission`/`P`/
`ROUTE_PERMISSIONS` (row 8 of §3.1) are things this spec **edits in place** in
`rbac-permissions.ts`, not interfaces it imports; `P` and `ROUTE_PERMISSIONS` are
module-private. Mixing "consumed" imports with "edited in place" module internals
in one "consumed interfaces" table is mildly misleading for the implementer.
*Recommendation:* split the row, or annotate it "edited in place, not imported,"
so §3.1 stays a true list of import boundaries.

### Nits

**N-01 — §4.4 `orphanSystems` scope may under-count vs FR-07(c) wording.** FR-07(c)
defines orphan systems as "Systems referenced by this model's capabilities-**or**-
activities but mapped to no `Capability`." The §4.4 `orphanSystems` query only
traverses `(:Activity)-[:USES_SYSTEM]->(sys)` for scoped activities; a system
reached only through a capability's `SUPPORTED_BY` cannot be an orphan by
definition (it *is* mapped to a capability), so the activities-only traversal is
actually correct — but the "capabilities-or-activities" phrasing invites a reader
to expect a capability arm. Consider a one-line note that the capability arm is
vacuous for the orphan definition, to preempt a false "missing branch" flag in
re-review.

**N-02 — §4.4 augmentation-mix null bucket naming.** The design counts a
missing/invalid `systemKind` under "a `null`/`unknown` bucket surfaced in the
roll-up." AC-07 only asserts `{functional, agentic, ai_predictive}` counts; the
null bucket has no AC. Fine as defensive behavior, but name the bucket key
concretely (e.g. `unknown`) in the tasks phase so the zod `gapsResultSchema`
(§4.9) and the PWA render agree on the key.

**N-03 — §4.10 states the on-disk `"systems"` key collision explicitly (explorer
vs model surface).** Good catch by the author (line 543-544). No action; noted as
done-well.

## Completeness / Traceability

Every FR, NFR, and AC is addressed. Verified against the codebase where a claim
was load-bearing.

| Req | Design element | Status |
|-----|----------------|--------|
| FR-01 Capability label | §3.2, §4.6 `registerCapabilitySchema` | covered; registry-only verified |
| FR-02 mapping+scoping edges | §3.3, §4.6; DD-01/DD-04 | covered; multi-pair + own edge verified |
| FR-03 cardinality | §4.3, DD-06 (`MERGE` idempotent; at-most-one replace; exactly-one at create) | covered |
| FR-04 capability CRUD | §4.1, §4.2, §4.7, §5 | covered |
| FR-05 mapping routes | §4.3, §5; scopedNodeIds target validation | covered |
| FR-06 cascade + detached | §4.4 `DETACH DELETE`; §4.6 detached | covered — see **C-02** on detached testability |
| FR-07 support-gap | §4.4 `computeGaps` (4 categories + mix) | covered; bounded round-trips shown |
| FR-08 USES_SYSTEM reconciliation | §4.4 post-classify; DD-09 | covered — see **N-01** wording |
| FR-09 context map | §4.5 `computeContextMap`; DD-07 `{targetId}` | covered; name-keyed source verified |
| FR-10 openapi + error codes | §3.5, §4.9 | covered; 3 additive codes, reuse noted |
| FR-11 route-permission + RBAC | §4.8 full ordered list + precedence proof | covered; matchSegments verified |
| FR-12 SystemModeler view + 4 states | §4.10, §6 | covered |
| FR-13 detail + mapping editing | §4.10, §6 | covered — see **C-02** |
| FR-14 model-scope + reload survival | §4.10 (keys on `activeModel.id`) | covered |
| FR-15 systemKind read-path repoint | §4.11 | covered (scoped to what SystemModeler touches) |
| NFR-01 registry-only, no const edit | §3, §4.6, §8 "not edited"; AC-21 | covered; verified consts untouched |
| NFR-02 model isolation | §3.4, §4.1; DD-02 | covered; scopedNodeIds set verified |
| NFR-03 systemKind vocab reuse | §4.4, §4.11; AC-20 grep | covered |
| NFR-04 bounded-contexts read-only | §4.5, §8 | covered |
| NFR-05 house rules | throughout (loopback/zod/`/api/v1/`/en-US/central auth) | covered — see **C-03** table hygiene |
| NFR-06 tokens-only + catalog | §4.10, §6; AC-17 | covered |
| NFR-07 bounded round-trips | §4.4/§4.5 (no per-cap N+1) | covered; design/perf-hygiene target per N-03 |
| AC-01..21 (+06b) | §9 test map | all 22 mapped to a concrete artifact |

**Done well:** the DD-* table is genuinely traceable — every decision cites the
real on-disk symbol that backs it, and I confirmed the four highest-risk ones
(lifecycle-edge exclusion, `scopedNodeIds` set, multi-pair edges, name-keyed
bounded-contexts shape) are accurate. The C-04 route-permission precedence proof
is rigorous and matches `matchSegments`. The rejected-alternatives section (§7)
is substantive and ties each rejection back to a DD/B/C id.

## Verdict

**approve** — zero blockers. Fold C-01 (name the exported `getEdgeEndpoints`
endpoint-validation path, or add `edges.ts` to File Changes), C-02 (make the
"detached" state constructible/testable), and C-03 (§3.1 table hygiene) into the
tasks phase. No re-review of design required; the tasks reviewer should confirm
C-01/C-02 landed.
