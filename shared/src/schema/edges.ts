import { z } from "zod";
import { uuidv7, type NodeLabel } from "./nodes";

export const EDGE_TYPES = [
  "PART_OF",          // UserJourney→Domain, Activity→UserJourney, Location→Location
  "EXECUTES",         // Role→Activity
  "USES_SYSTEM",      // Activity→System
  "AT_LOCATION",      // Activity→Location
  "PRECEDES",         // Activity→Activity
  "INTEGRATES_WITH",  // System→System
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

// (type) → array of allowed [fromLabel, toLabel] tuples. The validator
// in api/src/storage/edges.ts iterates this table.
// Pass-2 C-02 of requirements review locked in this matrix shape.
// Adding a new endpoint pair is a one-line registry change here +
// nothing else.
export const EDGE_ENDPOINTS = {
  PART_OF: [
    ["UserJourney", "Domain"],
    ["Activity", "UserJourney"],
    ["Location", "Location"],
  ],
  EXECUTES:        [["Role", "Activity"]],
  USES_SYSTEM:     [["Activity", "System"]],
  AT_LOCATION:     [["Activity", "Location"]],
  PRECEDES:        [["Activity", "Activity"]],
  INTEGRATES_WITH: [["System", "System"]],
} as const satisfies Record<EdgeType, ReadonlyArray<readonly [NodeLabel, NodeLabel]>>;

export const edgeCreateSchema = z.object({
  id: uuidv7.optional(),
  // z.string() rather than z.enum(EDGE_TYPES): the ontology registry is
  // runtime-extensible. The allowed-type check is enforced at write time
  // by validateEdge → getEdgeEndpoints (storage/edges.ts). EDGE_TYPES
  // remains for compile-time seed callers and typed downstream code.
  type: z.string().min(1),
  fromId: uuidv7,
  toId: uuidv7,
  attributes: z.record(z.unknown()).default({}),
});
export type EdgeCreateInput = z.infer<typeof edgeCreateSchema>;

export const edgeReadSchema = edgeCreateSchema.extend({
  id: uuidv7,
  createdAt: z.string().datetime(),
});
export type Edge = z.infer<typeof edgeReadSchema>;
