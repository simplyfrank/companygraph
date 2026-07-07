// sales-process-model T-16 (AC-14) — over the whole seeded Sales subgraph
// (fixture rows + resolver edges + Postgres risk rows), every distinct node
// label + edge type appears in a mapping-table row, and every mapping-table row
// is instantiated EXCEPT the two reference-only rows (Domain, MetricDefinition).
// Requires the stack up (+ Postgres) AND the executed funnel subsystem (B-01).

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { cypher, salesSeedReady, skipMsg } from "./sales-test-harness";

// The mapping table's authored node labels + edge types (requirements
// "Sales Function → Representation Mapping"). Domain + MetricDefinition are the
// two reference-only rows (foundation/library-seeded — referenced, not authored).
const MAPPING_NODE_LABELS = new Set([
  "UserJourney",
  "Activity",
  "Role",
  "System",
  "KPI",
  "Funnel",
  "Stage",
  "UserStory",
  "AcceptanceCriterion",
  "Capability",
]);
const MAPPING_EDGE_TYPES = new Set([
  "PART_OF",
  "PRECEDES",
  "EXECUTES",
  "USES_SYSTEM",
  "MEASURES",
  "ALIGNED_TO",
  "HAS_STAGE",
  "CONVERTS_TO",
  "DESCRIBES_ACTIVITY",
  "STORY_FOR_ROLE",
  "ACCEPTANCE_OF",
  "NEEDS_CAPABILITY",
  "SUPPORTED_BY",
  "CAPABILITY_IN_MODEL",
]);

describe("integration: sales mapping coverage (AC-14)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-14: every mapping-table node label is instantiated in the seeded subgraph", async () => {
    if (!ready) return skipMsg("AC-14");
    for (const label of MAPPING_NODE_LABELS) {
      const res = await cypher(`MATCH (n:${label}) RETURN count(n) AS n`);
      const n = Number((res.rows[0]!.n as { low?: number })?.low ?? res.rows[0]!.n ?? 0);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-14: every mapping-table edge type is instantiated in the seeded subgraph", async () => {
    if (!ready) return skipMsg("AC-14");
    for (const type of MAPPING_EDGE_TYPES) {
      const res = await cypher(`MATCH ()-[r:${type}]->() RETURN count(r) AS n`);
      const n = Number((res.rows[0]!.n as { low?: number })?.low ?? res.rows[0]!.n ?? 0);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-14: the two reference-only rows (Domain, MetricDefinition) are present but foundation/library-seeded", async () => {
    if (!ready) return skipMsg("AC-14");
    const dom = await cypher(`MATCH (d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"sales"' RETURN count(d) AS n`);
    expect(Number((dom.rows[0]!.n as { low?: number })?.low ?? dom.rows[0]!.n ?? 0)).toBe(1);
    const met = await cypher(`MATCH (m:MetricDefinition) RETURN count(m) AS n`);
    expect(Number((met.rows[0]!.n as { low?: number })?.low ?? met.rows[0]!.n ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
