---
feature: "kpi-okr-performance-dashboards"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, round-4 View Tree)"
status: "approved"
revision: 3
reviewing_requirements_revision: 3
addresses_review: "review-design.md (pass 1: B-01, B-02, B-03; C-01..C-05; N-01, N-02, N-03 — resolved in rev 2; pass 2 open items C-06, N-04 folded in — rev 3)"
addresses: "blueprint FINAL ARBITRATION 2026-07-04 (XD-02 amended), adopted by requirements rev 3 DEC-03 — FR-05 measurement source repointed Postgres kpi_measurements → Neo4j :KPIMeasurement; narrow conformance repoint under the pass-2 approve verdict, per STATUS.md plan"
size: "large"
---

# Design: kpi-okr-performance-dashboards

<!-- Small specs skip design entirely. Frontmatter `status` matters: the
     spec-guard hook blocks Write/Edit on any source file this document names
     until status is "approved". The §7 File Changes table is therefore the
     permission surface for implementation — every file the tasks touch is
     listed there. -->

## 1. Overview

This spec builds one **read-only executive performance-control surface**
(`#/exec/performance` → `PerformanceDashboard`) on top of the governed
KPI/SLA/OKR routes verified by `kpi-okr-governance` and the `systemKind`
vocabulary landed by `system-augmentation-model`. It consumes those
surfaces; it never re-specs, mutates, or re-implements them. The work
splits cleanly in two: a **thin server-aggregate tier** under
`/api/v1/analytics/performance/*` (four `GET`s that answer portfolio and
slice questions the per-KPI / per-domain governed routes cannot answer in
one call), and a **pure-renderer PWA view** that fetches those aggregates
and paints KPI status + trends + OKR roll-down performance, all sliced
URL-first by domain / journey / systemKind.

Five rules govern the design:

1. **Read-only, additive, GET-only (DD-01).** Every new endpoint is a
   `GET` under `/api/v1/analytics/performance/`. No CRUD, no mutation of
   KPI/OKR/SLA/roll-down state, no `ERROR_CODES` addition, no `/api/v2/`
   bump (NFR-01). The dashboard is display + link-out; commit / approve /
   reject / request-adjustment stay in `RollDown.tsx` (`_baseline`-owned).
2. **Status is computed once, server-side (DD-02, was DEC-01).** The
   `on_target | warning | breach | no_data` verdict is derived in the
   FR-05 aggregate from the KPI's `target_direction` +
   `warning_threshold` + `critical_threshold` + latest measurement. The
   view is a pure renderer that never recomputes it — one implementation,
   testable in isolation (AC-01).
3. **Batched single-store reads, never N+1 (DD-03, revised rev 3 per
   DEC-03).** The portfolio aggregate issues **at most two Neo4j round
   trips** — one sliced KPI read (nodes + optional slice traversal) and
   one batched latest-`:KPIMeasurement` read keyed by the sliced id set —
   and **zero Postgres round trips** per request, independent of KPI
   count (NFR-03 as revised, proven by the AC-14 query-count invariant).
4. **Reuse the governed surface, never re-invent it (DD-04).** The FR-07
   OKR aggregate replays the **two disjoint traversals** the governed
   handlers perform — the directive→key-results walk from
   `handleOkrPerformanceGet` and the `RollDown → HAS_ASSIGNMENT →
   RollDownAssignment → FOR_DOMAIN` roll-down walk from
   `handleOkrRollDownGet` — and joins them server-side keyed by directive
   id (§4.5). It never merges them into one graph pattern (they touch
   different subgraphs). The `attributes_json CONTAINS $domainId` substring
   match is inherited from the governed directive-by-domain predicate — its
   false-positive envelope is documented, not fixed here. The ZodError→400
   mapper (`parseWith` in `_helpers.ts`) landed by `kpi-okr-governance`
   FR-11 is reused verbatim; systemKind literals come only from
   `SYSTEM_KINDS` (never re-declared).
5. **One clean owner per touched shared file (DD-05).** `pwa/src/route.ts`
   gets a single additive append (one exec-tab row) — no `#/model/*` row
   touched, so Phase C sees `model-workspace-core` owning `#/model/*` and
   this spec owning the `#/exec/performance` row with no collision.
   `api/src/router.ts`, `api/src/routes/openapi.ts`,
   `api/src/auth/rbac-permissions.ts`, and `pwa/src/api.ts` get only the
   enumerated additive sections in §4.7 / §7.

Trade-off taken: **add the server aggregates** (DEC-02) rather than
aggregate client-side — the client-side alternative is O(N) round trips
(violates NFR-03) and would duplicate the DD-02 status logic. Trade-off
rejected: "improving" the governed `okr-performance` substring match
(FR-07 / Risk 3) — that is a `kpi-okr-governance` concern; silently
fixing it here would be an off-scope behavior change on a surface this
spec only reads.

## Revision notes (revision 2 → 3 — XD-02 conformance)

<!-- Inserted without renumbering: §2..§9 below keep their pass-1/pass-2
     review-cited numbers. -->

Revision 3 is the **conformance pass against requirements revision 3**
(blueprint FINAL ARBITRATION 2026-07-04, XD-02 as amended, recorded there
as DEC-03): the canonical KPI-measurement source for this dashboard is
Neo4j `:KPIMeasurement` — the same source the governed `kpi-trends` route
reads — not Postgres `kpi_measurements`. A narrow repoint under the
pass-2 approve verdict (`review-design.md`), not a re-design. No DD id is
added, removed, or renumbered; no FR/AC mapping changes.

| Change | Where |
|--------|-------|
| DD-03 restated single-store: ≤ 2 Neo4j round trips, 0 Postgres, constant in KPI count | §1 rule 3, §2 DD-03 |
| Stores-read table: Postgres dropped from this spec's read set; `:KPIMeasurement` added | §3.1 |
| Portfolio Read 2: Postgres `DISTINCT ON` → batched Neo4j latest-per-`kpi_id` Cypher | §4.2 |
| Risk R-1 (portfolio-vs-sparkline cross-store disagreement) **dissolved** — both reads now share `:KPIMeasurement`; new **Risk R-5** = requirements Risk 7 (REST-recorded measurements invisible → `no_data`) | §3.1, §4.2 |
| Test strategy: fixtures seed `:KPIMeasurement` via the direct-driver pattern; AC-14 spy asserts ≤ 2 `session.run`, **zero** `pg` `query` calls | §7, §8 |
| Rejected-alternatives ledger flipped: reading Postgres for the latest value is now the rejected (superseded) option | §9 |
| Pass-2 open items folded in: **C-06** (Read B aggregation grouping key + null-row drop), **N-04** (`?domain` filters directives, not assignment columns) | §4.5 |

## 2. Design decisions

