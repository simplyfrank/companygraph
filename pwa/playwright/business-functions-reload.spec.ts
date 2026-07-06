// saas-operator-foundation T-14 (AC-16, FR-15, UX-06) — deep-link + reload
// e2e for #/business/functions. With the SaaS-Operator root + its six function
// domains seeded (the fixture the view renders, C-05), navigate to
// #/business/functions, reload → the same route renders and the SaaS-Operator
// root is still the subject (from the persisted shell active-model context).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 + Neo4j.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// Seed the operator scaffold through the API (via the Vite proxy). The model
// + domains are created via the dedicated model routes (createModel /
// attachDomain) — the same paths seed:saas-operator uses; idempotency here is
// a lookup-before-create on the operator marker / domain seedKey.
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

    // Find or create the operator root by the OQ-1 marker.
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

    // Read existing IN_MODEL domains to make attach idempotent by seedKey.
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

test.describe("FunctionMap deep-link + reload (AC-16)", () => {
  test("deep link to #/business/functions survives reload with operator subject", async ({ page }) => {
    await page.goto(`${BASE}/#/model/models`);
    const rootId = await seedOperatorScaffold(page);

    // Make the operator root the active model, then deep-link to the view.
    await page.evaluate((id) => localStorage.setItem("cg.activeModelId", id), rootId);
    await page.goto(`${BASE}/#/business/functions`);

    // Ready state: the function grid renders six cards.
    const grid = page.getByTestId("function-map-grid");
    await expect(grid).toBeVisible();
    await expect(page.getByTestId("function-card")).toHaveCount(6);

    // Reload — same route, same operator subject (six cards still render).
    await page.reload();
    expect(page.url()).toContain("#/business/functions");
    await expect(page.getByTestId("function-map-grid")).toBeVisible();
    await expect(page.getByTestId("function-card")).toHaveCount(6);
  });
});
