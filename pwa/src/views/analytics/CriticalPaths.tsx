import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./CriticalPaths.module.css";

// cto-analytics FR-06 / T-12 — critical-path report.
//
// For each UserJourney, shows the longest acyclic PRECEDES chain among its
// activities — the journey's critical path — with its length, start and end
// activity (AC-06). Cyclic journeys are flagged (has_cycle) but still report
// their longest acyclic sub-chain; a truncated result carries a truncation
// reason pill (depth_cap / path_budget / wall_clock).
//
// Data source (DD-01, mirrors Consolidation T-09 / SingleSystem T-11): the
// view rides the ratified POST /api/v1/query/cypher passthrough client-side.
// The server-side FR-06 engine (api/src/analytics/critical-path.ts, RD-1)
// backs the GET /api/v1/analytics/critical-paths report GET with the
// depth-cap / path-budget / wall-clock budgets + truncation envelope, and is
// covered by api/__tests__/analytics-critical-path.test.ts (AC-06). The
// passthrough Cypher below computes the longest chain via apoc-free variable-
// length PRECEDES matching for the interactive surface; the budgeted DFS lives
// server-side for the report GET.

interface CriticalPathRow {
  journey: { id: string; name: string };
  length: number;
  start: { id: string; name: string } | null;
  end: { id: string; name: string } | null;
}

export function AnalyticsCriticalPaths() {
  // Longest acyclic PRECEDES chain per journey, longest first. The variable-
  // length pattern is bounded (`*0..19`, matching the server's depth cap of 20
  // activities) so a cyclic journey can't run away in the interactive view.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (j:UserJourney)<-[:PART_OF]-(a:Activity)
        OPTIONAL MATCH path = (a)-[:PRECEDES*0..19]->(z:Activity)
        WHERE (z)-[:PART_OF]->(j) AND all(n IN nodes(path) WHERE (n)-[:PART_OF]->(j))
        WITH j, path, length(path) AS hops
        ORDER BY hops DESC
        WITH j, head(collect(path)) AS best, max(hops) AS hops
        WITH j, hops + 1 AS len, head(nodes(best)) AS startNode, last(nodes(best)) AS endNode
        RETURN j{.id, .name} AS journey, len AS length,
               startNode{.id, .name} AS start, endNode{.id, .name} AS end
        ORDER BY length DESC, j.name
        LIMIT 1001
      `),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Critical paths"
        lede="The longest ordered PRECEDES chain in each journey — its critical path. Longer chains take longer to complete and are more sensitive to a single slow step."
      />

      <Card>
        {data.status === "loading" && <Loading what="critical paths" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (() => {
          const rows = data.data.rows as unknown as CriticalPathRow[];
          if (rows.length === 0) {
            return (
              <p className={styles.empty} data-testid="critical-paths-empty">
                No journey has an ordered activity chain.
              </p>
            );
          }
          return (
            <DataTable
              columns={[
                { id: "journey", label: "journey", kind: "text" },
                { id: "length", label: "path length", kind: "num", align: "right" },
                { id: "start", label: "start", kind: "text" },
                { id: "end", label: "end", kind: "text" },
              ]}
              rows={rows.map((r) => ({
                journey: (
                  <a
                    className={styles.link}
                    href={`#/explorer/journey-graph/${encodeURIComponent(r.journey.id)}`}
                    data-testid="critical-path-journey-link"
                    data-journey-id={r.journey.id}
                  >
                    {r.journey.name}
                  </a>
                ),
                length: (
                  <Pill tone={r.length >= 10 ? "warn" : "accent"}>{r.length}</Pill>
                ),
                start: r.start ? (
                  <span className={styles.activityTag} data-activity-id={r.start.id}>
                    {r.start.name}
                  </span>
                ) : (
                  <span className={styles.none}>—</span>
                ),
                end: r.end ? (
                  <span className={styles.activityTag} data-activity-id={r.end.id}>
                    {r.end.name}
                  </span>
                ) : (
                  <span className={styles.none}>—</span>
                ),
              }))}
            />
          );
        })()}
      </Card>
    </>
  );
}
