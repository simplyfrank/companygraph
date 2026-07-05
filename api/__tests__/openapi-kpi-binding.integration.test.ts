import { beforeAll, describe, expect, test } from "bun:test";

// kpi-measurement-alignment AC-12 — new param-binding + reconcile routes
// appear in GET /api/v1/openapi.json.

const API_BASE = "http://127.0.0.1:8787/api/v1";

describe("integration: OpenAPI covers param-binding + reconcile routes (AC-12)", () => {
  let paths: Record<string, Record<string, unknown>>;

  beforeAll(async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    const spec = await res.json();
    paths = spec.paths;
  });

  test("POST /api/v1/kpis/{id}/param-bindings is registered", () => {
    const path = paths["/api/v1/kpis/{id}/param-bindings"];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();
  });

  test("GET /api/v1/kpis/{id}/param-bindings is registered", () => {
    const path = paths["/api/v1/kpis/{id}/param-bindings"];
    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
  });

  test("DELETE /api/v1/param-bindings/{bindingId} is registered", () => {
    const path = paths["/api/v1/param-bindings/{bindingId}"];
    expect(path).toBeDefined();
    expect(path.delete).toBeDefined();
  });

  test("POST /api/v1/kpis/{id}/reconcile is registered", () => {
    const path = paths["/api/v1/kpis/{id}/reconcile"];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();
  });

  test("POST /api/v1/kpis/reconcile-all is registered", () => {
    const path = paths["/api/v1/kpis/reconcile-all"];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();
  });
});
