// system-augmentation-model T-08 — write-path enforcement
// (AC-03..AC-06; FR-03, FR-04).
//
// Real HTTP against the live API server on 127.0.0.1:8787 with the
// tightened System doc in the registry (guaranteed by applySchema in
// beforeAll; the server compiled the tightened validator at its own
// boot — restart `bun run dev` after pulling this spec). Dev-fallback
// session (ONELOGIN_ISSUER unset) admits the requests, the pattern all
// route-level integration suites use.
//
//   AC-03  POST without systemKind        → 400, details.missing
//   AC-04  POST with "predictive"         → 400, details.type_mismatch
//   AC-05  each enum member               → 201 + GET round-trip
//   AC-06  PATCH matrix: map lacking key  → 400; valid map → 200;
//          name-only PATCH → 200, stored systemKind untouched.
//
// Requires Neo4j + API server running. Names prefixed `integration:`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { v7 as uuidV7 } from "uuid";
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

interface ErrorBody {
  error: { code: string; details?: { missing?: string[]; type_mismatch?: string[] } };
}

const createdIds: string[] = [];

async function postSystem(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE}/api/v1/nodes/System`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("integration: systemKind write-path enforcement (AC-03..AC-06)", () => {
  beforeAll(async () => {
    await applySchema(getDriver()); // tightened doc guaranteed, idempotent
  });

  afterAll(async () => {
    const session = getDriver().session();
    try {
      for (const id of createdIds) {
        await session.run(`MATCH (n:System {id: $id}) DETACH DELETE n`, { id });
      }
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("integration: AC-03 — POST without systemKind → 400 attribute_violation, details.missing", async () => {
    const r = await postSystem({
      id: uuidV7(),
      name: "t08-missing-kind",
      description: "",
      attributes: {},
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as ErrorBody;
    expect(body.error.code).toBe("attribute_violation");
    expect(body.error.details?.missing).toContain("systemKind");
  });

  test('integration: AC-04 — POST with systemKind:"predictive" → 400, details.type_mismatch', async () => {
    const r = await postSystem({
      id: uuidV7(),
      name: "t08-bad-kind",
      description: "",
      attributes: { systemKind: "predictive" },
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as ErrorBody;
    expect(body.error.code).toBe("attribute_violation");
    expect(body.error.details?.type_mismatch).toContain("systemKind");
  });

  test("integration: AC-05 — each enum member creates (201) and round-trips on GET", async () => {
    for (const kind of SYSTEM_KINDS) {
      const id = uuidV7();
      const r = await postSystem({
        id,
        name: `t08-${kind}`,
        description: "",
        attributes: { systemKind: kind },
      });
      expect(r.status).toBe(201);
      createdIds.push(id);

      const g = await fetch(`${BASE}/api/v1/nodes/System/${id}`);
      expect(g.status).toBe(200);
      const node = (await g.json()) as { attributes: { systemKind: string } };
      expect(node.attributes.systemKind).toBe(kind);
    }
  });

  test("integration: AC-06 — PATCH matrix (whole-map validation; omitted map untouched)", async () => {
    const id = uuidV7();
    const create = await postSystem({
      id,
      name: "t08-patch-target",
      description: "",
      attributes: { systemKind: "agentic" },
    });
    expect(create.status).toBe(201);
    createdIds.push(id);

    // attributes map present but lacking systemKind → 400 (whole-map replace).
    const bad = await fetch(`${BASE}/api/v1/nodes/System/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attributes: { owner: "ops" } }),
    });
    expect(bad.status).toBe(400);
    const badBody = (await bad.json()) as ErrorBody;
    expect(badBody.error.code).toBe("attribute_violation");
    expect(badBody.error.details?.missing).toContain("systemKind");

    // valid map → 200.
    const good = await fetch(`${BASE}/api/v1/nodes/System/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attributes: { systemKind: "ai_predictive", owner: "ops" } }),
    });
    expect(good.status).toBe(200);

    // name-only PATCH (no attributes key) → 200, stored systemKind unchanged.
    const nameOnly = await fetch(`${BASE}/api/v1/nodes/System/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "t08-patch-renamed" }),
    });
    expect(nameOnly.status).toBe(200);
    const after = (await (await fetch(`${BASE}/api/v1/nodes/System/${id}`)).json()) as {
      name: string;
      attributes: { systemKind: string; owner: string };
    };
    expect(after.name).toBe("t08-patch-renamed");
    expect(after.attributes.systemKind).toBe("ai_predictive");
    expect(after.attributes.owner).toBe("ops");
  });
});
