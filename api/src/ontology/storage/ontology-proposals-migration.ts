// Neo4j constraints for ontology proposals.
//
// This migration creates the necessary constraints for the ontology proposal system:
// - ontology_proposal_id_unique: Ensures proposal IDs are unique

import type { Driver } from "neo4j-driver";

export async function createOntologyProposalConstraints(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // Create constraint for ontology proposal IDs
      await tx.run(`
        CREATE CONSTRAINT ontology_proposal_id_unique IF NOT EXISTS
        FOR (p:_OntologyProposal) REQUIRE p.id IS UNIQUE
      `);

      // Create index for proposal status
      await tx.run(`
        CREATE INDEX ontology_proposal_status IF NOT EXISTS
        FOR (p:_OntologyProposal) ON (p.status)
      `);

      // Create index for proposal source scope
      await tx.run(`
        CREATE INDEX ontology_proposal_source_scope IF NOT EXISTS
        FOR (p:_OntologyProposal) ON (p.source_scope)
      `);

      // Create index for proposal source_id
      await tx.run(`
        CREATE INDEX ontology_proposal_source_id IF NOT EXISTS
        FOR (p:_OntologyProposal) ON (p.source_id)
      `);
    });
  } finally {
    await session.close();
  }
}

export async function dropOntologyProposalConstraints(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`DROP CONSTRAINT ontology_proposal_id_unique IF EXISTS`);
      await tx.run(`DROP INDEX ontology_proposal_status IF EXISTS`);
      await tx.run(`DROP INDEX ontology_proposal_source_scope IF EXISTS`);
      await tx.run(`DROP INDEX ontology_proposal_source_id IF EXISTS`);
    });
  } finally {
    await session.close();
  }
}
