import { getDriver } from "../neo4j/driver";
import { generateId } from "../ids";
import {
  error,
  ok,
  noContent,
  parseId,
  readJson,
} from "./_helpers";

// Domain CRUD handlers for US-DM-05: Domain Lifecycle Management

export async function handleDomainPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const { name, description, accountable_role, team_assignments, compliance_tags } = body as Record<string, unknown>;

  if (!name || typeof name !== "string") {
    return error(400, "invalid_payload", "name is required and must be a string");
  }

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check for unique name constraint
    const existingCheck = await session.run(
      "MATCH (d:Domain {name: $name}) RETURN d.id AS id",
      { name }
    );
    if (existingCheck.records.length > 0) {
      return error(409, "id_conflict", "domain with this name already exists", { name });
    }

    // Create domain with generated ID
    const id = generateId();
    const now = new Date().toISOString();

    const result = await session.run(
      `CREATE (d:Domain {
        id: $id,
        name: $name,
        description: $description,
        accountable_role: $accountable_role,
        verified_date: $now,
        verified_by: null,
        compliance_tags: $compliance_tags,
        status: 'active',
        created_at: $now,
        updated_at: $now
      })
      RETURN d`,
      {
        id,
        name,
        description: description || null,
        accountable_role: accountable_role || null,
        compliance_tags: compliance_tags || [],
        now,
      }
    );

    const node = result.records[0]?.get("d");
    return ok(node, 201);
  } finally {
    await session.close();
  }
}

export async function handleDomainPatch(req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });

  const body = await readJson(req);
  const { name, description, accountable_role, team_assignments, compliance_tags } = body as Record<string, unknown>;

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if domain exists
    const existingCheck = await session.run(
      "MATCH (d:Domain {id: $id}) RETURN d",
      { id }
    );
    if (existingCheck.records.length === 0) {
      return error(404, "not_found", "domain not found", { id });
    }

    // Build update parts dynamically
    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

    if (name !== undefined) {
      updates.push("d.name = $name");
      params.name = name;
    }
    if (description !== undefined) {
      updates.push("d.description = $description");
      params.description = description;
    }
    if (accountable_role !== undefined) {
      updates.push("d.accountable_role = $accountable_role");
      params.accountable_role = accountable_role;
    }
    if (compliance_tags !== undefined) {
      updates.push("d.compliance_tags = $compliance_tags");
      params.compliance_tags = compliance_tags;
    }

    updates.push("d.updated_at = $now");
    params.now = new Date().toISOString();

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      const node = existingCheck.records[0]?.get("d");
      return ok(node);
    }

    const result = await session.run(
      `MATCH (d:Domain {id: $id})
       SET ${updates.join(", ")}
       RETURN d`,
      params
    );

    const node = result.records[0]?.get("d");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleDomainArchive(req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if domain exists
    const existingCheck = await session.run(
      "MATCH (d:Domain {id: $id}) RETURN d",
      { id }
    );
    if (existingCheck.records.length === 0) {
      return error(404, "not_found", "domain not found", { id });
    }

    // Soft delete by setting status to archived
    const result = await session.run(
      `MATCH (d:Domain {id: $id})
       SET d.status = 'archived', d.updated_at = $now
       RETURN d`,
      { id, now: new Date().toISOString() }
    );

    const node = result.records[0]?.get("d");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleDomainAuditLog(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if domain exists
    const existingCheck = await session.run(
      "MATCH (d:Domain {id: $id}) RETURN d",
      { id }
    );
    if (existingCheck.records.length === 0) {
      return error(404, "not_found", "domain not found", { id });
    }

    // For now, return empty audit log (full audit trail would require DomainAudit nodes)
    // This is a placeholder for the full audit logging implementation
    const result = await session.run(
      `MATCH (d:Domain {id: $id})
       RETURN d.id AS id, d.name AS name, d.created_at AS created_at, d.updated_at AS updated_at`,
      { id }
    );

    const rows = result.records.map((r) => ({
      id: r.get("id"),
      domain_id: id,
      action: "update",
      user_id: "system",
      timestamp: r.get("updated_at"),
      changes: [],
    }));

    return ok({ rows });
  } finally {
    await session.close();
  }
}

// kpi-okr-governance FR-10d — GET /api/v1/domains list. This handler is
// the ONLY export of this file owned by kpi-okr-governance (narrow touch
// per its design §4.9); everything above stays _baseline-governed.
export async function handleDomainList(req: Request): Promise<Response> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (d:Domain)
       RETURN d.id AS id, d.name AS name, d.description AS description
       ORDER BY d.name`,
    );
    const rows = result.records.map((r) => ({
      id: r.get("id"),
      name: r.get("name"),
      description: r.get("description"),
    }));
    return ok({ rows });
  } finally {
    await session.close();
  }
}
