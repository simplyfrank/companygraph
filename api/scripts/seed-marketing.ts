// marketing-process-model T-02…T-10 (design §4.1–§4.6, §7). The
// `bun run seed:marketing` CLI entrypoint — a SELF-OWNED companion seed
// step, sibling to api/scripts/seed-saas-operator.ts and
// api/scripts/seed-saas-metric-library.ts (neither is edited).
//
// Ordering (design §7): run AFTER
//   seed:saas-operator        (operator root + Marketing domain + shared
//                              catalog + loads shared/seed/saas-operator/
//                              marketing.json process content)
//   seed:saas-metric-library  (MetricDefinition roster + MEASURES edge type)
//   seed:funnel-pipeline       (Funnel/Stage labels + HAS_STAGE/CONVERTS_TO)
// The step-0 resolver fails loud if the operator root or Marketing domain is
// absent (never a silent partial write). The funnel step (§4.3) degrades to a
// loud skip when the funnel-pipeline construct is not yet registered.
//
// AUTH (review-design.md C-02): this targets the local dev API
// http://127.0.0.1:8787 (loopback, house rule) with ONELOGIN_ISSUER unset,
// inheriting the dev-session grant (permissions:["*"]) exactly as the sibling
// seed scripts do — NO auth header, NO cookie/token. DEV-ONLY seed tooling;
// never a beyond-localhost path.
//
// Idempotency by lookup, not MERGE (design §4.5): governed routes
// server-generate ids, so every API-driven write does a check-before-POST
// keyed on a stable natural attribute. A re-run is net-zero.
//
// zod is the only validation library; en-US identifiers (house rules). The
// internal input guards below are permissive, script-internal sanity checks —
// never a REST boundary (the routes re-parse every POST).

import { z } from "zod";
import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { linkKpiToMetric } from "../src/seed/link-kpi-metric";

// ---------------------------------------------------------------------------
// Internal input guards (§3.4) — script-local, never a REST boundary.
// ---------------------------------------------------------------------------

const kpiRowSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1),
  measurement_frequency: z.string().min(1),
  description: z.string().optional(),
  metricSeedId: z.string().optional(), // present → MEASURES-grounded
  alignTo: z.object({
    target_type: z.enum(["journey", "activity", "domain"]),
    journeySeedKey: z.string().optional(),
    activitySeedKey: z.string().optional(),
    toDomain: z.boolean().optional(),
    weight: z.number().min(0).max(1),
    attribution_type: z.enum(["direct", "indirect", "leading", "lagging"]),
  }),
});
type KpiRow = z.infer<typeof kpiRowSchema>;

const riskRowSchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  risk_type: z.enum(["strategic", "operational", "financial", "compliance", "security", "technical"]),
  description: z.string().optional(),
  linkedActivitySeedKey: z.string().optional(),
  linkedJourneySeedKey: z.string().optional(),
});
type RiskRow = z.infer<typeof riskRowSchema>;

// ---------------------------------------------------------------------------
// Content tables — illustrative, internally-consistent values (OQ-4, XD-03).
// ---------------------------------------------------------------------------

