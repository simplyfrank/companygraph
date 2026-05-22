// `applySchema(driver)` ensures every Neo4j constraint + index the rest
// of the codebase relies on exists. Idempotent: each statement uses
// `IF NOT EXISTS`, so running it on a clean DB and on a populated one
// produces identical post-conditions (AC-04 / AC-14 + ontology-manager
// FR-15).
//
// Three-step bootstrap (post-T-09a refactor):
//   1. `applyMetaSchema(driver)` — creates the `_Ontology*` namespace's
//      own constraints + indexes (the registry's own meta-schema).
//   2. `seedRegistryFromConstTuples(driver)` — if `isRegistryEmpty` is
//      true, seed the registry from the compile-time `NODE_LABELS` /
//      `EDGE_TYPES` const tuples. `api/src/ontology/seed.ts` is the
//      SOLE legal importer of those const tuples per NFR-02 + AC-15.
//   3. Iterate the runtime registry and create per-label data
//      constraints (`node_id_unique_<label>`, `node_name_<label>`) +
//      per-type edge-id constraints. After ontology-manager lands, this
//      loop replaces the previous compile-time `for (const label of
//      NODE_LABELS)` iteration so labels registered at runtime via
//      `POST /api/v1/ontology/node-labels` get their constraints
//      automatically on next bootstrap.
//
// NFR-02 boundary: this file imports NO compile-time const tuples. Only
// `api/src/ontology/seed.ts` is allowed to (the seed loader's sole
// reason for being).

import type { Driver } from "neo4j-driver";
import { applyMetaSchema } from "../ontology/meta-bootstrap";
import {
  isRegistryEmpty,
  seedRegistryFromConstTuples,
} from "../ontology/seed";

export async function applySchema(driver: Driver): Promise<void> {
  // Step 1: meta-schema for the registry itself.
  await applyMetaSchema(driver);

  // Step 2: seed the registry from the compile-time const tuples IF EMPTY.
  if (await isRegistryEmpty(driver)) {
    await seedRegistryFromConstTuples(driver);
  }

  // Step 3: iterate the registry and ensure per-label / per-type data
  // constraints exist. All statements use `IF NOT EXISTS` so re-running
  // is a no-op (AC-04 / AC-14).
  const session = driver.session();
  try {
    const labelsRes = await session.run(
      `MATCH (l:_OntologyNodeLabel) RETURN l.name AS name ORDER BY l.name`,
    );
    const labels = labelsRes.records.map((r) => r.get("name") as string);
    for (const label of labels) {
      await session.run(
        `CREATE CONSTRAINT node_id_unique_${label} IF NOT EXISTS
         FOR (n:\`${label}\`) REQUIRE n.id IS UNIQUE`,
      );
      await session.run(
        `CREATE INDEX node_name_${label} IF NOT EXISTS
         FOR (n:\`${label}\`) ON (n.name)`,
      );
    }

    const typesRes = await session.run(
      `MATCH (t:_OntologyEdgeType) RETURN t.name AS name ORDER BY t.name`,
    );
    const types = typesRes.records.map((r) => r.get("name") as string);
    for (const type of types) {
      await session.run(
        `CREATE CONSTRAINT edge_id_unique_${type} IF NOT EXISTS
         FOR ()-[r:\`${type}\`]-() REQUIRE r.id IS UNIQUE`,
      );
    }
  } finally {
    await session.close();
  }
}
