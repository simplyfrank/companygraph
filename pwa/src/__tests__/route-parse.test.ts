import { describe, test, expect } from "vitest";
import { parseHash, toHash, DEFAULT_ROUTE, SURFACES, ROUTE_ALIASES } from "../route";

describe("parseHash — 4-segment extension (T-08)", () => {
  test("two-segment routes still parse back-compat", () => {
    const r = parseHash("#/explorer/domains");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("domains");
    expect(r.entityId).toBeUndefined();
    expect(r.mode).toBeUndefined();
    expect(r.params).toEqual({});
  });

  test("three-segment route exposes entityId", () => {
    const r = parseHash("#/explorer/journeys/abc-123");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("journeys");
    expect(r.entityId).toBe("abc-123");
    expect(r.mode).toBeUndefined();
  });

  test("four-segment route exposes both entityId and mode", () => {
    const r = parseHash("#/explorer/journeys/abc/canvas");
    expect(r.entityId).toBe("abc");
    expect(r.mode).toBe("canvas");
  });

  test("query string parses into params alongside entityId", () => {
    const r = parseHash("#/explorer/activities/act-1?system=sys-2&role=role-3");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("activities");
    expect(r.entityId).toBe("act-1");
    expect(r.params).toEqual({ system: "sys-2", role: "role-3" });
  });

  test("explorer tabs (activities/roles/locations) are recognised", () => {
    expect(parseHash("#/explorer/activities").tab).toBe("activities");
    expect(parseHash("#/explorer/roles/role-7").tab).toBe("roles");
    expect(parseHash("#/explorer/locations/loc-5").tab).toBe("locations");
  });

  test("unknown surface falls back to DEFAULT_ROUTE", () => {
    expect(parseHash("#/bogus/whatever")).toEqual(DEFAULT_ROUTE);
  });

  test("unknown tab inside a real surface clamps to first tab", () => {
    const r = parseHash("#/explorer/not-a-tab");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("domains");
  });

  test("query-string only (no entityId/mode) parses params", () => {
    const r = parseHash("#/explorer/activities?system=sys-9");
    expect(r.tab).toBe("activities");
    expect(r.params).toEqual({ system: "sys-9" });
    expect(r.entityId).toBeUndefined();
  });
});

describe("SURFACES catalogue (T-01)", () => {
  test("has exactly 8 surfaces", () => {
    expect(SURFACES).toHaveLength(8);
  });

  test("surface ids match design", () => {
    const ids = SURFACES.map((s) => s.id);
    expect(ids).toEqual([
      "explorer", "model", "chat", "insights",
      "govern", "ontology", "data", "admin",
    ]);
  });

  test("no surface has kbd property", () => {
    for (const s of SURFACES) {
      expect((s as Record<string, unknown>).kbd).toBeUndefined();
    }
  });

  test("explorer has tab groups", () => {
    const explorer = SURFACES.find((s) => s.id === "explorer");
    expect(explorer?.groups).toBeDefined();
    expect(explorer?.groups).toHaveLength(2);
  });

  test("insights has tab groups", () => {
    const insights = SURFACES.find((s) => s.id === "insights");
    expect(insights?.groups).toBeDefined();
    expect(insights?.groups).toHaveLength(3);
  });
});

describe("ROUTE_ALIASES (T-02)", () => {
  test("sme/review aliases to explorer/review", () => {
    const r = parseHash("#/sme/review");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("review");
  });

  test("sme/home aliases to admin/settings", () => {
    const r = parseHash("#/sme/home");
    expect(r.surface).toBe("admin");
    expect(r.tab).toBe("settings");
  });

  test("analytics/overview aliases to insights/overview", () => {
    const r = parseHash("#/analytics/overview");
    expect(r.surface).toBe("insights");
    expect(r.tab).toBe("overview");
  });

  test("api/endpoints aliases to data/endpoints", () => {
    const r = parseHash("#/api/endpoints");
    expect(r.surface).toBe("data");
    expect(r.tab).toBe("endpoints");
  });

  test("exec/risk aliases to govern/risk", () => {
    const r = parseHash("#/exec/risk");
    expect(r.surface).toBe("govern");
    expect(r.tab).toBe("risk");
  });

  test("exec/finance aliases to insights/finance", () => {
    const r = parseHash("#/exec/finance");
    expect(r.surface).toBe("insights");
    expect(r.tab).toBe("finance");
  });

  test("explorer/journey-detail aliases to explorer/journeys with entityId", () => {
    const r = parseHash("#/explorer/journey-detail/abc-123");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("journeys");
    expect(r.entityId).toBe("abc-123");
  });

  test("explorer/journey-graph aliases to explorer/journeys with mode=graph", () => {
    const r = parseHash("#/explorer/journey-graph/journey-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("journeys");
    expect(r.entityId).toBe("journey-1");
    expect(r.mode).toBe("graph");
  });

  test("bare analytics surface aliases to insights/overview", () => {
    const r = parseHash("#/analytics");
    expect(r.surface).toBe("insights");
    expect(r.tab).toBe("overview");
  });

  test("bare exec surface aliases to insights/finance", () => {
    const r = parseHash("#/exec");
    expect(r.surface).toBe("insights");
    expect(r.tab).toBe("finance");
  });

  test("alias table has entries", () => {
    expect(ROUTE_ALIASES.length).toBeGreaterThan(20);
  });
});

describe("toHash — round-trip (T-08)", () => {
  test("simple surface/tab", () => {
    expect(toHash({ surface: "explorer", tab: "systems" })).toBe("#/explorer/systems");
  });

  test("with entityId", () => {
    expect(
      toHash({ surface: "explorer", tab: "journeys", entityId: "abc-1" }),
    ).toBe("#/explorer/journeys/abc-1");
  });

  test("with entityId + mode", () => {
    expect(
      toHash({
        surface: "explorer",
        tab: "journeys",
        entityId: "abc-1",
        mode: "canvas",
      }),
    ).toBe("#/explorer/journeys/abc-1/canvas");
  });

  test("with entityId + params", () => {
    expect(
      toHash(
        { surface: "explorer", tab: "activities", entityId: "act-1" },
        { system: "sys-2" },
      ),
    ).toBe("#/explorer/activities/act-1?system=sys-2");
  });

  test("round-trip with parseHash preserves all parts", () => {
    const original = "#/explorer/journeys/abc/canvas?from=test";
    const route = parseHash(original);
    const rebuilt = toHash(
      { surface: route.surface, tab: route.tab, entityId: route.entityId, mode: route.mode },
      route.params,
    );
    expect(rebuilt).toBe(original);
  });
});
