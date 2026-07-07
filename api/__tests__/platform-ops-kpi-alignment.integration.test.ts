// platform-ops-process-model T-10 (AC-09) — each KPI is ALIGNED_TO its process
// target via POST /api/v1/kpi-alignments; a wrong/missing target id → 404
// not_found (D-1); a generic POST /api/v1/edges ALIGNED_TO with a wrong pair
// (KPI→System) → 400 edge_endpoint_label_mismatch. Requires the loopback stack.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions } from "./helpers/platform-ops-fixtures";

const BASE = "http://127.0.0.1:8787";

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

function num(v: unknown): number {
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

// KPI name → [target label, target name].
const ALIGN: Record<string, [string, string]> = {
  "Fleet uptime": ["Domain", "Platform Ops"],
  MTTR: ["UserJourney", "Incident / on-call"],
  "Deploy frequency": ["UserJourney", "Deploy / release"],
  "Error budget burn": ["UserJourney", "SLA / status"],
  "Backup success rate": ["UserJourney", "Backups / DR"],
};

describe("integration: platform-ops KPI ALIGNED_TO (AC-09)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-09: each KPI is ALIGNED_TO its process target", async () => {
    for (const [name, [label, target]] of Object.entries(ALIGN)) {
      const res = await cypher(
        `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         WHERE d.attributes_json CONTAINS 'platform_ops'
         MATCH (k:KPI {name:$name})-[:ALIGNED_TO]->(t:${label} {name:$target})
         WHERE k.domain_id = d.id
         RETURN count(*) AS n`,
        { name, target },
      );
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-09 (D-1): POST /api/v1/kpi-alignments with a wrong target id → 404 not_found", async () => {
    const k = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'platform_ops'
       MATCH (k:KPI {name:"MTTR"}) WHERE k.domain_id = d.id RETURN k.id AS id LIMIT 1`,
    );
    const kpiIdVal = String(k.rows[0]!.id);
    const res = await fetch(`${BASE}/api/v1/kpi-alignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kpi_id: kpiIdVal,
        target_type: "journey",
        target_id: "018f0200-0000-7000-8000-999999999999",
        weight: 1,
        attribution_type: "direct",
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("not_found");
  });

  test("AC-09 (supplementary): generic /edges ALIGNED_TO with a wrong pair (KPI→System) → 400", async () => {
    const k = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'platform_ops'
       MATCH (k:KPI {name:"Fleet uptime"}) WHERE k.domain_id = d.id RETURN k.id AS id LIMIT 1`,
    );
    const s = await cypher(
      `MATCH (s:System) WHERE s.operatorSeedKey="helm" RETURN s.id AS id`,
    );
    const res = await fetch(`${BASE}/api/v1/edges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ALIGNED_TO",
        fromId: String(k.rows[0]!.id),
        toId: String(s.rows[0]!.id),
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("edge_endpoint_label_mismatch");
  });
});
