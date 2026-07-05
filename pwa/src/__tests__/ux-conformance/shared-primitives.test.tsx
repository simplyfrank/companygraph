// pwa-ux-conformance T-02 — shared primitives unit tests.
// Verifies EmptyState and ViewRegion render the expected markup.

import { describe, test, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { EmptyState, ViewRegion } from "../../views/_shared";

describe("ux-conformance T-02: EmptyState", () => {
  test("renders data-testid=empty-state", () => {
    const html = renderToString(<EmptyState what="domains" />);
    expect(html).toContain('data-testid="empty-state"');
    expect(html).toMatch(/No.*domains.*found/);
  });
});

describe("ux-conformance T-02: ViewRegion", () => {
  test("renders section with role=region and aria-label", () => {
    const html = renderToString(
      <ViewRegion label="Domains">content</ViewRegion>,
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Domains"');
    expect(html).toContain("content");
  });
});
