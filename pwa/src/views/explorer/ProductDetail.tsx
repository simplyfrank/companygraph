import { useState, useEffect } from "react";
import { api, rdf } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { OkrCrud } from "../../components/OkrCrud";

interface Product {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

interface ProductKPI {
  id: string;
  name: string;
  category: string;
  target_value: number;
  unit: string;
  target_direction: string;
  measurement_frequency: string;
  owner_role: string;
  product_id: string;
  createdAt: string;
}

export function ProductDetail({ productId }: { productId: string }) {
  const [activeTab, setActiveTab] = useState<"overview" | "kpis" | "okrs" | "roll-down">("overview");
  const [product, setProduct] = useState<Product | null>(null);
  const [kpis, setKpis] = useState<ProductKPI[]>([]);
  const [okrs, setOkrs] = useState<any[]>([]);
  const [rollDowns, setRollDowns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateKpiModal, setShowCreateKpiModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"jsonld" | "turtle" | "ntriples">("jsonld");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, [productId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [productData, kpiData, okrData, rollDownData] = await Promise.all([
        api.cypher(`MATCH (p:Product {id: $productId}) RETURN p`, { productId }),
        api.cypher(`MATCH (k:KPI {product_id: $productId}) RETURN k ORDER BY k.createdAt DESC`, { productId }),
        fetch(`/api/v1/okr-directives/by-product/${productId}`).then((r) => r.json()).catch(() => []),
        api.cypher(
          `MATCH (r:RollDown)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {product_id: $productId})
           OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
           OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
           OPTIONAL MATCH (r)-[:FOR_SLA]->(s:SLA)
           OPTIONAL MATCH (r)-[:FROM_DOMAIN]->(d:Domain)
           OPTIONAL MATCH (r)-[:FROM_PROGRAM]->(p:Program)
           RETURN r, a, k, o, s, d, p
           ORDER BY r.createdAt DESC`,
          { productId },
        ),
      ]);
      setProduct((productData.rows[0]?.p as Product) || null);
      setKpis(kpiData.rows.map((r: any) => r.k));
      setOkrs(Array.isArray(okrData) ? okrData : (okrData.rows ?? []).map((r: any) => r.o ?? r));
      setRollDowns(rollDownData.rows.map((r: any) => ({
        id: r.r.id,
        assignmentId: r.a.id,
        type: r.r.type,
        status: r.a.status,
        kpiName: r.k?.name,
        okrName: r.o?.name,
        slaName: r.s?.name,
        sourceDomain: r.d?.name,
        sourceProgram: r.p?.name,
        targetValue: r.a.target_value,
        weight: r.a.weight,
        createdAt: r.r.createdAt,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRollDown = async (assignmentId: string) => {
    try {
      const res = await fetch("/api/v1/roll-down/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignmentId, approver_id: "system" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error ${res.status}`);
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve roll-down");
    }
  };

  const handleRejectRollDown = async (assignmentId: string) => {
    try {
      const res = await fetch("/api/v1/roll-down/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignmentId, rejecter_id: "system", reason: "Rejected by product owner" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error ${res.status}`);
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject roll-down");
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await rdf.export(exportFormat);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `product-${productId}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Failed to export product data");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) return <Loading what="product" />;
  if (error) return <ErrorState message={error} />;
  if (!product) return <ErrorState message="Product not found" />;

  return (
    <>
      <ViewHeader
        title={product.name}
        lede={product.description || "Product management and performance tracking"}
      />

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "overview" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
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
          Roll-Down Status
        </button>
      </div>

      {activeTab === "overview" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 className="text-xl font-semibold">Product Overview</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select 
                value={exportFormat} 
                onChange={(e) => setExportFormat(e.target.value as any)}
                style={{ padding: 4, borderRadius: 4, border: "1px solid var(--border)" }}
              >
                <option value="jsonld">JSON-LD</option>
                <option value="turtle">Turtle</option>
                <option value="ntriples">N-Triples</option>
              </select>
              <Button onClick={handleExport} disabled={isExporting}>
                {isExporting ? "Exporting..." : "Export RDF"}
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600">Status</label>
              <Pill tone={product.status === "active" ? "good" : "neutral"}>{product.status}</Pill>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600">Created</label>
              <p>{new Date(product.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600">KPIs</label>
              <p>{kpis.length} defined</p>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "kpis" && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Product KPIs</h2>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded"
              onClick={() => setShowCreateKpiModal(true)}
            >
              + Create KPI
            </button>
          </div>

          {kpis.length === 0 ? (
            <p className="text-gray-600">No product KPIs defined yet</p>
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
          <h2 className="text-xl font-semibold mb-4">Product OKRs</h2>
          {okrs.length === 0 ? (
            <p className="text-gray-600">No OKR directives linked to this product yet.</p>
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
                {okrs.map((okr: any) => {
                  const attrs = typeof okr.attributes === "object" ? okr.attributes : {};
                  return (
                    <tr key={okr.id} className="border-b">
                      <td className="py-2">
                        <div className="font-medium">{okr.name}</div>
                        {okr.description && <div className="text-sm text-gray-600">{okr.description}</div>}
                      </td>
                      <td className="py-2">{attrs.cycle_name || "-"}</td>
                      <td className="py-2">
                        <Pill tone={attrs.status === "on_track" ? "good" : attrs.status === "at_risk" ? "warn" : "neutral"}>
                          {attrs.status || "unknown"}
                        </Pill>
                      </td>
                      <td className="py-2">
                        {attrs.progress != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full"
                                style={{ width: `${Math.min(100, attrs.progress)}%` }}
                              />
                            </div>
                            <span className="text-sm">{Number(attrs.progress).toFixed(0)}%</span>
                          </div>
                        ) : "-"}
                      </td>
                      <td className="py-2">{okr.createdAt ? new Date(okr.createdAt).toLocaleDateString() : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === "roll-down" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Roll-Down Status</h2>
          {rollDowns.length === 0 ? (
            <p className="text-gray-600">No roll-down assignments for this product</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Source</th>
                  <th className="text-left py-2">KPI/OKR/SLA</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Weight</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Assigned</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rollDowns.map((rd) => (
                  <tr key={rd.id} className="border-b">
                    <td className="py-2">{rd.type}</td>
                    <td className="py-2">{rd.sourceDomain || rd.sourceProgram || "-"}</td>
                    <td className="py-2">{rd.kpiName || rd.okrName || rd.slaName || "-"}</td>
                    <td className="py-2">{rd.targetValue || "-"}</td>
                    <td className="py-2">{rd.weight || "-"}</td>
                    <td className="py-2">
                      <Pill tone={rd.status === "approved" ? "good" : "neutral"}>
                        {rd.status}
                      </Pill>
                    </td>
                    <td className="py-2">{new Date(rd.createdAt).toLocaleDateString()}</td>
                    <td className="py-2">
                      {rd.status === "pending" && (
                        <>
                          <button
                            className="text-green-600 hover:underline mr-2"
                            onClick={() => handleApproveRollDown(rd.assignmentId)}
                          >
                            Approve
                          </button>
                          <button
                            className="text-red-600 hover:underline"
                            onClick={() => handleRejectRollDown(rd.assignmentId)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {showCreateKpiModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={() => setShowCreateKpiModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Create Product KPI</h3>
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
                product_id: productId,
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
