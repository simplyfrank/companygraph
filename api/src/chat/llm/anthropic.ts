// AnthropicLLMClient — concrete `LLMClient` backed by the
// `@anthropic-ai/sdk` Messages API. This is the only file in the
// codebase that imports the SDK directly; all other call sites import
// from `./client.ts`.

import Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicMessage,
  AnthropicTool,
  LLMCallOpts,
  LLMClient,
  LLMToolCall,
  LLMTurnResult,
  SystemPromptBlock,
} from "./client";

// Anthropic's `messages.create` accepts `system` as either a string or
// an array of text blocks (with optional `cache_control`). Our local
// `SystemPromptBlock` is the same shape; we hand it through verbatim
// so prompt caching keeps working.

export interface AnthropicLLMClientOpts {
  apiKey: string;
  model: string;
}

export class AnthropicLLMClient implements LLMClient {
  readonly degraded = false;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicLLMClientOpts) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async callTurn(opts: LLMCallOpts): Promise<LLMTurnResult> {
    // The SDK's `messages.create` is loosely-typed enough at the
    // structured-content boundary that direct passing of our local
    // shapes is safe. We cast through `unknown` rather than relying
    // on the SDK's exported `MessageParam`/`Tool` types — that keeps
    // the local types as the source of truth.
    const messages = opts.messages as unknown as Parameters<
      typeof this.client.messages.create
    >[0]["messages"];
    const tools = opts.tools as unknown as Parameters<
      typeof this.client.messages.create
    >[0]["tools"];
    const system = opts.system as unknown as Parameters<
      typeof this.client.messages.create
    >[0]["system"];

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      tools,
      system,
      messages,
    });

    // Map SDK response → local `LLMTurnResult`.
    const toolCalls: LLMToolCall[] = [];
    let text: string | undefined;
    for (const block of res.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as unknown,
        });
      } else if (block.type === "text") {
        text = text === undefined ? block.text : text + block.text;
      }
    }

    // `stop_reason` from the SDK is `'end_turn' | 'max_tokens' |
    // 'stop_sequence' | 'tool_use' | null`. Normalise the two we
    // don't model (`stop_sequence`, `null`) to `'end_turn'`.
    const rawStop = res.stop_reason;
    const stop_reason: LLMTurnResult["stop_reason"] =
      rawStop === "tool_use"
        ? "tool_use"
        : rawStop === "max_tokens"
          ? "max_tokens"
          : "end_turn";

    return {
      stop_reason,
      tool_calls: toolCalls,
      text,
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        cache_creation_input_tokens:
          (res.usage as { cache_creation_input_tokens?: number })
            .cache_creation_input_tokens,
        cache_read_input_tokens:
          (res.usage as { cache_read_input_tokens?: number })
            .cache_read_input_tokens,
      },
    };
  }
}

// Re-exported for clarity at call sites.
export type {
  AnthropicMessage,
  AnthropicTool,
  SystemPromptBlock,
};
