// User-Persona assignment API handlers
// POST /api/v1/users/:userId/personas - assign persona to user
// GET /api/v1/users/:userId/personas - list user's persona assignments
// DELETE /api/v1/users/:userId/personas/:personaId - remove persona assignment
// POST /api/v1/users/:userId/personas/:personaId/domains - assign domain to user's persona
// DELETE /api/v1/users/:userId/personas/:personaId/domains/:domainId - remove domain assignment

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";

// POST /api/v1/users/:userId/personas - assign persona to user
export async function handleUserPersonaPost(req: Request, userId: string): Promise<Response> {
  const parsedUserId = parseId(userId);
  if (!parsedUserId) {
    return error(400, "invalid_payload", "invalid user id format", { userId });
  }

  const body = await req.json();
  const { personaId, domainIds } = body;

  if (!personaId) {
    return error(400, "invalid_payload", "missing required field: personaId", { required: ["personaId"] });
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

    // Check if assignment already exists
    const existingCheck = await session.run(
      `MATCH (u:User {id: $userId})-[h:HAS_PERSONA]->(p:Persona {id: $personaId})
       RETURN h`,
      { userId, personaId }
    );
    if (existingCheck.records.length > 0) {
      return error(409, "id_conflict", "persona already assigned to user", { userId, personaId });
    }

    // Create User node if it doesn't exist
    await session.run(
      `MERGE (u:User {id: $userId})
       ON CREATE SET u.createdAt = $now, u.updatedAt = $now
       ON MATCH SET u.updatedAt = $now`,
      { userId, now }
    );

    // Create HAS_PERSONA relationship
    const result = await session.run(
      `MATCH (u:User {id: $userId}), (p:Persona {id: $personaId})
       CREATE (u)-[h:HAS_PERSONA { id: $id, domainIds: $domainIds, createdAt: $now }]->(p)
       RETURN h`,
      { userId, personaId, id, domainIds: domainIds || [], now }
    );

    const assignment = result.records[0]?.get("h")?.properties;
    return ok({ assignment }, 201);
  } catch (err: any) {
    return error(500, "internal_error", "failed to assign persona to user", { error: err.message });
  } finally {
    await session.close();
  }
}

// GET /api/v1/users/:userId/personas - list user's persona assignments
export async function handleUserPersonaList(req: Request, userId: string): Promise<Response> {
  const parsedUserId = parseId(userId);
  if (!parsedUserId) {
    return error(400, "invalid_payload", "invalid user id format", { userId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (u:User {id: $userId})-[h:HAS_PERSONA]->(p:Persona)
       WHERE p.archivedAt IS NULL
       RETURN p, h.domainIds as domainIds, h.createdAt as assignedAt`,
      { userId }
    );

    const assignments = result.records.map((r) => ({
      persona: r.get("p")?.properties,
      domainIds: r.get("domainIds") || [],
      assignedAt: r.get("assignedAt"),
    }));

    return ok({ assignments });
  } catch (err: any) {
    return error(500, "internal_error", "failed to list user persona assignments", { error: err.message });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/users/:userId/personas/:personaId - remove persona assignment
export async function handleUserPersonaDelete(req: Request, userId: string, personaId: string): Promise<Response> {
  const parsedUserId = parseId(userId);
  const parsedPersonaId = parseId(personaId);
  if (!parsedUserId || !parsedPersonaId) {
    return error(400, "invalid_payload", "invalid id format", { userId, personaId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (u:User {id: $userId})-[h:HAS_PERSONA]->(p:Persona {id: $personaId})
       DELETE h RETURN count(h) as deleted`,
      { userId, personaId }
    );

    const deleted = result.records[0]?.get("deleted") || 0;

    if (deleted === 0) {
      return error(404, "not_found", "assignment not found", { userId, personaId });
    }

    return ok({ success: true });
  } catch (err: any) {
    return error(500, "internal_error", "failed to remove persona assignment", { error: err.message });
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/users/:userId/personas/:personaId - update domain assignments
export async function handleUserPersonaPatch(req: Request, userId: string, personaId: string): Promise<Response> {
  const parsedUserId = parseId(userId);
  const parsedPersonaId = parseId(personaId);
  if (!parsedUserId || !parsedPersonaId) {
    return error(400, "invalid_payload", "invalid id format", { userId, personaId });
  }

  const body = await req.json();
  const { domainIds } = body;

  if (domainIds === undefined || !Array.isArray(domainIds)) {
    return error(400, "invalid_payload", "domainIds must be an array", {});
  }

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (u:User {id: $userId})-[h:HAS_PERSONA]->(p:Persona {id: $personaId})
       SET h.domainIds = $domainIds, h.updatedAt = $now
       RETURN h`,
      { userId, personaId, domainIds, now }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "assignment not found", { userId, personaId });
    }

    const assignment = result.records[0]?.get("h")?.properties;
    return ok({ assignment });
  } catch (err: any) {
    return error(500, "internal_error", "failed to update persona assignment", { error: err.message });
  } finally {
    await session.close();
  }
}
