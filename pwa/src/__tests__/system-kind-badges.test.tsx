// system-augmentation-model T-15 — filter-control a11y + input modes
// (AC-13 automated leg; the keyboard-only repro in macOS Safari is the
// manual leg, recorded in STATUS.md per T-17).
//
// jsdom does not emulate the browser's NATIVE Enter/Space → click
// activation for <button> elements, so the keyboard contract is asserted
// structurally: each control is a real `<button type="button">` (which
// guarantees Enter/Space activation per the HTML spec — no custom key
// handlers exist in the view) and its activation handler rewrites the
// hash.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ExplorerSystems } from "../views/explorer/Systems";
import { parseHash } from "../route";

vi.mock("../components/charts", () => ({
  HorizontalBarChartCard: () => <div data-testid="chart-stub" />,
}));

const ROWS = [
  {
    system: { id: "s-1", name: "POS", description: "Point of sale", attributes_json: '{"systemKind":"functional"}' },
    uses: 5, domains: [], integrations: 2,
  },
  {
    system: { id: "s-2", name: "AgentX", description: "Agent", attributes_json: '{"systemKind":"agentic"}' },
    uses: 3, domains: [], integrations: 0,
  },
];

const FILTER_LABELS = ["All", "Functional", "Agentic", "AI predictive"];

function filterGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Filter by system kind" });
}

describe("ExplorerSystems — filter-control a11y (AC-13)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = "#/explorer/systems";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ rows: ROWS }), { status: 200 }),
    );
  });

  test("active control exposes aria-pressed=true, inactive controls false", async () => {
    render(<ExplorerSystems route={parseHash("#/explorer/systems?kind=agentic")} />);
    await screen.findByText("AgentX");
    expect(screen.getByRole("button", { name: "Agentic" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["All", "Functional", "AI predictive"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("Tab order = DOM order: four controls, declared order, no tabindex overrides", async () => {
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    await screen.findByText("POS");
    const buttons = Array.from(filterGroup().querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(FILTER_LABELS);
    for (const b of buttons) {
      expect(b.hasAttribute("tabindex")).toBe(false); // natural DOM tab order
    }
  });

  test("controls are native <button type='button'> (native Enter/Space activation) and activation rewrites the hash", async () => {
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    await screen.findByText("POS");
    const agentic = screen.getByRole("button", { name: "Agentic" });
    expect(agentic.tagName).toBe("BUTTON");
    expect(agentic).toHaveAttribute("type", "button");

    agentic.focus();
    expect(document.activeElement).toBe(agentic);
    // The activation event native Enter/Space maps to on a focused button.
    fireEvent.click(agentic);
    expect(window.location.hash).toBe("#/explorer/systems?kind=agentic");
  });

  test("badges carry text labels (never color-only)", async () => {
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    await screen.findByText("POS");
    const table = document.querySelector("table")!;
    expect(table.textContent).toContain("Functional");
    expect(table.textContent).toContain("Agentic");
  });
});
