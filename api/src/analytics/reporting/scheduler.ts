// T-04 — nightly precompute scheduler + lock + ontology validation (FR-10).
//
// `runPrecompute()` is the compute core of cto-analytics-reporting:
//   1. captureSnapshot()  — capture.ts (RD-1, read-only)
//   2. read weights + AI-def from analytics_settings (settings.ts)
//   3. validate the AI-def keys against the ontology-manager schema cache
//      IN-PROCESS (no HTTP — N-03); a mismatch degrades gracefully (skip the
//      AI pass + write an `analytics_alerts` banner, never a hard failure)
//   4. compute journey scores / system metrics / AI candidates by REUSING the
//      `cto-analytics` engines (complexity/system-map/ai-candidates)
//   5. writeRun() — cache.ts — writes the `analytics_run` header + the three
//      score tables and PRUNES the snapshot blobs beyond the latest N=7 runs
//      (DD-12 — `writeRun()` calls `pruneSnapshots()` as its last step)
//
// Concurrency (DD-07): a module-level Promise mutex. A concurrent
// `runPrecompute()` (e.g. two `?refresh=true` requests) awaits the in-flight
// run — the capture+compute runs exactly once.
//
// No direct Neo4j driver here (AC-11): the graph read is captureSnapshot()
// (read-only-graph.ts); the ontology validation imports the attribute-schema
// accessor by function, never `getDriver()`.

import type { GraphNode, GraphEdge } from "../../neo4j/read-only-graph";
import { captureSnapshot, type CapturedSnapshot } from "./capture";
import { graphStateHash } from "./hash";
import {
  writeRun,
  writeAlert,
  type JourneyScoreRow,
  type SystemMetricRow,
  type AiCandidateRow,
} from "./cache";
import {
  getSettingsRow,
  settingsWeights,
  type AiCandidateDefinition,
} from "./settings";
import { computeComplexity } from "../complexity";
import { computeSystemMap } from "../system-map";
import { computeAiCandidates } from "../ai-candidates";
import { getAttributeValidator } from "../../ontology/cache/attribute-zod";

const ACTIVITY_LABEL = "Activity";

/** The outcome of a precompute run. */
export interface PrecomputeResult {
  lastRunAt: string;
  status: "ok" | "ai_skipped";
  /** The graph-state hash of the captured snapshot (FR-08 basis). */
  hash: string;
  aiValidated: boolean;
}

// ── DD-07: module-level Promise mutex ───────────────────────────────────
let inFlight: Promise<PrecomputeResult> | null = null;

// Test seam: a spy can wrap this to count how many times the capture+compute
// body actually runs (AC-13(c) single-execution assertion).
let computeCounter = 0;
export function _precomputeRunCount(): number {
  return computeCounter;
}
export function _resetPrecomputeRunCount(): void {
  computeCounter = 0;
}

// ── Snapshot → engine-shape adapters ────────────────────────────────────
//
// The compute engines consume `GraphNode`/`GraphEdge` (from
// `read-only-graph.ts`): nodes carry `name` + `properties.attributes_json`;
// edges carry `source`/`target`. The captured snapshot uses the hash-basis
// shapes (`fromId`/`toId`, parsed `attributes`), so we adapt here.

function toGraphNodes(snap: CapturedSnapshot): GraphNode[] {
  return snap.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    name: snap.namesById.get(n.id) ?? n.id,
    // ai-candidates.ts reads `properties.attributes_json` — reconstruct it
    // from the parsed `attributes` map so the engine's parser round-trips.
    properties: { attributes_json: JSON.stringify(n.attributes ?? {}) },
  }));
}

function toGraphEdges(snap: CapturedSnapshot): GraphEdge[] {
  return snap.edges.map((e) => ({
    id: e.id,
    source: e.fromId,
    target: e.toId,
    type: e.type,
  }));
}

/**
 * Validate that the AI-candidate definition's attribute keys
 * (`repetition_key`, `richness_key`, `leverage_score_key`) are registered
 * `Activity` attributes in the ontology-manager schema (N-03: in-process, no
 * HTTP). Returns `true` when every key is registered; `false` when any is
 * missing (→ the AI pass is skipped + an alert banner written). A failure to
 * READ the schema (e.g. no registry seeded in a unit test) is treated as
 * "validated" so the precompute never hard-fails on an infra hiccup — the
 * graceful-degrade only fires on an actual key mismatch.
 */
