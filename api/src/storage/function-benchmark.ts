// function-benchmark-scoring T-04 (design §4.3, DD-02, DD-03, DD-10,
// DD-13, C-01(a), N-02) — the model-scoped Neo4j READ + orchestrator.
//
// `computeBenchmarkReport(driver)` resolves the SaaS-Operator root by the
// foundation marker (never a hard-coded id), enumerates its six function
// domains, batches the per-report reads (activities+roles+systems,
// grounded KPIs, latest measurements, activity→KPI coverage reach), then
// hands a plain read-shape to the pure scorer.
//
// READ-only invariant (NFR-01, NFR-02): every session opens in READ mode
// and runs only read queries — this module writes NOTHING to the graph.

import type { Driver } from "neo4j-driver";
import {
  keyActivityMarkSchema,
} from "@companygraph/shared/schema/key-activity";
import {
  DEFAULT_SYSTEM_KIND,
  SYSTEM_KINDS,
  type SystemKind,
} from "@companygraph/shared/schema/system-kind";
import type {
  BenchmarkReport,
  FunctionActivity,
  FunctionKpiGrounded,
  FunctionRead,
} from "@companygraph/shared/schema/function-benchmark";
import { scopedNodeIds } from "./model-scope";
import {
  scoreFunctions,
  AUGMENTATION_WEIGHT,
  DEFAULT_WEIGHTS,
} from "../derive/function-benchmark-score";

const OPERATOR_ROOT_NAME = "SaaS Operator";
const OPERATOR_ROOT_MARKER = "saasOperatorRoot";

// The six known function seedKeys (saas-operator-foundation FR-03).
const KNOWN_SEED_KEYS = new Set<string>([
  "marketing",
  "sales",
  "finance_accounting",
  "customer_success",
  "product_delivery",
  "platform_ops",
]);

// ── Neo4j integer coercion (driver returns {low,high} or number) ─────────
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function parseAttrs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function resolveSystemKind(raw: unknown): SystemKind {
  const attrs = parseAttrs(raw);
  const k = attrs.systemKind;
  return (SYSTEM_KINDS as readonly string[]).includes(k as string)
    ? (k as SystemKind)
    : DEFAULT_SYSTEM_KIND;
}

