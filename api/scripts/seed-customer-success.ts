// customer-success-process-model T-03..T-10 (design §4.1–§4.7, §5.1, §7 —
// FR-05, FR-06, FR-08, FR-09, FR-10, FR-11, FR-12, FR-14, FR-15). The
// `bun run seed:customer-success` CLI entrypoint. Sibling to
// api/scripts/seed-saas-operator.ts and seed-saas-metric-library.ts (neither
// edited — the foundation loader discovers customer-success.json by directory
// scan; XD-04/NFR-03).
//
// Rule A — compose, never fork: every write rides an as-built governed route or
// an imported helper (linkKpiToMetric / seedSla / seedRisk). This script adds NO
// route, NO schema-array entry, NO ontology label/edge, NO RBAC permission
// (NFR-01/NFR-04). Rule B — resolve-then-write: the FIRST action is FR-15's id
// preamble (resolve operator root + CS domain at seed time, never hard-coded).
// Rule C — feature-owned idempotency: every governed create is lookup-before-
// create by a stable natural key, so a full re-run is net-zero (NFR-02).
//
// Phase order (fixed here, Rule B): preamble → import → cross-boundary edges →
// KPIs+MEASURES (+ conditional arm) → stories+ACs → SLAs+alignments → risks →
// DDD.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { linkKpiToMetric, KpiMetricAlreadyLinkedError } from "../src/seed/link-kpi-metric";
import { seedSla, seedRisk, type SlaSeedRow, type RiskSeedRow } from "../src/seed/governed-seed-helper";
import {
  JOURNEY_IDS,
  JOURNEY_TO_DOMAIN_KEYS,
  SHARED_ROLE_EXECUTES,
  SHARED_SYSTEM_USES,
  SHARED_SYSTEM_KEYS,
  SHARED_ROLE_KEYS,
  CS_SYSTEM_IDS,
  CS_KPIS,
  CS_CONDITIONAL_KPIS,
  CS_SLAS,
  CS_RISKS,
  CS_STORIES,
  CS_CAPABILITIES,
  type CsKpiRow,
  type CsStoryRow,
} from "../src/seed/customer-success-catalog";

// ---------------------------------------------------------------------------
// Cypher read helper (POST /api/v1/query/cypher, query:read).
// ---------------------------------------------------------------------------

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
    throw new Error(`seed:customer-success: query/cypher → ${res.status} ${detail}`);
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

function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

// ---------------------------------------------------------------------------
// §4.1 step 1+2 — resolve handles (FR-15). Fail loudly on any missing
// precondition (the foundation / metric-library seed must run first).
// ---------------------------------------------------------------------------

export interface Handles {
  modelId: string;
  domainId: string;
  sharedSystemIds: Record<string, string>; // seedKey → id
  sharedRoleIds: Record<string, string>; // seedKey → id
  metricIds: Record<string, string>; // seedKey → id (all present metrics)
}

