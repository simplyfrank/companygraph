import { describe, expect, test } from "bun:test";
import { computeKpiStatus, type KpiStatusInput } from "../src/routes/performance";

// kpi-okr-performance-dashboards T-02 — AC-01 pure-function leg (DD-02).
// Covers all three directions, breach/warning/on_target boundaries,
// no_data (null latest), null-threshold degradation, the unknown-
// direction guard, and the N-07 null-target_value defensive branch.

function kpi(partial: Partial<KpiStatusInput>): KpiStatusInput {
  return {
    target_value: 100,
    target_direction: "higher_is_better",
    warning_threshold: 90,
    critical_threshold: 80,
    ...partial,
  };
}

describe("computeKpiStatus — higher_is_better", () => {
  test("v >= target → on_target (boundary: v === target)", () => {
    expect(computeKpiStatus(kpi({}), 100)).toBe("on_target");
    expect(computeKpiStatus(kpi({}), 150)).toBe("on_target");
  });

  test("v < critical_threshold → breach", () => {
    expect(computeKpiStatus(kpi({}), 79)).toBe("breach");
  });

  test("v exactly at critical_threshold is NOT breach (strict <) → warning", () => {
    expect(computeKpiStatus(kpi({}), 80)).toBe("warning");
  });

  test("v < warning_threshold (but >= critical) → warning", () => {
    expect(computeKpiStatus(kpi({}), 85)).toBe("warning");
  });

  test("v within the warning band (>= warning, < target) → on_target", () => {
    expect(computeKpiStatus(kpi({}), 95)).toBe("on_target");
    expect(computeKpiStatus(kpi({}), 90)).toBe("on_target"); // boundary: v === warning
  });
});

describe("computeKpiStatus — lower_is_better mirror", () => {
  const lower = () =>
    kpi({ target_direction: "lower_is_better", warning_threshold: 110, critical_threshold: 120 });

  test("v <= target → on_target (boundary: v === target)", () => {
    expect(computeKpiStatus(lower(), 100)).toBe("on_target");
    expect(computeKpiStatus(lower(), 50)).toBe("on_target");
  });

  test("v > critical_threshold → breach", () => {
    expect(computeKpiStatus(lower(), 121)).toBe("breach");
  });

  test("v > warning_threshold (but <= critical) → warning", () => {
    expect(computeKpiStatus(lower(), 115)).toBe("warning");
    expect(computeKpiStatus(lower(), 120)).toBe("warning"); // boundary: strict > for breach
  });

  test("v within the warning band (> target, <= warning) → on_target", () => {
    expect(computeKpiStatus(lower(), 105)).toBe("on_target");
    expect(computeKpiStatus(lower(), 110)).toBe("on_target"); // boundary: v === warning
  });
});

describe("computeKpiStatus — target_is_exact (N-02: exact equality + absolute bands)", () => {
  const exact = () =>
    kpi({ target_direction: "target_is_exact", warning_threshold: 5, critical_threshold: 10 });

  test("v === target → on_target; any other value is never on_target", () => {
    expect(computeKpiStatus(exact(), 100)).toBe("on_target");
  });

  test("|v - target| > critical band → breach (both sides)", () => {
    expect(computeKpiStatus(exact(), 111)).toBe("breach");
    expect(computeKpiStatus(exact(), 89)).toBe("breach");
  });

  test("|v - target| > warning band (within critical) → warning", () => {
    expect(computeKpiStatus(exact(), 106)).toBe("warning");
    expect(computeKpiStatus(exact(), 94)).toBe("warning");
    expect(computeKpiStatus(exact(), 110)).toBe("warning"); // boundary: strict > for breach
  });

  test("nonzero deviation inside the warning band → warning (exact equality is the tolerance)", () => {
    expect(computeKpiStatus(exact(), 103)).toBe("warning");
    expect(computeKpiStatus(exact(), 105)).toBe("warning"); // boundary: strict > for warning
  });
});

describe("computeKpiStatus — no_data and degradation", () => {
  test("null latest → no_data", () => {
    expect(computeKpiStatus(kpi({}), null)).toBe("no_data");
  });

  test("N-07: null target_value → no_data (total over the declared row type)", () => {
    expect(computeKpiStatus(kpi({ target_value: null }), 42)).toBe("no_data");
  });

  test("null thresholds degrade: meets target → on_target, misses → warning", () => {
    const bare = kpi({ warning_threshold: null, critical_threshold: null });
    expect(computeKpiStatus(bare, 120)).toBe("on_target");
    expect(computeKpiStatus(bare, 50)).toBe("warning");
  });

  test("null critical only: warning band still applies, breach branch skipped", () => {
    const noCrit = kpi({ critical_threshold: null });
    expect(computeKpiStatus(noCrit, 85)).toBe("warning");
    expect(computeKpiStatus(noCrit, 95)).toBe("on_target");
  });

  test("null warning only: critical band applies; misses inside it degrade to warning", () => {
    const noWarn = kpi({ warning_threshold: null });
    expect(computeKpiStatus(noWarn, 79)).toBe("breach");
    expect(computeKpiStatus(noWarn, 85)).toBe("warning"); // no warning band → coarser verdict
  });

  test("unknown/null target_direction → no_data guard, never throws", () => {
    expect(computeKpiStatus(kpi({ target_direction: "sideways" }), 100)).toBe("no_data");
    expect(computeKpiStatus(kpi({ target_direction: null }), 100)).toBe("no_data");
  });
});
