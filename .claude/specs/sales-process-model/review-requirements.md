---
feature: "sales-process-model"
artifact: "requirements.md (revised, rev 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Review: sales-process-model / requirements (pass 2)

## Context verified against reality

I re-read the revised artifact cold, then the pass-1 review, the blueprint,
CLAUDE.md, and the six dependency specs it cites, and I re-grepped the actual
codebase to independently re-confirm every load-bearing interface claim (not
trusting the "verified" annotations the author added in rev 1). The dependency
research is exceptionally accurate — every claim I checked holds at the source:

- **Loader throws on row errors** — `api/scripts/seed-saas-operator.ts:67-68`
  throws on any per-row `errors[]`. This is the structural fact that forces the
  id-referencing edges out of `sales.json` (B-01). ✔
- **`seed:sales` sibling pattern** — `api/scripts/seed-saas-metric-library.ts`
  exists as the self-owned register/resolve-then-write sibling the resolver
  mirrors. ✔
- **`linkKpiToMetric` is the sole `MEASURES` path** — `api/src/seed/link-kpi-metric.ts`
  header states "content specs IMPORT this helper — there is no replicate-the-two-step
  alternative"; it runs the at-most-one pre-check and throws
  `KpiMetricAlreadyLinkedError` (helper-local 409, not an `ERROR_CODES` member,
  so `api/src/errors.ts` is untouched). ✔ FR-05's "sole sanctioned path" is
  correct.
- **Metric catalog** — `shared/seed/saas-metric-library/metrics.json` seeds
  `metric-win-rate` + `metric-pipeline-conversion` (FR-05a) and does **not**
  seed sales-cycle / ACV / quota-attainment (FR-05b/OQ-2). Confirmed absent. ✔
- **Funnel transition route + range guard** — `funnel-pipeline-modeling` FR-05/FR-07
  put the `[0,1]` check on the funnel-owned `POST /api/v1/funnels/transitions`
  route returning `400 attribute_violation`; the generic edge path does no
  per-edge-type attribute validation. FR-08/AC-08 are accurate. ✔
- **Story route scope + cardinality** — `story-spec-core` FR-05 assembles
  `narrative` server-side, wires `DESCRIBES_ACTIVITY`(+`STORY_FOR_ROLE`), and
  enforces `activityId ∈ scopedNodeIds(:modelId)` → `404 story_activity_not_in_model`;
  FR-03 fixes exactly-one `DESCRIBES_ACTIVITY` / at-most-one `STORY_FOR_ROLE`.
  FR-09/AC-09 are accurate. ✔
- **DDD `CAPABILITY_IN_MODEL` authoritative** — `ddd-system-modeling` FR-04
  writes `CAPABILITY_IN_MODEL` in the create tx (exactly one per capability).
  FR-11/AC-10 are accurate. ✔
- **Governed-API helper + catalog seedKeys** — `api/src/seed/governed-seed-helper.ts`
  (`RiskSeedRow` → `POST /api/v1/risk-register`) exists;
  `ensure-function-domains.ts:23` seeds `Sales` with `seedKey:"sales"`;
  `saas-operator-catalog.ts` has `seedKey:"crm"`, `"moms"`, `"sales_lead"`;
  `ensure-operator-root.ts` marks the root `saasOperatorRoot:true`. ✔
- **Risk GET has no `name` filter** — `api/src/routes/risk-register.ts` filters
  by `domain` but not `name`, so NFR-03/AC-12's client-side dedupe by `name`
  within `domain:"Sales"` is the correct approach. ✔

## Pass-1 findings — resolution status

- **~~B-01~~ → resolved.** OQ-1 is decided (option b). The feature-owned
  `seed:sales` resolver (`api/scripts/seed-sales.ts`) is a definite owned file
  (NFR-02, Scope). The three-way cross-entrypoint ordering is stated in the
  Summary and NFR-06. NFR-03 and AC-12 are rewritten to run the **full sequence**
  (`seed:saas-metric-library` → `seed:saas-operator` → `seed:sales`) and assert
  both idempotency **and completeness** (cross-reference edges present), closing
  the pass-1 hole where AC-12 could pass on an incomplete graph.
- **~~B-02~~ → resolved.** FR-05/FR-08/FR-09/FR-10/FR-11 are each pinned to their
  governed route ("**never** as raw `sales.json` rows") and each affected AC now
  asserts the invariant: AC-05 (at-most-one `MEASURES` + fixture grep-empty),
  AC-08 (range guard fires on `1.5` + fixture grep-empty), AC-09 (exactly-one
  `DESCRIBES_ACTIVITY`, at-most-one `STORY_FOR_ROLE`, `activityId` scope-check),
  AC-10 (exactly-one `CAPABILITY_IN_MODEL` targeting the operator root only).
  A guard-bypassing import fixture can no longer green-light these ACs.
