// T-21 — AC-15 grep test (NFR-02 boundary).
//
// The contract: the runtime SOURCE OF TRUTH for the registry is the
// `_OntologyNodeLabel` + `_OntologyEdgeType` tables. The compile-time
// `NODE_LABELS` / `EDGE_TYPES` const tuples (in
// `@companygraph/shared/schema/{nodes,edges}.ts`) remain as TypeScript
// narrowing primitives, but NO runtime code path may iterate them as
// the source of truth — registry reads MUST go through `getSchema()` /
// `getEdgeEndpoints()` / `getAttributeValidator()` from the ontology
// cache layer.
//
// Pragmatic enforcement (per design §7.1 + pass-1 C-04):
//   - `api/src/ontology/seed.ts` is the SOLE legal RUNTIME consumer of
//     the const tuples (it iterates them to seed the registry on first
//     boot — that's the spec's defined exception).
//   - Other files may IMPORT the const tuples for TypeScript narrowing
//     (e.g. `graph-core/api/src/routes/_helpers.ts` uses `NODE_LABELS`
//     as a runtime guard against URL `:label` injection, which is a
//     graph-core-internal concern, NOT an ontology-runtime read).
//
// The test allowlists the current legitimate importers + flags any
// NEW importer outside the allowlist. Adding a const-tuple import in a
// new file requires updating this allowlist + the design doc; that's
// the friction the test deliberately creates.

import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dir, "..", "src");

// Files that legitimately import NODE_LABELS or EDGE_TYPES for runtime
// or type narrowing. Each entry includes a one-line justification.
//
// **The one file that uses them as runtime data is `seed.ts`.** Every
// other entry imports them for compile-time narrowing only — the
// runtime path goes through the registry / cache layer.
const ALLOWLIST: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: "ontology/seed.ts",
    reason:
      "T-08 seed loader — THE designated runtime consumer of the const tuples (boots the registry on first run).",
  },
  {
    path: "ontology/cache/schema.ts",
    reason:
      "Schema cache type imports — uses NodeLabel / EdgeType types for the response shape, NOT the runtime const tuples.",
  },
  {
    path: "neo4j/bootstrap.ts",
    reason:
      "Post-T-09a refactor — no longer imports the tuples directly; comment references only.",
  },
  {
    path: "routes/_helpers.ts",
    reason:
      "graph-core's `parseLabel` URL guard — uses NODE_LABELS at runtime BUT for graph-core's own routes (`/api/v1/nodes/:label`), not for ontology-manager runtime authority. Acknowledged exception.",
  },
  {
    path: "routes/import.ts",
    reason:
      "graph-core's `nodeWithLabelSchema = nodeCreateSchema.and(z.object({ label: z.enum(NODE_LABELS) }))` — zod enum narrowing at request-validation time, not runtime registry authority.",
  },
  {
    path: "routes/export.ts",
    reason:
      "graph-core's NDJSON + JSON export — iterates the const tuples to build the response keyset for /api/v1/stats parity. Acknowledged.",
  },
  {
    path: "routes/openapi.ts",
    reason:
      "OpenAPI registry binding — uses NODE_LABELS / EDGE_TYPES as zod enum narrowing for the published shapes (FR-16).",
  },
  {
    path: "storage/edges.ts",
    reason:
      "T-14 refactored — no longer imports EDGE_ENDPOINTS; still imports EDGE_TYPES for the cross-type id-collision check (lives at storage layer, not a registry read).",
  },
  {
    path: "chat/schema-context.ts",
    reason:
      "chat-interface rev 3 schema-context provider — falls back to NODE_LABELS / EDGE_TYPES if `getSchema()` is unavailable (documented degradation path).",
  },
  {
    path: "chat/tools/list-nodes-by-label.ts",
    reason:
      "chat-interface rev 3 tool — uses NODE_LABELS for input zod enum (tool-arg validation, not runtime registry read).",
  },
  {
    path: "chat/tools/aggregate-patterns.ts",
    reason:
      "chat-interface rev 3 tool — same pattern as list-nodes-by-label.",
  },
  {
    path: "chat/tools/neighbors.ts",
    reason:
      "chat-interface rev 3 tool — uses EDGE_TYPES for input zod enum.",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const IMPORT_RE =
  /import\s*(?:type\s+)?\{[^}]*\b(NODE_LABELS|EDGE_TYPES)\b[^}]*\}\s*from\s*["']@companygraph\/shared/;

describe("T-21 — AC-15 NFR-02 boundary (const-tuple imports)", () => {
  test("only allowlisted files import NODE_LABELS / EDGE_TYPES", () => {
    const allowlistPaths = new Set(ALLOWLIST.map((e) => e.path));
    const files = walk(API_SRC);
    const offending: Array<{ file: string; line: string }> = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (!IMPORT_RE.test(content)) continue;
      // Convert absolute path → "ontology/seed.ts" style key.
      const relPath = file.slice(API_SRC.length + 1);
      if (allowlistPaths.has(relPath)) continue;
      // Extract the offending import line for diagnostics.
      const offendingLine =
        content.split("\n").find((l) => IMPORT_RE.test(l)) ?? "<???>";
      offending.push({ file: relPath, line: offendingLine.trim() });
    }

    if (offending.length > 0) {
      // Surface ALL violations in one assertion failure so the fix is
      // visible at a glance.
      const msg = offending
        .map((o) => `  ${o.file}\n    ${o.line}`)
        .join("\n");
      throw new Error(
        `T-21 — files importing NODE_LABELS / EDGE_TYPES outside the allowlist:\n${msg}\n` +
          `\nIf one of these is legitimate, add it to ALLOWLIST in ${import.meta.url}.`,
      );
    }
    expect(offending).toEqual([]);
  });

  test("every allowlist entry actually exists", () => {
    // Catches stale allowlist entries (file deleted but still allowlisted).
    const missing: string[] = [];
    for (const entry of ALLOWLIST) {
      try {
        statSync(join(API_SRC, entry.path));
      } catch {
        missing.push(entry.path);
      }
    }
    expect(missing).toEqual([]);
  });

  test("seed.ts is in the allowlist (sanity check)", () => {
    expect(ALLOWLIST.some((e) => e.path === "ontology/seed.ts")).toBe(true);
  });
});
