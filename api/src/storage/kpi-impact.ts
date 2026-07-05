// kpi-impact-mapping T-03/T-04/T-05/T-06 (design §4.2–§4.5) — storage layer.
// Activity links (ALIGNED_TO + direction), story links (IMPACTS_KPI),
// matrix inputs, roll-up inputs.

import type { Driver } from "neo4j-driver";
import { scopedNodeIds } from "./model-scope";
import { ValidationError } from "../errors";
import type {
  ActivityLinkCreate,
  StoryLinkCreate,
  ImpactLinkRow,
} from "@companygraph/shared/schema/kpi-impact";

// ─── T-03: Activity links (ALIGNED_TO + direction) ───────────────────

// N-02: the ->(a:Activity) endpoint filter is deliberate — journey/domain
// alignments are out of this feature's activity×KPI surface.

export async function createActivityLink(
  driver: Driver,
  modelId: string,
  body: ActivityLinkCreate,
): Promise<ImpactLinkRow> {
  const scoped = await scopedNodeIds(driver, modelId);
  if (!scoped.has(body.activityId)) {
    throw new ValidationError("activity_not_found", { activityId: body.activityId }, 404);
  }

  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    // Verify KPI exists and is not archived
    const kpiCheck = await session.run(
      "MATCH (k:KPI {id: $id}) WHERE k.archived_at IS NULL RETURN k",
      { id: body.kpiId },
    );
    if (kpiCheck.records.length === 0) {
      throw new ValidationError("kpi_not_found", { kpiId: body.kpiId }, 404);
    }

    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (k:KPI {id: $kpiId}), (a:Activity {id: $activityId})
       MERGE (k)-[r:ALIGNED_TO]->(a)
       ON CREATE SET r.created_at = $now, r.weight = $weight,
                     r.attribution_type = $attributionType,
                     r.alignment_notes = $notes, r.direction = $direction
       ON MATCH SET r.weight = $weight, r.direction = $direction,
                    r.attribution_type = coalesce($attributionType, r.attribution_type),
                    r.alignment_notes = coalesce($notes, r.alignment_notes)
       RETURN elementId(r) AS linkId, a.id AS sourceId, a.name AS sourceName,
              k.id AS kpiId, k.name AS kpiName,
              r.direction AS direction, r.weight AS weight,
              r.alignment_notes AS notes, r.created_at AS createdAt`,
      {
        kpiId: body.kpiId,
        activityId: body.activityId,
        weight: body.weight,
        direction: body.direction,
        attributionType: body.attributionType ?? "direct",
        notes: body.notes ?? null,
        now,
      },
    );

    const rec = result.records[0]!;
    return {
      linkId: rec.get("linkId"),
      sourceId: rec.get("sourceId"),
      sourceName: rec.get("sourceName"),
      kpiId: rec.get("kpiId"),
      kpiName: rec.get("kpiName"),
      direction: rec.get("direction"),
      weight: rec.get("weight"),
      notes: rec.get("notes"),
      createdAt: rec.get("createdAt"),
    };
  } finally {
    await session.close();
  }
}

export async function listActivityLinks(
  driver: Driver,
  modelId: string,
  filters: { activityId?: string; kpiId?: string },
): Promise<ImpactLinkRow[]> {
  const scoped = await scopedNodeIds(driver, modelId);
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const conditions: string[] = ["a.id IN $scopedIds"];
    const params: Record<string, unknown> = { scopedIds: Array.from(scoped) };
    if (filters.activityId) {
      conditions.push("a.id = $activityId");
      params.activityId = filters.activityId;
    }
    if (filters.kpiId) {
      conditions.push("k.id = $kpiId");
      params.kpiId = filters.kpiId;
    }
    const result = await session.run(
      `MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity)
       WHERE ${conditions.join(" AND ")}
       RETURN elementId(r) AS linkId, a.id AS sourceId, a.name AS sourceName,
              k.id AS kpiId, k.name AS kpiName,
              r.direction AS direction, r.weight AS weight,
              r.alignment_notes AS notes, r.created_at AS createdAt`,
      params,
    );
    return result.records.map((rec) => ({
      linkId: rec.get("linkId"),
      sourceId: rec.get("sourceId"),
      sourceName: rec.get("sourceName"),
      kpiId: rec.get("kpiId"),
      kpiName: rec.get("kpiName"),
      direction: rec.get("direction"),
      weight: rec.get("weight"),
      notes: rec.get("notes"),
      createdAt: rec.get("createdAt"),
    }));
  } finally {
    await session.close();
  }
}

export async function deleteActivityLink(
  driver: Driver,
  _modelId: string,
  linkId: string,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    const result = await session.run(
      `MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity)
       WHERE elementId(r) = $linkId
       DELETE r RETURN count(r) AS deleted`,
      { linkId },
    );
    if (result.records[0]?.get("deleted") === 0) {
      throw new ValidationError("impact_link_not_found", { linkId }, 404);
    }
  } finally {
    await session.close();
  }
}

// ─── T-04: Story links (IMPACTS_KPI) ──────────────────────────────────

export async function createStoryLink(
  driver: Driver,
  modelId: string,
  body: StoryLinkCreate,
): Promise<ImpactLinkRow> {
  const scoped = await scopedNodeIds(driver, modelId);
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    // Model-scope check through the story's activity (story-spec-core NFR-02)
    const storyCheck = await session.run(
      `MATCH (s:UserStory {id: $storyId})-[:DESCRIBES_ACTIVITY]->(a:Activity)
       WHERE a.id IN $scopedIds RETURN s`,
      { storyId: body.storyId, scopedIds: Array.from(scoped) },
    );
    if (storyCheck.records.length === 0) {
      throw new ValidationError("story_not_found", { storyId: body.storyId }, 404);
    }

    // Verify KPI
    const kpiCheck = await session.run(
      "MATCH (k:KPI {id: $id}) WHERE k.archived_at IS NULL RETURN k",
      { id: body.kpiId },
    );
    if (kpiCheck.records.length === 0) {
      throw new ValidationError("kpi_not_found", { kpiId: body.kpiId }, 404);
    }

    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (s:UserStory {id: $storyId}), (k:KPI {id: $kpiId})
       MERGE (s)-[r:IMPACTS_KPI]->(k)
       ON CREATE SET r.created_at = $now, r.weight = $weight,
                     r.direction = $direction, r.notes = $notes
       ON MATCH SET r.weight = $weight, r.direction = $direction,
                    r.notes = coalesce($notes, r.notes)
       RETURN elementId(r) AS linkId, s.id AS sourceId, s.name AS sourceName,
              k.id AS kpiId, k.name AS kpiName,
              r.direction AS direction, r.weight AS weight,
              r.notes AS notes, r.created_at AS createdAt`,
      {
        storyId: body.storyId,
        kpiId: body.kpiId,
        weight: body.weight,
        direction: body.direction,
        notes: body.notes ?? null,
        now,
      },
    );

    const rec = result.records[0]!;
    return {
      linkId: rec.get("linkId"),
      sourceId: rec.get("sourceId"),
      sourceName: rec.get("sourceName"),
      kpiId: rec.get("kpiId"),
      kpiName: rec.get("kpiName"),
      direction: rec.get("direction"),
      weight: rec.get("weight"),
      notes: rec.get("notes"),
      createdAt: rec.get("createdAt"),
    };
  } finally {
    await session.close();
  }
}

