// ddd-system-modeling T-05 / AC-06 + AC-07 — support-gap analysis via
// GET /api/v1/models/:modelId/system-model/gaps. Fixture (design §9):
//   X — activity → capability → system            → unflagged
//   Y — USES_SYSTEM only (system S)               → capabilityGaps
//   Z — neither                                    → unsupportedSteps
//   W — supported ONLY via its describing story's
//       NEEDS_CAPABILITY (DD-15 / B-02)            → unflagged
//   C — capability with no system                  → capabilitiesWithoutSystem
//   S — used by Y, no capability of THIS model     → orphanSystems
// Cross-model (DD-18): model B mapping its own capability to S does NOT
// clear S from model A's orphans. Augmentation mix (AC-07):
// {functional:2, agentic:1, ai_predictive:1, unknown:0} — the fixture
// is ALL-VALID-KINDS (a kind-less System is not API-constructible on a
// booted stack, rev-2 tasks-review B-01; the `unknown` bucket is proven
// by the system-kind-bucketing UNIT test). API-only fixtures.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  createEdge,
  newCleanup,
  runCleanup,
  type Cleanup,
} from "./helpers/model-fixtures";
import {
  ensureCapabilitySchema,
  createCapabilityFixture,
  createStoryFixture,
} from "./helpers/capability-fixtures";
import type { GapsResult } from "@companygraph/shared/schema/ddd-system";

const cleanup: Cleanup = newCleanup();
let modelA: string;
let modelB: string;
let actX: string;
let actY: string;
let actZ: string;
let actW: string;
let capC: string;
let capM: string;
let sysS: string;
let storyZ: { id: string; name: string };
let storyY: { id: string; name: string };

async function gaps(modelId: string): Promise<GapsResult> {
  const r = await api<GapsResult>("GET", `/models/${modelId}/system-model/gaps`);
  expect(r.status).toBe(200);
  return r.body;
}

