// Zod schemas for the chat-interface REST surface and persisted
// rows. Keeps validation tight at the boundary so downstream code
// can rely on the shape.

import { z } from "zod";
import { CHAT_ROLE_IDS, TOOL_NAMES } from "@companygraph/shared";

// Bound context carried across turns (FR-M01). Mirrors the
// `BoundContext` shape in `shared/src/types.ts`.
export const boundContextSchema = z.object({
  node_ids: z.array(z.string()).max(50).default([]),
  edge_ids: z.array(z.string()).max(50).default([]),
});
export type BoundContextInput = z.infer<typeof boundContextSchema>;

// `POST /api/v1/chat/messages` request body.
export const chatRequestSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  role_id: z.enum(CHAT_ROLE_IDS).optional(),
  bound_context: boundContextSchema.optional(),
});
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

// Hydrated `chat_messages` row (post-JSON-parse for tool_calls /
// highlight / latency).
const toolCallSchema = z.object({
  tool_name: z.enum(TOOL_NAMES),
  args: z.unknown(),
  duration_ms: z.number(),
  row_count: z.number().nullable(),
  error_code: z.string().optional(),
  result_preview: z.string(),
});

const highlightSchema = z.object({
  nodes: z.array(z.string()),
  edges: z.array(z.string()),
  paths: z.array(z.array(z.string())),
  style: z
    .object({
      breach: z.array(z.string()).optional(),
      warn: z.array(z.string()).optional(),
      selected: z.array(z.string()).optional(),
    })
    .optional(),
});

const latencyBreakdownSchema = z.object({
  total_ms: z.number(),
  llm_calls: z.number(),
  per_tool_ms: z.record(z.number()),
  llm_input_tokens: z.number().optional(),
  llm_output_tokens: z.number().optional(),
  llm_cache_read_tokens: z.number().optional(),
  llm_cache_creation_tokens: z.number().optional(),
});

export const chatMessageRowSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  turn_index: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant"]),
  content_text: z.string(),
  role_id_used: z.enum(CHAT_ROLE_IDS).nullable(),
  tool_calls: z.array(toolCallSchema).nullable(),
  highlight: highlightSchema.nullable(),
  explorer_deep_link: z.string().nullable(),
  latency_ms_breakdown: latencyBreakdownSchema.nullable(),
  created_at: z.string(),
});
export type ChatMessageRowParsed = z.infer<typeof chatMessageRowSchema>;
