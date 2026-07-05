// key-activity-optimizer T-16 (AC-16, FR-14, UX-06) — KeyActivityBoard
// model-context reload e2e: with a non-reference model (model B)
// active, navigate to #/model/key-activities and reload → the same
// route renders KeyActivityBoard showing MODEL B's ranked activities
// (active-model persistence is model-workspace-core FR-15; this view
// refetches for the persisted model via useActiveModel()). No
// cross-model leakage in the ranking (server-enforced, design §4.2).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 with the
// key-activity routes + permissions live (T-08/T-09).

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// API-only fixture seeding through the Vite proxy (design §8): a model
// + domain + journey + two activities wired PRECEDES.
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
    const domain = await post(`/api/v1/models/${model.id}/domains`, {
      name: `${modelName}-domain`,
    });
    const journey = await post("/api/v1/nodes/UserJourney", { name: `${modelName}-journey` });
    await post("/api/v1/edges", { type: "PART_OF", fromId: journey.id, toId: domain.id });
    const a1 = await post("/api/v1/nodes/Activity", { name: `${modelName}-act-1` });
    const a2 = await post("/api/v1/nodes/Activity", { name: `${modelName}-act-2` });
    await post("/api/v1/edges", { type: "PART_OF", fromId: a1.id, toId: journey.id });
    await post("/api/v1/edges", { type: "PART_OF", fromId: a2.id, toId: journey.id });
    await post("/api/v1/edges", { type: "PRECEDES", fromId: a1.id, toId: a2.id });
    return {
      modelId: model.id as string,
      journeyId: journey.id as string,
      activityIds: [a1.id as string, a2.id as string],
    };
  }, name);
}

async function cleanup(
  page: import("@playwright/test").Page,
  fx: { modelId: string; journeyId: string; activityIds: string[] },
) {
  await page.evaluate(async ({ modelId, journeyId, activityIds }) => {
    for (const id of activityIds) {
      await fetch(`/api/v1/nodes/Activity/${id}?cascade=true`, { method: "DELETE" });
    }
    await fetch(`/api/v1/nodes/UserJourney/${journeyId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/models/${modelId}`, { method: "DELETE" });
  }, fx);
}

test.describe("KeyActivityBoard model-context reload (AC-16)", () => {
  test("model B active → #/model/key-activities → reload keeps rendering B's ranking, no cross-model leakage", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/model/models`);
    await page.waitForSelector("[data-testid='model-list']");

    const stamp = Date.now();
    const b = await seedModel(page, `e2e-ka-b-${stamp}`);
    // A second model whose activities must NEVER leak into B's ranking.
    const other = await seedModel(page, `e2e-ka-other-${stamp}`);

    try {
      // Make model B the active model (context + localStorage persist).
      // A hash-only goto never re-mounts the SPA, so reload for a fresh
      // ActiveModelProvider mount that reads the persisted id (FR-15).
      await page.evaluate((id) => localStorage.setItem("cg.activeModelId", id), b.modelId);
      await page.goto(`${BASE}/#/model/key-activities`);
      await page.reload();
      await page.waitForSelector("[data-testid='key-activity-board']");
      // DD-11 markup (T-20): rows are DataTable-rendered <tr>s; the
      // view-owned per-row anchor is the name cell's detail button.
      await expect(page.getByTestId(`ka-detail-${b.activityIds[0]}`)).toBeVisible();
      await expect(page.getByTestId(`ka-detail-${b.activityIds[1]}`)).toBeVisible();
      await expect(page.getByTestId(`ka-detail-${other.activityIds[0]}`)).toHaveCount(0);

      // Reload — same route, same persisted model, same ranking (AC-16).
      await page.reload();
      await page.waitForSelector("[data-testid='key-activity-board']");
      expect(page.url()).toContain("#/model/key-activities");
      const storedId = await page.evaluate(() => localStorage.getItem("cg.activeModelId"));
      expect(storedId).toBe(b.modelId);
      await expect(page.getByTestId(`ka-detail-${b.activityIds[0]}`)).toBeVisible();
      await expect(page.getByTestId(`ka-detail-${b.activityIds[0]}`)).toContainText(
        `e2e-ka-b-${stamp}-act-1`,
      );
      // Cross-model isolation of the ranking (server-enforced, §4.2).
      await expect(page.getByTestId(`ka-detail-${other.activityIds[0]}`)).toHaveCount(0);
      await expect(page.getByTestId(`ka-detail-${other.activityIds[1]}`)).toHaveCount(0);
    } finally {
      await cleanup(page, b);
      await cleanup(page, other);
    }
  });
});
