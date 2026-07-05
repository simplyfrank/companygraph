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

// Map error codes from the API's ErrorEnvelope to human sentences. The api
// client throws `Error("<status> <statusText> <path> <json-body>")`, so raw
// messages leak the wire payload into the UI unless humanized here.
const HUMAN_ERROR: Record<string, string> = {
  not_found: "We couldn't find that data.",
  neo4j_unreachable: "The graph database is temporarily unavailable — please retry.",
  internal_error: "Something went wrong on the server.",
  internal: "Something went wrong on the server.",
  invalid_payload: "That request wasn't valid.",
  unauthorized: "Please sign in to view that.",
  forbidden: "You don't have permission for that.",
  model_lifecycle_route_required:
    "That change must go through the model lifecycle actions, not a direct edit.",
};

// Turn a raw api-client error string into a human, non-technical sentence.
// Exported so views can reuse it; ErrorState calls it automatically.
export function humanizeApiError(raw: string): string {
  if (!raw) return "Something went wrong.";
  if (/abort/i.test(raw)) return "The request was cancelled — please retry.";
  const brace = raw.indexOf("{");
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(brace));
      const code: string | undefined = parsed?.error?.code;
      const msg: string | undefined = parsed?.error?.message;
      if (code === "not_found" && msg === "no route") return "This data isn't available yet.";
      if (code && HUMAN_ERROR[code]) return HUMAN_ERROR[code];
      if (msg && msg.length < 120 && !msg.startsWith("/")) return msg;
    } catch {
      /* fall through to status heuristics */
    }
  }
  const status = raw.match(/^(\d{3})\s/)?.[1];
  if (status === "404") return "We couldn't find that data.";
  if (status === "403") return "You don't have permission for that.";
  if (status === "401") return "Please sign in to view that.";
  if (status && status.startsWith("5")) return "The server had a problem — please retry.";
  return raw;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  const human = humanizeApiError(message);
  const showRaw = Boolean(import.meta.env?.DEV) && human !== message;
  return (
    <div className={`${styles.state} ${styles.error}`} data-testid="error-state" role="alert">
      <span>{human}</span>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry} data-testid="error-retry">
          Retry
        </button>
      )}
      {showRaw && (
        <details className={styles.errRaw}>
          <summary>Technical details</summary>
          <code>{message}</code>
        </details>
      )}
    </div>
  );
}

export function EmptyState({ what }: { what: string }) {
  return <div className={styles.state} data-testid="empty-state">No {what} found.</div>;
}

export function ViewRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section role="region" aria-label={label}>
      {children}
    </section>
  );
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
