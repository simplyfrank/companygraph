---
feature: "story-spec-core"
reviewing: "design"
reviewing_revision: 3
artifact: ".claude/specs/story-spec-core/design.md (rev 3, revised 2026-07-04, reviewing_requirements_revision: rev 3)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
---

# Review: story-spec-core / design rev 3 (fresh cold pass 1)

> **Process note.** This file supersedes a prior `review-design.md` (pass 2/2,
> verdict approve, 2026-07-04) whose ledger recorded rev-2 findings
> B-01/C-01…C-04/N-01…N-03 as resolved in rev 3 and left C-05/C-06/C-07/
> N-04/N-05 open (STATUS.md: "delegated → landed in tasks rev 2/3"). This is a
> fresh, independent cold review of the same rev-3 body ordered by the
> orchestrator; where a finding coincides with a prior open item I say so, and
> I re-verified each against the artifact and the codebase rather than
> inheriting it. STATUS.md also records the design phase's review cap (1+1) as
> already consumed and execution complete (T-01…T-17) — so the concerns below
> should be dispatched as errata / follow-up-spec candidates, not a design
> re-spin; none is a blocker.

Reviewed cold against: `requirements.md` rev 3 (FR-01…FR-14, NFR-01…NFR-06,
AC-01…AC-19), `blueprint.md` (View Tree lines 102/113: `#/model/stories` →
`StoryCatalog`, owner `story-spec-core`; XD-01/02/06/08/09/10/18; UX-01…06),
`.claude/CLAUDE.md`, and the live codebase.

**Code citations re-verified this pass — all accurate:**

- `scopedNodeIds(driver, modelId)` — `api/src/storage/model-scope.ts:22`; mixed
  unlabeled structural set, matching §3.4's premise.
- `createEdge` collision pre-check — `api/src/storage/edges.ts:54-56`: DD-10's
  quote is byte-accurate, including the `input.id !== undefined` short-circuit
  to the literal `"false"`.
- `createSession(userInfo, roles, storeAccess, personaAssignments, rbacRoles,
  permissions)` — `api/src/auth/oauth.ts:151`; §4.12's anchor is real.
- `business_architect` — `api/src/scripts/seed-rbac-roles.ts:96`; the role
  deliberately carries **no** `node:write`/`edge:write` (see N-03 below).
- `registerModelSchema` in `applySchema` — `api/src/neo4j/bootstrap.ts` step 3b
  (the ordering §4.6 requires is honored by the shipped step 3c).
- `useActiveModel()` — `pwa/src/context/ActiveModelContext.tsx:121`; the
  `stories` dispatch slot — `pwa/src/views/index.tsx:166`.
- `formulateUserStories(data: JourneyData, journeyName)` + `goalPhrase` —
  `pwa/src/lib/userStories.ts:19-36`; the §4.5 parity-projection premise
  (column-indexed, no `createdAt`) matches the real shape.
- `createNodeLabel` / `createEdgeType` + `assertEndpointLabelsExist` —
  `api/src/ontology/storage/{node-labels.ts:129, edge-types.ts:209,150}`.
- `getModel` → `404 model_not_found` convention on mwc's own model-scoped
  subroute — `api/src/routes/models.ts:217` (relevant to C-01).
- `scripts/design-conformance.ts:124-127` — `--view` takes exactly one file;
  §4.10/§6/§8's two-invocation AC-15 plan matches the script's semantics.
- `matchSegments` segment-count-first matching — `api/src/auth/rbac-permissions.ts:338`;
  §4.8's collision argument holds.
- Blueprint route taken **verbatim**: `#/model/stories` → `StoryCatalog`
  (blueprint lines 102/113); no invented or renamed routes anywhere in §5/§6.

## Blockers

None.

## Concerns

- **C-01 — No `:modelId` existence gate on any stories route; an unknown model
  id degrades misleadingly.** §4.1/§4.2/§5 never resolve the model itself.
  `scopedNodeIds` on a nonexistent id yields an empty set, so under the DD-11
  list query `GET /api/v1/models/<typo>/stories` returns `200` whose only rows
  are **every detached story in the graph** (`a IS NULL` arm); bootstrap on a
  nonexistent model returns `200 {created:0, skipped:0}` — indistinguishable
  from DD-09's pinned-only case, so the StoryCatalog would render the
  misleading "fork first" hint; and `POST /stories` returns the misleading
  `story_activity_not_in_model`. The house convention already exists one
  directory over: `handleModelDomainPost` resolves `getModel` → `404
  model_not_found` first (`api/src/routes/models.ts:217`).
  **Recommendation:** one sentence in §4.1 — every `models/:modelId/stories*`
  handler first resolves the model (reuse `getModel`, existing
  `404 model_not_found`) before `scopedNodeIds` — plus one assertion in the
  AC-03 or AC-08 test file. Additive; no new code path. *(Coincides with prior
  review C-06; still absent from the rev-3 body.)*

