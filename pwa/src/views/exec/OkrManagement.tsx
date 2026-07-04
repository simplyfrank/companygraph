import { useState, useEffect } from "react";
import { api } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { OkrCrud } from "../../components/OkrCrud";
import { OkrPerformanceBoard } from "../../components/OkrPerformanceBoard";

interface OKRDirective {
  id: string;
  name: string;
  description: string;
  attributes: {
    cycle_name: string;
    cycle_start: string;
    cycle_end: string;
    domain_id?: string;
    status: "draft" | "active" | "review" | "closed";
    review_cadence: "weekly" | "monthly" | "quarterly";
  };
  createdAt: string;
  updatedAt: string;
}

export function ExecOkrManagement() {
  const [directives, setDirectives] = useState<OKRDirective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cycles" | "performance">("cycles");
  const [selectedDirective, setSelectedDirective] = useState<OKRDirective | null>(null);

  useEffect(() => {
    loadDirectives();
  }, []);

  const loadDirectives = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.cypher(
        `MATCH (o:OKRDirective) 
         WHERE NOT o.attributes_json CONTAINS '"domain_id"'
         RETURN o ORDER BY o.createdAt DESC`,
      );
      setDirectives(data.rows.map((r: any) => r.o));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OKR cycles");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="OKR management" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <ViewHeader
        title="OKR Management"
        lede="Create and manage organizational OKR cycles, objectives, and key results"
      />

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "cycles" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("cycles")}
        >
          OKR Cycles
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "performance" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("performance")}
        >
          Performance Board
        </button>
      </div>

      {activeTab === "cycles" && (
        <>
          <Card className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Organizational OKR Cycles</h2>
              <button className="px-4 py-2 bg-blue-600 text-white rounded">
                + Create OKR Cycle
              </button>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Cycle Name</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Start Date</th>
                  <th className="text-left py-2">End Date</th>
                  <th className="text-left py-2">Review Cadence</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {directives.map((directive) => (
                  <tr key={directive.id} className="border-b">
                    <td className="py-3 font-medium">{directive.attributes.cycle_name}</td>
                    <td className="py-3">
                      <Pill
                        tone={
                          directive.attributes.status === "active"
                            ? "accent"
                            : directive.attributes.status === "closed"
                            ? "neutral"
                            : directive.attributes.status === "review"
                            ? "warn"
                            : "neutral"
                        }
                      >
                        {directive.attributes.status}
                      </Pill>
                    </td>
                    <td className="py-3">{new Date(directive.attributes.cycle_start).toLocaleDateString()}</td>
                    <td className="py-3">{new Date(directive.attributes.cycle_end).toLocaleDateString()}</td>
                    <td className="py-3">{directive.attributes.review_cadence}</td>
                    <td className="py-3">
                      <button
                        className="text-blue-600 hover:underline mr-2"
                        onClick={() => setSelectedDirective(directive)}
                      >
                        View
                      </button>
                      <button className="text-blue-600 hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {selectedDirective && (
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {selectedDirective.attributes.cycle_name} - Details
                </h2>
                <button
                  className="px-4 py-2 bg-gray-200 rounded"
                  onClick={() => setSelectedDirective(null)}
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Description</p>
                  <p className="font-medium">{selectedDirective.description}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium">{selectedDirective.attributes.status}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Start Date</p>
                  <p className="font-medium">{new Date(selectedDirective.attributes.cycle_start).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">End Date</p>
                  <p className="font-medium">{new Date(selectedDirective.attributes.cycle_end).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-2">Key Results</h3>
                <p className="text-gray-600">Key results for this OKR cycle will be displayed here.</p>
              </div>
            </Card>
          )}
        </>
      )}

      {activeTab === "performance" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Organizational OKR Performance</h2>
          <OkrPerformanceBoard domainId="" domainName="Organization" />
        </Card>
      )}
    </>
  );
}
