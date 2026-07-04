// KPI CRUD handlers for KPI-SLA management system
// POST /api/v1/kpis - create KPI
// PATCH /api/v1/kpis/:id - update KPI
// POST /api/v1/kpis/:id/archive - archive KPI
// GET /api/v1/kpis/:id/audit - get KPI audit log

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";

// POST /api/v1/kpis - create KPI
export async function handleKpiPost(req: Request): Promise<Response> {
  const body = await req.json();
  const {
    name,
    description,
    category,
    unit,
    target_value,
    target_direction,
    warning_threshold,
    critical_threshold,
    measurement_frequency,
    owner_role,
    domain_id,
  } = body;

  if (!name || !category || !unit || target_value === undefined || !target_direction || !measurement_frequency) {
    return error(400, "invalid_payload", "missing required fields", { required: ["name", "category", "unit", "target_value", "target_direction", "measurement_frequency"] });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `CREATE (k:KPI {
        id: $id,
        name: $name,
        description: $description,
        category: $category,
        unit: $unit,
        target_value: $target_value,
        target_direction: $target_direction,
        warning_threshold: $warning_threshold,
        critical_threshold: $critical_threshold,
        measurement_frequency: $measurement_frequency,
        owner_role: $owner_role,
        domain_id: $domain_id,
        created_at: $now,
        updated_at: $now,
        archived_at: null
      })
      RETURN k`,
      {
        id,
        name,
        description: description || null,
        category,
        unit,
        target_value,
        target_direction,
        warning_threshold: warning_threshold || null,
        critical_threshold: critical_threshold || null,
        measurement_frequency,
        owner_role: owner_role || null,
        domain_id: domain_id || null,
        now,
      }
    );

    const kpi = result.records[0]?.get("k").properties;
    return ok({ id, ...kpi });
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/kpis/:id - update KPI
export async function handleKpiPatch(req: Request, kpiId: string): Promise<Response> {
  const id = parseId(kpiId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: kpiId });

  const body = await req.json();
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Check if KPI exists and is not archived
    const check = await session.run(
      "MATCH (k:KPI {id: $id}) WHERE k.archived_at IS NULL RETURN k",
      { id }
    );
    if (check.records.length === 0) {
      return error(404, "not_found", "KPI not found or archived", { id });
    }

    // Build dynamic SET clause
    const updates: string[] = ["k.updated_at = $now"];
    const params: any = { id, now };

    const allowedFields = [
      "name", "description", "category", "unit", "target_value",
      "target_direction", "warning_threshold", "critical_threshold",
      "measurement_frequency", "owner_role"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`k.${field} = $${field}`);
        params[field] = body[field];
      }
    }

    const result = await session.run(
      `MATCH (k:KPI {id: $id})
       WHERE k.archived_at IS NULL
       SET ${updates.join(", ")}
       RETURN k`,
      params
    );

    const kpi = result.records[0]?.get("k").properties;
    return ok({ id, ...kpi });
  } finally {
    await session.close();
  }
}

// POST /api/v1/kpis/:id/archive - archive KPI
export async function handleKpiArchive(req: Request, kpiId: string): Promise<Response> {
  const id = parseId(kpiId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: kpiId });

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (k:KPI {id: $id})
       WHERE k.archived_at IS NULL
       SET k.archived_at = $now, k.updated_at = $now
       RETURN k`,
      { id, now }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "KPI not found or already archived", { id });
    }

    const kpi = result.records[0]?.get("k").properties;
    return ok({ id, ...kpi });
  } finally {
    await session.close();
  }
}

// GET /api/v1/kpis/:id/audit - get KPI audit log
export async function handleKpiAuditLog(req: Request, kpiId: string): Promise<Response> {
  const id = parseId(kpiId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: kpiId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Placeholder for audit log - would require audit nodes
    // For now, return the KPI with its creation/update timestamps
    const result = await session.run(
      `MATCH (k:KPI {id: $id})
       RETURN k.id AS id, k.name AS name, k.created_at AS created_at,
              k.updated_at AS updated_at, k.archived_at AS archived_at`,
      { id }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "KPI not found", { id });
    }

    const row = result.records[0];
    return ok({
      rows: [{
        id: row.get("id"),
        name: row.get("name"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        archived_at: row.get("archived_at"),
        action: "view",
        user_id: "system",
        timestamp: row.get("updated_at"),
      }]
    });
  } finally {
    await session.close();
  }
}
