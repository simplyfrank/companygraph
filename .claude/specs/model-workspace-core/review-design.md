---
feature: "model-workspace-core"
reviewing: "design"
reviewing_revision: 3
artifact: "design.md (revision 3, reviewing_requirements_revision: 2)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Design Review: model-workspace-core (re-review of revision 3 — final pass)

Re-reviewed `design.md` (rev 3) cold against `requirements.md` (rev 2),
`blueprint.md` (View Tree, UX-*, XD-*), `.claude/CLAUDE.md`,
`.claude/specs/_baseline/`, and the as-built codebase. Verified this pass:
`pwa/src/route.ts` (nine surfaces, `kbd` 1–9 — `kbd:"0"` for the tenth is
free), `pwa/src/App.tsx` (positional `/^[1-9]$/` Alt-branch, stale
`Alt+1..8` comment, Alt-branch not typing-guarded — all exactly as the design
states), `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS` is an ordered
array iterated first-match, so "specific before parameterized" is the correct
discipline), `api/src/routes/nodes.ts` + `edges.ts` (`handleNodePost/Patch/
Delete`, `handleEdgePost/Delete` exist as the §4.6 guard seams),
`api/src/ontology/storage/{node-labels,edge-types}.ts` (`createNodeLabel`,
`createEdgeType`), `api/src/routes/journey-versions.ts` (prior art exists),
`api/src/errors.ts` (`invalid_payload`/`not_found`/`edge_endpoint_label_
mismatch` exist; zero `model_*`/`module_*` collisions with the 9 new codes),
`api/src/scripts/seed-rbac-roles.ts` (`RBAC_ROLES` array, `x:*` permission
style) + `migrate-persona-hierarchy.ts` (persona pattern),
`scripts/design-conformance.ts` (`--view` mode real; inert without it —
matches Deviations Register D-5), `pwa/src/styles/companygraph/tokens.css`,
`pwa/src/views/_shared.tsx` (`Loading`/`ErrorState`), `/api/v1/stats` route
(AC-08 dry-run assertion target), root `package.json` (`typecheck` exists;
`migrate:model`/`register:model` correctly new), `api/src/storage/` (no
collision with the four new modules), `api/src/router.ts` (`sub.match(…)`
dispatch blocks as described).

Finding IDs continue the design-review series (pass 1: B-01, C-01–C-05,
N-01–N-04; pass 2: B-02, B-03, C-06–C-08, N-05–N-09). New this pass:
C-09–C-11, N-10–N-12.

## Status of prior findings

- ~~B-02~~ → **resolved.** `forkLocalKey` now stores the **full
  instance-qualified synthetic id** (`<instanceId>::<localKey>`), globally
  unique by construction (§3.4). All three previously-undefined steps now have
  queryable definitions: post-fork resolution = direct equality match,
  raw-UUID membership = `STARTS WITH <instanceId>::`, forked read anchor =
  `{forkLocalKey: <instanceId>::journey}` (§4.4, §4.5). Backing lookup indexes
  on `UserJourney.forkLocalKey`/`Activity.forkLocalKey` added to `applySchema`
  (§4.3); AC-06 gains the two-instances-same-model disambiguation assertion
  (§8). The fix is exactly the pass-2 recommendation. (Residual edge case on
  anchor deletion → new C-09.)
- ~~B-03~~ → **resolved.** The FR-08 sibling edge route is fully specified per
  option (a): `POST`/`DELETE /api/v1/models/:modelId/module-instances/
  :instanceId/edges`, addressed by `(type, from, to)` with synthetic-handle
  support (sidestepping the no-edge-ids-in-snapshot problem), per-type
  membership rules, fork-then-apply on a non-forked instance
  (first-edit-is-an-edge-edit closed), idempotent MERGE semantics, §5 rows
  with `module:write`, openapi registration, and AC-06 edge coverage (§4.4,
  §5, §8). Complete contract; no gaps found.
- ~~C-06~~ → **resolved.** `POST /api/v1/models/:id/domains` (`model:write`,
  `attachDomain` one-tx storage function, §4.3/§5) gives user-created models a
  sanctioned population path; AC-05/AC-06/AC-21 setups are API-only (§8), and
  the guard bypass is explicit (the `IN_MODEL` edge is written internally, not
  via the generic edge route).
- ~~C-07~~ → **resolved.** The migration collision guard now fires only when
  the reference model is **absent AND** a non-reference model exists; with the
  reference model present, re-runs proceed idempotently forever, and AC-08
  tests the re-run-after-user-model state (§4.7). (One remaining sequence,
  `--down` → re-apply with user models present, still aborts → new C-10.)
- ~~C-08~~ → **resolved within the design's power.** §2.1 Deviations Register
  records all five divergences (D-1 `?model=` dropped, D-2 `targetDomainId`,
  D-3 explicit-version publish, D-4 AC-06 single reading, D-5 AC-16 `--view`
  command) with the explicit instruction that the orchestrator land a
  requirements rev-3 errata before the tasks phase. The follow-through is
  outside this artifact → tracked as C-11.
