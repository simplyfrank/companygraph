// ddd-system-modeling T-06 / AC-08 — context map via
// GET /api/v1/models/:modelId/system-model/context-map. Assign two
// model-scoped capabilities to "BC1 Product Catalogue", one to "BC4
// Pricing & Markdown", leave one unassigned; the map groups under
// BC1/BC4 (each with its existing domain/subdomain), inter-context
// UPSTREAM_OF/DOWNSTREAM_OF relationships carry the far context's ID
// (DD-07 — not the bounded-contexts route's name-only shape), the
// unassigned bucket holds the fourth; and NO BoundedContext /
// relationship was created or mutated (NFR-04).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup, type Cleanup } from "./helpers/model-fixtures";
import {
  ensureCapabilitySchema,
  createCapabilityFixture,
} from "./helpers/capability-fixtures";
import type { ContextMapResult } from "@companygraph/shared/schema/ddd-system";

const cleanup: Cleanup = newCleanup();
let modelId: string;
let bc1: { id: string; name: string; domain: string; subdomain: string };
let bc4: { id: string; name: string; domain: string; subdomain: string };
let capA: string;
let capB: string;
let capD: string;
let capUnassigned: string;
let bcCountBefore = 0;
let relCountBefore = 0;

async function bcSnapshot(): Promise<{ contexts: number; relationships: number }> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const c = await session.run(`MATCH (bc:BoundedContext) RETURN count(bc) AS c`);
    const r = await session.run(
      `MATCH (:BoundedContext)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(:BoundedContext) RETURN count(r) AS c`,
    );
    return {
      contexts: Number(c.records[0]!.get("c")),
      relationships: Number(r.records[0]!.get("c")),
    };
  } finally {
    await session.close();
  }
}

describe("integration: ddd-system-modeling AC-08 context map", () => {
  beforeAll(async () => {
    await ensureCapabilitySchema();

    // Resolve the seeded contexts through the EXISTING read surface.
    const contexts = await api<
      Array<{ id: string; name: string; domain: string; subdomain: string }>
    >("GET", "/ontology/bounded-contexts");
    expect(contexts.status).toBe(200);
    bc1 = contexts.body.find((c) => c.name === "BC1 Product Catalogue")!;
    bc4 = contexts.body.find((c) => c.name === "BC4 Pricing & Markdown")!;
    expect(bc1).toBeDefined();
    expect(bc4).toBeDefined();

    const before = await bcSnapshot();
    bcCountBefore = before.contexts;
    relCountBefore = before.relationships;

    const model = await api<{ id: string }>("POST", "/models", { name: "ctx-map-model" });
    modelId = model.body.id;
    cleanup.modelIds.push(modelId);

    capA = (await createCapabilityFixture(modelId, "ctx-cap-A")).id;
    capB = (await createCapabilityFixture(modelId, "ctx-cap-B")).id;
    capD = (await createCapabilityFixture(modelId, "ctx-cap-D")).id;
    capUnassigned = (await createCapabilityFixture(modelId, "ctx-cap-unassigned")).id;

    for (const [cap, bc] of [
      [capA, bc1.id],
      [capB, bc1.id],
      [capD, bc4.id],
    ] as const) {
      const r = await api("PUT", `/models/${modelId}/capabilities/${cap}/context`, {
        boundedContextId: bc,
      });
      expect(r.status).toBe(200);
    }
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("groups capabilities under BC1/BC4 with domain/subdomain; unassigned bucket holds the fourth", async () => {
    const r = await api<ContextMapResult>("GET", `/models/${modelId}/system-model/context-map`);
    expect(r.status).toBe(200);

    const c1 = r.body.contexts.find((c) => c.id === bc1.id)!;
    expect(c1).toBeDefined();
    expect(c1.domain).toBe(bc1.domain);
    expect(c1.subdomain).toBe(bc1.subdomain);
    expect(c1.capabilities.map((c) => c.id).sort()).toEqual([capA, capB].sort());

    const c4 = r.body.contexts.find((c) => c.id === bc4.id)!;
    expect(c4).toBeDefined();
    expect(c4.capabilities.map((c) => c.id)).toEqual([capD]);

    expect(r.body.unassigned.map((c) => c.id)).toContain(capUnassigned);
    expect(r.body.unassigned.map((c) => c.id)).not.toContain(capA);
  });

  test("inter-context relationships carry the far context's ID (DD-07)", async () => {
    const r = await api<ContextMapResult>("GET", `/models/${modelId}/system-model/context-map`);
    const c1 = r.body.contexts.find((c) => c.id === bc1.id)!;
    // Seeded: BC1 -UPSTREAM_OF-> BC4.
    const rel = c1.relationships.find(
      (x) => x.type === "UPSTREAM_OF" && x.targetId === bc4.id,
    );
    expect(rel).toBeDefined();
    expect(rel!.targetName).toBe(bc4.name);
    // No relationship row is the name-only shape (every row has targetId).
    for (const x of c1.relationships) {
      expect(typeof x.targetId).toBe("string");
      expect(x.targetId.length).toBeGreaterThan(0);
    }
  });

  test("read-only: no BoundedContext or relationship was created or mutated (NFR-04)", async () => {
    // Exercise both aggregates once more, then compare counts.
    await api("GET", `/models/${modelId}/system-model/context-map`);
    await api("GET", `/models/${modelId}/system-model/gaps`);
    const after = await bcSnapshot();
    expect(after.contexts).toBe(bcCountBefore);
    expect(after.relationships).toBe(relCountBefore);
  });
});
