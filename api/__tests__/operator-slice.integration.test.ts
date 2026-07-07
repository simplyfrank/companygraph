import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import {
  handleOperatorOverview,
  handleOperatorKpis,
} from "../src/routes/analytics-operator";
import { seedOperatorRoot } from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-05 — AC-02: ?function= slices to that function;
// absent → all six; malformed/unknown → 400 {error:{code,message,details}}.

const BASE = "http://127.0.0.1:8787";

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});
afterAll(async () => {
  await closeDriver();
});

describe("integration: operator slice", () => {
  test("AC-02: absent function → all six functions", async () => {
    const res = await handleOperatorOverview(
      new Request(`${BASE}/api/v1/analytics/operator/overview`),
    );
    const body = (await res.json()) as { functions: Array<{ function: string }> };
    expect(body.functions.length).toBe(6);
  });

  test("AC-02: ?function=<seedKey> slices every aggregate to exactly that function", async () => {
    for (const handler of [handleOperatorOverview, handleOperatorKpis]) {
      const res = await handler(
        new Request(`${BASE}/api/v1/analytics/operator/overview?function=sales`),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { functions: Array<{ function: string }> };
      expect(body.functions.length).toBe(1);
      expect(body.functions[0]!.function).toBe("sales");
    }
  });

  test("AC-02: malformed/unknown function → 400 standard envelope", async () => {
    const res = await handleOperatorOverview(
      new Request(`${BASE}/api/v1/analytics/operator/overview?function=bogus`),
    ).catch((e) => e);
    // The handler throws ValidationError; the router converts it to a 400
    // envelope. In-process we assert the throw carries the envelope shape.
    expect(res).toBeInstanceOf(Error);
    const err = res as { httpStatus?: number; code?: string; details?: unknown };
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe("invalid_payload");
    expect(err.details).toBeDefined();
  });
});
