// funnel-pipeline-modeling T-09 (design §4.6 + review-design N-01 — FR-11; AC-11
// view half). PWA-local mirror of the server-side pure derivation
// (api/src/seed/funnel-analytics.ts) — the api workspace file is not importable
// across workspaces, so this client copy carries the identical contract and is
// re-asserted by funnel-board-analytics.test.tsx (T-09). Lives under src/lib (not
// src/views) so it is not subject to the view-orphan guard.
//
// FR-11 / OQ-2 — strict linear chain: overall funnel conversion = the PRODUCT of
// the ordered per-transition conversionRates. Degradation (never undefined, never
// a crash): empty rate list (one-stage funnel) → "n/a"; a branch signal (a stage
// with >1 outgoing CONVERTS_TO) → "n/a".

export const NA = "n/a" as const;

export interface OverallConversionOptions {
  branched?: boolean;
}

export function overallConversion(
  transitionRates: number[],
  opts: OverallConversionOptions = {},
): number | typeof NA {
  if (opts.branched) return NA;
  if (transitionRates.length === 0) return NA; // one-stage funnel, no transition
  return transitionRates.reduce((acc, r) => acc * r, 1);
}
