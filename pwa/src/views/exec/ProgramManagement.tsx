import { useState, useEffect } from "react";
import { api } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";

interface Program {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

interface ProgramKPI {
  id: string;
  name: string;
  category: string;
  target_value: number;
  unit: string;
  target_direction: string;
  measurement_frequency: string;
  owner_role: string;
  program_id: string;
  createdAt: string;
}

interface ProgramOKR {
  id: string;
  name: string;
  description: string;
  attributes: {
    cycle_name?: string;
    status?: string;
    progress?: number;
  };
  createdAt: string;
}

interface ProgramRollDown {
  id: string;
  type: string;
  status: string;
  okr_name?: string;
  kpi_name?: string;
  assignments: Array<{ id: string; product_id: string; product_name?: string; status: string }>;
  createdAt: string;
}

export function ProgramManagement() {
  const [activeTab, setActiveTab] = useState<"programs" | "kpis" | "okrs" | "roll-down">("programs");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [kpis, setKpis] = useState<ProgramKPI[]>([]);
  const [okrs, setOkrs] = useState<ProgramOKR[]>([]);
  const [rollDowns, setRollDowns] = useState<ProgramRollDown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateProgramModal, setShowCreateProgramModal] = useState(false);
  const [showCreateKpiModal, setShowCreateKpiModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [programData, kpiData, okrData, rollDownData] = await Promise.all([
        api.cypher(`MATCH (p:Program) RETURN p ORDER BY p.createdAt DESC`),
        api.cypher(`MATCH (k:KPI) WHERE k.program_id IS NOT NULL RETURN k ORDER BY k.createdAt DESC`),
        api.cypher(`MATCH (o:OKRDirective) WHERE o.attributes_json CONTAINS 'program' RETURN o ORDER BY o.createdAt DESC LIMIT 50`),
        api.cypher(
          `MATCH (r:RollDown)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
           WHERE r.program_id IS NOT NULL
           OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
           OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
           OPTIONAL MATCH (a)-[:FOR_PRODUCT]->(p:Product)
           RETURN r, a, o, k, p ORDER BY r.createdAt DESC`,
        ),
      ]);
      setPrograms(programData.rows.map((r: any) => r.p));
      setKpis(kpiData.rows.map((r: any) => r.k));
      setOkrs(okrData.rows.map((r: any) => ({
        id: r.o.id,
        name: r.o.name,
        description: r.o.description,
        attributes: JSON.parse(r.o.attributes_json || "{}"),
        createdAt: r.o.createdAt,
      })));
      const rdMap = new Map<string, ProgramRollDown>();
      for (const row of rollDownData.rows as any[]) {
        if (!rdMap.has(row.r.id)) {
          rdMap.set(row.r.id, {
            id: row.r.id,
            type: row.r.type,
            status: row.r.status,
            okr_name: row.o?.name,
            kpi_name: row.k?.name,
            assignments: [],
            createdAt: row.r.createdAt,
          });
        }
        if (row.a) {
          rdMap.get(row.r.id)!.assignments.push({
            id: row.a.id,
            product_id: row.a.product_id,
            product_name: row.p?.name,
            status: row.a.status,
          });
        }
      }
      setRollDowns(Array.from(rdMap.values()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="program management" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <ViewHeader
        title="Program Management"
        lede="Define and manage program-level KPIs, OKRs, and roll-down to products"
      />

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "programs" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("programs")}
        >
          Programs
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "kpis" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("kpis")}
        >
          KPIs
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "okrs" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("okrs")}
        >
          OKRs
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "roll-down" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("roll-down")}
        >
          Roll-Down
        </button>
      </div>

      {activeTab === "programs" && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Programs</h2>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded"
              onClick={() => setShowCreateProgramModal(true)}
            >
              + Create Program
            </button>
          </div>

          {programs.length === 0 ? (
            <p className="text-gray-600">No programs defined yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Program</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Created</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((program) => (
                  <tr key={program.id} className="border-b">
                    <td className="py-2">
                      <div className="font-medium">{program.name}</div>
                      {program.description && <div className="text-sm text-gray-600">{program.description}</div>}
                    </td>
                    <td className="py-2">
                      <Pill tone={program.status === "active" ? "good" : "neutral"}>{program.status}</Pill>
                    </td>
                    <td className="py-2">{new Date(program.createdAt).toLocaleDateString()}</td>
                    <td className="py-2">
                      <button className="text-blue-600 hover:underline mr-2">View</button>
                      <button className="text-blue-600 hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === "kpis" && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Program KPIs</h2>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded"
              onClick={() => setShowCreateKpiModal(true)}
            >
              + Create KPI
            </button>
          </div>

          {kpis.length === 0 ? (
            <p className="text-gray-600">No program KPIs defined yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">KPI</th>
                  <th className="text-left py-2">Category</th>
                  <th className="text-left py-2">Target</th>
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
                    </td>
                    <td className="py-2">{kpi.category}</td>
                    <td className="py-2">
                      {kpi.target_value} {kpi.unit}
                    </td>
                    <td className="py-2">{kpi.measurement_frequency}</td>
                    <td className="py-2">{kpi.owner_role || "-"}</td>
                    <td className="py-2">
                      <button className="text-blue-600 hover:underline mr-2">Edit</button>
                      <button className="text-red-600 hover:underline">Archive</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === "okrs" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Program OKRs</h2>
          {okrs.length === 0 ? (
            <p className="text-gray-600">No program OKR directives found. Create OKR directives and tag them with a program to see them here.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Directive</th>
                  <th className="text-left py-2">Cycle</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Progress</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {okrs.map((okr) => (
                  <tr key={okr.id} className="border-b">
                    <td className="py-2">
                      <div className="font-medium">{okr.name}</div>
                      {okr.description && <div className="text-sm text-gray-600">{okr.description}</div>}
                    </td>
                    <td className="py-2">{okr.attributes.cycle_name || "-"}</td>
                    <td className="py-2">
                      <Pill tone={okr.attributes.status === "on_track" ? "good" : okr.attributes.status === "at_risk" ? "warn" : "neutral"}>
                        {okr.attributes.status || "unknown"}
                      </Pill>
                    </td>
                    <td className="py-2">
                      {okr.attributes.progress != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${Math.min(100, okr.attributes.progress)}%` }}
                            />
                          </div>
                          <span className="text-sm">{okr.attributes.progress.toFixed(0)}%</span>
                        </div>
                      ) : "-"}
                    </td>
                    <td className="py-2">{new Date(okr.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === "roll-down" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Program Roll-Down to Products</h2>
          {rollDowns.length === 0 ? (
            <p className="text-gray-600">No program roll-downs found. Use the OKR Roll-Down feature to push program targets to products.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">KPI / OKR</th>
                  <th className="text-left py-2">Products</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {rollDowns.map((rd) => (
                  <tr key={rd.id} className="border-b">
                    <td className="py-2 uppercase text-xs font-semibold text-gray-500">{rd.type}</td>
                    <td className="py-2">{rd.okr_name || rd.kpi_name || "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {rd.assignments.map((a) => (
                          <Pill key={a.id} tone={a.status === "approved" ? "good" : a.status === "rejected" ? "danger" : "neutral"}>
                            {a.product_name || a.product_id}
                          </Pill>
                        ))}
                        {rd.assignments.length === 0 && <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    <td className="py-2">
                      <Pill tone={rd.status === "approved" ? "good" : "neutral"}>{rd.status}</Pill>
                    </td>
                    <td className="py-2">{new Date(rd.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {showCreateProgramModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowCreateProgramModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Create Program</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const payload = {
                name: formData.get("name"),
                description: formData.get("description"),
                status: formData.get("status"),
              };
              try {
                await api.cypher(
                  `CREATE (p:Program {
                    id: randomUUID(),
                    name: $name,
                    description: $description,
                    status: $status,
                    createdAt: datetime()
                  }) RETURN p`,
                  payload,
                );
                setShowCreateProgramModal(false);
                loadData();
              } catch (err) {
                setError("Failed to create program");
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Program Name</label>
                  <input name="name" required className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea name="description" rows={2} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select name="status" required className="w-full px-3 py-2 border rounded">
                    <option value="active">Active</option>
                    <option value="planned">Planned</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateProgramModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateKpiModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowCreateKpiModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Create Program KPI</h3>
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
                measurement_frequency: formData.get("measurement_frequency"),
                owner_role: formData.get("owner_role"),
                program_id: selectedProgram?.id,
              };
              try {
                await fetch("/api/v1/kpis", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                setShowCreateKpiModal(false);
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
                  <input name="category" required className="w-full px-3 py-2 border rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Target Value</label>
                    <input name="target_value" type="number" step="0.01" required className="w-full px-3 py-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <input name="unit" required className="w-full px-3 py-2 border rounded" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Direction</label>
                  <select name="target_direction" required className="w-full px-3 py-2 border rounded">
                    <option value="higher_is_better">Higher is better</option>
                    <option value="lower_is_better">Lower is better</option>
                  </select>
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
                  <input name="owner_role" className="w-full px-3 py-2 border rounded" />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateKpiModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
