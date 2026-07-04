// Migration script to map existing retail roles to new domain-focused RBAC roles
// This is a placeholder for when you have existing users with the old role system
// Maps: admin -> system_admin, store_manager -> domain_admin, etc.

import { getDriver } from "../neo4j/driver";

// Mapping from old retail roles to new RBAC roles
const ROLE_MAPPING: Record<string, string> = {
  admin: "system_admin",
  store_manager: "domain_admin",
  fulfillment_ops: "domain_editor",
  analyst: "domain_analyst",
  viewer: "domain_viewer",
};

async function migrateRoleMapping() {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    console.log("Migrating role mapping...");

    // Get RBAC role IDs by name
    const rbacRoleResult = await session.run(
      `MATCH (r:RBACRole) RETURN r.name as name, r.id as id`
    );
    const rbacRoleMap = new Map<string, string>();
    rbacRoleResult.records.forEach((r) => {
      rbacRoleMap.set(r.get("name"), r.get("id"));
    });

    // For each mapping, ensure the target RBAC role exists
    for (const [oldRole, newRole] of Object.entries(ROLE_MAPPING)) {
      const newRoleId = rbacRoleMap.get(newRole);
      if (!newRoleId) {
        console.warn(`  ⚠ Target RBAC role "${newRole}" not found for mapping from "${oldRole}"`);
        continue;
      }

      console.log(`  ✓ ${oldRole} -> ${newRole} (${newRoleId})`);
    }

    console.log("Role mapping verified successfully!");
    console.log("Note: Actual user role migration will require User-Persona assignment based on existing user roles.");
  } catch (error) {
    console.error("Error migrating role mapping:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// Run if executed directly
if (import.meta.main) {
  migrateRoleMapping()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateRoleMapping };
