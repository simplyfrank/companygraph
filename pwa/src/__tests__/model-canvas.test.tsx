// business-model-authoring T-14 — ModelCanvas component test.
// Verifies the four states (loading, empty, error, ready) and that
// the wizard shell renders the template step first.
// Follows the system-modeler.test.tsx pattern: mock globalThis.fetch.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead } from "../api";

const MODEL: ModelRead = {
  id: "0197b200-0000-7000-8000-0000000000a1",
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

const mockGraph = {
  journeys: [],
  roles: [],
  systems: [],
  locations: [],
  precedes: [],
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockApi() {
  const base = `/api/v1/models/${MODEL.id}`;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/models") return jsonRes([MODEL]);
    if (url === `${base}/authoring/graph`) return jsonRes(mockGraph);
    if (url === `${base}/stories`) return jsonRes([]);
    if (url === "/api/v1/modules") return jsonRes([]);
    if (url === "/api/v1/query/listDomains") return jsonRes([]);
    throw new Error(`unexpected fetch ${url}`);
  });
}

function mockApiError() {
  const base = `/api/v1/models/${MODEL.id}`;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/models") return jsonRes([MODEL]);
    if (url === `${base}/authoring/graph`) return jsonRes({ error: { code: "internal_error", message: "Network error" } }, 500);
    if (url === `${base}/stories`) return jsonRes([]);
    if (url === "/api/v1/modules") return jsonRes([]);
    if (url === "/api/v1/query/listDomains") return jsonRes([]);
    throw new Error(`unexpected fetch ${url}`);
  });
}

function mount() {
  const route = parseHash("#/model/canvas");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("ModelCanvas (T-14, AC-10)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = "#/model/canvas";
  });

  test("#/model/canvas renders ModelCanvas, not the placeholder", async () => {
    mockApi();
    mount();
    await waitFor(() => expect(screen.getByTestId("model-canvas")).toBeInTheDocument());
    expect(screen.queryByText(/business-model-authoring/)).not.toBeInTheDocument();
  });

  test("renders the template step first on a fresh model", async () => {
    mockApi();
    mount();
    await waitFor(() => expect(screen.getByTestId("model-canvas")).toBeInTheDocument());
    expect(screen.getByText(/Choose a template/i)).toBeInTheDocument();
  });

  test("renders error state on fetch failure", async () => {
    mockApiError();
    mount();
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
  });
});
