// T-15: Review queue (FR-19 / AC-17)
//
// Lists nodes with _review.status="needs_review" filtered to the operator's
// home domain. Uses the reviewQueueForDomain Cypher query with PART_OF*1..8
// to cover deeply-nested hierarchies (C-09 fix).

import { useMemo } from "react";
import { cypherDedup } from "../../data/reads";
import { reviewQueueForDomain } from "../../data/cypher-queries";
import { usePrefStore } from "../../store/prefStore";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { PieChartCard } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Review.module.css";

interface QueueRow {
  id: string;
  name: string;
  label: string;
  attrs: string;
  updatedAt: string;
}

const LABEL_TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
  Domain: "accent",
};

export function SmeReview() {
  const homeDomainId = usePrefStore().homeDomainId;

  // Use the reviewQueueForDomain Cypher query which already filters by
  // _review.status="needs_review" and home domain (PART_OF*1..8).
  const data = useFetch(
    () => cypherDedup<QueueRow>(reviewQueueForDomain, { homeDomainId }),
    [homeDomainId],
  );

  const queue = useMemo(() => {
    if (data.status !== "ok") return [];
    return data.data.rows;
  }, [data]);

  const byLabel = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of queue) {
      map.set(r.label, (map.get(r.label) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
      color:
        label === "UserJourney" ? "#22c55e" :
        label === "Activity" ? "#3b82f6" :
        label === "Role" ? "#f59e0b" :
        label === "System" ? "#ef4444" :
        label === "Domain" ? "#8b5cf6" :
        "#64748b",
    }));
  }, [queue]);

  return (
    <>
      <ViewHeader
        title="Review queue"
        lede="Entities flagged for review within your home domain. Use the Open button to navigate to the detail view and verify or reject changes."
      />

      {queue.length > 0 && (
        <>
          <div className={styles.dashboardGrid}>
            <PieChartCard title="Queue by entity type" data={byLabel} donut />
          </div>
          <div style={{ height: 24 }} />
        </>
      )}

      <Card>
        {data.status === "loading" && <Loading what="queue" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && queue.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {homeDomainId
              ? "No entities flagged for review in your home domain."
              : "No entities flagged for review (home domain not set)."}
          </p>
        )}
        {data.status === "ok" && queue.length > 0 && (
          <ul className={styles.queue}>
            {queue.map((r) => {
              // Parse attributes to extract review metadata
              let attrs: Record<string, unknown> = {};
              try {
                attrs = JSON.parse(r.attrs) as Record<string, unknown>;
              } catch {
                // Invalid JSON — skip parsing
              }

              const review = attrs._review as { status?: string; reason?: string; set_at?: string } | undefined;
              const reason = review?.reason ?? "Flagged for review";
              const setAt = review?.set_at ? new Date(review.set_at as string).toLocaleDateString() : undefined;

              return (
                <li key={r.id} className={styles.row}>
                  <div className={styles.rowLabel}>
                    <Pill tone={LABEL_TONE[r.label] ?? "neutral"}>{r.label}</Pill>
                  </div>
                  <div className={styles.rowBody}>
                    <div className={styles.rowName}>{r.name}</div>
                    <div className={styles.rowMeta}>
                      <span className={styles.rowDesc}>{reason}</span>
                      {setAt && <span className={styles.rowDate}>{setAt}</span>}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <Button
                      tone="primary"
                      href={
                        r.label === "UserJourney"
                          ? `#/explorer/journey-graph?journey=${encodeURIComponent(r.id)}`
                          : r.label === "Activity"
                            ? `#/explorer/journey-detail?activity=${encodeURIComponent(r.id)}`
                            : `#/explorer/domains`
                      }
                    >
                      Open
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
