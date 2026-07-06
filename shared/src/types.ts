import { z } from "zod";
import { nodeCreateSchema, type Node, type NodeLabel } from "./schema/nodes";
import { edgeCreateSchema, type Edge, type EdgeType } from "./schema/edges";

// Bulk import envelope (FR-06).
// Note: `label` is z.string() here because the ontology registry is
// runtime-extensible (POST /api/v1/ontology/node-labels). The frozen
// NODE_LABELS enum guard was the source of the bug fixed in stats.ts;
// the same fix propagates here. The API layer validates against the
// live registry schema cache; the shared schema only enforces structure.
export const importPayloadSchema = z.object({
  nodes: z.array(z.object({
    label: z.string().min(1),
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
// Keys are `string` (not the frozen compile-time union) because the
// ontology registry is runtime-extensible; new labels/types added via
// POST /api/v1/ontology/* appear in /stats within the cache TTL.
export interface Stats {
  nodes: Record<string, number>;
  edges: Record<string, number>;
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

// ────────────────────────────────────────────────────────────────────
// chat-interface (rev 3.1) — agentic chat types.
// ────────────────────────────────────────────────────────────────────

// 20-role catalog ids (14 journey + 5 cross-section + 1 default).
export const CHAT_ROLE_IDS = [
  "graph_analyst",
  "uj_web_browse_buy", "uj_in_store_buy", "uj_loyalty_signup",
  "uj_order_fulfillment", "uj_click_collect", "uj_returns_intake", "uj_same_day",
  "uj_inbound_receiving", "uj_replenishment", "uj_promo_planning",
  "uj_refund_flow", "uj_email_triage", "uj_phone_support", "uj_instore_complaint",
  "sla_hotspots", "handoff_matrix", "sod_register", "ai_candidates", "initiative_impact",
] as const;
export type ChatRoleId = typeof CHAT_ROLE_IDS[number];

// 15-tool catalog names.
export const TOOL_NAMES = [
  "list_domains", "get_domain", "get_journey", "get_activity",
  "list_nodes_by_label", "neighbors", "find_path", "aggregate",
  "sla_hotspots", "handoff_matrix", "sod_register", "ai_candidates",
  "initiative_impact", "cypher", "describe_schema",
] as const;
export type ToolName = typeof TOOL_NAMES[number];

// Structured highlight payload driving the explorer canvas (FR-H01..H02).
export interface HighlightPayload {
  nodes: string[];
  edges: string[];
  paths: string[][];
  style?: {
    breach?: string[];
    warn?: string[];
    selected?: string[];
  };
}

// Tool error envelope code: graph-core codes ∪ chat-namespace codes.
export type ChatErrorCode =
  | "result_truncated" | "write_statement_rejected" | "depth_exceeded"
  | "query_timeout" | "not_found" | "invalid_payload" | "neo4j_unreachable"
  | "parse_error"
  | "chat:tool_unauthorised_for_role" | "chat:tool_budget_exhausted"
  | "chat:llm_provider_error";

export interface ToolError {
  code: ChatErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ToolResult<TData = unknown> =
  | { ok: true; data: TData }
  | { ok: false; error: ToolError };

// One row of the per-turn audit trail (FR-A05).
export interface ToolCall {
  tool_name: ToolName;
  args: unknown;
  duration_ms: number;
  row_count: number | null;
  error_code?: ChatErrorCode;
  result_preview: string; // ≤ 200 chars
}

// Citation pill rendered inside the answer body.
export interface Citation {
  kind: "node" | "edge";
  id: string;
  label: string;
}

// End-to-end latency breakdown (NFR-02, AC-26).
export interface LatencyBreakdown {
  total_ms: number;
  llm_calls: number;
  per_tool_ms: Record<string, number>;
  llm_input_tokens?: number;
  llm_output_tokens?: number;
  llm_cache_read_tokens?: number;
  llm_cache_creation_tokens?: number;
}

// Bound context carried between turns (FR-M01).
export interface BoundContext {
  node_ids: string[];
  edge_ids: string[];
}

// `POST /api/v1/chat/messages` request shape.
export interface ChatRequest {
  conversation_id?: string;
  message: string;
  role_id?: ChatRoleId;
  bound_context?: BoundContext;
}

// `POST /api/v1/chat/messages` response envelope.
export interface ChatEnvelope {
  message_id: string;
  conversation_id: string;
  role_id: ChatRoleId;
  answer: string;
  citations: Citation[];
  highlight: HighlightPayload;
  explorer_deep_link: string | null;
  tool_calls: ToolCall[];
  latency_ms_breakdown: LatencyBreakdown;
  degraded?: "mock_llm";
  banner?: {
    kind: "role_mismatch" | "truncated";
    auto_role_id?: ChatRoleId;
    auto_role_label?: string;
  };
}

// Progress snapshot shape (FR-B07).
export type ProgressState =
  | "classifying" | "llm_call" | "narrating" | "done" | "error"
  | `tool:${ToolName}`;

export interface ProgressSnapshot {
  message_id: string;
  conversation_id: string;
  state: ProgressState;
  tool_calls_so_far: ToolCall[];
  updated_at: string;
  result?: ChatEnvelope;
  error?: ToolError;
}

// Conversation list item (FR-06, design §3.5).
export interface ConversationSummary {
  id: string;
  created_at: string;
  last_message_at: string;
  title: string | null;
  role_id_pin: ChatRoleId | null;
}

// Conversation message history item (FR-07, design §3.5).
export interface ConversationMessage {
  id: string;
  conversation_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content_text: string;
  role_id_used: ChatRoleId | null;
  created_at: string;
}

