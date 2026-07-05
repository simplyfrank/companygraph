import { z } from "zod";
import { uuidv7 } from "./nodes";
import { SYSTEM_KINDS, systemKindSchema, type SystemKind } from "./system-kind";

// ddd-system-modeling T-01 (design §3.2, §3.3, §5, DD-15) — zod schemas
// for the REST boundary of the Capability / system-model surface. zod
// is the only validation library (house rule).
//
// A Capability carries ONLY the standard node envelope (DD-03) — no
// bespoke top-level props; the analysis joins on edges. `systemKind`
// values are imported from shared/src/schema/system-kind.ts — never a
// re-declared literal (NFR-03, XD-15).

// ---------------------------------------------------------------------------
// Capability (FR-01, FR-04)
// ---------------------------------------------------------------------------

export const capabilityCreateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .strict();
export type CapabilityCreateInput = z.infer<typeof capabilityCreateSchema>;

// PATCH — all optional; omitted fields are never clobbered (mirrors
// patchNode). `.parse({})` is valid.
export const capabilityPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .strict();
export type CapabilityPatchInput = z.infer<typeof capabilityPatchSchema>;

// Detail embeds (design §3.2). `neededBy` sources are Activity or
// UserStory (DD-04 — one NEEDS_CAPABILITY type, two endpoint pairs).
export const neededByItemSchema = z.object({
  kind: z.enum(["activity", "story"]),
  id: z.string(),
  name: z.string(),
});
export type NeededByItem = z.infer<typeof neededByItemSchema>;

export const supportedByItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemKind: systemKindSchema,
});
export type SupportedByItem = z.infer<typeof supportedByItemSchema>;

export const assignedContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  subdomain: z.string().nullable(),
});
export type AssignedContext = z.infer<typeof assignedContextSchema>;

// DD-13 — a mapping whose far-end node's expected label no longer
// matches (id reuse, partial import). Defensively-rendered read-model
// field; `[]` on the normal path.
export const detachedItemSchema = z.object({
  kind: z.enum(["needed-by", "supported-by", "context"]),
  targetId: z.string(),
});
export type DetachedItem = z.infer<typeof detachedItemSchema>;

// Read envelope — list rows carry the counts; detail additionally
// embeds the mapping arrays (design §3.2). Detail fields are optional
// so one schema serves both shapes.
export const capabilityReadSchema = z.object({
  id: uuidv7,
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attributes: z.record(z.unknown()),
  // list row
  neededByCount: z.number().int(),
  supportingSystemCount: z.number().int(),
  assignedContextId: z.string().nullable(),
  assignedContextName: z.string().nullable(),
  // detail embeds
  neededBy: z.array(neededByItemSchema).optional(),
  supportedBy: z.array(supportedByItemSchema).optional(),
  assignedContext: assignedContextSchema.nullable().optional(),
  detached: z.array(detachedItemSchema).optional(),
});
export type CapabilityRead = z.infer<typeof capabilityReadSchema>;

// ---------------------------------------------------------------------------
// Mapping bodies (FR-05)
// ---------------------------------------------------------------------------

// Exactly ONE of activityId / storyId (design §4.3). The `.refine`
// rejects both-present and neither-present.
export const neededBySchema = z
  .object({
    activityId: z.string().min(1).optional(),
    storyId: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (v) => (v.activityId === undefined) !== (v.storyId === undefined),
    { message: "exactly one of activityId or storyId is required" },
  );
export type NeededByInput = z.infer<typeof neededBySchema>;

export const supportedBySchema = z
  .object({ systemId: z.string().min(1) })
  .strict();
export type SupportedByInput = z.infer<typeof supportedBySchema>;

export const contextAssignSchema = z
  .object({ boundedContextId: z.string().min(1) })
  .strict();
export type ContextAssignInput = z.infer<typeof contextAssignSchema>;

// ---------------------------------------------------------------------------
// Support-gap analysis result (FR-07, FR-08, DD-15, DD-18)
// ---------------------------------------------------------------------------

// Step items carry the UserStorys that describe them (DD-15 — FR-07(a)'s
// "(and the UserStorys that describe them)" is in the payload,
// deep-linkable).
export const gapStepItemSchema = z.object({
  activityId: z.string(),
  activityName: z.string(),
  describingStories: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type GapStepItem = z.infer<typeof gapStepItemSchema>;

// `unknown` is the fixed defensive bucket for a missing/invalid
// systemKind (design-review N-02) — never silently dropped. The
// per-kind keys are DERIVED from SYSTEM_KINDS (NFR-03 — the kind
// literals live only in shared/src/schema/system-kind.ts; the
// vocabulary-singularity grep guard enforces this).
const kindCountFields = Object.fromEntries(
  SYSTEM_KINDS.map((k) => [k, z.number().int()]),
) as Record<SystemKind, z.ZodNumber>;
const kindShareFields = Object.fromEntries(
  SYSTEM_KINDS.map((k) => [k, z.number()]),
) as Record<SystemKind, z.ZodNumber>;

export const kindCountsSchema = z.object({
  ...kindCountFields,
  unknown: z.number().int(),
});
export type KindCounts = z.infer<typeof kindCountsSchema>;

export const kindSharesSchema = z.object({
  ...kindShareFields,
  unknown: z.number(),
});
export type KindShares = z.infer<typeof kindSharesSchema>;

export const augmentationMixSchema = z.object({
  perCapability: z.array(
    z.object({
      capabilityId: z.string(),
      name: z.string(),
      counts: kindCountsSchema,
      shares: kindSharesSchema,
    }),
  ),
  model: kindCountsSchema,
});
export type AugmentationMix = z.infer<typeof augmentationMixSchema>;

export const gapsResultSchema = z.object({
  unsupportedSteps: z.array(gapStepItemSchema),
  capabilityGaps: z.array(gapStepItemSchema),
  capabilitiesWithoutSystem: z.array(
    z.object({ capabilityId: z.string(), name: z.string() }),
  ),
  orphanSystems: z.array(z.object({ systemId: z.string(), name: z.string() })),
  augmentationMix: augmentationMixSchema,
});
export type GapsResult = z.infer<typeof gapsResultSchema>;

// ---------------------------------------------------------------------------
// Context map result (FR-09, DD-07)
// ---------------------------------------------------------------------------

// Inter-context relationships resolve the far end to its id (DD-07 —
// NOT the bounded-contexts route's name-only {type,target} shape).
export const contextMapResultSchema = z.object({
  contexts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      domain: z.string().nullable(),
      subdomain: z.string().nullable(),
      capabilities: z.array(z.object({ id: z.string(), name: z.string() })),
      relationships: z.array(
        z.object({
          type: z.string(),
          targetId: z.string(),
          targetName: z.string(),
        }),
      ),
    }),
  ),
  unassigned: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type ContextMapResult = z.infer<typeof contextMapResultSchema>;
