import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";

// model-workspace-core T-07 / AC-05 — instantiate per model with the
// REQUIRED targetDomainId (D-2); two models instantiating the same
// version read identical content MODULO THE PROJECTED HANDLES (design
// N-12 / review C-02 — each virtual node's id is
// `<instanceId>::<localKey>`, so ids differ by construction; names,
// descriptions, attributes and precedes/ref STRUCTURE are equal);
// neither read-path mutates the shared version.

interface InstanceRes {
  id: string;
  moduleId: string;
  pinnedVersion: number;
  forked: boolean;
  targetDomainId: string;
  content: {
    journey: { id: string; name: string; description: string } | null;
    activities: Array<{ id: string; name: string; description: string; attributes: Record<string, unknown> }>;
    precedes: Array<{ from: string; to: string }>;
    roleRefs: Array<{ activityKey: string; roleId: string }>;
    systemRefs: Array<{ activityKey: string; systemId: string }>;
    locationRefs: Array<{ activityKey: string; locationId: string }>;
  };
}
interface ErrRes {
  error: { code: string; details?: Record<string, unknown> };
}

const cleanup = newCleanup();
let fx: JourneyFixture; // model A — module source
let modelB: { id: string; domainId: string };
let moduleId: string;
let versionChecksum: string;

// Strips the `<instanceId>::` prefix so content from two instances can
// be compared structurally.
function normalized(inst: InstanceRes) {
  const strip = (s: string) => s.slice(s.indexOf("::") + 2);
  return {
    journey: inst.content.journey && {
      name: inst.content.journey.name,
      description: inst.content.journey.description,
    },
    activities: inst.content.activities.map((a) => ({
      key: strip(a.id),
      name: a.name,
      description: a.description,
      attributes: a.attributes,
    })),
    precedes: inst.content.precedes.map((p) => ({ from: strip(p.from), to: strip(p.to) })),
    roleRefs: inst.content.roleRefs.map((r) => ({ key: strip(r.activityKey), roleId: r.roleId })),
    systemRefs: inst.content.systemRefs.map((r) => ({ key: strip(r.activityKey), systemId: r.systemId })),
    locationRefs: inst.content.locationRefs.map((r) => ({ key: strip(r.activityKey), locationId: r.locationId })),
  };
}

describe("integration: model-workspace-core AC-05 module instantiate", () => {
  beforeAll(async () => {
    fx = await buildModelWithJourney(cleanup, "inst");
    const mod = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: fx.modelId,
      sourceJourneyId: fx.journeyId,
      name: "inst-module",
    });
    moduleId = mod.body.id;
    const v = await api<{ checksum: string }>("POST", `/modules/${moduleId}/versions`, {});
    versionChecksum = v.body.checksum;

    // Model B set up API-only through POST /models + POST /models/:id/domains
    // (design §8, review B-02 — no direct-driver seeding).
    const b = await api<{ id: string }>("POST", "/models", { name: "inst-model-b" });
    cleanup.modelIds.push(b.body.id);
    const bDom = await api<{ id: string }>("POST", `/models/${b.body.id}/domains`, {
      name: "inst-model-b-domain",
    });
    modelB = { id: b.body.id, domainId: bDom.body.id };
  });

  afterAll(async () => {
    await runCleanup(cleanup);
  });

  test("instantiate requires targetDomainId (D-2) — missing → 400", async () => {
    const { status, body } = await api<ErrRes>("POST", `/models/${fx.modelId}/module-instances`, {
      moduleId,
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_payload");
  });

  test("foreign targetDomainId (not IN_MODEL the routed model) → 400", async () => {
    const { status, body } = await api<ErrRes>("POST", `/models/${fx.modelId}/module-instances`, {
      moduleId,
      targetDomainId: modelB.domainId, // model B's domain used against model A
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_payload");
  });

  test("two models instantiate the same version and read identical content modulo handles (AC-05)", async () => {
    const a = await api<InstanceRes>("POST", `/models/${fx.modelId}/module-instances`, {
      moduleId,
      targetDomainId: fx.domainId,
    });
    expect(a.status).toBe(201);
    const b = await api<InstanceRes>("POST", `/models/${modelB.id}/module-instances`, {
      moduleId,
      targetDomainId: modelB.domainId,
    });
    expect(b.status).toBe(201);

    expect(a.body.forked).toBe(false);
    expect(b.body.forked).toBe(false);
    expect(a.body.pinnedVersion).toBe(b.body.pinnedVersion);

    // Non-forked read surfaces synthetic content ids anchored on each OWN instance.
    expect(a.body.content.journey!.id).toBe(`${a.body.id}::journey`);
    expect(b.body.content.journey!.id).toBe(`${b.body.id}::journey`);
    // Ids differ by construction; STRUCTURE is identical (C-02/N-12).
    expect(normalized(a.body)).toEqual(normalized(b.body));

    // Neither read-path mutated the shared version.
    const versions = await api<Array<{ version: number; checksum: string }>>(
      "GET",
      `/modules/${moduleId}/versions`,
    );
    expect(versions.body.find((v) => v.version === a.body.pinnedVersion)!.checksum).toBe(
      versionChecksum,
    );
  });

  test("instance list is scoped by the :modelId path param (no ?model= anywhere, D-1)", async () => {
    const aList = await api<InstanceRes[]>("GET", `/models/${fx.modelId}/module-instances`);
    const bList = await api<InstanceRes[]>("GET", `/models/${modelB.id}/module-instances`);
    expect(aList.status).toBe(200);
    expect(bList.status).toBe(200);
    const aIds = aList.body.map((i) => i.id);
    const bIds = bList.body.map((i) => i.id);
    expect(aIds.some((id) => bIds.includes(id))).toBe(false);
    expect(aIds.length).toBeGreaterThanOrEqual(1);
    expect(bIds.length).toBeGreaterThanOrEqual(1);
  });

  test("unknown module / version → 404 named codes", async () => {
    const noMod = await api<ErrRes>("POST", `/models/${fx.modelId}/module-instances`, {
      moduleId: "01900000-0000-7000-8000-00000000dead",
      targetDomainId: fx.domainId,
    });
    expect(noMod.status).toBe(404);
    expect(noMod.body.error.code).toBe("module_not_found");

    const noVer = await api<ErrRes>("POST", `/models/${fx.modelId}/module-instances`, {
      moduleId,
      version: 999,
      targetDomainId: fx.domainId,
    });
    expect(noVer.status).toBe(404);
    expect(noVer.body.error.code).toBe("module_version_not_found");
  });
});
