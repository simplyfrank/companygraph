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
