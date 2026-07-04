// Analytics precompute cache — cto-analytics-reporting (FR-10, DD-06/DD-10/DD-12).
//
// Owns the 5 cache tables (`analytics_run`, `analytics_journey_scores`,
// `analytics_system_metrics`, `analytics_ai_candidates`, `analytics_alerts`)
// in an ISOLATED SQLite file (`ANALYTICS_DB_PATH`, default
// `./data/analytics.sqlite`, NFR-R1) — never the chat DB. The module mirrors
// `api/src/chat/persistence.ts` (bun:sqlite `Database`, WAL journal,
// `CREATE TABLE IF NOT EXISTS` DDL, module-scoped singleton).
//
// The settings tables (`analytics_settings`, `analytics_settings_audit`) share
// the SAME DB file but are owned by `settings.ts` (T-03); this module only
// owns the 5 cache tables.
//
// Public surface used by the scheduler (T-04), the PDF/snapshot endpoints
// (T-05/T-06), and the degraded-envelope wiring (T-07):
//   - initAnalyticsDb() / getAnalyticsDb() / closeAnalyticsDb()
//   - writeRun() + the three score-table writers + writeAlert()
//   - getLatestRun() / getRun() / getScores() and friends (reads)
//   - withCacheEnvelope(body)  (DD-10, one argument — C-01)
//   - STALE_THRESHOLD_MS, SNAPSHOT_RETENTION, pruneSnapshots()  (DD-12/C-03)
//
// No Neo4j: the snapshot blob is CAPTURED by capture.ts (RD-1) and PERSISTED
// here as JSON. This module never touches the graph driver (AC-11 guard).

import { Database } from "bun:sqlite";
type DatabaseInstance = Database;
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { loadEnv } from "../../env";
import { generateId } from "../../ids";

// ────────────────────────────────────────────────────────────────────
// Constants (DD-10, DD-12).
// ────────────────────────────────────────────────────────────────────

/** Staleness cut-off for the degraded envelope: a cache older than 25 h is stale. */
export const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;

/** Rolling snapshot-blob retention window (DD-12/OQ-2): keep the heavy
 *  `nodes_json`/`edges_json` blobs for only the latest N runs. */
export const SNAPSHOT_RETENTION = 7;

// ────────────────────────────────────────────────────────────────────
// Row / blob shapes.
// ────────────────────────────────────────────────────────────────────

/** A node in the captured snapshot blob (mirrors capture.ts / hash.ts `HashNode`). */
export interface SnapshotNode {
  id: string;
  label: string;
  attributes: Record<string, unknown>;
  updatedAt: string;
}

/** An edge in the captured snapshot blob (mirrors capture.ts / hash.ts `HashEdge`). */
export interface SnapshotEdge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  attributes: Record<string, unknown>;
  createdAt: string;
}

/** Complexity weights persisted with each run (mirrors hash.ts `HashWeights`). */
export interface RunWeights {
  depth_weight: number;
  system_weight: number;
  role_weight: number;
}

export type RunStatus = "ok" | "ai_skipped";

export interface JourneyScoreRow {
  journey_id: string;
  journey_name: string;
  depth: number;
  distinct_systems: number;
  distinct_roles: number;
  score: number;
}

export interface SystemMetricRow {
  system_id: string;
  system_name: string;
  degree: number;
  integration_count: number;
}

export interface AiCandidateRow {
  activity_id: string;
  activity_name: string;
  leverage_score: number;
  detail: Record<string, unknown>;
}

export interface AlertRow {
  id: string;
  last_run_at: string;
  kind: string;
  message: string;
  created_at: string;
}

/** The fully-materialised run header (snapshot blobs parsed back to objects). */
export interface RunSnapshot {
  last_run_at: string;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  weights: RunWeights;
  status: RunStatus;
  /** True when the heavy snapshot blobs were pruned beyond the N=7 window (DD-12). */
  pruned: boolean;
}

