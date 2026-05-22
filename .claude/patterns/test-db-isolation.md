# Test DB Isolation

**When to use:** Any test that writes to SQLite via `getDb()`.
**Canonical example:** `telegram/tests/db-helpers.ts`
**Tests:** `telegram/tests/__tests__/db-helpers.test.ts`
**Related:** [test-harness.md](test-harness.md), [migration.md](migration.md)

Two patterns — pick one per suite. Both refuse to run unless
`NODE_ENV === "test"` (enforced in `db-helpers.ts:36` and `:70`),
and both rely on the tmpdir routing in
`telegram/src/memory/db.ts::getDb` (see test-harness.md).

## A. `withTx` — preferred for zero-state tests

Wraps the block in a SQLite SAVEPOINT that's ALWAYS rolled back,
including on throw (`db-helpers.ts:66-82`).

```ts
import { withTx, seedFact, rowCount } from "../../tests/db-helpers";

test("facts are soft-deleted", () => withTx(async (db) => {
  const id = seedFact({ content: "ephemeral" });
  expect(rowCount("facts")).toBe(1);
  db.prepare("UPDATE facts SET deleted_at = ? WHERE id = ?").run("now", id);
  // ... assertions; rollback happens automatically
}));
```

Best when: tests are independent, no shared fixtures needed.

## B. `resetTestDb` — shared fixtures across a suite

Wipes every non-protected table. Protected set is
`{schema_version, sqlite_sequence, sqlite_master}`
(`db-helpers.ts:25-28`). Foreign keys disabled during the wipe to
avoid ordering headaches.

```ts
import { resetTestDb } from "../../tests/db-helpers";

beforeEach(() => resetTestDb());
```

Best when: setup is expensive and identical across tests in the
file; cheaper than rebuilding from `withTx` each test.

## Seed factories

`seedFact({ content, category?, source?, createdAt?, lastAccessed?,
accessCount? })` returns the new row id (`db-helpers.ts:88-109`).
Use for the `facts` table.

For other tables, raw `db.prepare(...).run()` is fine. Factories
are opt-in; add one only when ≥2 tests want the same shape.

`rowCount(table)` is a cheap assertion helper
(`db-helpers.ts:112-115`).

## Required (acceptance checklist)

- [ ] Test uses `withTx` OR calls `resetTestDb()` in `beforeEach`.
- [ ] No `new Database(...)` calls — bypasses `assertSafeDbPath` +
      schema bootstrap. Use `getDb()`.
- [ ] No hand-rolled `DELETE FROM <table>` — misses FK child rows.
- [ ] Assertions that depend on row ordering use an explicit
      `ORDER BY` (id DESC is stable; anything else is not).
- [ ] Test file never reads from nor writes to the real
      `~/.claude-relay/memory.db` (guarded by `assertSafeDbPath`).

## Anti-patterns

- Shared state across tests without explicit reset → order-dependent
  failures that only show up when tests are reshuffled.
- `new Database(":memory:")` in a suite that uses module-level
  singletons — `getDb()` is cached per-path, so the singleton still
  points at the tmpdir file and your in-memory db is ignored.
- Testing against a real SQLite file on disk (outside tmpdir) →
  flake city; file locks, WAL leftovers, cross-test pollution.
- Relying on row-insertion order without `ORDER BY id DESC` →
  SQLite does not guarantee it.

## Extending

- Adding a seed factory: same shape as `seedFact`, return the row
  id, accept optional timestamp overrides (for time-window tests).
- Exposing a new protected table: add it to `PROTECTED_TABLES` in
  `db-helpers.ts:25-28` if it carries bootstrap state that must
  survive `resetTestDb()`.
- Testing a raw migration: use `:memory:` + `runFileMigrations`
  directly (see [test-migration-smoke.md](test-migration-smoke.md)),
  NOT `getDb()` + `resetTestDb`.
