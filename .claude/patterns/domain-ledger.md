# Domain ledger

The internal contract for **per-domain ledger primitives** that record an event into a per-domain SQLite table AND emit a typed bus event so cross-subsystem consumers see the same signal. Composes with `provenance-events.md` (which governs the call-site contract) without contradicting it.

**Related:** `provenance-events.md`, `memory-module.md`, `migration.md`.

## Shape

A domain-ledger primitive is the function that owns a per-domain `*_events` table. It exposes a single `record<X>Event(input)` (or insert-style equivalent) entry point and combines two operations inside ONE `db.transaction()`:

1. INSERT a row into the per-domain table.
2. Emit a typed `bus.emit("<domain>:<verb_past>", payload)` for cross-subsystem fanout.

```ts
import { getDb } from "./db";
import { bus } from "../events";

export function recordWidgetEvent(input: WidgetInput): number {
  return getDb().transaction(() => {
    const result = getDb().prepare(`
      INSERT INTO widget_events (kind, target_id, ts)
      VALUES (?, ?, datetime('now'))
    `).run(input.kind, input.targetId);
    const id = Number(result.lastInsertRowid);
    bus.emit("widget:recorded", {
      kind: input.kind,
      targetId: input.targetId,
      ts: new Date().toISOString(),
    });
    return id;
  })();
}
```

## What the transaction wrap actually buys

The wrap is a **structural marker**, not a meaningful atomicity guarantee against bus errors. Two things to be honest about:

1. **`bus.emit()` silently absorbs handler errors.** Both `invokeBestEffort` and `invokeReliable` (`telegram/src/events/bus.ts:101-169`) catch handler exceptions, attach `.catch` to async results, and never re-throw. So a bus emit that "fails" because a subscriber threw will NOT roll back the transaction.

2. **Reliable handlers are async-scheduled** via `void this.invokeReliable(...)` — the emit returns BEFORE any reliable handler has a chance to run, so even if a future bus version added a re-throw path, the transaction commits before reliable handlers see the payload.

What the wrap DOES give you:
- The INSERT and the emit are co-located in source. Contributors can't accidentally emit BEFORE the INSERT or skip the emit on the success path.
- The emit always runs AFTER the INSERT in source-order. Subscribers can rely on "if this event fired, the row exists" (modulo the SQLite WAL flush, which is a separate concern).
- Transactional rollback fires only for genuinely-broken bus state — e.g. the `listeners` Map was mutated during iteration and `.get()` itself throws. In that case the row also rolls back, which is the right behavior.

## Required (acceptance checklist)

- [ ] **Single `db.transaction()` wrap.** The INSERT and the `bus.emit()` are inside the same transaction body. No `await` inside the transaction (SQLite `db.transaction()` is sync).
- [ ] **EventMap declaration.** The emit's first arg is a string literal that's declared in `telegram/src/events/types.ts`'s `EventMap` AND listed in `EVENT_NAMES`. The `bus.emit()` call MUST type-check; the `event-names-parity.test.ts` test enforces forward + reverse parity.
- [ ] **`<domain>:<verb_past>` naming.** Event keys read naturally as a sentence: `memory:recorded`, `agent:lifecycle_recorded`, `auth:refresh_logged`, `wardrobe:wear_recorded`. Avoid abstract nouns (`agent:event_recorded` reads worse than `agent:lifecycle_recorded`).
- [ ] **Caller wraps in `try/catch`.** Per `provenance-events.md` the call site wraps the entire `record<X>Event(...)` invocation in a try/catch so telemetry never breaks the caller's primary flow. The two patterns compose: provenance-events governs the OUTER contract (try/catch swallow); domain-ledger governs the INNER primitive (transactional write+emit).
- [ ] **Coverage test exists.** A test asserts that calling the primitive emits the correct event exactly once. Lives in `events/__tests__/record-event-emit-pairing.test.ts`.

## Schema and indexes

The per-domain table schema is owned by the domain's memory module — domain-ledger doesn't dictate it. Recommended columns: a synthetic primary key, a `kind` discriminator, a foreign-key-like `target_id` or `subject_id` to the entity the event is about, a `ts` timestamp (UTC, ISO-8601), and any per-event payload fields the domain needs.

Indexes: pick to match the queries the domain needs (e.g. by `target_id` for "show all events for entity X", or by `ts` for "purge old rows"). The pattern doesn't prescribe.

Retention: most ledger tables have a per-domain decay job (see `decay-job.md`). The pattern doesn't prescribe a retention policy — whatever is appropriate for the domain.

## Anti-patterns

| Don't | Why |
|-------|-----|
| Emit OUTSIDE the transaction | Loses the "successful write implies emitted event" reading. A row could exist with no event fired if the emit throws on a synchronous handler. |
| Emit a type with no `EventMap` declaration | TS error at compile time. The `event-names-parity.test.ts` enforces the reverse (declared but never emitted). |
| `await` inside the transaction body | SQLite `db.transaction()` is synchronous — `await` inside breaks the transaction wrap. The bus's reliable-handler scheduling is `void`-fire-and-forget so this is moot, but adding `await someAsyncWork()` between INSERT and emit defeats the wrap. |
| Throw on emit failure to "force rollback" | The bus silently absorbs handler errors anyway (see "What the transaction wrap actually buys"). Trying to wire a re-throw path is fighting the bus's design. |
| Bypass the `try/catch` wrap at the call site | Violates `provenance-events.md`. Telemetry must never break the caller's primary flow. |

## Extending

Adding a new domain-ledger primitive:

1. Pick the per-domain table schema (per the schema-and-indexes guidance above) and ship a numbered migration if needed.
2. Add the new `<domain>:<verb_past>` key to `EventMap` in `telegram/src/events/types.ts` AND to `EVENT_NAMES` (both directions).
3. Author the `record<X>Event()` function following the canonical shape above.
4. Update existing call sites OR add new ones — wrap each in `try/catch` per `provenance-events.md`.
5. Add a coverage test in `events/__tests__/record-event-emit-pairing.test.ts` that asserts the primitive emits the correct event.
6. Update this file's "current consumers" list below if you want, but it's optional documentation.

## Current consumers (event-backbone-redesign T-06..T-09)

| Module | Primitive | Event |
|--------|-----------|-------|
| `memory/memory-events.ts` | `recordMemoryEvent` | `memory:recorded` |
| `memory/agent-events.ts` | `recordAgentEvent` | `agent:lifecycle_recorded` |
| `memory/claude-auth-events.ts` | `projectFromAuthEvent` | `auth:refresh_logged` (success branch only — function has early-returns for non-`token_refresh` events; emit lives inside the success branch only, not on early-returns) |
| `memory/wardrobe-wear-events.ts` | `insertWearEvent` (alias `recordWearEvent`) | `wardrobe:wear_recorded` |
