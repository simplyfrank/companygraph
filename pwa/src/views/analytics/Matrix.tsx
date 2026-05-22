import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Matrix.module.css";

interface CellRow {
  domainName: string;
  systemName: string;
  count: number;
}

export function AnalyticsMatrix() {
  // Cross-tab: domains × systems, with edge counts via USES_SYSTEM.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (d:Domain)<-[:PART_OF]-(:UserJourney)<-[:PART_OF]-(a:Activity)-[u:USES_SYSTEM]->(s:System)
        RETURN d.name AS domainName, s.name AS systemName, count(u) AS count
        ORDER BY domainName, systemName
        LIMIT 1001
      `),
    [],
  );

  if (data.status === "loading") return <Loading what="matrix" />;
  if (data.status === "error") return <ErrorState message={data.error} />;

  const rows = data.data.rows as unknown as CellRow[];
  const domains = [...new Set(rows.map((r) => r.domainName))].sort();
  const systems = [...new Set(rows.map((r) => r.systemName))].sort();
  const cell = (d: string, s: string): number =>
    rows.find((r) => r.domainName === d && r.systemName === s)?.count ?? 0;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <>
      <ViewHeader
        title="Domain ↔ system alignment"
        lede="Heatmap of how often each system is used inside each domain (sum of USES_SYSTEM edges across the domain's activities). Owned by cto-analytics — this is a graph-core preview."
      />
      <Card>
        <div className={styles.matrix}>
          <table>
            <thead>
              <tr>
                <th />
                {systems.map((s) => <th key={s} className={styles.col}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d}>
                  <th scope="row" className={styles.row}>{d}</th>
                  {systems.map((s) => {
                    const v = cell(d, s);
                    const opacity = v / maxCount;
                    return (
                      <td
                        key={s}
                        className={styles.cell}
                        style={{
                          background: v > 0
                            ? `color-mix(in oklch, var(--accent) ${Math.round(opacity * 60)}%, var(--surface))`
                            : "var(--surface)",
                          color: opacity > 0.6 ? "var(--on-accent)" : "var(--fg)",
                        }}
                      >
                        {v > 0 ? v : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
