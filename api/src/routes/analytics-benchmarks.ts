// function-benchmark-scoring T-05 (design §4.4, FR-07, FR-08) — the
// read-only route handler for GET /api/v1/analytics/benchmarks/report.
//
// No params (root-fixed server-side, FR-07). No per-route auth check —
// auth stays in the central router gate (house rule, FR-09). zod-validated
// at the boundary; the standard error envelope on genuine errors; no new
// error code (DD-10).

import { benchmarkReportSchema } from "@companygraph/shared/schema/function-benchmark";
import { getDriver } from "../neo4j/driver";
import { computeBenchmarkReport } from "../storage/function-benchmark";
import { ok } from "./_helpers";

export async function handleBenchmarkReport(_req: Request): Promise<Response> {
  const report = await computeBenchmarkReport(getDriver());
  return ok(benchmarkReportSchema.parse(report));
}
