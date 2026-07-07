// platform-ops-process-model T-11 (AC-06, review C-01 pin) — running
// seed:platform-ops twice yields zero net new nodes/edges/rows; the retail
// Business Model #1 subgraph is unchanged; the C-01 named cross-boundary edges
// (journey→domain PART_OF, activity→shared-system USES_SYSTEM) are net-zero on
// the second run. Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions, seedPlatformOps } from "./helpers/platform-ops-fixtures";

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

async function count(statement: string, params: Record<string, unknown> = {}): Promise<number> {
  return num((await cypher(statement, params)).rows[0]!.n);
}

const NODES = `MATCH (n) RETURN count(n) AS n`;
const EDGES = `MATCH ()-[r]->() RETURN count(r) AS n`;
const RETAIL = `MATCH (m:BusinessModel {isReference:true})
                OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
                OPTIONAL MATCH (d)<-[:PART_OF*0..]-(x)
                RETURN count(DISTINCT x) AS n`;
const JD_PART_OF = `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
                    WHERE d.attributes_json CONTAINS 'platform_ops' RETURN count(*) AS n`;
const USES_SHARED = `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
                     WHERE a.id STARTS WITH '018f0200' AND s.operatorSeedKey IS NOT NULL
                     RETURN count(*) AS n`;
const MEASURES = `MATCH (k:KPI)-[m:MEASURES]->() WHERE k.domain_id IS NOT NULL AND k.name IN
  ['Fleet uptime','MTTR','Deploy frequency','Error budget burn'] RETURN count(m) AS n`;
const ALIGNED = `MATCH (k:KPI)-[r:ALIGNED_TO]->() WHERE k.name IN
  ['Fleet uptime','MTTR','Deploy frequency','Error budget burn','Backup success rate'] RETURN count(r) AS n`;

describe("integration: platform-ops seed idempotency (AC-06 / C-01)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE); // establish state (may be a re-run)
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-06: a second seed:platform-ops run is net-zero (nodes/edges + retail unchanged)", async () => {
    const before = {
      nodes: await count(NODES),
      edges: await count(EDGES),
      retail: await count(RETAIL),
    };

    await seedPlatformOps(BASE); // the second run

    expect(await count(NODES)).toBe(before.nodes);
    expect(await count(EDGES)).toBe(before.edges);
    expect(await count(RETAIL)).toBe(before.retail); // retail isolation (NFR-02)
  });

  test("AC-06 (C-01): cross-boundary edge counts are net-zero on the second run", async () => {
    const before = {
      jd: await count(JD_PART_OF),
      uses: await count(USES_SHARED),
      measures: await count(MEASURES),
      aligned: await count(ALIGNED),
    };

    await seedPlatformOps(BASE);

    expect(await count(JD_PART_OF)).toBe(before.jd);
    expect(await count(USES_SHARED)).toBe(before.uses);
    expect(await count(MEASURES)).toBe(before.measures);
    expect(await count(ALIGNED)).toBe(before.aligned);

    // Sanity anchors for the C-01 named edges.
    expect(before.jd).toBe(5); // five journey→domain PART_OF
    expect(before.uses).toBeGreaterThanOrEqual(5); // activity→shared-system USES_SYSTEM
  });
});
