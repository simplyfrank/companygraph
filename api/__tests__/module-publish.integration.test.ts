import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
  UUIDV7,
} from "./helpers/model-fixtures";

// model-workspace-core T-06 / AC-04 — publish snapshots the journey
// subtree into an immutable BusinessModuleVersion: monotonic
// auto-increment, versions DESC, explicit-version collision → 409
// module_version_immutable (D-3/D-4), and canonical-serialization
// checksum determinism (re-publishing an unchanged subtree is
// checksum-identical).

interface VersionRes {
  id: string;
  moduleId: string;
  version: number;
  publishedAt: string;
  checksum: string;
  snapshot: {
    journey: { name: string };
    activities: Array<{ localKey: string; name: string }>;
    precedes: Array<{ from: string; to: string }>;
    roleRefs: Array<{ activityKey: string; roleId: string }>;
    systemRefs: Array<{ activityKey: string; systemId: string }>;
    locationRefs: Array<{ activityKey: string; locationId: string }>;
  };
}

const cleanup = newCleanup();
let fx: JourneyFixture;
let moduleId: string;

describe("integration: model-workspace-core AC-04 module publish", () => {
  beforeAll(async () => {
    fx = await buildModelWithJourney(cleanup, "pub");
    const mod = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: fx.modelId,
      sourceJourneyId: fx.journeyId,
      name: "pub-module",
    });
    expect(mod.status).toBe(201);
    moduleId = mod.body.id;
  });

  afterAll(async () => {
    await runCleanup(cleanup);
  });

  test("publish v1 — deterministic snapshot with localKey walk + shared refs verbatim", async () => {
    const { status, body } = await api<VersionRes>("POST", `/modules/${moduleId}/versions`, {});
    expect(status).toBe(201);
    expect(body.version).toBe(1);
    expect(body.id).toMatch(UUIDV7);
    expect(body.checksum).toMatch(/^[0-9a-f]{64}$/);
    // Topological PRECEDES walk: first activity gets a0.
    expect(body.snapshot.activities.map((a) => a.localKey)).toEqual(["a0", "a1"]);
    expect(body.snapshot.activities[0]!.name).toBe("pub-act-first");
    expect(body.snapshot.precedes).toEqual([{ from: "a0", to: "a1" }]);
    // Reference edges store the SHARED node id verbatim (DEC-01 (a)).
    expect(body.snapshot.roleRefs).toEqual([{ activityKey: "a0", roleId: fx.roleId }]);
    expect(body.snapshot.systemRefs).toEqual([{ activityKey: "a0", systemId: fx.systemId }]);
    expect(body.snapshot.locationRefs).toEqual([{ activityKey: "a1", locationId: fx.locationId }]);
  });

  test("re-publish auto-increments to v2 (not a mutation of v1) and an unchanged subtree is checksum-identical", async () => {
    const v1 = await api<VersionRes[]>("GET", `/modules/${moduleId}/versions`);
    const v1Row = v1.body.find((v) => v.version === 1)!;
    const { status, body: v2 } = await api<VersionRes>("POST", `/modules/${moduleId}/versions`, {});
    expect(status).toBe(201);
    expect(v2.version).toBe(2);
    expect(v2.id).not.toBe(v1Row.id);
    // Canonical serialization (C-04/N-05): unchanged subtree → identical checksum.
    expect(v2.checksum).toBe(v1Row.checksum);
    // v1 untouched.
    const after = await api<VersionRes[]>("GET", `/modules/${moduleId}/versions`);
    const v1After = after.body.find((v) => v.version === 1)!;
    expect(v1After.checksum).toBe(v1Row.checksum);
    expect(v1After.snapshot).toEqual(v1Row.snapshot);
  });

  test("versions list is version DESC", async () => {
    const { status, body } = await api<VersionRes[]>("GET", `/modules/${moduleId}/versions`);
    expect(status).toBe(200);
    const versions = body.map((v) => v.version);
    expect(versions).toEqual([...versions].sort((a, b) => b - a));
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  test("explicit-version publish of an existing version → 409 module_version_immutable (D-3/D-4)", async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      "POST",
      `/modules/${moduleId}/versions`,
      { version: 1 },
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("module_version_immutable");
  });

  test("explicit-version publish of a NEW version integer succeeds", async () => {
    const { status, body } = await api<VersionRes>("POST", `/modules/${moduleId}/versions`, {
      version: 10,
    });
    expect(status).toBe(201);
    expect(body.version).toBe(10);
  });

  test("publish on an absent module → 404 module_not_found", async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      "POST",
      "/modules/01900000-0000-7000-8000-00000000dead/versions",
      {},
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("module_not_found");
  });
});
