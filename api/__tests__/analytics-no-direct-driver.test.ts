import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// AC-11 enforces NFR-02 (RD-1): all analytics graph reads go through the
// shared read-only Neo4j module (`api/src/neo4j/read-only-*.ts`). No module
// under `api/src/analytics/` calls `getDriver()` or `driver.session()`
// directly — reads import `fetchGraph`/`runReadOnlyGraph` from
// `api/src/neo4j/read-only-graph.ts` (or a module that does).
//
// Modeled on `api/__tests__/chat/no-direct-driver.test.ts` (the AC-23 sibling
// guard for chat). Anchored to the test file's location so the grep works
// regardless of whether `bun test` runs from the repo root or from `api/`.

const ANALYTICS_ROOT = resolve(import.meta.dir, "..", "src", "analytics");

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

// Strip comments so a `getDriver()`/`driver.session()` mention in a doc block
// or line comment (e.g. the RD-1 rule recorded in `routes.ts`'s header) never
// trips the grep — only real calls in code should fail this guard.
function stripComments(src: string): string {
  // Block comments first (`/* ... */`, incl. JSDoc), then line comments.
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

describe("AC-11: no direct Neo4j driver use inside api/src/analytics/", () => {
  const files = walk(ANALYTICS_ROOT);

  test("scans at least one .ts file under api/src/analytics/", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("no `getDriver(` call in any analytics module", () => {
    for (const f of files) {
      const src = stripComments(readFileSync(f, "utf8"));
      if (/\bgetDriver\s*\(/.test(src)) {
        throw new Error(`${f}: forbidden direct-driver call \`getDriver(\` — read via api/src/neo4j/read-only-graph.ts`);
      }
    }
  });

  test("no `driver.session(` call in any analytics module", () => {
    for (const f of files) {
      const src = stripComments(readFileSync(f, "utf8"));
      if (/\bdriver\s*\.\s*session\s*\(/.test(src)) {
        throw new Error(`${f}: forbidden direct-driver call \`driver.session(\` — read via api/src/neo4j/read-only-graph.ts`);
      }
    }
  });

  test("no runtime import from 'neo4j-driver' in analytics/ (type-only imports allowed)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Allow `import type { Driver } from "neo4j-driver"` (erased at runtime);
      // block value imports that would let a module reach the raw driver.
      const runtimeImport = /^\s*import\s+(?!type\b)[^;]*from\s+["'](?:[^"']*\/)?neo4j-driver["']/m;
      const m = src.match(runtimeImport);
      if (m) {
        throw new Error(`${f}: forbidden runtime import \`${m[0].trim()}\` from neo4j-driver`);
      }
    }
  });

  test("at least one analytics file reads via the shared read-only module", () => {
    const found = files.some((f) => {
      const src = readFileSync(f, "utf8");
      return (
        /from\s+["']\.\.\/neo4j\/read-only-graph["']/.test(src) &&
        /\b(fetchGraph|runReadOnlyGraph)\b/.test(src)
      );
    });
    expect(found).toBe(true);
  });
});
