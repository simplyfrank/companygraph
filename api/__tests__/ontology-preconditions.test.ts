// T-07 — unit test for assertDeletePreconditions (design §4.3 /
// FR-06 revision 3).
//
// Walks all three preconditions individually + the cross-cutting paths
// (deprecated/never-used × migration-id present/absent × edge_type vs
// node_label). Mocks `ManagedTransaction.run` with a queueable stub so
// each test arranges the sequence of return values needed by the
// preconditions it exercises.

import { describe, test, expect, mock } from "bun:test";
import {
  assertDeletePreconditions,
  type NodeLabelBefore,
  type EdgeTypeBefore,
} from "../src/ontology/storage/preconditions";
import { ValidationError } from "../src/errors";

interface CapturedCall {
  cypher: string;
  params: Record<string, unknown>;
}

type Records = Array<Record<string, unknown>>;

// Fluent helper: queues a sequence of return values for `tx.run`. Each
// call dequeues one entry. Throws if more `tx.run` calls happen than
// were queued — keeps tests honest about call count.
function makeMockTx(queue: Records[]) {
  const calls: CapturedCall[] = [];
  const remaining = [...queue];
  const run = mock(
    async (cypher: string, params: Record<string, unknown> = {}) => {
      calls.push({ cypher, params });
      if (remaining.length === 0) {
        throw new Error(
          `tx.run called more times than queued (call #${calls.length} cypher=${cypher.slice(0, 60)}…)`,
        );
      }
      const records = remaining.shift()!;
      return {
        records: records.map((r) => ({
          get: (key: string) => r[key],
        })),
      };
    },
  );
  return { tx: { run } as never, calls, run };
}

// Captures the ValidationError thrown by `fn` and returns it. Asserts
// it actually threw (and threw a ValidationError).
async function captureValidationError(fn: () => Promise<void>): Promise<ValidationError> {
  let captured: unknown = null;
  try {
    await fn();
  } catch (e) {
    captured = e;
  }
  expect(captured).toBeInstanceOf(ValidationError);
  return captured as ValidationError;
}

const FRESH_LABEL: NodeLabelBefore = { name: "Foo", deprecated_at: null };
const DEPRECATED_LABEL: NodeLabelBefore = {
  name: "Foo",
  deprecated_at: "2026-05-23T12:00:00.000Z",
};
const FRESH_EDGE: EdgeTypeBefore = { name: "RELATED_TO", deprecated_at: null };

describe("assertDeletePreconditions — (i) live instances", () => {
  test("node_label with live instances → node_instance_count failure", async () => {
    const { tx, calls } = makeMockTx([[{ c: 3 }]]);
    const err = await captureValidationError(() =>
      assertDeletePreconditions(tx, "node_label", "Foo", FRESH_LABEL),
    );
    expect(err.code).toBe("deprecation_required");
    expect(err.httpStatus).toBe(409);
    expect(err.details.precondition_failed).toBe("node_instance_count");
    expect(err.details.node_instance_count).toBe(3);
    expect(err.details.edge_instance_count).toBe(0);
    // Only the (i) check ran — short-circuited before (ii) / (iii).
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cypher).toContain("MATCH (n:`Foo`)");
  });

  test("edge_type with live instances → edge_instance_count failure", async () => {
    const { tx, calls } = makeMockTx([[{ c: 2 }]]);
    const err = await captureValidationError(() =>
      assertDeletePreconditions(tx, "edge_type", "RELATED_TO", FRESH_EDGE),
    );
    expect(err.code).toBe("deprecation_required");
    expect(err.httpStatus).toBe(409);
    expect(err.details.precondition_failed).toBe("edge_instance_count");
    expect(err.details.edge_instance_count).toBe(2);
    expect(err.details.node_instance_count).toBe(0);
    expect(calls).toHaveLength(1);
    // Directional MATCH so each stored relationship is counted once
    // (undirected `-[r]-` would double-count self-pair edges).
    expect(calls[0]!.cypher).toContain("MATCH ()-[r:`RELATED_TO`]->()");
  });

  test("coerces Neo4j Integer (with .toNumber()) to a plain number", async () => {
    const neoInt = { toNumber: () => 5 };
    const { tx } = makeMockTx([[{ c: neoInt }]]);
    const err = await captureValidationError(() =>
      assertDeletePreconditions(tx, "node_label", "Foo", FRESH_LABEL),
    );
    expect(err.details.node_instance_count).toBe(5);
  });
});

