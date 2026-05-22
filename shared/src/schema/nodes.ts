import { z } from "zod";

export const NODE_LABELS = [
  "Domain",
  "UserJourney",
  "Activity",
  "Role",
  "System",
  "Location",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

// UUIDv7 regex — sortable, monotonic ids per NFR-07.
export const uuidv7 = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  { message: "must be a UUIDv7 string" },
);

// Three node schemas — distinct usage modes per design §3.1:
//   nodeCreateSchema  →  POST /api/v1/nodes/:label and POST /api/v1/import
//   nodeUpdateSchema  →  PATCH /api/v1/nodes/:label/:id
//   nodeReadSchema    →  shape returned to clients
export const nodeCreateSchema = z.object({
  id: uuidv7.optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  attributes: z.record(z.unknown()).default({}),
});
export type NodeCreateInput = z.infer<typeof nodeCreateSchema>;

// PATCH never accepts id/createdAt/updatedAt — .strict() rejects them.
export const nodeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  attributes: z.record(z.unknown()).optional(),
}).strict();
export type NodeUpdateInput = z.infer<typeof nodeUpdateSchema>;

export const nodeReadSchema = z.object({
  id: uuidv7,
  label: z.enum(NODE_LABELS),
  name: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attributes: z.record(z.unknown()),
});
export type Node = z.infer<typeof nodeReadSchema>;
