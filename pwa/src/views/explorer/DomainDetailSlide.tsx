import { useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Loading, ErrorState } from "../_shared";
import { KeyValueList } from "../../components/KeyValueList";
import { calculateHealthScore, getHealthTier, getHealthColor, getVerificationStatus, getVerificationColor } from "../../lib/domainHealth";
import styles from "./DomainDetailSlide.module.css";

type Tab = "overview" | "systems" | "roles" | "handoffs" | "integrations";

interface DomainDetailSlideProps {
  domainId: string;
  domainData: any;
  onClose: () => void;
}

export function DomainDetailSlide({ domainId, domainData, onClose }: DomainDetailSlideProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Fetch domain health
  const health = useFetch(
    () => api.cypher(
      `MATCH (d:Domain {id: $id})
       OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
       OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
       OPTIONAL MATCH (a)-[e:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
       WHERE e.observed_p99_ms > e.sla_p99_ms
       WITH d, count(DISTINCT j) AS journeys, count(DISTINCT a) AS activities,
            count(DISTINCT e) AS sla_breaches
       RETURN d.id AS id, d.name AS name, journeys, activities, sla_breaches,
              COALESCE(sla_breaches * 1.0 / NULLIF(journeys * 4, 0), 0) AS sla_breach_rate`,
      { id: domainId }
    ),
    [domainId],
  );

  // Fetch domain systems
  const systems = useFetch(
    () => api.cypher(
      `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
       WHERE (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id: $id})
       WITH s, count(a) AS usage_count
       RETURN s.id AS id, s.name AS name, usage_count
       ORDER BY usage_count DESC`,
      { id: domainId }
    ),
    [domainId],
  );

  // Fetch domain roles
  const roles = useFetch(
    () => api.cypher(
      `MATCH (r:Role)-[:EXECUTES]->(a:Activity)
       WHERE (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id: $id})
       WITH r, count(a) AS activity_count
       RETURN r.id AS id, r.name AS name, activity_count
       ORDER BY activity_count DESC`,
      { id: domainId }
    ),
    [domainId],
  );

  if (health.status === "loading") return <div className={styles.slide}><Loading what="health data" /></div>;
  if (health.status === "error") return <div className={styles.slide}><ErrorState message={health.error} /></div>;

  const healthData = health.data?.rows?.[0] as {
    journeys: number;
    activities: number;
    sla_breaches: number;
    sla_breach_rate: number;
  } | undefined;

  if (!healthData) return null;

  const healthScore = calculateHealthScore({
    sla_breach_rate: healthData.sla_breach_rate,
    handoff_complexity: 0,
    sod_conflicts: 0,
    initiative_completion: 0,
  });
  const healthTier = getHealthTier(healthScore);
  const healthColor = getHealthColor(healthTier);
  const verificationStatus = getVerificationStatus(domainData.verified_date);
  const verificationColor = getVerificationColor(verificationStatus);

  return (
    <div className={styles.slide}>
      <button className={styles.closeButton} onClick={onClose}>×</button>
      <div className={styles.healthBanner} style={{ borderColor: healthColor }}>
        <div className={styles.healthScoreLarge} style={{ color: healthColor }}>
          {healthScore}
        </div>
        <div className={styles.healthInfo}>
          <div className={styles.healthLabel}>Health Score</div>
          <div className={styles.healthTier} style={{ color: healthColor }}>
            {healthTier.replace("-", " ")}
          </div>
        </div>
        {verificationStatus !== "none" && (
          <div className={styles.verificationBadge} style={{ color: verificationColor, borderColor: verificationColor }}>
            {verificationStatus}
          </div>
        )}
      </div>
      <div className={styles.tabs}>
        {(["overview", "systems", "roles", "handoffs", "integrations"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab domain={domainData} health={healthData} healthScore={healthScore} healthTier={healthTier} healthColor={healthColor} />
      )}
      {activeTab === "systems" && (
        <SystemsTab systems={systems.status === "ok" ? systems.data.rows : []} />
      )}
      {activeTab === "roles" && (
        <RolesTab roles={roles.status === "ok" ? roles.data.rows : []} />
      )}
      {activeTab === "handoffs" && (
        <HandoffsTab domainId={domainId} />
      )}
      {activeTab === "integrations" && (
        <IntegrationsTab domainId={domainId} />
      )}
    </div>
  );
}

function OverviewTab({ domain, health, healthScore, healthTier, healthColor }: { domain: any; health: any; healthScore: number; healthTier: string; healthColor: string }) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <h4 className={styles.cardTitle}>Domain Health</h4>
          <KeyValueList rows={[
            { label: "Health Score", value: <span style={{ color: healthColor, fontWeight: 600 }}>{healthScore}</span> },
            { label: "Health Tier", value: <span style={{ color: healthColor, textTransform: "capitalize" }}>{healthTier.replace("-", " ")}</span> },
            { label: "Journeys", value: health.journeys },
            { label: "Activities", value: health.activities },
            { label: "SLA Breaches", value: health.sla_breaches },
            { label: "SLA Breach Rate", value: `${(health.sla_breach_rate * 100).toFixed(1)}%` },
          ]} />
        </div>
        <div className={styles.card}>
          <h4 className={styles.cardTitle}>Ownership & Governance</h4>
          <KeyValueList rows={[
            { label: "Accountable Role", value: domain.accountable_role || "—"},
            { label: "Verified Date", value: domain.verified_date ? new Date(domain.verified_date).toLocaleDateString() : "—"},
            { label: "Verified By", value: domain.verified_by || "—"},
            ...(domain.compliance_tags?.length ? [{ label: "Compliance Tags", value: domain.compliance_tags.join(", ") }] : []),
          ]} />
        </div>
        <div className={styles.card}>
          <h4 className={styles.cardTitle}>Activity Metrics</h4>
          <KeyValueList rows={[
            { label: "Total Activities", value: health.activities },
            { label: "Avg Activities/Journey", value: health.journeys > 0 ? (health.activities / health.journeys).toFixed(1) : "—" },
            { label: "Activity Density", value: health.journeys > 0 ? `${(health.activities / health.journeys).toFixed(1)}/journey` : "—" },
          ]} />
        </div>
        <div className={styles.card}>
          <h4 className={styles.cardTitle}>SLA Performance</h4>
          <KeyValueList rows={[
            { label: "SLA Breaches", value: health.sla_breaches },
            { label: "Breach Rate", value: `${(health.sla_breach_rate * 100).toFixed(1)}%` },
            { label: "Status", value: health.sla_breach_rate < 0.05 ? "Good" : health.sla_breach_rate < 0.15 ? "Warning" : "Critical" },
          ]} />
        </div>
      </div>
    </div>
  );
}

