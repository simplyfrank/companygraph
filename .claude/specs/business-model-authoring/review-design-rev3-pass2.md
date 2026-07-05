---
feature: "business-model-authoring"
reviewing: "design"
reviewing_revision: 3
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Review: business-model-authoring / design (pass 2/2, artifact revision 3)

> Re-review of design.md **revision 3** against requirements.md (approved,
> revision 2), the pass-1 review (verdict: revise — DR2-B-01..03,
> DR2-C-01..03, DR2-N-01..03), the blueprint (View Tree, UX-01..06,
> XD-01..18), and the code on disk. Every **new** rev-3 citation was
> re-verified: `patchNode` (`api/src/storage/nodes.ts:169`, partial dynamic
> SET), `not_found` (`api/src/errors.ts:12`), the generic node PATCH →
> `node:write` mapping (`rbac-permissions.ts:43`), `business_architect`'s
> "Deliberately NO node:write / edge:write" (`seed-rbac-roles.ts:~91-94`) with
> `query:read` carried (`seed-rbac-roles.ts:~108`), `query/search` →
> `query:read` (`rbac-permissions.ts:58`), the story rows
> (`rbac-permissions.ts:282-290`), mwc's 3-segment POST-only domains arm
> (`routes/models.ts:295-296` — the 4-segment PATCH cannot collide),
> `scopedNodeIds` (`model-scope.ts:22`), mwc's D-2 check
> (`storage/modules.ts:520-532`), and — load-bearing for DR2-C-02 —
> `upsertNode`'s `ON MATCH SET n.name/description/updatedAt/attributes_json`
> (`storage/nodes.ts:~245-251`), which makes §4.3 step 6's MERGE-update claim
> true on disk. Router delegate shape confirmed (`router.ts:396-407`); RBAC
> matching is positional with literal segments, so neither the
> `models/:modelId/stories/:storyId` PATCH row nor any mwc row shadows the new
> `models/:id/domains/:domainId` PATCH row.

## Verdict

**approve** — zero blockers. All three pass-1 blockers are resolved with real
mechanisms, not wording: DD-06 (§5.0) is exactly the deviation paper trail the
pass-1 fix sanctioned, DD-07 (§4.3 step 5) mechanizes write-side model scope
with the same D-2 regime mwc uses, and DD-08 (§4.9) gives FR-03's
"editable in place" a permission-reachable path. Three concerns are recorded
below — the first (amendment ratification) is a **hard gating condition for
the tasks phase**, the second is a correctness gap in DD-07's rejection
semantics that must be folded into tasks — but both have bounded, specified
fixes and neither invalidates the design's direction, so per the severity
rules they do not block.

## Resolved pass-1 findings

- ~~DR2-B-01~~ → **resolved** by DD-06 (§5.0): explicit Requirements-deviation
  subsection listing all four disagreements with the approved text, per-route
  rationale, the exact rev-3 amendment, and an Open Question to the
  orchestrator. This is the second remedy the pass-1 fix offered, executed in
  full. §8's AC-10 openapi assertion is written against the amended
  three-route contract. (Ratification itself is still pending — see C-01.)
