# /test-harness-add — Scaffold a New Test Helper

Scaffolds a new test helper module under `telegram/tests/` (or co-located) with a matching contract test and a README snippet. The goal is to keep every helper in the harness producing the same shape: typed functional API, `NODE_ENV=test` guard, `getDb()`-only DB access, and a contract test that proves the helper's promises under the per-file runner.

## Usage

- `/test-harness-add <name>` — create shared primitive at `telegram/tests/<name>.ts` + contract test at `telegram/tests/__tests__/<name>.test.ts`
- `/test-harness-add <name> --colocated <src_path>` — co-locate alongside an existing module (e.g. `--colocated src/cloud/calendar-cloud.ts` scaffolds `src/cloud/<name>.ts` + `src/cloud/<name>.test.ts`)

## When to use

- You're about to write a helper that more than one test file will import (shared primitive → `telegram/tests/`).
- A specific module needs scoped test utilities that don't belong in the shared harness (→ co-located next to the module).
- You need a contract test that pins the helper's behaviour so future refactors can't silently regress it.

**Do NOT use for:**
- Adding a new *test case* to an existing file — just edit the file.
- Scaffolding a full mock module (use `mock.module()` inline — see `tests/README.md` mock caveats).
- Anything that needs to open its own `Database` instance. Tests MUST go through `getDb()` so the tmpdir routing + `assertSafeDbPath` guard applies.

## Architectural context (read first)

Before scaffolding, skim these pattern files — they explain the invariants the generated code must satisfy:

- `.claude/patterns/test-harness.md` — why the per-file runner exists, `NODE_ENV=test` at module-top, CI skip-list contract.
- `.claude/patterns/test-db-isolation.md` — `withTx` vs `resetTestDb`, seed factories, `assertSafeDbPath` trap.
- `.claude/patterns/test-module-reset.md` — if the helper caches state at module scope, register a reset callback.
- `.claude/patterns/test-fake-time.md` — if the helper wraps time/timer APIs, mirror the `with*` try/finally restore shape.

The canonical helpers the generated code should look like:

- `telegram/tests/db-helpers.ts` — `withTx` / `resetTestDb` / `seedFact` / `rowCount` (wrap-and-restore, NODE_ENV guard, `getDb()` only).
- `telegram/tests/fake-time.ts` — `withSystemTime` / `withFakeTimers` / `advance` (always-restore on throw via `try/finally`).

## Steps

1. **Confirm scope and location**
   - Shared primitive (importable from ≥2 test files) → `telegram/tests/<name>.ts`.
   - Module-scoped (only tests under `telegram/src/<area>/` need it) → `telegram/src/<area>/<name>.ts` + `<name>.test.ts` (co-located).
   - When in doubt, start shared. Co-located helpers are hard to reuse later.

