// Read-side network layer per design §4.2.
//
// Wraps `pwa/src/api.ts` with:
//   1. In-memory cache keyed by `URL + body-hash` (30 s default TTL).
//   2. AbortController propagation — every fetch is cancellable.
//   3. Single-flight de-duplication — concurrent same-key reads share
//      one promise.
//   4. Stale-while-revalidate is not implemented here (the service
//      worker layer in T-24 handles that); this layer is pure
//      memoisation.

interface CacheEntry<T> {
  data: T;
  at: number;
}

const inflight = new Map<string, Promise<unknown>>();
const memCache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 30_000;

async function bodyHash(body: unknown): Promise<string> {
  if (!body) return "";
  const json = JSON.stringify(body);
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // Fallback: cheap string-folded hash. Not cryptographic but
    // suffices for de-dup keying in environments without Web Crypto.
    let h = 0;
    for (let i = 0; i < json.length; i++) {
      h = (h << 5) - h + json.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ReadOptions {
  ttlMs?: number;
  signal?: AbortSignal;
}

export async function read<T>(url: string, opts: ReadOptions = {}): Promise<T> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const hit = memCache.get(url) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (inflight.has(url)) return inflight.get(url) as Promise<T>;

  const p = (async (): Promise<T> => {
    const res = await fetch(url, { ...(opts.signal ? { signal: opts.signal } : {}) });
    if (!res.ok) throw await asError(res);
    const data = (await res.json()) as T;
    memCache.set(url, { data, at: Date.now() });
    return data;
  })();
  inflight.set(url, p);
  try {
    return await p;
  } finally {
    inflight.delete(url);
  }
}

export interface CypherDedupOptions extends ReadOptions {
  // ttl applies to the cached body just like read().
}

export async function cypherDedup<T = Record<string, unknown>>(
  statement: string,
  params: Record<string, unknown> = {},
  opts: CypherDedupOptions = {},
): Promise<{ rows: T[] }> {
  const key = `POST /api/v1/query/cypher#${await bodyHash({ statement, params })}`;
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const hit = memCache.get(key) as CacheEntry<{ rows: T[] }> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (inflight.has(key)) return inflight.get(key) as Promise<{ rows: T[] }>;

  const p = (async (): Promise<{ rows: T[] }> => {
    const res = await fetch("/api/v1/query/cypher", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statement, params }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (!res.ok) throw await asError(res);
    const data = (await res.json()) as { rows: T[] };
    memCache.set(key, { data, at: Date.now() });
    return data;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export function clearCache(): void {
  memCache.clear();
  inflight.clear();
}

// Namespace export for convenience imports (`import { reads } from ...`)
export const reads = { read, cypherDedup, clearCache };

async function asError(res: Response): Promise<Error> {
  let detail = "";
  try {
    detail = JSON.stringify(await res.json());
  } catch {
    /* non-JSON error body */
  }
  return new Error(`${res.status} ${res.statusText} ${res.url} ${detail}`);
}
