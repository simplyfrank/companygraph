import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./SingleSystem.module.css";

// cto-analytics FR-05 / T-11 — single-system journey report.
//
// Enumerates journeys whose activities collectively touch exactly one distinct
// System (`count(DISTINCT system across all activities) = 1`, AC-05). Each row
// shows the journey, its single bound system, and how many of its activities
// use that system, and deep-links to the journey detail with the bound system
// pinned (`?system=:id`).
//
// Data source (DD-01, mirrors Consolidation T-09 / Matrix T-08): the view
// rides the ratified `POST /api/v1/query/cypher` passthrough client-side. The
// server-side FR-05 engine (`api/src/analytics/single-system.ts`, RD-1) backs
// the `GET /api/v1/analytics/single-system-journeys` report GET and is covered
// by `api/__tests__/analytics-single-system.integration.test.ts` (AC-05).

interface SingleSystemRow {
  journey: { id: string; name: string };
  system: { id: string; name: string };
  activityCount: number;
}

export function AnalyticsSingleSystem() {
  // Journeys whose member activities use exactly one distinct system,
  // busiest (most activities on that system) first.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)
        MATCH (a)-[:USES_SYSTEM]->(s:System)
        WITH j, collect(DISTINCT s{.id, .name}) AS systems, count(DISTINCT a) AS activityCount
        WHERE size(systems) = 1
        RETURN j{.id, .name} AS journey, head(systems) AS system, activityCount
        ORDER BY activityCount DESC, j.name
        LIMIT 1001
      `),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Single-system journeys"
        lede="Journeys whose activities all live in a single system — no cross-system hand-offs. Click a journey to open it in the explorer with that system pinned."
      />

      <Card>
        {data.status === "loading" && <Loading what="single-system journeys" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (() => {
          const rows = data.data.rows as unknown as SingleSystemRow[];
          if (rows.length === 0) {
            return (
              <p className={styles.empty} data-testid="single-system-empty">
                No journey is confined to a single system.
              </p>
            );
          }
          return (
            <DataTable
              columns={[
                { id: "journey", label: "journey", kind: "text" },
                { id: "system", label: "system", kind: "text" },
                { id: "activityCount", label: "activities", kind: "num", align: "right" },
              ]}
              rows={rows.map((r) => ({
                journey: (
                  <a
                    className={styles.link}
                    href={`#/explorer/journey-detail/${encodeURIComponent(r.journey.id)}?system=${encodeURIComponent(r.system.id)}`}
                    data-testid="single-system-journey-link"
                    data-journey-id={r.journey.id}
                    data-system-id={r.system.id}
                  >
                    {r.journey.name}
                  </a>
                ),
                system: (
                  <span className={styles.systemTag} data-system-id={r.system.id}>
                    {r.system.name}
                  </span>
                ),
                activityCount: <Pill tone="accent">{r.activityCount}</Pill>,
              }))}
            />
          );
        })()}
      </Card>
    </>
  );
}
