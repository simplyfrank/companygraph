// cross-function-exec-rollup — shared precondition-seed helper for the
// operator-cockpit integration test files. Mirrors
// helpers/customer-success-fixtures.ts: seed the foundation SaaS-Operator
// root (idempotent, tolerated) so resolveOperatorFunctions has a root + six
// function domains to resolve, then each test layers its own controlled
// content (KPIs / risks / SLAs / funnels) attached to the resolved function
// domains via the production getDriver() singleton and cleans it up.

import { seedSaasOperator } from "../../scripts/seed-saas-operator";
import { getDriver } from "../../src/neo4j/driver";

export async function seedOperatorRoot(base: string): Promise<void> {
  try {
    await seedSaasOperator(base);
  } catch {
    // tolerated — the operator root/domains/systems are already present
    // (idempotent) or a sibling spec's persona guard threw. The tests
    // resolve handles themselves and skip loudly if the root is truly absent.
  }
}

export interface ResolvedFn {
  seedKey: string;
  name: string;
  domainId: string;
}
export interface ResolvedRoot {
  rootId: string | null;
  functions: ResolvedFn[];
}

// Resolve the operator root + function domains the SAME way the handler does
// (name + saasOperatorRoot marker inside attributes_json, seedKey inside the
// domain attributes_json) — so fixtures attach to exactly the ids the handler
// will read.
export async function resolveRootViaSeedTruth(): Promise<ResolvedRoot> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(`
      MATCH (m:BusinessModel {name: "SaaS Operator"})
      WHERE apoc.convert.fromJsonMap(coalesce(m.attributes_json, "{}")).saasOperatorRoot = true
      OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
      WITH m, d, apoc.convert.fromJsonMap(coalesce(d.attributes_json, "{}")) AS da
      RETURN m.id AS rootId,
             collect({ seedKey: da.seedKey, name: d.name, domainId: d.id }) AS functions`);
    const rec = r.records[0];
    if (!rec) return { rootId: null, functions: [] };
    const raw = (rec.get("functions") ?? []) as Array<{
      seedKey: string | null;
      name: string | null;
      domainId: string | null;
    }>;
    return {
      rootId: (rec.get("rootId") ?? null) as string | null,
      functions: raw
        .filter((f) => f.seedKey && f.domainId)
        .map((f) => ({
          seedKey: f.seedKey as string,
          name: (f.name ?? f.seedKey) as string,
          domainId: f.domainId as string,
        })),
    };
  } finally {
    await session.close();
  }
}

async function write(cypher: string, params: Record<string, unknown>): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

// ── controlled content builders ─────────────────────────────────────────

export async function createKpiForDomain(id: string, domainId: string, kpi: {
  name: string;
  target_value?: number;
  target_direction?: string;
  warning_threshold?: number | null;
  critical_threshold?: number | null;
}): Promise<void> {
  await write(
    `CREATE (k:KPI {
       id: $id, name: $name, domain_id: $domainId,
       target_value: $target_value, target_direction: $target_direction,
       warning_threshold: $warning_threshold, critical_threshold: $critical_threshold,
       archived_at: null, attributes_json: "{}"
     })`,
    {
      id,
      domainId,
      name: kpi.name,
      target_value: kpi.target_value ?? null,
      target_direction: kpi.target_direction ?? "higher_is_better",
      warning_threshold: kpi.warning_threshold ?? null,
      critical_threshold: kpi.critical_threshold ?? null,
    },
  );
}

export async function createMeasurement(kpiId: string, id: string, value: number, measuredAt: string): Promise<void> {
  await write(
    `CREATE (m:KPIMeasurement { id: $id, kpi_id: $kpiId, value: $value, measured_at: $measuredAt })`,
    { id, kpiId, value, measuredAt },
  );
}

export async function createFunnel(id: string, name: string, rootId: string, functionSeedKey?: string): Promise<void> {
  const attrs = functionSeedKey
    ? JSON.stringify({ modelId: rootId, functionSeedKey })
    : JSON.stringify({ modelId: rootId });
  await write(`CREATE (f:Funnel { id: $id, name: $name, attributes_json: $attrs })`, {
    id,
    name,
    attrs,
  });
}

// Attach an ordered stage chain with per-transition conversionRate.
export async function createFunnelChain(
  funnelId: string,
  stagePrefix: string,
  conversionRates: number[],
): Promise<void> {
  const nStages = conversionRates.length + 1;
  const stageIds: string[] = [];
  for (let i = 0; i < nStages; i++) {
    const sid = `${stagePrefix}-s${i}`;
    stageIds.push(sid);
    await write(
      `MATCH (f:Funnel {id:$funnelId})
       CREATE (s:Stage { id:$sid, name:$name, stageOrder:$order, attributes_json:"{}" })
       CREATE (f)-[:HAS_STAGE]->(s)`,
      { funnelId, sid, name: `Stage ${i}`, order: i },
    );
  }
  for (let i = 0; i < conversionRates.length; i++) {
    await write(
      `MATCH (a:Stage {id:$from}), (b:Stage {id:$to})
       CREATE (a)-[:CONVERTS_TO { attributes_json: $attrs }]->(b)`,
      {
        from: stageIds[i],
        to: stageIds[i + 1],
        attrs: JSON.stringify({ conversionRate: conversionRates[i] }),
      },
    );
  }
}

export async function createSla(id: string, name: string, domainId: string | null, opts?: {
  compliance_threshold?: number;
  target_value?: number;
  target_unit?: string;
}): Promise<void> {
  await write(
    `CREATE (s:SLA {
       id:$id, name:$name, domain_id:$domainId, archived_at:null,
       compliance_threshold:$ct, target_value:$tv, target_unit:$tu, attributes_json:"{}"
     })`,
    {
      id,
      name,
      domainId,
      ct: opts?.compliance_threshold ?? 95,
      tv: opts?.target_value ?? 99,
      tu: opts?.target_unit ?? "percent",
    },
  );
}

export async function createBreach(id: string, slaId: string, breachAt: string, resolutionStatus: string): Promise<void> {
  await write(
    `CREATE (b:SLABreach {
       id:$id, sla_id:$slaId, breach_at:$breachAt, resolution_status:$rs,
       severity:"major", actual_value:1, target_value:0
     })`,
    { id, slaId, breachAt, rs: resolutionStatus },
  );
}

export async function createRisk(id: string, domainName: string, r: {
  name: string;
  likelihood: number;
  impact: number;
  status?: string;
  trend?: string;
  risk_type?: string;
}): Promise<void> {
  // risk_register lives in Postgres — create via the direct pg client so the
  // fixture is self-contained (the test helper is not the read-only handler).
  const { query } = await import("../../src/storage/postgres/client");
  await query(
    `INSERT INTO risk_register (id, name, owner, domain, likelihood, impact, status, trend, risk_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      r.name,
      "test-owner",
      domainName,
      r.likelihood,
      r.impact,
      r.status ?? "open",
      r.trend ?? "flat",
      r.risk_type ?? "operational",
    ],
  );
}

export async function cleanupNeo4j(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await write(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids });
}

export async function cleanupRisks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { query } = await import("../../src/storage/postgres/client");
  await query(`DELETE FROM risk_register WHERE id = ANY($1)`, [ids]);
}

export async function cleanupBreaches(slaIds: string[]): Promise<void> {
  if (slaIds.length === 0) return;
  await write(`MATCH (b:SLABreach) WHERE b.sla_id IN $ids DETACH DELETE b`, { ids: slaIds });
}
