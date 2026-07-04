import { useFetch } from "../useFetch";
import { api } from "../api";
import { Loading, ErrorState } from "../views/_shared";
import { calculateHealthScore } from "../lib/domainHealth";
import styles from "./DomainComparisonModal.module.css";

interface DomainComparisonModalProps {
  domainIds: string[];
  onClose: () => void;
}

export function DomainComparisonModal({ domainIds, onClose }: DomainComparisonModalProps) {
  // Fetch comprehensive data for each domain
  const domainsData = useFetch(
    async () => {
      const results = await Promise.all(
        domainIds.map(async (id) => {
          const result = await api.cypher(
            `MATCH (d:Domain {id: $id})
             OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
             OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
             OPTIONAL MATCH (a)-[e:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
             WHERE e.observed_p99_ms > e.sla_p99_ms
             OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
             OPTIONAL MATCH (s:System)-[:INTEGRATES_WITH]->(:System)<-[:USES_SYSTEM]-(a)
             OPTIONAL MATCH (d)-[:DEPENDS_ON]->(dep:Domain)
             WITH d, count(DISTINCT j) AS journeys, count(DISTINCT a) AS activities,
                  count(DISTINCT e) AS sla_breaches, count(DISTINCT r) AS roles,
                  count(DISTINCT s) AS systems, count(DISTINCT dep) AS dependencies
             RETURN d.id AS id, d.name AS name, d.description AS description,
                    journeys, activities, sla_breaches, roles, systems, dependencies,
                    COALESCE(sla_breaches * 1.0 / NULLIF(journeys * 4, 0), 0) AS sla_breach_rate,
                    0 AS handoff_complexity, 0 AS sod_conflicts, 0.85 AS initiative_completion`,
            { id }
          );
          return result.rows[0];
        })
      );
      return results;
    },
    [domainIds.join(",")],
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Domain Comparison</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {domainsData.status === "loading" && <Loading what="comparison data" />}
        {domainsData.status === "error" && <ErrorState message={domainsData.error} />}
        {domainsData.status === "ok" && (
          <div className={styles.content}>
            <ComparisonTable domains={domainsData.data as any[]} />
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonTable({ domains }: { domains: any[] }) {
  // Calculate health scores for each domain
  const domainsWithHealth = domains.map((d) => ({
    ...d,
    health_score: calculateHealthScore({
      sla_breach_rate: d.sla_breach_rate || 0,
      handoff_complexity: 0,
      sod_conflicts: 0,
      initiative_completion: 0,
    }),
  }));

  const metrics = [
    { key: "health_score", label: "Health Score", format: (v: number) => v.toFixed(0) },
    { key: "journeys", label: "Journeys", format: (v: number) => v },
    { key: "activities", label: "Activities", format: (v: number) => v },
    { key: "roles", label: "Roles", format: (v: number) => v },
    { key: "systems", label: "Systems", format: (v: number) => v },
    { key: "dependencies", label: "Dependencies", format: (v: number) => v },
    { key: "sla_breaches", label: "SLA Breaches", format: (v: number) => v },
    { key: "sla_breach_rate", label: "SLA Breach Rate", format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: "initiative_completion", label: "Initiative Completion", format: (v: number) => `${(v * 100).toFixed(0)}%` },
  ];

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Metric</th>
          {domainsWithHealth.map((d) => (
            <th key={d.id}>{d.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric) => (
          <tr key={metric.key}>
            <td className={styles.metricLabel}>{metric.label}</td>
            {domainsWithHealth.map((d) => (
              <td key={`${d.id}-${metric.key}`}>
                {metric.format(d[metric.key] || 0)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
