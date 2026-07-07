// sales-process-model T-02…T-09 (design §4.1–§4.11, §7). The
// `bun run seed:sales` CLI entrypoint — a SELF-OWNED companion seed step,
// sibling to api/scripts/seed-saas-metric-library.ts and
// api/scripts/seed-marketing.ts (none is edited, Rule E / NFR-02).
//
// Ordering (design §1, §7 / NFR-06): run AFTER, in this order:
//   funnel-pipeline-modeling  (executed upstream: Funnel/Stage labels +
//                              HAS_STAGE/CONVERTS_TO edge types +
//                              POST /api/v1/funnels/transitions route)
//   seed:saas-metric-library  (MEASURES edge type + MetricDefinition roster,
//                              incl. metric-win-rate / metric-pipeline-conversion)
//   seed:saas-operator        (operator root + Sales domain + shared CRM/MOMS/
//                              sales_lead catalog + loads shared/seed/
//                              saas-operator/sales.json process content)
//
// resolve() (§4.4, AC-16) resolves every foundation/library id and ALSO asserts
// the funnel subsystem is executed. If any required foreign id is unresolved OR
// the Funnel label / funnels/transitions route is absent, it THROWS and exits
// non-zero BEFORE any write — never a partial subgraph (B-01, AC-16). This is the
// build-ordering gate the design makes explicit and fail-loud.
//
// AUTH (CLAUDE.md auth note): this targets the local dev API
// http://127.0.0.1:8787 (loopback, house rule) with ONELOGIN_ISSUER unset,
// inheriting the dev-session grant (permissions:["*"]) exactly as the sibling
// seed scripts do — NO auth header, NO cookie/token. DEV-ONLY seed tooling;
// never a beyond-localhost path. No per-route auth is rolled (NFR-05).
//
// Idempotency by lookup, not MERGE (design §4.11): the fixture rows MERGE-on-id
// via realImport; every resolver route-write does a check-before-POST keyed on a
// stable natural attribute (existence pre-check / natural-key lookup). A re-run
// is net-zero, incl. zero duplicate Postgres risk rows.
//
// zod is the only validation library; en-US identifiers (house rules). The
// internal input guards below are permissive, script-internal sanity checks —
// never a REST boundary (the routes re-parse every POST).

import { z } from "zod";
import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { linkKpiToMetric, KpiMetricAlreadyLinkedError } from "../src/seed/link-kpi-metric";
import { seedRisk, type RiskSeedRow } from "../src/seed/governed-seed-helper";

// ---------------------------------------------------------------------------
// Content tables — illustrative, internally-consistent values (XD-03).
// Keys align with sales.json fixture `attributes.seedKey` values.
// ---------------------------------------------------------------------------

// FR-05a KPIs are FIXTURE rows (self-contained, grounded by the resolver via
// linkKpiToMetric). FR-05b KPIs are RESOLVER-created-and-grounded atomically,
// only when their metric exists (§4.5). Each entry names the KPI's stable
// metric id + its ≥1 alignment target(s) (D-1, all via kpi-alignments).

interface KpiGrounding {
  seedKey: string; // fixture KPI seedKey (FR-05a) OR resolver-created key (FR-05b)
  name: string;
  metricId: string; // stable MetricDefinition id (metric-win-rate, …)
  fixture: boolean; // true = fixture row (FR-05a); false = resolver-created (FR-05b)
  // resolver-created KPI attribute envelope (FR-05b only)
  create?: {
    category: string;
    unit: string;
    target_value: number;
    target_direction: string;
    measurement_frequency: string;
    description: string;
  };
  alignments: Array<{
    target_type: "journey" | "activity" | "domain";
    journeySeedKey?: string;
    activitySeedKey?: string;
    weight: number;
    attribution_type: "direct" | "indirect" | "leading" | "lagging";
  }>;
}

