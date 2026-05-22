// T-04 — applyMetaSchema.
//
// Creates Neo4j constraints + indexes for the `_Ontology*` label namespace
// per design §3.2. Runs as step 1 of the bootstrap sequence (before
// `seedRegistryFromConstTuples` in T-08 and before the per-label
// constraint loop in T-09).
//
// All statements use `IF NOT EXISTS` — re-running is a no-op (AC-14).
//
// Constraint + index inventory (design §3.2):
//   _OntologyNodeLabel.name UNIQUE
//   _OntologyEdgeType.name UNIQUE
//   _OntologyAttributeSchema.label_name UNIQUE
//   (_OntologyEdgeEndpoint.edge_type_name, .from_label, .to_label) UNIQUE   [composite]
//   _OntologyVersion.version_id UNIQUE
//   _OntologyEvent.event_id UNIQUE
//   _OntologyAudit.ts INDEX
//   _OntologyEvent.ts INDEX
//   (_OntologyAlignment.target_kind, .target_name, .source, .external_id) UNIQUE   [composite — pass-1 C-08]

import type { Driver } from "neo4j-driver";

const META_CONSTRAINTS: ReadonlyArray<string> = [
  `CREATE CONSTRAINT _onto_node_label_name_unique IF NOT EXISTS
   FOR (n:_OntologyNodeLabel) REQUIRE n.name IS UNIQUE`,

  `CREATE CONSTRAINT _onto_edge_type_name_unique IF NOT EXISTS
   FOR (n:_OntologyEdgeType) REQUIRE n.name IS UNIQUE`,

  `CREATE CONSTRAINT _onto_attr_schema_label_unique IF NOT EXISTS
   FOR (n:_OntologyAttributeSchema) REQUIRE n.label_name IS UNIQUE`,

  // Composite uniqueness on the endpoint triple.
  `CREATE CONSTRAINT _onto_edge_endpoint_unique IF NOT EXISTS
   FOR (n:_OntologyEdgeEndpoint)
   REQUIRE (n.edge_type_name, n.from_label, n.to_label) IS UNIQUE`,

  `CREATE CONSTRAINT _onto_version_id_unique IF NOT EXISTS
   FOR (n:_OntologyVersion) REQUIRE n.version_id IS UNIQUE`,

  `CREATE CONSTRAINT _onto_event_id_unique IF NOT EXISTS
   FOR (n:_OntologyEvent) REQUIRE n.event_id IS UNIQUE`,

  // Composite uniqueness on the alignment row (pass-1 design-review C-08).
  `CREATE CONSTRAINT _onto_alignment_unique IF NOT EXISTS
   FOR (n:_OntologyAlignment)
   REQUIRE (n.target_kind, n.target_name, n.source, n.external_id) IS UNIQUE`,
];

const META_INDEXES: ReadonlyArray<string> = [
  // SSE replay needs an indexed range on `ts` (pass-1 design-review B-02).
  `CREATE INDEX _onto_audit_ts IF NOT EXISTS
   FOR (n:_OntologyAudit) ON (n.ts)`,

  `CREATE INDEX _onto_event_ts IF NOT EXISTS
   FOR (n:_OntologyEvent) ON (n.ts)`,
];

export async function applyMetaSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const stmt of META_CONSTRAINTS) {
      await session.run(stmt);
    }
    for (const stmt of META_INDEXES) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}

// Exported for direct inspection by tests + by the registry-storage helpers
// that need to know the canonical constraint set.
export { META_CONSTRAINTS, META_INDEXES };
