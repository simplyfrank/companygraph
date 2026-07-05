// key-activity-optimizer T-19 (DD-11, FR-12, UX-02/05) — the additive
// catalog DataTable sort extension. Pins the four-point contract:
//   (a) prop-less render matches the pre-extension markup — plain
//       <th>{label}</th> (no button, no aria-sort), index-keyed rows —
//       so every existing consumer renders unchanged;
//   (b) a `sortable` column renders a native header <button> inside
//       <th aria-sort> reflecting the CONTROLLED `sort` prop;
//   (c) activating the header (mouse click; keyboard Enter/Space come
//       free with the native button — asserted via focus + activation)
//       calls onSort(columnId) — sort logic/state stay in the consumer;
//   (d) getRowKey drives row keys: DOM row identity follows the row
//       across a re-order (index keys would pin identity to position).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { DataTable } from "../components/DataTable";

const COLUMNS = [
  { id: "name", label: "Name" },
  { id: "score", label: "Score", kind: "num" as const },
];

const ROWS = [
  { name: "alpha", score: "1.00" },
  { name: "beta", score: "2.00" },
];

describe("DataTable catalog sort extension (T-19, DD-11)", () => {
  beforeEach(() => {
    cleanup();
  });

  test("(a) prop-less render keeps the pre-extension markup: plain <th> labels, no button, no aria-sort, index-keyed rows", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    for (const th of headers) {
      expect(th.hasAttribute("aria-sort")).toBe(false);
      expect(within(th).queryByRole("button")).toBeNull();
    }
    expect(headers[0]!.textContent).toBe("Name");
    expect(screen.getAllByRole("row")).toHaveLength(3); // 1 head + 2 body
  });

  test("(b) a sortable column renders a native header button inside <th aria-sort> reflecting the controlled sort prop", () => {
    const { rerender } = render(
      <DataTable
        columns={[{ ...COLUMNS[0]!, sortable: true }, COLUMNS[1]!]}
        rows={ROWS}
        sort={{ column: "name", dir: "asc" }}
      />,
    );
    const nameBtn = screen.getByRole("button", { name: /Name/ });
    expect(nameBtn.tagName).toBe("BUTTON");
    expect(nameBtn.getAttribute("type")).toBe("button"); // native — Enter/Space for free
    const nameTh = nameBtn.closest("th")!;
    expect(nameTh.getAttribute("aria-sort")).toBe("ascending");

    rerender(
      <DataTable
        columns={[{ ...COLUMNS[0]!, sortable: true }, COLUMNS[1]!]}
        rows={ROWS}
        sort={{ column: "name", dir: "desc" }}
      />,
    );
    expect(nameBtn.closest("th")!.getAttribute("aria-sort")).toBe("descending");

    // A sortable column that is NOT the sorted one carries aria-sort="none";
    // a non-sortable column carries no aria-sort and no button.
    rerender(
      <DataTable
        columns={[{ ...COLUMNS[0]!, sortable: true }, COLUMNS[1]!]}
        rows={ROWS}
        sort={{ column: "score", dir: "desc" }}
      />,
    );
    expect(screen.getByRole("button", { name: /Name/ }).closest("th")!.getAttribute("aria-sort")).toBe("none");
    const scoreTh = screen.getAllByRole("columnheader")[1]!;
    expect(scoreTh.hasAttribute("aria-sort")).toBe(false);
    expect(within(scoreTh).queryByRole("button")).toBeNull();
  });

  test("(c) activating the header button calls onSort with the column id (mouse and keyboard focus + activation)", () => {
    const onSort = vi.fn();
    render(
      <DataTable
        columns={COLUMNS.map((c) => ({ ...c, sortable: true }))}
        rows={ROWS}
        sort={{ column: "name", dir: "asc" }}
        onSort={onSort}
      />,
    );
    const scoreBtn = screen.getByRole("button", { name: /Score/ });
    fireEvent.click(scoreBtn); // mouse
    expect(onSort).toHaveBeenCalledWith("score");

    // Keyboard: the native button is focusable; Enter/Space activation is
    // the browser-native click synthesis — activate on the focused element.
    const nameBtn = screen.getByRole("button", { name: /Name/ });
    nameBtn.focus();
    expect(document.activeElement).toBe(nameBtn);
    fireEvent.click(document.activeElement!);
    expect(onSort).toHaveBeenCalledWith("name");
    expect(onSort).toHaveBeenCalledTimes(2);
  });

  test("(d) getRowKey drives row keys: DOM row identity follows the row across a re-order", () => {
    const keyed = (rows: typeof ROWS) => (
      <DataTable columns={COLUMNS} rows={rows} getRowKey={(r) => String(r.name)} />
    );
    const { rerender } = render(keyed(ROWS));
    const alphaRow = screen.getByText("alpha").closest("tr")!;

    rerender(keyed([ROWS[1]!, ROWS[0]!])); // re-ordered
    const bodyRows = screen.getAllByRole("row").slice(1);
    // With getRowKey, React moves the SAME element node; with index keys
    // the first tr would have been reused in place for "beta".
    expect(bodyRows[1]).toBe(alphaRow);
    expect(bodyRows[0]!.textContent).toContain("beta");
  });
});
