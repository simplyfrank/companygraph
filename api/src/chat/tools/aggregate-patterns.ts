import { z } from "zod";
import { NODE_LABELS } from "@companygraph/shared";
import { EDGE_TYPES } from "@companygraph/shared";

// FR-T08 / DD-16 — closed-enum aggregation patterns.
//
// Each pattern is a server-owned Cypher template. The LLM (or any caller)
// picks one by name and supplies typed params; NO free-form Cypher fragments
// are accepted (the rev-3.1 lock per B-04 of the requirements review).
//
// Storage note (CLAUDE.md): node + edge `attributes` are stored as a single
// JSON STRING property `attributes_json`. So all attribute-driven aggregates
// pull `attributes_json` from Cypher and JSON.parse + reduce in TypeScript.
// The Cypher half stays small, NULL-safe (filters rows with no attribute
// json), and free of any LLM-supplied string interpolation — labels and
// edge types are gated by zod `enum` against the schema tuple before any
// string reaches Cypher, then for `node_count_by_label` we use the
// `labels(n)[0]` trick so the label itself is bound as a parameter rather
// than interpolated into the statement (DD-16).

// Shape returned by an aggregate pattern. `group_key` is optional — single-
// value patterns (e.g. `node_count_by_label` for one label) omit it.
export interface AggRow {
  group_key?: string;
  value: number;
}

// Internal cypher-build return shape — `stmt` + bound params + a row
// mapper that converts the raw Neo4j rows into AggRow[]. The mapper is
// what gives us schema-store agnosticism: it parses `attributes_json` and
// computes percentiles / breaches / handoffs in TS rather than asking
// Cypher to do it against properties that don't exist as top-level keys.
interface PatternBuild {
  stmt: string;
  params: Record<string, unknown>;
  mapRows: (rows: Record<string, unknown>[]) => AggRow[];
}

interface PatternDef<TSchema extends z.ZodTypeAny> {
  params: TSchema;
  cypher: (p: z.infer<TSchema>) => PatternBuild;
}

// Helpers --------------------------------------------------------------

function parseAttrs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

