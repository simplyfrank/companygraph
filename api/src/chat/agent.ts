// Orchestrator (DD-06): runs the ReAct loop per user turn, dispatches
// refusal paths, assembles the highlight payload + citations + envelope,
// and persists the message + counter.

import type {
  ChatEnvelope,
  ChatRequest,
  ChatRoleId,
  Citation,
  HighlightPayload,
  LatencyBreakdown,
  ToolCall,
  ToolName,
} from "@companygraph/shared";
import { getDriver } from "../neo4j/driver";
import { generateId } from "../ids";
import {
  appendMessage,
  createConversation,
  getConversation,
  loadBoundContext,
  loadConversationHistory,
  updateConversationTouch,
} from "./persistence";
import { incrementQuotaOrFail, isQuotaExhausted } from "./quota";
import { getLLMClient } from "./llm/factory";
import type { LLMClient, AnthropicMessage, AnthropicTool } from "./llm/client";
import { ROLES, getRole, getDefaultRole } from "./roles/registry";
import { buildSystemPromptBlocks, loadRoleOverlay } from "./roles/prompt-loader";
import { extractClassifierPrefix } from "./roles/auto-route";
import { listToolsForRole } from "./tools/registry";
import { runTool } from "./tools/dispatch";
import type { ToolContext } from "./tools/types";
import { buildHighlightFromResults, tryBuildDeepLink, type ToolCallWithData } from "./highlight";
import {
  FR_G02_STRING,
  FR_G05_STRING,
  resolveAnswerBody,
} from "./refusal";
import {
  appendToolCallToProgress,
  initProgress,
  setProgress,
} from "./progress";
import { getSchemaSnapshot } from "./schema-context";
import { redactInjectionDeep } from "./sanitise";

const MAX_TOOL_CALLS_PER_TURN = 5;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_TOKENS_EST = 120_000;

function previewOf(data: unknown): string {
  try {
    const s = typeof data === "string" ? data : JSON.stringify(data);
    return s.length > 200 ? s.slice(0, 197) + "..." : s;
  } catch {
    return "<unserializable>";
  }
}

function countRows(data: unknown): number | null {
  if (data == null) return 0;
  if (Array.isArray(data)) return data.length;
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return (obj.rows as unknown[]).length;
    if (Array.isArray(obj.activities)) return (obj.activities as unknown[]).length;
    if (Array.isArray(obj.paths)) return (obj.paths as unknown[]).length;
    if (Array.isArray(obj.nodes)) return (obj.nodes as unknown[]).length;
    if (Array.isArray(obj.cells)) return (obj.cells as unknown[]).length;
    return 1;
  }
  return null;
}

// Extract `[label](id)`-style markdown citations from the answer text.
function extractCitations(answer: string, knownIds: { node_ids: Set<string>; edge_ids: Set<string> }): Citation[] {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const out: Citation[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const label = m[1];
    const id = m[2];
    if (knownIds.node_ids.has(id)) out.push({ kind: "node", id, label });
    else if (knownIds.edge_ids.has(id)) out.push({ kind: "edge", id, label });
  }
  return out;
}

function knownIdsFromHighlight(h: HighlightPayload): { node_ids: Set<string>; edge_ids: Set<string> } {
  return {
    node_ids: new Set(h.nodes),
    edge_ids: new Set(h.edges),
  };
}