const KPIS: KpiGrounding[] = [
  {
    seedKey: "win-rate",
    name: "Win Rate",
    metricId: "metric-win-rate",
    fixture: true,
    alignments: [
      { target_type: "journey", journeySeedKey: "negotiate-close", weight: 1, attribution_type: "lagging" },
    ],
  },
  {
    seedKey: "pipeline-conversion",
    name: "Pipeline Conversion",
    metricId: "metric-pipeline-conversion",
    fixture: true,
    alignments: [{ target_type: "domain", weight: 1, attribution_type: "lagging" }],
  },
  {
    seedKey: "sales-cycle",
    name: "Sales Cycle",
    metricId: "metric-sales-cycle",
    fixture: false,
    create: {
      category: "efficiency",
      unit: "days",
      target_value: 45,
      target_direction: "lower_is_better",
      measurement_frequency: "monthly",
      description: "Average elapsed time from qualified opportunity to close-won.",
    },
    alignments: [{ target_type: "domain", weight: 1, attribution_type: "lagging" }],
  },
  {
    seedKey: "acv",
    name: "Average Contract Value (ACV)",
    metricId: "metric-acv",
    fixture: false,
    create: {
      category: "other",
      unit: "USD",
      target_value: 24000,
      target_direction: "higher_is_better",
      measurement_frequency: "quarterly",
      description: "Average annualized contract value of closed-won deals.",
    },
    alignments: [
      { target_type: "activity", activitySeedKey: "build-quote", weight: 1, attribution_type: "leading" },
    ],
  },
  {
    seedKey: "quota-attainment",
    name: "Quota Attainment",
    metricId: "metric-quota-attainment",
    fixture: false,
    create: {
      category: "efficiency",
      unit: "%",
      target_value: 100,
      target_direction: "higher_is_better",
      measurement_frequency: "quarterly",
      description: "Share of sales quota attained by the sales team.",
    },
    alignments: [{ target_type: "domain", weight: 1, attribution_type: "lagging" }],
  },
];

// Funnel (§4.6) — six stages, a strict linear chain, deliberately distinct from
// the five §4.1 pipeline-stage journeys (N-02). CONVERTS_TO rates are illustrative
// descriptive values in [0,1] (XD-03), written ONLY via the funnel transition route.
const FUNNEL_KEY = "sales-pipeline-funnel";
const STAGES = [
  { name: "Lead", stageOrder: 1 },
  { name: "Qualified", stageOrder: 2 },
  { name: "Demo", stageOrder: 3 },
  { name: "Proposal", stageOrder: 4 },
  { name: "Negotiation", stageOrder: 5 },
  { name: "Closed-Won", stageOrder: 6 },
];
const TRANSITIONS = [
  { from: "Lead", to: "Qualified", conversionRate: 0.5, dropOffRate: 0.5 },
  { from: "Qualified", to: "Demo", conversionRate: 0.7, dropOffRate: 0.3 },
  { from: "Demo", to: "Proposal", conversionRate: 0.6, dropOffRate: 0.4 },
  { from: "Proposal", to: "Negotiation", conversionRate: 0.65, dropOffRate: 0.35 },
  { from: "Negotiation", to: "Closed-Won", conversionRate: 0.55, dropOffRate: 0.45 },
];

interface StorySpec {
  persona: string;
  action: string;
  benefit: string;
  activitySeedKey: string;
  roleSeedKey?: string; // function-specific fixture role (resolved by seedKey)
  ac: { given: string; when: string; then: string };
}

const STORIES: StorySpec[] = [
  {
    persona: "Sales Development Rep",
    action: "qualify an inbound lead against BANT",
    benefit: "only genuinely-qualified opportunities enter the pipeline",
    activitySeedKey: "qualify-lead",
    roleSeedKey: "sales-development-rep",
    ac: {
      given: "an inbound lead in the CRM",
      when: "the SDR qualifies it against Budget, Authority, Need, and Timeline",
      then: "a qualified opportunity is created and enters the pipeline at the Qualified stage",
    },
  },
  {
    persona: "Sales Engineer",
    action: "run a product demonstration for a qualified opportunity",
    benefit: "the prospect sees the product fit for their needs",
    activitySeedKey: "run-product-demo",
    roleSeedKey: "sales-engineer",
    ac: {
      given: "a qualified opportunity scheduled for a demo",
      when: "the sales engineer runs the product demonstration",
      then: "the demo is recorded against the opportunity and the pipeline advances to the Demo stage",
    },
  },
  {
    persona: "Account Executive",
    action: "build a quote from the qualified opportunity",
    benefit: "I can present pricing without leaving the CRM",
    activitySeedKey: "build-quote",
    roleSeedKey: "account-executive",
    ac: {
      given: "a qualified opportunity",
      when: "the AE builds a quote in the CPQ tool",
      then: "a draft quote line-item set is attached to the CRM record",
    },
  },
  {
    persona: "Deal Desk",
    action: "prepare a contract with agreed terms and pricing",
    benefit: "the deal can be executed within margin governance",
    activitySeedKey: "prepare-contract",
    roleSeedKey: "deal-desk",
    ac: {
      given: "an opportunity with an agreed proposal",
      when: "Deal Desk prepares the contract",
      then: "a contract with approved terms and pricing is ready for signature",
    },
  },
  {
    persona: "Account Executive",
    action: "close a negotiated deal as won",
    benefit: "the account can be provisioned and handed to Customer Success",
    activitySeedKey: "close-won",
    roleSeedKey: "account-executive",
    ac: {
      given: "a countersigned contract",
      when: "the AE marks the opportunity closed-won",
      then: "the deal is closed-won in the CRM and provisioning is triggered",
    },
  },
];

