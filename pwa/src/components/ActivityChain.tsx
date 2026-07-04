import { SLAchip } from "./SLAchip";
import { Pill } from "./Pill";
import styles from "./ActivityChain.module.css";

interface SLA {
  tone?: "neutral" | "good" | "warn" | "breach";
  label: string;
  value?: string;
}

interface Step {
  id: string;
  name: string;
  sub?: string;
  slas?: SLA[];
  transition?: { label: string; tone?: "neutral" | "accent" | "good" | "warn" | "danger" };
  meta?: string;
}

interface ActivityChainProps {
  title?: string;
  id?: string;
  steps: Step[];
}

export function ActivityChain({ title, id, steps }: ActivityChainProps) {
  return (
    <section className={styles.wrap}>
      {(title || id) && (
        <h2 className={styles.h2}>
          {title}
          {id && <span className={styles.idLabel}>{id}</span>}
        </h2>
      )}
      <ol className={styles.chain}>
        {steps.map((step, i) => (
          <li key={step.id} className={styles.step}>
            <span className={styles.n}>{i + 1}</span>
            <div className={styles.body}>
              <div className={styles.name}>{step.name}</div>
              {step.sub && <div className={styles.sub}>{step.sub}</div>}
              {step.slas && step.slas.length > 0 && (
                <div className={styles.slaRow}>
                  {step.slas.map((s, j) => (
                    <SLAchip key={j} {...(s.tone !== undefined ? { tone: s.tone } : {})} label={s.label} {...(s.value !== undefined ? { value: s.value } : {})} />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.trans}>
              {step.transition && (
                <Pill tone={step.transition.tone ?? "neutral"}>{step.transition.label}</Pill>
              )}
              {step.meta && <small>{step.meta}</small>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
