import { useState, useEffect } from "react";
import { api } from "../../api";
import { Card } from "../../components/Card";
import { PieChartCard, HorizontalBarChartCard } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Risk.module.css";

interface RiskSummary {
  total_risks: number;
  open_risks: number;
  mitigating_risks: number;
  accepted_risks: number;
  resolved_risks: number;
  avg_severity: number | null;
  max_severity: number | null;
  critical_risks: number;
  high_risks: number;
  medium_risks: number;
  low_risks: number;
  escalated_risks: number;
  domains_affected: number;
  owners_involved: number;
}

interface RiskByDomain {
  domain: string;
  total_risks: number;
  open_risks: number;
  mitigating_risks: number;
  resolved_risks: number;
  avg_severity: number;
  max_severity: number;
  escalated_risks: number;
}

interface RiskByOwner {
  owner: string;
  total_risks: number;
  open_risks: number;
  mitigating_risks: number;
  resolved_risks: number;
  avg_severity: number;
  max_severity: number;
  escalated_risks: number;
}

interface RiskByCategory {
  category: string;
  total_risks: number;
  open_risks: number;
  mitigating_risks: number;
  resolved_risks: number;
  avg_severity: number;
  max_severity: number;
}

interface RiskByRiskType {
  risk_type: string;
  total_risks: number;
  open_risks: number;
  mitigating_risks: number;
  resolved_risks: number;
  avg_severity: number;
  max_severity: number;
}

interface RegulatedInventory {
  domains: string[];
  regulations: string[];
  matrix: Array<Record<string, number>>;
}

interface SodViolation {
  activity1_id: string;
  activity1_name: string;
  activity2_id: string;
  activity2_name: string;
  conflicting_role: string;
  tags1: string[];
  tags2: string[];
}

interface ThirdPartySystem {
  system_id: string;
  system_name: string;
  vendor: string;
  contract_end: string | null;
  dpa_signed: boolean | null;
  data_classification: string | null;
  critical_journey_count: number;
  domains: string[];
}

