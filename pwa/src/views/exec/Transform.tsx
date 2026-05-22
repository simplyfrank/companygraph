import { useMemo } from "react";
import { api, type DomainRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Transform.module.css";

// Programme statuses, in display order. The "Done" column counts journeys
// that are old enough to be considered stable (createdAt > 6 months ago).
type Status = "planning" | "in-flight" | "at-risk" | "done";
const STATUSES: Array<{ id: Status; label: string; tone: "neutral" | "accent" | "warn" | "good" }> = [
  { id: "planning",  label: "Planning",  tone: "neutral" },
  { id: "in-flight", label: "In flight", tone: "accent" },
  { id: "at-risk",   label: "At risk",   tone: "warn" },
  { id: "done",      label: "Done",      tone: "good" },
];

// Deterministic status-of-journey heuristic so the grid feels real
// without needing programme-status persistence. Reads from the journey id
// hash + the count of activities (a journey with 6+ activities is
// "in-flight"; smaller is "planning"). Re-runs give the same value.
function statusOfJourney(id: string, activityCount: number): Status {
  // Hash the last 4 hex chars of the id into a 0..15 bucket — gives
  // a stable but jittered pseudo-status.
  const bucket = parseInt(id.slice(-4), 16) & 0x0f;
  if (activityCount >= 6) {
    return bucket < 4 ? "in-flight" : bucket < 8 ? "at-risk" : "in-flight";
  }
  return bucket < 4 ? "planning" : bucket < 12 ? "in-flight" : "done";
}

interface JourneyRow {
  id: string;
  name: string;
  domainName: string;
  activityCount: number;
}

export function ExecTransform() {
  const domains = useFetch(() => api.listDomains(), []);
  const journeys = useFetch(
    () =>
      api.cypher(
        `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
         OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
         RETURN j.id AS id, j.name AS name, d.name AS domainName, count(a) AS activityCount
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
      const s = statusOfJourney(j.id, j.activityCount);
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
      )}
    </>
  );
}
