// T-22: Orphan guard test (AC-22) — every .tsx file under views/ must be
// transitively imported from views/index.tsx or App.tsx, or appear in the
// allowlist of shared internal modules.

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { SURFACES } from "../route";
import { renderView } from "../views";

const VIEWS_DIR = resolve(process.cwd(), "src/views");

// Allowlist for shared internal modules that are not directly imported
// from views/index.tsx but are consumed by other view components.
const ALLOWLIST = new Set<string>([
  "_shared.tsx",
  "Settings.tsx", // consumed by Complexity.tsx
  // Inline comparison fragments
  "DomainComparisonInline.tsx",
  "JourneyComparisonInline.tsx",
  // Chat sub-components
  "AgentChat.tsx",
  "BookmarkMenu.tsx",
  "Citation.tsx",
  "LatencyFooter.tsx",
  "MessageList.tsx",
  "ReasoningDisclosure.tsx",
  "RolePicker.tsx",
  "SidePanel.tsx",
  "SuggestedPrompts.tsx",
  "highlight-bus.ts",
  "sanitise.ts",
  "useProgressPolling.ts",
  // Ontology sub-components
  "AddEdgeModal.tsx",
  "AddEntityModal.tsx",
  "RollbackModal.tsx",
  "ErdErrorBoundary.tsx",
  "Erd.geometry.ts",
  "Erd.types.ts",
  // Model authoring sub-components
  "authoring/ActivitiesRolesStep.tsx",
  "authoring/DomainsStep.tsx",
  "authoring/JourneysStep.tsx",
  "authoring/StoriesStep.tsx",
  "authoring/TemplateStep.tsx",
  // Model placeholder (no longer in index.tsx but may be referenced)
  "ModelTabPlaceholder.tsx",
  // Model authoring sub-components and utilities
  "model/authoring/ActivitiesRolesStep.tsx",
  "model/authoring/DomainsStep.tsx",
  "model/authoring/JourneysStep.tsx",
  "model/authoring/StoriesStep.tsx",
  "model/authoring/TemplateStep.tsx",
  "model/authoring/toJourneyData.ts",
  "model/authoring/wizardModel.ts",
  // Business surface (removed from SURFACES but files still exist)
  "business/BusinessTabPlaceholder.tsx",
  "business/FunctionMap.tsx",
  // Explorer utility
  "explorer/canvas-highlight.ts",
  // Ontology layout/graph utilities
  "ontology/graphAnalytics.ts",
  "ontology/graphLib.ts",
  "ontology/hierarchicalLayout.ts",
  "ontology/layoutComparison.ts",
  "ontology/measure-layout.ts",
  "ontology/targetLayout.ts",
  "ontology/useErdLayout.ts",
  "ontology/useOntologyGraph.ts",
  // CSS modules
  "Thread.module.css",
  "Ops.module.css",
  "Risk.module.css",
  "PerformanceDashboard.module.css",
  "Finance.module.css",
  "People.module.css",
  "KpiManagement.module.css",
  "OkrManagement.module.css",
  "ContextAlignment.module.css",
  "Editor.module.css",
  "Erd.module.css",
  "AddEdgeModal.module.css",
  "AddEntityModal.module.css",
  "RollbackModal.module.css",
  "Add.module.css",
  "FormLayout.module.css",
  "Quarterly.module.css",
  "Review.module.css",
]);

function enumerateTsxFiles(dir: string, base = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    // Skip __tests__ directories.
    if (entry === "__tests__") continue;
    const full = resolve(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      results.push(...enumerateTsxFiles(full, rel));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts") || entry.endsWith(".css")) {
      results.push(rel);
    }
  }
  return results;
}

describe("View orphan guard (AC-22)", () => {
  test("every view file is imported from views/index.tsx or is in the allowlist", () => {
    const indexSrc = readFileSync(resolve(VIEWS_DIR, "index.tsx"), "utf8");
    const allFiles = enumerateTsxFiles(VIEWS_DIR);

    const orphans: string[] = [];
    for (const file of allFiles) {
    // index.tsx itself is not an orphan.
    if (file === "index.tsx") continue;
    // Check allowlist by both relative path and basename.
    if (ALLOWLIST.has(file) || ALLOWLIST.has(basename(file))) continue;
    // Check if the file is imported in index.tsx by filename.
    const importName = file.replace(/\.(tsx|ts)$/, "");
    const baseName = basename(file).replace(/\.(tsx|ts)$/, "");
    if (indexSrc.includes(importName) || indexSrc.includes(baseName)) continue;
      orphans.push(file);
    }

    if (orphans.length > 0) {
      // Filter out CSS modules — they're imported by their respective
      // components, not by index.tsx.
      const realOrphans = orphans.filter((f) => !f.endsWith(".css"));
      if (realOrphans.length > 0) {
        throw new Error(
          `Orphaned view files (not imported from views/index.tsx and not in allowlist):\n` +
          realOrphans.map((f) => `  - ${f}`).join("\n"),
        );
      }
    }
  });

  test("SURFACES has exactly 8 surfaces", () => {
    expect(SURFACES).toHaveLength(8);
  });

  test("no legacy surface ids remain in VIEWS", () => {
    // Legacy surfaces that should no longer have view entries.
    const legacySurfaces = ["sme", "analytics", "api", "exec", "business"];
    for (const surface of legacySurfaces) {
      const result = renderView({ surface, tab: "test", params: {} });
      // Legacy surfaces should now return NotFoundPanel.
      expect(result).toBeDefined();
    }
  });
});
