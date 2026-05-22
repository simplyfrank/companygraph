# Test Generation Skill

Generate test files for any module with correct mock setup, patterns from this codebase, and quality verification.

## Usage

- `/test <path>` — Generate a test file for the given module
- `/test coverage` — Find untested modules, prioritized by risk
- `/test run` — Run tests (changed files, single file, or all)

## Quick Reference

### File Location Conventions

| Source Location | Test Location | Example |
|----------------|---------------|---------|
| `src/memory/finance.ts` | `src/memory/finance.test.ts` | Colocated |
| `src/cloud/scheduler.ts` | `src/cloud/__tests__/scheduler.test.ts` | `__tests__/` subdirectory |
| `src/webapp/routes/backlog.ts` | `src/webapp/routes/backlog.test.ts` | Colocated |
| `src/shared/model-routing.ts` | `src/shared/model-routing.test.ts` | Colocated |

**Rule**: Use `__tests__/` when the source directory already has 10+ files. Otherwise colocate.

### Import Convention

Always import from `bun:test`:
```typescript
import { describe, test, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
```

---

## Step 1: Classify the Module

Read the file. Determine category from its location and imports:

```
Is it in src/memory/?
  → YES → Template A: Memory Module
  → NO ↓

Is it in src/cloud/?
  → YES → Does it import from memory/ AND agent-server/notify?
    → YES → Template B: Cloud Service
    → NO  → Does it export pure functions (no db, no IO)?
      → YES → Template E: Pure Logic
      → NO  → Template B: Cloud Service
  → NO ↓

Is it in src/actions/?
  → YES → Template C: Action Handler
  → NO ↓

Is it in src/webapp/routes/?
  → YES → Template D: Route Handler
  → NO ↓

Is it in src/subagents/?
  → YES → Template F: Subagent
  → NO ↓

Is it in src/shared/ or src/utils/?
  → YES → Template E: Pure Logic
  → NO ↓

Is it in src/local/?
  → Template C: Action Handler (mock macOS/osascript calls)
  → Otherwise → Template E: Pure Logic (default)
```

---

## Step 2: Apply the Template

### Template A: Memory Module

**When**: `src/memory/*.ts` — SQLite persistence modules

**Mock strategy**: Two approaches depending on module coupling.

**Approach 1: Temp RELAY_DIR** (for modules that use `getDb()` from `./db` and init schema lazily)

Based on `finance.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let mod: any;       // the module under test
let dbMod: any;     // ../db module
let tmpRelayDir = "";

beforeAll(async () => {
  tmpRelayDir = await mkdtemp(join(tmpdir(), "MODNAME-test-"));
  process.env.RELAY_DIR = tmpRelayDir;

  // Dynamic import AFTER setting RELAY_DIR — ensures fresh DB
  mod = await import("./MODNAME");
  dbMod = await import("./db");
});

afterAll(async () => {
  try { dbMod.closeDb(); } finally {
    if (tmpRelayDir) await rm(tmpRelayDir, { recursive: true, force: true });
  }
});

describe("MODNAME", () => {
  test("creates and retrieves a record", () => {
    mod.createItem("test-1", "Test Item");
    const item = mod.getItem("test-1");
    expect(item).toBeTruthy();
    expect(item.name).toBe("Test Item");
  });
});
```

**Approach 2: mock.module** (for modules where you need schema control)

Based on `backlog-dependency-graph.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";

let testDb: Database;

mock.module("../db", () => ({
  getDb: () => testDb,
  closeDb: () => testDb.close(),
}));

// Import AFTER mocking
import { createItem, getItem, deleteItem } from "../MODNAME";

function initTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  // Create tables matching the module's schema
  db.exec(`
    CREATE TABLE items (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      key  TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    )
  `);
  return db;
}

describe("MODNAME", () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  test("creates and retrieves a record", () => {
    createItem("test-1", "Test Item");
    const item = getItem("test-1");
    expect(item).toBeTruthy();
    expect(item.name).toBe("Test Item");
  });
});
```

**Choose Approach 1** when the module self-initializes its schema via `migrate.ts`.
**Choose Approach 2** when you need to test against specific schema states or migrations.

---

### Template B: Cloud Service

**When**: `src/cloud/*.ts` — Scheduler, execution queue, lifecycle, etc.

**Mock strategy**: Mock `../../memory/db`, `../notify`, `../agent-server`, and all transitive memory imports.

