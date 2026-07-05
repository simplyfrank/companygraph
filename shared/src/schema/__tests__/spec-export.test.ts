import { describe, expect, test } from "bun:test";
import {
  exportFormatSchema,
  specExportQuerySchema,
  specDocumentSchema,
  acSchema,
} from "@companygraph/shared/schema/spec-export";

// requirements-export T-01 — shared schema unit tests.
// Neo4j-free; pure zod validation.

describe("unit: requirements-export T-01 exportFormatSchema", () => {
  test("accepts json and markdown", () => {
    expect(exportFormatSchema.safeParse("json").success).toBe(true);
    expect(exportFormatSchema.safeParse("markdown").success).toBe(true);
  });

  test("rejects pdf and unknown strings", () => {
    expect(exportFormatSchema.safeParse("pdf").success).toBe(false);
    expect(exportFormatSchema.safeParse("yaml").success).toBe(false);
    expect(exportFormatSchema.safeParse("").success).toBe(false);
    expect(exportFormatSchema.safeParse(123).success).toBe(false);
  });
});

describe("unit: requirements-export T-01 specExportQuerySchema", () => {
  test("accepts optional format", () => {
    expect(specExportQuerySchema.safeParse({}).success).toBe(true);
    expect(specExportQuerySchema.safeParse({ format: "json" }).success).toBe(true);
    expect(specExportQuerySchema.safeParse({ format: "markdown" }).success).toBe(true);
  });

  test("rejects invalid format", () => {
    expect(specExportQuerySchema.safeParse({ format: "pdf" }).success).toBe(false);
  });
});

describe("unit: requirements-export T-01 specDocumentSchema", () => {
  const emptyDoc = {
    model: { id: "test-id", name: "", description: null, isReference: false },
    stories: [],
    keyActivities: [],
    kpiImpact: {
      matrix: [],
      gaps: [],
      rollup: { totalLinks: 0, coveredKpis: 0, totalKpis: 0, coverageRatio: 0 },
    },
    systemModel: {
      capabilities: [],
      gaps: {
        unsupportedSteps: [],
        capabilityGaps: [],
        capabilitiesWithoutSystem: [],
        orphanSystems: [],
      },
      contextMap: { contexts: [], unassigned: [] },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      modelId: "test-id",
      counts: {
        stories: 0,
        acceptanceCriteria: 0,
        keyActivities: 0,
        kpiLinks: 0,
        gaps: 0,
        capabilities: 0,
      },
      degraded: { kpiImpact: "not available" },
    },
  };

  test("accepts a fully-empty document with degraded", () => {
    const r = specDocumentSchema.safeParse(emptyDoc);
    expect(r.success).toBe(true);
  });

  test("accepts a fully-populated document", () => {
    const populated = {
      ...emptyDoc,
      model: { id: "m1", name: "Model 1", description: "A model", isReference: false },
      stories: [
        {
          id: "s1",
          name: "Story 1",
          description: "desc",
          persona: "p",
          action: "a",
          benefit: "b",
          narrative: "n",
          derived: false,
          sourceActivityId: "act1",
          activityId: "act1",
          activityName: "Activity 1",
          roleId: null,
          roleName: null,
          acCount: 1,
          detached: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          attributes: {},
          acceptanceCriteria: [
            {
              id: "ac1",
              name: "AC 1",
              description: "",
              given: "G",
              when: "W",
              then: "T",
              ordinal: 1,
              derived: false,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
              attributes: {},
            },
          ],
        },
      ],
      keyActivities: [
        {
          id: "a1",
          name: "Activity 1",
          journeyId: null,
          journeyName: null,
          rank: 1,
          composite: 0.5,
          scores: { centrality: 0.3, criticalPath: 0.4, handoff: 0.2 },
          evidence: {},
          key: null,
        },
      ],
      meta: {
        ...emptyDoc.meta,
        counts: {
          stories: 1,
          acceptanceCriteria: 1,
          keyActivities: 1,
          kpiLinks: 0,
          gaps: 0,
          capabilities: 0,
        },
      },
    };
    delete (populated.meta as Record<string, unknown>).degraded;
    const r = specDocumentSchema.safeParse(populated);
    expect(r.success).toBe(true);
  });
});

describe("unit: requirements-export T-01 acSchema", () => {
  test("accepts valid AC and rejects missing fields", () => {
    const valid = {
      id: "ac1",
      name: "AC 1",
      description: "",
      given: "G",
      when: "W",
      then: "T",
      ordinal: 1,
      derived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      attributes: {},
    };
    expect(acSchema.safeParse(valid).success).toBe(true);

    // Missing required fields → rejected.
    const { given: _g, ...withoutGiven } = valid;
    expect(acSchema.safeParse(withoutGiven).success).toBe(false);
    const { when: _w, ...withoutWhen } = valid;
    expect(acSchema.safeParse(withoutWhen).success).toBe(false);
    const { then: _t, ...withoutThen } = valid;
    expect(acSchema.safeParse(withoutThen).success).toBe(false);
  });
});
