// Persona API handlers
// POST /api/v1/personas - create persona
// GET /api/v1/personas - list personas
// GET /api/v1/personas/:id - get persona by id
// PATCH /api/v1/personas/:id - update persona
// DELETE /api/v1/personas/:id - delete/archive persona
// POST /api/v1/persona-assignments - assign persona to domain
// GET /api/v1/persona-assignments - list persona assignments for domain
// DELETE /api/v1/persona-assignments/:id - remove persona assignment

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";

// POST /api/v1/personas - create persona
export async function handlePersonaPost(req: Request): Promise<Response> {
  const body = await req.json();
  const { name, description, attributes, parentPersonaId, rbacRoleIds } = body;

  if (!name) {
    return error(400, "invalid_payload", "missing required field: name", { required: ["name"] });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `CREATE (p:Persona {
        id: $id,
        name: $name,
        description: $description,
        attributes: $attributes,
        parentPersonaId: $parentPersonaId,
        rbacRoleIds: $rbacRoleIds,
        createdAt: $now,
        updatedAt: $now
      }) RETURN p`,
      { id, name, description: description || "", attributes: attributes || {}, parentPersonaId: parentPersonaId || null, rbacRoleIds: rbacRoleIds || [], now }
    );

    // Create PARENT_OF relationship if parentPersonaId is provided
    if (parentPersonaId) {
      await session.run(
        `MATCH (p:Persona {id: $id}), (parent:Persona {id: $parentPersonaId})
         CREATE (parent)-[:PARENT_OF]->(p)`,
        { id, parentPersonaId }
      );
    }

    // Create HAS_RBAC_ROLE relationships for each RBAC role
    if (rbacRoleIds && rbacRoleIds.length > 0) {
      for (const rbacRoleId of rbacRoleIds) {
        await session.run(
          `MATCH (p:Persona {id: $id}), (r:RBACRole {id: $rbacRoleId})
           CREATE (p)-[:HAS_RBAC_ROLE]->(r)`,
          { id, rbacRoleId }
        );
      }
    }

    const persona = result.records[0]?.get("p")?.properties;
    return ok({ persona });
  } catch (err: any) {
    return error(500, "internal_error", "failed to create persona", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/personas - list personas
export async function handlePersonaList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const domainId = url.searchParams.get("domain_id");
  const roleType = url.searchParams.get("role_type");
  const isTemplate = url.searchParams.get("is_template");

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    let query = "MATCH (p:Persona) WHERE p.archivedAt IS NULL";
    const params: Record<string, any> = {};

    if (domainId) {
      query += " AND (p)-[:ASSIGNED_TO]->(:Domain {id: $domainId})";
      params.domainId = domainId;
    }

    if (roleType) {
      query += " AND p.attributes.roleType = $roleType";
      params.roleType = roleType;
    }

    if (isTemplate !== null) {
      query += " AND p.attributes.isTemplate = $isTemplate";
      params.isTemplate = isTemplate === "true";
    }

    query += " RETURN p ORDER BY p.name";

    const result = await session.run(query, params);
    const personas = result.records.map((r) => r.get("p")?.properties);

    return ok({ personas });
  } catch (err: any) {
    return error(500, "internal_error", "failed to list personas", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/personas/:id - get persona by id
export async function handlePersonaGet(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (p:Persona {id: $id}) WHERE p.archivedAt IS NULL RETURN p`,
      { id }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "persona not found", { id });
    }

    const persona = result.records[0].get("p")?.properties;

    // Get related domains
    const domainsResult = await session.run(
      `MATCH (p:Persona {id: $id})-[a:ASSIGNED_TO]->(d:Domain)
       RETURN d.id, d.name, a.isPrimary, a.allocationPercentage, a.effectiveStartDate, a.effectiveEndDate`,
      { id }
    );
    const domains = domainsResult.records.map((r) => ({
      id: r.get("d.id"),
      name: r.get("d.name"),
      isPrimary: r.get("a.isPrimary"),
      allocationPercentage: r.get("a.allocationPercentage"),
      effectiveStartDate: r.get("a.effectiveStartDate"),
      effectiveEndDate: r.get("a.effectiveEndDate"),
    }));

    return ok({ persona, domains });
  } catch (err: any) {
    return error(500, "internal_error", "failed to get persona", { error: err.message });
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/personas/:id - update persona
export async function handlePersonaPatch(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }
  const body = await req.json();
  const { name, description, attributes, parentPersonaId, rbacRoleIds } = body;

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const setClauses = [];
    const updateParams: Record<string, any> = { id, now };

    if (name !== undefined) {
      setClauses.push("p.name = $name");
      updateParams.name = name;
    }
    if (description !== undefined) {
      setClauses.push("p.description = $description");
      updateParams.description = description;
    }
    if (attributes !== undefined) {
      setClauses.push("p.attributes = $attributes");
      updateParams.attributes = attributes;
    }
    if (parentPersonaId !== undefined) {
      setClauses.push("p.parentPersonaId = $parentPersonaId");
      updateParams.parentPersonaId = parentPersonaId;
    }
    if (rbacRoleIds !== undefined) {
      setClauses.push("p.rbacRoleIds = $rbacRoleIds");
      updateParams.rbacRoleIds = rbacRoleIds;
    }

    if (setClauses.length === 0) {
      return error(400, "invalid_payload", "no fields to update", {});
    }

    setClauses.push("p.updatedAt = $now");

    const query = `
      MATCH (p:Persona {id: $id}) WHERE p.archivedAt IS NULL
      SET ${setClauses.join(", ")}
      RETURN p
    `;

    const result = await session.run(query, updateParams);

    if (result.records.length === 0) {
      return error(404, "not_found", "persona not found", { id });
    }

    // Update PARENT_OF relationship if parentPersonaId changed
    if (parentPersonaId !== undefined) {
      // Remove existing PARENT_OF relationships
      await session.run(
        `MATCH (p:Persona {id: $id})<-[r:PARENT_OF]-() DELETE r`,
        { id }
      );

      // Create new PARENT_OF relationship if parentPersonaId is provided
      if (parentPersonaId) {
        await session.run(
          `MATCH (p:Persona {id: $id}), (parent:Persona {id: $parentPersonaId})
           CREATE (parent)-[:PARENT_OF]->(p)`,
          { id, parentPersonaId }
        );
      }
    }

    // Update HAS_RBAC_ROLE relationships if rbacRoleIds changed
    if (rbacRoleIds !== undefined) {
      // Remove existing HAS_RBAC_ROLE relationships
      await session.run(
        `MATCH (p:Persona {id: $id})-[r:HAS_RBAC_ROLE]->() DELETE r`,
        { id }
      );

      // Create new HAS_RBAC_ROLE relationships
      if (rbacRoleIds && rbacRoleIds.length > 0) {
        for (const rbacRoleId of rbacRoleIds) {
          await session.run(
            `MATCH (p:Persona {id: $id}), (r:RBACRole {id: $rbacRoleId})
             CREATE (p)-[:HAS_RBAC_ROLE]->(r)`,
            { id, rbacRoleId }
          );
        }
      }
    }

    const persona = result.records[0]?.get("p")?.properties;
    return ok({ persona });
  } catch (err: any) {
    return error(500, "internal_error", "failed to update persona", { error: err.message });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/personas/:id - delete/archive persona
export async function handlePersonaDelete(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Check if persona is in use
    const usageCheck = await session.run(
      `MATCH (p:Persona {id: $id}) WHERE p.archivedAt IS NULL
       OPTIONAL MATCH (p)-[r:ASSIGNED_TO]->()
       RETURN count(r) as assignments`,
      { id }
    );

    const assignments = usageCheck.records[0]?.get("assignments") || 0;

    if (assignments > 0 && !force) {
      return error(400, "in_use", "persona is assigned to domains", { assignments });
    }

    // Archive instead of delete
    const result = await session.run(
      `MATCH (p:Persona {id: $id}) WHERE p.archivedAt IS NULL
       SET p.archivedAt = $now
       RETURN p`,
      { id, now }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "persona not found", { id });
    }

    return ok({ success: true });
  } catch (err: any) {
    return error(500, "internal_error", "failed to delete persona", { error: err.message });
  } finally {
    await session.close();
  }
}

// POST /api/v1/persona-assignments - assign persona to domain
export async function handlePersonaAssignmentPost(req: Request): Promise<Response> {
  const body = await req.json();
  const { personaId, domainId, isPrimary, allocationPercentage, effectiveStartDate, effectiveEndDate, notes } = body;

  if (!personaId || !domainId) {
    return error(400, "invalid_payload", "missing required fields", { required: ["personaId", "domainId"] });
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

    // Verify domain exists
    const domainCheck = await session.run(
      "MATCH (d:Domain {id: $id}) RETURN d",
      { id: domainId }
    );
    if (domainCheck.records.length === 0) {
      return error(404, "not_found", "domain not found", { domainId });
    }

    // Create assignment
    const result = await session.run(
      `MATCH (p:Persona {id: $personaId}), (d:Domain {id: $domainId})
       CREATE (p)-[a:ASSIGNED_TO {
         id: $id,
         isPrimary: $isPrimary,
         allocationPercentage: $allocationPercentage,
         effectiveStartDate: $effectiveStartDate,
         effectiveEndDate: $effectiveEndDate,
         notes: $notes,
         createdAt: $now
       }]->(d)
       RETURN a`,
      {
        personaId,
        domainId,
        id,
        isPrimary: isPrimary || false,
        allocationPercentage: allocationPercentage || 100,
        effectiveStartDate: effectiveStartDate || now,
        effectiveEndDate: effectiveEndDate || null,
        notes: notes || "",
        now,
      }
    );

    const assignment = result.records[0]?.get("a")?.properties;
    return ok({ assignment });
  } catch (err: any) {
    return error(500, "internal_error", "failed to create persona assignment", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/persona-assignments - list persona assignments for domain
export async function handlePersonaAssignmentList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const domainId = url.searchParams.get("domain_id");

  if (!domainId) {
    return error(400, "invalid_payload", "missing required parameter: domain_id", {});
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (p:Persona)-[a:ASSIGNED_TO]->(d:Domain {id: $domainId})
       WHERE p.archivedAt IS NULL
       AND (a.effectiveEndDate IS NULL OR a.effectiveEndDate > datetime())
       RETURN p, a
       ORDER BY a.isPrimary DESC, p.name`,
      { domainId }
    );

    const assignments = result.records.map((r) => ({
      persona: r.get("p")?.properties,
      assignment: r.get("a")?.properties,
    }));

    return ok({ assignments });
  } catch (err: any) {
    return error(500, "internal_error", "failed to list persona assignments", { error: err.message });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/persona-assignments/:id - remove persona assignment
export async function handlePersonaAssignmentDelete(req: Request, id: string): Promise<Response> {
  const parsedId = parseId(id);
  if (!parsedId) {
    return error(400, "invalid_payload", "invalid id format", { id });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH ()-[a:ASSIGNED_TO {id: $id}]-() DELETE a RETURN count(a) as deleted`,
      { id }
    );

    const deleted = result.records[0]?.get("deleted") || 0;

    if (deleted === 0) {
      return error(404, "not_found", "assignment not found", { id });
    }

    return ok({ success: true });
  } catch (err: any) {
    return error(500, "internal_error", "failed to delete persona assignment", { error: err.message });
  } finally {
    await session.close();
  }
}
