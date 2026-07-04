---
feature: "kpi-impact-mapping"
reviewing: "design"
artifact: "design.md (revision 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of 2"
---

# Design Review: kpi-impact-mapping

Reviewed `design.md` rev 1 cold against `requirements.md` rev 2 (approved),
`.claude/CLAUDE.md`, `.claude/specs/blueprint.md` (XD-04, View Tree, UX-*), and
the cited upstream interfaces (`model-workspace-core`, `story-spec-core`,
`key-activity-optimizer`, `kpi-okr-governance`). Claims were spot-checked against
the codebase on disk.

**Headline:** An unusually rigorous, well-traced design. Every FR-01…FR-14 and
every AC-01…AC-17 maps to a design section and a test. Every load-bearing claim I
verified against the codebase held up (`scopedNodeIds` signature,
`handleKpiTrendsGet(req, kpiId)` shape, `createEdgeType` optional
`external_alignment`, the `ALIGNED_TO` base writer's `CREATE`, the `kpi-trends`
ASC/windowed measurement contract, the `P()` RBAC helper, `kpiSchema` threshold
fields, and the upstream registration of `activity_not_found`/`story_not_found`).
No blockers. Two concerns and three nits below.

## Findings

### Blockers

None.

### Concerns

**C-01 — Roll-up source contradicts the blueprint's literal "vs Postgres
measurements" scope; resolution is escalated, not decided.**
The blueprint feature inventory (`blueprint.md:166`) scopes this feature as
"roll-up **vs Postgres measurements**," and the orchestrator's own scope note
repeats "roll-up of impact against real Postgres KPI measurements." The design
(DD-03, §4.5, §4.6) instead rolls up against the Neo4j `:KPIMeasurement` source
that `kpi-trends` reads — verified in-repo (`api/src/routes/kpi-trends.ts:50`,
`MATCH (m:KPIMeasurement {kpi_id:$id})`), which is disjoint from the Postgres
`kpi_measurements` table (`POST /kpi-measurements`, migration 003). This is a
real conflict with an app-level statement.
*Why this is a Concern and not a Blocker:* the design does **not** silently pick
a store — it composes the only governed read route NFR-02 permits (`kpi-trends`),
and it escalates the store-of-truth question as OQ-2 with the correct framing
(the V-02 split-brain, resolvable only upstream in `kpi-okr-governance`). The
requirements carried OQ-2 forward and were approved at rev 2. Opening a
direct-Postgres read here would violate NFR-02 and fork the governed surface.
*Recommendation:* keep the design as-is, but the orchestrator **must** surface
OQ-2 to the user before implementation lands, and — separately — reconcile the
blueprint line 166 wording ("vs Postgres measurements") with the as-built V-02
reality, since a reader taking the blueprint literally will believe this feature
reflects Postgres values when it does not. If the user rules Postgres
authoritative, this feature does not change; the fix is a `kpi-okr-governance`
V-02 resolution, and this design's `fetchTrends` seam absorbs it transparently.

**C-02 — Story display-name field `s.title` is unverified and likely wrong.**
§4.3's `createStoryLink` Cypher returns `s.title AS sourceName`, and the design
hedges: "if the as-built story uses `name`, the impl binds to that verified
field." `story-spec-core` design (`design.md:244`) creates the story as
`CREATE (s:UserStory { …envelope…, persona, action, … })` — the graph-core node
envelope carries `name`, and there is no `title` property in that spec. As
written, `s.title` will return `null` for `sourceName`, and AC-02 asserts a
**populated** `sourceName`, so the integration test would fail on the
default-path field name.
*Recommendation:* pin the field to `s.name` (the node-envelope display name) in
§4.3 rather than deferring it to "verified at merge time," or explicitly state
that `sourceName` derives from the story's envelope `name` (falling back to
`persona`/`action` only if `story-spec-core` diverges). The same applies to the
list-rows read for story links.

### Nits

**N-01 — `readMatrixInputs` `model_not_found` pre-check needs a note that
`scopedNodeIds` alone cannot distinguish "unknown model" from "empty model."**
§4.4 correctly adds a distinct `MATCH (m:BusinessModel {id})` pre-read because
`scopedNodeIds` returns ∅ for both an unknown model and a valid-but-empty model
(verified: it `MATCH (m:BusinessModel {id})` then `OPTIONAL MATCH` descendants,
returning an empty set with no error). The design already does the right thing;
add one sentence making explicit that the pre-check read is the sole
`model_not_found` signal and that the same pre-check is needed on the rollup
handler (§4.5 does not currently mention it, though §4.7's handler table maps
only `handleMatrix` to `model_not_found`).

