// kpi-okr-governance T-19 — STRICT jsdom pin for OkrManagement (AC-14,
// AC-15). The legacy error-scenarios/exec/okr-management suite stubs
// /api/v1/okrs + /query/cypher with a soft either/or and stays green by
// leniency, not by design (design §8/N-03) — THIS file carries the
// strict assertions: unfiltered /api/v1/okr-directives is the only data
// source, zero /query/cypher traffic, rows ordered/dated from createdAt,
// empty-state testid on {rows:[]}, ErrorState on 500.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { ExecOkrManagement } from "@/views/exec/OkrManagement";

const DIRECTIVES = [
  {
    id: "0197b000-0000-7000-8000-000000000002",
    name: "FY26 Q3 cycle",
    description: "newer directive",
    attributes: {
      cycle_name: "FY26-Q3",
      cycle_start: "2026-07-01",
      cycle_end: "2026-09-30",
      status: "active",
      review_cadence: "monthly",
    },
    createdAt: "2026-06-20T09:00:00.000Z",
    updatedAt: "2026-06-20T09:00:00.000Z",
  },
  {
    id: "0197b000-0000-7000-8000-000000000001",
    name: "FY26 Q2 cycle",
    description: "older directive",
    attributes: {
      cycle_name: "FY26-Q2",
      cycle_start: "2026-04-01",
      cycle_end: "2026-06-30",
      status: "review",
      review_cadence: "weekly",
    },
    createdAt: "2026-03-15T09:00:00.000Z",
    updatedAt: "2026-03-15T09:00:00.000Z",
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => handler(String(input)));
}

describe("Exec · OkrManagement · strict REST pin (AC-14/AC-15)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("loads from unfiltered /okr-directives only; rows ordered/dated from createdAt; zero cypher", async () => {
    const spy = mockFetch((url) => {
      if (url.includes("/api/v1/okr-directives")) {
        // Strict: the request must be the UNFILTERED form.
        expect(url).not.toMatch(/domain_id|product_id/);
        return json({ rows: DIRECTIVES });
      }
      return json({ rows: [] });
    });

    render(<ExecOkrManagement />);
    expect(screen.getByText(/loading okr management/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("FY26-Q3")).toBeInTheDocument();
      expect(screen.getByText("FY26-Q2")).toBeInTheDocument();
    });

    // Created column derives from the mapped camelCase createdAt.
    expect(screen.getByText(new Date(DIRECTIVES[0]!.createdAt).toLocaleDateString())).toBeInTheDocument();

    // Server order (createdAt DESC) is preserved: Q3 row before Q2 row.
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells.indexOf("FY26-Q3")).toBeLessThan(cells.indexOf("FY26-Q2"));

    // STRICT: no /query/cypher and no legacy /api/v1/okrs traffic.
    const urls = spy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/query/cypher"))).toBe(false);
    expect(urls.some((u) => u.includes("/api/v1/okrs"))).toBe(false);
    expect(urls.some((u) => u.includes("/api/v1/okr-directives"))).toBe(true);
  });

  test("{rows:[]} renders the distinct empty state (AC-15)", async () => {
    mockFetch((url) => {
      if (url.includes("/api/v1/okr-directives")) return json({ rows: [] });
      return json({ rows: [] });
    });

    await act(async () => {
      render(<ExecOkrManagement />);
    });

    await waitFor(() => {
      const empty = screen.getByTestId("empty-state");
      expect(empty).toBeInTheDocument();
      expect(empty.textContent).toMatch(/no okr cycles yet/i);
    });
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("500 renders ErrorState (AC-15)", async () => {
    mockFetch((url) => {
      if (url.includes("/api/v1/okr-directives")) {
        return json({ error: { code: "neo4j_unreachable", message: "boom" } }, 500);
      }
      return json({ rows: [] });
    });

    await act(async () => {
      render(<ExecOkrManagement />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });
});
