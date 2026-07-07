// platform-ops-process-model T-02..T-07 (design §3.3–§3.5, §4.1–§4.8) — the
// feature-owned content-seed module: pure row data + internal (non-REST) zod
// input shapes + the per-write helpers that drive the AS-BUILT governed routes
// over the loopback API. This module adds NO new route, NO schema array entry,
// NO ontology label/edge; it only CALLS shipped routes (Rule A).
//
// House rules: zod is the only validation library; en-US identifiers
// throughout; every governed write is lookup-before-create by a stable key so a
// re-run is net-zero (Rule C / §4.8). The authoritative validation is always
// each route's own re-parse at the REST boundary — the internal shapes below
// only guard this seed's own inputs.

import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { linkKpiToMetric, KpiMetricAlreadyLinkedError } from "./link-kpi-metric";

// ---------------------------------------------------------------------------
// Fixture id constants (§3.1) — the author-fixed `018f0200-…` slice ids the
// fixture uses. The content-seed references them directly (they are known
// constants after the fixture load — §4.1), so no lookup is needed for the
// in-slice journeys/activities/systems.
// ---------------------------------------------------------------------------

export const JOURNEY_IDS = {
  observability: "018f0200-0000-7000-8000-000000000001",
  deploy: "018f0200-0000-7000-8000-000000000002",
  incident: "018f0200-0000-7000-8000-000000000003",
  sla: "018f0200-0000-7000-8000-000000000004",
  backups: "018f0200-0000-7000-8000-000000000005",
} as const;

// A representative activity id per journey (used as story `activityId`s,
// `NEEDS_CAPABILITY` sources, and cross-boundary `USES_SYSTEM` from-nodes).
export const ACTIVITY_IDS = {
  obsCollect: "018f0200-0000-7000-8000-000000010102",
  obsThresholds: "018f0200-0000-7000-8000-000000010104",
  depCanary: "018f0200-0000-7000-8000-000000010203",
  depProduction: "018f0200-0000-7000-8000-000000010204",
  depRollback: "018f0200-0000-7000-8000-000000010206",
  incPage: "018f0200-0000-7000-8000-000000010301",
  incMitigate: "018f0200-0000-7000-8000-000000010303",
  slaBudget: "018f0200-0000-7000-8000-000000010402",
  slaStatus: "018f0200-0000-7000-8000-000000010403",
  bakRun: "018f0200-0000-7000-8000-000000010502",
  bakVerify: "018f0200-0000-7000-8000-000000010503",
} as const;

// In-slice function systems (fixture ids).
export const FUNCTION_SYSTEM_IDS = {
  observability: "018f0200-0000-7000-8000-000000000401",
  statusPage: "018f0200-0000-7000-8000-000000000402",
  backup: "018f0200-0000-7000-8000-000000000403",
} as const;

// The shared-catalog system seedKeys (foundation FR-04, resolved by
// `operatorSeedKey` at run time — never a fixed id).
export const SHARED_SYSTEM_KEYS = ["helm", "kubernetes", "pagerduty"] as const;

// ---------------------------------------------------------------------------
// Internal (non-REST) zod input shapes (§3.5) — permissive, seed-only.
// ---------------------------------------------------------------------------

export const kpiRow = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1),
  measurement_frequency: z.string().min(1),
  description: z.string().optional(),
  // resolved → MEASURES; omitted = no link (OQ-1: Backup success rate ships
  // unlinked until the roster gains metric-backup-success).
  metricSeedKey: z.string().optional(),
  alignTarget: z.object({
    type: z.enum(["journey", "activity", "domain"]),
    key: z.string(), // a JOURNEY_IDS key, an activity id, or "domain"
  }),
});
export type KpiRow = z.infer<typeof kpiRow>;

// N-01 pin: `risk_type` is a REQUIRED 3-value enum — a DELIBERATE tightening
// of the shipped 6-value `.optional()` enum in `createRiskSchema`
// (risk-register.ts). This is an intentional stricter guard on the seed's own
// inputs, NOT a contradiction of the boundary schema; the route's own re-parse
// remains the authoritative validation.
export const riskRow = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  domain: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  risk_type: z.enum(["operational", "security", "technical"]),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
});
export type RiskRow = z.infer<typeof riskRow>;

export const slaRow = z.object({
  name: z.string().min(1),
  service_type: z.string().min(1),
  target_value: z.number(),
  target_unit: z.string().min(1),
  measurement_window: z.string().min(1),
  window_duration: z.string().min(1),
  compliance_threshold: z.number(),
  description: z.string().optional(),
});
export type SlaRow = z.infer<typeof slaRow>;

