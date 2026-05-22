import { describe, test, expect } from "bun:test";
import { buildHighlightFromResults, tryBuildDeepLink, type ToolCallWithData } from "../../src/chat/highlight";

describe("T-07 highlight builder", () => {
  test("get_journey populates nodes + edges from activities + edges arrays", () => {
    const calls: ToolCallWithData[] = [{
      tool_name: "get_journey",
      data: {
        id: "uj_x",
        activities: [{ id: "a1" }, { id: "a2" }],
        edges: [{ id: "e1" }, { id: "e2" }],
      },
    }];
    const h = buildHighlightFromResults(calls, "uj_order_fulfillment");
    expect(h.nodes).toContain("uj_x");
    expect(h.nodes).toContain("a1");
    expect(h.nodes).toContain("a2");
    expect(h.edges).toEqual(expect.arrayContaining(["e1", "e2"]));
  });

  test("sla_hotspots populates edges + style.breach/style.warn by status", () => {
    const calls: ToolCallWithData[] = [{
      tool_name: "sla_hotspots",
      data: [
        { edge_id: "e_breach", status: "breach" },
        { edge_id: "e_warn", status: "warn" },
        { edge_id: "e_ok", status: "ok" },
      ],
    }];
    const h = buildHighlightFromResults(calls, "sla_hotspots");
    expect(h.edges).toEqual(expect.arrayContaining(["e_breach", "e_warn", "e_ok"]));
    expect(h.style?.breach).toEqual(["e_breach"]);
    expect(h.style?.warn).toEqual(["e_warn"]);
  });

  test("find_path populates paths + flattens to nodes", () => {
    const calls: ToolCallWithData[] = [{
      tool_name: "find_path",
      data: { paths: [["a1", "a2", "a3"]], edges: [[{ id: "e_a1_a2" }, { id: "e_a2_a3" }]] },
    }];
    const h = buildHighlightFromResults(calls, "graph_analyst");
    expect(h.paths).toEqual([["a1", "a2", "a3"]]);
    expect(h.nodes).toEqual(expect.arrayContaining(["a1", "a2", "a3"]));
    expect(h.edges).toEqual(expect.arrayContaining(["e_a1_a2", "e_a2_a3"]));
  });

  test("neighbors populates nodes + edges", () => {
    const calls: ToolCallWithData[] = [{
      tool_name: "neighbors",
      data: { nodes: [{ id: "r1" }, { id: "r2" }], edges: [{ id: "e_executes_1" }] },
    }];
    const h = buildHighlightFromResults(calls, "graph_analyst");
    expect(h.nodes).toEqual(expect.arrayContaining(["r1", "r2"]));
    expect(h.edges).toEqual(["e_executes_1"]);
  });

  test("error_code on a call skips its result", () => {
    const calls: ToolCallWithData[] = [
      { tool_name: "get_journey", data: { id: "uj_x", activities: [{ id: "a1" }] } },
      { tool_name: "get_activity", data: null, error_code: "not_found" },
    ];
    const h = buildHighlightFromResults(calls, "graph_analyst");
    expect(h.nodes).toContain("a1");
    expect(h.nodes).toContain("uj_x");
  });

  test("ai_candidates populates activity ids", () => {
    const calls: ToolCallWithData[] = [{
      tool_name: "ai_candidates",
      data: [{ activity_id: "a_x" }, { activity_id: "a_y" }],
    }];
    const h = buildHighlightFromResults(calls, "ai_candidates");
    expect(h.nodes).toEqual(expect.arrayContaining(["a_x", "a_y"]));
  });

  test("empty calls → empty arrays + style.selected = []", () => {
    const h = buildHighlightFromResults([], "graph_analyst");
    expect(h.nodes).toEqual([]);
    expect(h.edges).toEqual([]);
    expect(h.paths).toEqual([]);
    expect(h.style?.selected).toEqual([]);
  });

  test("tryBuildDeepLink returns null (grammar deferred per FR-H03)", () => {
    expect(tryBuildDeepLink({ nodes: ["a1"], edges: [], paths: [] }, "graph_analyst")).toBeNull();
  });
});
