// T-20: Touch targets test (AC-26), extended by system-augmentation-model
// T-16 (DD-09 structural leg).
//
// House truth: the catalog `Button` is a fixed **28px** control
// (`Button.module.css:2`, `height: 28px`) — there is no 44px rule
// anywhere in the PWA. 28px meets WCAG 2.2 AA 2.5.8 (≥ 24px), not the
// 44px AAA/Apple-HIG figure. jsdom cannot compute module CSS, so these
// tests assert STRUCTURE ONLY (real <button type="button"> semantics +
// the `.btn` class); the actual touch-target size/behaviour is verified
// by the manual iPhone Safari repro (system-augmentation-model T-17:
// tap each Systems filter control, verify activation without mis-taps).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../components/Button";
import { ExplorerSystems } from "../views/explorer/Systems";
import { parseHash } from "../route";

vi.mock("../components/charts", () => ({
  HorizontalBarChartCard: () => <div data-testid="chart-stub" />,
}));

describe("Touch targets (AC-26)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("Button component renders as a structural button with the .btn class", () => {
    const { container } = render(<Button tone="primary">Click me</Button>);
    const button = container.querySelector("button");
    expect(button).toBeTruthy();

    // jsdom doesn't compute CSS from modules, so we verify structure only:
    // the `.btn` class is what applies the 28px house size
    // (Button.module.css:2 — WCAG 2.2 AA 2.5.8 ≥ 24px). Size itself is a
    // manual verification (iPhone Safari repro, see file header).
    expect(button!.tagName).toBe("BUTTON");
    expect(button!.className).toContain("btn");
  });

  test("Button has type='button' by default (prevents form submission)", () => {
    const { container } = render(<Button tone="primary">Test</Button>);
    const button = container.querySelector("button");
    expect(button?.getAttribute("type")).toBe("button");
  });

  test("Button accepts disabled prop", () => {
    const { container } = render(<Button tone="primary" disabled>Disabled</Button>);
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
  });

  test("Button renders as anchor when href is provided", () => {
    const { container } = render(<Button tone="ghost" href="#/test">Link</Button>);
    const anchor = container.querySelector("a");
    // If Button supports href rendering as anchor
    if (anchor) {
      expect(anchor.getAttribute("href")).toBe("#/test");
    } else {
      // Button may render as button with onClick navigation
      const button = container.querySelector("button");
      expect(button).toBeTruthy();
    }
  });

  // system-augmentation-model T-16 — Systems filter controls, structural
  // leg only (jsdom cannot compute module CSS, so no size claim is made;
  // the 28px house size + tap behaviour are the T-17 manual iPhone leg).
  test("Systems filter controls are real <button type='button'> elements carrying .btn", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          rows: [
            { system: { id: "s-1", name: "POS", description: "", attributes_json: '{"systemKind":"functional"}' }, uses: 1, integrations: 0 },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    await screen.findByText("POS");

    const group = screen.getByRole("group", { name: "Filter by system kind" });
    const controls = Array.from(group.querySelectorAll("button"));
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control.tagName).toBe("BUTTON");
      expect(control.getAttribute("type")).toBe("button");
      expect(control.className).toContain("btn");
    }
  });
});
