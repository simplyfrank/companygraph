import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-11 — pins the KPI CRUD contract after the FR-13
// reshape (AC-01, AC-02, AC-03, AC-12 kpi rows) plus sanctioned change
// (i): the DEC-01 clean retirement of the POST/GET /kpis/:id overloads.
// Also pins the FR-10d GET /api/v1/domains list (AC-21, domains half —
// T-10's endpoint).
//
// Pinned as-built decisions:
//   - POST /kpis returns 200 (not 201).
//   - GET /kpis/:id returns archived KPIs too (archived_at tells the
//     caller); PATCH/archive of an archived KPI → 404.
//   - Audit is the DEC-02 placeholder: one synthetic row, user_id
//     "system" — NOT a real audit trail.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const createdKpiIds: string[] = [];

function kpiBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `kpi-crud-${generateId()}`,
    category: "efficiency",
    unit: "%",
    target_value: 95,
    target_direction: "higher_is_better",
    measurement_frequency: "daily",
    description: "integration fixture",
    ...overrides,
  };
}

async function createKpi(overrides: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(kpiBody(overrides)),
  });
  expect(res.status).toBe(200); // pinned: 200, not 201
  const body = await res.json();
  createdKpiIds.push(body.id);
  return body;
}

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (createdKpiIds.length > 0) {
      await session.run(`MATCH (k:KPI) WHERE k.id IN $ids DETACH DELETE k`, { ids: createdKpiIds });
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: kpi-crud lifecycle (AC-01, AC-03, AC-12)", () => {
  test("create → patch → archive lifecycle with UUIDv7 ids", async () => {
    const created = await createKpi();
    // AC-01 / FR-14 — UUIDv7 version nibble on new ids.
    expect(created.id.charAt(14)).toBe("7");
    expect(created.name).toStartWith("kpi-crud-");
    expect(created.archived_at).toBeUndefined(); // pinned: Neo4j drops null props — key absent until archived

    // PATCH bumps updated_at, applies allow-listed fields only.
    // Timestamps are ms-resolution ISO strings; local round-trips can
    // complete within the same millisecond, so step the clock past the
    // create tick to keep the strict `>` assertion deterministic (AC-20).
    await Bun.sleep(2);
    const patched = await fetch(`${API_BASE}/kpis/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_value: 97, owner_role: "Ops Lead" }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.target_value).toBe(97);
    expect(patchedBody.owner_role).toBe("Ops Lead");
    expect(patchedBody.name).toBe(created.name); // untouched
    expect(patchedBody.updated_at > created.updated_at).toBe(true);

    // Archive via the FR-13 subpath.
    const archived = await fetch(`${API_BASE}/kpis/${created.id}/archive`, { method: "POST" });
    expect(archived.status).toBe(200);
    const archivedBody = await archived.json();
    expect(archivedBody.archived_at).not.toBeNull();

    // Second archive → 404; PATCH of archived → 404.
    const again = await fetch(`${API_BASE}/kpis/${created.id}/archive`, { method: "POST" });
    expect(again.status).toBe(404);
    const patchArchived = await fetch(`${API_BASE}/kpis/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_value: 1 }),
    });
    expect(patchArchived.status).toBe(404);

    // Detail GET still returns the archived resource (pinned).
    const detail = await fetch(`${API_BASE}/kpis/${created.id}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).archived_at).not.toBeNull();
  });

  test("400 on missing required fields with issues[] envelope (AC-12)", async () => {
    const requiredFields = [
      "name", "category", "unit", "target_value", "target_direction", "measurement_frequency",
    ];
    for (const field of requiredFields) {
      const body = kpiBody() as Record<string, unknown>;
      delete body[field];
      const res = await fetch(`${API_BASE}/kpis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      const env = (await res.json()) as ErrorEnvelope;
      expect(env.error.code).toBe("invalid_payload");
      const issues = env.error.details?.issues as Array<{ path: string }>;
      expect(issues.map((i) => i.path)).toContain(field);
    }
  });

  test("detail GET, audit placeholder row (DEC-02), 404s, malformed id 400", async () => {
    const created = await createKpi();

    const detail = await fetch(`${API_BASE}/kpis/${created.id}`);
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.id).toBe(created.id);
    expect(detailBody.category).toBe("efficiency");

    // DEC-02 placeholder — one synthetic row, user_id "system".
    const audit = await fetch(`${API_BASE}/kpis/${created.id}/audit`);
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as { rows: any[] };
    expect(auditBody.rows).toHaveLength(1);
    expect(auditBody.rows[0].user_id).toBe("system");
    expect(auditBody.rows[0].action).toBe("view");
    expect(auditBody.rows[0].id).toBe(created.id);

    const unknown = await fetch(`${API_BASE}/kpis/${generateId()}`);
    expect(unknown.status).toBe(404);
    const unknownAudit = await fetch(`${API_BASE}/kpis/${generateId()}/audit`);
    expect(unknownAudit.status).toBe(404);

    const malformed = await fetch(`${API_BASE}/kpis/not-a-uuid`);
    expect(malformed.status).toBe(400);
  });

  test("retired overloads are gone: POST /kpis/:id and GET-audit-on-/kpis/:id (DEC-01, AC-03)", async () => {
    const created = await createKpi();

    // POST /kpis/:id used to archive — now 404 not_found (no dispatch).
    const postOverload = await fetch(`${API_BASE}/kpis/${created.id}`, { method: "POST" });
    expect(postOverload.status).toBe(404);
    const env = (await postOverload.json()) as ErrorEnvelope;
    expect(env.error.code).toBe("not_found");

    // …and it did NOT archive the KPI.
    const detail = await fetch(`${API_BASE}/kpis/${created.id}`);
    expect((await detail.json()).archived_at).toBeUndefined();

    // GET /kpis/:id now returns the RESOURCE (repointed), not audit rows.
    const get = await fetch(`${API_BASE}/kpis/${created.id}`);
    const getBody = await get.json();
    expect(getBody.rows).toBeUndefined();
    expect(getBody.id).toBe(created.id);
  });
});

