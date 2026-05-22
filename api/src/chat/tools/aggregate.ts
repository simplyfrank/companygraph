import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import { ValidationError } from "../../errors";
import type { ToolDef, ToolContext } from "./types";
import {
  AGGREGATE_PATTERNS,
  AGGREGATE_PATTERN_NAMES,
  type AggRow,
  type AggregatePatternName,
} from "./aggregate-patterns";

// FR-T08 — `aggregate` tool. Closed-enum dispatch to one of 6 server-owned
// Cypher templates (DD-16). NO free-form Cypher is ever accepted.
//
// Argument validation has two layers:
//   1. zod-parse `pattern` against `AGGREGATE_PATTERN_NAMES`. Unknown
//      values get rejected here — but we also raise an explicit
//      `ValidationError("invalid_payload", { allowed_patterns })`
//      BEFORE the zod call so the LLM sees the allowed enum in the
//      error envelope (AC-27 b — `aggregate-pattern-enum.test.ts`).
//   2. each pattern's own `params` zod schema validates the typed
//      params record; zod failures throw `ValidationError("invalid_payload")`
//      which the dispatch layer converts to a tool-error envelope.

const argsSchema = z.object({
  pattern: z.enum(AGGREGATE_PATTERN_NAMES as [AggregatePatternName, ...AggregatePatternName[]]),
  params: z.record(z.union([z.string(), z.number()])),
});

type Args = z.infer<typeof argsSchema>;

interface Data {
  pattern: AggregatePatternName;
  rows: AggRow[];
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "aggregate",
  description:
    "Run one of 6 server-owned aggregation patterns: " +
    AGGREGATE_PATTERN_NAMES.join(", ") +
    ". Pick a pattern by name and supply typed `params`; no free-form Cypher.",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    // Pre-zod safety net: explicit allowed_patterns hint for the LLM.
    // The outer `argsSchema.parse` (in dispatch.ts) will have already
    // rejected unknown patterns at the enum boundary, BUT — when callers
    // bypass zod (e.g. unit tests that hand a raw object directly to
    // `runTool`), the dispatch layer's `safeParse` rejects with the
    // generic `invalid_payload` shape. Raising explicitly here makes
    // sure the `allowed_patterns` array is on `error.details` regardless.
    if (!AGGREGATE_PATTERN_NAMES.includes(args.pattern as AggregatePatternName)) {
      throw new ValidationError("invalid_payload", {
        allowed_patterns: AGGREGATE_PATTERN_NAMES,
      });
    }

    const pattern = AGGREGATE_PATTERNS[args.pattern];

    // Per-pattern params validation. zod throws on failure; we convert
    // to `invalid_payload` so the tool-dispatch boundary returns a
    // well-shaped tool error rather than a raw zod error.
    const parsed = pattern.params.safeParse(args.params);
    if (!parsed.success) {
      throw new ValidationError("invalid_payload", {
        pattern: args.pattern,
        fieldErrors: parsed.error.format(),
      });
    }

    const built = pattern.cypher(parsed.data as never);
    const { rows } = await runPassthrough(ctx.driver, built.stmt, built.params);
    const mapped = built.mapRows(rows);

    return {
      pattern: args.pattern,
      rows: mapped.slice(0, 100), // FR-T08 ≤ 100 rows cap
    };
  },
};
