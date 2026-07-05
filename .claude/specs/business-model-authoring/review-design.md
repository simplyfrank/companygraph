---
feature: "business-model-authoring"
reviewing: "design"
reviewing_revision: 4
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
---

# Review: business-model-authoring / design (fresh pass 1 on artifact revision 4)

> **Provenance note.** This is a cold, fresh review of design.md **rev 4** by a
> reviewer who authored none of the prior artifacts. The prior review history on
> disk is genuine (pass 1 → revise on rev 2; pass 2/2 → approve on rev 3); that
> pass-2 record is preserved verbatim at `review-design-rev3-pass2.md` so the
> DR3-* citations in design §2.5 stay resolvable. Rev 4's **unreviewed deltas**
> (DD-09 orphan-tolerant scope semantics, the DR3-N-01 label-mismatch check,
> the §4.4 `scopedNodeIds` composition statement, the §5.0 ratification status)
> were the focus of this pass, and **every load-bearing code citation was
> re-verified against disk**, including: `realImport` private at
> `api/src/routes/import.ts` (~157) with `handleImport` exported (66);
> `generateId()` (`api/src/ids.ts:4`); `upsertNode`'s `ON MATCH SET
> name/description/updatedAt/attributes_json` (`api/src/storage/nodes.ts`
> ~245-251) — the DR2-C-02 MERGE-update claim is true; `patchNode` partial
> dynamic SET (~169); `scopedNodeIds` **including `ModuleInstance` pins via
> `INSTANCE_IN`** (`api/src/storage/model-scope.ts:22-35`) — DR3-N-02's fix in
> §4.4 is correct and necessary; mwc's D-2 `IN_MODEL` check
> (`api/src/storage/modules.ts:520-532`); the sibling delegate pattern
> (`api/src/router.ts:396-407` — `registerModelRoutes`, `registerStoryRoutes`);
> mwc's 3-segment POST-only domains arm (`api/src/routes/models.ts:295-296`);
> `.../stories/bootstrap` (`api/src/routes/stories.ts:199-200`); the RBAC rows
> and positional matcher (`api/src/auth/rbac-permissions.ts` — no PATCH row
> shadows `models/:id/domains/:domainId`; literal segments must match);
> `business_architect` deliberately without `node:write`/`edge:write` and with
> `query:read`+`story:*` (`api/src/scripts/seed-rbac-roles.ts:90-115`); all
> five reused error codes incl. `model_not_found` and `not_found`
> (`api/src/errors.ts`); the `uuidv7` zod validator
> (`shared/src/schema/nodes.ts:26-29`); `JourneyData` single-journey,
> column-index contract + `LayoutMode` `"multi"` routing to `MultiJourneyView`
> (`pwa/src/components/JourneyCanvas.tsx:37-47`,
> `pwa/src/views/explorer/JourneyGraph.tsx:679`); the `canvas` tab currently on
> `ModelTabPlaceholder` (`pwa/src/views/index.tsx:162`); `Typeahead` `label`
> prop; `api.search`; `tokens.css` at the cited path; `design-conformance.ts`
> `--view` enforced/positional-inert. Upstream: requirements.md **rev 3 is on
> disk** (`status: revised`, awaiting ratification) and carries the exact DD-06
> amendment (FR-13/FR-14/Scope Boundaries → three routes; FR-03 names the
> PATCH; five-code FR-13 list). Blueprint checks: `#/model/canvas` →
> `ModelCanvas` [owner: business-model-authoring] verbatim (blueprint View Tree
> line 101/112); UX-01..06 and XD-08/09/13/18 as cited.

## Verdict

**approve** — zero blockers. Rev 4's deltas do what the pass-2 review's own
recommendations prescribed, and each was verified sound against the code:
DD-09's orphan-tolerant test is exactly review option (i) (reject only
provably-foreign ids; `modelIds` empty → re-anchorable), the label-mismatch
check closes the duplicate-node-id hole DR3-N-01 named, and §4.4 no longer
misstates `scopedNodeIds`' composition. The design remains a genuinely thin
composition layer: every write path delegates to a verified on-disk upstream
surface, the three new routes are the minimum the must-FRs need, and the
riskiest reuse claims (`upsertNode` ON MATCH update; delegate dispatch with no
ordering constraint; RBAC positional matching) are all literally true on disk.

