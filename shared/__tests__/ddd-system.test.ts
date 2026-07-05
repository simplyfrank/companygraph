// ddd-system-modeling T-01 — REST-boundary zod schema tests.
//
// NOTE (execution erratum): tasks.md rev 3 declares this file at
// shared/src/schema/__tests__/ddd-system.test.ts, but the unit runner
// (scripts/test-unit.sh) only discovers shared/__tests__/** — placed
// here so the suite actually runs under `bun run test`.

import { describe, expect, test } from "bun:test";
import {
  capabilityCreateSchema,
  capabilityPatchSchema,
  capabilityReadSchema,
  neededBySchema,
  supportedBySchema,
  contextAssignSchema,
  gapsResultSchema,
  contextMapResultSchema,
} from "../src/schema/ddd-system";

describe("capabilityCreateSchema", () => {
  test("accepts a minimal valid body", () => {
    expect(capabilityCreateSchema.safeParse({ name: "Price a product" }).success).toBe(true);
  });

  test("accepts description + attributes", () => {
    const r = capabilityCreateSchema.safeParse({
      name: "Allocate stock",
      description: "to a store",
      attributes: { maturity: "core" },
    });
    expect(r.success).toBe(true);
  });

  test("rejects a body missing name", () => {
    expect(capabilityCreateSchema.safeParse({}).success).toBe(false);
  });

  test("rejects an empty name", () => {
    expect(capabilityCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  test("rejects unknown fields (strict)", () => {
    expect(capabilityCreateSchema.safeParse({ name: "x", bogus: 1 }).success).toBe(false);
  });
});

describe("capabilityPatchSchema", () => {
  test("parse({}) is valid — all optional, omitted → unchanged", () => {
    expect(capabilityPatchSchema.safeParse({}).success).toBe(true);
  });

  test("rejects an empty name when supplied", () => {
    expect(capabilityPatchSchema.safeParse({ name: "" }).success).toBe(false);
  });

  test("accepts a partial patch", () => {
    expect(capabilityPatchSchema.safeParse({ description: "new" }).success).toBe(true);
  });
});

describe("neededBySchema (.refine — exactly one of activityId/storyId)", () => {
  test("accepts {activityId}", () => {
    expect(neededBySchema.safeParse({ activityId: "a1" }).success).toBe(true);
  });

  test("accepts {storyId}", () => {
    expect(neededBySchema.safeParse({ storyId: "s1" }).success).toBe(true);
  });

  test("rejects a body with neither", () => {
    expect(neededBySchema.safeParse({}).success).toBe(false);
  });

  test("rejects a body with both", () => {
    expect(neededBySchema.safeParse({ activityId: "a1", storyId: "s1" }).success).toBe(false);
  });
});

describe("supportedBySchema / contextAssignSchema", () => {
  test("supportedBy requires systemId", () => {
    expect(supportedBySchema.safeParse({ systemId: "sys1" }).success).toBe(true);
    expect(supportedBySchema.safeParse({}).success).toBe(false);
  });

  test("contextAssign requires boundedContextId", () => {
    expect(contextAssignSchema.safeParse({ boundedContextId: "bc1" }).success).toBe(true);
    expect(contextAssignSchema.safeParse({}).success).toBe(false);
  });
});

describe("capabilityReadSchema", () => {
  const base = {
    id: "01912a68-0000-7000-8000-000000000001",
    name: "Price a product",
    description: "",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    attributes: {},
    neededByCount: 2,
    supportingSystemCount: 1,
    assignedContextId: null,
    assignedContextName: null,
  };

  test("accepts a list row (no detail embeds)", () => {
    expect(capabilityReadSchema.safeParse(base).success).toBe(true);
  });

  test("accepts a detail shape with embeds incl. detached", () => {
    const r = capabilityReadSchema.safeParse({
      ...base,
      neededBy: [{ kind: "activity", id: "a1", name: "Scan item" }],
      supportedBy: [{ id: "s1", name: "POS", systemKind: "functional" }],
      assignedContext: { id: "bc1", name: "Pricing", domain: "Commerce", subdomain: null },
      detached: [{ kind: "context", targetId: "bc-gone" }],
    });
    expect(r.success).toBe(true);
  });

  test("rejects an invalid systemKind on supportedBy", () => {
    const r = capabilityReadSchema.safeParse({
      ...base,
      supportedBy: [{ id: "s1", name: "POS", systemKind: "quantum" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("gapsResultSchema", () => {
  test("accepts a representative fixture incl. describingStories + unknown bucket", () => {
    const r = gapsResultSchema.safeParse({
      unsupportedSteps: [
        {
          activityId: "a-z",
          activityName: "Z",
          describingStories: [{ id: "st1", name: "As a clerk…" }],
        },
      ],
      capabilityGaps: [
        { activityId: "a-y", activityName: "Y", describingStories: [] },
      ],
      capabilitiesWithoutSystem: [{ capabilityId: "c1", name: "C" }],
      orphanSystems: [{ systemId: "s1", name: "S" }],
      augmentationMix: {
        perCapability: [
          {
            capabilityId: "c2",
            name: "Cap 2",
            counts: { functional: 2, agentic: 1, ai_predictive: 1, unknown: 1 },
            shares: { functional: 0.4, agentic: 0.2, ai_predictive: 0.2, unknown: 0.2 },
          },
        ],
        model: { functional: 2, agentic: 1, ai_predictive: 1, unknown: 1 },
      },
    });
    expect(r.success).toBe(true);
  });

  test("rejects a mix missing the unknown bucket", () => {
    const r = gapsResultSchema.safeParse({
      unsupportedSteps: [],
      capabilityGaps: [],
      capabilitiesWithoutSystem: [],
      orphanSystems: [],
      augmentationMix: {
        perCapability: [],
        model: { functional: 0, agentic: 0, ai_predictive: 0 },
      },
    });
    expect(r.success).toBe(false);
  });
});

describe("contextMapResultSchema", () => {
  test("accepts a representative fixture with id-resolved relationships (DD-07)", () => {
    const r = contextMapResultSchema.safeParse({
      contexts: [
        {
          id: "bc1",
          name: "Product Catalogue",
          domain: "Commerce",
          subdomain: "Catalogue",
          capabilities: [{ id: "c1", name: "Describe a product" }],
          relationships: [
            { type: "UPSTREAM_OF", targetId: "bc4", targetName: "Pricing & Markdown" },
          ],
        },
      ],
      unassigned: [{ id: "c9", name: "Unassigned cap" }],
    });
    expect(r.success).toBe(true);
  });

  test("rejects a name-only relationship shape", () => {
    const r = contextMapResultSchema.safeParse({
      contexts: [
        {
          id: "bc1",
          name: "X",
          domain: null,
          subdomain: null,
          capabilities: [],
          relationships: [{ type: "UPSTREAM_OF", target: "Pricing" }],
        },
      ],
      unassigned: [],
    });
    expect(r.success).toBe(false);
  });
});