// percentileCont over a sorted ascending array of numbers, p in [0, 1].
// Returns 0 if the input is empty (callers filter empty inputs upstream
// to produce zero rows instead).
function percentileCont(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

// Patterns -------------------------------------------------------------

const pathLatencyPNN: PatternDef<
  z.ZodObject<{
    journey_id: z.ZodString;
    percentile: z.ZodUnion<[z.ZodLiteral<50>, z.ZodLiteral<95>, z.ZodLiteral<99>]>;
  }>
> = {
  params: z.object({
    journey_id: z.string(),
    percentile: z.union([z.literal(50), z.literal(95), z.literal(99)]),
  }),
  cypher: (p) => {
    // Pull every PRECEDES edge whose source Activity is part of this journey;
    // we filter out rows with no attributes_json (NULL-safe) and parse the
    // observed_p99_ms in TS. The decimal is computed in TS, not Cypher, per
    // the task constraint.
    const percentile_decimal = p.percentile / 100;
    const stmt = `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney {id: $journey_id})
WITH a
MATCH (a)-[r:PRECEDES]->(:Activity)
WHERE r.attributes_json IS NOT NULL
RETURN r.attributes_json AS attrs`;
    return {
      stmt,
      params: { journey_id: p.journey_id },
      mapRows: (rows) => {
        const observed: number[] = [];
        for (const row of rows) {
          const attrs = parseAttrs(row.attrs);
          const v = toFiniteNumber(attrs.observed_p99_ms);
          if (v !== null) observed.push(v);
        }
        if (observed.length === 0) return [];
        observed.sort((a, b) => a - b);
        return [{ value: percentileCont(observed, percentile_decimal) }];
      },
    };
  },
};

const nodeCountByLabel: PatternDef<
  z.ZodObject<{ label: z.ZodEnum<typeof NODE_LABELS> }>
> = {
  // The zod enum here is the only gate; once zod accepts the value we know
  // it's one of NODE_LABELS, so binding it as a parameter + filtering via
  // `labels(n)[0] = $label` is safe and avoids any label string-injection
  // into the statement itself (DD-16).
  params: z.object({ label: z.enum(NODE_LABELS) }),
  cypher: (p) => ({
    stmt: `MATCH (n) WHERE labels(n)[0] = $label RETURN count(n) AS value`,
    params: { label: p.label },
    mapRows: (rows) => {
      const v = toFiniteNumber(rows[0]?.value);
      return [{ value: v ?? 0 }];
    },
  }),
};

const edgeCountByType: PatternDef<
  z.ZodObject<{ type: z.ZodEnum<typeof EDGE_TYPES> }>
> = {
  params: z.object({ type: z.enum(EDGE_TYPES) }),
  cypher: (p) => ({
    stmt: `MATCH ()-[r]->() WHERE type(r) = $type RETURN count(r) AS value`,
    params: { type: p.type },
    mapRows: (rows) => {
      const v = toFiniteNumber(rows[0]?.value);
      return [{ value: v ?? 0 }];
    },
  }),
};

const breachCountByJourney: PatternDef<
  z.ZodObject<{ status: z.ZodDefault<z.ZodEnum<["breach", "warn", "all"]>> }>
> = {
  params: z.object({
    status: z.enum(["breach", "warn", "all"]).default("all"),
  }),
  cypher: (p) => {
    // We pull edge attrs + journey id; the breach/warn classification runs
    // in TS because `sla_p99_ms` and `observed_p99_ms` live inside the
    // attributes_json string (NULL-safe: rows without the keys drop out).
    const stmt = `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)
MATCH (a)-[r:PRECEDES]->(:Activity)
WHERE r.attributes_json IS NOT NULL
RETURN j.id AS journey_id, r.attributes_json AS attrs`;
    return {
      stmt,
      params: {},
      mapRows: (rows) => {
        const counts = new Map<string, number>();
        for (const row of rows) {
          const journeyId = typeof row.journey_id === "string" ? row.journey_id : null;
          if (!journeyId) continue;
          const attrs = parseAttrs(row.attrs);
          const sla = toFiniteNumber(attrs.sla_p99_ms);
          const observed = toFiniteNumber(attrs.observed_p99_ms);
          if (sla === null || observed === null || sla === 0) continue;
          const delta = (observed - sla) / sla;
          let include = false;
          if (p.status === "all") include = true;
          else if (p.status === "breach") include = delta > 0;
          else if (p.status === "warn") include = delta > -0.1 && delta <= 0;
          if (include) {
            counts.set(journeyId, (counts.get(journeyId) ?? 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .map(([group_key, value]) => ({ group_key, value }))
          .sort((a, b) => b.value - a.value);
      },
    };
  },
};

const handoffCountByTeamPair: PatternDef<
  z.ZodObject<{
    from_team: z.ZodOptional<z.ZodString>;
    to_team: z.ZodOptional<z.ZodString>;
  }>
> = {
  params: z.object({
    from_team: z.string().optional(),
    to_team: z.string().optional(),
  }),
  cypher: (p) => {
    // `team` lives inside Activity.attributes_json (and/or Role.attributes_json).
    // Pull every PRECEDES hop and read the two endpoint Activities' attrs in TS.
    // The optional from_team / to_team params filter post-parse.
    const stmt = `MATCH (a1:Activity)-[:PRECEDES]->(a2:Activity)
WHERE a1.attributes_json IS NOT NULL AND a2.attributes_json IS NOT NULL
RETURN a1.attributes_json AS from_attrs, a2.attributes_json AS to_attrs`;
    const fromFilter = p.from_team;
    const toFilter = p.to_team;
    return {
      stmt,
      params: {},
      mapRows: (rows) => {
        const counts = new Map<string, number>();
        for (const row of rows) {
          const fromAttrs = parseAttrs(row.from_attrs);
          const toAttrs = parseAttrs(row.to_attrs);
          const fromTeam = typeof fromAttrs.team === "string" ? fromAttrs.team : null;
          const toTeam = typeof toAttrs.team === "string" ? toAttrs.team : null;
          if (!fromTeam || !toTeam) continue;
          if (fromTeam === toTeam) continue;
          if (fromFilter !== undefined && fromTeam !== fromFilter) continue;
          if (toFilter !== undefined && toTeam !== toFilter) continue;
          const key = `${fromTeam}->${toTeam}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([group_key, value]) => ({ group_key, value }))
          .sort((a, b) => b.value - a.value);
      },
    };
  },
};

const leverageScoreTopK: PatternDef<
  z.ZodObject<{
    k: z.ZodNumber;
    journey_id: z.ZodOptional<z.ZodString>;
  }>
> = {
  params: z.object({
    k: z.number().int().min(1).max(20),
    journey_id: z.string().optional(),
  }),
  cypher: (p) => {
    const params: Record<string, unknown> = { k: p.k };
    const journeyClause = p.journey_id
      ? `MATCH (a)-[:PART_OF]->(:UserJourney {id: $journey_id})`
      : "";
    if (p.journey_id) params.journey_id = p.journey_id;
    const stmt = `MATCH (a:Activity)
${journeyClause}
WHERE a.attributes_json IS NOT NULL
RETURN a.id AS id, a.attributes_json AS attrs`;
    return {
      stmt,
      params,
      mapRows: (rows) => {
        const scored: AggRow[] = [];
        for (const row of rows) {
          const id = typeof row.id === "string" ? row.id : null;
          if (!id) continue;
          const attrs = parseAttrs(row.attrs);
          const score = toFiniteNumber(attrs.leverage_score);
          if (score === null) continue;
          scored.push({ group_key: id, value: score });
        }
        scored.sort((a, b) => b.value - a.value);
        return scored.slice(0, p.k);
      },
    };
  },
};

// ---------------------------------------------------------------------

export const AGGREGATE_PATTERNS = {
  path_latency_pNN: pathLatencyPNN,
  node_count_by_label: nodeCountByLabel,
  edge_count_by_type: edgeCountByType,
  breach_count_by_journey: breachCountByJourney,
  handoff_count_by_team_pair: handoffCountByTeamPair,
  leverage_score_top_k: leverageScoreTopK,
} as const;

export type AggregatePatternName = keyof typeof AGGREGATE_PATTERNS;

export const AGGREGATE_PATTERN_NAMES = Object.keys(
  AGGREGATE_PATTERNS,
) as AggregatePatternName[];