export const acRow = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});
export const storyRow = z.object({
  persona: z.string().min(1),
  action: z.string().min(1),
  benefit: z.string().min(1),
  activityId: z.string().min(1),
  acs: z.array(acRow).min(2),
});
export type StoryRow = z.infer<typeof storyRow>;

export const capabilityRow = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // system-key list: each entry is a FUNCTION_SYSTEM_IDS key or a
  // SHARED_SYSTEM_KEYS entry, resolved to a real System id at write time.
  supportedBy: z.array(z.string().min(1)).min(1),
  // needed-by source: one in-slice activity id per capability (FR-13).
  neededByActivityId: z.string().min(1),
});
export type CapabilityRow = z.infer<typeof capabilityRow>;

// ---------------------------------------------------------------------------
// Row data (§3.3, §3.4)
// ---------------------------------------------------------------------------

// The five KPIs (§3.3). Error budget burn → metric-uptime (OQ-1: error budget
// = 1 − uptime). Backup success rate carries NO metricSeedKey (OQ-1: unlinked
// should-tier until metric-backup-success lands).
export const KPI_ROWS: KpiRow[] = [
  {
    name: "Fleet uptime",
    category: "reliability",
    unit: "percent",
    target_value: 99.9,
    target_direction: "up",
    measurement_frequency: "daily",
    description: "Service availability across the tenant fleet.",
    metricSeedKey: "metric-uptime",
    alignTarget: { type: "domain", key: "domain" },
  },
  {
    name: "MTTR",
    category: "reliability",
    unit: "days",
    target_value: 0.25,
    target_direction: "down",
    measurement_frequency: "weekly",
    description: "Mean time to resolution for incidents.",
    metricSeedKey: "metric-mttr",
    alignTarget: { type: "journey", key: "incident" },
  },
  {
    name: "Deploy frequency",
    category: "efficiency",
    unit: "count",
    target_value: 20,
    target_direction: "up",
    measurement_frequency: "weekly",
    description: "Production deployment cadence.",
    metricSeedKey: "metric-deploy-frequency",
    alignTarget: { type: "journey", key: "deploy" },
  },
  {
    name: "Error budget burn",
    category: "reliability",
    unit: "percent",
    target_value: 100,
    target_direction: "down",
    measurement_frequency: "weekly",
    description: "Error-budget burn against the SLO (error budget = 1 − uptime).",
    metricSeedKey: "metric-uptime",
    alignTarget: { type: "journey", key: "sla" },
  },
  {
    name: "Backup success rate",
    category: "reliability",
    unit: "percent",
    target_value: 100,
    target_direction: "up",
    description: "Share of scheduled backups that complete and verify successfully.",
    measurement_frequency: "daily",
    // no metricSeedKey — should-tier, unlinked (OQ-1).
    alignTarget: { type: "journey", key: "backups" },
  },
];

// ≥3 risks (§3.4/§4.5): one operational, one security, one technical.
export const RISK_ROWS: RiskRow[] = [
  {
    name: "Cascading fleet outage from a bad rollout",
    owner: "Platform Ops Lead",
    domain: "Platform Ops",
    likelihood: 3,
    impact: 5,
    status: "mitigating",
    trend: "flat",
    risk_type: "operational",
    description: "A faulty release promoted past canary triggers a fleet-wide outage.",
    mitigation_plan: "Progressive canary rollout with automated rollback on SLO breach.",
  },
  {
    name: "Compromised control-plane credential",
    owner: "Platform Ops Lead",
    domain: "Platform Ops",
    likelihood: 2,
    impact: 5,
    status: "open",
    trend: "up",
    risk_type: "security",
    description: "A leaked Helm control-plane credential grants fleet-wide access.",
    mitigation_plan: "Short-lived credentials, least-privilege scoping, and rotation.",
  },
  {
    name: "Backup restore fails silently",
    owner: "Platform Ops Lead",
    domain: "Platform Ops",
    likelihood: 2,
    impact: 4,
    status: "mitigating",
    trend: "down",
    risk_type: "technical",
    description: "Backups complete but restores fail, discovered only during a real DR event.",
    mitigation_plan: "Scheduled restore-verification and periodic DR drills.",
  },
];

