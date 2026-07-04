// RBAC Role API handlers
// POST /api/v1/rbac-roles - create RBAC role
// GET /api/v1/rbac-roles - list RBAC roles
// GET /api/v1/rbac-roles/:id - get RBAC role by id
// PATCH /api/v1/rbac-roles/:id - update RBAC role
// DELETE /api/v1/rbac-roles/:id - delete RBAC role

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";

// POST /api/v1/rbac-roles - create RBAC role
export async function handleRbacRolePost(req: Request): Promise<Response> {
  const body = await req.json();
  const { name, description, permissions } = body;

  if (!name) {
    return error(400, "invalid_payload", "missing required field: name", { required: ["name"] });
  }

  if (!permissions || !Array.isArray(permissions)) {
    return error(400, "invalid_payload", "permissions must be an array", { required: ["permissions"] });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `CREATE (r:RBACRole {
        id: $id,
        name: $name,
        description: $description,
        permissions: $permissions,
        createdAt: $now,
        updatedAt: $now
      }) RETURN r`,
      { id, name, description: description || "", permissions, now }
    );

    const role = result.records[0]?.get("r")?.properties;
    return ok({ role }, 201);
  } catch (err: any) {
    return error(500, "internal_error", "failed to create RBAC role", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/rbac-roles - list RBAC roles
export async function handleRbacRoleList(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (r:RBACRole) RETURN r ORDER BY r.name`
    );
    const roles = result.records.map((r) => r.get("r")?.properties);
    return ok({ roles });
  } catch (err: any) {
    return error(500, "internal_error", "failed to list RBAC roles", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/rbac-roles/:id - get RBAC role by id
export async function handleRbacRoleGet(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (r:RBACRole {id: $id}) RETURN r`,
      { id }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "RBAC role not found", { id });
    }

    const role = result.records[0].get("r")?.properties;

    // Get personas that have this RBAC role
    const personasResult = await session.run(
      `MATCH (p:Persona)-[h:HAS_RBAC_ROLE]->(r:RBACRole {id: $id})
       WHERE p.archivedAt IS NULL
       RETURN p, h`,
      { id }
    );
    const personas = personasResult.records.map((r) => ({
      persona: r.get("p")?.properties,
      assignment: r.get("h")?.properties,
    }));

    return ok({ role, personas });
  } catch (err: any) {
    return error(500, "internal_error", "failed to get RBAC role", { error: err.message });
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/rbac-roles/:id - update RBAC role
export async function handleRbacRolePatch(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }
  const body = await req.json();
  const { name, description, permissions } = body;

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const setClauses = [];
    const updateParams: Record<string, any> = { id, now };

    if (name !== undefined) {
      setClauses.push("r.name = $name");
      updateParams.name = name;
    }
    if (description !== undefined) {
      setClauses.push("r.description = $description");
      updateParams.description = description;
    }
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        return error(400, "invalid_payload", "permissions must be an array", {});
      }
      setClauses.push("r.permissions = $permissions");
      updateParams.permissions = permissions;
    }

    if (setClauses.length === 0) {
      return error(400, "invalid_payload", "no fields to update", {});
    }

    setClauses.push("r.updatedAt = $now");

    const query = `
      MATCH (r:RBACRole {id: $id})
      SET ${setClauses.join(", ")}
      RETURN r
    `;

    const result = await session.run(query, updateParams);

    if (result.records.length === 0) {
      return error(404, "not_found", "RBAC role not found", { id });
    }

    const role = result.records[0].get("r")?.properties;
    return ok({ role });
  } catch (err: any) {
    return error(500, "internal_error", "failed to update RBAC role", { error: err.message });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/rbac-roles/:id - delete RBAC role
export async function handleRbacRoleDelete(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Check if role is in use
    const usageCheck = await session.run(
      `MATCH (r:RBACRole {id: $id})
       OPTIONAL MATCH (p:Persona)-[h:HAS_RBAC_ROLE]->(r)
       RETURN count(h) as assignments`,
      { id }
    );

    const assignments = usageCheck.records[0]?.get("assignments") || 0;

    if (assignments > 0 && !force) {
      return error(400, "in_use", "RBAC role is assigned to personas", { assignments });
    }

    // Delete role and its relationships
    const result = await session.run(
      `MATCH (r:RBACRole {id: $id})
       DETACH DELETE r
       RETURN count(r) as deleted`,
      { id }
    );

    const deleted = result.records[0]?.get("deleted") || 0;

    if (deleted === 0) {
      return error(404, "not_found", "RBAC role not found", { id });
    }

    return ok({ success: true });
  } catch (err: any) {
    return error(500, "internal_error", "failed to delete RBAC role", { error: err.message });
  } finally {
    await session.close();
  }
}

