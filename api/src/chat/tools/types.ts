import type { Driver } from "neo4j-driver";
import type { z } from "zod";
import type {
  ChatRoleId,
  ToolName,
  ToolResult,
  ToolError,
} from "@companygraph/shared";

export interface SchemaSnapshot {
  labels: Array<{ id: string; name: string; attributes: Array<{ key: string; type: string }> }>;
  edge_types: Array<{ id: string; name: string }>;
  examples: Array<{ question: string; tool: ToolName; args: Record<string, unknown> }>;
}

export interface ToolContext {
  driver: Driver;
  role: { id: ChatRoleId; allowed_tools: readonly ToolName[] };
  conversationId: string;
  // Per-turn memoization cache, keyed by canonical(name, args) — DD-03.
  perTurnCache: Map<string, ToolResult<unknown>>;
  // Live schema snapshot for describe_schema + classifier.
  schemaSnapshot: SchemaSnapshot;
  // Carry-forward ids from prior assistant turn (FR-M01, DD-22).
  bound_context: { node_ids: string[]; edge_ids: string[] };
}

export interface ToolDef<TArgs, TData> {
  name: ToolName;
  description: string;
  schema: z.ZodType<TArgs>;
  run: (args: TArgs, ctx: ToolContext) => Promise<TData>;
}

// Helper to construct uniform error objects.
export function toolError(
  code: ToolError["code"],
  message: string,
  details?: Record<string, unknown>,
): { ok: false; error: ToolError } {
  return { ok: false, error: { code, message, details } };
}

export function toolOk<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
