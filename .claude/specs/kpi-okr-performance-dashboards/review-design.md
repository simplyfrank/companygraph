---
feature: "kpi-okr-performance-dashboards"
reviewing: "design"
artifact: "design.md (revision 2, against requirements revision 2)"
reviewer: "spec-review-agent (fresh; did not author)"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "2 of at most 2"
---

# Design Review (pass 2): kpi-okr-performance-dashboards

Reviewed cold against `requirements.md` (rev 2), `blueprint.md` (View Tree
round-4 + XD-15/16/17 + UX-01/02/05/06), `.claude/CLAUDE.md` house rules, the
two on-disk dependency specs (`kpi-okr-governance`, `system-augmentation-model`),
and the live codebase. This pass focuses on whether the three pass-1 blockers and
five concerns were genuinely resolved against the real graph topology — not merely
reworded — plus a fresh scan for anything the rewrite introduced.

Every pinned Cypher, property name, edge type, field, and component API in the
revision was re-verified against source this pass. They all check out.

## Resolved from pass 1

- **~~B-01~~ → resolved.** §4.5 no longer invents `ROLLS_DOWN_TO`/`ASSIGNS`.
  The rewritten Read B traverses the real topology verbatim:
  `(:RollDown {type:'okr'})-[:FOR_OKR]->(:OKRDirective)`,
  `(:RollDown)-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)`
  — identical to `handleOkrRollDownGet` (`roll-down.ts:342-345`). Neither
  `ROLLS_DOWN_TO` nor `ASSIGNS` exists in `edges.ts` (confirmed), and the design
  now explicitly says so and marks the earlier draft as the invention.
- **~~B-02~~ → resolved.** The schema field is now `weight` (not `contribution`),
  sourced from `a.weight`. Confirmed `:RollDownAssignment` stores `a.weight` /
  `a.status` (`roll-down.ts:566-567`); no `a.contribution` property exists. §3.2,
  §4.5 Read B, and the test plan all say `weight`.
- **~~B-03~~ → resolved.** DD-04 and §4.5 now state the two handlers read disjoint
  subgraphs and are joined server-side by directive id — Read A (directive →
  key-results, from `handleOkrPerformanceGet` shape) and Read B (the RollDown
  walk) — never fused into one pattern. Matches reality: `handleOkrPerformanceGet`
  carries no assignment/status/domain rows.
- **~~C-01~~ → resolved.** `key_results[].progress` is now pinned to a `0..100`
  key inside `KeyResult.attributes_json`, read via `apoc.convert.fromJsonMap`.
  Confirmed: `keyResultCreateSchema.attributes.progress` is
  `z.number().min(0).max(100)` (`okr-crud.ts:52`), stored in `attributes_json`.
- **~~C-02~~ → resolved.** §4.2 now writes literal `{domainFilter}`/`{journeyFilter}`
  fragments with OR semantics pinned (flat `k.domain_id` OR a `CONTRIBUTES_TO`
  path; a null-`domain_id` KPI with a qualifying path still matches). `PART_OF*1..2`
  correctly covers both `UserJourney→Domain` and `Activity→UserJourney→Domain`.
- **~~C-03~~ → resolved.** §4.2 adds the "Fragment composition rule": exactly one
  base `WHERE k.archived_at IS NULL`, every fragment an appended `AND …`, never a
  second `WHERE`. Removes the concatenation footgun.
- **~~C-04~~ → resolved.** §3.1 Risk R-4 now states `CONTRIBUTES_TO` is populated
  only in seed today (no API writer), owned by `kpi-impact-mapping`, and the
  running slices reflect whatever edges exist. Confirmed: zero `CONTRIBUTES_TO`
  writers under `api/`.
- **~~C-05~~ → resolved.** §4.5.1 now cites the directive predicate by handler
  name (`handleOkrPerformanceGet`) rather than raw line.
- **~~N-01~~ → resolved** (explicit `value→latest_value`/`measured_at→latest_measured_at`
  remap in §4.2). **~~N-02~~ → resolved** (`target_is_exact` = exact-equality plus
  absolute deviation bands, stated as a unit invariant). **~~N-03~~ → resolved**
  (§4.5 states the `/okr` two-Neo4j-read budget and adds a `session.run` spy in the
  integration test to hold it).

## New findings (pass 2)

No blockers. The revision is faithful to the codebase throughout; the items below
are minor.

### C-06 (concern) — `d.name` referenced in Read B while `d` may be null under the OPTIONAL MATCH

§4.5 Read B projects `d.name AS domain_name` and `a.domain_id AS domain_id`, but
`d` and `a` are bound by `OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a)-[:FOR_DOMAIN]->(d)`.
When a `:RollDown` has no assignment, `a`/`d` are null and the row projects
`domain_id=null`. The prose says these null rows are "filtered out server-side,"
which is correct behavior, but the `ORDER BY dir.name, d.name` with a null `d.name`
is a benign-but-unstated ordering edge. Also `count(adj) > 0` combined with the
non-aggregated `RETURN` columns means the query is implicitly grouping by every
returned key — fine in Neo4j, but the implementer should confirm the grouping key
set is exactly `(dir.id, a.domain_id, d.name, a.status, a.weight)` so `count(adj)`
aggregates per `(directive, domain)` and not across the whole result.
**Recommendation:** add one line to §4.5 Read B noting the aggregation grouping key
and that null-`a` rows are dropped before `okrDomainAssignmentSchema` validation
(the schema requires non-null `domain_id`/`status`). Design-internal; the AC-04
integration test would catch a regression.

### N-04 (nit) — `okr-performance` directive predicate domain scope vs the `?domain` axis

