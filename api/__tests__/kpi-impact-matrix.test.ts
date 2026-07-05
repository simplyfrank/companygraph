// kpi-impact-mapping T-05/T-06 — pure unit tests for assembleMatrix +
// assembleRollup + deriveStatus (DD-06: Neo4j-free).

import { describe, test, expect } from "bun:test";
import { assembleMatrix, assembleRollup, deriveStatus } from "../src/derive/kpi-impact-matrix";
import type { MatrixInput, RollupInput } from "../src/storage/kpi-impact";

describe("kpi-impact-matrix T-05 assembleMatrix", () => {
  test("columns = distinct impacted KPIs, cells {direction,weight}|null (AC-04)", () => {
    const input: MatrixInput = {
      activities: [
        { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 0 },
        { id: "a2", name: "Checkout", journeyName: "J1", isKeyActivity: false, storyLinkCount: 0 },
      ],
      links: [
        { activityId: "a1", kpiId: "k1", kpiName: "Revenue", kpiUnit: "$", kpiTargetDirection: "higher_is_better", direction: "increases", weight: 0.8 },
        { activityId: "a2", kpiId: "k2", kpiName: "Latency", kpiUnit: "ms", kpiTargetDirection: "lower_is_better", direction: "decreases", weight: 0.5 },
      ],
    };
    const m = assembleMatrix(input);
    expect(m.meta.activityCount).toBe(2);
    expect(m.meta.kpiCount).toBe(2);
    expect(m.meta.linkedCellCount).toBe(2);
    expect(m.columns.map((c) => c.id)).toEqual(["k1", "k2"]);
    // a1→k1 cell is populated
    expect(m.cells[0][0]).toEqual({ direction: "increases", weight: 0.8 });
    // a1→k2 cell is null
    expect(m.cells[0][1]).toBeNull();
    // a2→k1 is null, a2→k2 is populated
    expect(m.cells[1][0]).toBeNull();
    expect(m.cells[1][1]).toEqual({ direction: "decreases", weight: 0.5 });
  });

  test("key activity with no directional link → gap (AC-05, DD-07)", () => {
    const input: MatrixInput = {
      activities: [
        { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 0 },
      ],
      links: [],
    };
    const m = assembleMatrix(input);
    expect(m.gaps).toHaveLength(1);
    expect(m.gaps[0]).toEqual({ activityId: "a1", activityName: "Browse", journeyName: "J1", reason: "key_activity_no_kpi" });
    expect(m.meta.gapCount).toBe(1);
    expect(m.meta.keyActivityCount).toBe(1);
  });

  test("directional link drops key activity out of gaps (AC-05)", () => {
    const input: MatrixInput = {
      activities: [
        { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 0 },
      ],
      links: [
        { activityId: "a1", kpiId: "k1", kpiName: "Rev", kpiUnit: "$", kpiTargetDirection: "higher_is_better", direction: "increases", weight: 0.5 },
      ],
    };
    const m = assembleMatrix(input);
    expect(m.gaps).toHaveLength(0);
    expect(m.meta.gapCount).toBe(0);
  });

  test("undirected-only link stays a gap (DD-07)", () => {
    const input: MatrixInput = {
      activities: [
        { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 0 },
      ],
      links: [
        { activityId: "a1", kpiId: "k1", kpiName: "Rev", kpiUnit: "$", kpiTargetDirection: null, direction: null, weight: null },
      ],
    };
    const m = assembleMatrix(input);
    expect(m.gaps).toHaveLength(1);
    expect(m.meta.gapCount).toBe(1);
  });

  test("non-key activity with no links is NOT a gap (DD-09)", () => {
    const input: MatrixInput = {
      activities: [
        { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: false, storyLinkCount: 0 },
      ],
      links: [],
    };
    const m = assembleMatrix(input);
    expect(m.gaps).toHaveLength(0);
  });

  test("storyLinkCount does not alter gaps (DD-09, AC-16)", () => {
    const input: MatrixInput = {
      activities: [
        { id: "a1", name: "Browse", journeyName: "J1", isKeyActivity: true, storyLinkCount: 5 },
      ],
      links: [],
    };
    const m = assembleMatrix(input);
    expect(m.gaps).toHaveLength(1);
    expect(m.meta.gapCount).toBe(1);
  });

  test("empty input → empty matrix (AC-10)", () => {
    const m = assembleMatrix({ activities: [], links: [] });
    expect(m.meta.activityCount).toBe(0);
    expect(m.meta.kpiCount).toBe(0);
    expect(m.gaps).toHaveLength(0);
  });
});

