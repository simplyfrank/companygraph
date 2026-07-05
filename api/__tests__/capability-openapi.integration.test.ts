// ddd-system-modeling T-11 / AC-09 (openapi half) + T-03 — every
// capability/system-model route path and each of the three new
// ERROR_CODES members appears in GET /api/v1/openapi.json, generated
// from the same zod definitions used at runtime (FR-10). Asserts the
// FIRST-PUT emission (DD-11): the …/needed-by path carries a `put`
// operation.

import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/errors";

const API_BASE = "http://127.0.0.1:8787/api/v1";

const NEW_CODES = ["capability_not_found", "bounded_context_not_found", "system_not_found"];

const EXPECTED_PATHS: Array<[path: string, methods: string[]]> = [
  ["/api/v1/models/{modelId}/system-model/gaps", ["get"]],
  ["/api/v1/models/{modelId}/system-model/context-map", ["get"]],
  ["/api/v1/models/{modelId}/capabilities", ["get", "post"]],
  ["/api/v1/models/{modelId}/capabilities/{capabilityId}", ["get", "patch", "delete"]],
  ["/api/v1/models/{modelId}/capabilities/{capabilityId}/needed-by", ["put", "delete"]],
  ["/api/v1/models/{modelId}/capabilities/{capabilityId}/supported-by", ["put"]],
  ["/api/v1/models/{modelId}/capabilities/{capabilityId}/supported-by/{systemId}", ["delete"]],
  ["/api/v1/models/{modelId}/capabilities/{capabilityId}/context", ["put", "delete"]],
];

describe("integration: ddd-system-modeling AC-09 openapi registration", () => {
  test("each of the three new codes is a member of ERROR_CODES", () => {
    for (const code of NEW_CODES) {
      expect(ERROR_CODES as readonly string[]).toContain(code);
    }
  });

  test("every capability/system-model route + method appears in openapi.json; needed-by has a PUT operation (DD-11)", async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    for (const [path, methods] of EXPECTED_PATHS) {
      expect(doc.paths[path]).toBeDefined();
      for (const method of methods) {
        expect(doc.paths[path]![method]).toBeDefined();
      }
    }

    // First-PUT emission, asserted explicitly (DD-11).
    expect(
      doc.paths["/api/v1/models/{modelId}/capabilities/{capabilityId}/needed-by"]!["put"],
    ).toBeDefined();
  });

  test("the three new ERROR_CODES appear in the ErrorEnvelope code enum", async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    const doc = (await res.json()) as { components: { schemas: Record<string, unknown> } };
    const envelope = doc.components.schemas["ErrorEnvelope"] as {
      properties: { error: { properties: { code: { enum: string[] } } } };
    };
    const codes = envelope.properties.error.properties.code.enum;
    for (const code of NEW_CODES) expect(codes).toContain(code);
  });

  test("capability schemas registered from the shared zod definitions (no hand-maintained copy)", async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    const doc = (await res.json()) as { components: { schemas: Record<string, unknown> } };
    for (const name of [
      "CapabilityCreate",
      "CapabilityPatch",
      "Capability",
      "CapabilityNeededBy",
      "CapabilitySupportedBy",
      "CapabilityContextAssign",
      "SystemModelGaps",
      "SystemModelContextMap",
    ]) {
      expect(doc.components.schemas[name]).toBeDefined();
    }
  });
});