Based on `scheduler.test.ts` and `execution-queue.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";
import { Database } from "bun:sqlite";

// ── Mock db ──
let testDb: Database;

mock.module("../../memory/db", () => ({
  getDb: () => testDb,
  closeDb: () => testDb.close(),
}));

// ── Mock notify ──
const notifySpy = mock(() => Promise.resolve());
mock.module("../notify", () => ({
  notify: notifySpy,
  sendTelegramDirect: mock(() => Promise.resolve()),
}));

// ── Mock agent-server ──
mock.module("../agent-server", () => ({
  localAgent: { isMethodAvailable: () => false },
}));

// ── Mock anthropic-fallback ──
mock.module("../anthropic-fallback", () => ({
  isApiFallbackAvailable: () => false,
}));

// ── Mock any other transitive imports the module pulls in ──
// Check the module's import statements and mock everything with side effects
mock.module("../../actions/flight", () => ({
  refreshTrackedFlights: mock(() => Promise.resolve()),
}));

// Import AFTER all mocks
import { functionUnderTest } from "../MODULE";

function initTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  // Create tables this cloud module reads/writes
  db.exec(`CREATE TABLE scheduler_runs (...)`);
  return db;
}

describe("MODULE", () => {
  beforeEach(() => {
    testDb = initTestDb();
    notifySpy.mockClear();
  });

  test("description", async () => {
    // Arrange → Act → Assert
  });
});
```

**Critical**: Cloud modules often have many transitive imports. Read the module's `import` block and mock **every** module that has side effects (DB access, network, file IO). Pure utility imports can be left unmocked.

---

### Template C: Action Handler

**When**: `src/actions/*.ts` — Telegram command handlers, business logic

**Mock strategy**: Test exported helpers directly where possible. Mock `ctx` only for command handlers.

Based on `dropbox.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// For actions that use file system
const TEST_DIR = "/tmp/test-action-" + Date.now();

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(join(TEST_DIR, "sample.txt"), "test content");
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// For actions that call agent RPC — mock the agent
import { mock } from "bun:test";

mock.module("../../cloud/agent-server", () => ({
  localAgent: {
    call: mock(async (method: string, params: any) => {
      if (method === "dropbox_list") return { entries: [] };
      return { success: true };
    }),
  },
}));

import { helperFunction } from "../ACTION";

describe("ACTION helpers", () => {
  test("processes input correctly", () => {
    const result = helperFunction("input");
    expect(result).toBeTruthy();
  });
});
```

---

### Template D: Route Handler

**When**: `src/webapp/routes/*.ts` — REST API route handlers

**Mock strategy**: `makeDeps()` factory for request context, mock all memory/cloud dependencies.

Based on `backlog.test.ts`:

```typescript
import { beforeEach, describe, expect, mock, test } from "bun:test";

// ── Define mock objects with typed spies ──
const depMocks = {
  getData: mock((_id: string) => ({ id: "1", name: "Test" })),
  saveData: mock(async (_data: any) => true),
};

const queueMocks = {
  enqueue: mock((_id: string) => {}),
};

// ── Register mocks BEFORE importing handler ──
mock.module("../../memory/MODULE", () => depMocks);
mock.module("../../cloud/execution-queue", () => queueMocks);

// ── Import handler ──
import { handleRoutes } from "./ROUTE";

// ── Request context factory ──
function makeDeps(req: Request, wsBroadcastAll?: ((data: Record<string, unknown>) => void) | null) {
  return {
    url: new URL(req.url),
    req,
    auth: { valid: true, authMethod: "jwt", originAttested: true },
    authContext: null,
    agentRef: null,
    wsBroadcastAll: wsBroadcastAll || null,
  } as any;
}

describe("ROUTE routes", () => {
  beforeEach(() => {
    // Clear all mock call histories
    depMocks.getData.mockClear();
    depMocks.saveData.mockClear();
    queueMocks.enqueue.mockClear();
  });

  test("GET /api/route/items returns data", async () => {
    const req = new Request("http://localhost/api/route/items");
    const res = await handleRoutes(makeDeps(req));

    expect(res).toBeTruthy();
    expect(res?.status).toBe(200);

    const body = await res!.json();
    expect(body.ok).toBe(true);
  });

  test("POST /api/route/create with valid body", async () => {
    const req = new Request("http://localhost/api/route/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Item" }),
    });

    const res = await handleRoutes(makeDeps(req));
    expect(res?.status).toBe(200);
    expect(depMocks.saveData).toHaveBeenCalled();
  });

  test("POST /api/route/create with missing body returns 400", async () => {
    const req = new Request("http://localhost/api/route/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await handleRoutes(makeDeps(req));
    expect(res?.status).toBe(400);
  });
});
```

---

### Template E: Pure Logic

