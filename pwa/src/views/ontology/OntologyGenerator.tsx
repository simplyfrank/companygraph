import React, { useState, useEffect } from "react";
import { ontologyProposals } from "../../api";
import type { OntologyProposalRead } from "@companygraph/shared/schema/ontology";

export function OntologyGenerator() {
  const [proposals, setProposals] = useState<OntologyProposalRead[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<OntologyProposalRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      setIsLoading(true);
      const data = await ontologyProposals.listProposals();
      setProposals(data);
    } catch (error) {
      console.error("Failed to load proposals:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async (sourceScope: string, sourceId: string, description: string) => {
    try {
      await ontologyProposals.createProposal({
        name: `${sourceScope} Ontology`,
        description,
        source_scope: sourceScope as "DOMAIN" | "SUBDOMAIN" | "JOURNEY",
        source_id: sourceId,
        status: "DRAFT",
        owl_content: "",
        classes: "[]",
        properties: "[]",
        agent_steps: "[]",
        llm_model: "gpt-4",
        llm_usage: "{}",
      });
      await loadProposals();
      setShowGenerate(false);
    } catch (error) {
      console.error("Failed to generate proposal:", error);
    }
  };

  const handleReview = async (proposalId: string, action: "approve" | "reject" | "integrate") => {
    try {
      const status = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "INTEGRATED";
      await ontologyProposals.patchProposal(proposalId, { status });
      await loadProposals();
    } catch (error) {
      console.error("Failed to review proposal:", error);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading ontology proposals...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Proposals sidebar */}
      <div className="w-80 border-r bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Proposals</h2>
          <button
            onClick={() => setShowGenerate(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Generate
          </button>
        </div>
        <div className="space-y-2">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              onClick={() => setSelectedProposal(proposal)}
              className={`p-3 rounded cursor-pointer ${
                selectedProposal?.id === proposal.id
                  ? "bg-blue-100 border-blue-300"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              <div className="font-medium">{proposal.name}</div>
              <div className="text-sm text-gray-500">{proposal.source_scope}</div>
              <div className="text-xs text-gray-400">{proposal.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Proposal details panel */}
      <div className="flex-1 p-6">
        {selectedProposal ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">{selectedProposal.name}</h1>
                <p className="text-gray-600">{selectedProposal.description}</p>
              </div>
              <div className="flex gap-2">
                {selectedProposal.status === "DRAFT" && (
                  <>
                    <button
                      onClick={() => handleReview(selectedProposal.id, "approve")}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview(selectedProposal.id, "reject")}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </>
                )}
                {selectedProposal.status === "APPROVED" && (
                  <button
                    onClick={() => handleReview(selectedProposal.id, "integrate")}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Integrate
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Status</h3>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    selectedProposal.status === "DRAFT"
                      ? "bg-yellow-100 text-yellow-800"
                      : selectedProposal.status === "APPROVED"
                      ? "bg-green-100 text-green-800"
                      : selectedProposal.status === "REJECTED"
                      ? "bg-red-100 text-red-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {selectedProposal.status}
                </span>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Source</h3>
                <p className="text-sm text-gray-600">
                  {selectedProposal.source_scope}: {selectedProposal.source_id}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">LLM Model</h3>
                <p className="text-sm text-gray-600">{selectedProposal.llm_model}</p>
              </div>

              {selectedProposal.owl_content && (
                <div>
                  <h3 className="font-semibold mb-2">OWL Content</h3>
                  <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
                    {selectedProposal.owl_content}
                  </pre>
                </div>
              )}

              {selectedProposal.agent_steps && (
                <div>
                  <h3 className="font-semibold mb-2">Agent Steps</h3>
                  <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-64">
                    {selectedProposal.agent_steps}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a proposal to view details</p>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <GenerateModal
          onClose={() => setShowGenerate(false)}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  );
}

function GenerateModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void;
  onGenerate: (sourceScope: string, sourceId: string, description: string) => void;
}) {
  const [sourceScope, setSourceScope] = useState("DOMAIN");
  const [sourceId, setSourceId] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(sourceScope, sourceId, description);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Generate Ontology Proposal</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Source Scope</label>
            <select
              value={sourceScope}
              onChange={(e) => setSourceScope(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="DOMAIN">Domain</option>
              <option value="SUBDOMAIN">Subdomain</option>
              <option value="JOURNEY">Journey</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Source ID</label>
            <input
              type="text"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Generate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