**N-02 — `ALIGNED_TO` also targets `UserJourney`/`Domain`; confirm the
`->(a:Activity)` filter is intentional across all reads/deletes.**
The base writer (`kpi-sla-alignment.ts:41`) creates `ALIGNED_TO` from `KPI` to
`Activity`, `UserJourney`, **or** `Domain` depending on `target_type`. The
design's matrix read, link read, and DELETE all constrain `->(a:Activity)`, so a
journey/domain-aligned edge's `elementId` passed to the activity DELETE correctly
404s and never appears as a matrix cell. This is the right behavior, but it is an
implicit consequence — a one-line note in §4.2/§4.4 that the `:Activity`
endpoint filter is deliberate (journey/domain alignments are out of this
feature's activity×KPI surface) would prevent an implementer from "fixing" it.

**N-03 — Handler-count mismatch in prose vs file-changes table.**
§4.1 and §4.7 describe "6 model-scoped REST routes" / "6 handlers" in the
overview, while §4.7's table and §7's File Changes row for
`api/src/routes/kpi-impact.ts` correctly list **8** handlers (matrix + rollup +
4 link routes + 2 deletes = 8 endpoints across the two GET-list/POST pairs).
Reconcile the "6" mentions (§1 item 3 says "Six model-scoped REST routes") with
the 8-handler reality so the tasks phase sizes it correctly.

## Completeness / Traceability

Every FR and AC is covered. No orphan design elements; no requirement without a
design home.

| FR | Design coverage | Test (AC) | Status |
|----|-----------------|-----------|--------|
| FR-01 activity link + direction | §3.2, §4.2 (MERGE-on-pair) | AC-01 | covered |
| FR-02 story link `IMPACTS_KPI` | §3.3, §4.3, §4.9 | AC-02 | covered |
| FR-03 list + delete | §4.3 | AC-03 | covered |
| FR-04 direction/weight validation | §3.2, §3.3 (zod) | AC-01/02 | covered |
| FR-05 coverage matrix | §3.4, §4.4 | AC-04 | covered |
| FR-06 gap detection (directional-only) | §4.4, DD-07/09/10 | AC-05 | covered |
| FR-07 story coverage rider | §3.4, §4.4 (`storyLinkCount`) | AC-16 | covered |
| FR-08 roll-up | §3.4, §3.5, §4.5, §4.6 | AC-06 | covered |
| FR-09 read-only + degrade, never 500 | §4.5 step 4, §4.6 | AC-06 | covered |
| FR-10 openapi + error codes | §3.6, §7 | AC-17 | covered |
| FR-11 RBAC route perms | §4.8 | AC-07 | covered |
| FR-12 KpiImpactMatrix view + 4 states | §4.10, §6 | AC-08/09/10/11 | covered |
| FR-13 link editor + gaps + rollup panel | §4.10 | AC-11/13 | covered |
| FR-14 model-scope + reload survival | §4.10 | AC-14 | covered |
| NFR-01…07 | §3, §4.2, §4.8, §5, §6 | AC-07/12/13/15 | covered |

**Prior-review carry-forwards (from requirements rev 2):**
- C-05 (`latestValue` extraction) → **resolved** in DD-04/§4.6; verified against
  `kpi-trends.ts:53` ASC ordering — `measurements.at(-1)` is correct.
- C-06 (no duplicate `ERROR_CODES`) → **resolved** in DD-05/§3.6; verified
  `activity_not_found` (key-activity-optimizer) and `story_not_found`
  (story-spec-core) are registered upstream, and neither is in `errors.ts` today,
  so the add-iff-absent guard is sound.
- OQ-1/OQ-2/OQ-3/OQ-4 and the C-01 second-writer-MERGE flag carry forward as
  design decisions (DD-01/03/07/08/09) with defaults recorded and escalation
  points named — appropriate for the orchestrator to surface.

**Verified-good (done well):**
- House rules respected: zod-only, no `tsc`, en-US identifiers, all routes under
  `/api/v1/`, auth via the central gate only (§4.8, no per-route check),
  no compile-time `NODE_LABELS`/`EDGE_ENDPOINTS` edit (AC-15).
- View Tree route `#/model/kpi-impact` → `KpiImpactMatrix` taken verbatim
  (blueprint:85/96); no `route.ts`/`SURFACES` edit; tokens-only + catalog-first
  (§6, UX-02/05); all four view states specced (UX-01).
- The pure-`derive/` + Neo4j-`storage/` split (DD-06) makes the matrix/gap/status
  math unit-testable with no Neo4j — mirrors `key-activity-optimizer` DD-01.
- Every cited upstream interface signature I checked matched the code or the
  approved upstream spec exactly.

## Verdict

**approve.** Zero blockers. C-01 (blueprint "Postgres" wording vs the
`kpi-trends`/`:KPIMeasurement` reality) is a genuine app-level conflict but is
correctly escalated as OQ-2 rather than silently decided, and the roll-up path is
forced by NFR-02 — the orchestrator must surface OQ-2 and reconcile the blueprint
line. C-02 (`s.title` → likely `s.name`) and the three nits are cheap fixes that
fit inside the one remaining review pass; none blocks progression to tasks.
