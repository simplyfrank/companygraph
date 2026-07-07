import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";

// risk-compliance-change T-08 — pins the compliance-rules contract
// (FR-06) and the FR-12 path-id fix (AC-09) against a live Neo4j.
//
// FR-12: GET/PATCH/DELETE /compliance/rules/:id now read the id from the
// PATH (previously returned 400 "Missing rule id" because the handler
// read a ?id= query param the router never supplied). `evaluate` stays a
// literal path with a ?id= QUERY param (C-05/B-02 — never a body field).
//
// AC-11 carve-out (B-01): this route hand-rolls a `safeParse` envelope
// with `details.fieldErrors` (an object of field → messages) — it is NOT
// in the FR-09 `parseWith` conversion, so it does NOT emit `issues[]`.

const API_BASE = "http://127.0.0.1:8787/api/v1";
const createdIds: string[] = [];
const RUN = Date.now().toString(36);

// As-built create validates the body against the FULL `complianceRuleSchema`
// (shared/schema/ontology.ts) which REQUIRES id/created_at/updated_at — the
// storage layer then mints its own id + timestamps and discards these. So a
// valid create body must include them (dummy values are fine). This mirrors
// the seed helper (governed-seed-helper.ts → complianceRuleSchema.parse).
function ruleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: `rule-${RUN}`,
    description: "seed rule",
    rule_dsl: "ENSURE Activity.status = active",
    rule_type: "COMPLIANCE",
    category: "test",
    severity: "MEDIUM",
    enabled: true,
    actions: JSON.stringify([{ type: "TAG", config: { tag: "flagged" } }]),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

async function createRule(overrides: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${API_BASE}/compliance/rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ruleBody(overrides)),
  });
}

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(`MATCH (n:_ComplianceRule) WHERE n.id IN $ids DETACH DELETE n`, { ids: createdIds });
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: compliance-rules path-form CRUD (AC-09, FR-12)", () => {
  test("create → GET by PATH → patch → delete (path id, previously 400)", async () => {
    const cRes = await createRule();
    expect(cRes.status).toBe(200);
    const rule = await cRes.json();
    expect(typeof rule.id).toBe("string");
    createdIds.push(rule.id);

    // FR-12: GET /compliance/rules/<id> by PATH now returns the rule
    // (this returned 400 "Missing rule id" before the fix).
    const gRes = await fetch(`${API_BASE}/compliance/rules/${rule.id}`);
    expect(gRes.status).toBe(200);
    const got = await gRes.json();
    expect(got.id).toBe(rule.id);

    // PATCH by path
    const pRes = await fetch(`${API_BASE}/compliance/rules/${rule.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(pRes.status).toBe(200);
    expect((await pRes.json()).enabled).toBe(false);

    // DELETE by path → 204
    const dRes = await fetch(`${API_BASE}/compliance/rules/${rule.id}`, { method: "DELETE" });
    expect(dRes.status).toBe(204);
    createdIds.splice(createdIds.indexOf(rule.id), 1);

    // now gone
    const g2 = await fetch(`${API_BASE}/compliance/rules/${rule.id}`);
    expect(g2.status).toBe(404);
  });

  test("GET unknown path id → 404; invalid create body → 400 fieldErrors", async () => {
    const unknown = await fetch(`${API_BASE}/compliance/rules/${crypto.randomUUID()}`);
    expect(unknown.status).toBe(404);

    // invalid create: bad severity enum + missing required name
    const bad = await fetch(`${API_BASE}/compliance/rules`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(ruleBody({ name: undefined, severity: "SUPER" })),
    });
    expect(bad.status).toBe(400);
    const env = await bad.json();
    expect(env.error.code).toBe("invalid_payload");
    // AC-11 carve-out (B-01): fieldErrors object, NOT issues[]
    expect(env.error.details.fieldErrors).toBeDefined();
    expect(typeof env.error.details.fieldErrors).toBe("object");
    expect(env.error.details.issues).toBeUndefined();
  });

  test("list honors rule_type + enabled filters", async () => {
    const rule = await (await createRule({ name: `list-${RUN}` })).json();
    createdIds.push(rule.id);
    const res = await fetch(`${API_BASE}/compliance/rules?rule_type=COMPLIANCE&enabled=true`);
    expect(res.status).toBe(200);
    const rules = await res.json();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.every((r: any) => r.rule_type === "COMPLIANCE")).toBe(true);
  });
});

describe("integration: compliance-rules evaluate literal path (AC-09/C-05)", () => {
  test("evaluate reads ?id= query; unknown → 404; missing → 400", async () => {
    const rule = await (await createRule({ name: `eval-${RUN}` })).json();
    createdIds.push(rule.id);

    // known id as a QUERY param → evaluation result
    const ok = await fetch(`${API_BASE}/compliance/rules/evaluate?id=${rule.id}`, { method: "POST" });
    expect(ok.status).toBe(200);
    const result = await ok.json();
    expect(result).toBeDefined();

    // unknown id → 404
    const unknown = await fetch(`${API_BASE}/compliance/rules/evaluate?id=${crypto.randomUUID()}`, { method: "POST" });
    expect(unknown.status).toBe(404);

    // missing ?id= → 400 invalid_payload "Missing rule id"
    const missing = await fetch(`${API_BASE}/compliance/rules/evaluate`, { method: "POST" });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("invalid_payload");
  });
});
