import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeKpiStatus } from "../src/routes/performance";

// cross-function-exec-rollup T-16 (AC-05) — status parity with performance.ts.
// The operator KPI-health path IMPORTS computeKpiStatus from performance.ts
// (DD-04), so parity is structural; this belt-and-braces test pins it across
// every band for a shared fixture and asserts the operator module does not
// re-declare its own computeKpiStatus (which would be a copy, breaking parity).

const OPERATOR_TS = resolve(import.meta.dir, "..", "src", "routes", "analytics-operator.ts");

// A fixture spanning every band for each direction.
const FIXTURE: Array<{
  kpi: {
    target_value: number | null;
    target_direction: string | null;
    warning_threshold: number | null;
    critical_threshold: number | null;
  };
  latest: number | null;
  expect: string;
}> = [
  // higher_is_better
  { kpi: { target_value: 100, target_direction: "higher_is_better", warning_threshold: 90, critical_threshold: 80 }, latest: 120, expect: "on_target" },
  { kpi: { target_value: 100, target_direction: "higher_is_better", warning_threshold: 90, critical_threshold: 80 }, latest: 85, expect: "warning" },
  { kpi: { target_value: 100, target_direction: "higher_is_better", warning_threshold: 90, critical_threshold: 80 }, latest: 50, expect: "breach" },
  // lower_is_better
  { kpi: { target_value: 10, target_direction: "lower_is_better", warning_threshold: 20, critical_threshold: 30 }, latest: 5, expect: "on_target" },
  { kpi: { target_value: 10, target_direction: "lower_is_better", warning_threshold: 20, critical_threshold: 30 }, latest: 25, expect: "warning" },
  { kpi: { target_value: 10, target_direction: "lower_is_better", warning_threshold: 20, critical_threshold: 30 }, latest: 40, expect: "breach" },
  // target_is_exact
  { kpi: { target_value: 50, target_direction: "target_is_exact", warning_threshold: 5, critical_threshold: 10 }, latest: 50, expect: "on_target" },
  { kpi: { target_value: 50, target_direction: "target_is_exact", warning_threshold: 5, critical_threshold: 10 }, latest: 57, expect: "warning" },
  { kpi: { target_value: 50, target_direction: "target_is_exact", warning_threshold: 5, critical_threshold: 10 }, latest: 70, expect: "breach" },
  // no_data
  { kpi: { target_value: 100, target_direction: "higher_is_better", warning_threshold: null, critical_threshold: null }, latest: null, expect: "no_data" },
  { kpi: { target_value: null, target_direction: "higher_is_better", warning_threshold: null, critical_threshold: null }, latest: 10, expect: "no_data" },
];

describe("operator KPI status parity with performance.ts (AC-05)", () => {
  test("computeKpiStatus matches the expected band for every fixture tuple", () => {
    for (const f of FIXTURE) {
      expect(computeKpiStatus(f.kpi, f.latest)).toBe(f.expect);
    }
  });

  test("analytics-operator.ts does NOT re-declare computeKpiStatus (import, not copy — DD-04)", () => {
    const src = readFileSync(OPERATOR_TS, "utf8");
    // it imports the symbol …
    expect(/import\s*\{[^}]*computeKpiStatus[^}]*\}\s*from\s*["']\.\/performance["']/.test(src)).toBe(true);
    // … and never re-declares it locally.
    expect(/function\s+computeKpiStatus\b/.test(src)).toBe(false);
    expect(/const\s+computeKpiStatus\b/.test(src)).toBe(false);
  });
});
