---
feature: "ddd-system-modeling"
reviewing: "design"
artifact: "design.md (rev 3 — 2026-07-04, traces requirements.md rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-05"
review_pass: "1 of 2 (fresh cold review of rev 3; supersedes the on-file 2026-07-04 review — every finding independently re-verified against the codebase, not inherited)"
---

# Design Review: ddd-system-modeling (rev 3) — fresh cold pass

Reviewed cold against the approved `requirements.md` (rev 2, verdict approve),
`blueprint.md` (View Tree lines 105/116, XD-01/05/15/17, UX-01..06),
`.claude/CLAUDE.md`, and the on-disk codebase as of 2026-07-05. This pass did
**not** take the prior review's verifications on faith; every codebase claim
cited below was re-checked directly.

## Independently re-verified claims (all hold)

- `NODE_LABELS` (`shared/src/schema/nodes.ts`) has **18 entries** and contains
  no `BoundedContext`, no `UserStory`, no `BusinessModel` — DD-14's premise is
  correct, and so is the C-02 consequence below.
- `assertEndpointLabelsExist` (`api/src/ontology/storage/edge-types.ts:~150`)
  throws `type_pair_violation` when an endpoint label has no
  `_OntologyNodeLabel` row; `createEndpointRows` writes one
  `_OntologyEdgeEndpoint` per pair (multi-pair `NEEDS_CAPABILITY` is feasible).
- `seedBoundedContexts` (`api/src/ontology/seed.ts:~63`) MERGEs only data
  nodes — no registry row. DD-14's ensure-row-first fix is necessary and
  correctly ordered in §4.6.
- `scopedNodeIds` (`api/src/storage/model-scope.ts`) returns Domain +
  `PART_OF*0..` descendants + ModuleInstances only — DD-02's membership
  argument is sound. `LIFECYCLE_EDGES` (`model-lifecycle-guard.ts`) has no
  `CAPABILITY_IN_MODEL` — DD-01 holds.
- `matchSegments` rejects on segment count first; the SECURITY-CRITICAL
  unmapped-route-skips-RBAC comment is real (`rbac-permissions.ts:~258-263,
  ~338`); `getRoutePermission` compares `rp.method` as a plain string — the
  three `P("PUT", …)` rows need no matcher change (DD-10/DD-11). The §4.8
  13-row list is complete and arithmetic (4/5/6 segments) checks out.
- The router is method-generic; **no PUT route exists anywhere today**
  (grep `"PUT"` across `api/src/router.ts` + `api/src/routes/` — zero hits),
  so DD-11's "first PUT" framing and its explicit end-to-end test posture are
  exactly right. zod-to-openapi's `Method` union includes `'put'`
  (`openapi-registry.d.ts:21`).
- `getEdgeEndpoints` is exported (`api/src/ontology/cache/edge-endpoints.ts`),
  signature `(type, driverOverride?)` — DD-12 works without touching
  `edges.ts`.
- `errors.ts` contains none of the three new codes (additive, N-04 stands);
  `ontology-envelope.test.ts` walks every code (~line 29).
- `ontology-bounded-contexts.ts` emits `{type, target: other.name}` —
  name-keyed, DD-07's own-read justification stands.
- `DESCRIBES_ACTIVITY` is `UserStory → Activity`
  (`register-story-labels.ts:5`) — DD-15's story arm direction is right.
- `registerStorySchema`/`registerModelSchema` + `isNameConflict` swallow
  pattern exist as cited; `applySchema` (`bootstrap.ts`) already orders
  model → story registration.
- Blueprint View Tree: `#/model/systems` → `SystemModeler`, owner
  `ddd-system-modeling` — route taken **verbatim** (blueprint:105/116). The
  model-surface placeholder exists (`pwa/src/views/index.tsx` — now line
  **172**, see C-04). `useActiveModel` (`ActiveModelContext.tsx:121`),
  `Card`/`DataTable`/`Pill`/`Modal`/`SidePanel`,
  `Loading`/`ErrorState`/`NotFoundPanel` (`views/_shared.tsx`),
  `design-conformance.ts --view`, root `typecheck` + `register:model`/
  `register:story` script precedents — all present.
- `sAttrs.kind` legacy read at `pwa/src/lib/journeyData.ts:~189`;
  `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`/`systemKindSchema` in
  `shared/src/schema/system-kind.ts` (FR-15/NFR-03 feasible as designed).
