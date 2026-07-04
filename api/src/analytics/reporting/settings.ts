// Analytics settings + audit — cto-analytics-reporting (FR-11, DD-08/DD-09).
//
// Owns the two settings tables (`analytics_settings` single-row +
// `analytics_settings_audit`) in the SAME isolated SQLite file the cache
// module (`cache.ts`) manages (`ANALYTICS_DB_PATH`, NFR-R1). This module
// reuses the cache module's singleton `Database` via `getAnalyticsDb()` and
// creates its own tables idempotently on first `initAnalyticsSettings()`.
//
// Seeding (DD-08): on first init, if `analytics_settings` is empty, insert a
// single row (id=1) from the `cto-analytics` code-defaults
// (`ANALYTICS_COMPLEXITY_WEIGHTS` + `"0 2 * * *"` + `"{}"` +
// `JSON.stringify(ANALYTICS_AI_CANDIDATE_DEFINITION)`), so behaviour is
// unchanged until an operator PATCHes.
//
// Audit (DD-09): every `patchSettings(patch, actor)` writes exactly one
// `analytics_settings_audit` row `{ ts, before, after, actor }`. The `actor`
// defaults to the single-tenant sentinel `"local-operator"`; a future auth
// backfill fills a real identity via the central router gate with no DDL
// change (the column already exists).
//
// No Neo4j: settings are pure SQLite (AC-11 guard — this module never touches
// the graph driver).

import { z } from "zod";
import { getAnalyticsDb } from "./cache";
import {
  ANALYTICS_AI_CANDIDATE_DEFINITION,
  ANALYTICS_COMPLEXITY_WEIGHTS,
} from "../routes";
import { generateId } from "../../ids";
import { parseWith } from "../../routes/_helpers";

// ────────────────────────────────────────────────────────────────────
// Shapes.
// ────────────────────────────────────────────────────────────────────

/** Complexity weights (mirrors cache.ts `RunWeights` / hash.ts `HashWeights`). */
export interface SettingsWeights {
  depth_weight: number;
  system_weight: number;
  role_weight: number;
}

/** The AI-candidate definition (mirrors `cto-analytics`'s code-default). */
export interface AiCandidateDefinition {
  repetition_key: string;
  repetition_match: string;
  richness_key: string;
  richness_match: string;
  leverage_score_key: string;
  leverage_min: number;
}

/** The fully-materialised settings row (JSON columns parsed back to objects). */
export interface SettingsRow {
  depth_weight: number;
  system_weight: number;
  role_weight: number;
  scheduler_cron: string;
  pdf_brand: Record<string, unknown>;
  ai_candidate_definition: AiCandidateDefinition;
  updated_at: string;
}

/** Convenience view: just the weights sub-object the precompute passes in. */
export function settingsWeights(row: SettingsRow): SettingsWeights {
  return {
    depth_weight: row.depth_weight,
    system_weight: row.system_weight,
    role_weight: row.role_weight,
  };
}

export interface SettingsAuditRow {
  id: string;
  ts: string;
  before: string;
  after: string;
  actor: string;
}

/** DD-09: single-tenant sentinel actor; a future auth backfill overwrites it. */
export const DEFAULT_ACTOR = "local-operator";

// ────────────────────────────────────────────────────────────────────
// zod — PATCH /settings body (partial, all optional). DD (design §5.5).
// ────────────────────────────────────────────────────────────────────

const aiCandidateDefinitionSchema = z.object({
  repetition_key: z.string(),
  repetition_match: z.string(),
  richness_key: z.string(),
  richness_match: z.string(),
  leverage_score_key: z.string(),
  leverage_min: z.number(),
});

