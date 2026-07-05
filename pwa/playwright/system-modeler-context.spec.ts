// ddd-system-modeling T-16 (AC-19, FR-14, UX-06) — SystemModeler
// model-context reload e2e: with a non-reference model (model B)
// active, navigate to #/model/systems and reload → the same route
// renders SystemModeler showing MODEL B's capabilities/gaps/
// context-map (active-model persistence is model-workspace-core FR-15;
// this view refetches for the persisted model via useActiveModel()).
// No cross-model leakage (server-enforced via CAPABILITY_IN_MODEL
// membership, design §4.1).
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 with the
// capability routes + permissions live (T-08/T-09).

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// API-only fixture seeding through the Vite proxy (design §9): a model
// + domain + journey + activity + capability wired needed-by +
// supported-by.
async function seedModel(page: import("@playwright/test").Page, name: string) {
  return page.evaluate(async (modelName) => {
    const send = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) throw new Error(`${res.status} ${method} ${path}`);
      return res.json();
    };
    const model = await send("POST", "/api/v1/models", { name: modelName });
    const domain = await send("POST", `/api/v1/models/${model.id}/domains`, {
      name: `${modelName}-domain`,
    });
    const journey = await send("POST", "/api/v1/nodes/UserJourney", {
      name: `${modelName}-journey`,
    });
    await send("POST", "/api/v1/edges", { type: "PART_OF", fromId: journey.id, toId: domain.id });
    const activity = await send("POST", "/api/v1/nodes/Activity", {
      name: `${modelName}-activity`,
    });
    await send("POST", "/api/v1/edges", { type: "PART_OF", fromId: activity.id, toId: journey.id });
    const system = await send("POST", "/api/v1/nodes/System", {
      name: `${modelName}-system`,
      attributes: { systemKind: "functional" },
    });
    const cap = await send("POST", `/api/v1/models/${model.id}/capabilities`, {
      name: `${modelName}-capability`,
    });
    await send("PUT", `/api/v1/models/${model.id}/capabilities/${cap.id}/needed-by`, {
      activityId: activity.id,
    });
    await send("PUT", `/api/v1/models/${model.id}/capabilities/${cap.id}/supported-by`, {
      systemId: system.id,
    });
    return {
      modelId: model.id as string,
      journeyId: journey.id as string,
      activityId: activity.id as string,
      systemId: system.id as string,
      capabilityId: cap.id as string,
    };
  }, name);
}

async function cleanup(
  page: import("@playwright/test").Page,
  fx: { modelId: string; journeyId: string; activityId: string; systemId: string; capabilityId: string },
) {
  await page.evaluate(async ({ modelId, journeyId, activityId, systemId, capabilityId }) => {
    await fetch(`/api/v1/models/${modelId}/capabilities/${capabilityId}`, { method: "DELETE" });
    await fetch(`/api/v1/nodes/Activity/${activityId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/nodes/UserJourney/${journeyId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/nodes/System/${systemId}?cascade=true`, { method: "DELETE" });
    await fetch(`/api/v1/models/${modelId}`, { method: "DELETE" });
  }, fx);
}

test.describe("SystemModeler model-context reload (AC-19)", () => {
  test("model B active → #/model/systems → reload keeps rendering B's capabilities/gaps/context-map, no cross-model leakage", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/model/models`);
    await page.waitForSelector("[data-testid='model-list']");

    const stamp = Date.now();
    const b = await seedModel(page, `e2e-sm-b-${stamp}`);
    // A second model whose capabilities must NEVER leak into B's view.
    const other = await seedModel(page, `e2e-sm-other-${stamp}`);

    try {
      // Make model B the active model (context + localStorage persist).
      // Reload for a fresh ActiveModelProvider mount that reads the
      // persisted id (FR-15).
      await page.evaluate((id) => localStorage.setItem("cg.activeModelId", id), b.modelId);
      await page.goto(`${BASE}/#/model/systems`);
      await page.reload();
      await page.waitForSelector("[data-testid='system-modeler']");
      await expect(page.getByTestId(`cap-row-${b.capabilityId}`)).toBeVisible();
      await expect(page.getByTestId(`cap-row-${other.capabilityId}`)).toHaveCount(0);

      // Reload — same route, same persisted model, same panels (AC-19).
      await page.reload();
      await page.waitForSelector("[data-testid='system-modeler']");
      expect(page.url()).toContain("#/model/systems");
      const storedId = await page.evaluate(() => localStorage.getItem("cg.activeModelId"));
      expect(storedId).toBe(b.modelId);

      // Capability list shows B's capability.
      await expect(page.getByTestId(`cap-row-${b.capabilityId}`)).toBeVisible();
      await expect(page.getByTestId(`cap-row-${b.capabilityId}`)).toContainText(
        `e2e-sm-b-${stamp}-capability`,
      );
      // Gap + context-map panels rendered for the persisted model.
      await expect(page.getByTestId("gap-panel")).toBeVisible();
      await expect(page.getByTestId("context-map")).toBeVisible();
      // B's capability is unassigned → it sits in the unassigned bucket.
      await expect(page.getByTestId("list-unassigned")).toContainText(
        `e2e-sm-b-${stamp}-capability`,
      );

      // Cross-model isolation (server-enforced via CAPABILITY_IN_MODEL).
      await expect(page.getByTestId(`cap-row-${other.capabilityId}`)).toHaveCount(0);
      await expect(page.getByTestId("list-unassigned")).not.toContainText(
        `e2e-sm-other-${stamp}-capability`,
      );
    } finally {
      await cleanup(page, b);
      await cleanup(page, other);
    }
  });
});
