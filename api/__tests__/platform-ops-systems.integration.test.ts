// platform-ops-process-model T-10 (AC-04) — Helm/K8s/PagerDuty referenced by
// resolved id (no duplicate System per shared name); the three function systems
// each with a valid systemKind; USES_SYSTEM edges connect activities→systems;
// ≥1 INTEGRATES_WITH. Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
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

const FUNCTION_SYSTEMS = ["Observability stack", "Status page", "Backup/restore system"];

describe("integration: platform-ops systems (AC-04)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-04: Helm/K8s/PagerDuty referenced by resolved id — no duplicate per shared name", async () => {
    for (const name of ["Helm", "Kubernetes", "PagerDuty"]) {
      const res = await cypher(
        `MATCH (s:System {name:$name}) WHERE s.operatorSeedKey IS NOT NULL RETURN count(s) AS n`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-04: the three function systems exist each with a valid systemKind", async () => {
    const res = await cypher(
      `MATCH (s:System) WHERE s.name IN $names RETURN s.name AS name, s.attributes_json AS a ORDER BY s.name`,
      { names: FUNCTION_SYSTEMS } as Record<string, unknown>,
    );
    expect(res.rows.length).toBe(3);
    for (const row of res.rows) {
      const kind = JSON.parse(String(row.a)).systemKind;
      expect(SYSTEM_KINDS).toContain(kind);
    }
  });

  test("AC-04: USES_SYSTEM edges connect slice activities to systems", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
       WHERE a.id STARTS WITH '018f0200'
       RETURN count(*) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(8);
  });

  test("AC-04: ≥1 INTEGRATES_WITH edge from a function system", async () => {
    const res = await cypher(
      `MATCH (s1:System)-[:INTEGRATES_WITH]->(s2:System)
       WHERE s1.id STARTS WITH '018f0200'
       RETURN count(*) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
