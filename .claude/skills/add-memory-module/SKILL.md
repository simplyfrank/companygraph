# Adding a Memory/Persistence Module

Guide for adding a new SQLite-backed persistence layer.

## File: `telegram/src/memory/<name>.ts`

### Template

```typescript
import { getDb } from "./db";

let initialized = false;

function init(): void {
  if (initialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS <table_name> (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- your columns here
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  // Add indexes if needed:
  // db.exec(`CREATE INDEX IF NOT EXISTS idx_<table>_<col> ON <table>(<col>)`);
  initialized = true;
}

// === CRUD Functions ===

export function addItem(data: ItemData): Item {
  init();
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO <table_name> (col1, col2) VALUES (?, ?)
  `);
  const result = stmt.run(data.col1, data.col2);
  return { id: Number(result.lastInsertRowid), ...data };
}

export function getItems(opts?: { filter?: string }): Item[] {
  init();
  const db = getDb();
  let sql = `SELECT * FROM <table_name>`;
  const params: any[] = [];
  if (opts?.filter) {
    sql += ` WHERE col1 = ?`;
    params.push(opts.filter);
  }
  sql += ` ORDER BY created_at DESC`;
  return db.prepare(sql).all(...params) as Item[];
}

export function updateItem(id: number, data: Partial<ItemData>): boolean {
  init();
  const db = getDb();
  const result = db.prepare(`
    UPDATE <table_name> SET col1 = ?, updated_at = datetime('now') WHERE id = ?
  `).run(data.col1, id);
  return result.changes > 0;
}

export function deleteItem(id: number): boolean {
  init();
  const db = getDb();
  const result = db.prepare(`DELETE FROM <table_name> WHERE id = ?`).run(id);
  return result.changes > 0;
}
```

### Key Patterns

1. **Lazy init** — Use `initialized` flag; table created on first access.
2. **`getDb()` singleton** — Always call `getDb()` from `./db`, never create your own connection.
3. **WAL mode** — Already enabled globally in `db.ts`. Supports concurrent reads.
4. **datetime('now')** — SQLite datetime function. Returns UTC space-separated format: `2026-02-10 03:18:43`.
5. **Transactions** — For bulk operations, use `db.transaction()`:
   ```typescript
   const tx = db.transaction((items: Item[]) => {
     for (const item of items) {
       db.prepare(`INSERT INTO ...`).run(item.col1);
     }
   });
   tx(items); // Atomic
   ```

### Schema Migrations

If modifying an existing table after it's been deployed, add a migration in `telegram/src/memory/migrate.ts`:

```typescript
// In the migrations array:
{
  version: NEXT_VERSION,
  up: (db: Database) => {
    db.exec(`ALTER TABLE <table> ADD COLUMN new_col TEXT`);
  },
}
```

Current schema version: check `migrate.ts` for the latest version number. Increment by 1.

### Integration Points

After creating the memory module:

1. **Export from barrel** — Add to `telegram/src/memory/index.ts` if it exists
2. **Use in action** — Import in your action handler: `import { getItems } from "../memory/<name>"`
3. **Use in scheduler** — Import in `cloud/scheduler.ts` for automated processing
4. **Context injection** — Optionally add to `memory/context.ts` to include in Claude prompts

### Common Mistakes

- **Don't use `new Date().toISOString()`** for comparisons with SQLite `datetime('now')` — formats differ (T vs space separator). Use `includes("T")` check if parsing.
- **Don't forget init()** at the start of every exported function.
- **Don't store large blobs** — SQLite row limit is 1GB but performance degrades. Store file paths instead.
- **Don't forget indexes** — Add indexes on columns used in WHERE clauses for tables that will grow large.