- **~~C-01~~ → resolved.** FR-05 split into FR-05a (unconditional) + FR-05b
  (metric-library-conditional); AC-05a added — every Sales KPI must have a
  `MEASURES` edge or the seed fails, so a half-landed OQ-2 cannot ship an
  ungrounded KPI. OQ-2 correctly recorded as the sole remaining user decision +
  a new upstream dependency edge.
- **~~C-02~~ → resolved (with one residual pin, see C-01 below).**
- **~~C-03~~ → resolved.** AC-14 re-scoped to the whole seeded subgraph;
  "bijection" dropped for a coverage assertion allowing the two reference-only
  rows.
- **~~C-04~~ → resolved.** `seed:sales` is a definite owned file in NFR-02;
  AC-15's `git diff --stat` allowance updated to include it.
- **~~C-05~~ → resolved.** Dedupe key named (`name` within `domain:"Sales"`),
  read confirmed to return all Sales rows; AC-12 asserts no duplicate rows.
- **~~N-01/N-02~~ → resolved.** `MEASURES` used throughout; CPQ made non-optional
  (FR-04, FR-11) so FR-11's "Price and quote a deal `SUPPORTED_BY` CPQ" example
  is backed by a real system.
- **~~N-03~~ → resolved (still correct).** Platforms & Input Modes "n/a" is
  well-argued and matches the blueprint (UX-03 requires the table only for
  FunnelBoard, which this spec does not own).

All two blockers and five concerns from pass 1 are addressed. The rev-1 changes
are consistent and did not introduce contradictions.

## Findings (pass 2)

### Blockers

None.

### Concerns

**C-01 (new) — FR-07/AC-07's funnel-anchor mechanism still lists a disjunct
that the `funnel-pipeline-modeling` *design* has already foreclosed.** FR-07 says
the resolver anchors the funnel using "**either** a `Funnel` attribute keyed to
the operator model (`attributes.modelId`/`operatorSeedKey`) **or** an authored
reachability edge that FR-09's traversal walks (e.g. anchoring the funnel to the
Sales `Domain`/journey)." But `funnel-pipeline-modeling`'s **design is already
approved** and pins its listing scope to a **funnel-carried `attributes.modelId`
marker** (`funnel-pipeline-modeling/design.md:70-74`, Rule D), and it explicitly
**rejects** the reachability-edge branch — "a new `PART_OF` `Funnel→Domain`
endpoint pair for listing scope … rejected" (`design.md:87-89`). So the "authored
reachability edge" alternative in sales FR-07 will not be traversed by FR-09's
shipped Cypher; a funnel anchored that way would silently fail AC-07. This is not
a blocker — FR-07 already says "the exact anchor is pinned at design against
FR-09's shipped listing Cypher," and that Cypher is now knowable — but the
disjunct is stale and should be closed to avoid the design picking the dead
branch. *Recommendation:* at design, pin the anchor to `attributes.modelId` =
the resolved SaaS-Operator root id set on the `Funnel` node (matching
`funnel-pipeline-modeling/design.md` Rule D), and drop the reachability-edge
alternative from FR-07. `operatorSeedKey` is also unusable unless FR-09's query
actually keys on it — `modelId` (the root's server-generated id, resolved at seed
time) is the mechanism the funnel design ships.

**C-02 (carried, low) — OQ-2 remains a live user decision that gates FR-05b and
introduces an off-graph upstream dependency edge.** This is correctly recorded
(FR-05b, Dependencies, STATUS.md) and correctly de-risked via the FR-05a/FR-05b
split + AC-05a, so the spec ships something regardless. Flagging only so the gate
does not lose it: if the user picks option (a), `saas-metric-library` (already
`revised`, its design approved and largely built) must reopen to add three
catalog rows *before* FR-05b can build — a cross-wave reordering the blueprint
dependency graph does not show. No requirements change needed; this is a
gate/sequencing decision, not a defect.

### Nits

**N-01 — AC-05 and AC-09 embed shell-grep manual steps whose escaping is
fragile.** AC-05's `grep '"MEASURES"' …` and AC-09's
`grep -E '"UserStory"\|"AcceptanceCriterion"' …` are fine, but the AC-09 pattern
uses `\|` inside a single-quoted `-E` pattern, which greps as a literal
alternation only because `-E` is set — a reader copy-pasting into a
non-`-E` context would get a literal backslash. Cosmetic; pin the exact command
in the design's test section. No action required at requirements time.

