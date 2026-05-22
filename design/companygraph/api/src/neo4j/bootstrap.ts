import type { Driver } from "neo4j-driver";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";

// Registry-driven schema bootstrap. Iterates NODE_LABELS + EDGE_TYPES so
// `ontology-manager` later swaps the const for a DB-backed registry
// without touching this code.
//
// All statements use IF NOT EXISTS so the call is idempotent (AC-04).
export async function applySchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const label of NODE_LABELS) {
      await session.run(
        `CREATE CONSTRAINT node_id_unique_${label} IF NOT EXISTS
         FOR (n:\`${label}\`) REQUIRE n.id IS UNIQUE`,
      );
      await session.run(
        `CREATE INDEX node_name_${label} IF NOT EXISTS
         FOR (n:\`${label}\`) ON (n.name)`,
      );
    }
    for (const type of EDGE_TYPES) {
      await session.run(
        `CREATE CONSTRAINT edge_id_unique_${type} IF NOT EXISTS
         FOR ()-[r:\`${type}\`]-() REQUIRE r.id IS UNIQUE`,
      );
    }
  } finally {
    await session.close();
  }
}
