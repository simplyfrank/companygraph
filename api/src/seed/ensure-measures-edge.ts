// saas-metric-library T-03 (design §3.2, §5.2 — OQ-1 a; FR-02, NFR-01, NFR-06;
// AC-03 registration half). Idempotent registration of the MEASURES runtime
// edge type (KPI → MetricDefinition) via the ontology registry
// (POST /api/v1/ontology/edge-types). MEASURES is a distinct, unguarded name
// (∉ LIFECYCLE_EDGES) so the generic POST /api/v1/edges accepts a MEASURES
// write with ZERO edit to EDGE_TYPES/EDGE_ENDPOINTS (shared/src/schema/edges.ts)
// and ZERO edit to model-lifecycle-guard.ts. Blueprint XD-06-erratum.

import type { EdgeTypeCreate } from "@companygraph/shared/schema/ontology";

const MEASURES_EDGE_TYPE: EdgeTypeCreate = {
  name: "MEASURES",
  description:
    "Links an operator KPI to the canonical MetricDefinition it measures (XD-06). Named MEASURES rather than INSTANTIATES to avoid the lifecycle-guarded module-pin edge — blueprint XD-06-erratum.",
  usage_example: "KPI 'Q3 NRR' MEASURES MetricDefinition 'NRR'",
  endpoints: [{ fromLabel: "KPI", toLabel: "MetricDefinition" }],
};

// Registers MEASURES. MUST run AFTER ensureMetricDefinitionLabel (the endpoint
// pair references MetricDefinition — assertEndpointLabelsExist). 201 →
// registered; 409 name_conflict → already registered → success (idempotent,
// AC-03); other non-2xx → throw.
export async function ensureMeasuresEdgeType(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/ontology/edge-types`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(MEASURES_EDGE_TYPE),
  });

  if (res.status === 201) return; // registered
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string } }
      | null;
    if (body?.error?.code === "name_conflict") return; // already registered → idempotent
  }
  if (res.ok) return; // any other 2xx is acceptable success

  const detail = await res.text().catch(() => "");
  throw new Error(
    `ensureMeasuresEdgeType: POST /api/v1/ontology/edge-types → ${res.status} ${detail}`,
  );
}
