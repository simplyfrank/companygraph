import { useState, useEffect } from "react";
import type { Route } from "../../route";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { ViewHeader, Loading, ErrorState, NotFoundPanel } from "../_shared";
import { Card } from "../../components/Card";
import { KeyValueList } from "../../components/KeyValueList";
import { KpiDashboard } from "../../components/KpiDashboard";
import { SlaDashboard } from "../../components/SlaDashboard";
import { HealthDashboard } from "../../components/HealthDashboard";
import { PersonaAssignment } from "../../components/PersonaAssignment";
import { OkrCrud } from "../../components/OkrCrud";
import { OkrPerformanceBoard } from "../../components/OkrPerformanceBoard";
import { FlagForReviewButton } from "../../components/FlagForReviewButton";
import { useTitleStore } from "../../store/titleStore";
import { calculateHealthScore, getHealthTier, getHealthColor, getVerificationStatus, getVerificationColor } from "../../lib/domainHealth";
import styles from "./DomainDetail.module.css";

// Domain detail view with tabs for Overview, Systems, Roles, Hand-offs, Integrations, KPIs, SLAs, Journeys, Initiatives, Dependencies, Analytics, Personas, OKRs, Performance, Roll-Down, Risks
// US-DM-03: Domain Cross-Section Views
type Tab = "overview" | "systems" | "roles" | "handoffs" | "integrations" | "kpis" | "slas" | "journeys" | "initiatives" | "dependencies" | "analytics" | "personas" | "okrs" | "performance" | "roll-down" | "risks";

