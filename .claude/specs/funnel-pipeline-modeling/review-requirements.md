---
feature: "funnel-pipeline-modeling"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "revise"
review_pass: 2
reviewed_at: "2026-07-06"
---

# Review: funnel-pipeline-modeling / requirements (pass 2/2)

## Verdict

**revise** — revision 2 cleanly closes every pass-1 finding (all four OQs are
now decided in-artifact, AC-06/AC-18 are deterministic, the `CONVERTS_TO` range
check has an ownership-safe home, the read scope-isolation is an AC, and the
Native Conflicts arrow-key row is demoted to a rejected note). The technical
verification remains excellent — every cited file, line, handler, and seam
still checks out against the codebase.

However, a cold read of the codebase surfaces **one new blocker the pass-1
review did not catch and rev-2 did not touch**: the spec's load-bearing
**idempotency claim** — that re-registering `Funnel`/`Stage`/`HAS_STAGE`/
`CONVERTS_TO` via `POST /api/v1/ontology/node-labels` / `.../edge-types` is
"a clean no-op, not a duplicate/error" — is **false against the current code**.
Those public routes are strict-CREATE and return `409 name_conflict` on a
duplicate. AC-01 asserts an outcome ("a second registration is a no-op — no
duplicate, no error") that the named route cannot produce. This must be fixed
in requirements because it is a `must`-FR mechanism and a tested AC, and Risk #5
(content-wave-2 unblock) depends on the registration being genuinely
re-runnable.

Because this is review pass 2 of 2, I am flagging it as a Blocker with a
concrete, small fix so it can land within the remaining budget.

## Blockers

- **B-03 (new) — The public registry-create route is strict-CREATE (`409
  name_conflict`), so the FR-01..FR-04 / NFR-03 / AC-01 "re-register is a clean
  no-op" claim is factually wrong; the spec never names a real idempotency
  mechanism.** Verified in the codebase:
  - `POST /api/v1/ontology/node-labels` → `handleCreateNodeLabel` →
    `createNodeLabel` (`api/src/ontology/storage/node-labels.ts`) runs a strict
    `CREATE (l:_OntologyNodeLabel …)` under the `_onto_node_label_name_unique`
    constraint (`api/src/ontology/meta-bootstrap.ts:24`); its catch block turns
    a constraint violation into **`ERROR_CODE_THROWERS.name_conflict`** — the
    header comment even documents `POST / → createNodeLabel → 201 NodeLabelRow`
    with no idempotent branch.
  - `POST /api/v1/ontology/edge-types` → `createEdgeType`
    (`api/src/ontology/storage/edge-types.ts:206`) is likewise "strict CREATE;
    409 on duplicate name" (its own comment, line 206/240).
  - The **only** idempotent registry path is the privileged seed loader's
    direct-driver `MERGE (l:_OntologyNodeLabel {name})` / `ON CREATE SET`
    (`api/src/ontology/seed.ts:235`, `seedRegistryFromConstTuples`), which
    iterates the **compile-time** `NODE_LABELS`/`EDGE_TYPES` tuples — the tuples
    this spec explicitly adds nothing to (XD-02 / NFR-01). There is no `PUT`/
    upsert route and no get-then-create guard in the handler
    (`api/src/router.ts:542-545` — only `GET` + `POST`).

  So every "Idempotent (re-register no-op)" clause in FR-01, FR-02, FR-03,
  FR-04, the NFR-03 "re-run adds nothing, errors nothing" claim, and
  **AC-01**'s tested assertion ("a second registration is a no-op — no
  duplicate, no error") are contradicted by the code as written. AC-01 as
  specified would **fail**: the second `POST` returns `409 name_conflict`.

  The sibling `saas-operator-foundation` hit exactly this reality and made it
  explicit — its runtime-catalog idempotency is keyed on a direct-driver
  `MERGE`-on-name / `seedKey` in the seed script, *not* a re-POST to a
  strict-CREATE route (foundation requirements FR-05; foundation review B-01/
  B-02 resolutions). This spec must do the same.

  **Fix (small, requirements-level):** name the idempotency mechanism for these
  four runtime constructs explicitly, and align AC-01 to it. Two acceptable
  shapes, pick one:
  (a) **Get-then-create guard in the funnel bootstrap/registration code owned
  by this spec:** `GET /api/v1/ontology/node-labels/Funnel` (and the edge-type
  equivalent); only `POST` when absent — so re-run is a no-op at the
  *registration-code* level, and the raw `POST` route is acknowledged to `409`
  on a bare duplicate. Rewrite AC-01 to assert "the registration routine run
  twice leaves exactly one `Funnel` label and errors nothing" (not "a second
  POST is a no-op").
  (b) **Direct-driver `MERGE`-on-name in a funnel-owned seed/bootstrap script**
  (mirroring `seed.ts:235` and the foundation pattern), acknowledged as the
  privileged idempotent path — with AC-01 asserting the MERGE re-run is
  net-zero. Then FR-01..FR-04's "via `POST /api/v1/ontology/node-labels`" must
  be softened to "the registration routine (get-then-create guard, or seed-time
  MERGE)" rather than a bare re-POST.

  Either way, Risk #5's mitigation ("registration must run as part of this
  feature's seed/bootstrap so the labels exist before any content seed loads")
  needs this to be genuinely re-runnable — today it is not.

