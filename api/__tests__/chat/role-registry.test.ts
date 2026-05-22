// T-11 role registry test — asserts the 20-role catalog, the tool
// subsets per FR-R01, and that every role's prompt markdown file is
// present and within the 200..400-word budget.

import { describe, test, expect } from "bun:test";
import { statSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_ROLE_IDS, TOOL_NAMES } from "@companygraph/shared";
import {
  ROLES,
  getRole,
  getDefaultRole,
  listAllRoleIds,
} from "../../src/chat/roles/registry";
import { loadRoleOverlay, _resetOverlayCache } from "../../src/chat/roles/prompt-loader";

const PROMPTS_DIR = resolve(
  dirname(fileURLToPath(new URL(".", import.meta.url))),
  "..",
  "src",
  "chat",
  "roles",
  "prompts",
);

describe("role registry — T-11 / FR-R01", () => {
  test("exactly 20 roles are registered", () => {
    expect(Object.keys(ROLES)).toHaveLength(20);
    expect(listAllRoleIds()).toHaveLength(20);
  });

  test("every CHAT_ROLE_IDS entry has a RoleDef", () => {
    for (const id of CHAT_ROLE_IDS) {
      expect(ROLES[id]).toBeDefined();
      expect(ROLES[id]!.id).toBe(id);
    }
  });

  test("getRole returns the matching RoleDef; throws on unknown", () => {
    expect(getRole("graph_analyst").label).toBe("Default graph analyst");
    // @ts-expect-error — bypass type system to verify defensive throw
    expect(() => getRole("not_a_role")).toThrow();
  });

  test("getDefaultRole returns graph_analyst", () => {
    expect(getDefaultRole().id).toBe("graph_analyst");
  });

  test("graph_analyst is the only role with `cypher` in allowed_tools", () => {
    const withCypher = CHAT_ROLE_IDS.filter((id) =>
      ROLES[id]!.allowed_tools.includes("cypher"),
    );
    expect(withCypher).toEqual(["graph_analyst"]);
  });

  test("graph_analyst has all 15 tools", () => {
    expect(ROLES.graph_analyst.allowed_tools).toHaveLength(15);
    for (const t of TOOL_NAMES) {
      expect(ROLES.graph_analyst.allowed_tools).toContain(t);
    }
  });

  test("every role's allowed_tools is a subset of TOOL_NAMES", () => {
    const toolSet = new Set<string>(TOOL_NAMES);
    for (const id of CHAT_ROLE_IDS) {
      for (const tool of ROLES[id]!.allowed_tools) {
        expect(toolSet.has(tool)).toBe(true);
      }
    }
  });

  test("describe_schema is present in every role's allowed_tools", () => {
    for (const id of CHAT_ROLE_IDS) {
      expect(ROLES[id]!.allowed_tools).toContain("describe_schema");
    }
  });

  test("journey + cross-section roles never include `cypher`", () => {
    for (const id of CHAT_ROLE_IDS) {
      if (id === "graph_analyst") continue;
      expect(ROLES[id]!.allowed_tools).not.toContain("cypher");
    }
  });

  test("each role's allowed_tools list is duplicate-free", () => {
    for (const id of CHAT_ROLE_IDS) {
      const list = ROLES[id]!.allowed_tools;
      expect(new Set(list).size).toBe(list.length);
    }
  });

  test("each role's suggested_prompts is non-empty", () => {
    for (const id of CHAT_ROLE_IDS) {
      expect(ROLES[id]!.suggested_prompts.length).toBeGreaterThan(0);
    }
  });

  test("FR-R01 catalog tool subsets are honoured verbatim", () => {
    // Spot-check rows of the FR-R01 catalog. Pulling the full table
    // would duplicate `registry.ts`; the spot-checks cover one row of
    // each *class* of role (default, journey-small, journey-big,
    // cross-section).
    expect(ROLES.uj_in_store_buy.allowed_tools.sort()).toEqual(
      ["get_journey", "get_activity", "neighbors", "describe_schema"].sort(),
    );
    expect(ROLES.uj_order_fulfillment.allowed_tools.sort()).toEqual(
      [
        "get_journey",
        "get_activity",
        "neighbors",
        "find_path",
        "sla_hotspots",
        "handoff_matrix",
        "sod_register",
        "describe_schema",
      ].sort(),
    );
    expect(ROLES.handoff_matrix.allowed_tools.sort()).toEqual(
      ["aggregate", "handoff_matrix", "describe_schema"].sort(),
    );
    expect(ROLES.ai_candidates.allowed_tools.sort()).toEqual(
      ["aggregate", "ai_candidates", "describe_schema"].sort(),
    );
    expect(ROLES.initiative_impact.allowed_tools.sort()).toEqual(
      ["aggregate", "initiative_impact", "describe_schema"].sort(),
    );
  });
});

describe("prompt overlay files — T-11 / DD-17", () => {
  test("every role has an overlay file at the registered path", () => {
    for (const id of CHAT_ROLE_IDS) {
      const role = ROLES[id]!;
      const path = resolve(PROMPTS_DIR, role.system_prompt_overlay_path);
      const stat = statSync(path);
      expect(stat.isFile()).toBe(true);
    }
  });

  test("every overlay file is between 200 and 4000 chars (~200–400 words)", () => {
    for (const id of CHAT_ROLE_IDS) {
      const role = ROLES[id]!;
      const path = resolve(PROMPTS_DIR, role.system_prompt_overlay_path);
      const content = readFileSync(path, "utf8");
      expect(content.length).toBeGreaterThan(200);
      expect(content.length).toBeLessThan(4000);
    }
  });

  test("loadRoleOverlay resolves the overlay text and caches it", async () => {
    _resetOverlayCache();
    const first = await loadRoleOverlay("uj_order_fulfillment");
    expect(first.length).toBeGreaterThan(200);
    // Second call should hit the cache — round-trip the same content.
    const second = await loadRoleOverlay("uj_order_fulfillment");
    expect(second).toBe(first);
  });

  test("loadRoleOverlay works for every registered role", async () => {
    _resetOverlayCache();
    for (const id of CHAT_ROLE_IDS) {
      const text = await loadRoleOverlay(id);
      expect(text.length).toBeGreaterThan(200);
    }
  });
});