Four concerns are recorded. C-01 (ratification) and C-04 (pass accounting +
tasks touch-up) are **hard gates before execution**, carried from the prior
review cycle. C-02 and C-03 are **new findings of this pass** — both rooted in
`upsertEdge`'s real MERGE semantics, which no prior pass examined — but both
land in the `should` tier (FR-10) or in a crafted/degenerate-client path, so
per the severity rules they do not block a must-scope-complete design.

## Blockers

None.

## Concerns

- **C-01 — (carried, still open) DD-06's requirements amendment is authored
  but not ratified.** `requirements.md` rev 3 is on disk with the exact
  amendment table, but its frontmatter is `status: revised` — the currently
  *approved* requirements text (rev 2) still says "exactly one new endpoint"
  in FR-13/FR-14/Scope Boundaries and therefore contradicts this design. The
  design did everything an artifact can (DD-06 §5.0 paper trail, Open Question
  to the orchestrator, execution preconditions in tasks.md/STATUS.md).
  **Recommendation:** obtain user ratification (flip requirements rev 3 to
  `approved`) before design acceptance is finalized and before any of the
  three routes is implemented; if ratification is declined, this design must
  be re-cut to one route and FR-03's edit-in-place clause re-negotiated — do
  not let two disagreeing approved artifacts coexist.