describe("integration: ddd-system-modeling AC-06/AC-07 support-gap analysis", () => {
  beforeAll(async () => {
    await ensureCapabilitySchema();

    const model = await api<{ id: string }>("POST", "/models", { name: "gap-model-A" });
    modelA = model.body.id;
    cleanup.modelIds.push(modelA);
    const domain = await api<{ id: string }>("POST", `/models/${modelA}/domains`, {
      name: "gap-domain-A",
    });
    const journey = await createNode(cleanup, "UserJourney", "gap-journey-A");
    await createEdge("PART_OF", journey, domain.body.id);

    actX = await createNode(cleanup, "Activity", "gap-act-X");
    actY = await createNode(cleanup, "Activity", "gap-act-Y");
    actZ = await createNode(cleanup, "Activity", "gap-act-Z");
    actW = await createNode(cleanup, "Activity", "gap-act-W");
    for (const a of [actX, actY, actZ, actW]) await createEdge("PART_OF", a, journey);

    // X — direct capability path.
    const sysX = await createNode(cleanup, "System", "gap-sys-X", { systemKind: "functional" });
    const capX = await createCapabilityFixture(modelA, "gap-cap-X");
    await api("PUT", `/models/${modelA}/capabilities/${capX.id}/needed-by`, { activityId: actX });
    await api("PUT", `/models/${modelA}/capabilities/${capX.id}/supported-by`, {
      systemId: sysX,
    });

    // Y — raw USES_SYSTEM to S only (S becomes the orphan system).
    sysS = await createNode(cleanup, "System", "gap-sys-S", { systemKind: "functional" });
    await createEdge("USES_SYSTEM", actY, sysS);
    storyY = await createStoryFixture(modelA, actY, "gap persona Y");

    // Z — nothing; a describing story so the item carries it.
    storyZ = await createStoryFixture(modelA, actZ, "gap persona Z");

    // W — supported ONLY via its describing story's NEEDS_CAPABILITY
    // (DD-15): story → capW → sysW; no direct activity edge, no
    // USES_SYSTEM.
    const storyW = await createStoryFixture(modelA, actW, "gap persona W");
    const sysW = await createNode(cleanup, "System", "gap-sys-W", { systemKind: "functional" });
    const capW = await createCapabilityFixture(modelA, "gap-cap-W");
    await api("PUT", `/models/${modelA}/capabilities/${capW.id}/needed-by`, {
      storyId: storyW.id,
    });
    await api("PUT", `/models/${modelA}/capabilities/${capW.id}/supported-by`, {
      systemId: sysW,
    });

    // C — capability with no system.
    const c = await createCapabilityFixture(modelA, "gap-cap-C-no-system");
    capC = c.id;

    // capM — the augmentation-mix capability: functional×2 + agentic +
    // ai_predictive (all valid kinds).
    const m = await createCapabilityFixture(modelA, "gap-cap-M-mix");
    capM = m.id;
    const mixSystems = [
      ["gap-sys-M1", "functional"],
      ["gap-sys-M2", "functional"],
      ["gap-sys-M3", "agentic"],
      ["gap-sys-M4", "ai_predictive"],
    ] as const;
    for (const [name, kind] of mixSystems) {
      const id = await createNode(cleanup, "System", name, { systemKind: kind });
      await api("PUT", `/models/${modelA}/capabilities/${capM}/supported-by`, { systemId: id });
    }

    // Model B — for the DD-18 cross-model orphan case.
    const b = await api<{ id: string }>("POST", "/models", { name: "gap-model-B" });
    modelB = b.body.id;
    cleanup.modelIds.push(modelB);
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("classification: Z unsupported, Y capabilityGap, C without system, S orphan, X and W unflagged (AC-06)", async () => {
    const g = await gaps(modelA);

    expect(g.unsupportedSteps.map((s) => s.activityId)).toContain(actZ);
    expect(g.capabilityGaps.map((s) => s.activityId)).toContain(actY);
    expect(g.capabilitiesWithoutSystem.map((c) => c.capabilityId)).toContain(capC);
    expect(g.orphanSystems.map((s) => s.systemId)).toContain(sysS);

    // X (direct arm) and W (story-mediated arm, DD-15) are NOT flagged.
    const flagged = [
      ...g.unsupportedSteps.map((s) => s.activityId),
      ...g.capabilityGaps.map((s) => s.activityId),
    ];
    expect(flagged).not.toContain(actX);
    expect(flagged).not.toContain(actW);
  });

  test("step items carry describingStories {id,name} (DD-15 — deep-linkable)", async () => {
    const g = await gaps(modelA);
    const z = g.unsupportedSteps.find((s) => s.activityId === actZ)!;
    expect(z.describingStories).toContainEqual({ id: storyZ.id, name: storyZ.name });
    const y = g.capabilityGaps.find((s) => s.activityId === actY)!;
    expect(y.describingStories).toContainEqual({ id: storyY.id, name: storyY.name });
  });

  test("cross-model orphan check is per-model (DD-18): model B mapping S does not clear model A's orphan", async () => {
    const capB = await createCapabilityFixture(modelB, "gap-cap-B");
    const sb = await api("PUT", `/models/${modelB}/capabilities/${capB.id}/supported-by`, {
      systemId: sysS,
    });
    expect(sb.status).toBe(200);

    const g = await gaps(modelA);
    expect(g.orphanSystems.map((s) => s.systemId)).toContain(sysS); // still A's orphan
  });

  test("augmentation mix: per-capability counts + shares + model roll-up via SYSTEM_KINDS (AC-07)", async () => {
    const g = await gaps(modelA);
    const mix = g.augmentationMix.perCapability.find((p) => p.capabilityId === capM)!;
    expect(mix.counts).toEqual({ functional: 2, agentic: 1, ai_predictive: 1, unknown: 0 });
    expect(mix.shares.functional).toBeCloseTo(0.5);
    expect(mix.shares.agentic).toBeCloseTo(0.25);
    expect(mix.shares.ai_predictive).toBeCloseTo(0.25);
    expect(mix.shares.unknown).toBe(0);

    // Model-level roll-up sums every model-A capability's counts:
    // capX(functional) + capW(functional) + capM(2f/1a/1p) + capC(0).
    expect(g.augmentationMix.model).toEqual({
      functional: 4,
      agentic: 1,
      ai_predictive: 1,
      unknown: 0,
    });
  });
});
