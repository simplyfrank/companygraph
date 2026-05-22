import { describe, expect, test } from "bun:test";
import type { Health } from "@companygraph/shared/types";

// AC-11 — /api/v1/healthz reports Neo4j connectivity and version.
//
// Assumes the API server is already running on 127.0.0.1:8787 (started
// by `bun run dev` or the CI harness). The integration test runner
// does NOT spin up the server itself — failures here typically mean
// `bun run dev` is not up.
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

describe("integration: AC-11 GET /api/v1/healthz", () => {
  test("returns 200 with {ok:true, neo4j:{connected:true, version:/^5\\./}}", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/healthz`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Health;
    expect(body.ok).toBe(true);
    expect(body.neo4j.connected).toBe(true);
    expect(body.neo4j.version).toMatch(/^5\./);
  });

  test("response is application/json", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/healthz`);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
