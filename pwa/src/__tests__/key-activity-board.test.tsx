// key-activity-optimizer T-14 + T-20 / AC-09 — #/model/key-activities
// renders KeyActivityBoard (route VERBATIM from the blueprint View
// Tree; NOT the ModelTabPlaceholder), which reads the active model
// from useActiveModel() and renders the ranking through the EXTENDED
// catalog DataTable (Δ3, DD-11 — supersedes DD-10's in-view table):
// header buttons live inside th[aria-sort]; activating one re-orders
// rows client-side (sort state + comparators stay in the view) and
// flips its aria-sort — with NO re-fetch; the default order is
// composite desc (the server rank order).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, ActivityScoreRow, KeyActivityScores } from "../api";

const MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000a1",
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

function scoreRow(over: Partial<ActivityScoreRow> & { id: string; name: string }): ActivityScoreRow {
  return {
    journeyId: "0197a000-0000-7000-8000-0000000000j1",
    journeyName: "Checkout",
    rank: 1,
    composite: 0,
    scores: { centrality: 0, criticalPath: 0, handoff: 0 },
    evidence: {
      centrality: { betweenness: 0, inDegree: 0, outDegree: 0 },
      criticalPath: { onCriticalPath: false, longestChainDepth: 1, criticalPathLength: 3 },
      handoff: { handoffCount: 0, roleHandoffs: 0, systemHandoffs: 0 },
    },
    key: null,
    ...over,
  };
}

// composite order: top > second — but CENTRALITY order is reversed, so
// sorting by the centrality column observably re-orders the rows.
const TOP = scoreRow({
  id: "0197a000-0000-7000-8000-0000000000b1",
  name: "Top Composite",
  rank: 1,
  composite: 2.5,
  scores: { centrality: 0.2, criticalPath: 1, handoff: 1 },
});
const SECOND = scoreRow({
  id: "0197a000-0000-7000-8000-0000000000b2",
  name: "Central Hub",
  rank: 2,
  composite: 1.5,
  scores: { centrality: 1, criticalPath: 0.5, handoff: 0 },
});

const SCORES: KeyActivityScores = {
  rows: [TOP, SECOND],
  meta: {
    activityCount: 2,
    hasCycle: false,
    weights: { centrality: 1, criticalPath: 1, handoff: 1 },
  },
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockApi(scores: KeyActivityScores) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
    if (url === `/api/v1/models/${MODEL.id}/key-activities` && method === "GET")
      return jsonRes(scores);
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
}

function mountBoard() {
  const route = parseHash("#/model/key-activities");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

// Row order via the name-cell detail buttons (DD-11 markup: the
// DataTable owns the <tr>s; the view owns the cell ReactNodes).
const rowNames = () =>
  screen.getAllByTestId(/^ka-detail-/).map((btn) => btn.textContent);

// A sortable header button by (accessible) label — the aria-hidden sort
// glyph never enters the accessible name.
const headerButton = (label: string) => screen.getByRole("button", { name: label });

describe("KeyActivityBoard (T-14, AC-09)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/key-activities";
  });

  test("#/model/key-activities parses to the model surface's key-activities tab and renders KeyActivityBoard, not the placeholder", async () => {
    const route = parseHash("#/model/key-activities");
    expect(route.surface).toBe("model");
    expect(route.tab).toBe("key-activities");

    mockApi(SCORES);
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("key-activity-board")).toBeInTheDocument());
    expect(screen.queryByText(/key-activity-optimizer/)).not.toBeInTheDocument(); // no placeholder
  });

  test("reads the active model from useActiveModel() and keys the list fetch on it", async () => {
    const spy = mockApi(SCORES);
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());
    expect(
      spy.mock.calls.some((c) => String(c[0]) === `/api/v1/models/${MODEL.id}/key-activities`),
    ).toBe(true);
    expect(screen.getByText(new RegExp("Retail Reference"))).toBeInTheDocument();
  });

  test("ready ranking table carries rank, name, journey, composite, 3 sub-scores and key indicator per row; default order composite desc", async () => {
    mockApi({
      ...SCORES,
      rows: [{ ...TOP, key: null }, { ...SECOND, key: { marked: true, markedAt: "2026-07-04T11:00:00.000Z", scoreSnapshot: { centrality: 1, criticalPath: 0.5, handoff: 0, composite: 1.5 }, rank: 2 } }],
    });
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());

    const topRow = screen.getByTestId(`ka-detail-${TOP.id}`).closest("tr")!;
    expect(topRow).toHaveTextContent("1"); // rank
    expect(topRow).toHaveTextContent("Top Composite");
    expect(topRow).toHaveTextContent("Checkout");
    expect(topRow).toHaveTextContent("2.50"); // composite
    expect(topRow).toHaveTextContent("0.20"); // centrality
    expect(topRow).toHaveTextContent("1.00"); // criticalPath + handoff
    // key indicator: marked row shows the badge, unmarked does not.
    expect(screen.getByTestId(`key-badge-${SECOND.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`key-badge-${TOP.id}`)).not.toBeInTheDocument();

    // Default order = composite desc (server rank order).
    expect(rowNames()).toEqual(["Top Composite", "Central Hub"]);
  });

  test("DataTable sort (Δ3, DD-11): activating a header button inside th[aria-sort] re-orders rows client-side, flips aria-sort, and does NOT re-fetch", async () => {
    const spy = mockApi(SCORES);
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());
    const listCalls = () =>
      spy.mock.calls.filter(
        (c) => String(c[0]) === `/api/v1/models/${MODEL.id}/key-activities`,
      ).length;
    const before = listCalls();

    // DD-11 markup: the header button lives INSIDE th[aria-sort].
    const centralityBtn = headerButton("Centrality");
    expect(centralityBtn.getAttribute("type")).toBe("button"); // native — Enter/Space for free
    const centralityTh = centralityBtn.closest("th")!;
    expect(centralityTh.getAttribute("aria-sort")).toBe("none");
    // Default sorted column (composite desc — the server rank order)
    // carries its aria-sort.
    expect(headerButton("Composite").closest("th")!.getAttribute("aria-sort")).toBe(
      "descending",
    );

    fireEvent.click(centralityBtn); // keyboard-activatable native button (Enter/Space)
    expect(centralityTh.getAttribute("aria-sort")).toBe("descending");
    expect(rowNames()).toEqual(["Central Hub", "Top Composite"]); // re-ordered client-side

    fireEvent.click(centralityBtn);
    expect(centralityTh.getAttribute("aria-sort")).toBe("ascending");
    expect(rowNames()).toEqual(["Top Composite", "Central Hub"]);

    expect(listCalls()).toBe(before); // NO re-fetch on sort
  });
});
