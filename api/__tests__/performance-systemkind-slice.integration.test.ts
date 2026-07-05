import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-performance-dashboards T-08 — closes AC-03 (design §4.3,
// DD-06 inclusive-any systemKind slice).
//
// The retail seed is monochrome (`functional` only — Risk R-3), so the
// fixtures create KPIs whose ALIGNED_TO paths reach Systems of ALL
// THREE kinds. Kind literals come from SYSTEM_KINDS (NFR-05) — never
// re-declared.

const API_BASE = "http://127.0.0.1:8787/api/v1";

const [FUNCTIONAL, AGENTIC, AI_PREDICTIVE] = SYSTEM_KINDS;

const cleanupNodeIds: string[] = [];

async function runWrite(cypher: string, params: Record<string, unknown>): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function createNode(label: string, attributesJson = "{}"): Promise<string> {
  const id = generateId();
  cleanupNodeIds.push(id);
  await runWrite(
    `CREATE (:\`${label}\` {id: $id, name: $name, description: "kind fixture", attributes_json: $attrs, createdAt: $now, updatedAt: $now})`,
    { id, name: `perf-kind-${label}-${generateId()}`, attrs: attributesJson, now: new Date().toISOString() },
  );
  return id;
}

async function createKpi(domainId: string): Promise<string> {
  const id = generateId();
  cleanupNodeIds.push(id);
  await runWrite(
    `CREATE (:KPI {id: $id, name: $name, domain_id: $domainId, unit: "%",
                   target_value: 100, target_direction: "higher_is_better",
                   created_at: $now, updated_at: $now})`,
    { id, name: `perf-kind-kpi-${generateId()}`, domainId, now: new Date().toISOString() },
  );
  return id;
}

async function createEdge(fromId: string, type: string, toId: string): Promise<void> {
  await runWrite(
    `MATCH (a {id: $fromId}), (b {id: $toId}) CREATE (a)-[:\`${type}\` {id: $edgeId}]->(b)`,
    { fromId, toId, edgeId: generateId() },
  );
}

async function rowsFor(query: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/analytics/performance/kpis${query}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { rows: Array<{ kpi_id: string }> };
  return body.rows.map((r) => r.kpi_id);
}

// Fixture topology (all KPIs flat-scoped to one fresh domain so the
// ?domain slice isolates this file's fixtures):
//   kpiFunctional  -ALIGNED_TO-> activityF -USES_SYSTEM-> sysFunctional
//   kpiAgentic     -ALIGNED_TO-> journeyA  (activityA PART_OF journeyA
//                                    -USES_SYSTEM-> sysAgentic)
//   kpiBoth        -ALIGNED_TO-> activityB -USES_SYSTEM-> sysFunctional
//                                              -USES_SYSTEM-> sysAgentic
//   kpiPredictive  -ALIGNED_TO-> activityP -USES_SYSTEM-> sysPredictive
//   kpiNoPath      (no ALIGNED_TO at all)
let domainId: string;
let kpiFunctional: string;
let kpiAgentic: string;
let kpiBoth: string;
let kpiPredictive: string;
let kpiNoPath: string;

beforeAll(async () => {
  domainId = await createNode("Domain");
  const sysFunctional = await createNode("System", JSON.stringify({ systemKind: FUNCTIONAL }));
  const sysAgentic = await createNode("System", JSON.stringify({ systemKind: AGENTIC }));
  const sysPredictive = await createNode("System", JSON.stringify({ systemKind: AI_PREDICTIVE }));

  const activityF = await createNode("Activity");
  await createEdge(activityF, "USES_SYSTEM", sysFunctional);
  kpiFunctional = await createKpi(domainId);
  await createEdge(kpiFunctional, "ALIGNED_TO", activityF);

  const journeyA = await createNode("UserJourney");
  await createEdge(journeyA, "PART_OF", domainId);
  const activityA = await createNode("Activity");
  await createEdge(activityA, "PART_OF", journeyA);
  await createEdge(activityA, "USES_SYSTEM", sysAgentic);
  kpiAgentic = await createKpi(domainId);
  await createEdge(kpiAgentic, "ALIGNED_TO", journeyA);

  const activityB = await createNode("Activity");
  await createEdge(activityB, "USES_SYSTEM", sysFunctional);
  await createEdge(activityB, "USES_SYSTEM", sysAgentic);
  kpiBoth = await createKpi(domainId);
  await createEdge(kpiBoth, "ALIGNED_TO", activityB);

  const activityP = await createNode("Activity");
  await createEdge(activityP, "USES_SYSTEM", sysPredictive);
  kpiPredictive = await createKpi(domainId);
  await createEdge(kpiPredictive, "ALIGNED_TO", activityP);

  kpiNoPath = await createKpi(domainId);
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (cleanupNodeIds.length > 0) {
      await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupNodeIds });
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: performance systemKind slice (AC-03, DD-06)", () => {
  test(`?kind=${AGENTIC} returns only KPIs reaching an agentic System — inclusive-any`, async () => {
    const ids = await rowsFor(`?domain=${domainId}&kind=${AGENTIC}`);
    expect(ids).toContain(kpiAgentic); // via journey → activity PART_OF
    expect(ids).toContain(kpiBoth); // reaches functional AND agentic — still matches
    expect(ids).not.toContain(kpiFunctional);
    expect(ids).not.toContain(kpiPredictive);
    expect(ids).not.toContain(kpiNoPath); // no KPI→…→System path → excluded
  });

  test(`?kind=${FUNCTIONAL} and ?kind=${AI_PREDICTIVE} narrow symmetrically`, async () => {
    const functionalIds = await rowsFor(`?domain=${domainId}&kind=${FUNCTIONAL}`);
    expect(functionalIds.sort()).toEqual([kpiBoth, kpiFunctional].sort());

    const predictiveIds = await rowsFor(`?domain=${domainId}&kind=${AI_PREDICTIVE}`);
    expect(predictiveIds).toEqual([kpiPredictive]);
  });

  test("kind absent / all / nonsense each return the full in-scope set (200, the `all` slice — never 400)", async () => {
    const all = [kpiFunctional, kpiAgentic, kpiBoth, kpiPredictive, kpiNoPath].sort();
    for (const suffix of ["", "&kind=all", "&kind=nonsense"]) {
      const ids = await rowsFor(`?domain=${domainId}${suffix}`);
      expect(ids.sort()).toEqual(all);
    }
  });
});
