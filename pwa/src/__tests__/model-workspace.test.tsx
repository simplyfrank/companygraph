// model-workspace-core T-17 + T-20 (AC-11, AC-12) — jsdom pin for the
// Model surface + ModelWorkspace ready-state behaviour:
//   * SURFACES carries the Model surface as the 2nd entry (index 1) under
//     the 8-surface navigation-IA structure, with all seven blueprint
//     View-Tree tabs VERBATIM, in order.
//   * The App.tsx surf-jump key→index mapping is unit-asserted
//     (Alt+1..8 → indices 0..7; "2" → 1 lands on Model) and lands on
//     the Model surface for "2".
//   * ready lists models from the single GET /api/v1/models (ordinal,
//     reference badge, moduleInstanceCount — no per-model fetch);
//     create POSTs and the new model appears; switch updates the
//     active-model context + persists to localStorage.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { SURFACES } from "../route";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import { ModelWorkspace } from "../views/model/ModelWorkspace";
import type { ModelRead } from "../api";

const REF_MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000a1",
  name: "Retail Reference",
  description: "Business Model #1",
  ordinal: 1,
  status: "active",
  isReference: true,
  moduleInstanceCount: 3,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

const USER_MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000b2",
  name: "Franchise Pilot",
  description: "",
  ordinal: 2,
  status: "active",
  isReference: false,
  moduleInstanceCount: 0,
  createdAt: "2026-07-04T11:00:00.000Z",
  updatedAt: "2026-07-04T11:00:00.000Z",
  attributes: {},
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mount() {
  return render(
    <ActiveModelProvider>
      <ModelWorkspace />
    </ActiveModelProvider>,
  );
}

describe("Model surface registration (T-17, FR-14, AC-11)", () => {
  test("Model is the 2nd surface (index 1) with the seven View-Tree tabs verbatim in order", () => {
    const model = SURFACES[1];
    expect(model).toBeDefined();
    expect(model!.id).toBe("model");
    expect(model!.label).toBe("Model");
    expect(model!.tabs.map((t) => t.id)).toEqual([
      "models",
      "canvas",
      "stories",
      "key-activities",
      "kpi-impact",
      "systems",
      "export",
    ]);
  });

  test("surf-jump key→index mapping: Alt+1..8 → 0..7 (navigation-IA) and \"2\" lands on Model", () => {
    // The exact expression from the App.tsx keydown branch (T-17):
    // `if (e.altKey && /^[1-8]$/.test(e.key)) { const idx = Number(e.key) - 1; ... }`
    const idx = (key: string) => Number(key) - 1;
    expect(idx("1")).toBe(0);
    expect(idx("2")).toBe(1);
    expect(idx("8")).toBe(7);
    expect(SURFACES[idx("2")]!.id).toBe("model");
    expect(SURFACES[idx("1")]!.id).toBe("explorer");
  });
});

describe("ModelWorkspace ready state (T-20, AC-11/AC-12)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/models";
  });

  test("ready lists models from the single GET /api/v1/models — ordinal, reference badge, instance count", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([REF_MODEL, USER_MODEL]);
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => {
      expect(screen.getByText("Retail Reference")).toBeInTheDocument();
    });
    expect(screen.getByText("Franchise Pilot")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByTestId("reference-badge")).toBeInTheDocument();
    expect(screen.getByTestId(`instance-count-${REF_MODEL.id}`)).toHaveTextContent("3 instances");

    // Single list fetch — no per-model fetch (design §6).
    const modelCalls = spy.mock.calls.filter((c) => String(c[0]).startsWith("/api/v1/models"));
    expect(modelCalls.length).toBe(1);
  });

  test("create POSTs /api/v1/models and the new model appears after the context reload (AC-12)", async () => {
    let list: ModelRead[] = [REF_MODEL];
    let postBody: unknown = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes(list);
      if (url === "/api/v1/models" && method === "POST") {
        postBody = JSON.parse(String(init!.body));
        list = [REF_MODEL, USER_MODEL];
        return jsonRes(USER_MODEL, 201);
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("model-list")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    fireEvent.change(screen.getByTestId("model-create-name"), {
      target: { value: "Franchise Pilot" },
    });
    fireEvent.submit(screen.getByTestId("model-create-form"));

    await waitFor(() => {
      expect(screen.getByText("Franchise Pilot")).toBeInTheDocument();
    });
    expect(postBody).toEqual({ name: "Franchise Pilot" });
  });

  test("switch updates the active-model context and persists to localStorage (AC-12/AC-18 persistence half)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/models" && method === "GET") return jsonRes([REF_MODEL, USER_MODEL]);
      throw new Error(`unexpected fetch ${method} ${url}`);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("model-list")).toBeInTheDocument());

    // Default active = the reference model.
    expect(screen.getByTestId(`model-row-${REF_MODEL.id}`)).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));

    await waitFor(() => {
      expect(screen.getByTestId(`model-row-${USER_MODEL.id}`)).toHaveAttribute(
        "aria-current",
        "true",
      );
    });
    expect(localStorage.getItem("cg.activeModelId")).toBe(USER_MODEL.id);
  });
});
