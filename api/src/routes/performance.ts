// kpi-okr-performance-dashboards — read-only performance aggregates
// (design §4.1..§4.5). GET-only under /api/v1/analytics/performance/*
// (DD-01, NFR-01): no write path, no ERROR_CODES addition, no /api/v2/.
//
// Single-store contract (DEC-03 / XD-02 as amended): every handler here
// reads Neo4j ONLY — this module never imports the Postgres client
// (design §7; pinned by api/__tests__/performance-no-postgres-import.test.ts).

import type { Driver } from "neo4j-driver";
import {
  performanceSliceQuerySchema,
  rollDownAssignmentStatusEnum,
  type KpiStatus,
  type KpiStatusRow,
  type OkrDomainAssignment,
  type OkrPerformanceRow,
} from "@companygraph/shared/schema/performance";
import { SYSTEM_KINDS, type SystemKind } from "@companygraph/shared/schema/system-kind";
import { getDriver } from "../neo4j/driver";
import { ok, parseWith } from "./_helpers";

// ── Status computation (DD-02, was DEC-01) ─────────────────────────────
// The on_target | warning | breach | no_data verdict is derived ONCE,
// server-side, in the FR-05 aggregate; the view is a pure renderer.
//
// Contract (design §4.2, N-02 + N-07):
// - latest == null                          → no_data
// - target_value == null                    → no_data  (N-07 defensive —
//   the declared row type is nullable; TS `v >= null` would coerce)
// - higher_is_better: v >= target → on_target;
//   v < critical_threshold → breach; v < warning_threshold → warning;
//   else on_target (within the warning band).
// - lower_is_better mirror: v <= target → on_target;
//   v > critical → breach; v > warning → warning; else on_target.
// - target_is_exact (N-02, pinned): the default tolerance is EXACT
//   EQUALITY (v === target → on_target); the warning/critical bands are
//   absolute deviations from target: |v - target| > critical → breach,
//   |v - target| > warning → warning; on_target ONLY when v === target.
// - Null threshold → skip that branch (degrade to the coarser verdict:
//   a KPI that misses target with no applicable warning band → warning).
// - Unrecognized/null target_direction → no_data guard, never throw.

export interface KpiStatusInput {
  target_value: number | null;
  target_direction: string | null;
  warning_threshold: number | null;
  critical_threshold: number | null;
}

export function computeKpiStatus(kpi: KpiStatusInput, latest: number | null): KpiStatus {
  if (latest === null || latest === undefined) return "no_data";
  const target = kpi.target_value;
  if (target === null || target === undefined) return "no_data"; // N-07
  const v = latest;
  const warning = kpi.warning_threshold ?? null;
  const critical = kpi.critical_threshold ?? null;

  switch (kpi.target_direction) {
    case "higher_is_better": {
      if (v >= target) return "on_target";
      if (critical !== null && v < critical) return "breach";
      if (warning !== null && v < warning) return "warning";
      // Missed target: within the warning band → on_target per the §4.2
      // table; no warning band at all degrades to the coarser `warning`.
      return warning === null ? "warning" : "on_target";
    }
    case "lower_is_better": {
      if (v <= target) return "on_target";
      if (critical !== null && v > critical) return "breach";
      if (warning !== null && v > warning) return "warning";
      return warning === null ? "warning" : "on_target";
    }
    case "target_is_exact": {
      // Exact equality plus absolute deviation bands (N-02): on_target
      // ONLY when v === target; bands grade the deviation severity.
      if (v === target) return "on_target";
      const deviation = Math.abs(v - target);
      if (critical !== null && deviation > critical) return "breach";
      if (warning !== null && deviation > warning) return "warning";
      // Nonzero deviation inside the bands (or with no bands): not
      // exactly on target — coarser verdict is warning.
      return "warning";
    }
    default:
      // Total over the declared domain: unknown direction → no_data,
      // never throw (design §4.2).
      return "no_data";
  }
}

// ── Slice-param resolution (FR-04, design §4.1) ─────────────────────────
// domain/journey are hard-validated UUIDs — a malformed value makes
// parseWith throw ValidationError → the standard 400 envelope (AC-06).
// `kind` is NEVER hard-validated: any value outside SYSTEM_KINDS resolves
// to undefined (the `all` slice, AC-03/AC-06 N-03), never a 400.
export interface PerformanceSlice {
  domain?: string;
  journey?: string;
  kind?: SystemKind;
}

