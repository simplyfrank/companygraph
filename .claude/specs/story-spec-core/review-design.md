---
feature: "story-spec-core"
reviewing: "design"
artifact: ".claude/specs/story-spec-core/design.md (draft, reviewing_requirements_revision: revised 2026-07-04)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of at most 2"
---

# Design Review: story-spec-core

Reviewed cold against the approved (revised) `requirements.md`, the app
`blueprint.md` (XD-*, View Tree, UX-*), `.claude/CLAUDE.md` house rules, the
`model-workspace-core` dependency design, and the live codebase. Every claimed
interface, file path, and pattern was Grep/Read-verified.

The design is strong: registry-only schema, dedicated-storage-not-generic-primitives,
consume-`model-workspace-core`-never-re-spec, and central-gate-only auth are all
correctly applied and mirror the dependency. Traceability is near-complete and the
per-FR/AC section discipline is exemplary. The findings below are one wrong (but
non-load-bearing) rationale, a handful of implementability clarifications, and nits.
No blocker — verdict **approve**, with concerns to fold into the tasks phase.

## Findings

### Blockers

None.

### Concerns

**C-01 — DD-04 / §3.5 / §9 cite a test that does not exist and misdescribe the one
that does.** DD-04, the §3.5 error-code table, and the §9 rejected-alternative all
justify *not* adding `story_duplicate_for_activity` with: "adding an unreachable
code would break `envelope.test.ts`'s reachability assertion." Verified against the
codebase: **there is no `envelope.test.ts`.** The only exhaustiveness test is
`api/__tests__/ontology-envelope.test.ts`, which asserts `ERROR_CODE_THROWERS` is
exhaustive over **`ONTOLOGY_ERROR_CODES`** (`api/src/ontology/errors.ts`) — a
*different* enum from the main `ERROR_CODES` (`api/src/errors.ts`) that this spec's
four codes are added to, and it is about thrower registration, not route reachability.
The real assertion over `ERROR_CODES` is in `api/__tests__/openapi.integration.test.ts`
("ErrorEnvelope.code enum contains every ERROR_CODES member"), which requires the
**opposite**: every `ERROR_CODES` member must appear in the OpenAPI enum. There is
**no** test asserting every `ERROR_CODES` member is thrown by a live route. So adding
`story_duplicate_for_activity` would *not* fail any test.
*The decision (default `1..*`, code reserved-not-added) is still correct — it matches
FR-03/FR-10, which already decided this — but the stated reason is false.*
**Recommendation:** In DD-04, §3.5, and §9, replace the "`envelope.test.ts`
reachability" rationale with the accurate one: activity→story is `1..*` per FR-03, so
no route emits the code; it is omitted to avoid a dead code, and `ERROR_CODES` is
generated straight into the OpenAPI enum so no test breaks either way. Do **not**
change the outcome, only the justification, so the tasks phase does not encode a
false constraint (e.g. a task "verify envelope.test.ts still passes").

**C-02 — Parity harness couples to a non-existent client `createdAt`/column-order
concept.** §4.5 and NFR-04 say the `JourneyData` projection is "constructed so the
client's **column-order** primary agrees with the server's `createdAt`-then-`id`
tiebreak." Verified: the client `JourneyData` (`pwa/src/components/JourneyCanvas.tsx`)
has **no `createdAt`** on `ActivityNode`/`RoleNode`/`LocationNode` and **no
column-order primacy** — `formulateUserStories` (`pwa/src/lib/userStories.ts`) picks
`roles.filter(r => r.columns.includes(activity.column))[0]`, i.e. pure **array index
order** within the filtered list. The parity fixture is still constructable (order the
projected `roles`/`locations` arrays so index-0 is the node the server's
`createdAt`-then-`id` tiebreak would pick), but the design's framing invites the task
author to look for a column/createdAt coupling that isn't there.
**Recommendation:** Reword §4.5/NFR-04 mapping to: "the projected `JourneyData`
`roles`/`locations` arrays are ordered so array-index-0 is the same node the server
selects by `createdAt`-then-`id`." No behavior change; removes a false lead for AC-06's
implementer.

**C-03 — `ErrorState` has no retry prop; §4.10/§6 imply one.** §4.10 (AC-14) and §6
say "`ErrorState` from `views/_shared.tsx` + retry button that refetches." Verified:
`ErrorState({ message }: { message: string })` in `pwa/src/views/_shared.tsx` takes
only `message` — it renders no retry affordance. AC-14 requires a retry control.
**Recommendation:** The design should state the retry button is rendered by
`StoryCatalog` *alongside* `ErrorState` (a local `<Button onClick={refetch}>`), not by
`ErrorState`, or note that `ErrorState` needs a compatible wrapper. Minor but avoids a
"where does retry live" gap at AC-14 implementation time.

**C-04 — `roleId` on POST validated but not label-checked in the create precondition
narrative is ambiguous.** §4.2 `createStory` step 1 says a bad `roleId` returns
`400 story_activity_required` "with `details.field:"roleId"` (or reuse `not_found` —
chosen: `story_activity_required`)." Reusing an *activity*-named code for a *role*
failure is a confusing contract, and the parenthetical leaves it half-decided.
**Recommendation:** Pick one explicitly. Either (a) validate `roleId` is a `Role` and
throw `not_found` (the existing generic code) with `details.field:"roleId"`, or (b)
add `story_role_required`. Reusing `story_activity_required` for a role failure will
read as a bug in AC-03's assertions. Prefer (a) — no new code, clear semantics.

### Nits

