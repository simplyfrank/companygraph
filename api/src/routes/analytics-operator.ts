// cross-function-exec-rollup — read-only cross-function aggregates over the
// SaaS-Operator BusinessModel root (design §4). GET-only under
// /api/v1/analytics/operator/* (DD-01, NFR-01): no write path, no
// ERROR_CODES addition, no /api/v2/.
//
// Single-store contract for KPI measurement (DD-05): the KPI-health path
// reads Neo4j :KPIMeasurement ONLY — this module NEVER imports the Postgres
// client (pinned by api/__tests__/operator-no-postgres-measurement.test.ts).
// Risk data reaches Postgres solely by invoking the governed risk-register
// route handler (§4.3), never the pg client directly.

import type { Driver, Session } from "neo4j-driver";
import {
  operatorSliceQuerySchema,
  operatorFunctionEnum,
  type OperatorFunction,
  type OperatorKpiRow,
  type OperatorKpiTally,
  type OperatorRiskCell,
  type OperatorRiskHeatmap,
  type OperatorRiskRow,
  type OperatorRiskBands,
  type OperatorFunnelRow,
  type OperatorSlaRow,
  type OperatorSlaHealth,
  type OperatorSlaHealthTally,
  type OperatorOverviewRow,
} from "@companygraph/shared/schema/operator";
import { getDriver } from "../neo4j/driver";
import { ok, parseWith } from "./_helpers";
// Governed read-only route handlers invoked in-process (not the pg client):
import { computeKpiStatus } from "./performance"; // DD-04 — imported, not copied
import { handleRiskRegisterList } from "./risk-register"; // §4.3 governed read
import { handleSlaComplianceAllGet } from "./sla-compliance"; // §4.5 governed read

// ── Slice resolution (DD-03) ────────────────────────────────────────────
// `function` is a hard-validated enum: a malformed value makes parseWith
// throw ValidationError → the standard 400 envelope (AC-02). Absent → all six.
function resolveFunctionSlice(url: URL): OperatorFunction | undefined {
  const q = parseWith(operatorSliceQuerySchema, {
    function: url.searchParams.get("function") ?? undefined,
  });
  return q.function;
}

// ── 4.1 Function-scope resolver (DD-02, FR-01) — shared by all five ──────
// N-03 (seed is truth): the as-built saas-operator-foundation stores
// `saasOperatorRoot` / `seedKey` INSIDE attributes_json, not as top-level
// node props (confirmed against the landed Neo4j seed). The resolver
// therefore MATCHes them via apoc.convert.fromJsonMap — a wrong location
// would silently return an empty root (indistinguishable from "unseeded").
// One round trip, shared by every handler.
export interface OperatorFunctionScope {
  seedKey: OperatorFunction;
  name: string;
  domainId: string;
}
export interface OperatorResolved {
  rootId: string | null;
  functions: OperatorFunctionScope[];
}

const RESOLVER_CYPHER = `
MATCH (m:BusinessModel {name: "SaaS Operator"})
WHERE apoc.convert.fromJsonMap(coalesce(m.attributes_json, "{}")).saasOperatorRoot = true
OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
WITH m, d, apoc.convert.fromJsonMap(coalesce(d.attributes_json, "{}")) AS da
WHERE da.seedKey IN $seedKeys
RETURN m.id AS rootId,
       collect({ seedKey: da.seedKey, name: d.name, domainId: d.id }) AS functions`;

const ALL_SEED_KEYS = operatorFunctionEnum.options as readonly OperatorFunction[];

export async function resolveOperatorFunctions(
  session: Session,
  seedKey?: OperatorFunction,
): Promise<OperatorResolved> {
  const seedKeys = seedKey ? [seedKey] : [...ALL_SEED_KEYS];
  const result = await session.run(RESOLVER_CYPHER, { seedKeys });
  const rec = result.records[0];
  if (!rec) return { rootId: null, functions: [] };
  const rootId = (rec.get("rootId") ?? null) as string | null;
  const raw = (rec.get("functions") ?? []) as Array<{
    seedKey: string | null;
    name: string | null;
    domainId: string | null;
  }>;
  const functions: OperatorFunctionScope[] = raw
    .filter((f) => f.seedKey && f.domainId)
    .map((f) => ({
      seedKey: f.seedKey as OperatorFunction,
      name: (f.name ?? f.seedKey) as string,
      domainId: f.domainId as string,
    }));
  return { rootId, functions };
}

