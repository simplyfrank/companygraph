import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Card } from "./Card";
import { Button } from "./Button";
import { HealthDistributionChart } from "./HealthDistributionChart";
import { Loading, ErrorState } from "../views/_shared";
import { calculateHealthScore, getHealthTier, getHealthColor } from "../lib/domainHealth";
import styles from "./HealthDashboard.module.css";

interface HealthDashboardProps {
  domainId?: string;
  journeyId?: string;
}

export function HealthDashboard({ domainId, journeyId }: HealthDashboardProps) {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");

  // Fetch health data for domains
  const domainsHealth = useFetch(
    () => api.cypher(
      `MATCH (d:Domain)
       OPTIONAL MATCH (d)-[:PART_OF]->(j:UserJourney)
       OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
       OPTIONAL MATCH (a)-[e:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
       WHERE e.observed_p99_ms > e.sla_p99_ms
       WITH d, count(DISTINCT j) AS journeys, count(DISTINCT a) AS activities,
            count(DISTINCT e) AS sla_breaches
       RETURN d.id AS id, d.name AS name, journeys, activities, sla_breaches,
              COALESCE(sla_breaches * 1.0 / NULLIF(journeys * 4, 0), 0) AS sla_breach_rate,
              0 AS handoff_complexity, 0 AS sod_conflicts, 0 AS initiative_completion
       ORDER BY d.name`
    ),
    [],
  );

  // Fetch health data for journeys
  const journeysHealth = useFetch(
    () => api.cypher(
      `MATCH (j:UserJourney)
       OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
       OPTIONAL MATCH (a)-[e:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
       WHERE e.observed_p99_ms > e.sla_p99_ms
       WITH j, count(DISTINCT a) AS activities,
            count(DISTINCT e) AS sla_breaches
       RETURN j.id AS id, j.name AS name, activities, sla_breaches,
              COALESCE(sla_breaches * 1.0 / NULLIF(activities * 2, 0), 0) AS sla_breach_rate,
              0 AS handoff_complexity, 0 AS sod_conflicts, 0 AS initiative_completion
       ORDER BY j.name`
    ),
    [],
  );

  if (domainsHealth.status === "loading" || journeysHealth.status === "loading") {
    return <Loading what="health dashboard" />;
  }

  if (domainsHealth.status === "error") return <ErrorState message={domainsHealth.error} />;
  if (journeysHealth.status === "error") return <ErrorState message={journeysHealth.error} />;

  const domains = domainsHealth.data?.rows || [];
  const journeys = journeysHealth.data?.rows || [];

  const calculateEntityHealth = (entity: any) => {
    return calculateHealthScore({
      sla_breach_rate: entity.sla_breach_rate,
      handoff_complexity: entity.handoff_complexity || 0,
      sod_conflicts: entity.sod_conflicts || 0,
      initiative_completion: entity.initiative_completion || 0,
    });
  };

  const getHealthDistribution = (entities: any[]) => {
    const distribution = { healthy: 0, "needs-attention": 0, critical: 0 };
    entities.forEach((entity) => {
      const score = calculateEntityHealth(entity);
      const tier = getHealthTier(score);
      switch (tier) {
        case "healthy": distribution.healthy++; break;
        case "needs-attention": distribution["needs-attention"]++; break;
        case "critical": distribution.critical++; break;
      }
    });
    return distribution;
  };

  const domainDistribution = getHealthDistribution(domains);
  const journeyDistribution = getHealthDistribution(journeys);

  const averageHealthScore = (entities: any[]) => {
    if (entities.length === 0) return 0;
    const total = entities.reduce((sum, entity) => sum + calculateEntityHealth(entity), 0);
    return total / entities.length;
  };

  const domainAvg = averageHealthScore(domains);
  const journeyAvg = averageHealthScore(journeys);
  const overallAvg = domains.length > 0 && journeys.length > 0
    ? (domainAvg + journeyAvg) / 2
    : domains.length > 0 ? domainAvg : journeyAvg;

  const overallTier = getHealthTier(overallAvg);
  const overallColor = getHealthColor(overallTier);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Health Score Dashboard</h2>
        <div className={styles.timeRangeSelector}>
          {(["7d", "30d", "90d"] as const).map((range) => (
            <button
              key={range}
              className={`${styles.timeRangeButton} ${timeRange === range ? styles.active : ""}`}
              onClick={() => setTimeRange(range)}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Overall Health Summary */}
      <Card title="Overall Health Score">
        <div className={styles.overallHealth}>
          <div className={styles.healthScore}>
            <span className={styles.scoreValue} style={{ color: overallColor }}>
              {overallAvg.toFixed(0)}
            </span>
            <span className={styles.scoreLabel}>/ 100</span>
          </div>
          <div className={styles.healthTier}>
            <span
              className={styles.tierBadge}
              style={{
                background: overallColor + "20",
                color: overallColor,
              }}
            >
              {overallTier.replace("-", " ").toUpperCase()}
            </span>
          </div>
        </div>
      </Card>

      <div className={styles.grid}>
        {/* Domain Health */}
        <Card title="Domain Health Distribution">
          <HealthDistributionChart data={domainDistribution} title="Domains" />
        </Card>

        {/* Journey Health */}
        <Card title="Journey Health Distribution">
          <HealthDistributionChart data={journeyDistribution} title="Journeys" />
        </Card>
      </div>

      {/* Entity Details */}
      <Card title="Entity Health Details">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Type</th>
              <th>Health Score</th>
              <th>Tier</th>
              <th>SLA Breach Rate</th>
              <th>Activities</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d: any) => {
              const score = calculateEntityHealth(d);
              const tier = getHealthTier(score);
              const color = getHealthColor(tier);
              return (
                <tr key={d.id}>
                  <td>
                    <strong>{d.name}</strong>
                  </td>
                  <td>
                    <span className={styles.typeBadge}>Domain</span>
                  </td>
                  <td style={{ color, fontWeight: 600 }}>{score.toFixed(0)}</td>
                  <td>
                    <span
                      className={styles.tierBadge}
                      style={{ background: color + "20", color }}
                    >
                      {tier.replace("-", " ")}
                    </span>
                  </td>
                  <td style={{ color: d.sla_breach_rate > 0.1 ? "var(--danger)" : "var(--success)" }}>
                    {(d.sla_breach_rate * 100).toFixed(1)}%
                  </td>
                  <td>{d.activities || 0}</td>
                </tr>
              );
            })}
            {journeys.map((j: any) => {
              const score = calculateEntityHealth(j);
              const tier = getHealthTier(score);
              const color = getHealthColor(tier);
              return (
                <tr key={j.id}>
                  <td>
                    <strong>{j.name}</strong>
                  </td>
                  <td>
                    <span className={styles.typeBadge}>Journey</span>
                  </td>
                  <td style={{ color, fontWeight: 600 }}>{score.toFixed(0)}</td>
                  <td>
                    <span
                      className={styles.tierBadge}
                      style={{ background: color + "20", color }}
                    >
                      {tier.replace("-", " ")}
                    </span>
                  </td>
                  <td style={{ color: j.sla_breach_rate > 0.1 ? "var(--danger)" : "var(--success)" }}>
                    {(j.sla_breach_rate * 100).toFixed(1)}%
                  </td>
                  <td>{j.activities || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