export function resolveSlice(url: URL): PerformanceSlice {
  const q = parseWith(performanceSliceQuerySchema, {
    // reuses the governed _helpers.parseWith (DD-04)
    domain: url.searchParams.get("domain") ?? undefined,
    journey: url.searchParams.get("journey") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
  });
  const kind = (SYSTEM_KINDS as readonly string[]).includes(q.kind ?? "")
    ? (q.kind as SystemKind)
    : undefined; // "all"/unknown → undefined
  const slice: PerformanceSlice = {};
  if (q.domain) slice.domain = q.domain;
  if (q.journey) slice.journey = q.journey;
  if (kind) slice.kind = kind;
  return slice;
}

// ── KPI portfolio aggregate (FR-05, FR-02, DD-02, DD-03) ────────────────
// Fragment composition rule (C-03): exactly ONE `WHERE` — the base
// `WHERE k.archived_at IS NULL`; every optional fragment below is an
// `AND …` appended to it, and no fragment ever opens a second WHERE.
// Absent slice params drop their fragment entirely, so the three
// fragments compose unconditionally in any combination.

// {domainFilter} (kpi-measurement-alignment FR-04) — ALIGNED_TO-only:
// a KPI matches the domain slice if it has an ALIGNED_TO edge to the
// domain itself OR to an entity PART_OF that domain (UserJourney→Domain
// 1 hop, Activity→UserJourney→Domain 2 hops). The flat k.domain_id
// property is NO LONGER read (FR-06) — alignment is solely graph-based.
const DOMAIN_FILTER = `
AND EXISTS {
  MATCH (k)-[:ALIGNED_TO]->(t)
  WHERE t.id = $domain
     OR (t)-[:PART_OF*1..2]->(:Domain {id: $domain})
}`;

// {journeyFilter} (kpi-measurement-alignment FR-04) — ALIGNED_TO-only:
// the KPI is aligned directly to the journey, or to an activity
// PART_OF the journey.
const JOURNEY_FILTER = `
AND EXISTS {
  MATCH (k)-[:ALIGNED_TO]->(t)
  WHERE t.id = $journey
     OR (t)-[:PART_OF]->(:UserJourney {id: $journey})
}`;

// {kindFilter} (FR-06, DD-06 inclusive-any, kpi-measurement-alignment
// FR-07) — a KPI is in scope for ?kind=X when ANY System reachable via
// its ALIGNED_TO journey/activity carries systemKind X inside
// attributes_json (the same apoc.convert.fromJsonMap pattern
// system-augmentation-model uses). A KPI with no KPI→…→System path is
// excluded from a non-`all` slice. Still within Read 1 — an EXISTS
// subquery, not an extra round trip.
const KIND_FILTER = `
AND EXISTS {
  MATCH (k)-[:ALIGNED_TO]->(t)
  MATCH (a:Activity)
  WHERE a = t OR (a)-[:PART_OF]->(t)
  MATCH (a)-[:USES_SYSTEM]->(s:System)
  WHERE apoc.convert.fromJsonMap(coalesce(s.attributes_json,"{}")).systemKind = $kind
}`;

// Read 2 (DEC-03, rev 3) — batched latest :KPIMeasurement per kpi_id over
// the sliced id set, collect-after-sort latest-per-key. Source parity:
// the same label + properties handleKpiTrendsGet reads. measured_at is an
// ISO-8601 string (kpiMeasurementSchema), so ORDER BY … DESC string
// ordering is chronologically correct — the same convention
// handleKpiTrendsGet relies on. One query regardless of KPI count (AC-14).
const LATEST_MEASUREMENT_CYPHER = `
MATCH (m:KPIMeasurement)
WHERE m.kpi_id IN $ids
WITH m ORDER BY m.measured_at DESC
WITH m.kpi_id AS kpi_id, collect(m)[0] AS latest
RETURN kpi_id, latest.value AS value, latest.measured_at AS measured_at`;

