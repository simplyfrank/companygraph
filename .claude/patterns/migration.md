# Migration

**When to use:** Any schema change — new table, new column, new index, backfill.
**Canonical example:** `telegram/src/memory/migrations/0115_improvement_loop.sql`, `telegram/src/memory/migrations/0118_reminders.sql`.
**Tests:** `telegram/src/memory/__tests__/migrations-smoke.test.ts`, `telegram/src/memory/__tests__/dimension-coverage.test.ts`.
**Related:** `memory-module.md`, `test-migration-smoke.md`, `registry.md`.

## Shape

```sql
-- <one-line description of what this migration does>
-- Spec: .claude/specs/<name>/design.md (DD-NN references when applicable)

CREATE TABLE IF NOT EXISTS <table_name> (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  some_col     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  active       INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_<table>_<col>
  ON <table_name>(some_col)
  WHERE active = 1;
```

For adding a column to an existing table (no `IF NOT EXISTS` in SQLite ALTER — the runner swallows "duplicate column" errors and records the version regardless, see `migration-runner.ts:214`):

```sql
-- Add improvement_outcome_delta to insight_applications (from 0115_improvement_loop.sql:44)
ALTER TABLE insight_applications ADD COLUMN improvement_outcome_delta REAL;
```

For column drops / type changes use the rename-new-table pattern: create `<table>_new`, copy data, drop old, `ALTER RENAME`. Then add `<table>_new` to `ALLOW_LIST` in `dimension-coverage.test.ts:21` with a short comment — the three current entries (`flight_api_usage_new`, `tracked_flights_new`, `execution_log_new`) are the reference shape.

Partial indexes, computed views, and CHECK constraints are encouraged where they match domain semantics. `0118_reminders.sql:42` shows a hot-path partial index `idx_reminders_due ... WHERE completed_at IS NULL AND deleted_at IS NULL`, and `0118_reminders.sql:130` shows a `CREATE VIEW ... reminders_active` that derives `status` and `trigger_type` from base columns so those fields never drift.

The runner (`migration-runner.ts:147`) acquires an advisory lock before applying migrations and steals it if held for > 5 minutes (`migration-runner.ts:90`). This matters in CI/CD where two EC2 boots can race: the second process will silently skip rather than double-apply.

## Required (acceptance checklist)

- [ ] Filename is `NNNN_<slug>.sql` where NNNN is 4-digit zero-padded and <slug> is lowercase snake-case. `migrations-smoke.test.ts:84` enforces this via regex `/^\d{4}_[a-z0-9_]+\.sql$/`.
- [ ] Number is strictly one greater than the previous migration — `migrations-smoke.test.ts:57` checks no duplicates, no out-of-order, no gaps larger than 1 (warns at >10 cumulative).
- [ ] Every `CREATE TABLE` uses `IF NOT EXISTS`; every `CREATE INDEX` uses `IF NOT EXISTS`.
- [ ] First line is a `-- <description>` comment. Include a `-- Spec: .claude/specs/<name>/design.md (DD-NN..)` line when the change backs a spec — see `0118_reminders.sql:3` for the canonical shape.
- [ ] Every new table is registered in `dimensions.ts::LIFE_DIMENSIONS` under a life dimension; otherwise `dimension-coverage.test.ts:43` fails.
- [ ] The smoke test passes: `NODE_ENV=test bun test src/memory/__tests__/migrations-smoke.test.ts`. It applies every migration to a fresh `:memory:` DB via `runFileMigrations(db)` — matches the EC2 boot path exactly (`migration-runner.ts:147`, bootstrap + post-`LEGACY_MAX_VERSION` incremental).
- [ ] CHECK constraints on enum-like columns: `status TEXT CHECK(status IN ('a','b','c'))` — matches the `improvement_proposals.status` shape at `0115_improvement_loop.sql:7`.
- [ ] Prefer derived views (`CREATE VIEW ... AS SELECT ... CASE WHEN ... END`) over stored columns when a field is computable from other columns — eliminates write-drift. `0118_reminders.sql:130` is the reference.
- [ ] For ALTER TABLE ADD COLUMN on a table that already has rows in production: rely on the `duplicate column` swallow at `migration-runner.ts:214` — but still write the migration as if it's the first run. Don't add a `SELECT EXISTS(...)` guard; the runner handles it.

## Running locally

