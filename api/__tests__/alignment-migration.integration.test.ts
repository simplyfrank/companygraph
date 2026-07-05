import { afterAll, describe, expect, test } from "bun:test";
import { generateId } from "../src/ids";
import { getDriver } from "../src/neo4j/driver";

// kpi-measurement-alignment AC-06 — migration script converts
// CONTRIBUTES_TO → ALIGNED_TO idempotently.

describe("integration: alignment migration (AC-06)", () => {
  const kpiId = generateId();
  const journeyId = generateId();
  const driver = getDriver();

  afterAll(async () => {
    const session = driver.session();
    try {
      await session.run("MATCH (k:KPI {id: $id}) DETACH DELETE k", { id: kpiId });
      await session.run("MATCH (j:UserJourney {id: $id}) DETACH DELETE j", { id: journeyId });
    } finally {
      await session.close();
    }
  });

  test("CONTRIBUTES_TO → ALIGNED_TO migration is idempotent", async () => {
    const session = driver.session();
    try {
      // Create fixture: KPI + UserJourney + CONTRIBUTES_TO edge
      await session.run(
        `CREATE (k:KPI {id: $kpiId, name: "migration-test-kpi", category: "efficiency",
          unit: "%", target_value: 50, target_direction: "higher_is_better",
          measurement_frequency: "daily", created_at: $now, updated_at: $now, archived_at: null})`,
        { kpiId, now: new Date().toISOString() },
      );
      await session.run(
        `CREATE (j:UserJourney {id: $journeyId, name: "migration-test-journey",
          description: "test", created_at: $now, updated_at: $now})`,
        { journeyId, now: new Date().toISOString() },
      );
      await session.run(
        `MATCH (k:KPI {id: $kpiId}), (j:UserJourney {id: $journeyId})
         CREATE (k)-[:CONTRIBUTES_TO {weight: 0.8, created_at: $now}]->(j)`,
        { kpiId, journeyId, now: new Date().toISOString() },
      );

      // Run migration cypher (same as the script)
      const result = await session.run(
        `MATCH (k:KPI)-[old:CONTRIBUTES_TO]->(t)
         WHERE k.archived_at IS NULL
         MERGE (k)-[new:ALIGNED_TO]->(t)
         SET new.weight = old.weight,
             new.attribution_type = coalesce(old.attribution_type, 'direct'),
             new.alignment_notes = old.alignment_notes,
             new.created_at = old.created_at,
             new.migrated_from = 'CONTRIBUTES_TO'
         DELETE old
         RETURN count(old) AS converted`,
      );
      const converted = result.records[0]?.get("converted")?.toNumber() ?? 0;
      expect(converted).toBeGreaterThanOrEqual(1);

      // Verify ALIGNED_TO edge exists with preserved weight
      const aligned = await session.run(
        `MATCH (k:KPI {id: $kpiId})-[r:ALIGNED_TO]->(j:UserJourney {id: $journeyId})
         RETURN r.weight AS weight, r.attribution_type AS attr, r.migrated_from AS migrated`,
        { kpiId, journeyId },
      );
      expect(aligned.records).toHaveLength(1);
      expect(aligned.records[0]?.get("weight")).toBe(0.8);
      expect(aligned.records[0]?.get("attr")).toBe("direct");
      expect(aligned.records[0]?.get("migrated")).toBe("CONTRIBUTES_TO");

      // Verify no CONTRIBUTES_TO remains for this KPI
      const remaining = await session.run(
        `MATCH (k:KPI {id: $kpiId})-[r:CONTRIBUTES_TO]->() RETURN count(r) AS cnt`,
        { kpiId },
      );
      expect(remaining.records[0]?.get("cnt")?.toNumber()).toBe(0);

      // Run migration again — idempotent (no new edges, no error)
      const result2 = await session.run(
        `MATCH (k:KPI)-[old:CONTRIBUTES_TO]->(t)
         WHERE k.archived_at IS NULL
         MERGE (k)-[new:ALIGNED_TO]->(t)
         SET new.weight = old.weight,
             new.attribution_type = coalesce(old.attribution_type, 'direct'),
             new.alignment_notes = old.alignment_notes,
             new.created_at = old.created_at,
             new.migrated_from = 'CONTRIBUTES_TO'
         DELETE old
         RETURN count(old) AS converted`,
      );
      expect(result2.records[0]?.get("converted")?.toNumber()).toBe(0);

      // Still exactly one ALIGNED_TO edge
      const aligned2 = await session.run(
        `MATCH (k:KPI {id: $kpiId})-[r:ALIGNED_TO]->() RETURN count(r) AS cnt`,
        { kpiId },
      );
      expect(aligned2.records[0]?.get("cnt")?.toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });
});
