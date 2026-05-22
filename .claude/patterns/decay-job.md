# Decay job (retention + soft-delete)

**When to use:** A table accumulates rows whose usefulness fades over time (old inactive facts, expired working memory, stale cache rows) and needs scheduled soft-deletion with audit trail.
**Canonical example:** `telegram/src/memory/memory-decay.ts:37` (`decayInactiveFacts`), `telegram/src/memory/memory-decay.ts:98` (`runMemoryMaintenance` orchestrator), scheduled from `telegram/src/cloud/scheduler-jobs/maintenance.ts:499` (`daily_maintenance` at 3 AM, calling `runMemoryMaintenance()` at `:540`).
**Tests:** `telegram/src/memory/__tests__/memory-decay.test.ts`.
**Related:** `memory-module.md`, `provenance-events.md`, `scheduler-job.md`.

## Shape

```ts
import { getDb } from "./db";
import { recordMemoryEvent } from "./memory-events";

export interface DecayOpts {
  inactiveDays?: number;                    // default 90
  maxAccessCount?: number;                  // default 1
  protectedCategories?: readonly string[];  // default ["lesson", "person", "preference"]
  batchLimit?: number;                      // default 500 — cap rows touched per run
}

export interface DecayResult {
  candidates: number;
  decayed: number;
  protected: number;
  cutoff: string;
}

const DEFAULT_PROTECTED = ["lesson", "person", "preference"] as const;

export function decayInactive<Thing>(opts: DecayOpts = {}): DecayResult {
  const inactiveDays = opts.inactiveDays ?? 90;
  const maxAccess    = opts.maxAccessCount ?? 1;
  const protectedCats = opts.protectedCategories ?? DEFAULT_PROTECTED;
  const limit        = opts.batchLimit ?? 500;

  const db = getDb();
  const cutoff = new Date(Date.now() - inactiveDays * 86400_000)
    .toISOString().replace("T", " ").substring(0, 19);

  // last_accessed is NULL for never-accessed → COALESCE to created_at.
  const placeholders = protectedCats.map(() => "?").join(",");
  const candidates = db.prepare(`
    SELECT id, category FROM <table>
    WHERE active = 1
      AND access_count <= ?
      AND COALESCE(last_accessed, created_at) < ?
      ${protectedCats.length ? `AND category NOT IN (${placeholders})` : ""}
    LIMIT ?
  `).all(maxAccess, cutoff, ...protectedCats, limit) as Array<{ id: number; category: string }>;

  if (candidates.length === 0) return { candidates: 0, decayed: 0, protected: 0, cutoff };

  const ids = candidates.map(c => c.id);
  const inList = ids.map(() => "?").join(",");

  // Emit events INSIDE the same transaction as the UPDATE — never after.
  const tx = db.transaction(() => {
    db.prepare(`UPDATE <table> SET active = 0 WHERE id IN (${inList})`).run(...ids);
    for (const c of candidates) {
      recordMemoryEvent({
        dimension: "<dimension>",
        kind: "decayed",
        sourceTable: "<table>",
        sourceId: c.id,
        factId: c.id,
        detail: `inactive>${inactiveDays}d access<=${maxAccess} cat=${c.category}`,
      });
    }
  });
  tx();

  return { candidates: candidates.length, decayed: candidates.length, protected: 0, cutoff };
}
```

The orchestrator (`runMemoryMaintenance` at `memory-decay.ts:98`) runs decay FIRST, then prunes memory_events via `pruneMemoryEvents(90)`. Order matters: prune second so same-run decayed events are retained for at least a day.

## Required (acceptance checklist)

- [ ] Soft-delete only (`SET active = 0`), never `DELETE FROM` — preserves provenance joins and avoids FK cascade surprises.
- [ ] Protected categories default to `["lesson", "person", "preference"]` — user intent, identity, and retrospective lessons must never decay without explicit override.
- [ ] UPDATE and `recordMemoryEvent` emits live inside the SAME `db.transaction(() => {...})` block so partial failures roll back cleanly (`memory-decay.ts:66`).
- [ ] Idempotent: second invocation returns `decayed: 0` (WHERE `active = 1` filter prevents re-deactivation).
- [ ] `batchLimit` capped (500 default) — one run should not lock the DB for minutes.
- [ ] Callable from a scheduler job. Current canonical wiring: `daily_maintenance` at 3 AM (`scheduler-jobs/maintenance.ts:499`). If you add a new retention job, hang it off the same orchestrator rather than adding a new 3 AM job.
- [ ] Tests cover: decay-happy-path, protected-category survival, recently-accessed survival, high-access survival, aggregate summary. See `memory-decay.test.ts:38..84` for the five-test shape.
- [ ] Event emission asserted in tests (`memory-decay.test.ts:44`): after decay, `getMemoryEvents({ kind: "decayed", factId: id })` returns at least one row.

## Anti-patterns

- `DELETE FROM <table> WHERE ...` → destroys provenance, risks FK cascades, and makes "why did this disappear?" unanswerable. The `recordMemoryEvent({ kind: "decayed" })` is useless if the target row is gone.
- Emitting `decayed` events AFTER the transaction commits → if the commit partially succeeds (SQLite is mostly atomic but retries happen), the log may show decays that didn't apply or vice versa.
- Skipping the protected-category check → one run nukes every low-access `category = "lesson"` fact. Irreversible. The default `["lesson", "person", "preference"]` exists for this exact reason.
- Running decay without `NODE_ENV=test` OR a scheduler frame → a dev REPL run can decay production rows. Gate via "only callable from `runMemoryMaintenance`" (same module) or add an explicit `if (!process.env.NODE_ENV && !process.env.SCHEDULER_FRAME) throw` if you're paranoid.
- No `batchLimit` → a first-ever run on a years-old DB locks the database for minutes and blocks the scheduler's next tick. Always cap.
- Pruning `memory_events` BEFORE decay → the same-run `decayed` events get pruned immediately. Order: decay, then prune.

## Extending

1. Copy the shape into your module, swap `<table>` / `<dimension>`.
2. Add a test file next to it covering the five test cases listed above.
3. Wire into `runMemoryMaintenance` if it's memory-related, or add a new method called from `daily_maintenance` at `maintenance.ts:505` for non-memory retention. Don't create a separate 3 AM job.
4. Verify with `NODE_ENV=test bun test src/memory/__tests__/<module>-decay.test.ts`.
