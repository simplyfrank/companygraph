import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest config for the PWA. Mirrors vite.config.ts plugins so React
// transforms apply identically; adds jsdom env + the standard
// __tests__/**/*.test.{ts,tsx} pattern used across this spec.

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "src/**/__tests__/integration/**",  // moved to vitest.integration.config.ts
      "node_modules/**",
    ],
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