export interface WriteRunInput {
  lastRunAt: string;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  weights: RunWeights;
  status: RunStatus;
  journeyScores: JourneyScoreRow[];
  systemMetrics: SystemMetricRow[];
  aiCandidates: AiCandidateRow[];
}

// ────────────────────────────────────────────────────────────────────
// Module-scoped singleton (mirrors chat/persistence.ts).
// ────────────────────────────────────────────────────────────────────

let dbInstance: DatabaseInstance | null = null;
let resolvedDbPath: string | null = null;

function resolveDbPath(rawPath: string): string {
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

// ────────────────────────────────────────────────────────────────────
// DDL — DD-06 verbatim. `analytics_run.status` carries a CHECK enum (N-02).
// ────────────────────────────────────────────────────────────────────

const DDL_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS analytics_run (
     last_run_at  TEXT PRIMARY KEY,
     nodes_json   TEXT NOT NULL,
     edges_json   TEXT NOT NULL,
     weights_json TEXT NOT NULL,
     status       TEXT NOT NULL CHECK (status IN ('ok','ai_skipped'))
   )`,
  `CREATE TABLE IF NOT EXISTS analytics_journey_scores (
     last_run_at      TEXT NOT NULL,
     journey_id       TEXT NOT NULL,
     journey_name     TEXT NOT NULL,
     depth            INTEGER NOT NULL,
     distinct_systems INTEGER NOT NULL,
     distinct_roles   INTEGER NOT NULL,
     score            REAL NOT NULL,
     PRIMARY KEY (last_run_at, journey_id)
   )`,
  `CREATE TABLE IF NOT EXISTS analytics_system_metrics (
     last_run_at       TEXT NOT NULL,
     system_id         TEXT NOT NULL,
     system_name       TEXT NOT NULL,
     degree            INTEGER NOT NULL,
     integration_count INTEGER NOT NULL,
     PRIMARY KEY (last_run_at, system_id)
   )`,
  `CREATE TABLE IF NOT EXISTS analytics_ai_candidates (
     last_run_at    TEXT NOT NULL,
     activity_id    TEXT NOT NULL,
     activity_name  TEXT NOT NULL,
     leverage_score REAL NOT NULL,
     detail_json    TEXT NOT NULL,
     PRIMARY KEY (last_run_at, activity_id)
   )`,
  `CREATE TABLE IF NOT EXISTS analytics_alerts (
     id          TEXT PRIMARY KEY,
     last_run_at TEXT NOT NULL,
     kind        TEXT NOT NULL,
     message     TEXT NOT NULL,
     created_at  TEXT NOT NULL
   )`,
];

// ────────────────────────────────────────────────────────────────────
// Lifecycle.
// ────────────────────────────────────────────────────────────────────

export function initAnalyticsDb(): DatabaseInstance {
  if (dbInstance) return dbInstance;
  const env = loadEnv();
  const dbPath = resolveDbPath(env.analyticsDbPath);
  resolvedDbPath = dbPath;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  for (const stmt of DDL_STATEMENTS) {
    db.exec(stmt);
  }
  dbInstance = db;
  return db;
}

export function getAnalyticsDb(): DatabaseInstance {
  if (!dbInstance) {
    throw new Error("analytics cache not initialised — call initAnalyticsDb() first");
  }
  return dbInstance;
}

export function closeAnalyticsDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    resolvedDbPath = null;
  }
}

/** Test-only: close the singleton so a subsequent test can re-init against a
 *  different `ANALYTICS_DB_PATH`. Not used by production call sites. */
export function resetAnalyticsDbForTest(): void {
  closeAnalyticsDb();
}

export function getAnalyticsDbPath(): string | null {
  return resolvedDbPath;
}

// ────────────────────────────────────────────────────────────────────
// Run writes (DD-06). `writeRun()` prunes snapshot blobs as its last step (DD-12).
// ────────────────────────────────────────────────────────────────────

export function writeRun(input: WriteRunInput): void {
  const db = getAnalyticsDb();
  const {
    lastRunAt,
    nodes,
    edges,
    weights,
    status,
    journeyScores,
    systemMetrics,
    aiCandidates,
  } = input;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO analytics_run
         (last_run_at, nodes_json, edges_json, weights_json, status)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      lastRunAt,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      JSON.stringify(weights),
      status,
    );

    const insJourney = db.prepare(
      `INSERT OR REPLACE INTO analytics_journey_scores
         (last_run_at, journey_id, journey_name, depth, distinct_systems, distinct_roles, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const j of journeyScores) {
      insJourney.run(
        lastRunAt,
        j.journey_id,
        j.journey_name,
        j.depth,
        j.distinct_systems,
        j.distinct_roles,
        j.score,
      );
    }

    const insSystem = db.prepare(
      `INSERT OR REPLACE INTO analytics_system_metrics
         (last_run_at, system_id, system_name, degree, integration_count)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const s of systemMetrics) {
      insSystem.run(lastRunAt, s.system_id, s.system_name, s.degree, s.integration_count);
    }

    const insAi = db.prepare(
      `INSERT OR REPLACE INTO analytics_ai_candidates
         (last_run_at, activity_id, activity_name, leverage_score, detail_json)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const c of aiCandidates) {
      insAi.run(
        lastRunAt,
        c.activity_id,
        c.activity_name,
        c.leverage_score,
        JSON.stringify(c.detail),
      );
    }
  });
  tx();

  // DD-12 / C-03: prune the heavy snapshot blobs beyond the latest N runs.
  pruneSnapshots();
}