export function DomainDetail({ route }: { route: Route }) {
  const domainId = route.entityId;
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Fetch domain basic info
  const domain = useFetch(
    () => api.cypher(
      `MATCH (d:Domain {id: $id})
       OPTIONAL MATCH (d)-[:ACCOUNTABLE_TO]->(r:Role)
       RETURN d.id AS id, d.name AS name, d.description AS description,
              r.name AS accountable_role, d.verified_date AS verified_date,
              d.verified_by AS verified_by, d.compliance_tags AS compliance_tags`,
      { id: domainId }
    ),
    [domainId],
  );

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

  // Fetch KPIs aligned to this domain
  const kpis = useFetch(
    () => api.kpi.getAlignments("domain", domainId!),
    [domainId],
  );

  // Fetch SLAs aligned to this domain
  const slas = useFetch(
    () => api.sla.getAlignments("domain", domainId!),
    [domainId],
  );

  // T-15: publish the domain name to the title store so shell chrome
  // (breadcrumbs / document title) can reflect the current entity.
  // Runs unconditionally (rules of hooks) and no-ops until data arrives.
  const domainName =
    domain.status === "ok" ? (domain.data.rows[0] as { name?: string } | undefined)?.name : undefined;
  useEffect(() => {
    if (domainId && domainName) {
      useTitleStore.getState().setTitle(domainId, domainName);
    }
  }, [domainId, domainName]);

  // Early return after all hooks to maintain hook order
  if (!domainId) {
    return <NotFoundPanel route={route} />;
  }

  if (domain.status === "loading" || health.status === "loading") {
    return <Loading what="domain" />;
  }

  if (domain.status === "error") {
    return <ErrorState message={domain.error} />;
  }
  if (health.status === "error") {
    return <ErrorState message={health.error} />;
  }

  const domainData = domain.data?.rows?.[0] as {
    id: string;
    name: string;
    description: string;
    accountable_role: string | null;
    verified_date: string | null;
    verified_by: string | null;
    compliance_tags: string[];
  } | undefined;

  const healthData = health.data?.rows?.[0] as {
    id: string;
    name: string;
    journeys: number;
    activities: number;
    sla_breaches: number;
    sla_breach_rate: number;
  } | undefined;

  if (!domainData || !healthData) {
    return <NotFoundPanel route={route} />;
  }

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
    <>
      <ViewHeader title={domainData.name} lede={domainData.description} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <FlagForReviewButton label="Domain" id={domainId} />
      </div>
      <a href="#/explorer/domains" className={styles.backLink}>
        ← Back to Domains
      </a>
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
        {(["overview", "journeys", "systems", "roles", "handoffs", "integrations", "kpis", "slas", "initiatives", "dependencies", "analytics", "personas", "okrs", "performance", "roll-down", "risks"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "kpis" ? "KPIs" : tab === "slas" ? "SLAs" : tab === "okrs" ? "OKRs" : tab === "roll-down" ? "Roll-Down" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab domain={domainData} health={healthData} healthScore={healthScore} healthTier={healthTier} healthColor={healthColor} domainId={domainId} />
      )}
      {activeTab === "journeys" && (
        <JourneysTab domainId={domainId} />
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
      {activeTab === "kpis" && (
        <KpisTab domainId={domainId} domainName={domainData.name} />
      )}
      {activeTab === "slas" && (
        <SlasTab domainId={domainId} />
      )}
      {activeTab === "initiatives" && (
        <InitiativesTab domainId={domainId} />
      )}
      {activeTab === "dependencies" && (
        <DependenciesTab domainId={domainId} />
      )}
      {activeTab === "analytics" && (
        <AnalyticsTab domainId={domainId} />
      )}
      {activeTab === "personas" && (
        <PersonasTab domainId={domainId} />
      )}
      {activeTab === "okrs" && (
        <OkrCrud domainId={domainId} domainName={domainData.name} />
      )}
      {activeTab === "performance" && (
        <OkrPerformanceBoard domainId={domainId} domainName={domainData.name} />
      )}
      {activeTab === "roll-down" && (
        <RollDownTab domainId={domainId} domainName={domainData.name} />
      )}
      {activeTab === "risks" && (
        <RisksTab domainId={domainId} domainName={domainData.name} />
      )}
    </>
  );
}

function OverviewTab({ domain, health, healthScore, healthTier, healthColor, domainId }: { domain: any; health: any; healthScore: number; healthTier: string; healthColor: string; domainId: string }) {
  const kpis = useFetch(() => api.kpi.getAlignments("domain", domainId), [domainId]);
  const slas = useFetch(() => api.sla.getAlignments("domain", domainId), [domainId]);

  const kpiList = kpis.status === "ok" ? kpis.data?.rows || [] : [];
  const slaList = slas.status === "ok" ? slas.data?.rows || [] : [];

  return (
    <div className={styles.tabContent}>
      <div className={styles.cardGrid}>
        <Card title="Domain Health">
          <KeyValueList rows={[
            { label: "Health Score", value: <span style={{ color: healthColor, fontWeight: 600 }}>{healthScore}</span> },
            { label: "Health Tier", value: <span style={{ color: healthColor, textTransform: "capitalize" }}>{healthTier.replace("-", " ")}</span> },
            { label: "Journeys", value: health.journeys },
            { label: "Activities", value: health.activities },
            { label: "SLA Breaches", value: health.sla_breaches },
            { label: "SLA Breach Rate", value: `${(health.sla_breach_rate * 100).toFixed(1)}%` },
          ]} />
        </Card>
        <Card title="Ownership & Governance">
          <KeyValueList rows={[
            { label: "Accountable Role", value: domain.accountable_role || "—"},
            { label: "Verified Date", value: domain.verified_date ? new Date(domain.verified_date).toLocaleDateString() : "—"},
            { label: "Verified By", value: domain.verified_by || "—"},
            ...(domain.compliance_tags?.length ? [{ label: "Compliance Tags", value: domain.compliance_tags.join(", ") }] : []),
          ]} />
        </Card>
        <Card title="KPI Summary">
          {kpis.status === "loading" ? (
            <p style={{ color: "var(--muted)" }}>Loading KPIs...</p>
          ) : kpiList.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No KPIs aligned to this domain.</p>
          ) : (
            <div>
              <div style={{ marginBottom: "12px", fontWeight: 600 }}>{kpiList.length} KPIs aligned</div>
              {kpiList.slice(0, 3).map((kpi: any) => (
                <div key={kpi.kpi_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 500 }}>{kpi.kpi_name}</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Target: {kpi.kpi_target_value} {kpi.kpi_unit} • {kpi.kpi_category}
                  </div>
                </div>
              ))}
              {kpiList.length > 3 && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--accent)" }}>
                  +{kpiList.length - 3} more KPIs
                </div>
              )}
            </div>
          )}
        </Card>
        <Card title="SLA Summary">
          {slas.status === "loading" ? (
            <p style={{ color: "var(--muted)" }}>Loading SLAs...</p>
          ) : slaList.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No SLAs aligned to this domain.</p>
          ) : (
            <div>
              <div style={{ marginBottom: "12px", fontWeight: 600 }}>{slaList.length} SLAs aligned</div>
              {slaList.slice(0, 3).map((sla: any) => (
                <div key={sla.sla_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 500 }}>{sla.sla_name}</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Target: {sla.target_value} {sla.target_unit} • Threshold: {sla.compliance_threshold}%
                  </div>
                </div>
              ))}
              {slaList.length > 3 && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--accent)" }}>
                  +{slaList.length - 3} more SLAs
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SystemsTab({ systems }: { systems: any[] }) {
  return (
    <div className={styles.tabContent}>
      <Card title="Systems">
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
      </Card>
    </div>
  );
}

