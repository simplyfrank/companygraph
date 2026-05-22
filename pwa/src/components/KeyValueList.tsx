import type { ReactNode } from "react";
import styles from "./KeyValueList.module.css";

interface KeyValueListProps {
  rows: Array<{ label: string; value: ReactNode }>;
}

export function KeyValueList({ rows }: KeyValueListProps) {
  return (
    <dl className={styles.kvs}>
      {rows.map((row, i) => (
        <div key={i} className={styles.row}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
