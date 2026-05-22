# Module-Level State Reset

**When to use:** any module that holds mutable state outside of `getDb()` —
module-top `let` bindings, `Map`/`Set` singletons, cache TTLs, debounce
timers, single-flight coordinators, cooldown windows. If tests in different
files can observe each other through this state, this pattern is how it gets
reset.

**Canonical example:** `telegram/src/_testing/module-reset-registry.ts`
(the registry itself), `telegram/src/cloud/calendar-cloud.ts:808+`,
`telegram/src/cloud/load-secrets.ts:891+`,
`telegram/src/cloud/anthropic-fallback.ts:2064+`,
`telegram/src/cloud/execution-queue-state.ts:316+`,
`telegram/src/cloud/integrations/imap-idle.ts:412+`,
`telegram/src/cloud/notify.ts:253+`.

**Tests:** `telegram/src/_testing/__tests__/module-reset-registry.test.ts`
and the per-module contract tests that assert reset actually clears state.

**Related:** [test-harness.md](test-harness.md),
[test-db-isolation.md](test-db-isolation.md).

## Shape

Inside the module that holds state, at file scope (NOT inside a function):

```ts
import { registerModuleReset } from "../_testing/module-reset-registry";

// Module-level state that can leak across tests
let caldavAuthBrokenUntil = 0;
const discoveredCalendars = new Map<string, CalendarInfo>();
let discoveryInflight: Promise<void> | null = null;

// ...actual module code...

registerModuleReset("cloud/calendar-cloud", () => {
  caldavAuthBrokenUntil = 0;
  discoveredCalendars.clear();
  discoveryInflight = null;
});
```

The registration runs at module import time. The reset callback runs in
the global `beforeEach` hook set up by `tests/setup.ts`. Test files don't
import the registry directly — they benefit transparently.

## Required (acceptance checklist)

- [ ] Any module with module-top `let` / `Map` / `Set` / timer state
      registers a reset.
- [ ] Registration name matches the module's path under `src/` without the
      `.ts` suffix — e.g. `"cloud/calendar-cloud"`,
      `"cloud/integrations/imap-idle"`.
- [ ] Reset callback clears EVERY piece of mutable state — not just the
      convenient ones. Missing state is a future flake.
- [ ] Reset is synchronous. Async cleanup (closing sockets etc.) belongs
      in `afterAll`, not here — this runs before every test, perf matters.
- [ ] Registration happens unconditionally at module-top, not inside a
      guarded `if` block. `NODE_ENV=test` branching is unnecessary; the
      reset is only invoked by the test harness.
- [ ] A contract test in the module's `__tests__/` verifies the reset
      actually clears each piece of state (see `calendar-cloud.test.ts`
      patterns for the shape).

## Anti-patterns

- **Forgetting to register.** The state-leak test-fail pattern is the
  smoking gun: test A passes alone, test B passes alone, A+B fails because
  A's state leaked into B. If you fix it ad-hoc with a test-local
  `beforeEach`, you've solved A+B but not A+B+C. Register instead.
- **Registering conditionally.** `if (process.env.NODE_ENV === "test") { registerModuleReset(...) }` — runs at module load; by the time the
  condition is checked, nothing has changed. The registry is always safe
  to register into; it only invokes callbacks when test infra calls it.
- **Over-resetting.** Don't clear structures populated at module load time
  (e.g. a lookup table built from a config constant). Those aren't state
  — resetting them means re-running the module or losing data.
- **Resetting the DB.** That's `resetTestDb` / `withTx`'s job — see
  [test-db-isolation.md](test-db-isolation.md). Module-level caches that
  wrap the DB ARE in scope here (clear the cache; next read re-fetches).

## Extending

To add reset for a new module:

1. Identify the module state — grep for module-top `let ` / `const map = new Map` / `const set = new Set` / module-scoped timer handles.
2. Add the `registerModuleReset(...)` call at the bottom of the module
   file. Pass the module path (no `.ts`) as the name.
3. Write a contract test in the module's `__tests__/` directory that (a)
   mutates the state via the public API, (b) calls `resetAllModuleState()`
   from the registry, (c) asserts the state is back to initial.
4. Run `./scripts/test-local.sh src/path/to/module.test.ts` to verify no
   regression.

The registry itself has a contract test at
`src/_testing/__tests__/module-reset-registry.test.ts` — covers idempotent
re-registration, per-callback try/catch isolation, and registry clear for
tests. Read it before extending the registry itself.

## Relationship to other isolation mechanisms

Three concentric scopes of reset in this codebase:

1. **Per-pid tmpdir DB** — `src/memory/db.ts::getDb` routes to
   `$TMPDIR/claude-relay-test-<pid>/memory.db` in test mode. Covers DB
   schema/rows.
2. **Per-test DB state** — `withTx` / `resetTestDb` from
   `tests/db-helpers.ts`. Covers rows within the tmpdir DB.
3. **Per-test module state** — this registry. Covers in-memory singletons
   that `getDb` can't touch.

Together they compose into the full "fresh state at every test" guarantee
that per-file CI isolation used to give us via subprocess reinvocation.
