// system-augmentation-model T-02 — vocabulary singularity guard (AC-01 / FR-01).
//
// Two legs, no Neo4j:
//   1. The shared tuple is EXACTLY ["functional", "agentic", "ai_predictive"]
//      (in that order) and the zod enum accepts/rejects accordingly.
//   2. Grep guard — the literal "ai_predictive" appears in NO production
//      source outside `shared/src/schema/system-kind.ts`. Seed/fixture
//      DATA files (`shared/seed/*.json` as a class — survives T-11's
//      enriched-fixture variety) and test/spec files are excluded.
//      Same mechanism as the house grep-guard tests
//      (requirements-review N-02 phrasing).

import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  SYSTEM_KINDS,
  systemKindSchema,
} from "@companygraph/shared/schema/system-kind";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

// Production source roots to scan (relative to repo root).
const SCAN_ROOTS = ["api/src", "pwa/src", "shared/src", "api/scripts", "scripts"];

// Extensions considered "source". JSON is included so a stray literal in
// a config can't hide — seed DATA files are excluded by path, below.
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;

// Allowed homes for the literal:
//  - the vocabulary module itself,
//  - seed/fixture data files under shared/seed/ (as a class),
//  - test/spec files.
function isExcluded(relPath: string): boolean {
  if (relPath === "shared/src/schema/system-kind.ts") return true;
  if (relPath.startsWith("shared/seed/")) return true;
  if (relPath.includes("__tests__/")) return true;
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(relPath)) return true;
  return false;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (SOURCE_EXT.test(entry)) {
      yield full;
    }
  }
}

describe("system-kind vocabulary singularity (AC-01)", () => {
  test("SYSTEM_KINDS is exactly the three literals, in order", () => {
    expect([...SYSTEM_KINDS]).toEqual(["functional", "agentic", "ai_predictive"]);
  });

  test("systemKindSchema accepts members and rejects non-members", () => {
    expect(systemKindSchema.parse("agentic")).toBe("agentic");
    expect(systemKindSchema.safeParse("predictive").success).toBe(false);
  });

  test('the literal "ai_predictive" lives ONLY in the shared vocabulary module (+ seed data + tests)', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(join(REPO_ROOT, root))) {
        const rel = relative(REPO_ROOT, file);
        if (isExcluded(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (src.includes("ai_predictive")) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
