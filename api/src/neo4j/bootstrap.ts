// `applySchema(driver)` ensures every Neo4j constraint + index the rest
// of the codebase relies on exists. Idempotent: each statement uses
// `IF NOT EXISTS`, so running it on a clean DB and on a populated one
// produces identical post-conditions (AC-04 / AC-14).
//
// Per-label constraints + indexes are sourced from the compile-time
// `NODE_LABELS` / `EDGE_TYPES` const tuples in `@companygraph/shared`.
// The `ontology-manager` follow-up spec will replace this with a
// registry-iterating bootstrap (FR-15); until then graph-core remains
// the source of truth for label/type identity.

import type { Driver } from "neo4j-driver";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";

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
