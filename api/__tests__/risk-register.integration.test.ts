import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { query } from "../src/storage/postgres/client";
import { UUIDV7_REGEX } from "../src/ids";

// risk-compliance-change T-01/T-02 — pins the AS-BUILT risk-register
// contract (FR-01/02/03) against a live Postgres, plus the sanctioned
// fixes: the shared `parseWith` 400 channel (FR-09, AC-11) and the
// UUIDv7 id switch (FR-10, AC-12). Verify-then-fix: every as-built pin
// holds both before and after the fixes (guard against silent tightening).
//
// Store of record: Postgres `risk_register` (migrations 002 + 005).
// Fixtures seed via the REST API so id-gen + validation run; cleanup
// deletes exactly the tracked ids (order-independent, re-runnable — AC-15).

const API_BASE = "http://127.0.0.1:8787/api/v1";

const createdIds: string[] = [];
// Unique seed markers so filtered/grouped assertions isolate this run.
const RUN = Date.now().toString(36);
const SEED_OWNER = `owner-${RUN}`;
const SEED_DOMAIN = `domain-${RUN}`;
const SEED_CATEGORY = `cat-${RUN}`;

async function createRisk(overrides: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/risk-register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: `risk-${RUN}`,
      owner: SEED_OWNER,
      domain: SEED_DOMAIN,
      likelihood: 3,
      impact: 3,
      status: "open",
      trend: "flat",
      ...overrides,
    }),
  });
  return res;
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await query("DELETE FROM risk_register WHERE id = ANY($1)", [createdIds]);
  }
});

