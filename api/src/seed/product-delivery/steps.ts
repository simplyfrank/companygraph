// product-delivery-process-model T-03..T-08 (design §5.2–§5.7) — the
// governed-route write helpers. Every write rides an AS-BUILT sanctioned route
// over the loopback API; this module adds NO route, NO schema entry, NO ontology
// label/edge (Rule A). Every governed write is lookup-before-create by a stable
// key so a re-run is net-zero (Rule C / NFR-02). The authoritative validation is
// each route's own re-parse at the REST boundary; the internal roster shapes
// (rosters.ts) only guard this seed's own inputs.
//
// C-06 pin: every edge pre-check uses a LITERAL relationship type, one query per
// type — Neo4j rejects a parameterized `[r:$type]` in a MATCH pattern (no APOC).

import {
  ROLE_ROWS,
  SYSTEM_ROWS,
  KPI_ROWS,
  STORY_ROWS,
  CAPABILITY_ROWS,
  RISK_ROWS,
  BOUNDED_CONTEXT,
  SEED_KEYS,
  type KpiRow,
} from "./rosters";
import { PRODUCT_KPI_METRIC_MAP } from "./kpi-metric-map";
import { cypher, toCount, type Context } from "./context";
import {
  linkKpiToMetric,
  KpiMetricAlreadyLinkedError,
} from "../link-kpi-metric";

// ---------------------------------------------------------------------------
// ensureEdge — lookup-before-create by (type,fromId,toId) via POST
// /api/v1/edges. NO fixed edge id (avoids the cross-type uniqueness 409); the
// literal-type cypher pre-check guarantees zero duplicate parallel edges on a
// re-run (C-01/C-06). One helper per edge type because the type is a literal.
// ---------------------------------------------------------------------------

async function edgeExists(
  baseUrl: string,
  type: string,
  fromId: string,
  toId: string,
): Promise<boolean> {
  // C-06: literal relationship type interpolated into the pattern (validated by
  // the closed set of callers below — never user input).
  const pre = await cypher(
    baseUrl,
    `MATCH (a {id:$fromId})-[r:${type}]->(b {id:$toId}) RETURN count(r) AS n`,
    { fromId, toId },
  );
  return toCount(pre.rows[0]?.n) > 0;
}