export function writeAlert(lastRunAt: string, kind: string, message: string): AlertRow {
  const db = getAnalyticsDb();
  const id = generateId();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO analytics_alerts (id, last_run_at, kind, message, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, lastRunAt, kind, message, createdAt);
  return { id, last_run_at: lastRunAt, kind, message, created_at: createdAt };
}

// ────────────────────────────────────────────────────────────────────
// Retention (DD-12 / C-03).
// ────────────────────────────────────────────────────────────────────

/** Clear `nodes_json`/`edges_json` for all but the latest `SNAPSHOT_RETENTION`
 *  runs. Run headers + score rows are kept; only the multi-MB snapshot blobs
 *  are cleared. A pruned run's snapshot endpoint returns `404 not_found`. */
export function pruneSnapshots(): void {
  const db = getAnalyticsDb();
  db.prepare(
    `UPDATE analytics_run
        SET nodes_json = '', edges_json = ''
      WHERE last_run_at NOT IN (
        SELECT last_run_at FROM analytics_run
        ORDER BY last_run_at DESC
        LIMIT ?
      )`,
  ).run(SNAPSHOT_RETENTION);
}

// ────────────────────────────────────────────────────────────────────
// Run reads.
// ────────────────────────────────────────────────────────────────────

interface RawRunRow {
  last_run_at: string;
  nodes_json: string;
  edges_json: string;
  weights_json: string;
  status: RunStatus;
}

function hydrateRun(row: RawRunRow): RunSnapshot {
  const pruned = row.nodes_json === "";
  return {
    last_run_at: row.last_run_at,
    nodes: pruned ? [] : (JSON.parse(row.nodes_json) as SnapshotNode[]),
    edges: pruned ? [] : (JSON.parse(row.edges_json) as SnapshotEdge[]),
    weights: JSON.parse(row.weights_json) as RunWeights,
    status: row.status,
    pruned,
  };
}

/** The most-recent run header (by `last_run_at` DESC), or null if none. */
export function getLatestRun(): RunSnapshot | null {
  const db = getAnalyticsDb();
  const row = db
    .prepare(
      `SELECT last_run_at, nodes_json, edges_json, weights_json, status
         FROM analytics_run ORDER BY last_run_at DESC LIMIT 1`,
    )
    .get() as RawRunRow | undefined;
  return row ? hydrateRun(row) : null;
}

