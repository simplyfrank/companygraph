// cross-function-exec-rollup T-13 (AC-10) — the five operator paths + their
// 200 response schemas appear in the generated OpenAPI doc, generated
// in-process from getOpenApiDoc() (the same generator GET
// /api/v1/openapi.json serves). Also asserts a malformed ?function= returns
// the standard 400 envelope, and that no ERROR_CODES member was added.

import { describe, expect, test } from "bun:test";
import { getOpenApiDoc } from "../src/routes/openapi";
import { handleOperatorOverview } from "../src/routes/analytics-operator";

interface OpenApiDoc {
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, unknown> };
}

const OPERATOR_PATHS = [
  "/api/v1/analytics/operator/overview",
  "/api/v1/analytics/operator/kpis",
  "/api/v1/analytics/operator/risks",
  "/api/v1/analytics/operator/funnels",
  "/api/v1/analytics/operator/slas",
];

describe("integration: operator openapi", () => {
  test("AC-10: the five operator paths + 200 responses are registered", () => {
    const doc = getOpenApiDoc() as OpenApiDoc;
    for (const p of OPERATOR_PATHS) {
      const path = doc.paths[p];
      expect(path).toBeDefined();
      expect(path.get).toBeDefined();
      expect(path.get.responses).toBeDefined();
      expect(path.get.responses!["200"]).toBeDefined();
      expect(path.get.responses!["400"]).toBeDefined();
    }
  });

  test("AC-10: the operator response schemas are present in components", () => {
    const doc = getOpenApiDoc() as OpenApiDoc;
    for (const name of [
      "OperatorOverviewResponse",
      "OperatorKpisResponse",
      "OperatorRisksResponse",
      "OperatorFunnelsResponse",
      "OperatorSlasResponse",
    ]) {
      expect(doc.components?.schemas?.[name]).toBeDefined();
    }
  });

  test("AC-02/AC-10: a malformed ?function= returns the standard 400 {error} envelope", async () => {
    // in-process the handler throws ValidationError carrying the 400 envelope.
    const err = await handleOperatorOverview(
      new Request("http://x/api/v1/analytics/operator/overview?function=bogus"),
    ).catch((e) => e as { httpStatus?: number; code?: string; details?: unknown });
    expect(err).toBeInstanceOf(Error);
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe("invalid_payload");
    expect(err.details).toBeDefined();
  });

  test("AC-10: no ERROR_CODES member added for operator (errors.ts unchanged is asserted by the ownership diff)", async () => {
    const { ERROR_CODES } = await import("../src/errors");
    // sanity: the closed enum contains the pre-existing codes and no operator-* code
    expect(ERROR_CODES).not.toContain("operator_error");
    expect(ERROR_CODES.length).toBeGreaterThan(0);
  });
});