export async function computeBenchmarkReport(driver: Driver): Promise<BenchmarkReport> {
  // ── 1. Resolve the operator root (DD-02) ──────────────────────────────
  const rootSession = driver.session({ defaultAccessMode: "READ" });
  let rootId: string | null = null;
  try {
    const res = await rootSession.run(
      `MATCH (m:BusinessModel {name:$name}) RETURN m.id AS id, m.attributes_json AS attrs`,
      { name: OPERATOR_ROOT_NAME },
    );
    for (const rec of res.records) {
      const attrs = parseAttrs(rec.get("attrs"));
      if (attrs[OPERATOR_ROOT_MARKER] === true) {
        rootId = String(rec.get("id"));
        break;
      }
    }
  } finally {
    await rootSession.close();
  }

  // No operator root → the empty-200 report (DD-10). No further reads.
  if (rootId === null) {
    return {
      functions: [],
      meta: { functionCount: 0, modelId: null, weights: DEFAULT_WEIGHTS },
    };
  }

  // ── 2. Model-scope set (DD-03, consumed never re-implemented) ─────────
  const scoped = await scopedNodeIds(driver, rootId);
  const scopedIds = Array.from(scoped);

  // ── 3. Enumerate the six function domains ─────────────────────────────
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const domainRes = await session.run(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$rootId})
       RETURN d.id AS id, d.name AS name, d.attributes_json AS attrs`,
      { rootId },
    );
    const domains = domainRes.records
      .map((r) => ({
        id: String(r.get("id")),
        name: String(r.get("name") ?? ""),
        seedKey: String(parseAttrs(r.get("attrs")).seedKey ?? ""),
      }))
      .filter((d) => KNOWN_SEED_KEYS.has(d.seedKey));

    const domainIds = domains.map((d) => d.id);

    if (domainIds.length === 0) {
      return {
        functions: [],
        meta: { functionCount: 0, modelId: rootId, weights: DEFAULT_WEIGHTS },
      };
    }

    // ── 4a. activities + roles + systems (per-domain grouped, no APOC) ──
    const activityRes = await session.run(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {id:$rootId})
       WHERE d.id IN $domainIds
       OPTIONAL MATCH (d)<-[:PART_OF*1..]-(a:Activity) WHERE a.id IN $scopedIds
       OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
       OPTIONAL MATCH (a)-[:USES_SYSTEM]->(s:System)
       RETURN d.id AS domainId, a.id AS activityId,
              a.attributes_json AS activityAttrs,
              collect(DISTINCT r.id) AS roleIds,
              collect(DISTINCT s.attributes_json) AS systemAttrs`,
      { rootId, domainIds, scopedIds },
    );

    // Bin activities per domain.
    const activitiesByDomain = new Map<string, FunctionActivity[]>();
    for (const id of domainIds) activitiesByDomain.set(id, []);
    for (const rec of activityRes.records) {
      const domainId = String(rec.get("domainId"));
      const activityId = rec.get("activityId");
      if (activityId === null || activityId === undefined) continue; // OPTIONAL MATCH miss
      const roleIds = (rec.get("roleIds") as Array<string | null>).filter(
        (x): x is string => typeof x === "string",
      );
      const systemKinds = (rec.get("systemAttrs") as Array<unknown>)
        .filter((x) => x !== null && x !== undefined)
        .map((raw) => resolveSystemKind(raw));
      const attrs = parseAttrs(rec.get("activityAttrs"));
      const keyMarked =
        attrs.keyActivity !== undefined &&
        keyActivityMarkSchema.safeParse(attrs.keyActivity).success;
      activitiesByDomain.get(domainId)?.push({
        id: String(activityId),
        roleIds,
        systemKinds,
        keyMarked,
        coveredByKpi: false, // filled by 4d below
      });
    }

    // ── 4b. grounded KPIs (DD-13 attribution + MEASURES), per-domain-tagged ─
    const groundedRes = await session.run(
      `MATCH (k:KPI) WHERE k.archived_at IS NULL
       MATCH (k)-[:MEASURES]->(md:MetricDefinition)
       MATCH (d:Domain) WHERE d.id IN $domainIds
       WITH k, md, d
       WHERE k.domain_id = d.id
          OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t)
                      WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }
       RETURN DISTINCT d.id AS domainId, k.id AS kpi_id, k.name AS name,
              k.target_value AS target_value, k.target_direction AS target_direction,
              k.warning_threshold AS warning_threshold, k.critical_threshold AS critical_threshold,
              md.id AS metricId, md.name AS metricName,
              md.attributes_json AS metricAttrs`,
      { domainIds },
    );

    const groundedByDomain = new Map<string, FunctionKpiGrounded[]>();
    for (const id of domainIds) groundedByDomain.set(id, []);
    const kpiIdSet = new Set<string>();
    // Track partial rows so latest measurement can be attached after 4c.
    const rowsToFill: Array<{ domainId: string; kpi_id: string; row: FunctionKpiGrounded }> = [];
    for (const rec of groundedRes.records) {
      const domainId = String(rec.get("domainId"));
      const kpi_id = String(rec.get("kpi_id"));
      kpiIdSet.add(kpi_id);
      const metricAttrs = parseAttrs(rec.get("metricAttrs"));
      const benchmarkProse =
        typeof metricAttrs.benchmark === "string" ? metricAttrs.benchmark : "";
      const row: FunctionKpiGrounded = {
        kpi_id,
        name: String(rec.get("name") ?? ""),
        metricId: String(rec.get("metricId")),
        metricName: String(rec.get("metricName") ?? ""),
        benchmarkProse,
        latestValue: null, // filled by 4c
        target_value: toNum(rec.get("target_value")),
        target_direction:
          rec.get("target_direction") === null || rec.get("target_direction") === undefined
            ? null
            : String(rec.get("target_direction")),
        warning_threshold: toNum(rec.get("warning_threshold")),
        critical_threshold: toNum(rec.get("critical_threshold")),
      };
      groundedByDomain.get(domainId)?.push(row);
      rowsToFill.push({ domainId, kpi_id, row });
    }

    // ── 4c. latest measurement (batched, Neo4j :KPIMeasurement) ─────────
    if (kpiIdSet.size > 0) {
      const measRes = await session.run(
        `MATCH (m:KPIMeasurement)
         WHERE m.kpi_id IN $ids
         WITH m ORDER BY m.measured_at DESC
         WITH m.kpi_id AS kpi_id, collect(m)[0] AS latest
         RETURN kpi_id, latest.value AS value`,
        { ids: Array.from(kpiIdSet) },
      );
      const latestByKpi = new Map<string, number | null>();
      for (const rec of measRes.records) {
        latestByKpi.set(String(rec.get("kpi_id")), toNum(rec.get("value")));
      }
      for (const { kpi_id, row } of rowsToFill) {
        row.latestValue = latestByKpi.get(kpi_id) ?? null;
      }
    }

    // ── 4d. activity→KPI coverage reach (C-01(a), N-02) ─────────────────
    // ALL attributed KPIs (not only MEASURES-grounded, C-02): a KPI
    // attributed to the function (DD-13) is ALIGNED_TO the activity or its
    // parent UserJourney (1 hop).
    const coverageRes = await session.run(
      `MATCH (d:Domain) WHERE d.id IN $domainIds
       OPTIONAL MATCH (d)<-[:PART_OF*1..]-(a:Activity) WHERE a.id IN $scopedIds
       OPTIONAL MATCH (k:KPI) WHERE k.archived_at IS NULL AND (
         k.domain_id = d.id
         OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t)
                     WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }
       ) AND EXISTS {
         MATCH (k)-[:ALIGNED_TO]->(x)
         WHERE x.id = a.id OR (a)-[:PART_OF]->(x:UserJourney)
       }
       RETURN d.id AS domainId, a.id AS activityId, count(DISTINCT k) > 0 AS coveredByKpi`,
      { domainIds, scopedIds },
    );
    // Mark coveredByKpi per (domain, activity).
    const coveredMap = new Map<string, boolean>();
    for (const rec of coverageRes.records) {
      const activityId = rec.get("activityId");
      if (activityId === null || activityId === undefined) continue;
      coveredMap.set(
        `${String(rec.get("domainId"))}::${String(activityId)}`,
        Boolean(rec.get("coveredByKpi")),
      );
    }
    for (const [domainId, acts] of activitiesByDomain) {
      for (const a of acts) {
        a.coveredByKpi = coveredMap.get(`${domainId}::${a.id}`) ?? false;
      }
    }

    // ── 5. Assemble FunctionRead[] and score ────────────────────────────
    const functionReads: FunctionRead[] = domains.map((d) => ({
      seedKey: d.seedKey,
      name: d.name,
      domainId: d.id,
      activities: activitiesByDomain.get(d.id) ?? [],
      groundedKpis: groundedByDomain.get(d.id) ?? [],
    }));

    const { functions, meta } = scoreFunctions({
      functions: functionReads,
      augmentationWeights: AUGMENTATION_WEIGHT,
      compositeWeights: DEFAULT_WEIGHTS,
    });

    return {
      functions,
      meta: { functionCount: meta.functionCount, modelId: rootId, weights: meta.weights },
    };
  } finally {
    await session.close();
  }
}