/** The run header at an exact `last_run_at`, or null if none. */
export function getRun(lastRunAt: string): RunSnapshot | null {
  const db = getAnalyticsDb();
  const row = db
    .prepare(
      `SELECT last_run_at, nodes_json, edges_json, weights_json, status
         FROM analytics_run WHERE last_run_at = ?`,
    )
    .get(lastRunAt) as RawRunRow | undefined;
  return row ? hydrateRun(row) : null;
}

/** ISO `last_run_at` of the most-recent run, or null if none. */
export function getLatestRunAt(): string | null {
  const db = getAnalyticsDb();
  const row = db
    .prepare(`SELECT MAX(last_run_at) AS m FROM analytics_run`)
    .get() as { m: string | null } | undefined;
  return row?.m ?? null;
}

export function getJourneyScores(lastRunAt: string): JourneyScoreRow[] {
  const db = getAnalyticsDb();
  return db
    .prepare(
      `SELECT journey_id, journey_name, depth, distinct_systems, distinct_roles, score
         FROM analytics_journey_scores WHERE last_run_at = ?
         ORDER BY score DESC, journey_id ASC`,
    )
    .all(lastRunAt) as JourneyScoreRow[];
}

export function getSystemMetrics(lastRunAt: string): SystemMetricRow[] {
  const db = getAnalyticsDb();
  return db
    .prepare(
      `SELECT system_id, system_name, degree, integration_count
         FROM analytics_system_metrics WHERE last_run_at = ?
         ORDER BY degree DESC, system_id ASC`,
    )
    .all(lastRunAt) as SystemMetricRow[];
}

interface RawAiCandidateRow {
  activity_id: string;
  activity_name: string;
  leverage_score: number;
  detail_json: string;
}

export function getAiCandidates(lastRunAt: string): AiCandidateRow[] {
  const db = getAnalyticsDb();
  const rows = db
    .prepare(
      `SELECT activity_id, activity_name, leverage_score, detail_json
         FROM analytics_ai_candidates WHERE last_run_at = ?
         ORDER BY leverage_score DESC, activity_id ASC`,
    )
    .all(lastRunAt) as RawAiCandidateRow[];
  return rows.map((r) => ({
    activity_id: r.activity_id,
    activity_name: r.activity_name,
    leverage_score: r.leverage_score,
    detail: JSON.parse(r.detail_json) as Record<string, unknown>,
  }));
}

export function getAlerts(lastRunAt: string): AlertRow[] {
  const db = getAnalyticsDb();
  return db
    .prepare(
      `SELECT id, last_run_at, kind, message, created_at
         FROM analytics_alerts WHERE last_run_at = ?
         ORDER BY created_at ASC`,
    )
    .all(lastRunAt) as AlertRow[];
}

// ────────────────────────────────────────────────────────────────────
// Degraded envelope (DD-10 / AC-R3). Single argument — C-01.
// ────────────────────────────────────────────────────────────────────

/** Wrap a report body in the staleness envelope: when the latest
 *  `analytics_run.last_run_at` is older than `STALE_THRESHOLD_MS`, add
 *  `{ degraded:true, last_run_at }`; otherwise return the body untouched.
 *  The flag rides INSIDE the NFR-08 success envelope — never an error. */
export function withCacheEnvelope<T extends Record<string, unknown>>(
  body: T,
): T | (T & { degraded: true; last_run_at: string }) {
  const lastRunAt = getLatestRunAt();
  if (lastRunAt === null) return body;
  const ageMs = Date.now() - Date.parse(lastRunAt);
  if (ageMs > STALE_THRESHOLD_MS) {
    return { ...body, degraded: true as const, last_run_at: lastRunAt };
  }
  return body;
}
