// key-activity-optimizer test fixtures (design §8) — API-only seeding
// (no direct-driver writes): POST /api/v1/models +
// POST /api/v1/models/:id/domains + core node/edge routes.

import { api, createNode, createEdge, type Cleanup } from "./model-fixtures";

export interface ActivitySpec {
  key: string; // local key, becomes part of the node name
  roles?: string[]; // local role keys (EXECUTES)
  systems?: string[]; // local system keys (USES_SYSTEM)
  attributes?: Record<string, unknown>;
}

export interface ScoringFixture {
  modelId: string;
  domainId: string;
  journeyId: string;
  activityIds: Record<string, string>; // local key -> node id
  roleIds: Record<string, string>;
  systemIds: Record<string, string>;
}

// One model + one domain + one journey + the given activities wired
// PART_OF the journey, PRECEDES per `edges` (pairs of local keys), and
// shared Role/System reference nodes wired EXECUTES / USES_SYSTEM.
export async function buildScoringModel(
  c: Cleanup,
  prefix: string,
  activities: ActivitySpec[],
  edges: Array<[string, string]>,
): Promise<ScoringFixture> {
  const model = await api<{ id: string }>("POST", "/models", { name: `${prefix}-model` });
  if (model.status !== 201) throw new Error(`create model: ${model.status}`);
  c.modelIds.push(model.body.id);

  const domain = await api<{ id: string }>("POST", `/models/${model.body.id}/domains`, {
    name: `${prefix}-domain`,
  });
  if (domain.status !== 201) throw new Error(`attach domain: ${domain.status}`);

  const journeyId = await createNode(c, "UserJourney", `${prefix}-journey`);
  await createEdge("PART_OF", journeyId, domain.body.id);

  const activityIds: Record<string, string> = {};
  const roleIds: Record<string, string> = {};
  const systemIds: Record<string, string> = {};

  for (const spec of activities) {
    const id = await createNode(c, "Activity", `${prefix}-${spec.key}`, spec.attributes ?? {});
    activityIds[spec.key] = id;
    await createEdge("PART_OF", id, journeyId);
    for (const role of spec.roles ?? []) {
      if (!roleIds[role]) {
        roleIds[role] = await createNode(c, "Role", `${prefix}-role-${role}`);
      }
      await createEdge("EXECUTES", roleIds[role]!, id);
    }
    for (const system of spec.systems ?? []) {
      if (!systemIds[system]) {
        systemIds[system] = await createNode(c, "System", `${prefix}-system-${system}`, {
          systemKind: "functional",
        });
      }
      await createEdge("USES_SYSTEM", id, systemIds[system]!);
    }
  }

  for (const [from, to] of edges) {
    await createEdge("PRECEDES", activityIds[from]!, activityIds[to]!);
  }

  return {
    modelId: model.body.id,
    domainId: domain.body.id,
    journeyId,
    activityIds,
    roleIds,
    systemIds,
  };
}

export interface ScoreRowRes {
  id: string;
  name: string;
  journeyId: string | null;
  journeyName: string | null;
  rank: number;
  composite: number;
  scores: { centrality: number; criticalPath: number; handoff: number };
  evidence: {
    centrality: { betweenness: number; inDegree: number; outDegree: number };
    criticalPath: { onCriticalPath: boolean; longestChainDepth: number; criticalPathLength: number };
    handoff: { handoffCount: number; roleHandoffs: number; systemHandoffs: number };
  };
  key: {
    marked: true;
    markedAt: string;
    scoreSnapshot: { centrality: number; criticalPath: number; handoff: number; composite: number };
    rank: number;
  } | null;
}

export interface ScoresRes {
  rows: ScoreRowRes[];
  meta: {
    activityCount: number;
    hasCycle: boolean;
    truncated?: boolean;
    truncationReason?: string;
    weights: { centrality: number; criticalPath: number; handoff: number };
  };
}

export async function getScores(modelId: string): Promise<ScoresRes> {
  const { status, body } = await api<ScoresRes>("GET", `/models/${modelId}/key-activities`);
  if (status !== 200) throw new Error(`GET key-activities: ${status} ${JSON.stringify(body)}`);
  return body;
}

export function rowFor(scores: ScoresRes, id: string): ScoreRowRes {
  const row = scores.rows.find((r) => r.id === id);
  if (!row) throw new Error(`no score row for ${id}`);
  return row;
}
