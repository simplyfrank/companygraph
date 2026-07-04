import { useState } from "react";
import { api, complianceRules, type JourneyHealthRow, type JourneyOwnershipRow, type JourneyActivityRow, type JourneyRoleRow, type JourneySystemRow, type JourneyHandoffRow, type JourneyTouchpointRow, type KPIAlignmentRow, type SLAAlignmentRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { KeyValueList } from "../../components/KeyValueList";
import { Button } from "../../components/Button";
import { KpiCrud } from "../../components/KpiCrud";
import { SlaCrud } from "../../components/SlaCrud";
import { KpiDashboard } from "../../components/KpiDashboard";
import { SlaDashboard } from "../../components/SlaDashboard";
import { HealthDashboard } from "../../components/HealthDashboard";
import { Loading, ErrorState } from "../_shared";
import { calculateHealthScore, getHealthTier, getHealthColor, getVerificationStatus, getVerificationColor } from "../../lib/journeyHealth";
import styles from "./JourneyDetailSlide.module.css";

interface JourneyDetailSlideProps {
  journeyId: string;
  journeyData: any;
  onClose: () => void;
}

export function JourneyDetailSlide({ journeyId, journeyData, onClose }: JourneyDetailSlideProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "activities" | "roles" | "systems" | "handoffs" | "touchpoints" | "kpis-slas" | "compliance" | "initiatives" | "dependencies" | "analytics">("overview");

  const health = useFetch(() => api.journey.getHealth(journeyId), [journeyId]);
  const ownership = useFetch(() => api.journey.getOwnership(journeyId), [journeyId]);
  const activities = useFetch(() => api.journey.getActivities(journeyId), [journeyId]);
  const roles = useFetch(() => api.journey.getRoles(journeyId), [journeyId]);
  const systems = useFetch(() => api.journey.getSystems(journeyId), [journeyId]);
  const handoffs = useFetch(() => api.journey.getHandoffs(journeyId), [journeyId]);
  const touchpoints = useFetch(() => api.journey.getTouchpoints(journeyId), [journeyId]);
  const kpiAlignments = useFetch(() => api.kpi.getAlignments("journey", journeyId), [journeyId]);
  const slaAlignments = useFetch(() => api.sla.getAlignments("journey", journeyId), [journeyId]);
  const complianceRulesData = useFetch(() => complianceRules.list(true), [journeyId]);

  const healthData = health.status === "ok" && health.data && health.data.rows[0] ? health.data.rows[0] : null;
  const ownershipData = ownership.status === "ok" && ownership.data && ownership.data.rows[0] ? ownership.data.rows[0] : null;

  return (
    <div className={styles.slide}>
      <div className={styles.header}>
        <h3 className={styles.title}>{journeyData?.name || "Journey Details"}</h3>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>

      <div className={styles.tabs}>
        {[
          { id: "overview", label: "Overview" },
          { id: "activities", label: "Activities" },
          { id: "roles", label: "Roles" },
          { id: "systems", label: "Systems" },
          { id: "handoffs", label: "Hand-offs" },
          { id: "touchpoints", label: "Touchpoints" },
          { id: "kpis-slas", label: "KPIs/SLAs" },
          { id: "compliance", label: "Compliance" },
          { id: "initiatives", label: "Initiatives" },
          { id: "dependencies", label: "Dependencies" },
          { id: "analytics", label: "Analytics" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ""}`}
            onClick={() => setActiveTab(tab.id as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === "overview" && (
          <OverviewTab health={healthData} ownership={ownershipData} />
        )}
        {activeTab === "activities" && (
          <ActivitiesTab data={activities.status === "ok" ? activities.data?.rows || [] : []} />
        )}
        {activeTab === "roles" && (
          <RolesTab data={roles.status === "ok" ? roles.data?.rows || [] : []} />
        )}
        {activeTab === "systems" && (
          <SystemsTab data={systems.status === "ok" ? systems.data?.rows || [] : []} />
        )}
        {activeTab === "handoffs" && (
          <HandoffsTab data={handoffs.status === "ok" ? handoffs.data?.rows || [] : []} />
        )}
        {activeTab === "touchpoints" && (
          <TouchpointsTab data={touchpoints.status === "ok" ? touchpoints.data?.rows || [] : []} />
        )}
        {activeTab === "kpis-slas" && (
          <KpisSlasTab journeyId={journeyId} />
        )}
        {activeTab === "compliance" && (
          <ComplianceTab rules={complianceRulesData.status === "ok" ? complianceRulesData.data || [] : []} journeyId={journeyId} />
        )}
        {activeTab === "initiatives" && (
          <InitiativesTab journeyId={journeyId} />
        )}
        {activeTab === "dependencies" && (
          <DependenciesTab journeyId={journeyId} />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab journeyId={journeyId} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ health, ownership }: { health: JourneyHealthRow | null; ownership: JourneyOwnershipRow | null }) {
  if (!health || !ownership) return <div className={styles.loading}>Loading overview...</div>;

  const healthScore = health.health_score;
  const healthTier = getHealthTier(healthScore);
  const healthColor = getHealthColor(healthTier);
  const verificationStatus = getVerificationStatus(ownership.verified_date, ownership.verified_by);
  const verificationColor = getVerificationColor(verificationStatus);

  return (
    <div className={styles.cardGrid}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Health Score</h4>
        <div className={styles.healthScore} style={{ color: healthColor }}>
          {healthScore}
        </div>
        <div className={styles.healthTier}>{healthTier}</div>
      </div>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Activity Metrics</h4>
        <KeyValueList rows={[
          { label: "Activities", value: health.touchpoint_count },
          { label: "Roles", value: health.role_count },
          { label: "Systems", value: health.system_count },
          { label: "Handoffs", value: health.handoff_complexity },
        ]} />
      </div>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Ownership</h4>
        <KeyValueList rows={[
          { label: "Accountable Role", value: ownership.accountable_role || "—" },
          { label: "Owner Team", value: ownership.owner_team || "—" },
          { label: "Verification", value: verificationStatus },
        ]} />
      </div>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Compliance</h4>
        {ownership.compliance_tags && ownership.compliance_tags.length > 0 ? (
          <div className={styles.complianceTags}>
            {ownership.compliance_tags.map((tag) => (
              <span key={tag} className={styles.complianceTag}>{tag}</span>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No compliance tags</p>
        )}
      </div>
    </div>
  );
}

function ActivitiesTab({ data }: { data: JourneyActivityRow[] }) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Activity</th>
            <th>SLA Target</th>
            <th>P95 Actual</th>
            <th>KPI Score</th>
            <th>Systems</th>
            <th>Handoffs</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td className={styles.nameCell}>
                <strong>{a.name}</strong>
                <code className={styles.id}>{a.id.slice(0, 8)}…</code>
              </td>
              <td>{a.sla_target_hours ? `${a.sla_target_hours}h` : "—"}</td>
              <td>{a.p95_hours ? `${a.p95_hours}h` : "—"}</td>
              <td>{a.kpi_score ? `${(a.kpi_score * 100).toFixed(0)}%` : "—"}</td>
              <td>{a.system_count}</td>
              <td>{a.handoff_outgoing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolesTab({ data }: { data: JourneyRoleRow[] }) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Role</th>
            <th>Team</th>
            <th>Activities</th>
            <th>Handoffs In</th>
            <th>Handoffs Out</th>
            <th>SoD Conflicts</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id}>
              <td className={styles.nameCell}>
                <strong>{r.name}</strong>
                <code className={styles.id}>{r.id.slice(0, 8)}…</code>
              </td>
              <td>{r.team || "—"}</td>
              <td>{r.activity_count}</td>
              <td>{r.handoff_incoming}</td>
              <td>{r.handoff_outgoing}</td>
              <td>{r.sod_conflicts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemsTab({ data }: { data: JourneySystemRow[] }) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>System</th>
            <th>Usage Count</th>
            <th>Touchpoints</th>
            <th>SLA Breaches</th>
            <th>Avg P99</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.id}>
              <td className={styles.nameCell}>
                <strong>{s.name}</strong>
                <code className={styles.id}>{s.id.slice(0, 8)}…</code>
              </td>
              <td>{s.usage_count}</td>
              <td>{s.touchpoint_count}</td>
              <td>{s.sla_breaches}</td>
              <td>{s.avg_sla_p99_ms ? `${s.avg_sla_p99_ms.toFixed(0)}ms` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HandoffsTab({ data }: { data: JourneyHandoffRow[] }) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>From Role</th>
            <th>To Role</th>
            <th>From Team</th>
            <th>To Team</th>
            <th>Count</th>
            <th>SLA Breaches</th>
            <th>SoD Risk</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => (
            <tr key={i}>
              <td>{h.from_role}</td>
              <td>{h.to_role}</td>
              <td>{h.from_team || "—"}</td>
              <td>{h.to_team || "—"}</td>
              <td>{h.count}</td>
              <td>{h.sla_breaches}</td>
              <td>{h.sod_risk ? "⚠️" : "✓"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TouchpointsTab({ data }: { data: JourneyTouchpointRow[] }) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Touchpoint</th>
            <th>Type</th>
            <th>Activities</th>
            <th>Roles</th>
            <th>Critical Path</th>
            <th>SLA Breaches</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => (
            <tr key={t.id}>
              <td className={styles.nameCell}>
                <strong>{t.name}</strong>
                <code className={styles.id}>{t.id.slice(0, 8)}…</code>
              </td>
              <td>
                <span className={styles.typeBadge}>{t.type}</span>
              </td>
              <td>{t.activity_count}</td>
              <td>{t.role_count}</td>
              <td>{t.critical_path ? "✓" : "—"}</td>
              <td>{t.sla_breaches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpisSlasTab({ journeyId }: { journeyId: string }) {
  return (
    <div className={styles.cardGrid}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Aligned KPIs</h4>
        <KpiCrud targetType="journey" targetId={journeyId} />
      </div>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Aligned SLAs</h4>
        <SlaCrud targetType="journey" targetId={journeyId} />
      </div>
    </div>
  );
}

function InitiativesTab({ journeyId }: { journeyId: string }) {
  const initiatives = useFetch(
    () => api.cypher(
      `MATCH (i:Initiative)-[:AFFECTS]->(:UserJourney {id: $id})
       OPTIONAL MATCH (i)-[:TRACKED_BY]->(k:KPI)
       WITH i, count(DISTINCT k) AS kpi_count
       RETURN i.id AS id, i.name AS name, i.description AS description, i.status AS status,
              i.start_date AS start_date, i.target_date AS target_date, i.completion_rate AS completion_rate,
              kpi_count
       ORDER BY i.target_date`,
      { id: journeyId }
    ),
    [journeyId],
  );

  if (initiatives.status === "loading") return <div className={styles.loading}>Loading initiatives...</div>;
  if (initiatives.status === "error") return <ErrorState message={initiatives.error} />;

  const initiativeList = initiatives.data.rows as any[];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "var(--success)";
      case "in_progress": return "var(--accent)";
      case "at_risk": return "var(--warn)";
      case "blocked": return "var(--danger)";
      default: return "var(--muted)";
    }
  };

  return (
    <div className={styles.card}>
      <h4 className={styles.cardTitle}>Strategic Initiatives</h4>
      {initiativeList.length === 0 ? (
        <p className={styles.empty}>No initiatives linked to this journey.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Initiative</th>
              <th>Status</th>
              <th>Completion</th>
              <th>Target Date</th>
              <th>KPIs</th>
            </tr>
          </thead>
          <tbody>
            {initiativeList.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  {i.description && <p style={{ color: "var(--muted)", fontSize: "11px", marginTop: "4px" }}>{i.description}</p>}
                </td>
                <td>
                  <span style={{ 
                    fontFamily: "var(--font-mono)", 
                    fontSize: "10px", 
                    textTransform: "uppercase", 
                    padding: "2px 6px", 
                    border: "1px solid var(--border)", 
                    borderRadius: "4px", 
                    background: "var(--surface-2)",
                    color: getStatusColor(i.status)
                  }}>
                    {i.status.replace("_", " ")}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ 
                      flex: 1, 
                      height: "6px", 
                      background: "var(--surface-2)", 
                      borderRadius: "3px", 
                      overflow: "hidden",
                      minWidth: "60px"
                    }}>
                      <div style={{ 
                        width: `${i.completion_rate * 100}%`, 
                        height: "100%", 
                        background: getStatusColor(i.status),
                        transition: "width 0.3s ease"
                      }} />
                    </div>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                      {(i.completion_rate * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td style={{ fontSize: "12px" }}>
                  {i.target_date ? new Date(i.target_date).toLocaleDateString() : "—"}
                </td>
                <td>{i.kpi_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DependenciesTab({ journeyId }: { journeyId: string }) {
  const dependencies = useFetch(
    () => api.cypher(
      `MATCH (j:UserJourney {id: $id})
       OPTIONAL MATCH (j)-[:DEPENDS_ON]->(up:UserJourney)
       OPTIONAL MATCH (down:UserJourney)-[:DEPENDS_ON]->(j)
       RETURN j.id AS id, j.name AS name,
              collect(DISTINCT {id: up.id, name: up.name}) AS upstream,
              collect(DISTINCT {id: down.id, name: down.name}) AS downstream`,
      { id: journeyId }
    ),
    [journeyId],
  );

  if (dependencies.status === "loading") return <div className={styles.loading}>Loading dependencies...</div>;
  if (dependencies.status === "error") return <ErrorState message={dependencies.error} />;

  const data = dependencies.data?.rows?.[0] as any;
  const upstream = data?.upstream || [];
  const downstream = data?.downstream || [];

  return (
    <div className={styles.cardGrid}>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Upstream Dependencies</h4>
        {upstream.length === 0 ? (
          <p className={styles.empty}>No upstream dependencies.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Journey</th>
                <th>Relation</th>
              </tr>
            </thead>
            <tbody>
              {upstream.map((dep: any) => (
                <tr key={dep.id}>
                  <td>
                    <strong>{dep.name}</strong>
                  </td>
                  <td>
                    <span style={{ 
                      fontFamily: "var(--font-mono)", 
                      fontSize: "10px", 
                      textTransform: "uppercase", 
                      padding: "2px 6px", 
                      border: "1px solid var(--border)", 
                      borderRadius: "4px", 
                      background: "var(--surface-2)",
                      color: "var(--muted)"
                    }}>
                      Depends On
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Downstream Dependents</h4>
        {downstream.length === 0 ? (
          <p className={styles.empty}>No downstream dependents.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Journey</th>
                <th>Relation</th>
              </tr>
            </thead>
            <tbody>
              {downstream.map((dep: any) => (
                <tr key={dep.id}>
                  <td>
                    <strong>{dep.name}</strong>
                  </td>
                  <td>
                    <span style={{ 
                      fontFamily: "var(--font-mono)", 
                      fontSize: "10px", 
                      textTransform: "uppercase", 
                      padding: "2px 6px", 
                      border: "1px solid var(--border)", 
                      borderRadius: "4px", 
                      background: "var(--surface-2)",
                      color: "var(--muted)"
                    }}>
                      Dependent
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AnalyticsTab({ journeyId }: { journeyId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <KpiDashboard journeyId={journeyId} />
      <SlaDashboard journeyId={journeyId} />
      <HealthDashboard journeyId={journeyId} />
    </div>
  );
}

function ComplianceTab({ rules, journeyId }: { rules: any[]; journeyId: string }) {
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});

  const handleEvaluate = async (ruleId: string) => {
    setEvaluating(ruleId);
    try {
      const result = await complianceRules.evaluate(ruleId);
      setResults((prev) => ({ ...prev, [ruleId]: result }));
    } catch (e) {
      console.error("Evaluation failed:", e);
      alert("Failed to evaluate rule");
    } finally {
      setEvaluating(null);
    }
  };

  if (rules.length === 0) {
    return (
      <div className={styles.card}>
        <p className={styles.empty}>No active compliance rules found.</p>
        <p className={styles.empty}>Manage compliance rules in the Ontology section.</p>
      </div>
    );
  }

  return (
    <div className={styles.cardGrid}>
      {rules.map((rule) => {
        const result = results[rule.id];
        const passed = result?.passed ?? null;

        return (
          <div key={rule.id} className={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <h4 className={styles.cardTitle}>{rule.name}</h4>
              {passed !== null && (
                <span style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  background: passed ? "var(--success-subtle)" : "var(--danger-subtle)",
                  color: passed ? "var(--success)" : "var(--danger)",
                }}>
                  {passed ? "PASS" : "FAIL"}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
              {rule.description || "No description"}
            </p>
            <div style={{ fontSize: 12, marginBottom: 12 }}>
              <strong>Category:</strong> {rule.category} | <strong>Severity:</strong> {rule.severity}
            </div>
            <div style={{ 
              fontFamily: "var(--font-mono)", 
              fontSize: 11, 
              padding: 8, 
              background: "var(--bg-subtle)", 
              borderRadius: 4, 
              marginBottom: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}>
              {rule.rule_dsl}
            </div>
            {result && (
              <div style={{ 
                padding: 8, 
                background: passed ? "var(--success-subtle)" : "var(--danger-subtle)", 
                borderRadius: 4, 
                marginBottom: 12,
                fontSize: 12
              }}>
                <strong>Result:</strong> {result.message || "Evaluation completed"}
              </div>
            )}
            <Button 
              onClick={() => handleEvaluate(rule.id)} 
              disabled={evaluating === rule.id}
            >
              {evaluating === rule.id ? "Evaluating..." : "Evaluate"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