interface CapabilitySpec {
  name: string;
  description: string;
  neededByActivitySeedKeys: string[];
  // supported-by: 'cpq' (fixture system seedKey) or shared 'moms'/'crm' (operatorSeedKey)
  supportedBy?: { fixtureSystemSeedKey?: string; sharedSystemKey?: string };
}

const CAPABILITIES: CapabilitySpec[] = [
  {
    name: "Qualify a lead",
    description: "Qualify inbound/outbound leads into pipeline opportunities.",
    neededByActivitySeedKeys: ["qualify-lead"],
  },
  {
    name: "Price and quote a deal",
    description: "Configure, price, and quote a deal for a prospect.",
    neededByActivitySeedKeys: ["build-quote"],
    supportedBy: { fixtureSystemSeedKey: "cpq" },
  },
  {
    name: "Close a contract",
    description: "Prepare, sign, and execute a sales contract.",
    neededByActivitySeedKeys: ["prepare-contract", "close-won"],
  },
  {
    name: "Provision a tenant",
    description: "Provision a won account as a tenant on the product.",
    neededByActivitySeedKeys: ["provision-tenant"],
    supportedBy: { sharedSystemKey: "moms" },
  },
];

const RISKS: Array<RiskSeedRow & { link?: { type: "domain" | "journey"; journeySeedKey?: string } }> = [
  {
    name: "Pipeline-coverage shortfall",
    owner: "Sales Function Owner",
    domain: "Sales",
    likelihood: 3,
    impact: 4,
    status: "mitigating",
    trend: "flat",
    risk_type: "operational",
    description: "Insufficient qualified pipeline coverage to hit the revenue target.",
    link: { type: "domain" },
  },
  {
    name: "Discount / margin leakage in Deal Desk",
    owner: "Sales Function Owner",
    domain: "Sales",
    likelihood: 3,
    impact: 3,
    status: "open",
    trend: "flat",
    risk_type: "financial",
    description: "Uncontrolled discounting erodes deal margin at contract preparation.",
    link: { type: "journey", journeySeedKey: "negotiate-close" },
  },
  {
    name: "CRM data-quality / forecast accuracy",
    owner: "Sales Function Owner",
    domain: "Sales",
    likelihood: 4,
    impact: 3,
    status: "open",
    trend: "up",
    risk_type: "operational",
    description: "Poor CRM data quality distorts pipeline reporting and forecast accuracy.",
    link: { type: "domain" },
  },
  {
    name: "Key-person dependency on a top AE",
    owner: "Sales Function Owner",
    domain: "Sales",
    likelihood: 2,
    impact: 4,
    status: "open",
    trend: "flat",
    risk_type: "strategic",
    description: "Over-reliance on a single top-performing Account Executive concentrates revenue risk.",
    link: { type: "domain" },
  },
];

// ---------------------------------------------------------------------------
// Internal input guards (§3.4) — script-local, never a REST boundary.
// ---------------------------------------------------------------------------

const kpiRowSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  metricId: z.string().min(1),
  fixture: z.boolean(),
});

const riskRowSchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  domain: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  risk_type: z.enum(["strategic", "operational", "financial", "compliance", "security", "technical"]),
});

// ---------------------------------------------------------------------------
// HTTP helpers — loopback dev API, no auth header (CLAUDE.md auth note).
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

function count(rows: CypherRow[]): number {
  const n = rows[0]?.n;
  return Number((n as { low?: number })?.low ?? n ?? 0);
}

// ---------------------------------------------------------------------------
// T-02 — resolve() : id resolution + funnel-subsystem probe (§4.4, AC-16).
// ---------------------------------------------------------------------------

