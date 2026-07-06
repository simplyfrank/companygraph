import { describe, test, expect, beforeEach } from "vitest";
import { useTitleStore } from "../store/titleStore";
import { usePrefStore } from "../store/prefStore";

describe("titleStore (T-14 / T-17)", () => {
  beforeEach(() => {
    useTitleStore.setState({ titles: {} });
  });

  test("setTitle stores a name by entityId", () => {
    useTitleStore.getState().setTitle("domain-1", "Commerce");
    expect(useTitleStore.getState().titles["domain-1"]).toBe("Commerce");
  });

  test("clearTitle removes an entry", () => {
    useTitleStore.getState().setTitle("domain-3", "Returns");
    useTitleStore.getState().clearTitle("domain-3");
    expect(useTitleStore.getState().titles["domain-3"]).toBeUndefined();
  });

  test("setTitle overwrites previous name", () => {
    useTitleStore.getState().setTitle("domain-4", "Old Name");
    useTitleStore.getState().setTitle("domain-4", "New Name");
    expect(useTitleStore.getState().titles["domain-4"]).toBe("New Name");
  });
});

describe("prefStore lastTabs (T-16 / T-17)", () => {
  beforeEach(() => {
    usePrefStore.setState({ lastTabs: {} });
  });

  test("setLastTab stores tab per surface", () => {
    usePrefStore.getState().setLastTab("explorer", "domains");
    expect(usePrefStore.getState().getLastTab("explorer")?.tab).toBe("domains");
  });

  test("setLastTab stores entityId", () => {
    usePrefStore.getState().setLastTab("explorer", "domain-detail", "dom-1");
    expect(usePrefStore.getState().getLastTab("explorer")?.entityId).toBe("dom-1");
  });

  test("getLastTab returns undefined for unknown surface", () => {
    expect(usePrefStore.getState().getLastTab("nope")).toBeUndefined();
  });

  test("setLastTab overwrites previous entry", () => {
    usePrefStore.getState().setLastTab("chat", "thread");
    usePrefStore.getState().setLastTab("chat", "conversations");
    expect(usePrefStore.getState().getLastTab("chat")?.tab).toBe("conversations");
  });
});