// ── 4.2 KPI health (handleOperatorKpis, FR-03/FR-04) — DD-04/DD-05 ───────
// Read 1: batched across ALL sliced function domains in ONE query so the
// round-trip count is constant in function/KPI count. Scope predicate mirrors
// performance.ts:131-135 (ALIGNED_TO + PART_OF*1..2 → :Domain) AND adds the
// flat k.domain_id = d.id disjunct (the deliberate CS-KPI superset, DD-05 —
// band-neutral). RETURN DISTINCT (C-04) collapses double-matched KPIs.
const KPI_READ1_CYPHER = `
MATCH (k:KPI) WHERE k.archived_at IS NULL
MATCH (d:Domain) WHERE d.id IN $domainIds
WITH k, d
WHERE k.domain_id = d.id
   OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t)
               WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }
RETURN DISTINCT d.id AS domainId, k.id AS kpi_id, k.name AS name, k.unit AS unit,
       k.target_value AS target_value, k.target_direction AS target_direction,
       k.warning_threshold AS warning_threshold, k.critical_threshold AS critical_threshold`;

// Read 2: batched latest :KPIMeasurement over the union of sliced KPI ids —
// performance.ts:170 LATEST_MEASUREMENT_CYPHER verbatim. Empty id set
// short-circuits (no Read 2). ≤ 2 Neo4j round trips regardless of KPI count.
const KPI_READ2_CYPHER = `
MATCH (m:KPIMeasurement)
WHERE m.kpi_id IN $ids
WITH m ORDER BY m.measured_at DESC
WITH m.kpi_id AS kpi_id, collect(m)[0] AS latest
RETURN kpi_id, latest.value AS value, latest.measured_at AS measured_at`;

interface KpiFunctionGroup {
  function: OperatorFunction;
  name: string;
  kpis: OperatorKpiRow[];
  tally: OperatorKpiTally;
}

async function deriveKpis(
  session: Session,
  functions: OperatorFunctionScope[],
): Promise<KpiFunctionGroup[]> {
  const domainIds = functions.map((f) => f.domainId);
  const byDomain = new Map<
    string,
    Array<{
      kpi_id: string;
      name: string;
      unit: string | null;
      target_value: number | null;
      target_direction: string | null;
      warning_threshold: number | null;
      critical_threshold: number | null;
    }>
  >();
  const allIds = new Set<string>();

  if (domainIds.length > 0) {
    const r1 = await session.run(KPI_READ1_CYPHER, { domainIds });
    for (const rec of r1.records) {
      const domainId = rec.get("domainId") as string;
      const row = {
        kpi_id: rec.get("kpi_id") as string,
        name: rec.get("name") as string,
        unit: (rec.get("unit") ?? null) as string | null,
        target_value: (rec.get("target_value") ?? null) as number | null,
        target_direction: (rec.get("target_direction") ?? null) as string | null,
        warning_threshold: (rec.get("warning_threshold") ?? null) as number | null,
        critical_threshold: (rec.get("critical_threshold") ?? null) as number | null,
      };
      allIds.add(row.kpi_id);
      const list = byDomain.get(domainId);
      if (list) list.push(row);
      else byDomain.set(domainId, [row]);
    }
  }

  const latestById = new Map<string, number | null>();
  const measuredById = new Map<string, string | null>();
  if (allIds.size > 0) {
    const r2 = await session.run(KPI_READ2_CYPHER, { ids: [...allIds] });
    for (const rec of r2.records) {
      const kpiId = rec.get("kpi_id") as string;
      latestById.set(kpiId, (rec.get("value") ?? null) as number | null);
      measuredById.set(kpiId, (rec.get("measured_at") ?? null) as string | null);
    }
  }

  return functions.map((fn) => {
    const rows = byDomain.get(fn.domainId) ?? [];
    const tally: OperatorKpiTally = { on_target: 0, warning: 0, breach: 0, no_data: 0 };
    const kpis: OperatorKpiRow[] = rows.map((k) => {
      const latest = latestById.has(k.kpi_id) ? (latestById.get(k.kpi_id) ?? null) : null;
      const status = computeKpiStatus(k, latest);
      tally[status] += 1;
      return {
        kpi_id: k.kpi_id,
        name: k.name,
        unit: k.unit,
        target_value: k.target_value,
        target_direction: k.target_direction,
        latest_value: latest,
        latest_measured_at: measuredById.get(k.kpi_id) ?? null,
        status,
      };
    });
    return { function: fn.seedKey, name: fn.name, kpis, tally };
  });
}