export interface SalesIds {
  rootId: string;
  domainId: string;
  journeys: Map<string, string>; // seedKey → id
  activities: Map<string, string>; // seedKey → id
  systems: Map<string, string>; // seedKey → id (Sales-specific: cpq, e-signature)
  sharedSystems: Map<string, string>; // operatorSeedKey → id (crm, moms)
  roles: Map<string, string>; // seedKey → id (Sales-specific)
  salesLeadRoleId: string; // shared sales_lead role
  kpis: Map<string, string>; // seedKey → id (fixture FR-05a + resolver FR-05b)
  metrics: Map<string, string>; // metricId → node id (only present ones)
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

const JOURNEY_KEYS = ["prospect-qualify", "demo", "quote-propose", "negotiate-close", "tenant-provisioning"];
const SYSTEM_KEYS = ["cpq", "e-signature"];
const ROLE_KEYS = ["account-executive", "sales-development-rep", "sales-engineer", "deal-desk"];
const KPI_FIXTURE_KEYS = ["win-rate", "pipeline-conversion"];
const REQUIRED_METRICS = ["metric-win-rate", "metric-pipeline-conversion"];
const OPTIONAL_METRICS = ["metric-sales-cycle", "metric-acv", "metric-quota-attainment"];

async function funnelSubsystemPresent(base: string): Promise<{ label: boolean; route: boolean }> {
  // Funnel label registered?
  const labelRows = await cypher(base, `CALL db.labels() YIELD label WHERE label = "Funnel" RETURN label`);
  const label = labelRows.length > 0;
  // funnels/transitions route present? A 404 means the route is unregistered; a
  // 400 (validation) means it is present. Any non-404 = present.
  const probe = await fetch(`${base}/api/v1/funnels/transitions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const route = probe.status !== 404;
  return { label, route };
}

export async function resolve(base: string): Promise<SalesIds> {
  // Operator root (name + saasOperatorRoot marker filtered in TS).
  const rootRows = await cypher(base, `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`);
  const root = rootRows.find((r) => {
    try {
      return (JSON.parse(String(r.a ?? "{}")) as Record<string, unknown>).saasOperatorRoot === true;
    } catch {
      return false;
    }
  });
  if (!root) throw new Error("unresolved foundation/library id: operator root (run `bun run seed:saas-operator` first)");
  const rootId = String(root.id);

  // Sales domain (seedKey="sales") scoped to the root.
  const domainRows = await cypher(
    base,
    `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$rootId})
     WHERE d.attributes_json CONTAINS '"seedKey":"sales"' RETURN d.id AS id`,
    { rootId },
  );
  if (domainRows.length === 0) throw new Error("unresolved foundation/library id: Sales domain (seedKey=sales)");
  const domainId = String(domainRows[0]!.id);

  // In-slice journeys by fixture seedKey.
  const journeys = new Map<string, string>();
  const journeyIds: string[] = [];
  for (const key of JOURNEY_KEYS) {
    const rows = await cypher(base, `MATCH (j:UserJourney) WHERE j.attributes_json CONTAINS $needle RETURN j.id AS id LIMIT 1`, {
      needle: `"seedKey":"${key}"`,
    });
    if (rows.length > 0) {
      journeys.set(key, String(rows[0]!.id));
      journeyIds.push(String(rows[0]!.id));
    }
  }

  // In-slice activities scoped by PART_OF the resolved Sales journeys (avoids
  // matching a retail activity of the same name).
  const activities = new Map<string, string>();
  if (journeyIds.length > 0) {
    const aRows = await cypher(
      base,
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney) WHERE j.id IN $journeyIds RETURN a.id AS id, a.attributes_json AS a`,
      { journeyIds },
    );
    for (const r of aRows) {
      const k = attrsSeedKey(r.a);
      if (k) activities.set(k, String(r.id));
    }
  }

  // Sales-specific systems by fixture seedKey.
  const systems = new Map<string, string>();
  for (const key of SYSTEM_KEYS) {
    const rows = await cypher(base, `MATCH (s:System) WHERE s.attributes_json CONTAINS $needle RETURN s.id AS id LIMIT 1`, {
      needle: `"seedKey":"${key}"`,
    });
    if (rows.length > 0) systems.set(key, String(rows[0]!.id));
  }

  // Sales-specific roles by fixture seedKey.
  const roles = new Map<string, string>();
  for (const key of ROLE_KEYS) {
    const rows = await cypher(base, `MATCH (r:Role) WHERE r.attributes_json CONTAINS $needle RETURN r.id AS id LIMIT 1`, {
      needle: `"seedKey":"${key}"`,
    });
    if (rows.length > 0) roles.set(key, String(rows[0]!.id));
  }

  // Shared operator systems (CRM, MOMS) by top-level operatorSeedKey.
  const sharedSystems = new Map<string, string>();
  const sharedRows = await cypher(base, `MATCH (s:System) WHERE s.operatorSeedKey IN ["crm","moms"] RETURN s.operatorSeedKey AS k, s.id AS id`);
  for (const r of sharedRows) sharedSystems.set(String(r.k), String(r.id));
  if (!sharedSystems.has("crm")) throw new Error("unresolved foundation/library id: CRM system (operatorSeedKey=crm)");
  if (!sharedSystems.has("moms")) throw new Error("unresolved foundation/library id: MOMS system (operatorSeedKey=moms)");

  // Shared sales_lead role by top-level operatorSeedKey.
  const salesLeadRows = await cypher(base, `MATCH (r:Role {operatorSeedKey:"sales_lead"}) RETURN r.id AS id LIMIT 1`);
  if (salesLeadRows.length === 0) throw new Error("unresolved foundation/library id: sales_lead role (operatorSeedKey=sales_lead)");
  const salesLeadRoleId = String(salesLeadRows[0]!.id);

  // Fixture KPIs (FR-05a) by seedKey. FR-05b KPIs are resolver-created later.
  const kpis = new Map<string, string>();
  for (const key of KPI_FIXTURE_KEYS) {
    const rows = await cypher(base, `MATCH (k:KPI) WHERE k.attributes_json CONTAINS $needle RETURN k.id AS id LIMIT 1`, {
      needle: `"seedKey":"${key}"`,
    });
    if (rows.length > 0) kpis.set(key, String(rows[0]!.id));
  }

  // Required metrics (fail loud if absent) + optional FR-05b metrics (detect).
  const metrics = new Map<string, string>();
  for (const mid of [...REQUIRED_METRICS, ...OPTIONAL_METRICS]) {
    const id = await resolveMetricId(base, mid);
    if (id) metrics.set(mid, id);
  }
  for (const mid of REQUIRED_METRICS) {
    if (!metrics.has(mid)) throw new Error(`unresolved foundation/library id: ${mid} (run \`bun run seed:saas-metric-library\` first)`);
  }

  // Funnel subsystem must be EXECUTED (B-01, §4.4 step 3/4) — fail loud before
  // any write if absent (this is the execution-ordering gate, not a design defect).
  const funnel = await funnelSubsystemPresent(base);
  if (!funnel.label) throw new Error("funnel-pipeline-modeling not executed: Funnel label unregistered");
  if (!funnel.route) throw new Error("funnel-pipeline-modeling not executed: POST /api/v1/funnels/transitions absent");

  return { rootId, domainId, journeys, activities, systems, sharedSystems, roles, salesLeadRoleId, kpis, metrics };
}

