import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// AC-12 enforces NFR-03: no write paths from analytics. No module under
// `api/src/analytics/` imports a graph-mutation helper — `createNode`,
// `upsertNode`, `createEdge`, `upsertEdge`, `patchNode`. Analytics is
// read-only over the graph (RD-1). (Cache writes to `analytics_*` SQLite
// tables, when the deferred FR-10/FR-11 land in `cto-analytics-reporting`,
// are permitted — they are not graph mutations and are not built here.)
//
// Modeled on `api/__tests__/chat/no-write-imports.test.ts` (the AC-24 sibling
// guard for chat). Grep is over `import { ... }` bindings, not bare text, so a
// prose mention in a comment never trips it.

const ANALYTICS_ROOT = resolve(import.meta.dir, "..", "src", "analytics");
const FORBIDDEN = ["createNode", "upsertNode", "createEdge", "upsertEdge", "patchNode"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

// Collect the named symbols imported by a source file across `import { a, b }`
// bindings (multi-line aware).
function importedSymbols(src: string): Set<string> {
  const names = new Set<string>();
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from/gs;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    for (const raw of m[1]!.split(",")) {
      const base = raw.trim().split(/\s+as\s+/)[0]!.trim();
      if (base) names.add(base);
    }
  }
  return names;
}

describe("AC-12: analytics code imports no graph-write helpers", () => {
  const files = walk(ANALYTICS_ROOT);

  test("scans at least one .ts file under api/src/analytics/", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of FORBIDDEN) {
    test(`no import of write helper \`${name}\``, () => {
      for (const f of files) {
        const imports = importedSymbols(readFileSync(f, "utf8"));
        if (imports.has(name)) {
          throw new Error(`${f}: forbidden write-helper import \`${name}\` — analytics is read-only (NFR-03)`);
        }
      }
    });
  }
});
