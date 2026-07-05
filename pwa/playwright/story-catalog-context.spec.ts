// story-spec-core T-16 (AC-17, FR-14, UX-06) — StoryCatalog
// model-context reload e2e: with a non-reference model (model B)
// active, navigate to #/model/stories and reload → the same route
// renders StoryCatalog showing MODEL B's stories (active-model
// persistence is model-workspace-core FR-15; this view refetches for
// the persisted model). No cross-model leakage of ATTACHED stories
// (server-enforced, design §4.1 / deviations D-4).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 with the
// story routes + permissions live (T-09/T-11).

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// API-only fixture seeding through the Vite proxy (design §8): model B
// + domain + journey + activity + a story attached to that activity.
async function seedModelB(page: import("@playwright/test").Page, name: string) {
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
    const activity = await post("/api/v1/nodes/Activity", { name: `${modelName}-activity` });
    await post("/api/v1/edges", { type: "PART_OF", fromId: activity.id, toId: journey.id });
    const story = await post(`/api/v1/models/${model.id}/stories`, {
      persona: "E2E Persona",
      action: `exercise ${modelName}`,
      benefit: "the e2e workflow completes",
      activityId: activity.id,
    });
    return {
      modelId: model.id as string,
      storyId: story.id as string,
      narrative: story.narrative as string,
      journeyId: journey.id as string,
      activityId: activity.id as string,
    };
  }, name);
}

async function cleanup(
  page: import("@playwright/test").Page,
  fx: { modelId: string; storyId: string; journeyId: string; activityId: string },
) {
  await page.evaluate(async ({ modelId, storyId, journeyId, activityId }) => {
    // Story first (cascade ACs + edges), then the structural nodes/model.
    await fetch(`/api/v1/models/${modelId}/stories/${storyId}`, { method: "DELETE" });
    await fetch(`/api/v1/nodes/Activity/${activityId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/nodes/UserJourney/${journeyId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/models/${modelId}`, { method: "DELETE" });
  }, fx);
}

test.describe("StoryCatalog model-context reload (AC-17)", () => {
  test("model B active → #/model/stories → reload keeps rendering B's stories, no cross-model leakage", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/model/models`);
    await page.waitForSelector("[data-testid='model-list']");

    const stamp = Date.now();
    const b = await seedModelB(page, `e2e-stories-b-${stamp}`);
    // A second model whose attached story must NEVER leak into B's list.
    const other = await seedModelB(page, `e2e-stories-other-${stamp}`);

    try {
      // Make model B the active model (context + localStorage persist).
      // A hash-only goto never re-mounts the SPA, so reload for a fresh
      // ActiveModelProvider mount that reads the persisted id (FR-15).
      await page.evaluate((id) => localStorage.setItem("cg.activeModelId", id), b.modelId);
      await page.goto(`${BASE}/#/model/stories`);
      await page.reload();
      await page.waitForSelector("[data-testid='story-catalog']");
      await expect(page.getByTestId(`story-row-${b.storyId}`)).toBeVisible();
      await expect(page.getByTestId(`story-row-${other.storyId}`)).toHaveCount(0);

      // Reload — same route, same persisted model, same stories (AC-17).
      await page.reload();
      await page.waitForSelector("[data-testid='story-catalog']");
      expect(page.url()).toContain("#/model/stories");
      const storedId = await page.evaluate(() => localStorage.getItem("cg.activeModelId"));
      expect(storedId).toBe(b.modelId);
      await expect(page.getByTestId(`story-row-${b.storyId}`)).toBeVisible();
      await expect(page.getByTestId(`story-row-${b.storyId}`)).toContainText(b.narrative);
      // Cross-model isolation of attached stories (server-enforced).
      await expect(page.getByTestId(`story-row-${other.storyId}`)).toHaveCount(0);
    } finally {
      await cleanup(page, b);
      await cleanup(page, other);
    }
  });
});
