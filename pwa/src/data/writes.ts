// Write-side network layer per design §4.11.
//
// Uncached one-shot POST / PATCH calls. Surfaces the
// `{error: {code, message, details}}` envelope to the caller as a
// `ClientError` so the UI can branch on `error.code`.
//
// `mergeAttributes()` (B-01 fix): client-side read-modify-write to
// preserve all prior attributes when graph-core's `patchNode` /
// `upsertNode` does a wholesale `attributes_json` replace.

import type { NodeLabel } from "@companygraph/shared/schema/nodes";

export class ClientError extends Error {
  code: string;
  details?: Record<string, unknown>;
  status: number;
  constructor(opts: { code: string; message: string; details?: Record<string, unknown>; status: number }) {
    super(opts.message);
    this.name = "ClientError";
    this.code = opts.code;
    if (opts.details !== undefined) this.details = opts.details;
    this.status = opts.status;
  }
}

async function asClientError(res: Response): Promise<ClientError> {
  let body: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* non-JSON */
  }
  return new ClientError({
    code: body.error?.code ?? "unknown_error",
    message: body.error?.message ?? `${res.status} ${res.statusText}`,
    ...(body.error?.details !== undefined ? { details: body.error.details } : {}),
    status: res.status,
  });
}

export interface WriteOptions {
  signal?: AbortSignal;
}

export async function write<T>(
  url: string,
  init: RequestInit,
  opts: WriteOptions = {},
): Promise<T> {
  const signal = opts.signal ?? init.signal;
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!res.ok) throw await asClientError(res);
  return (await res.json()) as T;
}

// mergeAttributes — RMW per design §4.11 (B-01 fix).
//
// `graph-core/patchNode` REPLACES `attributes_json` wholesale. A naïve
// PATCH `{attributes: {_review: ...}}` against a node that already has
// `{_verification: ...}` would wipe `_verification`. This helper:
//
//   1. GETs the current attributes.
//   2. Shallow-merges the patch on top.
//   3. PATCHes the merged map.
//
// Race window between step 1 and step 3 is acknowledged in design §12
// and accepted under NFR-08's single-tenant single-trust stance.

interface NodeReadResponse {
  rows: Array<{
    id: string;
    name: string;
    description: string;
    attributes: Record<string, unknown>;
  }>;
}

export async function mergeAttributes(
  label: NodeLabel,
  id: string,
  patch: Record<string, unknown>,
): Promise<unknown> {
  const encodedLabel = encodeURIComponent(label);
  const encodedId = encodeURIComponent(id);

  // 1. Read current attributes.
  const getRes = await fetch(`/api/v1/nodes/${encodedLabel}/${encodedId}`);
  if (!getRes.ok) throw await asClientError(getRes);
  const getBody = (await getRes.json()) as NodeReadResponse;
  const current = getBody.rows[0]?.attributes ?? {};

  // 2. Spread-merge top-level keys. Sub-objects (`_review`,
  //    `_verification`) are replaced as units by design — they are
  //    single state records.
  const merged = { ...current, ...patch };

  // 3. PATCH the merged map.
  const patchRes = await fetch(`/api/v1/nodes/${encodedLabel}/${encodedId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attributes: merged }),
  });
  if (!patchRes.ok) throw await asClientError(patchRes);
  return (await patchRes.json()) as unknown;
}
