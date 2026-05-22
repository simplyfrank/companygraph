// T-05 — In-transaction `_OntologyEvent` persistence helper (design §4.5).
//
// `writeEvent` persists the schema-change event row INSIDE the calling
// transaction (NFR-01). Ordering rule (load-bearing, pass-1 B-03):
//
//   1. `writeEvent` runs inside the same `session.executeWrite` block
//      as `writeAudit` + `writeVersion` → if the tx rolls back, no
//      `_OntologyEvent` row exists for a non-event.
//   2. `ontologyEvents.emit("ontology.changed", …)` fires from the
//      route handler AFTER `session.executeWrite` resolves → subscribers
//      only see committed events. This file does NOT call `emit`.
//   3. If the post-commit `emit` throws synchronously, the row is still
//      persisted; reconnecting SSE subscribers recover via
//      `Last-Event-ID` replay (design §5.4).
//
// The diff array is JSON-encoded at storage (pass-1 B-01) consistent with
// `before_json` / `after_json` on `_OntologyAudit`.

import type { ManagedTransaction } from "neo4j-driver";
import { generateId } from "../../ids";

export async function writeEvent(
  tx: ManagedTransaction,
  version_id: string,
  diff: ReadonlyArray<Record<string, unknown>>,
): Promise<{ event_id: string }> {
  const event_id = generateId();
  const ts = new Date().toISOString();
  await tx.run(
    `CREATE (e:_OntologyEvent {
       event_id: $event_id, version_id: $version_id,
       diff_jsonpatch: $diff_json, ts: $ts
     })`,
    {
      event_id,
      version_id,
      diff_json: JSON.stringify(diff),
      ts,
    },
  );
  return { event_id };
}
