// key-activity-optimizer T-02/T-04/T-05 (design §4.2, §4.4, §4.5,
// DD-02, DD-05, DD-08) — the Neo4j side of the key-activity surface:
//
//   readModelSubgraph — model-scoped Activity subgraph read (getModel
//     existence gate FIRST — cold-pass B-01; consumes scopedNodeIds,
//     never re-implements it; an EMPTY scoped set is a valid empty
//     subgraph, NOT a 404).
//   computeScores    — read → pure scoreActivities → attach live marks.
//   markActivity     — snapshot live scores into attributes.keyActivity
//     via a dedicated attribute-preserving LOCK-FIRST read-merge-write
//     (cold-pass C-03) that NEVER calls the generic createNode/patchNode
//     primitives (FR-09 — those replace the whole attributes_json and
//     run assertAttributesMatchSchema; the bypass here is by design,
//     DD-05. Import-round-trip contingency: the mark survives
//     export→import only while the Activity attribute schema is not
//     additionalProperties:false — the permissive default; a future
//     strict schema would reject `keyActivity` on the upsertNode import
//     path ONLY. This write bypasses the validator and is unaffected —
//     pass-2 C-01 qualifier, see key-activity-import.integration.test.ts).
//   unmarkActivity   — deletes the keyActivity key, restoring attributes
//     byte-equal (NFR-03); idempotent TRUE no-op when unmarked
//     (final-review N-02: statement 2 skipped, updatedAt untouched).

import type { Driver } from "neo4j-driver";
import {
  keyActivityMarkSchema,
  type ActivityScoreRow,
  type KeyActivityMark,
  type KeyActivityScores,
} from "@companygraph/shared/schema/key-activity";
import { ValidationError } from "../errors";
import {
  scoreActivities,
  DEFAULT_WEIGHTS,
  type ScoreActivity,
  type ScoreEdge,
  type ScoreSubgraph,
} from "../derive/key-activity-score";
import { getModel } from "./models";
import { scopedNodeIds } from "./model-scope";

export interface ModelSubgraph extends ScoreSubgraph {
  attributesById: Map<string, string>;
}

interface ScopeOpts {
  scoped?: Set<string>;
}

// ---------------------------------------------------------------------------
// T-02 — model-scoped subgraph read (FR-01, NFR-01, DD-02)
// ---------------------------------------------------------------------------

export async function readModelSubgraph(
  driver: Driver,
  modelId: string,
  opts?: ScopeOpts,
): Promise<ModelSubgraph> {
  // Model-existence gate FIRST (cold-pass B-01): unknown model →
  // 404 model_not_found (thrown by getModel). An existing model with an
  // EMPTY scoped set returns a valid empty subgraph (200 rows:[] at the
  // handler — AC-01/AC-12), never a 404.
  await getModel(driver, modelId);
  const scoped = opts?.scoped ?? (await scopedNodeIds(driver, modelId));
  const scopedIds = [...scoped];

  const activities: ScoreActivity[] = [];
  const precedes: ScoreEdge[] = [];
  const attributesById = new Map<string, string>();

  if (scopedIds.length > 0) {
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      // Activities in scope + journey + UNFILTERED shared Role/System
      // (DD-02(c): Role/System are never in the scoped set; filtering
      // them would zero every handoff). The journey is AGGREGATED
      // (final-review C-02) so a multi-journey-parent activity cannot
      // fan out into duplicate rows — the grouping key is the activity.
      const actResult = await session.run(
        `MATCH (a:Activity) WHERE a.id IN $scopedIds
         OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
         OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
         OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)
         RETURN a.id AS id, a.name AS name,
                coalesce(a.createdAt, "~") AS createdAt,
                a.attributes_json AS attributesJson,
                [x IN collect(DISTINCT j) WHERE x IS NOT NULL | {id: x.id, name: x.name}] AS journeys,
                [x IN collect(DISTINCT r.id) WHERE x IS NOT NULL] AS roleIds,
                [x IN collect(DISTINCT sys.id) WHERE x IS NOT NULL] AS systemIds`,
        { scopedIds },
      );
      for (const rec of actResult.records) {
        const id = rec.get("id") as string;
        const journeys = (
          rec.get("journeys") as Array<{ id: string; name: string }>
        ).slice();
        // Deterministic single parent: lowest journey id wins
        // (final-review C-02); null/null when the list is empty.
        journeys.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const journey = journeys[0] ?? null;
        activities.push({
          id,
          name: (rec.get("name") as string | null) ?? "",
          createdAt: rec.get("createdAt") as string,
          journeyId: journey?.id ?? null,
          journeyName: journey?.name ?? null,
          roleIds: rec.get("roleIds") as string[],
          systemIds: rec.get("systemIds") as string[],
        });
        attributesById.set(id, (rec.get("attributesJson") as string | null) ?? "{}");
      }

      // PRECEDES — BOTH endpoints scoped (DD-02(b), NFR-01); self-loops
      // excluded + parallel edges collapsed (design C-05).
      const edgeResult = await session.run(
        `MATCH (p:Activity)-[:PRECEDES]->(q:Activity)
         WHERE p.id IN $scopedIds AND q.id IN $scopedIds AND p.id <> q.id
         RETURN DISTINCT p.id AS fromId, q.id AS toId`,
        { scopedIds },
      );
      for (const rec of edgeResult.records) {
        precedes.push({
          fromId: rec.get("fromId") as string,
          toId: rec.get("toId") as string,
        });
      }
    } finally {
      await session.close();
    }
  }

  return {
    activities,
    precedes,
    weights: { ...DEFAULT_WEIGHTS },
    attributesById,
  };
}

