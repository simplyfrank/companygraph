import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// AC-23 enforces NFR-04: all chat-issued Cypher routes through
// `runPassthrough` from `api/src/neo4j/read-only-session.ts:25`. No direct
// driver use; no `executeRead`/`executeWrite` from chat code.

// Anchor to the test file's location so the grep works regardless of
// whether `bun test` is invoked from the repo root or from `api/`.
const CHAT_ROOT = resolve(import.meta.dir, "..", "..", "src", "chat");

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

describe("AC-23: read-only routing gate — chat code only goes through runPassthrough", () => {
  const files = walk(CHAT_ROOT);

  test(`scans every .ts file under ${CHAT_ROOT} (${"<count printed at runtime>"})`, () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("no runtime import from 'neo4j-driver' in chat/ (type-only imports allowed)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Match `import { ... } from "neo4j-driver"` and `import "neo4j-driver"`
      // but allow `import type { ... } from "neo4j-driver"` (TS erases types — no runtime coupling).
      const runtimeImport = /^\s*import\s+(?!type\b)[^;]*from\s+["'](?:[^"']*\/)?neo4j-driver["']/m;
      const m = src.match(runtimeImport);
      if (m) {
        throw new Error(`${f}: forbidden runtime import \`${m[0].trim()}\``);
      }
    }
  });

  test("no named import of `driver`/`executeRead`/`executeWrite` in chat/", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Block bare driver imports; allow `getDriver`, `Driver` (type), etc.
      const lines = src.split("\n");
      for (const line of lines) {
        if (line.startsWith("//")) continue;
        const importMatch = line.match(/^\s*import\s+\{([^}]+)\}\s+from/);
        if (!importMatch) continue;
        const imported = importMatch[1]!.split(",").map(s => s.trim());
        for (const name of imported) {
          // strip "as alias"
          const base = name.split(/\s+as\s+/)[0]!.trim();
          // Permitted: getDriver (function), type Driver
          if (base === "driver" || base === "executeRead" || base === "executeWrite") {
            throw new Error(`${f}: forbidden import \`${base}\``);
          }
        }
      }
    }
  });

  test("at least one chat file imports `runPassthrough` from `../../neo4j/read-only-session`", () => {
    const found = files.some(f => {
      const src = readFileSync(f, "utf8");
      return /from\s+["']\.\.\/\.\.\/neo4j\/read-only-session["']/.test(src) &&
             /\brunPassthrough\b/.test(src);
    });
    expect(found).toBe(true);
  });
});
