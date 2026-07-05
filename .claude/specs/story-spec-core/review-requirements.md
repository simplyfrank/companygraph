---
feature: "story-spec-core"
reviewing: "requirements"
reviewing_revision: 3
artifact: ".claude/specs/story-spec-core/requirements.md (rev 3)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
---

# Review: story-spec-core / requirements (fresh cold pass 1/2 over rev 3)

> Note on review history: this file supersedes an earlier recorded review of the
> same artifact. This pass was performed **cold** — every claim in rev 3 was
> re-verified from scratch against the blueprint, the `model-workspace-core`
> spec, and the code on disk; the historical findings the document cites
> (B-01…B-03, C-01…C-07, N-01…N-05) were independently re-checked, not taken on
> trust. Finding IDs below continue the historical sequence (C-10+, N-07+) to
> avoid colliding with IDs quoted inside `requirements.md`.

Reviewed against:

- `.claude/skills/spec-review/SKILL.md` (criteria + severity + verdict rules).
- `.claude/specs/blueprint.md` — View Tree lines 102/113 (`#/model/stories` →
  `StoryCatalog`, owner `story-spec-core`), UX-01…UX-06, XD-01/02/06/08/09/10/18.
- `.claude/CLAUDE.md` house rules (zod-only, no tsc, loopback, central router
  gate + `api/src/auth/`, `/api/v1/` mount, en-US identifiers).
- `.claude/specs/model-workspace-core/requirements.md` — FR-05 (route
  convention), FR-08 (fork surface), FR-11 (`business_architect` seed), FR-15
  (active-model context + persistence), FR-17 (`ModelTabPlaceholder` slot),
  FR-18 (`scopedNodeIds` helper), DEC-01(a) closed (shared reference nodes).
