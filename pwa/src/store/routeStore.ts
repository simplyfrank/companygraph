import { create } from "zustand";
import { type Route, DEFAULT_ROUTE, parseHash, toHash } from "../route";

// Centralised route store. Subscribes to `hashchange` once at module
// load so every component reads from one source of truth. Replaces the
// per-component useState<Route> pattern in App.tsx (T-08 will rip out
// the inline listener there).

export interface RouteState {
  route: Route;
  navigate: (next: Pick<Route, "surface" | "tab">, params?: Record<string, string>) => void;
  setFromHash: () => void;
}

const initialRoute: Route =
  typeof window !== "undefined" ? parseHash(window.location.hash) : DEFAULT_ROUTE;

export const useRouteStore = create<RouteState>((set) => ({
  route: initialRoute,

  navigate: (next, params) => {
    const hash = toHash(next, params);
    if (typeof window !== "undefined") {
      // Setting location.hash triggers a `hashchange` event which the
      // listener below picks up and writes to the store.
      window.location.hash = hash;
    } else {
      set({ route: parseHash(hash) });
    }
  },

  setFromHash: () => {
    if (typeof window === "undefined") return;
    set({ route: parseHash(window.location.hash) });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    useRouteStore.getState().setFromHash();
  });
}
