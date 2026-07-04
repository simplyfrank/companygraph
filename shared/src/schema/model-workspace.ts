import { z } from "zod";
import { uuidv7 } from "./nodes";

// model-workspace-core T-01 — zod schemas for the REST boundary of the
// multi-model workspace + versioned-modules surface (design §3.1–3.4,
// §3.6, §4.3, §4.4). zod is the only validation library (house rule).
//
// Lifecycle top-level properties (`ordinal`, `status`, `isReference`,
// `version`, `checksum`, `snapshot_json`, `forked`, `pinnedVersion`,
// `targetDomainId`) are stored as top-level Neo4j props by the dedicated
// storage modules — NOT inside `attributes_json` — so constraints and
// server-side filters work (design rule 2).

// ---------------------------------------------------------------------------
// BusinessModel (FR-01, FR-05)
// ---------------------------------------------------------------------------

export const modelStatusSchema = z.enum(["active", "archived"]);
export type ModelStatus = z.infer<typeof modelStatusSchema>;

export const modelCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  attributes: z.record(z.unknown()).optional(),
});
export type ModelCreateInput = z.infer<typeof modelCreateSchema>;

// PATCH — all optional; omitted fields are never clobbered (mirrors
// graph-core's patchNode contract). `.strict()` rejects server-owned
// fields (`ordinal`, `isReference`, timestamps) at the boundary.
export const modelPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .strict();
export type ModelPatchInput = z.infer<typeof modelPatchSchema>;

export const modelReadSchema = z.object({
  id: uuidv7,
  name: z.string(),
  description: z.string(),
  ordinal: z.number().int(),
  status: modelStatusSchema,
  isReference: z.boolean(),
  moduleInstanceCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attributes: z.record(z.unknown()),
});
export type ModelRead = z.infer<typeof modelReadSchema>;

// ---------------------------------------------------------------------------
// Domain attach (design §4.3, review B-02) — POST /api/v1/models/:id/domains
// ---------------------------------------------------------------------------

export const domainAttachSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  attributes: z.record(z.unknown()).optional(),
});
export type DomainAttachInput = z.infer<typeof domainAttachSchema>;

// ---------------------------------------------------------------------------
// BusinessModule + BusinessModuleVersion (FR-02, FR-06)
// ---------------------------------------------------------------------------

export const moduleCreateSchema = z.object({
  sourceModelId: uuidv7,
  sourceJourneyId: uuidv7,
  name: z.string().min(1).max(200),
});
export type ModuleCreateInput = z.infer<typeof moduleCreateSchema>;

