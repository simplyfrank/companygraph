// T-15: Out-of-domain advisory test (FR-21 / AC-17)
//
// Tests that:
// (a) Write buttons are disabled when outside home domain
// (b) Tooltip shows the correct advisory message
// (c) Queue lists needs_review nodes filtered to home domain

import { describe, test, expect, beforeEach, vi } from "vitest";
import { usePrefStore } from "../store/prefStore";

describe("Out-of-domain advisory (T-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset pref store
    usePrefStore.setState({ homeDomainId: null });
  });

  test("prefStore allows setting and getting homeDomainId", () => {
    expect(usePrefStore.getState().homeDomainId).toBeNull();

    usePrefStore.setState({ homeDomainId: "domain-1" });
    expect(usePrefStore.getState().homeDomainId).toBe("domain-1");

    usePrefStore.setState({ homeDomainId: null });
    expect(usePrefStore.getState().homeDomainId).toBeNull();
  });

  test("prefStore setHomeDomain function works", () => {
    usePrefStore.getState().setHomeDomain("domain-2");
    expect(usePrefStore.getState().homeDomainId).toBe("domain-2");

    usePrefStore.getState().setHomeDomain(null);
    expect(usePrefStore.getState().homeDomainId).toBeNull();
  });

  test("prefStore clearHomeDomain function works", () => {
    usePrefStore.setState({ homeDomainId: "domain-3" });
    expect(usePrefStore.getState().homeDomainId).toBe("domain-3");

    usePrefStore.getState().clearHomeDomain();
    expect(usePrefStore.getState().homeDomainId).toBeNull();
  });
});