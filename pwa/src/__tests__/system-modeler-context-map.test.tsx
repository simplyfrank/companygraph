// ddd-system-modeling T-18 / AC-12 — the context-map panel groups
// capabilities under their bounded contexts (with domain/subdomain),
// renders the unassigned bucket, and deep-links inter-context
// relationships via targetId (DD-07). A grouped LIST — not a
// drag-canvas (requirements Risk 4).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, CapabilityRead, GapsResult, ContextMapResult } from "../api";

const MODEL: ModelRead = {
  id: "0197b400-0000-7000-8000-0000000000a1",
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

const capRow = (id: string, name: string): CapabilityRead => ({
  id,
  name,
  description: "",
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
  neededByCount: 0,
  supportingSystemCount: 0,
  assignedContextId: null,
  assignedContextName: null,
});

const CAP_A = capRow("0197b400-0000-7000-8000-0000000000c1", "Describe a product");
const CAP_B = capRow("0197b400-0000-7000-8000-0000000000c2", "Group an assortment");
const CAP_D = capRow("0197b400-0000-7000-8000-0000000000c3", "Price a product");
const CAP_U = capRow("0197b400-0000-7000-8000-0000000000c4", "Unassigned capability");

const BC1 = { id: "0197b400-0000-7000-8000-00000000bc01", name: "BC1 Product Catalogue" };
const BC4 = { id: "0197b400-0000-7000-8000-00000000bc04", name: "BC4 Pricing & Markdown" };

const CTX: ContextMapResult = {
  contexts: [
    {
      id: BC1.id,
      name: BC1.name,
      domain: "Commercial",
      subdomain: "Catalogue",
      capabilities: [
        { id: CAP_A.id, name: CAP_A.name },
        { id: CAP_B.id, name: CAP_B.name },
      ],
      relationships: [{ type: "UPSTREAM_OF", targetId: BC4.id, targetName: BC4.name }],
    },
    {
      id: BC4.id,
      name: BC4.name,
      domain: "Commercial",
      subdomain: "Pricing",
      capabilities: [{ id: CAP_D.id, name: CAP_D.name }],
      relationships: [{ type: "DOWNSTREAM_OF", targetId: BC1.id, targetName: BC1.name }],
    },
  ],
  unassigned: [{ id: CAP_U.id, name: CAP_U.name }],
};

const GAPS: GapsResult = {
  unsupportedSteps: [],
  capabilityGaps: [],
  capabilitiesWithoutSystem: [],
  orphanSystems: [],
  augmentationMix: {
    perCapability: [],
    model: { functional: 0, agentic: 0, ai_predictive: 0, unknown: 0 },
  },
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
    if (url === `${base}/capabilities`) return jsonRes([CAP_A, CAP_B, CAP_D, CAP_U]);
    if (url === `${base}/system-model/gaps`) return jsonRes(GAPS);
    if (url === `${base}/system-model/context-map`) return jsonRes(CTX);
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("SystemModeler context-map panel (T-18, AC-12)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/systems";
  });

  test("capabilities group under their contexts with domain/subdomain", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId("context-map")).toBeInTheDocument());

    const g1 = screen.getByTestId(`ctx-group-${BC1.id}`);
    expect(g1).toHaveTextContent(BC1.name);
    expect(g1).toHaveTextContent("Commercial / Catalogue");
    expect(g1).toHaveTextContent(CAP_A.name);
    expect(g1).toHaveTextContent(CAP_B.name);
    expect(g1).not.toHaveTextContent(CAP_D.name);

    const g4 = screen.getByTestId(`ctx-group-${BC4.id}`);
    expect(g4).toHaveTextContent("Commercial / Pricing");
    expect(g4).toHaveTextContent(CAP_D.name);
  });

  test("the unassigned bucket holds the context-less capability", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId("context-map")).toBeInTheDocument());

    expect(screen.getByTestId("count-unassigned")).toHaveTextContent("(1)");
    const unassigned = screen.getByTestId("list-unassigned");
    expect(unassigned).toHaveTextContent(CAP_U.name);
    expect(unassigned).not.toHaveTextContent(CAP_A.name);
  });

  test("inter-context relationships are deep-linked via targetId (DD-07)", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId("context-map")).toBeInTheDocument());

    const rel = screen.getByTestId(`rel-${BC1.id}-${BC4.id}`);
    expect(rel).toHaveTextContent(`upstream of ${BC4.name}`);
    // The affordance carries the far context's ID (not a name-only shape).
    expect(rel.getAttribute("data-target-id")).toBe(BC4.id);

    const relBack = screen.getByTestId(`rel-${BC4.id}-${BC1.id}`);
    expect(relBack).toHaveTextContent(`downstream of ${BC1.name}`);
    expect(relBack.getAttribute("data-target-id")).toBe(BC1.id);

    // The target group is addressable by that id (in-view deep-link).
    const target = document.getElementById(`ctx-${BC4.id}`);
    expect(target).not.toBeNull();
    expect(within(target as HTMLElement).getByText(CAP_D.name)).toBeInTheDocument();
  });
});
