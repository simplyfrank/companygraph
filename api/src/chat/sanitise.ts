// Prompt-injection redaction filter (NFR-10).
// Applied to graph-derived content BEFORE it is included in any LLM prompt:
//   1. Tool result narration (every row's text fields)
//   2. describe_schema examples
//   3. bound_context ids' resolved labels
//
// FP-rate is bounded by the regex's specificity: the three-word sequence
// (verb + scope + noun) is rare in natural retail-process descriptions.
// See requirements §Risks #11 + design DD-14.

const INJECTION_RE =
  /\b(ignore|disregard|override)\s+\b(prior|previous|above|all)\b\s+\b(instructions?|rules?|directives?)\b/i;

export function redactInjection(s: string): string {
  return INJECTION_RE.test(s) ? "[REDACTED: possible prompt injection]" : s;
}

// Recursively redact every string in a nested data structure.
// Used to sanitise tool result data before it reaches the LLM.
export function redactInjectionDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactInjection(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(redactInjectionDeep) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactInjectionDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}
