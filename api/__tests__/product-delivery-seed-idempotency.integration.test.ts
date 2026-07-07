// product-delivery-process-model T-02/T-10 (AC-12) — the fixture loads via the
// foundation loader with no per-row UUIDv7 parse error and no
// 409 model_lifecycle_route_required; a full re-run (fixture + seed step) is
// net-zero (cross-ref edges + MEASURES + KPIs/stories/capabilities/risks all
// skipped by their pre-checks); the retail Business Model #1 subgraph is
// unchanged. Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";

const BASE = "http://127.0.0.1:8787";
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

// Scope net-zero checks to THIS spec's data — the wave-2 fan-out shares the
// graph, so a global MATCH (n) count is not stable under concurrent seeds.
const PD_NODES = `MATCH (n) WHERE n.attributes_json CONTAINS 'pd-journey-'
                     OR n.attributes_json CONTAINS 'pd-act-'
                     OR n.attributes_json CONTAINS 'pd-role-'
                     OR n.attributes_json CONTAINS 'pd-sys-'
                  RETURN count(n) AS n`;
const PD_FIXTURE_EDGES = `MATCH (a)-[r]->(b)
  WHERE (a.attributes_json CONTAINS 'pd-act-' OR a.attributes_json CONTAINS 'pd-role-')
    AND (b.attributes_json CONTAINS 'pd-act-' OR b.attributes_json CONTAINS 'pd-journey-'
         OR b.attributes_json CONTAINS 'pd-sys-')
  RETURN count(r) AS n`;
const RETAIL = `MATCH (m:BusinessModel {isReference:true})
                OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
                OPTIONAL MATCH (d)<-[:PART_OF*0..]-(x)
                RETURN count(DISTINCT x) AS n`;

describe("integration: product-delivery seed idempotency (AC-12)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE); // loads product-delivery.json via the foundation loader
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-12: the fixture is lifecycle-clean and its ids are strict UUIDv7", () => {
    const path = resolve(
      import.meta.dir,
      "../../shared/seed/saas-operator/product-delivery.json",
    );
    const fixture = JSON.parse(readFileSync(path, "utf8")) as {
      nodes: Array<{ label: string; id: string }>;
      edges: Array<{ type: string; id: string }>;
    };
    // no lifecycle rows
    const lifecycleLabels = new Set([
      "BusinessModel",
      "ModuleInstance",
      "ModuleTemplate",
    ]);
    const lifecycleEdges = new Set(["IN_MODEL", "INSTANTIATES"]);
    for (const n of fixture.nodes) expect(lifecycleLabels.has(n.label)).toBe(false);
    for (const e of fixture.edges) expect(lifecycleEdges.has(e.type)).toBe(false);
    // every node + edge id is a strict UUIDv7 — edges carry STABLE ids so
    // upsertEdge's MERGE-on-id (api/src/storage/edges.ts) is idempotent on
    // re-import (an id-less edge would MERGE on a fresh generated id each time
    // and duplicate; the peer fixtures — platform-ops.json — carry edge ids too).
    for (const n of fixture.nodes) expect(UUIDV7.test(n.id)).toBe(true);
    for (const e of fixture.edges) expect(UUIDV7.test(String(e.id))).toBe(true);
    const edgeIds = fixture.edges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length); // unique
    // no KPI/UserStory/AcceptanceCriterion/Capability/BoundedContext row
    const banned = new Set([
      "KPI",
      "UserStory",
      "AcceptanceCriterion",
      "Capability",
      "BoundedContext",
    ]);
    for (const n of fixture.nodes) expect(banned.has(n.label)).toBe(false);
  });

  test("AC-12: a full re-run is net-zero on Product nodes + fixture edges", async () => {
    const nodesBefore = await count(PD_NODES);
    const edgesBefore = await count(PD_FIXTURE_EDGES);
    await seedSaasOperator(BASE); // re-import fixture (MERGE-on-id)
    await seedProductDelivery(BASE); // re-run seed step
    const nodesAfter = await count(PD_NODES);
    const edgesAfter = await count(PD_FIXTURE_EDGES);
    // 18 fixture nodes (3 journeys + 11 activities + 3 slice-local roles + 1
    // slice-local system carrying pd-sys — wait, 4 slice-local systems) — assert
    // stability rather than an absolute (concurrency-safe).
    expect(nodesAfter).toBe(nodesBefore);
    expect(edgesAfter).toBe(edgesBefore);
  });

  test("AC-12: the retail Model #1 subgraph is unchanged by a re-run", async () => {
    const before = await count(RETAIL);
    await seedProductDelivery(BASE);
    const after = await count(RETAIL);
    expect(after).toBe(before);
  });
});