const KPIS: KpiRow[] = [
  {
    seedKey: "cac",
    name: "CAC (marketing-attributed)",
    category: "cost",
    unit: "USD",
    target_value: 1200,
    target_direction: "lower_is_better",
    measurement_frequency: "monthly",
    description: "Marketing-attributed portion of customer acquisition cost.",
    metricSeedId: "metric-cac",
    alignTo: { target_type: "domain", toDomain: true, weight: 1, attribution_type: "lagging" },
  },
  {
    seedKey: "mql-sql-conversion",
    name: "MQL→SQL Conversion Rate",
    category: "efficiency",
    unit: "%",
    target_value: 35,
    target_direction: "higher_is_better",
    measurement_frequency: "monthly",
    description:
      "Rate at which MQLs convert to SQLs. Grounds in metric-pipeline-conversion as the nearest canonical roster proxy for a qualified-stage conversion (C-04).",
    metricSeedId: "metric-pipeline-conversion",
    alignTo: { target_type: "journey", journeySeedKey: "mql-scoring", weight: 1, attribution_type: "direct" },
  },
  {
    seedKey: "cpl",
    name: "CPL (cost per lead)",
    category: "cost",
    unit: "USD",
    target_value: 60,
    target_direction: "lower_is_better",
    measurement_frequency: "monthly",
    description: "Cost per captured lead. No canonical roster metric (MEASURES-less, B-01).",
    alignTo: { target_type: "journey", journeySeedKey: "campaign-lead", weight: 1, attribution_type: "direct" },
  },
  {
    seedKey: "cost-per-mql",
    name: "Cost per MQL",
    category: "cost",
    unit: "USD",
    target_value: 180,
    target_direction: "lower_is_better",
    measurement_frequency: "monthly",
    description: "Cost per marketing-qualified lead. No canonical roster metric (MEASURES-less, B-01).",
    alignTo: { target_type: "journey", journeySeedKey: "mql-scoring", weight: 1, attribution_type: "leading" },
  },
  {
    seedKey: "marketing-sourced-pipeline",
    name: "Marketing-Sourced Pipeline",
    category: "other",
    unit: "USD",
    target_value: 5000000,
    target_direction: "higher_is_better",
    measurement_frequency: "quarterly",
    description: "Pipeline value sourced by marketing. No canonical roster metric (MEASURES-less, N-03).",
    alignTo: { target_type: "domain", toDomain: true, weight: 1, attribution_type: "leading" },
  },
  {
    seedKey: "lead-volume",
    name: "Lead Volume",
    category: "other",
    unit: "count",
    target_value: 2500,
    target_direction: "higher_is_better",
    measurement_frequency: "monthly",
    description: "Count of captured leads. No canonical roster metric (MEASURES-less, N-03).",
    alignTo: { target_type: "activity", activitySeedKey: "capture-lead", weight: 1, attribution_type: "leading" },
  },
];

const RISKS: RiskRow[] = [
  {
    name: "Content brand & compliance risk",
    owner: "Marketing Function Owner",
    likelihood: 3,
    impact: 4,
    status: "mitigating",
    trend: "flat",
    risk_type: "compliance",
    description: "Published content may violate brand, legal, or regulatory standards.",
    linkedActivitySeedKey: "review-approve-content",
  },
  {
    name: "Attribution & lead-data quality risk",
    owner: "Marketing Function Owner",
    likelihood: 4,
    impact: 3,
    status: "open",
    trend: "up",
    risk_type: "operational",
    description: "Poor lead-data quality and attribution gaps distort funnel and CAC reporting.",
    linkedActivitySeedKey: "enrich-lead",
  },
  {
    name: "Email deliverability & channel-dependency risk",
    owner: "Marketing Function Owner",
    likelihood: 3,
    impact: 3,
    status: "open",
    trend: "flat",
    risk_type: "operational",
    description: "Deliverability issues or over-reliance on a single channel threaten demand generation.",
    linkedJourneySeedKey: "campaign-lead",
  },
];

interface StorySpec {
  journeySeedKey: string;
  persona: string;
  action: string;
  benefit: string;
  activitySeedKey: string;
  ac: { given: string; when: string; then: string };
}

const STORIES: StorySpec[] = [
  {
    journeySeedKey: "content-ops",
    persona: "Content Marketer",
    action: "publish approved content to the CMS",
    benefit: "the audience receives on-brand, reviewed material",
    activitySeedKey: "publish-content",
    ac: {
      given: "a content asset that has passed review & approval",
      when: "the content marketer publishes it",
      then: "the asset is live in the CMS and available on its channel",
    },
  },
  {
    journeySeedKey: "campaign-lead",
    persona: "Demand-Gen Manager",
    action: "capture a lead from a campaign landing page",
    benefit: "a qualified prospect enters the demand funnel",
    activitySeedKey: "capture-lead",
    ac: {
      given: "a published landing page with a working form",
      when: "a visitor submits the form",
      then: "a lead record is created and enters the demand funnel at the Lead stage",
    },
  },
  {
    journeySeedKey: "mql-scoring",
    persona: "Marketing Ops",
    action: "qualify a scored lead to MQL",
    benefit: "sales receives only sufficiently-qualified leads",
    activitySeedKey: "qualify-mql",
    ac: {
      given: "an inbound lead whose score crosses the MQL threshold",
      when: "the scoring model qualifies it",
      then: "the lead is marked MQL and queued for sales handoff",
    },
  },
  {
    journeySeedKey: "webinars-events",
    persona: "Field/Events Marketer",
    action: "follow up with webinar attendees",
    benefit: "engaged attendees are routed to the right next step",
    activitySeedKey: "follow-up-attendees",
    ac: {
      given: "a completed webinar with an attendee list",
      when: "the events marketer runs post-event follow-up",
      then: "engaged attendees are scored and qualified leads are routed",
    },
  },
  {
    journeySeedKey: "abm",
    persona: "ABM Strategist",
    action: "orchestrate a multi-channel account play",
    benefit: "target accounts receive coordinated outreach",
    activitySeedKey: "orchestrate-account-plays",
    ac: {
      given: "a prioritized list of target accounts",
      when: "the ABM strategist launches an account play",
      then: "coordinated multi-channel touches are delivered to each account",
    },
  },
];

