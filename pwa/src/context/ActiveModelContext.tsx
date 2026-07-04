// model-workspace-core T-18 (design §4.9, FR-15, UX-06) — the
// active-model context is a SHELL-level concern: mounted above
// renderView in App.tsx so every Model view (and every downstream
// sibling tab) can consume it.
//
// Persistence: the active model id lives in localStorage under the
// per-origin key `cg.activeModelId`; a `?model=<id>` URL param (hash
// query, parsed on mount) wins over the stored value so a deep link +
// reload restore the same selection (AC-18). Default: the reference
// model (Business Model #1), else the first listed model.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { models as modelsApi, type ModelRead } from "../api";

const STORAGE_KEY = "cg.activeModelId";

export type ActiveModelStatus = "loading" | "ready" | "error";

export interface ActiveModelContextValue {
  activeModel: ModelRead | null;
  models: ModelRead[];
  status: ActiveModelStatus;
  error: string | null;
  setActiveModel: (id: string) => void;
  reload: () => Promise<void>;
}

const ActiveModelContext = createContext<ActiveModelContextValue | null>(null);

function readUrlModelParam(): string | null {
  // Hash-router: params live behind the hash — #/model/models?model=<id>.
  const hash = window.location.hash;
  const q = hash.indexOf("?");
  if (q === -1) return null;
  return new URLSearchParams(hash.slice(q + 1)).get("model");
}

function readStoredModelId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeModelId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private-mode etc. — selection just won't persist */
  }
}

export function ActiveModelProvider({ children }: { children: ReactNode }) {
  const [modelList, setModelList] = useState<ModelRead[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<ActiveModelStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const reconcile = useCallback((list: ModelRead[], preferredId: string | null) => {
    const byId = (id: string | null) => (id ? list.find((m) => m.id === id) : undefined);
    const chosen =
      byId(preferredId) ??
      byId(readStoredModelId()) ??
      list.find((m) => m.isReference) ??
      list[0];
    if (chosen) {
      setActiveId(chosen.id);
      storeModelId(chosen.id);
    } else {
      setActiveId(null);
    }
  }, []);

  const reload = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const list = await modelsApi.list();
      setModelList(list);
      reconcile(list, readUrlModelParam());
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [reconcile]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setActiveModel = useCallback((id: string) => {
    setActiveId(id);
    storeModelId(id);
  }, []);

  const value = useMemo<ActiveModelContextValue>(
    () => ({
      activeModel: modelList.find((m) => m.id === activeId) ?? null,
      models: modelList,
      status,
      error,
      setActiveModel,
      reload,
    }),
    [modelList, activeId, status, error, setActiveModel, reload],
  );

  return <ActiveModelContext.Provider value={value}>{children}</ActiveModelContext.Provider>;
}

export function useActiveModel(): ActiveModelContextValue {
  const ctx = useContext(ActiveModelContext);
  if (!ctx) {
    throw new Error("useActiveModel must be used inside <ActiveModelProvider> (mounted in App.tsx)");
  }
  return ctx;
}
