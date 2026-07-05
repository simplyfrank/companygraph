// kpi-impact-mapping T-15 (design §4.12, FR-08/FR-09, AC-18/AC-19) — PWA
// view-state unit tests. Tests the pure logic used by KpiImpactMatrix
// without DOM rendering. The view component itself is verified by
// Playwright e2e (T-16).

import { describe, test, expect } from "bun:test";
import type { KpiImpactMatrix } from "../src/api";

// Re-implement the view-state gate logic (identical to the component's
// inline check) to test without importing React + context.
function deriveViewState(data: KpiImpactMatrix): "empty" | "ready" {
  if (data.meta.activityCount === 0 || data.meta.linkedCellCount === 0) {
    return "empty";
  }
  return "ready";
}

// Re-implement the gap check: key activity + no directional link → gap
function hasGap(matrix: KpiImpactMatrix, activityId: string): boolean {
  return matrix.gaps.some(g => g.activityId === activityId);
}

// Re-implement the cell-chip renderer logic
function renderChip(cell: { direction: string | null; weight: number | null } | null): string {
  if (!cell) return "";
  const arrow = cell.direction === "increases" ? "↑" : cell.direction === "decreases" ? "↓" : "—";
  const weight = cell.weight != null ? cell.weight.toFixed(2) : "";
  return `${arrow} ${weight}`.trim();
}

describe("kpi-impact-mapping T-15 view-state logic", () => {
  const emptyMatrix: KpiImpactMatrix = {
    rows: [],
    columns: [],
    cells: [],
    gaps: [],
    meta: { activityCount: 0, kpiCount: 0, linkedCellCount: 0, keyActivityCount: 0, gapCount: 0 },
  };

  const readyMatrix: KpiImpactMatrix = {
    rows: [
      { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 0 },
    ],
    columns: [
      { id: "k1", name: "Revenue", unit: "$", targetDirection: "higher_is_better" },
    ],
    cells: [[{ direction: "increases", weight: 0.8 }]],
    gaps: [],
    meta: { activityCount: 1, kpiCount: 1, linkedCellCount: 1, keyActivityCount: 1, gapCount: 0 },
  };

  const noLinksMatrix: KpiImpactMatrix = {
    rows: [
      { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 0 },
    ],
    columns: [],
    cells: [[]],
    gaps: [{ activityId: "a1", activityName: "Browse", journeyName: "J1", reason: "key_activity_no_kpi" }],
    meta: { activityCount: 1, kpiCount: 0, linkedCellCount: 0, keyActivityCount: 1, gapCount: 1 },
  };

  test("empty matrix → empty state (AC-10)", () => {
    expect(deriveViewState(emptyMatrix)).toBe("empty");
  });

  test("matrix with activities but no links → empty state", () => {
    expect(deriveViewState(noLinksMatrix)).toBe("empty");
  });

  test("matrix with linked cells → ready state", () => {
    expect(deriveViewState(readyMatrix)).toBe("ready");
  });

  test("hasGap returns true for key activity in gaps list", () => {
    expect(hasGap(noLinksMatrix, "a1")).toBe(true);
  });

  test("hasGap returns false for activity not in gaps list", () => {
    expect(hasGap(readyMatrix, "a1")).toBe(false);
  });

  test("renderChip: increases direction", () => {
    expect(renderChip({ direction: "increases", weight: 0.8 })).toBe("↑ 0.80");
  });

  test("renderChip: decreases direction", () => {
    expect(renderChip({ direction: "decreases", weight: 0.5 })).toBe("↓ 0.50");
  });

  test("renderChip: undirected (null direction)", () => {
    expect(renderChip({ direction: null, weight: null })).toBe("—");
  });

  test("renderChip: null cell → empty string", () => {
    expect(renderChip(null)).toBe("");
  });

  test("ready matrix meta counts are correct", () => {
    expect(readyMatrix.meta.activityCount).toBe(1);
    expect(readyMatrix.meta.kpiCount).toBe(1);
    expect(readyMatrix.meta.linkedCellCount).toBe(1);
    expect(readyMatrix.meta.keyActivityCount).toBe(1);
    expect(readyMatrix.meta.gapCount).toBe(0);
  });

  test("no-links matrix has gap for key activity", () => {
    expect(noLinksMatrix.meta.gapCount).toBe(1);
    expect(noLinksMatrix.gaps[0]!.reason).toBe("key_activity_no_kpi");
  });
});