function RolesTab({ roles }: { roles: any[] }) {
  return (
    <div className={styles.tabContent}>
      <Card title="Roles">
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
      </Card>
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
      <Card title="Hand-offs">
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
      </Card>
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
      <Card title="System Integrations">
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
      </Card>
    </div>
  );
}

function KpisTab({ domainId, domainName }: { domainId: string; domainName: string }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<any>(null);
  const [kpis, setKpis] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [domainId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, productData] = await Promise.all([
        api.cypher(
          `MATCH (k:KPI {domain_id: $domainId})
           RETURN k ORDER BY k.created_at DESC`,
          { domainId },
        ),
        api.cypher(
          `MATCH (p:Product)
           RETURN p ORDER BY p.name`,
          {},
        ),
      ]);
      setKpis(kpiData.rows.map((r: any) => r.k));
      setProducts(productData.rows.map((r: any) => r.p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="KPIs" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3>Domain KPIs for {domainName}</h3>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => setShowCreateModal(true)}
        >
          + Create Domain KPI
        </button>
      </div>

      <Card>
        {kpis.length === 0 ? (
          <p className="text-gray-600">No domain-specific KPIs defined. Create KPIs to track domain performance.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">KPI</th>
                <th className="text-left py-2">Category</th>
                <th className="text-left py-2">Target</th>
                <th className="text-left py-2">Direction</th>
                <th className="text-left py-2">Frequency</th>
                <th className="text-left py-2">Owner</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((kpi) => (
                <tr key={kpi.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{kpi.name}</div>
                    {kpi.description && <div className="text-sm text-gray-600">{kpi.description}</div>}
                  </td>
                  <td className="py-2">{kpi.category}</td>
                  <td className="py-2">
                    {kpi.target_value} {kpi.unit}
                  </td>
                  <td className="py-2">{kpi.target_direction}</td>
                  <td className="py-2">{kpi.measurement_frequency}</td>
                  <td className="py-2">{kpi.owner_role || "-"}</td>
                  <td className="py-2">
                    <button className="text-blue-600 hover:underline mr-2" onClick={() => { setSelectedKpi(kpi); setShowAssignModal(true); }}>Assign to Products</button>
                    <button className="text-blue-600 hover:underline mr-2">Edit</button>
                    <button className="text-red-600 hover:underline">Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ marginTop: "24px" }}>
        <KpiDashboard domainId={domainId} />
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Create Domain KPI</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const payload = {
                name: formData.get("name"),
                description: formData.get("description"),
                category: formData.get("category"),
                unit: formData.get("unit"),
                target_value: parseFloat(formData.get("target_value") as string),
                target_direction: formData.get("target_direction"),
                warning_threshold: formData.get("warning_threshold") ? parseFloat(formData.get("warning_threshold") as string) : null,
                critical_threshold: formData.get("critical_threshold") ? parseFloat(formData.get("critical_threshold") as string) : null,
                measurement_frequency: formData.get("measurement_frequency"),
                owner_role: formData.get("owner_role"),
                domain_id: domainId,
              };
              try {
                await fetch("/api/v1/kpis", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                setShowCreateModal(false);
                loadData();
              } catch (err) {
                setError("Failed to create KPI");
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">KPI Name</label>
                  <input name="name" required className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea name="description" rows={2} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input name="category" required className="w-full px-3 py-2 border rounded" placeholder="e.g., Financial, Operational, Customer" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Target Value</label>
                    <input name="target_value" type="number" step="0.01" required className="w-full px-3 py-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <input name="unit" required className="w-full px-3 py-2 border rounded" placeholder="e.g., %, $, count" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Direction</label>
                  <select name="target_direction" required className="w-full px-3 py-2 border rounded">
                    <option value="higher_is_better">Higher is better</option>
                    <option value="lower_is_better">Lower is better</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Warning Threshold</label>
                    <input name="warning_threshold" type="number" step="0.01" className="w-full px-3 py-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Critical Threshold</label>
                    <input name="critical_threshold" type="number" step="0.01" className="w-full px-3 py-2 border rounded" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Measurement Frequency</label>
                  <select name="measurement_frequency" required className="w-full px-3 py-2 border rounded">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Owner Role</label>
                  <input name="owner_role" className="w-full px-3 py-2 border rounded" placeholder="e.g., Domain Lead" />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && selectedKpi && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Assign {selectedKpi.name} to Products</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const productAssignments: any[] = [];
              products.forEach((product) => {
                const weight = formData.get(`weight_${product.id}`);
                const target = formData.get(`target_${product.id}`);
                if (weight && target) {
                  productAssignments.push({
                    product_id: product.id,
                    weight: parseFloat(weight as string),
                    target_value: parseFloat(target as string),
                  });
                }
              });

              if (productAssignments.length === 0) {
                setError("Please assign to at least one product");
                return;
              }

              const payload = {
                kpi_id: selectedKpi.id,
                domain_id: domainId,
                product_assignments: productAssignments,
              };

              try {
                await fetch("/api/v1/roll-down/kpi/product", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                setShowAssignModal(false);
                setSelectedKpi(null);
              } catch (err) {
                setError("Failed to assign KPI to products");
              }
            }}>
              <div className="space-y-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Product</th>
                      <th className="text-left py-2">Weight (%)</th>
                      <th className="text-left py-2">Target Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="border-b">
                        <td className="py-2">{product.name}</td>
                        <td className="py-2">
                          <input name={`weight_${product.id}`} type="number" min="0" max="100" step="1" className="w-24 px-2 py-1 border rounded" placeholder="0-100" />
                        </td>
                        <td className="py-2">
                          <input name={`target_${product.id}`} type="number" step="0.01" className="w-32 px-2 py-1 border rounded" placeholder={selectedKpi.target_value.toString()} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Assign</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SlasTab({ domainId }: { domainId: string }) {
  const [slas, setSlas] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedSla, setSelectedSla] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [domainId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [slaData, productData] = await Promise.all([
        api.cypher(`MATCH (s:SLA {domain_id: $domainId}) WHERE s.archived_at IS NULL RETURN s ORDER BY s.createdAt DESC`, { domainId }),
        api.cypher(`MATCH (p:Product) RETURN p ORDER BY p.name`, {}),
      ]);
      setSlas(slaData.rows.map((r: any) => r.s));
      setProducts(productData.rows.map((r: any) => r.p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSla = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/slas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          description: formData.get("description"),
          service_type: formData.get("service_type"),
          target_value: parseFloat(formData.get("target_value") as string),
          target_unit: formData.get("target_unit"),
          measurement_window: formData.get("measurement_window"),
          window_duration: formData.get("window_duration"),
          compliance_threshold: parseFloat(formData.get("compliance_threshold") as string),
          domain_id: domainId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error ${res.status}`);
      }
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create SLA");
    }
  };

  const handleRollDown = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedProducts = products.filter((p) => formData.get(`product_${p.id}`) === "on");
    
    if (selectedProducts.length === 0) {
      setError("Please select at least one product");
      return;
    }

    const productAssignments = selectedProducts.map((p) => ({
      product_id: p.id,
      product_type: (formData.get(`type_${p.id}`) as string) || "application",
      weight: parseFloat(formData.get(`weight_${p.id}`) as string) || 0.5,
      target_value: parseFloat(formData.get(`target_${p.id}`) as string) || selectedSla.target_value,
    }));

    try {
      const res = await fetch("/api/v1/roll-down/sla/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain_id: domainId,
          sla_ids: [selectedSla.id],
          product_assignments: productAssignments,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error ${res.status}`);
      }
      setShowAssignModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to roll down SLA");
    }
  };

  if (loading) return <Loading what="SLAs" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3>Domain SLAs</h3>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => setShowCreateModal(true)}
        >
          + Create Domain SLA
        </button>
      </div>

      <Card>
        {slas.length === 0 ? (
          <p className="text-gray-600">No domain-specific SLAs defined. Create SLAs to define service level agreements for this domain.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">SLA</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Target</th>
                <th className="text-left py-2">Window</th>
                <th className="text-left py-2">Compliance</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slas.map((sla) => (
                <tr key={sla.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{sla.name}</div>
                    {sla.description && <div className="text-sm text-gray-600">{sla.description}</div>}
                  </td>
                  <td className="py-2">{sla.service_type}</td>
                  <td className="py-2">
                    {sla.target_value} {sla.target_unit}
                  </td>
                  <td className="py-2">{sla.measurement_window} ({sla.window_duration})</td>
                  <td className="py-2">{sla.compliance_threshold}%</td>
                  <td className="py-2">
                    <button className="text-blue-600 hover:underline mr-2" onClick={() => { setSelectedSla(sla); setShowAssignModal(true); }}>Roll Down to Products</button>
                    <button className="text-blue-600 hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Create Domain SLA</h3>
            <form onSubmit={handleCreateSla}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Name</label>
                <input name="name" required className="w-full border rounded px-3 py-2" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea name="description" className="w-full border rounded px-3 py-2" rows={2} />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Service Type</label>
                <select name="service_type" required className="w-full border rounded px-3 py-2">
                  <option value="response_time">Response Time</option>
                  <option value="availability">Availability</option>
                  <option value="throughput">Throughput</option>
                  <option value="accuracy">Accuracy</option>
                  <option value="resolution_time">Resolution Time</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Target Value</label>
                  <input name="target_value" type="number" step="0.01" required className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit</label>
                  <input name="target_unit" required className="w-full border rounded px-3 py-2" placeholder="ms, %, etc." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Measurement Window</label>
                  <select name="measurement_window" required className="w-full border rounded px-3 py-2">
                    <option value="p50">P50</option>
                    <option value="p90">P90</option>
                    <option value="p95">P95</option>
                    <option value="p99">P99</option>
                    <option value="average">Average</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Window Duration</label>
                  <input name="window_duration" required className="w-full border rounded px-3 py-2" placeholder="1h, 24h, 7d" />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Compliance Threshold (%)</label>
                <input name="compliance_threshold" type="number" step="0.1" required className="w-full border rounded px-3 py-2" placeholder="99.9" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && selectedSla && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Roll Down SLA to Products</h3>
            <p className="text-sm text-gray-600 mb-4">SLA: {selectedSla.name} ({selectedSla.target_value} {selectedSla.target_unit})</p>
            <form onSubmit={handleRollDown}>
              <table className="w-full mb-4">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Select</th>
                    <th className="text-left py-2">Product</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Weight</th>
                    <th className="text-left py-2">Target Value</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b">
                      <td className="py-2">
                        <input type="checkbox" name={`product_${product.id}`} />
                      </td>
                      <td className="py-2">{product.name}</td>
                      <td className="py-2">
                        <select name={`type_${product.id}`} className="border rounded px-2 py-1">
                          <option value="application">Application</option>
                          <option value="data">Data</option>
                        </select>
                      </td>
                      <td className="py-2">
                        <input type="number" step="0.1" min="0" max="1" name={`weight_${product.id}`} defaultValue="0.5" className="w-20 border rounded px-2 py-1" />
                      </td>
                      <td className="py-2">
                        <input type="number" step="0.01" name={`target_${product.id}`} defaultValue={selectedSla.target_value} className="w-24 border rounded px-2 py-1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Roll Down</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function JourneysTab({ domainId }: { domainId: string }) {
  const journeys = useFetch(
    () => api.cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(:Domain {id: $id})
       OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
       OPTIONAL MATCH (a)-[e:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
       WHERE e.observed_p99_ms > e.sla_p99_ms
       WITH j, count(DISTINCT a) AS activities, count(DISTINCT e) AS sla_breaches
       RETURN j.id AS id, j.name AS name, j.description AS description, activities, sla_breaches,
              COALESCE(sla_breaches * 1.0 / NULLIF(activities * 2, 0), 0) AS sla_breach_rate
       ORDER BY j.name`,
      { id: domainId }
    ),
    [domainId],
  );

  if (journeys.status === "loading") return <Loading what="journeys" />;
  if (journeys.status === "error") return <ErrorState message={journeys.error} />;

  const journeyList = journeys.data.rows as any[];

  return (
    <div className={styles.tabContent}>
      <div className={styles.cardGrid}>
        {journeyList.length === 0 ? (
          <p style={{ color: "var(--muted)", gridColumn: "1 / -1" }}>No journeys in this domain.</p>
        ) : (
          journeyList.map((j) => (
            <Card key={j.id} title={j.name}>
              {j.description && <p style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "12px" }}>{j.description}</p>}
              <KeyValueList rows={[
                { label: "Activities", value: j.activities },
                { label: "SLA Breaches", value: j.sla_breaches },
                { label: "Breach Rate", value: `${(j.sla_breach_rate * 100).toFixed(1)}%` },
              ]} />
              <a
                href={`#/explorer/journey-detail/${encodeURIComponent(j.id)}`}
                style={{
                  display: "inline-block",
                  marginTop: "12px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  color: "var(--accent)",
                  background: "var(--accent-soft)",
                  border: "1px solid color-mix(in oklch, var(--accent) 25%, var(--border))",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                }}
              >
                View Journey
              </a>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function InitiativesTab({ domainId }: { domainId: string }) {
  const initiatives = useFetch(
    () => api.cypher(
      `MATCH (i:Initiative)-[:AFFECTS]->(:Domain {id: $id})
       OPTIONAL MATCH (i)-[:TRACKED_BY]->(k:KPI)
       WITH i, count(DISTINCT k) AS kpi_count
       RETURN i.id AS id, i.name AS name, i.description AS description, i.status AS status,
              i.start_date AS start_date, i.target_date AS target_date, i.completion_rate AS completion_rate,
              kpi_count
       ORDER BY i.target_date`,
      { id: domainId }
    ),
    [domainId],
  );

  if (initiatives.status === "loading") return <Loading what="initiatives" />;
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
    <div className={styles.tabContent}>
      <Card title="Strategic Initiatives">
        {initiativeList.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No initiatives linked to this domain.</p>
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
      </Card>
    </div>
  );
}

function DependenciesTab({ domainId }: { domainId: string }) {
  const dependencies = useFetch(
    () => api.cypher(
      `MATCH (d:Domain {id: $id})
       OPTIONAL MATCH (d)-[:DEPENDS_ON]->(up:Domain)
       OPTIONAL MATCH (down:Domain)-[:DEPENDS_ON]->(d)
       RETURN d.id AS id, d.name AS name,
              collect(DISTINCT {id: up.id, name: up.name}) AS upstream,
              collect(DISTINCT {id: down.id, name: down.name}) AS downstream`,
      { id: domainId }
    ),
    [domainId],
  );

  if (dependencies.status === "loading") return <Loading what="dependencies" />;
  if (dependencies.status === "error") return <ErrorState message={dependencies.error} />;

  const data = dependencies.data?.rows?.[0] as any;
  const upstream = data?.upstream || [];
  const downstream = data?.downstream || [];

  return (
    <div className={styles.tabContent}>
      <div className={styles.cardGrid}>
        <Card title="Upstream Dependencies">
          {upstream.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No upstream dependencies.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Relation</th>
                </tr>
              </thead>
              <tbody>
                {upstream.map((dep: any) => (
                  <tr key={dep.id}>
                    <td>
                      <a href={`#/explorer/domain-detail/${encodeURIComponent(dep.id)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                        {dep.name}
                      </a>
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
        </Card>

        <Card title="Downstream Dependents">
          {downstream.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No downstream dependents.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Relation</th>
                </tr>
              </thead>
              <tbody>
                {downstream.map((dep: any) => (
                  <tr key={dep.id}>
                    <td>
                      <a href={`#/explorer/domain-detail/${encodeURIComponent(dep.id)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                        {dep.name}
                      </a>
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
        </Card>
      </div>

      {(upstream.length > 0 || downstream.length > 0) && (
        <div style={{ marginTop: "16px" }}>
          <Card title="Dependency Graph">
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: "16px", 
              padding: "40px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius-md)",
              minHeight: "200px"
            }}>
              {upstream.map((dep: any, i: number) => (
                <div key={dep.id} style={{ textAlign: "center" }}>
                  <div style={{ 
                    padding: "12px 16px", 
                    background: "var(--surface)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontWeight: 500
                  }}>
                    {dep.name}
                  </div>
                  <div style={{ 
                    marginTop: "8px", 
                    fontSize: "20px", 
                    color: "var(--muted)" 
                  }}>↓</div>
                </div>
              ))}
              
              <div style={{ 
                padding: "16px 24px", 
                background: "var(--accent-soft)", 
                border: "2px solid var(--accent)", 
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--accent)"
              }}>
                {data?.name || "This Domain"}
              </div>

              {downstream.map((dep: any, i: number) => (
                <div key={dep.id} style={{ textAlign: "center" }}>
                  <div style={{ 
                    marginTop: "8px", 
                    fontSize: "20px", 
                    color: "var(--muted)" 
                  }}>↓</div>
                  <div style={{ 
                    padding: "12px 16px", 
                    background: "var(--surface)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontWeight: 500
                  }}>
                    {dep.name}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab({ domainId }: { domainId: string }) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        <KpiDashboard domainId={domainId} />
        <SlaDashboard domainId={domainId} />
        <HealthDashboard domainId={domainId} />
      </div>
    </div>
  );
}

function PersonasTab({ domainId }: { domainId: string }) {
  return (
    <div className={styles.tabContent}>
      <PersonaAssignment domainId={domainId} />
    </div>
  );
}

function RollDownTab({ domainId, domainName }: { domainId: string; domainName: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpiRollDowns, setKpiRollDowns] = useState<any[]>([]);
  const [okrRollDowns, setOkrRollDowns] = useState<any[]>([]);

  useEffect(() => {
    loadRollDownData();
  }, [domainId]);

  const loadRollDownData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, okrData] = await Promise.all([
        api.cypher(
          `MATCH (r:RollDown {type: 'kpi'})-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {domain_id: $domainId})
           OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
           RETURN r, a, k
           ORDER BY r.createdAt DESC`,
          { domainId },
        ),
        api.cypher(
          `MATCH (r:RollDown {type: 'okr'})-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {domain_id: $domainId})
           OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
           RETURN r, a, o
           ORDER BY r.createdAt DESC`,
          { domainId },
        ),
      ]);
      setKpiRollDowns(kpiData.rows);
      setOkrRollDowns(okrData.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roll-down data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="roll-down data" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        <Card title="KPI Roll-Down Assignments">
          {kpiRollDowns.length === 0 ? (
            <p className="text-gray-600">No KPI roll-downs assigned to this domain</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">KPI</th>
                  <th className="text-left py-2">Weight (%)</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {kpiRollDowns.map((row: any) => (
                  <tr key={row.r.id} className="border-b">
                    <td className="py-2">{row.k?.properties.name || "Unknown"}</td>
                    <td className="py-2">{row.a.weight}%</td>
                    <td className="py-2">{row.a.target_value}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          row.a.status === "committed"
                            ? "bg-green-100 text-green-800"
                            : row.a.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {row.a.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <button className="text-blue-600 hover:underline mr-2">Commit</button>
                      <button className="text-blue-600 hover:underline">Request Adjustment</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="OKR Roll-Down Assignments">
          {okrRollDowns.length === 0 ? (
            <p className="text-gray-600">No OKR roll-downs assigned to this domain</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">OKR Cycle</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {okrRollDowns.map((row: any) => (
                  <tr key={row.r.id} className="border-b">
                    <td className="py-2">{row.o?.properties.name || "Unknown"}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          row.a.status === "committed"
                            ? "bg-green-100 text-green-800"
                            : row.a.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {row.a.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <button className="text-blue-600 hover:underline mr-2">View Details</button>
                      <button className="text-blue-600 hover:underline">Commit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function RisksTab({ domainId, domainName }: { domainId: string; domainName: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [risks, setRisks] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadRisks();
  }, [domainId]);

  const loadRisks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/risk-register?domain=${encodeURIComponent(domainName)}`);
      const data = await response.json();
      setRisks(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load risks");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="risks" />;
  if (error) return <ErrorState message={error} />;

  const severity = (likelihood: number, impact: number) => likelihood * impact;
  const severityTone = (score: number) => {
    if (score >= 16) return "danger";
    if (score >= 9) return "warn";
    return "good";
  };

  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3>Risks for {domainName}</h3>
        <button 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => setShowCreateModal(true)}
        >
          + Add Risk
        </button>
      </div>

      {risks.length === 0 ? (
        <Card>
          <p className="text-gray-600">No risks recorded for this domain</p>
        </Card>
      ) : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Risk</th>
                <th className="text-left py-2">Owner</th>
                <th className="text-left py-2">Severity</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Trend</th>
                <th className="text-left py-2">Category</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((risk: any) => (
                <tr key={risk.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{risk.name}</div>
                    {risk.description && <div className="text-sm text-gray-600">{risk.description}</div>}
                  </td>
                  <td className="py-2">{risk.owner}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      severityTone(severity(risk.likelihood, risk.impact)) === "danger" ? "bg-red-100 text-red-800" :
                      severityTone(severity(risk.likelihood, risk.impact)) === "warn" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {severity(risk.likelihood, risk.impact)}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      risk.status === "resolved" ? "bg-green-100 text-green-800" :
                      risk.status === "mitigating" ? "bg-blue-100 text-blue-800" :
                      risk.status === "accepted" ? "bg-purple-100 text-purple-800" :
                      "bg-orange-100 text-orange-800"
                    }`}>
                      {risk.status}
                    </span>
                  </td>
                  <td className="py-2">{risk.trend === "up" ? "↗" : risk.trend === "down" ? "↘" : "→"}</td>
                  <td className="py-2">{risk.category || "-"}</td>
                  <td className="py-2">
                    <button className="text-blue-600 hover:underline mr-2">Edit</button>
                    <button className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Add Risk</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const payload = {
                name: formData.get("name"),
                owner: formData.get("owner"),
                domain: domainName,
                likelihood: parseInt(formData.get("likelihood") as string),
                impact: parseInt(formData.get("impact") as string),
                status: formData.get("status"),
                trend: formData.get("trend"),
                description: formData.get("description"),
                category: formData.get("category"),
                risk_type: formData.get("risk_type"),
              };
              try {
                await fetch("/api/v1/risk-register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                setShowCreateModal(false);
                loadRisks();
              } catch (err) {
                setError("Failed to create risk");
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Risk Name</label>
                  <input name="name" required className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Owner</label>
                  <input name="owner" required className="w-full px-3 py-2 border rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Likelihood (1-5)</label>
                    <input name="likelihood" type="number" min="1" max="5" required className="w-full px-3 py-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Impact (1-5)</label>
                    <input name="impact" type="number" min="1" max="5" required className="w-full px-3 py-2 border rounded" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select name="status" required className="w-full px-3 py-2 border rounded">
                    <option value="open">Open</option>
                    <option value="mitigating">Mitigating</option>
                    <option value="accepted">Accepted</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Trend</label>
                  <select name="trend" required className="w-full px-3 py-2 border rounded">
                    <option value="up">Increasing</option>
                    <option value="flat">Stable</option>
                    <option value="down">Decreasing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input name="category" className="w-full px-3 py-2 border rounded" placeholder="e.g., Technology, Supply Chain" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Risk Type</label>
                  <select name="risk_type" className="w-full px-3 py-2 border rounded">
                    <option value="">Select type...</option>
                    <option value="strategic">Strategic</option>
                    <option value="operational">Operational</option>
                    <option value="financial">Financial</option>
                    <option value="compliance">Compliance</option>
                    <option value="security">Security</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea name="description" rows={3} className="w-full px-3 py-2 border rounded" />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
