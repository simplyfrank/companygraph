import { describe, expect, test } from "bun:test";
import { overallConversion, NA } from "../src/seed/funnel-analytics";

// funnel-pipeline-modeling T-07 (design §4.6 + review-design N-01 — FR-11;
// AC-11 server half). Pure arithmetic derivation: overall funnel conversion is
// the PRODUCT of per-transition conversionRates; empty (single-stage) or a
// branch signal degrades to the literal "n/a" (never undefined, never a crash).

describe("AC-11: overallConversion (linear-chain drop-off analytics)", () => {
  test("product of per-transition conversionRates (3-stage funnel, 0.5 & 0.4 → 0.20)", () => {
    const result = overallConversion([0.5, 0.4]);
    expect(result).toBeCloseTo(0.2, 10);
  });

  test("single-transition funnel returns the rate itself", () => {
    expect(overallConversion([0.62])).toBeCloseTo(0.62, 10);
  });

  test("empty rate list (one-stage funnel, no transition) → \"n/a\"", () => {
    expect(overallConversion([])).toBe(NA);
    expect(overallConversion([])).toBe("n/a");
  });

  test("branch signal → \"n/a\" (never silently multiply one arbitrary path, N-01)", () => {
    expect(overallConversion([0.5, 0.4], { branched: true })).toBe(NA);
    // Branch degradation dominates even a non-empty rate list.
    expect(overallConversion([0.9], { branched: true })).toBe("n/a");
  });

  test("longer linear chain multiplies all transitions", () => {
    expect(overallConversion([0.5, 0.5, 0.5])).toBeCloseTo(0.125, 10);
  });
});
