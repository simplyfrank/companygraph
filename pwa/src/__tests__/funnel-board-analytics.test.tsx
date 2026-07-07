// funnel-pipeline-modeling T-09 (design §4.6 + review-design N-01, review-tasks
// C-03 — AC-11; FR-11). DOM-independent overall-conversion derivation, incl. the
// BRANCH-DETECTION case: a composition where a stage has TWO outgoing CONVERTS_TO
// edges must derive the branch signal → "n/a" (asserts detection, not a pre-set
// flag — a bug that counted HAS_STAGE or incoming edges would fail this).

import { describe, test, expect } from "vitest";
import { overallConversionLabel } from "@/views/business/FunnelBoard";

function comp(
  stages: { id: string; stageOrder: number }[],
  transitions: { fromStageId: string; toStageId: string; conversionRate: number }[],
) {
  return {
    funnelId: "f",
    funnelName: "F",
    stages: stages.map((s) => ({ id: s.id, name: s.id, stageOrder: s.stageOrder, attrs: {} })),
    transitions: transitions.map((t) => ({ ...t, dropOffRate: 1 - t.conversionRate })),
  };
}

describe("AC-11: FunnelBoard overall-conversion derivation", () => {
  test("linear 3-stage chain → product 0.5 × 0.4 = 20.0%", () => {
    const c = comp(
      [
        { id: "a", stageOrder: 0 },
        { id: "b", stageOrder: 1 },
        { id: "c", stageOrder: 2 },
      ],
      [
        { fromStageId: "a", toStageId: "b", conversionRate: 0.5 },
        { fromStageId: "b", toStageId: "c", conversionRate: 0.4 },
      ],
    );
    expect(overallConversionLabel(c)).toBe("20.0%");
  });

  test("single-stage funnel (no transition) → \"n/a\"", () => {
    const c = comp([{ id: "a", stageOrder: 0 }], []);
    expect(overallConversionLabel(c)).toBe("n/a");
  });

  test("branch detection: a stage with TWO outgoing CONVERTS_TO → \"n/a\"", () => {
    // Stage `a` fans out to both `b` and `c` — a branch. Overall conversion must
    // degrade to "n/a" rather than silently multiplying one arbitrary path.
    const c = comp(
      [
        { id: "a", stageOrder: 0 },
        { id: "b", stageOrder: 1 },
        { id: "c", stageOrder: 2 },
      ],
      [
        { fromStageId: "a", toStageId: "b", conversionRate: 0.5 },
        { fromStageId: "a", toStageId: "c", conversionRate: 0.3 },
      ],
    );
    expect(overallConversionLabel(c)).toBe("n/a");
  });
});