// MetricDefinition node id from stable id or attributes.seedKey.
async function resolveMetricId(base: string, metricId: string): Promise<string | undefined> {
  const rows = await cypher(
    base,
    `MATCH (m:MetricDefinition) WHERE m.id=$id OR m.attributes_json CONTAINS $needle RETURN m.id AS id LIMIT 1`,
    { id: metricId, needle: `"seedKey":"${metricId}"` },
  );
  return rows.length > 0 ? String(rows[0]!.id) : undefined;
}

// ---------------------------------------------------------------------------
// T-03 — cross-reference edges (PART_OF→domain, EXECUTES(sales_lead),
// USES_SYSTEM→CRM/MOMS). All via POST /api/v1/edges; check-before-POST (§4.11).
// ---------------------------------------------------------------------------

async function edgeExists(base: string, type: string, fromId: string, toId: string): Promise<boolean> {
  const rows = await cypher(
    base,
    `MATCH ({id:$fromId})-[r:${type}]->({id:$toId}) RETURN count(r) AS n`,
    { fromId, toId },
  );
  return count(rows) > 0;
}

async function createEdge(base: string, type: string, fromId: string, toId: string): Promise<boolean> {
  if (await edgeExists(base, type, fromId, toId)) return false;
  const res = await postJson(base, "/api/v1/edges", { type, fromId, toId });
  if (res.status !== 201) throw new Error(`seed:sales: POST ${type} edge → ${res.status} ${JSON.stringify(res.body)}`);
  return true;
}

async function crossRefEdges(base: string, ids: SalesIds): Promise<number> {
  let created = 0;

  // PART_OF UserJourney→Sales Domain (FR-01).
  for (const journeyId of ids.journeys.values()) {
    if (await createEdge(base, "PART_OF", journeyId, ids.domainId)) created++;
  }

  // EXECUTES shared sales_lead→Activity (FR-03) for the provisioning steps
  // (which carry no fixture EXECUTES).
  for (const key of ["provision-tenant", "handoff-cs"]) {
    const activityId = ids.activities.get(key);
    if (!activityId) throw new Error(`seed:sales: activity ${key} unresolved for sales_lead EXECUTES`);
    if (await createEdge(base, "EXECUTES", ids.salesLeadRoleId, activityId)) created++;
  }

  // USES_SYSTEM Activity→CRM (CRM-operating activities) and →MOMS (provisioning).
  const crmActivities = ["qualify-lead", "build-quote", "close-won"];
  for (const key of crmActivities) {
    const activityId = ids.activities.get(key);
    if (!activityId) throw new Error(`seed:sales: activity ${key} unresolved for CRM USES_SYSTEM`);
    if (await createEdge(base, "USES_SYSTEM", activityId, ids.sharedSystems.get("crm")!)) created++;
  }
  const provisionId = ids.activities.get("provision-tenant");
  if (!provisionId) throw new Error("seed:sales: activity provision-tenant unresolved for MOMS USES_SYSTEM");
  if (await createEdge(base, "USES_SYSTEM", provisionId, ids.sharedSystems.get("moms")!)) created++;

  return created;
}

