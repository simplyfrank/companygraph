// finance-accounting-process-model T-04 + T-05 + T-06 (design §7; review-design
// C-01/C-02/C-03/C-04/C-05, N-01/N-02/N-03) — the self-owned governed GRAPH
// content script. Runs AFTER `bun run seed:saas-operator` (the process slice
// must be imported first) and AFTER `bun run seed:saas-metric-library` (for
// MEASURES grounding). Every write is a governed REST POST over the loopback
// API; it edits NO owned-elsewhere code — it only IMPORTS the exported typed
// helpers (`ensure*`, `linkKpiToMetric`) and the frozen slice constants
// (finance-ids.ts). NFR-03 / AC-13.
//
// Three sections, in dependency order:
//   T-04  resolve foundation ids + create journey->domain PART_OF,
//         shared-system USES_SYSTEM, shared-role EXECUTES edges (idempotent via
//         the edgeExists guard, C-01).
//   T-05  create the seven finance KPIs + MEASURES grounding + the optional
//         DSO->Dunning ALIGNED_TO enrichment (C-03/C-04/C-05).
//   T-06  create one story per journey + a Given/When/Then AC under the
//         RESOLVED operator root id (N-02/N-03).

import { getDriver, closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { ensureOperatorRoot } from "../src/seed/ensure-operator-root";
import { ensureFunctionDomains } from "../src/seed/ensure-function-domains";
import { ensureSystems, ensureRoles } from "../src/seed/ensure-catalog";
import { linkKpiToMetric, KpiMetricAlreadyLinkedError } from "../src/seed/link-kpi-metric";
import {
  FINANCE_JOURNEYS,
  FINANCE_ACTIVITIES,
  FINANCE_KPIS,
  FINANCE_STORIES,
  FINANCE_SHARED_SYSTEMS,
  REVENUE_OPERATIONS_EXECUTES_ACTIVITY_SEED_KEYS,
  SHARED_REVENUE_OPERATIONS_SEED_KEY,
  DSO_ALIGNED_TO_JOURNEY_SEED_KEY,
  DSO_KPI_NAME,
} from "./finance-ids";

function apiBase(): string {
  const env = loadEnv();
  return `http://${env.host}:${env.apiPort}`;
}

// ---------------------------------------------------------------------------
// Slice-local id resolution — the slice owns these ids (fixture literals from
// finance-ids.ts), so NO cypher/CONTAINS lookup is authored (C-02).
// ---------------------------------------------------------------------------

const activityIdBySeedKey = new Map(FINANCE_ACTIVITIES.map((a) => [a.seedKey, a.id]));

function activityId(seedKey: string): string {
  const id = activityIdBySeedKey.get(seedKey);
  if (!id) throw new Error(`seed-finance-graph: unknown activity seedKey "${seedKey}"`);
  return id;
}

// ---------------------------------------------------------------------------
// Cypher read helper (POST /api/v1/query/cypher) + the shared edgeExists guard
// (C-01) — matches the platform-ops-content precedent exactly.
// ---------------------------------------------------------------------------

interface CypherResponse {
  rows: Array<Record<string, unknown>>;
}

async function cypher(
  base: string,
  statement: string,
  params: Record<string, unknown> = {},
): Promise<CypherResponse> {
  const res = await fetch(`${base}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`seed-finance-graph: query/cypher -> ${res.status} ${detail}`);
  }
  return (await res.json()) as CypherResponse;
}

function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

// C-01: the (type, fromId, toId) pre-check. `type` is an internal
// SCREAMING_SNAKE constant, never user input — no injection surface.
async function edgeExists(base: string, type: string, fromId: string, toId: string): Promise<boolean> {
  const pre = await cypher(
    base,
    `MATCH (a {id:$fromId})-[r:${type}]->(b {id:$toId}) RETURN count(r) AS n`,
    { fromId, toId },
  );
  return toCount(pre.rows[0]?.n) > 0;
}

// Create an edge via POST /api/v1/edges only when it is absent (idempotent).
// No fixed edge id is supplied (avoids the cross-type-uniqueness 409); the
// edgeExists pre-check guarantees zero duplicate parallel edges on a re-run.
async function ensureEdge(base: string, type: string, fromId: string, toId: string): Promise<void> {
  if (await edgeExists(base, type, fromId, toId)) return;
  const res = await fetch(`${base}/api/v1/edges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, fromId, toId }),
  });
  if (res.status !== 201) {
    const detail = await res.text().catch(() => "");
    throw new Error(`seed-finance-graph: POST /api/v1/edges (${type}) -> ${res.status} ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// T-04 — journey->domain PART_OF + shared-system USES_SYSTEM + shared-role
// EXECUTES edges, all by RESOLVED foundation id (§6.2, §7.1).
// ---------------------------------------------------------------------------

async function seedStructureEdges(
  base: string,
  financeDomainId: string,
  sharedSystemIds: Map<string, string>,
  revenueOperationsId: string,
): Promise<void> {
  // 1. six journey PART_OF Domain edges (resolved domain id).
  for (const j of FINANCE_JOURNEYS) {
    await ensureEdge(base, "PART_OF", j.id, financeDomainId);
  }

  // 2. shared-system USES_SYSTEM edges (resolved system ids).
  for (const shared of FINANCE_SHARED_SYSTEMS) {
    const systemId = sharedSystemIds.get(shared.seedKey);
    if (!systemId) {
      throw new Error(
        `seed-finance-graph: shared system "${shared.seedKey}" not found — run \`bun run seed:saas-operator\` first.`,
      );
    }
    for (const actKey of shared.usedBySeedKeys) {
      await ensureEdge(base, "USES_SYSTEM", activityId(actKey), systemId);
    }
  }

  // 3. shared-role revenue_operations EXECUTES edges (one per journey it owns).
  for (const actKey of REVENUE_OPERATIONS_EXECUTES_ACTIVITY_SEED_KEYS) {
    await ensureEdge(base, "EXECUTES", revenueOperationsId, activityId(actKey));
  }
}

