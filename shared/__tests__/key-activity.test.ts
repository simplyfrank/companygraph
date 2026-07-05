import { describe, expect, test } from "bun:test";
import {
  subScoresSchema,
  keyActivityMarkSchema,
  activityScoreRowSchema,
  keyActivityScoresSchema,
} from "../src/schema/key-activity";

// key-activity-optimizer T-01 — REST-boundary zod schemas.
// NOTE: this file lives in shared/__tests__/ (not
// shared/src/schema/__tests__/) because scripts/test-unit.sh discovers
// shared workspace tests ONLY under shared/__tests__/.

const validSubScores = { centrality: 0.5, criticalPath: 1, handoff: 0 };

const validMark = {
  marked: true as const,
  markedAt: "2026-07-04T12:00:00.000Z",
  scoreSnapshot: { ...validSubScores, composite: 1.5 },
  rank: 1,
};

const validRow = {
  id: "0197a000-0000-7000-8000-0000000000a1",
  name: "Scan items",
  journeyId: null,
  journeyName: null,
  rank: 1,
  composite: 1.5,
  scores: validSubScores,
  evidence: {
    centrality: { betweenness: 2, inDegree: 1, outDegree: 1 },
    criticalPath: { onCriticalPath: true, longestChainDepth: 3, criticalPathLength: 3 },
    handoff: { handoffCount: 2, roleHandoffs: 1, systemHandoffs: 1 },
  },
  key: null,
};

describe("key-activity zod schemas (T-01)", () => {
  test("subScoresSchema rejects a sub-score > 1 or < 0", () => {
    expect(subScoresSchema.safeParse({ ...validSubScores, centrality: 1.01 }).success).toBe(false);
    expect(subScoresSchema.safeParse({ ...validSubScores, handoff: -0.01 }).success).toBe(false);
    expect(subScoresSchema.safeParse(validSubScores).success).toBe(true);
  });

  test("keyActivityMarkSchema accepts a well-formed mark", () => {
    expect(keyActivityMarkSchema.safeParse(validMark).success).toBe(true);
  });

  test("keyActivityMarkSchema rejects marked:false", () => {
    expect(keyActivityMarkSchema.safeParse({ ...validMark, marked: false }).success).toBe(false);
  });

  test("keyActivityMarkSchema rejects a body missing scoreSnapshot / rank", () => {
    const { scoreSnapshot: _s, ...noSnapshot } = validMark;
    const { rank: _r, ...noRank } = validMark;
    expect(keyActivityMarkSchema.safeParse(noSnapshot).success).toBe(false);
    expect(keyActivityMarkSchema.safeParse(noRank).success).toBe(false);
  });

  test("activityScoreRowSchema accepts key:null and a populated mark", () => {
    expect(activityScoreRowSchema.safeParse(validRow).success).toBe(true);
    expect(activityScoreRowSchema.safeParse({ ...validRow, key: validMark }).success).toBe(true);
  });

  test("keyActivityScoresSchema.meta.truncationReason rejects an out-of-enum string", () => {
    const base = {
      rows: [validRow],
      meta: {
        activityCount: 1,
        hasCycle: false,
        weights: { centrality: 1, criticalPath: 1, handoff: 1 },
      },
    };
    expect(keyActivityScoresSchema.safeParse(base).success).toBe(true);
    expect(
      keyActivityScoresSchema.safeParse({
        ...base,
        meta: { ...base.meta, truncated: true, truncationReason: "depth_cap" },
      }).success,
    ).toBe(true);
    expect(
      keyActivityScoresSchema.safeParse({
        ...base,
        meta: { ...base.meta, truncated: true, truncationReason: "budget_blown" },
      }).success,
    ).toBe(false);
  });
});