// DD-06 main entry point.
export async function runAgentTurn(req: ChatRequest): Promise<ChatEnvelope> {
  const t_start = performance.now();
  const message_id = generateId();
  let conversation_id = req.conversation_id ?? "";
  let conv = conversation_id ? getConversation(conversation_id) : null;
  if (!conv) {
    const newConv = createConversation({
      title: req.message.slice(0, 80) + (req.message.length > 80 ? "…" : ""),
      role_id_pin: req.role_id,
    });
    conv = newConv;
    conversation_id = newConv.id;
  }
  initProgress(message_id, conversation_id);

  // Compute assistantTurnIndex early so all refusal paths can use it.
  const _preHistory = loadConversationHistory(conversation_id, {
    maxMessages: MAX_HISTORY_MESSAGES,
    maxTokensEstimate: MAX_HISTORY_TOKENS_EST,
  });
  const _preUserTurnIndex = _preHistory.length === 0
    ? 0
    : (_preHistory[_preHistory.length - 1]?.turn_index ?? -1) + 1;
  const earlyAssistantTurnIndex = _preUserTurnIndex; // refusal: no user msg persisted

  // 1. Pre-loop quota check.
  if (isQuotaExhausted(conversation_id)) {
    const env = makeRefusalEnvelope(
      message_id, conversation_id, getDefaultRole().id,
      FR_G05_STRING, t_start, false,
    );
    persistAssistantMessage(env, earlyAssistantTurnIndex);
    setProgress(message_id, "done", { result: env });
    return env;
  }

  // 2. Resolve role (auto-route or explicit).
  let activeRole = req.role_id ? getRole(req.role_id) ?? getDefaultRole() : getDefaultRole();

  // 3. Build context + LLM call inputs.
  const schemaSnapshot = await getSchemaSnapshot();
  const bound_context = req.bound_context ?? loadBoundContext(conversation_id);
  const ctx: ToolContext = {
    driver: getDriver(),
    role: { id: activeRole.id, allowed_tools: activeRole.allowed_tools },
    conversationId: conversation_id,
    perTurnCache: new Map(),
    schemaSnapshot,
    bound_context,
  };

  const llm = getLLMClient();
  let tools = listToolsForRole(activeRole) as AnthropicTool[];
  let overlayText = await loadRoleOverlay(activeRole.id);
  let system = buildSystemPromptBlocks(activeRole, overlayText, schemaSnapshot, bound_context);

  // 4. Persist user message + load history.
  const history = _preHistory;
  const userTurnIndex = _preUserTurnIndex;
  const assistantTurnIndex = userTurnIndex + 1;
  appendMessage({
    message_id: generateId(),
    conversation_id,
    turn_index: userTurnIndex,
    role: "user",
    content_text: req.message,
    role_id_used: null,
    tool_calls: [],
    highlight: { nodes: [], edges: [], paths: [] },
    explorer_deep_link: null,
    latency_ms_breakdown: { total_ms: 0, llm_calls: 0, per_tool_ms: {} },
  });

  const messages: AnthropicMessage[] = history.map(h => ({
    role: h.role,
    content: h.content_text,
  }));
  messages.push({ role: "user", content: req.message });

  // 5. ReAct loop.
  const toolCalls: ToolCall[] = [];
  const toolCallsWithData: ToolCallWithData[] = [];
  let llmCalls = 0;
  let finalText = "";
  let stopReason: string = "end_turn";
  let banner: ChatEnvelope["banner"] | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let budgetExhausted = false;

  while (toolCalls.length < MAX_TOOL_CALLS_PER_TURN) {
    if (incrementQuotaOrFail(conversation_id)) {
      budgetExhausted = true;
      break;
    }
    setProgress(message_id, "llm_call");
    const turn = await llm.callTurn({ messages, tools, system });
    llmCalls += 1;
    totalInputTokens += turn.usage?.input_tokens ?? 0;
    totalOutputTokens += turn.usage?.output_tokens ?? 0;
    totalCacheReadTokens += turn.usage?.cache_read_input_tokens ?? 0;
    totalCacheCreationTokens += turn.usage?.cache_creation_input_tokens ?? 0;

    // First-turn classifier (DD-18). Parse the prefix from the text content,
    // not from a tool result. Only honoured before any tool call has happened.
    if (llmCalls === 1 && (turn.text ?? "").length > 0) {
      const parsed = extractClassifierPrefix(turn.text ?? "", activeRole.id);
      if (parsed.intent === "oos") {
        const env = makeRefusalEnvelope(
          message_id, conversation_id, activeRole.id,
          FR_G02_STRING, t_start, llm.degraded,
        );
        // OOS: the user message IS persisted (we already appended at line ~155),
        // so use assistantTurnIndex (one after the user message).
        persistAssistantMessage(env, assistantTurnIndex);
        setProgress(message_id, "done", { result: env });
        return env;
      }
      if (parsed.role_id && parsed.role_id !== activeRole.id) {
        // Honour ONLY if the request did not pin a role; otherwise set advisory banner.
        if (!req.role_id) {
          const newRole = getRole(parsed.role_id);
          if (newRole) {
            activeRole = newRole;
            tools = listToolsForRole(activeRole) as AnthropicTool[];
            overlayText = await loadRoleOverlay(activeRole.id);
            system = buildSystemPromptBlocks(activeRole, overlayText, schemaSnapshot, bound_context);
            ctx.role = { id: activeRole.id, allowed_tools: activeRole.allowed_tools };
          }
        } else {
          const suggestedRole = getRole(parsed.role_id);
          if (suggestedRole) {
            banner = {
              kind: "role_mismatch",
              auto_role_id: parsed.role_id,
              auto_role_label: suggestedRole.label,
            };
          }
        }
      }
      // Strip the prefix from the text so it doesn't leak into the answer.
      finalText = parsed.remaining_text;
    } else {
      finalText = turn.text ?? finalText;
    }

    stopReason = turn.stop_reason;
    if (turn.stop_reason === "tool_use" && turn.tool_calls.length > 0) {
      const tu = turn.tool_calls[0];
      if (!tu) break;
      const name = tu.name as ToolName;
      setProgress(message_id, `tool:${name}` as const);
      const t0 = performance.now();
      const result = await runTool(name, redactInjectionDeep(tu.input), ctx);
      const dur = performance.now() - t0;
      const tc: ToolCall = {
        tool_name: name,
        args: tu.input,
        duration_ms: dur,
        row_count: result.ok ? countRows(result.data) : 0,
        error_code: result.ok ? undefined : result.error.code,
        result_preview: previewOf(result.ok ? result.data : result.error),
      };
      toolCalls.push(tc);
      toolCallsWithData.push({
        tool_name: name,
        data: result.ok ? result.data : null,
        error_code: result.ok ? undefined : result.error.code,
      });
      appendToolCallToProgress(message_id, tc);
      messages.push({
        role: "assistant",
        content: [{ type: "tool_use", id: tu.id, name: tu.name, input: tu.input }],
      });
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) }],
      });
      continue;
    }
    // stop_reason === 'end_turn' (or 'max_tokens') — exit the loop.
    break;
  }

  if (toolCalls.length >= MAX_TOOL_CALLS_PER_TURN && stopReason === "tool_use") {
    budgetExhausted = true;
  }
  setProgress(message_id, "narrating");

  // 6. Build highlight + citations + envelope.
  const highlight = buildHighlightFromResults(toolCallsWithData, activeRole.id);
  const explorer_deep_link = tryBuildDeepLink(highlight, activeRole.id);
  const answer = resolveAnswerBody(finalText.trim(), toolCalls, budgetExhausted);
  const knownIds = knownIdsFromHighlight(highlight);
  const citations = extractCitations(answer, knownIds);
  const total_ms = performance.now() - t_start;

  const latency: LatencyBreakdown = {
    total_ms,
    llm_calls: llmCalls,
    per_tool_ms: toolCalls.reduce<Record<string, number>>((acc, tc) => {
      acc[tc.tool_name] = (acc[tc.tool_name] ?? 0) + tc.duration_ms;
      return acc;
    }, {}),
    llm_input_tokens: totalInputTokens,
    llm_output_tokens: totalOutputTokens,
    llm_cache_read_tokens: totalCacheReadTokens,
    llm_cache_creation_tokens: totalCacheCreationTokens,
  };

  const env: ChatEnvelope = {
    message_id,
    conversation_id,
    role_id: activeRole.id,
    answer,
    citations,
    highlight,
    explorer_deep_link,
    tool_calls: toolCalls,
    latency_ms_breakdown: latency,
    degraded: llm.degraded ? "mock_llm" : undefined,
    banner,
  };
  persistAssistantMessage(env, assistantTurnIndex);
  updateConversationTouch(conversation_id);
  setProgress(message_id, "done", { result: env });
  return env;
}

function makeRefusalEnvelope(
  message_id: string,
  conversation_id: string,
  role_id: ChatRoleId,
  body: string,
  t_start: number,
  degraded: boolean,
): ChatEnvelope {
  const total_ms = performance.now() - t_start;
  return {
    message_id,
    conversation_id,
    role_id,
    answer: body,
    citations: [],
    highlight: { nodes: [], edges: [], paths: [], style: { breach: [], warn: [], selected: [] } },
    explorer_deep_link: null,
    tool_calls: [],
    latency_ms_breakdown: { total_ms, llm_calls: 0, per_tool_ms: {} },
    degraded: degraded ? "mock_llm" : undefined,
  };
}

function persistAssistantMessage(env: ChatEnvelope, turn_index: number): void {
  appendMessage({
    message_id: env.message_id,
    conversation_id: env.conversation_id,
    turn_index,
    role: "assistant",
    content_text: env.answer,
    role_id_used: env.role_id,
    tool_calls: env.tool_calls,
    highlight: env.highlight,
    explorer_deep_link: env.explorer_deep_link,
    latency_ms_breakdown: env.latency_ms_breakdown,
  });
}
