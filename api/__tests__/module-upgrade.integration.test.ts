import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";

// model-workspace-core T-09 / AC-07 — explicit upgrade: re-pin M≥N;
// downgrade needs allowDowngrade; missing → 404; forked → 409;
// publishing a new version never auto-upgrades.

interface InstanceRes {
  id: string;
  pinnedVersion: number;
  forked: boolean;
}
interface ErrRes {
  error: { code: string };
}

const cleanup = newCleanup();
let fx: JourneyFixture;
let moduleId: string;

async function newInstance(version?: number): Promise<InstanceRes> {
  const res = await api<InstanceRes>("POST", `/models/${fx.modelId}/module-instances`, {
    moduleId,
    ...(version !== undefined ? { version } : {}),
    targetDomainId: fx.domainId,
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe("integration: model-workspace-core AC-07 module upgrade", () => {
  beforeAll(async () => {
    fx = await buildModelWithJourney(cleanup, "upg");
    const mod = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: fx.modelId,
      sourceJourneyId: fx.journeyId,
      name: "upg-module",
    });
    moduleId = mod.body.id;
    await api("POST", `/modules/${moduleId}/versions`, {}); // v1
    await api("POST", `/modules/${moduleId}/versions`, {}); // v2
  });

  afterAll(async () => {
    await runCleanup(cleanup);
  });

  test("re-pin to a higher version updates pinnedVersion", async () => {
    const inst = await newInstance(1);
    expect(inst.pinnedVersion).toBe(1);
    const up = await api<InstanceRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/upgrade`,
      { toVersion: 2 },
    );
    expect(up.status).toBe(200);
    expect(up.body.pinnedVersion).toBe(2);
  });

  test("downgrade without allowDowngrade → 400 module_downgrade_not_allowed; with it → 200", async () => {
    const inst = await newInstance(2);
    const down = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/upgrade`,
      { toVersion: 1 },
    );
    expect(down.status).toBe(400);
    expect(down.body.error.code).toBe("module_downgrade_not_allowed");

    const forced = await api<InstanceRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/upgrade`,
      { toVersion: 1, allowDowngrade: true },
    );
    expect(forced.status).toBe(200);
    expect(forced.body.pinnedVersion).toBe(1);
  });

  test("missing toVersion → 404 module_version_not_found", async () => {
    const inst = await newInstance();
    const res = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/upgrade`,
      { toVersion: 999 },
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("module_version_not_found");
  });

  test("forked instance → 409 module_instance_forked (reconciliation deferred, Risk 3)", async () => {
    const inst = await newInstance(1);
    const fork = await api(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/fork`,
      undefined,
    );
    expect(fork.status).toBe(200);
    const res = await api<ErrRes>(
      "POST",
      `/models/${fx.modelId}/module-instances/${inst.id}/upgrade`,
      { toVersion: 2 },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("module_instance_forked");
  });

  test("publishing v(N+1) leaves existing instances pinned (no auto-upgrade)", async () => {
    const inst = await newInstance(1);
    await api("POST", `/modules/${moduleId}/versions`, {}); // publish v3
    const list = await api<InstanceRes[]>("GET", `/models/${fx.modelId}/module-instances`);
    expect(list.body.find((i) => i.id === inst.id)!.pinnedVersion).toBe(1);
  });
});
