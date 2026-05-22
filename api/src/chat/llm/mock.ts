// MockLLMClient — fixture-backed `LLMClient` used by tests and when
// the Anthropic key is unset (FR-B06). Each fixture is a JSON array of
// turn responses; the mock replays them in order. Exhausting the
// fixture returns an empty `end_turn` so the orchestrator's loop
// terminates safely.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LLMCallOpts,
  LLMClient,
  LLMToolCall,
  LLMTurnResult,
  LLMUsage,
} from "./client";

interface FixtureTurn {
  stop_reason: "tool_use" | "end_turn" | "max_tokens";
  tool_calls?: LLMToolCall[];
  text?: string;
  usage?: LLMUsage;
}

interface Fixture {
  turns: FixtureTurn[];
}

export interface MockLLMClientOpts {
  defaultFixture: string;
}

const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function loadFixture(name: string): Fixture {
  const path = resolve(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Fixture;
  return parsed;
}

const ZERO_USAGE: LLMUsage = { input_tokens: 0, output_tokens: 0 };

export class MockLLMClient implements LLMClient {
  readonly degraded = true;
  private readonly defaultFixture: string;
  private turnCounter = 0;
  private lastFixtureName: string | null = null;
  private cached: Fixture | null = null;

  constructor(opts: MockLLMClientOpts) {
    this.defaultFixture = opts.defaultFixture;
  }

  // Test hook — reset turn counter between scenarios.
  reset(): void {
    this.turnCounter = 0;
    this.cached = null;
    this.lastFixtureName = null;
  }

  // For tests that want to inspect what was sent (no-op storage).
  async callTurn(_opts: LLMCallOpts): Promise<LLMTurnResult> {
    void _opts;
    const fixtureName =
      process.env.MOCK_LLM_FIXTURE && process.env.MOCK_LLM_FIXTURE.length > 0
        ? process.env.MOCK_LLM_FIXTURE
        : this.defaultFixture;

    // Re-load if the fixture selection changed (test switched env mid-run).
    if (this.cached === null || this.lastFixtureName !== fixtureName) {
      this.cached = loadFixture(fixtureName);
      this.lastFixtureName = fixtureName;
      this.turnCounter = 0;
    }

    const idx = this.turnCounter;
    this.turnCounter += 1;

    if (idx >= this.cached.turns.length) {
      // Exhausted fixture — terminate the loop gracefully.
      return {
        stop_reason: "end_turn",
        tool_calls: [],
        text: "",
        usage: { ...ZERO_USAGE },
      };
    }

    const turn = this.cached.turns[idx]!;
    return {
      stop_reason: turn.stop_reason,
      tool_calls: turn.tool_calls ?? [],
      text: turn.text,
      usage: turn.usage ?? { ...ZERO_USAGE },
    };
  }
}