| ID | Decision | Serves | Rationale / rejected |
|----|----------|--------|----------------------|
| DD-01 | All four new endpoints are `GET` under `/api/v1/analytics/performance/`; no write path, no error-code addition, additive under `/api/v1/`. | NFR-01, FR-05..FR-09 | Blueprint scope is "reads existing routes"; matches the existing `GET /api/v1/analytics/graph` namespace (RBAC `analytics:read`, `router.ts:804`). Rejected: mutating roll-down from the dashboard (out of scope, owned by `RollDown.tsx`). |
| DD-02 | Target/breach status computed server-side in the FR-05 aggregate (single authority); the view renders it. | FR-02, FR-05, AC-01 | One tested implementation; mirrors how `kpi-trends` already computes server-side. Rejected: client-side status (duplicates logic, drifts). **Was DEC-01** — pinned under XD-17. |
| DD-03 | **(revised rev 3 — DEC-03 / XD-02 as amended)** Portfolio aggregate = at most **two batched Neo4j reads, zero Postgres**, per request, regardless of KPI count: Read 1 the sliced KPI set, Read 2 the batched latest `:KPIMeasurement` per `kpi_id` over the sliced id set (§4.2). | NFR-03, AC-14, DEC-03 | O(1) round trips vs O(N); single store dissolves the rev-2 Risk R-1 portfolio-vs-sparkline disagreement (both reads now share `:KPIMeasurement`, the `handleKpiTrendsGet` source). Rejected: N per-KPI `kpi-trends` calls (NFR-03 breach); the rev-2 Postgres `DISTINCT ON` read (superseded by the arbitration — §9). |
| DD-04 | Reuse `parseWith` (`_helpers.ts`), the governed reads, and `SYSTEM_KINDS`; never re-declare a systemKind literal or re-map snake_case to camelCase. The FR-07 OKR aggregate replays **two disjoint governed traversals** (directive→key-results from `handleOkrPerformanceGet`; roll-down assignments from `handleOkrRollDownGet`) and joins them server-side by directive id — it is not one fused pattern (§4.5). | NFR-02, NFR-04, NFR-05, FR-07, FR-09 | Single vocabulary (XD-15), consistent field convention (`kpi-okr-governance` NFR-04). **Resolves B-03/DD-04-wording:** the two handlers read disjoint subgraphs — `okr-performance` carries no assignment/status/domain rows, so it cannot be the source of per-domain roll-down status; that comes only from the `RollDown` walk. Rejected: camelCase remap (diverges from routes this reads); fusing the two walks into one graph pattern (they share no path). |
| DD-05 | `pwa/src/route.ts` gets a single comment-anchored additive exec-tab append; all other shared files get only enumerated additive sections (§4.7). | FR-01, FILE-OWNERSHIP | Phase C sees one clean owner per file. Rejected: touching a `#/model/*` row (collision with `model-workspace-core`). |
| DD-06 | systemKind slice semantics = **inclusive-any** (a KPI matches `?kind=agentic` if *any* reachable System is agentic). Pins **OQ-2**. | FR-06, AC-03 | Matches "show me KPIs touched by agentic systems"; exclusive-all would hide most KPIs. §4.3 pins the Cypher. Rejected: exclusive-all (over-filters). |
| DD-07 | The journey axis is served by a **new** `GET /api/v1/analytics/performance/journeys?domain=<id>` — the FR-08 reuse check confirmed no governed route lists `UserJourney` per domain today. Resolves the FR-08 reuse-or-add fork. | FR-08, AC-05 | Verified 2026-07-04: `journeys*` routes are single-journey/versions/changes; `/nodes/:label` is single-node CRUD; `query/listDomains` has no journey analog. §4.4. Rejected: `POST /query/cypher` from the view (bare-array, no envelope, `query:read` not `analytics:read`). |
| DD-08 | The view fetches **only** the three new aggregate endpoints for its ready state (`/kpis`, `/okr`, `/journeys`) plus `GET /api/v1/domains` for the domain axis and `GET /api/v1/kpi-trends/:kpiId` on demand for a selected KPI sparkline. No per-KPI fan-out on first paint. | FR-01..FR-04, NFR-03 | Trends are lazy (one call when a KPI is expanded), so the ready state stays O(1) fetches. |

## 3. Data model

No new node labels, edge types, stores, or migrations (XD-02, NFR-01).
This section documents the read shapes the aggregates project and the zod
schemas that define the new endpoints' contracts.

### 3.1 Stores read (as-built, unchanged)

| Store | Data read | Via |
|-------|-----------|-----|
| Neo4j | `:KPI` nodes (flat snake_case: `id, name, unit, target_value, target_direction, warning_threshold, critical_threshold, domain_id, archived_at`); **`:KPIMeasurement` nodes (`{id, kpi_id, measured_at, value}`, `kpiMeasurementSchema` in `shared/src/schema/kpi-sla.ts`) — latest value per KPI (DEC-03, rev 3)**; `:UserJourney`/`:Activity`/`:System` for slice traversal; `:OKRDirective`/`:KeyResult`/`:RollDownAssignment` for the OKR aggregate | `getDriver()` (`api/src/neo4j/driver.ts`) |
| Postgres | **not read by this spec** (XD-02 as amended / DEC-03; the `kpi_measurements` table stays as-built for the `POST/GET /api/v1/kpi-measurements` routes that own it) | — |

