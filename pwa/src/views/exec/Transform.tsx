import { useMemo } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { BarChartCard, STATUS_COLORS } from "../../components/charts";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Transform.module.css";

// Programme statuses, in display order.
type Status = "planning" | "in-flight" | "at-risk" | "done";
const STATUSES: Array<{ id: Status; label: string; tone: "neutral" | "accent" | "warn" | "good" }> = [
  { id: "planning",  label: "Planning",  tone: "neutral" },
  { id: "in-flight", label: "In flight", tone: "accent" },
  { id: "at-risk",   label: "At risk",   tone: "warn" },
  { id: "done",      label: "Done",      tone: "good" },
];

// Derive real programme status from graph data:
// - archived journeys → done
// - any open SLA breach on the journey → at-risk
// - 3+ activities, no open breaches → in-flight
// - otherwise → planning
function statusOfJourney(
  journeyStatus: string,
  activityCount: number,
  openBreaches: number,
): Status {
  if (journeyStatus === "archived") return "done";
  if (openBreaches > 0) return "at-risk";
  if (activityCount >= 3) return "in-flight";
  return "planning";
}

interface JourneyRow {
  id: string;
  name: string;
  domainName: string;
  journeyStatus: string;
  activityCount: number;
  openBreaches: number;
}

export function ExecTransform() {
  const domains = useFetch(() => api.listDomains(), []);
  const journeys = useFetch(
    () =>
      api.cypher(
        `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
         OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
         OPTIONAL MATCH (al:SLAAlignment {target_type: 'journey', target_id: j.id})
         OPTIONAL MATCH (b:SLABreach {sla_id: al.sla_id, resolution_status: 'open'})
         RETURN j.id AS id, j.name AS name, d.name AS domainName,
                j.status AS journeyStatus,
                count(DISTINCT a) AS activityCount,
                count(DISTINCT b) AS openBreaches
         ORDER BY domainName, name`,
      ),
    [],
  );

  const grid = useMemo(() => {
    if (journeys.status !== "ok" || domains.status !== "ok") return null;
    const journeyList = journeys.data.rows as unknown as JourneyRow[];
    const domainList = domains.data.rows;
    const map = new Map<string, Map<Status, JourneyRow[]>>();
    for (const d of domainList) {
      const inner = new Map<Status, JourneyRow[]>();
      for (const s of STATUSES) inner.set(s.id, []);
      map.set(d.name, inner);
    }
    for (const j of journeyList) {
      const s = statusOfJourney(
        j.journeyStatus ?? "active",
        Number(j.activityCount),
        Number(j.openBreaches),
      );
      map.get(j.domainName)?.get(s)?.push(j);
    }
    return { domainList, map };
  }, [journeys, domains]);

  return (
    <>
      <ViewHeader
        title="Transformation"
        lede="Programme status across the retail estate. Each cell is a journey-count — click into a cell to see the contributing journeys."
      />

      {(journeys.status === "loading" || domains.status === "loading") && <Loading what="programme grid" />}
      {journeys.status === "error" && <ErrorState message={journeys.error} />}
      {domains.status === "error" && <ErrorState message={domains.error} />}

      {grid && (
        <>
          <div className={styles.dashboardGrid}>
            <BarChartCard
              title="Journeys by status"
              data={STATUSES.map((s) => ({
                label: s.label,
                value: grid.domainList.reduce(
                  (sum, d) => sum + (grid.map.get(d.name)?.get(s.id)?.length ?? 0),
                  0,
                ),
                color: STATUS_COLORS[s.id] ?? "var(--accent)",
              }))}
              yLabel="journeys"
            />
          </div>

          <div style={{ height: 24 }} />

          <div className={styles.quickNav}>
            <a href="#/govern/kpi-management" className={styles.quickNavTile}>
              <span className={styles.quickNavTitle}>KPI Management</span>
              <span className={styles.quickNavLede}>Define and manage organizational KPIs</span>
            </a>
            <a href="#/govern/okr-management" className={styles.quickNavTile}>
              <span className={styles.quickNavTitle}>OKR Management</span>
              <span className={styles.quickNavLede}>Create and manage OKR cycles</span>
            </a>
            <a href="#/govern/roll-down" className={styles.quickNavTile}>
              <span className={styles.quickNavTitle}>Roll-Down</span>
              <span className={styles.quickNavLede}>Roll down KPIs and OKRs to domains</span>
            </a>
            <a href="#/govern/programs" className={styles.quickNavTile}>
              <span className={styles.quickNavTitle}>Programme Management</span>
              <span className={styles.quickNavLede}>Manage programmes, KPIs, and assignments</span>
            </a>
            <a href="#/insights/context-alignment" className={styles.quickNavTile}>
              <span className={styles.quickNavTitle}>Context Alignment</span>
              <span className={styles.quickNavLede}>Cross-context API contracts and BU alignment across bounded contexts</span>
            </a>
          </div>

          <div style={{ height: 24 }} />

          <Card>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th className={styles.rowHead}>Domain</th>
                  {STATUSES.map((s) => (
                    <th key={s.id} className={styles.colHead}>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </th>
                  ))}
                  <th className={styles.colHead}>Total</th>
                </tr>
              </thead>
              <tbody>
                {grid.domainList.map((d) => {
                  const counts = grid.map.get(d.name)!;
                  const total = STATUSES.reduce((s, st) => s + (counts.get(st.id)?.length ?? 0), 0);
                  return (
                    <tr key={d.id}>
                      <th scope="row" className={styles.rowHead}>
                        <a href={`#/explorer/domains`} className={styles.domainLink}>{d.name}</a>
                      </th>
                      {STATUSES.map((s) => {
                        const journeys = counts.get(s.id) ?? [];
                        return (
                          <td key={s.id} className={styles.cell}>
                            {journeys.length === 0 ? (
                              <span className={styles.zero}>—</span>
                            ) : (
                              <details className={styles.cellDetails}>
                                <summary className={`${styles.cellSummary} ${styles[`tone-${s.tone}`]}`}>
                                  {journeys.length}
                                </summary>
                                <ul className={styles.cellList}>
                                  {journeys.map((j) => (
                                    <li key={j.id}>
                                      <a href={`#/explorer/journey-graph?journey=${encodeURIComponent(j.id)}`}>
                                        {j.name}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </td>
                        );
                      })}
                      <td className={styles.totalCell}>{total}</td>
                    </tr>
                  );
                })}
                <tr className={styles.totalRow}>
                  <th scope="row" className={styles.rowHead}><SecLabel>Total</SecLabel></th>
                  {STATUSES.map((s) => {
                    const total = grid.domainList.reduce(
                      (sum, d) => sum + (grid.map.get(d.name)?.get(s.id)?.length ?? 0),
                      0,
                    );
                    return (
                      <td key={s.id} className={styles.totalCell}>{total}</td>
                    );
                  })}
                  <td className={styles.totalCell}>
                    {grid.domainList.reduce(
                      (s, d) =>
                        s + STATUSES.reduce(
                          (ss, st) => ss + (grid.map.get(d.name)?.get(st.id)?.length ?? 0),
                          0,
                        ),
                      0,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
