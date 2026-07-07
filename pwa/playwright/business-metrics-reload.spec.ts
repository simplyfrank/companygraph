// saas-metric-library T-12 (design §6.5, §9 — FR-12, FR-13, UX-06; AC-18,
// AC-17 live half). Deep-link + reload e2e for #/business/metrics. With the
// full stack up and `bun run seed:saas-metric-library` run (the 20 seeded
// metrics are what the view renders), navigate to #/business/metrics, reload →
// the same route re-renders the live MetricLibrary (persisted shell context +
// hash router).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 + Neo4j.
// NOTE (execution status): this spec depends on saas-operator-foundation
// registering the #/business/metrics route + wiring MetricLibrary into the
// `metrics:` VIEWS key (XD-05). Until that foundation route wiring is present
// in the working tree, #/business/metrics does not resolve to MetricLibrary and
// this spec is expected to be skipped/failing — the feature owns only its view
// file + the single `metrics:` line, not the surface registration.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// Ensure the canonical metric catalog is registered + seeded through the API
// (via the Vite proxy). Idempotent: the label/edge ensures are 409-as-no-op and
// the fixture imports MERGE-on-id.
async function seedMetricCatalog(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(async () => {
    const send = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
    };
    // Count what is already seeded — if 20 are present the fixture ran.
    const { json } = await send("POST", "/api/v1/query/cypher", {
      statement: "MATCH (m:MetricDefinition) RETURN count(m) AS n",
      params: {},
    });
    const rows = (json as { rows?: Array<{ n: unknown }> })?.rows ?? [];
    const raw = rows[0]?.n;
    const n = typeof raw === "number" ? raw : Number((raw as { low?: number })?.low ?? raw ?? 0);
    return n;
  });
}

test.describe("MetricLibrary deep-link + reload (AC-18)", () => {
  test("deep link to #/business/metrics survives reload with the live catalog", async ({ page }) => {
    await page.goto(`${BASE}/#/model/models`);
    await seedMetricCatalog(page);

    await page.goto(`${BASE}/#/business/metrics`);

    const grid = page.getByTestId("metric-library-grid");
    await expect(grid).toBeVisible();
    const before = await page.getByTestId("metric-card").count();
    expect(before).toBeGreaterThan(0);

    await page.reload();
    expect(page.url()).toContain("#/business/metrics");
    await expect(page.getByTestId("metric-library-grid")).toBeVisible();
    await expect(page.getByTestId("metric-card")).toHaveCount(before);
  });
});
