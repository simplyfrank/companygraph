// T-19b: Playwright service worker degradation (AC-20)
//
// Verifies that the app boots and functions correctly when the
// service worker is unavailable (Safari private mode, quota exhausted).

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test.describe("SW degradation (AC-20)", () => {
  test("app boots without service worker", async ({ page, context }) => {
    // Block SW registration by intercepting the sw.js request
    await page.route("**/sw.js", (route) => route.abort());

    await page.goto(`${BASE}/#/explorer/domains`);
    // App should still boot and render
    await page.waitForSelector("[data-testid='stat-counts']");
    const title = page.locator("text=companygraph");
    await expect(title).toBeVisible();
  });

  test("app functions offline with cached reads when SW active", async ({ page }) => {
    // First load with network to populate SW cache
    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForSelector("[data-testid='stat-counts']");

    // Go offline
    await page.context().setOffline(true);

    // Reload — should serve from SW cache
    await page.reload();
    // The app shell should still render (from shell cache)
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty();

    // Restore online
    await page.context().setOffline(false);
  });

  test("app handles offline state gracefully", async ({ page }) => {
    // Load page normally first
    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForSelector("[data-testid='stat-counts']");
    await page.waitForTimeout(1000); // Let SW install

    // Go offline and reload
    await page.context().setOffline(true);
    await page.reload();

    // The app shell should still render from cache
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty();

    await page.context().setOffline(false);
  });
});
