// T-14 (cto-analytics, FR-09) — unit coverage for the analytics REST endpoint
// scaffold: the read-only code-default config endpoint + the report-route
// dispatcher's driver-free branches (unknown → 404, not-yet-built modules →
// 200 scaffold envelope). The `systems` branch reads Neo4j via the T-20
// module, so its 6-system live assertion is the T-14 manual repro; the full
// envelope harness across every report GET lands in T-19.

import { describe, test, expect } from "bun:test";
import {
  handleAnalyticsConfig,
  handleAnalyticsReport,
  ANALYTICS_REPORT_ROUTES,
  ANALYTICS_COMPLEXITY_WEIGHTS,
  ANALYTICS_AI_CANDIDATE_DEFINITION,
} from "../src/analytics/routes";

describe("analytics config endpoint (design §10.2, RD-4a/RD-6)", () => {
  test("serves the code-default weights + AI-candidate definition as a 200 envelope", async () => {
    const res = handleAnalyticsConfig();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      complexity_weights: Record<string, number>;
      ai_candidate_definition: Record<string, unknown>;
    };
    // RD-2 default weights all 1.0.
    expect(body.complexity_weights).toEqual({
      depth_weight: 1.0,
      system_weight: 1.0,
      role_weight: 1.0,
    });
    // RD-4a vocabulary: repetition/data_richness "high" + leverage_score >= 0.5.
    expect(body.ai_candidate_definition).toEqual({
      repetition_key: "repetition",
      repetition_match: "high",
      richness_key: "data_richness",
      richness_match: "high",
      leverage_score_key: "leverage_score",
      leverage_min: 0.5,
    });
  });

  test("the exported constants match the served config (T-10/T-13 read these)", () => {
    expect(ANALYTICS_COMPLEXITY_WEIGHTS.depth_weight).toBe(1.0);
    expect(ANALYTICS_COMPLEXITY_WEIGHTS.system_weight).toBe(1.0);
    expect(ANALYTICS_COMPLEXITY_WEIGHTS.role_weight).toBe(1.0);
    expect(ANALYTICS_AI_CANDIDATE_DEFINITION.leverage_min).toBe(0.5);
    expect(ANALYTICS_AI_CANDIDATE_DEFINITION.repetition_match).toBe("high");
    expect(ANALYTICS_AI_CANDIDATE_DEFINITION.richness_match).toBe("high");
  });
});

describe("analytics report route table (RD-3 verbatim names)", () => {
  test("exposes exactly the 7 BUILD-set report route names", () => {
    expect([...ANALYTICS_REPORT_ROUTES]).toEqual([
      "systems",
      "matrix",
      "consolidation",
      "complexity",
      "single-system-journeys",
      "critical-paths",
      "ai-candidates",
    ]);
  });

  test("does not mount the deferred exec-summary / settings / snapshot routes (RD-6)", () => {
    for (const deferred of ["exec-summary.pdf", "settings", "snapshot"]) {
      expect([...ANALYTICS_REPORT_ROUTES]).not.toContain(deferred);
    }
  });
});

describe("handleAnalyticsReport dispatch (driver-free branches)", () => {
  test("unknown report name yields a 404 not_found NFR-08 error envelope", async () => {
    const res = await handleAnalyticsReport("does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });

  test("a not-yet-built report returns a 200 scaffold-pending envelope", async () => {
    // Every report except `systems` reads no Neo4j in the scaffold — assert
    // each returns a well-formed 200 envelope so T-19's harness sees a 200.
    for (const report of ANALYTICS_REPORT_ROUTES) {
      if (report === "systems") continue; // live path — covered by the manual repro
      const res = await handleAnalyticsReport(report);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        report: string;
        scaffold_pending: boolean;
        items: unknown[];
      };
      expect(body.report).toBe(report);
      expect(body.scaffold_pending).toBe(true);
      expect(body.items).toEqual([]);
    }
  });
});
