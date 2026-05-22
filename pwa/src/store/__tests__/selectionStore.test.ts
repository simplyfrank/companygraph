import { describe, test, expect, beforeEach } from "vitest";
import { useSelectionStore } from "../selectionStore";

describe("selectionStore", () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedEntityId: null,
      selectedEntityLabel: null,
      panelOpen: false,
    });
  });

  test("select sets id + label and opens the panel", () => {
    useSelectionStore.getState().select("act-1", "Activity");
    const s = useSelectionStore.getState();
    expect(s.selectedEntityId).toBe("act-1");
    expect(s.selectedEntityLabel).toBe("Activity");
    expect(s.panelOpen).toBe(true);
  });

  test("clear wipes everything", () => {
    useSelectionStore.getState().select("act-1", "Activity");
    useSelectionStore.getState().clear();
    const s = useSelectionStore.getState();
    expect(s.selectedEntityId).toBeNull();
    expect(s.selectedEntityLabel).toBeNull();
    expect(s.panelOpen).toBe(false);
  });

  test("setPanelOpen toggles without losing selection", () => {
    useSelectionStore.getState().select("dom-1", "Domain");
    useSelectionStore.getState().setPanelOpen(false);
    const s = useSelectionStore.getState();
    expect(s.panelOpen).toBe(false);
    expect(s.selectedEntityId).toBe("dom-1");
  });
});
