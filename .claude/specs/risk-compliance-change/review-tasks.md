---
feature: "risk-compliance-change"
artifact: "tasks.md (revised, 12 tasks)"
reviewing: "tasks"
reviewer: "spec-review-agent (fresh; did not author)"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: 2
---

# Review: risk-compliance-change — tasks.md (pass 2, re-review)

Re-reviewed cold against `requirements.md` (revised), `design.md`,
`.claude/CLAUDE.md`, and the as-built code. Every pass-1 finding was
re-checked for genuine resolution, and every load-bearing as-built claim the
resolutions depend on was re-verified against the four route files,
`router.ts`, `errors.ts`, the migrations, and `ci.yml`. All 12 tasks carry a
`Files` list (≤3 files each) and a concrete `Verification` field (test path or
`manual:` with input mode + observable outcome), so the completion-hook
blocker does not fire.

## Pass-1 findings — resolution status

| Prior | Status | Evidence in revision (verified against code) |
|-------|--------|----------------------------------------------|
| ~~B-01~~ compliance-rules emits `fieldErrors`, not `issues[]` | **resolved** | T-08 step 3 + the T-08 "AC-11 carve-out" now assert `400 invalid_payload` with `details.fieldErrors` (object of field→messages) and explicitly forbid an `issues[]` assertion; the route is kept out of the FR-09 `parseWith` list. Verified: `compliance-rules.ts:47-51`/`:91-96` hand-roll `error(400,"invalid_payload",…,{fieldErrors: parsed.error.flatten().fieldErrors})` via `safeParse` (never throws → router backstop unreachable). |
| ~~B-02~~ evaluate reads `?id=` query only, not body | **resolved** | T-08 step 3 (AC-09) now states evaluate is `POST /api/v1/compliance/rules/evaluate?id=<ruleId>`, "id as a query param, do not put it in the body," and "body/" is dropped. Verified: `compliance-rules.ts:128-134` reads `url.searchParams.get("id")` only. |
| ~~C-01~~ table-global `summary` collides with dirty-stack rerun | **resolved** | T-01 AC-03 step now pins `summary` to shape + relational invariants (`critical+high+medium+low === total`; status buckets sum to total; buckets are numbers) and forbids exact-count assertions, reserving those for the `GROUP BY` aggregations. Verified: `handleRiskAggregationSummary` (`:366-386`) is `COUNT(*) … FROM risk_register` with no WHERE/GROUP BY. |
| ~~C-02~~ `summary` shape under-specified | **resolved** | T-01 now enumerates the full key set: `open/mitigating/accepted/resolved_risks`, `max_severity`, `avg_severity`, four severity buckets, `escalated_risks`, `domains_affected`, `owners_involved`. Verified against the SELECT list at `:369-383`. |
| ~~C-03~~ typecheck is a no-op signal for the `bad_request` fix | **resolved** | T-05 verification makes the `bun -e` membership check the binding signal and downgrades `typecheck` to "still exit 0 — regression guard only; never surfaced the latent gap." |
| ~~C-04~~ AC-14 manual with no durable artifact | **resolved** | T-12 step 4 requires the AC-14 `verification_artifact` to be the Actions `integration`-job run URL plus the `run-migrations.ts` log excerpt showing 001/002/005. |
| ~~N-01~~ authoring order vs execution order | **resolved** | Reading-guide note: numbers are authoring order; execution order is the stage headers + `Blocked by`/`Blocks` edges. |
| ~~N-02~~ confirm T-05 hard predecessor of T-03 under off-ramp | **resolved** | T-03 "Dependency confirmation" states T-05 is a hard predecessor whenever step 3 is retained, and both drop together under the FR-11 off-ramp. |
| ~~N-03~~ T-09 fixture-to-query mapping | **resolved** | T-09 now cross-references each report's exact labels/relationships/properties (`regulatory_tags` list; directed `CONFLICTS_WITH` + same-`name` `Role`; `is_third_party:true`) so the fixture provably lands in the populated branch. |

All nine pass-1 findings are genuinely resolved, and each resolution matches
the as-built code — not merely reworded.

## New findings

### Blockers

None.

### Concerns

