---
feature: "risk-compliance-change"
artifact: "design.md (draft, 2026-07-06)"
reviewing: "design"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-06"
---

# Design Review: risk-compliance-change (pass 1 of ≤2)

## Verdict: approve

This is a conservative, unusually well-grounded backfill design. I came to
it cold and re-verified every load-bearing as-built claim against the tree,
not against the requirements. All of them check out to the line:

- Both Postgres route files call bare `.parse()` and mint ids with
  `import { v4 as uuidv4 } from 'uuid'` (`risk-register.ts:2,127,164`;
  `change-requests.ts:2,109,139,215,222,238,245`). ✔
- The compliance-rules router/handler id mismatch is real: `router.ts`
  computes `const id = decodeURIComponent(ruleOne[1]!)` then calls
  `handleComplianceRule(req)` / `handlePatchComplianceRule(req)` /
  `handleDeleteComplianceRule(req)` discarding it; the three handlers read
  `url.searchParams.get("id")` (`compliance-rules.ts:67,83,111`) and 400 on
  its absence. `evaluate` is dispatched as the fixed literal
  `compliance/rules/evaluate` and reads `?id=` (`:131`). ✔ (FR-12/C-05 exact)
- Exactly **five** aggregation handlers/router lines/RBAC rows. ✔
- The three risk-compliance envelopes are exactly as §4.5 pins them:
  inventory `{domains,regulations,matrix}` with **no `count`**;
  `{violations,count}`; `{register,count}`. ✔
- Migrations `001/002/005` exist; the CI `integration` job already has the
  `postgres:16-alpine` service, `POSTGRES_URI`, the `run-migrations.ts`
  step, a server-boot step, and `bun run test:integration`. ✔
- RBAC rows exist for every owned path (`rbac-permissions.ts:130-161`);
  FR-12 changes no path string, so no row changes — correct. ✔
- `parseWith` (`_helpers.ts:84`) and the router's dual `ValidationError` /
  `ZodError` catch (`router.ts:302-309`) exist as described. ✔
- The router blocks are exactly where §4.7 places them, and the ontology
  block (RDF/query/rollback/node-labels/edge-types) is genuinely
  interleaved between the compliance-rules block and the change-request
  block — the partial-ownership rule is accurate and necessary. ✔

Every FR maps to a file change and to a closing AC (§9 traceability table
is complete and correct). The UI section is correctly "None" — this is
API+CI only, touches no `pwa/` file, invents no View Tree route, so UX-*
and the verbatim-route rule are vacuously satisfied.

Zero blockers. Three concerns and two nits, all landing comfortably inside
the remaining review budget (this is pass 1; at most one re-review remains,
but none of these require it — they can be absorbed during task authoring).

---

## Concerns

### C-01 — FR-09's stated defect ("byte-identical envelope") is inaccurate; the two 400 envelopes are *already* identical

§4.2 argues the `.parse()` → `parseWith` conversion is needed because the
router's `ZodError` backstop produces a different `issues[]` shape than the
canonical `parseWith` one. That is not what the code does. The `ZodError`
branch at `router.ts:304-309` maps issues **identically** to `parseWith`
(`_helpers.ts:87-89`): both emit `code:"invalid_payload"`,
`message:"invalid_payload"`, and `issues:[{path: i.path.join("."),
message, code}]`. `fromValidationError` sets `message = e.code =
"invalid_payload"`; the ZodError branch hard-codes the same string. So the
400 envelope is already byte-identical today — the conversion changes
nothing observable at the wire.