export async function listStoryLinks(
  driver: Driver,
  modelId: string,
  filters: { storyId?: string; kpiId?: string },
): Promise<ImpactLinkRow[]> {
  const scoped = await scopedNodeIds(driver, modelId);
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const conditions: string[] = ["a.id IN $scopedIds"];
    const params: Record<string, unknown> = { scopedIds: Array.from(scoped) };
    if (filters.storyId) {
      conditions.push("s.id = $storyId");
      params.storyId = filters.storyId;
    }
    if (filters.kpiId) {
      conditions.push("k.id = $kpiId");
      params.kpiId = filters.kpiId;
    }
    const result = await session.run(
      `MATCH (s:UserStory)-[r:IMPACTS_KPI]->(k:KPI)
       MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       WHERE ${conditions.join(" AND ")}
       RETURN elementId(r) AS linkId, s.id AS sourceId, s.name AS sourceName,
              k.id AS kpiId, k.name AS kpiName,
              r.direction AS direction, r.weight AS weight,
              r.notes AS notes, r.created_at AS createdAt`,
      params,
    );
    return result.records.map((rec) => ({
      linkId: rec.get("linkId"),
      sourceId: rec.get("sourceId"),
      sourceName: rec.get("sourceName"),
      kpiId: rec.get("kpiId"),
      kpiName: rec.get("kpiName"),
      direction: rec.get("direction"),
      weight: rec.get("weight"),
      notes: rec.get("notes"),
      createdAt: rec.get("createdAt"),
    }));
  } finally {
    await session.close();
  }
}

