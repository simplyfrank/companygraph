---
feature: "function-benchmark-scoring"
reviewing: "design"
artifact: "design.md (rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Design Review: function-benchmark-scoring (rev 2)

Reviewed cold against `requirements.md` (rev 2), `blueprint-saas-operator.md`,
`.claude/CLAUDE.md`, the sibling `cross-function-exec-rollup/design.md`, and the
live codebase. This is pass 2 of at most 2; rev 1 returned **revise** with two
blockers (B-01, B-02), five concerns, and three nits, all on the KPI→function
attribution rule and query hygiene.

**All rev-1 findings are resolved, and each resolution was verified against real
code — not taken on the author's word.** The one remaining substantive item is a
new performance/shape concern on the rev-2 coverage query; it is a Concern, not a
blocker, and can be pinned in the tasks phase. Verdict: **approve** with concerns
recorded.

## Rev-1 findings — disposition (verified)

- **~~B-01~~ → resolved.** `PARAM_BINDS` is dropped from the attribution
  traversal throughout (DD-13, §3.3, §4.3). The attribution edge-set is now
  `{domain_id, ALIGNED_TO}` only. Verified byte-for-byte against the sibling
  `cross-function-exec-rollup/design.md:288–299` and `performance.ts`
  `DOMAIN_FILTER` (lines 126–137, `ALIGNED_TO`-only, `PART_OF*1..2` to
  `(:Domain {id})`); the rev-2 §4.3 grounded-KPI Cypher (lines 352–354) matches
  the sibling's Read-1 exactly, including `RETURN DISTINCT`. DD-13 forward-flags
  FR-01/AC-01 to strike the stale `PARAM_BINDS` wording — the correct handling
  of a requirements-vs-design divergence.
- **~~B-02~~ → resolved.** The flat `k.domain_id = d.id` disjunct is restored as
  the primary path (§4.3 line 353), matching both FR-01 and the sibling DD-05
  (which lists `domain_id` first as the CS-KPI superset). The two wave-3 surfaces
  now attribute KPIs identically (Risk 9 / C-03 invariant satisfied).
- **~~C-01~~ / ~~C-02~~ → resolved.** The invalid `WHERE-in` sketch is replaced
  with valid, per-domain-tagged Cypher: `MATCH (d:Domain) WHERE d.id IN
  $domainIds … WITH k, md, d … RETURN DISTINCT d.id AS domainId, …`. The owning
  `domainId` is carried per `(k,d)` row so the scorer can bin each grounded KPI —
  the exact gap C-01 flagged.
- **~~C-03~~ → resolved.** §4.1 now transcribes the `computeKpiStatus` contract
  verbatim, including the `target_is_exact` no-band `warning` default. Verified
  line-by-line against `performance.ts:50–89` (`v === target → on_target`; else
  deviation bands; `else return "warning"` — never `on_target`). The loose
  "deviation-band grade" gloss is retired.
- **~~C-04~~ (rev-1, edge-set + hop depth) → resolved.** Coverage now shares the
  single `{domain_id, ALIGNED_TO}` attribution set with FR-02 and pins the
  activity→journey hop to depth 1 (`(a)-[:PART_OF]->(:UserJourney)`) — correct,
  since `Activity PART_OF UserJourney` is one hop.
- **~~C-05~~ → resolved.** The `apoc.convert.fromJsonMap` variant is dropped;
  §4.3 collects raw `s.attributes_json` and parses `systemKind` in TS with a
  `DEFAULT_SYSTEM_KIND` fallback, matching `deserializeModel` /
  `key-activity-score.ts`. No hot-path APOC dependency.
- **~~N-01~~ → resolved.** OpenAPI wiring now cites the call site
  (`openapi.ts:1045`, next to `registerPerformancePaths(registry)`), not the
  line-108 import. Verified.
- **~~N-02~~ → resolved.** §4.3 step 1 now states the seeded branch populates
  `meta.modelId` with the discovered `root.id` (non-null); AC-01 asserts it is
  never hard-coded.
- **~~N-03~~ → resolved.** `byKind` now counts each activity once under its best
  (highest-weight) `systemKind`, so `sum(byKind) === (# activities with ≥1
  system)` and the evidence is deterministic.