function SystemsTab({ systems }: { systems: any[] }) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Systems</h4>
        {systems.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No systems found for this domain.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>System</th>
                <th>Usage Count</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.usage_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RolesTab({ roles }: { roles: any[] }) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Roles</h4>
        {roles.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No roles found for this domain.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Role</th>
                <th>Activity Count</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.activity_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HandoffsTab({ domainId }: { domainId: string }) {
  const handoffs = useFetch(
    () => api.cypher(
      `MATCH (r1:Role)-[:EXECUTES]->(a1:Activity)-[:PRECEDES]->(a2:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id: $id})
       MATCH (r2:Role)-[:EXECUTES]->(a2)
       WITH r1.name AS from_role, r2.name AS to_role, count(*) AS count
       RETURN from_role, to_role, count
       ORDER BY count DESC`,
      { id: domainId }
    ),
    [domainId],
  );

  if (handoffs.status === "loading") return <Loading what="handoffs" />;
  if (handoffs.status === "error") return <ErrorState message={handoffs.error} />;

  const data = handoffs.data.rows as any[];

  return (
    <div className={styles.tabContent}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Hand-offs</h4>
        {data.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No hand-offs found for this domain.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>From Role</th>
                <th>To Role</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.map((h, i) => (
                <tr key={i}>
                  <td>{h.from_role}</td>
                  <td>{h.to_role}</td>
                  <td>{h.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function IntegrationsTab({ domainId }: { domainId: string }) {
  const integrations = useFetch(
    () => api.cypher(
      `MATCH (a1:Activity)-[:USES_SYSTEM]->(s1:System)
       WHERE (a1)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(:Domain {id: $id})
       MATCH (s1)-[:INTEGRATES_WITH]->(s2:System)
       RETURN s1.name AS from_system, s2.name AS to_system, 1 AS integration_strength
       ORDER BY from_system, to_system`,
      { id: domainId }
    ),
    [domainId],
  );

  if (integrations.status === "loading") return <Loading what="integrations" />;
  if (integrations.status === "error") return <ErrorState message={integrations.error} />;

  const data = integrations.data.rows as any[];

  return (
    <div className={styles.tabContent}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>System Integrations</h4>
        {data.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No integrations found for this domain.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>From System</th>
                <th>To System</th>
                <th>Strength</th>
              </tr>
            </thead>
            <tbody>
              {data.map((int, i) => (
                <tr key={i}>
                  <td>{int.from_system}</td>
                  <td>{int.to_system}</td>
                  <td>{int.integration_strength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
