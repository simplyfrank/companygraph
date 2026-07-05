// kpi-impact-mapping T-15 / AC-09, AC-10, AC-11 — KpiImpactMatrix
// non-ready states: loading skeleton while GET …/matrix is pending;
// empty state (no scoped activities OR no impact links) with a message
// pointing to key-activity marking + link creation and no grid; error
// state (ErrorState + a sibling retry Button whose click refetches);
// gaps strip renders above the grid when gaps is non-empty (FR-13).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, KpiImpactMatrix } from "../api";

const MODEL: ModelRead = {
  id: "0197c000-0000-7000-8000-0000000000b2",
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

const EMPTY_MATRIX: KpiImpactMatrix = {
  rows: [],
  columns: [],
  cells: [],
  gaps: [],
  meta: { activityCount: 0, kpiCount: 0, linkedCellCount: 0, keyActivityCount: 0, gapCount: 0 },
};

// Ready matrix WITH a measurability gap (a2 is a key activity with no
// directional link) so the gaps strip renders above the grid.
const MATRIX_WITH_GAPS: KpiImpactMatrix = {
  rows: [
    { id: "a1", name: "Browse", journeyName: "Shop", isKeyActivity: true, storyLinkCount: 0 },
    { id: "a2", name: "Fulfil order", journeyName: "Shop", isKeyActivity: true, storyLinkCount: 0 },
  ],
  columns: [{ id: "k1", name: "Conversion", unit: "%", targetDirection: "higher_is_better" }],
  cells: [[{ direction: "increases", weight: 0.7 }], [null]],
  gaps: [{ activityId: "a2", activityName: "Fulfil order", journeyName: "Shop", reason: "key_activity_no_kpi" }],
  meta: { activityCount: 2, kpiCount: 1, linkedCellCount: 1, keyActivityCount: 2, gapCount: 1 },
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const matrixUrl = `/api/v1/models/${MODEL.id}/kpi-impact/matrix`;

function mount() {
  const route = parseHash("#/model/kpi-impact");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("KpiImpactMatrix states (T-15, AC-09/10/11)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/kpi-impact";
  });

  test("loading — skeleton while GET …/matrix is pending (AC-09)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      await gate; // hold the matrix fetch open
      if (url === matrixUrl) return jsonRes(EMPTY_MATRIX);
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByText(/Loading matrix/i)).toBeInTheDocument());
    release();
    await waitFor(() => expect(screen.getByText(/No activities or impact links/i)).toBeInTheDocument());
  });

  test("empty — no scoped activities OR no links → message + no grid (AC-10)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      if (url === matrixUrl) return jsonRes(EMPTY_MATRIX);
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByText(/No activities or impact links/i)).toBeInTheDocument());
    // Pointer to key-activity marking is present; no grid rendered.
    expect(screen.getByText(/Key Activities/)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  test("error — ErrorState plus a sibling retry Button that refetches (AC-11)", async () => {
    let fail = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      if (url === matrixUrl) {
        if (fail) return jsonRes({ error: { code: "neo4j_unreachable", message: "boom" } }, 500);
        return jsonRes(MATRIX_WITH_GAPS);
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
    const retry = screen.getByText("Retry");
    expect(retry).toBeInTheDocument();

    fail = false;
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument());
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });

  test("gaps strip renders above the grid when gaps is non-empty (AC-11, FR-13)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      if (url === matrixUrl) return jsonRes(MATRIX_WITH_GAPS);
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("gaps-strip")).toBeInTheDocument());
    const strip = screen.getByTestId("gaps-strip");
    const grid = screen.getByRole("grid");
    // Strip precedes the grid in DOM order (rendered above it).
    expect(strip.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Each gap carries a "link a KPI" affordance; the gapped activity is
    // named inside the strip (it also appears as a grid row header).
    expect(within(strip).getByRole("button", { name: /Link a KPI/i })).toBeInTheDocument();
    expect(within(strip).getByText("Fulfil order")).toBeInTheDocument();
  });
});
