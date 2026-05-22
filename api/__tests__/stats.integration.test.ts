import { describe, expect, test } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";
import type { Stats } from "@companygraph/shared/types";

// AC-12 — /api/v1/stats returns label + edge counts.
//
// FR-11: all six node labels + all six edge types are ALWAYS present
// as keys in the response, even when the count is zero. The test
// makes no seed-state assumption — it only asserts shape + numeric
// values.
//
// Assumes the API server is already running on 127.0.0.1:8787
// (started by `bun run dev` or the CI harness).
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

describe("integration: AC-12 GET /api/v1/stats", () => {
  test("returns 200 with all six node labels + all six edge types as keys", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/stats`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Stats;
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
    expect(body.nodes).toBeTruthy();
    expect(body.edges).toBeTruthy();

    for (const label of NODE_LABELS) {
      expect(Object.prototype.hasOwnProperty.call(body.nodes, label)).toBe(true);
    }
    for (const type of EDGE_TYPES) {
      expect(Object.prototype.hasOwnProperty.call(body.edges, type)).toBe(true);
    }
  });

  test("every value is a finite, non-negative number (zero allowed)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/stats`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Stats;
    for (const label of NODE_LABELS) {
      const v = body.nodes[label];
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    for (const type of EDGE_TYPES) {
      const v = body.edges[type];
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  test("response is application/json", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/stats`);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
