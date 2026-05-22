import type { ReactNode, Ref } from "react";
import styles from "./SubNav.module.css";

interface Crumb {
  label: string;
  href?: string;
}

interface Tab {
  id: string;
  label: string;
}

interface SubNavProps {
  crumbs?: Crumb[];
  tabs?: Tab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  search?: { placeholder?: string; shortcut?: string };
  onSearch?: (value: string) => void;
  searchInputRef?: Ref<HTMLInputElement>;
  actions?: ReactNode;
}

export function SubNav({
  crumbs = [],
  tabs = [],
  activeTab,
  onTab,
  search,
  onSearch,
  searchInputRef,
  actions,
}: SubNavProps) {
  return (
    <nav className={styles.subnav}>
      {crumbs.length > 0 && (
        <div className={styles.crumb}>
          {crumbs.map((c, i) => (
            <span key={i}>
              {c.href ? <a href={c.href}>{c.label}</a> : <strong>{c.label}</strong>}
              {i < crumbs.length - 1 && <span aria-hidden> / </span>}
            </span>
          ))}
        </div>
      )}

      {tabs.map((t) => (
        <button
          key={t.id}
          className={`${styles.tab}${t.id === activeTab ? ` ${styles.tabActive}` : ""}`}
          onClick={() => onTab?.(t.id)}
          type="button"
        >
          {t.label}
        </button>
      ))}

      <div className={styles.right}>
        {search && (
          <label className={styles.searchWrap}>
            <input
              ref={searchInputRef}
              className={styles.search}
              placeholder={search.placeholder ?? "Search"}
              onChange={(e) => onSearch?.(e.currentTarget.value)}
            />
            {search.shortcut && <span className={styles.kbd}>{search.shortcut}</span>}
          </label>
        )}
        {actions}
      </div>
    </nav>
  );
}
