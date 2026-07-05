import { describe, expect, test } from "bun:test";
import { renderSpecMarkdown, escapeMarkdown } from "../src/derive/spec-markdown";
import type { SpecDocument } from "@companygraph/shared/schema/spec-export";

// requirements-export T-03 — pure Markdown renderer unit tests.
// Neo4j-free; pure function of the document JSON.

function makeDoc(overrides?: Partial<SpecDocument>): SpecDocument {
  return {
    model: { id: "m1", name: "Test Model", description: "A test model", isReference: false },
    stories: [],
    keyActivities: [],
    kpiImpact: { matrix: [], gaps: [], rollup: { totalLinks: 0, coveredKpis: 0, totalKpis: 0, coverageRatio: 0 } },
    systemModel: {
      capabilities: [],
      gaps: { unsupportedSteps: [], capabilityGaps: [], capabilitiesWithoutSystem: [], orphanSystems: [] },
      contextMap: { contexts: [], unassigned: [] },
    },
    meta: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      modelId: "m1",
      counts: { stories: 0, acceptanceCriteria: 0, keyActivities: 0, kpiLinks: 0, gaps: 0, capabilities: 0 },
    },
    ...overrides,
  };
}

describe("unit: requirements-export T-03 escapeMarkdown", () => {
  test("escapes pipe, backtick, hash, asterisk, underscore, brackets, backslash", () => {
    expect(escapeMarkdown("|")).toBe("\\|");
    expect(escapeMarkdown("`")).toBe("\\`");
    expect(escapeMarkdown("#")).toBe("\\#");
    expect(escapeMarkdown("*")).toBe("\\*");
    expect(escapeMarkdown("_")).toBe("\\_");
    expect(escapeMarkdown("[")).toBe("\\[");
    expect(escapeMarkdown("]")).toBe("\\]");
    expect(escapeMarkdown("\\")).toBe("\\\\");
  });

  test("replaces newlines with spaces", () => {
    expect(escapeMarkdown("a\nb")).toBe("a b");
  });
});

describe("unit: requirements-export T-03 renderSpecMarkdown", () => {
  test("renders five ordered sections for a populated doc", () => {
    const doc = makeDoc({
      stories: [
        {
          id: "s1", name: "Story 1", description: "desc", persona: "user", action: "act", benefit: "val",
          narrative: "As a user, I act so I get val", derived: false, sourceActivityId: "a1",
          activityId: "a1", activityName: "Activity 1", roleId: null, roleName: null, acCount: 1,
          detached: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
          attributes: {},
          acceptanceCriteria: [
            { id: "ac1", name: "AC 1", description: "", given: "G", when: "W", then: "T", ordinal: 1, derived: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", attributes: {} },
          ],
        },
      ],
      keyActivities: [
        { id: "a1", name: "Activity 1", journeyId: null, journeyName: null, rank: 1, composite: 0.9, scores: { centrality: 0.3, criticalPath: 0.4, handoff: 0.2 }, evidence: {}, key: { marked: true, markedAt: "2026-01-01T00:00:00Z", scoreSnapshot: { centrality: 0.3, criticalPath: 0.4, handoff: 0.2, composite: 0.9 }, rank: 1 } },
      ],
      kpiImpact: {
        matrix: [{ activityId: "a1", activityName: "Activity 1", kpiId: "k1", kpiName: "KPI 1", direction: "positive", strength: 0.8 }],
        gaps: [],
        rollup: { totalLinks: 1, coveredKpis: 1, totalKpis: 2, coverageRatio: 0.5 },
      },
      systemModel: {
        capabilities: [{ id: "c1", name: "Cap 1", description: "A cap", neededByCount: 1, supportingSystemCount: 1, assignedContextId: null, assignedContextName: null }],
        gaps: { unsupportedSteps: [], capabilityGaps: [], capabilitiesWithoutSystem: [], orphanSystems: [] },
        contextMap: { contexts: [], unassigned: [] },
      },
      meta: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        modelId: "m1",
        counts: { stories: 1, acceptanceCriteria: 1, keyActivities: 1, kpiLinks: 1, gaps: 0, capabilities: 1 },
      },
    });

    const md = renderSpecMarkdown(doc);

    // Section order: Title → User Stories → Key Activities → KPI Impact → System Model
    const storyIdx = md.indexOf("## User Stories");
    const kaIdx = md.indexOf("## Key Activities");
    const kpiIdx = md.indexOf("## KPI Impact");
    const smIdx = md.indexOf("## System Model");
    expect(storyIdx).toBeGreaterThan(0);
    expect(kaIdx).toBeGreaterThan(storyIdx);
    expect(kpiIdx).toBeGreaterThan(kaIdx);
    expect(smIdx).toBeGreaterThan(kpiIdx);

    // Given/When/Then list present.
    expect(md).toContain("**Given** G");
    expect(md).toContain("**When** W");
    expect(md).toContain("**Then** T");

    // Key activity table present.
    expect(md).toContain("| Rank | Name | Composite Score | Key Activity |");
    expect(md).toContain("Activity 1");

    // KPI matrix table present.
    expect(md).toContain("| Activity | KPI | Direction | Strength |");

    // Capabilities table present.
    expect(md).toContain("| Name | Description | Needed By | Supporting Systems | Assigned Context |");
  });

  test("degraded section renders explicit unavailable note, not blank heading", () => {
    const doc = makeDoc({
      meta: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        modelId: "m1",
        counts: { stories: 0, acceptanceCriteria: 0, keyActivities: 0, kpiLinks: 0, gaps: 0, capabilities: 0 },
        degraded: { kpiImpact: "routes not available" },
      },
    });

    const md = renderSpecMarkdown(doc);
    expect(md).toContain("## KPI Impact");
    expect(md).toContain("*(section unavailable: routes not available)*");
  });

  test("escaping: story narrative with pipe/backtick/hash is escaped", () => {
    const doc = makeDoc({
      stories: [
        {
          id: "s1", name: "Story | `#` *_", description: "", persona: "p", action: "a", benefit: "b",
          narrative: "Use a | pipe and `backtick` and # hash", derived: false, sourceActivityId: null,
          activityId: null, activityName: null, roleId: null, roleName: null, acCount: 0,
          detached: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
          attributes: {},
          acceptanceCriteria: [],
        },
      ],
    });

    const md = renderSpecMarkdown(doc);
    // The pipe should be escaped so the table doesn't break.
    expect(md).toContain("\\|");
    expect(md).toContain("\\`");
    expect(md).toContain("\\#");
  });

  test("determinism: same doc → byte-identical Markdown", () => {
    const doc = makeDoc({
      stories: [
        {
          id: "s1", name: "Story 1", description: "", persona: "p", action: "a", benefit: "b",
          narrative: "narrative", derived: false, sourceActivityId: null,
          activityId: null, activityName: null, roleId: null, roleName: null, acCount: 0,
          detached: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
          attributes: {},
          acceptanceCriteria: [],
        },
      ],
    });

    const md1 = renderSpecMarkdown(doc);
    const md2 = renderSpecMarkdown(doc);
    expect(md1).toBe(md2);
  });
});
