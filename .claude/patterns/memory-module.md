# Memory module

**When to use:** New SQLite persistence layer — a table (or small group of tables) with CRUD over `~/.claude-relay/memory.db`.
**Canonical example:** `telegram/src/memory/facts.ts:22` (CRUD over `facts`), `telegram/src/memory/memory-events.ts:38` (lazy `ensureTable` pattern), `telegram/src/memory/working-memory.ts:40` (pure-TTL in-memory variant when no persistence is wanted).
**Tests:** `telegram/src/memory/facts.test.ts`, `telegram/src/memory/__tests__/<module>.test.ts`, `telegram/src/memory/__tests__/dimension-coverage.test.ts`
**Related:** `migration.md`, `provenance-events.md`, `decay-job.md`, `test-db-isolation.md`

## Shape

```ts
// telegram/src/memory/<module>.ts
import { getDb } from "./db";
import { recordMemoryEvent } from "./memory-events"; // only if emitting lifecycle events

export interface Thing {
  id: number;
  name: string;
  created_at: string;
  active: number;
}

// Lazy init — only when no migration owns the table (rare; prefer a migration).
let initialized = false;
function ensureTable(): void {
  if (initialized) return;
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS things (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  )`);
  initialized = true;
}

export function addThing(name: string): number {
  const db = getDb();
  const r = db.prepare("INSERT INTO things (name) VALUES (?)").run(name);
  return Number(r.lastInsertRowid);
}

export function getThings(opts?: { limit?: number }): Thing[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, name, created_at, active FROM things WHERE active = 1 ORDER BY created_at DESC LIMIT ?"
  ).all(opts?.limit ?? 100);
  return rows as Thing[];
}

export function removeThing(id: number): boolean {
  const db = getDb();
  const r = db.prepare("UPDATE things SET active = 0 WHERE id = ?").run(id);
  return r.changes > 0;
}
```

Parameters go through `.run(?, ?, ?)` / `.all(?, ?)` — never template strings for user input. Imports come from `./db` (for persistent state) or only `./memory-events` (for TTL-only modules like `working-memory.ts`). Exports are a small flat API: `add*`, `get*`, `list*`, `update*`, `remove*`. The typed interface sits at the top of the file so callers import it alongside the functions.

## Required (acceptance checklist)

- [ ] Imports `getDb` from `./db` — never `new Database(...)`.
- [ ] Each table is created by a file migration in `src/memory/migrations/NNNN_<slug>.sql`. Prefer migration over lazy `ensureTable()` — the latter is only for modules that must run before migrations complete (e.g. `memory-events.ts:40`).
- [ ] Every table name is registered in `telegram/src/memory/dimensions.ts::LIFE_DIMENSIONS` under the right dimension — the `__tests__/dimension-coverage.test.ts:43` test hard-fails otherwise.
- [ ] Exported API is typed at the top of the file (Fact-style interface), not scattered.
- [ ] All SQL uses `db.prepare(...).run|all|get(...)` with `?` placeholders. No template-string interpolation of user input.
- [ ] If the module touches long-term memory (fact-equivalent), emit `recordMemoryEvent({ kind: "learned"|"accessed"|... })` on the relevant lifecycle edges. See `provenance-events.md`.
- [ ] Tests live at `src/memory/<module>.test.ts` or `src/memory/__tests__/<module>.test.ts` and use `withTx`/`resetTestDb` from `telegram/tests/db-helpers.ts:35` — no `RELAY_DIR` override except for the two existing setups that predate `tests/db-helpers.ts` (`facts.test.ts:23` is one — don't copy that any more).
- [ ] If the table needs retention, add a decay hook (see `decay-job.md`).

## Anti-patterns

- `new Database(path)` inside a memory module → bypasses WAL tuning, assertSafeDbPath, migration runner. Always use `getDb()`.
- Creating tables with a lazy `ensureTable()` AND a migration → the migration is source-of-truth; lazy init drifts.
- Forgetting the `dimensions.ts` entry → `dimension-coverage.test.ts` turns CI red. The fix is to register the table, not to append to `ALLOW_LIST`. `ALLOW_LIST` is only for FTS shadow tables and rename-new-table migration artifacts (`telegram/src/memory/__tests__/dimension-coverage.test.ts:21`).
- Storing JSON blobs in opaque `TEXT` columns and shipping parsers everywhere — prefer normalized columns; use JSON only for genuine free-form metadata.
- Mutating `~/.claude-relay/memory.db` in tests because `NODE_ENV=test` was forgotten. `db.ts::assertSafeDbPath` will throw if you try — don't try to bypass it.

## Extending

1. Write the migration (`migration.md`) — that creates the table.
2. Add the table to a dimension in `dimensions.ts::LIFE_DIMENSIONS`.
3. Write the module file with the Shape above.
4. Write the test file; `beforeEach(() => resetTestDb())` for suite-level isolation, or `test(..., () => withTx(...))` for per-test rollback.
5. Run `NODE_ENV=test bun test src/memory/__tests__/<module>.test.ts` — and run `src/memory/__tests__/dimension-coverage.test.ts` separately to catch registry drift.