export async function handleOperatorKpis(req: Request): Promise<Response> {
  const slice = resolveFunctionSlice(new URL(req.url));
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const { rootId, functions } = await resolveOperatorFunctions(session, slice);
    const groups = await deriveKpis(session, functions);
    return ok({ saasOperatorRoot: rootId ?? "", functions: groups });
  } finally {
    await session.close();
  }
}

// ── 4.3 Risk heatmap (handleOperatorRisks, FR-05) — DD-06/DD-07 ──────────
// Per function, invoke the governed handleRiskRegisterList via the
// Response/.json()/.data contract (DD-06). ≤ 6 Response round-trips (one per
// function, bounded by the fixed function count — NOT N-per-risk). The
// (likelihood,impact) grid + per-band counts + drill-in rows are derived
// in-memory. Zero-risk function → all-zero heatmap, never an error.
function severityBand(score: number): keyof OperatorRiskBands {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

async function deriveRiskHeatmap(fnName: string): Promise<OperatorRiskHeatmap> {
  const res = await handleRiskRegisterList(
    new Request(`http://internal/api/v1/risk-register?domain=${encodeURIComponent(fnName)}`),
  );
  if (res.status !== 200) {
    throw new Error(`risk-register ${res.status} for domain=${fnName}`);
  }
  const body = (await res.json()) as { data?: unknown };
  const rows = Array.isArray(body.data) ? (body.data as Array<Record<string, unknown>>) : [];

  const cellMap = new Map<string, OperatorRiskCell>();
  const bands: OperatorRiskBands = { low: 0, medium: 0, high: 0, critical: 0 };
  const drillRows: OperatorRiskRow[] = [];

  for (const r of rows) {
    const status = String(r.status);
    if (!["open", "mitigating", "accepted", "resolved"].includes(status)) continue;
    const likelihood = Number(r.likelihood);
    const impact = Number(r.impact);
    if (!Number.isFinite(likelihood) || !Number.isFinite(impact)) continue;
    const key = `${likelihood}:${impact}`;
    const cell = cellMap.get(key);
    if (cell) cell.count += 1;
    else cellMap.set(key, { likelihood, impact, count: 1 });
    bands[severityBand(likelihood * impact)] += 1;
    drillRows.push({
      id: String(r.id),
      name: String(r.name ?? ""),
      likelihood,
      impact,
      status: status as OperatorRiskRow["status"],
      trend: (["up", "flat", "down"].includes(String(r.trend))
        ? String(r.trend)
        : "flat") as OperatorRiskRow["trend"],
      risk_type: r.risk_type == null ? null : String(r.risk_type),
    });
  }

  return { cells: [...cellMap.values()], bySeverityBand: bands, rows: drillRows };
}

export async function handleOperatorRisks(req: Request): Promise<Response> {
  const slice = resolveFunctionSlice(new URL(req.url));
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  let rootId: string | null;
  let functions: OperatorFunctionScope[];
  try {
    ({ rootId, functions } = await resolveOperatorFunctions(session, slice));
  } finally {
    await session.close();
  }
  const groups = [];
  for (const fn of functions) {
    groups.push({
      function: fn.seedKey,
      name: fn.name,
      heatmap: await deriveRiskHeatmap(fn.name),
    });
  }
  return ok({ saasOperatorRoot: rootId ?? "", functions: groups });
}

// ── 4.4 Funnel status (handleOperatorFunnels, FR-06) — DD-08/DD-09 ───────
// One bounded Cypher over the operator root, constant in funnel count. The
// coarse CONTAINS is a prefilter only; the authoritative modelId === rootId
// check parses each row's funnelAttrs.
const FUNNEL_CYPHER = `
MATCH (f:Funnel) WHERE f.attributes_json CONTAINS $rootIdNeedle
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, s ORDER BY s.stageOrder
OPTIONAL MATCH (s)-[c:CONVERTS_TO]->(:Stage)
RETURN f.id AS funnel_id, f.name AS name, f.attributes_json AS funnelAttrs,
       collect({ stageId: s.id, transitionAttrs: c.attributes_json }) AS chain
ORDER BY f.name`;

interface FunnelResolved {
  row: OperatorFunnelRow;
  functionSeedKey: OperatorFunction | null;
}

function parseAttrs(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function fetchOperatorFunnels(session: Session, rootId: string): Promise<FunnelResolved[]> {
  const result = await session.run(FUNNEL_CYPHER, { rootIdNeedle: rootId });
  const out: FunnelResolved[] = [];
  for (const rec of result.records) {
    const funnelAttrs = parseAttrs(rec.get("funnelAttrs") as string | null);
    if (funnelAttrs.modelId !== rootId) continue; // authoritative filter
    const chain = (rec.get("chain") ?? []) as Array<{
      stageId: string | null;
      transitionAttrs: string | null;
    }>;
    const stageIds = new Set<string>();
    // Distinct outgoing transitions per source stage → branch detection.
    let branch = false;
    const rates: number[] = [];
    // Count transitions and detect any stage with >1 outgoing CONVERTS_TO.
    const outgoingByStage = new Map<string, number>();
    for (const link of chain) {
      if (link.stageId) stageIds.add(link.stageId);
      if (link.transitionAttrs) {
        const n = (outgoingByStage.get(link.stageId ?? "") ?? 0) + 1;
        outgoingByStage.set(link.stageId ?? "", n);
        if (n > 1) branch = true;
        const ta = parseAttrs(link.transitionAttrs);
        const rate = Number(ta.conversionRate);
        if (Number.isFinite(rate)) rates.push(rate);
      }
    }
    const stageCount = stageIds.size;
    let overallConversion: number | "n/a";
    if (stageCount <= 1 || branch || rates.length === 0) {
      overallConversion = "n/a";
    } else {
      overallConversion = rates.reduce((a, b) => a * b, 1);
    }
    out.push({
      row: {
        funnel_id: rec.get("funnel_id") as string,
        name: rec.get("name") as string,
        stageCount,
        overallConversion,
      },
      functionSeedKey: (() => {
        const raw = funnelAttrs.functionSeedKey;
        const parsed = operatorFunctionEnum.safeParse(raw);
        return parsed.success ? parsed.data : null;
      })(),
    });
  }
  return out;
}

export async function handleOperatorFunnels(req: Request): Promise<Response> {
  const slice = resolveFunctionSlice(new URL(req.url));
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const { rootId, functions } = await resolveOperatorFunctions(session, slice);
    if (!rootId) {
      return ok({
        saasOperatorRoot: "",
        functions: functions.map((f) => ({ function: f.seedKey, name: f.name, funnels: [] })),
        unattributed: [],
      });
    }
    const all = await fetchOperatorFunnels(session, rootId);
    const anyMarked = all.some((f) => f.functionSeedKey !== null);

    const groups = functions.map((fn) => {
      let funnels: OperatorFunnelRow[];
      if (anyMarked) {
        // Marker exists — tighten to marked funnels for this function.
        funnels = all.filter((f) => f.functionSeedKey === fn.seedKey).map((f) => f.row);
      } else if (slice) {
        // Slice fallback (DD-09/C-02): zero markers + a slice → degrade to
        // the operator-root scope: ALL operator funnels under the slice.
        funnels = all.map((f) => f.row);
      } else {
        // All-functions view, zero markers → nothing attributes per function.
        funnels = [];
      }
      return { function: fn.seedKey, name: fn.name, funnels };
    });

    // unattributed: only meaningful in the all-functions view. Under a slice
    // (with fallback active) it is [] (DD-09).
    let unattributed: OperatorFunnelRow[];
    if (slice) {
      unattributed = [];
    } else if (anyMarked) {
      unattributed = all.filter((f) => f.functionSeedKey === null).map((f) => f.row);
    } else {
      // No markers, no slice → every funnel is unattributed (surfaced).
      unattributed = all.map((f) => f.row);
    }

    return ok({ saasOperatorRoot: rootId, functions: groups, unattributed });
  } finally {
    await session.close();
  }
}

// ── 4.5 SLA rollup (handleOperatorSlas, FR-07) — DD-10/DD-11 ─────────────
// Read 1: governed handleSlaComplianceAllGet — the only governed read that
// returns every non-archived SLA WITH its domain_id, including null-domain_id
// SLAs (B-01). Attribution: tier1 domain_id, tier2 batched ALIGNED_TO
// fallback, tier3 unattributed. Read 2 (/slas only): one batched
// max(breach_at) for latestBreachAt.
//
// C-05: latestBreachAt is ALL-TIME (Read 2 has no window); breachCount/health
// are window-scoped (handleSlaComplianceAllGet filters by window_days,
// sla-compliance.ts:385). This juxtaposition is intentional and documented,
// not reconciled — a row may show non-null latestBreachAt beside
// breachCount: 0 / health: within_target.
interface RawSlaCompliance {
  id: string;
  name: string;
  compliance_threshold: number | null;
  target_value: number | null;
  target_unit: string | null;
  domain_id: string | null;
  compliance_rate: number;
  breaches: { total: number; open: number };
}

const SLA_ALIGN_FALLBACK_CYPHER = `
MATCH (s:SLA)-[:ALIGNED_TO]->()-[:PART_OF*0..2]->(d:Domain)
WHERE s.id IN $unresolvedSlaIds AND d.id IN $functionDomainIds
RETURN s.id AS sla_id, d.id AS domain_id`;

const SLA_LATEST_BREACH_CYPHER = `
MATCH (b:SLABreach) WHERE b.sla_id IN $slaIds
RETURN b.sla_id AS sla_id, max(b.breach_at) AS latestBreachAt`;

function slaHealth(sla: RawSlaCompliance): OperatorSlaHealth {
  if (sla.breaches.open >= 1) return "breached";
  if (sla.compliance_threshold != null && sla.compliance_rate < sla.compliance_threshold)
    return "at_risk";
  return "within_target";
}

interface SlaAttribution {
  bySeedKey: Map<OperatorFunction, RawSlaCompliance[]>;
  unattributed: RawSlaCompliance[];
  allInScope: RawSlaCompliance[];
}

async function attributeSlas(
  session: Session,
  functions: OperatorFunctionScope[],
  slice: OperatorFunction | undefined,
): Promise<SlaAttribution> {
  const res = await handleSlaComplianceAllGet(
    new Request("http://internal/api/v1/sla-compliance/all"),
  );
  if (res.status !== 200) throw new Error(`sla-compliance/all ${res.status}`);
  const body = (await res.json()) as { slas?: RawSlaCompliance[] };
  const slas = Array.isArray(body.slas) ? body.slas : [];

  const domainIdToFn = new Map<string, OperatorFunction>();
  for (const fn of functions) domainIdToFn.set(fn.domainId, fn.seedKey);
  const functionDomainIds = functions.map((f) => f.domainId);

  const bySeedKey = new Map<OperatorFunction, RawSlaCompliance[]>();
  for (const fn of functions) bySeedKey.set(fn.seedKey, []);
  const unattributed: RawSlaCompliance[] = [];
  const unresolved: RawSlaCompliance[] = [];

  // tier 1 — domain_id.
  for (const sla of slas) {
    const fnKey = sla.domain_id ? domainIdToFn.get(sla.domain_id) : undefined;
    if (fnKey) bySeedKey.get(fnKey)!.push(sla);
    else unresolved.push(sla);
  }

  // tier 2 — batched ALIGNED_TO fallback over the leftover id set.
  if (unresolved.length > 0 && functionDomainIds.length > 0) {
    const r = await session.run(SLA_ALIGN_FALLBACK_CYPHER, {
      unresolvedSlaIds: unresolved.map((s) => s.id),
      functionDomainIds,
    });
    const slaToDomain = new Map<string, string>();
    for (const rec of r.records) {
      const slaId = rec.get("sla_id") as string;
      if (!slaToDomain.has(slaId)) slaToDomain.set(slaId, rec.get("domain_id") as string);
    }
    for (const sla of unresolved) {
      const domainId = slaToDomain.get(sla.id);
      const fnKey = domainId ? domainIdToFn.get(domainId) : undefined;
      if (fnKey) bySeedKey.get(fnKey)!.push(sla); // tier 2
      else unattributed.push(sla); // tier 3
    }
  } else {
    for (const sla of unresolved) unattributed.push(sla);
  }

  // Under a slice, only that function's rows are in scope; unattributed is [].
  const allInScope: RawSlaCompliance[] = [];
  if (slice) {
    for (const sla of bySeedKey.get(slice) ?? []) allInScope.push(sla);
  } else {
    for (const list of bySeedKey.values()) for (const sla of list) allInScope.push(sla);
    for (const sla of unattributed) allInScope.push(sla);
  }

  return { bySeedKey, unattributed: slice ? [] : unattributed, allInScope };
}

async function latestBreaches(
  session: Session,
  slaIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (slaIds.length === 0) return map;
  const r = await session.run(SLA_LATEST_BREACH_CYPHER, { slaIds });
  for (const rec of r.records) {
    map.set(rec.get("sla_id") as string, (rec.get("latestBreachAt") ?? null) as string | null);
  }
  return map;
}

function toSlaRow(sla: RawSlaCompliance, latestBreachAt: string | null): OperatorSlaRow {
  return {
    sla_id: sla.id,
    name: sla.name,
    compliance_threshold: sla.compliance_threshold ?? null,
    target_value: sla.target_value ?? null,
    target_unit: sla.target_unit ?? null,
    breachCount: sla.breaches.total,
    latestBreachAt,
    health: slaHealth(sla),
  };
}

export async function handleOperatorSlas(req: Request): Promise<Response> {
  const slice = resolveFunctionSlice(new URL(req.url));
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const { rootId, functions } = await resolveOperatorFunctions(session, slice);
    const attr = await attributeSlas(session, functions, slice);
    // Read 2 — batched latestBreachAt over the in-scope SLA id set (/slas only).
    const inScopeIds = attr.allInScope.map((s) => s.id);
    const breachMap = await latestBreaches(session, inScopeIds);

    const groups = functions.map((fn) => ({
      function: fn.seedKey,
      name: fn.name,
      slas: (attr.bySeedKey.get(fn.seedKey) ?? []).map((s) =>
        toSlaRow(s, breachMap.get(s.id) ?? null),
      ),
    }));
    const unattributed = attr.unattributed.map((s) => toSlaRow(s, breachMap.get(s.id) ?? null));

    return ok({ saasOperatorRoot: rootId ?? "", functions: groups, unattributed });
  } finally {
    await session.close();
  }
}