- `business_architect` seeded in `seed-rbac-roles.ts` (~line 96) with
  deliberately no `node:write`/`edge:write` — consistent: SystemModeler's
  flows need only `capability:*`.
- `story-spec-core` design DD-12 exists — DD-17's accepted-risk precedent is
  real.

## Findings

### Blockers

None.

### Concerns

**C-01 — DD-14/DD-17 do not record that registering `BoundedContext` and
`Capability` opens the generic `/api/v1/nodes/:label` write surface to them.**
Verified: `parseRegistryLabel` (`api/src/routes/_helpers.ts:61`) gates the
generic node routes on registry membership (`400 unknown_label` at
`nodes.ts:34/46`), and neither label is in `LIFECYCLE_LABELS`
(`model-lifecycle-guard.ts:18-23`). Today `POST /api/v1/nodes/BoundedContext`
is rejected; after DD-14 it succeeds for any `node:write` session. Two
unrecorded consequences: (a) bounded-context **data-node** create/patch/delete
becomes generically reachable, while the requirements declare context CRUD out
of scope and NFR-04 frames the surface as read-and-extend; (b) a `Capability`
created via `POST /api/v1/nodes/Capability` carries zero `CAPABILITY_IN_MODEL`
edges, bypassing FR-03's exactly-one — DD-17 covers only the generic **edge**
surface. Degradation is benign in both cases (a model-less capability fails
every membership predicate and is invisible, not leaked; a hand-made context
behaves like a seeded one), and the posture matches the platform's own (every
runtime-registered label is generically writable — `UserStory` has the same
property). *Recommendation:* extend DD-17's degradation paragraph to the
generic node surface and add one acknowledging sentence to DD-14. Text-only;
no code decision changes. Tasks must not add a per-label node guard (that
would be a graph-core contract change, same reasoning as DD-17).

**C-02 — §9's AC-01/AC-02 fresh-registry recipe, as literally written, fails
before it can prove DD-14.** §9 says the tests run `registerCapabilitySchema`
against "wiped `_Ontology*` rows re-seeded from `NODE_LABELS`". Independently
confirmed: `NODE_LABELS` contains neither `UserStory` nor `BusinessModel`
(those rows come only from `registerStorySchema`/`registerModelSchema`).
Against a NODE_LABELS-only registry, the **first** `createEdgeType`
(`NEEDS_CAPABILITY`, `UserStory` pair) throws `type_pair_violation` — the test
fails for a reason unrelated to the B-01 fix it exists to prove. §4.6 already
pins the correct chain. *Recommendation:* amend the AC-01/AC-02 rows to:
fresh-registry setup = wipe `_Ontology*` → `seedRegistryFromConstTuples` →
`registerModelSchema` → `registerStorySchema` → `registerCapabilitySchema`
(the `applySchema` order); teardown re-runs `applySchema` so later integration
tests on the same Neo4j instance are not poisoned. Tasks must inherit this
recipe verbatim.

**C-03 — needed-by target-miss error codes conflict with FR-10's named reuse
targets.** FR-10 (requirements rev 2) says "`story_not_found`/`activity`-
scoping errors reuse `story-spec-core` / graph-core codes". Verified in
`api/src/errors.ts`: `story_not_found` (~line 52), `story_activity_not_in_model`
(~line 55), and — landed since this design was authored, via
`key-activity-optimizer` — `activity_not_found` (~line 64, thrown for exactly
this semantic: ":activityId is not a model-scoped Activity"). §3.5/§4.3 instead
map both needed-by misses to the generic `not_found` + `details.field`. AC-04's
integration tests will bake whichever choice into the v1 contract.
*Recommendation:* reuse `activity_not_found` and `story_not_found` for the
`PUT …/needed-by` target misses (they exist, they are semantically exact, and
FR-10 names the story one explicitly) — or, if generic `not_found` is kept,
add a DD recording why, so the deviation from FR-10's wording is deliberate
rather than an oversight. One-row edits in §3.5, §4.3, and the AC-04/AC-06b
fixtures; tasks phase can absorb it.

