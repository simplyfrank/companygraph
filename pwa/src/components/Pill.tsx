import type { ReactNode } from "react";
import styles from "./Pill.module.css";

type Tone = "neutral" | "accent" | "good" | "warn" | "danger";

interface PillProps {
  tone?: Tone;
  children: ReactNode;
}

export function Pill({ tone = "neutral", children }: PillProps) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>;
}