export function ExecRiskDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [byDomain, setByDomain] = useState<RiskByDomain[]>([]);
  const [byOwner, setByOwner] = useState<RiskByOwner[]>([]);
  const [byCategory, setByCategory] = useState<RiskByCategory[]>([]);
  const [byRiskType, setByRiskType] = useState<RiskByRiskType[]>([]);
  const [regulatedInventory, setRegulatedInventory] = useState<RegulatedInventory | null>(null);
  const [sodViolations, setSodViolations] = useState<SodViolation[]>([]);
  const [thirdPartyRegister, setThirdPartyRegister] = useState<ThirdPartySystem[]>([]);

  useEffect(() => {
    loadRiskData();
  }, []);

  const loadRiskData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, domainData, ownerData, categoryData, riskTypeData, inventoryData, sodData, thirdPartyData] = await Promise.all([
        fetch("/api/v1/risk-register/aggregation/summary").then((r) => r.json()).then((d) => d.data),
        fetch("/api/v1/risk-register/aggregation/domain").then((r) => r.json()).then((d) => d.data),
        fetch("/api/v1/risk-register/aggregation/owner").then((r) => r.json()).then((d) => d.data),
        fetch("/api/v1/risk-register/aggregation/category").then((r) => r.json()).then((d) => d.data),
        fetch("/api/v1/risk-register/aggregation/risk-type").then((r) => r.json()).then((d) => d.data),
        fetch("/api/v1/risk-compliance/regulated-activity-inventory").then((r) => r.json()).then((d) => d.data).catch(() => null),
        fetch("/api/v1/risk-compliance/sod-violations").then((r) => r.json()).then((d) => d.data).catch(() => ({ violations: [] })),
        fetch("/api/v1/risk-compliance/third-party-register").then((r) => r.json()).then((d) => d.data).catch(() => ({ register: [] })),
      ]);
      setSummary(summaryData);
      setByDomain(domainData);
      setByOwner(ownerData);
      setByCategory(categoryData);
      setByRiskType(riskTypeData);
      setRegulatedInventory(inventoryData);
      setSodViolations(sodData.violations || []);
      setThirdPartyRegister(thirdPartyData.register || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load risk data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="risk dashboard" />;
  if (error) return <ErrorState message={error} />;

  const severityTone = (score: number) => {
    if (score >= 16) return "danger";
    if (score >= 9) return "warn";
    return "good";
  };

  return (
    <>
      <ViewHeader title="Risk Dashboard" lede="Organizational risk aggregation and rollup across all domains." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <Card title="Total Risks">
          <div className={styles.metricValue}>{summary?.total_risks || 0}</div>
        </Card>
        <Card title="Open Risks">
          <div className={styles.metricValue} style={{ color: "var(--warn)" }}>{summary?.open_risks || 0}</div>
        </Card>
        <Card title="Avg Severity">
          <div className={styles.metricValue}>{summary?.avg_severity ? summary.avg_severity.toFixed(1) : "N/A"}</div>
        </Card>
        <Card title="Critical Risks">
          <div className={styles.metricValue} style={{ color: "var(--danger)" }}>{summary?.critical_risks || 0}</div>
        </Card>
        <Card title="Escalated Risks">
          <div className={styles.metricValue} style={{ color: "var(--accent)" }}>{summary?.escalated_risks || 0}</div>
        </Card>
        <Card title="Domains Affected">
          <div className={styles.metricValue}>{summary?.domains_affected || 0}</div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px", marginBottom: "32px" }}>
        <PieChartCard
          title="Status Distribution"
          data={[
            { label: "open", value: summary?.open_risks || 0, color: "#f59e0b" },
            { label: "mitigating", value: summary?.mitigating_risks || 0, color: "#3b82f6" },
            { label: "accepted", value: summary?.accepted_risks || 0, color: "#8b5cf6" },
            { label: "resolved", value: summary?.resolved_risks || 0, color: "#22c55e" },
          ]}
          donut
        />
        <PieChartCard
          title="Severity Distribution"
          data={[
            { label: "critical", value: summary?.critical_risks || 0, color: "#ef4444" },
            { label: "high", value: summary?.high_risks || 0, color: "#f97316" },
            { label: "medium", value: summary?.medium_risks || 0, color: "#eab308" },
            { label: "low", value: summary?.low_risks || 0, color: "#22c55e" },
          ]}
          donut
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px", marginBottom: "32px" }}>
        <Card title="Risks by Domain">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Domain</th>
                <th className="text-right py-2">Total</th>
                <th className="text-right py-2">Open</th>
                <th className="text-right py-2">Avg Severity</th>
                <th className="text-right py-2">Escalated</th>
              </tr>
            </thead>
            <tbody>
              {byDomain.map((row) => (
                <tr key={row.domain} className="border-b">
                  <td className="py-2">{row.domain}</td>
                  <td className="text-right py-2">{row.total_risks}</td>
                  <td className="text-right py-2">{row.open_risks}</td>
                  <td className="text-right py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      severityTone(row.avg_severity) === "danger" ? "bg-red-100 text-red-800" :
                      severityTone(row.avg_severity) === "warn" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {row.avg_severity.toFixed(1)}
                    </span>
                  </td>
                  <td className="text-right py-2">{row.escalated_risks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Risks by Owner">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Owner</th>
                <th className="text-right py-2">Total</th>
                <th className="text-right py-2">Open</th>
                <th className="text-right py-2">Avg Severity</th>
                <th className="text-right py-2">Escalated</th>
              </tr>
            </thead>
            <tbody>
              {byOwner.slice(0, 10).map((row) => (
                <tr key={row.owner} className="border-b">
                  <td className="py-2">{row.owner}</td>
                  <td className="text-right py-2">{row.total_risks}</td>
                  <td className="text-right py-2">{row.open_risks}</td>
                  <td className="text-right py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      severityTone(row.avg_severity) === "danger" ? "bg-red-100 text-red-800" :
                      severityTone(row.avg_severity) === "warn" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {row.avg_severity.toFixed(1)}
                    </span>
                  </td>
                  <td className="text-right py-2">{row.escalated_risks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px" }}>
        <HorizontalBarChartCard
          title="Risks by Category"
          data={byCategory.map((row) => ({
            label: row.category,
            value: row.total_risks,
          }))}
          xLabel="risks"
        />
        <HorizontalBarChartCard
          title="Risks by Risk Type"
          data={byRiskType.map((row) => ({
            label: row.risk_type,
            value: row.total_risks,
          }))}
          xLabel="risks"
        />
      </div>

      {/* Compliance Section */}
      <div style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "24px" }}>Compliance & Risk Controls</h2>
        
        {/* Regulated Activity Inventory */}
        {regulatedInventory && (
          <div style={{ marginBottom: "24px" }}>
            <Card title="Regulated Activity Inventory (Domain × Regulation)">
              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ minWidth: "600px" }}>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Domain</th>
                      {regulatedInventory.regulations.map((reg) => (
                        <th key={reg} className="text-right py-2">{reg}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {regulatedInventory.matrix.map((row) => (
                      <tr key={row.domain} className="border-b">
                        <td className="py-2">{row.domain}</td>
                        {regulatedInventory.regulations.map((reg) => (
                          <td key={reg} className="text-right py-2">
                            {(row[reg] as number | undefined) && (row[reg] as number) > 0 ? (
                              <span className="px-2 py-1 rounded text-sm bg-blue-100 text-blue-800">
                                {row[reg] as number}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* SoD Violations */}
        <div style={{ marginBottom: "24px" }}>
          <Card title={`Segregation of Duties Violations (${sodViolations.length})`}>
            {sodViolations.length === 0 ? (
              <p style={{ color: "var(--muted)", padding: "16px" }}>No SoD violations detected.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ minWidth: "600px" }}>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Conflicting Role</th>
                      <th className="text-left py-2">Activity 1</th>
                      <th className="text-left py-2">Activity 2</th>
                      <th className="text-left py-2">Regulatory Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sodViolations.map((v, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2">
                          <span className="px-2 py-1 rounded text-sm bg-red-100 text-red-800">
                            {v.conflicting_role}
                          </span>
                        </td>
                        <td className="py-2">{v.activity1_name}</td>
                        <td className="py-2">{v.activity2_name}</td>
                        <td className="py-2">
                          {[...new Set([...v.tags1, ...v.tags2])].map((tag) => (
                            <span key={tag} className="inline-block px-2 py-1 rounded text-xs bg-purple-100 text-purple-800 mr-1 mb-1">
                              {tag}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Third-Party Register */}
        <Card title={`Third-Party Systems Register (${thirdPartyRegister.length})`}>
          {thirdPartyRegister.length === 0 ? (
            <p style={{ color: "var(--muted)", padding: "16px" }}>No third-party systems registered.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="w-full" style={{ minWidth: "600px" }}>
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">System</th>
                    <th className="text-left py-2">Vendor</th>
                    <th className="text-left py-2">Data Classification</th>
                    <th className="text-left py-2">DPA Signed</th>
                    <th className="text-right py-2">Critical Journeys</th>
                    <th className="text-left py-2">Domains</th>
                  </tr>
                </thead>
                <tbody>
                  {thirdPartyRegister.map((sys) => (
                    <tr key={sys.system_id} className="border-b">
                      <td className="py-2">{sys.system_name}</td>
                      <td className="py-2">{sys.vendor || "-"}</td>
                      <td className="py-2">
                        {sys.data_classification ? (
                          <span className={`px-2 py-1 rounded text-sm ${
                            sys.data_classification === "restricted" ? "bg-red-100 text-red-800" :
                            sys.data_classification === "confidential" ? "bg-yellow-100 text-yellow-800" :
                            "bg-green-100 text-green-800"
                          }`}>
                            {sys.data_classification}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-2">
                        {sys.dpa_signed === true ? (
                          <span className="px-2 py-1 rounded text-sm bg-green-100 text-green-800">Yes</span>
                        ) : sys.dpa_signed === false ? (
                          <span className="px-2 py-1 rounded text-sm bg-red-100 text-red-800">No</span>
                        ) : "-"}
                      </td>
                      <td className="text-right py-2">{sys.critical_journey_count}</td>
                      <td className="py-2">
                        {sys.domains.slice(0, 3).map((d) => (
                          <span key={d} className="inline-block px-2 py-1 rounded text-xs bg-gray-100 text-gray-800 mr-1 mb-1">
                            {d}
                          </span>
                        ))}
                        {sys.domains.length > 3 && <span className="text-xs text-gray-500">+{sys.domains.length - 3}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