**Risk R-4 (inherited, flagged — C-04).** The domain/journey/kind slices
(§4.2/§4.3, FR-04/FR-06) depend on KPIs having `CONTRIBUTES_TO` edges. Those
edges exist today **only in seed data** (`shared/seed/commercial-domain.json`);
**no API route creates them** — `POST /kpis` has no `CONTRIBUTES_TO` write
path. Per the blueprint, `CONTRIBUTES_TO` population is `kpi-impact-mapping`'s
surface (a later, unbuilt wave-4 spec). This design is correct in reading only:
the slices reflect whatever `CONTRIBUTES_TO` edges exist. The integration tests
(AC-02/AC-03) create their own fixtures, so CI is green; but on the running
dashboard a KPI created via `POST /kpis` will not appear in a journey/kind
slice until `kpi-impact-mapping` lands. Flagged for the consolidated report,
not fixed here (complements Risk R-3's monochrome-seed note).

`:KPI` measurements are read from **Neo4j `:KPIMeasurement` nodes** — the
same source the governed `kpi-trends` route reads (`handleKpiTrendsGet`,
`api/src/routes/kpi-trends.ts`: `MATCH (m:KPIMeasurement {kpi_id: $id}) …
RETURN m.id, m.measured_at, m.value`). This adopts the blueprint FINAL
ARBITRATION of 2026-07-04 (XD-02 as amended; requirements DEC-03), which
supersedes the revision-2 design's Postgres `kpi_measurements` read.
Rev-2 **Risk R-1** (portfolio latest value vs sparkline disagreeing across
stores) is thereby **dissolved** — both reads now share one store.

**Risk R-5 (inherited, flagged — requirements Risk 7).** No in-repo write
path produces `:KPIMeasurement` nodes (`kpi-okr-governance` V-02: the REST
`POST /api/v1/kpi-measurements` writes Postgres; only `kpi-trends` reads
the Neo4j label). Under DEC-03, every KPI whose measurements were recorded
via REST shows `status: no_data` on this dashboard, and a fresh seed shows
`no_data` everywhere. Rendered honestly via the `no_data` status (FR-02/
FR-05) and the AC-09 empty states — never errored, never silently blended
with Postgres. Test fixtures seed `:KPIMeasurement` directly via the
production driver (`kpi-okr-governance` design §3.4 pattern — the label
has no REST write path; AC-01/AC-02/AC-14). Documented, not fixed
(blueprint ruling); flagged for the consolidated report via DEC-03; store
unification stays a `kpi-okr-governance`-successor concern.

### 3.2 New zod schemas (`shared/src/schema/performance.ts`, new — FR-05..FR-09)

Request query params and response bodies are zod-defined so runtime
validation and OpenAPI generation share one source (graph-core FR-16
pattern, DD-04). snake_case field convention kept (NFR-04). systemKind
imported, never re-declared (NFR-05).

```ts
import { z } from "zod";
import { SYSTEM_KINDS } from "./system-kind";   // XD-15 single vocabulary (NFR-05)

// ── shared slice query (FR-04) ──────────────────────────────────────────
// domain/journey are hard-validated UUIDs; an unknown-but-well-formed id
// returns empty rows, not 404 (AC-02). `kind` is NOT hard-validated: any
// value outside SYSTEM_KINDS coerces to "all" (FR-06/AC-03/AC-06 N-03).
export const performanceSliceQuerySchema = z.object({
  domain: z.string().uuid().optional(),
  journey: z.string().uuid().optional(),
  kind: z.string().optional(),   // coerced to a SystemKind | "all" in the handler
});
export type PerformanceSliceQuery = z.infer<typeof performanceSliceQuerySchema>;

// ── FR-05: KPI portfolio status row ─────────────────────────────────────
export const kpiStatusEnum = z.enum(["on_target", "warning", "breach", "no_data"]);
export type KpiStatus = z.infer<typeof kpiStatusEnum>;

export const kpiStatusRowSchema = z.object({
  kpi_id: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  target_value: z.number().nullable(),
  target_direction: z.string().nullable(),   // higher_is_better | lower_is_better | target_is_exact
  latest_value: z.number().nullable(),
  latest_measured_at: z.string().nullable(),
  status: kpiStatusEnum,
});
export const kpiStatusResponseSchema = z.object({ rows: z.array(kpiStatusRowSchema) });

// ── FR-07: OKR roll-down performance row (as-built status literals) ──────
export const rollDownAssignmentStatusEnum =
  z.enum(["pending", "committed", "approved", "rejected"]);   // FR-03: as-built, never re-invented

export const okrDomainAssignmentSchema = z.object({
  domain_id: z.string(),
  domain_name: z.string().nullable(),
  status: rollDownAssignmentStatusEnum,
  weight: z.number().nullable(),        // B-02: sourced from :RollDownAssignment.weight (roll-down.ts), NOT a "contribution" prop — there is no a.contribution
  adjustment_requested: z.boolean(),    // derived from :RollDownAdjustment nodes, NOT from status (FR-03)
});
export const okrPerformanceRowSchema = z.object({
  directive_id: z.string(),
  directive_name: z.string(),
  // C-01: progress is a real 0..100 key INSIDE KeyResult.attributes_json
  // (keyResultCreateSchema.attributes.progress, okr-crud.ts), read via
  // apoc.convert.fromJsonMap — not a top-level KeyResult property.
  key_results: z.array(z.object({ id: z.string(), name: z.string(), progress: z.number().nullable() })),
  domains: z.array(okrDomainAssignmentSchema),
});
export const okrPerformanceResponseSchema = z.object({ rows: z.array(okrPerformanceRowSchema) });

// ── FR-08: journey axis row ─────────────────────────────────────────────
export const journeyAxisResponseSchema = z.object({
  rows: z.array(z.object({ id: z.string(), name: z.string() })),
});
```

Wiring: `shared/package.json` gains the export subpath
`"./schema/performance": "./src/schema/performance.ts"` (the package uses
an explicit exports map — mirrors the `./schema/system-kind` row
`system-augmentation-model` added); `shared/src/index.ts` re-exports.

## 4. Core logic

### 4.1 Endpoint dispatch + slice-param resolution (FR-04)

New route module `api/src/routes/performance.ts` exporting four handlers.
The router (`api/src/router.ts`) gains four dispatch lines in the
**`// Graph analytics routes`** block, immediately after
`analytics/graph` (§4.7):

```ts
if (sub === "analytics/performance/kpis"     && method === "GET") return handlePerformanceKpis(req);
if (sub === "analytics/performance/okr"      && method === "GET") return handlePerformanceOkr(req);
if (sub === "analytics/performance/journeys" && method === "GET") return handlePerformanceJourneys(req);
```

(Three literal-`sub` lines; the fourth surface — the KPI sparkline — is
the **existing** `GET /api/v1/kpi-trends/:kpiId`, not a new route.)

Slice resolution, shared helper in `performance.ts`:

```ts
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
function resolveSlice(url: URL): { domain?: string; journey?: string; kind?: SystemKind } {
  const q = parseWith(performanceSliceQuerySchema, {   // reuses _helpers.parseWith (DD-04)
    domain: url.searchParams.get("domain") ?? undefined,
    journey: url.searchParams.get("journey") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
  });
  const kind = (SYSTEM_KINDS as readonly string[]).includes(q.kind ?? "") ? (q.kind as SystemKind) : undefined; // "all"/unknown → undefined
  return { domain: q.domain, journey: q.journey, kind };
}
```

A malformed `domain`/`journey` (non-UUID) makes `parseWith` throw a
`ValidationError` → standard `400 {error:{code,message,details}}` (AC-06);
`kind=nonsense` never throws — it resolves to `undefined` (the `all` slice,
AC-03/AC-06 N-03).

### 4.2 KPI portfolio aggregate — `handlePerformanceKpis` (FR-05, FR-02, DD-02, DD-03)

Two batched **Neo4j** reads — zero Postgres (DEC-03, rev 3) — then an
in-memory join and status computation:

**Read 1 — sliced KPI set (one round trip):** select the sliced KPI id set + fields.

```cypher
MATCH (k:KPI) WHERE k.archived_at IS NULL
{domainFilter}
{journeyFilter}
{kindFilter}
RETURN k.id AS kpi_id, k.name AS name, k.unit AS unit,
       k.target_value AS target_value, k.target_direction AS target_direction,
       k.warning_threshold AS warning_threshold, k.critical_threshold AS critical_threshold
ORDER BY k.name
```

**Fragment composition rule (C-03).** There is exactly **one** `WHERE` in
this query — the base `WHERE k.archived_at IS NULL`. Every optional fragment
below is an `AND …` clause appended to that single `WHERE`; **no fragment ever
opens a second `WHERE`**. Absent slice params drop their fragment entirely
(the empty string), so the three fragments compose unconditionally in any
combination without string-concatenation breakage. A fragment is included only
when its slice param resolved (a domain/journey UUID present, or `kind`
resolved to a `SystemKind` per §4.1). Read 1 is a single round trip;
together with Read 2 the handler totals **≤ 2 Neo4j round trips and 0
Postgres** (AC-14, rev 3).

**`{domainFilter}` (C-02) — literal fragment, appended when `domain` is set:**

```cypher
AND (
  k.domain_id = $domain                                         // (a) flat property on the KPI (kpi-crud.ts)
  OR EXISTS {                                                     // (b) CONTRIBUTES_TO a target scoped to the domain
    MATCH (k)-[:CONTRIBUTES_TO]->(t)                              // t: UserJourney | Activity (edges.ts CONTRIBUTES_TO)
    MATCH (t)-[:PART_OF*1..2]->(:Domain {id: $domain})           // journey PART_OF domain, or activity PART_OF journey PART_OF domain
  }
)
```

**OR semantics pinned (C-02):** a KPI matches the domain slice if **either**
its flat `k.domain_id` equals `$domain` **or** it has a `CONTRIBUTES_TO` path
reaching that domain. A KPI with a **null** `domain_id` but a qualifying
`CONTRIBUTES_TO` path **does** match (branch (b) is independent of
`domain_id`). This is the single testable meaning AC-02's "narrows to KPIs
scoped to that domain" asserts. `PART_OF*1..2` covers both endpoint shapes:
`UserJourney→Domain` (1 hop) and `Activity→UserJourney→Domain` (2 hops), per
the `PART_OF` endpoint matrix in `edges.ts`.

**`{journeyFilter}` (C-02) — literal fragment, appended when `journey` is set:**

```cypher
AND EXISTS {
  MATCH (k)-[:CONTRIBUTES_TO]->(t)                               // t: UserJourney | Activity
  WHERE t.id = $journey                                          // KPI contributes directly to the journey
     OR (t)-[:PART_OF]->(:UserJourney {id: $journey})            // ...or to an activity PART_OF the journey
}
```

Journey scoping is `CONTRIBUTES_TO`-only (KPI nodes carry no flat
`journey_id`), matching the exec question "KPIs contributing to this journey."

**Read 2 — batched latest `:KPIMeasurement` (one round trip; DEC-03, rev
3):** latest measurement per sliced KPI id, batched with the
collect-after-sort latest-per-key pattern (source parity: this is the same
label + properties `handleKpiTrendsGet` reads — `m.kpi_id`,
`m.measured_at`, `m.value`):

```cypher
MATCH (m:KPIMeasurement)
WHERE m.kpi_id IN $ids
WITH m ORDER BY m.measured_at DESC
WITH m.kpi_id AS kpi_id, collect(m)[0] AS latest
RETURN kpi_id, latest.value AS value, latest.measured_at AS measured_at
```

`$ids` is the id array from Read 1. `measured_at` is an ISO-8601 string
(`kpiMeasurementSchema`, `shared/src/schema/kpi-sla.ts`), so the `ORDER BY
… DESC` string ordering is chronologically correct — the same convention
`handleKpiTrendsGet` relies on for its `m.measured_at >= $windowStart`
window comparison. One query regardless of KPI count (AC-14). Empty id set
from Read 1 short-circuits (no Read 2 issued — total stays ≤ 2 Neo4j, and
always 0 Postgres).

**Field remap (N-01):** the store columns `value` / `measured_at` are
projected into the response as `latest_value` / `latest_measured_at`
respectively when the two reads are joined in memory. This is the only rename;
all other fields keep their as-built snake_case names verbatim (NFR-04) — no
camelCase remap anywhere (DD-04).

**Status computation (DD-02)** — pure function `computeKpiStatus(kpi,
latest)` in `performance.ts`, unit-tested in isolation (AC-01):

```
latest == null                                   → "no_data"
higher_is_better:  v >= target                   → on_target
                   v <  critical_threshold       → breach
                   v <  warning_threshold         → warning   (else on_target)
lower_is_better:   v <= target                    → on_target
                   v >  critical_threshold        → breach
                   v >  warning_threshold          → warning   (else on_target)
target_is_exact:   v == target (±tolerance*)      → on_target
                   |v-target| beyond critical band → breach
                   |v-target| beyond warning band  → warning
```

`*` **exact-match tolerance pinned (N-02).** For `target_is_exact`, the
default tolerance is **exact equality** (`v === target` → `on_target`); the
warning/critical bands are then interpreted as absolute deviations from
target: `|v - target| > critical_threshold → breach`,
`|v - target| > warning_threshold → warning`, else `on_target`. Where
`warning_threshold` / `critical_threshold` carry a deviation magnitude they are
used directly; where a band is null that branch is skipped (degrading to the
coarser verdict, below). This exact-equality-plus-absolute-band contract is a
testable unit invariant (AC-01), stated here so the test author and
implementer agree before code — the pure function repeats it in a comment.
When a threshold field is null the corresponding branch degrades
to the coarser verdict (a KPI with a value but no thresholds → `on_target`
if it meets target, else `warning`). The function is total over the
`target_direction` domain; an unrecognized direction → `no_data` guard
(never throws). Response: `kpiStatusResponseSchema` rows.

**Risk R-1 — dissolved (rev 3, DEC-03):** the portfolio latest value and
the FR-02 sparkline now read the **same store** (Neo4j `:KPIMeasurement`),
so the rev-2 cross-store disagreement cannot occur. The surviving
consequence is **Risk R-5** (§3.1): REST-recorded measurements (Postgres)
are invisible here — such KPIs render `no_data`, honestly, per FR-02/FR-05
and the AC-09 empty states.

### 4.3 systemKind slice traversal (FR-06, DD-06 inclusive-any)

The `{kindFilter}` fragment, appended only when `kind` resolves to a
`SystemKind`. A KPI is in scope for `?kind=agentic` when it reaches — via
its contributed journey/activity's systems — **any** `System` whose
`systemKind` attribute equals the requested kind:

```cypher
AND EXISTS {
  MATCH (k)-[:CONTRIBUTES_TO]->(t)          // t: UserJourney | Activity  (edges.ts:38)
  MATCH (a:Activity)
  WHERE a = t OR (a)-[:PART_OF]->(t)          // t is the activity, or activities under the journey
  MATCH (a)-[:USES_SYSTEM]->(s:System)        // edges.ts:32
  WHERE apoc.convert.fromJsonMap(coalesce(s.attributes_json,"{}")).systemKind = $kind
}
```

`systemKind` lives inside `attributes_json` (an ordinary key, per
`system-augmentation-model` §3.2), so it is read with the same
`apoc.convert.fromJsonMap` pattern that spec's migration uses (APOC is on
the compose image). Inclusive-any: the `EXISTS` subquery matches if *one*
reachable System qualifies (DD-06). A KPI with no KPI→…→System path is
excluded from a non-`all` kind slice (the `EXISTS` is false), never
crashed (FR-06). `$kind` is the resolved literal from `SYSTEM_KINDS`
(NFR-05). Still within Read 1 — the `EXISTS` is a subquery, not an extra
round trip; the handler's budget stays ≤ 2 Neo4j + 0 Postgres (AC-14).

