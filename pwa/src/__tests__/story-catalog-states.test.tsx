// story-spec-core T-15 — sole verification owner for AC-12/AC-13/AC-14
// (T-14 implements the states, this file proves them):
//   loading — skeleton while GET …/stories is pending (AC-12)
//   empty   — "Generate from graph" + manual create; bootstrap POSTs
//             …/bootstrap and the derived stories then appear (AC-13);
//             a {created:0, skipped:0} bootstrap renders the DD-09
//             fork-first hint in the empty state
//   error   — ErrorState PLUS the local retry Button whose click
//             refetches (AC-14 — the retry lives in StoryCatalog, not
//             ErrorState)

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, StoryRead } from "../api";

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

const DERIVED_STORY: StoryRead = {
  id: "0197a000-0000-7000-8000-0000000000s1",
  name: "As a Cashier, I want to scan items, so that the checkout workflow completes.",
  description: "",
  persona: "Cashier",
  action: "scan items",
  benefit: "the checkout workflow completes",
  narrative: "As a Cashier, I want to scan items, so that the checkout workflow completes.",
  derived: true,
  sourceActivityId: "0197a000-0000-7000-8000-0000000000c1",
  activityId: "0197a000-0000-7000-8000-0000000000c1",
  activityName: "Scan items",
  acCount: 1,
  detached: false,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

const STORIES_URL = `/api/v1/models/${MODEL.id}/stories`;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mount() {
  const route = parseHash("#/model/stories");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("StoryCatalog view states (T-15, AC-12/13/14)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/stories";
  });

  test("loading: skeleton while the stories fetch is pending (AC-12)", async () => {
    let resolveList!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
      if (url === STORIES_URL && method === "GET")
        return new Promise<Response>((res) => (resolveList = res));
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByText(/Loading stories/)).toBeInTheDocument());

    resolveList(jsonRes([]));
    await waitFor(() => expect(screen.getByText("No stories yet")).toBeInTheDocument());
  });

  test("empty: 'Generate from graph' + manual create; bootstrap POSTs and the derived stories appear (AC-13)", async () => {
    let bootstrapped = false;
    let bootstrapCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
      if (url === STORIES_URL && method === "GET")
        return jsonRes(bootstrapped ? [DERIVED_STORY] : []);
      if (url === `${STORIES_URL}/bootstrap` && method === "POST") {
        bootstrapCalls += 1;
        bootstrapped = true;
        return jsonRes({ created: 1, skipped: 0 });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByText("No stories yet")).toBeInTheDocument());
    // Both affordances present in the empty state.
    expect(screen.getByRole("button", { name: "Generate from graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create story" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate from graph" }));
    await waitFor(() =>
      expect(screen.getByTestId(`story-row-${DERIVED_STORY.id}`)).toBeInTheDocument(),
    );
    expect(bootstrapCalls).toBe(1);
    expect(screen.getByTestId("derived-badge")).toBeInTheDocument();
  });

  test("empty + fork-first hint: a {created:0, skipped:0} bootstrap renders the DD-09 hint", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
      if (url === STORIES_URL && method === "GET") return jsonRes([]);
      if (url === `${STORIES_URL}/bootstrap` && method === "POST")
        return jsonRes({ created: 0, skipped: 0 });
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByText("No stories yet")).toBeInTheDocument());
    expect(screen.queryByTestId("fork-first-hint")).toBeNull(); // only after the attempt

    fireEvent.click(screen.getByRole("button", { name: "Generate from graph" }));
    await waitFor(() => expect(screen.getByTestId("fork-first-hint")).toBeInTheDocument());
    expect(screen.getByTestId("fork-first-hint")).toHaveTextContent(
      "no materialized activities — if this model uses pinned modules, fork the module first, then generate",
    );
  });

  test("error: ErrorState + the LOCAL retry Button whose click refetches (AC-14)", async () => {
    let failing = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
      if (url === STORIES_URL && method === "GET") {
        if (failing) return jsonRes({ error: { code: "neo4j_unreachable" } }, 500);
        return jsonRes([DERIVED_STORY]);
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();

    failing = false;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByTestId(`story-row-${DERIVED_STORY.id}`)).toBeInTheDocument(),
    );
  });
});
