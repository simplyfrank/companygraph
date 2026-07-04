import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { scopedNodeIds } from "../src/storage/model-scope";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";

// model-workspace-core T-04 + T-11 / AC-21 — two-part isolation proof
// (re-anchored per design C-01/D-1; NO ?model= query param exists):
//   (1) scopedNodeIds(modelA) excludes every B-only structural node.
//       Shared System/Role/Location are NOT model-scoped (DEC-01 (a)):
//       per design §4.2 they are excluded from the STRUCTURAL set but
//       stay reachable by any model's reads — asserted below.
//   (2) GET /models/:modelId/module-instances for model A returns only
//       A's instances/forked nodes, never B's.
// Fixture is API-only (B-02): both models' domains ride
// POST /models + POST /models/:id/domains — no direct-driver seeding.

const cleanup = newCleanup();
let a: JourneyFixture;
let b: JourneyFixture;
let moduleA: string;
let moduleB: string;
let instanceA: { id: string };
let instanceB: { id: string };

describe("integration: model-workspace-core AC-21 model-scope isolation", () => {
  beforeAll(async () => {
    a = await buildModelWithJourney(cleanup, "scopeA");
    b = await buildModelWithJourney(cleanup, "scopeB");

    // One instance per model, then fork B's so B also owns live forked nodes.
    const modA = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: a.modelId,
      sourceJourneyId: a.journeyId,
      name: "scopeA-module",
    });
    moduleA = modA.body.id;
    await api("POST", `/modules/${moduleA}/versions`, {});
    const modB = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: b.modelId,
      sourceJourneyId: b.journeyId,
      name: "scopeB-module",
    });
    moduleB = modB.body.id;
    await api("POST", `/modules/${moduleB}/versions`, {});

    instanceA = (
      await api<{ id: string }>("POST", `/models/${a.modelId}/module-instances`, {
        moduleId: moduleA,
        targetDomainId: a.domainId,
      })
    ).body;
    instanceB = (
      await api<{ id: string }>("POST", `/models/${b.modelId}/module-instances`, {
        moduleId: moduleB,
        targetDomainId: b.domainId,
      })
    ).body;
    await api("POST", `/models/${b.modelId}/module-instances/${instanceB.id}/fork`, undefined);
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("scopedNodeIds(modelA) includes A's structural set and excludes every B-only node (part 1)", async () => {
    const scope = await scopedNodeIds(getDriver(), a.modelId);
    // A's structural nodes are in.
    expect(scope.has(a.domainId)).toBe(true);
    expect(scope.has(a.journeyId)).toBe(true);
    expect(scope.has(a.activityIds[0])).toBe(true);
    expect(scope.has(a.activityIds[1])).toBe(true);
    expect(scope.has(instanceA.id)).toBe(true);
    // Every B-only node is out — domain, journey, activities, instance.
    expect(scope.has(b.domainId)).toBe(false);
    expect(scope.has(b.journeyId)).toBe(false);
    expect(scope.has(b.activityIds[0])).toBe(false);
    expect(scope.has(b.activityIds[1])).toBe(false);
    expect(scope.has(instanceB.id)).toBe(false);
    // Shared reference nodes are NOT model-scoped (DEC-01 (a), design
    // §4.2): excluded from the structural set of BOTH models…
    const scopeB = await scopedNodeIds(getDriver(), b.modelId);
    for (const shared of [a.systemId, a.roleId, a.locationId]) {
      expect(scope.has(shared)).toBe(false);
      expect(scopeB.has(shared)).toBe(false);
    }
    // …but reachable by any model's reads (generic read, no scoping).
    const sys = await fetch(`http://127.0.0.1:8787/api/v1/nodes/System/${a.systemId}`);
    expect(sys.status).toBe(200);
  });

  test("scopedNodeIds includes B's forked subtree nodes in B's scope only", async () => {
    const driver = getDriver();
    const session = driver.session({ defaultAccessMode: "READ" });
    let forkedIds: string[] = [];
    try {
      const r = await session.run(
        `MATCH (n) WHERE n.forkLocalKey STARTS WITH $prefix RETURN n.id AS id`,
        { prefix: `${instanceB.id}::` },
      );
      forkedIds = r.records.map((rec) => rec.get("id") as string);
    } finally {
      await session.close();
    }
    expect(forkedIds.length).toBeGreaterThanOrEqual(3); // journey + 2 activities
    const scopeA = await scopedNodeIds(driver, a.modelId);
    const scopeB = await scopedNodeIds(driver, b.modelId);
    for (const id of forkedIds) {
      expect(scopeB.has(id)).toBe(true); // PART_OF descent reaches the fork
      expect(scopeA.has(id)).toBe(false);
    }
  });

  test("GET /models/:modelId/module-instances returns only that model's instances (part 2)", async () => {
    const listA = await api<Array<{ id: string }>>("GET", `/models/${a.modelId}/module-instances`);
    const listB = await api<Array<{ id: string }>>("GET", `/models/${b.modelId}/module-instances`);
    expect(listA.status).toBe(200);
    expect(listB.status).toBe(200);
    expect(listA.body.map((i) => i.id)).toContain(instanceA.id);
    expect(listA.body.map((i) => i.id)).not.toContain(instanceB.id);
    expect(listB.body.map((i) => i.id)).toContain(instanceB.id);
    expect(listB.body.map((i) => i.id)).not.toContain(instanceA.id);
  });

  test("an instance addressed through the WRONG model's path never resolves", async () => {
    const res = await api<{ error: { code: string } }>(
      "POST",
      `/models/${a.modelId}/module-instances/${instanceB.id}/fork`,
      undefined,
    );
    expect(res.status).toBe(404);
  });
});
