// T-05 — Post-commit event channel for ontology mutations (design §4.5).
//
// This module owns ONLY the in-process EventEmitter singleton. The
// in-transaction `_OntologyEvent` row writer lives in
// `./storage/events.ts` (kept separate so the storage layer has no
// dependency on `node:events`).
//
// Ordering rule (load-bearing, pass-1 B-03):
//   • `storage/events.writeEvent` runs INSIDE the storage transaction.
//   • `ontologyEvents.emit("ontology.changed", …)` fires AFTER the
//     enclosing `session.executeWrite` resolves — subscribers see
//     events only for committed mutations.
//
// `OntologyChangedEvent` is sourced from `@companygraph/shared` so the
// PWA + the SSE serialiser at `/api/v1/ontology/events` (T-19) consume
// the identical type.

import { EventEmitter } from "node:events";
import type { OntologyChangedEvent } from "@companygraph/shared";

export type { OntologyChangedEvent };

interface OntologyEventMap {
  "ontology.changed": [OntologyChangedEvent];
}

export const ontologyEvents = new EventEmitter<OntologyEventMap>();