- **C-02 — DD-11's global visibility of detached rows contradicts FR-14's
  literal text, and the deviation is not in the §2.1 register.** FR-14:
  "StoryCatalog only ever shows the active model's stories." Under DD-11 a
  detached story is listed under **every** model's route until repaired. The
  design's reasoning is sound (a detached story is model-unattributable;
  hiding it — rev 2's shape — stranded it, which was the pass-1 blocker;
  NFR-02's letter still holds since no *other model's* content leaks), but the
  requirements text was never errata'd and §2.1 has no row for it — a tasks
  author reading FR-14 cold could "fix" the list query back to the rev-2 shape
  and reintroduce the stranding bug. Secondary unstated consequence: a
  brand-new empty model's catalog shows detached rows from elsewhere instead
  of the AC-13 empty state whenever detached garbage exists anywhere.
  **Recommendation:** add §2.1 row D-4 ("DD-11 detached rows listed under any
  model's route — FR-14/NFR-02 errata pending; the FR-14 guarantee applies to
  attached stories") and one sentence in §4.10 stating the empty state keys on
  "no attached stories" (or that detached rows count as content). No behavior
  change. *(Coincides with prior review C-05.)*

- **C-03 — DD-12's enforcement boundary names only the generic *edge* surface
  and overstates the cost of the guard it declines; the generic *node* surface
  is an unaddressed sibling hole.** (a) Once `UserStory` is registered
  (XD-01's whole point), `POST /api/v1/nodes {label:"UserStory"}` mints a
  story with none of the §3.1 top-level props and no `DESCRIBES_ACTIVITY`
  edge — which the §4.1 query classifies as detached (`a IS NULL`) and lists
  under **every** model with null `narrative`/`persona`. The design never
  states the intended list/read/render behavior for prop-less story nodes.
  (b) DD-12 says a per-type write guard "is a graph-core contract change, out
  of scope" — verified false as a rationale: the mechanism is
  `model-workspace-core`'s, already on disk
  (`api/src/storage/model-lifecycle-guard.ts` — `LIFECYCLE_LABELS`/
  `LIFECYCLE_EDGES` ReadonlySets consumed by the generic routes), and it does
  **not** cover `UserStory`/`AcceptanceCriterion` (grep-verified). Extending
  that pattern is a few lines, not a contract change. The accepted-risk
  decision may stand — but the recorded premise should be accurate so no
  future spec inherits it. **Recommendation:** extend DD-12's paragraph to
  (i) name the generic node surface, (ii) state the behavior for prop-less
  story/AC nodes (render-with-nulls is acceptable — say it), and (iii) correct
  the rationale to reference the existing guard as the cheap closure option.
  *(Coincides with prior review C-07; fresh evidence added.)*

## Nits

- **N-01 — Derivation-module path diverges from FR-08's literal text without a
  register row.** FR-08 says `api/src/storage/story-derive.ts`; DD-01 places
  it at `api/src/derive/story-derive.ts`. The call is sanctioned (requirements
  Risks row 6 delegates placement to design, and the `derive/` reasoning is
  good), but §2.1 — the register that exists precisely for this class of
  divergence — has no row for it. Add D-5. *(Coincides with prior N-04.)*
- **N-02 — §8's AC-04 row omits the detached-parent case §4.3 specifies.**
  §4.3 `createAc`/`patchAc` explicitly proceed on a detached parent ("a
  detached story's ACs stay editable during repair"), but no §8 row asserts AC
  create/patch under a detached parent succeeds. One assertion in
  `acceptance-criteria-crud.integration.test.ts` or the AC-03 detached
  lifecycle. *(Coincides with prior N-05.)*
- **N-03 — (new) §4.12/§8 fixture setup is infeasible under the very session
  AC-19 mandates, and the design doesn't say so.** The §8 note has integration
  fixtures built via "core `POST /api/v1/domains`/`journeys`/`nodes` for
  activities"; the nodes route requires `node:write`
  (`rbac-permissions.ts:41`), which `business_architect` **deliberately
  lacks** (`seed-rbac-roles.ts:90-95` comment: "Deliberately NO node:write /
  edge:write"). AC-19 step 2 correctly scopes the `business_architect` session
  to the bootstrap/PATCH steps only, but nothing states that fixture seeding
  needs a *separate, differently-privileged* session — a task author could
  wire the whole test through one session and hit 403 in `beforeAll`. One
  sentence in §4.12 step 1 ("fixture seeded under a distinct admin/full-write
  session; the `business_architect` session is used only from step 3 on")
  closes it.

## Completeness / traceability

| Requirement | Design coverage | Status |
|---|---|---|
| FR-01/FR-02 (labels, envelope+props, idempotent registration) | §3.1/§3.2 (DD-03 top-level props), §4.6 (`name_conflict`-by-code swallow, boot ordering verified vs `assertEndpointLabelsExist`), §7 | pass |
| FR-03/FR-04 (three edges, endpoint pairs, cardinality) | §3.3 + DD-04 (`1..*`) + DD-12 boundary | pass (see C-03 for the node-surface sibling) |
| FR-05 (story CRUD + write-side scope check) | §4.2, §4.7, §5; DD-06/DD-07/DD-08; DD-11 two-shape gate | pass (see C-01 missing model pre-gate) |
| FR-06 (AC CRUD, parent gate, ordinal=max+1) | §4.3, §5 | pass (see N-02) |
| FR-07 (single-tx cascade; detached indicator) | §4.4 `DETACH DELETE`; DD-11 makes `detached:true` producible end-to-end (§4.1 list + §4.2 detail) | pass |
| FR-08 (pure derivation, deterministic tiebreak, orphan fallback) | §4.5 + DD-01/DD-02; `DeriveActivityInput` | pass (see N-01 path divergence) |
| FR-09 (bootstrap, idempotent, `{activityIds}`, pinned `{0,0}`) | §4.5 steps 1–5 + DD-09 | pass |
| FR-10 (OpenAPI from zod; five additive codes; reserved code not added) | §3.5, §4.9, §5; matches shipped `ERROR_CODES` exactly (`api/src/errors.ts:52-56`, `story_duplicate_for_activity` absent per DD-04) | pass |
| FR-11 (permissions, central gate only, `business_architect` grant) | §4.8 — 10 rows, specific-first, no `public`; matches `rbac-permissions.ts:282-291` + seed grant | pass |
| FR-12 (StoryCatalog, verbatim route, four states, tokens) | §4.10/§6; route verbatim vs blueprint View Tree 102/113; placeholder swap only | pass |
| FR-13 (detail/edit, GWT triples, reorder, derived+detached badges) | §4.10; up/down reorder — no drag (Native Conflicts honored) | pass |
| FR-14 (model-scoped catalog + reload survival) | §4.10 `activeModel.id`-keyed refetch; §8 AC-17 e2e | pass with tension (C-02: DD-11 vs literal wording) |
| NFR-01 (registry-only; consts untouched) | §4.6, §7 "Not edited", AC-18 CLI row | pass |
| NFR-02 (isolation via activity join) | §3.4/§4.1; matches real `scopedNodeIds` semantics | pass |
| NFR-03 (structured-AC single zod gate) | §3.2 `.min(1)` → §4.3 code mapping | pass |
| NFR-04 (parity harness + defined projection) | §4.5 harness; single-journey fixture; projection-ordering coupling stated | pass |
| NFR-05 (house rules: zod-only, `/api/v1/`, central gate, en-US, no tsc) | §4.7/§4.8 throughout; no per-route auth anywhere | pass |
| NFR-06 (tokens-only + conformance per touched file) | §4.10/§6; two per-file `--view` runs match script semantics | pass |
| AC-01…AC-09, AC-19 (server) | §8 rows with real file paths; AC-03 carries detached lifecycle + `sourceActivityId`; AC-08 write-side negative | pass (see N-03 fixture-session gap for AC-19) |
| AC-10…AC-14, AC-17 (PWA) | §8 component/e2e rows; AC-11's detached payload producible via the DD-11 contract | pass |
| AC-15 (CLI per file), AC-16 (manual repro w/ input mode + outcome), AC-18 (CLI) | §8 + §2.1 D-1 | pass |
| Blueprint XD-01/02/09/10/18 | registry-only; Neo4j-only; generate-then-edit editable nodes; structured GWT; §4.12 + AC-19 end-to-end through the real gate | pass |
| UX-01…UX-06 | four states (AC-10/12/13/14); tokens + catalog-first; no new gesture/breakpoint; keyboard/ARIA (AC-16); verbatim route + reload survival (AC-17) | pass |

**Done well:** every single code citation in the artifact checked out at the
cited line — rare and valuable. DD-11 is a coherent resolution of the earlier
detached-story contradiction (gate, list query, repair paths, and attribution
consequence all mutually consistent, with a real integration seam for AC-11).
The §2.1 deviations register + D-3(a)–(h) hands the tasks phase an exact delta
list. §4.6's boot-ordering analysis anticipates `assertEndpointLabelsExist`
correctly.

## Verdict

**approve** — zero blockers. Every FR/NFR/AC traces to a design element and
every §7 file row serves a requirement; house rules and blueprint law (verbatim
route, UX-01…06, XD-01/02/09/10/18) are honored. C-01…C-03 are real gaps that
should land as errata/assertions (C-01 is one sentence + one test assertion;
C-02 a register row + one §4.10 sentence; C-03 a corrected boundary paragraph)
— none changes the architecture, the API contract, or any AC's meaning. Given
STATUS.md records execution as already complete, dispatch them into the tasks
errata register / a follow-up backfill rather than a design re-spin.
