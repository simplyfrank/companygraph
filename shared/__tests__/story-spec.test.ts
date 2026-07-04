import { describe, expect, test } from "bun:test";
import {
  storyCreateSchema,
  storyPatchSchema,
  storyReadSchema,
  acCreateSchema,
  acPatchSchema,
  bootstrapRequestSchema,
  bootstrapResultSchema,
} from "../src/schema/story-spec";

// story-spec-core T-01 — REST-boundary zod schemas (design §3.1, §3.2).
//
// NOTE (execution deviation, recorded in STATUS.md): tasks.md names
// `shared/src/schema/__tests__/story-spec.test.ts`, but the unit-suite
// runner (`scripts/test-unit.sh`) discovers shared-workspace tests only
// under `shared/__tests__/` — the file lives here so it actually runs
// under `bun run test`.

const VALID_CREATE = {
  persona: "Store Associate",
  action: "scan items at the register",
  benefit: "the checkout workflow completes",
  activityId: "0197a000-0000-7000-8000-0000000000a1",
};

describe("storyCreateSchema", () => {
  test("accepts a valid payload (roleId/description/attributes optional)", () => {
    expect(storyCreateSchema.safeParse(VALID_CREATE).success).toBe(true);
    expect(
      storyCreateSchema.safeParse({
        ...VALID_CREATE,
        roleId: "0197a000-0000-7000-8000-0000000000b2",
        description: "d",
        attributes: { a: 1 },
      }).success,
    ).toBe(true);
  });

  test("rejects a body missing activityId", () => {
    const { activityId: _omit, ...rest } = VALID_CREATE;
    const r = storyCreateSchema.safeParse(rest);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("activityId"))).toBe(true);
    }
  });

  test("rejects an empty activityId", () => {
    const r = storyCreateSchema.safeParse({ ...VALID_CREATE, activityId: "" });
    expect(r.success).toBe(false);
  });

  test("rejects a client-supplied narrative (server-assembled only)", () => {
    const r = storyCreateSchema.safeParse({
      ...VALID_CREATE,
      narrative: "As a hacker, I want to inject, so that chaos.",
    });
    expect(r.success).toBe(false);
  });
});

describe("storyPatchSchema", () => {
  test("parse({}) is valid — all fields optional", () => {
    expect(storyPatchSchema.safeParse({}).success).toBe(true);
  });

  test("rejects narrative (server-owned)", () => {
    expect(storyPatchSchema.safeParse({ narrative: "x" }).success).toBe(false);
  });

  test("accepts a re-point activityId", () => {
    expect(
      storyPatchSchema.safeParse({ activityId: "0197a000-0000-7000-8000-0000000000c3" }).success,
    ).toBe(true);
  });
});

describe("acCreateSchema (NFR-03 single gate)", () => {
  const VALID_AC = { given: "a cart with items", when: "the associate scans", then: "totals update" };

  test("accepts a valid Given/When/Then triple", () => {
    expect(acCreateSchema.safeParse(VALID_AC).success).toBe(true);
    expect(acCreateSchema.safeParse({ ...VALID_AC, ordinal: 2 }).success).toBe(true);
  });

  for (const clause of ["given", "when", "then"] as const) {
    test(`rejects a body missing ${clause}`, () => {
      const { [clause]: _omit, ...rest } = VALID_AC;
      const r = acCreateSchema.safeParse(rest);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes(clause))).toBe(true);
      }
    });

    test(`rejects an empty-string ${clause}`, () => {
      const r = acCreateSchema.safeParse({ ...VALID_AC, [clause]: "" });
      expect(r.success).toBe(false);
    });
  }

  test("rejects a non-positive ordinal", () => {
    expect(acCreateSchema.safeParse({ ...VALID_AC, ordinal: 0 }).success).toBe(false);
  });
});

describe("acPatchSchema", () => {
  test("parse({}) is valid; a present clause must still be non-empty", () => {
    expect(acPatchSchema.safeParse({}).success).toBe(true);
    expect(acPatchSchema.safeParse({ when: "" }).success).toBe(false);
    expect(acPatchSchema.safeParse({ ordinal: 3 }).success).toBe(true);
  });
});

describe("storyReadSchema (DD-11 + C-07 nullability)", () => {
  const ENVELOPE = {
    id: "0197a000-0000-7000-8000-0000000000d4",
    name: "As a user, I want to scan, so that checkout completes.",
    description: "",
    derived: false,
    acCount: 0,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    attributes: {},
  };

  test("accepts a detached row (activity fields null, detached:true)", () => {
    const r = storyReadSchema.safeParse({
      ...ENVELOPE,
      persona: "user",
      action: "scan",
      benefit: "the workflow completes",
      narrative: "As a user, I want to scan, so that the workflow completes.",
      sourceActivityId: "0197a000-0000-7000-8000-0000000000a1",
      activityId: null,
      activityName: null,
      detached: true,
    });
    expect(r.success).toBe(true);
  });

  test("accepts an off-surface prop-less row (all derived props null)", () => {
    const r = storyReadSchema.safeParse({
      ...ENVELOPE,
      persona: null,
      action: null,
      benefit: null,
      narrative: null,
      sourceActivityId: null,
      activityId: null,
      activityName: null,
      detached: true,
    });
    expect(r.success).toBe(true);
  });
});

describe("bootstrap schemas", () => {
  test("bootstrapRequestSchema.parse({}) is valid; activityIds narrows", () => {
    expect(bootstrapRequestSchema.safeParse({}).success).toBe(true);
    expect(bootstrapRequestSchema.safeParse({ activityIds: ["x"] }).success).toBe(true);
    expect(bootstrapRequestSchema.safeParse({ activityIds: [""] }).success).toBe(false);
  });

  test("bootstrapResultSchema requires non-negative ints", () => {
    expect(bootstrapResultSchema.safeParse({ created: 0, skipped: 0 }).success).toBe(true);
    expect(bootstrapResultSchema.safeParse({ created: -1, skipped: 0 }).success).toBe(false);
  });
});