- ~~N-05..N-09~~ → **applied** (checksum number wording §3.3; `::`
  path-segment note §3.4; N-07 folded into D-5; checksum-coverage wording
  §3.3; pinned-version-relative handle warning §4.5).

## Blockers

None.

## Concerns

### C-09 — Forked-instance behavior when the anchor journey is deleted via the generic route is unspecified
`UserJourney`/`Activity` are not lifecycle labels, so any `node:write` session
may `DELETE /api/v1/nodes/UserJourney/:id` on a materialized fork journey (the
`_baseline` contract this design deliberately leaves untouched). The instance
then remains `forked:true` while §4.5's read anchor
(`{forkLocalKey: <instanceId>::journey}`) matches nothing, and §4.4's
already-forked no-op read-back returns a partial/empty map. No section defines
what `listInstances` or the model-scoped write route returns in this state.
**Recommend (one sentence each in §4.5/§4.4):** forked read with a missing
anchor returns the instance envelope with empty content (never a 500); a
model-scoped write to any handle of such an instance returns
`404 module_instance_node_not_member`. Carry into the AC-06 or AC-07 test file
as a cheap extra assertion if the tasks author wants it.

### C-10 — Migration guard still aborts the `--down` → re-apply sequence when user models exist
§4.7's guard (fires when reference absent AND a non-reference exists) also
matches the state *after an explicit `--down`* with user models present:
migrate → user creates model #2 → `--down` (removes the reference model) →
re-apply aborts, and the unscoped retail domains can never be re-scoped
through the script. The actual hazard the guard protects against is narrower —
a non-reference model holding `ordinal:1` (pre-first-migration creation),
which would make step 2's `ON CREATE SET ordinal=1` violate the uniqueness
constraint; in the post-`--down` state `ordinal:1` is free and re-apply would
be correct and safe (MERGE is keyed on `isReference:true`, C-02 fix).
**Recommend:** key the abort on the real conflict — reference absent AND some
non-reference model has `ordinal = 1` — or document in the script header that
re-apply after `--down` with user models present is unsupported. NFR-02/AC-08
as written still pass either way, so this is not blocking.

### C-11 — The gating conditions recorded in §2.1 are not yet landed, and `tasks.md` predates revision 3
For the orchestrator, not the design author. (1) The requirements rev-3 errata
for D-1…D-5 (§2.1) has not been landed — `requirements.md` is still rev 2 with
the old AC-16/AC-21/FR-07/FR-06/AC-06 text. (2) `tasks.md` + `review-tasks.md`
were authored **before** design rev 3 and cannot cover its additions:
`POST /models/:id/domains`, the two instance-edge routes, the `forkLocalKey`
lookup indexes, the revised §4.7 guard, and the expanded AC-06 test scope.
**Recommend:** before execution, land the errata (include the additive
`POST /models/:id/domains` route for traceability, and fix the N-10 label
count while in there) and re-sync `tasks.md` against rev 3 — at minimum the
tasks covering `api/src/routes/models.ts`, `api/src/storage/{models,modules}.ts`,
`api/src/neo4j/bootstrap.ts`, openapi, and the AC-05/AC-06/AC-21 test files.

## Nits

- **N-10** — The label count is wrong throughout: §1 rule 1, §3 intro, and
  §4.1 say "five labels", but §3.1–§3.4 (and requirements FR-01/FR-02, whose
  AC-01 says "the four module/version/instance labels") define exactly
  **four**: `BusinessModel`, `BusinessModule`, `BusinessModuleVersion`,
  `ModuleInstance`. The enumerations are consistent and authoritative, so no
  behavior is at stake, but an implementer may hunt for a fifth label. Fix the
  count (and fold into the C-11 errata, since requirements NFR-01 repeats
  "five labels").
- **N-11** — `DELETE …/module-instances/:instanceId/edges` carries a JSON
  request body. RFC 9110 gives DELETE bodies no defined semantics and some
  intermediaries strip them; fine on this loopback + Vite-proxy stack, but add
  a one-line note (or fall back to `?type=&from=&to=` query params if a client
  ever misbehaves) so the tasks author doesn't relitigate it.
- **N-12** — §8 AC-05 says the two instances "read identical content", but
  §4.5 projects each virtual node's `id` as `<instanceId>::<localKey>` — the
  two reads differ in every `id` (and `forkLocalKey`) by construction. State
  that the AC-05 identity comparison is **modulo the projected handles**
  (names, descriptions, attributes, `precedes`/ref structure identical), so
  the test isn't written as a naive deep-equal that can never pass.

## Completeness / Traceability

