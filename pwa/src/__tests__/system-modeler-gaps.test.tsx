// ddd-system-modeling T-18 / AC-11 — the support-gap panel renders the
// four FR-07 categories with counts + deep-link affordances; step
// items surface their describingStories links (DD-15); the
// augmentation-mix summary renders per-kind badges and the `unknown`
// bucket defensively.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { SYSTEM_KIND_LABELS, SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, CapabilityRead, GapsResult, ContextMapResult } from "../api";

const MODEL: ModelRead = {
  id: "0197b300-0000-7000-8000-0000000000a1",
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
  id: "0197b300-0000-7000-8000-0000000000c1",
  name: "Fulfil an order",
  description: "",
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
  neededByCount: 0,
  supportingSystemCount: 0,
  assignedContextId: null,
  assignedContextName: null,
};

const STORY = { id: "0197b300-0000-7000-8000-0000000000s1", name: "As a picker, pick the order" };
const ACT_Z = { id: "0197b300-0000-7000-8000-0000000000az", name: "Pack order" };
const ACT_Y = { id: "0197b300-0000-7000-8000-0000000000ay", name: "Ship order" };

const GAPS: GapsResult = {
  unsupportedSteps: [
    { activityId: ACT_Z.id, activityName: ACT_Z.name, describingStories: [STORY] },
  ],
  capabilityGaps: [
    { activityId: ACT_Y.id, activityName: ACT_Y.name, describingStories: [] },
  ],
  capabilitiesWithoutSystem: [{ capabilityId: CAP.id, name: CAP.name }],
  orphanSystems: [{ systemId: "0197b300-0000-7000-8000-0000000000sy", name: "Legacy WMS" }],
  augmentationMix: {
    perCapability: [],
    // The unknown bucket is populated → it must render defensively.
    model: { functional: 2, agentic: 1, ai_predictive: 1, unknown: 1 },
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

describe("SystemModeler support-gap panel (T-18, AC-11)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/systems";
  });

  test("the four FR-07 categories render with counts", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId("gap-panel")).toBeInTheDocument());

    expect(screen.getByTestId("count-unsupported")).toHaveTextContent("(1)");
    expect(screen.getByTestId("count-capability-gaps")).toHaveTextContent("(1)");
    expect(screen.getByTestId("count-without-system")).toHaveTextContent("(1)");
    expect(screen.getByTestId("count-orphan-systems")).toHaveTextContent("(1)");
    expect(screen.getByTestId("list-without-system")).toHaveTextContent(CAP.name);
    expect(screen.getByTestId("list-orphan-systems")).toHaveTextContent("Legacy WMS");
  });

  test("step items carry deep-link affordances + describingStories links (DD-15)", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId("gap-panel")).toBeInTheDocument());

    // Activity deep-link.
    const unsupported = screen.getByTestId("list-unsupported");
    const actLink = within(unsupported).getByText(ACT_Z.name);
    expect(actLink.getAttribute("href")).toBe(`#/explorer/activities/${ACT_Z.id}`);
    // Describing-story deep-link (DD-15 — the parenthetical stories are
    // in the payload AND rendered).
    const storyLink = screen.getByTestId(`story-link-${STORY.id}`);
    expect(storyLink).toHaveTextContent(STORY.name);
    expect(storyLink.getAttribute("href")).toBe(`#/model/stories/${STORY.id}`);
  });

  test("augmentation-mix summary renders per-kind label badges and the unknown bucket defensively", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId("augmentation-mix")).toBeInTheDocument());

    const mix = screen.getByTestId("mix-model");
    for (const kind of SYSTEM_KINDS) {
      expect(mix).toHaveTextContent(SYSTEM_KIND_LABELS[kind]);
    }
    // Defensive unknown bucket — rendered because the stub populates it.
    expect(mix).toHaveTextContent(/Unknown kind ×1/);
  });
});
