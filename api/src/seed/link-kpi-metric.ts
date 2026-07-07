// saas-metric-library T-03 (design §3.3, §5.3 — OQ-2 a + review-design.md C-02;
// FR-03, NFR-06; AC-05). The SINGLE sanctioned KPI→MetricDefinition write path.
//
// C-02 pin: content specs IMPORT this helper — there is no "replicate the
// two-step check" alternative. Enforcement is WRITE-PATH-SCOPED (advisory): a
// raw POST /api/v1/edges could still create a second MEASURES edge (the graph
// has no native single-edge cardinality; a hard Neo4j constraint is out of this
// feature's ownership, design §12). This helper rejects the second link so the
// canonical "a KPI measures at most one MetricDefinition" invariant holds along
// the path the specs use.
//
// kpi_metric_already_linked is a HELPER-LOCAL 409 message, NOT an ERROR_CODES
// member — api/src/errors.ts is untouched (§5.6).

// Thrown when a KPI already MEASURES a MetricDefinition. The caller maps this to
// a 409 response; it is not a wire ERROR_CODES enum extension.
export class KpiMetricAlreadyLinkedError extends Error {
  readonly code = "kpi_metric_already_linked";
  readonly httpStatus = 409;
  constructor(kpiId: string) {
    super(`KPI ${kpiId} already links to a MetricDefinition (at most one allowed)`);
    this.name = "KpiMetricAlreadyLinkedError";
  }
}

interface CypherResponse {
  rows: Array<Record<string, unknown>>;
}

function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

// Links a KPI to a MetricDefinition via a MEASURES edge, rejecting a second
// link from the same KPI. Returns the created edge id.
export async function linkKpiToMetric(
  baseUrl: string,
  kpiId: string,
  metricId: string,
): Promise<string> {
  // 1. Pre-check: does this KPI already MEASURES anything?
  const preRes = await fetch(`${baseUrl}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      statement:
        "MATCH (k:KPI {id:$kpiId})-[m:MEASURES]->() RETURN count(m) AS n",
      params: { kpiId },
    }),
  });
  if (!preRes.ok) {
    const detail = await preRes.text().catch(() => "");
    throw new Error(
      `linkKpiToMetric: cardinality pre-check → ${preRes.status} ${detail}`,
    );
  }
  const pre = (await preRes.json()) as CypherResponse;
  const existing = toCount(pre.rows[0]?.n);
  if (existing > 0) {
    throw new KpiMetricAlreadyLinkedError(kpiId);
  }

  // 2. Create the MEASURES edge via the generic edge route.
  const res = await fetch(`${baseUrl}/api/v1/edges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "MEASURES", fromId: kpiId, toId: metricId }),
  });
  if (res.status !== 201) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `linkKpiToMetric: POST /api/v1/edges → ${res.status} ${detail}`,
    );
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}
