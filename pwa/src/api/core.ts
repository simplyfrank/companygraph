// Core API utilities — shared across all API modules

// Architecture: signal is optional so health-polling callers that manage
// their own AbortController can still call without one, while useFetch
// callers always provide the signal to enable true HTTP cancellation.
//
// exactOptionalPropertyTypes: RequestInit.signal is AbortSignal | null, not
// AbortSignal | undefined. We spread the signal into init only when defined
// so the property is absent (not undefined) when no signal is provided.
export function withSignal(signal: AbortSignal | undefined): RequestInit {
  return signal ? { signal } : {};
}

// GET request deduplication cache to prevent duplicate in-flight requests
const pendingRequests = new Map<string, Promise<any>>();

// Runtime guard to ensure API responses are arrays when expected
// This prevents crashes when backend contract drifts (e.g., { rows: T[] } vs T[])
export function guardArray<T>(value: unknown, context: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  console.error(`API contract violation: expected array for ${context}, got`, value);
  return [];
}

export async function json<T>(path: string, init?: RequestInit): Promise<T> {
  // Only deduplicate GET requests (no method or method is GET)
  const isGet = !init || !init.method || init.method.toUpperCase() === "GET";
  
  if (isGet) {
    const cacheKey = path;
    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey) as Promise<T>;
    }
    
    const promise = (async () => {
      try {
        const res = await fetch(path, init);
        if (!res.ok) {
          let detail = "";
          try { detail = JSON.stringify(await res.json()); } catch { /* */ }
          throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
        }
        return res.json() as Promise<T>;
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();
    
    pendingRequests.set(cacheKey, promise);
    return promise;
  }
  
  // For non-GET requests, proceed normally
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch { /* */ }
    throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
  }
  return res.json() as Promise<T>;
}
