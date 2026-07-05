import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

type ColKind = "text" | "num" | "id";

interface Column {
  id: string;
  label: string;
  align?: "left" | "right";
  kind?: ColKind;
  // key-activity-optimizer T-19 (DD-11, FR-12) — additive controlled-sort
  // extension. A sortable column renders <th aria-sort> wrapping a native
  // <button> (Enter/Space for free) that reports clicks via onSort. Sort
  // LOGIC and STATE never enter the catalog — the consumer owns both.
  // Without the new props the render output is identical to the
  // pre-extension component (plain <th>{label}</th>, index-keyed rows).
  sortable?: boolean;
}

interface DataTableProps {
  columns: Column[];
  rows: Array<Record<string, ReactNode>>;
  /** Controlled sort state (DD-11) — which column is sorted, and how. */
  sort?: { column: string; dir: "asc" | "desc" };
  /** Reports a sortable-header activation; the consumer re-sorts rows. */
  onSort?: (columnId: string) => void;
  /** Stable row identity under client-side re-sort; index keys otherwise. */
  getRowKey?: (row: Record<string, ReactNode>, i: number) => string;
}

export function DataTable({ columns, rows, sort, onSort, getRowKey }: DataTableProps) {
  return (
    <table className={styles.t}>
      <thead>
        <tr>
          {columns.map((c) =>
            c.sortable ? (
              <th
                key={c.id}
                style={c.align === "right" ? { textAlign: "right" } : undefined}
                aria-sort={
                  sort?.column === c.id
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => onSort?.(c.id)}
                >
                  {c.label}
                  <span aria-hidden="true" className={styles.sortGlyph}>
                    {sort?.column === c.id ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ) : (
              <th
                key={c.id}
                style={c.align === "right" ? { textAlign: "right" } : undefined}
              >
                {c.label}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={getRowKey ? getRowKey(r, i) : i}>
            {columns.map((c) => {
              const cellClass =
                c.kind === "num" ? styles.num :
                c.kind === "id" ? styles.id :
                undefined;
              return (
                <td key={c.id} className={cellClass}>
                  {r[c.id]}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