// ── 4.6 Overview compose (handleOperatorOverview, FR-02) — DD-12 ─────────
// Best-effort per signal: each of the four per-function derivations runs in
// its own try/catch; a throw sets that row's field to { error: true }; the
// overview still returns 200. Uses SUMMARY projections only — omits the SLA
// Read 2 latestBreachAt (a drill-in field). Read-count invariant: bounded by
// the fixed function count, independent of per-entity count (C-03).
export async function handleOperatorOverview(req: Request): Promise<Response> {
  const slice = resolveFunctionSlice(new URL(req.url));
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  let rootId: string | null;
  let functions: OperatorFunctionScope[];
  try {
    ({ rootId, functions } = await resolveOperatorFunctions(session, slice));

    // KPI (batched across all functions) — one derivation, per-function split.
    let kpiByFn: Map<OperatorFunction, OperatorKpiTally> | { error: true };
    try {
      const groups = await deriveKpis(session, functions);
      const m = new Map<OperatorFunction, OperatorKpiTally>();
      for (const g of groups) m.set(g.function, g.tally);
      kpiByFn = m;
    } catch {
      kpiByFn = { error: true };
    }

    // Funnel (one Cypher) — per-function counts.
    let funnelCountByFn: Map<OperatorFunction, number> | { error: true };
    try {
      const m = new Map<OperatorFunction, number>();
      for (const fn of functions) m.set(fn.seedKey, 0);
      if (rootId) {
        const all = await fetchOperatorFunnels(session, rootId);
        const anyMarked = all.some((f) => f.functionSeedKey !== null);
        for (const fn of functions) {
          if (anyMarked) {
            m.set(fn.seedKey, all.filter((f) => f.functionSeedKey === fn.seedKey).length);
          } else if (slice) {
            m.set(fn.seedKey, all.length); // slice fallback (DD-09)
          } // else 0 in the all-functions unmarked case
        }
      }
      funnelCountByFn = m;
    } catch {
      funnelCountByFn = { error: true };
    }

    // SLA (all + ≤1 fallback, NO Read 2) — per-function health tallies.
    let slaByFn: Map<OperatorFunction, OperatorSlaHealthTally> | { error: true };
    try {
      const attr = await attributeSlas(session, functions, slice);
      const m = new Map<OperatorFunction, OperatorSlaHealthTally>();
      for (const fn of functions) {
        const tally: OperatorSlaHealthTally = { within_target: 0, at_risk: 0, breached: 0 };
        for (const sla of attr.bySeedKey.get(fn.seedKey) ?? []) tally[slaHealth(sla)] += 1;
        m.set(fn.seedKey, tally);
      }
      slaByFn = m;
    } catch {
      slaByFn = { error: true };
    }

    // Risk (≤6 Response round-trips) — per function, own try/catch.
    const riskByFn = new Map<OperatorFunction, OperatorRiskBands | { error: true }>();
    for (const fn of functions) {
      try {
        const heatmap = await deriveRiskHeatmap(fn.name);
        riskByFn.set(fn.seedKey, heatmap.bySeverityBand);
      } catch {
        riskByFn.set(fn.seedKey, { error: true });
      }
    }

    const rows: OperatorOverviewRow[] = functions.map((fn) => ({
      function: fn.seedKey,
      name: fn.name,
      kpiHealth:
        "error" in kpiByFn
          ? { error: true as const }
          : kpiByFn.get(fn.seedKey) ?? { on_target: 0, warning: 0, breach: 0, no_data: 0 },
      riskHeatmap: riskByFn.get(fn.seedKey) ?? { low: 0, medium: 0, high: 0, critical: 0 },
      funnelCount:
        "error" in funnelCountByFn
          ? { error: true as const }
          : funnelCountByFn.get(fn.seedKey) ?? 0,
      slaHealth:
        "error" in slaByFn
          ? { error: true as const }
          : slaByFn.get(fn.seedKey) ?? { within_target: 0, at_risk: 0, breached: 0 },
    }));

    return ok({ saasOperatorRoot: rootId ?? "", functions: rows });
  } finally {
    await session.close();
  }
}