export async function deleteStoryLink(
  driver: Driver,
  _modelId: string,
  linkId: string,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    const result = await session.run(
      `MATCH (s:UserStory)-[r:IMPACTS_KPI]->(k:KPI)
       WHERE elementId(r) = $linkId
       DELETE r RETURN count(r) AS deleted`,
      { linkId },
    );
    if (result.records[0]?.get("deleted") === 0) {
      throw new ValidationError("impact_link_not_found", { linkId }, 404);
    }
  } finally {
    await session.close();
  }
}

// ─── T-05: Matrix read inputs ─────────────────────────────────────────

export interface MatrixActivity {
  id: string;
  name: string;
  journeyName: string | null;
  isKeyActivity: boolean;
  storyLinkCount: number;
}

export interface MatrixLink {
  activityId: string;
  kpiId: string;
  kpiName: string;
  kpiUnit: string | null;
  kpiTargetDirection: string | null;
  direction: string | null;
  weight: number | null;
}

export interface MatrixInput {
  activities: MatrixActivity[];
  links: MatrixLink[];
}

export async function readMatrixInputs(
  driver: Driver,
  modelId: string,
): Promise<{ found: boolean; input: MatrixInput }> {
  // N-01: model_not_found pre-check — a distinct MATCH (m:BusinessModel {id})
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const modelCheck = await session.run(
      "MATCH (m:BusinessModel {id: $modelId}) RETURN m",
      { modelId },
    );
    if (modelCheck.records.length === 0) {
      return { found: false, input: { activities: [], links: [] } };
    }
  } finally {
    await session.close();
  }

  const scoped = await scopedNodeIds(driver, modelId);
  const scopedArr = Array.from(scoped);

  const session2 = driver.session({ defaultAccessMode: "READ" });
  try {
    // Activities + journey + key-activity mark + story-link count
    const actResult = await session2.run(
      `MATCH (a:Activity) WHERE a.id IN $scopedIds
       OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
       OPTIONAL MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a)
       OPTIONAL MATCH (s)-[sk:IMPACTS_KPI]->(:KPI)
       RETURN a.id AS id, a.name AS name, a.attributes_json AS attributesJson,
              j.name AS journeyName, count(DISTINCT sk) AS storyLinkCount`,
      { scopedIds: scopedArr },
    );

    const activities: MatrixActivity[] = actResult.records.map((rec) => {
      const attrsJson = rec.get("attributesJson") as string | null;
      const attrs = attrsJson ? JSON.parse(attrsJson) : {};
      return {
        id: rec.get("id"),
        name: rec.get("name"),
        journeyName: rec.get("journeyName") ?? null,
        isKeyActivity: "keyActivity" in attrs,
        storyLinkCount: rec.get("storyLinkCount") as number,
      };
    });

    // Activity→KPI links (directed + undirected base-route)
    // N-02: the ->(a:Activity) filter is deliberate.
    const linkResult = await session2.run(
      `MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity)
       WHERE a.id IN $scopedIds
       RETURN a.id AS activityId, k.id AS kpiId, k.name AS kpiName,
              k.unit AS kpiUnit, k.target_direction AS kpiTargetDirection,
              r.direction AS direction, r.weight AS weight`,
      { scopedIds: scopedArr },
    );

    const links: MatrixLink[] = linkResult.records.map((rec) => ({
      activityId: rec.get("activityId"),
      kpiId: rec.get("kpiId"),
      kpiName: rec.get("kpiName"),
      kpiUnit: rec.get("kpiUnit") ?? null,
      kpiTargetDirection: rec.get("kpiTargetDirection") ?? null,
      direction: rec.get("direction") ?? null,
      weight: rec.get("weight") ?? null,
    }));

    return { found: true, input: { activities, links } };
  } finally {
    await session2.close();
  }
}

// ─── T-06: Roll-up read inputs ────────────────────────────────────────

export interface RollupKpi {
  id: string;
  name: string;
  unit: string | null;
  targetValue: number | null;
  targetDirection: string | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  latestValue: number | null;
}

export interface RollupLink {
  kpiId: string;
  weight: number;
}

export interface RollupInput {
  kpis: RollupKpi[];
  links: RollupLink[];
  measurementsAvailable: boolean;
}

