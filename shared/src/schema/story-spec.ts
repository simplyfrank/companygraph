import { z } from "zod";
import { uuidv7 } from "./nodes";

// story-spec-core T-01 (design §3.1, §3.2, §5) — zod schemas for the
// REST boundary of the story/acceptance-criterion surface. zod is the
// only validation library (house rule).
//
// Story/AC domain fields (`persona`, `action`, `benefit`, `narrative`,
// `derived`, `sourceActivityId`, `given`, `when`, `then`, `ordinal`)
// are stored as TOP-LEVEL Neo4j properties by the dedicated storage
// module `api/src/storage/stories.ts` — NOT inside `attributes_json` —
// so `ORDER BY ordinal` / `WHERE derived` / scoped-activity joins work
// (design DD-03, mirrors model-workspace-core rule 2).

// ---------------------------------------------------------------------------
// UserStory (FR-01, FR-05)
// ---------------------------------------------------------------------------

// `narrative` is NOT a client field — it is server-assembled from
// persona/action/benefit (design §4.2). `.strict()` rejects it (and any
// other server-owned field) at the boundary.
export const storyCreateSchema = z
  .object({
    persona: z.string().min(1),
    action: z.string().min(1),
    benefit: z.string().min(1),
    activityId: z.string().min(1),
    roleId: z.string().min(1).optional(),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .strict();
export type StoryCreateInput = z.infer<typeof storyCreateSchema>;

// PATCH — all optional; omitted fields are never clobbered (mirrors
// patchNode). A supplied `activityId`/`roleId` re-points the
// DESCRIBES_ACTIVITY / STORY_FOR_ROLE edge (design §4.2).
export const storyPatchSchema = z
  .object({
    persona: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    benefit: z.string().min(1).optional(),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
    activityId: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
  })
  .strict();
export type StoryPatchInput = z.infer<typeof storyPatchSchema>;

// ---------------------------------------------------------------------------
// AcceptanceCriterion (FR-02, XD-10, NFR-03)
// ---------------------------------------------------------------------------

// The three `.min(1)` clause checks are the SINGLE enforcement point
// for NFR-03 (structured Given/When/Then; free-text / partial ACs are
// rejected). The route maps a clause-path zod failure to
// `400 acceptance_criterion_clause_required` (design §4.3).
export const acCreateSchema = z
  .object({
    given: z.string().min(1),
    when: z.string().min(1),
    then: z.string().min(1),
    ordinal: z.number().int().positive().optional(),
  })
  .strict();
export type AcCreateInput = z.infer<typeof acCreateSchema>;

export const acPatchSchema = z
  .object({
    given: z.string().min(1).optional(),
    when: z.string().min(1).optional(),
    then: z.string().min(1).optional(),
    ordinal: z.number().int().positive().optional(),
  })
  .strict();
export type AcPatchInput = z.infer<typeof acPatchSchema>;

export const acReadSchema = z.object({
  id: uuidv7,
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
export type AcRead = z.infer<typeof acReadSchema>;

// ---------------------------------------------------------------------------
// Story read shape (list row + detail)
// ---------------------------------------------------------------------------

// Nullability per DD-11 + the C-07 pin:
//  - `activityId`/`activityName` are null on a DETACHED row (the
//    DESCRIBES_ACTIVITY target was deleted elsewhere; DD-11).
//  - `persona`/`action`/`benefit`/`narrative`/`sourceActivityId` are
//    nullable ONLY for off-surface prop-less nodes minted through the
//    generic node route (accepted degrade, design-review C-07 pin);
//    server-authored stories always populate them.
export const storyReadSchema = z.object({
  id: uuidv7,
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
  roleId: z.string().nullish(),
  roleName: z.string().nullish(),
  acCount: z.number().int(),
  detached: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attributes: z.record(z.unknown()),
  // Detail responses additionally embed the story's ACs ordered by
  // `ordinal` ASC (design §3.1); absent on list rows.
  acceptanceCriteria: z.array(acReadSchema).optional(),
});
export type StoryRead = z.infer<typeof storyReadSchema>;

// ---------------------------------------------------------------------------
// Bootstrap (FR-09, XD-09)
// ---------------------------------------------------------------------------

export const bootstrapRequestSchema = z
  .object({
    activityIds: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;

export const bootstrapResultSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type BootstrapResult = z.infer<typeof bootstrapResultSchema>;
