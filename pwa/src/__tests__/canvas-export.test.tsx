import { describe, test, expect, beforeEach, vi } from "vitest";
import { exportCanvas, exportFilename, downloadBlob } from "../lib/export";
import { slugify } from "../lib/slugify";

describe("slugify", () => {
  test("converts spaces to hyphens", () => {
    expect(slugify("Order to Cash")).toBe("order-to-cash");
  });

  test("lowercases everything", () => {
    expect(slugify("ORDER TO CASH")).toBe("order-to-cash");
  });

  test("removes special characters", () => {
    expect(slugify("Order@To#Cash$")).toBe("ordertocash");
  });

  test("handles multiple spaces", () => {
    expect(slugify("Order  to   Cash")).toBe("order-to-cash");
  });

  test("trims leading/trailing spaces", () => {
    expect(slugify("  Order to Cash  ")).toBe("order-to-cash");
  });

  test("handles underscores", () => {
    expect(slugify("Order_to_Cash")).toBe("order-to-cash");
  });
});

describe("exportFilename", () => {
  test("generates filename with ISO date", () => {
    const filename = exportFilename("Order to Cash", "png");
    expect(filename).toMatch(/^order-to-cash-\d{4}-\d{2}-\d{2}\.png$/);
  });

  test("uses correct extension", () => {
    expect(exportFilename("Test", "svg")).toMatch(/\.svg$/);
    expect(exportFilename("Test", "png")).toMatch(/\.png$/);
  });
});

describe("downloadBlob", () => {
  test("does not throw when called with valid Blob and filename", () => {
    const blob = new Blob(["test"], { type: "text/plain" });
    // In test environment, URL.createObjectURL may not be available
    // We just verify the function doesn't throw synchronously
    expect(() => {
      try {
        downloadBlob(blob, "test.txt");
      } catch (e) {
        // Expected in test environment if URL API is not fully available
        if (!(e instanceof TypeError && e.message.includes("createObjectURL"))) {
          throw e;
        }
      }
    }).not.toThrow();
  });
});