// ---------------------------------------------------------------------------
// T-04 — scores orchestrator + live-mark attach (FR-01, FR-06, §4.4)
// ---------------------------------------------------------------------------

export async function computeScores(
  driver: Driver,
  modelId: string,
  opts?: ScopeOpts,
): Promise<KeyActivityScores> {
  const subgraph = await readModelSubgraph(driver, modelId, opts);
  const { rows, meta } = scoreActivities(subgraph);

  // Attach live marks (FR-01): parse each activity's attributes_json and
  // validate attributes.keyActivity against keyActivityMarkSchema.
  // Read-path tolerance (design C-04): ANY stored value that fails the
  // parse — wrong shape, missing scoreSnapshot, marked:false — renders
  // as unmarked (key:null) with a warn log; the node attribute is left
  // untouched (the T-05 write is the only mutator).
  for (const row of rows) {
    const raw = subgraph.attributesById.get(row.id);
    if (!raw) continue;
    let attrs: Record<string, unknown>;
    try {
      attrs = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.warn(`[key-activities] unparseable attributes_json on Activity ${row.id}`);
      continue;
    }
    if (attrs.keyActivity === undefined) continue;
    const parsed = keyActivityMarkSchema.safeParse(attrs.keyActivity);
    if (parsed.success) {
      row.key = parsed.data;
    } else {
      console.warn(
        `[key-activities] Activity ${row.id} carries a keyActivity value that fails keyActivityMarkSchema — treated as unmarked (design C-04)`,
      );
    }
  }

  return { rows, meta };
}

// ---------------------------------------------------------------------------
// T-05 — mark / unmark: attribute-preserving lock-first write
// (FR-07, FR-08, FR-09, NFR-02, NFR-03, DD-05, cold-pass B-01/C-03)
// ---------------------------------------------------------------------------

