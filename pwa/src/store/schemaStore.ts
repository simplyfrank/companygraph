import { create } from "zustand";
import { NODE_LABELS, type NodeLabel } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, type EdgeType } from "@companygraph/shared/schema/edges";

// Runtime schema returned by /api/v1/schema (owned by ontology-manager).
// Until ontology-manager ships, the boot path falls back to the
// compile-time tuples below via SchemaBootstrap (T-06).
export interface Schema {
  nodeLabels: ReadonlyArray<{ name: NodeLabel }>;
  edgeTypes: ReadonlyArray<{ name: EdgeType }>;
}

export const STATIC_SCHEMA_FALLBACK: Schema = {
  nodeLabels: NODE_LABELS.map((name) => ({ name })),
  edgeTypes: EDGE_TYPES.map((name) => ({ name })),
};

export interface SchemaState {
  schema: Schema | null;
  etag: string | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  invalidate: () => void;
  setFromStatic: () => void;
  setFromServer: (schema: Schema, etag: string | null) => void;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schema: null,
  etag: null,
  fetchedAt: null,
  loading: false,
  error: null,

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const headers: Record<string, string> = {};
      const prevEtag = get().etag;
      if (prevEtag) headers["if-none-match"] = prevEtag;
      const res = await fetch("/api/v1/schema", { headers });
      if (res.status === 304) {
        set({ loading: false, fetchedAt: Date.now() });
        return;
      }
      if (res.status === 404) {
        // ontology-manager not deployed — silent fallback.
        // SchemaBootstrap (T-06) emits the one-time console warning.
        set({
          schema: STATIC_SCHEMA_FALLBACK,
          etag: null,
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        });
        return;
      }
      if (!res.ok) {
        set({ loading: false, error: `${res.status} ${res.statusText}` });
        return;
      }
      const body = (await res.json()) as Schema;
      set({
        schema: body,
        etag: res.headers.get("etag"),
        fetchedAt: Date.now(),
        loading: false,
        error: null,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  invalidate: () => {
    // Drop the cached body; next consumer triggers refresh().
    set({ schema: null, etag: null, fetchedAt: null });
  },

  setFromStatic: () => {
    set({
      schema: STATIC_SCHEMA_FALLBACK,
      etag: null,
      fetchedAt: Date.now(),
      loading: false,
      error: null,
    });
  },

  setFromServer: (schema, etag) => {
    set({ schema, etag, fetchedAt: Date.now(), loading: false, error: null });
  },
}));