interface CapabilitySpec {
  name: string;
  description: string;
  neededByActivitySeedKey: string;
  supportedBySystemSeedKeys: Array<{ marketing?: string; shared?: string }>;
}

const CAPABILITIES: CapabilitySpec[] = [
  {
    name: "Capture and qualify a lead",
    description: "Capture inbound leads and qualify them to MQL.",
    neededByActivitySeedKey: "capture-lead",
    supportedBySystemSeedKeys: [{ marketing: "map" }, { shared: "crm" }],
  },
  {
    name: "Run a multi-channel campaign",
    description: "Plan and run paid/organic multi-channel campaigns.",
    neededByActivitySeedKey: "launch-campaign",
    supportedBySystemSeedKeys: [{ marketing: "ad-platform" }, { marketing: "map" }],
  },
  {
    name: "Score lead intent",
    description: "Score inbound lead intent for qualification.",
    neededByActivitySeedKey: "score-inbound-leads",
    supportedBySystemSeedKeys: [{ marketing: "lead-scoring-ai" }],
  },
];

// ---------------------------------------------------------------------------
// HTTP helpers — loopback dev API, no auth header (C-02).
// ---------------------------------------------------------------------------

interface CypherRow {
  [k: string]: unknown;
}

async function cypher(base: string, statement: string, params: Record<string, unknown> = {}): Promise<CypherRow[]> {
  const res = await fetch(`${base}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`cypher: ${res.status} ${detail} :: ${statement}`);
  }
  const body = (await res.json()) as { rows: CypherRow[] };
  return body.rows;
}

async function postJson(base: string, path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function putJson(base: string, path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Step-0 id resolver (§4.4, OQ-3).
// ---------------------------------------------------------------------------

export interface MarketingIds {
  rootId: string;
  domainId: string;
  journeys: Map<string, string>; // seedKey → id
  activities: Map<string, string>; // seedKey → id
  systems: Map<string, string>; // seedKey → id (Marketing-specific)
  sharedSystems: Map<string, string>; // operatorSeedKey → id (CRM, Data Warehouse)
  roles: Map<string, string>; // seedKey → id (Marketing-specific)
}

function attrsSeedKey(json: unknown): string | undefined {
  if (typeof json !== "string") return undefined;
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    return typeof v.seedKey === "string" ? v.seedKey : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveIds(base: string): Promise<MarketingIds> {
  // Operator root (name + saasOperatorRoot marker filtered in TS).
  const rootRows = await cypher(base, `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`);
  const root = rootRows.find((r) => {
    try {
      return (JSON.parse(String(r.a ?? "{}")) as Record<string, unknown>).saasOperatorRoot === true;
    } catch {
      return false;
    }
  });
  if (!root) {
    throw new Error('seed:marketing: SaaS Operator root not found — run `bun run seed:saas-operator` first.');
  }
  const rootId = String(root.id);

  // Marketing domain (seedKey="marketing") scoped to the root.
  const domainRows = await cypher(
    base,
    `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$rootId})
     WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
     RETURN d.id AS id`,
    { rootId },
  );
  if (domainRows.length === 0) {
    throw new Error('seed:marketing: Marketing domain not found — run `bun run seed:saas-operator` first.');
  }
  const domainId = String(domainRows[0]!.id);

  // Journeys by their fixture seedKey (fixture-loaded process content). NOTE:
  // resolved by seedKey directly, NOT via the UserJourney→Domain PART_OF edge —
  // that edge is created later by this same script (seedJourneyDomainEdges), so
  // on a first run it does not exist yet when the resolver runs.
  const MARKETING_JOURNEY_KEYS = ["content-ops", "campaign-lead", "mql-scoring", "webinars-events", "abm"];
  const journeys = new Map<string, string>();
  const journeyIds: string[] = [];
  for (const key of MARKETING_JOURNEY_KEYS) {
    const rows = await cypher(
      base,
      `MATCH (j:UserJourney) WHERE j.attributes_json CONTAINS $needle RETURN j.id AS id LIMIT 1`,
      { needle: `"seedKey":"${key}"` },
    );
    if (rows.length > 0) {
      journeys.set(key, String(rows[0]!.id));
      journeyIds.push(String(rows[0]!.id));
    }
  }

  const activities = new Map<string, string>();
  if (journeyIds.length > 0) {
    const aRows = await cypher(
      base,
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)
       WHERE j.id IN $journeyIds
       RETURN a.id AS id, a.attributes_json AS a`,
      { journeyIds },
    );
    for (const r of aRows) {
      const k = attrsSeedKey(r.a);
      if (k) activities.set(k, String(r.id));
    }
  }

  // Marketing-specific systems + roles by seedKey (fixture content). Scope by
  // the marketing seedKey set so we never match retail/other-function nodes.
  const systems = new Map<string, string>();
  const sysRows = await cypher(
    base,
    `MATCH (s:System)
     WHERE s.attributes_json CONTAINS '"seedKey":"map"'
        OR s.attributes_json CONTAINS '"seedKey":"cms"'
        OR s.attributes_json CONTAINS '"seedKey":"webinar-platform"'
        OR s.attributes_json CONTAINS '"seedKey":"ad-platform"'
        OR s.attributes_json CONTAINS '"seedKey":"analytics-attribution"'
        OR s.attributes_json CONTAINS '"seedKey":"lead-scoring-ai"'
     RETURN s.id AS id, s.attributes_json AS a`,
  );
  for (const r of sysRows) {
    const k = attrsSeedKey(r.a);
    if (k) systems.set(k, String(r.id));
  }

  const roles = new Map<string, string>();
  const roleRows = await cypher(
    base,
    `MATCH (r:Role)
     WHERE r.attributes_json CONTAINS '"seedKey":"content-marketer"'
        OR r.attributes_json CONTAINS '"seedKey":"demand-gen-manager"'
        OR r.attributes_json CONTAINS '"seedKey":"marketing-ops"'
        OR r.attributes_json CONTAINS '"seedKey":"field-events-marketer"'
        OR r.attributes_json CONTAINS '"seedKey":"abm-strategist"'
        OR r.attributes_json CONTAINS '"seedKey":"marketing-analyst"'
     RETURN r.id AS id, r.attributes_json AS a`,
  );
  for (const r of roleRows) {
    const k = attrsSeedKey(r.a);
    if (k) roles.set(k, String(r.id));
  }

  // Shared operator systems (CRM, Data Warehouse) by operatorSeedKey.
  const sharedSystems = new Map<string, string>();
  const sharedRows = await cypher(
    base,
    `MATCH (s:System) WHERE s.operatorSeedKey IN ["crm","data_warehouse"] RETURN s.operatorSeedKey AS k, s.id AS id`,
  );
  for (const r of sharedRows) sharedSystems.set(String(r.k), String(r.id));

  return { rootId, domainId, journeys, activities, systems, sharedSystems, roles };
}

