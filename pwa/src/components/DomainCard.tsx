import styles from "./DomainCard.module.css";

interface DomainCount {
  label: string;
  value: string | number;
  href?: string;
}

interface DomainCardProps {
  domain: { id: string; name: string; description?: string };
  counts: DomainCount[];
  href?: string;
  onSelect?: (id: string) => void;
}

export function DomainCard({ domain, counts, href, onSelect }: DomainCardProps) {
  const inner = (
    <>
      <h3 className={styles.title}>{domain.name}</h3>
      {domain.description && (
        <p className={styles.meta}>{domain.description}</p>
      )}
      <div className={styles.rows}>
        {counts.map((c, i) => (
          <div key={i} className={styles.row}>
            <span>{c.label}</span>
            {c.href ? (
              <a href={c.href}>{c.value}</a>
            ) : (
              <strong>{c.value}</strong>
            )}
          </div>
        ))}
      </div>
    </>
  );
  const handleClick = (e: React.MouseEvent): void => {
    if (onSelect) {
      e.preventDefault();
      onSelect(domain.id);
    }
  };

  if (href) {
    return (
      <a className={`${styles.card} ${styles.link}`} href={href} onClick={handleClick}>
        {inner}
      </a>
    );
  }
  return (
    <div className={styles.card} onClick={handleClick} role="button" tabIndex={0}>
      {inner}
    </div>
  );
}
