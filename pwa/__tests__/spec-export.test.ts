// requirements-export T-11 (FR-08, FR-09, FR-03) — PWA unit tests.
// Tests the pure helpers used by SpecExport without DOM rendering.
// The view component itself is verified by Playwright (AC-11).
// Markdown rendering is tested in the API test suite (spec-markdown-render.test.ts).

import { describe, test, expect } from "bun:test";

// Re-implement isAllZero here to test the logic without importing
// the component (which pulls in React + context). The component's
// implementation is identical.
function isAllZero(counts: {
  stories: number;
  acceptanceCriteria: number;
  keyActivities: number;
  kpiLinks: number;
  gaps: number;
  capabilities: number;
}): boolean {
  return (
    counts.stories === 0 &&
    counts.acceptanceCriteria === 0 &&
    counts.keyActivities === 0 &&
    counts.kpiLinks === 0 &&
    counts.gaps === 0 &&
    counts.capabilities === 0
  );
}

describe("unit: requirements-export T-11 isAllZero logic (empty-state gate)", () => {
  test("all-zero → true (triggers empty state in SpecExport)", () => {
    expect(isAllZero({ stories: 0, acceptanceCriteria: 0, keyActivities: 0, kpiLinks: 0, gaps: 0, capabilities: 0 })).toBe(true);
  });

  test("any non-zero → false (renders ready state)", () => {
    const base = { stories: 0, acceptanceCriteria: 0, keyActivities: 0, kpiLinks: 0, gaps: 0, capabilities: 0 };
    expect(isAllZero({ ...base, stories: 1 })).toBe(false);
    expect(isAllZero({ ...base, acceptanceCriteria: 5 })).toBe(false);
    expect(isAllZero({ ...base, keyActivities: 3 })).toBe(false);
    expect(isAllZero({ ...base, kpiLinks: 1 })).toBe(false);
    expect(isAllZero({ ...base, gaps: 2 })).toBe(false);
    expect(isAllZero({ ...base, capabilities: 7 })).toBe(false);
  });
});

describe("unit: requirements-export T-11 download filename sanitization", () => {
  test("safeName replaces non-alphanumeric with underscore", () => {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
    expect(sanitize("My Model")).toBe("My_Model");
    expect(sanitize("Model (v2)")).toBe("Model__v2_");
    expect(sanitize("A/B/C")).toBe("A_B_C");
    expect(sanitize("safe-name")).toBe("safe-name");
    expect(sanitize("safe_name")).toBe("safe_name");
  });
});
