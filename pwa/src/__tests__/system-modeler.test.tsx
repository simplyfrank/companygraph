// ddd-system-modeling T-18 / AC-10 — #/model/systems renders
// SystemModeler (route VERBATIM from the blueprint View Tree; NOT the
// ModelTabPlaceholder), which reads the active model from
// useActiveModel() and renders the ready capability list: name,
// needed-by count, systemKind badges (SYSTEM_KIND_LABELS text — never
// a re-declared literal), assigned context name.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { SYSTEM_KIND_LABELS, SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, CapabilityRead, GapsResult, ContextMapResult } from "../api";

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

const CAP: CapabilityRead = {
  id: "0197b200-0000-7000-8000-0000000000c1",
  name: "Price a product",
  description: "",
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
  neededByCount: 3,
  supportingSystemCount: 2,
  assignedContextId: "0197b200-0000-7000-8000-0000000000bc",
  assignedContextName: "BC4 Pricing & Markdown",
};

const GAPS: GapsResult = {
  unsupportedSteps: [],
  capabilityGaps: [],
  capabilitiesWithoutSystem: [],
  orphanSystems: [],
  augmentationMix: {
    perCapability: [
      {
        capabilityId: CAP.id,
        name: CAP.name,
        counts: { functional: 1, agentic: 1, ai_predictive: 0, unknown: 0 },
        shares: { functional: 0.5, agentic: 0.5, ai_predictive: 0, unknown: 0 },
      },
    ],
    model: { functional: 1, agentic: 1, ai_predictive: 0, unknown: 0 },
  },
};

const CTX: ContextMapResult = { contexts: [], unassigned: [{ id: CAP.id, name: CAP.name }] };

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
    if (url === `${base}/capabilities`) return jsonRes([CAP]);
    if (url === `${base}/system-model/gaps`) return jsonRes(GAPS);
    if (url === `${base}/system-model/context-map`) return jsonRes(CTX);
    throw new Error(`unexpected fetch ${url}`);
  });
}

function mount() {
  const route = parseHash("#/model/systems");
  return render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
}

describe("SystemModeler (T-18, AC-10)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/systems";
  });

  test("#/model/systems parses to the model surface's systems tab and renders SystemModeler, not the placeholder", async () => {
    const route = parseHash("#/model/systems");
    expect(route.surface).toBe("model");
    expect(route.tab).toBe("systems");

    mockApi();
    mount();
    await waitFor(() => expect(screen.getByTestId("system-modeler")).toBeInTheDocument());
    expect(screen.queryByText(/ddd-system-modeling/)).not.toBeInTheDocument(); // no placeholder
  });

  test("reads the active model from useActiveModel() and keys the three fetches on it", async () => {
    const spy = mockApi();
    mount();
    await waitFor(() => expect(screen.getByTestId("capability-list")).toBeInTheDocument());
    for (const path of [
      `/api/v1/models/${MODEL.id}/capabilities`,
      `/api/v1/models/${MODEL.id}/system-model/gaps`,
      `/api/v1/models/${MODEL.id}/system-model/context-map`,
    ]) {
      expect(spy.mock.calls.some((c) => String(c[0]) === path)).toBe(true);
    }
    expect(screen.getByText(new RegExp("Retail Reference"))).toBeInTheDocument();
  });

  test("ready capability list row: name, needed-by count, systemKind badges (label text), assigned context name", async () => {
    mockApi();
    mount();
    await waitFor(() => expect(screen.getByTestId(`cap-row-${CAP.id}`)).toBeInTheDocument());

    expect(screen.getByTestId(`cap-open-${CAP.id}`)).toHaveTextContent("Price a product");
    expect(screen.getByTestId(`cap-needed-${CAP.id}`)).toHaveTextContent("3");
    // Badges carry the SYSTEM_KIND_LABELS TEXT (not color alone).
    const kinds = screen.getByTestId(`cap-kinds-${CAP.id}`);
    expect(kinds).toHaveTextContent(SYSTEM_KIND_LABELS[SYSTEM_KINDS[0]]); // Functional
    expect(kinds).toHaveTextContent(SYSTEM_KIND_LABELS[SYSTEM_KINDS[1]]); // Agentic
    expect(screen.getByTestId(`cap-context-${CAP.id}`)).toHaveTextContent(
      "BC4 Pricing & Markdown",
    );
  });
});
