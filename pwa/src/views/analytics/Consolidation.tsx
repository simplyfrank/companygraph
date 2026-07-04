import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Consolidation.module.css";

// cto-analytics FR-03 / T-09 — consolidation-candidates panel.
//
// Lists activities that touch ≥ 2 distinct System nodes (via USES_SYSTEM),
// sorted by distinct-system count DESC (AC-03). Each row shows the activity,
// the systems it spans, and its parent journey, and deep-links to the
// activity detail in the explorer.
//
// Data source (DD-01, mirrors Matrix T-08 / Complexity): the view rides the
// ratified `POST /api/v1/query/cypher` passthrough client-side. The
// server-side FR-03 engine (`api/src/analytics/consolidation.ts`, RD-1) backs
// the `GET /api/v1/analytics/consolidation` report GET and is covered by
// `api/__tests__/analytics-consolidation.integration.test.ts` (AC-03).

interface ConsolidationRow {
  activity: { id: string; name: string };
  journey: { id: string; name: string } | null;
  systems: Array<{ id: string; name: string }>;
  systemCount: number;
}

export function AnalyticsConsolidation() {
  // Activities with ≥ 2 distinct USES_SYSTEM systems, most-fragmented first.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
        WITH a, collect(DISTINCT s{.id, .name}) AS systems
        WHERE size(systems) >= 2
        OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
        WITH a, systems, head(collect(j{.id, .name})) AS journey
        RETURN a{.id, .name} AS activity, journey, systems,
               size(systems) AS systemCount
        ORDER BY systemCount DESC, a.name
        LIMIT 1001
      `),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Consolidation candidates"
        lede="Activities that reach into two or more systems (via USES_SYSTEM), ranked by how many. High counts flag single steps whose systems may be candidates for consolidation. Click an activity to open it in the explorer."
      />

      <Card>
        {data.status === "loading" && <Loading what="consolidation candidates" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (() => {
          const rows = data.data.rows as unknown as ConsolidationRow[];
          if (rows.length === 0) {
            return (
              <p className={styles.empty} data-testid="consolidation-empty">
                No activity uses two or more systems — nothing to consolidate.
              </p>
            );
          }
          return (
            <DataTable
              columns={[
                { id: "activity", label: "activity", kind: "text" },
                { id: "systemCount", label: "systems", kind: "num", align: "right" },
                { id: "systemList", label: "system set", kind: "text" },
                { id: "journey", label: "journey", kind: "text" },
              ]}
              rows={rows.map((r) => ({
                activity: (
                  <a
                    className={styles.link}
                    href={`#/explorer/activities/${encodeURIComponent(r.activity.id)}`}
                    data-testid="consolidation-activity-link"
                    data-activity-id={r.activity.id}
                  >
                    {r.activity.name}
                  </a>
                ),
                systemCount: <Pill tone={r.systemCount > 2 ? "warn" : "accent"}>{r.systemCount}</Pill>,
                systemList: (
                  <span className={styles.systemSet}>
                    {r.systems.map((s) => (
                      <span key={s.id} className={styles.systemTag} data-system-id={s.id}>
                        {s.name}
                      </span>
                    ))}
                  </span>
                ),
                journey: r.journey ? r.journey.name : <span className={styles.none}>—</span>,
              }))}
            />
          );
        })()}
      </Card>
    </>
  );
}
