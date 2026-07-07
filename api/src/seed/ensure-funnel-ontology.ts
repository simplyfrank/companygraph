// funnel-pipeline-modeling T-01 (design §3.1–§3.3, §4.1 — FR-01..FR-04, FR-06a,
// NFR-01, NFR-03; AC-01/AC-03/AC-04 registration halves). Idempotent
// registration of the Funnel + Stage runtime node labels and the HAS_STAGE +
// CONVERTS_TO runtime edge types via the ontology registry — NEVER an entry in
// the compile-time NODE_LABELS/EDGE_TYPES/EDGE_ENDPOINTS tuples
// (shared/src/schema/{nodes,edges}.ts) (XD-02, NFR-01).
//
// Idempotency (Rule B / B-03 — get-then-create guard, requirements rev-3 FR-06a):
// the public registry-create routes are strict-CREATE (409 name_conflict on a
// duplicate), so a bare re-POST is NOT a no-op. Instead, for each construct the
// routine GETs it by name and POSTs only on a 404 — a get-then-create guard that
// mirrors ensureOperatorRoot's lookup-before-create posture
// (api/src/seed/ensure-operator-root.ts:48). A 200 on the GET skips the create.
// A defensive 409 name_conflict on the POST (a get→post race) is also tolerated.

import type {
  NodeLabelCreate,
  EdgeTypeCreate,
} from "@companygraph/shared/schema/ontology";

// ---------------------------------------------------------------------------
// Registration payloads (design §3.1–§3.3). Single source, consumed by tests too.
// ---------------------------------------------------------------------------

export const FUNNEL_LABEL: NodeLabelCreate = {
  name: "Funnel",
  description:
    "A multi-stage conversion funnel/pipeline. Its ordered Stage nodes (HAS_STAGE) and the CONVERTS_TO edges between them carry conversion/drop-off the core PRECEDES edge cannot express.",
  usage_example:
    "Funnel 'Marketing Lead Funnel' HAS_STAGE Stage 'Visitor'; Stage 'Visitor' CONVERTS_TO Stage 'Lead' {conversionRate:0.62, dropOffRate:0.38}",
  json_schema_doc: {
    type: "object",
    // modelId (optional string) is the operator-root marker (C-06): a Funnel
    // created for the SaaS-Operator model stamps the operator root id here so
    // the FR-09 listing can scope to the active model without an attachment edge.
    properties: { modelId: { type: "string" } },
    additionalProperties: true,
  },
};

export const STAGE_LABEL: NodeLabelCreate = {
  name: "Stage",
  description:
    "An ordered position within a Funnel. stageOrder gives a deterministic ordinal independent of graph traversal; Stage-to-Stage CONVERTS_TO edges carry conversion/drop-off.",
  usage_example: "Stage 'MQL' {stageOrder:2} in Funnel 'Marketing Lead Funnel'",
  json_schema_doc: {
    type: "object",
    // C-05 — required integer stageOrder: jsonSchemaDocSchema accepts `required`
    // and the attribute-zod cache compiles it, so a POST /api/v1/nodes/Stage with
    // a missing or non-integer stageOrder fails 400 attribute_violation (AC-02).
    required: ["stageOrder"],
    properties: { stageOrder: { type: "integer" } },
    additionalProperties: true,
  },
};

export const HAS_STAGE_EDGE_TYPE: EdgeTypeCreate = {
  name: "HAS_STAGE",
  description: "Links a Funnel to each of its ordered Stage nodes.",
  usage_example: "Funnel 'Marketing Lead Funnel' HAS_STAGE Stage 'Visitor'",
  endpoints: [{ fromLabel: "Funnel", toLabel: "Stage" }],
};

export const CONVERTS_TO_EDGE_TYPE: EdgeTypeCreate = {
  name: "CONVERTS_TO",
  description:
    "A conversion transition between two Stages, carrying conversionRate + dropOffRate in [0,1]. Use CONVERTS_TO for conversion; PRECEDES is plain sequence with no drop-off.",
  usage_example:
    "Stage 'Visitor' CONVERTS_TO Stage 'Lead' {conversionRate:0.62, dropOffRate:0.38}",
  endpoints: [{ fromLabel: "Stage", toLabel: "Stage" }],
};

// ---------------------------------------------------------------------------
// Get-then-create guard (Rule B / B-03).
// ---------------------------------------------------------------------------

// GET <getUrl>; on 200 → already registered → skip. On 404 → POST <postUrl>
// with <payload>; a 201 is success, a defensive 409 name_conflict (get→post
// race) is also success; any other non-2xx throws.
async function getThenCreate(
  getUrl: string,
  postUrl: string,
  payload: unknown,
  what: string,
): Promise<void> {
  const probe = await fetch(getUrl);
  if (probe.status === 200) return; // already registered → verified no-op
  if (probe.status !== 404) {
    const detail = await probe.text().catch(() => "");
    throw new Error(
      `ensureFunnelOntology: GET ${getUrl} → ${probe.status} ${detail}`,
    );
  }

  const res = await fetch(postUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 201) return; // registered
  if (res.status === 409) {
    // Defensive: a construct appeared between the GET and the POST — still a
    // net no-op, treat as success.
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string } }
      | null;
    if (body?.error?.code === "name_conflict") return;
  }
  if (res.ok) return; // any other 2xx is acceptable success

  const detail = await res.text().catch(() => "");
  throw new Error(
    `ensureFunnelOntology: POST ${postUrl} (${what}) → ${res.status} ${detail}`,
  );
}

// ---------------------------------------------------------------------------
// ensureFunnelOntology — register the four constructs idempotently, in
// dependency order (assertEndpointLabelsExist requires the endpoint labels
// first): Funnel → Stage → HAS_STAGE → CONVERTS_TO.
// ---------------------------------------------------------------------------

export async function ensureFunnelOntology(baseUrl: string): Promise<void> {
  const nodeLabels = `${baseUrl}/api/v1/ontology/node-labels`;
  const edgeTypes = `${baseUrl}/api/v1/ontology/edge-types`;

  await getThenCreate(`${nodeLabels}/Funnel`, nodeLabels, FUNNEL_LABEL, "Funnel");
  await getThenCreate(`${nodeLabels}/Stage`, nodeLabels, STAGE_LABEL, "Stage");
  await getThenCreate(
    `${edgeTypes}/HAS_STAGE`,
    edgeTypes,
    HAS_STAGE_EDGE_TYPE,
    "HAS_STAGE",
  );
  await getThenCreate(
    `${edgeTypes}/CONVERTS_TO`,
    edgeTypes,
    CONVERTS_TO_EDGE_TYPE,
    "CONVERTS_TO",
  );
}
