// ddd-system-modeling T-14 / AC-14, AC-15, AC-16 — the three non-ready
// states of SystemModeler: loading skeleton while the three fetches
// are pending; empty state with a working "New capability" action
// (POST → the new capability appears) + the start-mapping hint when
// the model has activities/stories; error state + a retry affordance
// whose click refetches (the retry Button is rendered by SystemModeler
// alongside ErrorState — ErrorState carries no retry itself).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, CapabilityRead, GapsResult, ContextMapResult } from "../api";

const MODEL: ModelRead = {
  id: "0197b000-0000-7000-8000-0000000000a1",
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

const CAP: CapabilityRead = {
  id: "0197b000-0000-7000-8000-0000000000c1",
  name: "Price a product",
  description: "",
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
  neededByCount: 0,
  supportingSystemCount: 0,
  assignedContextId: null,
  assignedContextName: null,
};

const emptyGaps = (withSteps: boolean): GapsResult => ({
  unsupportedSteps: withSteps
    ? [{ activityId: "a1", activityName: "Scan item", describingStories: [] }]
    : [],
  capabilityGaps: [],
  capabilitiesWithoutSystem: [],
  orphanSystems: [],
  augmentationMix: {
    perCapability: [],
    model: { functional: 0, agentic: 0, ai_predictive: 0, unknown: 0 },
  },
});

const CTX_EMPTY: ContextMapResult = { contexts: [], unassigned: [] };

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const base = (modelId: string) => `/api/v1/models/${modelId}`;

function mount() {
  const route = parseHash("#/model/systems");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("SystemModeler states (T-14, AC-14/15/16)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/systems";
  });

  test("loading — skeleton while the three fetches are pending (AC-14)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      await gate; // hold the three view fetches open
      if (url === `${base(MODEL.id)}/capabilities`) return jsonRes([]);
      if (url === `${base(MODEL.id)}/system-model/gaps`) return jsonRes(emptyGaps(false));
      if (url === `${base(MODEL.id)}/system-model/context-map`) return jsonRes(CTX_EMPTY);
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();
    await waitFor(() =>
      expect(screen.getByText(/Loading the system model/)).toBeInTheDocument(),
    );
    release();
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });

  test("empty — 'New capability' action POSTs and the new capability appears; mapping hint shows when the model has steps (AC-15)", async () => {
    let created = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      if (url === `${base(MODEL.id)}/capabilities` && method === "POST") {
        created = true;
        return jsonRes(CAP, 201);
      }
      if (url === `${base(MODEL.id)}/capabilities`) return jsonRes(created ? [CAP] : []);
      if (url === `${base(MODEL.id)}/system-model/gaps`) return jsonRes(emptyGaps(true));
      if (url === `${base(MODEL.id)}/system-model/context-map`) return jsonRes(CTX_EMPTY);
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
    // The model has activities/stories → the start-mapping hint shows.
    expect(screen.getByTestId("empty-mapping-hint")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New capability" }));
    await waitFor(() => expect(screen.getByTestId("create-name")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("create-name"), {
      target: { value: "Price a product" },
    });
    fireEvent.submit(screen.getByTestId("create-form"));

    // POST fired and the refetched list shows the new capability.
    await waitFor(() =>
      expect(screen.getByTestId(`cap-row-${CAP.id}`)).toBeInTheDocument(),
    );
    expect(created).toBe(true);
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  test("error — ErrorState plus a retry affordance whose click refetches (AC-16)", async () => {
    let fail = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/models") return jsonRes([MODEL]);
      if (url === `${base(MODEL.id)}/capabilities`) {
        if (fail) return jsonRes({ error: { code: "neo4j_unreachable", message: "boom" } }, 500);
        return jsonRes([CAP]);
      }
      if (url === `${base(MODEL.id)}/system-model/gaps`) return jsonRes(emptyGaps(false));
      if (url === `${base(MODEL.id)}/system-model/context-map`) return jsonRes(CTX_EMPTY);
      throw new Error(`unexpected fetch ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
    const retry = screen.getByText("Retry");
    expect(retry).toBeInTheDocument();

    fail = false;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByTestId(`cap-row-${CAP.id}`)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });
});
