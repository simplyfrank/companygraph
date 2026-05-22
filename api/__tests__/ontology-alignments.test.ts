// T-12 — unit tests for insertAlignments / replaceAlignments /
// listAlignments (storage/alignments.ts).
//
// Hand-rolled `ManagedTransaction.run` mock — same shape as the audit /
// preconditions tests. Asserts:
//   • insertAlignments runs one MERGE per entry with the right params
//   • insertAlignments([]) is a no-op
//   • replaceAlignments DETACH-DELETEs existing rows then inserts the new set
//   • replaceAlignments([]) clears the alignments (DETACH DELETE only)
//   • listAlignments maps records → ExternalAlignmentEntry array
//   • target_kind drives the parent-label binding (NodeLabel vs EdgeType)

import { describe, test, expect, mock } from "bun:test";
import {
  insertAlignments,
  replaceAlignments,
  listAlignments,
} from "../src/ontology/storage/alignments";

interface CapturedCall {
  cypher: string;
  params: Record<string, unknown>;
}

function makeMockTx(records: Array<Record<string, unknown>> = []) {
  const calls: CapturedCall[] = [];
  const run = mock(async (cypher: string, params: Record<string, unknown> = {}) => {
    calls.push({ cypher, params });
    return {
      records: records.map((r) => ({ get: (k: string) => r[k] })),
    };
  });
  return { tx: { run } as never, calls };
}

describe("insertAlignments (T-12)", () => {
  test("runs one MERGE per entry with target_kind/source/external_id wired through", async () => {
    const { tx, calls } = makeMockTx();
    await insertAlignments(tx, "node_label", "Activity", [
      { source: "ARTS", id: "BusinessProcessArea" },
      { source: "ISO20022", id: "Process" },
    ]);
    expect(calls).toHaveLength(2);

    expect(calls[0]!.cypher).toContain("MATCH (t:_OntologyNodeLabel");
    expect(calls[0]!.cypher).toContain("MERGE (al:_OntologyAlignment");
    expect(calls[0]!.params.target_kind).toBe("node_label");
    expect(calls[0]!.params.target_name).toBe("Activity");
    expect(calls[0]!.params.source).toBe("ARTS");
    expect(calls[0]!.params.external_id).toBe("BusinessProcessArea");
    expect(typeof calls[0]!.params.now).toBe("string");

    expect(calls[1]!.params.source).toBe("ISO20022");
    expect(calls[1]!.params.external_id).toBe("Process");
  });

  test("edge_type kind binds to _OntologyEdgeType parent", async () => {
    const { tx, calls } = makeMockTx();
    await insertAlignments(tx, "edge_type", "USES_SYSTEM", [
      { source: "ARTS", id: "UsesSystem" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cypher).toContain("MATCH (t:_OntologyEdgeType");
  });

  test("empty array → zero tx.run calls", async () => {
    const { tx, calls } = makeMockTx();
    await insertAlignments(tx, "node_label", "Activity", []);
    expect(calls).toHaveLength(0);
  });
});

describe("replaceAlignments (T-12)", () => {
  test("DETACH-DELETEs existing rows then MERGEs the new set", async () => {
    const { tx, calls } = makeMockTx();
    await replaceAlignments(tx, "node_label", "Activity", [
      { source: "ARTS", id: "BusinessProcessArea" },
    ]);
    expect(calls).toHaveLength(2);
    // (1) DETACH DELETE.
    expect(calls[0]!.cypher).toContain("DETACH DELETE al");
    expect(calls[0]!.params.target_kind).toBe("node_label");
    expect(calls[0]!.params.target_name).toBe("Activity");
    // (2) MERGE new entry.
    expect(calls[1]!.cypher).toContain("MERGE (al:_OntologyAlignment");
    expect(calls[1]!.params.source).toBe("ARTS");
  });

  test("empty array clears alignments (DETACH DELETE only)", async () => {
    const { tx, calls } = makeMockTx();
    await replaceAlignments(tx, "node_label", "Activity", []);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cypher).toContain("DETACH DELETE al");
  });
});

describe("listAlignments (T-12)", () => {
  test("maps records → ExternalAlignmentEntry array (source + id, NOT external_id)", async () => {
    const { tx } = makeMockTx([
      { source: "ARTS", external_id: "BusinessProcessArea" },
      { source: "ISO20022", external_id: "Process" },
    ]);
    const out = await listAlignments(tx, "node_label", "Activity");
    expect(out).toEqual([
      { source: "ARTS", id: "BusinessProcessArea" },
      { source: "ISO20022", id: "Process" },
    ]);
  });

  test("empty result → empty array", async () => {
    const { tx } = makeMockTx([]);
    const out = await listAlignments(tx, "edge_type", "PRECEDES");
    expect(out).toEqual([]);
  });
});
