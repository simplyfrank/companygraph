---
feature: "kpi-impact-mapping"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Review: kpi-impact-mapping / requirements (pass 2/2)

## Verdict

**approve** — Revision 2 resolves the pass-1 blocker (B-01) and all four
concerns (C-01…C-04), the three nits (N-01…N-03), and the FR-07↔AC gap, each
with a factually verified fix. Every load-bearing claim re-checked against the
codebase and the four dependency specs checks out. Two low-severity,
design-forward notes are recorded (C-05, C-06) — neither blocks the phase; they
are the design author's to land. This is a strong, unusually well-traced
requirements doc; it advances to design.

## Resolution of pass-1 findings

- **~~B-01~~ → resolved.** The roll-up is no longer specified against "real
  Postgres measurements." Summary, Motivation §2/§4, FR-08, FR-09, NFR-02,
  NFR-04, AC-06, Risk 5, and OQ-2 are all re-scoped to the source `kpi-trends`
  actually reads. **Verified in-repo:** `api/src/routes/kpi-trends.ts:50` reads
  `MATCH (m:KPIMeasurement {kpi_id:$id})` (Neo4j, never Postgres);
  `openapi-kpi-okr.ts:253` carries the "SPLIT-BRAIN (V-02)" label the spec
  cites verbatim. AC-06 now seeds `(:KPIMeasurement {kpi_id, measured_at,
  value})` nodes — matching the route's real read — so the AC is testable.
  OQ-2 is correctly re-stated as a real store-of-truth decision escalated to
  the user (not silently defaulted), and DEC-02 pins this spec's *read* to the
  governed `kpi-trends` route (honouring NFR-02's no-direct-store rule). The
  self-contradiction pass 1 flagged (reflect Postgres without querying it) is
  gone.

- **~~C-01~~ → resolved.** FR-01 now pins the MERGE key to node identities only
  (`MERGE (k:KPI {id})-[r:ALIGNED_TO]->(a:Activity {id})` then `SET`), states
  that a pre-existing base-route CREATE duplicate is bound arbitrarily and
  never de-duped by this route, and flags the second-writer MERGE on
  `kpi-okr-governance`'s edge to that owner (Risk 4 / STATUS). **Verified:**
  `kpi-sla-alignment.ts:53` writes `ALIGNED_TO` with `CREATE` and edge
  direction `(:KPI)->(:Activity)`, matching FR-01's edge shape exactly.

- **~~C-02~~ → resolved.** FR-05/FR-06/AC-05 now key off **presence** of the
  `attributes.keyActivity` key, not `.marked === true`. **Verified against
  `key-activity-optimizer`:** FR-07 stores `{marked:true, markedAt,
  scoreSnapshot, rank}` under the `keyActivity` key and FR-08 **removes** the
  key on unmark — so there is no `marked:false` state on disk; presence is the
  correct predicate. The phantom-`marked:false`-branch risk pass 1 warned about
  is explicitly called out in FR-06 as a thing the design author must not add.

- **~~C-03~~ → resolved.** FR-07 now defines `storyLinkCount` as the count of
  **distinct `IMPACTS_KPI` edges** (distinct `(story,kpi)` links, not distinct
  KPIs), and AC-16 asserts exactly that (two stories → same KPI counts as 2).
  **Verified:** `story-spec-core` FR-03 makes `DESCRIBES_ACTIVITY` `1..*` on the
  activity side with no per-story `IMPACTS_KPI` cap — the many-to-many join the
  spec now names.

- **~~C-04~~ → resolved.** DEC-03 (FR-06 / NFR-03 / AC-05) decides that an
  undirected (`direction:null`) base-route `ALIGNED_TO` does **not** clear a
  measurability gap — only a directional link does, matching XD-04's
  quantified-directional-impact intent. The looser reading is split out as OQ-4
  and flagged to the orchestrator rather than defaulted in a Risk cell.

- **~~N-01~~ → resolved.** AC-03 now asserts a mis-routed
  `DELETE …/activity-links/:linkId` given a story link's `elementId` → `404
  impact_link_not_found` (each DELETE matches only its own edge type).

- **~~N-02~~ → resolved.** OQ-2 re-stated to name the Neo4j-`:KPIMeasurement`-
  via-`kpi-trends` vs Postgres-`kpi_measurements`-direct axis.

- **~~N-03~~ → resolved.** AC-17 splits the OpenAPI/error-code assertion out of
  AC-07 (now authz + model isolation), giving a clean 1-AC↔1-artifact mapping.

- **~~FR-07 AC gap~~ → resolved.** AC-16 covers the `storyLinkCount` rider.

## Concerns (design-phase, non-blocking)

- **C-05 — `kpi-trends` returns a *windowed*, ASC-ordered measurement list;
  the design must pin how `latestValue` is extracted and how the window
  interacts with `no_data`.** FR-08 says `latestValue` is "the most-recent
  measurement in the `kpi-trends` payload." **Verified:** `kpi-trends.ts:49`
  filters `WHERE m.measured_at >= $windowStart` (a default window) and returns
  `measurements` ordered `measured_at ASC` — so (a) "most-recent" is the
  **last** array element, not the first, and (b) a KPI whose only measurements
  predate the default window returns an **empty** `measurements` array, which
  FR-08/NFR-04 correctly map to `status:"no_data"`. This is consistent with the
  spec, but the design must state explicitly that the roll-up takes the last
  (max `measured_at`) element and that the `kpi-trends` window bounds
  "latest" — otherwise a naive `measurements[0]` read would take the *oldest*
  value. Recommend the design pin the exact field access and note the window
  semantics; AC-06 already asserts the correct `latestValue`, so a wrong access
  would fail the test.

- **C-06 — confirm `activity_not_found` / `story_not_found` reuse rather than
  re-declaration.** FR-10 correctly says to reuse `activity_not_found` /
  `story_not_found` "if already registered." **Verified:** neither those codes
  nor `kpi_not_found` / `impact_link_not_found` are in `api/src/errors.ts`
  today — they are owned by upstream (`key-activity-optimizer` FR-10 registers
  `activity_not_found`; `story-spec-core` FR-10 registers `story_not_found`)
  and land before this wave-4 spec. The design should assert the reuse concretely
  (no duplicate enum entry) so the `envelope.test.ts` reachability check and the
  closed-enum exhaustiveness assertion both hold once all deps have merged. Not
  a requirements defect; a design checkpoint.

## Completeness / Traceability

**Re-verified against the codebase (all check out):**
- `kpi-trends.ts` reads Neo4j `:KPIMeasurement`, never Postgres; V-02
  split-brain label present at `openapi-kpi-okr.ts:253`. ✔ (B-01 fix is
  factually correct.)
- `ALIGNED_TO` written by `kpi-sla-alignment.ts` via `CREATE`, direction
  `(:KPI)->(:Activity)`, `weight`/`attribution_type`/`alignment_notes`/
  `created_at`, `elementId(r)` ids, opaque-string DELETE. ✔
- `DRIVES_KPI` is `KeyResult→KPI` (`edges.ts:40`) — OQ-1/DEC-01 discrepancy
  confirmed. ✔
- `userStoryKPISchema` at `kpi-sla.ts:105` (`user_story_id`,
  `impact_description?`), **no** as-built route. ✔
- `kpiSchema` fields for roll-up status (`target_value`, `target_direction`
  enum `higher_is_better|lower_is_better|target_is_exact`,
  `warning_threshold?`, `critical_threshold?`, `archived_at`) present. ✔
- `IMPACTS_KPI` registered nowhere yet; `kpi_not_found`/`impact_link_not_found`
  not yet in `ERROR_CODES` (additive claim holds). ✔
- `scopedNodeIds` present at `model-scope.ts:22`. ✔

**Dependency FR citations re-verified (all resolve):**
- `story-spec-core` FR-01 (UserStory runtime label + UUIDv7 id), FR-03
  (`DESCRIBES_ACTIVITY` `1..*`), NFR-02 (model-scope through activity), and the
  join-key boundary note ("this spec's `UserStory.id` is the identity
  kpi-impact-mapping's userStoryKPI link attaches to"). ✔
- `key-activity-optimizer` FR-07 (`keyActivity` evidence under `attributes`),
  FR-08 (key **removed** on unmark), FR-09 (attribute-preserving write). ✔
- `kpi-okr-governance` FR-03 (`kpi-trends` verified), FR-04 (`kpi-alignments`,
  `weight∈[0,1]`), FR-10a (`GET /api/v1/kpis`), FR-11(b) (ZodError→400 mapper),
  FR-13 (`GET /api/v1/kpis/:id`). ✔ (Cited "FR-11b" = FR-11 part b.)
- `model-workspace-core` FR-11/FR-15/FR-18 (RBAC role seed, active-model
  context, `scopedNodeIds`). ✔
- View Tree: `#/model/kpi-impact` → `KpiImpactMatrix` taken verbatim
  (blueprint line 96); replaces `ModelTabPlaceholder`. ✔

**House rules / blueprint:** `/api/v1/` mounting (FR-10), zod-only (NFR-06), no
tsc (`bun run typecheck`, AC-15), loopback (NFR-06), auth via central router
gate + `api/src/auth/` with `ROUTE_PERMISSIONS` + no per-route check (FR-11,
NFR-06), `IMPACTS_KPI` via runtime registry not `EDGE_ENDPOINTS` (NFR-02,
XD-01), no new store (NFR-02, XD-02), tokens-only + catalog-first PWA (FR-12,
NFR-07, UX-02). Platforms & Input Modes + Native Conflicts tables present with
UX-03 n/a-canvas correctly recorded. All conform. ✔

**FR → AC coverage:**

| FR | Covered by | Status |
|----|-----------|--------|
| FR-01 activity→KPI link + direction | AC-01, AC-07 | ok |
| FR-02 story→KPI `IMPACTS_KPI` | AC-02 | ok |
| FR-03 list + delete (+ cross-type 404) | AC-03 | ok |
| FR-04 direction/weight validation | AC-01, AC-02 | ok |
| FR-05 coverage matrix | AC-04 | ok |
| FR-06 measurability gaps (directional-only) | AC-05 | ok |
| FR-07 story coverage rider | AC-16 | ok (gap closed) |
| FR-08 roll-up vs `kpi-trends`/`:KPIMeasurement` | AC-06 | ok (B-01 fixed) |
| FR-09 read-only + degrade to no_data | AC-06 | ok |
| FR-10 API contract/openapi/errors | AC-17 | ok (split from AC-07) |
| FR-11 route-permission mapping | AC-07 | ok |
| FR-12 KpiImpactMatrix view (4 states) | AC-08…AC-12 | ok |
| FR-13 link editor/gaps/rollup panel | AC-11, AC-13 | ok |
| FR-14 model-scoped + reload | AC-14 | ok |

**AC → FR coverage:** AC-01…AC-17 each cite ≥1 FR; no orphan ACs. Platforms +
Verification columns populated on every AC (a compliant `manual:` repro with
input mode + observable outcome on AC-13; test paths elsewhere).

**Gaps found:** none blocking. C-05/C-06 are design-phase checkpoints, not
requirements defects.

## Notes for the review budget

This is pass 2 of at most 2 — the budget is now spent. Verdict **approve**: the
requirements advance to design with C-05 (pin the `kpi-trends` latest-value
extraction + window semantics) and C-06 (assert error-code reuse, no duplicate
enum entry) carried forward as recorded concerns for the design author, and
OQ-1/OQ-2/OQ-3/OQ-4 + the C-01 second-writer-MERGE flag surfaced to the
orchestrator/user for the consolidated report (OQ-2 needs a real store-of-truth
decision).
