// saas-metric-library T-02 (design §3.1, §5.1 — FR-01, NFR-01; AC-01
// registration half). Idempotent registration of the MetricDefinition runtime
// node label via the ontology registry (POST /api/v1/ontology/node-labels),
// NEVER an entry in shared/src/schema/nodes.ts NODE_LABELS (XD-02, NFR-01).

import { METRIC_DEFINITION_LABEL } from "./metric-catalog";

// Registers MetricDefinition. Loopback POST as trusted operator tooling (same
// pattern as the foundation loader's import POST). 201 → registered; 409
// name_conflict → already registered, treated as success (idempotent, AC-01);
// any other non-2xx → throw.
export async function ensureMetricDefinitionLabel(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/ontology/node-labels`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(METRIC_DEFINITION_LABEL),
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
    `ensureMetricDefinitionLabel: POST /api/v1/ontology/node-labels → ${res.status} ${detail}`,
  );
}
