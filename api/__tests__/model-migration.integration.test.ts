import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { migrateRetailToModel } from "../src/scripts/migrate-retail-to-model";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildModelWithJourney } from "./helpers/model-fixtures";

// model-workspace-core T-16 / AC-08 — retail → Business Model #1
// migration: idempotent apply, re-run-after-user-model (B-03), the
// rev-3 guard-abort case, reversible --down, side-effect-free
// --dry-run. Runs serially (bun test:integration --max-concurrency 1)
// and restores the applied state before finishing.

const cleanup = newCleanup();

async function counts(): Promise<{ nodes: number; edges: number; refModels: number; inModelToRef: number }> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (n)
       WITH count(n) AS nodes
       MATCH ()-[r]->()
       WITH nodes, count(r) AS edges
       RETURN nodes, edges,
         COUNT { MATCH (m:BusinessModel {isReference: true}) RETURN m } AS refModels,
         COUNT { MATCH (:Domain)-[x:IN_MODEL]->(:BusinessModel {isReference: true}) RETURN x } AS inModelToRef`,
    );
    const rec = r.records[0]!;
    return {
      nodes: rec.get("nodes") as number,
      edges: rec.get("edges") as number,
      refModels: rec.get("refModels") as number,
      inModelToRef: rec.get("inModelToRef") as number,
    };
  } finally {
    await session.close();
  }
}

describe("integration: model-workspace-core AC-08 retail migration", () => {
  beforeAll(async () => {
    // Clean up any leftover user models from prior test files — the
    // migration guard aborts if a user model exists but the reference
    // model doesn't (e.g. after a prior T-25 run did --down --force).
    const driver = getDriver();
    const session = driver.session();
    try {
      // Delete all non-reference BusinessModels + their subgraphs.
      await session.run(
        `MATCH (m:BusinessModel {isReference: false})
         OPTIONAL MATCH (m)<-[:IN_MODEL]-(d:Domain)
         DETACH DELETE m`,
      );
      // Also clean up any orphaned domains from prior test runs.
      await session.run(
        `MATCH (d:Domain) WHERE NOT (d)-[:IN_MODEL]->(:BusinessModel)
         DETACH DELETE d`,
      );
    } finally {
      await session.close();
    }
    // Now ensure the reference model exists.
    await migrateRetailToModel(driver, "apply").catch(() => {});
  });

  afterAll(async () => {
    // Leave the graph in the applied state whatever happened above.
    await migrateRetailToModel(getDriver(), "apply").catch(() => {});
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("apply is idempotent — a second run adds zero nodes/edges", async () => {
    const driver = getDriver();
    await migrateRetailToModel(driver, "apply"); // ensure applied
    const before = await counts();
    const rerun = await migrateRetailToModel(driver, "apply");
    expect(rerun.createdModel).toBe(false);
    expect(rerun.scopedDomains).toBe(0);
    const after = await counts();
    expect(after).toEqual(before);
  });

  test("re-run after a user (non-reference) model exists still succeeds and adds zero nodes/edges (B-03)", async () => {
    const user = await api<{ id: string }>("POST", "/models", { name: "migration-user-model" });
    expect(user.status).toBe(201);
    cleanup.modelIds.push(user.body.id);
    const before = await counts();
    const rerun = await migrateRetailToModel(getDriver(), "apply");
    expect(rerun.createdModel).toBe(false);
    expect(rerun.scopedDomains).toBe(0);
    expect(await counts()).toEqual(before);
  });

  test("--dry-run reports intended deltas and leaves counts unchanged", async () => {
    const before = await counts();
    const dry = await migrateRetailToModel(getDriver(), "dry-run");
    expect(dry.mode).toBe("dry-run");
    expect(await counts()).toEqual(before);
  });

  test("--down refuses without --force while a user model exists; forced --down spares the user model; guard-abort blocks re-apply; cleanup restores", async () => {
    const driver = getDriver();

    // Give the user model (created two tests up) a domain so "subgraph
    // + IN_MODEL edges intact" is a meaningful survival assertion
    // (requirements rev-4 C-10; design §8 AC-08).
    const userModelId = cleanup.modelIds[0]!;
    const dom = await api<{ id: string }>("POST", `/models/${userModelId}/domains`, {
      name: "migration-survivor-domain",
    });
    expect(dom.status).toBe(201);

    const before = await counts();
    expect(before.refModels).toBe(1);

    // REFUSAL GUARD (rev-4 C-10): a non-reference model exists →
    // --down without --force refuses and writes nothing.
    await expect(migrateRetailToModel(driver, "down")).rejects.toThrow(/--force/);
    expect(await counts()).toEqual(before);

    // Forced --down proceeds: only the reference root + its IN_MODEL
    // edges are removed.
    const down = await migrateRetailToModel(driver, "down", { force: true });
    expect(down.removedModels).toBe(1);
    const afterDown = await counts();
    // Exactly the reference root + its IN_MODEL edges are gone —
    // domains/journeys/activities untouched.
    expect(afterDown.nodes).toBe(before.nodes - 1);
    expect(afterDown.edges).toBe(before.edges - before.inModelToRef);
    expect(afterDown.refModels).toBe(0);

    // The second (non-reference) model survives the forced
    // down-migration with its IN_MODEL edge + subgraph intact
    // (rev-4 C-10; --down never runs an unqualified IN_MODEL sweep).
    const survivorSession = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await survivorSession.run(
        `MATCH (m:BusinessModel {id: $id})
         RETURN COUNT { MATCH (d:Domain)-[x:IN_MODEL]->(m) RETURN x } AS inModel,
                COUNT { MATCH (d:Domain {id: $domainId}) RETURN d } AS domain`,
        { id: userModelId, domainId: dom.body.id },
      );
      const rec = r.records[0]!;
      expect(rec.get("inModel") as number).toBe(1);
      expect(rec.get("domain") as number).toBe(1);
    } finally {
      await survivorSession.close();
    }

    // GUARD-ABORT (B-03): reference model absent AND a user model
    // present (created in the previous test) → apply aborts loudly and
    // writes nothing.
    const guardBefore = await counts();
    await expect(migrateRetailToModel(driver, "apply")).rejects.toThrow(/GUARD ABORT/);
    expect(await counts()).toEqual(guardBefore);

    // Remove the user model → apply proceeds and restores the scoping.
    for (const id of cleanup.modelIds.splice(0)) {
      await fetch(`http://127.0.0.1:8787/api/v1/models/${id}`, { method: "DELETE" });
    }
    const reapply = await migrateRetailToModel(driver, "apply");
    expect(reapply.createdModel).toBe(true);
    const restored = await counts();
    expect(restored.refModels).toBe(1);
    expect(restored.inModelToRef).toBeGreaterThanOrEqual(before.inModelToRef);
  });
});

