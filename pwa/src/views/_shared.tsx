import type { ReactNode } from "react";
import type { Route } from "../route";

import styles from "./_shared.module.css";

export function ViewHeader({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className={styles.head} data-testid="view-header">
      <h1 className={styles.h1} data-testid="view-header-title">{title}</h1>
      {lede && <p className={styles.lede} data-testid="view-header-lede">{lede}</p>}
    </header>
  );
}

export function SecLabel({ children }: { children: ReactNode }) {
  return <div className={styles.secLabel}>{children}</div>;
}

export function Loading({ what }: { what: string }) {
  return <div className={styles.state}>Loading {what}…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className={`${styles.state} ${styles.error}`} data-testid="error-state">Error: {message}</div>;
}

// FR-14 / AC-11 — deep-link 404 panel. Mounted when an entity-detail
// view's `api.get*(id)` returns `404 not_found`, or when the dispatcher
// can't resolve a surface/tab combination. Always renders a tappable
// "Back to Domains" link so the user is never stranded on a blank
// screen.
export function NotFoundPanel({ route }: { route?: Route }) {
  const entityKind =
    route?.tab === "journey-detail" || route?.tab === "journey-graph"
      ? "journey"
      : route?.tab === "activities"
      ? "activity"
      : route?.tab === "systems"
      ? "system"
      : route?.tab === "roles"
      ? "role"
      : route?.tab === "locations"
      ? "location"
      : route?.tab === "domains"
      ? "domain"
      : "entity";
  return (
    <div className={styles.state} role="alert" data-testid="not-found-panel">
      <ViewHeader title="Not found" />
      <p>
        We couldn't find that {entityKind}
        {route?.entityId ? (
          <>
            {" "}
            <code data-testid="not-found-id">{route.entityId}</code>
          </>
        ) : null}
        .
      </p>
      <p>
        <a href="#/explorer/domains" data-testid="not-found-back">
          ← Back to Domains
        </a>
      </p>
    </div>
  );
}
