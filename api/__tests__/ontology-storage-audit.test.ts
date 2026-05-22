// T-05 — unit tests for writeAudit / writeVersion / writeEvent /
// deserializeAudit + the ontologyEvents EventEmitter singleton.
//
// Hand-rolled mock for `ManagedTransaction.run` (no Neo4j needed). Each
// test records the (cypher, params) tuples emitted by the helper and
// asserts the shape matches design §4.4 / §4.5.

import { describe, test, expect, mock } from "bun:test";
import { compare as jsonpatchCompare } from "fast-json-patch";
import {
  writeAudit,
  writeVersion,
  deserializeAudit,
} from "../src/ontology/storage/audit";
import { writeEvent } from "../src/ontology/storage/events";
import {
  ontologyEvents,
  type OntologyChangedEvent,
} from "../src/ontology/events";
import { isUuidV7 } from "../src/ids";

interface CapturedCall {
  cypher: string;
  params: Record<string, unknown>;
}

/**
 * Hand-rolled `ManagedTransaction`-shaped mock. Records every `tx.run`
 * call and returns a `{records}` shape compatible with how the helpers
 * read parent-version lookups.
 *
 * Each call dequeues the next response from `responses`; if exhausted,
 * returns `{records: []}`. This lets `writeVersion`'s parent-MATCH and
 * subsequent CREATE be threaded through the same mock.
 */
function makeMockTx(responses: Array<Array<Record<string, unknown>>> = []) {
  const calls: CapturedCall[] = [];
  const queue = [...responses];
  const run = mock(
    async (cypher: string, params: Record<string, unknown> = {}) => {
      calls.push({ cypher, params });
      const next = queue.shift() ?? [];
      return {
        records: next.map((r) => ({
          get: (key: string) => r[key],
        })),
      };
    },
  );
  return { tx: { run } as never, calls };
}

// =============================================================================
// writeAudit — §4.4
// =============================================================================

