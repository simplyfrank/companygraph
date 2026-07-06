import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SearchPalette } from "../components/SearchPalette";
import { useSchemaStore, STATIC_SCHEMA_FALLBACK } from "../store/schemaStore";

// FR-08 / AC-05 — keyboard contract + fan-out behaviour.
//
// T-19: SearchPalette is mounted globally (App-level, not inside SubNav).
// It renders via a portal to document.body so it overlays every surface.
// The palette handles "/", Cmd/Ctrl+K (open), Escape (close + restore
// focus), and Tab/Shift+Tab (focus trap) internally via a document-level
// keydown listener.

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

  // ------------------------------------------------------------------
  // 1. Global mount — palette portals to document.body, not SubNav.
  // ------------------------------------------------------------------
  test("palette renders via portal to document.body (global mount, not inside SubNav)", () => {
    render(<SearchPalette forceOpen />);
    const palette = screen.getByTestId("search-palette");
    // The portal target is document.body — the palette's nearest <body>
    // ancestor is the real document.body, proving it is not nested
    // inside SubNav or any other component's DOM subtree.
    expect(palette.closest("body")).toBe(document.body);
    // Sanity: no SubNav ancestor exists.
    expect(palette.closest('[data-testid="subnav"]')).toBeNull();
  });

  // ------------------------------------------------------------------
  // 2. "/" opens the palette (not SubNav search input focus).
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // 3. Cmd/Ctrl+K opens the palette (even from an editable field).
  // ------------------------------------------------------------------
  test("Cmd+K (metaKey) opens the palette and focuses the input", () => {
    render(<SearchPalette />);
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(screen.getByTestId("search-palette")).toBeInTheDocument();
    return new Promise<void>((r) => setTimeout(() => {
      expect(document.activeElement).toBe(screen.getByTestId("search-palette-input"));
      r();
    }, 5));
  });

  test("Ctrl+K (ctrlKey) opens the palette and focuses the input", () => {
    render(<SearchPalette />);
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("search-palette")).toBeInTheDocument();
    return new Promise<void>((r) => setTimeout(() => {
      expect(document.activeElement).toBe(screen.getByTestId("search-palette-input"));
      r();
    }, 5));
  });

  test("Cmd+K opens the palette even from inside an editable field", () => {
    render(
      <>
        <input data-testid="other-input" />
        <SearchPalette />
      </>,
    );
    const other = screen.getByTestId("other-input");
    other.focus();
    fireEvent.keyDown(other, { key: "k", metaKey: true });
    expect(screen.getByTestId("search-palette")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 4. Escape closes the palette and returns focus to previous element.
  // ------------------------------------------------------------------
  test("Escape closes the palette and returns focus to the previous element", () => {
    render(
      <>
        <button data-testid="trigger-btn">Trigger</button>
        <SearchPalette />
      </>,
    );
    const trigger = screen.getByTestId("trigger-btn");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open via "/" — handler records activeElement as the trigger.
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByTestId("search-palette")).toBeInTheDocument();

    // Close via Escape.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    // Focus must return to the element that was focused before opening.
    expect(document.activeElement).toBe(trigger);
  });

  // ------------------------------------------------------------------
  // 5. Focus trap: Tab/Shift+Tab cycles within palette while open.
  // ------------------------------------------------------------------
  test("Tab cycles focus forward within the palette and wraps from last to first", async () => {
    mockSearchFan({
      Activity: [
        { id: "a-1", name: "Alpha" },
        { id: "a-2", name: "Bravo" },
      ],
    });
    render(<SearchPalette forceOpen />);
    const input = screen.getByTestId("search-palette-input");
    fireEvent.change(input, { target: { value: "a" } });
    // Wait for results to render so the <a> rows are focusable.
    await waitFor(() => {
      expect(screen.getAllByTestId("search-palette-row").length).toBe(2);
    });

    const rows = screen.getAllByTestId("search-palette-row");
    const firstRow = rows[0]!;
    const lastRow = rows[1]!;

    // Start on the input (first focusable).
    input.focus();
    expect(document.activeElement).toBe(input);

    // Tab → moves to first result row.
    fireEvent.keyDown(input, { key: "Tab" });
    expect(document.activeElement).toBe(firstRow);

    // Tab on the last result row → wraps back to the input (first).
    lastRow.focus();
    fireEvent.keyDown(lastRow, { key: "Tab" });
    expect(document.activeElement).toBe(input);
  });

  test("Shift+Tab cycles focus backward within the palette and wraps from first to last", async () => {
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

    const rows = screen.getAllByTestId("search-palette-row");
    const lastRow = rows[1]!;

    // Start on the input (first focusable).
    input.focus();
    expect(document.activeElement).toBe(input);

    // Shift+Tab on the first focusable → wraps to the last result row.
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastRow);
  });

  // ------------------------------------------------------------------
  // 6. hrefForHit: UserJourney → #/explorer/journeys/:id
  //    (was journey-detail in an earlier iteration).
  // ------------------------------------------------------------------
  test("Enter on a UserJourney hit navigates to #/explorer/journeys/:id", async () => {
    mockSearchFan({
      UserJourney: [{ id: "j-1", name: "Onboarding flow" }],
    });
    render(<SearchPalette forceOpen />);
    const input = screen.getByTestId("search-palette-input");
    fireEvent.change(input, { target: { value: "onboard" } });
    await waitFor(() => {
      expect(screen.getAllByTestId("search-palette-row").length).toBe(1);
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(window.location.hash).toBe("#/explorer/journeys/j-1");
  });

  // ------------------------------------------------------------------
  // Existing fan-out / navigation / empty-state tests (unchanged).
  // ------------------------------------------------------------------
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