async function resolveHandles(baseUrl: string): Promise<Handles> {
  // 1. Operator root — name + attributes.saasOperatorRoot:true (never hard-coded).
  const rootRes = await cypher(
    baseUrl,
    `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`,
  );
  const rootRow = rootRes.rows.find((r) => parseAttrs(r.a).saasOperatorRoot === true);
  if (!rootRow || typeof rootRow.id !== "string") {
    throw new Error(
      "seed:customer-success: SaaS Operator root not found — run `bun run seed:saas-operator` first.",
    );
  }
  const modelId = rootRow.id;

  // 2. CS domain — IN_MODEL the root, attributes.seedKey:"customer_success".
  const domRes = await cypher(
    baseUrl,
    `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$modelId}) RETURN d.id AS id, d.attributes_json AS a`,
    { modelId },
  );
  const domRow = domRes.rows.find((r) => parseAttrs(r.a).seedKey === "customer_success");
  if (!domRow || typeof domRow.id !== "string") {
    throw new Error(
      "seed:customer-success: Customer Success domain (seedKey customer_success) not found — run `bun run seed:saas-operator` first.",
    );
  }
  const domainId = domRow.id;

  // 3. Shared systems by operatorSeedKey (foundation FR-04).
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
        `seed:customer-success: shared system "${key}" not found — run \`bun run seed:saas-operator\` first.`,
      );
    }
  }

  // 4. Shared roles by operatorSeedKey (foundation FR-05).
  const roleRes = await cypher(
    baseUrl,
    `MATCH (r:Role) WHERE r.operatorSeedKey IN $keys RETURN r.operatorSeedKey AS k, r.id AS id`,
    { keys: [...SHARED_ROLE_KEYS] },
  );
  const sharedRoleIds: Record<string, string> = {};
  for (const r of roleRes.rows) {
    if (typeof r.k === "string" && typeof r.id === "string") sharedRoleIds[r.k] = r.id;
  }
  for (const key of SHARED_ROLE_KEYS) {
    if (!sharedRoleIds[key]) {
      throw new Error(
        `seed:customer-success: shared role "${key}" not found — run \`bun run seed:saas-operator\` first.`,
      );
    }
  }

  // 5. Metrics by seedKey (all present ones — the conditional arm reads this).
  const metRes = await cypher(
    baseUrl,
    `MATCH (m:MetricDefinition) RETURN m.id AS id, m.attributes_json AS a`,
  );
  const metricIds: Record<string, string> = {};
  for (const r of metRes.rows) {
    const key = parseAttrs(r.a).seedKey;
    if (typeof key === "string" && typeof r.id === "string") metricIds[key] = r.id;
  }

  return { modelId, domainId, sharedSystemIds, sharedRoleIds, metricIds };
}

// ---------------------------------------------------------------------------
// §4.1 step 3 — import the process fixture (realImport, MERGE-on-id). A non-2xx
// or any row error means a malformed fixture — surface + fail (AC-12).
// ---------------------------------------------------------------------------

