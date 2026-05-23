import type {
  Health,
  Stats,
  ChatEnvelope,
  ChatRequest,
  ProgressSnapshot,
} from "@companygraph/shared/types";

// Architecture: signal is optional so health-polling callers that manage
// their own AbortController can still call without one, while useFetch
// callers always provide the signal to enable true HTTP cancellation.
//
// exactOptionalPropertyTypes: RequestInit.signal is AbortSignal | null, not
// AbortSignal | undefined. We spread the signal into init only when defined
// so the property is absent (not undefined) when no signal is provided.
function withSignal(signal: AbortSignal | undefined): RequestInit {
  return signal ? { signal } : {};
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch { /* */ }
    throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // GET endpoints accept an optional AbortSignal forwarded from useFetch.
  healthz: (signal?: AbortSignal) => json<Health>("/api/v1/healthz", withSignal(signal)),
  stats: (signal?: AbortSignal) => json<Stats>("/api/v1/stats", withSignal(signal)),

  listDomains: (signal?: AbortSignal) => json<{ rows: DomainRow[] }>("/api/v1/query/listDomains", withSignal(signal)),
  getDomain: (id: string, signal?: AbortSignal) => json<{ rows: DomainDetailRow[] }>(`/api/v1/query/getDomain/${encodeURIComponent(id)}`, withSignal(signal)),
  getJourney: (id: string, signal?: AbortSignal) => json<{ rows: JourneyDetailRow[] }>(`/api/v1/query/getJourney/${encodeURIComponent(id)}`, withSignal(signal)),
  getActivity: (id: string, signal?: AbortSignal) => json<{ rows: ActivityRow[] }>(`/api/v1/query/getActivity/${encodeURIComponent(id)}`, withSignal(signal)),
  neighbors: (id: string, depth = 1, signal?: AbortSignal) => json<{ rows: NeighborRow[] }>(`/api/v1/query/neighbors/${encodeURIComponent(id)}?depth=${depth}`, withSignal(signal)),
  findPath: (fromId: string, toId: string, maxDepth = 4, signal?: AbortSignal) =>
    json<{ rows: PathRow[] }>(`/api/v1/query/findPath?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}&maxDepth=${maxDepth}`, withSignal(signal)),

  // T-31 (graph-core amendment from process-explorer-ui/FR-17 + AC-28):
  // per-label fulltext substring search backing FR-08 (palette) and
  // FR-17 (typeahead binding). The handler clamps `limit` to 1..100.
  search: (
    label: string,
    q: string,
    limit = 20,
    signal?: AbortSignal,
  ) =>
    json<{ rows: SearchHit[] }>(
      `/api/v1/query/search?label=${encodeURIComponent(label)}&q=${encodeURIComponent(q)}&limit=${limit}`,
      withSignal(signal),
    ),

  // POST mutations do not accept a signal — they are user-initiated writes
  // that must not be silently cancelled mid-flight.
  cypher: (statement: string, params: Record<string, unknown> = {}) =>
    json<{ rows: Record<string, unknown>[] }>("/api/v1/query/cypher", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statement, params }),
    }),

  exportJson: (signal?: AbortSignal) => json<{ nodes: ExportNode[]; edges: ExportEdge[] }>("/api/v1/export", withSignal(signal)),
  openapi: (signal?: AbortSignal) => json<Record<string, unknown>>("/api/v1/openapi.json", withSignal(signal)),

  // chat-interface (rev 3.1) — agentic chat surface.
  chat: {
    send: (req: ChatRequest): Promise<ChatEnvelope> =>
      json<ChatEnvelope>("/api/v1/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      }),
    progress: (messageId: string, signal?: AbortSignal): Promise<ProgressSnapshot> =>
      json<ProgressSnapshot>(
        `/api/v1/chat/messages/${encodeURIComponent(messageId)}/progress`,
        withSignal(signal),
      ),
  },
};

export interface DomainRow { id: string; name: string; description: string }
export interface DomainDetailRow {
  id: string;
  name: string;
  description: string;
  journeys: Array<{ id: string; name: string }>;
}
export interface JourneyDetailRow {
  id: string;
  name: string;
  description: string;
  activities: Array<{
    id: string;
    name: string;
    sla_target_hours?: number | null;
    p95_hours?: number | null;
    kpi_score?: number | null;
  }>;
  sla_target_hours?: number | null;
  p95_hours?: number | null;
  kpi_score?: number | null;
  owner_team?: string | null;
  verification?: { by?: string; at?: string } | null;
}
export interface ActivityRow { id: string; name: string; description: string }
export interface NeighborRow { node: { id: string; name: string }; label: string }
export interface PathRow { length: number; nodes: string[]; edges: string[] }
export interface SearchHit { id: string; name: string; label: string }
export interface ExportNode {
  id: string;
  label: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
}
export interface ExportEdge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  createdAt: string;
  attributes: Record<string, unknown>;
}
