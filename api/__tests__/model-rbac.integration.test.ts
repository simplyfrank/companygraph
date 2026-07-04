import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedRbacRoles } from "../src/scripts/seed-rbac-roles";

// model-workspace-core T-15 / AC-09 — business_architect role +
// Business Architect persona seed idempotently; the persona resolves
// model:*/module:*; the SME persona is untouched.

describe("integration: model-workspace-core AC-09 business_architect seed", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("seed is idempotent and binds the persona to the role with model:*/module:* permissions", async () => {
    const driver = getDriver();

    // Snapshot any pre-existing SME persona (must remain unchanged).
    const smeBefore = await readPersonasLike(driver, "SME");

    await seedRbacRoles();
    await seedRbacRoles(); // re-run — MERGE keyed on names, no duplicates

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const role = await session.run(
        `MATCH (r:RBACRole {name: "business_architect"})
         RETURN count(r) AS c, collect(r.permissions)[0] AS permissions`,
      );
      expect(role.records[0]!.get("c")).toBe(1);
      const permissions = role.records[0]!.get("permissions") as string[];
      for (const p of ["model:read", "model:write", "module:read", "module:write"]) {
        expect(permissions).toContain(p);
      }
      // Deliberately NO generic write (FR-11 rationale).
      expect(permissions).not.toContain("node:write");
      expect(permissions).not.toContain("edge:write");

      const persona = await session.run(
        `MATCH (p:Persona {name: "Business Architect"})
         OPTIONAL MATCH (p)-[:HAS_RBAC_ROLE]->(r:RBACRole {name: "business_architect"})
         RETURN count(DISTINCT p) AS personas, count(DISTINCT r) AS bindings`,
      );
      expect(persona.records[0]!.get("personas")).toBe(1);
      expect(persona.records[0]!.get("bindings")).toBe(1);
    } finally {
      await session.close();
    }

    // SME persona unchanged (present or absent — either way untouched).
    const smeAfter = await readPersonasLike(driver, "SME");
    expect(smeAfter).toEqual(smeBefore);
  });
});

async function readPersonasLike(
  driver: ReturnType<typeof getDriver>,
  fragment: string,
): Promise<Array<Record<string, unknown>>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (p:Persona) WHERE toLower(p.name) CONTAINS toLower($fragment)
       RETURN p ORDER BY p.name`,
      { fragment },
    );
    return r.records.map(
      (rec) => (rec.get("p") as { properties: Record<string, unknown> }).properties,
    );
  } finally {
    await session.close();
  }
}
