/**
 * AI-candidate report (FR-07, cto-analytics design §7.2, T-13).
 *
 * Surfaces `Activity` nodes that are automation candidates under a **rule-based**
 * definition (RD-4 / RD-4a — no LLM; analytics adopts chat's `leverage_score`
 * ranking so analytics ≡ chat). An activity is a candidate when its attributes
 * satisfy the `analytics_ai_candidate_definition`:
 *
 *   attributes[repetition_key]  == repetition_match      (default: repetition == "high")
 *   AND attributes[richness_key] == richness_match        (default: data_richness == "high")
 *   AND attributes[leverage_score_key] >= leverage_min    (default: leverage_score >= 0.5)
 *
 * The definition is the **code-default** constant `ANALYTICS_AI_CANDIDATE_DEFINITION`
 * served by T-14's scaffold (design §10.2, RD-6) — the runtime-tunable
 * `analytics_settings` subsystem is deferred with FR-11 to
 * `cto-analytics-reporting`, so this module depends on no deferred task. The
 * definition is a parameter so a reconfigured definition (AC-07 b) is testable.
 *
 * Each candidate carries the activity, its parent `UserJourney`, the distinct
 * `System` nodes it uses (`USES_SYSTEM`), the distinct `Role` nodes that
 * `EXECUTES` it, and the numeric `leverage_score` used for the DESC ranking.
 *
 * CSV export (AC-07 c): `toCsv()` emits an RFC 4180 document with a UTF-8
 * byte-order-mark prefix (`﻿`) and CRLF line endings, quoting any field
 * that contains a comma, quote, CR, or LF.
 *
 * RD-1 (design §4 DD-02): reads the live graph through the shared read-only
 * module `api/src/neo4j/read-only-graph.ts` — no direct `getDriver()` /
 * `driver.session()` here (AC-11; guard test T-19). No write imports (AC-12).
 */

import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";
import { ANALYTICS_AI_CANDIDATE_DEFINITION } from "./routes";

const ACTIVITY_LABEL = "Activity";
const SYSTEM_LABEL = "System";
const ROLE_LABEL = "Role";
const JOURNEY_LABEL = "UserJourney";
const PART_OF = "PART_OF";
const USES_SYSTEM = "USES_SYSTEM";
const EXECUTES = "EXECUTES";

/** The rule-based AI-candidate definition (RD-4a). Matches the code-default `ANALYTICS_AI_CANDIDATE_DEFINITION`. */
export interface AiCandidateDefinition {
  repetition_key: string;
  repetition_match: string;
  richness_key: string;
  richness_match: string;
  leverage_score_key: string;
  leverage_min: number;
}

/** The code-default definition (design §10.2, RD-4a) — re-exported for the view + tests. */
export const DEFAULT_AI_CANDIDATE_DEFINITION: AiCandidateDefinition = {
  repetition_key: ANALYTICS_AI_CANDIDATE_DEFINITION.repetition_key,
  repetition_match: ANALYTICS_AI_CANDIDATE_DEFINITION.repetition_match,
  richness_key: ANALYTICS_AI_CANDIDATE_DEFINITION.richness_key,
  richness_match: ANALYTICS_AI_CANDIDATE_DEFINITION.richness_match,
  leverage_score_key: ANALYTICS_AI_CANDIDATE_DEFINITION.leverage_score_key,
  leverage_min: ANALYTICS_AI_CANDIDATE_DEFINITION.leverage_min,
};

export interface AiCandidateRef {
  id: string;
  name: string;
}

export interface AiCandidate {
  activityId: string;
  activityName: string;
  /** Parent journey (via `Activity-[:PART_OF]->UserJourney`), or null if unattached. */
  journey: AiCandidateRef | null;
  /** Distinct systems the activity uses (USES_SYSTEM), sorted by name. */
  systems: AiCandidateRef[];
  /** Distinct roles that EXECUTES the activity, sorted by name. */
  roles: AiCandidateRef[];
  /** The repetition attribute value (context). */
  repetition: string;
  /** The data-richness attribute value (context). */
  dataRichness: string;
  /** The numeric leverage score — the DESC ranking key (AC-07 a). */
  leverageScore: number;
}

export interface AiCandidateReport {
  report: "ai-candidates";
  definition: AiCandidateDefinition;
  candidates: AiCandidate[];
}

