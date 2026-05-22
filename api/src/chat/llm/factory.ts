// LLM-client factory. Picks the concrete impl by env. Memoised so
// repeated calls within a process return the same instance (the mock
// client carries a turn counter; a fresh instance per call would
// always replay turn-0 — wrong for the ReAct loop). Tests reset the
// memo via `resetLLMClientForTest()`.

import { loadEnv } from "../../env";
import { AnthropicLLMClient } from "./anthropic";
import type { LLMClient } from "./client";
import { MockLLMClient } from "./mock";

// Sonnet 4.6 — current as of the chat-interface spec rev 3.1. Per the
// design-review C-02 ruling, this is NOT bumped to 4.7 (Opus is 4.7,
// Sonnet is 4.6). The alias is sufficient — the dated variant is
// pinned at deployment time.
const DEFAULT_MODEL = "claude-sonnet-4-6";

let cached: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (cached) return cached;

  const env = loadEnv();
  if (!env.anthropicApiKey) {
    console.warn(
      "[chat] ANTHROPIC_API_KEY unset — using MockLLMClient (degraded mode)",
    );
    cached = new MockLLMClient({ defaultFixture: "default" });
    return cached;
  }

  cached = new AnthropicLLMClient({
    apiKey: env.anthropicApiKey,
    model: DEFAULT_MODEL,
  });
  return cached;
}

// Test hook — clear the memo so subsequent `getLLMClient()` re-reads
// env and rebuilds the impl. Production code MUST NOT call this.
export function resetLLMClientForTest(): void {
  cached = null;
}
