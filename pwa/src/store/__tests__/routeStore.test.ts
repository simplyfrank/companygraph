import { describe, test, expect, beforeEach } from "vitest";
import { useRouteStore } from "../routeStore";
import { DEFAULT_ROUTE } from "../../route";

describe("routeStore", () => {
  beforeEach(() => {
    window.location.hash = "";
    useRouteStore.setState({ route: DEFAULT_ROUTE });
  });

  test("navigate writes location.hash", () => {
    useRouteStore.getState().navigate({ surface: "explorer", tab: "review" });
    expect(window.location.hash).toBe("#/explorer/review");
  });

  test("navigate encodes query params", () => {
    useRouteStore
      .getState()
      .navigate({ surface: "explorer", tab: "activities" }, { system: "s-1", role: "r-2" });
    expect(window.location.hash).toContain("#/explorer/activities?");
    expect(window.location.hash).toContain("system=s-1");
    expect(window.location.hash).toContain("role=r-2");
  });

  test("hashchange listener updates store", () => {
    window.location.hash = "#/explorer/systems";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(useRouteStore.getState().route.surface).toBe("explorer");
    expect(useRouteStore.getState().route.tab).toBe("systems");
  });

  test("setFromHash parses current location.hash", () => {
    window.location.hash = "#/explorer/add";
    useRouteStore.getState().setFromHash();
    expect(useRouteStore.getState().route.surface).toBe("explorer");
    expect(useRouteStore.getState().route.tab).toBe("add");
  });
});
