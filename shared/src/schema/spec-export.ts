import { z } from "zod";

// requirements-export T-01 (FR-01, FR-04) — zod schemas for the
// assembled-document wire shape + the `?format` request schema.
// zod is the only validation library (house rule); en-US identifiers
// (NFR-05). This is the ONLY shared-schema file this spec adds; it
// does not edit nodes.ts / edges.ts (NFR-02, AC-14).

// ---------------------------------------------------------------------------
// Format negotiation (FR-04)
// ---------------------------------------------------------------------------

export const exportFormatSchema = z.enum(["json", "markdown"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const specExportQuerySchema = z.object({
  format: exportFormatSchema.optional(),
});
export type SpecExportQuery = z.infer<typeof specExportQuerySchema>;

// ---------------------------------------------------------------------------
// Per-section response schemas — each permits its empty shape so a
// degraded section (FR-03) still validates.
// ---------------------------------------------------------------------------

// model-workspace-core FR-05 response contract.
export const modelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isReference: z.boolean(),
});
export type ModelSummary = z.infer<typeof modelSummarySchema>;

// story-spec-core FR-05 response contract. Mirrors storyReadSchema's
// shape with embedded acceptanceCriteria (ordered Given/When/Then, XD-10).
export const acSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  given: z.string(),
  when: z.string(),
  then: z.string(),
  ordinal: z.number().int(),
  derived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attributes: z.record(z.unknown()),
});
export type AcRead = z.infer<typeof acSchema>;

export const storyWithAcsSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  persona: z.string().nullable(),
  action: z.string().nullable(),
  benefit: z.string().nullable(),
  narrative: z.string().nullable(),
  derived: z.boolean(),
  sourceActivityId: z.string().nullable(),
  activityId: z.string().nullable(),
  activityName: z.string().nullable(),
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
  acCount: z.number().int(),
  detached: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attributes: z.record(z.unknown()),
  acceptanceCriteria: z.array(acSchema),
});
export type StoryWithAcs = z.infer<typeof storyWithAcsSchema>;

// key-activity-optimizer FR-06 response contract.
export const keyActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  journeyId: z.string().nullable(),
  journeyName: z.string().nullable(),
  rank: z.number().int().positive(),
  composite: z.number(),
  scores: z.object({
    centrality: z.number(),
    criticalPath: z.number(),
    handoff: z.number(),
  }),
  evidence: z.record(z.unknown()),
  key: z.object({
    marked: z.boolean(),
    markedAt: z.string().nullable(),
    scoreSnapshot: z.object({
      centrality: z.number(),
      criticalPath: z.number(),
      handoff: z.number(),
      composite: z.number(),
    }).nullable(),
    rank: z.number().int().nullable(),
  }).nullable(),
});
export type KeyActivityRow = z.infer<typeof keyActivitySchema>;

// kpi-impact-mapping FR-05/FR-06/FR-08 response contract.
// Mirrors the documented response shape; the upstream spec has not
// landed yet, so this is a local mirror with a comment. A change
// surfaces as a failing T-07 integration test (requirements Risk-3).
export const kpiImpactSectionSchema = z.object({
  matrix: z.array(
    z.object({
      activityId: z.string(),
      activityName: z.string(),
      kpiId: z.string(),
      kpiName: z.string(),
      direction: z.string(),
      strength: z.number(),
    }),
  ),
  gaps: z.array(
    z.object({
      activityId: z.string(),
      activityName: z.string(),
      kpiId: z.string(),
      kpiName: z.string(),
      reason: z.string(),
    }),
  ),
  rollup: z.object({
    totalLinks: z.number().int(),
    coveredKpis: z.number().int(),
    totalKpis: z.number().int(),
    coverageRatio: z.number(),
  }),
});
export type KpiImpactSection = z.infer<typeof kpiImpactSectionSchema>;

// ddd-system-modeling FR-04/FR-07/FR-09 response contract.
export const systemModelSectionSchema = z.object({
  capabilities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      neededByCount: z.number().int(),
      supportingSystemCount: z.number().int(),
      assignedContextId: z.string().nullable(),
      assignedContextName: z.string().nullable(),
    }),
  ),
  gaps: z.object({
    unsupportedSteps: z.array(z.record(z.unknown())),
    capabilityGaps: z.array(z.record(z.unknown())),
    capabilitiesWithoutSystem: z.array(z.record(z.unknown())),
    orphanSystems: z.array(z.record(z.unknown())),
  }),
  contextMap: z.object({
    contexts: z.array(z.record(z.unknown())),
    unassigned: z.array(z.record(z.unknown())),
  }),
});
export type SystemModelSection = z.infer<typeof systemModelSectionSchema>;

// ---------------------------------------------------------------------------
// Assembled document (FR-01)
// ---------------------------------------------------------------------------

export const specDocumentMetaSchema = z.object({
  generatedAt: z.string(),
  modelId: z.string(),
  counts: z.object({
    stories: z.number().int(),
    acceptanceCriteria: z.number().int(),
    keyActivities: z.number().int(),
    kpiLinks: z.number().int(),
    gaps: z.number().int(),
    capabilities: z.number().int(),
  }),
  degraded: z.record(z.string()).optional(),
});
export type SpecDocumentMeta = z.infer<typeof specDocumentMetaSchema>;

export const specDocumentSchema = z.object({
  model: modelSummarySchema,
  stories: z.array(storyWithAcsSchema),
  keyActivities: z.array(keyActivitySchema),
  kpiImpact: kpiImpactSectionSchema,
  systemModel: systemModelSectionSchema,
  meta: specDocumentMetaSchema,
});
export type SpecDocument = z.infer<typeof specDocumentSchema>;
