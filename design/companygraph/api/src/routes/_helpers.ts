import { NODE_LABELS, type NodeLabel } from "@companygraph/shared/schema/nodes";
import { UUIDV7_REGEX } from "../ids";
import type { ErrorEnvelope } from "@companygraph/shared/types";
import { ValidationError, type ErrorCode } from "../errors";

// Runtime guard for URL `:label` params. Closes design-review C-05 —
// without this guard, `req.params.label as NodeLabel` would silently
// admit arbitrary strings (including Cypher-injection payloads) into the
// storage layer's template-interpolated label.
export function parseLabel(s: unknown): NodeLabel | null {
  return typeof s === "string" && (NODE_LABELS as readonly string[]).includes(s)
    ? (s as NodeLabel) : null;
}

export function parseId(s: unknown): string | null {
  return typeof s === "string" && UUIDV7_REGEX.test(s) ? s : null;
}

export function ok<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function error(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  const env: ErrorEnvelope = {
    error: { code, message, ...(Object.keys(details).length > 0 ? { details } : {}) },
  };
  return new Response(JSON.stringify(env), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Maps a ValidationError to the envelope response.
export function fromValidationError(e: ValidationError): Response {
  return error(e.httpStatus, e.code, e.code, e.details);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError("invalid_payload", { cause: "request body is not valid JSON" });
  }
}
