import { describe, test, expect } from "vitest";
import { orderJourneyActivities } from "../journeyOrder";

describe("orderJourneyActivities (FR-03 / AC-02)", () => {
  test("linear chain orders by PRECEDES", () => {
    const activities = [
      { id: "c", createdAt: "2026-01-03T00:00:00Z" },
      { id: "a", createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00Z" },
    ];
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
    ];
    const result = orderJourneyActivities(activities, edges);
    expect(result.cycle).toBe(false);
    expect(result.orderedIds).toEqual(["a", "b", "c"]);
  });

  test("multiple roots break tie by createdAt ASC", () => {
    const activities = [
      { id: "x", createdAt: "2026-02-10T00:00:00Z" },
      { id: "y", createdAt: "2026-02-05T00:00:00Z" },
    ];
    const result = orderJourneyActivities(activities, []);
    expect(result.cycle).toBe(false);
    expect(result.orderedIds).toEqual(["y", "x"]);
  });

  test("diamond graph orders predecessors before successors", () => {
    const activities = [
      { id: "start", createdAt: "2026-01-01T00:00:00Z" },
      { id: "left",  createdAt: "2026-01-02T00:00:00Z" },
      { id: "right", createdAt: "2026-01-03T00:00:00Z" },
      { id: "end",   createdAt: "2026-01-04T00:00:00Z" },
    ];
    const edges = [
      { fromId: "start", toId: "left" },
      { fromId: "start", toId: "right" },
      { fromId: "left",  toId: "end" },
      { fromId: "right", toId: "end" },
    ];
    const result = orderJourneyActivities(activities, edges);
    expect(result.cycle).toBe(false);
    expect(result.orderedIds[0]).toBe("start");
    expect(result.orderedIds[result.orderedIds.length - 1]).toBe("end");
    // left + right both have start as a predecessor; createdAt picks left first.
    expect(result.orderedIds.indexOf("left")).toBeLessThan(result.orderedIds.indexOf("right"));
  });

  test("cycle is flagged and every activity is still returned", () => {
    const activities = [
      { id: "a", createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00Z" },
      { id: "c", createdAt: "2026-01-03T00:00:00Z" },
    ];
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
      { fromId: "c", toId: "a" }, // closes the cycle
    ];
    const result = orderJourneyActivities(activities, edges);
    expect(result.cycle).toBe(true);
    expect(new Set(result.orderedIds)).toEqual(new Set(["a", "b", "c"]));
    // Remaining (cycle members) fall back to createdAt ASC.
    expect(result.orderedIds).toEqual(["a", "b", "c"]);
  });

  test("partial cycle still orders the acyclic prefix correctly", () => {
    const activities = [
      { id: "head", createdAt: "2026-01-01T00:00:00Z" },
      { id: "a",    createdAt: "2026-01-02T00:00:00Z" },
      { id: "b",    createdAt: "2026-01-03T00:00:00Z" },
    ];
    const edges = [
      { fromId: "head", toId: "a" },
      { fromId: "a",    toId: "b" },
      { fromId: "b",    toId: "a" }, // cycle on {a, b}
    ];
    const result = orderJourneyActivities(activities, edges);
    expect(result.cycle).toBe(true);
    expect(result.orderedIds[0]).toBe("head");
    expect(result.orderedIds.length).toBe(3);
  });

  test("edges that reference unknown ids are ignored", () => {
    const activities = [
      { id: "a", createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00Z" },
    ];
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "a", toId: "ghost" }, // not in activities — must be ignored
    ];
    const result = orderJourneyActivities(activities, edges);
    expect(result.cycle).toBe(false);
    expect(result.orderedIds).toEqual(["a", "b"]);
  });

  test("missing createdAt falls back to a stable id-tiebreaker", () => {
    const activities = [
      { id: "z", createdAt: "" },
      { id: "a", createdAt: "" },
    ];
    const result = orderJourneyActivities(activities, []);
    expect(result.orderedIds).toEqual(["a", "z"]);
  });
});