### 4.4 Journey axis aggregate — `handlePerformanceJourneys` (FR-08, DD-07)

Reuse check (verified 2026-07-04, per requirements FR-08): no governed
route lists `UserJourney` nodes per domain — `journeys*` routes are
single-journey/versions/changes, `/nodes/:label` is single-node CRUD,
`query/listDomains` has no journey analog. So this endpoint is **added**
(DD-07). One Neo4j read:

```cypher
MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id: $domain})
RETURN j.id AS id, j.name AS name ORDER BY j.name
```

`$domain` is required (validated as UUID via `resolveSlice`; a bare call
with no `domain` returns `{rows:[]}` rather than every journey — the axis
is only meaningful within a chosen domain). Unknown domain → empty `rows`
(AC-05). Response: `journeyAxisResponseSchema`.

### 4.5 OKR roll-down performance aggregate — `handlePerformanceOkr` (FR-07, FR-03, DD-04)

**Resolves B-01, B-02, B-03, C-01, C-05, N-03.** Rewritten against the
real as-built graph topology (verified 2026-07-04 against
`api/src/routes/roll-down.ts` and `api/src/routes/okr-crud.ts`). The two
data the exec needs — a directive's key-result progress, and the directive's
per-domain roll-down assignment status — live in **two disjoint subgraphs**
and are reached by **two different anchors**. There is no single graph
pattern that spans both (B-01/B-03), so this handler issues **two Neo4j
reads** and joins them in memory by directive id. That is its stated
round-trip budget (see N-03 note below).

