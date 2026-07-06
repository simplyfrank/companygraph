import { describe, test, expect } from "vitest";
import { listConversations, listMessages } from "../chat/persistence";

// T-21: Chat conversation API persistence functions exist and are callable.
// These are smoke tests — full integration tests require a DB fixture.

describe("chat conversation persistence (T-21)", () => {
  test("listConversations is a function", () => {
    expect(typeof listConversations).toBe("function");
  });

  test("listMessages is a function", () => {
    expect(typeof listMessages).toBe("function");
  });
});