- **C-02 — (new) FR-10/AC-15's "persists the new `PRECEDES` order via the
  authoring endpoint" has no implementable write path as designed.** Reorder
  means *removing or re-pointing* existing `PRECEDES` edges, but: (a)
  `authoring/apply` is upsert-only — it has no delete semantics; (b)
  `upsertEdge` MERGEs on `(a {id:$fromId})-[r:TYPE {id}]->(b {id:$toId})`
  (`api/src/storage/edges.ts:170-178`), so re-submitting an echoed edge `id`
  with **changed endpoints** does not re-point the edge — it creates a
  *second* same-type edge with a **duplicate id** (see C-03); (c) submitting
  a fresh edge for the new pair leaves the **stale** `PRECEDES` edge in
  place, corrupting §4.4's topological `order` (two competing successors, or
  a cycle); and (d) the only delete surface, `DELETE /api/v1/edges/:id`, maps
  to `edge:write` (`rbac-permissions.ts:48`), which `business_architect`
  **deliberately does not carry** (`seed-rbac-roles.ts:92-94`) — the same
  permission-unreachable-mechanism class as DR2-B-03. The cited reuse seam
  (`JourneyCanvas`'s `onReorder`) is client-visual only today
  (`JourneyGraph.tsx:716` → `setManualOrder`; nothing persists). Because
  FR-10 is `should` and the requirements explicitly allow it to ship "after
  the wizard or not at all in v1" (Risk row 3), this is not a blocker — but
  as written, an executor reaching FR-10/AC-15 hits a wall.
  **Recommendation:** before FR-10 is implemented, amend the design with a
  real reorder mechanism — e.g. `authoring/apply` gains a bounded
  *replace-intra-journey-`PRECEDES`-set* semantic (transactional
  delete+recreate scoped to one journey's activities, still via existing
  primitives), or FR-10's reorder clause is formally re-deferred. Record
  which in tasks.md so T-15/FR-10 work does not start against the current
  text.

- **C-03 — (new) step 5 has no edge analog of the DR3-N-01 node label check:
  a re-run edge `id` with drifted endpoints or type mints a duplicate edge
  id or strands a stale edge.** Verified on disk: `validateEdge` rejects
  only **cross-type** id collisions (`WHERE type(r) <> $edgeType`,
  `edges.ts:56`); a same-type re-run id between *different* endpoints passes
  validation and MERGE-creates a second edge with the same id. The design's
  deterministic key scheme (`"<type>:<from>-><to>"`) protects a well-behaved
  wizard (endpoint change → new key → no id reuse), but then the old edge
  survives as a stale duplicate relationship (C-02(c)), and a buggy or
  crafted client re-submitting an echoed edge `id` under new endpoints
  corrupts the id-uniqueness invariant graph-core's C-10 exists to protect.
  §4.3 step 5 already resolves referenced ids in one query — the fix is the
  same shape as the label check. **Recommendation:** extend step 5 to
  resolve re-run edge `id`s and reject rows whose persisted `(type, fromId,
  toId)` differ from the submitted row (per-row `invalid_payload`,
  `details:{endpointMismatch:[<id>]}`, row excluded). One additional AC-08
  assertion: re-run edge id with changed endpoints → per-row error, no
  duplicate-id edge created. Fold into the same tasks touch-up as DD-09
  (T-04/T-16).

- **C-04 — (process) the review-pass accounting is now inconsistent and the
  pass-2/2 record was about to be destroyed.** STATUS.md declares the design
  review cap "2/2 consumed", yet this review was commissioned as "pass 1 of
  at most 2" on rev 4 and targets the same `review-design.md` path that held
  the pass-2/2 approve record cited throughout design §2.5. This reviewer
  archived that record to `review-design-rev3-pass2.md` before writing this
  file. **Recommendation:** the orchestrator reconciles the ledger (either
  this pass re-opens the count for rev 4 — then update STATUS.md's
  `review_passes` — or it is an out-of-band audit pass; pick one and record
  it), and closes the still-owed tasks touch-up (DD-09 + label check +
  C-03's endpoint check into T-04/T-16/T-06) before execution.

## Nits

- **N-01 — DD-09's orphan re-anchoring is first-writer-wins across models.**
  An orphan stranded by model B's failed run (name/description authored in
  B's session) can be anchored into model A by any `model:write` holder who
  learns its UUID, after which B's own echoed-id retry is `outOfModel`-
  rejected. Practically gated by UUIDv7 unguessability and a single-org
  persona, and "belongs to no model" makes the read-isolation claim true —
  but §4.3/DD-09 should carry one sentence acknowledging the race and why it
  is accepted, so a future hardening pass doesn't mistake it for an
  oversight.
- **N-02 — the step-5 resolution query is label-less
  (`MATCH (n) WHERE n.id IN $ids`) and cannot use the per-label id indexes**
  — on Neo4j this is an AllNodesScan per apply call. Fine at wizard batch
  sizes on today's graphs; cheap fix if it ever shows up in traces: UNION
  the six known candidate labels (the schema already narrows what a row can
  claim). Note it in §4.3 so the executor doesn't "optimize" it into a
  correctness change.
- **N-03 — stale line citations.** `handleSearch` dispatch is now
  `api/src/router.ts:475` (design says 459); the story RBAC rows sit at
  ~284-293 (design says 282-287). Cosmetic drift as files grow — consider
  citing by symbol + approximate line.

## Completeness / Traceability (requirements rev 3 → design rev 4)

| FR / AC | Design element(s) | Status |
|---------|-------------------|--------|
| FR-01 (wizard shell, resumable, gated) | §3.4 (`WizardState`, `canAdvance`, `resumeStep`), §6, §7 (`wizardModel.ts`, `ModelCanvas.tsx`) | covered |
| FR-02 (blank + retail clone) | §4.2 (target-domain ordering, DD-04), §7 (`TemplateStep.tsx`) | covered |
| FR-03 (domains via mwc + edit-in-place PATCH) | §4.1, §4.9/DD-08, §3.5, §7 (`DomainsStep.tsx`) | covered — verified permission-reachable |
| FR-04 (journeys) | §4.3, §7 (`JourneysStep.tsx`); edit = id-set re-run (DR2-C-02, verified vs `upsertNode`) | covered |
| FR-05 (activities × roles, pick-or-create-global) | §4.5 (existing `query/search` + `Typeahead`), §7 | covered |
| FR-06 (stories + ACs via story-spec-core) | §4.6 (routes verified on disk), §7 (`StoriesStep.tsx`) | covered |
| FR-07 (batch apply; id echo; scope check) | §3.1-3.2, §4.3 (7 steps; DD-07/DD-09), §4.7 (`realImport` export) | covered — C-03 edge-id guard recommended |
| FR-08 (clone via module instantiation only) | §4.2, §9; lifecycle guard asserted by AC-09 | covered |
| FR-09 (review canvas from model-scoped read) | §3.3, §4.4/DD-01, §4.8/DD-05 (`toJourneyData`, per-journey `chain`) | covered |
| FR-10 (should — direct manipulation) | §6 last bullet, §7 `ModelCanvas.tsx` row | **gap — C-02**: reorder persistence mechanism unimplementable as written |
| FR-11 (four view states) | §6 (loading/empty/error/ready → AC-12/13/14/11) | covered |
| FR-12 (active model, reload, isolation) | §3.4 (draft non-persistence), §4.4, §6 (`useActiveModel`) | covered |
| FR-13 (three routes, openapi, five codes) | §5.0/DD-06, §5.1, §5.3, §7 openapi row | covered — **conditional on C-01 ratification** |
| FR-14 (RBAC rows; four families; no re-map) | §5.2 (rows verified against on-disk matcher/neighbors) | covered (same condition) |
| NFR-01/02 (no new label/edge/store/role/perm) | §3 preamble, §4.3 payload constraints, AC-20 | covered |
| NFR-03 (model isolation, both sides) | §4.3 step 5 (DD-07/DD-09), §4.4, AC-18 incl. recovery case | covered |
| NFR-04 (central gate, zod-only, `/api/v1/`) | §4.3 step 1, §4.9 step 1, §5.1/§5.2 | covered |
| NFR-05 (tokens-only, `--view` conformance) | §6, AC-16 (enforced form verified in script) | covered |
| NFR-06 (must/should gating) | §1 rule 4, §8 (AC-15 isolated as should/manual) | covered |
| AC-01..AC-14, AC-16..AC-20 (must) | §8 — all approved ids verbatim; AC-10 single id, two artifacts; AC-08/AC-18 widened per DR3 recommendations (additive to the AC text, allowed) | covered |
| AC-15 (should) | §8 manual repro with input mode + observable outcome | procedure fine; mechanism gap = C-02 |
| Blueprint View Tree | `#/model/canvas` → `ModelCanvas`, owner verbatim (blueprint:101/112); `route.ts`/`SURFACES` untouched; placeholder swap at `views/index.tsx:162` verified real | pass |
| UX-01..06 | four states; tokens/catalog/`--view`; Platforms & Input Modes + Native Conflicts tables present in requirements (lines 193/210) and honored in §6; desktop-first; keyboard/ARIA (AC-17); verbatim route + reload (AC-19) | pass |
| XD-08 / XD-09 / XD-13 / XD-18 | central-gate persona §5.2; generate-then-edit surfaced §4.6; clone via module instantiation only §4.2/§9; real-Neo4j AC-06 | pass |
| House rules (en-US, zod-only, no tsc, no per-route auth, file ownership) | throughout; `routes/models.ts` untouched; `import.ts` = one `export` keyword | pass |

Every FR maps to ≥1 file-change row and every §7 row serves ≥1 FR — checked
row by row; no orphan file changes found.

## Summary

Rev 4 is implementable, honest about its one sanctioned deviation, and its
previously-unreviewed deltas (DD-09, the label check) are correct against the
real Cypher on disk. What this fresh pass adds is the first look at
`upsertEdge`'s actual MERGE semantics: the `should`-tier reorder story (FR-10)
needs a real mechanism before anyone builds it (C-02), and step 5 deserves an
edge-id endpoint-consistency guard symmetrical to its new label check (C-03) —
both bounded, both foldable into the already-owed tasks touch-up. The two
process gates (C-01 ratification, C-04 ledger reconciliation) must close
before execution starts. Approved with those four concerns recorded.