**As-built topology (verified, not invented):**

- Directive → key results: `(:OKRDirective)-[:HAS_KEY_RESULT]->(:KeyResult)`
  (`handleOkrPerformanceGet`, `okr-crud.ts` §`OKR Performance Summary`;
  `handleKeyResultGet`, same file). `progress` is a `0..100` number **inside**
  `KeyResult.attributes_json` (`keyResultCreateSchema.attributes.progress`),
  read via `apoc.convert.fromJsonMap` (C-01).
- Directive → per-domain assignment: the assignment nodes do **not** hang off
  the directive. They hang off an intermediate `:RollDown {type:'okr'}` node:
  `(:RollDown {type:'okr'})-[:FOR_OKR]->(:OKRDirective)` and
  `(:RollDown {type:'okr'})-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)`
  (verbatim from `handleOkrRollDownGet`). There is **no `ROLLS_DOWN_TO` or
  `ASSIGNS` edge type** in `shared/src/schema/edges.ts` — the earlier draft
  invented them (B-01).
- Assignment status + weight: `:RollDownAssignment` stores `a.status`
  (`∈ {pending, committed, approved, rejected}`) and **`a.weight`** — there is
  no `a.contribution` property (B-02; confirmed against the assignment write
  paths and `handleRollDownContributionsByDomainGet`, which reads
  `a.weight` / `a.status`).
- Adjustment signal: `:RollDownAdjustment` is a standalone node carrying
  `{roll_down_id, domain_id, status:'pending', …}` (created by
  `handleRollDownAdjustmentPost`, `POST /roll-down/request-adjustment`). It is
  linked to the roll-down by the `roll_down_id` **property**, not by an edge,
  and to the domain by the `domain_id` property.

**Read A — directive + key-result progress (one round trip).** Reuses the
`handleOkrPerformanceGet` traversal shape; anchored on the directive:

```cypher
MATCH (dir:OKRDirective)
{directivePredicate}                          // §4.5.1 governed predicate — cite by handler, not line
OPTIONAL MATCH (dir)-[:HAS_KEY_RESULT]->(kr:KeyResult)
RETURN dir.id AS directive_id, dir.name AS directive_name,
       collect(DISTINCT CASE WHEN kr IS NULL THEN null ELSE {
         id: kr.id,
         name: kr.name,
         // C-01: progress lives inside attributes_json, not a top-level prop
         progress: apoc.convert.fromJsonMap(coalesce(kr.attributes_json, "{}")).progress
       } END) AS key_results
ORDER BY dir.name
```

`{directivePredicate}` (§4.5.1): when `?domain` is present, the governed
directive-by-domain predicate `WHERE dir.attributes_json CONTAINS $domainId`
(from `handleOkrPerformanceGet`); else the governed top-level predicate
`WHERE NOT dir.attributes_json CONTAINS '"domain_id"'` (from the
directive-list handler). **Cited by handler name, not line number (C-05)** —
line numbers drift; the predicate is the one those handlers use verbatim.
**Fidelity bound (Risk R-2, requirements C-03):** the substring match's
false-positive envelope is inherited as-is; correcting it belongs to
`kpi-okr-governance` (its Risk 3), never asserted or "improved" here.

**`?domain` scope (N-04, folded in rev 3):** the `?domain` axis filters
*directives* (via the substring predicate above); Read B's per-domain
assignment rows are **not** re-filtered by `?domain` — an unsliced `/okr`
returns all top-level directives with all their domain assignment rows,
and a domain-sliced `/okr` still shows each matched directive's **full**
domain column set. Stated so the view author does not expect `?domain` to
narrow the domain columns too.

**Read B — per-domain assignment status + weight + adjustment flag (one
round trip).** Anchored on the `:RollDown {type:'okr'}` node, replaying the
`handleOkrRollDownGet` topology, restricted to the directive id set from
Read A and joining the adjustment node by its `roll_down_id`/`domain_id`
properties:

```cypher
MATCH (r:RollDown {type: 'okr'})-[:FOR_OKR]->(dir:OKRDirective)
WHERE dir.id IN $directiveIds
OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)-[:FOR_DOMAIN]->(d:Domain)
OPTIONAL MATCH (adj:RollDownAdjustment {status: 'pending'})
  WHERE adj.roll_down_id = r.id AND adj.domain_id = a.domain_id
RETURN dir.id AS directive_id,
       a.domain_id AS domain_id,
       d.name       AS domain_name,
       a.status     AS status,     // as-built enum: pending | committed | approved | rejected
       a.weight     AS weight,     // B-02: weight, NOT contribution
       count(adj) > 0 AS adjustment_requested   // FR-03: separate signal, never derived from status
ORDER BY dir.name, d.name
```

`$directiveIds` is the directive id array from Read A (batched — one query
regardless of directive count, not one call per directive). Assignments carry
the as-built `status ∈ {pending, committed, approved, rejected}` — **no status
literal is re-invented** (FR-03); the schema enum is exactly these four.
`adjustment_requested` is `true` only when a matching pending
`:RollDownAdjustment` exists for that `(roll_down, domain)` — derived from a
`count > 0`, **not** from `a.status` (FR-03).

**Aggregation grouping key + null-row drop (C-06, folded in rev 3).** The
`count(adj) > 0` aggregate implicitly groups by every non-aggregated
returned key — exactly `(dir.id, a.domain_id, d.name, a.status, a.weight)`
— so `adjustment_requested` aggregates per `(directive, domain)`, never
across the whole result; the implementer must keep that projection list
intact when editing the query. When a `:RollDown` has no assignments the
`OPTIONAL MATCH` yields null-`a`/`d` rows (`domain_id = null`); those rows
are **dropped server-side before `okrDomainAssignmentSchema` validation**
(the schema requires non-null `domain_id`/`status`), which also makes the
null-`d.name` `ORDER BY` edge moot.

**Server-side join.** The handler keys Read A rows by `directive_id`, then
folds Read B rows into each directive's `domains: okrDomainAssignmentSchema[]`
by matching `directive_id`. Directives with no roll-down (no `:RollDown`
anchor) get `domains: []`; a directive with roll-down but no assignments gets
`domains: []` as well (the `OPTIONAL MATCH` yields a null assignment, filtered
out server-side). Response: `okrPerformanceResponseSchema`.

**N-03 round-trip budget (this endpoint).** Two Neo4j reads, both batched over
the directive/id set — **exactly two Neo4j round trips, zero Postgres**,
independent of directive/assignment count. This is intentionally two (not one)
because the directive-anchored and RollDown-anchored subgraphs share no path;
AC-14's ≤ 2-Neo4j / 0-Postgres invariant covers only `/kpis`, so `/okr`'s
two-read shape is design-internal, not an AC breach (and coincidentally
matches the same budget). The `okr-performance.integration`
test (§8) additionally spies `session.run` to assert this endpoint stays at
two calls (no per-directive N+1 creeping into the join).