export function readCustomerSuccessFixture(): { nodes: unknown[]; edges: unknown[] } {
  const path = resolve(
    import.meta.dir,
    "../../shared/seed/saas-operator/customer-success.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as { nodes: unknown[]; edges: unknown[] };
}

async function loadFixture(baseUrl: string): Promise<void> {
  const fixture = readCustomerSuccessFixture();
  const res = await fetch(`${baseUrl}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixture),
  });
  const json = (await res.json()) as { errors?: unknown[] };
  if (!res.ok) {
    throw new Error(
      `seed:customer-success: POST /api/v1/import → ${res.status} ${JSON.stringify(json)}`,
    );
  }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(
      `seed:customer-success: fixture import reported row errors: ${JSON.stringify(json.errors)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// §4.2a — cross-boundary edges (lookup-before-create by (type,fromId,toId), no
// fixed edge id → avoids the cross-type-uniqueness 409). journey→domain PART_OF,
// shared-role→activity EXECUTES, activity→shared-system USES_SYSTEM.
// ---------------------------------------------------------------------------

async function ensureEdge(
  baseUrl: string,
  edge: { type: string; fromId: string; toId: string },
): Promise<void> {
  const pre = await cypher(
    baseUrl,
    `MATCH (a {id:$fromId})-[r:${edge.type}]->(b {id:$toId}) RETURN count(r) AS n`,
    { fromId: edge.fromId, toId: edge.toId },
  );
  if (toCount(pre.rows[0]?.n) > 0) return;
  const res = await fetch(`${baseUrl}/api/v1/edges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: edge.type, fromId: edge.fromId, toId: edge.toId }),
  });
  if (res.status !== 201) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `seed:customer-success: POST /api/v1/edges (${edge.type}) → ${res.status} ${detail}`,
    );
  }
}

async function seedCrossBoundaryEdges(baseUrl: string, handles: Handles): Promise<void> {
  // journey → CS domain PART_OF ×5.
  for (const key of JOURNEY_TO_DOMAIN_KEYS) {
    await ensureEdge(baseUrl, {
      type: "PART_OF",
      fromId: JOURNEY_IDS[key],
      toId: handles.domainId,
    });
  }
  // shared-role → activity EXECUTES (AC-03: shared roles referenced).
  for (const { roleKey, activityId } of SHARED_ROLE_EXECUTES) {
    await ensureEdge(baseUrl, {
      type: "EXECUTES",
      fromId: handles.sharedRoleIds[roleKey]!,
      toId: activityId,
    });
  }
  // activity → shared-system USES_SYSTEM (AC-04: shared systems referenced).
  for (const { activityId, systemKey } of SHARED_SYSTEM_USES) {
    await ensureEdge(baseUrl, {
      type: "USES_SYSTEM",
      fromId: activityId,
      toId: handles.sharedSystemIds[systemKey]!,
    });
  }
}

// ---------------------------------------------------------------------------
// §4.3 — KPIs + MEASURES. Guard on (name, domain_id); POST /api/v1/kpis (200);
// link via the sanctioned linkKpiToMetric (C-05, N-02). A metric that is not
// registered → the helper fails loudly (AC-06 precondition, never silent skip).
// ---------------------------------------------------------------------------

async function ensureKpi(baseUrl: string, row: CsKpiRow, domainId: string): Promise<string> {
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
    throw new Error(`seed:customer-success: POST /api/v1/kpis (${row.name}) → ${res.status} ${detail}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

// Link a KPI to its metric via linkKpiToMetric; a KpiMetricAlreadyLinkedError on
// a re-run is idempotent success. `metricId` MUST be resolved by the caller —
// an unresolved metric on the four-metric arm is a hard failure (precondition).
async function linkMeasures(baseUrl: string, kpiId: string, metricId: string): Promise<void> {
  try {
    await linkKpiToMetric(baseUrl, kpiId, metricId);
  } catch (e) {
    if (!(e instanceof KpiMetricAlreadyLinkedError)) throw e;
  }
}

async function seedKpis(baseUrl: string, handles: Handles): Promise<Record<string, string>> {
  const kpiIds: Record<string, string> = {};
  // Four-metric retention arm (unconditional). A missing metric → fail loud.
  for (const row of CS_KPIS) {
    const kpiId = await ensureKpi(baseUrl, row, handles.domainId);
    kpiIds[row.name] = kpiId;
    const metricId = handles.metricIds[row.metricSeedKey];
    if (!metricId) {
      throw new Error(
        `seed:customer-success: retention metric "${row.metricSeedKey}" not found — run \`bun run seed:saas-metric-library\` first (AC-06 precondition).`,
      );
    }
    await linkMeasures(baseUrl, kpiId, metricId);
  }
  return kpiIds;
}

// §4.3 conditional arm (C-02) — per-metric, NOT all-or-nothing. Each of the
// three CS-specific KPIs is authored iff its MetricDefinition (by seedKey)
// exists; else it is skipped and NO ad-hoc MetricDefinition is registered.
async function seedConditionalKpis(baseUrl: string, handles: Handles): Promise<Record<string, string>> {
  const kpiIds: Record<string, string> = {};
  for (const row of CS_CONDITIONAL_KPIS) {
    const metricId = handles.metricIds[row.metricSeedKey];
    if (!metricId) continue; // per-metric skip — the metric is absent (OQ-1 deferred arm).
    const kpiId = await ensureKpi(baseUrl, row, handles.domainId);
    kpiIds[row.name] = kpiId;
    await linkMeasures(baseUrl, kpiId, metricId);
  }
  return kpiIds;
}

// ---------------------------------------------------------------------------
// §4.5 — stories + ACs. Guard on (persona, action, benefit) per
// DESCRIBES_ACTIVITY activity (N-03: no `title` field). ≥1 Given/When/Then each.
// ---------------------------------------------------------------------------

interface StoryListRow {
  id: string;
  persona: string | null;
  action: string | null;
  benefit: string | null;
  activityId: string | null;
}
interface AcListRow {
  id: string;
  given: string;
  when: string;
  then: string;
}

async function seedStories(baseUrl: string, modelId: string): Promise<string[]> {
  const listRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/stories`);
  if (!listRes.ok) {
    throw new Error(`seed:customer-success: GET .../stories → ${listRes.status}`);
  }
  const existing = (await listRes.json()) as StoryListRow[];
  const storyKey = (row: Pick<CsStoryRow, "persona" | "action" | "benefit" | "activityId">) =>
    `${row.persona}||${row.action}||${row.benefit}||${row.activityId}`;
  const byKey = new Map<string, string>();
  for (const s of existing) {
    byKey.set(
      `${s.persona ?? ""}||${s.action ?? ""}||${s.benefit ?? ""}||${s.activityId ?? ""}`,
      s.id,
    );
  }

  const storyIds: string[] = [];
  for (const row of CS_STORIES) {
    let storyId = byKey.get(storyKey(row));
    if (!storyId) {
      const res = await fetch(`${baseUrl}/api/v1/models/${modelId}/stories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona: row.persona,
          action: row.action,
          benefit: row.benefit,
          activityId: row.activityId,
          roleId: row.roleId,
        }),
      });
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `seed:customer-success: POST .../stories (${row.persona}) → ${res.status} ${detail}`,
        );
      }
      const created = (await res.json()) as { id: string };
      storyId = created.id;
    }
    storyIds.push(storyId);

    // ACs — lookup-before-create by (given, when, then).
    const acListRes = await fetch(
      `${baseUrl}/api/v1/models/${modelId}/stories/${storyId}/acceptance-criteria`,
    );
    if (!acListRes.ok) {
      throw new Error(`seed:customer-success: GET .../acceptance-criteria → ${acListRes.status}`);
    }
    const acExisting = (await acListRes.json()) as AcListRow[];
    const acSeen = new Set(acExisting.map((a) => `${a.given}||${a.when}||${a.then}`));
    for (const ac of row.acs) {
      if (acSeen.has(`${ac.given}||${ac.when}||${ac.then}`)) continue;
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
        throw new Error(`seed:customer-success: POST .../acceptance-criteria → ${res.status} ${detail}`);
      }
    }
  }
  return storyIds;
}