async function postEdge(
  baseUrl: string,
  type: string,
  fromId: string,
  toId: string,
): Promise<void> {
  if (await edgeExists(baseUrl, type, fromId, toId)) return; // idempotent skip
  const res = await fetch(`${baseUrl}/api/v1/edges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, fromId, toId }),
  });
  if (res.status !== 201) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `product-delivery: POST /api/v1/edges (${type}) → ${res.status} ${detail}`,
    );
  }
}

function fx(context: Context, seedKey: string): string {
  const id = context.fixtureNodeIds[seedKey];
  if (!id) throw new Error(`product-delivery: fixture node "${seedKey}" unresolved`);
  return id;
}

// ---------------------------------------------------------------------------
// T-03 — cross-reference edges (§5.7 step 3) + the resolve-or-create role.
// ---------------------------------------------------------------------------

// Create/resolve any `resolve-or-create` role (SWE) by name, then write its
// EXECUTES edges. Slice-local roles + their EXECUTES edges are already in the
// fixture; shared roles (if any executed an activity) are resolved from
// context.roleIds. Returns name → id for all roles referenced by the slice.
export async function writeRolesAndExecutes(
  baseUrl: string,
  context: Context,
): Promise<Record<string, string>> {
  const roleIdByName: Record<string, string> = { ...context.roleIds };

  for (const role of ROLE_ROWS) {
    if (role.origin === "slice-local") {
      // Already a fixture node (resolved by seedKey); record by name too.
      const id = fx(context, role.seedKey);
      roleIdByName[role.name] = id;
      continue;
    }
    // resolve-or-create: reuse a shared/existing :Role by name, else create it.
    let id = roleIdByName[role.name];
    if (!id) {
      const found = await cypher(
        baseUrl,
        `MATCH (r:Role {name:$name}) RETURN r.id AS id LIMIT 1`,
        { name: role.name },
      );
      const existing = found.rows[0]?.id;
      if (typeof existing === "string") {
        id = existing;
      } else {
        const res = await fetch(`${baseUrl}/api/v1/nodes/Role`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: role.name,
            description: role.description,
            attributes: { seedKey: role.seedKey },
          }),
        });
        if (res.status !== 201) {
          const detail = await res.text().catch(() => "");
          throw new Error(
            `product-delivery: POST /api/v1/nodes/Role (${role.name}) → ${res.status} ${detail}`,
          );
        }
        const created = (await res.json()) as { id: string };
        id = created.id;
      }
      roleIdByName[role.name] = id;
    }
    // EXECUTES edges for the resolve-or-create role (not in the fixture).
    for (const actKey of role.executes) {
      await postEdge(baseUrl, "EXECUTES", id, fx(context, actKey));
    }
  }

  return roleIdByName;
}

// §5.7 step 3 — cross-reference edges pointing at foundation-seeded nodes:
//   UserJourney -[:PART_OF]-> Domain (3)
//   Activity -[:USES_SYSTEM]-> shared System (moms/data_warehouse)
export async function writeCrossRefEdges(
  baseUrl: string,
  context: Context,
): Promise<void> {
  // Journey → Domain PART_OF (3).
  for (const journeyKey of [
    "pd-journey-roadmap",
    "pd-journey-delivery",
    "pd-journey-analytics",
  ]) {
    await postEdge(baseUrl, "PART_OF", fx(context, journeyKey), context.domainId);
  }

  // Activity → shared System USES_SYSTEM.
  for (const sys of SYSTEM_ROWS.filter((s) => s.origin === "shared")) {
    const systemId = context.systemIds[sys.seedKey];
    if (!systemId) {
      throw new Error(`product-delivery: shared system "${sys.seedKey}" unresolved`);
    }
    for (const actKey of sys.usedBy) {
      await postEdge(baseUrl, "USES_SYSTEM", fx(context, actKey), systemId);
    }
  }
}

// ---------------------------------------------------------------------------
// T-04/T-05 — KPIs (§5.2) + MEASURES (§5.3) + ALIGNED_TO (§5.3).
// ---------------------------------------------------------------------------

async function ensureKpi(
  baseUrl: string,
  row: KpiRow,
  domainId: string,
): Promise<string> {
  const found = await cypher(
    baseUrl,
    `MATCH (k:KPI {name:$name}) WHERE k.domain_id=$domainId RETURN k.id AS id LIMIT 1`,
    { name: row.name, domainId },
  );
  const existingId = found.rows[0]?.id;
  if (typeof existingId === "string") return existingId;

  const body = {
    name: row.name,
    category: row.category,
    unit: row.unit,
    target_value: row.target_value,
    target_direction: row.target_direction, // N-05: up/down
    measurement_frequency: row.measurement_frequency,
    owner_role: row.owner_role,
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
    throw new Error(
      `product-delivery: POST /api/v1/kpis (${row.name}) → ${res.status} ${detail}`,
    );
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

// All four KPIs (XD-10 depth). Returns kpiName → id.
export async function createKpis(
  baseUrl: string,
  context: Context,
): Promise<Record<string, string>> {
  const kpiIds: Record<string, string> = {};
  for (const row of KPI_ROWS) {
    kpiIds[row.name] = await ensureKpi(baseUrl, row, context.domainId);
  }
  return kpiIds;
}

// §5.3 MEASURES — for each declared PRODUCT_KPI_METRIC_MAP entry, resolve the
// metric seedKey → real node id, pre-check the MEASURES edge (literal type,
// C-06), and link via the imported metric-library helper. Today exactly one
// link (Release Frequency → metric-deploy-frequency).
export async function linkKpiMetrics(
  baseUrl: string,
  context: Context,
  kpiIds: Record<string, string>,
): Promise<void> {
  for (const [kpiName, metricSeedKey] of Object.entries(PRODUCT_KPI_METRIC_MAP)) {
    const kpiId = kpiIds[kpiName];
    if (!kpiId) throw new Error(`product-delivery: KPI "${kpiName}" not created`);
    const metricNodeId = context.metricNodeIds[metricSeedKey];
    if (!metricNodeId) {
      throw new Error(`product-delivery: metric "${metricSeedKey}" unresolved`);
    }
    // Pre-check the MEASURES edge (literal type, C-06) — skip if present (C-02).
    const pre = await cypher(
      baseUrl,
      `MATCH (k:KPI {id:$kpiId})-[m:MEASURES]->(d:MetricDefinition {id:$metricNodeId}) RETURN count(m) AS n`,
      { kpiId, metricNodeId },
    );
    if (toCount(pre.rows[0]?.n) > 0) continue;
    try {
      await linkKpiToMetric(baseUrl, kpiId, metricNodeId);
    } catch (e) {
      // A concurrent/pre-existing link is idempotent success.
      if (!(e instanceof KpiMetricAlreadyLinkedError)) throw e;
    }
  }
}

function resolveAlignTarget(
  context: Context,
  t: KpiRow["alignTargets"][number],
): { target_type: "journey" | "activity" | "domain"; target_id: string } {
  if (t.type === "domain") return { target_type: "domain", target_id: context.domainId };
  return { target_type: t.type, target_id: fx(context, t.key) };
}

// §5.3 ALIGNED_TO (D-2/C-03) — governed POST /api/v1/kpi-alignments with
// required weight/attribution_type. Pre-check by (kpiId → targetId).
export async function alignKpis(
  baseUrl: string,
  context: Context,
  kpiIds: Record<string, string>,
): Promise<void> {
  for (const row of KPI_ROWS) {
    const kpiId = kpiIds[row.name];
    if (!kpiId) throw new Error(`product-delivery: KPI "${row.name}" not created`);
    for (const t of row.alignTargets) {
      const target = resolveAlignTarget(context, t);
      const pre = await cypher(
        baseUrl,
        `MATCH (k:KPI {id:$kpiId})-[r:ALIGNED_TO]->(x {id:$targetId}) RETURN count(r) AS n`,
        { kpiId, targetId: target.target_id },
      );
      if (toCount(pre.rows[0]?.n) > 0) continue;
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
          `product-delivery: POST /api/v1/kpi-alignments (${row.name}) → ${res.status} ${detail}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// T-06 — DDD mapping (§5.5): bounded context → capabilities → mapping arms.
// ---------------------------------------------------------------------------

interface CapabilityListRow {
  id: string;
  name: string;
}
interface CapabilityDetail {
  supportedBy?: Array<{ id: string }>;
  neededBy?: Array<{ id: string }>;
  assignedContextId?: string | null;
}

export async function writeDddMapping(
  baseUrl: string,
  context: Context,
): Promise<string[]> {
  const modelId = context.rootId;

  // 1. Bounded context via POST /api/v1/ontology/import Pass 3 (MERGE-on-id).
  const bcId = SEED_KEYS[BOUNDED_CONTEXT.seedKey as keyof typeof SEED_KEYS];
  const bcRes = await fetch(`${baseUrl}/api/v1/ontology/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      boundedContexts: [
        {
          id: bcId,
          name: BOUNDED_CONTEXT.name,
          description: BOUNDED_CONTEXT.description,
          domain: BOUNDED_CONTEXT.domain,
          subdomain: BOUNDED_CONTEXT.subdomain,
          type: BOUNDED_CONTEXT.type,
          // The import Cypher SETs bc.oracle_system / bc.jira_projects
          // unconditionally, so both params must be defined (Neo4j rejects an
          // undefined param). Supply concrete values.
          oracle_system: "",
          jira_projects: [],
        },
      ],
    }),
  });
  if (!bcRes.ok) {
    const detail = await bcRes.text().catch(() => "");
    throw new Error(
      `product-delivery: POST /api/v1/ontology/import (bounded context) → ${bcRes.status} ${detail}`,
    );
  }
  const bcBody = (await bcRes.json()) as { errors?: unknown[] };
  if (Array.isArray(bcBody.errors) && bcBody.errors.length > 0) {
    throw new Error(
      `product-delivery: bounded-context import errors: ${JSON.stringify(bcBody.errors)}`,
    );
  }

  // 2. Capabilities — lookup-before-create by name.
  const listRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/capabilities`);
  if (!listRes.ok) {
    throw new Error(
      `product-delivery: GET .../capabilities → ${listRes.status}`,
    );
  }
  const existing = (await listRes.json()) as CapabilityListRow[];
  const byName = new Map<string, string>();
  for (const c of existing) byName.set(c.name, c.id);

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
        throw new Error(
          `product-delivery: POST .../capabilities (${row.name}) → ${res.status} ${detail}`,
        );
      }
      const created = (await res.json()) as { id: string };
      capId = created.id;
    }
    capIds.push(capId);

    // Read current mappings for idempotency.
    const detailRes = await fetch(
      `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}`,
    );
    const detail = detailRes.ok
      ? ((await detailRes.json()) as CapabilityDetail)
      : {};
    const supportedIds = new Set((detail.supportedBy ?? []).map((s) => s.id));
    const neededIds = new Set((detail.neededBy ?? []).map((n) => n.id));

    // NEEDS_CAPABILITY ← Activity (D-3).
    const activityId = fx(context, row.neededByActivitySeedKey);
    if (!neededIds.has(activityId)) {
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/needed-by`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ activityId }),
        },
      );
      if (!res.ok) {
        const d = await res.text().catch(() => "");
        throw new Error(`product-delivery: PUT .../needed-by → ${res.status} ${d}`);
      }
    }

    // SUPPORTED_BY → System.
    const systemId = fx(context, row.supportedBySystemSeedKey);
    if (!supportedIds.has(systemId)) {
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/supported-by`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ systemId }),
        },
      );
      if (!res.ok) {
        const d = await res.text().catch(() => "");
        throw new Error(`product-delivery: PUT .../supported-by → ${res.status} ${d}`);
      }
    }

    // ASSIGNED_TO_CONTEXT → Product Delivery Context (at-most-one, replaces).
    if (detail.assignedContextId !== bcId) {
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/capabilities/${capId}/context`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boundedContextId: bcId }),
        },
      );
      if (!res.ok) {
        const d = await res.text().catch(() => "");
        throw new Error(`product-delivery: PUT .../context → ${res.status} ${d}`);
      }
    }
  }

  return capIds;
}

// ---------------------------------------------------------------------------
// T-07 — stories + ACs (§5.4) via the governed model-scoped routes.
// ---------------------------------------------------------------------------

interface StoryListRow {
  id: string;
  persona: string | null;
  action: string | null;
  activityId?: string | null;
  sourceActivityId?: string | null;
}
interface AcListRow {
  id: string;
  given: string;
  when: string;
  then: string;
}

export async function writeStories(
  baseUrl: string,
  context: Context,
  roleIdByName: Record<string, string>,
): Promise<string[]> {
  const modelId = context.rootId;
  const listRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/stories`);
  if (!listRes.ok) {
    throw new Error(`product-delivery: GET .../stories → ${listRes.status}`);
  }
  const existing = (await listRes.json()) as StoryListRow[];
  const storyKey = (persona: string, activityId: string | null | undefined) =>
    `${persona}::${activityId ?? ""}`;
  const byKey = new Map<string, string>();
  for (const s of existing) {
    const act = s.sourceActivityId ?? s.activityId ?? null;
    byKey.set(storyKey(s.persona ?? "", act), s.id);
  }

  const storyIds: string[] = [];
  for (const row of STORY_ROWS) {
    const activityId = fx(context, row.activitySeedKey);
    let storyId = byKey.get(storyKey(row.persona, activityId));
    if (!storyId) {
      const body: Record<string, unknown> = {
        persona: row.persona,
        action: row.action,
        benefit: row.benefit,
        activityId,
      };
      if (row.roleName && roleIdByName[row.roleName]) {
        body.roleId = roleIdByName[row.roleName];
      }
      const res = await fetch(`${baseUrl}/api/v1/models/${modelId}/stories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `product-delivery: POST .../stories (${row.persona}) → ${res.status} ${detail}`,
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
        `product-delivery: GET .../acceptance-criteria → ${acListRes.status}`,
      );
    }
    const acExisting = (await acListRes.json()) as AcListRow[];
    const acKey = (g: string, w: string, t: string) => `${g}::${w}::${t}`;
    const acSeen = new Set(
      acExisting.map((a) => acKey(a.given, a.when, a.then)),
    );
    let ordinal = acExisting.length;
    for (const ac of row.acs) {
      if (acSeen.has(acKey(ac.given, ac.when, ac.then))) continue;
      const res = await fetch(
        `${baseUrl}/api/v1/models/${modelId}/stories/${storyId}/acceptance-criteria`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...ac, ordinal: ordinal + 1 }),
        },
      );
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `product-delivery: POST .../acceptance-criteria → ${res.status} ${detail}`,
        );
      }
      ordinal += 1;
    }
  }
  return storyIds;
}

// ---------------------------------------------------------------------------
// T-08 — risks (§5.6) via POST /api/v1/risk-register.
// ---------------------------------------------------------------------------

interface RiskRecord {
  id?: string;
  name?: string;
}

export async function writeRisks(
  baseUrl: string,
  context: Context,
): Promise<string[]> {
  const listRes = await fetch(
    `${baseUrl}/api/v1/risk-register?domain=${encodeURIComponent("Product & Delivery")}`,
  );
  if (!listRes.ok) {
    throw new Error(`product-delivery: GET /api/v1/risk-register → ${listRes.status}`);
  }
  const listBody = (await listRes.json()) as { data?: RiskRecord[] };
  const byName = new Map<string, string>();
  for (const r of listBody.data ?? []) {
    if (typeof r.name === "string" && typeof r.id === "string") {
      byName.set(r.name, r.id);
    }
  }

  const ids: string[] = [];
  for (const row of RISK_ROWS) {
    const existing = byName.get(row.name);
    if (existing) {
      ids.push(existing);
      continue;
    }
    // OQ-4 — resolve the linked entity id.
    const linkedId =
      row.linked_entity_type === "domain"
        ? context.domainId
        : fx(context, row.linkedActivitySeedKey!);
    // createRiskSchema is module-private (NFR-04) — hand-constructed literal;
    // the route's own re-parse is the validation contract.
    const body = {
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
      linked_entity_type: row.linked_entity_type,
      linked_entity_id: linkedId,
    };
    const res = await fetch(`${baseUrl}/api/v1/risk-register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `product-delivery: POST /api/v1/risk-register (${row.name}) → ${res.status} ${detail}`,
      );
    }
    const created = (await res.json()) as { id: string };
    ids.push(created.id);
  }
  return ids;
}