§4.5.1 uses `dir.attributes_json CONTAINS $domainId` when `?domain` is present, else
the top-level `NOT … CONTAINS '"domain_id"'` predicate. That is faithful to the two
governed handlers. Worth a one-line note that the `/okr` endpoint's `?domain` axis
therefore filters *directives* by the substring predicate, while the *per-domain
assignment rows* (Read B) are not re-filtered by `?domain` — so an unsliced `/okr`
returns all top-level directives with all their domain assignment rows. That is a
reasonable exec default, but stating it removes ambiguity for the view author about
whether `?domain` narrows the domain columns too.

## Completeness / Traceability

| FR / NFR / UX | Design coverage | Status |
|---------------|-----------------|--------|
| FR-01 (exec tab + view) | §6, §7; `route.ts` additive append after `okr-management` (verified tabs end there, `route.ts:76-77`), `views/index.tsx` factory, `PerformanceDashboard.tsx`; route/view names verbatim vs blueprint (`blueprint.md:103,112`) | OK |
| FR-02 (KPI trend + status panel) | §4.2 server-side status compute, §6 KpiCard (tone union verified `good\|warn\|danger\|neutral`) + LineChartCard | OK |
| FR-03 (OKR panel, 4 literals, adjustment signal) | §4.5 Read B (real topology), §3.2 enum, `adjustment_requested` from `count(:RollDownAdjustment{status:'pending'})` joined by `roll_down_id`/`domain_id` props (verified `roll-down.ts:489-492`) | OK — resolved |
| FR-04 (URL-first slicer) | §4.1 `resolveSlice` (reuses `parseWith`), §6 URL-first, §4.2/4.3 literal fragments | OK |
| FR-05 (KPI portfolio aggregate) | §4.2 two batched reads + status; KPI flat fields + `archived_at` + Postgres `kpi_measurements` `DISTINCT ON` all verified real | OK |
| FR-06 (systemKind traversal, inclusive-any) | §4.3 EXISTS subquery, `apoc.convert.fromJsonMap` verified in-repo, DD-06 pins OQ-2 inclusive-any | OK |
| FR-07 (OKR aggregate) | §4.5 two disjoint reads joined by directive id; R-2 substring fidelity correctly inherited, not "fixed" | OK — resolved |
| FR-08 (journey axis) | §4.4 new endpoint; reuse-check documented; `UserJourney PART_OF Domain` verified (`edges.ts:26`) | OK |
| FR-09 (OpenAPI) | §4.6 `openapi-performance.ts` + 2-line hook; mirrors `openapi-kpi-okr.ts` | OK |
| NFR-01 (read-only/additive) | All GET, no ERROR_CODES add, no v2 | OK |
| NFR-02 (zod, en-US, no tsc, central auth) | zod schemas, RBAC via `getRoutePermission` entries (§4.7), no per-route auth; `analytics:read` precedent verified (`rbac-permissions.ts:32`) | OK — RBAC null-hole closed in-task |
| NFR-03 (batched, ≤1/store) | DD-03, §4.2, AC-14; `/okr` two-read budget stated + spied (N-03) | OK |
| NFR-04 (snake_case kept) | §3.2 snake_case; only rename is `value/measured_at → latest_*` (N-01) | OK |
| NFR-05 (systemKind imported) | §3.2 import `SYSTEM_KINDS`, §6 `SYSTEM_KIND_LABELS`; export subpath verified in `shared/package.json` | OK |
| UX-01 states | §6 loading/error/2× empty/ready, AC-08/09 | OK |
| UX-02 tokens/catalog | §6 catalog KpiCard/LineChartCard/Pill/Button; Button `pressed` prop verified (`Button.tsx:16`); AC-10 | OK |
| UX-05 a11y | §6 focus order, aria-pressed, text+tone, main landmark, AC-11 | OK |
| UX-06 deep-link | §6 URL-first, AC-07 | OK |
| FILE-OWNERSHIP (`route.ts`) | DD-05, §4.7 additive append; no `#/model/*` row touched; one clean owner per Phase C | OK |

**Verified against code this pass:** RollDown/okr topology (`roll-down.ts:342-345`,
`489-504`, `561-567`) — `FOR_OKR`, `HAS_ASSIGNMENT`, `FOR_DOMAIN`, `a.weight`,
`a.status`, `RollDownAdjustment{roll_down_id,domain_id,status:'pending'}`;
`HAS_KEY_RESULT` + KeyResult `attributes.progress` (`okr-crud.ts:52,250`); directive
predicates (`okr-crud.ts:90,127,322`); KPI flat fields + `archived_at` +
`CONTRIBUTES_TO`/`USES_SYSTEM`/`PART_OF` edges; Postgres `kpi_measurements` +
`measured_at DESC` prior art (`kpi-measurements.ts:60`); `apoc.convert.fromJsonMap`
in-repo pattern; `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` + export subpath; KpiCard tone
union; Button `pressed`; exec tabs ending at `okr-management`; blueprint View Tree row.

## Verdict

**approve.** All three pass-1 blockers (B-01/B-02/B-03) and all five concerns
(C-01..C-05) plus the three nits are genuinely resolved — §4.5 was rewritten against
the real `RollDown → HAS_ASSIGNMENT → RollDownAssignment → FOR_DOMAIN` topology and
every pinned Cypher/property/component API verifies against current source. The
read-only/additive contract, RBAC in-task gating, snake_case fidelity, catalog/token
UI, URL-first slicer, and the single-clean-owner `route.ts` story are all sound. Two
minor open items remain (C-06 Read B aggregation-grouping note; N-04 `?domain`
scoping clarity) — both design-internal, covered by the AC-04 integration test, and
appropriate to carry into implementation rather than block a re-review.
