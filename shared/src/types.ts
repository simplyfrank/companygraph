import { z } from "zod";
import { nodeCreateSchema, type Node, type NodeLabel } from "./schema/nodes";
import { edgeCreateSchema, type Edge, type EdgeType } from "./schema/edges";

// Bulk import envelope (FR-06).
export const importPayloadSchema = z.object({
  nodes: z.array(z.object({
    label: z.enum(["Domain", "UserJourney", "Activity", "Role", "System", "Location"]),
  }).and(nodeCreateSchema)),
  edges: z.array(edgeCreateSchema),
});
export type ImportPayload = z.infer<typeof importPayloadSchema>;

// Per-row error reported by /import phase 1 or phase 2.
export const importRowErrorSchema = z.object({
  section: z.enum(["nodes", "edges"]),
  index: z.number().int().nonnegative(),
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ImportRowError = z.infer<typeof importRowErrorSchema>;

export const importResponseSchema = z.object({
  imported: z.object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
  }),
  errors: z.array(importRowErrorSchema).optional(),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;

// /api/v1/stats response — all keys always present per FR-11.
export interface Stats {
  nodes: Record<NodeLabel, number>;
  edges: Record<EdgeType, number>;
}

// /api/v1/healthz response.
export interface Health {
  ok: boolean;
  neo4j: { connected: boolean; version?: string };
}

// Error envelope per NFR-05.
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Multi-row response wrapper for /query/*.
export interface RowResponse<T = Record<string, unknown>> {
  rows: T[];
}

export type { Node, NodeLabel, Edge, EdgeType };
