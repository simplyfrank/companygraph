import { create } from "zustand";

export interface TitleState {
  titles: Record<string, string>;
  setTitle: (entityId: string, name: string) => void;
  clearTitle: (entityId: string) => void;
}

export const useTitleStore = create<TitleState>((set) => ({
  titles: {},
  setTitle: (entityId, name) => set((s) => ({ titles: { ...s.titles, [entityId]: name } })),
  clearTitle: (entityId) => set((s) => {
    const { [entityId]: _, ...rest } = s.titles;
    return { titles: rest };
  }),
}));
