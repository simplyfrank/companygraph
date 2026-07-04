import { describe, expect, test } from "bun:test";
import {
  computeAiCandidates,
  toCsv,
  CSV_BOM,
  AI_CANDIDATE_CSV_HEADER,
  DEFAULT_AI_CANDIDATE_DEFINITION,
  type AiCandidateDefinition,
} from "../src/analytics/ai-candidates";
import type { GraphNode, GraphEdge } from "../src/neo4j/read-only-graph";

// AC-07 (cto-analytics FR-07, T-13) — rule-based AI-candidate filter (RD-4/RD-4a).
//
// A candidate is an Activity whose attributes satisfy the definition:
//   repetition == "high" AND data_richness == "high" AND leverage_score >= 0.5
// results ranked by leverage_score DESC. The definition is a code-default
// constant (design §10.2, RD-6) but a parameter here so a reconfigured
// definition (AC-07 b) is testable.
//
// The pure `computeAiCandidates` layer is the load-bearing AC-07 assertion and
// runs in every environment (no Neo4j). `toCsv` is the AC-07 (c) byte assertion.

// ── Fixture: attributes ape `retail-mini-enriched.json`'s vocabulary ─────────
//
// attributes live in `attributes_json` STRING on `properties` (graph-core
// storage), exactly as the read-only-graph GRAPH_QUERY projects them.

function activity(
  id: string,
  name: string,
  attrs: Record<string, unknown>,
): GraphNode {
  return {
    id,
    label: "Activity",
    name,
    properties: { id, name, attributes_json: JSON.stringify(attrs) },
  };
}

// a1: high/high/0.83 → candidate (top). a2: high/high/0.55 → candidate.
// a3: high/high/0.42 → excluded (leverage < 0.5).
// a4: high/med/0.60  → excluded (richness != high).
// a5: med/high/0.70  → excluded (repetition != high).
// a6: no attributes  → excluded.
const NODES: GraphNode[] = [
  { id: "j1", label: "UserJourney", name: "Resolve Complaint" },
  activity("a1", "Draft response", { repetition: "high", data_richness: "high", leverage_score: 0.83 }),
  activity("a2", "Classify ticket", { repetition: "high", data_richness: "high", leverage_score: 0.55 }),
  activity("a3", "Log outcome", { repetition: "high", data_richness: "high", leverage_score: 0.42 }),
  activity("a4", "Route to team", { repetition: "high", data_richness: "med", leverage_score: 0.6 }),
  activity("a5", "Escalate", { repetition: "med", data_richness: "high", leverage_score: 0.7 }),
  { id: "a6", label: "Activity", name: "Unenriched", properties: { id: "a6", name: "Unenriched" } },
  { id: "s1", label: "System", name: "CRM" },
  { id: "s2", label: "System", name: "Zendesk" },
  { id: "r1", label: "Role", name: "Agent" },
];

const EDGES: GraphEdge[] = [
  { id: "a1->j1:PART_OF", source: "a1", target: "j1", type: "PART_OF" },
  { id: "a1->s1:USES_SYSTEM", source: "a1", target: "s1", type: "USES_SYSTEM" },
  { id: "a1->s2:USES_SYSTEM", source: "a1", target: "s2", type: "USES_SYSTEM" },
  { id: "r1->a1:EXECUTES", source: "r1", target: "a1", type: "EXECUTES" },
  { id: "a2->j1:PART_OF", source: "a2", target: "j1", type: "PART_OF" },
];

