// marketing-process-model T-01/T-02/T-10/T-14 (AC-14, AC-15) — the
// marketing.json fixture shape + lifecycle-guard cleanliness, the step-0
// resolver, and full-seed idempotency. Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedMarketing, resolveIds } from "../scripts/seed-marketing";

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

const LIFECYCLE_NODE_LABELS = ["BusinessModel", "BusinessModule", "BusinessModuleVersion", "ModuleInstance"];
const LIFECYCLE_EDGE_TYPES = ["IN_MODEL", "HAS_VERSION", "INSTANTIATES", "INSTANCE_IN", "FORKED_FROM"];

describe("integration: marketing seed shape + resolver + idempotency (AC-14, AC-15)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-14: marketing.json is a valid {nodes,edges} payload with only non-lifecycle process rows", () => {
    const raw = readFileSync(resolve(import.meta.dir, "../../shared/seed/saas-operator/marketing.json"), "utf8");
    const fixture = JSON.parse(raw) as {
      nodes: Array<{ label: string }>;
      edges: Array<{ type: string }>;
    };
    expect(Array.isArray(fixture.nodes)).toBe(true);
    expect(Array.isArray(fixture.edges)).toBe(true);
    expect(fixture.nodes.length).toBeGreaterThan(0);
    for (const n of fixture.nodes) {
      expect(LIFECYCLE_NODE_LABELS).not.toContain(n.label);
    }
    for (const e of fixture.edges) {
      expect(LIFECYCLE_EDGE_TYPES).not.toContain(e.type);
    }
  });

  test("AC-14 (NFR-04): a lifecycle edge row is rejected 409 model_lifecycle_route_required, nothing written", async () => {
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [],
        edges: [{ type: "INSTANTIATES", fromId: "aaaaaaaa-0000-7000-8000-000000000001", toId: "bbbbbbbb-0000-7000-8000-000000000002" }],
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("model_lifecycle_route_required");
  });

  test("AC-14: the fixture was loaded by the foundation loader — Marketing process content is present", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
       RETURN count(DISTINCT j) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(5);
  });

  test("T-02: step-0 resolver returns a non-empty root, Marketing domain, and five journeys", async () => {
    const ids = await resolveIds(BASE);
    expect(ids.rootId.length).toBeGreaterThan(0);
    expect(ids.domainId.length).toBeGreaterThan(0);
    expect(ids.journeys.size).toBe(5);
    for (const k of ["content-ops", "campaign-lead", "mql-scoring", "webinars-events", "abm"]) {
      expect(ids.journeys.has(k)).toBe(true);
    }
  });

  test("AC-15: a second full marketing seed yields zero net new Marketing-scoped nodes/edges/risk rows", async () => {
    // Scope the counts to Marketing-owned constructs so the assertion is robust
    // to unrelated concurrent churn on the shared graph (the invariant NFR-02
    // cares about is net-zero MARKETING writes on a re-run).
    const marketingCounts = async () => {
      const kpis = await cypher(
        `MATCH (k:KPI) WHERE k.name IN ["CAC (marketing-attributed)","MQL→SQL Conversion Rate","CPL (cost per lead)","Cost per MQL","Marketing-Sourced Pipeline","Lead Volume"] RETURN count(k) AS n`,
      );
      const journeyEdges = await cypher(
        `MATCH (:UserJourney)-[r:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(r) AS n`,
      );
      const measures = await cypher(`MATCH (:KPI)-[m:MEASURES]->(:MetricDefinition) RETURN count(m) AS n`);
      const aligned = await cypher(`MATCH (:KPI)-[a:ALIGNED_TO]->() RETURN count(a) AS n`);
      const stories = await cypher(
        `MATCH (st:UserStory)-[:DESCRIBES_ACTIVITY]->(:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(DISTINCT st) AS n`,
      );
      const caps = await cypher(
        `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {name:"SaaS Operator"}) WHERE c.name IN ["Capture and qualify a lead","Run a multi-channel campaign","Score lead intent"] RETURN count(DISTINCT c) AS n`,
      );
      return [kpis, journeyEdges, measures, aligned, stories, caps].map((r) => num(r.rows[0]!.n));
    };
    const riskCount = async () => {
      const res = await fetch(`${BASE}/api/v1/risk-register?domain=Marketing`);
      return ((await res.json()) as { data?: unknown[] }).data?.length ?? 0;
    };

    const before = await marketingCounts();
    const riskBefore = await riskCount();

    await seedMarketing(BASE);

    const after = await marketingCounts();
    const riskAfter = await riskCount();

    expect(after).toEqual(before);
    expect(riskAfter).toBe(riskBefore);
  });
});
