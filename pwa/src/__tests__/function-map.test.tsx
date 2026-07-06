// saas-operator-foundation T-13 (AC-10) — FunctionMap ready state: six
// domains with the filtered journeyActivityCount (C-03) from a mocked
// query/cypher; each card deep-links to #/explorer/domain-detail/<id>; the
// view root is a ViewRegion landmark (N-04).

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { FunctionMap } from "@/views/business/FunctionMap";
import { DEFAULT_ROUTE } from "@/route";

const OPERATOR_ROOT_ID = "0197a000-0000-7000-8000-0000000000aa";

const MODELS = [
  {
    id: "0197a000-0000-7000-8000-000000000001",
    name: "Business Model #1",
    description: "retail",
    ordinal: 1,
    status: "active",
    isReference: true,
    moduleInstanceCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    attributes: {},
  },
  {
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
  },
];

const DOMAIN_ROWS = [
  { id: "d1", name: "Customer Success", description: "cs", journeyActivityCount: 3 },
  { id: "d2", name: "Finance & Accounting", description: "fin", journeyActivityCount: 5 },
  { id: "d3", name: "Marketing", description: "mkt", journeyActivityCount: 0 },
  { id: "d4", name: "Platform Ops", description: "ops", journeyActivityCount: 7 },
  { id: "d5", name: "Product & Delivery", description: "prd", journeyActivityCount: 2 },
  { id: "d6", name: "Sales", description: "sal", journeyActivityCount: 4 },
];

function mockFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/query/cypher")) {
      return new Response(JSON.stringify({ rows: DOMAIN_ROWS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/v1/models")) {
      return new Response(JSON.stringify(MODELS), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

describe("AC-10: FunctionMap ready state", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockFetch();
  });
  afterEach(() => cleanup());

  test("renders six function cards with filtered counts + deep links", async () => {
    render(
      <ActiveModelProvider>
        <FunctionMap route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("function-map-grid")).toBeTruthy();
    });

    const cards = screen.getAllByTestId("function-card");
    expect(cards).toHaveLength(6);

    // Filtered journey/activity counts surface (C-03).
    const counts = screen.getAllByTestId("function-count").map((el) => el.textContent);
    expect(counts).toEqual(["3", "5", "0", "7", "2", "4"]);

    // Each card deep-links into Explorer domain-detail for its domain.
    for (const domain of DOMAIN_ROWS) {
      const link = cards.find((c) => c.getAttribute("href")?.includes(domain.id));
      expect(link).toBeTruthy();
      expect(link!.getAttribute("href")).toBe(`#/explorer/domain-detail/${domain.id}`);
    }
  });

  test("view root is a ViewRegion landmark (N-04)", async () => {
    render(
      <ActiveModelProvider>
        <FunctionMap route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("region", { name: /function map/i })).toBeTruthy();
    });
  });
});
