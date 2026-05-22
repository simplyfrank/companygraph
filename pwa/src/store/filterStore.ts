import { create } from "zustand";

// Activity multi-filter (FR-09). Keys mirror the query-string contract
// from design §4.9: `?system=<id>&role=<id>&location=<id>`. Filter is
// URL-first so the active state survives reload + share.

export type FilterKey = "system" | "role" | "location";

export interface FilterState {
  system: string | null;
  role: string | null;
  location: string | null;
  setFilter: (key: FilterKey, value: string | null) => void;
  clearFilter: (key: FilterKey) => void;
  clearAll: () => void;
  toQueryString: () => string;
  fromQueryString: (s: string) => void;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  system: null,
  role: null,
  location: null,

  setFilter: (key, value) => {
    set({ [key]: value || null } as Pick<FilterState, FilterKey>);
  },

  clearFilter: (key) => {
    set({ [key]: null } as Pick<FilterState, FilterKey>);
  },

  clearAll: () => {
    set({ system: null, role: null, location: null });
  },

  toQueryString: () => {
    const params = new URLSearchParams();
    const { system, role, location } = get();
    if (system) params.set("system", system);
    if (role) params.set("role", role);
    if (location) params.set("location", location);
    return params.toString();
  },

  fromQueryString: (s) => {
    const params = new URLSearchParams(s);
    set({
      system: params.get("system"),
      role: params.get("role"),
      location: params.get("location"),
    });
  },
}));