**N-02 — FR-03 lists four function-specific Sales roles (AE, SDR, SE, Deal Desk)
as examples but AC-03 only asserts "function-specific roles … exist" generically.**
That is acceptable for a content spec (the exact role roster is content, not a
contract), but if the mapping table's role coverage is meant to be exhaustive,
the design/tasks should freeze the roster so AC-03's "each activity's role
coverage is non-empty" is checkable against a known set. Minor.

## Completeness / Traceability

| FR | Covered by AC | Upstream verified | Status |
|----|---------------|-------------------|--------|
| FR-01 journeys `PART_OF` Sales domain (resolver) | AC-01, AC-12 | `seedKey:"sales"` domain, loader raw-post ✔ | OK |
| FR-02 activities + `PRECEDES` (fixture) | AC-02 | core labels ✔ | OK |
| FR-03 roles × activities `EXECUTES` (shared via resolver) | AC-03 | `sales_lead` seedKey ✔ | OK |
| FR-04 CRM/MOMS `USES_SYSTEM` + CPQ non-optional | AC-04 | `crm`/`moms` seedKeys ✔ | OK |
| FR-05 KPIs `MEASURES` via `linkKpiToMetric` | AC-05, AC-05a | sole-path helper ✔ | OK |
| FR-05a win-rate + pipeline-conversion | AC-05, AC-05a | both metrics seeded ✔ | OK |
| FR-05b sales-cycle/ACV/quota (conditional) | AC-05a | three metrics absent ✔ | OK; C-02 (OQ-2) |
| FR-06 KPI `ALIGNED_TO`/`PARAM_BINDS` | AC-06 | endpoints legal ✔ | OK |
| FR-07 Funnel + `HAS_STAGE`, operator-root anchor | AC-07 | FR-09 = `attributes.modelId` ✔ | OK; **C-01** |
| FR-08 `CONVERTS_TO` via funnel route, range guard | AC-08 | transition route + `400 attribute_violation` ✔ | OK |
| FR-09 stories via model-scoped route | AC-09 | scope check + cardinality ✔ | OK |
| FR-10 ACs Given/When/Then via AC route | AC-09 | clause-required enforcement ✔ | OK |
| FR-11 capabilities via DDD route | AC-10 | `CAPABILITY_IN_MODEL` authoritative ✔ | OK |
| FR-12 risks via governed API only | AC-11, AC-12 | `governed-seed-helper` + risk route ✔ | OK |
| FR-13 mapping table | AC-14 | XD-10 first-class artifact ✔ | OK |
| NFR-01 no new machinery | AC-15 | — | OK |
| NFR-02 owned-elsewhere untouched | AC-11, AC-15 | `seed:sales` = only new code file | OK |
| NFR-03 idempotency + completeness + isolation | AC-12 | full-sequence, name-dedupe ✔ | OK |
| NFR-04 lifecycle-guard compat | AC-13 | import rejects lifecycle rows ✔ | OK |
| NFR-05 house rules | AC-15 | zod/loopback/`/api/v1/`/en-US ✔ | OK |
| NFR-06 cross-entrypoint ordering | AC-16 | fails-loud on unresolved id | OK |

Every FR maps to ≥1 AC; every AC (AC-01…AC-16) traces to ≥1 FR; no orphan ACs.
The mapping table (FR-13) genuinely delivers XD-10's headline ask and is now
correctly scoped to the whole seeded subgraph (fixture + resolver + governed-API
rows), matching AC-14. Scope boundaries are exemplary — in/out with a named
owner for every construct, and the spec correctly creates all risk data via the
governed API without touching a single owned-elsewhere file. House-rule
conformance (zod-only, loopback, `/api/v1/`, no per-route auth, en-US) is
respected. The B-01 authoring split (self-contained fixture nodes vs.
resolver-created id-referencing edges) is coherent and consistently applied
across every FR, NFR, the mapping table, and the ACs.

## Verdict: approve

The two pass-1 blockers and all five concerns are resolved; the revision is
internally consistent and did not introduce new contradictions. Independent
re-verification against the codebase and the six dependency specs confirms every
load-bearing interface claim — this is among the best-grounded content specs in
the fan-out.

Two open items travel forward as **concerns, not blockers**, both landing
naturally in design without re-review budget:
- **C-01** — close FR-07's stale funnel-anchor disjunct to `attributes.modelId`
  = the resolved operator-root id (the mechanism `funnel-pipeline-modeling`'s
  approved design actually ships); drop the rejected reachability-edge branch.
- **C-02** — OQ-2 is the sole user decision at the gate: add three metric
  definitions to `saas-metric-library` (option a, reopening an already-revised
  spec) or defer FR-05b. FR-05a ships either way; AC-05a guarantees no ungrounded
  KPI ever ships.

Approving with these two concerns recorded. Proceed to design (medium →
design → review → tasks → execute), pinning C-01 against
`funnel-pipeline-modeling/design.md` Rule D at design time.
