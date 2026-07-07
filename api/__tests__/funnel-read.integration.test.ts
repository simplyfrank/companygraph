import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  newCleanup,
  runCleanup,
  type Cleanup,
} from "./helpers/model-fixtures";
import { ensureFunnelOntology } from "../src/seed/ensure-funnel-ontology";

// funnel-pipeline-modeling T-11 (design §4.5 + review-design C-01, C-02 — AC-09,
// AC-09a, AC-10; FR-08, FR-09, NFR-06). Composition + listing reads via the
// existing POST /api/v1/query/cypher passthrough, plus scope isolation (a
// SaaS-Operator funnel read never returns a retail-modelId funnel).

const API = "http://127.0.0.1:8787";
const cleanup: Cleanup = newCleanup();

const OPERATOR_ROOT = "operator-root-read-test";
const RETAIL_ROOT = "retail-root-read-test";

const COMPOSITION_QUERY = `MATCH (f:Funnel {id:$funnelId})
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, s ORDER BY s.stageOrder
OPTIONAL MATCH (s)-[c:CONVERTS_TO]->(s2:Stage)
RETURN f.id AS funnelId, f.name AS funnelName,
       s.id AS stageId, s.name AS stageName, s.attributes_json AS stageAttrs,
       c.attributes_json AS transitionAttrs, s2.id AS toStageId
ORDER BY s.stageOrder`;

const LIST_QUERY = `MATCH (f:Funnel)
WHERE f.attributes_json CONTAINS $rootIdNeedle
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, count(s) AS stageCount
RETURN f.id AS id, f.name AS name, f.description AS description,
       f.attributes_json AS attributes_json, stageCount
ORDER BY f.name`;

let operatorFunnel: string;
let retailFunnel: string;
let sA: string;
let sB: string;

beforeAll(async () => {
  await ensureFunnelOntology(API);

  // SaaS-Operator funnel: 3 stages, transitions 0.5 & 0.4.
  operatorFunnel = await createNode(cleanup, "Funnel", "operator-funnel", {
    modelId: OPERATOR_ROOT,
  });
  sA = await createNode(cleanup, "Stage", "op-visitor", { stageOrder: 0 });
  sB = await createNode(cleanup, "Stage", "op-lead", { stageOrder: 1 });
  const sC = await createNode(cleanup, "Stage", "op-mql", { stageOrder: 2 });
  for (const s of [sA, sB, sC]) {
    await api("POST", "/edges", { type: "HAS_STAGE", fromId: operatorFunnel, toId: s });
  }
  await api("POST", "/funnels/transitions", {
    fromId: sA,
    toId: sB,
    conversionRate: 0.5,
    dropOffRate: 0.5,
  });
  await api("POST", "/funnels/transitions", {
    fromId: sB,
    toId: sC,
    conversionRate: 0.4,
    dropOffRate: 0.6,
  });

  // Retail funnel: a different modelId + its own stage (scope-isolation control).
  retailFunnel = await createNode(cleanup, "Funnel", "retail-funnel", {
    modelId: RETAIL_ROOT,
  });
  const rStage = await createNode(cleanup, "Stage", "retail-stage", { stageOrder: 0 });
  await api("POST", "/edges", { type: "HAS_STAGE", fromId: retailFunnel, toId: rStage });
});

afterAll(async () => {
  await runCleanup(cleanup);
  await closeDriver();
});

describe("AC-09: composition read returns ordered stages + transitions", () => {
  test("id-keyed composition read returns stages ordered by stageOrder + rates", async () => {
    const { status, body } = await api<{ rows: Record<string, unknown>[] }>(
      "POST",
      "/query/cypher",
      { statement: COMPOSITION_QUERY, params: { funnelId: operatorFunnel } },
    );
    expect(status).toBe(200);
    const stageNames = [...new Set(body.rows.map((r) => String(r.stageName)))];
    expect(stageNames).toEqual(["op-visitor", "op-lead", "op-mql"]);
    // Transition rates present in attributes_json.
    const transitionAttrs = body.rows
      .map((r) => (typeof r.transitionAttrs === "string" ? JSON.parse(r.transitionAttrs) : null))
      .filter(Boolean);
    const convRates = transitionAttrs.map((a: { conversionRate: number }) => a.conversionRate);
    expect(convRates).toContain(0.5);
    expect(convRates).toContain(0.4);
  });
});

describe("AC-09a: composition read is scope-isolated by the funnel id", () => {
  test("operator-funnel read never returns retail-funnel stages", async () => {
    const { body } = await api<{ rows: Record<string, unknown>[] }>("POST", "/query/cypher", {
      statement: COMPOSITION_QUERY,
      params: { funnelId: operatorFunnel },
    });
    const stageNames = body.rows.map((r) => String(r.stageName));
    expect(stageNames).not.toContain("retail-stage");
  });
});

describe("AC-10: listing scoped to the operator root excludes the retail funnel", () => {
  test("CONTAINS prefilter + parse-level modelId check excludes retail", async () => {
    const { body } = await api<{ rows: Record<string, unknown>[] }>("POST", "/query/cypher", {
      statement: LIST_QUERY,
      params: { rootIdNeedle: OPERATOR_ROOT },
    });
    // Parse-level authoritative exclusion (C-01): keep only rows whose modelId
    // === OPERATOR_ROOT (mirrors the client-side filter in FunnelBoard).
    const scoped = body.rows.filter((r) => {
      const attrs =
        typeof r.attributes_json === "string" ? JSON.parse(r.attributes_json) : {};
      return attrs.modelId === OPERATOR_ROOT;
    });
    const names = scoped.map((r) => String(r.name));
    expect(names).toContain("operator-funnel");
    expect(names).not.toContain("retail-funnel");
    // stageCount present per row.
    const opRow = scoped.find((r) => String(r.name) === "operator-funnel")!;
    const count =
      typeof opRow.stageCount === "object" && opRow.stageCount && "low" in opRow.stageCount
        ? Number((opRow.stageCount as { low: number }).low)
        : Number(opRow.stageCount);
    expect(count).toBe(3);
  });
});
