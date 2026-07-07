// Ontology API functions — labels, edge-types, proposals, RDF, query

import type { OntologyLabelRow, OntologyLabelCreate, OntologyLabelUpdate, OntologyEdgeTypeRow, OntologyEdgeTypeCreate, OntologyEdgeTypeUpdate, BoundedContextRow, SharedDomainRow, NamespaceRow } from "./types";
import type { OntologyProposalRead } from "@companygraph/shared/schema/ontology";
import { json, withSignal, guardArray } from "./core";

export const ontology = {
  listLabels: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/ontology/node-labels", withSignal(signal));
    return guardArray<OntologyLabelRow>(data, "listLabels");
  },
  createLabel: (data: OntologyLabelCreate) =>
    json<OntologyLabelRow>("/api/v1/ontology/node-labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateLabel: (name: string, data: OntologyLabelUpdate) =>
    json<OntologyLabelRow>(`/api/v1/ontology/node-labels/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteLabel: (name: string) =>
    json<void>(`/api/v1/ontology/node-labels/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  listEdgeTypes: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/ontology/edge-types", withSignal(signal));
    return guardArray<OntologyEdgeTypeRow>(data, "listEdgeTypes");
  },
  createEdgeType: (data: OntologyEdgeTypeCreate) =>
    json<OntologyEdgeTypeRow>("/api/v1/ontology/edge-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateEdgeType: (name: string, data: OntologyEdgeTypeUpdate) =>
    json<OntologyEdgeTypeRow>(`/api/v1/ontology/edge-types/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteEdgeType: (name: string) =>
    json<void>(`/api/v1/ontology/edge-types/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  getBoundedContexts: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/ontology/bounded-contexts", withSignal(signal));
    return guardArray<BoundedContextRow>(data, "getBoundedContexts");
  },
  getBoundedContextNodes: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/nodes/BoundedContext", withSignal(signal));
    return guardArray<unknown>(data, "getBoundedContextNodes");
  },
  getSharedDomains: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/ontology/shared-domains", withSignal(signal));
    return guardArray<SharedDomainRow>(data, "getSharedDomains");
  },
  getNamespaces: async (modelId?: string, signal?: AbortSignal) => {
    const qs = modelId ? `?model_id=${encodeURIComponent(modelId)}` : "";
    const data = await json<unknown>(`/api/v1/ontology/namespaces${qs}`, withSignal(signal));
    return guardArray<NamespaceRow>(data, "getNamespaces");
  },
};

// Ontology proposals
export const ontologyProposals = {
  listProposals: (sourceScope?: string, status?: string) =>
    json<OntologyProposalRead[]>(
      `/api/v1/ontology/proposals${sourceScope ? `?source_scope=${sourceScope}` : ""}${status ? `&status=${status}` : ""}`
    ),

  createProposal: (data: Partial<OntologyProposalRead>) =>
    json<OntologyProposalRead>("/api/v1/ontology/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getProposal: (id: string) =>
    json<OntologyProposalRead>(`/api/v1/ontology/proposals?id=${encodeURIComponent(id)}`),

  patchProposal: (id: string, data: Partial<OntologyProposalRead>) =>
    json<OntologyProposalRead>(`/api/v1/ontology/proposals?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteProposal: (id: string) =>
    json<{ success: boolean }>(`/api/v1/ontology/proposals?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

// RDF export/import
export const rdf = {
  export: async (format: "jsonld" | "turtle" | "ntriples" = "jsonld"): Promise<Blob> => {
    const res = await fetch(`/api/v1/ontology/rdf?format=${format}`);
    if (!res.ok) {
      throw new Error(`Failed to export RDF: ${res.status} ${res.statusText}`);
    }
    return res.blob();
  },

  import: async (content: string, format: "jsonld" | "turtle" | "ntriples" = "jsonld") => {
    return json<{ classes_created: number; properties_created: number; errors: string[] }>(
      `/api/v1/ontology/rdf?format=${format}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }
    );
  },
};

// Ontology query
export const queryOntology = async (
  query: string,
  params: Record<string, unknown> = {},
  write = false,
  type: "cypher" | "sparql" = "cypher"
) => {
  return json<{
    columns: string[];
    data: Array<Record<string, unknown>>;
    summary: {
      queryType: string;
      query: string;
      executionTimeMs: number;
      resultCount: number;
    };
  }>(
    `/api/v1/ontology/query?type=${type}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, params, write }),
    }
  );
};
