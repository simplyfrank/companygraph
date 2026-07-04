---
feature: "business-model-authoring"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Review: business-model-authoring / requirements (pass 2/2)

## Verdict

**approve** — Revision 2 resolves both pass-1 blockers and all five concerns
against the *verified-on-disk* `model-workspace-core` and `story-spec-core`
interfaces. Every reconciliation was spot-checked against the real upstream
specs and `api/src/routes/import.ts`; all check out. One new **concern** (C-06,
the `story:write` permission omission in FR-14) and two nits remain — none is a
blocker. Since this is review pass 2/2, the feature is approved to proceed to
design with C-06 recorded as an open concern for design to close.

## Resolved from pass 1

- **~~B-01~~ → resolved.** `Role`/`System`/`Location` are now modeled as
  shared/global (DEC-01(a)). Verified against `model-workspace-core` design
  §1 rule 4 (line 95: "Reference nodes are shared … global across models") and
  §4.2/§4.4 (`scopedNodeIds` returns only Domain/journey/activity, line 380/387).
  FR-05 is now a **pick-or-create-global** role picker; AC-06 re-scopes the
  `EXECUTES` round-trip to assert the **`Activity`** end ∈ `scopedNodeIds`, not a
  "model Role"; AC-18 explicitly excludes `Role` from the isolation set. The
  XD-18 proof (AC-06 as a real-Neo4j integration test) is now internally
  consistent.
- **~~B-02~~ → resolved.** FR-14 now states both `must` write paths need
  `model:write` (authoring/apply) **and** `module:write` (clone route). Verified
  against mwc design line 716 (`POST …/module-instances` → `module:write`) and
  FR-11 (line 148 — `business_architect` carries `model:read/write` +
  `module:read/write`). AC-10 asserts both 403/success paths.
- **~~C-01~~ → resolved.** FR-02 adds the target-domain step: the clone first
  calls mwc's `POST /models/:id/domains` and passes the returned `Domain` id as
  the **required** `targetDomainId`. Verified against mwc design D-2 (line 169)
  and §3.4 (line 261) — `targetDomainId` is a required third field.
- **~~C-02~~ → resolved.** FR-03/FR-07 now delegate `Domain`+`IN_MODEL` creation
  to mwc's `POST /models/:id/domains` (design §4.3 / review C-06, verified line
  433/715); the authoring/apply endpoint writes only journeys/activities/roles
  and their edges. The duplicate-scoping defect is closed.
- **~~C-03~~ → resolved.** FR-07 now states the true facts: `realImport` is
  **not exported** (verified — `api/src/routes/import.ts` line 66 exports only
  `handleImport`; `realImport` at line 157 is private) and the return shape is
  `{ imported:{nodes,edges}, errors?: RowError[] }` (lines 108/160) with per-row
  `{section,index,code}` under `errors[]` (`RowError` interface, lines 43–46).
  OQ-1 default (a) correctly requires an export/seam. AC-08 asserts the real shape.
- **~~C-04~~ → resolved.** FR-07 now specifies the authoring handler generates a
  server-side UUIDv7 per new node/edge before the MERGE-on-id `import` write, so
  re-runs upsert idempotently. Correct against CLAUDE.md's "upsert MERGEs on
  client-supplied id" primitive.
- **~~C-05~~ → resolved.** FR-06/AC-07 now acknowledge `{created, skipped}` and
  require the wizard render a re-run's `created:0` as an idempotent "already
  generated" state. Verified against story-spec-core design line 351/361 (skip
  activities with ≥1 story; `skipped` counts them).
- **~~N-01/N-02/N-03~~ → resolved.** FR-13 hedge dropped; Summary leads with the
  core promise; AC-16 uses the enforced `--view` form (mwc D-5).

## Concerns

- **C-06 — FR-14 omits `story:write`, which the `must` Step 5 path exercises.**
  FR-06 (Step 5, `must`) drives `POST …/stories/bootstrap` and
  `POST/PATCH …/stories[/…/acceptance-criteria]`, every one of which
  `story-spec-core` maps to **`story:write`** (design lines 445–452; FR-11).
  Yet FR-14 enumerates the feature's `must` write-path permissions as "**both**
  `model:write` … **and** `module:write`" and concludes "the persona is fully
  covered." The persona *is* covered — story-spec-core FR-11 grants `story:read`
  + `story:write` to `business_architect` — but the requirement's enumeration is
  incomplete: a full `must` wizard run touches **three** permission families, not
  two, and the string `story:write` appears nowhere in this spec.
  *Recommendation:* in design, add `story:write`/`story:read` to FR-14's
  "permissions the feature exercises" list (noting they are mwc/story-spec-owned
  mappings this spec neither adds nor re-maps), and extend AC-10 (or add an AC)
  to assert a session lacking `story:write` is 403'd on the Step 5 bootstrap
  call. This closes the same class of gap B-02 fixed for the clone path.

## Nits

- **N-04 — C-04's "re-submitting reuses the ids the client already holds"
  presumes the apply response returns the server-generated ids.** For an
  idempotent re-run, the client must resubmit the exact UUIDv7s the server
  minted; that only works if `POST …/authoring/apply` returns the stamped ids
  (or the client keeps them from a prior read). The requirement is internally
  coherent, but design should make the id round-trip explicit (response echoes
  the generated ids) so the idempotency claim is realizable, not aspirational.
