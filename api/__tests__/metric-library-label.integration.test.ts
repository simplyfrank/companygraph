// saas-metric-library T-02 (design §3.1, §5.1 — FR-01, NFR-01; AC-01
// registration half). ensureMetricDefinitionLabel registers MetricDefinition in
// the runtime node-label registry; GET /api/v1/ontology/node-labels includes it
// with its json_schema_doc; a second call is a no-op (409-as-idempotent).
// Manual boundary check: `git diff shared/src/schema/nodes.ts` shows no
// additions (AC-01, NFR-01). Requires Neo4j + the loopback API up.

import { afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";

const BASE = "http://127.0.0.1:8787";

interface NodeLabelRow {
  name: string;
  json_schema_doc?: unknown;
}

describe("integration: saas-metric-library T-02 MetricDefinition label ensure (AC-01)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("registers MetricDefinition with its json_schema_doc; a second call is a no-op", async () => {
    // First ensure — registers (or already present from a prior run).
    await ensureMetricDefinitionLabel(BASE);

    const res = await fetch(`${BASE}/api/v1/ontology/node-labels`);
    expect(res.ok).toBe(true);
    const rows = (await res.json()) as NodeLabelRow[];
    const metric = rows.find((r) => r.name === "MetricDefinition");
    expect(metric).toBeDefined();

    // The registered json_schema_doc carries the four required attributes + the
    // two closed enums.
    const doc = metric!.json_schema_doc as {
      required?: string[];
      properties?: Record<string, { enum?: string[] }>;
    };
    expect(doc.required).toEqual(
      expect.arrayContaining(["formula", "unit", "category", "benchmark"]),
    );
    expect(doc.properties?.unit?.enum).toEqual(
      expect.arrayContaining(["currency", "ratio", "percent", "days", "months", "count"]),
    );
    expect(doc.properties?.category?.enum).toEqual(
      expect.arrayContaining([
        "acquisition",
        "revenue",
        "retention",
        "efficiency",
        "financial",
        "reliability",
      ]),
    );

    // Second call — 409 name_conflict treated as idempotent success, NOT a hard
    // failure (AC-01).
    await expect(ensureMetricDefinitionLabel(BASE)).resolves.toBeUndefined();
  });
});
