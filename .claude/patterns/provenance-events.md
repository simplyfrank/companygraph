# Provenance events

**When to use:** A memory-bearing module reads or writes a long-term record — facts, tasks, emails, calendar entries, documents. Every lifecycle edge (learned, accessed, superseded, decayed, contradicted, purged) should flow through `recordMemoryEvent` so retention and audit jobs can traverse the history.
**Canonical example:** `telegram/src/memory/memory-events.ts:66` (the writer), `telegram/src/memory/context-retrieval.ts:93` (`recordAccessProvenance` — emits `accessed` events for items that survive the retrieval cap), `telegram/src/memory/working-memory.ts:99` (emits `learned` on `setWorking`), `telegram/src/memory/memory-decay.ts:68` (emits `decayed` inside the decay transaction).
**Tests:** `telegram/src/memory/__tests__/memory-decay.test.ts:44` (asserts event emission shape), `telegram/src/memory/__tests__/working-memory.test.ts`.
**Related:** `memory-module.md`, `decay-job.md`, `registry.md` (dimensions), `domain-ledger.md` (the inner-primitive contract — provenance-events here governs the call-site try/catch swallow; domain-ledger governs the table-write+bus-emit primitive).

## Shape

```ts
import { recordMemoryEvent } from "./memory-events";
import type { LifeDimension } from "./dimensions";

// On write:
try {
  recordMemoryEvent({
    dimension: "knowledge",        // LifeDimension key
    kind: "learned",               // learned | accessed | superseded | decayed | contradicted | purged
    sourceTable: "facts",          // real SQL table the event references
    sourceId: factId,              // PK in sourceTable (string | number — will be String()-coerced)
    factId: factId,                // when the record IS a fact, both fields point at it
    detail: "extracted from reflection", // optional free text for human debugging
  });
} catch {
  // telemetry must never break the caller — swallow silently
}
```

The event kinds carry specific meanings:

- `learned` — new record inserted into the memory layer (first write).
- `accessed` — record was retrieved and surfaced in a context assembly; used by decay to keep hot records alive. Emit only for records that were actually *included* in the output, not every candidate scored (see `context-retrieval.ts:85` — events fire AFTER the `maxPerSource` diversity cap).
- `superseded` — a newer record replaced this one (e.g. fact content got re-written with same source_id).
- `decayed` — soft-deactivated by a retention job. Must be emitted *inside* the same transaction that flips `active = 0` (see `memory-decay.ts:66`) so the audit log never disagrees with the state.
- `contradicted` — conflict-resolution flagged the record (reserved for future conflict detection).
- `purged` — hard-deleted (rare; most retention is soft-delete).

When the underlying `source_table` is not `facts`, leave `factId` null — the `idx_memevt_fact` index has `WHERE fact_id IS NOT NULL` (`memory-events.ts:57`), so null rows don't bloat it.

### Read surface

Three query helpers are exported from `memory-events.ts`:

- `getMemoryEvents({ dimension, kind, sourceTable, sourceId, factId, since, limit })` — general filtered fetch (`:94`).
- `getMemoryEventCounts({ dimension, since })` — aggregates by kind, always returns all six kinds (zero-filled) — useful for dashboards (`:124`).
- `getFactProvenance(factId)` — last-50 events for a fact, ordered newest-first (`:149`).

`pruneMemoryEvents(daysToKeep = 90)` (`:154`) is the retention entry point — called from `runMemoryMaintenance` at 3 AM (`memory-decay.ts:102`). Don't call it from anywhere else.

## Required (acceptance checklist)

- [ ] Every `recordMemoryEvent` call is wrapped in `try/catch` (or inside a function that swallows) — telemetry never breaks the caller (`context-retrieval.ts:108`, `working-memory.ts:106`).
- [ ] `decayed` events emit inside the same transaction as the soft-delete, not after. `memory-decay.ts:66` shows the `db.transaction(() => { UPDATE...; for (c of candidates) recordMemoryEvent(...) })` shape.
- [ ] `accessed` events fire for records that actually make it into the output, not every candidate scored — otherwise the `accessed` count becomes meaningless for retention decisions.
- [ ] `dimension` uses a key from `LIFE_DIMENSIONS` (`dimensions.ts:42`). Ad-hoc strings make `getMemoryEventCounts({ dimension })` aggregations unreliable.
- [ ] `source_id` is coerced to string at the write site — `memory-events.ts:83` does `String(opts.sourceId)` so numeric PKs and UUID strings co-exist.
- [ ] Retention: `pruneMemoryEvents(90)` runs from `runMemoryMaintenance` at 3 AM daily — don't let the table grow forever. See `decay-job.md`.

## Schema and indexes

`memory_events` is created lazily by `ensureTable()` on first `recordMemoryEvent` call (`memory-events.ts:40`) — one of the few places the lazy-ensureTable shape is still correct, because this module must be callable from any other memory module (including ones that run before migrations complete on a fresh DB). Four indexes back the common access paths: `(dimension, kind)`, `(source_table, source_id)`, `fact_id WHERE NOT NULL`, `created_at`. Don't add new indexes without measuring — the table is write-heavy.

## Anti-patterns

- Emitting an `accessed` event for every candidate the retrieval layer scored (not just the survivors) → diversity cap becomes invisible to retention. Fire AFTER the cap, not inside the search adapter. `context-retrieval.ts:85` is the reference.
- Raising from inside `recordMemoryEvent` and letting it propagate to the caller → telemetry outage becomes a feature outage. Always `try/catch` at the call site.
- Writing synchronously in a tight retrieval hot path without a batch pathway → at current volumes (≈5–20 events per user turn) this is fine; if it stops being fine, add an in-memory buffer + flush, not a second code path. One emitter only.
- Emitting `decayed` events separately from the row update → if the transaction rolls back the UPDATE but the event already wrote, the log lies. Always emit INSIDE the transaction.
- Using a free-form dimension string that isn't in `LIFE_DIMENSIONS` → breaks dimension-scoped queries silently.
- Omitting `factId` for events whose `source_table` is `facts` → the `getFactProvenance(factId)` lookup (`memory-events.ts:149`) returns nothing; provenance traversal goes blind.
- Populating `detail` with JSON blobs or long strings → the column is free-text for humans scanning logs; structured metadata belongs in dedicated columns. Keep detail under ~80 chars. `memory-decay.ts:75` shows the reference shape: `` `inactive>${inactiveDays}d access<=${maxAccess} cat=${c.category}` ``.

## Extending

1. Identify the lifecycle edge(s) in your module that deserve an event. Typical set for a new domain: `learned` (insert), `accessed` (retrieval survivor), `decayed` (retention), `superseded` (conflict-overwrite).
2. Wrap each emit in `try { recordMemoryEvent(...) } catch {}`.
3. Pick the right `LifeDimension` — it determines which retention/audit queries see the event. If your module spans dimensions, emit one event per dimension-specific edge rather than one `dimension: "multi"` event.
4. If you're adding a retention job (`decay-job.md`), ensure the `decayed` emit lives inside the decay transaction.
5. For retrieval surfaces: follow the `context-retrieval.ts:87` shape — score, cap, emit events only for survivors. Emitting before the cap poisons decay's access-count signal.
6. Test the emission with `getMemoryEvents({ kind, factId })` in the unit test — see `memory-decay.test.ts:44` for the minimal assertion.
