import type { CSSProperties, ReactNode } from "react";
import type { TabGroup } from "../route";
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
  groups?: TabGroup[];
  activeTab?: string;
  onTab?: (id: string) => void;
  actions?: ReactNode;
}

const groupDividerStyle: CSSProperties = {
  borderLeft: "1px solid var(--border-subtle)",
};

export function SubNav({
  crumbs = [],
  tabs = [],
  groups,
  activeTab,
  onTab,
  actions,
}: SubNavProps) {
  // When groups are provided, render tabs grouped by their declared order,
  // inserting a visual divider before the first tab of each group after the
  // first. Tabs not referenced by any group are appended at the end.
  const groupedTabs: Array<{ tab: Tab; divider: boolean }> = [];
  if (groups && groups.length > 0) {
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const seen = new Set<string>();
    groups.forEach((g, gi) => {
      g.tabIds.forEach((id) => {
        const tab = byId.get(id);
        if (!tab) return;
        seen.add(id);
        groupedTabs.push({ tab, divider: gi > 0 && g.tabIds.indexOf(id) === 0 });
      });
    });
    tabs.forEach((t) => {
      if (!seen.has(t.id)) groupedTabs.push({ tab: t, divider: false });
    });
  }

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

      {groups && groups.length > 0
        ? groupedTabs.map(({ tab, divider }) => (
            <button
              key={tab.id}
              className={`${styles.tab}${tab.id === activeTab ? ` ${styles.tabActive}` : ""}`}
              style={divider ? groupDividerStyle : undefined}
              onClick={() => onTab?.(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))
        : tabs.map((t) => (
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
        {actions}
      </div>
    </nav>
  );
}
