# Refactoring Guide

Structured approach for safely refactoring this codebase while preserving behavior.

## Before You Start

### 1. Identify the Scope

Determine refactoring type:

| Type | Risk | Approach |
|------|------|----------|
| **Extract module** — split large file into focused modules | Medium | Move functions + re-export from original |
| **Rename/move** — change names or file locations | Low | Update all import sites, grep for string refs |
| **Simplify** — reduce complexity in a single function | Low | Preserve interface, change internals |
| **Restructure** — change how modules interact | High | Plan mode first, test at each step |
| **Dead code removal** — remove unused exports/functions | Low | Grep all callers first, verify zero hits |

### 2. Pre-Flight Checks

```bash
# Transpile check (baseline — must pass before AND after)
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun build src/cloud/relay.ts --no-bundle > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# Count current import sites for the module being refactored
grep -r "from.*<module>" telegram/src/ --include="*.ts" | wc -l
```

### 3. Know the Big Files

These are the maintenance hotspots — prime candidates for extraction:

| File | Lines | Extraction Targets |
|------|-------|--------------------|
| `webapp-server.ts` | 10k+ | Route groups → separate router files |
| `relay.ts` | 2k+ | Command routing, scheduler setup, bot config |
| `backlog-local.ts` | 1.4k+ | Blocking reasons, deliverables, stakeholders → own modules |
| `execution-queue.ts` | 1.2k+ | Prompt builder, deliverable validation, notifications |
| `local/agent.ts` | 1.3k+ | RPC method handlers by category |

## Refactoring Patterns

### Pattern A: Extract Module (split large file)

The safest and most common refactor. Keeps backward compatibility via re-exports.

**Steps:**

1. **Create new file** with extracted functions:
   ```typescript
   // telegram/src/cloud/execution-queue-validation.ts (NEW)
   import { getDeliverablesBySubtask, ... } from "../memory/backlog-local";

   export function validateDeliverablesBlocking(...) { ... }
   export function matchDeliverableStructured(...) { ... }
   ```

2. **Re-export from original** for backward compat:
   ```typescript
   // telegram/src/cloud/execution-queue.ts (EXISTING)
   // Replace function definitions with re-exports
   export { validateDeliverablesBlocking, matchDeliverableStructured }
     from "./execution-queue-validation";
   ```

3. **Update direct imports** — any file that imported from the original can stay as-is (re-exports handle it), but new code should import from the extracted module directly.

4. **Transpile check** after each file change.

**Naming convention:** `<original>-<domain>.ts`
- `execution-queue-validation.ts`
- `execution-queue-notifications.ts`
- `backlog-deliverables.ts`
- `backlog-blocking.ts`

### Pattern B: Extract Route Group (webapp-server.ts)

For the 10k+ line webapp-server, extract route handlers by domain:

```typescript
// telegram/src/routes/backlog-routes.ts (NEW)
import type { Server } from "bun";

export function registerBacklogRoutes(
  router: Map<string, (req: Request) => Response | Promise<Response>>,
  deps: { getDb: Function; ... }
): void {
  router.set("GET /api/backlog/items", async (req) => { ... });
  router.set("POST /api/backlog/add", async (req) => { ... });
  // ...
}
```

### Pattern C: Rename / Move

1. **Grep for ALL references** (imports, string literals, comments):
   ```bash
   grep -rn "old_name" telegram/src/ pwa/ --include="*.ts" --include="*.js"
   ```
2. **Update imports** — use `replace_all` for bulk rename in each file.
3. **Check callback data** — Telegram callback prefixes are in `ui/callbacks.ts` routing and throughout action handlers. Max 64 bytes.
4. **Check scheduler job names** — `getLastRun("job_name")` / `markRun("job_name")` strings in `scheduler.ts`.
5. **Check PWA API paths** — `pwa/` files reference `/api/...` paths as strings.

### Pattern D: Dead Code Removal

1. **Grep for the export name** across all source:
   ```bash
   grep -rn "functionName\|ClassName" telegram/src/ pwa/ --include="*.ts" --include="*.js"
   ```
2. **Check dynamic imports** — this codebase uses `await import(...)` extensively:
   ```bash
   grep -rn "import.*<module>" telegram/src/ --include="*.ts"
   ```
3. **Check RPC method maps** — `local/agent.ts` has a methods object that dispatches by string name.
4. **Check callback routing** — `ui/callbacks.ts` routes by prefix string.
5. **Only remove if zero external references** after accounting for all the above.

## Project-Specific Rules

### Import Style
- Use relative paths: `../memory/backlog-local` not `@/memory/backlog-local`
- Type-only imports: `import type { X } from "..."` for interfaces/types
- Barrel exports: NOT used in this project — import from specific files

### Module Boundaries
- `memory/` modules must not import from `cloud/` or `actions/` (data layer is dependency-free)
- `cloud/` can import from `memory/` and `actions/`
- `actions/` can import from `memory/` and `cloud/`
- `local/` can import from `memory/` but not `cloud/` (runs on different machine)
- `pwa/` is vanilla JS — no TypeScript, no build step, no npm imports

### SQLite Considerations
- `getDb()` is a singleton — safe to call from any module
- Lazy `init()` pattern: tables created on first access, not at import time
- Migrations in `migrate.ts` run at startup — use for schema changes to existing tables
- `CREATE TABLE IF NOT EXISTS` for new modules (idempotent)

### Side Effects at Import
- **NEVER** execute side-effects at module top-level (learned the hard way with `import.meta.main`)
- Functions like `connect()`, `startPolling()`, `main()` must be guarded:
  ```typescript
  if (import.meta.main) { main(); }
  ```
- Scheduler setup, bot.start(), WebSocket connections — all gated behind explicit init calls

### Callback Data Budget
- Telegram callbacks: max **64 bytes** total for `callback_data`
- Format: `prefix:action:param` — keep prefix to 1-3 chars
- Check `ui/callbacks.ts` switch statement for existing prefixes before adding new ones

## Verification Checklist

After every refactoring session:

```bash
# 1. Transpile check
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun build src/cloud/relay.ts --no-bundle > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 2. Check no orphaned imports (files importing removed exports)
/Users/frank/.bun/bin/bun build src/local/agent.ts --no-bundle > /dev/null 2>&1 && echo "Agent OK" || echo "Agent FAIL"

# 3. Verify re-exports work (if you extracted modules)
grep -rn "from.*<extracted-module>" telegram/src/ --include="*.ts" | head -5
```

## Anti-Patterns to Avoid

1. **Don't create barrel files** (`index.ts` re-exporting everything) — this project doesn't use them and they cause circular import issues with lazy init
2. **Don't introduce abstractions for single-use code** — three similar lines is better than a premature helper
3. **Don't refactor and add features simultaneously** — one or the other per commit
4. **Don't move code between cloud/ and local/** — they run on different machines with different capabilities
5. **Don't rename SQLite columns** — use migrations to ADD columns; old columns stay for backward compat
6. **Don't change callback data formats** without checking all inline_keyboard references across actions/
7. **Don't reorganize pwa/ file structure** — the service worker precache list (`sw.js`) and `index.html` script tags must match exactly
