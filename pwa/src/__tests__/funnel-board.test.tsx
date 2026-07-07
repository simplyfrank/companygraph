// funnel-pipeline-modeling T-09 (design §6.3–§6.6 — AC-12, AC-19 tsx half; FR-13).
// Ready state: picker, ordered stage board, per-transition + overall conversion;
// the view root is a ViewRegion landmark; DOM-order keyboard reachability.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { FunnelBoard } from "@/views/business/FunnelBoard";

const OPERATOR_ROOT_ID = "op-root-1";

function operatorModel() {
  return {
    id: OPERATOR_ROOT_ID,
    name: "SaaS Operator",
    description: "",
    ordinal: 2,
    status: "active",
    isReference: false,
    moduleInstanceCount: 0,
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
    attributes: { saasOperatorRoot: true },
  };
}

const LIST_ROWS = [
  {
    id: "funnel-1",
    name: "Marketing Lead Funnel",
    description: "visitor → lead → mql",
    attributes_json: JSON.stringify({ modelId: OPERATOR_ROOT_ID }),
    stageCount: 3,
  },
];

const COMPOSITION_ROWS = [
  {
    funnelId: "funnel-1",
    funnelName: "Marketing Lead Funnel",
    stageId: "s1",
    stageName: "Visitor",
    stageAttrs: JSON.stringify({ stageOrder: 0 }),
    transitionAttrs: JSON.stringify({ conversionRate: 0.5, dropOffRate: 0.5 }),
    toStageId: "s2",
  },
  {
    funnelId: "funnel-1",
    funnelName: "Marketing Lead Funnel",
    stageId: "s2",
    stageName: "Lead",
    stageAttrs: JSON.stringify({ stageOrder: 1 }),
    transitionAttrs: JSON.stringify({ conversionRate: 0.4, dropOffRate: 0.6 }),
    toStageId: "s3",
  },
  {
    funnelId: "funnel-1",
    funnelName: "Marketing Lead Funnel",
    stageId: "s3",
    stageName: "MQL",
    stageAttrs: JSON.stringify({ stageOrder: 2 }),
    transitionAttrs: null,
    toStageId: null,
  },
];

function mockFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/query/cypher")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const stmt: string = body.statement ?? "";
      // The listing read filters on CONTAINS; the composition read anchors on id.
      const rows = stmt.includes("CONTAINS $rootIdNeedle") ? LIST_ROWS : COMPOSITION_ROWS;
      return new Response(JSON.stringify({ rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/v1/models")) {
      return new Response(JSON.stringify([operatorModel()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

describe("AC-12/AC-19: FunnelBoard ready state", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockFetch();
  });
  afterEach(() => cleanup());

  async function renderReady() {
    render(
      <ActiveModelProvider>
        <FunnelBoard route={{ surface: "insights", tab: "funnels", params: {} } as never} />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("funnel-picker")).toBeTruthy());
    fireEvent.change(screen.getByTestId("funnel-picker"), { target: { value: "funnel-1" } });
    await waitFor(() => expect(screen.getByTestId("funnel-stage-board")).toBeTruthy());
  }

  test("AC-12: renders picker + ordered stages + per-transition conversion", async () => {
    await renderReady();
    const cards = screen.getAllByTestId("funnel-stage-card");
    expect(cards).toHaveLength(3);
    // stageOrder ordering: Visitor, Lead, MQL
    expect(cards[0]!.textContent).toContain("Visitor");
    expect(cards[1]!.textContent).toContain("Lead");
    expect(cards[2]!.textContent).toContain("MQL");
    const convRates = screen.getAllByTestId("funnel-conversion-rate").map((n) => n.textContent);
    expect(convRates).toContain("50.0%");
    expect(convRates).toContain("40.0%");
  });

  test("AC-12: overall conversion = product (0.5 × 0.4 = 20.0%)", async () => {
    await renderReady();
    expect(screen.getByTestId("funnel-overall-value").textContent).toBe("20.0%");
  });

  test("AC-19: the view root is a ViewRegion landmark labelled 'Funnel board'", async () => {
    await renderReady();
    expect(screen.getByRole("region", { name: "Funnel board" })).toBeTruthy();
  });

  test("AC-19: move-up/down controls are native buttons (keyboard-reachable)", async () => {
    await renderReady();
    const moveUps = screen.getAllByTestId("funnel-move-up");
    expect(moveUps).toHaveLength(3);
    expect(moveUps.every((b) => b.tagName === "BUTTON")).toBe(true);
    // First stage's move-up is disabled (top of the chain).
    expect((moveUps[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
