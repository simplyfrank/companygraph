// kpi-impact-mapping T-16 (AC-14, FR-14, UX-06) — KpiImpactMatrix
// model-context reload e2e: with a non-reference model (model B) active,
// navigate to #/model/kpi-impact and reload → the same route renders
// KpiImpactMatrix showing MODEL B's matrix (active-model persistence is
// model-workspace-core FR-15; this view refetches for the persisted
// model via useActiveModel()). No cross-model leakage in the grid
// columns (server-enforced, design §4.2/§4.4).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 with the
// kpi-impact routes + permissions live (T-07/T-08) and the IMPACTS_KPI
// edge registered (T-09).

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// API-only fixture seeding through the Vite proxy (design §8): a model +
// domain + journey + one key activity + a KPI + a directional activity→KPI
// impact link (so the matrix renders in the READY state, not empty).
async function seedModel(page: import("@playwright/test").Page, name: string) {
  return page.evaluate(async (modelName) => {
    const post = async (path: string, body: unknown) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return res.json();
    };
    const model = await post("/api/v1/models", { name: modelName });
    const domain = await post(`/api/v1/models/${model.id}/domains`, { name: `${modelName}-domain` });
    const journey = await post("/api/v1/nodes/UserJourney", { name: `${modelName}-journey` });
    await post("/api/v1/edges", { type: "PART_OF", fromId: journey.id, toId: domain.id });
    // A key activity (keyActivity mark present) so gap/coverage logic is exercised.
    const act = await post("/api/v1/nodes/Activity", {
      name: `${modelName}-act-1`,
      attributes: { keyActivity: { marked: true } },
    });
    await post("/api/v1/edges", { type: "PART_OF", fromId: act.id, toId: journey.id });
    const kpi = await post("/api/v1/kpis", {
      name: `${modelName}-kpi`,
      category: "quality",
      unit: "%",
      target_value: 90,
      target_direction: "higher_is_better",
      measurement_frequency: "weekly",
      domain_id: domain.id,
    });
    await post(`/api/v1/models/${model.id}/kpi-impact/activity-links`, {
      activityId: act.id,
      kpiId: kpi.id,
      direction: "increases",
      weight: 0.8,
    });
    return {
      modelId: model.id as string,
      journeyId: journey.id as string,
      activityIds: [act.id as string],
      kpiId: kpi.id as string,
      kpiName: `${modelName}-kpi`,
    };
  }, name);
}

async function cleanup(
  page: import("@playwright/test").Page,
  fx: { modelId: string; journeyId: string; activityIds: string[]; kpiId: string },
) {
  await page.evaluate(async ({ modelId, journeyId, activityIds, kpiId }) => {
    await fetch(`/api/v1/kpis/${kpiId}/archive`, { method: "POST" });
    for (const id of activityIds) {
      await fetch(`/api/v1/nodes/Activity/${id}?cascade=true`, { method: "DELETE" });
    }
    await fetch(`/api/v1/nodes/UserJourney/${journeyId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/models/${modelId}`, { method: "DELETE" });
  }, fx);
}

test.describe("KpiImpactMatrix model-context reload (AC-14)", () => {
  test("model B active → #/model/kpi-impact → reload keeps rendering B's matrix, no cross-model column leakage", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/model/models`);
    await page.waitForSelector("[data-testid='model-list']");

    const stamp = Date.now();
    const b = await seedModel(page, `e2e-ki-b-${stamp}`);
    // A second model whose KPI column must NEVER leak into B's matrix.
    const other = await seedModel(page, `e2e-ki-other-${stamp}`);

    try {
      // Make model B the active model (context + localStorage persist).
      await page.evaluate((id) => localStorage.setItem("cg.activeModelId", id), b.modelId);
      await page.goto(`${BASE}/#/model/kpi-impact`);
      await page.reload();
      await page.waitForSelector("[data-testid='kpi-impact-matrix']");
      await expect(page.getByRole("grid")).toBeVisible();
      await expect(page.getByText(b.kpiName)).toBeVisible();
      await expect(page.getByText(other.kpiName)).toHaveCount(0);

      // Reload — same route, same persisted model, same matrix (AC-14).
      await page.reload();
      await page.waitForSelector("[data-testid='kpi-impact-matrix']");
      expect(page.url()).toContain("#/model/kpi-impact");
      const storedId = await page.evaluate(() => localStorage.getItem("cg.activeModelId"));
      expect(storedId).toBe(b.modelId);
      await expect(page.getByText(b.kpiName)).toBeVisible();
      // Cross-model isolation of the columns (server-enforced, §4.4).
      await expect(page.getByText(other.kpiName)).toHaveCount(0);
    } finally {
      await cleanup(page, b);
      await cleanup(page, other);
    }
  });
});
