import { describe, test, expect } from "vitest";
import { diffPaste, generateRollbackPayload } from "../lib/diffPaste";

describe("diffPaste algorithm (T-13a)", () => {
  const journeyId = "journey-1";
  const existingActivities = [
    { id: "activity-1", name: "Existing Activity", description: "", attributes: {} },
  ];
  const existingPrecedesEdges = [
    { id: "edge-1", type: "PRECEDES", from: "activity-1", to: "activity-2" },
  ];
  const existingPartOfEdges = [
    { id: "part-1", type: "PART_OF", from: "activity-1", to: journeyId },
  ];

  test("4 lines → 4 activities + 3 PRECEDES + 4 PART_OF", () => {
    const pasteLines = ["Activity A", "Activity B", "Activity C", "Activity D"];

    const result = diffPaste({
      journeyId,
      existingActivities: [],
      existingPrecedesEdges: [],
      existingPartOfEdges: [],
      pasteLines,
    });

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(7); // 3 PRECEDES + 4 PART_OF
    expect(result.warnings).toHaveLength(0);

    // Verify PRECEDES edges preserve order
    const precedesEdges = result.edges.filter((e) => e.type === "PRECEDES");
    expect(precedesEdges[0]?.from).toBe(result.nodes[0]?.id);
    expect(precedesEdges[0]?.to).toBe(result.nodes[1]?.id);
    expect(precedesEdges[1]?.from).toBe(result.nodes[1]?.id);
    expect(precedesEdges[1]?.to).toBe(result.nodes[2]?.id);
    expect(precedesEdges[2]?.from).toBe(result.nodes[2]?.id);
    expect(precedesEdges[2]?.to).toBe(result.nodes[3]?.id);

    // Verify PART_OF edges
    const partOfEdges = result.edges.filter((e) => e.type === "PART_OF");
    expect(partOfEdges).toHaveLength(4);
    partOfEdges.forEach((edge) => {
      expect(edge.to).toBe(journeyId);
    });
  });

  test("re-paste reordered → activities reused + chain rewired", () => {
    // First paste: create activities A, B, C
    const firstPaste = ["Activity A", "Activity B", "Activity C"];
    const firstResult = diffPaste({
      journeyId,
      existingActivities: [],
      existingPrecedesEdges: [],
      existingPartOfEdges: [],
      pasteLines: firstPaste,
    });

    const activityA = firstResult.nodes.find((n) => n.name === "Activity A");
    const activityB = firstResult.nodes.find((n) => n.name === "Activity B");
    const activityC = firstResult.nodes.find((n) => n.name === "Activity C");

    // Second paste: same activities but different order
    const secondPaste = ["Activity C", "Activity A", "Activity B"];
    const secondResult = diffPaste({
      journeyId,
      existingActivities: firstResult.nodes,
      existingPrecedesEdges: firstResult.edges.filter((e) => e.type === "PRECEDES"),
      existingPartOfEdges: firstResult.edges.filter((e) => e.type === "PART_OF"),
      pasteLines: secondPaste,
    });

    // Should reuse existing nodes (no new nodes)
    expect(secondResult.nodes).toHaveLength(0);
    expect(secondResult.warnings).toHaveLength(3);
    expect(secondResult.warnings.every((w) => w.includes("Reused existing activity")));

    // Should create new PRECEDES edges to reflect new order
    const newPrecedesEdges = secondResult.edges.filter((e) => e.type === "PRECEDES");
    expect(newPrecedesEdges).toHaveLength(2);
    expect(newPrecedesEdges[0]?.from).toBe(activityC?.id);
    expect(newPrecedesEdges[0]?.to).toBe(activityA?.id);
    expect(newPrecedesEdges[1]?.from).toBe(activityA?.id);
    expect(newPrecedesEdges[1]?.to).toBe(activityB?.id);

    // Should mark old PRECEDES edges for deletion
    expect(secondResult.deletedEdgeIds).toHaveLength(2);
  });

  test("duplicate activity names in paste raises error", () => {
    const pasteLines = ["Activity A", "Activity A", "Activity B"];

    expect(() => {
      diffPaste({
        journeyId,
        existingActivities: [],
        existingPrecedesEdges: [],
        existingPartOfEdges: [],
        pasteLines,
      });
    }).toThrow("Duplicate activity name");
  });

  test("snapshot captures current state for rollback", () => {
    const result = diffPaste({
      journeyId,
      existingActivities,
      existingPrecedesEdges,
      existingPartOfEdges,
      pasteLines: ["New Activity"],
    });

    expect(result.snapshot.activityIds).toEqual(["activity-1"]);
    expect(result.snapshot.precedesEdgeIds).toEqual(["edge-1"]);
  });

  test("generateRollbackPayload creates delete payload", () => {
    const snapshot = {
      activityIds: ["act-1", "act-2"],
      precedesEdgeIds: ["edge-1", "edge-2"],
    };

    const rollback = generateRollbackPayload(snapshot);

    expect(rollback.nodes).toHaveLength(2);
    expect(rollback.nodes[0]).toEqual({ id: "act-1" });
    expect(rollback.nodes[1]).toEqual({ id: "act-2" });
    expect(rollback.edges).toHaveLength(2);
    expect(rollback.edges[0]).toEqual({ id: "edge-1" });
    expect(rollback.edges[1]).toEqual({ id: "edge-2" });
  });

  test("idempotent name-match with existing activities", () => {
    const pasteLines = ["Existing Activity", "New Activity"];

    const result = diffPaste({
      journeyId,
      existingActivities,
      existingPrecedesEdges: [],
      existingPartOfEdges,
      pasteLines,
    });

    // Should only create one new node (the new activity)
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.name).toBe("New Activity");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Reused existing activity");
  });
});