export const settingsPatchSchema = z
  .object({
    depth_weight: z.number().positive().optional(),
    system_weight: z.number().positive().optional(),
    role_weight: z.number().positive().optional(),
    scheduler_cron: z.string().min(1).optional(),
    pdf_brand: z.record(z.unknown()).optional(),
    ai_candidate_definition: aiCandidateDefinitionSchema.optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

// ────────────────────────────────────────────────────────────────────
// DDL — design §5.5 verbatim.
// ────────────────────────────────────────────────────────────────────

const DDL_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS analytics_settings (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     depth_weight  REAL NOT NULL,
     system_weight REAL NOT NULL,
     role_weight   REAL NOT NULL,
     scheduler_cron TEXT NOT NULL,
     pdf_brand_json TEXT NOT NULL,
     ai_candidate_definition_json TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS analytics_settings_audit (
     id     TEXT PRIMARY KEY,
     ts     TEXT NOT NULL,
     before TEXT NOT NULL,
     after  TEXT NOT NULL,
     actor  TEXT NOT NULL
   )`,
];

/** The seeded default cron (DD-08). */
export const DEFAULT_SCHEDULER_CRON = "0 2 * * *";

// ────────────────────────────────────────────────────────────────────
// Lifecycle — creates the two tables + seeds the single row (DD-08).
// ────────────────────────────────────────────────────────────────────

/**
 * Create the settings tables idempotently and seed the single row from the
 * `cto-analytics` code-defaults if the table is empty (DD-08). Safe to call
 * repeatedly; `initAnalyticsDb()` (cache.ts) MUST have run first (this module
 * reuses that singleton `Database`).
 */
export function initAnalyticsSettings(): void {
  const db = getAnalyticsDb();
  for (const stmt of DDL_STATEMENTS) {
    db.exec(stmt);
  }
  const row = db.prepare(`SELECT COUNT(*) AS n FROM analytics_settings`).get() as {
    n: number;
  };
  if (row.n === 0) {
    db.prepare(
      `INSERT INTO analytics_settings
         (id, depth_weight, system_weight, role_weight,
          scheduler_cron, pdf_brand_json, ai_candidate_definition_json, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ANALYTICS_COMPLEXITY_WEIGHTS.depth_weight,
      ANALYTICS_COMPLEXITY_WEIGHTS.system_weight,
      ANALYTICS_COMPLEXITY_WEIGHTS.role_weight,
      DEFAULT_SCHEDULER_CRON,
      "{}",
      JSON.stringify(ANALYTICS_AI_CANDIDATE_DEFINITION),
      new Date().toISOString(),
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Reads.
// ────────────────────────────────────────────────────────────────────

interface RawSettingsRow {
  depth_weight: number;
  system_weight: number;
  role_weight: number;
  scheduler_cron: string;
  pdf_brand_json: string;
  ai_candidate_definition_json: string;
  updated_at: string;
}

function hydrate(raw: RawSettingsRow): SettingsRow {
  return {
    depth_weight: raw.depth_weight,
    system_weight: raw.system_weight,
    role_weight: raw.role_weight,
    scheduler_cron: raw.scheduler_cron,
    pdf_brand: JSON.parse(raw.pdf_brand_json) as Record<string, unknown>,
    ai_candidate_definition: JSON.parse(
      raw.ai_candidate_definition_json,
    ) as AiCandidateDefinition,
    updated_at: raw.updated_at,
  };
}

/**
 * Read the single settings row, seeding it first if the table is empty (so a
 * caller that skipped `initAnalyticsSettings()` still gets code-defaults). The
 * returned row's JSON columns are parsed back to objects.
 */
export function getSettingsRow(): SettingsRow {
  initAnalyticsSettings();
  const db = getAnalyticsDb();
  const raw = db
    .prepare(
      `SELECT depth_weight, system_weight, role_weight, scheduler_cron,
              pdf_brand_json, ai_candidate_definition_json, updated_at
         FROM analytics_settings WHERE id = 1`,
    )
    .get() as RawSettingsRow;
  return hydrate(raw);
}

// ────────────────────────────────────────────────────────────────────
// Writes — patch + audit (DD-09).
// ────────────────────────────────────────────────────────────────────

/**
 * Apply a (pre-validated) partial patch to the single settings row and write
 * exactly one `analytics_settings_audit` row carrying the `before`/`after`
 * JSON snapshots + the `actor` (DD-09 sentinel by default). Returns the new
 * row. Omitted patch fields are left unchanged.
 */
export function patchSettings(
  patch: SettingsPatch,
  actor: string = DEFAULT_ACTOR,
): SettingsRow {
  const db = getAnalyticsDb();
  const before = getSettingsRow();

  const next: SettingsRow = {
    depth_weight: patch.depth_weight ?? before.depth_weight,
    system_weight: patch.system_weight ?? before.system_weight,
    role_weight: patch.role_weight ?? before.role_weight,
    scheduler_cron: patch.scheduler_cron ?? before.scheduler_cron,
    pdf_brand: patch.pdf_brand ?? before.pdf_brand,
    ai_candidate_definition:
      patch.ai_candidate_definition ?? before.ai_candidate_definition,
    updated_at: new Date().toISOString(),
  };

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE analytics_settings
          SET depth_weight = ?, system_weight = ?, role_weight = ?,
              scheduler_cron = ?, pdf_brand_json = ?,
              ai_candidate_definition_json = ?, updated_at = ?
        WHERE id = 1`,
    ).run(
      next.depth_weight,
      next.system_weight,
      next.role_weight,
      next.scheduler_cron,
      JSON.stringify(next.pdf_brand),
      JSON.stringify(next.ai_candidate_definition),
      next.updated_at,
    );

    db.prepare(
      `INSERT INTO analytics_settings_audit (id, ts, before, after, actor)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      generateId(),
      next.updated_at,
      JSON.stringify(before),
      JSON.stringify(next),
      actor,
    );
  });
  tx();

  return next;
}

/** Read every audit row, oldest-first. */
export function getAuditRows(): SettingsAuditRow[] {
  const db = getAnalyticsDb();
  return db
    .prepare(
      `SELECT id, ts, before, after, actor
         FROM analytics_settings_audit ORDER BY ts ASC, id ASC`,
    )
    .all() as SettingsAuditRow[];
}

// ────────────────────────────────────────────────────────────────────
// Validation entry point (design §5.5 — parseWith → invalid_payload 400).
// ────────────────────────────────────────────────────────────────────

/** Validate a raw PATCH body via `parseWith` (throws ValidationError on a bad
 *  body → the router's global catch renders it as `invalid_payload` 400). */
export function validateSettingsPatch(input: unknown): SettingsPatch {
  return parseWith(settingsPatchSchema, input);
}
