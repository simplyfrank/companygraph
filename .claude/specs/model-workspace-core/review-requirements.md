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

# Requirements Review (pass 2, revision 4): model-workspace-core

Reviewed cold against `.claude/skills/spec-review/SKILL.md`, the blueprint
(`.claude/specs/blueprint.md` — View Tree, UX-01..UX-06, XD-01..XD-18),
`.claude/CLAUDE.md` house rules, `.claude/specs/_baseline/`, and the live
codebase (note: this feature is mid-execution, so several claims were verified
against shipped code, not just prior art).

**Codebase claims re-verified true for revision 4:**

- Blob prior art: `JourneySnapshot` serialized snapshot content,
  `api/src/routes/journey-versions.ts:39,129-136` — FR-06's blob decision (C-06
  fix) matches the cited prior art ✓
- Registry-only endpoint validation against `_OntologyEdgeEndpoint` via the
  T-13 cache; `EDGE_ENDPOINTS` "off-limits to this module (registry-only)"
  (`api/src/storage/edges.ts:18,28`) ✓; `createNodeLabel` / `createEdgeType` +
  `_OntologyEdgeEndpoint` rows (`api/src/ontology/storage/{node-labels,edge-types}.ts:126-129,181-194`) ✓
- All eight FR-13 error codes present in the closed enum
  (`api/src/errors.ts:36-44`), incl. `model_lifecycle_route_required` and
  `module_instance_node_not_member` (C-08 fix landed) ✓
- FR-12 route-permission mapping shipped (`api/src/auth/rbac-permissions.ts:257-281`)
  with `model:*`/`module:*`, DELETE → `model:write`, model-scoped instance
  write routes → `module:write` ✓
- `scripts/design-conformance.ts` honors only `--view`/`--surface`; bare
  positional invocation is inert ("no targets", exit 0 —
  `design-conformance.ts:16-19,124-127,144`) — AC-16's `--view <file>` form
  (C-11/D-5 fix) is the enforced form ✓
- PWA: Model surface registered `kbd:"0"` (`pwa/src/route.ts:100`), `App.tsx:51`
  handler now `/^[0-9]$/` — Risk 6's design decision landed exactly as the
  requirements anticipated (spec text describing the pre-change `[1-9]` state is
  historical, not wrong) ✓
- DEC-01 recorded closed as option (a) in `design.md:138-139` and applied
  consistently (§4.4 fork copy-boundary, FR-18 scope set) — C-07 fix ✓
- Blueprint View Tree: FR-14's seven tabs + view components are token-for-token
  verbatim (`models`/ModelWorkspace, `canvas`/ModelCanvas, `stories`/StoryCatalog,
  `key-activities`/KeyActivityBoard, `kpi-impact`/KpiImpactMatrix,
  `systems`/SystemModeler, `export`/SpecExport) ✓ — no route invented or renamed.

## Resolved prior findings (pass-2 review of rev 2)

- ~~C-06~~ → resolved. FR-06 fixes the **blob** snapshot representation; FR-08's
  "untouched" precised to "non-lifecycle write contract unchanged +
  constant-time label pre-check"; AC-06's generic arm asserts
  `model_lifecycle_route_required` only; `module_version_immutable` proven via
  the D-3 explicit-version publish collision (AC-04). Internally consistent.
- ~~C-07~~ → resolved. DEC-01 closed at the gate (shared reference nodes);
  recorded in Risk 1, FR-18, Scope Boundaries, and design frontmatter/§2.
- ~~C-08~~ → resolved. `404 module_instance_node_not_member` named in FR-08,
  FR-13, AC-06; present in the shipped enum.
- ~~C-09~~ → resolved. FR-18/AC-21 reworded to the `:modelId` path param + the
  `scopedNodeIds` helper proof; no `?model=` query parameter anywhere (agrees
  with rev-3 D-1 and design rev-2 C-01).
- ~~C-10~~ → resolved. FR-10 `--down` scoped to Model #1's `IN_MODEL` edges +
  root, refuses without `--force` when other models exist; AC-08 asserts a
  second model survives.
- ~~C-11~~ → resolved. AC-16 uses two `--view <file>` invocations; the inert
  positional form is called out as proving nothing.
- ~~N-04~~ / ~~N-06~~ / ~~N-07~~ / ~~N-10~~ → applied as described (pinned-version
  content resolution; property-presence/transactional at-most-one-reference;
  forked-subtree copies in the delete cascade; four-label count in
  NFR-01/AC-20/Dependencies). N-05 correctly needed no change.

The rev-4 revision note's claims about itself are accurate — with the one new
finding below, which no prior pass caught.

## Blockers

