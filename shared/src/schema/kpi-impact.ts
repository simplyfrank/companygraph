// kpi-impact-mapping T-01 (design §3.2–§3.4) — REST-boundary + response
// zod schemas. Consumes — never edits — shared/src/schema/kpi-sla.ts.
// En-US identifiers, zod only.

import { z } from "zod";

// §3.2 — direction enum (DD-01: extends ALIGNED_TO with a `direction` property)
export const impactDirectionSchema = z.enum(["increases", "decreases"]);

// §3.2 — activity-link create body
export const activityLinkCreateSchema = z.object({
  activityId: z.string().min(1),
  kpiId: z.string().min(1),
  direction: impactDirectionSchema,
  weight: z.number().min(0).max(1),
  attributionType: z.enum(["direct", "indirect", "leading", "lagging"]).optional(),
  notes: z.string().max(500).optional(),
});

// §3.3 — story-link create body
export const storyLinkCreateSchema = z.object({
  storyId: z.string().min(1),
  kpiId: z.string().min(1),
  direction: impactDirectionSchema,
  weight: z.number().min(0).max(1),
  notes: z.string().max(500).optional(),
});

// §3.2 — link row (response). direction:null for a pre-existing undirected
// base-route ALIGNED_TO (NFR-03).
export const impactLinkRowSchema = z.object({
  linkId: z.string(),
  sourceId: z.string(),
  sourceName: z.string().nullable(),
  kpiId: z.string(),
  kpiName: z.string().nullable(),
  direction: impactDirectionSchema.nullable(),
  weight: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
});

// §3.4 — matrix cell: null = no ALIGNED_TO for the pair
export const matrixCellSchema = z.object({
  direction: impactDirectionSchema.nullable(),
  weight: z.number().nullable(),
}).nullable();

export const matrixActivityRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  journeyName: z.string().nullable(),
  isKeyActivity: z.boolean(),
  storyLinkCount: z.number().int(),
});

export const matrixKpiColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  targetDirection: z.string().nullable(),
});

export const gapSchema = z.object({
  activityId: z.string(),
  activityName: z.string(),
  journeyName: z.string().nullable(),
  reason: z.literal("key_activity_no_kpi"),
});

export const kpiImpactMatrixSchema = z.object({
  rows: z.array(matrixActivityRowSchema),
  columns: z.array(matrixKpiColumnSchema),
  cells: z.array(z.array(matrixCellSchema)),
  gaps: z.array(gapSchema),
  meta: z.object({
    activityCount: z.number().int(),
    kpiCount: z.number().int(),
    linkedCellCount: z.number().int(),
    keyActivityCount: z.number().int(),
    gapCount: z.number().int(),
  }),
});

// §3.4 — roll-up
export const rollupRowSchema = z.object({
  kpiId: z.string(),
  kpiName: z.string().nullable(),
  unit: z.string().nullable(),
  targetValue: z.number().nullable(),
  targetDirection: z.string().nullable(),
  latestValue: z.number().nullable(),
  status: z.enum(["on_track", "warning", "critical", "no_data"]),
  impactLinkCount: z.number().int(),
  aggregateImpactWeight: z.number(),
});

export const kpiImpactRollupSchema = z.object({
  rows: z.array(rollupRowSchema),
  meta: z.object({
    kpiCount: z.number().int(),
    measurementsAvailable: z.boolean(),
  }),
});

// Inferred TS types for api client (T-13) + storage/derive modules
export type ImpactDirection = z.infer<typeof impactDirectionSchema>;
export type ActivityLinkCreate = z.infer<typeof activityLinkCreateSchema>;
export type StoryLinkCreate = z.infer<typeof storyLinkCreateSchema>;
export type ImpactLinkRow = z.infer<typeof impactLinkRowSchema>;
export type MatrixCell = z.infer<typeof matrixCellSchema>;
export type KpiImpactMatrix = z.infer<typeof kpiImpactMatrixSchema>;
export type KpiImpactRollup = z.infer<typeof kpiImpactRollupSchema>;
export type RollupRow = z.infer<typeof rollupRowSchema>;
export type Gap = z.infer<typeof gapSchema>;
