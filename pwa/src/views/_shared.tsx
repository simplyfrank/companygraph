import type { ReactNode } from "react";

import styles from "./_shared.module.css";

export function ViewHeader({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className={styles.head}>
      <h1 className={styles.h1}>{title}</h1>
      {lede && <p className={styles.lede}>{lede}</p>}
    </header>
  );
}

export function SecLabel({ children }: { children: ReactNode }) {
  return <div className={styles.secLabel}>{children}</div>;
}

export function Loading({ what }: { what: string }) {
  return <div className={styles.state}>Loading {what}…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className={`${styles.state} ${styles.error}`}>Error: {message}</div>;
}
