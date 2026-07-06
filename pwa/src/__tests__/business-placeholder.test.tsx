// navigation-IA — the legacy `business` surface and `exec/operator` tab were
// removed from SURFACES. The 8-surface structure (explorer, model, chat,
// insights, govern, ontology, data, admin) replaces them, and ROUTE_ALIASES
// keeps legacy deep-links working. These tests assert the removal + alias
// behaviour that replaced the old AC-17 sibling-tab placeholders.

import { describe, test, expect } from "vitest";
import { SURFACES, parseHash, findSurface, ROUTE_ALIASES } from "@/route";

describe("navigation-IA: business surface removed + exec/operator aliased", () => {
  test("business is no longer a registered surface", () => {
    expect(findSurface("business")).toBeUndefined();
    expect(SURFACES.some((s) => s.id === "business")).toBe(false);
  });

  test("exec is no longer a registered surface", () => {
    expect(findSurface("exec")).toBeUndefined();
    expect(SURFACES.some((s) => s.id === "exec")).toBe(false);
  });

  test("ROUTE_ALIASES maps exec/ops → admin/platform", () => {
    const row = ROUTE_ALIASES.find(
      (r) => r.from.surface === "exec" && r.from.tab === "ops",
    );
    expect(row).toBeTruthy();
    expect(row!.to.surface).toBe("admin");
    expect(row!.to.tab).toBe("platform");
  });

  test("parseHash resolves #/exec/ops to admin/platform (aliased)", () => {
    const route = parseHash("#/exec/ops");
    expect(route.surface).toBe("admin");
    expect(route.tab).toBe("platform");
  });
});
