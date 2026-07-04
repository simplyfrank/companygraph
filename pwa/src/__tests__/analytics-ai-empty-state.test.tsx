import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AnalyticsAi, AI_EMPTY_STATE_COPY } from "../views/analytics/Ai";

// cto-analytics T-13 (FR-07, AC-07 d / AC-15) — AI-candidate empty state.
//
// When no Activity satisfies the rule-based definition (repetition == "high"
// AND data_richness == "high" AND leverage_score >= 0.5) the view shows the
// named copy that points the user at ontology-manager and names the real
// as-built attributes (RD-4a) — never a blank screen.
//
// The view rides `POST /api/v1/query/cypher` (DD-01); the mocked passthrough
// echoes rows the view filters client-side.

interface CypherRow {
  activity: { id: string; name: string };
  journey: { id: string; name: string } | null;
  systems: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
  attrs: string | null;
}

function mockCypher(rows: CypherRow[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("/api/v1/query/cypher")) {
      return new Response(JSON.stringify({ rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
}

const attrs = (o: Record<string, unknown>): string => JSON.stringify(o);

describe("cto-analytics T-13 — AI-candidate empty state (AC-15)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("shows the named copy when no activity matches the definition", async () => {
    // Rows present, but none satisfy high/high/leverage>=0.5.
    mockCypher([
      {
        activity: { id: "a1", name: "Log outcome" },
        journey: null,
        systems: [],
        roles: [],
        attrs: attrs({ repetition: "high", data_richness: "high", leverage_score: 0.42 }),
      },
      {
        activity: { id: "a2", name: "Route" },
        journey: null,
        systems: [],
        roles: [],
        attrs: attrs({ repetition: "med", data_richness: "high", leverage_score: 0.9 }),
      },
    ]);

    render(<AnalyticsAi />);
    const empty = await screen.findByTestId("ai-empty-state");
    // The literal string names ontology-manager + the three real attributes.
    expect(empty.textContent).toBe(AI_EMPTY_STATE_COPY);
    expect(empty.textContent).toContain("ontology-manager");
    expect(empty.textContent).toContain("repetition");
    expect(empty.textContent).toContain("data_richness");
    expect(empty.textContent).toContain("leverage_score");
  });

  test("also empty when the graph has no activities at all", async () => {
    mockCypher([]);
    render(<AnalyticsAi />);
    const empty = await screen.findByTestId("ai-empty-state");
    expect(empty.textContent).toBe(AI_EMPTY_STATE_COPY);
  });

  test("renders the candidate table (not the empty state) when a match exists", async () => {
    mockCypher([
      {
        activity: { id: "a1", name: "Draft response" },
        journey: { id: "j1", name: "Resolve Complaint" },
        systems: [{ id: "s1", name: "CRM" }],
        roles: [{ id: "r1", name: "Agent" }],
        attrs: attrs({ repetition: "high", data_richness: "high", leverage_score: 0.83 }),
      },
    ]);

    render(<AnalyticsAi />);
    const link = await screen.findByTestId("ai-activity-link");
    expect(link.textContent).toBe("Draft response");
    expect(link.getAttribute("href")).toBe("#/explorer/activities/a1");
    expect(screen.queryByTestId("ai-empty-state")).toBeNull();
  });

  test("ranks multiple candidates by leverage score DESC (AC-07 a in the view)", async () => {
    mockCypher([
      {
        activity: { id: "lo", name: "Lower" },
        journey: null,
        systems: [],
        roles: [],
        attrs: attrs({ repetition: "high", data_richness: "high", leverage_score: 0.55 }),
      },
      {
        activity: { id: "hi", name: "Higher" },
        journey: null,
        systems: [],
        roles: [],
        attrs: attrs({ repetition: "high", data_richness: "high", leverage_score: 0.9 }),
      },
    ]);

    render(<AnalyticsAi />);
    const links = await screen.findAllByTestId("ai-activity-link");
    expect(links.map((l) => l.getAttribute("data-activity-id"))).toEqual(["hi", "lo"]);
  });
});
