// ddd-system-modeling T-10 / AC-06b + AC-09 (isolation half) —
// membership rides CAPABILITY_IN_MODEL (DD-02), never the
// NEEDS_CAPABILITY source: the binding map-then-orphan recipe (DD-16 +
// rev-3 N-02), two-model isolation, and the generic-node-surface
// degradation guard (rev-3 design-review C-01). API-only fixtures —
// the orphaning step deletes a PART_OF edge via the generic graph-core
// edge surface (a real route, not a driver write).

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
import {
  ensureCapabilitySchema,
  createCapabilityFixture,
} from "./helpers/capability-fixtures";
import { scopedNodeIds } from "../src/storage/model-scope";
import type { CapabilityRead, GapsResult } from "@companygraph/shared/schema/ddd-system";

const cleanup: Cleanup = newCleanup();
let modelA: string;
let modelB: string;
let capA: string; // model A's orphan-sourced capability
let capB: string;
let orphanActivity: string;
let partOfEdgeId: string;
let sharedSystem: string;

describe("integration: ddd-system-modeling AC-06b/AC-09 model isolation + orphan source", () => {
  beforeAll(async () => {
    await ensureCapabilitySchema();

    // Model A with the REAL scope chain (rev-3 N-02): journey PART_OF a
    // scoped domain, activity PART_OF the journey (Activity→Domain is
    // NOT a registered PART_OF pair; scopedNodeIds walks PART_OF* from
    // the domain).
    const a = await api<{ id: string }>("POST", "/models", { name: "scope-model-A" });
    modelA = a.body.id;
    cleanup.modelIds.push(modelA);
    const domainA = await api<{ id: string }>("POST", `/models/${modelA}/domains`, {
      name: "scope-domain-A",
    });
    const journeyA = await createNode(cleanup, "UserJourney", "scope-journey-A");
    await createEdge("PART_OF", journeyA, domainA.body.id);
    orphanActivity = await createNode(cleanup, "Activity", "scope-orphan-activity");
    // Capture the edge id — the orphaning step DELETEs exactly this
    // edge through the generic route.
    const edge = await api<{ id: string }>("POST", "/edges", {
      type: "PART_OF",
      fromId: orphanActivity,
      toId: journeyA,
    });
    expect(edge.status).toBe(201);
    partOfEdgeId = edge.body.id;

    // Model B with its own capability.
    const b = await api<{ id: string }>("POST", "/models", { name: "scope-model-B" });
    modelB = b.body.id;
    cleanup.modelIds.push(modelB);
    capB = (await createCapabilityFixture(modelB, "scope-cap-B")).id;

    sharedSystem = await createNode(cleanup, "System", "scope-shared-system", {
      systemKind: "functional",
    });
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("AC-06b map-then-orphan: the capability survives orphaning its only needed-by source", async () => {
    // (2) capability via POST — gets CAPABILITY_IN_MODEL.
    capA = (await createCapabilityFixture(modelA, "scope-cap-A")).id;

    // (3) map while the activity is scoped.
    const put = await api("PUT", `/models/${modelA}/capabilities/${capA}/needed-by`, {
      activityId: orphanActivity,
    });
    expect(put.status).toBe(200);

    // (4) ORPHAN the activity: DELETE the Activity→UserJourney PART_OF
    // edge via the generic graph-core edge surface (a real route).
    const del = await api("DELETE", `/edges/${partOfEdgeId}`);
    expect(del.status).toBe(204);
    const scoped = await scopedNodeIds(getDriver(), modelA);
    expect(scoped.has(orphanActivity)).toBe(false); // truly orphaned

    // (5a) the capability STILL lists (membership rides
    // CAPABILITY_IN_MODEL, not source-in-scopedNodeIds).
    const list = await api<CapabilityRead[]>("GET", `/models/${modelA}/capabilities`);
    expect(list.status).toBe(200);
    expect(list.body.map((c) => c.id)).toContain(capA);

    // (5b) …and still appears in the gap analysis (no SUPPORTED_BY →
    // capabilitiesWithoutSystem; also present in the mix rows).
    const gaps = await api<GapsResult>("GET", `/models/${modelA}/system-model/gaps`);
    expect(gaps.status).toBe(200);
    expect(gaps.body.capabilitiesWithoutSystem.map((c) => c.capabilityId)).toContain(capA);
    expect(gaps.body.augmentationMix.perCapability.map((p) => p.capabilityId)).toContain(capA);

    // (5c) a FRESH mapping against the now-orphan activity is rejected
    // (DD-16's strict arm).
    const fresh = await createCapabilityFixture(modelA, "scope-cap-A-fresh");
    const rejected = await api<{ error: { code: string } }>(
      "PUT",
      `/models/${modelA}/capabilities/${fresh.id}/needed-by`,
      { activityId: orphanActivity },
    );
    expect(rejected.status).toBe(404);
    expect(rejected.body.error.code).toBe("not_found");
  });

  test("AC-09 isolation: each model's list + gaps exclude the other model's capabilities", async () => {
    const listA = await api<CapabilityRead[]>("GET", `/models/${modelA}/capabilities`);
    const listB = await api<CapabilityRead[]>("GET", `/models/${modelB}/capabilities`);
    expect(listA.body.map((c) => c.id)).not.toContain(capB);
    expect(listB.body.map((c) => c.id)).not.toContain(capA);
    expect(listB.body.map((c) => c.id)).toContain(capB);

    const gapsA = await api<GapsResult>("GET", `/models/${modelA}/system-model/gaps`);
    const gapsB = await api<GapsResult>("GET", `/models/${modelB}/system-model/gaps`);
    expect(gapsA.body.augmentationMix.perCapability.map((p) => p.capabilityId)).not.toContain(
      capB,
    );
    expect(gapsB.body.augmentationMix.perCapability.map((p) => p.capabilityId)).not.toContain(
      capA,
    );
  });

  test("a capability id is NOT itself in scopedNodeIds (DD-02)", async () => {
    const scoped = await scopedNodeIds(getDriver(), modelA);
    expect(scoped.has(capA)).toBe(false);
  });

  test("a shared System may appear in both models' analyses (systems are global)", async () => {
    const sbA = await api("PUT", `/models/${modelA}/capabilities/${capA}/supported-by`, {
      systemId: sharedSystem,
    });
    expect(sbA.status).toBe(200);
    const sbB = await api("PUT", `/models/${modelB}/capabilities/${capB}/supported-by`, {
      systemId: sharedSystem,
    });
    expect(sbB.status).toBe(200);

    const detailA = await api<CapabilityRead>("GET", `/models/${modelA}/capabilities/${capA}`);
    const detailB = await api<CapabilityRead>("GET", `/models/${modelB}/capabilities/${capB}`);
    expect(detailA.body.supportedBy!.map((s) => s.id)).toContain(sharedSystem);
    expect(detailB.body.supportedBy!.map((s) => s.id)).toContain(sharedSystem);
  });

  test("generic-node-surface degradation (rev-3 C-01): POST /nodes/Capability is membership-less and invisible to every model", async () => {
    // The generic surface opens post-registration (accepted risk,
    // carry-forward table) — the created node carries ZERO
    // CAPABILITY_IN_MODEL edges…
    const r = await api<{ id: string }>("POST", "/nodes/Capability", {
      name: "generic-surface-capability",
    });
    expect(r.status).toBe(201);
    cleanup.nodeIds.push({ label: "Capability", id: r.body.id });

    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const c = await session.run(
        `MATCH (:Capability {id: $id})-[r:CAPABILITY_IN_MODEL]->() RETURN count(r) AS c`,
        { id: r.body.id },
      );
      expect(Number(c.records[0]!.get("c"))).toBe(0);
    } finally {
      await session.close();
    }

    // …and appears in NEITHER model's list nor gaps (benign, invisible).
    for (const modelId of [modelA, modelB]) {
      const list = await api<CapabilityRead[]>("GET", `/models/${modelId}/capabilities`);
      expect(list.body.map((c) => c.id)).not.toContain(r.body.id);
      const gaps = await api<GapsResult>("GET", `/models/${modelId}/system-model/gaps`);
      expect(gaps.body.augmentationMix.perCapability.map((p) => p.capabilityId)).not.toContain(
        r.body.id,
      );
      expect(gaps.body.capabilitiesWithoutSystem.map((c) => c.capabilityId)).not.toContain(
        r.body.id,
      );
    }
  });
});
