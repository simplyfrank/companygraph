// funnel-pipeline-modeling T-09 (design §6.4 + review-design C-01 — AC-13, AC-14,
// AC-15, and the client-filter half of AC-10; FR-13). Loading / empty / error
// (+retry) states, and the authoritative modelId client-side scope exclusion.

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

function renderBoard() {
  render(
    <ActiveModelProvider>
      <FunnelBoard route={{ surface: "insights", tab: "funnels", params: {} } as never} />
    </ActiveModelProvider>,
  );
}

describe("FunnelBoard view states", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("AC-14: empty state when the operator model has no funnels", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      if (url.includes("/api/v1/models")) {
        return new Response(JSON.stringify([operatorModel()]), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
    renderBoard();
    await waitFor(() => expect(screen.getByTestId("funnel-board-empty")).toBeTruthy());
  });

  test("AC-15: error state + retry refetches the listing", async () => {
    let listCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        listCalls++;
        if (listCalls === 1) {
          return new Response(JSON.stringify({ error: { code: "neo4j_unreachable" } }), {
            status: 500,
          });
        }
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      if (url.includes("/api/v1/models")) {
        return new Response(JSON.stringify([operatorModel()]), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
    renderBoard();
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeTruthy());
    fireEvent.click(screen.getByTestId("error-retry"));
    await waitFor(() => expect(screen.getByTestId("funnel-board-empty")).toBeTruthy());
    expect(listCalls).toBe(2);
  });

  test("AC-10 (client-filter authority, C-01): a retail-modelId funnel is excluded", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        // The coarse CONTAINS prefilter can leak a funnel whose id appears as a
        // substring; the client filter must drop any row whose modelId differs.
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: "op-funnel",
                name: "Operator Funnel",
                description: "",
                attributes_json: JSON.stringify({ modelId: OPERATOR_ROOT_ID }),
                stageCount: 2,
              },
              {
                id: "retail-funnel",
                name: "Retail Funnel",
                description: "",
                attributes_json: JSON.stringify({ modelId: "retail-root" }),
                stageCount: 1,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/v1/models")) {
        return new Response(JSON.stringify([operatorModel()]), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
    renderBoard();
    await waitFor(() => expect(screen.getByTestId("funnel-picker")).toBeTruthy());
    const picker = screen.getByTestId("funnel-picker") as HTMLSelectElement;
    const optionTexts = Array.from(picker.options).map((o) => o.textContent ?? "");
    expect(optionTexts.some((t) => t.includes("Operator Funnel"))).toBe(true);
    expect(optionTexts.some((t) => t.includes("Retail Funnel"))).toBe(false);
  });
});
