// saas-metric-library T-09 (design §6.4 + review-design.md C-03 — FR-11,
// UX-01; AC-13, AC-14, AC-15). MetricLibrary loading / empty / error states.
// C-03: the empty-state copy prompts `bun run seed:saas-metric-library` (pinned
// exact string). Error state offers a retry that refetches.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { MetricLibrary } from "@/views/business/MetricLibrary";

function modelsResponse() {
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AC-13/14/15: MetricLibrary states", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("AC-13: loading state while the cypher read is in flight", async () => {
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
        <MetricLibrary />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Loading metrics/i)).toBeTruthy();
    });
    resolveCypher(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
  });

  test("AC-14: empty state prompts `bun run seed:saas-metric-library` (C-03)", async () => {
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
        <MetricLibrary />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("metric-library-empty")).toBeTruthy();
    });
    expect(screen.getByText(/seed:saas-metric-library/i)).toBeTruthy();
  });

  test("AC-15: error state + retry that refetches", async () => {
    let cypherCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        cypherCalls++;
        if (cypherCalls === 1) {
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "boom" } }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: "m1",
                name: "MRR",
                description: "d",
                attributes_json: JSON.stringify({
                  formula: "sum", unit: "currency", category: "revenue", benchmark: "grow",
                }),
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <MetricLibrary />
      </ActiveModelProvider>,
    );

    const retry = await screen.findByTestId("error-retry");
    expect(retry).toBeTruthy();

    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByTestId("metric-library-grid")).toBeTruthy();
    });
    expect(cypherCalls).toBe(2);
  });
});
