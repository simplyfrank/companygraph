import { describe, test, expect } from "vitest";
import { parseHash } from "../route";

// T-19: SearchPalette hrefForHit must produce canonical routes.
// We test the route parsing side — that the hashes hrefForHit
// generates resolve to the expected surface/tab/entityId.

describe("SearchPalette canonical routes (T-19)", () => {
  test("Domain hit resolves to explorer/domains/:id", () => {
    const r = parseHash("#/explorer/domains/dom-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("domains");
    expect(r.entityId).toBe("dom-1");
  });

  test("UserJourney hit resolves to explorer/journeys/:id", () => {
    const r = parseHash("#/explorer/journeys/journey-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("journeys");
    expect(r.entityId).toBe("journey-1");
  });

  test("Activity hit resolves to explorer/activities/:id", () => {
    const r = parseHash("#/explorer/activities/act-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("activities");
    expect(r.entityId).toBe("act-1");
  });

  test("System hit resolves to explorer/systems/:id", () => {
    const r = parseHash("#/explorer/systems/sys-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("systems");
    expect(r.entityId).toBe("sys-1");
  });

  test("Role hit resolves to explorer/roles/:id", () => {
    const r = parseHash("#/explorer/roles/role-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("roles");
    expect(r.entityId).toBe("role-1");
  });

  test("Location hit resolves to explorer/locations/:id", () => {
    const r = parseHash("#/explorer/locations/loc-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("locations");
    expect(r.entityId).toBe("loc-1");
  });

  test("Product hit resolves to explorer/product-detail/:id", () => {
    const r = parseHash("#/explorer/product-detail/prod-1");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("product-detail");
    expect(r.entityId).toBe("prod-1");
  });

  test("default fallback resolves to explorer/domains", () => {
    const r = parseHash("#/explorer/domains");
    expect(r.surface).toBe("explorer");
    expect(r.tab).toBe("domains");
    expect(r.entityId).toBeUndefined();
  });
});
