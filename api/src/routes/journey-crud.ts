import { getDriver } from "../neo4j/driver";
import { generateId } from "../ids";
import {
  error,
  ok,
  noContent,
  parseId,
  readJson,
} from "./_helpers";

// Journey CRUD handlers for US-JM-05: Journey Lifecycle Management

export async function handleJourneyPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const { name, description, domain_id, accountable_role, team_assignments, compliance_tags, sla_target_hours, kpi_target } = body as Record<string, unknown>;

  if (!name || typeof name !== "string") {
    return error(400, "invalid_payload", "name is required and must be a string");
  }

  if (!domain_id || typeof domain_id !== "string") {
    return error(400, "invalid_payload", "domain_id is required and must be a string");
  }

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if domain exists
    const domainCheck = await session.run(
      "MATCH (d:Domain {id: $domain_id}) RETURN d.id AS id",
      { domain_id }
    );
    if (domainCheck.records.length === 0) {
      return error(404, "not_found", "domain not found", { domain_id });
    }

    // Check for unique name within domain
    const existingCheck = await session.run(
      "MATCH (j:UserJourney {name: $name})-[:PART_OF]->(d:Domain {id: $domain_id}) RETURN j.id AS id",
      { name, domain_id }
    );
    if (existingCheck.records.length > 0) {
      return error(409, "id_conflict", "journey with this name already exists in this domain", { name, domain_id });
    }

    // Create journey with generated ID
    const id = generateId();
    const now = new Date().toISOString();

    const result = await session.run(
      `MATCH (d:Domain {id: $domain_id})
       CREATE (j:UserJourney {
        id: $id,
        name: $name,
        description: $description,
        accountable_role: $accountable_role,
        team_assignments: $team_assignments,
        compliance_tags: $compliance_tags,
        sla_target_hours: $sla_target_hours,
        kpi_target: $kpi_target,
        verified_date: $now,
        verified_by: null,
        status: 'active',
        version: 1,
        created_at: $now,
        updated_at: $now
      })
       CREATE (j)-[:PART_OF]->(d)
       RETURN j`,
      {
        id,
        name,
        description: description || null,
        domain_id,
        accountable_role: accountable_role || null,
        team_assignments: team_assignments || [],
        compliance_tags: compliance_tags || [],
        sla_target_hours: sla_target_hours || null,
        kpi_target: kpi_target || null,
        now,
      }
    );

    const node = result.records[0]?.get("j");
    return ok(node, 201);
  } finally {
    await session.close();
  }
}

export async function handleJourneyPatch(req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });

  const body = await readJson(req);
  const { name, description, accountable_role, team_assignments, compliance_tags, sla_target_hours, kpi_target } = body as Record<string, unknown>;

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if journey exists
    const existingCheck = await session.run(
      "MATCH (j:UserJourney {id: $id}) RETURN j",
      { id }
    );
    if (existingCheck.records.length === 0) {
      return error(404, "not_found", "journey not found", { id });
    }

    // Build update parts dynamically
    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

    if (name !== undefined) {
      updates.push("j.name = $name");
      params.name = name;
    }
    if (description !== undefined) {
      updates.push("j.description = $description");
      params.description = description;
    }
    if (accountable_role !== undefined) {
      updates.push("j.accountable_role = $accountable_role");
      params.accountable_role = accountable_role;
    }
    if (team_assignments !== undefined) {
      updates.push("j.team_assignments = $team_assignments");
      params.team_assignments = team_assignments;
    }
    if (compliance_tags !== undefined) {
      updates.push("j.compliance_tags = $compliance_tags");
      params.compliance_tags = compliance_tags;
    }
    if (sla_target_hours !== undefined) {
      updates.push("j.sla_target_hours = $sla_target_hours");
      params.sla_target_hours = sla_target_hours;
    }
    if (kpi_target !== undefined) {
      updates.push("j.kpi_target = $kpi_target");
      params.kpi_target = kpi_target;
    }

    updates.push("j.updated_at = $now");
    params.now = new Date().toISOString();

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      const node = existingCheck.records[0]?.get("j");
      return ok(node);
    }

    const existing = existingCheck.records[0]?.get("j");
    const snapshotId = generateId();
    const snapshotNow = params.now as string;

    const result = await session.executeWrite(async (tx) => {
      // Save snapshot of current state before mutation
      await tx.run(
        `MATCH (j:UserJourney {id: $journeyId})
         CREATE (snap:JourneySnapshot {
           id: $snapshotId,
           journey_id: $journeyId,
           version: j.version,
           name: j.name,
           description: j.description,
           accountable_role: j.accountable_role,
           team_assignments: j.team_assignments,
           compliance_tags: j.compliance_tags,
           sla_target_hours: j.sla_target_hours,
           kpi_target: j.kpi_target,
           snapshotted_at: $now
         })
         CREATE (j)-[:HAS_SNAPSHOT]->(snap)`,
        { journeyId: id, snapshotId, now: snapshotNow },
      );
      // Apply the mutation and bump version
      return tx.run(
        `MATCH (j:UserJourney {id: $id})
         SET ${updates.join(", ")}, j.version = coalesce(j.version, 1) + 1
         RETURN j`,
        params,
      );
    });

    void existing;
    const node = result.records[0]?.get("j");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleJourneyArchive(req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if journey exists
    const existingCheck = await session.run(
      "MATCH (j:UserJourney {id: $id}) RETURN j",
      { id }
    );
    if (existingCheck.records.length === 0) {
      return error(404, "not_found", "journey not found", { id });
    }

    // Soft delete by setting status to archived
    const result = await session.run(
      `MATCH (j:UserJourney {id: $id})
       SET j.status = 'archived', j.updated_at = $now
       RETURN j`,
      { id, now: new Date().toISOString() }
    );

    const node = result.records[0]?.get("j");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleJourneyAuditLog(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });

  const driver = getDriver();
  const session = driver.session();

  try {
    // Check if journey exists
    const existingCheck = await session.run(
      "MATCH (j:UserJourney {id: $id}) RETURN j",
      { id }
    );
    if (existingCheck.records.length === 0) {
      return error(404, "not_found", "journey not found", { id });
    }

    // For now, return empty audit log (full audit trail would require JourneyAudit nodes)
    // This is a placeholder for the full audit logging implementation
    const result = await session.run(
      `MATCH (j:UserJourney {id: $id})
       RETURN j.id AS id, j.name AS name, j.created_at AS created_at, j.updated_at AS updated_at`,
      { id }
    );

    const rows = result.records.map((r) => ({
      id: r.get("id"),
      journey_id: id,
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
