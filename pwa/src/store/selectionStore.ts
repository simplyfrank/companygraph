import { create } from "zustand";
import type { NodeLabel } from "@companygraph/shared/schema/nodes";

// Drives the SidePanel (FR-24). The canvas + lists call `select(id, label)`;
// the panel reads selectedEntityId + selectedEntityLabel + panelOpen.

export interface SelectionState {
  selectedEntityId: string | null;
  selectedEntityLabel: NodeLabel | null;
  panelOpen: boolean;
  select: (id: string, label: NodeLabel) => void;
  clear: () => void;
  setPanelOpen: (open: boolean) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedEntityId: null,
  selectedEntityLabel: null,
  panelOpen: false,

  select: (id, label) => {
    set({ selectedEntityId: id, selectedEntityLabel: label, panelOpen: true });
  },

  clear: () => {
    set({ selectedEntityId: null, selectedEntityLabel: null, panelOpen: false });
  },

  setPanelOpen: (open) => {
    set({ panelOpen: open });
  },
}));
