// SLA CRUD handlers for KPI-SLA management system
// POST /api/v1/slas - create SLA
// PATCH /api/v1/slas/:id - update SLA
// POST /api/v1/slas/:id/archive - archive SLA
// GET /api/v1/slas/:id/audit - get SLA audit log

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";

// POST /api/v1/slas - create SLA
export async function handleSlaPost(req: Request): Promise<Response> {
  const body = await req.json();
  const {
    name,
    description,
    service_type,
    target_value,
    target_unit,
    measurement_window,
    window_duration,
    penalty_type,
    penalty_amount,
    compliance_threshold,
    domain_id,
    product_type,
  } = body;

  if (!name || !service_type || target_value === undefined || !target_unit || !measurement_window || !window_duration || compliance_threshold === undefined) {
    return error(400, "invalid_payload", "missing required fields", {
      required: ["name", "service_type", "target_value", "target_unit", "measurement_window", "window_duration", "compliance_threshold"]
    });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `CREATE (s:SLA {
        id: $id,
        name: $name,
        description: $description,
        service_type: $service_type,
        target_value: $target_value,
        target_unit: $target_unit,
        measurement_window: $measurement_window,
        window_duration: $window_duration,
        penalty_type: $penalty_type,
        penalty_amount: $penalty_amount,
        compliance_threshold: $compliance_threshold,
        domain_id: $domain_id,
        product_type: $product_type,
        created_at: $now,
        updated_at: $now,
        archived_at: null
      })
      RETURN s`,
      {
        id,
        name,
        description: description || null,
        service_type,
        target_value,
        target_unit,
        measurement_window,
        window_duration,
        penalty_type: penalty_type || null,
        penalty_amount: penalty_amount || null,
        compliance_threshold,
        domain_id: domain_id || null,
        product_type: product_type || null,
        now,
      }
    );

    const sla = result.records[0]?.get("s").properties;
    return ok({ id, ...sla });
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/slas/:id - update SLA
export async function handleSlaPatch(req: Request, slaId: string): Promise<Response> {
  const id = parseId(slaId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: slaId });

  const body = await req.json();
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Check if SLA exists and is not archived
    const check = await session.run(
      "MATCH (s:SLA {id: $id}) WHERE s.archived_at IS NULL RETURN s",
      { id }
    );
    if (check.records.length === 0) {
      return error(404, "not_found", "SLA not found or archived", { id });
    }

    // Build dynamic SET clause
    const updates: string[] = ["s.updated_at = $now"];
    const params: any = { id, now };

    const allowedFields = [
      "name", "description", "service_type", "target_value", "target_unit",
      "measurement_window", "window_duration", "penalty_type", "penalty_amount", "compliance_threshold", "domain_id", "product_type"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`s.${field} = $${field}`);
        params[field] = body[field];
      }
    }

    const result = await session.run(
      `MATCH (s:SLA {id: $id})
       WHERE s.archived_at IS NULL
       SET ${updates.join(", ")}
       RETURN s`,
      params
    );

    const sla = result.records[0]?.get("s").properties;
    return ok({ id, ...sla });
  } finally {
    await session.close();
  }
}

// POST /api/v1/slas/:id/archive - archive SLA
export async function handleSlaArchive(req: Request, slaId: string): Promise<Response> {
  const id = parseId(slaId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: slaId });

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (s:SLA {id: $id})
       WHERE s.archived_at IS NULL
       SET s.archived_at = $now, s.updated_at = $now
       RETURN s`,
      { id, now }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "SLA not found or already archived", { id });
    }

    const sla = result.records[0]?.get("s").properties;
    return ok({ id, ...sla });
  } finally {
    await session.close();
  }
}

// GET /api/v1/slas/:id/audit - get SLA audit log
export async function handleSlaAuditLog(req: Request, slaId: string): Promise<Response> {
  const id = parseId(slaId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: slaId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Placeholder for audit log - would require audit nodes
    const result = await session.run(
      `MATCH (s:SLA {id: $id})
       RETURN s.id AS id, s.name AS name, s.created_at AS created_at,
              s.updated_at AS updated_at, s.archived_at AS archived_at`,
      { id }
    );

    if (result.records.length === 0) {
      return error(404, "not_found", "SLA not found", { id });
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