// ---------------------------------------------------------------------------
// T-04 — KPI links: MEASURES (via linkKpiToMetric) + FR-05b conditional KPIs +
// ALIGNED_TO (via kpi-alignments). (§4.5, §4.7, D-1.)
// ---------------------------------------------------------------------------

async function findKpiIdByName(base: string, name: string, rootId: string): Promise<string | undefined> {
  // Natural-key by KPI.name scoped to the operator root via an ALIGNED_TO or
  // MEASURES reach; simplest stable natural key is name (KPI names are unique
  // per function here). A re-run finds the resolver-created KPI and skips.
  const rows = await cypher(base, `MATCH (k:KPI {name:$name}) RETURN k.id AS id LIMIT 1`, { name });
  return rows.length > 0 ? String(rows[0]!.id) : undefined;
}

async function measuresExists(base: string, kpiId: string): Promise<boolean> {
  const rows = await cypher(base, `MATCH (:KPI {id:$kpiId})-[m:MEASURES]->() RETURN count(m) AS n`, { kpiId });
  return count(rows) > 0;
}

async function kpiLinks(base: string, ids: SalesIds): Promise<{ measures: number; alignments: number; created: number }> {
  let measures = 0;
  let alignments = 0;
  let created = 0;

  for (const row of KPIS) {
    kpiRowSchema.parse({ seedKey: row.seedKey, name: row.name, metricId: row.metricId, fixture: row.fixture });

    let kpiId: string | undefined;
    if (row.fixture) {
      // FR-05a — the KPI is a fixture row already loaded; resolved in resolve().
      kpiId = ids.kpis.get(row.seedKey);
      if (!kpiId) throw new Error(`seed:sales: fixture KPI ${row.seedKey} not found in graph`);
    } else {
      // FR-05b — create-and-ground atomically, ONLY if its metric exists (§4.5).
      const metricNodeId = ids.metrics.get(row.metricId);
      if (!metricNodeId) continue; // metric absent → KPI not created at all (AC-05a)
      kpiId = await findKpiIdByName(base, row.name, ids.rootId);
      if (!kpiId) {
        const res = await postJson(base, "/api/v1/kpis", {
          name: row.name,
          category: row.create!.category,
          unit: row.create!.unit,
          target_value: row.create!.target_value,
          target_direction: row.create!.target_direction,
          measurement_frequency: row.create!.measurement_frequency,
          description: row.create!.description,
        });
        if (res.status !== 200) throw new Error(`seed:sales: POST /api/v1/kpis (${row.name}) → ${res.status} ${JSON.stringify(res.body)}`);
        kpiId = String((res.body as { id: string }).id);
        created++;
      }
      ids.kpis.set(row.seedKey, kpiId);
    }

    // MEASURES via linkKpiToMetric (the sole sanctioned path). Treat
    // "already linked" as satisfied (idempotent, §4.11).
    const metricNodeId = ids.metrics.get(row.metricId);
    if (metricNodeId && !(await measuresExists(base, kpiId))) {
      try {
        await linkKpiToMetric(base, kpiId, metricNodeId);
        measures++;
      } catch (e) {
        if (!(e instanceof KpiMetricAlreadyLinkedError)) throw e;
      }
    }

    // ALIGNED_TO — every target via POST /api/v1/kpi-alignments (D-1, Rule C).
    for (const align of row.alignments) {
      let targetId: string | undefined;
      let targetLabel: string;
      if (align.target_type === "domain") {
        targetId = ids.domainId;
        targetLabel = "Domain";
      } else if (align.target_type === "journey") {
        targetId = ids.journeys.get(align.journeySeedKey!);
        targetLabel = "UserJourney";
      } else {
        targetId = ids.activities.get(align.activitySeedKey!);
        targetLabel = "Activity";
      }
      if (!targetId) throw new Error(`seed:sales: alignment target unresolved for KPI ${row.seedKey}`);

      const existing = await cypher(
        base,
        `MATCH (:KPI {id:$kid})-[r:ALIGNED_TO]->(:${targetLabel} {id:$tid}) RETURN count(r) AS n`,
        { kid: kpiId, tid: targetId },
      );
      if (count(existing) === 0) {
        const res = await postJson(base, "/api/v1/kpi-alignments", {
          kpi_id: kpiId,
          target_type: align.target_type,
          target_id: targetId,
          weight: align.weight,
          attribution_type: align.attribution_type,
        });
        if (res.status !== 200) throw new Error(`seed:sales: POST /api/v1/kpi-alignments (${row.name}) → ${res.status} ${JSON.stringify(res.body)}`);
        alignments++;
      }
    }
  }

  return { measures, alignments, created };
}