describe("integration: risk-register CRUD + defaults (AC-01)", () => {
  test("create → get → patch → delete round-trip", async () => {
    // create (escalation_level omitted → defaults to 1)
    const cRes = await createRisk({ category: SEED_CATEGORY, risk_type: "operational" });
    expect(cRes.status).toBe(201);
    const created = await cRes.json();
    expect(typeof created.id).toBe("string");
    createdIds.push(created.id);
    expect(created.escalation_level).toBe(1);
    // bare envelope (no {data} wrapper) on single-resource create
    expect(created.data).toBeUndefined();

    // get one (bare)
    const gRes = await fetch(`${API_BASE}/risk-register/${created.id}`);
    expect(gRes.status).toBe(200);
    const got = await gRes.json();
    expect(got.id).toBe(created.id);
    expect(got.data).toBeUndefined();

    // patch
    const pRes = await fetch(`${API_BASE}/risk-register/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "mitigating", escalation_level: 4 }),
    });
    expect(pRes.status).toBe(200);
    const patched = await pRes.json();
    expect(patched.status).toBe("mitigating");
    expect(patched.escalation_level).toBe(4);

    // delete → 200 {message}
    const dRes = await fetch(`${API_BASE}/risk-register/${created.id}`, { method: "DELETE" });
    expect(dRes.status).toBe(200);
    const del = await dRes.json();
    expect(typeof del.message).toBe("string");

    // second delete → 404
    const d2Res = await fetch(`${API_BASE}/risk-register/${created.id}`, { method: "DELETE" });
    expect(d2Res.status).toBe(404);
  });

  test("GET one unknown id → 404; empty PATCH → 400 invalid_payload", async () => {
    const unknown = "00000000-0000-7000-8000-000000000000";
    const g = await fetch(`${API_BASE}/risk-register/${unknown}`);
    expect(g.status).toBe(404);

    // seed a row to patch with an empty body
    const cRes = await createRisk();
    const created = await cRes.json();
    createdIds.push(created.id);

    const p = await fetch(`${API_BASE}/risk-register/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(p.status).toBe(400);
    const env = await p.json();
    expect(env.error.code).toBe("invalid_payload");
    expect(env.error.message).toContain("No valid fields to update");
  });
});

describe("integration: risk-register list order + filters (AC-02)", () => {
  test("list is {data} ordered by severity DESC; filters narrow the set", async () => {
    // Two rows in this run's domain: severity 25 (5×5) and 4 (2×2).
    const hi = await (await createRisk({ likelihood: 5, impact: 5, name: `hi-${RUN}` })).json();
    createdIds.push(hi.id);
    const lo = await (await createRisk({ likelihood: 2, impact: 2, name: `lo-${RUN}` })).json();
    createdIds.push(lo.id);

    const res = await fetch(`${API_BASE}/risk-register?domain=${SEED_DOMAIN}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    const ids = body.data.map((r: any) => r.id);
    // hi (severity 25) must precede lo (severity 4)
    expect(ids.indexOf(hi.id)).toBeLessThan(ids.indexOf(lo.id));
    // every row belongs to the seeded domain (filter honored)
    expect(body.data.every((r: any) => r.domain === SEED_DOMAIN)).toBe(true);

    // owner filter
    const byOwner = await (await fetch(`${API_BASE}/risk-register?owner=${SEED_OWNER}`)).json();
    expect(byOwner.data.every((r: any) => r.owner === SEED_OWNER)).toBe(true);
    expect(byOwner.data.length).toBeGreaterThanOrEqual(2);

    // escalation_level threshold (>=): seed an escalated row
    const esc = await (await createRisk({ escalation_level: 5, name: `esc-${RUN}` })).json();
    createdIds.push(esc.id);
    const escList = await (
      await fetch(`${API_BASE}/risk-register?domain=${SEED_DOMAIN}&escalation_level=5`)
    ).json();
    expect(escList.data.every((r: any) => r.escalation_level >= 5)).toBe(true);
    expect(escList.data.some((r: any) => r.id === esc.id)).toBe(true);
  });
});

describe("integration: risk-register aggregations (AC-03)", () => {
  test("domain/owner include escalated_risks; category/risk-type do not", async () => {
    // Seed a domain-scoped set with a known escalated row.
    const r1 = await (await createRisk({ status: "open", escalation_level: 4, name: `agg1-${RUN}` })).json();
    createdIds.push(r1.id);
    const r2 = await (await createRisk({ status: "mitigating", escalation_level: 1, name: `agg2-${RUN}` })).json();
    createdIds.push(r2.id);

    const byDomain = await (await fetch(`${API_BASE}/risk-register/aggregation/domain`)).json();
    const domRow = byDomain.data.find((d: any) => d.domain === SEED_DOMAIN);
    expect(domRow).toBeDefined();
    expect(Number(domRow.total_risks)).toBeGreaterThanOrEqual(2);
    expect(domRow.escalated_risks).toBeDefined();
    expect(domRow.avg_severity).toBeDefined();
    expect(domRow.max_severity).toBeDefined();

    const byOwner = await (await fetch(`${API_BASE}/risk-register/aggregation/owner`)).json();
    const ownRow = byOwner.data.find((o: any) => o.owner === SEED_OWNER);
    expect(ownRow).toBeDefined();
    expect(ownRow.escalated_risks).toBeDefined();

    const byCat = await (await fetch(`${API_BASE}/risk-register/aggregation/category`)).json();
    expect(Array.isArray(byCat.data)).toBe(true);
    // category rollup does NOT expose escalated_risks
    expect(byCat.data[0]?.escalated_risks).toBeUndefined();

    const byType = await (await fetch(`${API_BASE}/risk-register/aggregation/risk-type`)).json();
    expect(Array.isArray(byType.data)).toBe(true);
    expect(byType.data[0]?.escalated_risks).toBeUndefined();
  });

  test("summary: full key set present; relational invariant holds (table-global)", async () => {
    const res = await fetch(`${API_BASE}/risk-register/aggregation/summary`);
    expect(res.status).toBe(200);
    const { data: s } = await res.json();

    // Full key set (C-02): status buckets, severity buckets, aggregates.
    for (const k of [
      "total_risks", "open_risks", "mitigating_risks", "accepted_risks", "resolved_risks",
      "avg_severity", "max_severity",
      "critical_risks", "high_risks", "medium_risks", "low_risks",
      "escalated_risks", "domains_affected", "owners_involved",
    ]) {
      expect(s[k]).toBeDefined();
    }

    // summary is table-global (no WHERE/GROUP BY) — assert relations, not
    // exact counts (C-01). Postgres bigint/numeric round-trip as strings.
    const total = Number(s.total_risks);
    const sevSum =
      Number(s.critical_risks) + Number(s.high_risks) + Number(s.medium_risks) + Number(s.low_risks);
    expect(sevSum).toBe(total);
    const statusSum =
      Number(s.open_risks) + Number(s.mitigating_risks) + Number(s.accepted_risks) + Number(s.resolved_risks);
    expect(statusSum).toBe(total);
  });
});

describe("integration: risk-register validation → 400 issues[] (AC-04, AC-11)", () => {
  const badBodies: Array<[string, Record<string, unknown>]> = [
    ["likelihood > 5", { likelihood: 6 }],
    ["impact < 1", { impact: 0 }],
    ["escalation_level > 5", { escalation_level: 9 }],
    ["bad status enum", { status: "nope" }],
    ["bad trend enum", { trend: "sideways" }],
    ["bad risk_type enum", { risk_type: "made_up" }],
    ["missing name", { name: undefined }],
  ];

  for (const [label, override] of badBodies) {
    test(`POST rejects ${label} → 400 invalid_payload issues[]`, async () => {
      const base: Record<string, unknown> = {
        name: `bad-${RUN}`, owner: SEED_OWNER, domain: SEED_DOMAIN,
        likelihood: 3, impact: 3, status: "open", trend: "flat",
      };
      const body = { ...base, ...override };
      if (override.name === undefined) delete body.name;
      const res = await fetch(`${API_BASE}/risk-register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      const env = await res.json();
      expect(env.error.code).toBe("invalid_payload");
      expect(Array.isArray(env.error.details.issues)).toBe(true);
      expect(env.error.details.issues.length).toBeGreaterThan(0);
      for (const issue of env.error.details.issues) {
        expect(issue).toHaveProperty("path");
        expect(issue).toHaveProperty("message");
        expect(issue).toHaveProperty("code");
      }
    });
  }

  test("a valid payload still succeeds (no over-tightening)", async () => {
    const res = await createRisk({ name: `valid-${RUN}` });
    expect(res.status).toBe(201);
    const created = await res.json();
    createdIds.push(created.id);
  });
});

describe("integration: risk-register UUIDv7 ids (AC-12)", () => {
  test("created risk id is UUIDv7 (version nibble 7)", async () => {
    const created = await (await createRisk({ name: `v7-${RUN}` })).json();
    createdIds.push(created.id);
    expect(UUIDV7_REGEX.test(created.id)).toBe(true);
  });
});
