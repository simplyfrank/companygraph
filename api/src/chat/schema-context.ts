// Schema-context provider (FR-B05 / DD-15).
//
// Returns the live ontology when `ontology-manager` ships (preferred) OR
// the compile-time fallback from `shared/src/schema/{nodes,edges}.ts`.
//
// Cache invalidation: subscribes to the in-process `ontologyEvents`
// EventEmitter (when present) — chat runs server-side, in-process EE is
// the right channel (NOT the SSE endpoint).

import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";
import type { SchemaSnapshot } from "./tools/types";

let cachedSnapshot: SchemaSnapshot | null = null;

export function invalidateSchemaCache(): void {
  cachedSnapshot = null;
}

// Wire EventEmitter subscription if the file exists (soft dep on ontology-manager).
// We probe at boot only — the import is dynamic to avoid hard-coupling.
let subscribed = false;
async function subscribeOntologyChanged(): Promise<void> {
  if (subscribed) return;
  subscribed = true;
  try {
    // Import path is conditional on ontology-manager's shipping; ignore failure.
    const mod = await import("../ontology/events").catch(() => null);
    const ee = (mod as { ontologyEvents?: { on(event: string, cb: () => void): void } } | null)?.ontologyEvents;
    if (ee && typeof ee.on === "function") {
      ee.on("ontology.changed", invalidateSchemaCache);
    }
  } catch {
    // ontology-manager hasn't shipped — fallback to compile-time tuples.
  }
}

export async function getSchemaSnapshot(): Promise<SchemaSnapshot> {
  if (cachedSnapshot) return cachedSnapshot;
  await subscribeOntologyChanged();

  // Try the runtime ontology endpoint first.
  try {
    const r = await fetch("http://127.0.0.1:8787/api/v1/schema", {
      signal: AbortSignal.timeout(500),
    });
    if (r.ok) {
      const live = (await r.json()) as SchemaSnapshot;
      if (live && Array.isArray(live.labels) && Array.isArray(live.edge_types)) {
        cachedSnapshot = live;
        return cachedSnapshot;
      }
    }
  } catch {
    // ontology-manager not ready — fall through to compile-time fallback.
  }

  // Compile-time fallback (always available).
  cachedSnapshot = {
    labels: NODE_LABELS.map(l => ({ id: l, name: l, attributes: [] })),
    edge_types: EDGE_TYPES.map(t => ({ id: t, name: t })),
    examples: [
      { question: "What domains exist?", tool: "list_domains", args: {} },
      { question: "Which systems does Order Fulfillment use?", tool: "get_journey", args: { id: "uj_order_fulfillment" } },
      { question: "Who executes Pick & pack?", tool: "neighbors", args: { nodeId: "<activity_id>", edgeTypes: ["EXECUTES"], depth: 1 } },
      { question: "Show SLA breaches.", tool: "sla_hotspots", args: { status: "breach" } },
      { question: "Critical path through the journey?", tool: "find_path", args: { fromId: "<start>", toId: "<end>", maxDepth: 8 } },
    ],
  };
  return cachedSnapshot;
}

// Test helper.
export function resetSchemaCacheForTest(): void {
  cachedSnapshot = null;
  subscribed = false;
}
