// saas-operator-foundation T-09 (AC-08, FR-09) — lifecycle-guard
// compatibility. A slice fixture containing a lifecycle-labeled row loaded via
// POST /api/v1/import is rejected 409 model_lifecycle_route_required with
// nothing written from that fixture (payload-atomic pre-scan). The operator
// root + IN_MODEL edges are created via createModel/attachDomain, not import.

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
import { seedSaasOperator } from "../scripts/seed-saas-operator";

const API_BASE = "http://127.0.0.1:8787";
const SEED_DIR = resolve(import.meta.dir, "../../shared/seed/saas-operator");
const FIXTURE = resolve(SEED_DIR, "zz-lifecycle-slice.json");

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

describe("integration: saas-operator-foundation AC-08 lifecycle guard", () => {
  afterEach(() => {
    if (existsSync(FIXTURE)) rmSync(FIXTURE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("lifecycle-labeled fixture row → 409, nothing written", async () => {
    const sentinelId = generateId();
    // A BusinessModel (lifecycle) node — must be rejected by the guard.
    const fixture = {
      nodes: [
        { id: sentinelId, label: "BusinessModel", name: "Illegal Model", description: "", attributes: {} },
      ],
      edges: [],
    };
    writeFileSync(FIXTURE, JSON.stringify(fixture), "utf8");

    let threw = false;
    let message = "";
    try {
      await seedSaasOperator(API_BASE);
    } catch (e) {
      threw = true;
      message = e instanceof Error ? e.message : String(e);
    }
    expect(threw).toBe(true);
    expect(message).toContain("model_lifecycle_route_required");

    // Nothing from the fixture was written (payload-atomic).
    const [count] = await cypher<{ n: number }>(
      `MATCH (n {id:$id}) RETURN count(n) AS n`,
      { id: sentinelId },
    );
    expect(num(count!.n)).toBe(0);
  });
});
