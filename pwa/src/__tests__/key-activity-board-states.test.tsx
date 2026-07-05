// key-activity-optimizer T-15 / AC-11 + AC-12 + AC-13 — the
// KeyActivityBoard's non-ready view states (UX-01):
//   loading — skeleton while the GET is pending (AC-11)
//   empty   — driven by a mocked 200 { rows: [], meta:
//             { activityCount: 0 } } — the shape an existing
//             0-activity model ACTUALLY returns (cold-pass B-01, never
//             a 404) — "no activities to score" → authoring, no
//             ranking table (AC-12)
//   error   — ErrorState PLUS the sibling retry Button (design C-02 —
//             retry is not part of ErrorState) whose click re-invokes
//             api.keyActivities.list and re-enters loading (AC-13)
//   banner  — meta.truncated / meta.hasCycle → non-blocking banner
//             above the still-rendered ranking (AC-13, FR-03)
//
// Each test uses its OWN model id: the private json<T> helper
// de-duplicates in-flight GETs by path, so the loading test's
// never-resolving promise must not poison another test's fetch.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, KeyActivityScores, ActivityScoreRow } from "../api";

function model(id: string): ModelRead {
  return {
    id,
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
}

const ROW: ActivityScoreRow = {
  id: "0197a000-0000-7000-8000-0000000000c9",
  name: "Scan items",
  journeyId: null,
  journeyName: null,
  rank: 1,
  composite: 1,
  scores: { centrality: 0, criticalPath: 1, handoff: 0 },
  evidence: {
    centrality: { betweenness: 0, inDegree: 0, outDegree: 0 },
    criticalPath: { onCriticalPath: true, longestChainDepth: 2, criticalPathLength: 2 },
    handoff: { handoffCount: 0, roleHandoffs: 0, systemHandoffs: 0 },
  },
  key: null,
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockApi(m: ModelRead, listImpl: () => Promise<Response> | Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/v1/models" && method === "GET") return jsonRes([m]);
    if (url === `/api/v1/models/${m.id}/key-activities` && method === "GET") return listImpl();
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
}

function mountBoard() {
  const route = parseHash("#/model/key-activities");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("KeyActivityBoard view states (T-15, AC-11/AC-12/AC-13)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/key-activities";
  });

  test("loading: skeleton while the GET is pending (AC-11)", async () => {
    const m = model("0197a000-0000-7000-8000-0000000000d1");
    mockApi(m, () => new Promise<Response>(() => {})); // never resolves
    mountBoard();
    await waitFor(() =>
      expect(screen.getByText(/Loading key-activity scores/)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("ranking-table")).not.toBeInTheDocument();
  });

  test("empty: a 200 {rows:[], activityCount:0} response (the real 0-activity shape, never 404) → authoring pointer, no table (AC-12)", async () => {
    const m = model("0197a000-0000-7000-8000-0000000000d2");
    const empty: KeyActivityScores = {
      rows: [],
      meta: { activityCount: 0, hasCycle: false, weights: { centrality: 1, criticalPath: 1, handoff: 1 } },
    };
    mockApi(m, () => jsonRes(empty));
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
    expect(screen.getByTestId("empty-state")).toHaveTextContent(/no activities to score/i);
    // Points to authoring (#/model/canvas).
    expect(screen.getByRole("link", { name: /model canvas/i })).toHaveAttribute(
      "href",
      "#/model/canvas",
    );
    expect(screen.queryByTestId("ranking-table")).not.toBeInTheDocument();
  });

  test("error: ErrorState PLUS a sibling retry Button whose click re-invokes the list fetch and re-enters loading (AC-13, design C-02)", async () => {
    const m = model("0197a000-0000-7000-8000-0000000000d3");
    let calls = 0;
    mockApi(m, () => {
      calls += 1;
      if (calls === 1) return jsonRes({ error: { code: "neo4j_unreachable", message: "boom" } }, 500);
      return new Promise<Response>(() => {}); // retry re-enters loading
    });
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
    // The retry is a SEPARATE sibling catalog Button — not inside ErrorState.
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();
    expect(screen.getByTestId("error-state")).not.toContainElement(retry);

    fireEvent.click(retry);
    await waitFor(() => expect(calls).toBe(2)); // re-invoked list(activeModel.id)
    await waitFor(() =>
      expect(screen.getByText(/Loading key-activity scores/)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });

  test("meta.truncated / meta.hasCycle → non-blocking banner ABOVE the still-rendered ranking (AC-13, FR-03)", async () => {
    const m = model("0197a000-0000-7000-8000-0000000000d4");
    const flagged: KeyActivityScores = {
      rows: [ROW],
      meta: {
        activityCount: 1,
        hasCycle: true,
        truncated: true,
        truncationReason: "depth_cap",
        weights: { centrality: 1, criticalPath: 1, handoff: 1 },
      },
    };
    mockApi(m, () => jsonRes(flagged));
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("score-banner")).toBeInTheDocument());
    const banner = screen.getByTestId("score-banner");
    expect(banner).toHaveTextContent(/cycle/i);
    expect(banner).toHaveTextContent(/truncated/i);
    // Non-blocking: the ranking still renders, banner precedes it.
    const table = screen.getByTestId("ranking-table");
    expect(table).toBeInTheDocument();
    expect(banner.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
