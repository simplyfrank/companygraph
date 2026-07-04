import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { createEdge } from "../src/storage/edges";
import { ValidationError } from "../src/errors";
import { generateId } from "../src/ids";

// model-workspace-core T-03 / AC-02 — the five lifecycle edge types are
// enforceable via the registry-backed endpoint validator: the registered
// (from,to) pair passes, a wrong pair fails 400
// edge_endpoint_label_mismatch. Exercised at the storage layer because
// the generic /api/v1/edges route additionally rejects lifecycle edge
// TYPES outright (T-10 guard, 409 model_lifecycle_route_required) — the
// validator behaviour under test here sits beneath that guard.

describe("integration: model-workspace-core AC-02 lifecycle edge endpoints", () => {
  const driver = getDriver();
  const cleanupIds: string[] = [];

  afterAll(async () => {
    const session = driver.session();
    try {
      await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, {
        ids: cleanupIds,
      });
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  async function seedNode(label: string, name: string): Promise<string> {
    const id = generateId();
    cleanupIds.push(id);
    const now = new Date().toISOString();
    const session = driver.session();
    try {
      await session.run(
        `CREATE (n:\`${label}\` {id:$id, name:$name, description:"", createdAt:$now, updatedAt:$now, attributes_json:"{}"})`,
        { id, name, now },
      );
    } finally {
      await session.close();
    }
    return id;
  }

  test("IN_MODEL Domain→BusinessModel passes the registry validator", async () => {
    const domainId = await seedNode("Domain", "edge-test-domain");
    const modelId = await seedNode("BusinessModel", "edge-test-model");
    const edge = await createEdge(driver, {
      type: "IN_MODEL",
      fromId: domainId,
      toId: modelId,
      attributes: {},
    });
    expect(edge.type).toBe("IN_MODEL");
  });

  test("wrong endpoint pair → edge_endpoint_label_mismatch (400)", async () => {
    const journeyId = await seedNode("UserJourney", "edge-test-journey");
    const modelId = await seedNode("BusinessModel", "edge-test-model-2");
    let caught: ValidationError | null = null;
    try {
      await createEdge(driver, {
        type: "IN_MODEL",
        fromId: journeyId, // UserJourney is not a registered from-label
        toId: modelId,
        attributes: {},
      });
    } catch (e) {
      caught = e as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught!.code).toBe("edge_endpoint_label_mismatch");
    expect(caught!.httpStatus).toBe(400);
  });

  test("remaining lifecycle pairs validate (HAS_VERSION, INSTANTIATES, INSTANCE_IN, FORKED_FROM)", async () => {
    const moduleId = await seedNode("BusinessModule", "edge-test-module");
    const versionId = await seedNode("BusinessModuleVersion", "edge-test-version");
    const instanceId = await seedNode("ModuleInstance", "edge-test-instance");
    const modelId = await seedNode("BusinessModel", "edge-test-model-3");

    const pairs: Array<{ type: string; fromId: string; toId: string }> = [
      { type: "HAS_VERSION", fromId: moduleId, toId: versionId },
      { type: "INSTANTIATES", fromId: instanceId, toId: versionId },
      { type: "INSTANCE_IN", fromId: instanceId, toId: modelId },
      { type: "FORKED_FROM", fromId: instanceId, toId: versionId },
    ];
    for (const p of pairs) {
      const edge = await createEdge(driver, { ...p, attributes: {} });
      expect(edge.type).toBe(p.type);
    }
  });
});
