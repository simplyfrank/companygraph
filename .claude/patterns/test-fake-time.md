# Test Fake Time

**When to use:** Tests of `setTimeout` / `setInterval` / `Date.now()` /
scheduled logic (debouncers, retry loops, schedulers, backoff).
**Canonical example:** `telegram/tests/fake-time.ts`
**Tests:** `telegram/tests/__tests__/fake-time.test.ts`
**Related:** [test-harness.md](test-harness.md)

Thin wrappers over bun:test's `setSystemTime` + the jest-compat
`useFakeTimers` surface. Both helpers ALWAYS restore the real clock
on exit, including when the body throws
(`fake-time.ts:38-42, 60-65`).

Why this exists: 20+ tests in this repo previously did
`await new Promise(r => setTimeout(r, 100))` to "let time pass."
Those are real-wallclock-sleep-bound and flake on slow CI.

## Shape A — timer-driven code

```ts
import { withFakeTimers, advance } from "../../tests/fake-time";
import { mock } from "bun:test";

test("debouncer fires at 500ms", () => withFakeTimers(async () => {
  const fn = mock(() => {});
  const debounced = debounce(fn, 500);
  debounced();
  advance(499); expect(fn).not.toHaveBeenCalled();
  advance(1);   expect(fn).toHaveBeenCalledTimes(1);
}));
```

`advance(ms)` throws if called outside `withFakeTimers`
(`fake-time.ts:74-77`). Won't silently sleep on the real clock.

Other drivers:
- `runAllTimers()` — fires every pending timer recursively. Careful
  — loops forever if a timer reschedules itself (`:82-85`).
- `runPendingTimers()` — fires only timers that exist right now
  (`:89-93`).

## Shape B — "now-reading" code

```ts
import { withSystemTime } from "../../tests/fake-time";

test("business hours gate", () =>
  withSystemTime("2026-02-20T14:30:00Z", async () => {
    expect(isBusinessHours()).toBe(true);
  })
);
```

Pins `Date.now()` and `new Date()` without touching the timer
queue. Use when the code reads "now" but doesn't schedule anything.

## When NOT to use fake timers

Not every `setTimeout`-using test wants fake timers. Skip when:
- Sleep is inside a **mock implementation** (the mock's contract
  depends on real timing — forcing fake timers breaks the mock).
- The test uses a **real WebSocket message loop** — the socket's
  own event loop is not driven by jest fake timers.
- **Microtask interleaving is the thing under test** (reliability
  tests); fake timers warp macrotask order and can mask/create bugs.

## Required (acceptance checklist)

- [ ] Imports from `../../tests/fake-time` (adjust relative path
      per test location).
- [ ] Every `advance()` call has at least one assertion between it
      and the next `advance()` — proves progressive state, not just
      the end state.
- [ ] No raw `setTimeout` calls in the test body (the thing you're
      testing can have them; the test itself should not).
- [ ] Fake timers installed per-test, not in `beforeAll`. A leaked
      fake-timer install corrupts every later test in the suite.
- [ ] Advance amounts are exact (`advance(500)`, not `advance(550)`
      "to be safe") — fake timers are deterministic; fuzz is a smell.

## Anti-patterns

- `advance(ms)` with a value meaningfully different from the real
  timeout → either masks off-by-one bugs or passes for the wrong
  reason (e.g. a timer that fires at 499ms by accident).
- Installing fake timers in `beforeAll` without `afterAll(() =>
  jest.useRealTimers())` → leaks into other tests.
- Mixing `withFakeTimers` and real-timer `await` in one test →
  the real-timer await hangs because the event loop is frozen.
- Using fake timers to "speed up" an integration test that actually
  needs real I/O (DB, WebSocket, subprocess).

## Extending

- New helper: follow the `with*` try/finally restore pattern. The
  finally block must run the restore even if `fn` throws.
- Migrating a sleep-based test: replace
  `await new Promise(r => setTimeout(r, N))` with
  `advance(N)` inside a `withFakeTimers` block. Keep the assertion
  after the advance, not inside the sleep.