- **N-05 — OQ-2 (module granularity) resolution depends on facts not yet on
  disk.** The "clone all published retail-reference journey modules" default is
  reasonable, but it hinges on how many modules mwc's retail→Model-#1 migration
  actually publishes. Design must confirm the count against the real reference
  before AC-03 can assert the clone-all behavior; flag if the migration publishes
  a single spanning module vs. one-per-journey.

## Completeness / Traceability

| Check | Result |
|-------|--------|
| Every FR reaches an AC | **pass** — FR-01→AC-01/17; FR-02→AC-02/03; FR-03→AC-04; FR-04→AC-05; FR-05→AC-06; FR-06→AC-07; FR-07→AC-04/05/08; FR-08→AC-03/09; FR-09→AC-11; FR-10→AC-15 (should); FR-11→AC-11/12/13/14/16; FR-12→AC-18/19; FR-13→AC-10; FR-14→AC-10 |
| Every AC traces to ≥1 FR | **pass** — AC-01..AC-20 all cite FRs/NFRs; AC-20→NFR-01/04 |
| B-01 fix verified vs mwc | **pass** — DEC-01(a) shared Role/System/Location (mwc design §1 rule 4 / §4.2); AC-06 scopes to Activity membership |
| B-02 fix verified vs mwc | **pass** — `module-instances`→`module:write` (mwc design line 716); `business_architect` carries both (FR-11 line 148) |
| C-01 target-domain provenance | **pass** — required `targetDomainId` from mwc `POST /models/:id/domains` (D-2 line 169, §3.4) |
| C-02 domain-create delegation | **pass** — FR-03/FR-07 delegate to mwc §4.3 route; authoring/apply writes no `IN_MODEL` |
| C-03 import seam | **pass** — `realImport` confirmed private + shape `{imported,errors?}` w/ `RowError{section,index,code}` (import.ts:43–46,66,157,160) |
| C-04 server-side ids | **pass** — FR-07 states UUIDv7 minted server-side before MERGE (see N-04) |
| C-05 bootstrap idempotency | **pass** — `{created,skipped}` skip-≥1-story (story-spec design 351/361) |
| **story:write on Step 5 must path** | **gap → C-06** — persona covered, but FR-14's permission enumeration is incomplete |
| Routes/views verbatim vs blueprint View Tree | **pass** — `#/model/canvas`→`ModelCanvas`, owner `business-model-authoring`, verbatim; replaces mwc `ModelTabPlaceholder` (mwc design 697/745) |
| UX-* allowances in ACs | **pass** — UX-01 AC-11..14; UX-02 AC-16; UX-03 Platforms + Native Conflicts tables populated + AC-15/17; UX-05 AC-17; UX-06 AC-19 |
| XD-* cross-cutting honoured | **pass** — XD-01/02 NFR-01/AC-20; XD-13 FR-02/08; XD-18 FR-05/AC-06 (now internally consistent post-B-01) |
| All four view states | **pass** — AC-12 loading, AC-13 empty, AC-14 error, AC-11 ready |
| Platforms & Input-Modes + Native Conflicts | **pass** — both tables populated (canvas surface requires them) |
| No file-ownership conflict | **pass** — disclaims `route.ts`/`SURFACES`/placeholder to mwc; touches only `renderView` canvas dispatch + new `ModelCanvas.tsx` + one new route file |
| Dependency interfaces real | **verified on disk** — `import.ts` (handleImport/realImport/RowError), `JourneyCanvas.tsx`, `reactflow@^11.11.4`, catalog components, `design-conformance.ts`, `ROUTE_PERMISSIONS`, `ERROR_CODES` all present; mwc + story-spec-core specs expose every referenced route/permission |

## Summary

- **Solid:** Revision 2 is a disciplined, evidence-based reconciliation. Every
  pass-1 finding was re-checked against the approved upstream specs and the
  actual `import.ts` source, and each resolution is accurate — the shared/global
  Role model (B-01), the `module:write` clone mapping (B-02), the required
  `targetDomainId` provenance (C-01), the domain-attach delegation (C-02), the
  private-`realImport`/`errors[]` contract (C-03), server-side id generation
  (C-04), and bootstrap idempotency (C-05). Composition discipline holds: one new
  route, no new schema/store, verbatim View Tree route, full four-state +
  input-mode coverage, honest wave-3 sequencing. FR↔AC traceability is complete.
- **The one residual concern (C-06)** is the same class of gap B-02 closed, one
  permission over: FR-14 under-enumerates by omitting `story:write` even though
  the persona already carries it. It is not a blocker (no route added/re-mapped;
  persona fully covered) and is cheap to close in design.
- **Do first in design:** land C-06 (add `story:write`/`story:read` to FR-14's
  exercised-permission set + an AC-10 assertion), then N-04 (make the apply
  response echo server-generated ids so the idempotency claim is realizable) and
  N-05 (confirm retail-reference module count against the real migration).
</content>
</invoke>
