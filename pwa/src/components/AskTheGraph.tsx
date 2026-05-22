// Fixed floating button matching the screenshot's bottom-right "Ask the
// graph" call-out. Click (or press 'k') navigates to the Chat surface,
// optionally carrying the current route as context via ?from=...

import { useEffect } from "react";
import styles from "./AskTheGraph.module.css";

interface Props {
  currentRouteHash: string;   // e.g. "#/explorer/journey-graph?journey=…"
}

export function AskTheGraph({ currentRouteHash }: Props) {
  const open = (): void => {
    const params = new URLSearchParams();
    if (currentRouteHash) params.set("from", currentRouteHash);
    window.location.hash = `#/chat/thread${params.toString() ? "?" + params.toString() : ""}`;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "k" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRouteHash]);

  return (
    <button type="button" className={styles.btn} onClick={open} aria-label="Ask the graph (k)">
      <span className={styles.dot} aria-hidden />
      <span>Ask the graph</span>
      <span className={styles.kbd}>k</span>
    </button>
  );
}