export const moduleReadSchema = z.object({
  id: uuidv7,
  name: z.string(),
  sourceModelId: z.string(),
  sourceJourneyId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ModuleRead = z.infer<typeof moduleReadSchema>;

// Publish body — optional explicit-version mode (design D-3 / §4.4).
// Omitted → auto-increment max+1. Supplied + already exists →
// `409 module_version_immutable` (the single reachable site, D-4).
export const versionPublishSchema = z.object({
  version: z.number().int().min(1).optional(),
});
export type VersionPublishInput = z.infer<typeof versionPublishSchema>;

// Snapshot shape (design §3.3) — serialized journey subtree, never a
// live subtree. `localKey` decouples content from concrete node ids.
export const snapshotActivitySchema = z.object({
  localKey: z.string().min(1),
  name: z.string(),
  description: z.string(),
  attributes: z.record(z.unknown()),
});
export const snapshotSchema = z.object({
  journey: z.object({
    name: z.string(),
    description: z.string(),
    attributes: z.record(z.unknown()),
  }),
  activities: z.array(snapshotActivitySchema),
  precedes: z.array(z.object({ from: z.string(), to: z.string() })),
  roleRefs: z.array(z.object({ activityKey: z.string(), roleId: z.string() })),
  systemRefs: z.array(z.object({ activityKey: z.string(), systemId: z.string() })),
  locationRefs: z.array(z.object({ activityKey: z.string(), locationId: z.string() })),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const versionReadSchema = z.object({
  id: uuidv7,
  moduleId: z.string(),
  version: z.number().int(),
  publishedAt: z.string(),
  checksum: z.string(),
  snapshot: snapshotSchema,
});
export type VersionRead = z.infer<typeof versionReadSchema>;

// ---------------------------------------------------------------------------
// ModuleInstance (FR-02, FR-07, FR-08, FR-09)
// ---------------------------------------------------------------------------

// D-2: `targetDomainId` is a REQUIRED third field (supersedes FR-07's
// `{moduleId, version?}`) — a fork must attach its materialized journey
// under a concrete in-model Domain.
export const instanceCreateSchema = z.object({
  moduleId: uuidv7,
  version: z.number().int().min(1).optional(),
  targetDomainId: uuidv7,
});
export type InstanceCreateInput = z.infer<typeof instanceCreateSchema>;

export const instanceUpgradeSchema = z.object({
  toVersion: z.number().int().min(1),
  allowDowngrade: z.boolean().optional(),
});
export type InstanceUpgradeInput = z.infer<typeof instanceUpgradeSchema>;

// Synthetic content-id handle (design §3.4): `<instanceId>::journey` or
// `<instanceId>::<localKey>`. `::` never appears in a UUIDv7, so the
// split is unambiguous; handles travel verbatim in path segments (N-06).
const SYNTHETIC_HANDLE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}::[A-Za-z0-9_-]+$/;

export const instanceNodeHandleSchema = z
  .string()
  .refine(
    (s) => uuidv7.safeParse(s).success || SYNTHETIC_HANDLE_REGEX.test(s),
    { message: "must be a live UUIDv7 or a synthetic <instanceId>::<key> handle" },
  );

// Content projection of an instance read (design §4.5). For a
// non-forked instance every member's `id` IS its synthetic content-id;
// for a forked instance `id` is the live UUIDv7 and `forkLocalKey`
// carries the instance-qualified synthetic id.
export const instanceContentNodeSchema = z.object({
  id: z.string(),
  label: z.enum(["UserJourney", "Activity"]),
  name: z.string(),
  description: z.string(),
  attributes: z.record(z.unknown()),
  forkLocalKey: z.string().optional(),
});
export const instanceContentSchema = z.object({
  journey: instanceContentNodeSchema.nullable(),
  activities: z.array(instanceContentNodeSchema),
  precedes: z.array(z.object({ from: z.string(), to: z.string() })),
  roleRefs: z.array(z.object({ activityKey: z.string(), roleId: z.string() })),
  systemRefs: z.array(z.object({ activityKey: z.string(), systemId: z.string() })),
  locationRefs: z.array(z.object({ activityKey: z.string(), locationId: z.string() })),
});
export type InstanceContent = z.infer<typeof instanceContentSchema>;

export const instanceReadSchema = z.object({
  id: uuidv7,
  moduleId: z.string(),
  moduleName: z.string(),
  pinnedVersion: z.number().int(),
  forked: z.boolean(),
  targetDomainId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  content: instanceContentSchema,
});
export type InstanceRead = z.infer<typeof instanceReadSchema>;

// ---------------------------------------------------------------------------
// Instance edge routes (design §4.4 sibling edge route, review B-01)
// ---------------------------------------------------------------------------

// Closed enum — lifecycle edge types (IN_MODEL, HAS_VERSION,
// INSTANTIATES, INSTANCE_IN, FORKED_FROM) are deliberately NOT members;
// they are mutated only by their own lifecycle routes (§4.6).
export const instanceEdgeTypeSchema = z.enum([
  "PRECEDES",
  "EXECUTES",
  "USES_SYSTEM",
  "AT_LOCATION",
]);
export type InstanceEdgeType = z.infer<typeof instanceEdgeTypeSchema>;

// Instance edges are addressed by (type, endpoints) — never by edge id
// (snapshot precedes/*Refs rows carry no edge ids; no synthetic edge
// ids are invented). `from`/`to` each accept a live UUIDv7 or a
// synthetic `<instanceId>::<key>` handle.
export const instanceEdgeSchema = z.object({
  type: instanceEdgeTypeSchema,
  from: instanceNodeHandleSchema,
  to: instanceNodeHandleSchema,
});
export type InstanceEdgeInput = z.infer<typeof instanceEdgeSchema>;