**When**: `src/shared/*.ts`, `src/utils/*.ts` — No side effects, no IO

**Mock strategy**: Minimal or none. Direct import and test.

Based on `model-routing.test.ts`, `mime-types.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { functionA, functionB, SOME_CONSTANT } from "../MODULE";

describe("MODULE", () => {
  test("basic input returns expected output", () => {
    expect(functionA("input")).toBe("expected");
  });

  test("edge case: empty input", () => {
    expect(functionA("")).toBe("default");
  });

  test("boundary value", () => {
    expect(functionB(0)).toBe(false);
    expect(functionB(1)).toBe(true);
  });

  test("constant is populated", () => {
    expect(SOME_CONSTANT.length).toBeGreaterThan(0);
  });
});
```

---

### Template F: Subagent

**When**: `src/subagents/*.ts` — CLI spawning, orchestration

**Mock strategy**: Mock `Bun.spawn` for CLI output, mock agent RPC for streaming.

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock Bun.spawn to simulate CLI output
const spawnMock = mock(() => ({
  stdout: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({
        result: "test output",
        type: "result",
      })));
      controller.close();
    },
  }),
  stderr: new ReadableStream({ start(c) { c.close(); } }),
  exitCode: Promise.resolve(0),
  exited: Promise.resolve(0),
  pid: 12345,
}));

// Mock the global Bun.spawn
const originalSpawn = Bun.spawn;

// Mock agent-server for RPC-based subagents
mock.module("../../cloud/agent-server", () => ({
  localAgent: {
    call: mock(async (method: string, params: any) => {
      if (method === "subagent") return { result: "mock output" };
      return {};
    }),
    isMethodAvailable: () => true,
  },
}));

import { spawnSubagent } from "../spawn";
import type { SubagentInput } from "../types";

describe("subagent spawning", () => {
  beforeEach(() => {
    spawnMock.mockClear();
    Bun.spawn = spawnMock as any;
  });

  afterAll(() => {
    Bun.spawn = originalSpawn;
  });

  test("spawns CLI with correct flags", async () => {
    const input: SubagentInput = {
      agent: "research",
      task: "Analyze topic X",
      context: {},
    };

    const result = await spawnSubagent(input);
    expect(result).toBeTruthy();
    expect(spawnMock).toHaveBeenCalledTimes(1);

    // Verify CLI flags
    const args = spawnMock.mock.calls[0][0];
    expect(args).toContain("--system-prompt");
    expect(args).toContain("--model");
  });
});
```

---

## Step 3: What to Test (Priority Order)

For each module, test in this order:

1. **Happy path** — Primary function works with valid input
2. **Input validation** — Missing/invalid params, empty strings, nulls
3. **Edge cases** — Boundary values, empty collections, max lengths
4. **Error handling** — DB errors, network failures, timeouts
5. **State transitions** — Status changes, lifecycle progression
6. **Integration points** — Correct args passed to mocked dependencies

**Minimum**: Every exported function needs at least one happy-path test.

---

## Step 4: Quality Checklist

Before finalizing any test file, verify ALL of these:

- [ ] **1. Mock ordering**: All `mock.module()` calls appear BEFORE any `import` of the module under test
- [ ] **2. Mock paths**: Paths in `mock.module()` are relative from the TEST file, matching the source file's imports
- [ ] **3. No real IO**: Test does not touch production DB, network, or file system (use `:memory:` or tmpdir)
- [ ] **4. Cleanup**: `afterAll` or `afterEach` cleans up temp dirs, closes DBs, restores globals
- [ ] **5. Isolation**: Each `test()` or `beforeEach` resets state — tests don't depend on execution order
- [ ] **6. Mock clearing**: `mockClear()` called in `beforeEach` for all spies used across tests
- [ ] **7. Assertions**: Every test has at least one `expect()` — no assertion-free tests
- [ ] **8. Async handled**: Async functions use `async/await` in test body (no floating promises)
- [ ] **9. Schema matches**: In-memory DB schema matches the real module's `CREATE TABLE` statements
- [ ] **10. Runs green**: Execute `cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test <file>` and verify pass
- [ ] **11. No imports of test from src**: Test file never imported by production code (convention: `.test.ts` suffix)

---

## Step 5: Running Tests

```bash
# Run a single test file (absolute path)
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test src/memory/finance.test.ts

# Run all tests in a directory
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test src/cloud/__tests__/

# Run all tests
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test

# Run with bail (stop on first failure)
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test --bail src/memory/finance.test.ts

# Run with timeout override
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test --timeout 30000 src/cloud/__tests__/

# Run tests matching a pattern
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test --test-name-pattern "creates.*record"