// ---------------------------------------------------------------------------
// §4.4 — SLAs (via seedSla) + alignments. Guard by name (GET /api/v1/slas has no
// name filter — N-01, filter client-side). Align to the Support Ticketing
// journey (FR-10 `should`).
// ---------------------------------------------------------------------------

async function seedSlas(baseUrl: string, domainId: string): Promise<string[]> {
  const listRes = await fetch(`${baseUrl}/api/v1/slas`);
  if (!listRes.ok) {
    throw new Error(`seed:customer-success: GET /api/v1/slas → ${listRes.status}`);
  }
  const listBody = (await listRes.json()) as { rows?: Array<{ id?: string; name?: string }> };
  const byName = new Map<string, string>();
  for (const r of listBody.rows ?? []) {
    if (typeof r.name === "string" && typeof r.id === "string") byName.set(r.name, r.id);
  }

  const ids: string[] = [];
  for (const row of CS_SLAS) {
    const existing = byName.get(row.name);
    if (existing) {
      ids.push(existing);
      continue;
    }
    const slaRow: SlaSeedRow = { ...row, domain_id: domainId };
    const id = await seedSla(slaRow);
    ids.push(id);
  }
  return ids;
}

// §4.4b — align each SLA to the Support Ticketing journey (target_type journey).
async function seedSlaAlignments(baseUrl: string, slaIds: string[]): Promise<void> {
  for (const slaId of slaIds) {
    const pre = await cypher(
      baseUrl,
      `MATCH (s:SLA {id:$slaId})-[r:ALIGNED_TO]->(t {id:$targetId}) RETURN count(r) AS n`,
      { slaId, targetId: JOURNEY_IDS.supportTicketing },
    );
    if (toCount(pre.rows[0]?.n) > 0) continue;
    const res = await fetch(`${baseUrl}/api/v1/sla-alignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sla_id: slaId,
        target_type: "journey",
        target_id: JOURNEY_IDS.supportTicketing,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`seed:customer-success: POST /api/v1/sla-alignments → ${res.status} ${detail}`);
    }
  }
}

// ---------------------------------------------------------------------------
// §4.6 — risks (via seedRisk). Guard by (name, domain): list by domain (the
// route DOES filter by domain — N-01) then match name client-side.
// ---------------------------------------------------------------------------

interface RiskRecord {
  id?: string;
  name?: string;
}

async function seedRisks(baseUrl: string): Promise<string[]> {
  const listRes = await fetch(
    `${baseUrl}/api/v1/risk-register?domain=${encodeURIComponent("Customer Success")}`,
  );
  if (!listRes.ok) {
    throw new Error(`seed:customer-success: GET /api/v1/risk-register → ${listRes.status}`);
  }
  const listBody = (await listRes.json()) as { data?: RiskRecord[] };
  const byName = new Map<string, string>();
  for (const r of listBody.data ?? []) {
    if (typeof r.name === "string" && typeof r.id === "string") byName.set(r.name, r.id);
  }

  const ids: string[] = [];
  for (const row of CS_RISKS) {
    const existing = byName.get(row.name);
    if (existing) {
      ids.push(existing);
      continue;
    }
    const riskRow: RiskSeedRow = {
      name: row.name,
      owner: row.owner,
      domain: row.domain,
      likelihood: row.likelihood,
      impact: row.impact,
      status: row.status,
      trend: row.trend,
      risk_type: row.risk_type,
      description: row.description,
      mitigation_plan: row.mitigation_plan,
    };
    const body = {
      ...riskRow,
      linked_entity_type: "journey",
      linked_entity_id: JOURNEY_IDS[row.linkedJourney],
    };
    const res = await fetch(`${baseUrl}/api/v1/risk-register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `seed:customer-success: POST /api/v1/risk-register (${row.name}) → ${res.status} ${detail}`,
      );
    }
    const created = (await res.json()) as { id: string };
    ids.push(created.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// §4.7 — DDD capabilities. Guard by name on the model's capabilities. Wire
// needed-by (CS activity) + supported-by (CS/shared system) + context
// (best-effort, only if a BoundedContext exists — OQ-6).
// ---------------------------------------------------------------------------

interface CapabilityListRow {
  id: string;
  name: string;
}
interface CapabilityDetail {
  id: string;
  supportedBy?: Array<{ id: string }>;
  neededBy?: Array<{ id: string }>;
  assignedContextId?: string | null;
}

function resolveSystemId(key: string, handles: Handles): string {
  if (key in CS_SYSTEM_IDS) {
    return CS_SYSTEM_IDS[key as keyof typeof CS_SYSTEM_IDS];
  }
  const shared = handles.sharedSystemIds[key];
  if (!shared) throw new Error(`seed:customer-success: unknown supportedBy system key "${key}"`);
  return shared;
}

async function seedCapabilities(baseUrl: string, handles: Handles): Promise<string[]> {
  const modelId = handles.modelId;
  const listRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/capabilities`);
  if (!listRes.ok) {
    throw new Error(`seed:customer-success: GET .../capabilities → ${listRes.status}`);
  }
  const existing = (await listRes.json()) as CapabilityListRow[];
  const byName = new Map<string, string>();
  for (const c of existing) byName.set(c.name, c.id);

  // Best-effort ASSIGNED_TO_CONTEXT (OQ-6) — read available contexts; no
  // BoundedContext is created.
  const ctxRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/system-model/context-map`);
  let boundedContextId: string | undefined;
  if (ctxRes.ok) {
    const ctxBody = (await ctxRes.json()) as { contexts?: Array<{ id: string; name: string }> };
    const contexts = ctxBody.contexts ?? [];
    const hinted = contexts.find((c) => /success|customer|support|renew|health/i.test(c.name));
    boundedContextId = (hinted ?? contexts[0])?.id;
  }

  const capIds: string[] = [];
  for (const row of CS_CAPABILITIES) {
    let capId = byName.get(row.name);
    if (!capId) {
      const res = await fetch(`${baseUrl}/api/v1/models/${modelId}/capabilities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: row.name, description: row.description }),
      });
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(`seed:customer-success: POST .../capabilities (${row.name}) → ${res.status} ${detail}`);
      }
      const created = (await res.json()) as { id: string };
      capId = created.id;
    }
    capIds.push(capId);

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
        throw new Error(`seed:customer-success: PUT .../supported-by → ${res.status} ${detailTxt}`);
      }
    }

    // NEEDS_CAPABILITY (exactly one of activityId|storyId — use activityId).
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
        throw new Error(`seed:customer-success: PUT .../needed-by → ${res.status} ${detailTxt}`);
      }
    }

    // ASSIGNED_TO_CONTEXT — best-effort (OQ-6). setContext REPLACEs; guard on current.
    if (boundedContextId && detail.assignedContextId !== boundedContextId) {
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/context`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boundedContextId }),
        },
      );
      if (!res.ok && res.status !== 404) {
        const detailTxt = await res.text().catch(() => "");
        throw new Error(`seed:customer-success: PUT .../context → ${res.status} ${detailTxt}`);
      }
    }
  }
  return capIds;
}

