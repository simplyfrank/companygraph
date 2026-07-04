import { test, expect } from "@playwright/test";

test("bounded context panel shows OpenAPI REST endpoints", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/#/ontology/erd");

  // Wait for bounded context zones to render
  const svg = page.locator("svg");
  await svg.waitFor({ state: "attached" });
  await page.waitForTimeout(500);

  // Click on a bounded context zone (Journey Context contains Activity / UserJourney)
  const journeyContextLabel = svg.locator("text", { hasText: "Journey Context" });
  await journeyContextLabel.waitFor({ state: "attached" });
  await journeyContextLabel.click();

  // Wait for the right-panel to show the selected context
  const panel = page.locator("aside");
  await expect(panel).toContainText("Journey Context");

  // Verify REST API section appears
  await expect(panel).toContainText("REST API");

  // Check that endpoints are listed (GET /api/v1/query/getJourney/ and similar)
  await expect(panel).toContainText("/api/v1/query/getJourney");

  // Verify method badge coloring
  const getBadge = panel.locator("span", { hasText: "GET" }).first();
  await expect(getBadge).toBeVisible();

  // Test expand/collapse of an endpoint
  const endpointSummary = panel.locator("button", { hasText: "/api/v1/query/getJourney" }).first();
  await endpointSummary.click();
  await expect(panel).toContainText("Responses");

  // Verify error state does not appear
  await expect(panel).not.toContainText("Could not load API docs");
});

test("Organisational Core context shows domain endpoints", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/#/ontology/erd");

  const svg = page.locator("svg");
  await svg.waitFor({ state: "attached" });
  await page.waitForTimeout(500);

  // Click on Organisational Core context
  const orgLabel = svg.locator("text", { hasText: "Organisational Core" });
  await orgLabel.waitFor({ state: "attached" });
  await orgLabel.click();

  const panel = page.locator("aside");
  await expect(panel).toContainText("Organisational Core");
  await expect(panel).toContainText("REST API");
  await expect(panel).toContainText("/api/v1/query/listDomains");
});
