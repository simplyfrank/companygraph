import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import {
  buildScoringModel,
  getScores,
  rowFor,
  type ScoringFixture,
} from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-06 / AC-06 (import-round-trip half) —
// design §4.6, DD-04, DD-05. This spec does NOT touch
// POST /api/v1/import or upsertNode; this test only documents +
// asserts the interaction. Because `keyActivity` lives in the OPEN
// `attributes` map:
//   (a) a snapshot taken BEFORE a mark re-imports the activity WITHOUT
//       the mark — the mark is dropped; import is authoritative;
//   (b) a snapshot taken AFTER a mark restores the mark WITH its
//       point-in-time scoreSnapshot/rank (which the live GET always
//       recomputes fresh — the snapshot is evidence-at-mark-time).
//
// Pass-2 C-01 qualifier: this round-trip holds PROVIDED the Activity
// attribute schema is not `additionalProperties:false` — the current
// default (a label with no registry row is fully permissive, and a
// compiled schema passes unlisted keys because z.object() is
// non-strict via jsonSchemaToZod). A future STRICT Activity schema
// would reject `keyActivity` on the upsertNode import path ONLY — the
// mark write (storage/key-activities.ts) bypasses the validator and is
// unaffected, as is scoring.

const cleanup = newCleanup();
let fx: ScoringFixture;

interface NodeRes {
  id: string;
  name: string;
  description: string;
  attributes: Record<string, unknown>;
}

async function getActivityNode(id: string): Promise<NodeRes> {
  const { status, body } = await api<NodeRes>("GET", `/nodes/Activity/${id}`);
  expect(status).toBe(200);
  return body;
}

// Re-import a single node exactly the way an export snapshot would
// carry it (the upsertNode path — replaces the whole attributes_json).
async function reimportActivity(node: NodeRes): Promise<void> {
  const { status, body } = await api<{ imported: { nodes: number } }>("POST", "/import", {
    nodes: [
      {
        label: "Activity",
        id: node.id,
        name: node.name,
        description: node.description,
        attributes: node.attributes,
      },
    ],
    edges: [],
  });
  expect(status).toBe(200);
  expect(body.imported.nodes).toBe(1);
}

describe("integration: key-activity-optimizer AC-06 import interaction (DD-04)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    fx = await buildScoringModel(
      cleanup,
      "ka-import",
      [
        { key: "a", roles: ["r1"], systems: ["s1"], attributes: { team: "ops" } },
        { key: "b", roles: ["r2"], systems: ["s2"] },
      ],
      [["a", "b"]],
    );
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("(a) pre-mark snapshot re-imports WITHOUT the mark — import is authoritative", async () => {
    const aId = fx.activityIds.a!;
    const preMarkSnapshot = await getActivityNode(aId);
    expect("keyActivity" in preMarkSnapshot.attributes).toBe(false);

    const mark = await api("POST", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(mark.status).toBe(200);
    const marked = await getActivityNode(aId);
    expect("keyActivity" in marked.attributes).toBe(true);

    await reimportActivity(preMarkSnapshot);

    const after = await getActivityNode(aId);
    expect("keyActivity" in after.attributes).toBe(false);
    expect(after.attributes.team).toBe("ops");
    expect(rowFor(await getScores(fx.modelId), aId).key).toBeNull();
  });

  test("(b) post-mark snapshot restores the mark with its point-in-time scoreSnapshot/rank", async () => {
    const aId = fx.activityIds.a!;
    const mark = await api<{ key: { markedAt: string; rank: number } }>(
      "POST",
      `/models/${fx.modelId}/key-activities/${aId}/mark`,
    );
    expect(mark.status).toBe(200);
    const postMarkSnapshot = await getActivityNode(aId);
    const storedMark = postMarkSnapshot.attributes.keyActivity as {
      markedAt: string;
      rank: number;
      scoreSnapshot: { composite: number };
    };

    // Drop the mark (unmark), then restore via import.
    const del = await api("DELETE", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(del.status).toBe(204);
    expect("keyActivity" in (await getActivityNode(aId)).attributes).toBe(false);

    await reimportActivity(postMarkSnapshot);

    const restored = await getActivityNode(aId);
    const restoredMark = restored.attributes.keyActivity as typeof storedMark;
    expect(restoredMark.markedAt).toBe(storedMark.markedAt);
    expect(restoredMark.rank).toBe(storedMark.rank);
    expect(restoredMark.scoreSnapshot.composite).toBe(storedMark.scoreSnapshot.composite);

    // The live GET recomputes fresh scores and attaches the restored
    // point-in-time mark.
    const row = rowFor(await getScores(fx.modelId), aId);
    expect(row.key).not.toBeNull();
    expect(row.key!.markedAt).toBe(storedMark.markedAt);
  });
});