// ---------------------------------------------------------------------------
// T-05 — seven KPIs via POST /api/v1/kpis + MEASURES grounding + optional
// DSO->Dunning ALIGNED_TO (§7.2, §3.1).
// ---------------------------------------------------------------------------

// Lookup-before-create keyed on name + domain_id, matched in TS (C-03: there is
// no domain_id query filter; GET /api/v1/kpis returns { rows: [...] }).
async function ensureKpi(base: string, kpi: (typeof FINANCE_KPIS)[number], financeDomainId: string): Promise<string> {
  const listRes = await fetch(`${base}/api/v1/kpis`);
  if (!listRes.ok) throw new Error(`seed-finance-graph: GET /api/v1/kpis -> ${listRes.status}`);
  const listBody = (await listRes.json()) as { rows?: Array<{ id?: string; name?: string; domain_id?: string }> };
  const match = (listBody.rows ?? []).find(
    (r) => r.name === kpi.name && r.domain_id === financeDomainId,
  );
  if (match?.id) return match.id;

  const res = await fetch(`${base}/api/v1/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: kpi.name,
      category: "finance",
      unit: kpi.unit,
      target_value: kpi.target_value,
      target_direction: kpi.target_direction,
      measurement_frequency: kpi.measurement_frequency,
      domain_id: financeDomainId,
      owner_role: "Revenue Operations",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`seed-finance-graph: POST /api/v1/kpis (${kpi.name}) -> ${res.status} ${detail}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

// Resolve a metric id by seedKey over :MetricDefinition attributes_json.
async function resolveMetricId(base: string, metricSeedKey: string): Promise<string | undefined> {
  const res = await cypher(
    base,
    `MATCH (m:MetricDefinition) WHERE m.attributes_json CONTAINS $key RETURN m.id AS id, m.attributes_json AS a`,
    { key: metricSeedKey },
  );
  for (const row of res.rows) {
    const raw = row.a;
    if (typeof raw === "string" && typeof row.id === "string") {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.seedKey === metricSeedKey) return row.id;
      } catch {
        /* ignore malformed */
      }
    }
  }
  return undefined;
}

async function seedKpis(base: string, financeDomainId: string): Promise<Record<string, string>> {
  const kpiIds: Record<string, string> = {};
  for (const kpi of FINANCE_KPIS) {
    const kpiId = await ensureKpi(base, kpi, financeDomainId);
    kpiIds[kpi.name] = kpiId;

    // MEASURES grounding (C-04): link when the metric exists; otherwise skip +
    // warn (the metric-cloud-cost-per-tenant OQ-1 case → created ungrounded).
    const metricId = await resolveMetricId(base, kpi.metricSeedKey);
    if (metricId) {
      try {
        await linkKpiToMetric(base, kpiId, metricId);
      } catch (e) {
        if (!(e instanceof KpiMetricAlreadyLinkedError)) throw e;
        // already grounded — idempotent success.
      }
    } else {
      console.warn(
        `[seed:finance-graph] KPI "${kpi.name}" left UNGROUNDED — metric "${kpi.metricSeedKey}" absent (OQ-1 / AC-15 blocked). Grounding lands once saas-metric-library ships it.`,
      );
    }
  }

  // Optional FR-07 (should) enrichment: DSO -> Dunning ALIGNED_TO via the
  // verified generic edge route (C-05). Enrichment only; un-gated by any AC.
  const dsoId = kpiIds[DSO_KPI_NAME];
  const dunning = FINANCE_JOURNEYS.find((j) => j.seedKey === DSO_ALIGNED_TO_JOURNEY_SEED_KEY);
  if (dsoId && dunning) {
    await ensureEdge(base, "ALIGNED_TO", dsoId, dunning.id);
  }

  return kpiIds;
}

// ---------------------------------------------------------------------------
// T-06 — one story per journey + a Given/When/Then AC under the resolved root
// (§7.3). activityId resolved from finance-ids.ts (N-02); root id resolved,
// never hard-coded (B-02).
// ---------------------------------------------------------------------------

interface StoryListRow {
  id: string;
  persona: string | null;
  action: string | null;
  activityId: string | null;
}