describe("cto-analytics T-13 — AI-candidate filter (AC-07 a: default definition)", () => {
  test("keeps only high/high/leverage>=0.5 activities, ranked by leverage DESC", () => {
    const report = computeAiCandidates(NODES, EDGES);
    expect(report.report).toBe("ai-candidates");
    expect(report.candidates.map((c) => c.activityId)).toEqual(["a1", "a2"]);
    // DESC by leverage_score.
    expect(report.candidates[0]!.leverageScore).toBe(0.83);
    expect(report.candidates[1]!.leverageScore).toBe(0.55);
  });

  test("excludes low-leverage, non-matching-richness, non-matching-repetition, and unenriched activities", () => {
    const report = computeAiCandidates(NODES, EDGES);
    const ids = new Set(report.candidates.map((c) => c.activityId));
    expect(ids.has("a3")).toBe(false); // leverage 0.42 < 0.5
    expect(ids.has("a4")).toBe(false); // data_richness "med"
    expect(ids.has("a5")).toBe(false); // repetition "med"
    expect(ids.has("a6")).toBe(false); // no attributes_json
  });

  test("attaches parent journey, distinct systems and roles for each candidate", () => {
    const report = computeAiCandidates(NODES, EDGES);
    const a1 = report.candidates.find((c) => c.activityId === "a1")!;
    expect(a1.journey).toEqual({ id: "j1", name: "Resolve Complaint" });
    expect(a1.systems.map((s) => s.name)).toEqual(["CRM", "Zendesk"]); // sorted by name
    expect(a1.roles.map((r) => r.name)).toEqual(["Agent"]);
    expect(a1.repetition).toBe("high");
    expect(a1.dataRichness).toBe("high");

    const a2 = report.candidates.find((c) => c.activityId === "a2")!;
    expect(a2.systems).toEqual([]); // no USES_SYSTEM edge
    expect(a2.roles).toEqual([]);
  });

  test("empty graph yields no candidates but a well-formed report", () => {
    const report = computeAiCandidates([], []);
    expect(report.candidates).toEqual([]);
    expect(report.definition).toEqual(DEFAULT_AI_CANDIDATE_DEFINITION);
  });
});

describe("cto-analytics T-13 — reconfigured definition (AC-07 b)", () => {
  const RECONFIGURED: AiCandidateDefinition = {
    repetition_key: "manual_repeat",
    repetition_match: "yes",
    richness_key: "info_density",
    richness_match: "rich",
    leverage_score_key: "leverage_score",
    leverage_min: 0.7,
  };

  const RC_NODES: GraphNode[] = [
    activity("b1", "Bulk tag", { manual_repeat: "yes", info_density: "rich", leverage_score: 0.9 }),
    activity("b2", "Bulk tag lo", { manual_repeat: "yes", info_density: "rich", leverage_score: 0.65 }),
    // b3 matches the DEFAULT vocabulary but NOT the reconfigured one.
    activity("b3", "Old vocab", { repetition: "high", data_richness: "high", leverage_score: 0.95 }),
  ];

  test("the filter switches to the reconfigured attribute keys/values/threshold", () => {
    const report = computeAiCandidates(RC_NODES, [], RECONFIGURED);
    // b1 passes; b2 fails the 0.7 threshold; b3 uses the old vocabulary → excluded.
    expect(report.candidates.map((c) => c.activityId)).toEqual(["b1"]);
    expect(report.definition).toEqual(RECONFIGURED);
  });

  test("the DEFAULT definition matches b3 (proving the switch is real, not empty)", () => {
    const report = computeAiCandidates(RC_NODES, []); // default definition
    expect(report.candidates.map((c) => c.activityId)).toEqual(["b3"]);
  });
});

describe("cto-analytics T-13 — CSV export (AC-07 c: BOM + CRLF + RFC 4180)", () => {
  test("first three bytes are EF BB BF (UTF-8 BOM)", () => {
    const csv = toCsv([]);
    const bytes = new TextEncoder().encode(csv);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  test("line endings are CRLF and the header is the fixed column set", () => {
    const report = computeAiCandidates(NODES, EDGES);
    const csv = toCsv(report.candidates);
    const body = csv.slice(CSV_BOM.length);
    // Every record line is terminated by CRLF; splitting on CRLF yields the
    // header + one line per candidate (+ trailing empty from the final CRLF).
    expect(body.includes("\r\n")).toBe(true);
    expect(body.includes("\n\n")).toBe(false); // no bare LF pairs
    const lines = body.split("\r\n");
    expect(lines[0]).toBe(AI_CANDIDATE_CSV_HEADER.join(","));
    expect(lines[1]!.startsWith("a1,")).toBe(true);
  });

  test("fields with commas are RFC 4180 quoted; embedded quotes are doubled", () => {
    const nodes: GraphNode[] = [
      activity("c1", "Reconcile, refund & report", {
        repetition: "high",
        data_richness: "high",
        leverage_score: 0.9,
      }),
      { id: "s9", label: "System", name: 'The "Ledger"' },
    ];
    const edges: GraphEdge[] = [
      { id: "c1->s9:USES_SYSTEM", source: "c1", target: "s9", type: "USES_SYSTEM" },
    ];
    const csv = toCsv(computeAiCandidates(nodes, edges).candidates);
    // Comma-bearing activity name is quoted.
    expect(csv).toContain('"Reconcile, refund & report"');
    // Embedded double-quote in the system name is doubled and the field quoted.
    expect(csv).toContain('"The ""Ledger"""');
  });
});