- ~~DR2-B-02~~ → **resolved** by DD-07 (§4.3 step 5): raw-UUID edge endpoints,
  `existingId`s, and re-run `id`s are label-resolved and, for model-scoped
  labels, asserted members of `scopedNodeIds(:modelId)`; violations are
  per-row `invalid_payload` `{outOfModel}` errors with the rows excluded from
  the `realImport` payload and indexes remapped; AC-18 gains both write-side
  assertions (foreign `PART_OF` target; MERGE-rename of B's journey). The
  mechanism is fail-closed. (A second-order gap in its rejection semantics is
  C-02 below.)
- ~~DR2-B-03~~ → **resolved** by DD-08 (§4.9, §3.5):
  `PATCH /api/v1/models/:modelId/domains/:domainId` (`model:write`), third arm
  in `registerAuthoringRoutes`, D-2-style `IN_MODEL` scope check with
  cross-model-indistinguishable `404 not_found`, delegating to graph-core's
  `patchNode`. mwc's `routes/models.ts` untouched; no route/RBAC shadowing
  (verified above). Option (ii) correctly rejected in §9.
- ~~DR2-C-01~~ → resolved: §5.2 now enumerates four permission families
  including `query:read`; AC-10 widened.
- ~~DR2-C-02~~ → resolved: MERGE-update semantics stated in §4.3 step 6 and
  **verified true against `upsertNode`'s ON MATCH clause**; AC-08 asserts the
  changed-name re-run.
- ~~DR2-C-03~~ → resolved: §3.2/§4.3 pin the all-rows `ids` echo and the
  MERGE-on-absent-id-creates retry, with the matching step-5 exemption.
- ~~DR2-N-01~~ (FR-10 in §7), ~~DR2-N-02~~ (`resumeStep` pinned in §3.4),
  ~~DR2-N-03~~ (param-name style) → all resolved.

## Blockers

None.

## Concerns

- **C-01 — DD-06's requirements amendment is proposed, not ratified: this
  approval is conditional on requirements revision 3 landing before the tasks
  phase re-approves.** `requirements.md` on disk is still revision 2 and says
  "exactly one new endpoint" in FR-13, FR-14, and Scope Boundaries — text this
  approved design now contradicts by sanctioned deviation. The design did
  everything in its power (the pass-1 fix explicitly offered the
  deviation-subsection-plus-ratification path), so this is not an authoring
  defect — but if the orchestrator does not ratify the DD-06 amendment,
  `spec-traceability` will (correctly) flag FR-13/FR-14 against the three-route
  openapi assertion in AC-10, and the repo would hold two approved artifacts
  that disagree. **Recommendation:** the orchestrator applies the exact DD-06
  amendment table as requirements revision 3 (FR-13/FR-14/Scope Boundaries →
  three routes + permissions per §5.1; FR-03 names the domain PATCH; all AC
  ids unchanged) **before** tasks.md is revised/approved. Do not begin
  implementation of the three routes until it lands.

- **C-02 — DD-07's per-row rejection semantics can strand orphans and then
  deadlock the echoed-id retry contract; §4.3 step 5's own "no invisible
  orphans" claim is not upheld by its mechanism.** Walk the design's own
  AC-18(a) scenario: `POST /models/A/authoring/apply` with a **new** journey
  node row plus a `PART_OF` edge row targeting model B's domain. Step 5
  rejects the **edge** row ("per-row error on every row *referencing* it") —
  but the journey **node** row references nothing out-of-model, passes, and is
  persisted by `realImport` as an orphan in **no** model's scope (the very
  "invisible orphan" step 5 claims to prevent). On retry with the corrected
  domain id, the client re-submits the journey row with its echoed `id` per
  the DR2-C-03 contract — and step 5's re-run rule ("node exists but is not in
  `S` → same per-row rejection") now rejects it **forever**: an orphan is
  never in `scopedNodeIds(A)`, and there is no other path that can re-anchor
  it. The same lock-out arises from any phase-2 edge failure that leaves a
  freshly created node unanchored (`edge_endpoint_label_mismatch`, a crash
  between phases). The mechanism is fail-closed — NFR-03 isolation holds, so
  this is not a blocker — but it breaks the retry contract (AC-14's
  "re-submits", AC-08's re-run semantics) in exactly the failure states
  retries exist for. **Recommendation (fold into tasks; one of):** (i) refine
  step 5's membership test to reject only ids that are members of a
  **different** model's scope, treating exists-but-in-no-model nodes of
  model-scoped labels as re-anchorable by the current model (one extra check:
  the node has no `PART_OF*/IN_MODEL` chain to any other `BusinessModel`); or
  (ii) additionally exclude new-node rows whose only anchoring `PART_OF` edge
  row was scope-rejected (prevent the orphan at creation) **and** allow re-run
  `id`s of no-model orphans. Either way, add one assertion to AC-18 or AC-08:
  scope-rejected batch → corrected retry with echoed ids **succeeds** and the
  node ends up in `scopedNodeIds(A)`.

- **C-03 — tasks.md (rev 1) predates design rev 3 and no longer matches
  it.** Tasks were drafted against the one/two-route design: no task owns the
  domain PATCH route (§4.9), the DD-07 scope-validation step (§4.3 step 5),
  the `domainPatchSchema` (§3.5), the third RBAC row, the widened
  AC-04/AC-10/AC-18 test artifacts, or the three-route openapi assertion —
  and the design itself notes it supersedes tasks statements (§4.8 point 2,
  "supersedes the passing 'multi' mention in tasks rev 1 row T-15").
  **Recommendation:** revise tasks.md against design rev 3 (after C-01's
  ratification) before execution; the tasks reviewer should check the three
  DD-06 routes each have an owning task with a verification artifact.

## Nits

- **N-01 — step 5 label-resolves every referenced id but never asserts the
  resolved label matches the row's claimed `label`.** `upsertNode` runs
  ``MERGE (n:`${label}` {id})`` — a re-run `id` (or crafted request) whose id
  exists under a *different* label creates a **second node with a duplicate
  id** under the claimed label. The resolution query already returns
  `labels(n)`; one comparison (`resolved label ≠ row.label` → per-row
  `invalid_payload`) closes it for free.
- **N-02 — §4.4 says `scopedNodeIds(modelId)` yields "the model's
  `Domain`/`UserJourney`/`Activity` ids", but on disk the set also contains
  `ModuleInstance` ids** (`model-scope.ts` collects `mi.id` via
  `INSTANCE_IN`). Harmless for step 5 (which gates on the three model-scoped
  labels) but the `authoring/graph` projection must filter by label rather
  than trusting the set's composition — one clarifying sentence in §4.4.
- **N-03 — §5.3 reuses five error codes (adds `not_found` for the domain
  PATCH) while FR-13's approved text enumerates four.** Fold the code-list
  update into the DD-06 amendment so requirements rev 3's FR-13 lists all
  five; otherwise AC-10's openapi error-code assertion drifts from the FR
  text again.

## Completeness / Traceability

| FR / AC | Design element(s) | Status |
|---------|-------------------|--------|
| FR-01 | §3.4 (`WizardState`, `canAdvance`, `resumeStep`), §6, §7 (`wizardModel.ts`, `ModelCanvas.tsx`) | covered |
| FR-02 | §4.2 (blank + clone, C-01 target-domain order, DD-04), §7 (`TemplateStep.tsx`) | covered |
| FR-03 | §4.1 (mwc domain-attach), §4.9/DD-08 + §3.5 (edit in place), §7 (`DomainsStep.tsx`) | covered — pass-1 gap closed |
| FR-04 | §4.3 (apply), §7 (`JourneysStep.tsx`) | covered |
| FR-05 | §4.5 (pick-or-create-global via existing `query/search`/`Typeahead`), §7 (`ActivitiesRolesStep.tsx`) | covered |
| FR-06 | §4.6 (story-spec-core routes only; idempotent bootstrap render), §7 (`StoriesStep.tsx`) | covered |
| FR-07 | §3.1–3.2, §4.3 (7 steps incl. DD-07), §4.7 (`realImport` export) | covered (C-02 refinement owed) |
| FR-08 | §4.2 (module instantiation only, disabled-not-error), §9 | covered |
| FR-09 | §3.3, §4.4/DD-01, §4.8/DD-05 (`toJourneyData` + per-journey `chain`), §7 | covered |
| FR-10 (should) | §6 last bullet (`onReorder` seam, Native Conflicts), §7 `ModelCanvas.tsx` row | covered |
| FR-11 | §6 (four states), §7 (CSS modules, tokens-only) | covered |
| FR-12 | §3.4 (draft non-persistence), §4.4 (scoped reads), §6 (`useActiveModel`) | covered |
| FR-13 | §5.0/DD-06 (deviation recorded), §5.1, §5.3, openapi row in §7 | covered **conditional on C-01 ratification** |
| FR-14 | §5.2 (three added rows; four exercised families; no re-map, no public) | covered (same condition) |
| NFR-01..06 | §3 preamble/AC-20; §1 rule 1 + §9; §4.3 step 5 + §4.4 (NFR-03, now both sides); §4.3 step 1 / §5.2 (gate-only auth, zod, `/api/v1/`); §6 tokens/`--view`; §8 must/should gating | covered |
| AC-01..AC-14, AC-16..AC-20 (must) + AC-15 (should) | §8 — all 20 approved ids verbatim, each with a test artifact or a manual repro carrying input mode + observable outcome; AC-10 kept single with two artifacts | covered |
| Blueprint View Tree | `#/model/canvas` → `ModelCanvas`, owner verbatim; `route.ts`/`SURFACES` untouched (mwc-owned); placeholder swap in `views/index.tsx` only | pass |
| UX-01..06 | four states (§6/AC-12..14); tokens + catalog + enforced `--view` (AC-16); input modes + Native Conflicts (§6/AC-15/AC-17); desktop-first; keyboard/ARIA (AC-17); verbatim route + reload survival (AC-19) | pass |
| XD-01/02 (no new label/store), XD-08 (central gate), XD-09 (generate-then-edit surfaced), XD-13 (clone via module instantiation only), XD-18 (real-Neo4j AC-06) | NFR-01/AC-20; §5.2; §4.6; §4.2/§9; §8 AC-06 | pass |
| File ownership | `routes/models.ts` untouched; `import.ts` = one `export` keyword; `rbac-permissions.ts` additive; `views/index.tsx` sanctioned swap | pass |

## Summary

Rev 3 is the strongest artifact in this spec's history: every pass-1 blocker
is closed with a verified, on-disk-grounded mechanism, and the design's
riskiest claim (MERGE-update on match) turned out to be literally true in
`upsertNode`'s Cypher. What remains is sequencing (C-01: the orchestrator must
ratify requirements rev 3 before tasks; C-03: tasks must be re-cut against
this revision) and one bounded correctness refinement in DD-07's rejection
semantics (C-02: don't strand orphans; keep the echoed-id retry contract
honest) that fits naturally into the tasks revision. Approved with those
conditions recorded.