describe("writeAudit", () => {
  test("issues exactly one CREATE on _OntologyAudit with the right params", async () => {
    const { tx, calls } = makeMockTx();
    await writeAudit(
      tx,
      "priya@",
      "patch_node_label",
      "Domain",
      { description: "old" },
      { description: "new" },
      "v123",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.cypher).toContain("CREATE (a:_OntologyAudit");

    const params = calls[0]!.params;
    expect(params.actor).toBe("priya@");
    expect(params.action).toBe("patch_node_label");
    expect(params.target).toBe("Domain");
    expect(params.version_id).toBe("v123");
    expect(typeof params.ts).toBe("string");
    expect(params.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("before_json = JSON.stringify(before); after_json = JSON.stringify(after); diff = jsonpatch.compare", async () => {
    const { tx, calls } = makeMockTx();
    const before = { description: "old", tags: ["a"] };
    const after = { description: "new", tags: ["a", "b"] };
    await writeAudit(tx, "priya@", "patch_node_label", "Domain", before, after, "v1");

    const params = calls[0]!.params;
    expect(params.before_json).toBe(JSON.stringify(before));
    expect(params.after_json).toBe(JSON.stringify(after));
    expect(params.diff_json).toBe(JSON.stringify(jsonpatchCompare(before, after)));

    // Sanity-check diff shape.
    const diff = JSON.parse(params.diff_json as string) as Array<{
      op: string;
      path: string;
    }>;
    expect(Array.isArray(diff)).toBe(true);
    expect(diff.some((op) => op.path === "/description")).toBe(true);
  });

  test("before = null → before_json null, diff_json null", async () => {
    const { tx, calls } = makeMockTx();
    await writeAudit(
      tx,
      "system:bootstrap",
      "create_node_label",
      "Product",
      null,
      { name: "Product" },
      "v1",
    );
    const params = calls[0]!.params;
    expect(params.before_json).toBeNull();
    expect(typeof params.after_json).toBe("string");
    expect(params.diff_json).toBeNull();
  });

  test("after = null → after_json null, diff_json null", async () => {
    const { tx, calls } = makeMockTx();
    await writeAudit(
      tx,
      "priya@",
      "delete_node_label",
      "Product",
      { name: "Product" },
      null,
      "v2",
    );
    const params = calls[0]!.params;
    expect(typeof params.before_json).toBe("string");
    expect(params.after_json).toBeNull();
    expect(params.diff_json).toBeNull();
  });

  test("before = null AND after = null → both null + no diff", async () => {
    const { tx, calls } = makeMockTx();
    await writeAudit(tx, "system", "noop", "x", null, null, "v3");
    const params = calls[0]!.params;
    expect(params.before_json).toBeNull();
    expect(params.after_json).toBeNull();
    expect(params.diff_json).toBeNull();
  });

  test("undefined treated as null (defensive — callers may pass undefined)", async () => {
    const { tx, calls } = makeMockTx();
    await writeAudit(
      tx,
      "system",
      "create_node_label",
      "X",
      undefined,
      { name: "X" },
      "v4",
    );
    const params = calls[0]!.params;
    expect(params.before_json).toBeNull();
    expect(params.diff_json).toBeNull();
  });
});

// =============================================================================
// writeVersion — §4.4
// =============================================================================

describe("writeVersion", () => {
  test("issues 2 statements: parent-lookup MATCH then CREATE; parent_id threaded", async () => {
    const { tx, calls } = makeMockTx([[{ pid: "v-prev-id" }]]);
    await writeVersion(tx, "v-new-id", "priya@", "patch_node_label", { foo: 1 });

    expect(calls).toHaveLength(2);

    // (1) Parent lookup.
    expect(calls[0]!.cypher).toContain("MATCH (v:_OntologyVersion)");
    expect(calls[0]!.cypher).toContain("ORDER BY v.version_id DESC");

    // (2) CREATE with parent_id wired in from the lookup.
    expect(calls[1]!.cypher).toContain("CREATE (v:_OntologyVersion");
    expect(calls[1]!.params.parent_id).toBe("v-prev-id");
    expect(calls[1]!.params.version_id).toBe("v-new-id");
    expect(calls[1]!.params.actor).toBe("priya@");
    expect(calls[1]!.params.summary).toBe("patch_node_label");
    expect(calls[1]!.params.diff_json).toBe(JSON.stringify({ foo: 1 }));
    expect(typeof calls[1]!.params.ts).toBe("string");
  });

  test("no existing tip → parent_id null (bootstrap version)", async () => {
    // Empty records on lookup = no prior version.
    const { tx, calls } = makeMockTx([[]]);
    await writeVersion(tx, "v-root", "system:bootstrap", "system_bootstrap_seed", {
      seed: true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.params.parent_id).toBeNull();
  });

  test("explicit null in lookup row → parent_id null (defensive)", async () => {
    // Record exists but `pid` column is null (shouldn't happen in practice
    // because of the UNIQUE constraint, but the helper must tolerate it).
    const { tx, calls } = makeMockTx([[{ pid: null }]]);
    await writeVersion(tx, "v-x", "actor", "summary", { x: 1 });
    expect(calls[1]!.params.parent_id).toBeNull();
  });
});

// =============================================================================
// writeEvent — §4.5
// =============================================================================

describe("writeEvent", () => {
  test("issues 1 CREATE on _OntologyEvent + returns { event_id } matching UUIDv7", async () => {
    const { tx, calls } = makeMockTx();
    const diff = [{ op: "replace", path: "/foo", value: 2 }];
    const result = await writeEvent(tx, "v42", diff);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.cypher).toContain("CREATE (e:_OntologyEvent");

    // Returned event_id must be a UUIDv7.
    expect(isUuidV7(result.event_id)).toBe(true);

    // Persisted params match the returned id + the source diff.
    const params = calls[0]!.params;
    expect(params.event_id).toBe(result.event_id);
    expect(params.version_id).toBe("v42");
    expect(JSON.parse(params.diff_json as string)).toEqual(diff);
    expect(typeof params.ts).toBe("string");
    expect(params.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("empty diff array still serialises + persists", async () => {
    const { tx, calls } = makeMockTx();
    const result = await writeEvent(tx, "v-noop", []);
    expect(isUuidV7(result.event_id)).toBe(true);
    expect(calls[0]!.params.diff_json).toBe("[]");
  });
});

// =============================================================================
// deserializeAudit — §4.6
// =============================================================================

describe("deserializeAudit", () => {
  test("round-trips JSON strings to objects/arrays; nulls preserved", () => {
    const row: Record<string, unknown> = {
      ts: "2026-05-23T10:00:00.000Z",
      actor: "priya@",
      action: "patch_node_label",
      target: "Domain",
      before_json: '{"a":1}',
      after_json: null,
      diff_jsonpatch: "[]",
      version_id: "v-abc",
    };
    const record = { get: (k: string) => row[k] };
    const out = deserializeAudit(record);
    expect(out.before).toEqual({ a: 1 });
    expect(out.after).toBeNull();
    expect(out.diff_jsonpatch).toEqual([]);
    expect(out.ts).toBe("2026-05-23T10:00:00.000Z");
    expect(out.actor).toBe("priya@");
    expect(out.action).toBe("patch_node_label");
    expect(out.target).toBe("Domain");
    expect(out.version_id).toBe("v-abc");
  });

  test("all-null storage → null fields in the response", () => {
    const row: Record<string, unknown> = {
      ts: "2026-05-23T10:00:00.000Z",
      actor: "system",
      action: "noop",
      target: "x",
      before_json: null,
      after_json: null,
      diff_jsonpatch: null,
      version_id: "v-z",
    };
    const out = deserializeAudit({ get: (k: string) => row[k] });
    expect(out.before).toBeNull();
    expect(out.after).toBeNull();
    expect(out.diff_jsonpatch).toBeNull();
  });

  test("populated diff array deserialises to ops with op/path", () => {
    const row: Record<string, unknown> = {
      ts: "2026-05-23T10:00:00.000Z",
      actor: "priya@",
      action: "patch_node_label",
      target: "Domain",
      before_json: '{"description":"old"}',
      after_json: '{"description":"new"}',
      diff_jsonpatch: '[{"op":"replace","path":"/description","value":"new"}]',
      version_id: "v1",
    };
    const out = deserializeAudit({ get: (k: string) => row[k] });
    expect(Array.isArray(out.diff_jsonpatch)).toBe(true);
    expect(out.diff_jsonpatch).toHaveLength(1);
    const op = (out.diff_jsonpatch as ReadonlyArray<Record<string, unknown>>)[0]!;
    expect(op.op).toBe("replace");
    expect(op.path).toBe("/description");
    expect(op.value).toBe("new");
  });
});

// =============================================================================
// ontologyEvents EventEmitter singleton — §4.5
// =============================================================================

describe("ontologyEvents", () => {
  test("emit + on round-trips an OntologyChangedEvent", () => {
    const received: OntologyChangedEvent[] = [];
    const listener = (ev: OntologyChangedEvent) => {
      received.push(ev);
    };
    ontologyEvents.on("ontology.changed", listener);
    try {
      const ev: OntologyChangedEvent = {
        event_id: "e1",
        version_id: "v1",
        ts: new Date().toISOString(),
        diff: [{ op: "replace", path: "/x", value: 1 }],
      };
      ontologyEvents.emit("ontology.changed", ev);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(ev);
    } finally {
      ontologyEvents.off("ontology.changed", listener);
    }
  });

  test("multiple listeners all receive the event", () => {
    const a: OntologyChangedEvent[] = [];
    const b: OntologyChangedEvent[] = [];
    const la = (ev: OntologyChangedEvent) => {
      a.push(ev);
    };
    const lb = (ev: OntologyChangedEvent) => {
      b.push(ev);
    };
    ontologyEvents.on("ontology.changed", la);
    ontologyEvents.on("ontology.changed", lb);
    try {
      const ev: OntologyChangedEvent = {
        event_id: "e2",
        version_id: "v2",
        ts: new Date().toISOString(),
        diff: [],
      };
      ontologyEvents.emit("ontology.changed", ev);
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect(a[0]).toEqual(ev);
      expect(b[0]).toEqual(ev);
    } finally {
      ontologyEvents.off("ontology.changed", la);
      ontologyEvents.off("ontology.changed", lb);
    }
  });
});