// ---------------------------------------------------------------------------
// T-03 — UserJourney→Domain PART_OF + KPI create.
// ---------------------------------------------------------------------------

async function seedJourneyDomainEdges(base: string, ids: MarketingIds): Promise<number> {
  let created = 0;
  for (const journeyId of ids.journeys.values()) {
    const exists = await cypher(
      base,
      `MATCH (:UserJourney {id:$jid})-[:PART_OF]->(:Domain {id:$did}) RETURN count(*) AS n`,
      { jid: journeyId, did: ids.domainId },
    );
    if (Number((exists[0]?.n as { low?: number })?.low ?? exists[0]?.n ?? 0) > 0) continue;
    const res = await postJson(base, "/api/v1/edges", { type: "PART_OF", fromId: journeyId, toId: ids.domainId });
    if (res.status !== 201) {
      throw new Error(`seed:marketing: PART_OF UserJourney→Domain → ${res.status} ${JSON.stringify(res.body)}`);
    }
    created++;
  }
  return created;
}

async function findKpiIdByName(base: string, name: string): Promise<string | undefined> {
  const rows = await cypher(base, `MATCH (k:KPI {name:$name}) RETURN k.id AS id LIMIT 1`, { name });
  return rows.length > 0 ? String(rows[0]!.id) : undefined;
}