// T-25 (design-review N-13) — forced --down orphaning warning.
describe("integration: model-workspace-core T-25 forced --down orphan warning", () => {
  beforeAll(async () => {
    // AC-08's afterAll ran closeDriver + _resetDriver — re-establish
    // the driver and ensure the reference model exists.
    await getDriver().verifyConnectivity();
    await migrateRetailToModel(getDriver(), "apply").catch(() => {});
  });

  test("stderr orphan-count warning appears when ModuleInstances exist, absent when none do", async () => {
    const driver = getDriver();

    // Ensure applied state.
    await migrateRetailToModel(driver, "apply").catch(() => {});

    // Build a model with a module instance so the orphan count > 0.
    // The module instance must be linked to the REFERENCE model (not a
    // user model) because the --down script only warns about instances
    // whose INSTANCE_IN edge points at the reference model.
    const fx = await buildModelWithJourney(cleanup, "orphan-warn");
    const mod = await api<{ id: string }>("POST", "/modules", {
      sourceModelId: fx.modelId,
      sourceJourneyId: fx.journeyId,
      name: "orphan-warn-module",
    });
    await api<{ id: string }>("POST", `/modules/${mod.body.id}/versions`, {});

    // Find the reference model and attach the module instance to it.
    const listRes = await api<{ id: string; isReference: boolean }[]>("GET", "/models");
    const refModel = listRes.body.find((m) => m.isReference);
    expect(refModel).toBeDefined();

    // Attach a domain to the reference model so we can target it.
    const refDom = await api<{ id: string }>("POST", `/models/${refModel!.id}/domains`, {
      name: "orphan-warn-ref-dom",
    });
    cleanup.nodeIds.push({ label: "Domain", id: refDom.body.id });

    const inst = await api<{ id: string }>("POST", `/models/${refModel!.id}/module-instances`, {
      moduleId: mod.body.id,
      targetDomainId: refDom.body.id,
    });
    expect(inst.status).toBe(201);

    // Spawn the script with --down --force and capture stderr.
    // The warning line should appear because a ModuleInstance exists.
    const proc1 = Bun.spawn(["bun", "run", "src/scripts/migrate-retail-to-model.ts", "--down", "--force"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode1] = await Promise.all([proc1.exited]);
    const stderr1 = await new Response(proc1.stderr).text();
    expect(exitCode1).toBe(0);
    expect(stderr1).toContain("WARNING:");
    expect(stderr1).toContain("ModuleInstance");
    expect(stderr1).toContain("orphaned");

    // Re-apply to restore the reference model (no user models now since
    // we'll clean up the user model first).
    // Delete the user model so re-apply works.
    await api("DELETE", `/models/${fx.modelId}`);
    cleanup.modelIds = cleanup.modelIds.filter((id) => id !== fx.modelId);
    await migrateRetailToModel(driver, "apply");

    // Now spawn --down --force again — no ModuleInstances exist → no warning.
    const proc2 = Bun.spawn(["bun", "run", "src/scripts/migrate-retail-to-model.ts", "--down", "--force"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode2] = await Promise.all([proc2.exited]);
    const stderr2 = await new Response(proc2.stderr).text();
    expect(exitCode2).toBe(0);
    expect(stderr2).not.toContain("WARNING:");

    // Restore applied state.
    await migrateRetailToModel(driver, "apply");
  });
});