describe("kpi-impact-matrix T-06 deriveStatus", () => {
  test("null latestValue → no_data", () => {
    expect(deriveStatus({ targetDirection: "higher_is_better", targetValue: 100, warningThreshold: 80, criticalThreshold: 60, latestValue: null })).toBe("no_data");
  });

  test("higher_is_better: below critical → critical", () => {
    expect(deriveStatus({ targetDirection: "higher_is_better", targetValue: 100, warningThreshold: 80, criticalThreshold: 60, latestValue: 50 })).toBe("critical");
  });

  test("higher_is_better: below warning → warning", () => {
    expect(deriveStatus({ targetDirection: "higher_is_better", targetValue: 100, warningThreshold: 80, criticalThreshold: 60, latestValue: 75 })).toBe("warning");
  });

  test("higher_is_better: above warning → on_track", () => {
    expect(deriveStatus({ targetDirection: "higher_is_better", targetValue: 100, warningThreshold: 80, criticalThreshold: 60, latestValue: 90 })).toBe("on_track");
  });

  test("lower_is_better: above critical → critical", () => {
    expect(deriveStatus({ targetDirection: "lower_is_better", targetValue: 10, warningThreshold: 20, criticalThreshold: 30, latestValue: 35 })).toBe("critical");
  });

  test("lower_is_better: above warning → warning", () => {
    expect(deriveStatus({ targetDirection: "lower_is_better", targetValue: 10, warningThreshold: 20, criticalThreshold: 30, latestValue: 25 })).toBe("warning");
  });

  test("lower_is_better: below warning → on_track", () => {
    expect(deriveStatus({ targetDirection: "lower_is_better", targetValue: 10, warningThreshold: 20, criticalThreshold: 30, latestValue: 15 })).toBe("on_track");
  });

  test("target_is_exact: within tolerance → on_track", () => {
    expect(deriveStatus({ targetDirection: "target_is_exact", targetValue: 100, warningThreshold: 5, criticalThreshold: 10, latestValue: 102 })).toBe("on_track");
  });

  test("target_is_exact: outside warning → warning", () => {
    expect(deriveStatus({ targetDirection: "target_is_exact", targetValue: 100, warningThreshold: 5, criticalThreshold: 10, latestValue: 107 })).toBe("warning");
  });

  test("target_is_exact: outside critical → critical", () => {
    expect(deriveStatus({ targetDirection: "target_is_exact", targetValue: 100, warningThreshold: 5, criticalThreshold: 10, latestValue: 115 })).toBe("critical");
  });

  test("data + no thresholds → on_track (fallback)", () => {
    expect(deriveStatus({ targetDirection: "higher_is_better", targetValue: null, warningThreshold: null, criticalThreshold: null, latestValue: 50 })).toBe("on_track");
  });
});

describe("kpi-impact-matrix T-06 assembleRollup", () => {
  test("aggregateImpactWeight capped at 1.0 (FR-08)", () => {
    const input: RollupInput = {
      kpis: [{ id: "k1", name: "Rev", unit: "$", targetValue: 100, targetDirection: "higher_is_better", warningThreshold: 80, criticalThreshold: 60, latestValue: 90 }],
      links: [
        { kpiId: "k1", weight: 0.6 },
        { kpiId: "k1", weight: 0.7 },
      ],
      measurementsAvailable: true,
    };
    const r = assembleRollup(input);
    expect(r.rows[0].aggregateImpactWeight).toBe(1.0);
    expect(r.rows[0].impactLinkCount).toBe(2);
  });

  test("latestValue = last element of ASC-ordered array (DD-04/C-05)", () => {
    const input: RollupInput = {
      kpis: [{ id: "k1", name: "Rev", unit: "$", targetValue: 100, targetDirection: "higher_is_better", warningThreshold: 80, criticalThreshold: 60, latestValue: 95 }],
      links: [{ kpiId: "k1", weight: 0.5 }],
      measurementsAvailable: true,
    };
    const r = assembleRollup(input);
    expect(r.rows[0].latestValue).toBe(95);
    expect(r.rows[0].status).toBe("on_track");
  });

  test("null latestValue → no_data status", () => {
    const input: RollupInput = {
      kpis: [{ id: "k1", name: "Rev", unit: "$", targetValue: 100, targetDirection: "higher_is_better", warningThreshold: 80, criticalThreshold: 60, latestValue: null }],
      links: [],
      measurementsAvailable: true,
    };
    const r = assembleRollup(input);
    expect(r.rows[0].status).toBe("no_data");
  });

  test("measurementsAvailable flag propagated to meta", () => {
    const input: RollupInput = {
      kpis: [],
      links: [],
      measurementsAvailable: false,
    };
    const r = assembleRollup(input);
    expect(r.meta.measurementsAvailable).toBe(false);
  });
});
