import styles from "./TopBar.module.css";
import type { Surface } from "../route.js";

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
  onSearch?: () => void;
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
  onSearch,
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
            return (
              <button
                key={s.id}
                className={className}
                onClick={() => onSurface?.(s.id)}
              >
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className={styles.spacer}>
        {onSearch && (
          <button
            className={styles.search}
            onClick={onSearch}
            aria-label="Search"
            title="Search"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

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
