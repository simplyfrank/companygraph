// ddd-system-modeling T-04 / AC-03 — capability CRUD through the real
// routes. API-only fixtures (design §9) except the ONE sanctioned
// direct-driver write: the `REMOVE n:BoundedContext` that constructs
// the detached state (DD-13, sanctioned op #1).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  createEdge,
  newCleanup,
  runCleanup,
  UUIDV7,
  type Cleanup,
} from "./helpers/model-fixtures";
import { ensureCapabilitySchema, createStoryFixture } from "./helpers/capability-fixtures";
import type { CapabilityRead } from "@companygraph/shared/schema/ddd-system";

const cleanup: Cleanup = newCleanup();
let modelId: string;
let domainId: string;
let journeyId: string;
let activityId: string;
let systemId: string;

describe("integration: ddd-system-modeling AC-03 capability CRUD", () => {
  beforeAll(async () => {
    await ensureCapabilitySchema();
    const model = await api<{ id: string }>("POST", "/models", { name: "cap-crud-model" });
    expect(model.status).toBe(201);
    modelId = model.body.id;
    cleanup.modelIds.push(modelId);

    const domain = await api<{ id: string }>("POST", `/models/${modelId}/domains`, {
      name: "cap-crud-domain",
    });
    expect(domain.status).toBe(201);
    domainId = domain.body.id;

    journeyId = await createNode(cleanup, "UserJourney", "cap-crud-journey");
    await createEdge("PART_OF", journeyId, domainId);
    activityId = await createNode(cleanup, "Activity", "cap-crud-activity");
    await createEdge("PART_OF", activityId, journeyId);
    systemId = await createNode(cleanup, "System", "cap-crud-system", {
      systemKind: "agentic",
    });
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("create → 201 + UUIDv7 + CAPABILITY_IN_MODEL edge even with no mapping", async () => {
    const r = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Standalone capability",
      description: "no mapping yet",
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(UUIDV7);
    expect(r.body.name).toBe("Standalone capability");
    expect(r.body.neededByCount).toBe(0);
    expect(r.body.supportingSystemCount).toBe(0);
    expect(r.body.assignedContext).toBeNull();
    expect(r.body.detached).toEqual([]);

    // Membership edge written atomically in the create tx (read-only
    // driver check — not a fixture write).
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const res = await session.run(
        `MATCH (:Capability {id: $id})-[r:CAPABILITY_IN_MODEL]->(m:BusinessModel {id: $modelId})
         RETURN count(r) AS c`,
        { id: r.body.id, modelId },
      );
      expect(Number(res.records[0]!.get("c"))).toBe(1);
    } finally {
      await session.close();
    }
  });

  test("pinned asymmetry: create on unknown model → 404 model_not_found; list on the same unknown model → 200 []", async () => {
    const bogus = "01900000-0000-7000-8000-00000000dead";
    const create = await api<{ error: { code: string } }>(
      "POST",
      `/models/${bogus}/capabilities`,
      { name: "nope" },
    );
    expect(create.status).toBe(404);
    expect(create.body.error.code).toBe("model_not_found");

    const list = await api<CapabilityRead[]>("GET", `/models/${bogus}/capabilities`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });

  test("list is model-scoped and carries counts; detail embeds mappings w/ systemKind + context", async () => {
    const cap = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Mapped capability",
    });
    expect(cap.status).toBe(201);
    const capId = cap.body.id;

    // Wire all three mapping kinds through the real routes.
    const nb = await api("PUT", `/models/${modelId}/capabilities/${capId}/needed-by`, {
      activityId,
    });
    expect(nb.status).toBe(200);
    const story = await createStoryFixture(modelId, activityId, "crud tester");
    const nbs = await api("PUT", `/models/${modelId}/capabilities/${capId}/needed-by`, {
      storyId: story.id,
    });
    expect(nbs.status).toBe(200);
    const sb = await api("PUT", `/models/${modelId}/capabilities/${capId}/supported-by`, {
      systemId,
    });
    expect(sb.status).toBe(200);
    const bcId = await createNode(cleanup, "BoundedContext", "cap-crud-context");
    const cx = await api("PUT", `/models/${modelId}/capabilities/${capId}/context`, {
      boundedContextId: bcId,
    });
    expect(cx.status).toBe(200);

    const list = await api<CapabilityRead[]>("GET", `/models/${modelId}/capabilities`);
    expect(list.status).toBe(200);
    const row = list.body.find((c) => c.id === capId)!;
    expect(row).toBeDefined();
    expect(row.neededByCount).toBe(2);
    expect(row.supportingSystemCount).toBe(1);
    expect(row.assignedContextId).toBe(bcId);
    expect(row.assignedContextName).toBe("cap-crud-context");

    const detail = await api<CapabilityRead>(
      "GET",
      `/models/${modelId}/capabilities/${capId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.neededBy).toContainEqual({
      kind: "activity",
      id: activityId,
      name: "cap-crud-activity",
    });
    expect(detail.body.neededBy).toContainEqual({
      kind: "story",
      id: story.id,
      name: story.name,
    });
    expect(detail.body.supportedBy).toEqual([
      { id: systemId, name: "cap-crud-system", systemKind: "agentic" },
    ]);
    expect(detail.body.assignedContext?.id).toBe(bcId);
    expect(detail.body.detached).toEqual([]);
  });

  test("PATCH preserves omitted fields; cross-model / unknown capability → 404 capability_not_found", async () => {
    const cap = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Patch target",
      description: "keep me",
      attributes: { tier: "core" },
    });
    const capId = cap.body.id;

    const patched = await api<CapabilityRead>(
      "PATCH",
      `/models/${modelId}/capabilities/${capId}`,
      { name: "Patched name" },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Patched name");
    expect(patched.body.description).toBe("keep me"); // omitted → untouched
    expect(patched.body.attributes).toEqual({ tier: "core" });

    // A capability of ANOTHER model is not found under this path.
    const otherModel = await api<{ id: string }>("POST", "/models", { name: "cap-crud-other" });
    cleanup.modelIds.push(otherModel.body.id);
    const foreign = await api<{ error: { code: string } }>(
      "GET",
      `/models/${otherModel.body.id}/capabilities/${capId}`,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("capability_not_found");
  });

  test("DELETE → 204 and the capability is gone", async () => {
    const cap = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Delete target",
    });
    const del = await api("DELETE", `/models/${modelId}/capabilities/${cap.body.id}`);
    expect(del.status).toBe(204);
    const gone = await api("GET", `/models/${modelId}/capabilities/${cap.body.id}`);
    expect(gone.status).toBe(404);
  });

  test("detached fixture (DD-13): REMOVE :BoundedContext on the assigned context → detached[] non-empty", async () => {
    const cap = await api<CapabilityRead>("POST", `/models/${modelId}/capabilities`, {
      name: "Detach target",
    });
    const capId = cap.body.id;
    const bcId = await createNode(cleanup, "BoundedContext", "cap-crud-detach-context");
    const cx = await api("PUT", `/models/${modelId}/capabilities/${capId}/context`, {
      boundedContextId: bcId,
    });
    expect(cx.status).toBe(200);

    // Sanctioned direct-driver test write #1 (design §9 / DD-13): the
    // label REMOVE that constructs the expected-label-mismatch state —
    // unconstructible through any route (a relationship never outlives
    // its endpoints, so a truly dangling edge cannot exist).
    const session = getDriver().session();
    try {
      await session.run(`MATCH (n:BoundedContext {id: $id}) REMOVE n:BoundedContext`, {
        id: bcId,
      });
    } finally {
      await session.close();
    }

    const detail = await api<CapabilityRead>(
      "GET",
      `/models/${modelId}/capabilities/${capId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.detached!.length).toBeGreaterThan(0);
    expect(detail.body.detached).toContainEqual({ kind: "context", targetId: bcId });
    // The well-formed context embed is gone (the label no longer matches).
    expect(detail.body.assignedContext).toBeNull();
  });
});