// Gate sequencing (cold-pass B-01): 404 model_not_found (unknown model,
// from getModel) BEFORE any activity check; then a single read confirms
// activityId ∈ scoped AND labelled Activity → else 404 activity_not_found
// (cross-model / non-existent — no cross-model mark, AC-08).
async function gateScopedActivity(
  driver: Driver,
  modelId: string,
  activityId: string,
): Promise<Set<string>> {
  await getModel(driver, modelId);
  const scoped = await scopedNodeIds(driver, modelId); // computed ONCE (pass-2 C-03)
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (a:Activity {id: $activityId}) WHERE a.id IN $scopedIds RETURN a.id AS id`,
      { activityId, scopedIds: [...scoped] },
    );
    if (r.records.length === 0) {
      throw new ValidationError("activity_not_found", { modelId, activityId }, 404);
    }
  } finally {
    await session.close();
  }
  return scoped;
}

// Lock-first read-merge-write in ONE tx (cold-pass C-03): the merge is
// done in JS (no APOC). Statement 1's no-op SET acquires the node's
// exclusive lock BEFORE the read (a plain MATCH…RETURN takes no lock
// under read-committed), so a concurrent PATCH /nodes/Activity/:id
// cannot interleave a lost update; statement 2 writes the merged map
// under the same lock. `mutate` returns the merged attrs, or null to
// SKIP statement 2 entirely (the final-review N-02 true no-op —
// attributes AND updatedAt untouched).
async function lockFirstMergeWrite(
  driver: Driver,
  activityId: string,
  now: string,
  mutate: (attrs: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    await session.executeWrite(async (tx) => {
      const read = await tx.run(
        `MATCH (a:Activity {id: $activityId})
         SET a.updatedAt = a.updatedAt
         RETURN a.attributes_json AS attributesJson`,
        { activityId },
      );
      const rec = read.records[0];
      if (!rec) throw new ValidationError("activity_not_found", { activityId }, 404);
      const raw = (rec.get("attributesJson") as string | null) ?? "{}";
      let attrs: Record<string, unknown>;
      try {
        attrs = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        attrs = {};
      }
      const merged = mutate(attrs);
      if (merged === null) return; // true no-op (final-review N-02)
      await tx.run(
        `MATCH (a:Activity {id: $activityId})
         SET a.attributes_json = $merged, a.updatedAt = $now`,
        { activityId, merged: JSON.stringify(merged), now },
      );
    });
  } finally {
    await session.close();
  }
}

export async function markActivity(
  driver: Driver,
  modelId: string,
  activityId: string,
): Promise<ActivityScoreRow> {
  // 1. Gates: model_not_found → activity_not_found (cold-pass B-01).
  const scoped = await gateScopedActivity(driver, modelId, activityId);

  // 2. Snapshot LIVE scores — server-computed, never client-supplied
  //    (§3.2); threads the step-1 scoped set so scopedNodeIds runs once
  //    per mark (pass-2 C-03). Best-effort point-in-time read, not
  //    tx-consistent with step 3 — acceptable by design (C-01/§4.5): the
  //    mark is evidence-at-mark-time and the live GET always recomputes.
  const { rows } = await computeScores(driver, modelId, { scoped });
  const row = rows.find((r) => r.id === activityId);
  if (!row) {
    // Defensive: the gate proved membership; a vanishing activity
    // between the two reads surfaces as not-found.
    throw new ValidationError("activity_not_found", { modelId, activityId }, 404);
  }

  const now = new Date().toISOString();
  const mark: KeyActivityMark = keyActivityMarkSchema.parse({
    marked: true,
    markedAt: now,
    scoreSnapshot: { ...row.scores, composite: row.composite },
    rank: row.rank,
  });

  // 3. Lock-first read-merge-write — every other attribute is preserved
  //    byte-for-byte (only the keyActivity key is added/replaced, AC-06).
  //    No assertAttributesMatchSchema runs here (deliberate bypass, DD-05).
  await lockFirstMergeWrite(driver, activityId, now, (attrs) => {
    attrs.keyActivity = mark;
    return attrs;
  });

  return { ...row, key: mark };
}

export async function unmarkActivity(
  driver: Driver,
  modelId: string,
  activityId: string,
): Promise<void> {
  await gateScopedActivity(driver, modelId, activityId);
  const now = new Date().toISOString();
  await lockFirstMergeWrite(driver, activityId, now, (attrs) => {
    if (!("keyActivity" in attrs)) {
      // Idempotent TRUE no-op (final-review N-02, FR-08): skip
      // statement 2 — attributes AND updatedAt untouched, still 204.
      return null;
    }
    delete attrs.keyActivity;
    return attrs; // byte-equal restore of the pre-mark map (NFR-03, AC-07)
  });
}
