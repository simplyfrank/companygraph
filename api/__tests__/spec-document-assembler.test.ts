import { describe, expect, test } from "bun:test";
import { assembleSpecDocument, type SectionReader } from "../src/derive/spec-document";
import { specDocumentSchema } from "@companygraph/shared/schema/spec-export";
import type { Driver } from "neo4j-driver";

// requirements-export T-02 — pure assembler unit tests.
// Neo4j-free; inject fixture SectionReaders.

// A dummy driver — the assembler passes it through to the readers,
// which are fixtures and never touch it.
const dummyDriver = {} as Driver;

const fullReaders: SectionReader = {
  async readModel() {
    return { id: "m1", name: "Test Model", description: "A test model", isReference: false };
  },
  async readStories() {
    return [
      {
        id: "s1",
        name: "Story 1",
        description: "desc",
        persona: "user",
        action: "does thing",
        benefit: "gets value",
        narrative: "As a user, I do a thing so I get value",
        derived: false,
        sourceActivityId: "a1",
        activityId: "a1",
        activityName: "Activity 1",
        roleId: null,
        roleName: null,
        acCount: 2,
        detached: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        attributes: {},
        acceptanceCriteria: [
          { id: "ac1", name: "AC 1", description: "", given: "G1", when: "W1", then: "T1", ordinal: 1, derived: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", attributes: {} },
          { id: "ac2", name: "AC 2", description: "", given: "G2", when: "W2", then: "T2", ordinal: 2, derived: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", attributes: {} },
        ],
      },
    ];
  },
  async readKeyActivities() {
    return [
      { id: "a1", name: "Activity 1", journeyId: null, journeyName: null, rank: 1, composite: 0.9, scores: { centrality: 0.3, criticalPath: 0.4, handoff: 0.2 }, evidence: {}, key: { marked: true, markedAt: "2026-01-01T00:00:00Z", scoreSnapshot: { centrality: 0.3, criticalPath: 0.4, handoff: 0.2, composite: 0.9 }, rank: 1 } },
      { id: "a2", name: "Activity 2", journeyId: null, journeyName: null, rank: 2, composite: 0.5, scores: { centrality: 0.2, criticalPath: 0.1, handoff: 0.2 }, evidence: {}, key: null },
    ];
  },
  async readKpiImpact() {
    return {
      matrix: [
        { activityId: "a1", activityName: "Activity 1", kpiId: "k1", kpiName: "KPI 1", direction: "positive", strength: 0.8 },
      ],
      gaps: [
        { activityId: "a2", activityName: "Activity 2", kpiId: "k2", kpiName: "KPI 2", reason: "no link" },
      ],
      rollup: { totalLinks: 1, coveredKpis: 1, totalKpis: 2, coverageRatio: 0.5 },
    };
  },
  async readSystemModel() {
    return {
      capabilities: [
        { id: "c1", name: "Cap 1", description: "A capability", neededByCount: 2, supportingSystemCount: 1, assignedContextId: null, assignedContextName: null },
      ],
      gaps: {
        unsupportedSteps: [],
        capabilityGaps: [],
        capabilitiesWithoutSystem: [{ capabilityId: "c1", name: "Cap 1" }],
        orphanSystems: [],
      },
      contextMap: { contexts: [], unassigned: [] },
    };
  },
};

describe("unit: requirements-export T-02 assembleSpecDocument", () => {
  test("fully-populated readers → zod-valid SpecDocument with correct counts", async () => {
    const doc = await assembleSpecDocument("m1", fullReaders, dummyDriver);
    const r = specDocumentSchema.safeParse(doc);
    expect(r.success).toBe(true);
    expect(doc.meta.counts.stories).toBe(1);
    expect(doc.meta.counts.acceptanceCriteria).toBe(2);
    expect(doc.meta.counts.keyActivities).toBe(2);
    expect(doc.meta.counts.kpiLinks).toBe(1);
    expect(doc.meta.counts.gaps).toBe(2);
    expect(doc.meta.counts.capabilities).toBe(1);
    expect(doc.meta.degraded).toBeUndefined();
  });

  test("reader that throws → degraded section + no exception propagates", async () => {
    const readers: SectionReader = {
      ...fullReaders,
      async readKpiImpact() { throw new Error("kpi routes unavailable"); },
    };
    const doc = await assembleSpecDocument("m1", readers, dummyDriver);
    expect(doc.kpiImpact.matrix).toEqual([]);
    expect(doc.kpiImpact.gaps).toEqual([]);
    expect(doc.meta.degraded?.kpiImpact).toBe("kpi routes unavailable");
    // Other sections unaffected.
    expect(doc.stories.length).toBe(1);
    expect(doc.keyActivities.length).toBe(2);
    expect(doc.meta.degraded?.stories).toBeUndefined();
  });

  test("determinism: two calls with same readers → structurally equal modulo generatedAt", async () => {
    const doc1 = await assembleSpecDocument("m1", fullReaders, dummyDriver);
    const doc2 = await assembleSpecDocument("m1", fullReaders, dummyDriver);
    // Strip generatedAt for comparison.
    const { generatedAt: _g1, ...rest1 } = doc1.meta;
    const { generatedAt: _g2, ...rest2 } = doc2.meta;
    expect(rest1).toEqual(rest2);
    expect(doc1.model).toEqual(doc2.model);
    expect(doc1.stories).toEqual(doc2.stories);
    expect(doc1.keyActivities).toEqual(doc2.keyActivities);
    expect(doc1.kpiImpact).toEqual(doc2.kpiImpact);
    expect(doc1.systemModel).toEqual(doc2.systemModel);
  });
});
