// product-delivery-process-model T-03 (design §5.1, §5.7 + review-design.md
// C-05) — `resolveContext` + `assertFixtureLoaded`. Read-only resolution over
// the loopback API via POST /api/v1/query/cypher. Resolves the operator root,
// the `product_delivery` domain, the shared System/Role catalog, the declared
// metric node ids, and the fixture nodes — every one by lookup, never by a
// hard-coded id (Rule D). A premature run (a dependency unseeded) fails fast and
// writes nothing (FR-01, NFR-02).
//
// C-05 pin: the foundation MERGEs shared catalog nodes on a top-level
// `operatorSeedKey` marker AND writes the same value as `seedKey` inside
// `attributes_json`. There is NO top-level `seedKey` property, so shared nodes
// are resolved by a TS-side `JSON.parse(attributes_json).seedKey` filter (the
// same shape used for the domain / metric / fixture resolves) — never by a
// non-existent `{seedKey:…}` Cypher match.

import {
  SEED_KEYS,
  SHARED_SYSTEM_KEYS,
  KPI_ROWS,
  type SeedKey,
} from "./rosters";
import { PRODUCT_KPI_METRIC_MAP } from "./kpi-metric-map";

export interface Context {
  rootId: string;
  domainId: string;
  systemIds: Record<string, string>; // shared-system seedKey → id (moms/data_warehouse)
  roleIds: Record<string, string>; // shared-role name → id (resolved shared roles)
  metricNodeIds: Record<string, string>; // metric seedKey → node id (declared MEASURES targets)
  fixtureNodeIds: Record<string, string>; // fixture seedKey → uuid
}

interface CypherResponse {
  rows: Array<Record<string, unknown>>;
}

