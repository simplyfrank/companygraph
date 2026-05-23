// Data loader for the Journey Board (portfolio) view — lightweight
// load of all journeys with start/end activities + cross-journey edges.

import { api } from "../api";

export interface PortfolioJourney {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
  activityCount: number;
  startActivity?: { id: string; name: string };
  endActivity?:   { id: string; name: string };
  startRole?:     { id: string; name: string; team?: string };
  endRole?:       { id: string; name: string; team?: string };
  startSystem?:   { id: string; name: string };
  endSystem?:     { id: string; name: string };
}

export interface PortfolioCrossEdge {
  fromJourneyId: string;
  fromJourneyName: string;
  fromActivityId: string;
  fromActivityName: string;
  toJourneyId: string;
  toJourneyName: string;
  toActivityId: string;
  toActivityName: string;
  handoffType?: string;
  target_ms?: number;
  actual_ms?: number;
}

export interface JourneyPortfolio {
  journeys: PortfolioJourney[];
  crossEdges: PortfolioCrossEdge[];
  domainFilter?: string | null;
}

export async function loadJourneyPortfolio(
  domainFilter?: string | null,
): Promise<JourneyPortfolio> {
  // Single Cypher shot: all journeys + first/last activity + role + system.
  const journeysRes = await api.cypher(
    `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
     ${domainFilter ? "WHERE d.id = $domainId" : ""}
     OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
     OPTIONAL MATCH (a)-[p:PRECEDES]->()
     WITH j, d, a, p
     ORDER BY j.name, a.name
     WITH j, d,
          count(DISTINCT a) AS activityCount,
          collect(DISTINCT a)[0] AS firstAct,
          collect(DISTINCT a)[-1] AS lastAct
     OPTIONAL MATCH (firstAct)<-[:EXECUTES]-(sr:Role)
     OPTIONAL MATCH (firstAct)-[:USES_SYSTEM]->(ss:System)
     OPTIONAL MATCH (lastAct)<-[:EXECUTES]-(er:Role)
     OPTIONAL MATCH (lastAct)-[:USES_SYSTEM]->(es:System)
     RETURN j.id AS id, j.name AS name,
            d.id AS domainId, d.name AS domainName,
            activityCount,
            firstAct{.id, .name} AS startActivity,
            lastAct{.id, .name} AS endActivity,
            sr{.id, .name, .attributes_json} AS startRole,
            ss{.id, .name} AS startSystem,
            er{.id, .name, .attributes_json} AS endRole,
            es{.id, .name} AS endSystem
     ORDER BY j.name`,
    domainFilter ? { domainId: domainFilter } : {},
  );

  const parseTeam = (json?: string): string | undefined => {
    if (!json) return undefined;
    try {
      const attrs = JSON.parse(json) as Record<string, unknown>;
      return (attrs.team_id as string) || (attrs.team as string) || undefined;
    } catch { return undefined; }
  };

  const journeys: PortfolioJourney[] = (
    journeysRes.rows as unknown as Array<{
      id: string; name: string; domainId: string; domainName: string;
      activityCount: number;
      startActivity: { id: string; name: string } | null;
      endActivity:   { id: string; name: string } | null;
      startRole:     { id: string; name: string; attributes_json?: string } | null;
      startSystem:   { id: string; name: string } | null;
      endRole:       { id: string; name: string; attributes_json?: string } | null;
      endSystem:     { id: string; name: string } | null;
    }>
  ).map((r) => ({
    id: r.id,
    name: r.name,
    domainId: r.domainId,
    domainName: r.domainName,
    activityCount: Number(r.activityCount) || 0,
    ...(r.startActivity ? { startActivity: r.startActivity } : {}),
    ...(r.endActivity ? { endActivity: r.endActivity } : {}),
    ...(r.startRole ? { startRole: { ...r.startRole, team: parseTeam(r.startRole.attributes_json) } } : {}),
    ...(r.startSystem ? { startSystem: r.startSystem } : {}),
    ...(r.endRole ? { endRole: { ...r.endRole, team: parseTeam(r.endRole.attributes_json) } } : {}),
    ...(r.endSystem ? { endSystem: r.endSystem } : {}),
  }));

  // Cross-journey PRECEDES edges.
  const crossRes = await api.cypher(
    `MATCH (a1:Activity)-[p:PRECEDES]->(a2:Activity)
     MATCH (a1)-[:PART_OF]->(j1:UserJourney)-[:PART_OF]->(d1:Domain)
     MATCH (a2)-[:PART_OF]->(j2:UserJourney)-[:PART_OF]->(d2:Domain)
     WHERE j1 <> j2
     ${domainFilter ? "AND d1.id = $domainId AND d2.id = $domainId" : ""}
     RETURN j1.id AS fromJourneyId, j1.name AS fromJourneyName,
            a1.id AS fromActivityId, a1.name AS fromActivityName,
            j2.id AS toJourneyId, j2.name AS toJourneyName,
            a2.id AS toActivityId, a2.name AS toActivityName,
            p.attributes_json AS attrs`,
    domainFilter ? { domainId: domainFilter } : {},
  );

  const crossEdges: PortfolioCrossEdge[] = (
    crossRes.rows as unknown as Array<{
      fromJourneyId: string; fromJourneyName: string;
      fromActivityId: string; fromActivityName: string;
      toJourneyId: string; toJourneyName: string;
      toActivityId: string; toActivityName: string;
      attrs: string;
    }>
  ).map((r) => {
    let handoffType: string | undefined;
    let target_ms: number | undefined;
    let actual_ms: number | undefined;
    try {
      const attrs = JSON.parse(r.attrs) as Record<string, unknown>;
      handoffType = (attrs.handoff_type as string) || undefined;
      target_ms = typeof attrs.target_ms === "number" ? attrs.target_ms : undefined;
      actual_ms = typeof attrs.actual_ms === "number" ? attrs.actual_ms : undefined;
    } catch { /* ignore */ }
    return {
      fromJourneyId: r.fromJourneyId,
      fromJourneyName: r.fromJourneyName,
      fromActivityId: r.fromActivityId,
      fromActivityName: r.fromActivityName,
      toJourneyId: r.toJourneyId,
      toJourneyName: r.toJourneyName,
      toActivityId: r.toActivityId,
      toActivityName: r.toActivityName,
      handoffType,
      target_ms,
      actual_ms,
    };
  });

  return { journeys, crossEdges, domainFilter };
}