export async function readRollupInputs(
  driver: Driver,
  modelId: string,
  fetchTrends: (kpiId: string) => Promise<{ measurements: Array<{ value: number }> } | null>,
): Promise<{ found: boolean; input: RollupInput }> {
  // N-01: model_not_found pre-check
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const modelCheck = await session.run(
      "MATCH (m:BusinessModel {id: $modelId}) RETURN m",
      { modelId },
    );
    if (modelCheck.records.length === 0) {
      return { found: false, input: { kpis: [], links: [], measurementsAvailable: false } };
    }
  } finally {
    await session.close();
  }

  const scoped = await scopedNodeIds(driver, modelId);
  const scopedArr = Array.from(scoped);

  const session2 = driver.session({ defaultAccessMode: "READ" });
  try {
    // Collect KPI ids from both edge types (ALIGNED_TO + IMPACTS_KPI)
    const kpiIdsResult = await session2.run(
      `MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity)
       WHERE a.id IN $scopedIds AND k.archived_at IS NULL
       RETURN DISTINCT k.id AS kpiId
       UNION
       MATCH (s:UserStory)-[:IMPACTS_KPI]->(k:KPI)
       MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       WHERE a.id IN $scopedIds AND k.archived_at IS NULL
       RETURN DISTINCT k.id AS kpiId`,
      { scopedIds: scopedArr },
    );
    const kpiIds = kpiIdsResult.records.map((r) => r.get("kpiId") as string);

    if (kpiIds.length === 0) {
      return { found: true, input: { kpis: [], links: [], measurementsAvailable: true } };
    }

    // Fetch KPI catalog fields
    const kpiDetailResult = await session2.run(
      `MATCH (k:KPI) WHERE k.id IN $kpiIds
       RETURN k.id AS id, k.name AS name, k.unit AS unit,
              k.target_value AS targetValue, k.target_direction AS targetDirection,
              k.warning_threshold AS warningThreshold, k.critical_threshold AS criticalThreshold`,
      { kpiIds },
    );

    // Fetch scoped link weights per KPI
    const linkResult = await session2.run(
      `MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity)
       WHERE a.id IN $scopedIds
       RETURN k.id AS kpiId, r.weight AS weight
       UNION ALL
       MATCH (s:UserStory)-[r:IMPACTS_KPI]->(k:KPI)
       MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       WHERE a.id IN $scopedIds
       RETURN k.id AS kpiId, r.weight AS weight`,
      { scopedIds: scopedArr },
    );

    const linksByKpi = new Map<string, number[]>();
    for (const rec of linkResult.records) {
      const kpiId = rec.get("kpiId") as string;
      const weight = (rec.get("weight") as number) ?? 0;
      if (!linksByKpi.has(kpiId)) linksByKpi.set(kpiId, []);
      linksByKpi.get(kpiId)!.push(weight);
    }

    // Fetch trends for each KPI (§4.5 step 4, §4.6, FR-09, NFR-04).
    // fetchTrends returns null for a per-KPI miss (KPI 404/archived, no
    // measurements) — that KPI is simply no_data. A THROWN error is a
    // wholesale failure (the measurement source is unreachable): flip
    // measurementsAvailable=false and force every latestValue=null so the
    // whole roll-up degrades to no_data rather than 500-ing (FR-09).
    let measurementsAvailable = true;
    const kpis: RollupKpi[] = [];
    for (const rec of kpiDetailResult.records) {
      const kpiId = rec.get("id") as string;
      let latestValue: number | null = null;
      if (measurementsAvailable) {
        try {
          const trends = await fetchTrends(kpiId);
          if (trends && trends.measurements.length > 0) {
            // DD-04/C-05: latestValue = last element (ASC-ordered by kpi-trends)
            latestValue = trends.measurements.at(-1)?.value ?? null;
          }
        } catch {
          // Wholesale failure — the measurement source is unreachable.
          measurementsAvailable = false;
          latestValue = null;
        }
      }
      kpis.push({
        id: kpiId,
        name: rec.get("name") ?? null,
        unit: rec.get("unit") ?? null,
        targetValue: rec.get("targetValue") ?? null,
        targetDirection: rec.get("targetDirection") ?? null,
        warningThreshold: rec.get("warningThreshold") ?? null,
        criticalThreshold: rec.get("criticalThreshold") ?? null,
        latestValue,
      });
    }
    // Force every latestValue=null on a wholesale failure (all no_data).
    if (!measurementsAvailable) {
      for (const k of kpis) k.latestValue = null;
    }

    const links: RollupLink[] = [];
    for (const [kpiId, weights] of linksByKpi) {
      for (const w of weights) {
        links.push({ kpiId, weight: w });
      }
    }

    return { found: true, input: { kpis, links, measurementsAvailable } };
  } finally {
    await session2.close();
  }
}

