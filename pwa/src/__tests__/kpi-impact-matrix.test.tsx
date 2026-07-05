// kpi-impact-mapping T-14 / AC-08 — KpiImpactMatrix ready state.
//
// #/model/kpi-impact resolves to KpiImpactMatrix (not ModelTabPlaceholder);
// it reads the active model from useActiveModel() and renders the ready
// activity×KPI grid: rows with activity name + key-activity/gap indicator,
// KPI columns, and a directional-weight chip (↑ increases / ↓ decreases +
// weight) in linked cells, empty in unlinked (FR-12 ready, FR-14).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, KpiImpactMatrix } from "../api";

const MODEL: ModelRead = {
  id: "0197c000-0000-7000-8000-0000000000a1",
  name: "Retail Reference",
  description: "",
  ordinal: 1,
  status: "active",
  isReference: true,
  moduleInstanceCount: 0,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

// a1 is a KEY activity WITH a directional link (no gap); a2 is a non-key
// activity with no link (empty cell). linkedCellCount>0 → ready state.
const MATRIX: KpiImpactMatrix = {
  rows: [
    { id: "a1", name: "Browse catalog", journeyName: "Shop", isKeyActivity: true, storyLinkCount: 0 },
    { id: "a2", name: "Checkout", journeyName: "Shop", isKeyActivity: false, storyLinkCount: 0 },
  ],
  columns: [{ id: "k1", name: "Conversion Rate", unit: "%", targetDirection: "higher_is_better" }],
  cells: [[{ direction: "increases", weight: 0.8 }], [null]],
  gaps: [],
  meta: { activityCount: 2, kpiCount: 1, linkedCellCount: 1, keyActivityCount: 1, gapCount: 0 },
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mount() {
  const route = parseHash("#/model/kpi-impact");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("KpiImpactMatrix ready state (T-14, AC-08)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/kpi-impact";
  });

  test("resolves to KpiImpactMatrix and renders the activity×KPI grid (AC-08)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      if (url === `/api/v1/models/${MODEL.id}/kpi-impact/matrix`) return jsonRes(MATRIX);
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();

    // Not the placeholder — the real matrix view region + ready grid render.
    expect(screen.getByTestId("kpi-impact-matrix")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("grid", { name: /impact matrix/i })).toBeInTheDocument());

    // Rows + KPI column header.
    expect(screen.getByText("Browse catalog")).toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(screen.getByText("Conversion Rate")).toBeInTheDocument();

    // Key-activity indicator on the key row.
    expect(screen.getByLabelText("Key activity")).toBeInTheDocument();

    // Directional-weight chip in the linked cell: ↑ (increases) + weight.
    const chip = screen.getByText(/↑/);
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toContain("0.80");
  });
});