## Concerns

- **C-05 (new) — FR-06/AC-02 rely on `Stage`'s `json_schema_doc` making
  `stageOrder` a *required integer*, but no FR pins that the attribute-zod cache
  actually enforces "required" for a runtime edge/node write of a runtime
  label.** The mechanism is real (`api/src/ontology/cache/attribute-zod.ts`
  compiles the label's JSON Schema to a zod validator called before every
  `createNode`), and AC-02 tests the non-integer rejection — good. But AC-02
  also implies `stageOrder` is *required*; whether the JSON-Schema `required`
  keyword survives the supported-subset compilation is a design-time
  verification, not proven here. **Recommendation:** leave AC-02 as-is but let
  the design confirm the `json_schema_doc` subset supports `required: [
  "stageOrder" ]` (or state stageOrder is optional-but-typed and drop the
  "requires" wording). Not blocking — the design owns the schema doc.

- **C-06 (new) — FR-09/AC-10 scope the funnel *listing* to "the funnels
  reachable from the operator root," but the graph relationship a `Funnel` uses
  to attach to the SaaS-Operator `BusinessModel` root is never named.** The
  composition read (FR-08/AC-09a) is safely keyed on the funnel `id` — fine. But
  the *listing* (FR-09) must traverse *from* the operator root to the funnels,
  and neither FR-09 nor the Dependencies name the edge that connects a `Funnel`
  to the root (FunctionMap uses `(:Domain)-[:IN_MODEL]->(m)` per
  `FunctionMap.tsx:43`; funnels presumably attach through a `Domain` or directly
  — unspecified). Without that edge, the AC-10 scoping Cypher cannot be written.
  **Recommendation:** FR-09 (or Dependencies) should name the funnel→root
  attachment path (e.g. `Funnel` is `PART_OF` a function `Domain` that is
  `IN_MODEL` the operator root, or a direct marker), or explicitly defer it to
  design with the note that content wave-2 owns *where* funnels attach. This is
  a real gap for AC-10's testability but is design-resolvable, hence concern not
  blocker.

- **C-07 (new, minor) — AC-11 tests overall conversion `0.5 × 0.4 = 0.20` for a
  "3-stage funnel," but three stages linear = two transitions, and the second
  rate 0.4 is a per-transition conversion.** The arithmetic is correct; the
  wording is fine. Only flagging that the AC should make clear the two rates are
  the *two* `CONVERTS_TO` transitions of the 3-stage chain (it does, implicitly).
  No change strictly required.

## Nits

- **N-04** — FR-05 and Risk #1 both spell out the full OQ-1 rejected-alternatives
  set inline; this is thorough but the FR body is now very long. Optional:
  move the rejected `(a-schema)/(b-inline)/(c)` enumeration entirely into Risk #1
  and keep FR-05 to the decided contract. Immaterial.

- **N-05** — The Summary still says "one `VIEWS` entry (its import + map line)
  replacement)" with an unbalanced paren (line 44). Cosmetic.

## Pass-1 findings — resolution status

