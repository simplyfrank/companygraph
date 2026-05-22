import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Single-user localStorage preference. Not a user identity — single-tenant
// per NFR-08. FR-21 reads `homeDomainId` to gate write buttons (advisory only).

export interface PrefState {
  homeDomainId: string | null;
  setHomeDomain: (id: string | null) => void;
  clearHomeDomain: () => void;
}

export const usePrefStore = create<PrefState>()(
  persist(
    (set) => ({
      homeDomainId: null,
      setHomeDomain: (id) => set({ homeDomainId: id }),
      clearHomeDomain: () => set({ homeDomainId: null }),
    }),
    {
      name: "companygraph.prefs.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
