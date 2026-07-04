import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateId } from "../src/ids";
import { query, runMigrations } from "../src/storage/postgres/client";

// kpi-okr-governance T-04 — pins the AS-BUILT kpi-measurements contract
// (FR-02) plus the two sanctioned fixes landing in the same task:
//   - malformed body → 400 invalid_payload with details.issues[] (was 500,
//     AC-12 / FR-11b via parseWith)
//   - new ids are UUIDv7 (was uuid v4, FR-14)
// Store of record is Postgres `kpi_measurements` (migration 003) — rows
// are asserted through the production `query()` client (AC-04).
//
// Pinned quirks (do NOT "fix" without a spec):
//   - POST echoes the raw pg row: NUMERIC `value` comes back as a STRING
//     on the 201 echo; the GETs parseFloat it to a number.
//   - GET list requires ?kpi_id= (400 without), limit/offset default 100/0.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const createdIds: string[] = [];

async function postMeasurement(body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}/kpi-measurements`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json();
  if (res.status === 201 && parsed && typeof parsed.id === "string") createdIds.push(parsed.id);
  return { status: res.status, body: parsed };
}

describe("integration: kpi-measurements (AC-04, AC-12)", () => {
  const kpiId = generateId(); // fixture kpi_id — kpi_measurements has no FK, plain TEXT column

  beforeAll(async () => {
    // FR-18 — self-provisioning: idempotent via schema_migrations.
    await runMigrations();
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await query("DELETE FROM kpi_measurements WHERE id = ANY($1)", [createdIds]);
    }
  });

  test("POST → 201 echoes the inserted row (NUMERIC value as string) and persists to Postgres", async () => {
    const measuredAt = new Date().toISOString();
    const { status, body } = await postMeasurement({
      kpi_id: kpiId,
      measured_at: measuredAt,
      value: 42.5,
      context: { region: "emea" },
      source: "integration-test",
    });
    expect(status).toBe(201);
    expect(typeof body.id).toBe("string");
    expect(body.kpi_id).toBe(kpiId);
    // Pinned: pg returns NUMERIC as string on the raw POST echo.
    expect(body.value).toBe("42.5");
    expect(body.source).toBe("integration-test");

    // FR-14 / AC-04 — UUIDv7 version nibble.
    expect(body.id.charAt(14)).toBe("7");

    // AC-04 — the row exists in the kpi_measurements table.
    const rows = await query("SELECT * FROM kpi_measurements WHERE id = $1", [body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kpi_id).toBe(kpiId);
  });

  test("GET list requires kpi_id and parses value to a number", async () => {
    await postMeasurement({ kpi_id: kpiId, measured_at: new Date().toISOString(), value: 7 });

    const missing = await fetch(`${API_BASE}/kpi-measurements`);
    expect(missing.status).toBe(400);
    const missingBody = (await missing.json()) as ErrorEnvelope;
    expect(missingBody.error.code).toBe("invalid_payload");

    const res = await fetch(`${API_BASE}/kpi-measurements?kpi_id=${kpiId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; value: unknown }> };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThanOrEqual(2);
    // GETs parseFloat the NUMERIC — number, not string (pinned asymmetry vs POST echo).
    for (const row of body.rows) expect(typeof row.value).toBe("number");
  });

  test("GET /:id returns the row; unknown id → 404", async () => {
    const { body: created } = await postMeasurement({
      kpi_id: kpiId,
      measured_at: new Date().toISOString(),
      value: 11.25,
    });

    const res = await fetch(`${API_BASE}/kpi-measurements/${created.id}`);
    expect(res.status).toBe(200);
    const row = await res.json();
    expect(row.id).toBe(created.id);
    expect(row.value).toBe(11.25);

    const unknown = await fetch(`${API_BASE}/kpi-measurements/${generateId()}`);
    expect(unknown.status).toBe(404);
    const unknownBody = (await unknown.json()) as ErrorEnvelope;
    expect(unknownBody.error.code).toBe("not_found");
  });

  test("DELETE /:id → {deleted:true}; unknown → 404", async () => {
    const { body: created } = await postMeasurement({
      kpi_id: kpiId,
      measured_at: new Date().toISOString(),
      value: 1,
    });

    const res = await fetch(`${API_BASE}/kpi-measurements/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    const gone = await fetch(`${API_BASE}/kpi-measurements/${created.id}`);
    expect(gone.status).toBe(404);

    const unknown = await fetch(`${API_BASE}/kpi-measurements/${generateId()}`, { method: "DELETE" });
    expect(unknown.status).toBe(404);
  });

  test("malformed body → 400 invalid_payload with details.issues[] (was 500 as-built — AC-12)", async () => {
    const { status, body } = await postMeasurement({ kpi_id: kpiId, value: "not-a-number" });
    expect(status).toBe(400);
    const env = body as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
    const issues = env.error.details?.issues as Array<{ path: string; message: string; code: string }>;
    expect(Array.isArray(issues)).toBe(true);
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("measured_at");
    expect(paths).toContain("value");
  });

  test("non-JSON body → 400 (readJson channel)", async () => {
    const res = await fetch(`${API_BASE}/kpi-measurements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(res.status).toBe(400);
    const env = (await res.json()) as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
  });
});
