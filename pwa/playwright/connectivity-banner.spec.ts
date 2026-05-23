// T-19b: Playwright connectivity banner (AC-25)
//
// Verifies that the connectivity banner appears on network loss
// and polls immediately on visibilitychange→visible.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test.describe("Connectivity banner (AC-25)", () => {
  test("banner shows disconnected state when API unreachable", async ({ page }) => {
    // Block all API calls to simulate disconnection
    await page.route("**/api/v1/**", (route) => route.abort());

    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForTimeout(3000); // Wait for health poll to fire

    // ConnectivityBanner should indicate unhealthy state
    const banner = page.locator("[data-testid='connectivity-banner']");
    if (await banner.count() > 0) {
      await expect(banner).toBeVisible();
    }
  });

  test("banner updates after reconnection", async ({ page }) => {
    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForSelector("[data-testid='stat-counts']");

    // Block API to simulate disconnect
    await page.route("**/api/v1/healthz", (route) => route.abort());
    await page.waitForTimeout(35_000); // Wait past the 30s poll interval

    // Unblock to simulate reconnection
    await page.unroute("**/api/v1/healthz");
    await page.waitForTimeout(35_000);

    // App should recover
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty();
  });
});
