// navigation-IA — the legacy `business` surface was removed from SURFACES.
// The 8-surface structure (explorer, model, chat, insights, govern, ontology,
// data, admin) replaces it. These tests assert the removal so stale
// registrations don't silently reappear.

import { describe, test, expect } from "vitest";
import { SURFACES, parseHash, findSurface, ROUTE_ALIASES } from "@/route";

describe("navigation-IA: business surface removed from SURFACES", () => {
  test("business is no longer a registered surface", () => {
    expect(findSurface("business")).toBeUndefined();
    expect(SURFACES.some((s) => s.id === "business")).toBe(false);
  });

  test("SURFACES contains exactly the 8 navigation-IA surfaces in order", () => {
    expect(SURFACES.map((s) => s.id)).toEqual([
      "explorer",
      "model",
      "chat",
      "insights",
      "govern",
      "ontology",
      "data",
      "admin",
    ]);
  });

  test("business surface ships no Alt-digit accelerator (removed, OQ-2 a)", () => {
    // The business surface no longer exists, so it has no kbd accelerator.
    expect(findSurface("business")).toBeUndefined();
  });

  test("exec surface is no longer registered (folded into admin/insights/govern)", () => {
    expect(findSurface("exec")).toBeUndefined();
    expect(SURFACES.some((s) => s.id === "exec")).toBe(false);
  });

  test("parseHash falls back to DEFAULT_ROUTE for unaliased business tabs", () => {
    // No ROUTE_ALIASES row exists for business, so #/business/functions
    // resolves to the default route (explorer/domains) rather than a
    // business surface that no longer exists.
    const r = parseHash("#/business/functions");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("domains");
  });

  test("business tabs (metrics/funnels/benchmarks) are not aliased — fall back to default", () => {
    for (const tab of ["metrics", "funnels", "benchmarks"]) {
      const r = parseHash(`#/business/${tab}`);
      expect(r.surface).toBe("explorer");
      expect(r.tab).toBe("domains");
    }
  });

  test("business is not the last SURFACES entry (admin is)", () => {
    expect(SURFACES[SURFACES.length - 1]!.id).toBe("admin");
    expect(ROUTE_ALIASES.some((r) => r.from.surface === "business")).toBe(false);
  });
});
