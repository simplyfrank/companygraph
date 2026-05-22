# Test Harness

**When to use:** Running tests locally or in CI for any code under `telegram/`.
**Canonical example:** `telegram/scripts/test-local.sh`
**Tests:** `telegram/bunfig.toml`, `telegram/tests/setup.ts`, `buildspec-test.yml:99-132`
**Related:** [test-db-isolation.md](test-db-isolation.md), [test-fake-time.md](test-fake-time.md)

## Why per-file

Bun's test runner shares one process across test files. ~60 files in
this repo use `mock.module()`, and Bun's `mock.restore()` does NOT
undo module mocks — empirically verified. Run in-process → mocks leak
across files → order-dependent failures.

`bunfig.toml:21-23` says it plainly: "bun:test does NOT support
subprocess isolation via config. The `test-local.sh` script loops per
file to mirror CI — use `bun run test`, never raw `bun test`."

## Shape

```bash
# from telegram/
bun run test               # all files, per-file
bun run test:ci            # same + --bail (CI)
bun run test:changed       # only files touched since HEAD~1
bun run test:file <path>   # raw `bun test <path>` — single-file dev loop
./scripts/test-flakes.sh <file> [N=10]   # triage a suspected flake
```

`test-local.sh` invokes `"$BUN" test --bail --timeout 30000 "$tf"`
per file (line 65), prints PASS/FAIL/SKIP, and exits non-zero if any
file failed. Single-file raw `bun test` is safe because one file
cannot leak onto itself.

## DB isolation contract

`src/memory/db.ts::getDb` routes to
`$TMPDIR/claude-relay-test-<pid>/memory.db` when `NODE_ENV=test`
(line 27–28). `assertSafeDbPath` (line 42) throws if a test tries to
open the real `~/.claude-relay/memory.db`.

`tests/setup.ts:13` sets `NODE_ENV=test` at **module-top** —
BEFORE any `beforeAll` runs. This matters: singletons that call
`getDb()` at module load would otherwise latch the prod path first,
and `beforeAll` is too late to retroactively unlatch them.

## CI mirror

`buildspec-test.yml:107` carries the skip list:

```
CI_SKIP="actions/backlog.test.ts|browser/recipe/__tests__/z-execution.test.ts|cloud/__tests__/execution-queue-retry-reflection.test.ts"
```

`test-local.sh:43-47` has the same three files in its `SKIP=()`
array. **Keep them in sync.** If a test is incompatible with the
per-file runner (e.g. depends on cross-file global state), it must
live in BOTH skip lists or CI and local disagree.

## Required (acceptance checklist)

- [ ] Tests do not mutate `~/.claude-relay/memory.db`.
- [ ] `mock.module()` calls carry a comment explaining why `spyOn` or
      a local mock wasn't viable.
- [ ] Sleep-based timing (`await new Promise(r => setTimeout(r, ms))`)
      converted to fake timers where possible (see test-fake-time.md).
- [ ] New test file passes (a) individually via `test:file`, AND
      (b) under `bun run test` with all other files.
- [ ] Adding to CI_SKIP/SKIP is a last resort and carries a code
      comment with the underlying reason.

## Anti-patterns

- Raw `bun test` at repo root → non-deterministic cross-file mock
  leak; tests pass on first author's machine, fail in CI.
- Manual `DELETE FROM <table>` in `beforeEach` → misses FK-related
  rows (see test-db-isolation.md for the correct primitives).
- Top-level `getDb()` at module load in a test file → races with the
  NODE_ENV=test latch in `tests/setup.ts`; import the DB lazily or
  inside `beforeEach`.
- Adding a test to `SKIP` instead of fixing the leak — masks the bug
  and pushes it to a later author.

## Extending

- Adding a new test: default layout is colocated
  (`<file>.test.ts`) or under `__tests__/`. Both are picked up by the
  `find src -name '*.test.ts'` glob in `test-local.sh:39`.
- If a test legitimately can't run in the per-file harness, add it
  to BOTH skip lists AND link the underlying issue/spec from a
  comment above the SKIP entry.
- Changing `TEST_TIMEOUT`: env var on the command line
  (`TEST_TIMEOUT=60000 bun run test`). The bunfig default is 15s
  (see `bunfig.toml:16`); the harness hard cap is 30s.
