// key-activity-optimizer T-14 / AC-10 — mark toggle POST/DELETEs with
// optimistic re-render + rollback-on-error, and the row detail panel
// showing composite + 3 sub-scores WITH component evidence + (when
// marked) markedAt/scoreSnapshot/rank (live-vs-snapshot drift).
//
// final-review C-01 (pinned): the unmark fixture mocks fetch with a
// REAL `new Response(null, { status: 204 })` and asserts the mark
// indicator STAYS removed — no throw, no spurious rollback. Mocking
// api.keyActivities.unmark itself would mask the json<T>-on-204
// failure mode, so the mock lives at the fetch level.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, ActivityScoreRow, KeyActivityScores } from "../api";

const MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000a2",
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

const MARK = {
  marked: true as const,
  markedAt: "2026-07-04T11:00:00.000Z",
  scoreSnapshot: { centrality: 0.8, criticalPath: 1, handoff: 0.5, composite: 2.3 },
  rank: 1,
};

const ROW: ActivityScoreRow = {
  id: "0197a000-0000-7000-8000-0000000000c1",
  name: "Scan items",
  journeyId: "0197a000-0000-7000-8000-0000000000j1",
  journeyName: "Checkout",
  rank: 1,
  composite: 2.4,
  scores: { centrality: 0.9, criticalPath: 1, handoff: 0.5 },
  evidence: {
    centrality: { betweenness: 7, inDegree: 2, outDegree: 3 },
    criticalPath: { onCriticalPath: true, longestChainDepth: 5, criticalPathLength: 5 },
    handoff: { handoffCount: 4, roleHandoffs: 2, systemHandoffs: 2 },
  },
  key: null,
};

const scoresWith = (row: ActivityScoreRow): KeyActivityScores => ({
  rows: [row],
  meta: { activityCount: 1, hasCycle: false, weights: { centrality: 1, criticalPath: 1, handoff: 1 } },
});

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const MARK_PATH = `/api/v1/models/${MODEL.id}/key-activities/${ROW.id}/mark`;
const LIST_PATH = `/api/v1/models/${MODEL.id}/key-activities`;

function mockApi(
  initial: KeyActivityScores,
  markImpl?: () => Response | Promise<Response>,
  unmarkImpl?: () => Response | Promise<Response>,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
    if (url === LIST_PATH && method === "GET") return jsonRes(initial);
    if (url === MARK_PATH && method === "POST" && markImpl) return markImpl();
    if (url === MARK_PATH && method === "DELETE" && unmarkImpl) return unmarkImpl();
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
}

function mountBoard() {
  const route = parseHash("#/model/key-activities");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("KeyActivityBoard mark toggle + evidence panel (T-14, AC-10)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/key-activities";
  });

  test("mark toggle POSTs and re-renders optimistically with the server row", async () => {
    const spy = mockApi(scoresWith(ROW), () => jsonRes({ ...ROW, key: MARK }));
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());
    expect(screen.queryByTestId(`key-badge-${ROW.id}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark key" }));
    // Optimistic: badge appears immediately, before/while the POST resolves.
    expect(screen.getByTestId(`key-badge-${ROW.id}`)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          (c) => String(c[0]) === MARK_PATH && (c[1]?.method ?? "GET") === "POST",
        ),
      ).toBe(true),
    );
    // Still marked after the server row lands; no error surfaced.
    expect(screen.getByTestId(`key-badge-${ROW.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId("row-error")).not.toBeInTheDocument();
  });

  test("rollback-on-error: a rejected mark POST reverts the optimistic toggle and surfaces an inline error", async () => {
    mockApi(scoresWith(ROW), () => jsonRes({ error: { code: "neo4j_unreachable", message: "boom" } }, 500));
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Mark key" }));
    expect(screen.getByTestId(`key-badge-${ROW.id}`)).toBeInTheDocument(); // optimistic
    await waitFor(() => expect(screen.getByTestId("row-error")).toBeInTheDocument());
    // Rolled back.
    expect(screen.queryByTestId(`key-badge-${ROW.id}`)).not.toBeInTheDocument();
  });

  test("unmark: a REAL 204 no-body Response resolves without throwing — the indicator stays removed, no spurious rollback (final-review C-01)", async () => {
    const spy = mockApi(
      scoresWith({ ...ROW, key: MARK }),
      undefined,
      // The failure mode under test: json<T> would call res.json() on
      // this and reject. The raw-fetch unmark client must not.
      () => new Response(null, { status: 204 }),
    );
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());
    expect(screen.getByTestId(`key-badge-${ROW.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unmark" }));
    expect(screen.queryByTestId(`key-badge-${ROW.id}`)).not.toBeInTheDocument(); // optimistic
    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          (c) => String(c[0]) === MARK_PATH && c[1]?.method === "DELETE",
        ),
      ).toBe(true),
    );
    // Give any (wrong) rollback a chance to land, then assert it didn't.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId(`key-badge-${ROW.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-error")).not.toBeInTheDocument();
  });

  test("row detail panel shows composite + 3 sub-scores with component evidence + markedAt/scoreSnapshot/rank when marked (AC-10, XD-11)", async () => {
    mockApi(scoresWith({ ...ROW, key: MARK }));
    mountBoard();
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId(`ka-detail-${ROW.id}`));
    const panel = await screen.findByTestId("ka-detail-panel");
    expect(panel).toBeInTheDocument();

    // Live composite + component evidence (explainable, XD-11).
    expect(screen.getByTestId("detail-composite")).toHaveTextContent("2.40");
    expect(screen.getByTestId("detail-betweenness")).toHaveTextContent("7");
    expect(panel).toHaveTextContent("In-degree");
    expect(panel).toHaveTextContent("Out-degree");
    expect(panel).toHaveTextContent("On critical path");
    expect(panel).toHaveTextContent("Longest chain depth");
    expect(panel).toHaveTextContent("Critical path length");
    expect(panel).toHaveTextContent("Handoff count");
    expect(panel).toHaveTextContent("Role handoffs");
    expect(panel).toHaveTextContent("System handoffs");

    // Mark evidence: markedAt / snapshot / rank-at-mark-time — the
    // snapshot composite (2.30) differs from the live 2.40, so drift
    // is visible.
    const markBlock = screen.getByTestId("detail-mark");
    expect(markBlock).toHaveTextContent(MARK.markedAt);
    expect(screen.getByTestId("detail-snapshot-composite")).toHaveTextContent("2.30");
  });
});
