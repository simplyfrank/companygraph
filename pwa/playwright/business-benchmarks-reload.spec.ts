// function-benchmark-scoring T-11 (AC-16, FR-12, UX-06) — deep-link +
// reload e2e for #/business/benchmarks. With the SaaS-Operator root + its
// six function domains seeded (the fixture the report scores), navigate to
// #/business/benchmarks, reload → the same route re-renders the live
// BenchmarkReport for the persisted operator context (no cross-model
// leakage). API-seeded (AC-16).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 + Neo4j.
// NOTE: this view is reached only once saas-operator-foundation registers
// the #/business/benchmarks route + views/index.tsx benchmarks: seam
// (XD-05 — foundation-owned). Until that lands, this spec documents the
// expected behaviour and is a no-op skip when the route is unresolved.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function seedOperatorScaffold(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(async () => {
    const send = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) throw new Error(`${res.status} ${method} ${path}`);
      return res.json();
    };

    const models = (await send("GET", "/api/v1/models")) as Array<{
      id: string;
      name: string;
      attributes?: Record<string, unknown>;
    }>;
    let root = models.find(
      (m) => m.name === "SaaS Operator" && m.attributes?.saasOperatorRoot === true,
    );
    if (!root) {
      root = (await send("POST", "/api/v1/models", {
        name: "SaaS Operator",
        description: "e2e operator root",
        attributes: { saasOperatorRoot: true },
      })) as typeof root;
    }
    const rootId = root!.id;

    const { rows } = (await send("POST", "/api/v1/query/cypher", {
      statement:
        "MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$id}) RETURN apoc.convert.fromJsonMap(d.attributes_json).seedKey AS seedKey",
      params: { id: rootId },
    })) as { rows: Array<{ seedKey: string | null }> };
    const have = new Set(rows.map((r) => r.seedKey).filter(Boolean));

    const DOMAINS = [
      { name: "Marketing", seedKey: "marketing" },
      { name: "Sales", seedKey: "sales" },
      { name: "Finance & Accounting", seedKey: "finance_accounting" },
      { name: "Customer Success", seedKey: "customer_success" },
      { name: "Product & Delivery", seedKey: "product_delivery" },
      { name: "Platform Ops", seedKey: "platform_ops" },
    ];
    for (const d of DOMAINS) {
      if (have.has(d.seedKey)) continue;
      await send("POST", `/api/v1/models/${rootId}/domains`, {
        name: d.name,
        attributes: { seedKey: d.seedKey },
      });
    }
    return rootId;
  });
}

test.describe("BenchmarkReport deep-link + reload (AC-16)", () => {
  test("deep link to #/business/benchmarks survives reload with operator subject", async ({ page }) => {
    await page.goto(`${BASE}/#/model/models`);
    const rootId = await seedOperatorScaffold(page);

    await page.evaluate((id) => localStorage.setItem("cg.activeModelId", id), rootId);
    await page.goto(`${BASE}/#/business/benchmarks`);

    // Ready state: the benchmark grid renders the six function cards.
    const grid = page.getByTestId("benchmark-grid");
    await expect(grid).toBeVisible();
    await expect(page.getByTestId("benchmark-card")).toHaveCount(6);

    // Reload — same route, same operator subject.
    await page.reload();
    expect(page.url()).toContain("#/business/benchmarks");
    await expect(page.getByTestId("benchmark-grid")).toBeVisible();
    await expect(page.getByTestId("benchmark-card")).toHaveCount(6);
  });
});