Display-label note (FR-03): the view MAY render `pending` as "Awaiting" —
a **display mapping only**; the stored/tested contract stays the four
literals (AC-04).

### 4.6 OpenAPI registration (FR-09)

New module `api/src/routes/openapi-performance.ts` exporting
`registerPerformancePaths(registry: OpenAPIRegistry): void`, mirroring the
`openapi-kpi-okr.ts` pattern (`openapi.ts:64`). It registers the §3.2
request/response schemas and a `registerPath` entry for each of the three
new routes (the `kpi-trends` sparkline is already registered by
`kpi-okr-governance` FR-12). `api/src/routes/openapi.ts` gains exactly two
lines — an import and one call inside `getOpenApiDoc()` — a sanctioned
narrow additive touch (DD-05, §4.7). 400/404 responses reference the
existing `errorEnvelopeSchema`. AC-06 enumerates the expected path list.

### 4.7 Co-owned files: owned sections + merge rule (DD-05, FILE-OWNERSHIP)

Each shared file gets only the enumerated additive section; this spec
never edits any other part.

| File | Owned edit | Merge rule |
|------|-----------|-----------|
| `pwa/src/route.ts` | Append **one** row `{ id: "performance", label: "Performance" }` to the `exec` surface's `tabs` array, after `{ id: "okr-management", … }` (array ends there, `route.ts:76`). Comment-anchored `// kpi-okr-performance-dashboards: exec performance tab`. Touches **no** `#/model/*` row. | `model-workspace-core` owns `#/model/*` tabs; this spec owns the `exec.performance` row. No collision — different surfaces, additive append. Phase C sees one clean owner for `#/exec/performance`. |
| `api/src/router.ts` | Three dispatch lines in the `// Graph analytics routes` block after `analytics/graph` (§4.1) + import of the three handlers. | Section-ownership; never last-writer-wins. |
| `api/src/routes/openapi.ts` | Two lines: import `registerPerformancePaths` + call it in `getOpenApiDoc()`. | Additive hook only. |
| `api/src/auth/rbac-permissions.ts` | Three `P("GET", "analytics/performance/kpis"|"…/okr"|"…/journeys", "analytics:read")` entries in a `── Performance dashboards ──` section (mirrors `P("GET","analytics/graph","analytics:read")`, `rbac-permissions.ts:32`). | New section only; `getRoutePermission`/`matchSegments` logic untouched. |
| `pwa/src/api.ts` | New `performance` client object (§6) with `kpis()/okr()/journeys()` methods. | New object; existing methods (incl. `getPerformance`, `kpi.list`, `domains.list`) untouched. |
| `shared/package.json`, `shared/src/index.ts` | Export subpath + re-export for `./schema/performance`. | Additive rows. |

**RBAC rationale (mirrors `kpi-okr-governance` DD-12):** the router gate
skips the permission check when `getRoutePermission` returns `null`, so an
unlisted route is an authorization hole in issuer-configured mode. Each new
route therefore lands with its `ROUTE_PERMISSIONS` entry **in the same
task**, guarded by `analytics:read` (the same permission the existing
`analytics/graph` read uses). Verified by a unit test calling
`getRoutePermission` directly (AC-06 companion), since integration runs
execute with `ONELOGIN_ISSUER` unset (dev-fallback session) and cannot
observe a missing mapping.

## 5. HTTP API surface

All routes under `/api/v1/`, all `GET`, all read-only (NFR-01), auth via
the central router gate with the §4.7 `ROUTE_PERMISSIONS` entries. Envelope
errors per `_helpers.error`. **Bold** = new in this spec.

| Method | Route | FR | Request → Response |
|--------|-------|----|--------------------|
| **GET** | **`/analytics/performance/kpis`** | FR-05, FR-02, FR-06 | `?domain=&journey=&kind=` → 200 `kpiStatusResponseSchema` (status computed server-side); malformed `domain`/`journey` → 400 envelope; unknown `kind` → `all` slice; reads Neo4j only — `:KPI` + `:KPIMeasurement`, ≤ 2 round trips, 0 Postgres (DEC-03) |
| **GET** | **`/analytics/performance/okr`** | FR-07, FR-03 | `?domain=` → 200 `okrPerformanceResponseSchema` (per-directive roll-down perf; two batched Neo4j reads joined by directive id per §4.5 — key-result `progress` from `attributes_json`, per-domain `status`/`weight`/`adjustment_requested` from the `RollDown` walk; substring-match fidelity inherited, R-2) |
| **GET** | **`/analytics/performance/journeys`** | FR-08 | `?domain=<id>` → 200 `journeyAxisResponseSchema` (`UserJourney` `PART_OF` domain, ordered `name`); unknown/absent domain → `{rows:[]}` |
| GET | `/kpi-trends/:kpiId` | FR-02 | *(existing, `kpi-okr-governance`)* on-demand sparkline data for a selected KPI — read, not added |
| GET | `/kpis`, `/domains`, `/okr-directives`, `/okr-performance`, `/roll-down/*` | FR-02/03/04 | *(existing, governed)* consumed as-built; not modified |

Every new row appears in `GET /api/v1/openapi.json` after FR-09 (AC-06
enumerates the path list).

## 6. UI design

- **View tree placement** (blueprint round-4, verbatim — new exec tab):
  `#/exec/performance` → `PerformanceDashboard`. New SubNav tab
  `{ id: "performance", label: "Performance" }` appended to the `exec`
  surface `tabs` in `pwa/src/route.ts` (DD-05, §4.7). Registered in the
  view factory (`pwa/src/views/index.tsx`) as
  `"performance": (r) => <PerformanceDashboard route={r} />`, matching the
  existing `#/exec/*` factory rows. New file
  `pwa/src/views/exec/PerformanceDashboard.tsx` + `.module.css`.

- **URL-first slice state** (FR-04, UX-06): the view reads
  `route.params.domain / .journey / .kind` (central parse, `route.ts:150`);
  slice changes rewrite `location.hash` via `toHash({surface:"exec",
  tab:"performance"}, params)` (`route.ts:165`, same pattern
  `#/explorer/systems?kind=` uses). A sliced deep link
  `#/exec/performance?domain=…&journey=…&kind=agentic` survives reload
  (AC-07); clearing an axis rewrites the hash without full navigation
  (AC-07/AC-12). Unknown/absent params fall back to `All` on that axis.

- **Data layer** — a new `api.performance` client object (§4.7):
  `performance.kpis(slice, signal)` → `GET /analytics/performance/kpis`;
  `performance.okr(domainId?, signal)` → `.../okr`;
  `performance.journeys(domainId, signal)` → `.../journeys`. Domain axis
  reuses `api.domains.list()` (exists, `api.ts:200`); the selected-KPI
  sparkline reuses a `kpi-trends` fetch (existing route). **N-02
  (requirements):** the as-built `api.getPerformance(domainId)`
  (`api.ts:1035`) is per-domain and unchanged — the new methods are
  *additional*, not extensions of it. All fetches via `useFetch`
  (`pwa/src/useFetch.ts`) with `AbortSignal`.

