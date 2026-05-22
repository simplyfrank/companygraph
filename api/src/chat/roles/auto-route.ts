// Classifier-prefix parser per DD-18. The LLM is asked to prefix its
// first response with a JSON envelope describing intent + role. This
// module extracts that envelope; on any parse failure it returns a
// graceful default (`in_scope` + the caller-supplied fallback role)
// and emits a server-log warning. The orchestrator NEVER refuses
// solely because the prefix is missing or malformed.
//
// T-11 will extend this file with the full role registry / classifier;
// for now only the parser lives here.

import type { ChatRoleId } from "@companygraph/shared";

export type ClassifierIntent = "in_scope" | "oos";

export interface ClassifierPrefix {
  intent: ClassifierIntent;
  // `null` only when intent === "oos" (the classifier explicitly
  // declines to pick a role).
  role_id: ChatRoleId | null;
  oos_reason: string | null;
  // The text content with the JSON prefix (and any wrapping
  // markdown fence) stripped. On parse failure equals the original.
  remaining_text: string;
}

// JSON-prefix regex: matches a leading `{...}` object up to the
// outermost balanced brace. Non-greedy `[\s\S]*?` plus the closing
// `}` is sufficient because the classifier envelope is a flat object
// (no nested braces) per DD-18.
const LEADING_JSON_RE = /^\s*(\{[\s\S]*?\})/;

// Markdown fence wrapper. Captures the inner block and the trailing
// text after the closing fence so callers can recover the narration.
const FENCE_RE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*([\s\S]*)$/;

function parseEnvelope(
  raw: string,
): { intent: ClassifierIntent; role_id: string | null; oos_reason: string | null } | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const intent = obj["intent"];
    if (intent !== "in_scope" && intent !== "oos") return null;
    const role_id =
      typeof obj["role_id"] === "string" ? (obj["role_id"] as string) : null;
    const oos_reason =
      typeof obj["oos_reason"] === "string"
        ? (obj["oos_reason"] as string)
        : null;
    return { intent, role_id, oos_reason };
  } catch {
    return null;
  }
}

export function extractClassifierPrefix(
  text: string,
  fallbackRoleId: ChatRoleId,
): ClassifierPrefix {
  // Empty text — fall through to the graceful default. No log
  // (an empty LLM turn is a normal tool_use response).
  if (text.length === 0) {
    return {
      intent: "in_scope",
      role_id: fallbackRoleId,
      oos_reason: null,
      remaining_text: "",
    };
  }

  // 1. Strip an outer markdown fence (```json ... ``` or ``` ... ```)
  //    if present, and keep the post-fence narration as `remaining`.
  const fenced = text.match(FENCE_RE);
  const candidate = fenced ? fenced[1]! : text;
  const fenceTail = fenced ? fenced[2]! : "";

  // 2. Try to extract the leading JSON object from `candidate`.
  const jsonMatch = candidate.match(LEADING_JSON_RE);
  if (jsonMatch) {
    const parsed = parseEnvelope(jsonMatch[1]!);
    if (parsed) {
      const remainder = candidate.slice(jsonMatch[0].length).trim();
      const remaining_text = fenced
        ? // Discard the prefix, keep any post-JSON inner-fence text
          // plus the post-fence narration.
          [remainder, fenceTail.trim()].filter(Boolean).join("\n\n")
        : remainder;

      if (parsed.intent === "oos") {
        return {
          intent: "oos",
          role_id: null,
          oos_reason: parsed.oos_reason,
          remaining_text,
        };
      }

      // intent === "in_scope"
      const role_id = (parsed.role_id ?? fallbackRoleId) as ChatRoleId;
      return {
        intent: "in_scope",
        role_id,
        oos_reason: null,
        remaining_text,
      };
    }
  }

  // 3. Graceful default. Log so misbehaving prompts surface in ops.
  console.warn(
    "[chat] classifier-prefix parse failed; defaulting to in_scope + fallback role",
  );
  return {
    intent: "in_scope",
    role_id: fallbackRoleId,
    oos_reason: null,
    remaining_text: text,
  };
}
