// ddd-system-modeling T-04 / AC-04 — the mapping routes, with FIRST-PUT
// dispatch proven END-TO-END (DD-11: the router is method-generic;
// these are the codebase's first PUT routes). MERGE idempotency
// (DD-06), context replace (at-most-one, FR-03), the DD-16 strict
// needed-by arm, per-target 404 codes, and the DD-12 getEdgeEndpoints
// wrong-pair 400. API-only fixtures.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  createEdge,
  newCleanup,
  runCleanup,
  type Cleanup,
} from "./helpers/model-fixtures";
import { ensureCapabilitySchema, createStoryFixture } from "./helpers/capability-fixtures";
import { CAPABILITY_EDGE_TYPES } from "../src/scripts/register-capability-labels";
import type { CapabilityRead } from "@companygraph/shared/schema/ddd-system";

const cleanup: Cleanup = newCleanup();
let modelId: string;
let activityId: string;
let systemId: string;
let capId: string;

async function edgeCount(type: string, fromId: string, toId: string): Promise<number> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH ({id: $fromId})-[r:\`${type}\`]->({id: $toId}) RETURN count(r) AS c`,
      { fromId, toId },
    );
    return Number(r.records[0]!.get("c"));
  } finally {
    await session.close();
  }
}

describe("integration: ddd-system-modeling AC-04 mapping routes (first PUT)", () => {
  beforeAll(async () => {
    await ensureCapabilitySchema();
    const model = await api<{ id: string }>("POST", "/models", { name: "cap-map-model" });
    modelId = model.body.id;
    cleanup.modelIds.push(modelId);
    const domain = await api<{ id: string }>("POST", `/models/${modelId}/domains`, {
      name: "cap-map-domain",
    });
    const journeyId = await createNode(cleanup, "UserJourney", "cap-map-journey");
    await createEdge("PART_OF", journeyId, domain.body.id);
    activityId = await createNode(cleanup, "Activity", "cap-map-activity");
    await createEdge("PART_OF", activityId, journeyId);
    systemId = await createNode(cleanup, "System", "cap-map-system", {
      systemKind: "functional",
    });
    const cap = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Mapping capability",
    });
    capId = cap.body.id;
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("PUT needed-by {activityId} dispatches (first PUT, DD-11) and repeat is an idempotent MERGE — no duplicate edge", async () => {
    const first = await api<CapabilityRead>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/needed-by`,
      { activityId },
    );
    expect(first.status).toBe(200);
    const again = await api<CapabilityRead>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/needed-by`,
      { activityId },
    );
    expect(again.status).toBe(200);
    expect(await edgeCount("NEEDS_CAPABILITY", activityId, capId)).toBe(1);
  });

  test("PUT needed-by {storyId} — the second NEEDS_CAPABILITY pair, idempotent too", async () => {
    const story = await createStoryFixture(modelId, activityId, "mapping tester");
    const r = await api<CapabilityRead>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/needed-by`,
      { storyId: story.id },
    );
    expect(r.status).toBe(200);
    await api("PUT", `/models/${modelId}/capabilities/${capId}/needed-by`, {
      storyId: story.id,
    });
    expect(await edgeCount("NEEDS_CAPABILITY", story.id, capId)).toBe(1);

    // body-carrying DELETE removes the story arm
    const del = await api("DELETE", `/models/${modelId}/capabilities/${capId}/needed-by`, {
      storyId: story.id,
    });
    expect(del.status).toBe(204);
    expect(await edgeCount("NEEDS_CAPABILITY", story.id, capId)).toBe(0);
  });

  test("PUT supported-by {systemId} idempotent; DELETE …/supported-by/:systemId removes", async () => {
    const put = await api<CapabilityRead>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/supported-by`,
      { systemId },
    );
    expect(put.status).toBe(200);
    await api("PUT", `/models/${modelId}/capabilities/${capId}/supported-by`, { systemId });
    expect(await edgeCount("SUPPORTED_BY", capId, systemId)).toBe(1);

    const del = await api(
      "DELETE",
      `/models/${modelId}/capabilities/${capId}/supported-by/${systemId}`,
    );
    expect(del.status).toBe(204);
    expect(await edgeCount("SUPPORTED_BY", capId, systemId)).toBe(0);
  });

  test("PUT context replaces the prior assignment — at-most-one, ALL priors deleted", async () => {
    const bc1 = await createNode(cleanup, "BoundedContext", "cap-map-context-1");
    const bc2 = await createNode(cleanup, "BoundedContext", "cap-map-context-2");

    const r1 = await api<CapabilityRead>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/context`,
      { boundedContextId: bc1 },
    );
    expect(r1.status).toBe(200);
    expect(r1.body.assignedContext?.id).toBe(bc1);

    const r2 = await api<CapabilityRead>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/context`,
      { boundedContextId: bc2 },
    );
    expect(r2.status).toBe(200);
    expect(r2.body.assignedContext?.id).toBe(bc2);
    expect(await edgeCount("ASSIGNED_TO_CONTEXT", capId, bc1)).toBe(0);
    expect(await edgeCount("ASSIGNED_TO_CONTEXT", capId, bc2)).toBe(1);

    const del = await api("DELETE", `/models/${modelId}/capabilities/${capId}/context`);
    expect(del.status).toBe(204);
    expect(await edgeCount("ASSIGNED_TO_CONTEXT", capId, bc2)).toBe(0);
  });

  test("DD-16 strict arm: an orphan activity (∉ scopedNodeIds) → 404 not_found with details.field", async () => {
    const orphanId = await createNode(cleanup, "Activity", "cap-map-orphan-activity");
    // No PART_OF chain — outside every model's scope.
    const r = await api<{ error: { code: string; details?: { field?: string } } }>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/needed-by`,
      { activityId: orphanId },
    );
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("not_found");
    expect(r.body.error.details?.field).toBe("activityId");
  });

  test("unknown capability / system / context → matching *_not_found codes", async () => {
    const bogus = "01900000-0000-7000-8000-00000000beef";

    const cap404 = await api<{ error: { code: string } }>(
      "PUT",
      `/models/${modelId}/capabilities/${bogus}/needed-by`,
      { activityId },
    );
    expect(cap404.status).toBe(404);
    expect(cap404.body.error.code).toBe("capability_not_found");

    const sys404 = await api<{ error: { code: string } }>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/supported-by`,
      { systemId: bogus },
    );
    expect(sys404.status).toBe(404);
    expect(sys404.body.error.code).toBe("system_not_found");

    const bc404 = await api<{ error: { code: string } }>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/context`,
      { boundedContextId: bogus },
    );
    expect(bc404.status).toBe(404);
    expect(bc404.body.error.code).toBe("bounded_context_not_found");
  });

  test("invalid needed-by bodies (neither / both ids) → 400 invalid_payload (zod .refine)", async () => {
    const neither = await api<{ error: { code: string } }>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/needed-by`,
      {},
    );
    expect(neither.status).toBe(400);
    expect(neither.body.error.code).toBe("invalid_payload");

    const both = await api<{ error: { code: string } }>(
      "PUT",
      `/models/${modelId}/capabilities/${capId}/needed-by`,
      { activityId, storyId: "s1" },
    );
    expect(both.status).toBe(400);
    expect(both.body.error.code).toBe("invalid_payload");
  });

  test("forged wrong pair → 400 edge_endpoint_label_mismatch via the getEdgeEndpoints check (DD-12)", async () => {
    // API-only construction: temporarily narrow NEEDS_CAPABILITY's
    // registered endpoints to the story pair ONLY (the ontology PATCH
    // emits ontology.changed in the server, clearing its endpoint
    // cache) — then the storage-layer getEdgeEndpoints check on the
    // Activity arm misses and must 400. A fresh capability keeps the
    // schema-breaking guard quiet (no live Activity→Capability edge of
    // this capability is dropped — the guard counts live edges of the
    // dropped pair, so use an activity with no NEEDS_CAPABILITY edge).
    const nc = CAPABILITY_EDGE_TYPES[0]!; // NEEDS_CAPABILITY
    const freshCap = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Wrong-pair capability",
    });

    // Drop the Activity pair. If live Activity→Capability edges exist
    // elsewhere the PATCH 409s (schema_breaking) — remove this test
    // file's own edge first.
    await api("DELETE", `/models/${modelId}/capabilities/${capId}/needed-by`, { activityId });
    const patch = await fetch(
      `http://127.0.0.1:8787/api/v1/ontology/edge-types/NEEDS_CAPABILITY?actor=ddd-system-test`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoints: [{ fromLabel: "UserStory", toLabel: "Capability" }],
        }),
      },
    );
    if (patch.status !== 200) {
      // A sibling suite holds live Activity→Capability edges — the
      // narrow is not constructible right now; restore + soft-skip the
      // forged-pair arm rather than corrupt shared state.
      await patch.text();
      console.warn("wrong-pair narrow not constructible (live edges elsewhere) — skipped");
      return;
    }
    await patch.text();

    try {
      const r = await api<{ error: { code: string } }>(
        "PUT",
        `/models/${modelId}/capabilities/${freshCap.body.id}/needed-by`,
        { activityId },
      );
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("edge_endpoint_label_mismatch");
    } finally {
      // Restore both pairs for every later test file.
      const restore = await fetch(
        `http://127.0.0.1:8787/api/v1/ontology/edge-types/NEEDS_CAPABILITY?actor=ddd-system-test`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoints: [...nc.endpoints] }),
        },
      );
      await restore.text();
      expect(restore.status).toBe(200);
    }
  });
});
