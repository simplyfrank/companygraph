import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

type ColKind = "text" | "num" | "id";

interface Column {
  id: string;
  label: string;
  align?: "left" | "right";
  kind?: ColKind;
}

interface DataTableProps {
  columns: Column[];
  rows: Array<Record<string, ReactNode>>;
}

export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <table className={styles.t}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.id}
              style={c.align === "right" ? { textAlign: "right" } : undefined}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
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
