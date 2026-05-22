import styles from "./SLAchip.module.css";

type Tone = "neutral" | "good" | "warn" | "breach";

interface SLAchipProps {
  tone?: Tone;
  label: string;
  value?: string;
}

export function SLAchip({ tone = "neutral", label, value }: SLAchipProps) {
  return (
    <span className={`${styles.sla} ${styles[tone]}`}>
      <span className={styles.dot} aria-hidden />
      <span>{label}</span>
      {value && <strong>{value}</strong>}
    </span>
  );
}
