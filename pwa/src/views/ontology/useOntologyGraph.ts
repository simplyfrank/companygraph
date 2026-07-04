import { useMemo } from "react";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import type { OntologyLabelRow, OntologyEdgeTypeRow } from "../../api";

export interface ErdEdge {
  id: string;
  type: string;
  fromLabel: string;
  toLabel: string;
  source: OntologyEdgeTypeRow;
}

export interface BoundedContextData {
  id: string;
  name: string;
  description: string;
  domain: string;
  subdomain: string;
  type: string;
  oracle_system?: string;
  jira_projects: string[];
  entity_count: number;
  entities: string[];
  relationships: Array<{ type: string; target: string }>;
}

export interface OntologyGraphResult {
  labels: OntologyLabelRow[];
  edgeTypes: OntologyEdgeTypeRow[];
  edges: ErdEdge[];
  labelMap: Map<string, OntologyLabelRow>;
  boundedContexts: BoundedContextData[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// Derive ERD edges from ontology edge types by flattening endpoints
function deriveEdges(edgeTypes: OntologyEdgeTypeRow[]): ErdEdge[] {
  return edgeTypes.flatMap((edgeType) =>
    edgeType.endpoints.map((endpoint) => ({
      id: `${edgeType.name}:${endpoint.fromLabel}:${endpoint.toLabel}`,
      type: edgeType.name,
      fromLabel: endpoint.fromLabel,
      toLabel: endpoint.toLabel,
      source: edgeType,
    }))
  );
}

export function useOntologyGraph(refreshKey = 0): OntologyGraphResult {
  const labels = useFetch((signal) => api.ontology.listLabels(signal), [refreshKey]);
  const edgeTypes = useFetch((signal) => api.ontology.listEdgeTypes(signal), [refreshKey]);
  const boundedContexts = useFetch((signal) => api.ontology.getBoundedContexts(signal), [refreshKey]);

  const isLoading = labels.status === "loading" || edgeTypes.status === "loading" || boundedContexts.status === "loading";
  const error = labels.status === "error" ? labels.error : edgeTypes.status === "error" ? edgeTypes.error : boundedContexts.status === "error" ? boundedContexts.error : null;

  const labelData = labels.status === "ok" ? labels.data : [];
  const edgeTypeData = edgeTypes.status === "ok" ? edgeTypes.data : [];
  const boundedContextData = boundedContexts.status === "ok" ? boundedContexts.data : [];

  const labelMap = useMemo(
    () => new Map(labelData.map((r) => [r.name, r])),
    [labelData]
  );

  const edges = useMemo(() => deriveEdges(edgeTypeData), [edgeTypeData]);

  const refresh = () => {
    // Incrementing refreshKey will trigger useFetch to re-fetch
    // This is handled by the caller passing a new key
  };

  return {
    labels: labelData,
    edgeTypes: edgeTypeData,
    edges,
    labelMap,
    boundedContexts: boundedContextData,
    isLoading,
    error,
    refresh,
  };
}
