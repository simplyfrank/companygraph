import { useState, useEffect } from "react";
import { api } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";

interface KPI {
  id: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  target_value: number;
  target_direction: "higher_is_better" | "lower_is_better";
  warning_threshold?: number;
  critical_threshold?: number;
  measurement_frequency: string;
  owner_role?: string;
  domain_id?: string;
  createdAt: string;
  updatedAt: string;
}

interface DomainAssignment {
  domain_id: string;
  domain_name: string;
  weight: number;
  target_value: number;
  status: "pending" | "committed" | "rejected";
}

export function ExecKpiManagement() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "assignments">("list");
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, domainData] = await Promise.all([
        api.cypher(`MATCH (k:KPI) RETURN k ORDER BY k.createdAt DESC`),
        api.cypher(`MATCH (d:Domain) RETURN d ORDER BY d.name`),
      ]);
      setKpis(kpiData.rows.map((r: any) => r.k));
      setDomains(domainData.rows.map((r: any) => r.d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="KPI management" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <ViewHeader
        title="KPI Management"
        lede="Define and manage organizational KPIs, assign to domains with contribution weights"
      />

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("list")}
        >
          KPI List
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "assignments" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("assignments")}
        >
          Domain Assignments
        </button>
      </div>

      {activeTab === "list" && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Organizational KPIs</h2>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded"
              onClick={() => setShowCreateModal(true)}
            >
              + Create KPI
            </button>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
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
                  <td className="py-3">{kpi.name}</td>
                  <td className="py-3">
                    <Pill tone="neutral">{kpi.category}</Pill>
                  </td>
                  <td className="py-3">
                    {kpi.target_value} {kpi.unit}
                  </td>
                  <td className="py-3">{kpi.target_direction}</td>
                  <td className="py-3">{kpi.measurement_frequency}</td>
                  <td className="py-3">{kpi.owner_role || "-"}</td>
                  <td className="py-3">
                    <button
                      className="text-blue-600 hover:underline mr-2"
                      onClick={() => setSelectedKpi(kpi)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        setSelectedKpi(kpi);
                        setActiveTab("assignments");
                      }}
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === "assignments" && selectedKpi && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              Domain Assignments: {selectedKpi.name}
            </h2>
            <button
              className="px-4 py-2 bg-gray-200 rounded"
              onClick={() => setSelectedKpi(null)}
            >
              Back to List
            </button>
          </div>

          <div className="mb-4 p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">
              <strong>Target:</strong> {selectedKpi.target_value} {selectedKpi.unit} |{" "}
              <strong>Direction:</strong> {selectedKpi.target_direction}
            </p>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Domain</th>
                <th className="text-left py-2">Weight (%)</th>
                <th className="text-left py-2">Domain Target</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain.id} className="border-b">
                  <td className="py-3">{domain.name}</td>
                  <td className="py-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="w-20 border rounded px-2 py-1"
                      placeholder="0"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      className="w-32 border rounded px-2 py-1"
                      placeholder={selectedKpi.target_value.toString()}
                    />
                  </td>
                  <td className="py-3">
                    <Pill tone="neutral">Not assigned</Pill>
                  </td>
                  <td className="py-3">
                    <button className="text-blue-600 hover:underline">
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 p-4 bg-blue-50 rounded">
            <p className="text-sm">
              <strong>Total Weight:</strong> 0% (must sum to 100%)
            </p>
          </div>
        </Card>
      )}

      {activeTab === "assignments" && !selectedKpi && (
        <Card>
          <p className="text-gray-600">Select a KPI from the list to view domain assignments</p>
        </Card>
      )}
    </>
  );
}