// Risk R-5 note (rev-2 Risk R-1 is DISSOLVED by DEC-03 — portfolio and
// sparkline now share the :KPIMeasurement source; both read Neo4j). The
// surviving consequence is requirements Risk 7: measurements recorded via
// the REST POST /api/v1/kpi-measurements route live in Postgres and
// render `no_data` here — documented, not fixed, per the blueprint ruling.
//
// Budget (AC-14 as revised): ≤ 2 Neo4j round trips, 0 Postgres, constant
// in KPI count. An empty id set from Read 1 short-circuits (no Read 2).
export async function handlePerformanceKpis(req: Request): Promise<Response> {
  const slice = resolveSlice(new URL(req.url));

  let cypher = `MATCH (k:KPI) WHERE k.archived_at IS NULL`;
  const params: Record<string, unknown> = {};
  if (slice.domain) {
    cypher += DOMAIN_FILTER;
    params.domain = slice.domain;
  }
  if (slice.journey) {
    cypher += JOURNEY_FILTER;
    params.journey = slice.journey;
  }
  if (slice.kind) {
    cypher += KIND_FILTER;
    params.kind = slice.kind;
  }
  cypher += `
RETURN k.id AS kpi_id, k.name AS name, k.unit AS unit,
       k.target_value AS target_value, k.target_direction AS target_direction,
       k.warning_threshold AS warning_threshold, k.critical_threshold AS critical_threshold
ORDER BY k.name`;

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // Read 1 — sliced KPI set (one round trip).
    const r1 = await session.run(cypher, params);
    const kpis = r1.records.map((r) => ({
      kpi_id: r.get("kpi_id") as string,
      name: r.get("name") as string,
      unit: (r.get("unit") ?? null) as string | null,
      target_value: (r.get("target_value") ?? null) as number | null,
      target_direction: (r.get("target_direction") ?? null) as string | null,
      warning_threshold: (r.get("warning_threshold") ?? null) as number | null,
      critical_threshold: (r.get("critical_threshold") ?? null) as number | null,
    }));

    // Read 2 — batched latest :KPIMeasurement (one round trip); empty id
    // set short-circuits so the total stays ≤ 2 Neo4j / 0 Postgres.
    const latestById = new Map<string, { value: number | null; measured_at: string | null }>();
    const ids = kpis.map((k) => k.kpi_id);
    if (ids.length > 0) {
      const r2 = await session.run(LATEST_MEASUREMENT_CYPHER, { ids });
      for (const rec of r2.records) {
        latestById.set(rec.get("kpi_id") as string, {
          value: (rec.get("value") ?? null) as number | null,
          measured_at: (rec.get("measured_at") ?? null) as string | null,
        });
      }
    }

    // In-memory join + DD-02 status computation. Field remap (N-01): the
    // store columns value/measured_at become latest_value/
    // latest_measured_at — the ONLY rename; everything else keeps its
    // as-built snake_case name verbatim (NFR-04).
    const rows: KpiStatusRow[] = kpis.map((k) => {
      const latest = latestById.get(k.kpi_id);
      return {
        kpi_id: k.kpi_id,
        name: k.name,
        unit: k.unit,
        target_value: k.target_value,
        target_direction: k.target_direction,
        latest_value: latest?.value ?? null,
        latest_measured_at: latest?.measured_at ?? null,
        status: computeKpiStatus(k, latest?.value ?? null),
      };
    });
    return ok({ rows });
  } finally {
    await session.close();
  }
}

// ── OKR roll-down performance aggregate (FR-07, FR-03, DD-04) ───────────
// The two data the exec needs — a directive's key-result progress and its
// per-domain roll-down assignment status — live in TWO DISJOINT subgraphs
// reached by two different anchors (design §4.5, B-01/B-03). No single
// graph pattern spans both, so this handler issues exactly two batched
// Neo4j reads and joins them in memory by directive id.
//
// Round-trip budget (§4.5 N-03): exactly two Neo4j reads, zero Postgres,
// both batched over the directive id set — no per-directive N+1. An
// empty directive set from Read A legitimately short-circuits Read B
// (mirrors the /kpis empty-id-set rule; tasks N-02, 2026-07-05 cycle).