```bash
# Status report — what's applied, what's pending.
NODE_ENV=test bun run telegram/src/memory/migration-runner.ts

# Apply pending migrations to a throw-away test DB (never touches production).
NODE_ENV=test bun test telegram/src/memory/__tests__/migrations-smoke.test.ts
```

The CLI entry at `migration-runner.ts:259` prints schema version, applied migrations, and pending list. It never mutates — read-only status.

## Legacy boundary

`LEGACY_MAX_VERSION = 103` (`migration-runner.ts:21`). Migrations 1..103 are baked into `0000_bootstrap.sql`; on a fresh DB the bootstrap applies and versions 1..103 are marked applied in one batch (`migration-runner.ts:171`). Post-103 migrations run individually on both fresh and existing DBs. This means: editing migrations below 104 has no effect on fresh installs — their content is frozen in the bootstrap. If you need a schema fix in a legacy migration, write a new post-104 migration that alters the old table.

## Anti-patterns

- Raw `CREATE TABLE foo (...)` without `IF NOT EXISTS` → breaks on partially-applied DBs (the runner records a version even after "already exists", so a redeploy can fail).
- Numeric gap from the previous migration number → passes the smoke test up to 10 cumulative gaps but signals coordination problems; bump by 1.
- `DROP COLUMN` or `MODIFY COLUMN` directly → SQLite doesn't support them. Use rename-new-table, register `<table>_new` in `ALLOW_LIST`.
- Forgetting the `dimensions.ts` entry → `dimension-coverage.test.ts` fails. The test output names the missing table and the migration file it came from; the fix is always "add to `LIFE_DIMENSIONS`", never "extend `ALLOW_LIST`" (except for `_new` tables or FTS5 shadow tables).
- Writing seed data into the migration without idempotency (`INSERT OR IGNORE` or checking count first) → breaks on re-runs. `0118_reminders.sql:126` shows the `INSERT OR IGNORE INTO reminder_system_status (id) VALUES (1)` pattern.
- Referencing a table that was added in a later migration → impossible by numeric ordering, but don't invert the fix by bumping the later migration's number backwards.
- Renaming a migration file after it's been merged → fresh-DB bootstrap skips it (the bootstrap schema only covers up to `LEGACY_MAX_VERSION`), incremental-DB already applied the old name. Add a new migration instead.
- Storing a derived field as a real column (`status`, `trigger_type`, `computed_score`) → guarantees write-drift the moment two writers update the source columns without updating the derived one. Use a view (`0118_reminders.sql:130`) or a generated column.
- Dropping an index "to save space" without checking query plans → if it was a partial index matching a hot WHERE clause, query latency spikes silently. `0118_reminders.sql:42` covers the `completed_at IS NULL AND deleted_at IS NULL` path — that exact predicate must stay supported.
- Running migrations from a REPL without `NODE_ENV=test` → `db.ts::assertSafeDbPath` throws only for the real relay dir, but a fresh DB in `$HOME` can still be corrupted by a half-typed SQL. Use `bun test` against `:memory:` instead.
- Relying on `INSERT OR IGNORE` where `INSERT OR REPLACE` is needed (or vice versa) → IGNORE preserves old rows on UNIQUE conflict; REPLACE clobbers them (and cascades FKs). Pick based on desired semantic.

## Extending

1. Find the highest existing migration number: `ls telegram/src/memory/migrations/ | tail -3`. At time of writing, the tip is `0119_grounding_failures.sql` — so the next migration is `0120_<slug>.sql`.
2. Create `telegram/src/memory/migrations/NNNN_<slug>.sql` with NNNN = max + 1.
3. Write the SQL. Keep it idempotent where SQLite allows; let `migration-runner.ts:214` catch the rest. For specs, cross-reference `.claude/specs/<name>/design.md (DD-NN)` on line 2.
4. Register new tables in `dimensions.ts::LIFE_DIMENSIONS`. Pick the most specific dimension — `system` is a fallback, not a default.
5. Run the smoke test (`NODE_ENV=test bun test src/memory/__tests__/migrations-smoke.test.ts`) AND the coverage test (`bun test src/memory/__tests__/dimension-coverage.test.ts`). Commit both the migration and the `dimensions.ts` edit in the same commit — they're one unit of change.
6. If the new table needs retention, write a decay function following `decay-job.md` and wire it into `runMemoryMaintenance` rather than adding a new scheduler job.