**C-01 (carried, requirements-level) — AC-11's requirements wording still
claims all four files return `issues[]` "via the shared `parseWith` channel";
that is false for `compliance-rules`.** The tasks file itself flags this
honestly (Traceability §"AC-11 shape split") and correctly pins the true
`fieldErrors` shape at the task level, so **no task is mis-authored** and the
verify-then-fix pin will be green on as-built code. The residual risk is only
that a reader who trusts requirements AC-11 verbatim (rather than the task
carve-out) could later "reconcile" the two by converting compliance-rules to
`parseWith` — an out-of-scope contract change. *Recommendation:* land a
one-line carve-out in requirements AC-11 ("compliance-rules pins
`details.fieldErrors`, not `issues[]`; not converted to `parseWith`") when the
requirements file is next touched. This does not gate tasks approval — it is a
documentation-alignment note the tasks author already escalated to the
orchestrator, and the task-level pins are correct as written.

### Nits

**N-01 — T-05's `bun -e` membership check is a `manual:` CLI signal, not a
committed test.** It proves the codes were added at authoring time but leaves
no durable regression guard that `invalid_transition`/`bad_request` stay in
`ERROR_CODES` (the OpenAPI enum registration in T-10 gives indirect coverage,
and T-03/T-08 exercise the codes at runtime, so this is genuinely minor).
Optional: fold a one-line membership assertion into an existing unit test.

## Completeness / Traceability

Every AC has a closing task and every FR an implementing task; the plan's
traceability table matches requirements. Dependency graph is acyclic and
correctly sequenced: T-05 (Stage 0) blocks T-03; T-01→T-02→T-06→{T-07,T-10};
T-08/T-09 independent; T-11 gated on the full suite; T-12 last. No task
touches more than 3 files (T-08 is the max, at 3). Verify-then-fix ordering is
preserved (pin green → fix → re-run in the same task).

| AC | Task(s) | As-built re-verified | Note |
|----|---------|----------------------|------|
| AC-01 | T-01 | yes — `escalation_level \|\| 1` (`:151`), empty-patch `invalid_payload` (`:266`) | solid |
| AC-02 | T-01 | yes — 8 filters + severity-desc order | solid |
| AC-03 | T-01 | yes — table-global `summary` + full key set | C-01/C-02 folded into T-01 assertion strategy |
| AC-04 | T-01 (+T-02) | yes | solid |
| AC-05 | T-03 | yes — forced `draft`, `.default([])`, JSONB, FK cascade | N-01 default preserved via T-07 |
| AC-06 | T-03 | yes — `{data,limit,offset}` + nested arrays | solid |
| AC-07 | T-03 | yes — DD-06 zod-vs-DB-check pinned | solid |
| AC-08 | T-03 (+T-05) | yes — DEC-01 set from real enum | `should` off-ramp defined; T-05 hard predecessor |
| AC-09 | T-08 | yes — path-id threading (`router.ts:591` computes id); evaluate `?id=` query only | B-02 resolved |
| AC-10 | T-09 | yes — 3 per-report empty shapes (`:59-63/100/138`) | N-03 fixture-to-query mapping added |
| AC-11 | T-02, T-03 (`issues[]`), T-08 (`fieldErrors`) | yes — two envelope shapes pinned to what code emits | B-01 resolved; requirements wording drift = C-01 above |
| AC-12 | T-02, T-03 | yes — both files import `{ v4 as uuidv4 }`; `ids.ts` permanent consumer | `should` off-ramp defined |
| AC-13 | T-10 | yes — compliance/rules already registered; others absent | solid |
| AC-14 | T-11 | yes — postgres service + migrate step + 001/002/005 present | durable artifact required in T-12 (C-04 resolved) |
| AC-15 | T-12 (+isolation) | yes — tracked-id cleanup | interacts with table-global `summary` (handled in T-01) |

**House-rule / blueprint conformance (all green):**
- `bad_request` confirmed absent from `ERROR_CODES` (`errors.ts:5-86`) yet
  emitted at `change-requests.ts:187` — a latent type gap `bun build
  --no-bundle` never surfaced; T-05's additive fix is correct and non-breaking.
- Both `ERROR_CODES` additions are additive (plain `as const` tuple, no
  exhaustiveness switch); NFR-03/versioning respected.
- No `pwa/` file touched — the "no View Tree / no UX-* / no design-conformance"
  claim holds; the blueprint's View-Tree-verbatim and UX-* laws do not bind an
  API+CI-only spec.
- zod-only, en-US, loopback, central-router-gate auth all respected. FR-12
  changes no path string, so RBAC rows are untouched (NFR-05); the router edit
  is argument-passing only, inside the owned `// Compliance rule routes` block.
- Migrations 001/002/005 exist; CI provisions `postgres:16-alpine`, runs
  `run-migrations.ts`, and `bun run test:integration` — FR-13 verify-first
  no-op is accurate.

## Verdict

**approve** — 0 blockers, 1 concern, 1 nit.

Both pass-1 blockers (compliance-rules `fieldErrors` envelope; evaluate
`?id=`-query id-source) are genuinely fixed at the task level and match the
as-built code; all four concerns and three nits are resolved. The single
remaining concern is a requirements-wording alignment the tasks author already
correctly escalated and defensively pinned at the task level — it does not
mis-author any test and is not a blocker. The plan is ready to execute.