// Read A — directive + key-result progress, anchored on the directive.
// {directivePredicate} is the GOVERNED predicate, cited by handler name
// (C-05): with ?domain it is handleOkrPerformanceGet's
// `dir.attributes_json CONTAINS $domainId`; without, the directive-list
// handler's (handleOkrDirectiveList) top-level
// `NOT dir.attributes_json CONTAINS '"domain_id"'`.
// Risk R-2 (inherited): the substring match's false-positive envelope is
// the governed handlers' — correcting it belongs to kpi-okr-governance
// (its Risk 3), never "improved" here.
// C-01: progress is a real 0..100 key INSIDE KeyResult.attributes_json,
// read via apoc.convert.fromJsonMap — not a top-level property.
const OKR_READ_A_SLICED = `
MATCH (dir:OKRDirective)
WHERE dir.attributes_json CONTAINS $domainId
OPTIONAL MATCH (dir)-[:HAS_KEY_RESULT]->(kr:KeyResult)
RETURN dir.id AS directive_id, dir.name AS directive_name,
       collect(DISTINCT CASE WHEN kr IS NULL THEN null ELSE {
         id: kr.id,
         name: kr.name,
         progress: apoc.convert.fromJsonMap(coalesce(kr.attributes_json, "{}")).progress
       } END) AS key_results
ORDER BY dir.name`;

const OKR_READ_A_TOP_LEVEL = `
MATCH (dir:OKRDirective)
WHERE NOT dir.attributes_json CONTAINS '"domain_id"'
OPTIONAL MATCH (dir)-[:HAS_KEY_RESULT]->(kr:KeyResult)
RETURN dir.id AS directive_id, dir.name AS directive_name,
       collect(DISTINCT CASE WHEN kr IS NULL THEN null ELSE {
         id: kr.id,
         name: kr.name,
         progress: apoc.convert.fromJsonMap(coalesce(kr.attributes_json, "{}")).progress
       } END) AS key_results
ORDER BY dir.name`;

// Read B — per-domain assignment status + weight + adjustment flag,
// anchored on the :RollDown {type:'okr'} node, replaying the
// handleOkrRollDownGet topology VERBATIM, restricted to Read A's id set.
// The adjustment node joins by its roll_down_id/domain_id PROPERTIES
// (created by handleRollDownAdjustmentPost) — there is no edge.
// C-06: the count(adj) aggregate implicitly groups by every
// non-aggregated returned key — exactly (dir.id, a.domain_id, d.name,
// a.status, a.weight) — so adjustment_requested aggregates per
// (directive, domain), never across the whole result. Keep this
// projection list intact when editing the query. Null-`a` rows from the
// OPTIONAL MATCH are dropped server-side BEFORE schema validation.
// FR-03: adjustment_requested is derived from a pending
// :RollDownAdjustment count, NEVER from a.status.
const OKR_READ_B = `
MATCH (r:RollDown {type: 'okr'})-[:FOR_OKR]->(dir:OKRDirective)
WHERE dir.id IN $directiveIds
OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)-[:FOR_DOMAIN]->(d:Domain)
OPTIONAL MATCH (adj:RollDownAdjustment {status: 'pending'})
  WHERE adj.roll_down_id = r.id AND adj.domain_id = a.domain_id
RETURN dir.id AS directive_id,
       a.domain_id AS domain_id,
       d.name       AS domain_name,
       a.status     AS status,
       a.weight     AS weight,
       count(adj) > 0 AS adjustment_requested
ORDER BY directive_id, domain_name`;
// ^ Execution deviation from design §4.5's `ORDER BY dir.name, d.name`:
// under the RETURN aggregation Cypher forbids referencing variables not
// in the projection ("not possible to access variables declared before
// the WITH/RETURN: dir"), so the ORDER BY uses the projected aliases.
// The C-06 grouping key projection is untouched, and row order is
// immaterial — the handler folds Read B into a map keyed by
// directive_id before responding. (Design line-anchors drift note N-05.)

