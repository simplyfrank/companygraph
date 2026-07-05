import { z } from "zod";

// key-activity-optimizer T-01 (design §3.2, §3.3, §5) — zod schemas
// for the REST boundary of the key-activity scoring/marking surface.
// zod is the only validation library (house rule); identifiers are
// en-US camelCase (DD-06 — this spec's own wire shape, NOT
// cto-analytics' snake_case).
//
// The `keyActivity` judgement is stored INSIDE the existing `Activity`
// node's open `attributes` map (XD-03, DD-05) — never a new label, a
// new edge type, or a top-level Neo4j property. `keyActivityMarkSchema`
// below is used both to validate the merged attribute at write time and
// to parse-on-read (a stored value that fails the parse — wrong shape,
// missing scoreSnapshot, or `marked:false` — is treated as unmarked,
// design C-04).
//
// The mark request has NO body and the unmark request has NO body
// (§3.2 — scores are snapshotted server-side, never client-supplied);
// both take only path params. No request-body schema exists for
// mark/unmark by design.

// ---------------------------------------------------------------------------
// Sub-scores (FR-02..FR-04) — each normalized to [0,1]
// ---------------------------------------------------------------------------

export const subScoresSchema = z.object({
  centrality: z.number().min(0).max(1),
  criticalPath: z.number().min(0).max(1),
  handoff: z.number().min(0).max(1),
});
export type SubScores = z.infer<typeof subScoresSchema>;

// ---------------------------------------------------------------------------
// The stored `attributes.keyActivity` mark (FR-07, FR-09, DD-05, XD-03)
// ---------------------------------------------------------------------------

export const keyActivityMarkSchema = z.object({
  marked: z.literal(true),
  markedAt: z.string().datetime(),
  scoreSnapshot: subScoresSchema.extend({ composite: z.number() }),
  rank: z.number().int().positive(),
});
export type KeyActivityMark = z.infer<typeof keyActivityMarkSchema>;

// ---------------------------------------------------------------------------
// Score-response row (FR-06, DD-06) — one ranked activity
// ---------------------------------------------------------------------------

export const activityScoreRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  journeyId: z.string().nullable(), // parent UserJourney via PART_OF
  journeyName: z.string().nullable(),
  rank: z.number().int().positive(), // 1-based, composite desc
  composite: z.number(),
  scores: subScoresSchema, // the three normalized [0,1] sub-scores
  evidence: z.object({
    centrality: z.object({
      betweenness: z.number(),
      inDegree: z.number().int(),
      outDegree: z.number().int(),
    }),
    criticalPath: z.object({
      onCriticalPath: z.boolean(),
      longestChainDepth: z.number().int(),
      criticalPathLength: z.number().int(),
    }),
    handoff: z.object({
      handoffCount: z.number().int(),
      roleHandoffs: z.number().int(),
      systemHandoffs: z.number().int(),
    }),
  }),
  key: keyActivityMarkSchema.nullable(), // the stored mark, or null when unmarked
});
export type ActivityScoreRow = z.infer<typeof activityScoreRowSchema>;

// ---------------------------------------------------------------------------
// GET …/key-activities response (FR-06)
// ---------------------------------------------------------------------------

// The response carries NO recommendation/suggestion field — this surface
// is descriptive-only (XD-11, NFR-04). Do not add one.
export const keyActivityScoresSchema = z.object({
  rows: z.array(activityScoreRowSchema),
  meta: z.object({
    activityCount: z.number().int(),
    hasCycle: z.boolean(),
    truncated: z.boolean().optional(),
    truncationReason: z.enum(["depth_cap", "path_budget", "wall_clock"]).optional(),
    weights: z.object({
      centrality: z.number(),
      criticalPath: z.number(),
      handoff: z.number(),
    }),
  }),
});
export type KeyActivityScores = z.infer<typeof keyActivityScoresSchema>;
