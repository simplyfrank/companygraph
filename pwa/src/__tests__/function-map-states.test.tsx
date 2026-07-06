// saas-operator-foundation T-13 (AC-11, AC-12, AC-13) — FunctionMap
// loading / empty / error states. Error covers a runPassthrough failure /
// cap hit (C-04); retry refetches.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { FunctionMap } from "@/views/business/FunctionMap";
import { DEFAULT_ROUTE } from "@/route";

const OPERATOR_ROOT_ID = "0197a000-0000-7000-8000-0000000000aa";

const OPERATOR_MODEL = {
  id: OPERATOR_ROOT_ID,
  name: "SaaS Operator",
  description: "operator",
  ordinal: 2,
  status: "active",
  isReference: false,
  moduleInstanceCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  attributes: { saasOperatorRoot: true },
};

function modelsResponse() {
  return new Response(JSON.stringify([OPERATOR_MODEL]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AC-11/12/13: FunctionMap states", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("AC-11: loading skeleton while the cypher read is in flight", async () => {
    let resolveCypher: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        return new Promise<Response>((res) => {
          resolveCypher = res;
        });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <FunctionMap route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Loading functions/i)).toBeTruthy();
    });
    // release so no dangling promise
    resolveCypher(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
  });

  test("AC-12: empty state when the operator model has zero function domains", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <FunctionMap route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("function-map-empty")).toBeTruthy();
    });
    expect(screen.getByText(/seed:saas-operator/i)).toBeTruthy();
  });

  test("AC-13: error state + retry that refetches (C-04)", async () => {
    let cypherCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        cypherCalls++;
        if (cypherCalls === 1) {
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "cap hit" } }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ rows: [{ id: "d1", name: "Marketing", description: "m", journeyActivityCount: 1 }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <FunctionMap route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    const retry = await screen.findByTestId("error-retry");
    expect(retry).toBeTruthy();

    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByTestId("function-map-grid")).toBeTruthy();
    });
    expect(cypherCalls).toBe(2);
  });
});