export async function cypher(
  baseUrl: string,
  statement: string,
  params: Record<string, unknown> = {},
): Promise<CypherResponse> {
  const res = await fetch(`${baseUrl}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`product-delivery: query/cypher → ${res.status} ${detail}`);
  }
  return (await res.json()) as CypherResponse;
}

export function parseAttrs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

// The metric seedKeys this spec actually links today — only the declared
// (non-commented-out) values in PRODUCT_KPI_METRIC_MAP (B-02). A declared
// metric whose node is absent is a fail-fast (metric_not_seeded).
const DECLARED_METRIC_SEED_KEYS = Array.from(
  new Set(Object.values(PRODUCT_KPI_METRIC_MAP)),
);

// The fixture seedKeys the seed step must resolve (journeys + activities +
// slice-local roles/systems). Derived from SEED_KEYS minus the bounded context
// (a governed-route id, not a fixture node).
const FIXTURE_SEED_KEYS = (Object.keys(SEED_KEYS) as SeedKey[]).filter(
  (k) => k !== "pd-bc-product-delivery",
);

export async function resolveContext(baseUrl: string): Promise<Context> {
  // 1. Operator root — MATCH by name, TS-filter on saasOperatorRoot === true.
  const rootRes = await cypher(
    baseUrl,
    `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`,
  );
  const rootRow = rootRes.rows.find(
    (r) => parseAttrs(r.a).saasOperatorRoot === true,
  );
  if (!rootRow || typeof rootRow.id !== "string") {
    throw new Error(
      "operator_root_not_seeded: SaaS Operator root not found — run `bun run seed:saas-operator` first.",
    );
  }
  const rootId = rootRow.id;

  // 2. product_delivery domain — IN_MODEL the root, seedKey product_delivery.
  const domRes = await cypher(
    baseUrl,
    `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$rootId}) RETURN d.id AS id, d.attributes_json AS a`,
    { rootId },
  );
  const domRow = domRes.rows.find(
    (r) => parseAttrs(r.a).seedKey === "product_delivery",
  );
  if (!domRow || typeof domRow.id !== "string") {
    throw new Error(
      "product_domain_not_seeded: Product & Delivery domain (seedKey product_delivery) not found — run `bun run seed:saas-operator` first.",
    );
  }
  const domainId = domRow.id;

  // 3. Shared systems (moms/data_warehouse) — C-05: resolve by the top-level
  //    operatorSeedKey marker (equivalently the attributes_json seedKey).
  const sysRes = await cypher(
    baseUrl,
    `MATCH (s:System) WHERE s.operatorSeedKey IN $keys RETURN s.operatorSeedKey AS k, s.id AS id`,
    { keys: [...SHARED_SYSTEM_KEYS] },
  );
  const systemIds: Record<string, string> = {};
  for (const r of sysRes.rows) {
    if (typeof r.k === "string" && typeof r.id === "string") {
      systemIds[r.k] = r.id;
    }
  }
  for (const key of SHARED_SYSTEM_KEYS) {
    if (!systemIds[key]) {
      throw new Error(
        `shared_system_not_seeded: shared system "${key}" not found — run \`bun run seed:saas-operator\` first.`,
      );
    }
  }

  // 4. Metric node ids (B-02) — for each declared PRODUCT_KPI_METRIC_MAP value,
  //    resolve the metric's real UUIDv7 node id by attributes_json seedKey.
  const metricNodeIds: Record<string, string> = {};
  if (DECLARED_METRIC_SEED_KEYS.length > 0) {
    const metRes = await cypher(
      baseUrl,
      `MATCH (m:MetricDefinition) RETURN m.id AS id, m.attributes_json AS a`,
    );
    for (const r of metRes.rows) {
      const key = parseAttrs(r.a).seedKey;
      if (typeof key === "string" && typeof r.id === "string") {
        metricNodeIds[key] = r.id;
      }
    }
    for (const key of DECLARED_METRIC_SEED_KEYS) {
      if (!metricNodeIds[key]) {
        throw new Error(
          `metric_not_seeded: metric "${key}" not found — run \`bun run seed:saas-metric-library\` first.`,
        );
      }
    }
  }

  // 5. Fixture nodes (B-01) — resolve journeys/activities/slice-local
  //    roles/systems by attributes.seedKey (never by the pd-* literal as an id).
  const fixtureNodeIds: Record<string, string> = {};
  const fxRes = await cypher(
    baseUrl,
    `MATCH (n) WHERE n.attributes_json IS NOT NULL RETURN n.id AS id, n.attributes_json AS a`,
  );
  for (const r of fxRes.rows) {
    const key = parseAttrs(r.a).seedKey;
    if (typeof key === "string" && typeof r.id === "string") {
      if ((FIXTURE_SEED_KEYS as string[]).includes(key)) {
        fixtureNodeIds[key] = r.id;
      }
    }
  }

  // 6. Shared roles — any KPI/story role whose name matches a foundation
  //    catalog role. Resolve all :Role by name so slice-local + shared are
  //    addressable. (The resolve-or-create slice role is handled at write time
  //    in steps.ts; this map is for shared-role resolution.)
  const roleIds: Record<string, string> = {};
  const roleRes = await cypher(
    baseUrl,
    `MATCH (r:Role) RETURN r.id AS id, r.name AS name`,
  );
  for (const r of roleRes.rows) {
    if (typeof r.name === "string" && typeof r.id === "string") {
      roleIds[r.name] = r.id;
    }
  }

  return { rootId, domainId, systemIds, roleIds, metricNodeIds, fixtureNodeIds };
}

// §5.7 step 2 — assert the foundation loader imported the fixture. Resolve
// pd-journey-roadmap by seedKey; absent → throw product_fixture_not_loaded.
export function assertFixtureLoaded(context: Context): void {
  if (!context.fixtureNodeIds["pd-journey-roadmap"]) {
    throw new Error(
      "product_fixture_not_loaded: the product-delivery.json fixture has not been imported — run `bun run seed:saas-operator` first.",
    );
  }
}

// Guard KPI align-target keys reference real fixture nodes (dev-time safety).
export function assertAlignTargetsResolvable(context: Context): void {
  for (const kpi of KPI_ROWS) {
    for (const t of kpi.alignTargets) {
      if (t.type === "domain") continue;
      if (!context.fixtureNodeIds[t.key]) {
        throw new Error(
          `align_target_unresolved: KPI "${kpi.name}" aligns to "${t.key}" which is not a resolved fixture node.`,
        );
      }
    }
  }
}
