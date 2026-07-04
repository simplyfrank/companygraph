---
feature: "story-spec-core"
reviewing: "design"
reviewing_revision: 3
artifact: ".claude/specs/story-spec-core/design.md (rev 3, 2026-07-04, reviewing_requirements_revision: rev 3)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Review: story-spec-core / design (pass 2/2 — design rev 3)

Reviewed cold against `requirements.md` rev 3, `blueprint.md` (View Tree line
102/113: `#/model/stories` → `StoryCatalog`, owner `story-spec-core` — verbatim
in the design), `.claude/CLAUDE.md`, `.claude/specs/_baseline/`, the landed
`model-workspace-core` code, and the live codebase. Re-verified this pass:
the exact `collisionExpr` incl. the `input.id !== undefined` short-circuit
(`api/src/storage/edges.ts:55-57` — DD-10's quote is now byte-accurate),
`scopedNodeIds` (`api/src/storage/model-scope.ts` — mixed unlabeled set, N-04
snapshot note matches DD-09), `createSession(userInfo, roles, storeAccess,
personaAssignments, rbacRoles, permissions)` (`api/src/auth/oauth.ts:151` —
§4.12's anchor is real), the `stories` placeholder slot
(`pwa/src/views/index.tsx:158`), `registerModelSchema` inside `applySchema`
(`api/src/neo4j/bootstrap.ts` step 3b), `business_architect`
(`seed-rbac-roles.ts:96`), `POST /models/:id/domains` + `model_not_found` via
`getModel` (`api/src/routes/models.ts:196-217`), the `models*` block
fall-through (`routes/models.ts:306`), the openapi enum-direction test
(`openapi.integration.test.ts` — "ErrorEnvelope.code enum contains every
ERROR_CODES member", matching DD-04's corrected rationale),
`design-conformance.ts --view` single-file semantics
(`scripts/design-conformance.ts:132-133`), `formulateUserStories(data,
journeyName)` + `goalPhrase` (`pwa/src/lib/userStories.ts:19-36`), and the
mwc lifecycle guard (`api/src/storage/model-lifecycle-guard.ts`,
`LIFECYCLE_LABELS`/`LIFECYCLE_EDGES`, wired into `routes/nodes.ts:21,35` —
see C-07).

## Pass-1 findings — resolution ledger (all verified landed in rev 3)

- ~~B-01~~ → **resolved** by DD-11: the §4.1 list query is now `OPTIONAL
  MATCH` with `(a IS NOT NULL AND a.id IN $scopedActivityIds) OR a IS NULL`,
  so detached rows are listable; §4.2's blanket membership check is replaced
  by the two-shape gate (cross-model → `404 story_not_found`; detached →
  proceed), so detached stories are readable (`200 detached:true`), patchable
  (re-point repair), and deletable; §5's route table and §8's AC-03 row carry
  the detached lifecycle as a real integration seam for AC-11. The §4.1/§4.2
  contradiction is gone; the attribution consequence is stated explicitly in
  DD-11 (see C-05 for the one loose end).
- ~~C-01~~ → **resolved**: §4.9 says "The **five** new `ERROR_CODES`"; §8
  AC-09 row asserts "routes + **5** codes in openapi"; §7 `errors.ts` row
  says "+**5**".
- ~~C-02~~ → **resolved** by DD-12: enforcement boundary stated as a decision
  (invariants hold for this spec's routes; generic edge surface can violate;
  accepted risk, future-guard candidate); §4.1 hardened with
  `count(DISTINCT ac)` and the degradation modes enumerated.
- ~~C-03~~ → **resolved**: §4.2 `patchStory` re-point now runs
  `SET s.sourceActivityId = $activityId` in the same tx; asserted in §8's
  AC-03 row.
- ~~C-04~~ → **resolved**: §1.1 rewritten — dependency recorded as landed,
  interfaces re-verified (spot-checked this pass: all real), and §2.1 D-3(h)
  instructs the tasks phase to drop the stale "blocked" precondition.
- ~~N-01~~ → **resolved**: DD-10/§3.3 quote the qualified
  `WHERE type(r) <> $edgeType` form and the `input.id !== undefined`
  short-circuit — both verified exact against `edges.ts:55-57`.
- ~~N-02~~ → **resolved**: DD-02 fixes the no-role starter `when` to
  `"the user performs <activity>"` via the `persona` fallback; derivation
  stays total.
- ~~N-03~~ → **resolved**: §4.12 anchors the AC-19 session fixture to the
  real `createSession` helper (`oauth.ts:151`), not a forward self-reference.

## Blockers

None.

## Concerns

- **C-05 — DD-11's global visibility of detached rows is in tension with
  FR-14's plain wording; record it as a deviations-register erratum.**
  FR-14 says "StoryCatalog only ever shows the active model's stories";
  under DD-11 a detached story appears in **every** model's list until
  repaired. The design's reading is defensible (a detached story is
  model-unattributable; NFR-02's letter — "never returns a story whose
  activity belongs only to model B" — holds vacuously, and AC-08 is scoped to
  attached stories) and this resolution was one of the options pass 1 itself
  suggested. But the requirements text was never updated, and a tasks author
  reading FR-14 cold could "fix" the list query back to the rev-2 shape,
  reintroducing B-01. **Recommendation:** add a §2.1 row (D-4): "DD-11
  detached rows are listed under any model's route — FR-14/NFR-02 errata
  pending; the FR-14 guarantee applies to attached stories." One row; no
  behavior change.

- **C-06 — no `:modelId` existence check on any stories route; combined with
  DD-11 an unknown model id returns `200` with every detached story.**
  §4.1/§4.2/§5 never resolve the model itself: `scopedNodeIds` on a
  nonexistent id returns an empty set (verified — `model-scope.ts` collects
  from an `OPTIONAL MATCH`), so `GET /models/<typo>/stories` would return
  `200` listing all detached stories (DD-11's `a IS NULL` arm), bootstrap on
  a nonexistent model returns `200 {created:0, skipped:0}` (indistinguishable
  from DD-09's pinned-only hint case — the view would show the misleading
  "fork first" hint), and create returns the misleading
  `story_activity_not_in_model`. `model-workspace-core`'s own model-scoped
  subroute does this right: `handleModelDomainPost` resolves `getModel` →
  `404 model_not_found` first (`api/src/routes/models.ts:217`).
  **Recommendation:** one sentence in §4.1 (and a §8 assertion in the AC-03
  or AC-08 file): every `models/:modelId/stories*` handler first resolves the
  model (reuse `getModel` → existing `404 model_not_found`) before calling
  `scopedNodeIds`. Additive, no new code, matches the house convention.

- **C-07 — DD-12 overstates the cost of the guard it declines, and covers
  only the edge surface; the generic *node* surface can mint `UserStory`
  nodes that DD-11 then lists as detached rows in every catalog.**
  (a) DD-12 says a per-type write guard "is a graph-core contract change,
  out of scope" — but the mechanism already exists and is mwc's, not
  graph-core's: `api/src/storage/model-lifecycle-guard.ts` holds
  `LIFECYCLE_LABELS`/`LIFECYCLE_EDGES` ReadonlySets consumed by
  `routes/nodes.ts:35`; extending the same pattern to the three story edges
  (or the two labels) is a few lines, not a contract change. The accepted-risk
  decision may still stand — but the rationale should be accurate so a future
  spec doesn't inherit the false premise. (b) Unaddressed sibling hole:
  `POST /api/v1/nodes {label:"UserStory"}` is accepted once the label is
  registered (the runtime registry is the point of XD-01), creating a story
  with **no** `DESCRIBES_ACTIVITY` edge and **none** of the §3.1 top-level
  props — which the §4.1 query classifies as detached (`a IS NULL`) and lists
  under **every** model with null `narrative`/`persona`. **Recommendation:**
  extend DD-12's boundary statement to name the generic node surface, and
  state the list/read behavior for prop-less `UserStory` nodes (render with
  null fields is fine — just say it), or add the two labels to the
  guard-style set if the team prefers hard closure. Decision either way, one
  paragraph.

## Nits

- **N-04 — DD-01's `api/src/derive/story-derive.ts` placement diverges from
  requirements FR-08's literal `api/src/storage/story-derive.ts` path.** The
  divergence is sanctioned (requirements Risks row 6 delegates the placement
  call to design), but it is the same class of record the §2.1 register
  exists for — add a row so the tasks phase doesn't "correct" the path back
  to `storage/`.
- **N-05 — §8 AC-04 row omits the detached-parent case DD-11 added to
  §4.3.** §4.3 `createAc` explicitly proceeds on a detached parent ("a
  detached story's ACs stay editable during repair"), but no test row asserts
  AC create/patch on a detached parent succeeds. Cheap add to the
  `acceptance-criteria-crud` or AC-03 detached-lifecycle case.

## Completeness / traceability

| Requirement | Design coverage | Status |
|---|---|---|
| FR-01/FR-02 (labels, envelope+props, idempotent) | §3.1/§3.2 (DD-03 top-level props), §4.6 (`name_conflict`-by-code swallow), §7 | pass |
| FR-03/FR-04 (edges, endpoint pairs, cardinality) | §3.3 + DD-04 (`1..*`) + DD-12 (enforcement boundary), §4.6 boot ordering (`assertEndpointLabelsExist` verified) | pass |
| FR-05 (story CRUD, write-side scope check) | §4.2, §4.7, §5; DD-06/DD-07/DD-08; two-shape gate DD-11 | pass (see C-06 for the missing model-existence pre-gate) |
| FR-06 (AC CRUD, parent gate) | §4.3, §5; ordinal=max+1 in-tx | pass (see N-05) |
| FR-07 (cascade + detached indicator) | §4.4 single-tx `DETACH DELETE`; DD-11 detached contract; producible end-to-end (§4.1 list + §4.2 detail) | pass |
| FR-08 (pure derivation, tiebreak, orphan fallback) | §4.5 + DD-01/DD-02; `DeriveActivityInput` shape | pass (see N-04 path divergence) |
| FR-09 (bootstrap, idempotent, `{activityIds}`) | §4.5 steps 1–5; DD-09 pinned boundary `{0,0}` | pass |
| FR-10 (OpenAPI, five additive codes) | §3.5, §4.9 ("five" — pass-1 C-01 fixed), §5 | pass |
| FR-11 (permissions, central gate, business_architect) | §4.8 (10 rows, specific-first; seed grant); no `public` | pass |
| FR-12 (StoryCatalog, verbatim route, 4 states) | §4.10/§6; route matches blueprint View Tree lines 102/113 verbatim; placeholder swap only | pass |
| FR-13 (detail/edit/reorder, derived+detached badges) | §4.10; up/down reorder (no drag); detached indicator reachable via DD-11 | pass |
| FR-14 (model-scoped + reload survival) | §4.10 (`activeModel.id` keyed refetch), §8 AC-17 e2e | pass (see C-05 wording tension) |
| NFR-01 (registry-only) | §4.6, §7 "Not edited", AC-18 CLI | pass |
| NFR-02 (isolation via activity join) | §3.4/§4.1; matches real `scopedNodeIds` semantics | pass |
| NFR-03 (structured-AC single zod gate) | §3.2 `.min(1)` → §4.3 code mapping | pass |
| NFR-04 (parity harness + projection) | §4.5 parity harness; single-journey fixture | pass |
| NFR-05 (house rules) | §4.7/§4.8; zod-only; `/api/v1/`; central gate; en-US | pass |
| NFR-06 (tokens-only, conformance) | §4.10/§6; two per-file `--view` invocations (verified script behavior) | pass |
| AC-01…AC-09, AC-19 (server) | §8 rows, real file paths; AC-03 now carries the detached lifecycle + `sourceActivityId` assertions; AC-08 write-side negative | pass |
| AC-10…AC-14, AC-17 (PWA) | §8 component/e2e rows; AC-11's detached payload now producible by the real contract (DD-11) | pass |
| AC-15 (CLI, per-file), AC-16 (manual repro), AC-18 (CLI) | §8 + §2.1 D-1 errata | pass |
| Blueprint XD-01/02/09/10/18 | registry-only; Neo4j-only; generate-then-edit editable nodes; structured GWT; §4.12 + AC-19 end-to-end | pass |
| UX-01…UX-06 | four states; tokens+catalog; input-mode tables (requirements) honored — no drag/gesture; no new breakpoints; keyboard/ARIA (AC-16); verbatim route + reload survival | pass |

**Done well:** DD-11 is a genuinely coherent resolution of pass-1's B-01 —
the two-shape gate, the list `OPTIONAL MATCH`, the repair paths, and the
attribution consequence are all stated and mutually consistent, and the AC-11
indicator finally has a real integration seam (§8 AC-03). Every code citation
spot-checked this pass was accurate to the line. The §2.1 deviations register
plus D-3(a)–(h) gives the tasks revision an exact, complete delta list.

## Verdict

**approve** — zero blockers. Pass-1's blocker and all six carry-forward
findings are verifiably landed. C-05/C-06/C-07 should be addressed in the
tasks revision (C-06 is one sentence + one assertion; C-05/N-04 are register
rows; C-07 is a one-paragraph boundary statement/decision) — none changes the
architecture, the API contract, or any AC's meaning.