// POST /api/v1/personas/:id/rbac-roles - assign RBAC role to persona
export async function handlePersonaRbacRolePost(req: Request, personaId: string): Promise<Response> {
  const parsedId = parseId(personaId);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid persona id format", { personaId });
  }

  const body = await req.json();
  const { rbacRoleId } = body;

  if (!rbacRoleId) {
    return error(400, "invalid_payload", "missing required field: rbacRoleId", { required: ["rbacRoleId"] });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Verify persona exists
    const personaCheck = await session.run(
      "MATCH (p:Persona {id: $id}) WHERE p.archivedAt IS NULL RETURN p",
      { id: personaId }
    );
    if (personaCheck.records.length === 0) {
      return error(404, "not_found", "persona not found", { personaId });
    }

    // Verify RBAC role exists
    const roleCheck = await session.run(
      "MATCH (r:RBACRole {id: $id}) RETURN r",
      { id: rbacRoleId }
    );
    if (roleCheck.records.length === 0) {
      return error(404, "not_found", "RBAC role not found", { rbacRoleId });
    }

    // Check if assignment already exists
    const existingCheck = await session.run(
      `MATCH (p:Persona {id: $personaId})-[h:HAS_RBAC_ROLE]->(r:RBACRole {id: $rbacRoleId})
       RETURN h`,
      { personaId, rbacRoleId }
    );
    if (existingCheck.records.length > 0) {
      return error(409, "id_conflict", "RBAC role already assigned to persona", { personaId, rbacRoleId });
    }

    // Create assignment
    const result = await session.run(
      `MATCH (p:Persona {id: $personaId}), (r:RBACRole {id: $rbacRoleId})
       CREATE (p)-[h:HAS_RBAC_ROLE { id: $id, createdAt: $now }]->(r)
       RETURN h`,
      { personaId, rbacRoleId, id, now }
    );

    const assignment = result.records[0]?.get("h")?.properties;
    return ok({ assignment }, 201);
  } catch (err: any) {
    return error(500, "internal_error", "failed to assign RBAC role to persona", { error: err.message });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/personas/:personaId/rbac-roles/:rbacRoleId - remove RBAC role assignment
export async function handlePersonaRbacRoleDelete(req: Request, personaId: string, rbacRoleId: string): Promise<Response> {
  const parsedPersonaId = parseId(personaId);
  const parsedRbacRoleId = parseId(rbacRoleId);
  if (!parsedPersonaId || !parsedRbacRoleId) {
    return error(400, "invalid_payload", "invalid id format", { personaId, rbacRoleId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (p:Persona {id: $personaId})-[h:HAS_RBAC_ROLE]->(r:RBACRole {id: $rbacRoleId})
       DELETE h RETURN count(h) as deleted`,
      { personaId, rbacRoleId }
    );

    const deleted = result.records[0]?.get("deleted") || 0;

    if (deleted === 0) {
      return error(404, "not_found", "assignment not found", { personaId, rbacRoleId });
    }

    return ok({ success: true });
  } catch (err: any) {
    return error(500, "internal_error", "failed to remove RBAC role assignment", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/personas/:id/permissions - get effective permissions for persona
export async function handlePersonaPermissionsGet(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Get persona's direct RBAC roles
    const directRolesResult = await session.run(
      `MATCH (p:Persona {id: $id})-[h:HAS_RBAC_ROLE]->(r:RBACRole)
       RETURN r.permissions as permissions`,
      { id }
    );

    // Get persona's inherited RBAC roles from parent hierarchy
    const inheritedRolesResult = await session.run(
      `MATCH (p:Persona {id: $id})<-[:PARENT_OF*]-(parent:Persona)-[h:HAS_RBAC_ROLE]->(r:RBACRole)
       RETURN r.permissions as permissions`,
      { id }
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

    return ok({ permissions: Array.from(permissions) });
  } catch (err: any) {
    return error(500, "internal_error", "failed to get persona permissions", { error: err.message });
  } finally {
    await session.close();
  }
}