## Blockers

None.

## Concerns

### C-01 — The §4.3 coverage query does a full `KPI` scan per `(domain, activity)` row; "one round trip" hides an O(activities × KPIs) cartesian

§4.3 step-4 bullet-4 (lines 386–394) uses `OPTIONAL MATCH (k:KPI) WHERE
k.archived_at IS NULL AND (…) AND EXISTS {…}` with `k` **unconnected** to `a` or
`d` in the pattern — the only linkage is inside the WHERE/`EXISTS`. Neo4j will
therefore evaluate every KPI against every `(d, a)` row before the `EXISTS`
filters prune it. It is one *round trip* but not one cheap query; at operator
scale (six domains, tens of activities, tens of KPIs) it is fine, but the design
asserts boundedness it has not actually shown for this read, and the pattern
diverges from the grounded-KPI read (lines 347–359), which correctly anchors
`MATCH (k:KPI)-[:MEASURES]->(md)` first. **Recommendation:** in the tasks phase,
either (a) reuse the already-computed grounded/attributed KPI set from the
grounded-KPI read and resolve `coveredByKpi` in the pure scorer (the KPI→activity
reach can be a second projection on the same read), or (b) anchor the coverage
query on `MATCH (k:KPI)-[:ALIGNED_TO]->(x)` first and join back to `(d, a)`, so
KPIs are not re-scanned per activity. Not a blocker — correctness holds — but pin
the shape so T-04/T-05 do not ship the cartesian form.

### C-02 — `coveredByKpi` counts *all* attributed KPIs, but the grounded-KPI read only surfaces `MEASURES`-linked KPIs — confirm the coverage read is genuinely a second read, not a filter of the first

§4.3 is explicit that coverage (FR-04) counts **all** attributed KPIs while
metricBenchmark (FR-02) counts only `MEASURES`-grounded ones — correct per the
requirements. But the read-shape `FunctionActivity.coveredByKpi` (line 185) and
the coverage Cypher must not accidentally inherit the `MEASURES` gate. The
coverage Cypher (lines 386–394) correctly omits the `MEASURES` match, so the
design is internally consistent; flagging only so the tasks/tests phase asserts a
fixture where a function has an `ALIGNED_TO` KPI with **no** `MEASURES` edge and
still reads `coveredByKpi:true` (coverage) while contributing nothing to
`metricBenchmark`. **Recommendation:** add that discriminating fixture to
`function-benchmark-coverage.integration.test.ts` (AC-04) so the two axes cannot
silently collapse.

### C-03 — Same-task dispatch+permission pairing is a security-critical convention the design leaves to tasks

