import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// AC-24 enforces NFR-03: no chat file imports a write-helper from
// api/src/storage/.

// Anchor to the test file's location so the grep works regardless of
// invocation cwd (repo root vs `api/`).
const CHAT_ROOT = resolve(import.meta.dir, "..", "..", "src", "chat");
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

describe("AC-24: chat code never imports write helpers", () => {
  const files = walk(CHAT_ROOT);

  for (const name of FORBIDDEN) {
    test(`no import of \`${name}\``, () => {
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        const hit = new RegExp(`\\b${name}\\b`).test(src);
        if (hit) {
          throw new Error(`${f}: forbidden symbol \`${name}\` found`);
        }
      }
    });
  }
});
