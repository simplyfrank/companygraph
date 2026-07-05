// business-model-authoring T-13 — OpenAPI registration integration test
// (AC-10 openapi half). Requires live Neo4j (for the server to boot).
// Carries T-03's ERROR_CODES membership assertions.

import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/errors";

const BASE = "http://127.0.0.1:8787/api/v1";

async function getOpenApi() {
  const res = await fetch(`${BASE}/openapi.json`);
  return res.json() as Promise<{ paths: Record<string, Record<string, unknown>> }>;
}

describe("business-model-authoring T-13: OpenAPI registration", () => {
  test("T-03: the five reused error codes are members of ERROR_CODES", () => {
    expect(ERROR_CODES).toContain("invalid_payload");
    expect(ERROR_CODES).toContain("attribute_violation");
    expect(ERROR_CODES).toContain("edge_endpoint_label_mismatch");
    expect(ERROR_CODES).toContain("model_not_found");
    expect(ERROR_CODES).toContain("not_found");
  });

  test("all three DD-06 route paths appear in GET /openapi.json", async () => {
    const doc = await getOpenApi();
    const paths = Object.keys(doc.paths);
    expect(paths).toContain("/api/v1/models/{modelId}/authoring/apply");
    expect(paths).toContain("/api/v1/models/{modelId}/authoring/graph");
    expect(paths).toContain("/api/v1/models/{modelId}/domains/{domainId}");
  });
});
