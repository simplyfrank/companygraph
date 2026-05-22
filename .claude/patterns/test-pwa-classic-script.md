# PWA Classic-Script Test

**When to use:** Testing `pwa/components/*.js` files.
**Canonical example:** `pwa/__tests__/fetch-dedup.test.ts` (13 tests)
**Tests:** `pwa/__tests__/chat-state.test.ts` (16),
`pwa/__tests__/widget-engine.test.ts` (15),
`pwa/__tests__/chat-connection-backoff.test.ts` (16)
**Related:** [pwa-view.md](pwa-view.md)

PWA components are **classic `<script>` files** that attach to
`window`. They don't ES-export. The test harness loads the source
text, evaluates it in a sandbox `new Function(...)`, and exercises
exposed symbols via the stub window.

## Shape

```ts
import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(import.meta.dir, "..", "components", "my-component.js"),
  "utf-8",
);

function loadModule() {
  const win: any = {};
  const location = { origin: "https://app.example.com" };
  // Evaluate the script with window/location bound; everything the
  // component attaches to `window` shows up on our stub.
  new Function("window", "location", SRC)(win, location);
  return win;
}

describe("my-component", () => {
  let mod: any;
  beforeEach(() => { mod = loadModule(); });

  test("exposes its API on window", () => {
    expect(typeof mod.myExportedFn).toBe("function");
  });
});
```

See `fetch-dedup.test.ts:20-38` for the canonical sandbox form.

## Extending the stub

Components reach out to DOM/browser globals beyond `window`:
- `document` — minimal `{ createElement, body, getElementById }`
  stubs; regex-based innerHTML assertions are fine for most unit
  tests.
- `localStorage` / `sessionStorage` — `new Map()`-backed shim.
- `navigator` — `{ onLine: true, language: "en-US" }`.
- `WebSocket` — a `FakeWS` class (see
  `chat-connection-backoff.test.ts:70-` for an exemplar with
  `_triggerOpen`, `_triggerClose`, `_triggerMessage` helpers).
- `fetch` — `mock(async () => ({ ok: true, json: async () => ({}) }))`.

Add only what the script touches — a missing stub surfaces as a
cryptic "X is not a function" on load, not at the use site.

## Fake timers

For reconnect/backoff/keepalive tests use bun:test's jest-compat
`jest.useFakeTimers()` / `jest.advanceTimersByTime(ms)` directly
(the `tests/fake-time.ts` helper lives in `telegram/`, not
`pwa/`). See `chat-connection-backoff.test.ts:21`.

## Required (acceptance checklist)

- [ ] Component is loaded via `readFileSync` + `new Function`, not
      imported as an ES module.
- [ ] Stub window is per-test (`beforeEach` re-creates it) — module
      state does NOT cross tests.
- [ ] If the component adds jitter via `Math.random`, the stub
      pins it: `win.Math = { ...Math, random: () => 0.5 }`.
- [ ] Every global the script reads is stubbed before evaluation
      (otherwise the eval itself throws).
- [ ] Test lives under `pwa/__tests__/` (matches the harness glob).

## Anti-patterns

- `import { foo } from "../components/my-component"` → classic
  scripts are not ES modules; the import will fail or return
  undefined exports.
- Using jsdom / happy-dom / playwright for unit tests → heavy,
  slow, and the regex/stub approach suffices for 95 % of cases.
- Relying on real `Math.random()` in jitter-carrying code →
  non-deterministic; the `chat-connection-backoff` suite pins it.
- Re-using the `win` stub across tests — state leaks (in-flight
  maps, cache entries) and you'll chase ghosts.

## Extending

- New PWA component test: copy the 3-line `SRC` + `loadModule`
  block from `fetch-dedup.test.ts:20-38`, extend the stub with
  whatever globals your component touches, done.
- If the component genuinely needs DOM layout (geometry, scroll),
  escalate to a browser-based test harness (Playwright). Do NOT
  try to stub layout — that way lies madness.