**C-04 — the router insertion point and several "verified on disk" line
anchors are stale because `key-activity-optimizer` landed after authoring.**
§4.7 instructs the capability block go "immediately after the story block
(before the `modules*` block)" and cites `router.ts:396-399/404-407` and the
placeholder at `pwa/src/views/index.tsx:165`. Verified today: the story block
is at ~`router.ts:408-415`, a `registerKeyActivityRoutes` block now sits
**between** the story block and `modules*` (~416-423), and the placeholder is
at `index.tsx:172`. The two halves of the instruction ("immediately after
story" vs "before modules") now denote different positions. Functionally any
position among the `models/*` delegate blocks works (delegates return `null`
for unowned paths and `capabilities*`/`system-model/*` do not overlap
`key-activities*`), but the instruction is load-bearing for a task author.
*Recommendation:* one revision-note line pinning the insertion point as "after
the **last** existing `models/*` delegate block (currently key-activities),
before `modules*`", and refresh or de-precision the drifted line anchors
(`index.tsx:165`→172, `router.ts:251/263/396-407`). Same fix applies to §4.10's
`index.tsx:165` citation.

### Nits

**N-01 — `capPathSystems = count(DISTINCT capSys) + count(DISTINCT storySys)`
double-counts a system reached via both arms** (§4.4(a)). Harmless — only
`> 0` is consulted — but add the one-line comment to the Cypher so an
implementer doesn't "fix" it into a cross-arm `DISTINCT` refactor mid-task.

**N-02 — AC-06b fixture step 1 is loosely worded.** "Create the activity
`PART_OF` a scoped domain" — `PART_OF`'s registered pairs are
`UserJourney→Domain` / `Activity→UserJourney` / `Location→Location`;
`Activity→Domain` would `400 edge_endpoint_label_mismatch`. The fixture needs
the `Activity→UserJourney→Domain` chain and step 4 orphans by deleting the
`Activity→UserJourney` edge. Spell the chain.

**N-03 — the detail read's `supportedBy[].systemKind: SystemKind` has no
defensive fallback, unlike the mix's `unknown` bucket.** §4.2 parses
`systemKind` off `attributes_json` "via `systemKindSchema`"; a pre-migration or
hand-seeded system with a missing/invalid kind would fail the response schema
on `GET …/capabilities/:capabilityId` while §4.4(d) deliberately tolerates the
same state. Align the detail read (default to `functional` per
`system-augmentation-model`'s migration default, or widen to
`SystemKind | "unknown"` matching the mix bucket).

**N-04 — the `createNodeLabel("BoundedContext", { json_schema_doc: {} })`
shorthand elides required fields.** `nodeLabelCreateSchema` requires
`description` (min 1) and `usage_example` (min 1), and the real signature is
`createNodeLabel(driver, input, actor)`. The design's pattern citation
(`register-story-labels.ts`) is correct and supplies all of these — just note
that the `BoundedContext`/`Capability` rows need real
`description`/`usage_example` strings (they surface in `GET /api/v1/schema`).

### Prior review findings (rev-2 pass, verdict revise) — status re-confirmed

- ~~B-01 (missing `BoundedContext` registry row → boot failure)~~ → **resolved**
  (DD-14 + §4.6 step 1; premise re-verified: no `BoundedContext` in
  `NODE_LABELS`, `seedBoundedContexts` writes data nodes only,
  `assertEndpointLabelsExist` throws on a missing row).
- ~~B-02 (story-mediated support arm missing)~~ → **resolved** (DD-15; §4.4(a)
  story arm with verified `DESCRIBES_ACTIVITY` direction; `describingStories`
  in payload/schema/fixture W).
- ~~C-01 (orphan-clause circularity)~~ → **resolved** (DD-16 — the circularity
  argument is sound; map-then-orphan fixture keeps AC-06b real-route-testable).
- ~~C-02 (generic-edge bypass)~~ → **resolved** (DD-17; precedent verified) —
  but see this pass's C-01 for the node-surface extension it still misses.
- ~~C-03 (PUT-route miscount)~~ → **resolved** (three everywhere; the only
  remaining "five" is the changelog line describing the correction).
- ~~C-04 (global orphanSystems)~~ → **resolved** (DD-18; per-model
  `NOT EXISTS`; cross-model AC-06 case).
- ~~N-01/N-02/N-03~~ → **resolved** (segment counts 4/5/6; list-`[]`-vs-404
  asymmetry pinned + tested both sides; DELETE-body precedent cited and real).

## Completeness / Traceability

| Req | Design element | Status |
|-----|----------------|--------|
| FR-01 Capability label, registry-only, idempotent | §3.2, §4.6, DD-03 | covered |
| FR-02 four edge types, registry-only, wrong-pair 400 | §3.3, §4.6, DD-01/DD-04/DD-14 | covered |
| FR-03 cardinalities (m:n, at-most-one, exactly-one) | DD-06, §3.3, §4.3, DD-17 | covered — **C-01**: node-surface bypass of exactly-one not yet recorded |
| FR-04 model-scoped CRUD + create-tx membership + 404s | §4.1, §4.2, §4.7, §5 | covered (list-[]-vs-404 asymmetry pinned + AC-03) |
| FR-05 mapping routes + target validation | §4.3, §5, DD-12, DD-16 | covered — **C-03**: miss-code choice vs FR-10 wording; DD-16 deviation from the FR-06 note's orphan clause is recorded + justified |
| FR-06 cascade + detached indicator | §4.4 (DETACH DELETE), §4.6, DD-13 | covered |
| FR-07(a)(b)(d) gaps + augmentation mix | §4.4, DD-15, DD-09 | covered — **N-01** comment pending |
| FR-07(c) orphan systems | §4.4(c), DD-18 (+ vacuous-arm note) | covered |
| FR-08 USES_SYSTEM reconciliation + capabilityGaps | DD-09, §4.4 post-classification | covered |
| FR-09 context map w/ `targetId` + unassigned bucket | §4.5, DD-07 | covered |
| FR-10 /api/v1/ + zod + openapi + additive codes | §3.5, §4.9, DD-11 | covered — **C-03** on code selection |
| FR-11 ROUTE_PERMISSIONS order + business_architect | §4.8, DD-10 | covered — 13 rows enumerated; no-silent-open asserted per route |
| FR-12 SystemModeler @ `#/model/systems`, 4 states | §4.10, §6 | covered — route verbatim vs View Tree (blueprint:105/116) |
| FR-13 detail + mapping editing + detached | §4.10 | covered |
| FR-14 model scope + reload survival | §4.10 | covered |
| FR-15 systemKind repoint (should) | §4.11, §8 conditional row | covered, correctly scoped to touched paths |
| NFR-01 no compile-time const edits | §4.6, §8 not-edited list, AC-21 | covered |
| NFR-02 isolation via CAPABILITY_IN_MODEL | DD-02, §3.4, §4.1, DD-17/DD-18 | covered |
| NFR-03 vocabulary reuse | §4.4(d), §4.11, AC-20 | covered — **N-03** detail-read fallback |
| NFR-04 contexts read-and-extend | DD-07, DD-14, §4.5 | covered — **C-01** acknowledgment pending |
| NFR-05 house rules (zod-only, central gate, /api/v1/, no tsc, en-US) | §3, §4.7, §4.8, §5 | covered — no per-route auth anywhere; en-US identifiers throughout |
| NFR-06 tokens + catalog + conformance | §4.10, §6, AC-17 | covered |
| NFR-07 bounded round-trips | §4.4 (4 queries), §4.5 (2 queries) | covered — no N+1 |
| UX-01 view states | §4.10/§6 (all four specced, AC-14/15/16/10-13) | covered |
| UX-02 tokens/catalog | §6 component plan (all five components verified to exist) | covered |
| UX-03/Native Conflicts | §6 — grouped list, no canvas/gesture/global-keyboard | covered |
| UX-04 desktop-first | NFR-06 inheritance, no new breakpoints | covered |
| UX-05 a11y | §4.10 (landmark, tab order, focus trap reuse, text-not-color) | covered |
| UX-06 routes verbatim + reload | §6, §4.10, AC-19 | covered |
| AC-01..AC-21 + AC-06b | §9 maps all 22 to named artifacts | mapped — **C-02** (fresh-registry recipe) + **N-02** (PART_OF chain) are fixture-precision fixes |

**Done well:** the rev-3 changelog names rev 2's boot-order claim as false
instead of papering over it; DD-16's circularity argument is genuinely sound;
DD-17/DD-18 convert judgment calls into explicit, testable postures; the
first-PUT risk (C-06 of the requirements review) is discharged at all three
layers with real file evidence; §9 carries every prior obligation as a named
fixture case; and the not-edited list (§8) keeps graph-core and all four
dependency surfaces byte-for-byte untouched, exactly as the house rules demand.

## Verdict

**approve** — zero blockers. Four concerns (C-01 accepted-risk wording
extension, C-02 binding fresh-registry test recipe, C-03 error-code selection
vs FR-10, C-04 stale anchors/insertion point) and four nits are recorded for
the tasks phase to absorb; none invalidates a DD or the design's direction.
Since `tasks.md` already exists in this spec directory, the tasks artifact (or
its re-review) must confirm it inherits C-02's recipe and settles C-03's code
choice explicitly.
