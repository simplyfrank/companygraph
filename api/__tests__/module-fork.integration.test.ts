import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
  UUIDV7,
} from "./helpers/model-fixtures";

// model-workspace-core T-08 + T-22 / AC-06 — copy-on-write fork through
// the model-scoped write routes, the instance-qualified forkLocalKey
// anchor (§3.4/B-02), the edge fork-trigger (B-01/B-03), the D-4
// lifecycle-guard reading, and the deleted-anchor hardening (C-01).

interface InstanceRes {
  id: string;
  pinnedVersion: number;
  forked: boolean;
  content: {
    journey: { id: string; name: string; forkLocalKey?: string } | null;
    activities: Array<{ id: string; name: string; description: string; forkLocalKey?: string }>;
    precedes: Array<{ from: string; to: string }>;
    systemRefs: Array<{ activityKey: string; systemId: string }>;
  };
}
interface ErrRes {
  error: { code: string };
}

const cleanup = newCleanup();
let fx: JourneyFixture;
let moduleId: string;
let versionId: string;
let versionChecksum: string;
let otherInstanceId: string; // second instance of the same version — must stay untouched

async function newInstance(): Promise<InstanceRes> {
  const res = await api<InstanceRes>("POST", `/models/${fx.modelId}/module-instances`, {
    moduleId,
    targetDomainId: fx.domainId,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function readInstance(id: string): Promise<InstanceRes> {
  const list = await api<InstanceRes[]>("GET", `/models/${fx.modelId}/module-instances`);
  const inst = list.body.find((i) => i.id === id);
  expect(inst).toBeDefined();
  return inst!;
}

describe("integration: model-workspace-core AC-06 module fork + instance edges", () => {
  beforeAll(async () => {
    fx = await buildModelWithJourney(cleanup, "fork");
    const mod = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: fx.modelId,
      sourceJourneyId: fx.journeyId,
      name: "fork-module",
    });
    moduleId = mod.body.id;
    const v = await api<{ id: string; checksum: string }>(
      "POST",
      `/modules/${moduleId}/versions`,
      {},
    );
    versionId = v.body.id;
    versionChecksum = v.body.checksum;
    otherInstanceId = (await newInstance()).id;
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("PATCH to a synthetic id forks: forked flips, FORKED_FROM set, instance-qualified forkLocalKey; other instance checksum-identical (§3.4 anchor)", async () => {
    const inst = await newInstance();
    // Non-forked read surfaces synthetic ids.
    expect(inst.content.activities[0]!.id).toBe(`${inst.id}::a0`);

    const patch = await api<{ id: string; description: string }>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${inst.id}::a0`,
      { description: "forked edit" },
    );
    expect(patch.status).toBe(200);
    expect(patch.body.id).toMatch(UUIDV7); // fresh live UUIDv7, not the source activity
    expect(patch.body.id).not.toBe(fx.activityIds[0]);
    expect(patch.body.description).toBe("forked edit");

    const after = await readInstance(inst.id);
    expect(after.forked).toBe(true);
    // Every materialized node carries the FULL instance-qualified synthetic id.
    expect(after.content.journey!.forkLocalKey).toBe(`${inst.id}::journey`);
    for (const a of after.content.activities) {
      expect(a.forkLocalKey!.startsWith(`${inst.id}::`)).toBe(true);
      expect(a.id).toMatch(UUIDV7);
    }

    // FORKED_FROM points at the pinned source version.
    const driver = getDriver();
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (mi:ModuleInstance {id: $id})-[:FORKED_FROM]->(v:BusinessModuleVersion)
         RETURN v.id AS vid`,
        { id: inst.id },
      );
      expect(r.records[0]?.get("vid")).toBe(versionId);
    } finally {
      await session.close();
    }

    // The shared version + the OTHER instance are untouched (checksum-identical).
    const versions = await api<Array<{ id: string; checksum: string }>>(
      "GET",
      `/modules/${moduleId}/versions`,
    );
    expect(versions.body.find((v) => v.id === versionId)!.checksum).toBe(versionChecksum);
    const other = await readInstance(otherInstanceId);
    expect(other.forked).toBe(false);
    expect(other.content.activities[0]!.description).not.toBe("forked edit");

    // 2nd edit via the SAME synthetic id resolves by direct forkLocalKey
    // match and stays local — no second fork, no new nodes.
    const countBefore = await countForkNodes(inst.id);
    const patch2 = await api<{ id: string }>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${inst.id}::a0`,
      { name: "renamed locally" },
    );
    expect(patch2.status).toBe(200);
    expect(patch2.body.id).toBe(patch.body.id); // same live node
    expect(await countForkNodes(inst.id)).toBe(countBefore);
  });

  test("two instances of one module under the same Domain fork into distinct, separately-addressable subtrees (B-02)", async () => {
    const i1 = await newInstance();
    const i2 = await newInstance();
    const p1 = await api<{ id: string }>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${i1.id}/nodes/${i1.id}::a0`,
      { description: "i1 edit" },
    );
    const p2 = await api<{ id: string }>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${i2.id}/nodes/${i2.id}::a0`,
      { description: "i2 edit" },
    );
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p1.body.id).not.toBe(p2.body.id); // distinct subtrees

    const r1 = await readInstance(i1.id);
    const r2 = await readInstance(i2.id);
    // Each instance's read returns only ITS own fork.
    expect(r1.content.activities.find((a) => a.forkLocalKey === `${i1.id}::a0`)!.description).toBe("i1 edit");
    expect(r2.content.activities.find((a) => a.forkLocalKey === `${i2.id}::a0`)!.description).toBe("i2 edit");
    const r1Ids = new Set(r1.content.activities.map((a) => a.id));
    for (const a of r2.content.activities) expect(r1Ids.has(a.id)).toBe(false);
  });

  test("non-member :nodeId → 404 module_instance_node_not_member; raw UUID on a non-forked instance is never a member", async () => {
    const inst = await newInstance();
    // Raw UUID (even the SOURCE activity's id) on a non-forked instance → 404.
    const raw = await api<ErrRes>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${fx.activityIds[0]}`,
      { description: "nope" },
    );
    expect(raw.status).toBe(404);
    expect(raw.body.error.code).toBe("module_instance_node_not_member");
    // Synthetic key not in the snapshot → 404.
    const badKey = await api<ErrRes>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${inst.id}::a99`,
      { description: "nope" },
    );
    expect(badKey.status).toBe(404);
    expect(badKey.body.error.code).toBe("module_instance_node_not_member");
    // Foreign instance prefix → 404.
    const foreign = await api<ErrRes>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${otherInstanceId}::a0`,
      { description: "nope" },
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("module_instance_node_not_member");
  });

  test("generic PATCH on a BusinessModuleVersion → 409 model_lifecycle_route_required (D-4 single reading)", async () => {
    const res = await api<ErrRes>("PATCH", `/nodes/BusinessModuleVersion/${versionId}`, {
      description: "smuggled snapshot edit",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("model_lifecycle_route_required");
  });

  test("edge fork-trigger (B-01/B-03): first edit as an EDGE edit forks; idempotent re-POST; DELETE 204 then 404", async () => {
    const inst = await newInstance();
    expect(inst.forked).toBe(false);

    // First edit is an edge edit → forks the instance and lands the
    // edge on the live copy.
    const post1 = await api<{ created: boolean; fromId: string; toId: string }>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/edges`,
      { type: "USES_SYSTEM", from: `${inst.id}::a1`, to: fx.systemId },
    );
    expect(post1.status).toBe(201);
    const after = await readInstance(inst.id);
    expect(after.forked).toBe(true);
    expect(
      after.content.systemRefs.some(
        (r) => r.systemId === fx.systemId && r.activityKey === post1.body.fromId,
      ),
    ).toBe(true);

    // Re-POST of the same (type, from, to) → 200 (idempotent MERGE).
    const post2 = await api<{ created: boolean }>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/edges`,
      { type: "USES_SYSTEM", from: `${inst.id}::a1`, to: fx.systemId },
    );
    expect(post2.status).toBe(200);

    // DELETE removes it → 204; absent → 404.
    const del1 = await api<null>("DELETE", `/models/${fx.modelId}/module-instances/${inst.id}/edges`, {
      type: "USES_SYSTEM",
      from: `${inst.id}::a1`,
      to: fx.systemId,
    });
    expect(del1.status).toBe(204);
    const del2 = await api<ErrRes>("DELETE", `/models/${fx.modelId}/module-instances/${inst.id}/edges`, {
      type: "USES_SYSTEM",
      from: `${inst.id}::a1`,
      to: fx.systemId,
    });
    expect(del2.status).toBe(404);
    expect(del2.body.error.code).toBe("not_found");
  });

  test("edge membership guards: non-member subtree endpoint → 404 member; lifecycle type → 400; wrong shared label → 400; missing shared → 404", async () => {
    const inst = await newInstance();
    const nonMember = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/edges`,
      { type: "USES_SYSTEM", from: fx.activityIds[0], to: fx.systemId }, // source activity ≠ member
    );
    expect(nonMember.status).toBe(404);
    expect(nonMember.body.error.code).toBe("module_instance_node_not_member");

    const lifecycle = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/edges`,
      { type: "IN_MODEL", from: `${inst.id}::a0`, to: fx.modelId },
    );
    expect(lifecycle.status).toBe(400);
    expect(lifecycle.body.error.code).toBe("invalid_payload"); // closed zod enum (T-01)

    const wrongLabel = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/edges`,
      { type: "USES_SYSTEM", from: `${inst.id}::a0`, to: fx.roleId }, // Role, not System
    );
    expect(wrongLabel.status).toBe(400);
    expect(wrongLabel.body.error.code).toBe("edge_endpoint_label_mismatch");

    const missingShared = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/edges`,
      {
        type: "USES_SYSTEM",
        from: `${inst.id}::a0`,
        to: "01900000-0000-7000-8000-00000000dead",
      },
    );
    expect(missingShared.status).toBe(404);
    expect(missingShared.body.error.code).toBe("not_found");
  });

  test("deleted-anchor hardening (C-01): generic-DELETE of the fork journey → empty content (no 500), writes → 404 member", async () => {
    const inst = await newInstance();
    // Fork it via a node edit.
    await api("PATCH", `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${inst.id}::a0`, {
      description: "about to lose my anchor",
    });
    const forked = await readInstance(inst.id);
    const liveJourneyId = forked.content.journey!.id;
    // UserJourney is NOT a lifecycle label — a node:write session can
    // generic-DELETE the materialized journey.
    const del = await fetch(
      `http://127.0.0.1:8787/api/v1/nodes/UserJourney/${liveJourneyId}?cascade=true`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(204);

    // Read: instance envelope with EMPTY content — never a 500.
    const after = await readInstance(inst.id);
    expect(after.forked).toBe(true);
    expect(after.content.journey).toBeNull();

    // Model-scoped write to any handle of such an instance → 404 member.
    const write = await api<ErrRes>(
      "PATCH",
      `/models/${fx.modelId}/module-instances/${inst.id}/nodes/${inst.id}::journey`,
      { description: "ghost write" },
    );
    expect(write.status).toBe(404);
    expect(write.body.error.code).toBe("module_instance_node_not_member");
  });
});

async function countForkNodes(instanceId: string): Promise<number> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (n) WHERE n.forkLocalKey STARTS WITH $prefix RETURN count(n) AS c`,
      { prefix: `${instanceId}::` },
    );
    return r.records[0]!.get("c") as number;
  } finally {
    await session.close();
  }
}
