// Migration script to create default persona hierarchy
// Executive > Domain Lead > Domain User

import { getDriver } from "../neo4j/driver";

const PERSONA_HIERARCHY = [
  {
    name: "Executive",
    description: "Executive-level business role with cross-domain visibility",
    rbacRoleNames: ["domain_admin", "domain_analyst"],
    parentPersonaId: null, // Top level
  },
  {
    name: "Domain Lead",
    description: "Domain-level manager responsible for domain operations",
    rbacRoleNames: ["domain_editor", "domain_reviewer"],
    parentPersonaId: "Executive", // Child of Executive
  },
  {
    name: "Domain User",
    description: "Domain-level contributor with read access",
    rbacRoleNames: ["domain_viewer"],
    parentPersonaId: "Domain Lead", // Child of Domain Lead
  },
];

async function migratePersonaHierarchy() {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    console.log("Migrating persona hierarchy...");

    // First, get RBAC role IDs by name
    const rbacRoleResult = await session.run(
      `MATCH (r:RBACRole) RETURN r.name as name, r.id as id`
    );
    const rbacRoleMap = new Map<string, string>();
    rbacRoleResult.records.forEach((r) => {
      rbacRoleMap.set(r.get("name"), r.get("id"));
    });

    // Create personas in order (Executive first, then Domain Lead, then Domain User)
    const personaIdMap = new Map<string, string>();

    for (const personaDef of PERSONA_HIERARCHY) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      // Get parent persona ID if specified
      let parentPersonaId = null;
      if (personaDef.parentPersonaId) {
        parentPersonaId = personaIdMap.get(personaDef.parentPersonaId);
        if (!parentPersonaId) {
          console.warn(`  ⚠ Parent persona "${personaDef.parentPersonaId}" not found for "${personaDef.name}"`);
        }
      }

      // Get RBAC role IDs
      const rbacRoleIds = personaDef.rbacRoleNames
        .map((name) => rbacRoleMap.get(name))
        .filter((id): id is string => id !== undefined);

      if (rbacRoleIds.length === 0) {
        console.warn(`  ⚠ No RBAC roles found for "${personaDef.name}"`);
      }

      // Create persona
      const result = await session.run(
        `MERGE (p:Persona {name: $name})
         ON CREATE SET p.id = $id, p.description = $description, p.parentPersonaId = $parentPersonaId, p.rbacRoleIds = $rbacRoleIds, p.createdAt = $now, p.updatedAt = $now
         ON MATCH SET p.description = $description, p.parentPersonaId = $parentPersonaId, p.rbacRoleIds = $rbacRoleIds, p.updatedAt = $now
         RETURN p`,
        {
          id,
          name: personaDef.name,
          description: personaDef.description,
          parentPersonaId,
          rbacRoleIds,
          now,
        }
      );

      const persona = result.records[0]?.get("p")?.properties;
      personaIdMap.set(personaDef.name, persona.id);

      // Create PARENT_OF relationship if parent exists
      if (parentPersonaId) {
        await session.run(
          `MATCH (p:Persona {id: $id}), (parent:Persona {id: $parentPersonaId})
           MERGE (parent)-[:PARENT_OF]->(p)`,
          { id: persona.id, parentPersonaId }
        );
      }

      // Create HAS_RBAC_ROLE relationships
      for (const rbacRoleId of rbacRoleIds) {
        await session.run(
          `MATCH (p:Persona {id: $id}), (r:RBACRole {id: $rbacRoleId})
           MERGE (p)-[:HAS_RBAC_ROLE]->(r)`,
          { id: persona.id, rbacRoleId }
        );
      }

      console.log(`  ✓ ${personaDef.name} (${persona.id})`);
    }

    console.log("Persona hierarchy migrated successfully!");
  } catch (error) {
    console.error("Error migrating persona hierarchy:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// Run if executed directly
if (import.meta.main) {
  migratePersonaHierarchy()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migratePersonaHierarchy };