// ---------------------------------------------------------------------------
// Orchestration (§4.1) — the full dependency-ordered content seed.
// ---------------------------------------------------------------------------

export interface CustomerSuccessSeedResult {
  modelId: string;
  domainId: string;
  kpiIds: Record<string, string>;
  conditionalKpiIds: Record<string, string>;
  storyIds: string[];
  slaIds: string[];
  riskIds: string[];
  capabilityIds: string[];
}

export async function seedCustomerSuccessContent(baseUrl: string): Promise<CustomerSuccessSeedResult> {
  const handles = await resolveHandles(baseUrl); // FR-15 preamble — fail loud on missing preconditions.
  await loadFixture(baseUrl); // §4.1 step 3 — MERGE-on-id, idempotent.
  await seedCrossBoundaryEdges(baseUrl, handles); // §4.2a — journey→domain, shared role/system refs.
  const kpiIds = await seedKpis(baseUrl, handles); // §4.3 four-metric arm + MEASURES.
  const conditionalKpiIds = await seedConditionalKpis(baseUrl, handles); // §4.3 conditional arm (per-metric).
  const storyIds = await seedStories(baseUrl, handles.modelId); // §4.5.
  const slaIds = await seedSlas(baseUrl, handles.domainId); // §4.4a.
  await seedSlaAlignments(baseUrl, slaIds); // §4.4b (FR-10 should).
  const riskIds = await seedRisks(baseUrl); // §4.6.
  const capabilityIds = await seedCapabilities(baseUrl, handles); // §4.7.

  return {
    modelId: handles.modelId,
    domainId: handles.domainId,
    kpiIds,
    conditionalKpiIds,
    storyIds,
    slaIds,
    riskIds,
    capabilityIds,
  };
}

export async function seedCustomerSuccess(base?: string): Promise<CustomerSuccessSeedResult> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;
  return seedCustomerSuccessContent(apiBase);
}

if (import.meta.main) {
  seedCustomerSuccess()
    .then((r) => {
      console.log(
        `[seed:customer-success] domain: ${r.domainId}; KPIs ${Object.keys(r.kpiIds).length} ` +
          `(+${Object.keys(r.conditionalKpiIds).length} conditional), stories ${r.storyIds.length}, ` +
          `SLAs ${r.slaIds.length}, risks ${r.riskIds.length}, capabilities ${r.capabilityIds.length}`,
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:customer-success] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
