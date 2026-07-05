// ddd-system-modeling T-02 / AC-02 — the four capability edge types
// register with their exact endpoint pairs through the runtime
// registry, against a FRESH registry (proves the DD-14 order: the
// BoundedContext row precedes the ASSIGNED_TO_CONTEXT createEdgeType —
// no type_pair_violation). Same binding recipe + teardown as
// capability-labels.integration.test.ts (design-review C-02; the
// `_Ontology*` wipe is sanctioned direct-driver op #2).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EDGE_ENDPOINTS } from "@companygraph/shared/schema/edges";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import { seedRegistryFromConstTuples } from "../src/ontology/seed";
import { applySchema } from "../src/neo4j/bootstrap";
import { registerModelSchema } from "../src/scripts/register-model-labels";
import { registerStorySchema } from "../src/scripts/register-story-labels";
import {
  registerCapabilitySchema,
  CAPABILITY_EDGE_TYPES,
} from "../src/scripts/register-capability-labels";
import { api, createNode, newCleanup, runCleanup, type Cleanup } from "./helpers/model-fixtures";

const API_BASE = "http://127.0.0.1:8787/api/v1";

async function wipeMetaNamespace(): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(
      `MATCH (n) WHERE any(l IN labels(n) WHERE l STARTS WITH '_Ontology')
       DETACH DELETE n`,
    );
  } finally {
    await session.close();
  }
}

async function refreshServerCaches(): Promise<void> {
  const edge = CAPABILITY_EDGE_TYPES[1]!; // SUPPORTED_BY
  const res = await fetch(
    `${API_BASE}/ontology/edge-types/${edge.name}?actor=ddd-system-test-heal`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: edge.description }),
    },
  );
  await res.text();
  if (!res.ok) throw new Error(`cache-refresh PATCH → ${res.status}`);
}

let registrationError: unknown = null;
const cleanup: Cleanup = newCleanup();

describe("integration: ddd-system-modeling AC-02 edge registration (fresh registry)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await wipeMetaNamespace();
    await seedRegistryFromConstTuples(driver);
    await registerModelSchema(driver);
    await registerStorySchema(driver);
    try {
      // DD-14 end-to-end: BoundedContext row FIRST, then the four
      // createEdgeType calls — must not throw type_pair_violation.
      await registerCapabilitySchema(driver);
    } catch (e) {
      registrationError = e;
    }
    await refreshServerCaches();
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await applySchema(getDriver());
    await refreshServerCaches();
    await closeDriver();
    _resetDriver();
  });

  test("all four createEdgeType calls succeed without type_pair_violation (DD-14)", async () => {
    expect(registrationError).toBeNull();
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (t:_OntologyEdgeType)
         WHERE t.name IN ["NEEDS_CAPABILITY","SUPPORTED_BY","ASSIGNED_TO_CONTEXT","CAPABILITY_IN_MODEL"]
         RETURN t.name AS name ORDER BY name`,
      );
      expect(r.records.map((rec) => rec.get("name"))).toEqual([
        "ASSIGNED_TO_CONTEXT",
        "CAPABILITY_IN_MODEL",
        "NEEDS_CAPABILITY",
        "SUPPORTED_BY",
      ]);
    } finally {
      await session.close();
    }
  });

  test("NEEDS_CAPABILITY carries BOTH endpoint pairs — one type, two rows (DD-04)", async () => {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (ep:_OntologyEdgeEndpoint {edge_type_name: "NEEDS_CAPABILITY"})
         RETURN ep.from_label AS f, ep.to_label AS t ORDER BY f`,
      );
      expect(
        r.records.map((rec) => [rec.get("f"), rec.get("t")]),
      ).toEqual([
        ["Activity", "Capability"],
        ["UserStory", "Capability"],
      ]);
    } finally {
      await session.close();
    }
  });

  test("wrong pair — SUPPORTED_BY Capability→Role → 400 edge_endpoint_label_mismatch", async () => {
    const capId = await createNode(cleanup, "Capability", "ac02-wrong-pair-cap");
    const roleId = await createNode(cleanup, "Role", "ac02-wrong-pair-role");
    const res = await api<{ error?: { code: string } }>("POST", "/edges", {
      type: "SUPPORTED_BY",
      fromId: capId,
      toId: roleId,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("edge_endpoint_label_mismatch");
  });

  test("no Capability→BusinessModel pair was added to IN_MODEL (DD-01)", async () => {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (ep:_OntologyEdgeEndpoint {edge_type_name: "IN_MODEL"})
         WHERE ep.from_label = "Capability"
         RETURN count(ep) AS c`,
      );
      expect(Number(r.records[0]!.get("c"))).toBe(0);
    } finally {
      await session.close();
    }
  });

  test("compile-time EDGE_ENDPOINTS is unchanged (NFR-01 / AC-21)", () => {
    const typeNames = Object.keys(EDGE_ENDPOINTS);
    for (const name of ["NEEDS_CAPABILITY", "SUPPORTED_BY", "ASSIGNED_TO_CONTEXT", "CAPABILITY_IN_MODEL"]) {
      expect(typeNames).not.toContain(name);
    }
  });
});
