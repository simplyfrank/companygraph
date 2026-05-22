import styles from "./BoundList.module.css";

type BoundKind = "executes" | "uses" | "at";

interface BoundItem {
  kind: BoundKind;
  label: string;
  href?: string;
}

interface BoundListProps {
  title?: string;
  items: BoundItem[];
}

export function BoundList({ title, items }: BoundListProps) {
  return (
    <div>
      {title && <h4 className={styles.title}>{title}</h4>}
      <ul className={styles.list}>
        {items.map((it, i) => (
          <li key={i} className={`${styles.item} ${styles[it.kind]}`}>
            <span className={styles.gly} aria-hidden />
            {it.href ? <a href={it.href}>{it.label}</a> : <span>{it.label}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
