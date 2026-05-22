import { describe, test, expect } from "vitest";
import { parseHash, toHash, DEFAULT_ROUTE } from "../route";

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
    const r = parseHash("#/explorer/journey-detail/abc-123");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("journey-detail");
    expect(r.entityId).toBe("abc-123");
    expect(r.mode).toBeUndefined();
  });

  test("four-segment route exposes both entityId and mode", () => {
    const r = parseHash("#/explorer/journey-detail/abc/canvas");
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

  test("virtual explorer tabs (activities/roles/locations) are recognised", () => {
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
    // The clamp keeps Explorer's first visible tab.
    expect(r.tab).toBe("domains");
  });

  test("query-string only (no entityId/mode) parses params", () => {
    const r = parseHash("#/explorer/activities?system=sys-9");
    expect(r.tab).toBe("activities");
    expect(r.params).toEqual({ system: "sys-9" });
    expect(r.entityId).toBeUndefined();
  });
});

describe("toHash — round-trip (T-08)", () => {
  test("simple surface/tab", () => {
    expect(toHash({ surface: "explorer", tab: "systems" })).toBe("#/explorer/systems");
  });

  test("with entityId", () => {
    expect(
      toHash({ surface: "explorer", tab: "journey-detail", entityId: "abc-1" }),
    ).toBe("#/explorer/journey-detail/abc-1");
  });

  test("with entityId + mode", () => {
    expect(
      toHash({
        surface: "explorer",
        tab: "journey-detail",
        entityId: "abc-1",
        mode: "canvas",
      }),
    ).toBe("#/explorer/journey-detail/abc-1/canvas");
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
    const original = "#/explorer/journey-detail/abc/canvas?from=test";
    const route = parseHash(original);
    const rebuilt = toHash(
      { surface: route.surface, tab: route.tab, entityId: route.entityId, mode: route.mode },
      route.params,
    );
    expect(rebuilt).toBe(original);
  });
});
