import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Typeahead } from "../components/Typeahead";

// FR-17 / AC-14 — Typeahead returns top 20 within 200 ms and offers a
// "Create new" shortcut that POSTs + binds in one click.

describe("Typeahead (FR-17 / AC-14)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("renders the input with autocomplete off (Safari Smart Search suppression)", () => {
    render(<Typeahead label="Role" onSelect={() => {}} />);
    const input = screen.getByTestId("typeahead-role-input");
    expect(input).toHaveAttribute("autoComplete", "off");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
  });

  test("typing returns search rows from api.search within 200 ms (AC-14 latency)", async () => {
    let fetchedAt = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/api/v1/query/search")) {
        fetchedAt = performance.now();
        return new Response(
          JSON.stringify({
            rows: [
              { id: "r-1", name: "Cashier", label: "Role" },
              { id: "r-2", name: "Casher Supervisor", label: "Role" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    const start = performance.now();
    render(<Typeahead label="Role" onSelect={() => {}} debounceMs={50} />);
    const input = screen.getByTestId("typeahead-role-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cash" } });

    const rows = await screen.findAllByTestId("typeahead-row");
    expect(rows.length).toBe(2);
    // The 200ms budget covers debounce + fetch round-trip; in unit-tests
    // we mock fetch so the only real delay is debounceMs (50).
    expect(fetchedAt - start).toBeLessThan(200);
  });

  test("clicking a row fires onSelect with the hit and closes the listbox", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ rows: [{ id: "r-1", name: "Cashier", label: "Role" }] }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    render(<Typeahead label="Role" onSelect={onSelect} debounceMs={1} />);
    const input = screen.getByTestId("typeahead-role-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cas" } });
    const row = await screen.findByTestId("typeahead-row");
    fireEvent.mouseDown(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: "r-1", name: "Cashier" });
    await waitFor(() => {
      expect(screen.queryByTestId("typeahead-role-listbox")).not.toBeInTheDocument();
    });
  });

  test("'Create new' POSTs and calls onCreate in one click (AC-14)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      calls.push({ url: u, init: init as RequestInit | undefined });
      if (u.includes("/api/v1/query/search")) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      if (u.includes("/api/v1/nodes/")) {
        return new Response(
          JSON.stringify({ id: "r-new", name: "Floor Lead" }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(
      <Typeahead label="Role" onSelect={onSelect} onCreate={onCreate} debounceMs={1} />,
    );
    const input = screen.getByTestId("typeahead-role-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Floor Lead" } });

    const createRow = await screen.findByTestId("typeahead-create-new");
    fireEvent.mouseDown(createRow);

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      id: "r-new",
      name: "Floor Lead",
      label: "Role",
    });
    // Verify exactly one POST against /nodes/Role
    const post = calls.find((c) => c.init?.method === "POST");
    expect(post?.url).toContain("/api/v1/nodes/Role");
    const body = JSON.parse(String(post?.init?.body));
    expect(body.name).toBe("Floor Lead");
  });

  test("'Create new' is suppressed when an exact name match exists in the results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ rows: [{ id: "r-1", name: "Cashier", label: "Role" }] }),
        { status: 200 },
      ),
    );
    const onCreate = vi.fn();
    render(
      <Typeahead label="Role" onSelect={() => {}} onCreate={onCreate} debounceMs={1} />,
    );
    const input = screen.getByTestId("typeahead-role-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Cashier" } });
    await screen.findByTestId("typeahead-row");
    expect(screen.queryByTestId("typeahead-create-new")).not.toBeInTheDocument();
  });

  test("ArrowDown + Enter selects the highlighted row", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rows: [
            { id: "r-1", name: "Cashier", label: "Role" },
            { id: "r-2", name: "Cashier Lead", label: "Role" },
          ],
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    render(<Typeahead label="Role" onSelect={onSelect} debounceMs={1} />);
    const input = screen.getByTestId("typeahead-role-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cas" } });
    await screen.findAllByTestId("typeahead-row");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]?.id).toBe("r-2");
  });

  test("Escape closes the listbox without selecting", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ rows: [{ id: "r-1", name: "Cashier", label: "Role" }] }),
        { status: 200 },
      ),
    );
    render(<Typeahead label="Role" onSelect={() => {}} debounceMs={1} />);
    const input = screen.getByTestId("typeahead-role-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cas" } });
    await screen.findByTestId("typeahead-row");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("typeahead-role-listbox")).not.toBeInTheDocument(),
    );
  });
});