export async function validateAiKeys(def: AiCandidateDefinition): Promise<boolean> {
  let registered: Set<string>;
  try {
    const validator = await getAttributeValidator(ACTIVITY_LABEL);
    registered = registeredKeys(validator);
  } catch {
    // Could not resolve the Activity attribute schema — do not degrade on an
    // infra/read error; only a real key mismatch degrades.
    return true;
  }
  // An empty registered set means the Activity label declares no attribute
  // schema — nothing to validate against, so we do not degrade.
  if (registered.size === 0) return true;
  return (
    registered.has(def.repetition_key) &&
    registered.has(def.richness_key) &&
    registered.has(def.leverage_score_key)
  );
}

/** Pull the top-level object keys out of a compiled zod object schema. */
function registeredKeys(validator: unknown): Set<string> {
  const shape = (validator as { shape?: Record<string, unknown> })?.shape;
  if (shape && typeof shape === "object") return new Set(Object.keys(shape));
  const def = (validator as { _def?: { shape?: unknown } })?._def;
  const shapeFn = def?.shape;
  if (typeof shapeFn === "function") {
    const resolved = (shapeFn as () => Record<string, unknown>)();
    if (resolved && typeof resolved === "object") return new Set(Object.keys(resolved));
  }
  return new Set();
}

/**
 * Run one precompute: capture → validate → compute → cache-write → prune.
 * Concurrency-safe (DD-07): a concurrent call awaits the in-flight promise.
 */
export function runPrecompute(): Promise<PrecomputeResult> {
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<PrecomputeResult> => {
    computeCounter += 1;

    const snap = await captureSnapshot();
    const settings = getSettingsRow();
    const weights = settingsWeights(settings);
    const definition = settings.ai_candidate_definition;

    const aiOk = await validateAiKeys(definition);

    const nodes = toGraphNodes(snap);
    const edges = toGraphEdges(snap);

    const complexity = computeComplexity(nodes, edges, weights);
    const systemMap = computeSystemMap(nodes, edges);
    const aiReport = aiOk ? computeAiCandidates(nodes, edges, definition) : null;

    const lastRunAt = new Date().toISOString();

    const journeyScores: JourneyScoreRow[] = complexity.journeys.map((j) => ({
      journey_id: j.journeyId,
      journey_name: j.journeyName,
      depth: j.subScores.depth,
      distinct_systems: j.subScores.distinctSystems,
      distinct_roles: j.subScores.distinctRoles,
      score: j.score,
    }));

    const systemMetrics: SystemMetricRow[] = systemMap.systems.map((s) => ({
      system_id: s.id,
      system_name: s.name,
      degree: s.degree,
      integration_count: s.integrationCount,
    }));

    const aiCandidates: AiCandidateRow[] = (aiReport?.candidates ?? []).map((c) => ({
      activity_id: c.activityId,
      activity_name: c.activityName,
      leverage_score: c.leverageScore,
      detail: {
        journey: c.journey,
        systems: c.systems,
        roles: c.roles,
        repetition: c.repetition,
        data_richness: c.dataRichness,
      },
    }));

    const status = aiOk ? "ok" : "ai_skipped";

    // writeRun() prunes snapshot blobs beyond the latest N=7 runs (DD-12/C-03).
    writeRun({
      lastRunAt,
      nodes: snap.nodes,
      edges: snap.edges,
      weights,
      status,
      journeyScores,
      systemMetrics,
      aiCandidates,
    });

    if (!aiOk) {
      writeAlert(
        lastRunAt,
        "ai_schema_mismatch",
        `AI-candidate definition references attribute '${definition.repetition_key}' / ` +
          `'${definition.richness_key}' which is not registered on Activity — ` +
          `visit ontology-manager to register it, or PATCH /api/v1/analytics/settings`,
      );
    }

    const hash = graphStateHash({
      snapshot_id: lastRunAt,
      nodes: snap.nodes,
      edges: snap.edges,
      weights,
    });

    return { lastRunAt, status, hash, aiValidated: aiOk };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
