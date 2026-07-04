// model-workspace-core T-18 (AC-18) — the active-model selection is a
// shell-level concern persisted per-origin (localStorage
// `cg.activeModelId`): navigate to #/model/models, switch the active
// model to a non-reference model, reload → the same route renders and
// the active model is still selected.
//
// Needs the full stack (`bun run dev`): API on 127.0.0.1:8787 with the
// retail migration applied (the reference model exists).

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test.describe("Active-model context persistence (AC-18)", () => {
  test("deep link + reload restore route and active model", async ({ page }) => {
    await page.goto(`${BASE}/#/model/models`);
    await page.waitForSelector("[data-testid='model-list']");

    // Ensure a non-reference model exists — create one through the UI
    // if the workspace only holds the reference model.
    const name = `e2e-active-model-${Date.now()}`;
    await page.getByRole("button", { name: "Create model" }).click();
    await page.getByTestId("model-create-name").fill(name);
    await page.getByTestId("model-create-form").getByRole("button", { name: "Create" }).click();
    const row = page.locator("[data-testid^='model-row-']", { hasText: name });
    await expect(row).toBeVisible();

    // Switch the new non-reference model active.
    await row.getByRole("button", { name: "Switch" }).click();
    await expect(row).toHaveAttribute("aria-current", "true");
    const storedId = await page.evaluate(() => localStorage.getItem("cg.activeModelId"));
    expect(storedId).toBeTruthy();

    // Reload — same route renders, same model still active (AC-18).
    await page.reload();
    await page.waitForSelector("[data-testid='model-list']");
    expect(page.url()).toContain("#/model/models");
    const activeRow = page.locator(`[data-testid='model-row-${storedId}']`);
    await expect(activeRow).toHaveAttribute("aria-current", "true");
    await expect(activeRow).toContainText(name);

    // Cleanup: delete the e2e model through the API so re-runs stay tidy.
    await page.evaluate(async (id) => {
      await fetch(`/api/v1/models/${id}`, { method: "DELETE" });
    }, storedId);
  });
});
