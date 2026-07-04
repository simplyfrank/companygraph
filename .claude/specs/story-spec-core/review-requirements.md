---
feature: "story-spec-core"
reviewing: "requirements"
reviewing_revision: 3
artifact: ".claude/specs/story-spec-core/requirements.md (rev 3 — responds to the pass-2 review of rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Review: story-spec-core / requirements (confirming re-review of rev 3 — final pass)

Reviewed cold against `.claude/skills/spec-review/SKILL.md`,
`.claude/specs/blueprint.md` (View Tree line 102/113: `#/model/stories` →
`StoryCatalog`, owner `story-spec-core`; XD-01/02/06/08/09/10/18; UX-01..06),
`.claude/CLAUDE.md`, `.claude/specs/model-workspace-core/requirements.md`
(FR-08/FR-11/FR-12/FR-15/FR-17/FR-18, DEC-01(a) closed), and the live codebase:

- `api/src/storage/model-scope.ts` — `scopedNodeIds(driver, modelId)` +
  `scopedWhereFragment` on disk with the exact signature cited; its header (mwc
  N-04) confirms the C-07 pinned-module premise verbatim ("for a NON-forked
  instance the pinned journey content is not a set of live nodes … resolve it
  from the version's snapshot_json").
- `pwa/src/lib/userStories.ts` — 53 lines as stated; `formulateUserStories(data,
  journeyName)`, `goalPhrase` = `` `the ${journeyName.toLowerCase()} workflow
  completes` ``, primary role/location = column-membership `[0]`-order,
  `persona = primaryRole?.name ?? "user"` — FR-08's formulation and NFR-04's
  "cannot literally share one input object" framing are both accurate.
- `api/src/ontology/storage/{node-labels,edge-types}.ts` — `createNodeLabel` /
  `createEdgeType` exist; endpoint pairs written as `_OntologyEdgeEndpoint`
  rows; **both are strict CREATE → `409 name_conflict`** (see C-08 below).
- `api/src/scripts/register-model-labels.ts` — the mwc precedent this spec's
  registration path mirrors; idempotency there is swallow-409, not MERGE.
- `api/src/errors.ts` — zero collisions for the five new + one reserved code.
- `api/src/auth/rbac-permissions.ts` — `ROUTE_PERMISSIONS` with
  `models/:modelId/*` rows and specific-before-parameterized ordering, as FR-11
  assumes; `api/src/scripts/seed-rbac-roles.ts` on disk.
- `pwa/src/views/index.tsx:158` — `stories: () => <ModelTabPlaceholder
  tab="Stories" spec="story-spec-core" />` is exactly the slot FR-12 replaces;
  `pwa/src/context/ActiveModelContext.tsx`, `ModelTabPlaceholder.tsx`, catalog
  `Card/DataTable/Modal/SidePanel`, `pwa/src/styles/companygraph/tokens.css`,
  and `scripts/design-conformance.ts --view` all on disk as cited.
- `shared/src/schema/{nodes,edges}.ts` — no `UserStory` / `AcceptanceCriterion`
  / `DESCRIBES_ACTIVITY` / `STORY_FOR_ROLE` / `ACCEPTANCE_OF` collisions.

## Verdict

**approve** — zero open blockers. Rev 3 lands every pass-2 finding exactly as
prescribed and each resolution verifies against the blueprint and the shipped
code. Two new concerns and one nit are recorded for the design/tasks phases;
none rises to blocker level because the requirement outcomes they touch are
correct and testable as written — only a mechanism description and downstream
phase-sync need attention.

## Resolved prior findings

Pass 1 (rev 1 → rev 2): ~~B-01~~, ~~B-02~~, ~~C-01~~..~~C-05~~,
~~N-01~~..~~N-03~~ — all confirmed resolved in the pass-2 review; still intact
in rev 3.

Pass 2 (rev 2 → rev 3):

- ~~B-03~~ → **resolved.** XD-18 is now cited in the Source column of FR-05,
  FR-09, and FR-11; the UX/XD conformance table carries an explicit XD-18 row
  naming AC-19 as the closing AC with AC-06/AC-07/AC-09/AC-11 as supporting
  coverage; and **AC-19** is the explicit end-to-end AC the mandate demands:
  seeded `(:Role)-[:EXECUTES]->(:Activity)` structure (≥2 activities, distinct
  roles), a **real `business_architect` session through the central router
  gate** (not a synthetic permission stub), bootstrap → one `derived:true`
  story per activity with `DESCRIBES_ACTIVITY` + `STORY_FOR_ROLE` to the
  executing role + a starter G/W/T AC, then a same-session PATCH clearing
  `derived` — with a named integration test
  (`api/__tests__/story-xd18-role-path.integration.test.ts`). This matches the
  blueprint XD-18 text (line 173) for the story-surface half; the
  `EXECUTES`-core half remains with `business-model-authoring` as XD-18 itself
  assigns. Traceable into design/tasks now that requirements states it.
- ~~C-06~~ → **resolved.** FR-05 now requires the write-side scope check on
  `POST` create and `PATCH` re-point (`activityId` ∈
  `scopedNodeIds(driver, :modelId)`, else `404 story_activity_not_in_model`);
  the code is added to FR-10's additive set (distinct from
  `story_activity_required` = missing); AC-08 gained the negative-write
  assertions (create with a model-B-only activity id **and** a re-point, both
  rejected, model B's list unchanged). No collision in `api/src/errors.ts`.
  `roleId` correctly exempted per mwc DEC-01(a) (shared reference nodes —
  verified closed in mwc requirements Risk 1).
- ~~C-07~~ → **resolved.** Scope Boundaries now states the pinned-module
  boundary as intended behavior: stories/ACs attach only to materialized
  (in-model or forked) activities; pinned non-forked module content is out of
  story reach until forked (fork surface = mwc FR-08, verified that FR owns the
  fork trigger); bootstrap reports such activities in neither `created` nor
  `skipped`; design is directed to hint "fork first, then generate" in the
  empty state. Matches the shipped `model-scope.ts` header exactly.
- ~~N-04~~ → **resolved.** FR-12/NFR-06 cite the real path
  `pwa/src/styles/companygraph/tokens.css` (file exists).
- ~~N-05~~ → **resolved.** Frontmatter is now `status: "revised", revision: 3`
  — no longer anticipates the review outcome.

## Blockers

None.

## Concerns

- **C-08 — FR-01/FR-02 misstate the registry idempotency mechanism.** Both FRs
  claim idempotent registration via "MERGE-on-name semantics of the registry
  path". That is not what the dependency provides: `createNodeLabel`
  (`api/src/ontology/storage/node-labels.ts:126` — "strict CREATE. 409
  name_conflict on duplicate") and `createEdgeType` (`edge-types.ts:206`) are
  strict CREATEs. The mwc precedent this spec mirrors
  (`api/src/scripts/register-model-labels.ts`) achieves idempotency by
  **swallowing `409 name_conflict`** on re-run — "every createNodeLabel /
  createEdgeType call swallows `409 name_conflict` (already registered) so
  re-runs are no-ops". The requirement outcome (idempotent, no duplicate rows —
  AC-01) is correct and testable regardless, so this is not a blocker, but the
  feature brief requires citing dependencies' **real** interfaces.
  **Recommendation:** design must specify the swallow-409 registration pattern
  (per `register-model-labels.ts`) and not inherit the "MERGE-on-name" wording;
  if requirements is touched again for any reason, fix the parenthetical in
  FR-01/FR-02.
- **C-09 — Rev-3 deltas post-date the approved design and the tasks draft;
  downstream phases must absorb them.** STATUS.md shows design already approved
  and a 16-task draft covering "all 18 ACs" — requirements now has **19** ACs.
  The rev-3 additions that must ripple: (1) AC-19 + its named integration test
  (one new task or an extension of the RBAC/bootstrap test tasks); (2) the
  `story_activity_not_in_model` code in the errors task (T-03) and the FR-05
  create/re-point scope check in the routes task; (3) the AC-08 negative-write
  assertions in the isolation test task (T-10); (4) the "fork first, then
  generate" empty-state hint (Scope Boundaries directive to design).
  **Recommendation:** land these as design/tasks errata before task review
  closes; the task reviewer should verify all 19 ACs are covered, not 18.

## Nits

- **N-06** — FR-09's optional `{activityIds}` says each id "must be a scoped
  activity of `:modelId`" but names no rejection code for a violation, while
  the analogous FR-05 check names `story_activity_not_in_model`. Design should
  state that the bootstrap body check reuses the same code (or names its own);
  FR-10's "at minimum" leaves room either way.

## Completeness / Traceability

| Check | Result |
|-------|--------|
| Every FR reaches ≥1 AC (and vice versa) | pass — table below; no orphan FRs/ACs |
| Routes/views match the blueprint View Tree verbatim | pass — `#/model/stories` → `StoryCatalog` (blueprint lines 102, 113), no invented/renamed routes; `route.ts` untouched (mwc owns it); replacement happens at the designated `renderView` `stories` slot (`pwa/src/views/index.tsx:158`) |
| UX-* allowances covered in ACs | pass — UX-01 (AC-10/12/13/14), UX-02 (AC-15, real conformance CLI), UX-03 (n/a with populated Platforms & Input-Modes + Native Conflicts tables and justification), UX-04 (NFR-06), UX-05 (AC-16), UX-06 (FR-12/FR-14, AC-17) |
| XD-* cross-cutting decisions honoured | **pass** — XD-01 (registry-only labels/edges, AC-01/02/18 guard), XD-02 (Neo4j only, no new store), XD-06 (activity-join scoping, AC-08), XD-08 (`business_architect` write path, FR-11), XD-09 (generate-then-edit, FR-08/09, AC-06/07), XD-10 (structured G/W/T, FR-02/06, NFR-03, AC-04), **XD-18 (AC-19 + conformance row — B-03 closed)** |
| House rules (CLAUDE.md) honoured | pass — zod-only, no tsc, loopback, central router gate + `api/src/auth/` only (FR-11 explicit), all routes under `/api/v1/`, en-US identifiers |
| No ownership conflict with another spec | pass — mwc surfaces consumed not re-specced; out-of-scope owners named (kpi-impact-mapping, ddd-system-modeling, business-model-authoring, key-activity-optimizer, requirements-export); `UserStory.id` join-key boundary flagged for kpi-impact-mapping |
| Dependencies list real files/modules | pass — every cited file verified on disk with matching interface (one mechanism mis-description → C-08) |
| No naming collisions (labels/edges/error codes/routes) | pass — grep-verified against `shared/src/schema/*`, `api/src/errors.ts`, `rbac-permissions.ts` |

### FR/NFR → AC coverage

| Requirement | Covered by | Notes |
|-------------|-----------|-------|
| FR-01 UserStory label (registry) | AC-01, AC-18 | OK; **C-08** wording (mechanism) |
| FR-02 AcceptanceCriterion label (G/W/T) | AC-01, AC-04, AC-18 | OK; **C-08** wording |
| FR-03 story→structure edges + cardinality | AC-02 | OK — cardinality decided in-FR |
| FR-04 ACCEPTANCE_OF edge | AC-02, AC-04, AC-05 | OK |
| FR-05 Story CRUD + write-side scope check | AC-03, AC-08, AC-19 | OK — C-06 closed |
| FR-06 AC CRUD | AC-04 | OK |
| FR-07 cascade + detached indicator | AC-05, AC-11 | OK — single-tx DETACH DELETE |
| FR-08 server derivation | AC-06 | OK — projection + tiebreak well-defined |
| FR-09 bootstrap | AC-07, AC-13, AC-19 | OK; **N-06** (bootstrap body rejection code unnamed) |
| FR-10 API contract / error codes | AC-04, AC-08, AC-09 | OK — reserved code handled honestly |
| FR-11 route permissions + business_architect | AC-09, AC-19 | OK — XD-18 cited |
| FR-12 StoryCatalog + 4 states | AC-10, AC-12, AC-13, AC-14, AC-15 | OK — route verbatim |
| FR-13 detail/edit/AC editing | AC-11, AC-16 | OK |
| FR-14 model-scoped catalog + reload | AC-10, AC-17 | OK |
| NFR-01 registry-only | AC-01, AC-02, AC-18 | OK |
| NFR-02 model isolation (read + write side) | AC-08 | OK — both sides now asserted |
| NFR-03 structured-AC invariant | AC-04 | OK |
| NFR-04 derivation fidelity | AC-06 | OK |
| NFR-05 house rules | AC-18 | OK |
| NFR-06 tokens-only styling | AC-15 | OK — real path |
| Blueprint XD-18 mandate | **AC-19** (+ AC-06/07/09/11 supporting) | **closed — was B-03** |

## Summary

- Rev 3 is a precise, minimal revision: it lands the pass-2 blocker exactly as
  prescribed (XD-18 citations + AC-19 + conformance row) and both concerns and
  both nits, and every claim it adds checks out against the blueprint and the
  code on disk — including the subtle ones (pinned-module snapshot boundary,
  `scopedNodeIds` membership semantics, the client derivation's `[0]`-order
  primary).
- What's done well: the model-scoping mechanism note (stories resolved through
  the activity join, with AC-08 asserting story-id **non**-membership) and the
  NFR-04 parity-harness framing are unusually rigorous requirements writing —
  they close off the two easiest ways this feature could have shipped subtly
  wrong.
- Remaining work is downstream: fix the "MERGE-on-name" mechanism wording in
  design (C-08), and reconcile the already-drafted design/tasks with the rev-3
  deltas — 19 ACs, one new error code, negative-write assertions, and the
  fork-first empty-state hint (C-09). Neither requires another requirements
  pass; the review cap for this phase is now consumed.
