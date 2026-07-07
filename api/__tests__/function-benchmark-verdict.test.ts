// function-benchmark-scoring T-02 (AC-03) — Neo4j-free unit test of the
// self-owned computeKpiVerdict, covering higher/lower/exact bands, the
// null-threshold degrade, null-target → no_data, and specifically the
// exact-branch no-band `warning` case. Plus the ownership tripwire: the
// derive module must not import routes/performance.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeKpiVerdict, type KpiVerdictInput } from "../src/derive/function-benchmark-score";

const hib = (t: number, w: number | null, c: number | null): KpiVerdictInput => ({
  target_value: t,
  target_direction: "higher_is_better",
  warning_threshold: w,
  critical_threshold: c,
});
const lib = (t: number, w: number | null, c: number | null): KpiVerdictInput => ({
  target_value: t,
  target_direction: "lower_is_better",
  warning_threshold: w,
  critical_threshold: c,
});
const exact = (t: number, w: number | null, c: number | null): KpiVerdictInput => ({
  target_value: t,
  target_direction: "target_is_exact",
  warning_threshold: w,
  critical_threshold: c,
});

describe("computeKpiVerdict (T-02, AC-03)", () => {
  it("null latest → no_data", () => {
    expect(computeKpiVerdict(hib(100, 90, 80), null)).toBe("no_data");
  });

  it("null target → no_data", () => {
    expect(
      computeKpiVerdict(
        { target_value: null, target_direction: "higher_is_better", warning_threshold: 1, critical_threshold: 1 },
        50,
      ),
    ).toBe("no_data");
  });

  it("unknown/null direction → no_data (never throws)", () => {
    expect(
      computeKpiVerdict(
        { target_value: 5, target_direction: "sideways", warning_threshold: null, critical_threshold: null },
        5,
      ),
    ).toBe("no_data");
    expect(
      computeKpiVerdict(
        { target_value: 5, target_direction: null, warning_threshold: null, critical_threshold: null },
        5,
      ),
    ).toBe("no_data");
  });

  it("higher_is_better bands", () => {
    expect(computeKpiVerdict(hib(100, 90, 80), 100)).toBe("on_target"); // at target
    expect(computeKpiVerdict(hib(100, 90, 80), 120)).toBe("on_target"); // above
    expect(computeKpiVerdict(hib(100, 90, 80), 75)).toBe("breach"); // below critical
    expect(computeKpiVerdict(hib(100, 90, 80), 85)).toBe("warning"); // below warning, above critical
    expect(computeKpiVerdict(hib(100, 90, 80), 95)).toBe("on_target"); // inside warning band
  });

  it("higher_is_better no-warning-band degrade → warning", () => {
    // missed target, no warning band → coarser `warning`
    expect(computeKpiVerdict(hib(100, null, null), 95)).toBe("warning");
  });

  it("lower_is_better bands (mirror)", () => {
    expect(computeKpiVerdict(lib(100, 110, 120), 100)).toBe("on_target"); // at target
    expect(computeKpiVerdict(lib(100, 110, 120), 90)).toBe("on_target"); // below
    expect(computeKpiVerdict(lib(100, 110, 120), 130)).toBe("breach"); // above critical
    expect(computeKpiVerdict(lib(100, 110, 120), 115)).toBe("warning"); // above warning
    expect(computeKpiVerdict(lib(100, 110, 120), 105)).toBe("on_target"); // inside warning band
  });

  it("lower_is_better no-warning-band degrade → warning", () => {
    expect(computeKpiVerdict(lib(100, null, null), 105)).toBe("warning");
  });

  it("target_is_exact: equality → on_target; deviation bands", () => {
    expect(computeKpiVerdict(exact(50, 5, 10), 50)).toBe("on_target"); // exact
    expect(computeKpiVerdict(exact(50, 5, 10), 65)).toBe("breach"); // dev 15 > critical 10
    expect(computeKpiVerdict(exact(50, 5, 10), 58)).toBe("warning"); // dev 8 > warning 5
  });

  it("target_is_exact: nonzero deviation with NO bands → warning, never on_target", () => {
    // The no-band default (C-03) — even inside "no bands", nonzero deviation is warning.
    expect(computeKpiVerdict(exact(50, null, null), 51)).toBe("warning");
    // Inside both bands (dev 2 ≤ warning 5) but nonzero → warning, never on_target.
    expect(computeKpiVerdict(exact(50, 5, 10), 52)).toBe("warning");
  });
});

describe("ownership tripwire (T-02, AC-03)", () => {
  it("the derive module does not import routes/performance", () => {
    const src = readFileSync(
      join(import.meta.dir, "../src/derive/function-benchmark-score.ts"),
      "utf8",
    );
    expect(src.includes("routes/performance")).toBe(false);
    expect(/from\s+["'][^"']*\bperformance["']/.test(src)).toBe(false);
  });
});
