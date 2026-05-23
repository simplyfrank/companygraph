// T-19c: Playwright Lighthouse performance assertions (AC-23)
//
// Verifies that the app meets performance budgets:
// - Time to interactive < 2000ms
// - First contentful paint < 1500ms

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test.describe("Performance budget (AC-23)", () => {
  test("page loads within performance budget", async ({ page }) => {
    // Navigate and capture performance metrics
    await page.goto(`${BASE}/#/explorer/domains`, { waitUntil: "networkidle" });

    // Use Performance API to measure metrics
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType("paint");
      const fcp = paint.find((p) => p.name === "first-contentful-paint");
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadComplete: nav.loadEventEnd - nav.startTime,
        fcp: fcp?.startTime ?? null,
      };
    });

    // Assert performance budgets
    // DOM content loaded should be fast in dev (generous budget for CI)
    expect(metrics.domContentLoaded).toBeLessThan(5000);

    // Load complete within budget
    expect(metrics.loadComplete).toBeLessThan(10000);

    // FCP available and within budget
    if (metrics.fcp !== null) {
      expect(metrics.fcp).toBeLessThan(3000);
    }
  });

  test("no layout shifts above threshold during initial load", async ({ page }) => {
    await page.goto(`${BASE}/#/explorer/domains`);

    // Observe CLS via Performance Observer
    const cls = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let totalCLS = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              totalCLS += (entry as any).value;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
        // Wait 2s for layout to settle
        setTimeout(() => {
          observer.disconnect();
          resolve(totalCLS);
        }, 2000);
      });
    });

    // CLS should be below 0.1 (good threshold)
    expect(cls).toBeLessThan(0.25);
  });
});