`rbac-permissions.ts:31–42` carries an explicit SECURITY-CRITICAL comment: the
router gate **skips** the permission check when `getRoutePermission` returns null,
so a route dispatch that lands without its `ROUTE_PERMISSIONS` entry is
**unauthenticated**. The design correctly adds both (§4.4 dispatch, §4.5
permission) but the AC → task map (§6.2) splits them across T-06 (route) and T-07
(RBAC). **Recommendation:** in tasks, pair the `router.ts` dispatch line and the
`rbac-permissions.ts` line into the **same** task (or make T-07 a hard predecessor
gate on T-06's merge), matching the performance-dashboard precedent, so the route
can never merge un-permissioned.

## Nits

### N-01 — `EmptyState` catalog signature is `{what}` only; the seed-prompt copy lives in the view

§4.7 says the empty state points to `bun run seed:saas-operator`, but the catalog
`EmptyState({what})` (`_shared.tsx:85`) takes only `what`. The prompt text is
therefore the view's own markup around `EmptyState`, not a prop — harmless, but
worth a word in the view task so the implementer does not look for a missing prop.

### N-02 — §4.3 coverage `RETURN … count(DISTINCT k) > 0` relies on implicit grouping

`RETURN d.id AS domainId, a.id AS activityId, count(DISTINCT k) > 0 AS
coveredByKpi` groups on `(domainId, activityId)` implicitly. Valid Neo4j, but
combined with the C-01 cartesian it is the least-obvious line in the design;
whichever rewrite C-01 lands should keep this per-activity grouping explicit.

## Completeness / Traceability

Every FR and NFR maps to a design element; §6.1 is accurate and now correct on
the attribution rule. Assessment (✓ = covered, ⚠ = covered, concern noted):

| FR / NFR | Design element | Status |
|----------|----------------|--------|
| FR-01 model-scoped read + root resolve + `scopedNodeIds` + attribution | §4.3, DD-02/03/13 | ✓ (attribution now `{domain_id, ALIGNED_TO}`, byte-matches sibling + `performance.ts`) |
| FR-02 metricBenchmark (OQ-1(b)) | §4.2, §3.2, DD-04 | ✓ (prose-as-evidence, `MEASURES` gates which KPIs count) |
| FR-03 self-owned `computeKpiVerdict` | §4.1, DD-05 | ✓ (contract transcribed verbatim; AC-03 grep-guards no `performance` import) |
| FR-04 coverage 3-ratio + optional marked-key | §4.2, §3.2, DD-08 | ⚠ C-01/C-02 (query shape + discriminating fixture) — applicability logic correct |
| FR-05 automation + augmentation weights | §4.2, §3.2, DD-06 | ✓ (closed enum, best-kind `byKind`, no-system=0) |
| FR-06 composite over applicable sub-scores | §4.2, DD-07/08 | ✓ (applicability-not-zero-fill correct) |
| FR-07 route + empty-200 | §4.4, DD-09/10 | ✓ (two-segment genuinely sidesteps `router.ts:934`, verified) |
| FR-08 OpenAPI, no ERROR_CODES change | §4.6, DD-10 | ✓ (call site `openapi.ts:1045` correct) |
| FR-09 `analytics:read` mapping | §4.5, DD-11 | ⚠ C-03 (pair with dispatch in one task) — family + `P()` helper confirmed |
| FR-10 view + one `views/index.tsx` line | §4.7, §4.8 | ✓ (catalog imports + `api.*` method + XD-05 boundary correct) |
| FR-11 four states | §4.7 | ✓ (`Loading`/`EmptyState`/`ErrorState` signatures verified) — N-01 |
| FR-12 keyboard + deep links | §4.7 | ✓ |
| NFR-01 isolation + read-only | §4.3 READ mode, `scopedNodeIds` | ✓ (AC-07 stats-diff guard) |
| NFR-02 no schema/store/persist | §3.1 | ✓ |
| NFR-03 route-file single-owner | §1.2, §4.7 | ✓ (API-router-vs-PWA-`route.ts` distinction correct) |
| NFR-04 deterministic + explainable + no recommendation | §4.2 | ✓ (rank tiebreak, no recommendation field in wire shape) |
| NFR-05 ownership boundaries | §1.2 | ✓ (no owned-elsewhere edit; re-implements verdict) |
| NFR-06/07 house rules + tokens | §3.2, §4.7 | ✓ (zod-only, en-US, tokens, design-conformance) |

**AC → task forward-map (§6.2):** consistent; no AC unmapped. Prior AC-01/AC-02
blockers (which inherited B-01/B-02) are cleared now that the attribution rule is
correct.

**Done well:** the rev-2 revision did not paper over the rev-1 blockers — it
reconciled the attribution rule to a single edge-set that provably matches both
the sibling wave-3 spec and `performance.ts`, transcribed the KPI-verdict contract
verbatim (the AC-03 grep-guard against importing `performance.ts` is a nice
ownership-boundary tripwire), and forward-flagged the stale FR-01 wording rather
than silently diverging. Every catalog/helper/route/schema interface cited is
real and correctly located. The OQ-1(b) prose-as-evidence call, the
applicability-not-zero-fill composite, and the two-segment route analysis remain
the strongest parts of the design.

## Verdict: **approve**

Zero blockers. Both rev-1 blockers (B-01 attribution edge-set, B-02 `domain_id`
path) are resolved and verified against the sibling design and live code; all
rev-1 concerns and nits are cleanly addressed. Three residual concerns (C-01
coverage-query cartesian, C-02 discriminating coverage fixture, C-03 same-task
dispatch+permission pairing) and two nits are recorded for the tasks phase — none
changes the design direction. Approved to proceed to tasks.