| Pass-1 ID | Status in rev-2 |
|-----------|-----------------|
| ~~B-01~~ (4 open questions violate XD-09 zero-OQ gate) | **resolved** — OQ-1..OQ-4 all CLOSED in-artifact to the recommended defaults; each records the rejected alternative + rationale; "decision needed" framing dropped (Summary rev-2 note; Risks table #1-4 all "Closed"). |
| ~~B-02~~ (AC-06, AC-18 non-deterministic) | **resolved** — AC-06 asserts the single `400 attribute_violation` outcome; AC-18 asserts the single move-up/down-button affordance with "no arrow-key capture." |
| ~~C-01~~ (range check has no ownership-safe home) | **resolved** — FR-07 pins a new funnel-owned transition route (`POST /api/v1/funnels/transitions`) that range-validates then delegates to `createEdge`; NFR-02/AC-06/AC-21 assert no graph-core edge file is edited. Verified `edgeCreateSchema.attributes` is free and attribute-zod is node-only, so the premise holds. |
| ~~C-02~~ (passthrough read + scope isolation) | **resolved** — FR-08/FR-09 pin `POST /api/v1/query/cypher` (`query:read`, verified rbac-permissions.ts:67) as the decided path; new route demoted to design-only fallback; AC-09a (id-keyed composition isolation) + AC-10 (root-scoped listing excludes retail) added. |
| ~~C-03~~ (Native Conflicts arrow-key row conditional) | **resolved** — arrow-key capture demoted to an explicit rejected note in both FR-14 and the Native Conflicts table; the table now states concrete suppressions for the drag path only. |
| ~~C-04~~ (metric-library sibling empty) | **noted** — Summary rev-2 clarifies this spec does **not** depend on `saas-metric-library` (independent wave-1b siblings). Awareness only; correct. |
| ~~N-01~~ (single-stage `n/a` literal) | **resolved** — FR-11 now pins the literal `n/a` for zero-stage (empty state), one-stage, and branch cases. |
| ~~N-02~~ (`VIEWS` entry wording) | **resolved** — FR-12/NFR-02/AC-21 consistently say "one `VIEWS` entry (its import + map line)." |
| ~~N-03~~ (idempotency of `handleCreateNodeLabel` unverified) | **NOT resolved — escalated to B-03.** Pass-1 flagged this "for design"; the cold codebase check shows the route is strict-CREATE/`409`, contradicting the FR/AC-level idempotency claim, so it is a requirements blocker, not a design detail. |

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches a codebase-real capability | pass — all cited interfaces re-verified: `nodeLabelCreateSchema`/`edgeTypeCreateSchema` (ontology.ts), `handleCreateNodeLabel`/`handleCreateEdgeType`, `handleNodePost`+`parseRegistryLabel`, `validateEdge`/`edge_endpoint_label_mismatch` (storage/edges.ts:91), `attribute_violation` (errors.ts), free edge `attributes` (edges.ts:59), `handleCypher`+`query:read` (rbac:67), `api.cypher` (pwa/src/api.ts:159), FunctionMap `useActiveModel`/`saasOperatorRoot` precedent |
| Idempotency mechanism claimed by FRs is real | **fail** — FR-01..FR-04/NFR-03/AC-01 claim re-register-via-POST is a no-op; the route is strict-CREATE → `409 name_conflict` (B-03) |
| Every AC traces to ≥1 FR; each AC deterministic | pass — AC-01..AC-21 each cite FRs and now assert single outcomes (B-02 resolved). Exception: **AC-01** asserts an outcome the named route cannot produce (B-03) |
| Routes/views match blueprint View Tree verbatim | pass — `#/business/funnels` → `FunnelBoard` matches View Tree line 106/115; foundation pre-registers the placeholder |
| UX-* allowances covered in ACs | pass — UX-01 (AC-12..15), UX-02 (AC-16), UX-03 (AC-17/18 + Platforms & Native Conflicts tables now concrete), UX-05 (AC-19), UX-06 (AC-20) |
| Platforms & Input Modes + Native Conflicts tables present (UX-03 REQUIRED) | pass — both tables present and concrete (drag suppressions listed; keyboard path is plain buttons, no conflict) |
| XD-* cross-cutting decisions honoured | pass — XD-02 registry-only (NFR-01, AC-01/03/21); XD-03 no operational entities (scope-out); XD-05 route ownership (FR-12, NFR-02, AC-21); XD-09 zero-OQ gate now satisfied (all 4 OQs closed). |
| No file-ownership conflict with another spec | pass — FR-07 seam keeps the range check in a new funnel-owned route; NFR-02/AC-21 enumerate the forbidden files; PWA touches only `FunnelBoard.*` + one `VIEWS` entry |

**FR → AC coverage:** FR-01→AC-01; FR-02→AC-02; FR-03→AC-03; FR-04→AC-04;
FR-05→AC-05/06; FR-06→AC-02/07; FR-07→AC-05/06/08; FR-08→AC-09/09a; FR-09→AC-10;
FR-10→(house rule, asserted via AC-21 "no new RBAC permission" — acceptable);
FR-11→AC-11; FR-12→AC-20/AC-21; FR-13→AC-12/13/14/15/16; FR-14→AC-17/18/19;
FR-15 (`should`)→no AC (acceptable for a `should`). No orphan ACs.

## Summary

- **rev-2 is a strong, honest revision.** Every pass-1 blocker and concern is
  resolved with the recommended defaults, the rejected alternatives are recorded
  inline, and the ownership-safe `CONVERTS_TO` seam (FR-07) is well-argued and
  code-verified. The read-path scope isolation (AC-09a/AC-10) directly answers
  pass-1 C-02. This is close to approvable.
- **One new blocker (B-03):** the idempotency claim central to FR-01..FR-04,
  NFR-03, AC-01, and Risk #5 is contradicted by the codebase — the public
  registry-create routes are strict-CREATE (`409 name_conflict`), and the only
  idempotent path is the seed-loader MERGE over compile-time tuples this spec
  does not touch. Name the real mechanism (get-then-create guard, or funnel-owned
  seed-time MERGE, as foundation did) and align AC-01. Small, but it is a `must`
  mechanism and a tested AC that would fail as written.
- **Two design-resolvable concerns:** C-05 (does the `json_schema_doc` subset
  enforce `required: stageOrder`) and C-06 (name the `Funnel`→operator-root
  attachment edge so AC-10's scoping Cypher is writable).
- Fix B-03 (and fold C-06 into FR-09 while there); the rest are nits.
