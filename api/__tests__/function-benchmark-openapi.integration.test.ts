// function-benchmark-scoring T-07 (AC-08 OpenAPI half) — the two-segment
// path and its 200 response schema appear in the generated OpenAPI doc.
// Generated in-process from getOpenApiDoc() (the same generator the live
// GET /api/v1/openapi.json serves) so the assertion tracks the current
// build, not a stale server process.

import { describe, expect, test } from "bun:test";
import { getOpenApiDoc } from "../src/routes/openapi";

interface OpenApiDoc {
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, unknown> };
}

describe("integration: function-benchmark OpenAPI (AC-08)", () => {
  test("the benchmark-report path + 200 response schema are registered", () => {
    const doc = getOpenApiDoc() as OpenApiDoc;
    const path = doc.paths["/api/v1/analytics/benchmarks/report"];
    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
    expect(path.get.responses).toBeDefined();
    expect(path.get.responses!["200"]).toBeDefined();
    // the BenchmarkReport component schema is present.
    expect(doc.components?.schemas?.BenchmarkReport).toBeDefined();
  });
});