### B-03 — `POST /api/v1/import` bypasses the entire FR-08 lifecycle guard, falsifying FR-08's "only through the lifecycle routes" and NFR-04's "enforced server-side" claims
FR-08 (rev 4) states "lifecycle state is mutated *only* through the
`/api/v1/models*` / `/api/v1/modules*` routes" and that the generic-path
lifecycle-label rejection "**is** the complete generic-path immutability
protection"; NFR-04 states "no route mutates a version's snapshot in place …
Enforced server-side". Both statements are false as specified: the `_baseline`
import route (`POST /api/v1/import`, permission `data:write`,
`rbac-permissions.ts:35`) accepts **any** label (`label: z.string().min(1)`,
`api/src/routes/import.ts:32`) and writes via `upsertNode`/`upsertEdge`
(`import.ts:190-192,228`) — MERGE-on-id, exactly the primitive that can
overwrite a `BusinessModuleVersion`'s snapshot blob in place, create a rogue
`BusinessModel` (dodging FR-05's ordinal allocation and at-most-one-reference
enforcement), or inject `IN_MODEL`/`INSTANTIATES` edges. The shipped guard
(`api/src/storage/model-lifecycle-guard.ts`) is wired into `nodes.ts` and
`edges.ts` only — import is unguarded in code today, and no FR, AC, or scope
note mentions it. This is the same defect class as pass-1 B-02 (a write route
that bypasses the reference-model/immutability protections), just via the third
write surface the spec never enumerated.

There is a real decision buried here, not just a missing guard: after this
feature, `GET /api/v1/export` → `POST /api/v1/import` is the app's
backup/restore round-trip, and a restored graph legitimately **contains**
lifecycle nodes/edges. Blanket-rejecting lifecycle labels on import would break
model backup/restore; silently allowing them voids NFR-04.

**Required fix (small, text-level; one of):**
1. Extend FR-08's guard set to `POST /api/v1/import`: import rejects rows whose
   label/type is in the lifecycle set (`409 model_lifecycle_route_required`),
   and Scope Boundaries names model backup/restore as out of scope with an
   owner (a future spec adds a sanctioned lifecycle-aware restore path); add an
   AC arm (an import payload containing a `BusinessModel` row / `IN_MODEL` edge
   is rejected) — e.g. in AC-06 or a new AC-22; **or**
2. Declare `data:write` import the **sanctioned bulk/restore escape hatch**:
   scope NFR-04 and FR-08's "only through" claim accordingly ("…only through
   the lifecycle routes *or the admin-privileged import path*"), state the
   integrity caveat, and add an AC pinning whichever behavior is chosen.

Either way FR-08's "complete generic-path immutability protection" sentence and
NFR-04's absolute claim must be reworded to be true. The seed loader
(`bun run seed`) shares the import path and should be covered by the same
sentence.

## Concerns

