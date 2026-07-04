import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-12 — SLA mirror of the T-11 KPI pin (AC-02 slas,
// AC-07, AC-12 sla rows): lifecycle + negatives + list + subpaths +
// DEC-01 retired-overload 404s + issues[] envelope.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const createdSlaIds: string[] = [];

function slaBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `sla-crud-${generateId()}`,
    service_type: "response_time",
    target_value: 200,
    target_unit: "ms",
    measurement_window: "p95",
    window_duration: "24h",
    compliance_threshold: 99.5,
    description: "integration fixture",
    ...overrides,
  };
}

async function createSla(overrides: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/slas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(slaBody(overrides)),
  });
  expect(res.status).toBe(200); // pinned: 200, not 201
  const body = await res.json();
  createdSlaIds.push(body.id);
  return body;
}

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (createdSlaIds.length > 0) {
      await session.run(`MATCH (s:SLA) WHERE s.id IN $ids DETACH DELETE s`, { ids: createdSlaIds });
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: sla-crud lifecycle (AC-07, AC-12)", () => {
  test("create → patch → archive lifecycle with UUIDv7 ids", async () => {
    const created = await createSla();
    expect(created.id.charAt(14)).toBe("7"); // FR-14
    expect(created.archived_at).toBeUndefined(); // Neo4j drops null props

    // Timestamps are ms-resolution ISO strings; local round-trips can
    // complete within the same millisecond, so step the clock past the
    // create tick to keep the strict `>` assertion deterministic (AC-20).
    await Bun.sleep(2);
    const patched = await fetch(`${API_BASE}/slas/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_value: 150, penalty_type: "credit" }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.target_value).toBe(150);
    expect(patchedBody.penalty_type).toBe("credit");
    expect(patchedBody.name).toBe(created.name);
    expect(patchedBody.updated_at > created.updated_at).toBe(true);

    const archived = await fetch(`${API_BASE}/slas/${created.id}/archive`, { method: "POST" });
    expect(archived.status).toBe(200);
    expect((await archived.json()).archived_at).not.toBeNull();

    const again = await fetch(`${API_BASE}/slas/${created.id}/archive`, { method: "POST" });
    expect(again.status).toBe(404);
    const patchArchived = await fetch(`${API_BASE}/slas/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_value: 1 }),
    });
    expect(patchArchived.status).toBe(404);

    // Archived SLA still readable via detail GET (pinned).
    const detail = await fetch(`${API_BASE}/slas/${created.id}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).archived_at).not.toBeNull();
  });

  test("400 on each missing required field with issues[] envelope (AC-12)", async () => {
    const requiredFields = [
      "name", "service_type", "target_value", "target_unit",
      "measurement_window", "window_duration", "compliance_threshold",
    ];
    for (const field of requiredFields) {
      const body = slaBody() as Record<string, unknown>;
      delete body[field];
      const res = await fetch(`${API_BASE}/slas`, {
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

  test("detail GET, audit placeholder (DEC-02), 404s, malformed id 400", async () => {
    const created = await createSla();

    const detail = await fetch(`${API_BASE}/slas/${created.id}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).id).toBe(created.id);

    const audit = await fetch(`${API_BASE}/slas/${created.id}/audit`);
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as { rows: any[] };
    expect(auditBody.rows).toHaveLength(1);
    expect(auditBody.rows[0].user_id).toBe("system");
    expect(auditBody.rows[0].action).toBe("view");

    expect((await fetch(`${API_BASE}/slas/${generateId()}`)).status).toBe(404);
    expect((await fetch(`${API_BASE}/slas/${generateId()}/audit`)).status).toBe(404);
    expect((await fetch(`${API_BASE}/slas/not-a-uuid`)).status).toBe(400);
  });

  test("retired overloads gone (DEC-01): POST /slas/:id → 404; GET /slas/:id is the resource", async () => {
    const created = await createSla();

    const postOverload = await fetch(`${API_BASE}/slas/${created.id}`, { method: "POST" });
    expect(postOverload.status).toBe(404);
    expect(((await postOverload.json()) as ErrorEnvelope).error.code).toBe("not_found");

    // Not archived by the retired overload.
    const detail = await fetch(`${API_BASE}/slas/${created.id}`);
    const detailBody = await detail.json();
    expect(detailBody.archived_at).toBeUndefined();
    // Resource shape, not audit rows.
    expect(detailBody.rows).toBeUndefined();
    expect(detailBody.id).toBe(created.id);
  });
});

describe("integration: sla list (AC-02)", () => {
  test("GET /slas lists unarchived ordered created_at DESC; include_archived=true adds archived", async () => {
    const a = await createSla();
    await new Promise((r) => setTimeout(r, 5));
    const b = await createSla();
    await new Promise((r) => setTimeout(r, 5));
    const c = await createSla();
    await fetch(`${API_BASE}/slas/${c.id}/archive`, { method: "POST" });

    const res = await fetch(`${API_BASE}/slas`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; created_at: string }> };
    const ids = body.rows.map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(c.id);

    const sorted = [...body.rows].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    expect(body.rows.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));

    const withArchived = await fetch(`${API_BASE}/slas?include_archived=1`);
    const withArchivedBody = (await withArchived.json()) as { rows: Array<{ id: string }> };
    expect(withArchivedBody.rows.map((r) => r.id)).toContain(c.id);
  });
});
