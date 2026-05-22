import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, actions, children, className }: CardProps) {
  const root = `${styles.card}${className ? ` ${className}` : ""}`;
  if (title === undefined && !actions) {
    return (
      <div className={root}>
        <div className={styles.pad}>{children}</div>
      </div>
    );
  }
  return (
    <div className={root}>
      <div className={styles.head}>
        {title && <h3 className={styles.title}>{title}</h3>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div className={styles.pad}>{children}</div>
    </div>
  );
}
