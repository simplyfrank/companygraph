// LLM client abstraction. The rest of the codebase imports only from this
// module — the Anthropic SDK is referenced exclusively in
// `./anthropic.ts`, so production callers don't depend on the SDK shape
// directly. DD-07: `system` may be a string OR a structured block array
// so the role overlay portion can carry `cache_control: ephemeral` and
// participate in Anthropic prompt caching.

// Structured system-prompt block. A string is short-hand for a single
// uncached text block; the array form lets the orchestrator mark the
// large, stable role overlay as `ephemeral` so subsequent turns of the
// same conversation hit the prompt cache.
export type SystemPromptBlock =
  | string
  | Array<{
      type: "text";
      text: string;
      cache_control?: { type: "ephemeral" };
    }>;

// ─── Local mirrors of the Anthropic SDK shapes ──────────────────────
//
// These are intentionally NOT imported from `@anthropic-ai/sdk`. The
// adapter in `./anthropic.ts` translates between SDK types and these
// local types; everything else in the codebase imports from
// `./client.ts` only.

// Tool definition handed to the LLM (mirrors `Anthropic.Tool`).
export interface AnthropicTool {
  name: string;
  description?: string;
  // JSON Schema. `input_schema` may be anything zod-to-json-schema
  // emits, hence `unknown`.
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
}

// Content block emitted in the conversation history (mirrors the
// SDK's `MessageParam.content` union, narrowed to the kinds we use).
export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

// A single turn in the conversation history (mirrors
// `Anthropic.MessageParam`).
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

// One tool-call extracted from the LLM response. The orchestrator
// expands `input` into typed tool args at dispatch time.
export interface LLMToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface LLMTurnResult {
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  tool_calls: LLMToolCall[];
  text?: string;
  usage: LLMUsage;
}

export interface LLMCallOpts {
  messages: AnthropicMessage[];
  tools: AnthropicTool[];
  system: SystemPromptBlock;
}

export interface LLMClient {
  // `true` only when the mock impl is active (FR-B06 — surfaces in
  // ChatEnvelope.degraded). The Anthropic impl always reports `false`.
  readonly degraded: boolean;

  callTurn(opts: LLMCallOpts): Promise<LLMTurnResult>;
}
