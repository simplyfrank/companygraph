import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateId } from "../src/ids";
import { query, runMigrations } from "../src/storage/postgres/client";

// kpi-okr-governance T-05 — pins the AS-BUILT sla-breaches contract
// (FR-06) plus the sanctioned fixes: malformed body → 400 issues[]
// envelope (was 500, AC-12) and UUIDv7 ids (FR-14). Store of record is
// Postgres `sla_breaches` (migration 004), asserted via `query()` (AC-08).
//
// Pinned quirks:
//   - resolution_status is FORCED to 'open' on create (input ignored).
//   - The DB CHECK omits 'investigating' (shared slaBreachSchema has it);
//     the PATCH schema mirrors the DB. Pinned as-is per design §3.2.
//   - Empty PATCH body → 400 "no fields to update".

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const createdIds: string[] = [];

async function postBreach(body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}/sla-breaches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json();
  if (res.status === 201 && parsed && typeof parsed.id === "string") createdIds.push(parsed.id);
  return { status: res.status, body: parsed };
}

function validBreach(slaId: string, overrides: Record<string, unknown> = {}) {
  return {
    sla_id: slaId,
    breach_at: new Date().toISOString(),
    actual_value: 92.1,
    target_value: 99.9,
    severity: "major",
    impact_description: "integration fixture",
    ...overrides,
  };
}

describe("integration: sla-breaches (AC-08, AC-12)", () => {
  const slaId = generateId(); // plain TEXT column, no FK

  beforeAll(async () => {
    await runMigrations(); // FR-18 self-provisioning, idempotent
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await query("DELETE FROM sla_breaches WHERE id = ANY($1)", [createdIds]);
    }
  });

  test("POST → 201, resolution_status forced 'open', UUIDv7 id, row lands in Postgres", async () => {
    const { status, body } = await postBreach(validBreach(slaId, { resolution_status: "resolved" }));
    expect(status).toBe(201);
    expect(body.sla_id).toBe(slaId);
    expect(body.severity).toBe("major");
    // Pinned: input resolution_status is ignored; always 'open' on create.
    expect(body.resolution_status).toBe("open");
    // FR-14 / AC-08 — UUIDv7 version nibble.
    expect(body.id.charAt(14)).toBe("7");

    const rows = await query("SELECT * FROM sla_breaches WHERE id = $1", [body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].resolution_status).toBe("open");
  });

  test("severity enum enforced by zod → 400 issues[] on garbage", async () => {
    const { status, body } = await postBreach(validBreach(slaId, { severity: "catastrophic" }));
    expect(status).toBe(400);
    const env = body as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
    const issues = env.error.details?.issues as Array<{ path: string }>;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.map((i) => i.path)).toContain("severity");
  });

  test("GET list requires sla_id; filters by resolution_status", async () => {
    await postBreach(validBreach(slaId, { severity: "minor" }));

    const missing = await fetch(`${API_BASE}/sla-breaches`);
    expect(missing.status).toBe(400);

    const res = await fetch(`${API_BASE}/sla-breaches?sla_id=${slaId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ resolution_status: string }> };
    expect(body.rows.length).toBeGreaterThanOrEqual(2);

    const filtered = await fetch(`${API_BASE}/sla-breaches?sla_id=${slaId}&resolution_status=resolved`);
    const filteredBody = (await filtered.json()) as { rows: unknown[] };
    expect(filteredBody.rows).toHaveLength(0);
  });

  test("PATCH partial resolution updates; empty body → 400 'no fields to update'", async () => {
    const { body: created } = await postBreach(validBreach(slaId));

    const res = await fetch(`${API_BASE}/sla-breaches/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolution_status: "resolved", resolution_notes: "fixed in test" }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.resolution_status).toBe("resolved");
    expect(updated.resolution_notes).toBe("fixed in test");
    // Untouched fields survive the partial update.
    expect(updated.severity).toBe("major");

    const empty = await fetch(`${API_BASE}/sla-breaches/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
    const emptyBody = (await empty.json()) as ErrorEnvelope;
    expect(emptyBody.error.code).toBe("invalid_payload");
    expect(emptyBody.error.message).toBe("no fields to update");
  });

  test("GET /:id 200 / unknown 404; DELETE → {deleted:true}", async () => {
    const { body: created } = await postBreach(validBreach(slaId, { severity: "critical" }));

    const res = await fetch(`${API_BASE}/sla-breaches/${created.id}`);
    expect(res.status).toBe(200);

    const unknown = await fetch(`${API_BASE}/sla-breaches/${generateId()}`);
    expect(unknown.status).toBe(404);

    const del = await fetch(`${API_BASE}/sla-breaches/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });

    const delUnknown = await fetch(`${API_BASE}/sla-breaches/${created.id}`, { method: "DELETE" });
    expect(delUnknown.status).toBe(404);
  });

  test("malformed body → 400 invalid_payload with details.issues[] (was 500 — AC-12)", async () => {
    const { status, body } = await postBreach({ sla_id: slaId });
    expect(status).toBe(400);
    const env = body as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
    const issues = env.error.details?.issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["breach_at", "actual_value", "target_value", "severity"]),
    );
  });
});
