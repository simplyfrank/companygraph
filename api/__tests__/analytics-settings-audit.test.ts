// T-03 — analytics settings + audit (FR-11, DD-08/DD-09). Closes AC-17.
//
// Verifies (per tasks.md T-03 Verification, AC-17):
//   PATCH depth_weight → the GET reflects it, and exactly one
//   analytics_settings_audit row carries the prior value, the new value, and
//   the sentinel actor ("local-operator"). Also exercises the PATCH handler's
//   parseWith → invalid_payload 400 on a bad body, and the multi-field patch
//   (unpatched fields are left untouched).
//
// Pure-SQLite suite (no Neo4j) → runs under `bun test` (unit).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeAnalyticsDb,
  initAnalyticsDb,
  resetAnalyticsDbForTest,
} from "../src/analytics/reporting/cache";
import {
  DEFAULT_ACTOR,
  getAuditRows,
  getSettingsRow,
  initAnalyticsSettings,
  patchSettings,
} from "../src/analytics/reporting/settings";
import {
  handleGetSettings,
  handlePatchSettings,
} from "../src/analytics/reporting-routes";

let tmpDir = "";
let prevEnv: string | undefined;

beforeEach(() => {
  if (!process.env.NEO4J_PASSWORD) process.env.NEO4J_PASSWORD = "test";
  prevEnv = process.env.ANALYTICS_DB_PATH;
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-settings-audit-"));
  process.env.ANALYTICS_DB_PATH = join(tmpDir, "analytics.sqlite");
  resetAnalyticsDbForTest();
  initAnalyticsDb();
  initAnalyticsSettings();
});

afterEach(() => {
  closeAnalyticsDb();
  if (prevEnv === undefined) delete process.env.ANALYTICS_DB_PATH;
  else process.env.ANALYTICS_DB_PATH = prevEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

async function readJsonBody(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

describe("T-03 AC-17: PATCH depth_weight writes one audit row + GET reflects it", () => {
  test("patchSettings updates the row and writes exactly one before/after/actor row", () => {
    const before = getSettingsRow();
    expect(before.depth_weight).toBe(1.0);

    patchSettings({ depth_weight: 2.5 });

    const after = getSettingsRow();
    expect(after.depth_weight).toBe(2.5);
    // Untouched fields preserved.
    expect(after.system_weight).toBe(before.system_weight);
    expect(after.role_weight).toBe(before.role_weight);
    expect(after.scheduler_cron).toBe(before.scheduler_cron);

    const audit = getAuditRows();
    expect(audit.length).toBe(1);
    const row = audit[0]!;
    expect(row.actor).toBe(DEFAULT_ACTOR);
    const auditBefore = JSON.parse(row.before);
    const auditAfter = JSON.parse(row.after);
    expect(auditBefore.depth_weight).toBe(1.0);
    expect(auditAfter.depth_weight).toBe(2.5);
  });

  test("GET → PATCH → GET reflects the change through the handlers", async () => {
    const g1 = await readJsonBody(handleGetSettings());
    expect(g1.depth_weight).toBe(1.0);

    const req = new Request("http://127.0.0.1/api/v1/analytics/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ depth_weight: 3 }),
    });
    const patchRes = await handlePatchSettings(req);
    expect(patchRes.status).toBe(200);
    const patchBody = await readJsonBody(patchRes);
    expect(patchBody.depth_weight).toBe(3);

    const g2 = await readJsonBody(handleGetSettings());
    expect(g2.depth_weight).toBe(3);

    expect(getAuditRows().length).toBe(1);
  });

  test("a multi-field patch leaves unpatched fields intact + writes one audit row", () => {
    patchSettings({ system_weight: 4, scheduler_cron: "30 3 * * *" });
    const after = getSettingsRow();
    expect(after.system_weight).toBe(4);
    expect(after.scheduler_cron).toBe("30 3 * * *");
    expect(after.depth_weight).toBe(1.0);
    expect(after.role_weight).toBe(1.0);
    expect(getAuditRows().length).toBe(1);
  });
});

describe("T-03: PATCH handler validation (parseWith → invalid_payload 400)", () => {
  test("a bad body (negative weight) → 400 invalid_payload, no audit row", async () => {
    const req = new Request("http://127.0.0.1/api/v1/analytics/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ depth_weight: -1 }),
    });
    const res = await handlePatchSettings(req);
    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("invalid_payload");
    expect(getAuditRows().length).toBe(0);
  });

  test("an unknown field (strict schema) → 400 invalid_payload", async () => {
    const req = new Request("http://127.0.0.1/api/v1/analytics/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bogus_field: 1 }),
    });
    const res = await handlePatchSettings(req);
    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("invalid_payload");
  });

  test("a non-JSON body → 400 invalid_payload", async () => {
    const req = new Request("http://127.0.0.1/api/v1/analytics/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handlePatchSettings(req);
    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("invalid_payload");
  });
});
