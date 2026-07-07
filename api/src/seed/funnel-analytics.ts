// funnel-pipeline-modeling T-07 (design §4.6 + review-design N-01 — FR-11;
// AC-11 server half). Pure, DOM-independent drop-off analytics derivation so the
// same logic is verified server-side and re-asserted in the PWA test (T-09).
//
// FR-11 / OQ-2 — strict linear chain: overall funnel conversion = the PRODUCT of
// the ordered per-transition conversionRates along the Stage chain. Degradation
// (never undefined, never a crash):
//   - empty rate list  (one-stage funnel, no transition) → "n/a"
//   - branch signalled (a stage with >1 outgoing CONVERTS_TO)             → "n/a"
// (A zero-stage funnel is handled upstream by the empty state, not here.)
//
// The branch signal is passed in by the caller (the PWA view derives it from the
// composition payload — N-01: the derivation must not silently multiply one
// arbitrary path). This module is pure arithmetic over the FR-08 payload's parsed
// rates — no writes, no store, no operational records (XD-03).

export const NA = "n/a" as const;

export interface OverallConversionOptions {
  // true when any stage in the funnel has more than one outgoing CONVERTS_TO
  // edge (a branch). When set, overall conversion is "n/a" (no multi-path
  // rendering for the `must`).
  branched?: boolean;
}

// Product of the ordered per-transition conversionRates, or the literal "n/a".
export function overallConversion(
  transitionRates: number[],
  opts: OverallConversionOptions = {},
): number | typeof NA {
  if (opts.branched) return NA;
  if (transitionRates.length === 0) return NA; // one-stage funnel, no transition
  return transitionRates.reduce((acc, r) => acc * r, 1);
}
