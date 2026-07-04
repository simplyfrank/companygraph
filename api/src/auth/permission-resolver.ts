// Permission resolution from personas and RBAC roles
import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";

export interface PersonaAssignment {
  personaId: string;
  personaName: string;
  domainIds: string[];
}

export interface ResolvedPermissions {
  personaAssignments: PersonaAssignment[];
  rbacRoles: string[];
  permissions: string[];
}

/**
 * Resolve permissions for a user based on their persona assignments
 * This includes:
 * 1. Direct RBAC roles from assigned personas
 * 2. Inherited RBAC roles from parent personas in the hierarchy
 * 3. Union of all permissions from all RBAC roles
 */
export async function resolveUserPermissions(userId: string): Promise<ResolvedPermissions> {
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Get user's persona assignments with domain access
    const personaAssignmentsResult = await session.run(
      `MATCH (u:User {id: $userId})-[h:HAS_PERSONA]->(p:Persona)
       WHERE p.archivedAt IS NULL
       RETURN p.id as personaId, p.name as personaName, h.domainIds as domainIds`,
      { userId }
    );

    const personaAssignments: PersonaAssignment[] = personaAssignmentsResult.records.map((r) => ({
      personaId: r.get("personaId"),
      personaName: r.get("personaName"),
      domainIds: r.get("domainIds") || [],
    }));

    // Collect all RBAC roles from all assigned personas (direct + inherited)
    const rbacRoleIds = new Set<string>();
    const permissions = new Set<string>();

    for (const assignment of personaAssignments) {
      // Get direct RBAC roles from persona
      const directRolesResult = await session.run(
        `MATCH (p:Persona {id: $personaId})-[h:HAS_RBAC_ROLE]->(r:RBACRole)
         RETURN r.id as roleId, r.permissions as permissions`,
        { personaId: assignment.personaId }
      );

      directRolesResult.records.forEach((r) => {
        const roleId = r.get("roleId");
        const perms = r.get("permissions") as string[] || [];
        rbacRoleIds.add(roleId);
        perms.forEach((perm) => permissions.add(perm));
      });

      // Get inherited RBAC roles from parent personas
      const inheritedRolesResult = await session.run(
        `MATCH (p:Persona {id: $personaId})<-[:PARENT_OF*]-(parent:Persona)-[h:HAS_RBAC_ROLE]->(r:RBACRole)
         RETURN r.id as roleId, r.permissions as permissions`,
        { personaId: assignment.personaId }
      );

      inheritedRolesResult.records.forEach((r) => {
        const roleId = r.get("roleId");
        const perms = r.get("permissions") as string[] || [];
        rbacRoleIds.add(roleId);
        perms.forEach((perm) => permissions.add(perm));
      });
    }

    return {
      personaAssignments,
      rbacRoles: Array.from(rbacRoleIds),
      permissions: Array.from(permissions),
    };
  } catch (error) {
    console.error("Error resolving user permissions:", error);
    return {
      personaAssignments: [],
      rbacRoles: [],
      permissions: [],
    };
  } finally {
    await session.close();
  }
}

/**
 * Resolve permissions for a specific persona (including hierarchy)
 */
export async function resolvePersonaPermissions(personaId: string): Promise<string[]> {
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Get persona's direct RBAC roles
    const directRolesResult = await session.run(
      `MATCH (p:Persona {id: $id})-[h:HAS_RBAC_ROLE]->(r:RBACRole)
       RETURN r.permissions as permissions`,
      { id: personaId }
    );

    // Get persona's inherited RBAC roles from parent hierarchy
    const inheritedRolesResult = await session.run(
      `MATCH (p:Persona {id: $id})<-[:PARENT_OF*]-(parent:Persona)-[h:HAS_RBAC_ROLE]->(r:RBACRole)
       RETURN r.permissions as permissions`,
      { id: personaId }
    );

    // Collect all permissions
    const permissions = new Set<string>();
    directRolesResult.records.forEach((r) => {
      const perms = r.get("permissions") as string[] || [];
      perms.forEach((perm) => permissions.add(perm));
    });
    inheritedRolesResult.records.forEach((r) => {
      const perms = r.get("permissions") as string[] || [];
      perms.forEach((perm) => permissions.add(perm));
    });

    return Array.from(permissions);
  } catch (error) {
    console.error("Error resolving persona permissions:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  // Check for wildcard permission
  if (userPermissions.includes("*")) {
    return true;
  }

  // Check for exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Check for prefix match (e.g., "journey:*" matches "journey:read")
  const requiredParts = requiredPermission.split(":");
  for (const perm of userPermissions) {
    const permParts = perm.split(":");
    if (permParts.length === 2 && permParts[1] === "*") {
      if (requiredParts[0] === permParts[0]) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a user has access to a specific domain
 */
export function hasDomainAccess(userPersonaAssignments: PersonaAssignment[], domainId: string): boolean {
  for (const assignment of userPersonaAssignments) {
    if (assignment.domainIds.includes("*")) {
      return true;
    }
    if (assignment.domainIds.includes(domainId)) {
      return true;
    }
  }
  return false;
}
