// ddd-system-modeling T-05/T-06 (design §4.4, §4.5, DD-05, DD-07,
// DD-09, DD-15, DD-18) — the two READ AGGREGATES of the system-model
// surface: support-gap analysis (computeGaps) and the context map
// (computeContextMap).
//
// Both are bounded, deterministic, side-effect-free Neo4j reads (no
// per-capability N+1, NFR-07). Writes live in storage/capabilities.ts
// (DD-05 — mirrors the stories.ts / story-derive.ts split).

import type { Driver } from "neo4j-driver";
import type {
  GapsResult,
  GapStepItem,
  ContextMapResult,
  KindCounts,
} from "@companygraph/shared/schema/ddd-system";
import {
  SYSTEM_KINDS,
  systemKindSchema,
} from "@companygraph/shared/schema/system-kind";
import { scopedNodeIds } from "./model-scope";

// ---------------------------------------------------------------------------
// Augmentation-mix bucketing (FR-07d, AC-07, rev-2 tasks-review B-01)
// ---------------------------------------------------------------------------

// All-zero counts, keys DERIVED from SYSTEM_KINDS (NFR-03 — the kind
// literals live only in shared/src/schema/system-kind.ts; the
// vocabulary-singularity grep guard enforces this).
function zeroCounts(): KindCounts {
  const counts = { unknown: 0 } as KindCounts;
  for (const k of SYSTEM_KINDS) counts[k] = 0;
  return counts;
}