- **Component plan** (catalog first, UX-02):
  - **KPI status panel** — one `KpiCard` (`charts/KpiCard.tsx`) per KPI:
    `label=name`, `value=latest_value + unit`, `caption=target`, `tone`
    mapped from `status` (`on_target→good`, `warning→warn`,
    `breach→danger`, `no_data→neutral` — the KpiCard `tone` union is
    exactly `good|warn|danger|neutral`, `KpiCard.tsx:11`). Status is also
    rendered as a text `Pill` ("On target" / "Warning" / "Breach" / "No
    data") so status is **text + tone, never color alone** (AC-11).
  - **Trend sparkline** — `LineChartCard` (`charts/LineChartCard.tsx`,
    `data: {label,value}[]`) fed from a `kpi-trends` fetch for the
    expanded/selected KPI (lazy, DD-08).
  - **OKR roll-down panel** — `Card` per directive; each assigned domain
    a row with a status `Pill` (the four literals; `pending` MAY display
    as "Awaiting" — display mapping only, FR-03) and an
    `adjustment_requested` badge when set. Link-out `Button`
    (`href="#/exec/okr-management"` / roll-down view) — **display +
    link-out only**, no mutation.
  - **Slicer** — domain `<select>` (options from `api.domains.list()`),
    journey `<select>` (options from `performance.journeys(domain)`,
    disabled until a domain is chosen), and a systemKind `<div
    role="group" aria-label="Filter by system kind">` of catalog
    `Button`s (`All`/`Functional`/`Agentic`/`AI predictive`, labels from
    `SYSTEM_KIND_LABELS`, values from `SYSTEM_KINDS` — NFR-05). Active
    kind button `aria-pressed` (the `Button` `pressed?` prop
    `system-augmentation-model` added). `ViewHeader`, `Loading`,
    `ErrorState` from `views/_shared.tsx`. No new component invented.

- **States** (UX-01):
  - *loading*: `<Loading what="performance" />` while aggregates fetch
    (AC-08).
  - *error*: `<ErrorState message=… />` on any aggregate fetch failure
    (AC-08).
  - *empty (no KPIs)*: `/analytics/performance/kpis` returns `{rows:[]}`
    with no active slice → "No KPIs yet" card (AC-09).
  - *empty (slice zero-match)*: an active slice yielding zero KPIs →
    distinct "No KPIs match this slice" message + a working clear-slice
    affordance resetting that axis to `All` (AC-09).
  - *ready*: KPI status panel + (lazy) trend cards + OKR roll-down panel
    (AC-08).

- **Tokens** (UX-02): all styling in
  `pwa/src/views/exec/PerformanceDashboard.module.css` using `var(--…)`
  tokens only; catalog chart/card/pill/button components; no hex/rgba/oklch
  literals. Gate: `bun scripts/design-conformance.ts` on the view exits 0
  (AC-10).

- **Input modes / a11y** (UX-03 n/a, UX-05): no canvas/gesture/drag/custom
  shortcut — slicer is native `<select>` + catalog `Button`s, charts are
  display-only. Focus order = DOM order (header → domain select → journey
  select → kind group → panels); native activation (Enter/Space) for
  selects and buttons; the active kind button exposes `aria-pressed`; each
  KPI status announced by text + tone (AC-11); the view wraps its content
  in a `main` landmark (or relies on the shell's `<main>` — verified in
  AC-11's manual pass). Native Conflicts: `(none)` — no scroll containers,
  focus traps, or global shortcuts introduced.

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/performance.ts` | new | FR-05..FR-09 | §3.2 request/response zod schemas; imports `SYSTEM_KINDS` (NFR-05) |
| `shared/package.json` | modify (narrow) | FR-05 | add `./schema/performance` export subpath |
| `shared/src/index.ts` | modify (narrow) | FR-05 | re-export the module |
| `api/src/routes/performance.ts` | new | FR-05..FR-08 | three handlers + `resolveSlice` + `computeKpiStatus` (§4.1..§4.5); Neo4j-only — no Postgres client import (DEC-03) |
| `api/src/router.ts` | modify (owned §4.7) | FR-05..FR-08 | 3 dispatch lines in `// Graph analytics routes` block + imports |
| `api/src/auth/rbac-permissions.ts` | modify (narrow §4.7) | FR-05..FR-08, NFR-02 | 3 `analytics:read` entries in a `── Performance dashboards ──` section |
| `api/src/routes/openapi-performance.ts` | new | FR-09 | `registerPerformancePaths` (§4.6) |
| `api/src/routes/openapi.ts` | modify (narrow §4.7) | FR-09 | two-line hook (import + call) |
| `pwa/src/route.ts` | modify (narrow §4.7) | FR-01 | append `{id:"performance",label:"Performance"}` to exec `tabs` (additive, comment-anchored) |
| `pwa/src/views/index.tsx` | modify (narrow) | FR-01 | `"performance"` factory row → `<PerformanceDashboard>` |
| `pwa/src/views/exec/PerformanceDashboard.tsx` | new | FR-01..FR-04, UX-01/02/05 | §6 view |
| `pwa/src/views/exec/PerformanceDashboard.module.css` | new | FR-01, UX-02 | tokens-only styles |
| `pwa/src/api.ts` | modify (narrow §4.7) | FR-02..FR-04 | new `performance` client object |
| `api/__tests__/performance-kpis.integration.test.ts` | new | FR-05/02/04, NFR-03 | AC-01, AC-02, AC-14 (≤ 2 Neo4j / 0 Postgres query-count); fixtures seed `:KPIMeasurement` via direct driver (§3.4 pattern) |
| `api/__tests__/performance-systemkind-slice.integration.test.ts` | new | FR-06 | AC-03 (inclusive-any, DD-06) |
| `api/__tests__/performance-okr.integration.test.ts` | new | FR-07/03 | AC-04 (four literals, adjustment signal) |
| `api/__tests__/performance-journeys.integration.test.ts` | new | FR-08 | AC-05 |
| `api/__tests__/performance-status.test.ts` | new | FR-02/05 (DD-02) | unit — `computeKpiStatus` all directions/thresholds (AC-01 pure-fn leg) |
| `api/__tests__/performance-rbac.test.ts` | new | NFR-02 (§4.7) | unit — `getRoutePermission` maps the 3 new routes to `analytics:read` |
| `api/__tests__/openapi.integration.test.ts` | modify | FR-09 | AC-06 path enumeration appended |
| `pwa/src/__tests__/performance-dashboard.test.tsx` | new | FR-01..FR-04, UX-01 | AC-07, AC-08, AC-09, AC-12 |
| `pwa/src/__tests__/performance-dashboard-a11y.test.tsx` | new | UX-05 | AC-11 |

Not changed, deliberately: any `kpi-okr-governance`-owned route/view file
(this spec reads them — AC-13 ownership check); `RollDown.tsx` /
`RollDownAnalytics.tsx` (link-out target only); `api.getPerformance`
(per-domain, unchanged — N-02); `system-kind.ts` (imported only, NFR-05).

## 8. Test strategy

**Unit (`bun test`, no Neo4j):**
- `performance-status.test.ts` → **AC-01 pure-fn leg**: `computeKpiStatus`
  over `higher_is_better` (≥target→on_target, <critical→breach, <warning→
  warning), `lower_is_better` mirror, `target_is_exact` band, and
  null-latest→no_data, null-threshold degradation, unknown-direction guard.
- `performance-rbac.test.ts` → **§4.7 RBAC**: `getRoutePermission("GET",
  ["analytics","performance","kpis"])` (and okr/journeys) returns
  `analytics:read`, never `null` (mirrors `kpi-okr-governance`
  `rbac-route-permissions.test.ts`).
- `pwa` vitest: `performance-dashboard.test.tsx` → **AC-07** (URL-param
  parse → pre-sliced render; hash rewrite on slice change),
  **AC-08** (mocked aggregate fetch → loading/error/ready), **AC-09**
  (zero KPIs → "No KPIs yet"; active slice zero-match → distinct message +
  working clear-slice), **AC-12** (domain→journey→kind click narrows both
  panels + updates hash; selected-KPI sparkline renders from mocked
  `kpi-trends`). `performance-dashboard-a11y.test.tsx` → **AC-11** (Tab
  reaches each slicer control in DOM order; active kind button
  `aria-pressed`; status rendered as text; `main` landmark present).

**Integration (`bun test:integration`, live Neo4j; HTTP against
`127.0.0.1:8787`; fixtures via the production `getDriver()` — including
direct-driver `:KPIMeasurement` seeding per the `kpi-okr-governance`
design §3.4 convention, since the label has no REST write path; Postgres
is not read by these endpoints — DEC-03):**
- `performance-kpis.integration.test.ts` → **AC-01** (status correctness
  end-to-end over seeded KPIs + `:KPIMeasurement` fixtures), **AC-02**
  (domain/journey slice narrows; unknown id → empty `rows`, not 404),
  **AC-14** (query-count invariant: spy driver `session.run` — **≤ 2** for
  the handler — and assert **zero** `pg` `query` calls; 50-KPI vs 5-KPI
  fixtures → same round-trip count).
- `performance-systemkind-slice.integration.test.ts` → **AC-03**
  (`?kind=agentic` returns only KPIs reaching an agentic System per DD-06
  inclusive-any; no-path KPI excluded; `kind` absent/`all`/unknown → all
  in-scope; fixtures create all three kinds — Risk R-3 monochrome seed
  worked around with created fixtures).
- `performance-okr.integration.test.ts` → **AC-04** (per-directive rows over
  the real as-built topology — fixtures created via the governed roll-down
  write routes: `(:RollDown{type:'okr'})-[:FOR_OKR]->(:OKRDirective)` +
  `-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)` +
  `(:OKRDirective)-[:HAS_KEY_RESULT]->(:KeyResult)`; a fresh assignment reads
  back `status:pending`, then `committed`/`approved`/`rejected` after the
  governed transition; `weight` (not `contribution`) surfaces from
  `a.weight`; `key_results[].progress` surfaces from `KeyResult.attributes_json`;
  `adjustment_requested` becomes `true` only after `POST /roll-down/request-adjustment`
  creates a pending `:RollDownAdjustment`, never derived from `status`;
  substring-match fidelity R-2 not asserted as a defect). Additionally spies
  `session.run` to assert the endpoint issues **exactly two Neo4j reads**
  regardless of directive count (§4.5 N-03 budget — no per-directive N+1).
- `performance-journeys.integration.test.ts` → **AC-05** (`UserJourney`
  `PART_OF` domain, ordered `name`; unknown domain → empty).
- `openapi.integration.test.ts` (extended) → **AC-06** (the three new
  paths appear in `openapi.json`; a malformed `domain` → 400 envelope;
  `?kind=nonsense` → 200 `all` slice, not 400 — N-03).

**Regression / gate (`bun run typecheck` + CLI, from requirements):**
- **AC-10** — `bun scripts/design-conformance.ts` exits 0 with
  `PerformanceDashboard.tsx` clean.
- **AC-13** — `bun run typecheck` exits 0; `openapi.integration.test.ts`
  stays green (aggregates additive); `git diff --name-only` shows no
  change under `kpi-okr-governance`-owned route/view paths (ownership).

**Manual with repro (from requirements):**
- **AC-07** — open `http://127.0.0.1:5173/#/exec/performance?domain=<id>&
  journey=<id>&kind=agentic` in macOS Chrome, Cmd+R (mouse): all three
  slicers show active, rows stay filtered.
- **AC-11** — keyboard-only macOS Safari: Tab through the three slicers,
  Enter on `Agentic`, verify rows narrow, focus ring visible, status pills
  read as text.
- **AC-12** — macOS Chrome click domain→journey→kind (mouse): both panels
  + hash update; iPhone Safari tap the same controls: tap targets activate.

## 9. Rejected alternatives

- **Client-side aggregation of the governed per-KPI/per-domain routes** —
  rejected (DD-03, was DEC-02): O(N) `kpi-trends` round trips (NFR-03
  breach) and duplicates the DD-02 status logic; the systemKind slice
  (FR-06) is a graph traversal with no per-KPI governed route. The server
  aggregates are the only NFR-03-compliant shape.
- **camelCase-remapping the aggregate responses** — rejected (DD-04,
  NFR-04): the governed surface is snake_case (`target_value`,
  `target_direction`); remapping diverges from the routes this reads.
- **Reusing `POST /query/cypher` from the view for the journey axis** —
  rejected (DD-07): bare-array shape, `query:read` (not `analytics:read`),
  and it would put raw Cypher in the client; the FR-08 endpoint gives a
  named, enveloped, one-source axis.
- **exclusive-all systemKind semantics** — rejected (DD-06/OQ-2): would
  hide any KPI whose journey touches even one non-agentic system, i.e.
  most KPIs; "KPIs touched by agentic systems" is the exec's question.
- **"Fixing" the `okr-performance` `attributes_json CONTAINS $domainId`
  substring match** (Risk R-2) — rejected (DD-04): an off-scope behavior
  change on a surface this spec only reads; correcting it belongs to
  `kpi-okr-governance` (its Risk 3). The false-positive envelope is
  inherited and documented.
- **Reading Postgres `kpi_measurements` for the latest value** (the
  revision-2 design) — superseded by the blueprint FINAL ARBITRATION
  2026-07-04 (XD-02 as amended; requirements DEC-03): the canonical
  dashboard measurement source is Neo4j `:KPIMeasurement`, the same store
  `kpi-trends` reads — which also dissolves rev-2 Risk R-1 (cross-store
  portfolio-vs-sparkline disagreement). The accepted consequence is Risk
  R-5 (§3.1): REST-recorded (Postgres) measurements render as `no_data`
  here — documented, not fixed, per the blueprint ruling; store
  unification stays a `kpi-okr-governance`-successor concern. Not a
  spec-author choice: a binding user ruling, recorded, never re-litigated
  here.
- **Wall-clock p95 assertion for NFR-03** — rejected: flakes on shared CI
  Neo4j; the AC-14 query-count invariant (≤ 2 Neo4j, 0 Postgres) is the
  robust proxy.
- **A new `SystemKindPill`/status-badge component** — rejected: catalog
  `Pill` + `KpiCard` tone cover it; no second consumer to justify
  extraction (UX-02 catalog-first).
- **Registering OpenAPI paths inline in `openapi.ts`** — rejected: swells a
  co-owned file; the two-line hook + `openapi-performance.ts` module keeps
  the §4.7 merge rule clean (mirrors `openapi-kpi-okr.ts`).