// ≥3 SLA definitions (§3.4/§4.6). service_type/target_unit/measurement_window
// values are free-string per the shipped slaCreateRequestSchema (all
// `z.string().min(1)`), so domain-natural values are used.
export const SLA_ROWS: SlaRow[] = [
  {
    name: "Platform Ops — fleet uptime SLA",
    service_type: "availability",
    target_value: 99.9,
    target_unit: "percent",
    measurement_window: "average",
    window_duration: "30d",
    compliance_threshold: 99.9,
    description: "99.9% monthly availability across the tenant fleet.",
  },
  {
    name: "Platform Ops — incident response SLA",
    service_type: "response_time",
    target_value: 15,
    target_unit: "minutes",
    measurement_window: "p95",
    window_duration: "30d",
    compliance_threshold: 95,
    description: "SEV1 incidents acknowledged within 15 minutes.",
  },
  {
    name: "Platform Ops — backup/restore SLA",
    service_type: "resolution_time",
    target_value: 4,
    target_unit: "hours",
    measurement_window: "p95",
    window_duration: "30d",
    compliance_threshold: 95,
    description: "Restore-from-backup completes within 4 hours.",
  },
];

// ≥5 stories (§3.4/FR-09) — one per journey, each with ≥2 G/W/T ACs.
export const STORY_ROWS: StoryRow[] = [
  {
    persona: "SRE",
    action: "collect telemetry across the tenant fleet",
    benefit: "fleet-wide health is observable in one place",
    activityId: ACTIVITY_IDS.obsCollect,
    acs: [
      { given: "a fleet service is instrumented", when: "the observability stack scrapes it", then: "its metrics appear on the fleet dashboard" },
      { given: "an SLO threshold is breached", when: "the collector evaluates the signal", then: "an alert is routed to the on-call engineer" },
    ],
  },
  {
    persona: "Release Manager",
    action: "run a canary rollout before full production",
    benefit: "a bad release is caught on a small slice",
    activityId: ACTIVITY_IDS.depCanary,
    acs: [
      { given: "a built artifact is promoted to staging", when: "the canary rollout begins", then: "only the canary slice receives the new version" },
      { given: "the canary shows an SLO regression", when: "the release manager reviews the signals", then: "the rollout can be halted and rolled back" },
    ],
  },
  {
    persona: "On-call Engineer",
    action: "mitigate an incident quickly",
    benefit: "customer impact is minimized",
    activityId: ACTIVITY_IDS.incMitigate,
    acs: [
      { given: "an incident page is received", when: "the on-call engineer triages it", then: "the severity and impacted tenants are identified" },
      { given: "a mitigation is applied", when: "service is restored", then: "the incident moves toward resolution" },
    ],
  },
  {
    persona: "On-call Engineer",
    action: "keep the public status page current",
    benefit: "customers see accurate incident status",
    activityId: ACTIVITY_IDS.slaStatus,
    acs: [
      { given: "an incident affects customers", when: "the on-call engineer updates the status page", then: "a public update is published" },
      { given: "the incident is resolved", when: "the status page is updated", then: "the incident is marked resolved for customers" },
    ],
  },
  {
    persona: "SRE",
    action: "verify that backups can be restored",
    benefit: "the fleet can recover from data loss",
    activityId: ACTIVITY_IDS.bakVerify,
    acs: [
      { given: "a scheduled backup completed", when: "the SRE runs a restore verification", then: "the restored data passes an integrity check" },
      { given: "a restore verification fails", when: "the failure is detected", then: "a backup/restore risk is escalated" },
    ],
  },
];

// ≥3 DDD capabilities (§3.4/§4.7).
export const CAPABILITY_ROWS: CapabilityRow[] = [
  {
    name: "Roll out a release safely",
    description: "Promote a release through canary to production with rollback.",
    supportedBy: ["helm", "kubernetes"],
    neededByActivityId: ACTIVITY_IDS.depCanary,
  },
  {
    name: "Detect & resolve an incident",
    description: "Observe, page, triage, mitigate, and resolve fleet incidents.",
    supportedBy: ["pagerduty", "observability"],
    neededByActivityId: ACTIVITY_IDS.incMitigate,
  },
  {
    name: "Restore from backup",
    description: "Back up the fleet and verify that restores succeed.",
    supportedBy: ["backup"],
    neededByActivityId: ACTIVITY_IDS.bakVerify,
  },
];

// ---------------------------------------------------------------------------
// Handle resolution (§4.1) — read-only lookups via POST /api/v1/query/cypher.
// ---------------------------------------------------------------------------

export interface Handles {
  modelId: string;
  domainId: string;
  sharedSystemIds: Record<string, string>; // seedKey → id (helm/kubernetes/pagerduty)
  metricIds: Record<string, string>; // seedKey → id (metric-uptime/mttr/deploy-frequency)
}

