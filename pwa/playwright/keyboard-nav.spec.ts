// T-19b: Playwright keyboard navigation (AC-29)
//
// Verifies Alt+digit surface navigation and "/" search focus.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test.describe("Keyboard navigation (AC-29)", () => {
  test("Alt+1 navigates to Explorer surface", async ({ page }) => {
    await page.goto(`${BASE}/#/sme/review`);
    await page.waitForTimeout(500);

    await page.keyboard.press("Alt+1");
    await page.waitForTimeout(300);

    expect(page.url()).toContain("#/explorer/");
  });

  test("Alt+4 navigates to SME surface", async ({ page }) => {
    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForTimeout(500);

    await page.keyboard.press("Alt+4");
    await page.waitForTimeout(300);

    expect(page.url()).toContain("#/sme/");
  });

  test("'/' focuses search input from non-input context", async ({ page }) => {
    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForSelector("[data-testid='stat-counts']");

    // Click on the body to ensure focus is not in an input
    await page.click("body");
    await page.keyboard.press("/");

    const searchInput = page.locator("input[placeholder*='Search']");
    await expect(searchInput).toBeFocused();
  });

  test("Escape blurs active element", async ({ page }) => {
    await page.goto(`${BASE}/#/explorer/domains`);
    await page.waitForSelector("[data-testid='stat-counts']");

    // Focus an input
    await page.keyboard.press("/");
    const searchInput = page.locator("input[placeholder*='Search']");
    await expect(searchInput).toBeFocused();

    // Escape should blur
    await page.keyboard.press("Escape");
    await expect(searchInput).not.toBeFocused();
  });
});