describe("assertDeletePreconditions — (ii) registry references (node_label only)", () => {
  test("node_label with endpoint references → edge_endpoints_referencing failure", async () => {
    const { tx, calls } = makeMockTx([
      [{ c: 0 }], // (i) no live instances
      [{ c: 1 }], // (ii) one endpoint references this label
    ]);
    const err = await captureValidationError(() =>
      assertDeletePreconditions(tx, "node_label", "Foo", FRESH_LABEL),
    );
    expect(err.code).toBe("deprecation_required");
    expect(err.details.precondition_failed).toBe("edge_endpoints_referencing");
    expect(err.details.ref_count).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.cypher).toContain("_OntologyEdgeEndpoint");
    expect(calls[1]!.params.name).toBe("Foo");
  });

  test("edge_type — step (ii) is SKIPPED (no endpoint-ref check)", async () => {
    // edge_type with zero instances + no deprecation + no migration id
    // → succeeds, AND only ONE tx.run call (the instance count). The
    // mock queue has only one entry; if (ii) tried to run it would
    // throw "called more times than queued".
    const { tx, calls } = makeMockTx([[{ c: 0 }]]);
    await assertDeletePreconditions(tx, "edge_type", "RELATED_TO", FRESH_EDGE);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cypher).toContain("MATCH ()-[r:`RELATED_TO`]->()");
  });
});

describe("assertDeletePreconditions — (iii) migration step", () => {
  test("deprecated node_label without confirm_migration_step_id → migration_step_required", async () => {
    const { tx, calls } = makeMockTx([
      [{ c: 0 }], // (i)
      [{ c: 0 }], // (ii)
    ]);
    const err = await captureValidationError(() =>
      assertDeletePreconditions(tx, "node_label", "Foo", DEPRECATED_LABEL),
    );
    expect(err.code).toBe("deprecation_required");
    expect(err.details.precondition_failed).toBe("migration_step_required");
    expect(typeof err.details.hint).toBe("string");
    expect(err.details.hint).toContain("/api/v1/ontology/migrations");
    // Two calls so far — migration lookup was NOT performed (no id to look up).
    expect(calls).toHaveLength(2);
  });

  test("deprecated node_label WITH valid confirm_migration_step_id → resolves cleanly", async () => {
    const { tx, calls } = makeMockTx([
      [{ c: 0 }], // (i)
      [{ c: 0 }], // (ii)
      [{ m: { migration_id: "mig-1" } }], // (iii) migration found
    ]);
    await assertDeletePreconditions(
      tx,
      "node_label",
      "Foo",
      DEPRECATED_LABEL,
      "mig-1",
    );
    expect(calls).toHaveLength(3);
    expect(calls[2]!.cypher).toContain("_OntologyMigration");
    expect(calls[2]!.params.id).toBe("mig-1");
    expect(calls[2]!.params.name).toBe("Foo");
  });

  test("deprecated node_label with confirm_migration_step_id pointing at non-existent row → migration_step_not_found", async () => {
    const { tx, calls } = makeMockTx([
      [{ c: 0 }], // (i)
      [{ c: 0 }], // (ii)
      [], // (iii) — empty result set
    ]);
    const err = await captureValidationError(() =>
      assertDeletePreconditions(
        tx,
        "node_label",
        "Foo",
        DEPRECATED_LABEL,
        "mig-missing",
      ),
    );
    expect(err.code).toBe("deprecation_required");
    expect(err.details.precondition_failed).toBe("migration_step_not_found");
    expect(err.details.migration_id).toBe("mig-missing");
    expect(err.details.target).toBe("Foo");
    expect(calls).toHaveLength(3);
  });

  test("never-used node_label (deprecated_at null, no migration id) → resolves cleanly", async () => {
    const { tx, calls } = makeMockTx([
      [{ c: 0 }], // (i)
      [{ c: 0 }], // (ii)
    ]);
    await assertDeletePreconditions(tx, "node_label", "Foo", FRESH_LABEL);
    // Two calls — (iii) is entirely skipped on the never-used path.
    expect(calls).toHaveLength(2);
  });

  test("never-used node_label WITH confirm_migration_step_id still verifies the migration row", async () => {
    // Defensive: if the operator passes an id, the function still
    // validates it — guards against a caller-bug where the wrong id
    // gets threaded through.
    const { tx, calls } = makeMockTx([
      [{ c: 0 }], // (i)
      [{ c: 0 }], // (ii)
      [{ m: { migration_id: "mig-1" } }], // (iii) lookup succeeds
    ]);
    await assertDeletePreconditions(
      tx,
      "node_label",
      "Foo",
      FRESH_LABEL,
      "mig-1",
    );
    expect(calls).toHaveLength(3);
  });
});

describe("assertDeletePreconditions — Cypher safety (label/type interpolation)", () => {
  test("node_label name is backtick-escaped into the count query", async () => {
    const { tx, calls } = makeMockTx([[{ c: 0 }], [{ c: 0 }]]);
    await assertDeletePreconditions(tx, "node_label", "MyLabel", {
      name: "MyLabel",
      deprecated_at: null,
    });
    expect(calls[0]!.cypher).toContain("MATCH (n:`MyLabel`)");
  });

  test("edge_type name is backtick-escaped into the count query", async () => {
    const { tx, calls } = makeMockTx([[{ c: 0 }]]);
    await assertDeletePreconditions(tx, "edge_type", "MY_TYPE", {
      name: "MY_TYPE",
      deprecated_at: null,
    });
    expect(calls[0]!.cypher).toContain("MATCH ()-[r:`MY_TYPE`]->()");
  });
});
