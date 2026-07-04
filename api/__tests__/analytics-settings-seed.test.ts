// T-03 — analytics settings seed (FR-11, DD-08). Closes AC-R1.
//
// Verifies (per tasks.md T-03 Verification, AC-R1):
//   A fresh DB → GET /settings returns the code-default weights (all 1.0),
//   the default cron ("0 2 * * *"), an empty pdf_brand, and the AI-candidate
//   definition equal to `ANALYTICS_AI_CANDIDATE_DEFINITION` — i.e. the shipped
//   cto-analytics code-defaults become the seed row (design §10.2 tie).
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
  DEFAULT_SCHEDULER_CRON,
  getAuditRows,
  getSettingsRow,
  initAnalyticsSettings,
} from "../src/analytics/reporting/settings";
import {
  ANALYTICS_AI_CANDIDATE_DEFINITION,
  ANALYTICS_COMPLEXITY_WEIGHTS,
} from "../src/analytics/routes";

let tmpDir = "";
let prevEnv: string | undefined;

beforeEach(() => {
  if (!process.env.NEO4J_PASSWORD) process.env.NEO4J_PASSWORD = "test";
  prevEnv = process.env.ANALYTICS_DB_PATH;
  tmpDir = mkdtempSync(join(tmpdir(), "analytics-settings-seed-"));
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

describe("T-03 AC-R1: fresh DB → settings seeded from code-defaults", () => {
  test("weights equal ANALYTICS_COMPLEXITY_WEIGHTS", () => {
    const row = getSettingsRow();
    expect(row.depth_weight).toBe(ANALYTICS_COMPLEXITY_WEIGHTS.depth_weight);
    expect(row.system_weight).toBe(ANALYTICS_COMPLEXITY_WEIGHTS.system_weight);
    expect(row.role_weight).toBe(ANALYTICS_COMPLEXITY_WEIGHTS.role_weight);
    // Spelled out: the shipped defaults are all 1.0.
    expect(row.depth_weight).toBe(1.0);
    expect(row.system_weight).toBe(1.0);
    expect(row.role_weight).toBe(1.0);
  });

  test("cron is the default '0 2 * * *' and pdf_brand is empty", () => {
    const row = getSettingsRow();
    expect(row.scheduler_cron).toBe(DEFAULT_SCHEDULER_CRON);
    expect(row.scheduler_cron).toBe("0 2 * * *");
    expect(row.pdf_brand).toEqual({});
  });

  test("ai_candidate_definition equals the code-default", () => {
    const row = getSettingsRow();
    expect(row.ai_candidate_definition).toEqual({
      ...ANALYTICS_AI_CANDIDATE_DEFINITION,
    });
  });

  test("seeding is idempotent — re-init does not duplicate the row or audit", () => {
    initAnalyticsSettings();
    initAnalyticsSettings();
    const row = getSettingsRow();
    expect(row.depth_weight).toBe(1.0);
    // Seeding writes no audit row (only PATCH does).
    expect(getAuditRows().length).toBe(0);
  });
});
