---
feature: "model-workspace-core"
reviewing: "requirements"
reviewing_revision: 4
reviewer: "spec-review-agent"
verdict: "revise"
review_pass: 2
reviewed_at: "2026-07-04"
supersedes: "pass-2 review of revision 2 (verdict approve), whose findings C-06..C-11 + N-04..N-07/N-10 revision 4 resolves"
---

# Review: model-workspace-core / requirements (pass 2/2)

Reviewed cold against `.claude/skills/spec-review/SKILL.md`, the blueprint
(`.claude/specs/blueprint.md` — View Tree, UX-01..UX-06, XD-01..XD-18),
`.claude/CLAUDE.md` house rules, `.claude/specs/_baseline/`, and the live
codebase. This feature is marked execution:complete, so claims were verified
against shipped code, not just prior art. Every code citation below was
re-checked by this reviewer on 2026-07-04.

## Verdict

**revise** — revision 4 resolves all prior findings and its blueprint /
house-rule conformance is exemplary, but the spec's central invariant
("lifecycle state is mutated *only* through the lifecycle routes; published
version snapshots are immutable, **enforced server-side**") is falsified by a
write surface the requirements never enumerate: the `_baseline`
`POST /api/v1/import` upsert path (B-03). One blocker, two concerns, two nits.

## Codebase claims re-verified true for revision 4

- Blob prior art: `JourneySnapshot` via `HAS_SNAPSHOT`
  (`api/src/routes/journey-versions.ts:37-42,129-136`) — FR-06's blob decision
  matches the cited prior art.
- Registry-only endpoint validation: `api/src/storage/edges.ts` validates
  against `_OntologyEdgeEndpoint`; `createNodeLabel`/`createEdgeType` exist in
  `api/src/ontology/storage/{node-labels,edge-types}.ts`;
  `api/src/scripts/register-model-labels.ts` exists.
- All nine FR-13 error codes present in the closed enum
  (`api/src/errors.ts:37-45`), incl. `model_lifecycle_route_required` and
  `module_instance_node_not_member`.
- FR-12 mapping shipped (`api/src/auth/rbac-permissions.ts:264-310`):
  `model:*`/`module:*`, `DELETE /models/:id` → `model:write`, model-scoped
  instance write routes → `module:write`, specific-before-parameterized order.
- Lifecycle guard (`api/src/storage/model-lifecycle-guard.ts`) is wired into
  `api/src/routes/nodes.ts:21,35` and `api/src/routes/edges.ts:5,11` — and
  **nowhere else** (this is B-03).
- Cypher passthrough is read-only (`api/src/routes/query.ts:3,142` —
  `runPassthrough` via `read-only-session`); `GET /api/v1/snapshot` is
  export-only. Neither is an additional bypass.
- `scripts/design-conformance.ts` honors only `--view`/`--surface`; the bare
  positional form is inert ("no targets", exit 0 — lines 16-17,124-143). AC-16's
  two `--view <file>` invocations are the enforced form (C-11/D-5 fix holds).
- PWA: Model surface registered with `kbd:"0"` (`pwa/src/route.ts:108`),
  `App.tsx:51` handler now `/^[0-9]$/` — Risk 6's design decision landed as the
  requirements anticipated (the spec's description of the pre-change `[1-9]`
  state is historical context, not an error).
- Blueprint View Tree: FR-14's seven tabs + view components are
  token-for-token verbatim (`models`/ModelWorkspace, `canvas`/ModelCanvas,
  `stories`/StoryCatalog, `key-activities`/KeyActivityBoard,
  `kpi-impact`/KpiImpactMatrix, `systems`/SystemModeler, `export`/SpecExport).
  No route invented or renamed.

## Resolved prior findings (pass-2 review of rev 2)

- ~~C-06~~ → resolved. FR-06 fixes the **blob** snapshot representation;
  FR-08's "untouched" precised to "non-lifecycle write contract unchanged +
  constant-time label pre-check"; AC-06's generic arm asserts
  `model_lifecycle_route_required` only; `module_version_immutable` proven via
  the D-3 explicit-version publish collision (AC-04). Internally consistent.
- ~~C-07~~ → resolved. DEC-01 closed at the gate (shared reference nodes);
  recorded consistently in Risk 1, FR-18, Scope Boundaries.
- ~~C-08~~ → resolved. `404 module_instance_node_not_member` named in FR-08,
  FR-13, AC-06; present in the shipped enum.
- ~~C-09~~ → resolved. FR-18/AC-21 reworded to the `:modelId` path param + the
  `scopedNodeIds` helper proof; no `?model=` query parameter anywhere (agrees
  with rev-3 D-1).
- ~~C-10~~ → resolved. FR-10 `--down` scoped to Model #1's `IN_MODEL` edges +
  root, refuses without `--force` when other models exist; AC-08 asserts a
  second model survives.
- ~~C-11~~ → resolved. AC-16 uses two `--view <file>` invocations and calls the
  positional form out as inert.
- ~~N-04~~ / ~~N-06~~ / ~~N-07~~ / ~~N-10~~ → applied as described. N-05
  correctly needed no change.

The rev-4 revision note's claims about itself are accurate. The blocker below
is a hole no prior pass caught.

## Blockers

### B-03 — `POST /api/v1/import` bypasses the entire FR-08 lifecycle guard, falsifying FR-08's "only through the lifecycle routes" and NFR-04's "enforced server-side" claims

FR-08 (rev 4) states "lifecycle state is mutated *only* through the
`/api/v1/models*` / `/api/v1/modules*` routes" and that the generic-path
lifecycle-label rejection "**is** the complete generic-path immutability
protection"; NFR-04 states published version content is immutable, "Enforced
server-side". Both statements are false as specified. The `_baseline` import
route (`POST /api/v1/import`, permission `data:write` —
`api/src/auth/rbac-permissions.ts:35`) accepts **any** label
(`label: z.string().min(1)`, `api/src/routes/import.ts:32`) and writes via
`upsertNode`/`upsertEdge` (`import.ts:190-192,228`) — MERGE-on-id, exactly the
primitive that can overwrite a `BusinessModuleVersion`'s snapshot blob in
place, create a rogue `BusinessModel` (dodging FR-05's ordinal allocation and
at-most-one-reference enforcement), or inject
`IN_MODEL`/`INSTANTIATES`/`INSTANCE_IN` edges. The shipped guard
(`api/src/storage/model-lifecycle-guard.ts`) is wired into `nodes.ts` and
`edges.ts` **only** — import is unguarded in code today, and no FR, AC, or
scope note in this document mentions the import surface at all. This is the
same defect class as pass-1 B-02 (a write route bypassing the
reference-model/immutability protections), via the third write surface the
spec never enumerated. (I checked the remaining candidates: the Cypher
passthrough is read-only, `GET /api/v1/snapshot` is export-only, and
`POST /api/v1/ontology/import` writes ontology-registry entities, not
arbitrary-label graph nodes — graph import is the one residual bypass.)

There is a real decision buried here, not just a missing guard: after this
feature, `GET /api/v1/export` → `POST /api/v1/import` is the app's
backup/restore round-trip, and a restored graph legitimately **contains**
lifecycle nodes/edges. Blanket-rejecting lifecycle labels on import breaks
model backup/restore; silently allowing them voids NFR-04.

**Required fix (small, text-level; one of):**

1. Extend FR-08's guard set to `POST /api/v1/import`: import rejects rows
   whose label/type is in the lifecycle set (`409
   model_lifecycle_route_required`); Scope Boundaries names lifecycle-aware
   backup/restore as out of scope with an owner (a future spec adds the
   sanctioned restore path); add an AC arm (an import payload containing a
   `BusinessModel` row / `IN_MODEL` edge is rejected) — in AC-06 or a new
   AC-22; **or**
2. Declare `data:write` import the **sanctioned bulk/restore escape hatch**:
   scope NFR-04 and FR-08's "only through" claim accordingly ("…only through
   the lifecycle routes *or the admin-privileged import path*"), state the
   integrity caveat (import can produce lifecycle state that violates FR-05
   invariants), and add an AC pinning whichever behavior is chosen.

Either way, FR-08's "complete generic-path immutability protection" sentence
and NFR-04's absolute claim must be reworded to be true. The same sentence
should settle whether the seed path is covered (CLAUDE.md documents `bun run
seed` through `POST /api/v1/import`; the current `api/scripts/seed.ts:14`
posts to `/api/v1/ontology/import` — the graph import route is the surface
that matters regardless of which script fronts it). Option 1 is recommended:
it matches the shipped guard's philosophy and keeps NFR-04 true; since this is
the final requirements pass under the cap, apply it orchestrator-side exactly
as specified, with the corresponding guard call added in
`api/src/routes/import.ts`.

## Concerns

### C-12 — FR-08's enumerated generic-node guard omits the create route the design and code actually guard

FR-08 defines the guard as "any generic node write/delete (`PATCH`/`DELETE
/api/v1/nodes/:label/:id`)…" — the parenthetical omits `POST
/api/v1/nodes/:label` (create), which exists (`rbac-permissions.ts:41`) and
which the shipped guard **does** cover (`api/src/routes/nodes.ts:35`, the
POST handler). Without the create arm in the requirement text, a
spec-conformant implementation could allow generically creating rogue
lifecycle nodes. **Recommendation:** while fixing B-03, amend the
parenthetical to `POST /api/v1/nodes/:label` + `PATCH`/`DELETE
/api/v1/nodes/:label/:id`, and add "generic create of a lifecycle-labeled node
→ `409 model_lifecycle_route_required`" to AC-03 or AC-06 so the text matches
shipped behavior.

### C-13 — D-2/D-3 remain errata-only, so the FR-06/FR-07 body rows state a contract the build does not honor

Rev 4 reconciled body text with D-1/D-4/D-5 but deliberately left D-2
(required `targetDomainId` in the instantiate body), D-3 (explicit-version
publish mode), and the additive `POST /api/v1/models/:id/domains` route
errata-only. A reader of the FR-07 table row alone gets `{ moduleId,
version? }` — a request shape the shipped route rejects (`400` without
`targetDomainId`). The errata block's override rule saves the document
formally, but a single-row read is actively misleading on the two most-used
lifecycle calls. **Recommendation:** fold D-2/D-3 and the domains route into
the FR-06/FR-07 body rows in the same B-03 revision (or, at minimum, add
"(see rev-3 errata D-2/D-3)" pointers inside those two rows). No ID changes
needed.

## Nits

- **N-08** — AC-01 still reads "`BusinessModel` + the four
  module/version/instance labels" — a leftover of the retired five-label
  phrasing (FR-02 registers **three** labels; the total incl. `BusinessModel`
  is four). The N-10 sweep fixed NFR-01/AC-20/Dependencies but missed AC-01.
- **N-09** — the additive `POST /api/v1/models/:id/domains` route has no
  explicit AC; it is exercised only implicitly as AC-05/AC-06/AC-21 test
  setup. One sentence in the errata entry naming that implicit coverage would
  close the traceability loop.

## Completeness / Traceability

**FR → AC (rev 4):**

| FR | Covered by | Notes |
|----|-----------|-------|
| FR-01 BusinessModel label | AC-01, AC-20 | registry path verified in code |
| FR-02 module labels | AC-01 | N-08 count wording |
| FR-03 IN_MODEL + scope def | AC-02, AC-21 | registry wording matches `edges.ts` |
| FR-04 lifecycle edges | AC-02 | ok |
| FR-05 Model CRUD + DELETE | AC-03 | cascade incl. fork copies (N-07 fixed); **B-03**: import can bypass ordinal/reference invariants |
| FR-06 publish/versions (blob) | AC-04 | C-06 fixed; **C-13** D-3 errata-only |
| FR-07 instantiate | AC-05 | **C-13** D-2 errata-only (`targetDomainId`) |
| FR-08 fork + lifecycle guard | AC-06, AC-03 | C-08 fixed; **B-03** import path unguarded; **C-12** POST arm missing from text |
| FR-09 upgrade | AC-07 | ok |
| FR-10 migration | AC-08 | C-10 fixed (`--down` scoped + `--force`) |
| FR-11 RBAC role/persona | AC-09 | no-`node:write` rationale holds; note: `data:write` is the residual bypass (B-03) |
| FR-12 route-permission map | AC-10 | shipped mapping verified line-for-line |
| FR-13 API contract/errors | AC-03/04/06/07/10 | all 9 codes in the shipped enum |
| FR-14 Model surface + 7 tabs | AC-11, AC-17, AC-19 | View Tree verbatim; kbd "0" landed |
| FR-15 active-model context | AC-12, AC-18 | ok |
| FR-16 ModelWorkspace | AC-11..AC-17 | all four view states (UX-01); AC-16 non-vacuous (C-11 fixed) |
| FR-17 sibling placeholder | AC-19 | ownership matches blueprint |
| FR-18 scoped read | AC-21 | C-09/N-04 fixed; helper file exists (`api/src/storage/model-scope.ts`) |

**NFR:** NFR-01→AC-01/AC-20 pass; NFR-02→AC-08 pass; NFR-03(a)→AC-21,
(b)→AC-05/06 pass; **NFR-04→AC-04/AC-06 — claim currently false via import
(B-03)**; NFR-05→AC-20 pass; NFR-06→AC-16 pass.

**AC → FR:** every AC-01..AC-21 names its source FR/NFR; no orphan ACs.
`POST /api/v1/models/:id/domains` is the one route with only implicit AC
coverage (N-09).

| Check | Result |
|-------|--------|
| Every FR has ≥1 AC | pass (see table) |
| Every AC traces to an FR/NFR | pass |
| Routes/views match the blueprint View Tree verbatim | pass — all 7 Model tabs token-for-token |
| UX-* allowances covered in ACs | pass — UX-01→AC-13/14/15 (+AC-11/12 ready); UX-02→AC-16 (enforced `--view` form); UX-03 honestly n/a (no canvas here); UX-04→NFR-06; UX-05→AC-17; UX-06→AC-18 |
| XD-* cross-cutting decisions honoured | pass — XD-01 (registry-only), XD-02 (Neo4j, no new store), XD-06/XD-07, XD-08, XD-12, XD-17 (DEC-01 silent-accept) all traced |
| House rules (zod-only, no tsc, loopback, central-gate auth, en-US) | pass — NFR-05/FR-12 |
| Platforms & Input-Modes + Native Conflicts tables | present and accurate |
| No file ownership conflict with another spec | pass — `route.ts` ownership matches the blueprint's "one feature owns a file" rule |

**Done well:** every one of the six prior concerns and four nits was resolved
with a verifiable, code-anchored mechanism rather than wording cosmetics; the
blob decision (C-06) genuinely simplifies the immutability story; DEC-01 is
cleanly closed and consistently applied across FR-08/FR-10/FR-18; the
migration ACs (idempotent, scoped `--down`, `--force`, dry-run vs
`/api/v1/stats`) are exact and honest.

## Summary

- Rev 4 is blueprint-conformant end to end (View Tree verbatim, all UX-*
  satisfied, XD-01/02/06/07/08/12/17 traced) and closed every prior finding
  with mechanisms verified in shipped code.
- The single blocker is a coverage hole, not a design flaw: the spec's
  strongest invariant claims ("only through the lifecycle routes",
  "enforced server-side") are absolute, and `POST /api/v1/import`
  (MERGE-on-id, any label, `data:write`) falsifies them — unmentioned by any
  FR/AC/scope note and unguarded in code.
- Fix first: B-03 option 1 (extend the guard set to import + one AC arm +
  a named backup/restore scope boundary); fold C-12's `POST /api/v1/nodes`
  arm and C-13's D-2/D-3 body reconciliation into the same edit. All are
  text-level; no IDs need renumbering.
- Because this is the final requirements pass under the 2-pass cap, the
  revision should be applied orchestrator-side exactly as specified in B-03,
  with the matching one-line guard call added in `api/src/routes/import.ts`
  during execution follow-up.
