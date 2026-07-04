// Neo4j constraints for glossary collections and terms.
//
// This migration creates the necessary constraints for the glossary system:
// - glossary_term_id_unique: Ensures term IDs are unique
// - glossary_collection_iri_unique: Ensures collection IRIs are unique
// - PARENT_OF relationship for collection hierarchy
// - MEMBER_OF relationship for term-to-collection association
// - DESCRIBES relationship for term-to-entity association

import type { Driver } from "neo4j-driver";

export async function createGlossaryConstraints(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // Create constraint for glossary term IDs
      await tx.run(`
        CREATE CONSTRAINT glossary_term_id_unique IF NOT EXISTS
        FOR (t:_GlossaryTerm) REQUIRE t.id IS UNIQUE
      `);

      // Create constraint for glossary collection IRIs
      await tx.run(`
        CREATE CONSTRAINT glossary_collection_iri_unique IF NOT EXISTS
        FOR (c:_GlossaryCollection) REQUIRE c.iri IS UNIQUE
      `);

      // Create index for collection scope level
      await tx.run(`
        CREATE INDEX glossary_collection_scope_level IF NOT EXISTS
        FOR (c:_GlossaryCollection) ON (c.scope_level)
      `);

      // Create index for term status
      await tx.run(`
        CREATE INDEX glossary_term_status IF NOT EXISTS
        FOR (t:_GlossaryTerm) ON (t.status)
      `);

      // Create index for term local_name (for conflict detection)
      await tx.run(`
        CREATE INDEX glossary_term_local_name IF NOT EXISTS
        FOR (t:_GlossaryTerm) ON (t.local_name)
      `);

      // Create index for term collection_iri
      await tx.run(`
        CREATE INDEX glossary_term_collection_iri IF NOT EXISTS
        FOR (t:_GlossaryTerm) ON (t.collection_iri)
      `);
    });
  } finally {
    await session.close();
  }
}

export async function dropGlossaryConstraints(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`DROP CONSTRAINT glossary_term_id_unique IF EXISTS`);
      await tx.run(`DROP CONSTRAINT glossary_collection_iri_unique IF EXISTS`);
      await tx.run(`DROP INDEX glossary_collection_scope_level IF EXISTS`);
      await tx.run(`DROP INDEX glossary_term_status IF EXISTS`);
      await tx.run(`DROP INDEX glossary_term_local_name IF EXISTS`);
      await tx.run(`DROP INDEX glossary_term_collection_iri IF EXISTS`);
    });
  } finally {
    await session.close();
  }
}
