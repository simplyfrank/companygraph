import { useMemo, useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Review.module.css";

interface QueueRow {
  id: string;
  name: string;
  description: string;
  label: string;
  updatedAt: string;
  parentJourneyName?: string;
  parentJourneyId?: string;
}

const LABEL_TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
};

// Stable confidence score derived from id hash — deterministic preview
// data until ontology-manager surfaces real review attributes.
function confidenceOf(id: string): { score: number; tone: "good" | "warn" | "danger"; reason: string } {
  const bucket = parseInt(id.slice(-2), 16); // 0..255
  if (bucket < 96) {
    return { score: bucket / 100, tone: "danger", reason: "low confidence — review recommended" };
  }
  if (bucket < 192) {
    return { score: bucket / 100, tone: "warn",   reason: "medium confidence — quick scan" };
  }
  return { score: bucket / 100, tone: "good",     reason: "high confidence — verify identity" };
}

type Filter = "all" | "low" | "medium" | "high";

export function SmeReview() {
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  // Pull recently-modified Activities + UserJourneys as a proxy for the
  // review queue. Real _review.status="needs_review" filter lands when
  // FR-18 ships.
  const data = useFetch(
    () =>
      api.cypher(
        `MATCH (n)
         WHERE labels(n)[0] IN ['UserJourney', 'Activity']
           AND n.updatedAt IS NOT NULL
         OPTIONAL MATCH (n)-[:PART_OF*0..1]->(j:UserJourney)
         RETURN n.id AS id, n.name AS name, coalesce(n.description, '') AS description,
                labels(n)[0] AS label, n.updatedAt AS updatedAt,
                j.name AS parentJourneyName, j.id AS parentJourneyId
         ORDER BY n.updatedAt DESC
         LIMIT 40`,
      ),
    [],
  );

  const queue = useMemo(() => {
    if (data.status !== "ok") return [];
    const rows = data.data.rows as unknown as QueueRow[];
    return rows
      .map((r) => ({ ...r, confidence: confidenceOf(r.id) }))
      .filter((r) => {
        if (filter === "all") return true;
        return r.confidence.tone === (filter === "low" ? "danger" : filter === "medium" ? "warn" : "good");
      });
  }, [data, filter]);

  const counts = useMemo(() => {
    if (data.status !== "ok") return { low: 0, medium: 0, high: 0 };
    const rows = data.data.rows as unknown as QueueRow[];
    let low = 0, medium = 0, high = 0;
    for (const r of rows) {
      const c = confidenceOf(r.id);
      if (c.tone === "danger") low++;
      else if (c.tone === "warn") medium++;
      else high++;
    }
    return { low, medium, high };
  }, [data]);

  return (
    <>
      <ViewHeader
        title="Review queue"
        lede="Pending entities awaiting SME sign-off. Currently shows recently-modified journeys + activities with synthesised confidence scores — the real _review namespace lands with FR-18."
      />

      <div className={styles.summary}>
        <button type="button" className={`${styles.bucket} ${filter === "all" ? styles.bucketActive : ""}`} onClick={() => setFilter("all")}>
          <SecLabel>Total</SecLabel>
          <div className={styles.bucketCount}>{counts.low + counts.medium + counts.high}</div>
        </button>
        <button type="button" className={`${styles.bucket} ${filter === "low" ? styles.bucketActive : ""}`} onClick={() => setFilter("low")}>
          <SecLabel>Low confidence</SecLabel>
          <div className={`${styles.bucketCount} ${styles["tone-danger"]}`}>{counts.low}</div>
        </button>
        <button type="button" className={`${styles.bucket} ${filter === "medium" ? styles.bucketActive : ""}`} onClick={() => setFilter("medium")}>
          <SecLabel>Medium confidence</SecLabel>
          <div className={`${styles.bucketCount} ${styles["tone-warn"]}`}>{counts.medium}</div>
        </button>
        <button type="button" className={`${styles.bucket} ${filter === "high" ? styles.bucketActive : ""}`} onClick={() => setFilter("high")}>
          <SecLabel>High confidence</SecLabel>
          <div className={`${styles.bucketCount} ${styles["tone-good"]}`}>{counts.high}</div>
        </button>
      </div>

      <Card>
        {data.status === "loading" && <Loading what="queue" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && queue.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)" }}>Nothing in this bucket — try a different filter.</p>
        )}
        {data.status === "ok" && queue.length > 0 && (
          <ul className={styles.queue}>
            {queue.map((r) => {
              const isReviewed = reviewed.has(r.id);
              return (
                <li key={r.id} className={`${styles.row} ${isReviewed ? styles.rowReviewed : ""}`}>
                  <div className={styles.rowLabel}>
                    <Pill tone={LABEL_TONE[r.label] ?? "neutral"}>{r.label}</Pill>
                  </div>
                  <div className={styles.rowBody}>
                    <div className={styles.rowName}>{r.name}</div>
                    <div className={styles.rowMeta}>
                      {r.description && <span className={styles.rowDesc}>{r.description}</span>}
                      {r.parentJourneyName && r.parentJourneyId && r.label === "Activity" && (
                        <span className={styles.rowParent}>
                          in <a href={`#/explorer/journey-graph?journey=${encodeURIComponent(r.parentJourneyId)}`}>{r.parentJourneyName}</a>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.rowConfidence}>
                    <Pill tone={r.confidence.tone}>{(r.confidence.score * 100).toFixed(0)}%</Pill>
                    <span className={styles.rowReason}>{r.confidence.reason}</span>
                  </div>
                  <div className={styles.rowActions}>
                    {isReviewed ? (
                      <Pill tone="good">approved</Pill>
                    ) : (
                      <>
                        <Button
                          tone="primary"
                          onClick={() => setReviewed((s) => new Set(s).add(r.id))}
                        >
                          Approve
                        </Button>
                        <Button
                          tone="ghost"
                          href={
                            r.label === "UserJourney"
                              ? `#/explorer/journey-graph?journey=${encodeURIComponent(r.id)}`
                              : `#/explorer/journey-detail?activity=${encodeURIComponent(r.id)}`
                          }
                        >
                          Open
                        </Button>
                      </>
                    )}
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