interface CypherResponse {
  rows: Array<Record<string, unknown>>;
}

async function cypher(
  baseUrl: string,
  statement: string,
  params: Record<string, unknown> = {},
): Promise<CypherResponse> {
  const res = await fetch(`${baseUrl}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`platform-ops-content: query/cypher → ${res.status} ${detail}`);
  }
  return (await res.json()) as CypherResponse;
}

function parseAttrs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

const METRIC_SEED_KEYS = ["metric-uptime", "metric-mttr", "metric-deploy-frequency"] as const;

// C-04 pin: fail loudly (never silently skip) when a required precondition
// handle is absent — it means seed:saas-operator or seed:saas-metric-library
// has not run.
export async function resolveHandles(baseUrl: string): Promise<Handles> {
  // 1. Operator root.
  const rootRes = await cypher(
    baseUrl,
    `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`,
  );
  const rootRow = rootRes.rows.find((r) => parseAttrs(r.a).saasOperatorRoot === true);
  if (!rootRow || typeof rootRow.id !== "string") {
    throw new Error(
      'platform-ops-content: SaaS Operator root not found — run `bun run seed:saas-operator` first.',
    );
  }
  const modelId = rootRow.id;

  // 2. Platform Ops domain (IN_MODEL the operator root, seedKey platform_ops).
  const domRes = await cypher(
    baseUrl,
    `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$modelId}) RETURN d.id AS id, d.attributes_json AS a`,
    { modelId },
  );
  const domRow = domRes.rows.find((r) => parseAttrs(r.a).seedKey === "platform_ops");
  if (!domRow || typeof domRow.id !== "string") {
    throw new Error(
      'platform-ops-content: Platform Ops domain (seedKey platform_ops) not found — run `bun run seed:saas-operator` first.',
    );
  }
  const domainId = domRow.id;

  // 3. Shared systems (helm/kubernetes/pagerduty) by top-level operatorSeedKey.
  const sysRes = await cypher(
    baseUrl,
    `MATCH (s:System) WHERE s.operatorSeedKey IN $keys RETURN s.operatorSeedKey AS k, s.id AS id`,
    { keys: [...SHARED_SYSTEM_KEYS] },
  );
  const sharedSystemIds: Record<string, string> = {};
  for (const r of sysRes.rows) {
    if (typeof r.k === "string" && typeof r.id === "string") sharedSystemIds[r.k] = r.id;
  }
  for (const key of SHARED_SYSTEM_KEYS) {
    if (!sharedSystemIds[key]) {
      throw new Error(
        `platform-ops-content: shared system "${key}" not found — run \`bun run seed:saas-operator\` first.`,
      );
    }
  }

  // 4. Metrics by seedKey (inside attributes_json).
  const metRes = await cypher(
    baseUrl,
    `MATCH (m:MetricDefinition) RETURN m.id AS id, m.attributes_json AS a`,
  );
  const metricIds: Record<string, string> = {};
  for (const r of metRes.rows) {
    const key = parseAttrs(r.a).seedKey;
    if (typeof key === "string" && typeof r.id === "string") metricIds[key] = r.id;
  }
  for (const key of METRIC_SEED_KEYS) {
    if (!metricIds[key]) {
      throw new Error(
        `platform-ops-content: metric "${key}" not found — run \`bun run seed:saas-metric-library\` first.`,
      );
    }
  }

  return { modelId, domainId, sharedSystemIds, metricIds };
}

// ---------------------------------------------------------------------------
// Fixture load (§4.2) — POST the (domain-row-omitted, cross-boundary-edge-
// omitted) fixture to POST /api/v1/import (realImport). MERGE-on-id makes a
// re-load net-zero (NFR-02). A 409 model_lifecycle_route_required means a
// malformed fixture — surface + fail (AC-05).
// ---------------------------------------------------------------------------