### C-12 — FR-08's enumerated generic-node guard omits the create route the design and code actually guard
FR-08 defines the guard as "any generic node write/delete (`PATCH`/`DELETE
/api/v1/nodes/:label/:id`)…" — the parenthetical omits `POST
/api/v1/nodes/:label` (create), which exists (`rbac-permissions.ts:41`) and
which design §4.6 / the shipped guard **do** cover (`nodes.ts:37`
`handleNodePost`). Without the create arm in the requirement, a spec-conformant
implementation could allow generically creating rogue lifecycle nodes.
**Recommendation:** while fixing B-03, amend the parenthetical to
`POST /api/v1/nodes/:label` + `PATCH`/`DELETE /api/v1/nodes/:label/:id`, and
add "generic create of a lifecycle-labeled node → `409
model_lifecycle_route_required`" to AC-06 or AC-03 so text matches shipped
behavior.

### C-13 — D-2/D-3 remain errata-only, so the FR-06/FR-07 body rows state a contract the build does not honor
Rev 4 reconciled body text with D-1/D-4/D-5 but deliberately left D-2 (required
`targetDomainId` in the instantiate body), D-3 (explicit-version publish mode),
and the additive `POST /api/v1/models/:id/domains` route errata-only. A reader
of the FR-07 table row alone gets `{ moduleId, version? }` — a request shape
the shipped route rejects (`400` without `targetDomainId`). The errata block's
override rule saves the document formally, but a single-row read is now
actively misleading on the two most-used lifecycle calls.
**Recommendation:** fold D-2/D-3 and the domains route into the FR-06/FR-07
body rows in the same B-03 revision (or, at minimum, add "(see rev-3 errata
D-2/D-3)" pointers inside those two rows). No ID changes needed.

## Nits

- **N-08** — AC-01 still reads "`BusinessModel` + the four
  module/version/instance labels" — a leftover of the retired five-label
  phrasing (FR-02 registers **three** labels; the total incl. `BusinessModel`
  is four). The N-10 sweep fixed NFR-01/AC-20/Dependencies but missed AC-01.
- **N-09** — the additive `POST /api/v1/models/:id/domains` route has no
  explicit AC; it is exercised only implicitly as AC-05/AC-06/AC-21 test setup
  (per design rev-3 C-06). One sentence in the errata entry naming that
  implicit coverage would close the traceability loop.

## Completeness / Traceability

**FR → AC (rev 4):**

| FR | Covered by | Notes |
|----|-----------|-------|
| FR-01 BusinessModel label | AC-01, AC-20 | registry path verified in code |
| FR-02 module labels | AC-01 | N-08 count wording |
| FR-03 IN_MODEL + scope def | AC-02, AC-21 | registry wording matches `edges.ts` |
| FR-04 lifecycle edges | AC-02 | ok |
| FR-05 Model CRUD + DELETE | AC-03 | cascade incl. fork copies (N-07 fixed); **B-03** import can bypass ordinal/reference invariants |
| FR-06 publish/versions (blob) | AC-04 | C-06 fixed; **C-13** D-3 errata-only |
| FR-07 instantiate | AC-05 | **C-13** D-2 errata-only (`targetDomainId`) |
| FR-08 fork + lifecycle guard | AC-06, AC-03 | C-08 fixed; **B-03** import path unguarded; **C-12** POST arm missing from text |
| FR-09 upgrade | AC-07 | ok |
| FR-10 migration | AC-08 | C-10 fixed (`--down` scoped + `--force`) |
| FR-11 RBAC role/persona | AC-09 | no-`node:write` rationale holds; B-03 note: `data:write` is the residual bypass |
| FR-12 route-permission map | AC-10 | shipped mapping verified line-for-line |
| FR-13 API contract/errors | AC-03/04/06/07/10 | all 8 codes in the shipped enum |
| FR-14 Model surface + 7 tabs | AC-11, AC-17, AC-19 | View Tree verbatim ✓; kbd "0" landed |
| FR-15 active-model context | AC-12, AC-18 | ok |
| FR-16 ModelWorkspace | AC-11..AC-17 | all four view states (UX-01) ✓; AC-16 now non-vacuous (C-11 fixed) |
| FR-17 sibling placeholder | AC-19 | ownership matches blueprint |
| FR-18 scoped read | AC-21 | C-09/N-04 fixed; helper + files exist |

**NFR:** NFR-01→AC-01/AC-20 ✓; NFR-02→AC-08 ✓; NFR-03(a)→AC-21, (b)→AC-05/06 ✓;
**NFR-04→AC-04/AC-06 — claim currently false via import (B-03)**; NFR-05→AC-20 ✓;
NFR-06→AC-16 ✓.

**AC → FR:** every AC-01..AC-21 names its source FR/NFR; no orphan ACs.
`POST /api/v1/models/:id/domains` is the one route with only implicit AC
coverage (N-09).

**Blueprint conformance:** routes + view names verbatim from the View Tree
(all seven Model tabs) ✓; UX-01→AC-13/14/15 (+AC-11/12 ready), UX-02→AC-16
(enforced `--view` form), UX-03 honestly n/a (no canvas here), UX-04→NFR-06,
UX-05→AC-17, UX-06→AC-18 ✓. XD-01 (registry-only labels), XD-02 (Neo4j, no new
store), XD-06/XD-07 (models + versioned modules), XD-08 (Business Architect via
existing RBAC), XD-12 (migration), XD-17 (DEC-01 silent-accept) all traced ✓.
House rules (zod-only, no tsc, loopback, central-gate auth, en-US) in
NFR-05/FR-12 ✓. Platforms & Input-Modes + Native Conflicts tables present and
accurate.

**Done well:** every one of the six prior concerns and four nits was resolved
with a verifiable, code-anchored mechanism rather than wording cosmetics; the
blob decision (C-06) genuinely simplifies the immutability story; DEC-01 is
cleanly closed and consistently applied across FR-08/FR-10/FR-18 and the
design; the migration ACs (idempotent, scoped `--down`, `--force`, dry-run vs
`/api/v1/stats`) are exact and honest.

## Verdict: revise

Revision 4 resolves all prior findings, and the blueprint/house-rule
conformance is exemplary — but the review's job is the hole nobody looked at:
**B-03**. The spec's central invariant ("lifecycle state is mutated only
through the lifecycle routes; version snapshots are immutable, enforced
server-side") is falsified by the unguarded `POST /api/v1/import` upsert path,
which no FR, AC, or scope note mentions, and which the mid-flight
implementation also leaves open. The fix is small and text-level (extend the
FR-08 guard set to import with a named backup/restore boundary, or explicitly
scope the NFR-04 claim around a sanctioned admin escape hatch — plus one AC
arm), and C-12/C-13 can ride in the same edit. Because this is the final
requirements pass under the cap, the revision should be applied
orchestrator-side exactly as specified in B-03 (option 1 recommended: it
matches the shipped guard's philosophy and keeps NFR-04 true), with the
corresponding one-line guard added in `api/src/routes/import.ts` during the
in-progress execution.
