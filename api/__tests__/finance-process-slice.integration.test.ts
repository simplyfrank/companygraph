// finance-accounting-process-model T-01/T-02/T-04 verification (AC-01, AC-02,
// AC-03, AC-04, AC-10, AC-11, AC-12). After the finance slice loads + the graph
// script runs, the six journeys are PART_OF the resolved finance domain, the 24
// activities form six acyclic linear PRECEDES chains, slice roles EXECUTES
// their activities (and the shared revenue_operations role is referenced, not
// duplicated), slice systems carry a systemKind + boundedContext, Stripe is
// referenced (not duplicated), a re-run adds zero net-new edges, and a
// lifecycle-row fixture is rejected 409 with nothing written.
//
// Requires the loopback API + Neo4j + Postgres up (bun run dev / CI services).

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";
import { seedFinanceGraph } from "../scripts/seed-finance-graph";
import {
  FINANCE_JOURNEYS,
  FINANCE_ACTIVITIES,
  FINANCE_ROLES,
  FINANCE_SYSTEMS,
} from "../scripts/finance-ids";

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

function readSliceFixture(): { nodes: unknown[]; edges: unknown[] } {
  const path = resolve(import.meta.dir, "../../shared/seed/saas-operator/finance-accounting.json");
  return JSON.parse(readFileSync(path, "utf8")) as { nodes: unknown[]; edges: unknown[] };
}

async function importFixture(fixture: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixture),
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe("integration: finance process slice", () => {
  beforeAll(async () => {
    // Register the metric label + MEASURES edge type (fresh-process cache).
    await ensureMetricDefinitionLabel(BASE);
    await ensureMeasuresEdgeType(BASE);
    // Import the finance slice directly (the shared loader is exercised
    // elsewhere; this test loads only its own slice to stay hermetic).
    const imported = await importFixture(readSliceFixture());
    expect(imported.status).toBe(200);
    expect(imported.body.errors ?? []).toHaveLength(0);
    // Run the graph script (ensures scaffold via ensure* helpers, then the
    // journey->domain / shared-node edges).
    await seedFinanceGraph(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: the six journeys are each PART_OF the resolved finance domain", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE j.attributes_json CONTAINS 'fin-jrny-'
         AND d.attributes_json CONTAINS 'finance_accounting'
       RETURN count(DISTINCT j) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(FINANCE_JOURNEYS.length);
  });

  test("AC-02: 24 activities, each PART_OF its journey", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)
       WHERE a.attributes_json CONTAINS 'fin-act-' AND j.attributes_json CONTAINS 'fin-jrny-'
       RETURN count(a) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(FINANCE_ACTIVITIES.length);
  });

  test("AC-02: six acyclic linear PRECEDES chains (18 links, 6 heads, 6 tails)", async () => {
    const links = await cypher(
      `MATCH (a:Activity)-[r:PRECEDES]->(b:Activity)
       WHERE a.attributes_json CONTAINS 'fin-act-'
       RETURN count(r) AS n`,
    );
    expect(num(links.rows[0]!.n)).toBe(18);

    // Each chain is linear: every activity has in-degree ≤1 and out-degree ≤1
    // within the finance PRECEDES subgraph, and there are exactly 6 heads
    // (no incoming) and 6 tails (no outgoing).
    const heads = await cypher(
      `MATCH (a:Activity) WHERE a.attributes_json CONTAINS 'fin-act-'
         AND NOT ( (:Activity)-[:PRECEDES]->(a) )
       RETURN count(a) AS n`,
    );
    const tails = await cypher(
      `MATCH (a:Activity) WHERE a.attributes_json CONTAINS 'fin-act-'
         AND NOT ( (a)-[:PRECEDES]->(:Activity) )
       RETURN count(a) AS n`,
    );
    expect(num(heads.rows[0]!.n)).toBe(6);
    expect(num(tails.rows[0]!.n)).toBe(6);

    // Acyclic: no activity precedes itself transitively.
    const cycle = await cypher(
      `MATCH (a:Activity) WHERE a.attributes_json CONTAINS 'fin-act-'
       MATCH (a)-[:PRECEDES*1..10]->(a)
       RETURN count(a) AS n`,
    );
    expect(num(cycle.rows[0]!.n)).toBe(0);
  });

  test("AC-03: five slice roles EXECUTES their activities", async () => {
    for (const role of FINANCE_ROLES) {
      const res = await cypher(
        `MATCH (r:Role)-[:EXECUTES]->(a:Activity)
         WHERE r.attributes_json CONTAINS $seedKey
         RETURN count(a) AS n`,
        { seedKey: role.seedKey },
      );
      expect(num(res.rows[0]!.n)).toBe(role.executesSeedKeys.length);
    }
  });

  test("AC-03: shared revenue_operations role is referenced, not duplicated, and EXECUTES finance activities", async () => {
    const dup = await cypher(
      `MATCH (r:Role) WHERE r.operatorSeedKey = 'revenue_operations' RETURN count(r) AS n`,
    );
    expect(num(dup.rows[0]!.n)).toBe(1);
    const exec = await cypher(
      `MATCH (r:Role {operatorSeedKey:'revenue_operations'})-[:EXECUTES]->(a:Activity)
       WHERE a.attributes_json CONTAINS 'fin-act-'
       RETURN count(a) AS n`,
    );
    expect(num(exec.rows[0]!.n)).toBeGreaterThanOrEqual(6);
  });

  test("AC-04: three slice systems carry systemKind + boundedContext", async () => {
    for (const sys of FINANCE_SYSTEMS) {
      const res = await cypher(
        `MATCH (s:System) WHERE s.attributes_json CONTAINS $seedKey RETURN s.attributes_json AS a`,
        { seedKey: sys.seedKey },
      );
      expect(res.rows.length).toBe(1);
      const attrs = JSON.parse(String(res.rows[0]!.a)) as Record<string, unknown>;
      expect(attrs.systemKind).toBe("functional");
      expect(attrs.boundedContext).toBe(sys.boundedContext);
    }
  });

  test("AC-04: shared Stripe system is referenced (not duplicated) and USES_SYSTEM'd by finance activities", async () => {
    const dup = await cypher(
      `MATCH (s:System) WHERE s.operatorSeedKey = 'stripe' RETURN count(s) AS n`,
    );
    expect(num(dup.rows[0]!.n)).toBe(1);
    const uses = await cypher(
      `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System {operatorSeedKey:'stripe'})
       WHERE a.attributes_json CONTAINS 'fin-act-'
       RETURN count(a) AS n`,
    );
    expect(num(uses.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  test("AC-11: a second graph-script run adds zero net-new edges", async () => {
    const before = await cypher(`MATCH ()-[r]->() RETURN count(r) AS n`);
    await seedFinanceGraph(BASE);
    const after = await cypher(`MATCH ()-[r]->() RETURN count(r) AS n`);
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
  });

  test("AC-12: a fixture with a lifecycle row is rejected 409 with nothing written", async () => {
    const bad = {
      nodes: [
        {
          label: "BusinessModel",
          id: "018f0300-0000-7000-8000-0000000ffff1",
          name: "Illegal finance lifecycle node",
          description: "should be rejected by the lifecycle guard",
          attributes: { seedKey: "fin-bad-lifecycle" },
        },
      ],
      edges: [],
    };
    const res = await importFixture(bad);
    expect(res.status).toBe(409);
    const written = await cypher(
      `MATCH (m:BusinessModel) WHERE m.attributes_json CONTAINS 'fin-bad-lifecycle' RETURN count(m) AS n`,
    );
    expect(num(written.rows[0]!.n)).toBe(0);
  });
});
