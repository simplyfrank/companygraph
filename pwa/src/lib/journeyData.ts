// Shared data loader for JourneyCanvas — used by both JourneyGraph
// (full-page canvas view) and Journey (inline process-flow panel).
import { api } from "../api";
import type {
  JourneyData,
  ActivityNode,
  RoleNode,
  SystemNode,
  LocationNode,
  PrecedesEdge,
} from "../components/JourneyCanvas";

export function parseAttrs(json: string | undefined | null): Record<string, unknown> {
  if (!json || typeof json !== "string") return {};
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

export async function loadJourneyData(journeyId: string): Promise<JourneyData> {
  const [precedesRes, crossPrecedesRes, executesRes, usesRes, locsRes, activitiesRes, crossDomainRes] = await Promise.all([
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[p:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
       RETURN a.id AS fromId, b.id AS toId, p.attributes_json AS attrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       OPTIONAL MATCH (a)-[p_out:PRECEDES]->(b:Activity)-[:PART_OF]->(other:UserJourney)
       WHERE other <> j
       OPTIONAL MATCH (c:Activity)-[:PART_OF]->(j)<-[:PART_OF]-(prev:UserJourney)
       OPTIONAL MATCH (c)-[p_in:PRECEDES]->(a)
       WHERE prev <> j
       RETURN a.id AS actId,
              b.id AS outId, other.id AS outJourneyId, other.name AS outJourneyName, p_out.attributes_json AS outAttrs,
              c.id AS inId, prev.id AS inJourneyId, prev.name AS inJourneyName, p_in.attributes_json AS inAttrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (r:Role)-[e:EXECUTES]->(a)
       RETURN r.id AS roleId, r.name AS roleName, r.attributes_json AS roleAttrs,
              a.id AS aId, e.attributes_json AS attrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[u:USES_SYSTEM]->(s:System)
       RETURN a.id AS aId, s.id AS sysId, s.name AS sysName,
              s.attributes_json AS sysAttrs, u.attributes_json AS attrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[:AT_LOCATION]->(l:Location)
       RETURN a.id AS aId, l.id AS locId, l.name AS locName`,
      { id: journeyId },
    ),
    api.getJourney(journeyId),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[:USES_SYSTEM]->(s:System)-[:PART_OF]->(d1:Domain)
       MATCH (a)-[:USES_SYSTEM]->(t:System)-[:PART_OF]->(d2:Domain)
       WHERE d1.id <> d2.id
       RETURN a.id AS actId, s.id AS sysId, s.name AS sysName, d1.id AS domain1Id, d1.name AS domain1Name,
              t.id AS targetSysId, t.name AS targetSysName, d2.id AS domain2Id, d2.name AS domain2Name`,
      { id: journeyId },
    ),
  ]);

  const journeyActivities = activitiesRes.rows[0]?.activities ?? [];

  const precedesRaw = precedesRes.rows as unknown as Array<{ fromId: string; toId: string; attrs: string }>;
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const a of journeyActivities) { indeg.set(a.id, 0); succ.set(a.id, []); }
  for (const p of precedesRaw) {
    succ.get(p.fromId)?.push(p.toId);
    indeg.set(p.toId, (indeg.get(p.toId) ?? 0) + 1);
  }
  const ordered: Array<{ id: string; name: string }> = [];
  const queue = journeyActivities.filter((a) => (indeg.get(a.id) ?? 0) === 0);
  while (queue.length > 0) {
    const a = queue.shift()!;
    ordered.push(a);
    for (const next of succ.get(a.id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) {
        const found = journeyActivities.find((x) => x.id === next);
        if (found) queue.push(found);
      }
    }
  }
  for (const a of journeyActivities) {
    if (!ordered.find((x) => x.id === a.id)) ordered.push(a);
  }

  const colOf = new Map<string, number>();
  ordered.forEach((a, i) => colOf.set(a.id, i));

  const activities: ActivityNode[] = ordered.map((a, i) => ({ id: a.id, name: a.name, column: i }));

  const precedes: PrecedesEdge[] = precedesRaw.map((p) => {
    const attrs = parseAttrs(p.attrs);
    const target_ms = attrs.target_ms as number | undefined;
    const actual_ms = attrs.actual_ms as number | undefined;
    return {
      from_col: colOf.get(p.fromId) ?? 0,
      to_col:   colOf.get(p.toId)   ?? 0,
      ...(target_ms !== undefined ? { target_ms } : {}),
      ...(actual_ms !== undefined ? { actual_ms } : {}),
    };
  });

  // Cross-journey PRECEDES: edges where one end is in this journey and the other is not.
  const crossRows = crossPrecedesRes.rows as unknown as Array<{
    actId: string;
    outId: string | null; outJourneyId: string | null; outJourneyName: string | null; outAttrs: string | null;
    inId: string | null; inJourneyId: string | null; inJourneyName: string | null; inAttrs: string | null;
  }>;
  const seenCross = new Set<string>();
  for (const row of crossRows) {
    const col = colOf.get(row.actId);
    if (col === undefined) continue;
    if (row.outId && row.outJourneyId) {
      const key = `${row.actId}->${row.outId}`;
      if (seenCross.has(key)) continue;
      seenCross.add(key);
      const attrs = parseAttrs(row.outAttrs);
      precedes.push({
        from_col: col,
        to_col: -1, // sentinel: target is outside this journey
        target_ms: attrs.target_ms as number | undefined,
        actual_ms: attrs.actual_ms as number | undefined,
      });
    }
    if (row.inId && row.inJourneyId) {
      const key = `${row.inId}->${row.actId}`;
      if (seenCross.has(key)) continue;
      seenCross.add(key);
      const attrs = parseAttrs(row.inAttrs);
      precedes.push({
        from_col: -1, // sentinel: source is outside this journey
        to_col: col,
        target_ms: attrs.target_ms as number | undefined,
        actual_ms: attrs.actual_ms as number | undefined,
      });
    }
  }

  const roleMap = new Map<string, RoleNode>();
  for (const r of executesRes.rows as unknown as Array<{ roleId: string; roleName: string; roleAttrs: string; aId: string; attrs: string }>) {
    const col = colOf.get(r.aId);
    if (col === undefined) continue;
    const rAttrs = parseAttrs(r.roleAttrs);
    const eAttrs = parseAttrs(r.attrs);
    let node = roleMap.get(r.roleId);
    if (!node) {
      const team_id    = rAttrs.team_id    as string | undefined;
      const team_name  = rAttrs.team_name  as string | undefined;
      const team_color = rAttrs.team_color as string | undefined;
      node = {
        id: r.roleId, name: r.roleName,
        ...(team_id    !== undefined ? { team_id }    : {}),
        ...(team_name  !== undefined ? { team_name }  : {}),
        ...(team_color !== undefined ? { team_color } : {}),
        columns: [], durations: {},
      };
      roleMap.set(r.roleId, node);
    }
    node!.columns.push(col);
    if (typeof eAttrs.duration_min === "number") node!.durations[col] = eAttrs.duration_min;
  }

  const sysMap = new Map<string, SystemNode>();
  for (const u of usesRes.rows as unknown as Array<{ aId: string; sysId: string; sysName: string; sysAttrs: string; attrs: string }>) {
    const col = colOf.get(u.aId);
    if (col === undefined) continue;
    const sAttrs = parseAttrs(u.sysAttrs);
    const uAttrs = parseAttrs(u.attrs);
    let node = sysMap.get(u.sysId);
    if (!node) {
      const kind = sAttrs.kind as string | undefined;
      node = { id: u.sysId, name: u.sysName, ...(kind !== undefined ? { kind } : {}), usages: [] };
      sysMap.set(u.sysId, node);
    }
    const uTarget = uAttrs.target_ms as number | undefined;
    const uActual = uAttrs.actual_ms as number | undefined;
    node!.usages.push({
      column: col,
      ...(uTarget !== undefined ? { target_ms: uTarget } : {}),
      ...(uActual !== undefined ? { actual_ms: uActual } : {}),
    });
  }

  const locMap = new Map<string, LocationNode>();
  for (const l of locsRes.rows as unknown as Array<{ aId: string; locId: string; locName: string }>) {
    const col = colOf.get(l.aId);
    if (col === undefined) continue;
    let node = locMap.get(l.locId);
    if (!node) {
      node = { id: l.locId, name: l.locName, columns: [] };
      locMap.set(l.locId, node);
    }
    node.columns.push(col);
  }

  // Cross-domain system relationships
  const crossDomainRelations: Array<{
    activityId: string;
    systemId: string;
    systemName: string;
    domain1Id: string;
    domain1Name: string;
    targetSystemId: string;
    targetSystemName: string;
    domain2Id: string;
    domain2Name: string;
  }> = [];
  for (const row of crossDomainRes.rows as unknown as Array<{
    actId: string; sysId: string; sysName: string; domain1Id: string; domain1Name: string;
    targetSysId: string; targetSysName: string; domain2Id: string; domain2Name: string;
  }>) {
    const col = colOf.get(row.actId);
    if (col === undefined) continue;
    crossDomainRelations.push({
      activityId: row.actId,
      systemId: row.sysId,
      systemName: row.sysName,
      domain1Id: row.domain1Id,
      domain1Name: row.domain1Name,
      targetSystemId: row.targetSysId,
      targetSystemName: row.targetSysName,
      domain2Id: row.domain2Id,
      domain2Name: row.domain2Name,
    });
  }

  return {
    activities,
    roles:     [...roleMap.values()],
    systems:   [...sysMap.values()],
    locations: [...locMap.values()],
    precedes,
    crossDomainRelations,
  };
}
