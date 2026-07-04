import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/errors";

// model-workspace-core T-02 + T-14 / AC-10 (openapi half) — every new
// route path and every new ERROR_CODES member is present in
// GET /api/v1/openapi.json (generated from the same zod definitions
// the handlers parse with).

const API_BASE = "http://127.0.0.1:8787/api/v1";

const NEW_CODES = [
  "model_not_found",
  "model_reference_immutable",
  "module_not_found",
  "module_version_not_found",
  "module_instance_forked",
  "module_version_immutable",
  "module_downgrade_not_allowed",
  "model_lifecycle_route_required",
  "module_instance_node_not_member",
] as const;

const NEW_PATHS: Array<[method: string, path: string]> = [
  ["post", "/api/v1/models"],
  ["get", "/api/v1/models"],
  ["get", "/api/v1/models/{id}"],
  ["patch", "/api/v1/models/{id}"],
  ["delete", "/api/v1/models/{id}"],
  ["post", "/api/v1/models/{id}/archive"],
  ["post", "/api/v1/models/{id}/domains"], // B-02
  ["post", "/api/v1/models/{modelId}/module-instances"],
  ["get", "/api/v1/models/{modelId}/module-instances"],
  ["patch", "/api/v1/models/{modelId}/module-instances/{instanceId}/nodes/{nodeId}"],
  ["post", "/api/v1/models/{modelId}/module-instances/{instanceId}/edges"], // B-01
  ["delete", "/api/v1/models/{modelId}/module-instances/{instanceId}/edges"], // B-01
  ["post", "/api/v1/models/{modelId}/module-instances/{instanceId}/fork"],
  ["post", "/api/v1/models/{modelId}/module-instances/{instanceId}/upgrade"],
  ["post", "/api/v1/modules"],
  ["get", "/api/v1/modules"],
  ["post", "/api/v1/modules/{id}/versions"],
  ["get", "/api/v1/modules/{id}/versions"],
];

describe("integration: model-workspace-core AC-10 openapi registration", () => {
  test("each new error code is a member of the closed ERROR_CODES enum (T-02)", () => {
    for (const code of NEW_CODES) {
      expect(ERROR_CODES as readonly string[]).toContain(code);
    }
  });

  test("every new route path (edge + domains routes included) appears in openapi.json", async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components?: { schemas?: Record<string, unknown> };
    };
    for (const [method, path] of NEW_PATHS) {
      expect(doc.paths[path]).toBeDefined();
      expect(doc.paths[path]![method]).toBeDefined();
    }
    // Every new code rides the generated error envelope's closed enum.
    const envelope = JSON.stringify(doc.components?.schemas?.ErrorEnvelope ?? {});
    for (const code of NEW_CODES) {
      expect(envelope).toContain(code);
    }
  });
});