// Exported so the unit test (api/__tests__/system-kind-bucketing.test.ts)
// exercises the EXACT production path computeGaps calls — not a copy.
// A missing/invalid/null systemKind lands in `unknown` (defensive
// bucket, design-review N-02), never silently dropped. Kinds resolve
// via systemKindSchema / SYSTEM_KINDS (NFR-03 — never a re-declared
// literal).
export function bucketSystemKinds(
  attributesJsonList: (string | null)[],
): KindCounts {
  const counts: KindCounts = zeroCounts();
  for (const raw of attributesJsonList) {
    let kind: string | undefined;
    try {
      const attrs = JSON.parse(raw ?? "{}") as Record<string, unknown>;
      kind = typeof attrs["systemKind"] === "string" ? (attrs["systemKind"] as string) : undefined;
    } catch {
      kind = undefined;
    }
    const parsed = systemKindSchema.safeParse(kind);
    if (parsed.success) counts[parsed.data] += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function shares(counts: KindCounts): Record<keyof KindCounts, number> {
  const keys = [...SYSTEM_KINDS, "unknown"] as const;
  const total = keys.reduce((acc, k) => acc + counts[k], 0);
  const result = {} as Record<keyof KindCounts, number>;
  for (const k of keys) result[k] = total === 0 ? 0 : counts[k] / total;
  return result;
}

// ---------------------------------------------------------------------------
// Support-gap analysis (FR-07, FR-08, DD-09, DD-15, DD-18)
// ---------------------------------------------------------------------------

export async function computeGaps(driver: Driver, modelId: string): Promise<GapsResult> {
  // Precomputed JS-side; the set contains only structural ids — the
  // `MATCH (a:Activity) WHERE a.id IN $ids` naturally restricts to
  // activities.
  const scopedActivityIds = [...(await scopedNodeIds(driver, modelId))];

  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // (a) unsupportedSteps + capabilityGaps — ONE pass over model
    // activities with BOTH capability arms (DD-15): the direct
    // activity-need AND the story-mediated need through the describing
    // story (DESCRIBES_ACTIVITY direction verified UserStory→Activity).
    //
    // NOTE (rev-3 N-03): capPathSystems = activityPathSystems +
    // storyPathSystems may double-count a system reached via both arms
    // — harmless, only `> 0` is consulted; do NOT refactor into a
    // cross-arm DISTINCT.
    //
    // NOTE (rev-3 N-01 / DD-17(iv)): the capability arms are
    // deliberately NOT CAPABILITY_IN_MODEL-filtered — a forged
    // cross-model NEEDS_CAPABILITY is unreachable through sanctioned
    // writes (PUT …/needed-by validates in-model; attachDomain always
    // CREATEs a fresh Domain; IN_MODEL is lifecycle-guarded).
    const stepsRes = await session.run(
      `MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
       OPTIONAL MATCH (a)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(capSys:System)
       OPTIONAL MATCH (a)<-[:DESCRIBES_ACTIVITY]-(:UserStory)
                      -[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(storySys:System)
       OPTIONAL MATCH (a)-[:USES_SYSTEM]->(directSys:System)
       OPTIONAL MATCH (a)<-[:DESCRIBES_ACTIVITY]-(story:UserStory)
       WITH a,
            count(DISTINCT capSys)    AS activityPathSystems,
            count(DISTINCT storySys)  AS storyPathSystems,
            count(DISTINCT directSys) AS directSystems,
            collect(DISTINCT {id: story.id, name: story.name}) AS describingStories
       RETURN a.id AS activityId, a.name AS activityName,
              activityPathSystems + storyPathSystems AS capPathSystems,
              directSystems, describingStories`,
      { scopedActivityIds },
    );

    const unsupportedSteps: GapStepItem[] = [];
    const capabilityGaps: GapStepItem[] = [];
    for (const rec of stepsRes.records) {
      const capPathSystems = rec.get("capPathSystems") as number;
      const directSystems = rec.get("directSystems") as number;
      if (capPathSystems > 0) continue; // supported — not flagged (X, W)
      const item: GapStepItem = {
        activityId: rec.get("activityId") as string,
        activityName: (rec.get("activityName") as string | null) ?? "",
        describingStories: (
          rec.get("describingStories") as Array<{ id: string | null; name: string | null }>
        )
          .filter((s): s is { id: string; name: string | null } => s.id !== null)
          .map((s) => ({ id: s.id, name: s.name ?? "" })),
      };
      if (directSystems > 0) capabilityGaps.push(item); // Y — raw USES_SYSTEM only
      else unsupportedSteps.push(item); // Z — no support at all
    }

    // (b) capabilitiesWithoutSystem — model-scoped capabilities with
    // zero SUPPORTED_BY.
    const noSysRes = await session.run(
      `MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       WHERE NOT (cap)-[:SUPPORTED_BY]->(:System)
       RETURN cap.id AS capabilityId, cap.name AS name
       ORDER BY name`,
      { modelId },
    );
    const capabilitiesWithoutSystem = noSysRes.records.map((rec) => ({
      capabilityId: rec.get("capabilityId") as string,
      name: (rec.get("name") as string | null) ?? "",
    }));

    // (c) orphanSystems — Systems reached by THIS model's activities but
    // mapped to no capability OF THIS MODEL (DD-18 — per-model check: a
    // system capability-mapped only in model B is still model A's
    // orphan).
    //
    // NOTE (design-review N-01, rev-1 pass): FR-07(c)'s capability arm
    // is VACUOUS — a system reached via a model-scoped capability's
    // SUPPORTED_BY fails the NOT EXISTS by definition; the
    // activities-only traversal is complete.
    const orphanRes = await session.run(
      `MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
       MATCH (a)-[:USES_SYSTEM]->(sys:System)
       WHERE NOT EXISTS {
         MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId}),
               (c)-[:SUPPORTED_BY]->(sys)
       }
       RETURN DISTINCT sys.id AS systemId, sys.name AS name`,
      { scopedActivityIds, modelId },
    );
    const orphanSystems = orphanRes.records.map((rec) => ({
      systemId: rec.get("systemId") as string,
      name: (rec.get("name") as string | null) ?? "",
    }));

    // (d) augmentation mix — per model-scoped capability, bucket its
    // SUPPORTED_BY systems by systemKind (AC-07). The bucketing helper
    // is the exported production path (rev-2 tasks-review B-01).
    const mixRes = await session.run(
      `MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       OPTIONAL MATCH (cap)-[:SUPPORTED_BY]->(sys:System)
       RETURN cap.id AS capabilityId, cap.name AS name, cap.createdAt AS createdAt,
              collect(DISTINCT {id: sys.id, attrs: sys.attributes_json}) AS systemRows
       ORDER BY createdAt ASC`,
      { modelId },
    );
    const modelCounts: KindCounts = zeroCounts();
    const perCapability = mixRes.records.map((rec) => {
      // The OPTIONAL MATCH miss yields an {id:null} row — dropped on
      // id (NOT on attrs, so a System with a null attributes_json
      // still buckets under `unknown`, never silently dropped).
      const rows = (
        rec.get("systemRows") as Array<{ id: string | null; attrs: string | null }>
      )
        .filter((s) => s.id !== null)
        .map((s) => s.attrs);
      const counts = bucketSystemKinds(rows);
      for (const k of [...SYSTEM_KINDS, "unknown"] as const) {
        modelCounts[k] += counts[k];
      }
      return {
        capabilityId: rec.get("capabilityId") as string,
        name: (rec.get("name") as string | null) ?? "",
        counts,
        shares: shares(counts),
      };
    });

    return {
      unsupportedSteps,
      capabilityGaps,
      capabilitiesWithoutSystem,
      orphanSystems,
      augmentationMix: { perCapability, model: modelCounts },
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Context map (FR-09, DD-07)
// ---------------------------------------------------------------------------

export async function computeContextMap(
  driver: Driver,
  modelId: string,
): Promise<ContextMapResult> {
  // A bounded, read-only join of the model's assigned capabilities to
  // the existing bounded-contexts surface. NO BoundedContext /
  // relationship is created or mutated (NFR-04 — no bounded-contexts
  // write path is imported).
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const ctxRes = await session.run(
      `MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       MATCH (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)
       OPTIONAL MATCH (bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)
       WITH bc,
            collect(DISTINCT {id: cap.id, name: cap.name}) AS capabilities,
            collect(DISTINCT {type: type(r), targetId: other.id, targetName: other.name}) AS relationships
       RETURN bc.id AS id, bc.name AS name, bc.domain AS domain, bc.subdomain AS subdomain,
              capabilities, relationships
       ORDER BY bc.name`,
      { modelId },
    );
    const contexts = ctxRes.records.map((rec) => ({
      id: rec.get("id") as string,
      name: (rec.get("name") as string | null) ?? "",
      domain: (rec.get("domain") as string | null) ?? null,
      subdomain: (rec.get("subdomain") as string | null) ?? null,
      capabilities: (rec.get("capabilities") as Array<{ id: string; name: string | null }>).map(
        (c) => ({ id: c.id, name: c.name ?? "" }),
      ),
      // The OPTIONAL MATCH miss yields a {type:null,…} row — dropped
      // JS-side (design §4.5). Shape is {type,targetId,targetName}
      // (DD-07 — id-resolved, NOT the bounded-contexts route's
      // name-only {type,target}).
      relationships: (
        rec.get("relationships") as Array<{
          type: string | null;
          targetId: string | null;
          targetName: string | null;
        }>
      )
        .filter(
          (r): r is { type: string; targetId: string; targetName: string | null } =>
            r.type !== null && r.targetId !== null,
        )
        .map((r) => ({ type: r.type, targetId: r.targetId, targetName: r.targetName ?? "" })),
    }));

    const unassignedRes = await session.run(
      `MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       WHERE NOT (cap)-[:ASSIGNED_TO_CONTEXT]->(:BoundedContext)
       RETURN cap.id AS id, cap.name AS name
       ORDER BY name`,
      { modelId },
    );
    const unassigned = unassignedRes.records.map((rec) => ({
      id: rec.get("id") as string,
      name: (rec.get("name") as string | null) ?? "",
    }));

    return { contexts, unassigned };
  } finally {
    await session.close();
  }
}
