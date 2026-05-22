import { UUIDV7_REGEX } from "../ids";
import type { ErrorEnvelope } from "@companygraph/shared/types";
import { ValidationError, type ErrorCode } from "../errors";
import { getSchema } from "../ontology/cache/schema";

// AC-15 / NFR-02 — the previous synchronous `parseLabel(s)` was removed
// when this module stopped importing the compile-time NODE_LABELS const
// tuple. The async `parseRegistryLabel` below replaces it on every
// URL-param guard site (routes/nodes.ts, routes/query.ts, ontology
// routes). Sole legal importer of NODE_LABELS is `api/src/ontology/seed.ts`
// (the privileged bootstrap path), enforced by `ontology-no-frozen-import.test.ts`.

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

// T-13 §5.5 — Registry-backed URL-param guards for ontology routes.
// Uses the schema cache so cache-hits cost < 1 ms; cache-misses hit Neo4j.
// Returns the validated name string, or null when unknown / wrong type.

export async function parseRegistryLabel(s: unknown): Promise<string | null> {
  if (typeof s !== "string" || s.length === 0) return null;
  const schema = await getSchema();
  return schema.nodeLabels.some((l) => l.name === s) ? s : null;
}

export async function parseEdgeTypeName(s: unknown): Promise<string | null> {
  if (typeof s !== "string" || s.length === 0) return null;
  const schema = await getSchema();
  return schema.edgeTypes.some((t) => t.name === s) ? s : null;
}

// Parse a boolean URL query param present as "true" / "1" / absent.
export function parseQueryBool(url: URL, param: string): boolean {
  const v = url.searchParams.get(param);
  return v === "true" || v === "1";
}