export function readPlatformOpsFixture(): { nodes: unknown[]; edges: unknown[] } {
  const path = resolve(
    import.meta.dir,
    "../../../shared/seed/saas-operator/platform-ops.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as { nodes: unknown[]; edges: unknown[] };
}

export async function loadPlatformOpsFixture(baseUrl: string): Promise<void> {
  const fixture = readPlatformOpsFixture();
  const res = await fetch(`${baseUrl}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixture),
  });
  const json = (await res.json()) as { errors?: unknown[] };
  if (!res.ok) {
    throw new Error(
      `platform-ops-content: POST /api/v1/import → ${res.status} ${JSON.stringify(json)}`,
    );
  }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(
      `platform-ops-content: fixture import reported row errors: ${JSON.stringify(json.errors)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// ensureEdge (§4.2a / review C-01) — lookup-before-create by (type,fromId,toId)
// via POST /api/v1/edges. NO fixed edge id is supplied (avoids the cross-type
// uniqueness 409); the cypher pre-check guarantees zero duplicate parallel
// edges on a re-run (AC-06).
// ---------------------------------------------------------------------------

function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

export async function ensureEdge(
  baseUrl: string,
  edge: { type: string; fromId: string; toId: string },
): Promise<void> {
  const pre = await cypher(
    baseUrl,
    `MATCH (a {id:$fromId})-[r:${edge.type}]->(b {id:$toId}) RETURN count(r) AS n`,
    { fromId: edge.fromId, toId: edge.toId },
  );
  if (toCount(pre.rows[0]?.n) > 0) return; // already present — idempotent skip
  const res = await fetch(`${baseUrl}/api/v1/edges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: edge.type, fromId: edge.fromId, toId: edge.toId }),
  });
  if (res.status !== 201) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `platform-ops-content: POST /api/v1/edges (${edge.type}) → ${res.status} ${detail}`,
    );
  }
}

// Cross-boundary core edges (§4.2a) — journey→domain PART_OF, activity→shared-
// system USES_SYSTEM, function-system↔shared-system INTEGRATES_WITH.
export async function seedCrossBoundaryEdges(baseUrl: string, handles: Handles): Promise<void> {
  // journey → domain PART_OF ×5
  for (const journeyId of Object.values(JOURNEY_IDS)) {
    await ensureEdge(baseUrl, { type: "PART_OF", fromId: journeyId, toId: handles.domainId });
  }

  // activity → shared-system USES_SYSTEM
  const usesShared: Array<[string, string]> = [
    [ACTIVITY_IDS.depCanary, "kubernetes"],
    [ACTIVITY_IDS.depProduction, "helm"],
    [ACTIVITY_IDS.depRollback, "helm"],
    [ACTIVITY_IDS.incPage, "pagerduty"],
    [ACTIVITY_IDS.bakRun, "kubernetes"],
  ];
  for (const [activityId, sysKey] of usesShared) {
    await ensureEdge(baseUrl, {
      type: "USES_SYSTEM",
      fromId: activityId,
      toId: handles.sharedSystemIds[sysKey]!,
    });
  }

  // function-system ↔ shared-system INTEGRATES_WITH
  const integrates: Array<[string, string]> = [
    [FUNCTION_SYSTEM_IDS.observability, "pagerduty"],
    [FUNCTION_SYSTEM_IDS.backup, "kubernetes"],
  ];
  for (const [fromId, sysKey] of integrates) {
    await ensureEdge(baseUrl, {
      type: "INTEGRATES_WITH",
      fromId,
      toId: handles.sharedSystemIds[sysKey]!,
    });
  }
}

// ---------------------------------------------------------------------------
// KPIs + MEASURES + ALIGNED_TO (§4.3, §4.4)
// ---------------------------------------------------------------------------

// Lookup-before-create a KPI by name + domain_id; POST /api/v1/kpis (200) if
// absent. Returns the KPI id.
async function ensureKpi(baseUrl: string, row: KpiRow, domainId: string): Promise<string> {
  const found = await cypher(
    baseUrl,
    `MATCH (k:KPI {name:$name}) WHERE k.domain_id=$domainId AND k.archived_at IS NULL RETURN k.id AS id LIMIT 1`,
    { name: row.name, domainId },
  );
  const existingId = found.rows[0]?.id;
  if (typeof existingId === "string") return existingId;

  const body = {
    name: row.name,
    category: row.category,
    unit: row.unit,
    target_value: row.target_value,
    target_direction: row.target_direction,
    measurement_frequency: row.measurement_frequency,
    description: row.description,
    domain_id: domainId,
  };
  const res = await fetch(`${baseUrl}/api/v1/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`platform-ops-content: POST /api/v1/kpis (${row.name}) → ${res.status} ${detail}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

function resolveAlignTarget(
  row: KpiRow,
  handles: Handles,
): { target_type: "journey" | "activity" | "domain"; target_id: string } {
  if (row.alignTarget.type === "domain") {
    return { target_type: "domain", target_id: handles.domainId };
  }
  if (row.alignTarget.type === "journey") {
    const id = JOURNEY_IDS[row.alignTarget.key as keyof typeof JOURNEY_IDS];
    if (!id) throw new Error(`platform-ops-content: unknown journey key "${row.alignTarget.key}"`);
    return { target_type: "journey", target_id: id };
  }
  return { target_type: "activity", target_id: row.alignTarget.key };
}

// Lookup-before-create the ALIGNED_TO alignment (by kpiId → targetId) via
// POST /api/v1/kpi-alignments (D-1: dedicated route, 404 on a bad target).
async function ensureAlignment(
  baseUrl: string,
  kpiId: string,
  target: { target_type: "journey" | "activity" | "domain"; target_id: string },
): Promise<void> {
  const pre = await cypher(
    baseUrl,
    `MATCH (k:KPI {id:$kpiId})-[r:ALIGNED_TO]->(t {id:$targetId}) RETURN count(r) AS n`,
    { kpiId, targetId: target.target_id },
  );
  if (toCount(pre.rows[0]?.n) > 0) return;
  const res = await fetch(`${baseUrl}/api/v1/kpi-alignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kpi_id: kpiId,
      target_type: target.target_type,
      target_id: target.target_id,
      weight: 1,
      attribution_type: "direct",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `platform-ops-content: POST /api/v1/kpi-alignments (${kpiId}) → ${res.status} ${detail}`,
    );
  }
}

export async function seedKpis(baseUrl: string, handles: Handles): Promise<Record<string, string>> {
  const kpiIds: Record<string, string> = {};
  for (const row of KPI_ROWS) {
    const kpiId = await ensureKpi(baseUrl, row, handles.domainId);
    kpiIds[row.name] = kpiId;

    // MEASURES (OQ-1, N-02) — reuse the exported linkKpiToMetric helper; its
    // one-metric-per-KPI pre-check is the single sanctioned MEASURES write
    // path. A KpiMetricAlreadyLinkedError on a re-run is idempotent success.
    if (row.metricSeedKey) {
      const metricId = handles.metricIds[row.metricSeedKey];
      if (!metricId) {
        throw new Error(`platform-ops-content: metric "${row.metricSeedKey}" unresolved`);
      }
      try {
        await linkKpiToMetric(baseUrl, kpiId, metricId);
      } catch (e) {
        if (!(e instanceof KpiMetricAlreadyLinkedError)) throw e;
      }
    }

    // ALIGNED_TO (C-01/OQ-5, D-1).
    await ensureAlignment(baseUrl, kpiId, resolveAlignTarget(row, handles));
  }
  return kpiIds;
}

// ---------------------------------------------------------------------------
// Risks (§4.5, N-03) + SLAs (§4.6, D-2)
// ---------------------------------------------------------------------------

interface RiskRecord {
  id?: string;
  name?: string;
}

// N-03: the list route accepts owner/domain/risk_type/linked_entity_* but NOT
// a `name` filter — so risk idempotency is a list-by-domain + client-side name
// match.
export async function seedRisks(baseUrl: string): Promise<string[]> {
  const listRes = await fetch(
    `${baseUrl}/api/v1/risk-register?domain=${encodeURIComponent("Platform Ops")}`,
  );
  if (!listRes.ok) {
    throw new Error(`platform-ops-content: GET /api/v1/risk-register → ${listRes.status}`);
  }
  const listBody = (await listRes.json()) as { data?: RiskRecord[] };
  const byName = new Map<string, string>();
  for (const r of listBody.data ?? []) {
    if (typeof r.name === "string" && typeof r.id === "string") byName.set(r.name, r.id);
  }

  const ids: string[] = [];
  for (const row of RISK_ROWS) {
    const existing = byName.get(row.name);
    if (existing) {
      ids.push(existing);
      continue;
    }
    const res = await fetch(`${baseUrl}/api/v1/risk-register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `platform-ops-content: POST /api/v1/risk-register (${row.name}) → ${res.status} ${detail}`,
      );
    }
    const created = (await res.json()) as { id: string };
    ids.push(created.id);
  }
  return ids;
}

// C-03/D-2: POST /api/v1/slas returns 200 (not 201). Lookup-before-create by
// name (GET /api/v1/slas list + client-side name match).
export async function seedSlas(baseUrl: string): Promise<string[]> {
  const listRes = await fetch(`${baseUrl}/api/v1/slas`);
  if (!listRes.ok) {
    throw new Error(`platform-ops-content: GET /api/v1/slas → ${listRes.status}`);
  }
  const listBody = (await listRes.json()) as { rows?: Array<{ id?: string; name?: string }> };
  const byName = new Map<string, string>();
  for (const r of listBody.rows ?? []) {
    if (typeof r.name === "string" && typeof r.id === "string") byName.set(r.name, r.id);
  }

  const ids: string[] = [];
  for (const row of SLA_ROWS) {
    const existing = byName.get(row.name);
    if (existing) {
      ids.push(existing);
      continue;
    }
    const res = await fetch(`${baseUrl}/api/v1/slas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`platform-ops-content: POST /api/v1/slas (${row.name}) → ${res.status} ${detail}`);
    }
    const created = (await res.json()) as { id: string };
    ids.push(created.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Stories + ACs (§3.4/§4.7)
// ---------------------------------------------------------------------------

interface StoryListRow {
  id: string;
  persona: string | null;
  action: string | null;
  activityId: string | null;
  acCount?: number;
}

interface AcListRow {
  id: string;
  given: string;
  when: string;
  then: string;
}

export async function seedStories(baseUrl: string, modelId: string): Promise<string[]> {
  const listRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/stories`);
  if (!listRes.ok) {
    throw new Error(`platform-ops-content: GET /api/v1/models/${modelId}/stories → ${listRes.status}`);
  }
  const existing = (await listRes.json()) as StoryListRow[];
  const storyKey = (persona: string, action: string, activityId: string | null) =>
    `${persona} ${action} ${activityId ?? ""}`;
  const byKey = new Map<string, string>();
  for (const s of existing) {
    byKey.set(storyKey(s.persona ?? "", s.action ?? "", s.activityId), s.id);
  }

  const storyIds: string[] = [];
  for (const row of STORY_ROWS) {
    let storyId = byKey.get(storyKey(row.persona, row.action, row.activityId));
    if (!storyId) {
      const res = await fetch(`${baseUrl}/api/v1/models/${modelId}/stories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona: row.persona,
          action: row.action,
          benefit: row.benefit,
          activityId: row.activityId,
        }),
      });
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `platform-ops-content: POST .../stories (${row.persona}) → ${res.status} ${detail}`,
        );
      }
      const created = (await res.json()) as { id: string };
      storyId = created.id;
    }
    storyIds.push(storyId);

    // ACs — lookup-before-create by (given+when+then).
    const acListRes = await fetch(
      `${baseUrl}/api/v1/models/${modelId}/stories/${storyId}/acceptance-criteria`,
    );
    if (!acListRes.ok) {
      throw new Error(
        `platform-ops-content: GET .../acceptance-criteria → ${acListRes.status}`,
      );
    }
    const acExisting = (await acListRes.json()) as AcListRow[];
    const acKey = (g: string, w: string, t: string) => `${g} ${w} ${t}`;
    const acSeen = new Set(acExisting.map((a) => acKey(a.given, a.when, a.then)));
    for (const ac of row.acs) {
      if (acSeen.has(acKey(ac.given, ac.when, ac.then))) continue;
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/stories/${storyId}/acceptance-criteria`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ac),
        },
      );
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `platform-ops-content: POST .../acceptance-criteria → ${res.status} ${detail}`,
        );
      }
    }
  }
  return storyIds;
}

// ---------------------------------------------------------------------------
// DDD capabilities + mappings (§4.7, OQ-4/C-03)
// ---------------------------------------------------------------------------

interface CapabilityListRow {
  id: string;
  name: string;
  supportedBy?: Array<{ id: string }>;
  neededBy?: Array<{ id: string }>;
  assignedContextId?: string | null;
}

interface CapabilityDetail {
  id: string;
  supportedBy?: Array<{ id: string }>;
  neededBy?: Array<{ id: string }>;
  assignedContextId?: string | null;
}

// Resolve a capability supportedBy key to a real System id: a
// FUNCTION_SYSTEM_IDS key (in-slice fixture id) or a SHARED_SYSTEM_KEYS entry
// (resolved handle).
function resolveSystemId(key: string, handles: Handles): string {
  if (key in FUNCTION_SYSTEM_IDS) {
    return FUNCTION_SYSTEM_IDS[key as keyof typeof FUNCTION_SYSTEM_IDS];
  }
  const shared = handles.sharedSystemIds[key];
  if (!shared) throw new Error(`platform-ops-content: unknown supportedBy system key "${key}"`);
  return shared;
}

export async function seedCapabilities(baseUrl: string, handles: Handles): Promise<string[]> {
  const modelId = handles.modelId;
  const listRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/capabilities`);
  if (!listRes.ok) {
    throw new Error(`platform-ops-content: GET .../capabilities → ${listRes.status}`);
  }
  const existing = (await listRes.json()) as CapabilityListRow[];
  const byName = new Map<string, string>();
  for (const c of existing) byName.set(c.name, c.id);

  // Read available bounded contexts once (best-effort ASSIGNED_TO_CONTEXT,
  // OQ-4/C-03) via the context-map read path. No BoundedContext is created.
  const ctxRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/system-model/context-map`);
  let boundedContextId: string | undefined;
  if (ctxRes.ok) {
    const ctxBody = (await ctxRes.json()) as { contexts?: Array<{ id: string; name: string }> };
    // Prefer a Platform-Ops-appropriate context by a name hint; else the first.
    const contexts = ctxBody.contexts ?? [];
    const hinted = contexts.find((c) => /ops|platform|reliab|infra/i.test(c.name));
    boundedContextId = (hinted ?? contexts[0])?.id;
  }

  const capIds: string[] = [];
  for (const row of CAPABILITY_ROWS) {
    let capId = byName.get(row.name);
    if (!capId) {
      const res = await fetch(`${baseUrl}/api/v1/models/${modelId}/capabilities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: row.name, description: row.description }),
      });
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(`platform-ops-content: POST .../capabilities (${row.name}) → ${res.status} ${detail}`);
      }
      const created = (await res.json()) as { id: string };
      capId = created.id;
    }
    capIds.push(capId);

    // Read current mappings for idempotency.
    const detailRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}`);
    const detail = detailRes.ok ? ((await detailRes.json()) as CapabilityDetail) : {};
    const supportedIds = new Set((detail.supportedBy ?? []).map((s) => s.id));
    const neededIds = new Set((detail.neededBy ?? []).map((n) => n.id));

    // SUPPORTED_BY ≥1.
    for (const sysKey of row.supportedBy) {
      const systemId = resolveSystemId(sysKey, handles);
      if (supportedIds.has(systemId)) continue;
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/supported-by`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ systemId }),
        },
      );
      if (!res.ok) {
        const detailTxt = await res.text().catch(() => "");
        throw new Error(`platform-ops-content: PUT .../supported-by → ${res.status} ${detailTxt}`);
      }
    }

    // NEEDS_CAPABILITY ≥1 (exactly one of activityId|storyId — use activityId).
    if (!neededIds.has(row.neededByActivityId)) {
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/needed-by`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ activityId: row.neededByActivityId }),
        },
      );
      if (!res.ok) {
        const detailTxt = await res.text().catch(() => "");
        throw new Error(`platform-ops-content: PUT .../needed-by → ${res.status} ${detailTxt}`);
      }
    }

    // ASSIGNED_TO_CONTEXT — best-effort (OQ-4). Only if a context exists and
    // is not already assigned. setContext REPLACEs, so guard on current.
    if (boundedContextId && detail.assignedContextId !== boundedContextId) {
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/context`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boundedContextId }),
        },
      );
      // Best-effort: a 404 (context vanished) is not fatal.
      if (!res.ok && res.status !== 404) {
        const detailTxt = await res.text().catch(() => "");
        throw new Error(`platform-ops-content: PUT .../context → ${res.status} ${detailTxt}`);
      }
    }
  }
  return capIds;
}