interface AcListRow {
  given: string;
  when: string;
  then: string;
}

async function seedStories(base: string, rootId: string): Promise<string[]> {
  // Resolve slice role ids by seedKey once (for the optional roleId).
  const roleRows = await cypher(
    base,
    `MATCH (r:Role) WHERE r.attributes_json CONTAINS 'fin-role-' RETURN r.id AS id, r.attributes_json AS a`,
  );
  const roleIdBySeedKey = new Map<string, string>();
  for (const row of roleRows.rows) {
    const raw = row.a;
    if (typeof raw === "string" && typeof row.id === "string") {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.seedKey === "string") roleIdBySeedKey.set(parsed.seedKey, row.id);
      } catch {
        /* ignore */
      }
    }
  }

  const listRes = await fetch(`${base}/api/v1/models/${rootId}/stories`);
  if (!listRes.ok) throw new Error(`seed-finance-graph: GET .../stories -> ${listRes.status}`);
  const existing = (await listRes.json()) as StoryListRow[];
  const storyKey = (persona: string, action: string, act: string | null) => `${persona}|${action}|${act ?? ""}`;
  const byKey = new Map<string, string>();
  for (const s of existing) byKey.set(storyKey(s.persona ?? "", s.action ?? "", s.activityId), s.id);

  const storyIds: string[] = [];
  for (const story of FINANCE_STORIES) {
    const actId = activityId(story.activitySeedKey);
    let storyId = byKey.get(storyKey(story.persona, story.action, actId));
    if (!storyId) {
      const body: Record<string, unknown> = {
        persona: story.persona,
        action: story.action,
        benefit: story.benefit,
        activityId: actId,
      };
      const roleId = roleIdBySeedKey.get(story.roleSeedKey);
      if (roleId) body.roleId = roleId;
      const res = await fetch(`${base}/api/v1/models/${rootId}/stories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(`seed-finance-graph: POST .../stories (${story.persona}) -> ${res.status} ${detail}`);
      }
      const created = (await res.json()) as { id: string };
      storyId = created.id;
    }
    storyIds.push(storyId);

    // ≥1 Given/When/Then AC — lookup-before-create by (given+when+then).
    const acListRes = await fetch(
      `${base}/api/v1/models/${rootId}/stories/${storyId}/acceptance-criteria`,
    );
    if (!acListRes.ok) throw new Error(`seed-finance-graph: GET .../acceptance-criteria -> ${acListRes.status}`);
    const acExisting = (await acListRes.json()) as AcListRow[];
    const acKey = (g: string, w: string, t: string) => `${g}|${w}|${t}`;
    const acSeen = new Set(acExisting.map((a) => acKey(a.given, a.when, a.then)));
    if (!acSeen.has(acKey(story.ac.given, story.ac.when, story.ac.then))) {
      const res = await fetch(
        `${base}/api/v1/models/${rootId}/stories/${storyId}/acceptance-criteria`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(story.ac),
        },
      );
      if (res.status !== 201) {
        const detail = await res.text().catch(() => "");
        throw new Error(`seed-finance-graph: POST .../acceptance-criteria -> ${res.status} ${detail}`);
      }
    }
  }
  return storyIds;
}

// ---------------------------------------------------------------------------
// Orchestration.
// ---------------------------------------------------------------------------

export interface FinanceGraphSeedResult {
  rootId: string;
  financeDomainId: string;
  kpiIds: Record<string, string>;
  storyIds: string[];
}

export async function seedFinanceGraph(base?: string): Promise<FinanceGraphSeedResult> {
  const apiBaseUrl = base ?? apiBase();
  const driver = getDriver();

  // Foundation ids by typed helper only (C-02, N-01).
  const root = await ensureOperatorRoot(driver);
  const domains = await ensureFunctionDomains(driver, root.id);
  const financeDomainId = domains.get("finance_accounting");
  if (!financeDomainId) {
    throw new Error(
      "seed-finance-graph: finance_accounting domain not found — run `bun run seed:saas-operator` first.",
    );
  }
  const sharedSystemIds = await ensureSystems(driver);
  const roles = await ensureRoles(driver);
  const revenueOperationsId = roles.get(SHARED_REVENUE_OPERATIONS_SEED_KEY);
  if (!revenueOperationsId) {
    throw new Error(
      "seed-finance-graph: revenue_operations role not found — run `bun run seed:saas-operator` first.",
    );
  }

  await seedStructureEdges(apiBaseUrl, financeDomainId, sharedSystemIds, revenueOperationsId);
  const kpiIds = await seedKpis(apiBaseUrl, financeDomainId);
  const storyIds = await seedStories(apiBaseUrl, root.id);

  return { rootId: root.id, financeDomainId, kpiIds, storyIds };
}

if (import.meta.main) {
  seedFinanceGraph()
    .then((r) => {
      console.log(
        `[seed:finance-graph] root: ${r.rootId}; finance domain: ${r.financeDomainId}; ` +
          `KPIs ${Object.keys(r.kpiIds).length}, stories ${r.storyIds.length}`,
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:finance-graph] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
