import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen } from "@testing-library/react";
import { SURFACES, parseHash, findSurface } from "../route";
import { renderView } from "../views";

// cto-analytics T-21 (FR-01, design §2 Pin-4 / Resolves: C-01).
//
// T-21 owns three things: the five-stop `--accent-*` mono-ramp in
// tokens.css, the `systems` analytics tab registration in route.ts, and
// the VIEWS dispatcher seam in views/index.tsx. This test asserts all
// three so AC-01's corrected recipe has a token home to assert against
// (the full cluster-fill assertion lands in T-07's
// analytics-system-map.test.tsx once Systems.tsx exists).

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS = join(HERE, "../styles/companygraph/tokens.css");

const RAMP_STOPS = [
  "--accent-100",
  "--accent-300",
  "--accent-500",
  "--accent-700",
  "--accent-900",
] as const;

describe("cto-analytics T-21 — accent ramp tokens", () => {
  const css = readFileSync(TOKENS_CSS, "utf8");

  test.each(RAMP_STOPS)("tokens.css defines %s as an oklch value", (stop) => {
    // Each ramp stop is a custom property `  --accent-NNN: oklch(...)`.
    const re = new RegExp(`${stop}\\s*:\\s*oklch\\([^)]+\\)`);
    expect(css).toMatch(re);
  });

  test("the mid stop --accent-500 equals the base --accent", () => {
    const base = css.match(/--accent:\s*(oklch\([^)]+\))/)?.[1];
    const mid = css.match(/--accent-500:\s*(oklch\([^)]+\))/)?.[1];
    expect(base).toBeTruthy();
    expect(mid).toBe(base);
  });

  test("all five stops are present exactly once", () => {
    for (const stop of RAMP_STOPS) {
      const count = css.split(`${stop}:`).length - 1;
      expect(count).toBe(1);
    }
  });
});

describe("cto-analytics T-21 — systems tab registration", () => {
  test("route.ts registers the `systems` tab on the analytics surface (RD-3 name)", () => {
    const analytics = findSurface("analytics");
    expect(analytics).toBeTruthy();
    const tabIds = analytics!.tabs.map((t) => t.id);
    expect(tabIds).toContain("systems");
  });

  test("#/analytics/systems resolves to the systems tab, not a fallback", () => {
    const route = parseHash("#/analytics/systems");
    expect(route.surface).toBe("analytics");
    expect(route.tab).toBe("systems");
  });

  test("renderView(#/analytics/systems) is not the NotFound panel", () => {
    render(<>{renderView(parseHash("#/analytics/systems"))}</>);
    // The T-21 pending seam renders a "System map" header via ViewHeader;
    // the NotFoundPanel would render a "Back to Domains" link instead.
    expect(screen.queryByText(/Back to Domains/i)).toBeNull();
    expect(screen.getByTestId("view-header-title")).toHaveTextContent(/System map/i);
  });

  test("the systems tab keeps its position ahead of matrix in the analytics surface", () => {
    const analytics = SURFACES.find((s) => s.id === "analytics")!;
    const ids = analytics.tabs.map((t) => t.id);
    expect(ids.indexOf("systems")).toBeLessThan(ids.indexOf("matrix"));
  });
});
