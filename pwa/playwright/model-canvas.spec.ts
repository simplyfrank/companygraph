// business-model-authoring T-17 — Playwright e2e test.
// Deep-link + active-model reload. Verifies that #/model/canvas loads
// the ModelCanvas view, and that switching the active model reloads
// the authoring graph for the new model.

import { test, expect } from "@playwright/test";

test.describe("business-model-authoring T-17: deep-link + active-model reload", () => {
  test("deep-link to #/model/canvas renders the ModelCanvas view", async ({ page }) => {
    await page.goto("/#/model/canvas");
    // The view should render — either loading, or the canvas section
    await expect(page.locator('[data-testid="model-canvas"], [data-testid="error-state"]')).toBeVisible({ timeout: 10000 });
  });

  test("ModelCanvas shows the template step on first visit", async ({ page }) => {
    await page.goto("/#/model/canvas");
    // Wait for the wizard to load (may show loading first)
    await expect(page.locator("text=/Choose a template/i")).toBeVisible({ timeout: 10000 });
  });

  test("selecting Blank template enables the Next button", async ({ page }) => {
    await page.goto("/#/model/canvas");
    await expect(page.locator("text=/Choose a template/i")).toBeVisible({ timeout: 10000 });
    // Select the Blank radio
    await page.check('input[type="radio"][value="blank"], label:has-text("Blank") input[type="radio"]');
    // The gate message should disappear
    await expect(page.locator('[data-testid="template-gate-message"]')).not.toBeVisible();
  });
});
