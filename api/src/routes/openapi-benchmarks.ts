// function-benchmark-scoring T-07 / design §4.6 (FR-08) — OpenAPI
// coverage for the read-only benchmark-report route. Wired into
// getOpenApiDoc() via a single call alongside registerPerformancePaths
// (openapi.ts §4.7). Generated from the SAME zod definitions the handler
// parses/responds with (shared/src/schema/function-benchmark.ts) — no
// hand-maintained copy. No ERROR_CODES change (DD-10).

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { benchmarkReportSchema } from "@companygraph/shared/schema/function-benchmark";

export function registerBenchmarkPaths(registry: OpenAPIRegistry): void {
  registry.register("BenchmarkReport", benchmarkReportSchema);

  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/benchmarks/report",
    description:
      "Per-function descriptive maturity report over the SaaS-Operator root (read-only, two-segment path DD-09). Returns the six function domains ranked by composite (metricBenchmark + coverage + automation, over applicable sub-scores) with component evidence + meta {functionCount, modelId, weights}. No params (root-fixed, FR-07). Empty-200 {functionCount:0, modelId:null} when no operator root exists (DD-10). analytics:read.",
    responses: {
      200: {
        description: "per-function benchmark report (ranked composite DESC, ties seedKey ASC)",
        content: { "application/json": { schema: benchmarkReportSchema } },
      },
    },
  });
}
