import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Integration test config — assumes a live API on 127.0.0.1:8787 and a
// running Neo4j. Run via `bun run -C pwa test:integration` after
// `bun run dev` is healthy.

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/__tests__/integration/**/*.integration.test.{ts,tsx}",
    ],
    setupFiles: ["./src/__tests__/setup.ts"],
    testTimeout: 30_000,
    css: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
