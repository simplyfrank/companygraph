import { describe, test, expect } from "vitest";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

// T-22: Orphan guard — deleted view files must not be referenced.
const explorerViewsDir = join(__dirname, "..", "views", "explorer");
const orphanedFiles = [
  "DomainDetailSlide.tsx",
  "DomainDetailSlide.module.css",
  "JourneyDetailSlide.tsx",
  "JourneyDetailSlide.module.css",
];

describe("orphan guard (T-22)", () => {
  test("orphaned view files are deleted", () => {
    for (const file of orphanedFiles) {
      const path = join(explorerViewsDir, file);
      expect(existsSync(path)).toBe(false);
    }
  });

  test("explorer directory still has expected views", () => {
    const files = readdirSync(explorerViewsDir);
    expect(files).toContain("Domains.tsx");
    expect(files).toContain("DomainDetail.tsx");
    expect(files).toContain("Journey.tsx");
    expect(files).toContain("ProductDetail.tsx");
  });
});