/** Parse an Activity's `attributes_json` STRING (graph-core storage) into a map. */
function parseAttributes(node: GraphNode): Record<string, unknown> | undefined {
  const props = node.properties;
  const raw =
    props && typeof props === "object"
      ? (props as Record<string, unknown>).attributes_json
      : undefined;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pure computation over an already-loaded graph — exported so the FR-07 filter
 * is unit-testable without a live Neo4j. Applies the rule-based definition to
 * every Activity's attributes, attaches the journey/systems/roles context, and
 * sorts the survivors by `leverage_score` DESC (AC-07 a).
 */
export function computeAiCandidates(
  nodes: GraphNode[],
  edges: GraphEdge[],
  definition: AiCandidateDefinition = DEFAULT_AI_CANDIDATE_DEFINITION,
): AiCandidateReport {
  const nameById = new Map<string, string>();
  const activityIds = new Set<string>();
  const systemIds = new Set<string>();
  const roleIds = new Set<string>();
  const journeyIds = new Set<string>();
  const attrsByActivity = new Map<string, Record<string, unknown>>();

  for (const n of nodes) {
    nameById.set(n.id, n.name);
    if (n.label === ACTIVITY_LABEL) {
      activityIds.add(n.id);
      const attrs = parseAttributes(n);
      if (attrs) attrsByActivity.set(n.id, attrs);
    } else if (n.label === SYSTEM_LABEL) systemIds.add(n.id);
    else if (n.label === ROLE_LABEL) roleIds.add(n.id);
    else if (n.label === JOURNEY_LABEL) journeyIds.add(n.id);
  }

  const journeyByActivity = new Map<string, string>();
  const systemsByActivity = new Map<string, Set<string>>();
  const rolesByActivity = new Map<string, Set<string>>();

  for (const e of edges) {
    if (e.type === PART_OF) {
      if (!activityIds.has(e.source) || !journeyIds.has(e.target)) continue;
      if (!journeyByActivity.has(e.source)) journeyByActivity.set(e.source, e.target);
    } else if (e.type === USES_SYSTEM) {
      if (!activityIds.has(e.source) || !systemIds.has(e.target)) continue;
      let set = systemsByActivity.get(e.source);
      if (!set) {
        set = new Set<string>();
        systemsByActivity.set(e.source, set);
      }
      set.add(e.target);
    } else if (e.type === EXECUTES) {
      // Role -[:EXECUTES]-> Activity (schema direction).
      if (!roleIds.has(e.source) || !activityIds.has(e.target)) continue;
      let set = rolesByActivity.get(e.target);
      if (!set) {
        set = new Set<string>();
        rolesByActivity.set(e.target, set);
      }
      set.add(e.source);
    }
  }

  const refs = (ids: Set<string> | undefined): AiCandidateRef[] =>
    [...(ids ?? new Set<string>())]
      .map((id) => ({ id, name: nameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const candidates: AiCandidate[] = [];
  for (const activityId of activityIds) {
    const attrs = attrsByActivity.get(activityId);
    if (!attrs) continue;

    const repetition = attrs[definition.repetition_key];
    const richness = attrs[definition.richness_key];
    const leverage = attrs[definition.leverage_score_key];

    // Rule: repetition match AND richness match AND leverage >= threshold.
    if (repetition !== definition.repetition_match) continue;
    if (richness !== definition.richness_match) continue;
    if (typeof leverage !== "number" || leverage < definition.leverage_min) continue;

    const journeyId = journeyByActivity.get(activityId);
    const journey: AiCandidateRef | null =
      journeyId !== undefined
        ? { id: journeyId, name: nameById.get(journeyId) ?? journeyId }
        : null;

    candidates.push({
      activityId,
      activityName: nameById.get(activityId) ?? activityId,
      journey,
      systems: refs(systemsByActivity.get(activityId)),
      roles: refs(rolesByActivity.get(activityId)),
      repetition: typeof repetition === "string" ? repetition : String(repetition),
      dataRichness: typeof richness === "string" ? richness : String(richness),
      leverageScore: leverage,
    });
  }

  // AC-07 a: sort by leverage_score DESC; deterministic name tiebreak.
  candidates.sort(
    (a, b) => b.leverageScore - a.leverageScore || a.activityName.localeCompare(b.activityName),
  );

  return { report: "ai-candidates", definition, candidates };
}

// ── CSV export (AC-07 c — RFC 4180, UTF-8 BOM, CRLF) ─────────────────────────

/** UTF-8 byte-order-mark so Excel reads the CSV as UTF-8 (AC-07 c; requirements §Risk 7). */
export const CSV_BOM = "﻿";

/** RFC 4180 field quoting: quote when the field contains a comma, quote, CR, or LF. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const AI_CANDIDATE_CSV_HEADER = [
  "activity_id",
  "activity_name",
  "journey_name",
  "systems",
  "roles",
  "repetition",
  "data_richness",
  "leverage_score",
] as const;

/**
 * Serialise candidates to an RFC 4180 CSV string prefixed with a UTF-8 BOM and
 * using CRLF line endings (AC-07 c). System / role lists are joined with `; `
 * inside a single quoted field so the row shape stays fixed.
 */
export function toCsv(candidates: AiCandidate[]): string {
  const CRLF = "\r\n";
  const lines: string[] = [];
  lines.push(AI_CANDIDATE_CSV_HEADER.map(csvField).join(","));
  for (const c of candidates) {
    lines.push(
      [
        c.activityId,
        c.activityName,
        c.journey ? c.journey.name : "",
        c.systems.map((s) => s.name).join("; "),
        c.roles.map((r) => r.name).join("; "),
        c.repetition,
        c.dataRichness,
        String(c.leverageScore),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return CSV_BOM + lines.join(CRLF) + CRLF;
}

/** Reads the live graph via the shared read-only module and computes the report. */
export async function runAiCandidates(
  definition: AiCandidateDefinition = DEFAULT_AI_CANDIDATE_DEFINITION,
): Promise<AiCandidateReport> {
  const { nodes, edges } = await fetchGraph();
  return computeAiCandidates(nodes, edges, definition);
}
