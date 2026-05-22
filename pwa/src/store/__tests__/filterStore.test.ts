import { describe, test, expect, beforeEach } from "vitest";
import { useFilterStore } from "../filterStore";

describe("filterStore", () => {
  beforeEach(() => {
    useFilterStore.setState({ system: null, role: null, location: null });
  });

  test("setFilter writes the slice", () => {
    useFilterStore.getState().setFilter("system", "sys-1");
    expect(useFilterStore.getState().system).toBe("sys-1");
  });

  test("clearFilter wipes one key", () => {
    useFilterStore.getState().setFilter("system", "sys-1");
    useFilterStore.getState().setFilter("role", "r-1");
    useFilterStore.getState().clearFilter("system");
    expect(useFilterStore.getState().system).toBeNull();
    expect(useFilterStore.getState().role).toBe("r-1");
  });

  test("clearAll wipes every key", () => {
    useFilterStore.getState().setFilter("system", "sys-1");
    useFilterStore.getState().setFilter("role", "r-1");
    useFilterStore.getState().setFilter("location", "l-1");
    useFilterStore.getState().clearAll();
    const s = useFilterStore.getState();
    expect(s.system).toBeNull();
    expect(s.role).toBeNull();
    expect(s.location).toBeNull();
  });

  test("toQueryString serializes only set keys", () => {
    useFilterStore.getState().setFilter("system", "sys-1");
    useFilterStore.getState().setFilter("location", "loc-1");
    const qs = useFilterStore.getState().toQueryString();
    expect(qs).toContain("system=sys-1");
    expect(qs).toContain("location=loc-1");
    expect(qs).not.toContain("role=");
  });

  test("fromQueryString round-trips against toQueryString", () => {
    useFilterStore.getState().setFilter("system", "sys-X");
    useFilterStore.getState().setFilter("role", "role-Y");
    const qs = useFilterStore.getState().toQueryString();
    useFilterStore.getState().clearAll();
    useFilterStore.getState().fromQueryString(qs);
    const s = useFilterStore.getState();
    expect(s.system).toBe("sys-X");
    expect(s.role).toBe("role-Y");
    expect(s.location).toBeNull();
  });

  test("setFilter to empty-string clears (treated as null)", () => {
    useFilterStore.getState().setFilter("system", "sys-1");
    useFilterStore.getState().setFilter("system", "");
    expect(useFilterStore.getState().system).toBeNull();
  });
});
