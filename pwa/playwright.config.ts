import { defineConfig, devices } from "@playwright/test";

// Playwright config — covers the four-platform matrix from
// requirements.md §Platforms (iPhone Safari, iPad Safari,
// macOS Safari, macOS Chrome). Specs live under pwa/playwright/.

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  webServer: {
    command: "bun run preview",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },

  projects: [
    {
      name: "macos-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "macos-safari",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "ipad-safari",
      use: { ...devices["iPad Pro 11"] },
    },
    {
      name: "iphone-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