# Watch mode (re-run on change)
cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test --watch src/memory/finance.test.ts
```

---

## Step 6: Coverage Analysis

### Find untested modules

```bash
cd /Users/frank/Documents/coding/personalassistant/telegram && find src -name "*.ts" -not -name "*.test.ts" -not -name "*.d.ts" -not -path "*__tests__*" -not -path "*node_modules*" | while read f; do base="${f%.ts}"; dir=$(dirname "$f"); name=$(basename "$f" .ts); if [ ! -f "${base}.test.ts" ] && [ ! -f "${dir}/__tests__/${name}.test.ts" ]; then echo "$f"; fi; done | sort
```

### Priority table

| Priority | Category | Modules | Rationale |
|----------|----------|---------|-----------|
| **P0** | Memory | `backlog-local.ts`, `sessions.ts`, `expenses.ts` | Data corruption risk |
| **P0** | Cloud | `execution-queue.ts`, `task-lifecycle.ts` | Core automation loop |
| **P1** | Cloud | `claude-stream.ts`, `anthropic-fallback.ts` | Reasoning pipeline |
| **P1** | Actions | `email-triage.ts`, `backlog.ts`, `flight.ts` | High-frequency user commands |
| **P1** | Routes | `internal.ts`, `email.ts`, `finance.ts` | API surface |
| **P2** | Memory | `facts.ts`, `goals.ts`, `permissions.ts` | Lower churn, simpler logic |
| **P2** | Actions | `pantry.ts`, `pomodoro.ts`, `hn-digest.ts` | Lower risk |
| **P2** | Browser | `engine.ts`, `skills/*.ts` | Hard to unit test (Playwright) |

---

## Common Pitfalls

### 1. Mock path must match the SOURCE file's import, resolved from the TEST file

```typescript
// WRONG — absolute path
mock.module("src/memory/db", () => ({ ... }));

// WRONG — path from project root
mock.module("telegram/src/memory/db", () => ({ ... }));

// RIGHT — relative from the test file to the target module
// If test is at src/cloud/__tests__/scheduler.test.ts
// and source imports from "../../memory/db"
mock.module("../../memory/db", () => ({ ... }));
```

### 2. mock.module() must come BEFORE the import it affects

```typescript
// WRONG — import hoisted above mock
import { getItem } from "../module";
mock.module("../db", () => ({ getDb: () => testDb }));

// RIGHT — mock first, import after
mock.module("../db", () => ({ getDb: () => testDb }));
import { getItem } from "../module";
```

### 3. SQLite datetime format: space-separated, not ISO T

```typescript
// WRONG — expects ISO format
expect(row.created_at).toMatch(/\d{4}-\d{2}-\d{2}T/);

// RIGHT — SQLite datetime('now') produces space-separated
expect(row.created_at).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
```

### 4. Async test bodies must await

```typescript
// WRONG — promise floats, test passes before assertion runs
test("fetches data", () => {
  fetchData().then(data => expect(data).toBeTruthy());
});

// RIGHT
test("fetches data", async () => {
  const data = await fetchData();
  expect(data).toBeTruthy();
});
```

### 5. In-memory DB needs all columns including migration additions

```typescript
// WRONG — missing columns added by later migrations
db.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)`);

// RIGHT — include all columns the production code references
// Check the module's migrate() function AND any ALTER TABLE migrations
db.exec(`CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',    -- added in migration v5
  priority INTEGER NOT NULL DEFAULT 0       -- added in migration v8
)`);
```

### 6. Don't forget to mock transitive side-effect imports

```typescript
// If your module imports scheduler.ts, which imports flight.ts,
// which calls getDb() at module level — you need to mock flight.ts too,
// even if you don't test it directly.

// Check: read every import line in the source file
// Mock: anything that touches DB, network, or file system at import time
```

---

## Shared Test Utilities

Available in `telegram/tests/`:

| Import | Utilities |
|--------|-----------|
| `tests/utils/test-helpers` | `createTestDb()`, `waitFor()`, `sleep()`, `generateTestId()`, `ConsoleCapture` |
| `tests/mocks/database` | `createTestDatabase()`, `seedBacklogData()`, `seedFlightData()`, `seedShoppingData()` |
| `tests/mocks/agent` | `MockAgentClient` (call tracking, configurable responses) |
| `tests/mocks/telegram` | `createMockContext()`, `createMockCallbackContext()`, `MockBot` |
| `tests/mocks/websocket` | `MockWebSocket`, `MockWebSocketServer`, `MockRpcHandler` |
| `tests/mocks` | Barrel re-export of all mock modules |
