import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Single-user localStorage preference. Not a user identity — single-tenant
// per NFR-08. FR-21 reads `homeDomainId` to gate write buttons (advisory only).

export interface LastTab {
  tab: string;
  entityId?: string;
}

export interface PrefState {
  homeDomainId: string | null;
  setHomeDomain: (id: string | null) => void;
  clearHomeDomain: () => void;
  lastTabs: Record<string, LastTab>;
  setLastTab: (surface: string, tab: string, entityId?: string) => void;
  getLastTab: (surface: string) => LastTab | undefined;
}

export const usePrefStore = create<PrefState>()(
  persist(
    (set, get) => ({
      homeDomainId: null,
      setHomeDomain: (id) => set({ homeDomainId: id }),
      clearHomeDomain: () => set({ homeDomainId: null }),
      lastTabs: {},
      setLastTab: (surface, tab, entityId) =>
        set((state) => ({
          lastTabs: { ...state.lastTabs, [surface]: { tab, entityId } },
        })),
      getLastTab: (surface) => get().lastTabs[surface],
    }),
    {
      name: "companygraph.prefs.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
