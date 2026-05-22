import { afterAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";

// AC-03 — Neo4j container is up and accepts bolt connections.
//
// Uses the production driver singleton from api/src/neo4j/driver.ts so
// the same env-loading + auth path is exercised. The test assumes Neo4j
// is already running (started by `bun run dev` locally, or the
// `services: neo4j` block in CI).
//
// Test name is prefixed `integration:` so the root-level
// `bun test:integration` script (`--test-name-pattern '^integration:'`)
// picks it up while the default `bun test` script skips it.
describe("integration: AC-03 neo4j-bootstrap", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("driver connects and 'RETURN 1' returns 1", async () => {
    const driver = getDriver();
    // Optional but cheap — surfaces a clearer error than the first
    // session.run if the bolt URL/credentials are wrong.
    await driver.verifyConnectivity();

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run("RETURN 1 AS one");
      const value = result.records[0]?.get("one") as
        | number
        | { toNumber: () => number }
        | undefined;
      const asNumber =
        typeof value === "number" ? value : (value?.toNumber() ?? NaN);
      expect(asNumber).toBe(1);
    } finally {
      await session.close();
    }
  });
});