This does not invalidate the change (routing both files through one helper
is legitimate single-code-path hygiene and lets AC-11 assert one channel),
but the design's justification is wrong and the §7 "verify-then-fix" framing
implies a behavior the pin test cannot actually catch drift on.
**Recommendation:** restate FR-09/§4.2 as "consolidate onto the shared
`parseWith` channel for maintainability; the emitted 400 envelope is
unchanged (already byte-identical via the router's ZodError backstop)."
Keep the pin test, but scope its assertion to "400 + code + `issues[]`
present," not "the conversion changed the shape."

### C-02 — DD-07 defers a decision that is already decidable, and mislabels the runtime consequence

§4.2 / DD-07 hedge on whether `bad_request` is in `ERROR_CODES`, calling it
"verify at task time." It is verifiable now and the answer is definitive:
`bad_request` is **absent** from the `ERROR_CODES` tuple
(`errors.ts:5-86`), yet `change-requests.ts:187` calls
`error(400, 'bad_request', …)`. `error()` is typed `code: ErrorCode`
(`_helpers.ts:30`), so this is a **real type error** that only survives
because the house `typecheck` script is `bun build --no-bundle` (type
stripping, not checking) — NFR-02's "`bun run typecheck` green throughout"
is green precisely because Bun never type-checks this line. The design
already reaches the right minimal fix (add `bad_request` additively rather
than change the emitted code), but presenting it as an open question invites
a task to skip it. **Recommendation:** promote DD-07 from conditional to
decided — "`bad_request` is confirmed absent; the design adds it to
`ERROR_CODES` additively alongside `invalid_transition`." Note that both
additions must clear whatever exhaustiveness assertion the OpenAPI
`errorEnvelope` test enforces (requirements N-04 flagged the same for
`invalid_transition`; the same applies to `bad_request`).

### C-03 — aggregation read shapes come back as strings; §4.5 pins values without warning the test author

§4.5 and AC-03 pin the aggregation rollups ("status counts,
`avg_severity`/`max_severity` present; four severity buckets"). Under the
`pg` driver these columns are `bigint` (COUNT) and `numeric` (AVG) which
deserialize as **strings**, not numbers — and `escalation_level`
threshold-filtered rows compare an integer column against
`parseInt(escalation_level)`. A test that asserts
`expect(row.total_risks).toBe(3)` will fail against `"3"`. The design pins
the SQL faithfully but never tells the test author the wire types are
stringified, which is exactly the kind of foot-gun the "pin the exact
as-built shape" mandate exists to surface. **Recommendation:** add a
sentence to §4.5 (and the §7 fixture-seeding notes) stating that Postgres
numeric/bigint aggregates round-trip as strings, so AC-03 assertions must
use `Number(row.total_risks)` / string equality, matching whatever
`sla-compliance.integration.test.ts` already does for its Postgres counts.

---

## Nits

### N-01 — DD-05 moves the route files' inline zod schemas into a new shared module; confirm no runtime-value drift on the `.default([])` case

§4.6/DD-05 move `createChangeRequestSchema` et al. into
`shared/src/schema/risk-change.ts`. `createChangeRequestSchema` carries
`dependencyImpacts: z.array(...).default([])` (`change-requests.ts:14`) —
a schema with a runtime default, not just a type. The move is "identical
schema," but a default is behavior; ensure the moved schema keeps the
`.default([])` so AC-05's "`dependency_impacts` defaults to `[]`" still
holds. Purely a task-time caution; no design change needed.

### N-02 — feature is still absent from the blueprint Feature Inventory (carried from requirements N-05)

`risk-compliance-change` is not in the blueprint's Feature Inventory table
(unlike sibling `kpi-okr-governance`). The design inherits this. It is a
bookkeeping gap, not a scope conflict — the work is directly commissioned
by the governance-backfill brief and mirrors the sanctioned XD-16 posture.
Recommend the consolidated report note this backfill ran outside the
inventory (or add an inventory row). No design change required.

---

## Completeness / Traceability

Design sections are all present and substantive: overview, requirements-
resolutions carry-over (§2), data model (§3, as-built pinned), core logic
(§4), HTTP surface (§5), UI (§6, correctly none), test strategy (§7), file
changes (§8), traceability (§9), decisions (§10), rejected alternatives
(§11).

| FR | Design coverage | Closing AC | Verified against code |
|----|-----------------|-----------|-----------------------|
| FR-01 risk CRUD | §4.5, §5, §7 | AC-01 | ✔ envelopes/escalation-default `\|\|1` (`:151`)/404s |
| FR-02 filters+5 aggregations | §4.5, §5 | AC-02, AC-03 | ✔ 8 filters (`:59-105`), 5 handlers (`:292-386`) |
| FR-03 risk validation | §3.1, §4.2 | AC-04 | ✔ zod `[1,5]` + enums (`:11-22`) |
| FR-04 change-request CRUD | §3.2/3.3, §4.5, §5 | AC-05, AC-06 | ✔ forced draft (`:124`), JSONB, cascade |
| FR-05 reviews+sign-offs | §3.2, §5 | AC-07 | ✔ enums (`:28-36`), `signed_at` iff signed (`:247`) |
| FR-06 compliance CRUD+evaluate | §3.4, §4.5.1, §5 | AC-09 | ✔ path vs literal evaluate exact |
| FR-07 risk-compliance reports | §3.5, §4.5, §7 | AC-10 | ✔ three per-report envelopes exact |
| FR-08 OpenAPI coverage | §4.6, §8 | AC-13 | ✔ 3 surfaces absent; registry pattern (`openapi.ts:446-530`) |
| FR-09 zod→400 | §4.2 | AC-04, AC-07, AC-11 | ✔ `parseWith` exists — but see **C-01** (already identical) |
| FR-10 UUIDv7 (should) | §4.3 | AC-12 | ✔ v4 in both files; `ids.ts` v7; off-ramp present |
| FR-11 transition guard (should) | §3.6, §4.4 | AC-08 | ✔ enum pinned to `001:9`+zod; off-ramp present |
| FR-12 path routing | §4.5.1, §4.7 | AC-09 | ✔ router discards id; handlers read `?id=` |
| FR-13 Postgres in CI | §4.8 | AC-14 | ✔ service+migrations 001/002/005+run step |
| FR-14 self-provisioning | §4.8, §7 | AC-14, AC-15 | ✔ mirrors `sla-compliance.integration.test.ts` |

Additive-code accounting: the design adds `invalid_transition` (§3.6,
confirmed absent) and — per **C-02** — must also add `bad_request`
(confirmed absent). Both are non-breaking additive `ERROR_CODES` members
per NFR-11; both must clear the exhaustiveness/OpenAPI-enum assertion.

**House-rule / blueprint conformance:** zod-only (no second validator);
en-US identifiers; no `tsc`; loopback `127.0.0.1:8787` retained; auth stays
in the central router gate with existing `risk:*`/`compliance:*`/
`change_request:*` RBAC rows (no per-route auth added); all changes
additive under `/api/v1/` except the two argued defect-fix retirements
(DEC-01 guard on a previously-unconstrained field, DEC-03 undocumented
`?id=` form) — both correctly reasoned as non-`/api/v2/` changes. Router
partial-ownership rule (§4.7) is accurate and the ontology block is
correctly excluded. No View Tree route invented; UX-* n/a.

**What's done well:** the pin-then-fix ordering, the honest treatment of
the three distinct report envelopes (no invented `count`), the explicit
`should` off-ramps wired to the deterministic gate, and the router
section-comment anchoring (immune to line drift) are all exactly right for
a backfill under single-shot mode.

---

## Summary for orchestrator
- **Verdict:** approve
- **Blockers:** 0
- **Concerns:** 3 — C-01 (FR-09's "byte-identical" defect is inaccurate;
  envelopes already identical, restate the justification); C-02 (DD-07 is
  decidable now — `bad_request` is confirmed absent, promote to a decided
  additive fix); C-03 (pin note missing that Postgres aggregates round-trip
  as strings — AC-03 assertions will trip on it)
- **Nits:** 2 — N-01 (preserve `.default([])` when moving schemas to shared);
  N-02 (feature absent from blueprint inventory, carried from requirements)
- All three concerns are addressable during task authoring; none forces a
  re-review.
