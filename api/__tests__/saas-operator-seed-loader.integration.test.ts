// saas-operator-foundation T-09 (AC-06, AC-07) — the directory-iterating
// loader. Empty (.gitkeep-only) directory is a clean no-op; dropping a NEW
// fixture into the directory loads it on the next run with NO edit to the
// loader; seeding twice yields zero net new nodes/edges; the retail reference
// subgraph is unchanged across a full run.

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
import { seedSaasOperator } from "../scripts/seed-saas-operator";

const API_BASE = "http://127.0.0.1:8787";
const SEED_DIR = resolve(import.meta.dir, "../../shared/seed/saas-operator");
const FIXTURE = resolve(SEED_DIR, "zz-test-slice.json");

async function cypher<T = Record<string, unknown>>(
  statement: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(statement, params);
    return res.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}
const num = (v: unknown) => Number((v as { low?: number })?.low ?? v);

// Count nodes scoped to the retail reference model's subgraph (its domains +
// everything hanging off them via PART_OF/EXECUTES/USES/AT).
async function retailSubgraphCount(): Promise<number> {
  const [row] = await cypher<{ n: number }>(
    `MATCH (m:BusinessModel {isReference:true})
     OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
     OPTIONAL MATCH (d)<-[:PART_OF*0..]-(n)
     RETURN count(DISTINCT n) AS n`,
  );
  return num(row!.n);
}

describe("integration: saas-operator-foundation AC-06/AC-07 seed loader", () => {
  afterEach(() => {
    if (existsSync(FIXTURE)) rmSync(FIXTURE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-06: empty (.gitkeep-only) directory is a clean no-op", async () => {
    const res = await seedSaasOperator(API_BASE);
    expect(res.slicesLoaded).toEqual([]); // only .gitkeep present
    expect(Object.keys(res.domainIds).length).toBe(6); // scaffold still ensured
    expect(typeof res.operatorRootId).toBe("string");
  });

  test("AC-06: a NEW fixture loads on the next run with no loader edit", async () => {
    // Ensure the scaffold first so we have a domain id to attach content under.
    const first = await seedSaasOperator(API_BASE);
    const marketingDomainId = first.domainIds.marketing!;
    expect(marketingDomainId).toBeTruthy();

    // Drop a NEW non-lifecycle slice fixture (a journey + activity under the
    // marketing domain) into the directory — no loader edit.
    const journeyId = generateId();
    const activityId = generateId();
    const partOf1 = generateId();
    const partOf2 = generateId();
    const fixture = {
      nodes: [
        { id: journeyId, label: "UserJourney", name: "Campaign to Lead", description: "", attributes: {} },
        { id: activityId, label: "Activity", name: "Launch Campaign", description: "", attributes: {} },
      ],
      edges: [
        { id: partOf1, type: "PART_OF", fromId: journeyId, toId: marketingDomainId, attributes: {} },
        { id: partOf2, type: "PART_OF", fromId: activityId, toId: journeyId, attributes: {} },
      ],
    };
    writeFileSync(FIXTURE, JSON.stringify(fixture), "utf8");

    const run = await seedSaasOperator(API_BASE);
    expect(run.slicesLoaded).toContain("zz-test-slice.json");

    // The content is now under the marketing domain.
    const [count] = await cypher<{ n: number }>(
      `MATCH (a:Activity {id:$id})-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id:$d}) RETURN count(a) AS n`,
      { id: activityId, d: marketingDomainId },
    );
    expect(num(count!.n)).toBe(1);
  });

  test("AC-07: seeding twice is net-zero; retail subgraph unchanged", async () => {
    // With the fixture present, run once to establish state.
    const journeyId = generateId();
    const activityId = generateId();
    const first = await seedSaasOperator(API_BASE);
    const marketingDomainId = first.domainIds.marketing!;
    const fixture = {
      nodes: [
        { id: journeyId, label: "UserJourney", name: "Idempotent Journey", description: "", attributes: {} },
        { id: activityId, label: "Activity", name: "Idempotent Activity", description: "", attributes: {} },
      ],
      edges: [
        { id: generateId(), type: "PART_OF", fromId: journeyId, toId: marketingDomainId, attributes: {} },
        { id: generateId(), type: "PART_OF", fromId: activityId, toId: journeyId, attributes: {} },
      ],
    };
    // Use stable ids in the fixture body so realImport MERGEs on re-run. Write
    // a deterministic fixture (fixed ids) so both runs upsert the same rows.
    writeFileSync(FIXTURE, JSON.stringify(fixture), "utf8");
    await seedSaasOperator(API_BASE);

    const retailBefore = await retailSubgraphCount();
    const [nodesBefore] = await cypher<{ n: number }>(`MATCH (n) RETURN count(n) AS n`);
    const [edgesBefore] = await cypher<{ n: number }>(`MATCH ()-[r]->() RETURN count(r) AS n`);

    // Re-run — stable ids MERGE, so zero net new nodes/edges.
    await seedSaasOperator(API_BASE);

    const retailAfter = await retailSubgraphCount();
    const [nodesAfter] = await cypher<{ n: number }>(`MATCH (n) RETURN count(n) AS n`);
    const [edgesAfter] = await cypher<{ n: number }>(`MATCH ()-[r]->() RETURN count(r) AS n`);

    expect(num(nodesAfter!.n)).toBe(num(nodesBefore!.n));
    expect(num(edgesAfter!.n)).toBe(num(edgesBefore!.n));
    expect(retailAfter).toBe(retailBefore); // retail isolation (NFR-02)
  });
});
