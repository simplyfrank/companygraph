# Migration Smoke Test

**When to use:** Before every deploy — migration pipeline must apply
clean on a fresh DB. Triggered automatically by the test harness.
**Canonical example:** `telegram/src/memory/__tests__/migrations-smoke.test.ts`
**Source under test:** `telegram/src/memory/migration-runner.ts::runFileMigrations`
**Related:** [migration.md](migration.md), [test-harness.md](test-harness.md)

## Why it exists

Migrations run automatically on every EC2 restart after a deploy
(`runFileMigrations` is called from `getDb()` boot). If a new
migration file has a syntax error, references a dropped table, or
collides with a column added by the bootstrap, production boot
fails and the bot is down.

This smoke test catches all four failure modes **before** the
deploy ships.

## Shape

```ts
import { Database } from "bun:sqlite";
import { runFileMigrations } from "../migration-runner";

test("production migration pipeline applies clean on a fresh DB", () => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  expect(() => runFileMigrations(db)).not.toThrow();

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all() as Array<{ name: string }>;
  const names = new Set(tables.map((t) => t.name));

  for (const core of ["facts", "backlog_subtasks", "scheduler_failures", "schema_version"]) {
    expect(names.has(core)).toBe(true);
  }
  db.close();
});
```

Verbatim from `migrations-smoke.test.ts:29-55`.

## Why not just exec each .sql file?

Many pre-bootstrap migrations (versions 1..103) duplicate columns
that the bootstrap now creates directly. Raw
`db.exec(file_contents)` blows up with "duplicate column" errors
or "table already exists".

`runFileMigrations` handles this via `schema_version` gating
(`migration-runner.ts:172-175`): after bootstrap it records
versions 1..`LEGACY_MAX_VERSION` (currently 103) as applied
without actually re-executing them. Only post-legacy migrations
get run. Testing against the raw files misses this logic and
fails for the wrong reason.

## Secondary assertions in the same file

- **Filename pattern** (`migrations-smoke.test.ts:84-88`):
  `^\d{4}_[a-z0-9_]+\.sql$`. Enforces 4-digit prefix + snake_case
  slug.
- **Numeric ordering** (`:57-82`): prefixes parse to strictly
  increasing ints; no duplicates; first prefix is `0`; gaps > 1 are
  permitted up to a small bound.

## Required (acceptance checklist)

- [ ] New migration files match `^\d{4}_[a-z0-9_]+\.sql$`.
- [ ] New migration file prefix is the next integer after the
      current max (check `ls src/memory/migrations/` first — see
      the "verify numeric claims" discipline note in MEMORY.md).
- [ ] Migration smoke test runs as part of the default
      `bun run test` sweep (no SKIP entry).
- [ ] Fresh-DB boot path exercises the new migration — transpile
      alone is not sufficient.

## Anti-patterns

- Writing a separate "smoke test" that exec's each file in order →
  breaks on historical duplicate-column migrations; doesn't test
  the real production boot path.
- Skipping the smoke test because "I only changed one migration" →
  this test also catches dimension-coverage cross-references and
  bootstrap/migration column conflicts.
- Editing an already-applied migration file in place → violates
  the append-only contract; either write a new migration that
  reverses + re-adds, or accept the field/table is immutable.
- Renumbering after merging (to "fix a gap") → another EC2 with the
  old number already applied will skip your renumbered file;
  always append.

## Extending

- New migration: drop `src/memory/migrations/XXXX_description.sql`
  with the next integer prefix. Re-run `bun run test:file
  src/memory/__tests__/migrations-smoke.test.ts` — it should stay
  green. If it doesn't, read the failure and fix the SQL before
  pushing.
- Adding a new "core table must exist" assertion: append to the
  `for (const core of [...])` array at line 50. Keep the list
  short — this is a smoke check, not full schema validation.
