// Setup directory structure for error scenario tests
import { mkdirSync } from "fs";
import { join } from "path";

const BASE_DIR = join(process.cwd(), "src/__tests__/error-scenarios");

const directories = [
  // Explorer
  "explorer/domains",
  "explorer/journey-detail",
  "explorer/journey-graph",
  "explorer/systems",
  "explorer/path-finder",
  "explorer/activities",
  "explorer/roles",
  "explorer/locations",
  // Chat
  "chat/thread",
  "chat/conversations",
  // Ontology
  "ontology/catalog",
  "ontology/erd",
  "ontology/editor",
  "ontology/edges",
  "ontology/versions",
  "ontology/audit",
  // SME
  "sme/review",
  "sme/add",
  "sme/quarterly",
  "sme/home",
  // Analytics
  "analytics/overview",
  "analytics/matrix",
  "analytics/complexity",
  "analytics/ai",
  // API
  "api/endpoints",
  "api/errors",
  "api/import",
  // Exec
  "exec/ops",
  "exec/finance",
  "exec/people",
  "exec/transform",
  "exec/risk",
  "exec/kpi-management",
  "exec/okr-management",
  // Data
  "data/map",
  "data/export",
  // Cross-cutting
  "cross-cutting/network-connectivity",
  "cross-cutting/http-error-codes",
  "cross-cutting/data-validation",
  "cross-cutting/state-management",
  "cross-cutting/ui-ux",
  // Fixtures
  "../fixtures/error-scenarios",
  "../fixtures/mock-data",
  // Utils
  "../utils",
];

function setupDirectories() {
  directories.forEach(dir => {
    const fullPath = join(BASE_DIR, dir);
    try {
      mkdirSync(fullPath, { recursive: true });
      console.log(`Created: ${fullPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error(`Failed to create ${fullPath}:`, error);
      }
    }
  });
  console.log("\nDirectory structure setup complete!");
}

setupDirectories();