2. **Confirm `NODE_ENV=test` infra** (already set — don't duplicate)
   - `telegram/tests/setup.ts:14` sets `process.env.NODE_ENV = "test"` at **module-top**.
   - `src/memory/db.ts::getDb` routes to `$TMPDIR/claude-relay-test-<pid>/memory.db` in test mode.
   - `bunfig.toml` preloads `tests/setup.ts` for every test file.
   - You do NOT set `NODE_ENV` in the helper. You GUARD on it.

3. **Scaffold the helper module**

   Template (`telegram/tests/<name>.ts`):

   ```ts
   /**
    * <name> — <one-sentence what it does>
    *
    * Usage:
    *   <short example>
    *
    * Always restores state on exit (including when the block throws).
    * Refuses to run outside NODE_ENV=test.
    */

   // Only import getDb if the helper touches the DB.
   // import { getDb } from "../src/memory/db";

   function assertTestMode(fn: string): void {
     if (process.env.NODE_ENV !== "test") {
       throw new Error(`${fn}() called outside test mode — refusing.`);
     }
   }

   /**
    * Wrap `fn` in the helper's contract. Any state installed by the helper
    * is restored in `finally`, even if `fn` throws.
    */
   export async function with<Name><T>(
     fn: () => T | Promise<T>,
   ): Promise<T> {
     assertTestMode("with<Name>");
     // 1. Install whatever state the helper owns.
     // 2. Snapshot the prior state so you can restore it.
     try {
       return await fn();
     } finally {
       // 3. Restore. ALWAYS. Even on throw.
     }
   }
   ```

   Hard rules:
   - **Functional, not class-based.** No `class` keyword. Export named functions.
   - **DB access goes through `getDb()`.** Never `new Database(...)` — bypasses `assertSafeDbPath` and the schema bootstrap.
   - **Always-restore on throw.** Use `try/finally`, never `try/catch` + re-throw — the latter swallows error metadata.
   - **No top-level side effects.** Module import must not write to the DB or mutate global state.
   - **Module-level singletons?** If the helper keeps a `let`/`Map`/`Set` at module scope, register a reset via `registerModuleReset("tests/<name>", () => {...})` per `patterns/test-module-reset.md`.

4. **Generate the contract test**

   Template (`telegram/tests/__tests__/<name>.test.ts`):

   ```ts
   import { describe, test, expect } from "bun:test";
   import { with<Name> } from "../<name>";

   describe("<name>", () => {
     test("happy path: body runs and returns its result", async () => {
       const result = await with<Name>(async () => {
         // exercise the helper's promise
         return 42;
       });
       expect(result).toBe(42);
       // At least one additional assertion that the side-effect was installed
       // during the block and torn down after.
       expect(/* post-condition */).toBe(/* restored value */);
     });

     test("state is restored even when the body throws", async () => {
       await expect(with<Name>(async () => {
         throw new Error("boom");
       })).rejects.toThrow("boom");
       expect(/* post-condition */).toBe(/* restored value */);
     });

     test("refuses to run outside NODE_ENV=test", async () => {
       const orig = process.env.NODE_ENV;
       process.env.NODE_ENV = "production";
       try {
         await expect(with<Name>(async () => {})).rejects.toThrow(/test mode/i);
       } finally {
         process.env.NODE_ENV = orig;
       }
     });
   });
   ```

   Required coverage (minimum):
   - Happy path — ≥2 assertions (return value + observable side-effect).
   - Throw-propagation + restore — if the helper is a wrap-and-restore pattern (`withTx`, `withFakeTimers`, `withSystemTime`), throw inside the block, assert the error propagates AND the pre-block state is back.
   - `NODE_ENV=production` refusal path — only for helpers that guard on it (drop this case for helpers that legitimately don't, e.g. pure data factories).

5. **Append to `telegram/tests/README.md`**

   Under the existing "Writing tests" section, add a subsection documenting the helper's usage with a short example (mirror the shape of the "Timing-sensitive tests" block). Keep it under ~15 lines — the pattern file is where deeper context lives.

6. **Verify green with the per-file runner**

   ```bash
   cd /Users/frank/Documents/coding/personalassistant/telegram && ./scripts/test-local.sh tests/__tests__/<name>.test.ts
   ```

   (For co-located: `./scripts/test-local.sh src/<area>/<name>.test.ts`.)

   **Never run raw `bun test` at repo root** — per `patterns/test-harness.md`, Bun shares one process across files and `mock.module()` leaks. The per-file runner mirrors CI's behaviour.

## Anti-patterns

- **Opening `new Database(":memory:")` inside the helper.** Bypasses `getDb()`'s tmpdir routing and `assertSafeDbPath` — your helper runs against an orphan handle while the rest of the suite uses the tmpdir DB. Silent divergence.
- **Setting `NODE_ENV = "test"` inside the helper.** Already set at module-top in `tests/setup.ts`. Doing it again masks bugs where a test file forgot to preload setup.
- **Class-based helpers with instance state.** Functional helpers compose; classes fight the `with*` try/finally shape and make reset harder.
- **Try/catch + re-throw.** Swallows stack metadata. Use `try/finally`.
- **Registering the reset callback conditionally (`if (NODE_ENV === "test") registerModuleReset(...)`).** Runs at module load; the condition is checked before any test touches the module. Register unconditionally — the registry only invokes callbacks from the test harness.
- **Skipping the refusal-path test** because "prod will never call this." That's the exact claim the test pins. A future refactor that imports the helper from a non-test file is the bug this test catches.
- **Adding the new test file to `buildspec-test.yml`'s `CI_SKIP` list** to make it pass. See `patterns/test-harness.md`: skips are a last resort with a written reason, not a scaffold default.

## Verification

```bash
cd /Users/frank/Documents/coding/personalassistant/telegram && ./scripts/test-local.sh tests/__tests__/<name>.test.ts
```

Expected: `PASS` for the new file, exit code 0. If it fails, fix the helper or the test — don't relax the contract and don't add to `SKIP`.