// ---------------------------------------------------------------------------
// Orchestration (§4.0) — the full dependency-ordered content seed.
// ---------------------------------------------------------------------------

export interface PlatformOpsSeedResult {
  modelId: string;
  domainId: string;
  kpiIds: Record<string, string>;
  riskIds: string[];
  slaIds: string[];
  storyIds: string[];
  capabilityIds: string[];
}

export async function seedPlatformOpsContent(baseUrl: string): Promise<PlatformOpsSeedResult> {
  const handles = await resolveHandles(baseUrl); // C-04 — fail loud on missing preconditions
  await loadPlatformOpsFixture(baseUrl); // self-contained run (idempotent MERGE-on-id)
  await seedCrossBoundaryEdges(baseUrl, handles); // §4.2a — journey→domain etc.
  const kpiIds = await seedKpis(baseUrl, handles); // KPIs → MEASURES → ALIGNED_TO
  const riskIds = await seedRisks(baseUrl);
  const slaIds = await seedSlas(baseUrl);
  const storyIds = await seedStories(baseUrl, handles.modelId);
  const capabilityIds = await seedCapabilities(baseUrl, handles);

  return {
    modelId: handles.modelId,
    domainId: handles.domainId,
    kpiIds,
    riskIds,
    slaIds,
    storyIds,
    capabilityIds,
  };
}
