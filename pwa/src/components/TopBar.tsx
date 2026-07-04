import styles from "./TopBar.module.css";

interface Surface {
  id: string;
  label: string;
  kbd?: string;
  href?: string;
}

interface TopBarProps {
  brand: string;
  env?: string;
  surfaces?: Surface[];
  activeSurface?: string;
  nodeCount?: number;
  edgeCount?: number;
  ontologyVersion?: string;
  user?: { name: string; initials: string };
  onSurface?: (id: string) => void;
}

export function TopBar({
  brand,
  env,
  surfaces = [],
  activeSurface,
  nodeCount,
  edgeCount,
  ontologyVersion,
  user,
  onSurface,
}: TopBarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.dot} />
        <span>{brand}</span>
      </div>

      {surfaces.length > 0 && (
        <nav className={styles.surfNav}>
          {surfaces.map((s) => {
            const className = `${styles.surf}${s.id === activeSurface ? ` ${styles.surfActive}` : ""}`;
            const content = (
              <>
                <span>{s.label}</span>
                {s.kbd && <span className={styles.kbd}>{s.kbd}</span>}
              </>
            );
            return s.href ? (
              <a key={s.id} className={className} href={s.href}>{content}</a>
            ) : (
              <button
                key={s.id}
                className={className}
                onClick={() => onSurface?.(s.id)}
              >
                {content}
              </button>
            );
          })}
        </nav>
      )}

      <div className={styles.spacer} />

      {(typeof nodeCount === "number" || typeof edgeCount === "number") && (
        <div className={styles.stat}>
          {typeof nodeCount === "number" && (
            <span><strong>{nodeCount}</strong> nodes</span>
          )}
          {typeof edgeCount === "number" && (
            <span><strong>{edgeCount}</strong> edges</span>
          )}
        </div>
      )}
      {ontologyVersion && (
        <div className={styles.version}>
          <span>ontology</span>
          <strong>{ontologyVersion}</strong>
        </div>
      )}
      {env && <div className={styles.env}>{env}</div>}
      {user && (
        <div className={styles.user} aria-label={user.name}>
          {user.initials}
        </div>
      )}
    </header>
  );
}