describe("integration: kpi list (AC-02)", () => {
  test("GET /kpis lists unarchived ordered created_at DESC; include_archived=true adds archived", async () => {
    const a = await createKpi();
    // UUIDv7 create timestamps can collide at ms resolution; created_at
    // ordering is what's pinned, so space the creates out.
    await new Promise((r) => setTimeout(r, 5));
    const b = await createKpi();
    await new Promise((r) => setTimeout(r, 5));
    const c = await createKpi();
    await fetch(`${API_BASE}/kpis/${c.id}/archive`, { method: "POST" });

    const res = await fetch(`${API_BASE}/kpis`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; created_at: string }> };
    const ids = body.rows.map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(c.id); // archived excluded by default

    // Ordered created_at DESC.
    const sorted = [...body.rows].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    expect(body.rows.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));

    const withArchived = await fetch(`${API_BASE}/kpis?include_archived=true`);
    const withArchivedBody = (await withArchived.json()) as { rows: Array<{ id: string }> };
    expect(withArchivedBody.rows.map((r) => r.id)).toContain(c.id);

    // parseQueryBool semantics: "false" is NOT truthy → archived excluded.
    const falseParam = await fetch(`${API_BASE}/kpis?include_archived=false`);
    const falseBody = (await falseParam.json()) as { rows: Array<{ id: string }> };
    expect(falseBody.rows.map((r) => r.id)).not.toContain(c.id);
  });
});

describe("integration: domains list (AC-21, domains half — FR-10d)", () => {
  test("GET /api/v1/domains → {rows:[{id,name,description}]} ordered by name", async () => {
    const res = await fetch(`${API_BASE}/domains`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; name: string; description: string | null }> };
    expect(Array.isArray(body.rows)).toBe(true);
    for (const row of body.rows) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.name).toBe("string");
    }
    const names = body.rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});