// ---------------------------------------------------------------------------
// T-06 — Sales Pipeline Funnel (Funnel/Stage/HAS_STAGE + CONVERTS_TO). (§4.6.)
// Precondition asserted in resolve() (B-01); this step never half-writes.
// ---------------------------------------------------------------------------

async function funnel(base: string, ids: SalesIds): Promise<number> {
  let created = 0;

  // Funnel (resolve-or-create by name + modelId anchor — Rule D).
  const funnelRows = await cypher(
    base,
    `MATCH (f:Funnel {name:"Sales Pipeline"}) WHERE f.attributes_json CONTAINS $rootMarker RETURN f.id AS id LIMIT 1`,
    { rootMarker: `"modelId":"${ids.rootId}"` },
  );
  let funnelId: string;
  if (funnelRows.length > 0) {
    funnelId = String(funnelRows[0]!.id);
  } else {
    const res = await postJson(base, "/api/v1/nodes/Funnel", {
      name: "Sales Pipeline",
      description: "Sales pipeline funnel: Lead → Qualified → Demo → Proposal → Negotiation → Closed-Won.",
      attributes: { modelId: ids.rootId, funnelKey: FUNNEL_KEY },
    });
    if (res.status !== 201 && res.status !== 200) throw new Error(`seed:sales: POST /api/v1/nodes/Funnel → ${res.status} ${JSON.stringify(res.body)}`);
    funnelId = String((res.body as { id: string }).id);
    created++;
  }

  // Stages (funnel-scoped existence check by funnelKey + name).
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
        description: `${st.name} stage of the Sales Pipeline funnel.`,
        attributes: { funnelKey: FUNNEL_KEY, stageOrder: st.stageOrder },
      });
      if (res.status !== 201 && res.status !== 200) throw new Error(`seed:sales: POST /api/v1/nodes/Stage (${st.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      stageId = String((res.body as { id: string }).id);
      created++;
    }
    stageIds.set(st.name, stageId);

    // HAS_STAGE (Funnel→Stage) via generic edge route.
    if (await createEdge(base, "HAS_STAGE", funnelId, stageId)) created++;
  }

  // CONVERTS_TO via the range-checked funnel transition route ONLY (D-2).
  for (const t of TRANSITIONS) {
    const fromId = stageIds.get(t.from)!;
    const toId = stageIds.get(t.to)!;
    if (await edgeExists(base, "CONVERTS_TO", fromId, toId)) continue;
    const res = await postJson(base, "/api/v1/funnels/transitions", {
      fromId,
      toId,
      conversionRate: t.conversionRate,
      dropOffRate: t.dropOffRate,
    });
    if (res.status !== 200 && res.status !== 201) throw new Error(`seed:sales: POST /api/v1/funnels/transitions (${t.from}→${t.to}) → ${res.status} ${JSON.stringify(res.body)}`);
    created++;
  }

  return created;
}

// ---------------------------------------------------------------------------
// T-07 — Stories + Given/When/Then acceptance criteria (model-scoped routes).
// ---------------------------------------------------------------------------

async function stories(base: string, ids: SalesIds): Promise<number> {
  let created = 0;
  for (const s of STORIES) {
    const activityId = ids.activities.get(s.activitySeedKey);
    if (!activityId) throw new Error(`seed:sales: story activity ${s.activitySeedKey} unresolved`);
    const roleId = s.roleSeedKey ? ids.roles.get(s.roleSeedKey) : undefined;

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
        ...(roleId ? { roleId } : {}),
      });
      if (res.status !== 201) throw new Error(`seed:sales: POST story (${s.action}) → ${res.status} ${JSON.stringify(res.body)}`);
      storyId = String((res.body as { id: string }).id);
      created++;
    }

    // AC — one per story. Idempotency: any AC already on the story.
    const acExisting = await cypher(
      base,
      `MATCH (:UserStory {id:$sid})<-[:ACCEPTANCE_OF]-(ac:AcceptanceCriterion) RETURN count(ac) AS n`,
      { sid: storyId },
    );
    if (count(acExisting) === 0) {
      const res = await postJson(base, `/api/v1/models/${ids.rootId}/stories/${storyId}/acceptance-criteria`, s.ac);
      if (res.status !== 201) throw new Error(`seed:sales: POST AC (${s.action}) → ${res.status} ${JSON.stringify(res.body)}`);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// T-08 — DDD capabilities + NEEDS_CAPABILITY/SUPPORTED_BY (DDD routes).
// ---------------------------------------------------------------------------

async function capabilities(base: string, ids: SalesIds): Promise<number> {
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
      const res = await postJson(base, `/api/v1/models/${ids.rootId}/capabilities`, { name: c.name, description: c.description });
      if (res.status !== 201) throw new Error(`seed:sales: POST capability (${c.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      capId = String((res.body as { id: string }).id);
      created++;
    }

    // NEEDS_CAPABILITY from each Sales activity (PUT is idempotent MERGE).
    for (const actKey of c.neededByActivitySeedKeys) {
      const activityId = ids.activities.get(actKey);
      if (!activityId) continue;
      const res = await putJson(base, `/api/v1/models/${ids.rootId}/capabilities/${capId}/needed-by`, { activityId });
      if (res.status !== 200) throw new Error(`seed:sales: PUT needed-by (${c.name}) → ${res.status} ${JSON.stringify(res.body)}`);
    }

    // SUPPORTED_BY (PUT is idempotent MERGE).
    if (c.supportedBy) {
      const systemId = c.supportedBy.fixtureSystemSeedKey
        ? ids.systems.get(c.supportedBy.fixtureSystemSeedKey)
        : c.supportedBy.sharedSystemKey
          ? ids.sharedSystems.get(c.supportedBy.sharedSystemKey)
          : undefined;
      if (systemId) {
        const res = await putJson(base, `/api/v1/models/${ids.rootId}/capabilities/${capId}/supported-by`, { systemId });
        if (res.status !== 200) throw new Error(`seed:sales: PUT supported-by (${c.name}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// T-09 — Sales risks via the governed risk-register API (seedRisk, dedupe by name).
// ---------------------------------------------------------------------------

async function riskExists(base: string, name: string): Promise<boolean> {
  const res = await fetch(`${base}/api/v1/risk-register?domain=${encodeURIComponent("Sales")}`);
  if (!res.ok) throw new Error(`seed:sales: GET /api/v1/risk-register → ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ name: string }> };
  return (body.data ?? []).some((r) => r.name === name);
}

async function risks(base: string, ids: SalesIds): Promise<number> {
  let created = 0;
  for (const r of RISKS) {
    riskRowSchema.parse({
      name: r.name,
      owner: r.owner,
      domain: r.domain,
      likelihood: r.likelihood,
      impact: r.impact,
      status: r.status,
      trend: r.trend,
      risk_type: r.risk_type,
    });
    if (await riskExists(base, r.name)) continue;

    const linked =
      r.link?.type === "journey"
        ? { linked_entity_type: "journey", linked_entity_id: ids.journeys.get(r.link.journeySeedKey!) }
        : r.link?.type === "domain"
          ? { linked_entity_type: "domain", linked_entity_id: ids.domainId }
          : {};

    const { link: _omit, ...row } = r;
    await seedRisk({ ...row, ...linked } as RiskSeedRow);
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// main() — top-level sequence (§4). Idempotent by lookup.
// ---------------------------------------------------------------------------

export interface SalesSeedResult {
  crossRefEdges: number;
  measures: number;
  alignments: number;
  kpisCreated: number;
  funnel: number;
  stories: number;
  capabilities: number;
  risks: number;
}

export async function seedSales(base?: string): Promise<SalesSeedResult> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;

  const ids = await resolve(apiBase);

  const crossRef = await crossRefEdges(apiBase, ids);
  const kpi = await kpiLinks(apiBase, ids);
  const funnelCreated = await funnel(apiBase, ids);
  const storiesCreated = await stories(apiBase, ids);
  const capsCreated = await capabilities(apiBase, ids);
  const risksCreated = await risks(apiBase, ids);

  return {
    crossRefEdges: crossRef,
    measures: kpi.measures,
    alignments: kpi.alignments,
    kpisCreated: kpi.created,
    funnel: funnelCreated,
    stories: storiesCreated,
    capabilities: capsCreated,
    risks: risksCreated,
  };
}

if (import.meta.main) {
  seedSales()
    .then((r) => {
      console.log(
        `[seed:sales] cross-ref edges: ${r.crossRefEdges}, MEASURES: ${r.measures}, alignments: ${r.alignments}, ` +
          `FR-05b KPIs created: ${r.kpisCreated}, funnel writes: ${r.funnel}, stories: ${r.stories}, ` +
          `capabilities: ${r.capabilities}, risks: ${r.risks}`,
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:sales] failed:", e instanceof Error ? e.message : e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