**N-01 — `createNodeLabel`/`createEdgeType` take a required `actor` argument the
design omits.** Verified: both are `(driver, input, actor)`. §4.6's
`registerStorySchema(driver)` prose (and its `model-workspace-core` twin) never names
the `actor` arg. Cosmetic — implementation will supply e.g. `"system:bootstrap"` —
but worth a one-line note so the task DoD includes it.

**N-02 — File-changes table omits the two new test-directory conventions.** §8 lists
test files under `api/__tests__/` and `pwa/src/__tests__/` and one
`pwa/playwright/` spec; §7 (File Changes) does not list them. Consistent with how the
dependency spec handles it, but a reader diffing §7 against §8 will notice the test
files aren't in the change table. Optional: add a "test files (per §8)" row.

**N-03 — AC-15 promotion is sound but is a requirements deviation that needs the same
errata treatment `model-workspace-core` used.** §8's "AC-15 promotion" note (manual →
CLI) is correct and low-risk, but requirements AC-15 still says `manual:`. The
dependency spec routed such divergences through a Deviations Register (§2.1) for the
orchestrator to land as a requirements errata before tasks. This design mentions "the
orchestrator may land this as a requirements errata" in passing; consider a one-line
Deviations note so it is not lost.

## Completeness / Traceability

### FR → design coverage

| FR | Covered by | Status |
|----|-----------|--------|
| FR-01 UserStory label | §3.1, §4.6, §7 (`register-story-labels.ts`) | OK |
| FR-02 AcceptanceCriterion label (GWT) | §3.2, §4.6 | OK |
| FR-03 story→structure edges + `1..*` | §3.3, DD-04, §4.6 | OK |
| FR-04 ACCEPTANCE_OF edge | §3.3, §4.6 | OK |
| FR-05 Story CRUD | §4.2, §4.7, §5 | OK |
| FR-06 AC CRUD | §4.3, §4.7, §5 | OK |
| FR-07 cascade + detached | §4.4, §4.1 (detached), §3.1 (`detached`) | OK |
| FR-08 server derivation | §4.5 (`story-derive.ts`), DD-01 | OK (see C-02 wording) |
| FR-09 bootstrap endpoint | §4.5, §5, DD-02 | OK |
| FR-10 openapi + error codes | §3.5, §4.9, §5 | OK (see C-01 rationale) |
| FR-11 route-perm + RBAC | §4.8 | OK — segment-count matcher verified |
| FR-12 StoryCatalog + 4 states | §4.10, §6 | OK |
| FR-13 detail + edit + AC editing | §4.10, §6 | OK (see C-03) |
| FR-14 model-scope + reload survival | §4.10 | OK |
| NFR-01 registry-only, no const edit | §3, §4.6, §7 "Not edited" | OK |
| NFR-02 model isolation via activity join | §3.4, §4.1 | OK — `scopedNodeIds` sig verified `(driver, modelId): Promise<Set<string>>` |
| NFR-03 structured-AC single gate | §3.2, §4.3 | OK |
| NFR-04 parity harness | §4.5 | OK (see C-02) |
| NFR-05 house rules | §4.7, §4.8 | OK |
| NFR-06 tokens-only + conformance | §4.10, §6 | OK — tokens.css path + `--view` flag verified |

### AC → test coverage (§8)

All AC-01…AC-18 map to a named test file/CLI/manual repro in §8. Spot-verified as
implementable: registry funcs, `createEdge` endpoint whitelist (registry-backed via
`getEdgeEndpoints`), `matchSegments` equal-segment-count matcher, `Loading`/
`ErrorState`/`NotFoundPanel`, catalog `Card`/`DataTable`/`Modal`/`SidePanel`, the
`VIEWS[surface][tab]` dispatch shape, and `design-conformance.ts --view` all exist as
described. AC-14 has the C-03 retry-affordance wrinkle. No AC is left uncovered; no
test targets a non-existent surface (the `model-workspace-core` surfaces it consumes
are correctly flagged as build-order dependencies in §1.1).

### Blueprint / house-rule conformance

- Route `#/model/stories` → `StoryCatalog` is **verbatim** from the View Tree. OK.
- XD-01 (registry labels), XD-02 (Neo4j only), XD-09 (generate-then-edit),
  XD-10 (structured GWT) all honored.
- UX-01/02/05/06 satisfied in ACs; Platforms/Native-Conflicts inherited from
  requirements (list/detail/form, no gestures). OK.
- Auth: central gate only, no per-route check, no `public` route. OK.
- All routes under `/api/v1/`; error codes additive to closed `ERROR_CODES`. OK.

### Done well

- The model-scoping-through-the-activity invariant (§3.4/§4.1) is precisely stated
  and matches the verified `scopedNodeIds` contract; AC-08 even asserts a story id is
  *not* in the scoped set, which is the right adversarial check.
- Single-transaction `DETACH DELETE` cascade (§4.4) is correct and avoids the N-round-trip
  anti-pattern; the "Activity/Role survive" guarantee is structurally true.
- DD-01's `derive/` placement keeps the parity unit test Neo4j-free — a genuinely good
  call that resolves requirements N-01 cleanly.
- Router dispatch and `ROUTE_PERMISSIONS` ordering reasoning is backed by the real
  `matchSegments` equal-length rule, so the "specific-before-parameterized" caution is
  belt-and-suspenders rather than load-bearing — correctly noted as such.

## Verdict

**approve.** Zero blockers. The four concerns (C-01 false test-name rationale, C-02
parity wording, C-03 retry affordance, C-04 role-error code choice) and three nits are
all foldable into the tasks phase without a design re-review; none changes the
architecture or a contract's outcome. Fix C-01's rationale text so the tasks phase does
not encode a non-existent constraint, decide C-04 explicitly, and clarify C-02/C-03
wording for the implementers.
