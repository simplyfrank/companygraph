// Playwright E2E test for Journey Detail view
// Tests the complete user journey for viewing and interacting with journey details

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Journey Detail E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should load journey detail page', async ({ page }) => {
    // Navigate to a specific journey
    await page.goto(`${BASE_URL}/journey/journey-1`);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that journey name is displayed
    const journeyName = page.locator('[data-testid="journey-name"]');
    await expect(journeyName).toBeVisible();
    
    // Check that journey canvas is rendered
    const canvas = page.locator('[data-testid="journey-canvas"]');
    await expect(canvas).toBeVisible();
  });

  test('should display journey badges', async ({ page }) => {
    await page.goto(`${BASE_URL}/journey/journey-1`);
    await page.waitForLoadState('networkidle');
    
    // Check for SLA breach badge
    const slaBadge = page.locator('[data-testid="sla-badge"]');
    await expect(slaBadge).toBeVisible();
    
    // Check for handoff complexity badge
    const handoffBadge = page.locator('[data-testid="handoff-badge"]');
    await expect(handoffBadge).toBeVisible();
  });

  test('should allow navigation between journeys', async ({ page }) => {
    await page.goto(`${BASE_URL}/journey/journey-1`);
    await page.waitForLoadState('networkidle');
    
    // Click on journey list
    await page.click('[data-testid="journey-list-toggle"]');
    
    // Select another journey
    await page.click('[data-testid="journey-item-journey-2"]');
    
    // Verify navigation
    await expect(page).toHaveURL(/journey-2/);
  });

  test('should display compliance status', async ({ page }) => {
    await page.goto(`${BASE_URL}/journey/journey-1`);
    await page.waitForLoadState('networkidle');
    
    // Check for compliance section
    const complianceSection = page.locator('[data-testid="compliance-section"]');
    await expect(complianceSection).toBeVisible();
    
    // Check for compliance score
    const complianceScore = page.locator('[data-testid="compliance-score"]');
    await expect(complianceScore).toBeVisible();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/v1/journeys/journey-1', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });
    
    await page.goto(`${BASE_URL}/journey/journey-1`);
    await page.waitForLoadState('networkidle');
    
    // Check for error message
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
  });
});