// N-04 (pinned rev 3): `?domain` filters DIRECTIVES (the Read A
// predicate) only; Read B's per-domain assignment rows are NOT
// re-filtered by ?domain — a domain-sliced /okr still shows each matched
// directive's full domain column set. The view consumes this as-is.
//
// N-06 (rev-3 cycle design review, executor judgment recorded): multiple
// :RollDown {type:'okr'} anchors can exist per directive (each
// POST /roll-down/okr CREATEs a new node). Duplicate (directive_id,
// domain_id) rows are surfaced AS-IS, matching the governed
// handleOkrRollDownGet behavior (option (b)); identical rows collapse
// anyway under the C-06 grouping key. AC-04 asserts neither way.
export async function handlePerformanceOkr(req: Request): Promise<Response> {
  const slice = resolveSlice(new URL(req.url));

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // Read A (one round trip) — directive + key-result progress.
    const rA = slice.domain
      ? await session.run(OKR_READ_A_SLICED, { domainId: slice.domain })
      : await session.run(OKR_READ_A_TOP_LEVEL);

    const directives = rA.records.map((r) => ({
      directive_id: r.get("directive_id") as string,
      directive_name: r.get("directive_name") as string,
      key_results: ((r.get("key_results") ?? []) as Array<
        { id: string; name: string; progress: number | null } | null
      >)
        .filter((kr): kr is { id: string; name: string; progress: number | null } => kr !== null)
        .map((kr) => ({ id: kr.id, name: kr.name, progress: kr.progress ?? null })),
    }));

    // Read B (one round trip) — batched over the directive id set;
    // short-circuited when Read A is empty (not a budget violation).
    const domainsByDirective = new Map<string, OkrDomainAssignment[]>();
    const directiveIds = directives.map((d) => d.directive_id);
    if (directiveIds.length > 0) {
      const rB = await session.run(OKR_READ_B, { directiveIds });
      for (const rec of rB.records) {
        const domainId = rec.get("domain_id") as string | null;
        const rawStatus = rec.get("status") as string | null;
        // C-06: a :RollDown with no assignments yields null-`a` rows —
        // dropped here, before okrDomainAssignmentSchema validation
        // (the schema requires non-null domain_id/status).
        if (domainId === null || rawStatus === null) continue;
        const parsedStatus = rollDownAssignmentStatusEnum.safeParse(rawStatus);
        if (!parsedStatus.success) continue; // non-canonical stored literal — never re-invent
        const entry: OkrDomainAssignment = {
          domain_id: domainId,
          domain_name: (rec.get("domain_name") ?? null) as string | null,
          status: parsedStatus.data,
          weight: (rec.get("weight") ?? null) as number | null,
          adjustment_requested: rec.get("adjustment_requested") === true,
        };
        const key = rec.get("directive_id") as string;
        const list = domainsByDirective.get(key);
        if (list) list.push(entry);
        else domainsByDirective.set(key, [entry]);
      }
    }

    // Server-side join by directive_id. Directives with no roll-down —
    // or with a roll-down but no assignments — get domains: [].
    const rows: OkrPerformanceRow[] = directives.map((d) => ({
      directive_id: d.directive_id,
      directive_name: d.directive_name,
      key_results: d.key_results,
      domains: domainsByDirective.get(d.directive_id) ?? [],
    }));
    return ok({ rows });
  } finally {
    await session.close();
  }
}

// ── Journey axis aggregate (FR-08, DD-07) ───────────────────────────────
// The FR-08 reuse check (design, verified 2026-07-04) confirmed no
// governed route lists UserJourney nodes per domain, so this endpoint is
// ADDED. $domain is required (UUID-validated via resolveSlice); a bare
// call with no domain returns {rows:[]} rather than every journey — the
// axis is only meaningful within a chosen domain. Unknown domain →
// {rows:[]} (200, never 404 — AC-05). One Neo4j read, zero Postgres.
export async function handlePerformanceJourneys(req: Request): Promise<Response> {
  const slice = resolveSlice(new URL(req.url));
  if (!slice.domain) return ok({ rows: [] });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id: $domain})
       RETURN j.id AS id, j.name AS name ORDER BY j.name`,
      { domain: slice.domain },
    );
    const rows = result.records.map((r) => ({
      id: r.get("id") as string,
      name: r.get("name") as string,
    }));
    return ok({ rows });
  } finally {
    await session.close();
  }
}