### Functional requirements → design
| FR | Covered by | Status |
|----|-----------|--------|
| FR-01 BusinessModel label | §3.1, §4.1, §4.3 | ok |
| FR-02 module label set | §3.2–3.4, §4.1 | ok (N-10 count wording only) |
| FR-03 IN_MODEL edge | §3.5, §4.1 | ok |
| FR-04 lifecycle edges | §3.5, §4.1 | ok |
| FR-05 Model CRUD + ordinal + delete | §3.1, §4.3, §5 | ok (+ additive `:id/domains`, C-06 → record in errata per C-11) |
| FR-06 module publish/versions | §3.3, §4.4, §5 | ok (D-3 recorded in §2.1) |
| FR-07 instantiate + per-instance read | §3.4, §4.4, §4.5, §5 | ok — B-02 resolved (instance anchor); D-2 recorded |
| FR-08 fork on edit + sibling edge route + guards | §4.4, §4.6, §5 | ok — B-03 resolved (full edge-route contract); C-09 edge case open |
| FR-09 explicit upgrade | §4.5, §5 | ok (N-09 warning present) |
| FR-10 retail migration | §4.7 | ok (C-10 down→re-apply sequence) |
| FR-11 Business Architect RBAC/persona | §4.8 | ok |
| FR-12 route-permission mapping | §4.8, §5 | ok — every §5 row has a perm, incl. the B-03 edge routes + `:id/domains` |
| FR-13 openapi + error codes | §3.6, §5, §7 | ok — 9 codes, all reachable, edge routes registered |
| FR-14 Model surface + 7 tabs verbatim | §4.9, §6 | ok |
| FR-15 active-model context | §4.9 | ok |
| FR-16 ModelWorkspace + 4 states | §4.9, §6 | ok |
| FR-17 sibling-tab placeholder | §4.9, §6 | ok |
| FR-18 model-scope helper | §4.2 | ok (D-1 recorded in §2.1) |
| NFR-01 registry-only labels | §3, §4.1 | ok |
| NFR-02 idempotent/reversible migration | §4.7 | ok (C-10 caveat) |
| NFR-03a read isolation | §4.2 | ok |
| NFR-03b write isolation | §4.4 | ok — B-02 resolved; AC-06 disambiguation test added |
| NFR-04 version immutability | §3.3, §4.4, §4.6 | ok (structural + guard, single reachability for the 409) |
| NFR-05 house rules | throughout | ok (loopback/zod-only/central-gate/no-tsc/en-US) |
| NFR-06 tokens-only PWA | §6 | ok (`--view` invocation + `companygraph/tokens.css`) |

### Acceptance criteria → test artifact (§8)
All 21 ACs map to a named test file or a manual step with a concrete repro.
AC-05/AC-06/AC-07 are now writable (B-02 anchor exists); AC-06 carries the
B-02 disambiguation and B-03 edge-coverage assertions; AC-05/AC-21 setups are
API-only via `POST /models/:id/domains` (C-06); AC-08 covers the C-07 re-run
state; AC-16 uses the real `--view` invocation (D-5). Residual wording issues:
AC-05 identical-modulo-handles (N-12). AC-06/AC-16/AC-21 read per the §2.1
register, pending the C-11 errata.

### House-rule / blueprint conformance
- All routes under `/api/v1/`; auth only via the central router gate +
  `ROUTE_PERMISSIONS`; no per-route auth; no `public` routes — honoured.
- zod-only validation, no tsc, en-US identifiers, loopback binding — honoured.
- View Tree routes/tabs **verbatim**: `models, canvas, stories,
  key-activities, kpi-impact, systems, export` under `#/model/*` — exact
  match; `route.ts` ownership per blueprint; `kbd:"0"` viable against the
  real handler.
- UX-01 (four states, §6/AC-13–15) / UX-02 (tokens + `--view` conformance,
  AC-16) / UX-03 (n/a — no canvas here; tables in requirements reflect it) /
  UX-04 (no new breakpoints) / UX-05 (keyboard + ARIA, AC-17) / UX-06
  (verbatim routes + reload survival, AC-18) — all covered.
- XD-01/XD-02 (registry-only labels, Neo4j only), XD-06 (side-by-side models),
  XD-07 (publish/pin/fork/upgrade exactly as decided), XD-08 (Business
  Architect via existing RBAC), XD-12 (retail → Model #1, idempotent +
  reversible + dry-run) — honoured. DEC-01(a) applied consistently across
  §4.2/§4.4/§4.7.

## Verdict

**approve** — revision 3 closes both pass-2 blockers with exactly the
recommended mechanics, and every as-built claim verifies against the codebase.
B-02's instance-qualified `forkLocalKey` makes post-fork resolution,
membership, and per-instance reads queryable (with index backing and a
dedicated AC-06 disambiguation test); B-03's edge route is a complete,
endpoint-addressed contract with permissions, openapi, and test coverage;
C-06/C-07/C-08 are all landed. The remaining findings are non-blocking:
C-09 (missing-anchor read behavior, one sentence), C-10 (migration guard
over-fires on `--down` → re-apply with user models), and C-11 (orchestrator
must land the §2.1 requirements errata and re-sync the pre-rev-3 `tasks.md`
before execution — this is a hard sequencing condition of the approval, but a
process step, not a design defect). Nits N-10–N-12 can ride the errata. Review
budget for this phase is now exhausted; proceed to tasks re-sync.
