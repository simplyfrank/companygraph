import { ValidationError } from "../../errors";
import type { ToolName, ToolResult } from "@companygraph/shared";
import { getTool } from "./registry";
import type { ToolContext } from "./types";
import { toolError } from "./types";

// Canonicalise tool args for memoization key. Sorted-keys JSON.
function canonicalKey(name: string, args: unknown): string {
  const sortedArgs = JSON.stringify(args, Object.keys((args ?? {}) as object).sort());
  return `${name}::${sortedArgs}`;
}

export async function runTool(
  name: ToolName,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolResult<unknown>> {
  // 1. Role-gate: only allow tools in the active role's allowed_tools.
  if (!ctx.role.allowed_tools.includes(name)) {
    return toolError(
      "chat:tool_unauthorised_for_role",
      `tool ${name} not allowed in role ${ctx.role.id}`,
      { role_id: ctx.role.id, tool: name },
    );
  }

  // 2. Resolve tool def from registry.
  const def = getTool(name);
  if (!def) {
    return toolError(
      "chat:tool_unauthorised_for_role",
      `unknown tool ${name}`,
      { tool: name },
    );
  }

  // 3. Per-turn memoization (DD-03 / Risks #18).
  const cacheKey = canonicalKey(name, args);
  const cached = ctx.perTurnCache.get(cacheKey);
  if (cached) return cached;

  // 4. zod-validate args.
  const parsed = def.schema.safeParse(args);
  if (!parsed.success) {
    const result = toolError(
      "invalid_payload",
      "tool args invalid",
      { fieldErrors: parsed.error.format() },
    );
    ctx.perTurnCache.set(cacheKey, result);
    return result;
  }

  // 5. Run tool, catch ValidationError → tool envelope; rethrow other errors.
  try {
    const data = await def.run(parsed.data as never, ctx);
    const result: ToolResult<unknown> = { ok: true, data };
    ctx.perTurnCache.set(cacheKey, result);
    return result;
  } catch (e) {
    if (e instanceof ValidationError) {
      const result = toolError(
        e.code as never, // graph-core ERROR_CODES is a strict subset of ChatErrorCode's graph-core half
        e.message,
        e.details,
      );
      ctx.perTurnCache.set(cacheKey, result);
      return result;
    }
    if (isAnthropicError(e)) {
      const result = toolError(
        "chat:llm_provider_error",
        e instanceof Error ? e.message : String(e),
      );
      ctx.perTurnCache.set(cacheKey, result);
      return result;
    }
    // Genuine bug — re-throw so the chat REST handler returns 500.
    throw e;
  }
}

function isAnthropicError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name;
  return name === "AnthropicError" || name === "APIError";
}
