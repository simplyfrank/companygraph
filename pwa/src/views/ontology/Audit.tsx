import { useMemo, useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Audit.module.css";

interface AuditEvent {
  id: string;
  name: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

const LABEL_TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
};

type Mode = "all" | "created" | "updated";

export function OntologyAudit() {
  const [mode, setMode] = useState<Mode>("all");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

  // Pull the 100 most-recent change events from the graph.
  // We synthesize the feed from createdAt + updatedAt timestamps; when
  // ontology-manager's audit_log table lands, this view points at it.
  const data = useFetch(
    () =>
      api.cypher(
        `MATCH (n)
         WHERE n.updatedAt IS NOT NULL
         RETURN n.id AS id, n.name AS name, labels(n)[0] AS label,
                n.createdAt AS createdAt, n.updatedAt AS updatedAt
         ORDER BY n.updatedAt DESC
         LIMIT 100`,
      ),
    [],
  );

  const events = useMemo(() => {
    if (data.status !== "ok") return [];
    const rows = data.data.rows as unknown as AuditEvent[];
    // Synthesize two events per node (created + updated) when timestamps differ.
    const out: Array<AuditEvent & { kind: "created" | "updated"; ts: string }> = [];
    for (const r of rows) {
      if (mode === "all" || mode === "updated") {
        if (r.updatedAt !== r.createdAt) {
          out.push({ ...r, kind: "updated", ts: r.updatedAt });
        }
      }
      if (mode === "all" || mode === "created") {
        out.push({ ...r, kind: "created", ts: r.createdAt });
      }
    }
    out.sort((a, b) => b.ts.localeCompare(a.ts));
    return labelFilter ? out.filter((e) => e.label === labelFilter) : out;
  }, [data, mode, labelFilter]);

  const groups = useMemo(() => groupByDay(events), [events]);

  return (
    <>
      <ViewHeader
        title="Audit log"
        lede="Recent schema + data changes. Synthesised from node createdAt + updatedAt today; the namespace-scoped audit feed lands when ontology-manager's audit_log surfaces."
      />

      <div className={styles.filters}>
        <SecLabel>Kind</SecLabel>
        <div className={styles.toggleGroup}>
          {(["all", "created", "updated"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`${styles.toggleBtn} ${mode === m ? styles.toggleActive : ""}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <SecLabel>Label</SecLabel>
        <div className={styles.toggleGroup}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${labelFilter === null ? styles.toggleActive : ""}`}
            onClick={() => setLabelFilter(null)}
          >
            All
          </button>
          {Object.keys(LABEL_TONE).map((l) => (
            <button
              key={l}
              type="button"
              className={`${styles.toggleBtn} ${labelFilter === l ? styles.toggleActive : ""}`}
              onClick={() => setLabelFilter(l === labelFilter ? null : l)}
            >
              <Pill tone={LABEL_TONE[l] ?? "neutral"}>{l}</Pill>
            </button>
          ))}
        </div>
      </div>

      <Card>
        {data.status === "loading" && <Loading what="audit log" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && events.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)" }}>No events match the current filter.</p>
        )}
        {data.status === "ok" && events.length > 0 && (
          <ol className={styles.feed}>
            {groups.map(([day, list]) => (
              <li key={day} className={styles.dayGroup}>
                <div className={styles.dayHeader}>
                  <SecLabel>{day}</SecLabel>
                  <span className={styles.dayCount}>{list.length} event{list.length === 1 ? "" : "s"}</span>
                </div>
                <ul className={styles.dayList}>
                  {list.map((e, i) => (
                    <li key={`${e.id}:${e.kind}:${i}`} className={styles.event}>
                      <div className={styles.eventMeta}>
                        <span className={styles.eventTime}>{formatTime(e.ts)}</span>
                        <Pill tone={e.kind === "created" ? "good" : "accent"}>{e.kind}</Pill>
                        <Pill tone={LABEL_TONE[e.label] ?? "neutral"}>{e.label}</Pill>
                      </div>
                      <a
                        className={styles.eventName}
                        href={
                          e.label === "UserJourney"
                            ? `#/explorer/journey-graph?journey=${encodeURIComponent(e.id)}`
                            : e.label === "Activity"
                              ? `#/explorer/journey-detail?activity=${encodeURIComponent(e.id)}`
                              : `#/ontology/editor`
                        }
                      >
                        {e.name}
                      </a>
                      <code className={styles.eventId}>{e.id.slice(0, 8)}…</code>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}

function groupByDay<T extends { ts: string }>(events: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const e of events) {
    const day = e.ts.slice(0, 10); // YYYY-MM-DD
    const list = map.get(day) ?? [];
    list.push(e);
    map.set(day, list);
  }
  return [...map.entries()];
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return ts.slice(11, 19);
  }
}