async function seedKpis(base: string, ids: MarketingIds): Promise<Map<string, string>> {
  const kpiIds = new Map<string, string>(); // seedKey → id
  for (const row of KPIS) {
    kpiRowSchema.parse(row); // script-internal sanity
    let id = await findKpiIdByName(base, row.name);
    if (!id) {
      const res = await postJson(base, "/api/v1/kpis", {
        name: row.name,
        category: row.category,
        unit: row.unit,
        target_value: row.target_value,
        target_direction: row.target_direction,
        measurement_frequency: row.measurement_frequency,
        description: row.description,
      });
      if (res.status !== 200) {
        throw new Error(`seed:marketing: POST /api/v1/kpis (${row.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
      id = String((res.body as { id: string }).id);
    }
    kpiIds.set(row.seedKey, id);
  }
  return kpiIds;
}

// ---------------------------------------------------------------------------
// T-04 — MEASURES links for the two metric-grounded KPIs.
// ---------------------------------------------------------------------------

// Resolves a MetricDefinition node id from its stable attributes.seedKey
// (the as-built metrics.json carries a UUIDv7 `id` + `attributes.seedKey`
// like "metric-cac"; the seedKey is the stable roster handle, not the id).
async function resolveMetricId(base: string, seedKey: string): Promise<string | undefined> {
  const rows = await cypher(
    base,
    `MATCH (m:MetricDefinition) WHERE m.attributes_json CONTAINS $needle RETURN m.id AS id LIMIT 1`,
    { needle: `"seedKey":"${seedKey}"` },
  );
  return rows.length > 0 ? String(rows[0]!.id) : undefined;
}

async function seedMeasures(base: string, kpiIds: Map<string, string>): Promise<number> {
  let created = 0;
  for (const row of KPIS) {
    if (!row.metricSeedId) continue;
    const kpiId = kpiIds.get(row.seedKey)!;
    // Resolve the metric node by its stable seedKey (loud if roster absent).
    const metricId = await resolveMetricId(base, row.metricSeedId);
    if (!metricId) {
      throw new Error(
        `seed:marketing: MetricDefinition seedKey=${row.metricSeedId} not found — run \`bun run seed:saas-metric-library\` first.`,
      );
    }
    const existing = await cypher(
      base,
      `MATCH (:KPI {id:$kid})-[m:MEASURES]->(:MetricDefinition {id:$mid}) RETURN count(m) AS n`,
      { kid: kpiId, mid: metricId },
    );
    if (Number((existing[0]?.n as { low?: number })?.low ?? existing[0]?.n ?? 0) > 0) continue;
    await linkKpiToMetric(base, kpiId, metricId);
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// T-05 — KPI alignment (ALIGNED_TO via kpi-alignments) + one PARAM_BINDS.
// ---------------------------------------------------------------------------

async function seedAlignments(base: string, ids: MarketingIds, kpiIds: Map<string, string>): Promise<number> {
  let created = 0;
  for (const row of KPIS) {
    const kpiId = kpiIds.get(row.seedKey)!;
    const align = row.alignTo;
    let targetId: string;
    if (align.target_type === "domain") targetId = ids.domainId;
    else if (align.target_type === "journey") targetId = ids.journeys.get(align.journeySeedKey!)!;
    else targetId = ids.activities.get(align.activitySeedKey!)!;
    if (!targetId) throw new Error(`seed:marketing: alignment target unresolved for KPI ${row.seedKey}`);

    const targetLabel =
      align.target_type === "journey" ? "UserJourney" : align.target_type === "activity" ? "Activity" : "Domain";
    const existing = await cypher(
      base,
      `MATCH (:KPI {id:$kid})-[r:ALIGNED_TO]->(:${targetLabel} {id:$tid}) RETURN count(r) AS n`,
      { kid: kpiId, tid: targetId },
    );
    if (Number((existing[0]?.n as { low?: number })?.low ?? existing[0]?.n ?? 0) === 0) {
      const res = await postJson(base, "/api/v1/kpi-alignments", {
        kpi_id: kpiId,
        target_type: align.target_type,
        target_id: targetId,
        weight: align.weight,
        attribution_type: align.attribution_type,
      });
      if (res.status !== 200) {
        throw new Error(`seed:marketing: POST /api/v1/kpi-alignments (${row.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
      created++;
    }
  }

  // One PARAM_BINDS (N-03) — Lead-Volume KPI param-bound to the Capture-Lead
  // activity. The route MERGEs on (kpi, parameter) so a re-run is net-zero.
  const leadVolumeId = kpiIds.get("lead-volume")!;
  const captureLeadId = ids.activities.get("capture-lead")!;
  const res = await postJson(base, `/api/v1/kpis/${leadVolumeId}/param-bindings`, {
    target_type: "activity",
    target_id: captureLeadId,
    parameter: "target_value",
    attribute_path: "attributes.lead_target",
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`seed:marketing: POST param-bindings → ${res.status} ${JSON.stringify(res.body)}`);
  }

  return created;
}

// ---------------------------------------------------------------------------
// T-06 — Marketing Demand Funnel (Funnel/Stage/HAS_STAGE/CONVERTS_TO).
//
// BLOCKED-DEPENDENCY DEGRADE: the funnel-pipeline-modeling construct
// (Funnel/Stage labels, HAS_STAGE/CONVERTS_TO edge types, and the
// POST /api/v1/funnels/transitions route) is not yet shipped. When it is
// absent this step logs a loud skip and seeds no funnel data — it never
// creates the Funnel/Stage labels or a generic-edge CONVERTS_TO itself
// (D-2: those are funnel-pipeline-modeling-owned). Once that dependency
// lands, a re-run seeds the funnel idempotently.
// ---------------------------------------------------------------------------

const FUNNEL_KEY = "marketing-demand-funnel";
const STAGES = [
  { name: "Visitor", stageOrder: 0 },
  { name: "Lead", stageOrder: 1 },
  { name: "MQL", stageOrder: 2 },
  { name: "SQL", stageOrder: 3 },
];
const TRANSITIONS = [
  { from: "Visitor", to: "Lead", conversionRate: 0.05, dropOffRate: 0.95 },
  { from: "Lead", to: "MQL", conversionRate: 0.4, dropOffRate: 0.6 },
  { from: "MQL", to: "SQL", conversionRate: 0.35, dropOffRate: 0.65 },
];

async function funnelConstructReady(base: string): Promise<boolean> {
  // The transition route is the funnel-pipeline-modeling seam. A 404 "no route"
  // means the construct is not shipped yet.
  const res = await fetch(`${base}/api/v1/funnels/transitions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.status !== 404;
}

async function seedFunnel(base: string, ids: MarketingIds): Promise<"seeded" | "skipped"> {
  if (!(await funnelConstructReady(base))) {
    console.warn(
      "[seed:marketing] SKIP funnel: POST /api/v1/funnels/transitions is not registered — " +
        "run `bun run seed:funnel-pipeline` (funnel-pipeline-modeling) first, then re-run seed:marketing.",
    );
    return "skipped";
  }

  // Funnel (resolve-or-create by name + modelId).
  const funnelRows = await cypher(
    base,
    `MATCH (f:Funnel {name:"Marketing Demand Funnel"}) WHERE f.attributes_json CONTAINS $rootMarker RETURN f.id AS id LIMIT 1`,
    { rootMarker: `"modelId":"${ids.rootId}"` },
  );
  let funnelId: string;
  if (funnelRows.length > 0) {
    funnelId = String(funnelRows[0]!.id);
  } else {
    const res = await postJson(base, "/api/v1/nodes/Funnel", {
      name: "Marketing Demand Funnel",
      description: "Top-of-funnel demand pipeline: Visitor → Lead → MQL → SQL.",
      attributes: { modelId: ids.rootId, funnelKey: FUNNEL_KEY },
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`seed:marketing: POST /api/v1/nodes/Funnel → ${res.status} ${JSON.stringify(res.body)}`);
    }
    funnelId = String((res.body as { id: string }).id);
  }

  // Stages (funnel-scoped existence check, N-02).
  const stageIds = new Map<string, string>();
  for (const st of STAGES) {
    const found = await cypher(
      base,
      `MATCH (s:Stage) WHERE s.attributes_json CONTAINS $fkey AND s.name=$name RETURN s.id AS id LIMIT 1`,
      { fkey: `"funnelKey":"${FUNNEL_KEY}"`, name: st.name },
    );
    let stageId: string;
    if (found.length > 0) {
      stageId = String(found[0]!.id);
    } else {
      const res = await postJson(base, "/api/v1/nodes/Stage", {
        name: st.name,
        description: `${st.name} stage of the Marketing Demand Funnel.`,
        attributes: { funnelKey: FUNNEL_KEY, stageOrder: st.stageOrder },
      });
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(`seed:marketing: POST /api/v1/nodes/Stage (${st.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
      stageId = String((res.body as { id: string }).id);
    }
    stageIds.set(st.name, stageId);

    // HAS_STAGE (Funnel→Stage) via generic edge route.
    const hasStage = await cypher(
      base,
      `MATCH (:Funnel {id:$fid})-[h:HAS_STAGE]->(:Stage {id:$sid}) RETURN count(h) AS n`,
      { fid: funnelId, sid: stageId },
    );
    if (Number((hasStage[0]?.n as { low?: number })?.low ?? hasStage[0]?.n ?? 0) === 0) {
      const res = await postJson(base, "/api/v1/edges", { type: "HAS_STAGE", fromId: funnelId, toId: stageId });
      if (res.status !== 201) {
        throw new Error(`seed:marketing: POST HAS_STAGE → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }

  // CONVERTS_TO transitions via the range-checked funnel route.
  for (const t of TRANSITIONS) {
    const fromId = stageIds.get(t.from)!;
    const toId = stageIds.get(t.to)!;
    const existing = await cypher(
      base,
      `MATCH (:Stage {id:$fid})-[c:CONVERTS_TO]->(:Stage {id:$tid}) RETURN count(c) AS n`,
      { fid: fromId, tid: toId },
    );
    if (Number((existing[0]?.n as { low?: number })?.low ?? existing[0]?.n ?? 0) > 0) continue;
    const res = await postJson(base, "/api/v1/funnels/transitions", {
      fromId,
      toId,
      conversionRate: t.conversionRate,
      dropOffRate: t.dropOffRate,
    });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`seed:marketing: POST /api/v1/funnels/transitions (${t.from}→${t.to}) → ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  return "seeded";
}

// ---------------------------------------------------------------------------
// T-07 — Stories + Given/When/Then acceptance criteria.
// ---------------------------------------------------------------------------

async function seedStories(base: string, ids: MarketingIds): Promise<number> {
  let created = 0;
  for (const s of STORIES) {
    const activityId = ids.activities.get(s.activitySeedKey);
    if (!activityId) throw new Error(`seed:marketing: story activity ${s.activitySeedKey} unresolved`);

    // Idempotency: a UserStory with this action describing the target activity.
    const found = await cypher(
      base,
      `MATCH (st:UserStory {action:$action})-[:DESCRIBES_ACTIVITY]->(:Activity {id:$aid}) RETURN st.id AS id LIMIT 1`,
      { action: s.action, aid: activityId },
    );
    let storyId: string;
    if (found.length > 0) {
      storyId = String(found[0]!.id);
    } else {
      const res = await postJson(base, `/api/v1/models/${ids.rootId}/stories`, {
        persona: s.persona,
        action: s.action,
        benefit: s.benefit,
        activityId,
      });
      if (res.status !== 201) {
        throw new Error(`seed:marketing: POST story (${s.action}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
      storyId = String((res.body as { id: string }).id);
      created++;
    }

    // AC — one per story. Idempotency: any AC already on the story.
    const acExisting = await cypher(
      base,
      `MATCH (:UserStory {id:$sid})<-[:ACCEPTANCE_OF]-(ac:AcceptanceCriterion) RETURN count(ac) AS n`,
      { sid: storyId },
    );
    if (Number((acExisting[0]?.n as { low?: number })?.low ?? acExisting[0]?.n ?? 0) === 0) {
      const res = await postJson(base, `/api/v1/models/${ids.rootId}/stories/${storyId}/acceptance-criteria`, s.ac);
      if (res.status !== 201) {
        throw new Error(`seed:marketing: POST AC (${s.action}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// T-08 — Marketing risks via the governed risk-register API (XD-04).
// ---------------------------------------------------------------------------

async function riskExists(base: string, name: string): Promise<boolean> {
  const res = await fetch(
    `${base}/api/v1/risk-register?domain=${encodeURIComponent("Marketing")}`,
  );
  if (!res.ok) throw new Error(`seed:marketing: GET /api/v1/risk-register → ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ name: string }> };
  return (body.data ?? []).some((r) => r.name === name);
}

async function seedRisks(base: string, ids: MarketingIds): Promise<number> {
  let created = 0;
  for (const r of RISKS) {
    riskRowSchema.parse(r);
    if (await riskExists(base, r.name)) continue;
    const linked =
      r.linkedActivitySeedKey !== undefined
        ? { linked_entity_type: "activity", linked_entity_id: ids.activities.get(r.linkedActivitySeedKey) }
        : r.linkedJourneySeedKey !== undefined
          ? { linked_entity_type: "journey", linked_entity_id: ids.journeys.get(r.linkedJourneySeedKey) }
          : {};
    const res = await postJson(base, "/api/v1/risk-register", {
      name: r.name,
      owner: r.owner,
      domain: "Marketing",
      likelihood: r.likelihood,
      impact: r.impact,
      status: r.status,
      trend: r.trend,
      risk_type: r.risk_type,
      description: r.description,
      ...linked,
    });
    if (res.status !== 201) {
      throw new Error(`seed:marketing: POST /api/v1/risk-register (${r.name}) → ${res.status} ${JSON.stringify(res.body)}`);
    }
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// T-09 — DDD capabilities + NEEDS_CAPABILITY/SUPPORTED_BY.
// ---------------------------------------------------------------------------

async function seedCapabilities(base: string, ids: MarketingIds): Promise<number> {
  let created = 0;
  for (const c of CAPABILITIES) {
    const found = await cypher(
      base,
      `MATCH (cap:Capability {name:$name})-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$rootId}) RETURN cap.id AS id LIMIT 1`,
      { name: c.name, rootId: ids.rootId },
    );
    let capId: string;
    if (found.length > 0) {
      capId = String(found[0]!.id);
    } else {
      const res = await postJson(base, `/api/v1/models/${ids.rootId}/capabilities`, {
        name: c.name,
        description: c.description,
      });
      if (res.status !== 201) {
        throw new Error(`seed:marketing: POST capability (${c.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
      capId = String((res.body as { id: string }).id);
      created++;
    }

    // NEEDS_CAPABILITY from the Marketing activity (PUT is idempotent MERGE).
    const activityId = ids.activities.get(c.neededByActivitySeedKey);
    if (activityId) {
      const res = await putJson(base, `/api/v1/models/${ids.rootId}/capabilities/${capId}/needed-by`, { activityId });
      if (res.status !== 200) {
        throw new Error(`seed:marketing: PUT needed-by (${c.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }

    // SUPPORTED_BY each system (PUT is idempotent MERGE).
    for (const s of c.supportedBySystemSeedKeys) {
      const systemId = s.marketing ? ids.systems.get(s.marketing) : s.shared ? ids.sharedSystems.get(s.shared) : undefined;
      if (!systemId) continue;
      const res = await putJson(base, `/api/v1/models/${ids.rootId}/capabilities/${capId}/supported-by`, { systemId });
      if (res.status !== 200) {
        throw new Error(`seed:marketing: PUT supported-by (${c.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// T-10 — main() orchestration (§7 ordering; idempotent by lookup).
// ---------------------------------------------------------------------------

export interface MarketingSeedResult {
  journeyDomainEdges: number;
  kpis: number;
  measures: number;
  alignments: number;
  funnel: "seeded" | "skipped";
  stories: number;
  risks: number;
  capabilities: number;
}

export async function seedMarketing(base?: string): Promise<MarketingSeedResult> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;

  // Step-0 resolver (the fixture is foundation-loaded during seed:saas-operator;
  // the companion script never re-imports it — Rule B).
  const ids = await resolveIds(apiBase);

  const journeyDomainEdges = await seedJourneyDomainEdges(apiBase, ids);
  const kpiIds = await seedKpis(apiBase, ids);
  const measures = await seedMeasures(apiBase, kpiIds);
  const alignments = await seedAlignments(apiBase, ids, kpiIds);
  const funnel = await seedFunnel(apiBase, ids);
  const stories = await seedStories(apiBase, ids);
  const risks = await seedRisks(apiBase, ids);
  const capabilities = await seedCapabilities(apiBase, ids);

  return {
    journeyDomainEdges,
    kpis: kpiIds.size,
    measures,
    alignments,
    funnel,
    stories,
    risks,
    capabilities,
  };
}

if (import.meta.main) {
  seedMarketing()
    .then((r) => {
      console.log(
        `[seed:marketing] journey→domain edges: ${r.journeyDomainEdges}, KPIs: ${r.kpis}, MEASURES: ${r.measures}, ` +
          `alignments: ${r.alignments}, funnel: ${r.funnel}, stories: ${r.stories}, risks: ${r.risks}, capabilities: ${r.capabilities}`,
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:marketing] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
