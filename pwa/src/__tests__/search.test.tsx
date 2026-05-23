import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SearchPalette } from "../components/SearchPalette";
import { useSchemaStore, STATIC_SCHEMA_FALLBACK } from "../store/schemaStore";

// FR-08 / AC-05 — keyboard contract + fan-out behaviour.

function seedSchema(): void {
  useSchemaStore.setState({
    schema: STATIC_SCHEMA_FALLBACK,
    etag: null,
    fetchedAt: Date.now(),
    loading: false,
    error: null,
  });
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockSearchFan(byLabel: Record<string, Array<{ id: string; name: string }>>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init: init as RequestInit | undefined });
    if (u.includes("/api/v1/query/search")) {
      const match = u.match(/label=([^&]+)/);
      const label = match ? decodeURIComponent(match[1]!) : "";
      const rows = (byLabel[label] ?? []).map((r) => ({ ...r, label }));
      return new Response(JSON.stringify({ rows }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
  return calls;
}

describe("SearchPalette — keyboard contract (AC-05)", () => {
  beforeEach(() => {
    seedSchema();
    vi.restoreAllMocks();
    // Reset hash so Enter-navigates assertion is meaningful.
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
  });

  test("'/' keypress opens the palette and focuses the input", () => {
    render(<SearchPalette />);
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "/" });
    const palette = screen.getByTestId("search-palette");
    expect(palette).toBeInTheDocument();
    // Defer one tick — focus is set in a setTimeout(0).
    return new Promise<void>((r) => setTimeout(() => {
      expect(document.activeElement).toBe(screen.getByTestId("search-palette-input"));
      r();
    }, 5));
  });

  test("'/' inside an editable field does NOT open the palette", () => {
    render(
      <>
        <input data-testid="other-input" />
        <SearchPalette />
      </>,
    );
    const other = screen.getByTestId("other-input");
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
  });

  test("Escape closes the palette", () => {
    render(<SearchPalette forceOpen />);
    expect(screen.getByTestId("search-palette")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
  });

  test("typing fans out one fetch per label and groups results", async () => {
    const calls = mockSearchFan({
      Activity: [{ id: "a-1", name: "Warehouse pick" }, { id: "a-2", name: "Warehouse pack" }],
      System: [{ id: "s-1", name: "WarehouseOMS" }],
    });
    render(<SearchPalette forceOpen />);
    const input = screen.getByTestId("search-palette-input");
    fireEvent.change(input, { target: { value: "ware" } });

    await waitFor(() => {
      expect(screen.getAllByTestId("search-palette-row").length).toBe(3);
    });

    const rows = screen.getAllByTestId("search-palette-row");
    // Activity group precedes System group per schema order.
    expect(rows[0].getAttribute("data-label")).toBe("Activity");
    expect(rows[2].getAttribute("data-label")).toBe("System");

    // One call per current label in the schema.
    const searchCalls = calls.filter((c) => c.url.includes("/api/v1/query/search"));
    expect(searchCalls.length).toBe(STATIC_SCHEMA_FALLBACK.nodeLabels.length);
  });

  test("ArrowDown / ArrowUp moves the selected row and Enter navigates", async () => {
    // Names chosen so alphabetical sort matches id order: "Alpha" < "Bravo".
    // ArrowDown moves selection from idx 0 (a-1/Alpha) to idx 1 (a-2/Bravo);
    // Enter navigates to a-2.
    mockSearchFan({
      Activity: [
        { id: "a-1", name: "Alpha" },
        { id: "a-2", name: "Bravo" },
      ],
    });
    render(<SearchPalette forceOpen />);
    const input = screen.getByTestId("search-palette-input");
    fireEvent.change(input, { target: { value: "a" } });
    await waitFor(() => {
      expect(screen.getAllByTestId("search-palette-row").length).toBe(2);
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(window.location.hash).toContain("#/explorer/activities/a-2");
  });

  test("empty-state message when nothing matches", async () => {
    mockSearchFan({});
    render(<SearchPalette forceOpen />);
    const input = screen.getByTestId("search-palette-input");
    fireEvent.change(input, { target: { value: "zzz" } });
    await waitFor(() => {
      expect(screen.getByTestId("search-palette-empty")).toBeInTheDocument();
    });
  });
});
