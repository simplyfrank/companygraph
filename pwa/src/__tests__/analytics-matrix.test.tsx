import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { AnalyticsMatrix } from "../views/analytics/Matrix";

// cto-analytics T-08 (FR-02, AC-02).
//
// AC-02 binding recipe (design §2 Open-3 / N-04): the domain↔system matrix at
// `#/analytics/matrix` renders rows × columns; every cell links to the
// underlying activity list in process-explorer-ui with distinct disambiguated
// query params `?system_id=:sid&domain_id=:did`. This suite also covers the
// two other FR-02 completions T-08 owns: the domain/system pre-filters and the
// virtualised grid (only the rows inside the scroll viewport are mounted).

interface CellRow {
  domainId: string;
  domainName: string;
  systemId: string;
  systemName: string;
  count: number;
}

// Two domains × two systems; POS is used heavily by Retail, OMS by Fulfilment.
const SMALL_ROWS: CellRow[] = [
  { domainId: "d-retail", domainName: "Retail", systemId: "s-pos", systemName: "POS", count: 7 },
  { domainId: "d-retail", domainName: "Retail", systemId: "s-oms", systemName: "OMS", count: 2 },
  { domainId: "d-fulfil", domainName: "Fulfilment", systemId: "s-oms", systemName: "OMS", count: 5 },
];

function mockCypher(rows: CellRow[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("/api/v1/query/cypher")) {
      // Echo the caller's projection: the view maps rows straight onto CellRow.
      void init;
      return new Response(JSON.stringify({ rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
}

describe("cto-analytics T-08 — matrix cell deep-links (AC-02)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockCypher(SMALL_ROWS);
  });
  afterEach(() => cleanup());

  test("every cell links to the explorer activity list carrying system_id + domain_id", async () => {
    render(<AnalyticsMatrix />);
    const cells = await screen.findAllByTestId("matrix-cell");
    // 2 domains × 2 systems = 4 cells (including the zero cell).
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      const href = cell.getAttribute("href")!;
      expect(href.startsWith("#/explorer/activities?")).toBe(true);
      const qs = new URLSearchParams(href.split("?")[1]);
      // AC-02 / N-04: distinct disambiguated param names, not `system`/`domain`.
      expect(qs.get("system_id")).toBe(cell.getAttribute("data-system-id"));
      expect(qs.get("domain_id")).toBe(cell.getAttribute("data-domain-id"));
      expect(qs.has("system")).toBe(false);
      expect(qs.has("domain")).toBe(false);
    }
  });

  test("a specific cell (Retail × POS) deep-links to the right pair", async () => {
    render(<AnalyticsMatrix />);
    await screen.findAllByTestId("matrix-cell");
    const cell = screen
      .getAllByTestId("matrix-cell")
      .find((c) => c.getAttribute("data-domain-id") === "d-retail" && c.getAttribute("data-system-id") === "s-pos")!;
    expect(cell).toBeTruthy();
    expect(cell.getAttribute("href")).toBe(
      "#/explorer/activities?system_id=s-pos&domain_id=d-retail",
    );
    expect(cell.textContent).toBe("7");
  });
});

describe("cto-analytics T-08 — matrix pre-filters (FR-02)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockCypher(SMALL_ROWS);
  });
  afterEach(() => cleanup());

  test("domain filter cuts the matrix to a single row before render", async () => {
    render(<AnalyticsMatrix />);
    await screen.findByTestId("domain-filter");

    // Both domains present initially (2 domains × 2 systems = 4 cells).
    expect(screen.getAllByTestId("matrix-cell")).toHaveLength(4);

    fireEvent.change(screen.getByTestId("domain-filter"), { target: { value: "d-retail" } });
    await waitFor(() => {
      // One domain row × two systems = 2 cells; all carry domain_id d-retail.
      const cells = screen.getAllByTestId("matrix-cell");
      expect(cells).toHaveLength(2);
      for (const c of cells) expect(c.getAttribute("data-domain-id")).toBe("d-retail");
    });
  });

  test("system filter cuts the columns", async () => {
    render(<AnalyticsMatrix />);
    await screen.findByTestId("system-filter");

    fireEvent.change(screen.getByTestId("system-filter"), { target: { value: "s-oms" } });
    await waitFor(() => {
      const cells = screen.getAllByTestId("matrix-cell");
      // 2 domains × 1 system = 2 cells, all OMS.
      expect(cells).toHaveLength(2);
      for (const c of cells) expect(c.getAttribute("data-system-id")).toBe("s-oms");
    });
  });
});

describe("cto-analytics T-08 — virtualised grid (FR-02)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("small matrices render every row (no virtualisation)", async () => {
    mockCypher(SMALL_ROWS);
    render(<AnalyticsMatrix />);
    const scroll = await screen.findByTestId("matrix-scroll");
    expect(scroll.getAttribute("data-virtualised")).toBe("0");
    // All two domain rows are mounted.
    const bodyRows = within(scroll).getAllByRole("row");
    expect(bodyRows.length).toBeGreaterThanOrEqual(2);
  });

  test("large matrices switch to windowed rendering (only a viewport slice mounts)", async () => {
    // 120 domains × 1 system: above the 40-row virtualise threshold.
    const many: CellRow[] = [];
    for (let i = 0; i < 120; i++) {
      many.push({
        domainId: `d-${i}`,
        domainName: `Domain ${String(i).padStart(3, "0")}`,
        systemId: "s-pos",
        systemName: "POS",
        count: (i % 9) + 1,
      });
    }
    mockCypher(many);
    render(<AnalyticsMatrix />);
    const scroll = await screen.findByTestId("matrix-scroll");
    expect(scroll.getAttribute("data-virtualised")).toBe("1");
    // Windowed: far fewer than 120 cells are mounted at once (jsdom reports a
    // zero-height viewport → the fallback window of ~20 rows + overscan).
    await waitFor(() => {
      const cells = screen.getAllByTestId("matrix-cell");
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThan(120);
    });
  });
});
