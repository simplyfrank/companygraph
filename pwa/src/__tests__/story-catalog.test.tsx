// story-spec-core T-14 / AC-10 — `#/model/stories` renders StoryCatalog
// (route VERBATIM from the blueprint View Tree), which reads the active
// model from useActiveModel() and lists stories with narrative, linked
// activity name, role and AC count.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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

const STORY: StoryRead = {
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
  roleId: "0197a000-0000-7000-8000-0000000000r1",
  roleName: "Cashier",
  acCount: 3,
  detached: false,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

// Prop-less off-surface row (C-07 pin): narrative null → renders `name`.
const PROPLESS: StoryRead = {
  ...STORY,
  id: "0197a000-0000-7000-8000-0000000000s2",
  name: "raw-node-name",
  persona: null,
  action: null,
  benefit: null,
  narrative: null,
  sourceActivityId: null,
  activityId: null,
  activityName: null,
  acCount: 0,
  detached: true,
};
delete (PROPLESS as Record<string, unknown>).roleId;
delete (PROPLESS as Record<string, unknown>).roleName;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockApi(storyRows: StoryRead[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
    if (url === `/api/v1/models/${MODEL.id}/stories` && method === "GET")
      return jsonRes(storyRows);
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
}

function mountStoriesRoute() {
  const route = parseHash("#/model/stories");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("StoryCatalog (T-14, AC-10)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/stories";
  });

  test("#/model/stories parses to the model surface's stories tab and renders StoryCatalog", async () => {
    const route = parseHash("#/model/stories");
    expect(route.surface).toBe("model");
    expect(route.tab).toBe("stories");

    mockApi([STORY]);
    mountStoriesRoute();
    await waitFor(() => expect(screen.getByTestId("story-catalog")).toBeInTheDocument());
  });

  test("reads the active model from useActiveModel() and keys the list fetch on it", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
      if (url === `/api/v1/models/${MODEL.id}/stories` && method === "GET")
        return jsonRes([STORY]);
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    mountStoriesRoute();
    await waitFor(() =>
      expect(screen.getByText(new RegExp("stories .* Retail Reference", "i"))).toBeDefined(),
    );
    await waitFor(() =>
      expect(
        spy.mock.calls.some((c) => String(c[0]) === `/api/v1/models/${MODEL.id}/stories`),
      ).toBe(true),
    );
  });

  test("ready list row carries narrative, activity name, role and AC count (AC-10)", async () => {
    mockApi([STORY]);
    mountStoriesRoute();
    await waitFor(() =>
      expect(screen.getByTestId(`story-row-${STORY.id}`)).toHaveTextContent(STORY.narrative!),
    );
    expect(screen.getByText("Scan items")).toBeInTheDocument();
    expect(screen.getByText("Cashier")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByTestId("derived-badge")).toBeInTheDocument();
  });

  test("null-safe render (C-07): a prop-less row falls back narrative ?? name; detached badge on the row", async () => {
    mockApi([PROPLESS]);
    mountStoriesRoute();
    await waitFor(() =>
      expect(screen.getByTestId(`story-row-${PROPLESS.id}`)).toHaveTextContent("raw-node-name"),
    );
    expect(screen.getByTestId("detached-badge")).toBeInTheDocument();
  });
});
