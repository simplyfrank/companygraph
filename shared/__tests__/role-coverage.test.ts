// FR-R01 role-coverage CI check. Asserts:
//   1. CHAT_ROLE_IDS has exactly 20 entries (14 journey + 5 cross-section + 1 default).
//   2. Every `uj_*` id appearing anywhere in `shared/seed/retail-mini.json`
//      maps to a CHAT_ROLE_IDS entry. If the seed grows to add new `uj_*`
//      ids, this test fails until the role catalog adds the matching role.
//
// Note: today's `retail-mini.json` uses UUID-shaped ids for UserJourney
// nodes (not `uj_*` ids), so the seed scan yields zero matches and only
// invariant (1) gates the test. This is by design — the `uj_*` ids are
// the *role* registry source of truth and downstream tools call seed
// data by UUID; the wireframes use `uj_*` as a stable handle that
// post-dates `retail-mini`. When the seed is later updated with
// `uj_*` ids (see chat-interface spec DD-21), this test catches any
// drift between seed and role catalog automatically.

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_ROLE_IDS } from "../src/types";

describe("role coverage — FR-R01", () => {
  test("exactly 20 role ids are registered", () => {
    expect(CHAT_ROLE_IDS).toHaveLength(20);
  });

  test("CHAT_ROLE_IDS includes graph_analyst + 14 journey + 5 cross-section", () => {
    expect(CHAT_ROLE_IDS).toContain("graph_analyst");

    const journey = CHAT_ROLE_IDS.filter((id) => id.startsWith("uj_"));
    expect(journey).toHaveLength(14);

    const crossSection = [
      "sla_hotspots",
      "handoff_matrix",
      "sod_register",
      "ai_candidates",
      "initiative_impact",
    ] as const;
    for (const xs of crossSection) {
      expect(CHAT_ROLE_IDS).toContain(xs);
    }
  });

  test("every uj_* id in retail-mini.json has a matching role", () => {
    const seedPath = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "..",
      "seed",
      "retail-mini.json",
    );
    const raw = readFileSync(seedPath, "utf8");
    // Scan for every `uj_*` token in the raw JSON (regardless of which
    // field it appears in — id, attribute, description, …).
    const matches = raw.match(/\buj_[a-z0-9_]+/g) ?? [];
    const ujIds = new Set(matches);

    const roleSet = new Set<string>(CHAT_ROLE_IDS);
    for (const ujId of ujIds) {
      expect(roleSet.has(ujId)).toBe(true);
    }
  });

  test("role ids are unique", () => {
    const set = new Set(CHAT_ROLE_IDS);
    expect(set.size).toBe(CHAT_ROLE_IDS.length);
  });
});
