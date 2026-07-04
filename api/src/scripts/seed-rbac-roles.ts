// Seed script for initial RBAC roles
import { getDriver } from "../neo4j/driver";

const RBAC_ROLES = [
  {
    name: "system_admin",
    description: "Full system access",
    permissions: ["*"],
  },
  {
    name: "domain_admin",
    description: "Full access to assigned domains",
    permissions: [
      "domain:*",
      "journey:*",
      "persona:*",
      "ontology:*",
      "compliance:*",
      "risk:*",
      "kpi:*",
      "sla:*",
      "okr:*",
      "change_request:*",
      "analytics:*",
      "query:*",
      "chat:*",
      "export:*",
      "rbac:*",
      "user:*",
    ],
  },
  {
    name: "domain_editor",
    description: "Edit journeys and ontology in assigned domains",
    permissions: [
      "domain:read",
      "journey:read",
      "journey:write",
      "ontology:read",
      "ontology:write",
      "analytics:read",
      "query:read",
      "export:read",
    ],
  },
  {
    name: "domain_viewer",
    description: "Read-only access to assigned domains",
    permissions: [
      "domain:read",
      "journey:read",
      "ontology:read",
      "analytics:read",
      "compliance:read",
      "risk:read",
      "kpi:read",
      "sla:read",
      "okr:read",
      "query:read",
      "export:read",
    ],
  },
  {
    name: "domain_analyst",
    description: "Analytics and reporting access",
    permissions: [
      "domain:read",
      "journey:read",
      "analytics:*",
      "kpi:read",
      "sla:read",
      "okr:read",
      "query:read",
      "export:read",
    ],
  },
  {
    name: "domain_reviewer",
    description: "Review and approve changes",
    permissions: [
      "domain:read",
      "journey:read",
      "change_request:read",
      "change_request:review",
      "compliance:read",
      "ontology:read",
      "query:read",
    ],
  },
  // model-workspace-core T-15 (design §4.8, FR-11): Business Architect
  // owns model/module lifecycle writes via the dedicated routes.
  // Deliberately NO node:write / edge:write — fork + lifecycle writes
  // ride the model:*/module:* routes, and the generic routes reject
  // lifecycle labels anyway (T-10 guard).
  {
    name: "business_architect",
    description:
      "Authors business models and versioned modules (model-workspace-core). No generic node/edge write.",
    permissions: [
      "model:read",
      "model:write",
      "module:read",
      "module:write",
      "domain:read",
      "domain:write",
      "journey:read",
      "journey:write",
      "query:read",
      "analytics:read",
      // story-spec-core T-11 (design §4.8, FR-11): the Business
      // Architect authors the story/AC surface. This spec MODIFIES the
      // role model-workspace-core created (idempotent MERGE by name);
      // it does not create it.
      "story:read",
      "story:write",
    ],
  },
];

async function seedRbacRoles() {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    console.log("Seeding RBAC roles...");

    for (const role of RBAC_ROLES) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const result = await session.run(
        `MERGE (r:RBACRole {name: $name})
         ON CREATE SET r.id = $id, r.description = $description, r.permissions = $permissions, r.createdAt = $now, r.updatedAt = $now
         ON MATCH SET r.description = $description, r.permissions = $permissions, r.updatedAt = $now
         RETURN r`,
        { id, name: role.name, description: role.description, permissions: role.permissions, now }
      );

      const createdRole = result.records[0]?.get("r")?.properties;
      console.log(`  ✓ ${role.name} (${createdRole.id})`);
    }

    // model-workspace-core T-15 (design §4.8, FR-11): MERGE the
    // `Business Architect` Persona + its HAS_RBAC_ROLE binding to
    // business_architect (pattern from migrate-persona-hierarchy.ts).
    // MERGE-keyed on the persona name + role name → idempotent; the SME
    // persona (and every other persona) is left untouched.
    {
      const now = new Date().toISOString();
      const personaId = crypto.randomUUID();
      const personaResult = await session.run(
        `MERGE (p:Persona {name: $name})
         ON CREATE SET p.id = $id, p.description = $description, p.createdAt = $now, p.updatedAt = $now, p.attributes_json = "{}"
         ON MATCH SET p.description = $description, p.updatedAt = $now
         RETURN p`,
        {
          id: personaId,
          name: "Business Architect",
          description:
            "P-BA — authors business models, publishes/instantiates versioned modules, owns the Model workspace surface (model-workspace-core FR-11).",
          now,
        },
      );
      const persona = personaResult.records[0]?.get("p")?.properties;
      await session.run(
        `MATCH (p:Persona {name: "Business Architect"}), (r:RBACRole {name: "business_architect"})
         MERGE (p)-[:HAS_RBAC_ROLE]->(r)`,
      );
      console.log(`  ✓ Business Architect persona (${persona.id}) → business_architect`);
    }

    console.log("RBAC roles seeded successfully!");
  } catch (error) {
    console.error("Error seeding RBAC roles:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// Run if executed directly
if (import.meta.main) {
  seedRbacRoles()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { seedRbacRoles };