- Codebase verification (all confirmed on disk):
  - `api/src/storage/model-scope.ts:22` — `scopedNodeIds(driver, …)` +
    `scopedWhereFragment` exist with the cited signature; its own usage comment
    (line 51) matches the spec's `scopedNodeIds(driver, modelId)` citation.
  - `pwa/src/lib/userStories.ts` — exactly 53 lines; `formulateUserStories(data,
    journeyName)`; `goalPhrase` = `` `the ${journeyName.toLowerCase()} workflow
    completes` `` (line 20); `primaryRole = roles[0]` (line 31); `persona =
    primaryRole?.name ?? "user"` (line 34). FR-08's formulation and NFR-04's
    "cannot literally share one input object" framing are both accurate.
  - `api/src/ontology/storage/node-labels.ts:126` ("createNodeLabel — strict
    CREATE. 409 name_conflict on duplicate") and `edge-types.ts:206`
    ("createEdgeType — strict CREATE; 409 on duplicate name") — **not**
    MERGE-on-name; see C-10. Endpoint pairs are `_OntologyEdgeEndpoint` rows as
    FR-03 states.
  - `api/src/scripts/register-model-labels.ts:15-16` — the mwc precedent
    achieves idempotency by swallowing `409 name_conflict` on re-run.
  - `api/src/auth/rbac-permissions.ts:279-291` — `ROUTE_PERMISSIONS` rows for
    the story surface with correct specific-before-parameterized ordering
    (`bootstrap` and the `acceptance-criteria` sub-routes precede the
    `:storyId` rows), exactly as FR-11 requires.
  - `api/src/errors.ts:52-56` — the five FR-10 codes present, additive;
    `story_duplicate_for_activity` deliberately absent (comment at line 48),
    consistent with FR-10's "reserved, not thrown".
  - `pwa/src/views/index.tsx:166` — the `stories` `renderView` slot (the FR-12
    replacement point); `pwa/src/context/ActiveModelContext.tsx`,
    `ModelTabPlaceholder.tsx`, `pwa/src/styles/companygraph/tokens.css`,
    `scripts/design-conformance.ts`, `shared/src/schema/kpi-sla.ts`
    (`userStoryKPISchema` at line 105) all on disk as cited.

## Verdict

**approve** — zero blockers. Rev 3 is internally consistent, traceable to the
blueprint and its dependency's real interfaces, and every FR/NFR is closed by a
testable AC with a named verification artifact. The remaining findings are one
mechanism mis-description (C-10), two contract/semantics gaps that design must
pin (C-11, C-12), and two nits — none changes a requirement outcome.

## Blockers

None.

## Concerns

- **C-10 — FR-01/FR-02 misstate the registry idempotency mechanism.** Both FRs
  claim idempotent registration via "MERGE-on-name semantics of the registry
  path". The dependency's real interface is the opposite: `createNodeLabel`
  (`api/src/ontology/storage/node-labels.ts:126`) and `createEdgeType`
  (`edge-types.ts:206`) are **strict CREATE → `409 name_conflict`**. The
  sanctioned idempotency pattern is the caller swallowing the 409, per the mwc
  precedent (`api/src/scripts/register-model-labels.ts:15-16`: "every
  createNodeLabel / createEdgeType call swallows `409 name_conflict` … so
  re-runs are no-ops"). The requirement *outcome* (idempotent, no duplicate
  rows — AC-01) is correct and testable either way, so this is not a blocker.
  **Recommendation:** design specifies the swallow-409 registration pattern and
  does not inherit the "MERGE-on-name" wording; if requirements is revised for
  any other reason, fix the parenthetical in FR-01/FR-02.
- **C-11 — AC `ordinal` collision/normalization semantics unspecified.** FR-02
  says `ordinal` orders ACs within a story (1-based); FR-06 `PATCH` may set
  `ordinal` to any int; FR-13 supports reorder (spec'd as up/down buttons).
  Nothing forbids two ACs of the same story sharing an `ordinal` after a PATCH,
  and nothing defines list order under a tie or whether gaps left by `DELETE`
  are renumbered. "List ordered by `ordinal` ASC" (AC-04) is not deterministic
  under ties. **Recommendation:** design must pin one of: (a) up/down = swap
  semantics (two PATCHes or one transactional swap) with a documented
  `ordinal, createdAt` tiebreak on reads, or (b) server-side renormalization on
  write. Requirements need not change; the AC-04 test should then assert the
  chosen tie behavior.
- **C-12 — FR-09's `{activityIds}` rejection path names no error code.** FR-09
  says each supplied id "must be a scoped activity of `:modelId`" but, unlike
  the analogous FR-05 check (`404 story_activity_not_in_model`), names no code
  for a violation, and no AC exercises the bootstrap-body negative case (AC-08
  covers only the FR-05 create/re-point side). FR-10's "at minimum" keeps this
  additive, so not blocking. **Recommendation:** design states that the
  bootstrap body check reuses `story_activity_not_in_model` (preferred — same
  invariant, same code) and the bootstrap integration test (AC-07's file) gains
  the negative case.

## Nits

- **N-07 — AC-15 is `manual:` but the check is a deterministic CLI.**
  `scripts/design-conformance.ts` exits non-zero on violations; the artifact
  itself flags this (Risk 7). Tasks should promote it to an automated
  checkpoint rather than a manual repro.
- **N-08 — FR-08 pins a file path that design owns.**
  `api/src/storage/story-derive.ts` is named in a requirement; the artifact
  half-acknowledges this is a design decision (Risk 6). A pure, I/O-free
  derivation module arguably belongs outside `storage/`. Requirements should
  state the module contract (pure, Neo4j-free, unit-testable) and leave the
  path to design.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | n/a at this phase — every FR/NFR reaches ≥1 AC (table below); no orphan FRs or ACs |
| Every AC is closed by a task with Verification | n/a at this phase — every AC names its verification artifact inline (test path or `manual:` repro with input mode + observable outcome) |
| Routes/views match the blueprint View Tree verbatim | **pass** — `#/model/stories` → `StoryCatalog` (blueprint lines 102, 113); no invented or renamed routes; `route.ts` explicitly untouched (mwc owns it); replacement happens at the designated `renderView` `stories` slot |
| UX-* allowances covered in ACs (pwa/ specs) | **pass** — UX-01: AC-10/12/13/14 (all four states); UX-02: AC-15 + NFR-06 (real tokens path verified); UX-03: n/a with populated Platforms & Input-Modes + Native Conflicts tables and an explicit no-canvas/no-gesture justification; UX-04: NFR-06; UX-05: AC-16 (keyboard walk, focus order, ARIA landmark); UX-06: FR-12 verbatim route + FR-14/AC-17 (deep link + active model survive reload) |
| XD-* cross-cutting decisions honoured | **pass** — XD-01 (registry-only labels/edges; AC-01/02/18 + `git diff` guard), XD-02 (Neo4j only, no new store — NFR-01), XD-06 (activity-join model scoping; AC-08 asserts story-id *non*-membership in `scopedNodeIds`), XD-08 (`business_architect` write path, FR-11), XD-09 (generate-then-edit, FR-08/09, AC-06/07), XD-10 (structured G/W/T only, FR-02/06, NFR-03, AC-04), XD-18 (explicit closing AC-19 through the real router gate + conformance-table row + Source citations in FR-05/09/11) |
| House rules (CLAUDE.md) honoured | **pass** — zod-only, no tsc, loopback, central router gate + `api/src/auth/` only (FR-11 explicit: "no per-route auth check"), all routes under `/api/v1/`, en-US identifiers |
| No file ownership conflict with another spec | **pass** — mwc surfaces (route.ts, SURFACES, active-model context, `scopedNodeIds`, rbac seed) consumed, never re-specced; out-of-scope items each name an owner (kpi-impact-mapping, ddd-system-modeling, business-model-authoring, key-activity-optimizer, requirements-export); the `UserStory.id` join-key boundary is flagged for kpi-impact-mapping so it cannot invent a parallel story identity |
| Dependencies list real files/modules | **pass** — every cited file verified on disk with matching interface; one mechanism mis-description → C-10 |
| No naming collisions (labels / edge types / error codes / routes) | **pass** — no `UserStory`/`AcceptanceCriterion`/`DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF` in the compile-time consts; FR-10's codes are additive in `api/src/errors.ts`; the story `ROUTE_PERMISSIONS` rows collide with nothing |

### FR/NFR → AC coverage

| Requirement | Covered by | Notes |
|-------------|-----------|-------|
| FR-01 `UserStory` label (registry) | AC-01, AC-18 | OK; C-10 mechanism wording |
| FR-02 `AcceptanceCriterion` label (G/W/T) | AC-01, AC-04, AC-18 | OK; C-10 wording; C-11 ordinal ties |
| FR-03 story→structure edges + cardinality | AC-02 | OK — `1..*` decided in-FR, reserved code handled honestly |
| FR-04 `ACCEPTANCE_OF` edge | AC-02, AC-04, AC-05 | OK |
| FR-05 story CRUD + write-side scope check | AC-03, AC-08, AC-19 | OK — negative write asserted both directions (create + re-point) |
| FR-06 AC CRUD | AC-04 | OK; C-11 (tie order under PATCH ordinal) |
| FR-07 cascade + detached indicator | AC-05, AC-11 | OK — single-tx DETACH DELETE, activity/role survival asserted |
| FR-08 server derivation | AC-06 | OK — projection + `createdAt`-then-`id` tiebreak makes parity well-defined; orphan fallback has its own case |
| FR-09 bootstrap | AC-07, AC-13, AC-19 | OK; C-12 (body-scope rejection code unnamed) |
| FR-10 API contract / error codes | AC-04, AC-08, AC-09 | OK |
| FR-11 route permissions + `business_architect` | AC-09, AC-19 | OK — XD-18 cited; ordering rule verified against `rbac-permissions.ts` |
| FR-12 StoryCatalog + 4 states | AC-10, AC-12, AC-13, AC-14, AC-15 | OK — route verbatim, real tokens path |
| FR-13 detail/edit/AC editing | AC-11, AC-16 | OK; reorder default = buttons (no gesture), Native Conflicts stays clean |
| FR-14 model-scoped catalog + reload | AC-10, AC-17 | OK — consumes mwc FR-15, does not re-implement |
| NFR-01 registry-only, no new store | AC-01, AC-02, AC-18 | OK — `git diff` guard on the consts |
| NFR-02 model isolation (read + write side) | AC-08 | OK — activity-join mechanism stated precisely, incl. why story-id membership would be wrong |
| NFR-03 structured-AC invariant | AC-04 | OK — single enforcement point named |
| NFR-04 derivation fidelity | AC-06 | OK |
| NFR-05 house rules | AC-18 | OK |
| NFR-06 tokens-only styling | AC-15 | OK |
| Blueprint XD-18 mandate (story-surface half) | AC-19 (+ AC-06/07/09/11 supporting) | OK — real session through the real gate, not a permission stub |

## Summary

- Solid: the model-scoping mechanism note (stories resolved through the
  `DESCRIBES_ACTIVITY` activity join, with AC-08 explicitly asserting that a
  story id is *not* in `scopedNodeIds`) and the NFR-04 parity-harness framing
  are rigorous — they close off the two easiest ways this feature could ship
  subtly wrong (silent empty-set scoping, and an ill-defined parity assertion
  against an order-unstable client function).
- Solid: XD-18 is closed properly — AC-19 is a genuine end-to-end AC (seeded
  `Role-EXECUTES-Activity` structure, real `business_architect` session through
  the central gate, per-role `STORY_FOR_ROLE`, derived-flag lifecycle), not a
  paraphrase of the mandate.
- The common thread in the findings is *mechanism precision at the dependency
  boundary*: the registry's strict-CREATE/swallow-409 reality (C-10), the
  bootstrap body's unnamed rejection code (C-12), and ordinal tie semantics
  (C-11) are all places where requirements states the right outcome but design
  must pin the exact mechanism. Do C-10 first — it is the only claim in the
  document that contradicts a dependency's real interface.
- No blocker; concerns are addressable in the design phase without a
  requirements revision.
