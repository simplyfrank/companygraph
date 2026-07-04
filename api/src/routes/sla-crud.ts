// SLA CRUD handlers for KPI-SLA management system (kpi-okr-governance)
// POST /api/v1/slas             - create SLA
// GET  /api/v1/slas             - list SLAs (FR-10b; ?include_archived)
// GET  /api/v1/slas/:id         - get SLA resource (FR-13)
// PATCH /api/v1/slas/:id        - update SLA
// POST /api/v1/slas/:id/archive - archive SLA (FR-13; POST /slas/:id
//                                 overload retired per DEC-01)
// GET  /api/v1/slas/:id/audit   - audit log (DEC-02 placeholder)

import type { Driver } from "neo4j-driver";
import { z } from "zod";
import {
  slaCreateRequestSchema,
  slaPatchRequestSchema,
} from "@companygraph/shared/schema/kpi-sla";
import { getDriver } from "../neo4j/driver";
import { generateId } from "../ids";
import { ok, error, parseWith, parseQueryBool, readJson } from "./_helpers";

// DD-04 — path guard accepts ANY UUID version (V-01: as-built v7-only
// parseId made the v4-id lifecycle 400).
const uuidAny = z.string().uuid();

// POST /api/v1/slas - create SLA (returns 200, not 201 — pinned as-built)
export async function handleSlaPost(req: Request): Promise<Response> {
  const body = parseWith(slaCreateRequestSchema, await readJson(req));
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

  const id = generateId(); // FR-14 — UUIDv7 (was crypto.randomUUID() v4)
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
        penalty_amount: penalty_amount ?? null,
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

// GET /api/v1/slas - list SLAs (FR-10b). include_archived via
// parseQueryBool ONLY (design §4.5 / review C-01).
export async function handleSlaList(req: Request): Promise<Response> {
  const inclArch = parseQueryBool(new URL(req.url), "include_archived");

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (s:SLA)
       WHERE $inclArch OR s.archived_at IS NULL
       RETURN s
       ORDER BY s.created_at DESC`,
      { inclArch },
    );
    const rows = result.records.map((r) => r.get("s").properties);
    return ok({ rows });
  } finally {
    await session.close();
  }
}

// GET /api/v1/slas/:id - SLA resource (FR-13). Archived SLAs ARE returned.
export async function handleSlaGet(req: Request, slaId: string): Promise<Response> {
  if (!uuidAny.safeParse(slaId).success) {
    return error(400, "invalid_payload", "malformed id", { id: slaId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run("MATCH (s:SLA {id: $id}) RETURN s", { id: slaId });
    if (result.records.length === 0) {
      return error(404, "not_found", "SLA not found", { id: slaId });
    }
    return ok(result.records[0]!.get("s").properties);
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/slas/:id - update SLA
export async function handleSlaPatch(req: Request, slaId: string): Promise<Response> {
  if (!uuidAny.safeParse(slaId).success) {
    return error(400, "invalid_payload", "malformed id", { id: slaId });
  }
  const id = slaId;

  const body = parseWith(slaPatchRequestSchema, await readJson(req));
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

    // Dynamic SET over the schema's allow-list (as-built the ladder also
    // accepted domain_id/product_type on PATCH; the patch schema omits
    // them — they are creation-scoped, matching the documented contract).
    const updates: string[] = ["s.updated_at = $now"];
    const params: Record<string, unknown> = { id, now };

    const allowedFields = [
      "name", "description", "service_type", "target_value", "target_unit",
      "measurement_window", "window_duration", "penalty_type",
      "penalty_amount", "compliance_threshold"
    ] as const;

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
  if (!uuidAny.safeParse(slaId).success) {
    return error(400, "invalid_payload", "malformed id", { id: slaId });
  }
  const id = slaId;

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

// GET /api/v1/slas/:id/audit - audit log (DEC-02 placeholder: one
// synthetic row from node timestamps, user_id "system").
export async function handleSlaAuditLog(req: Request, slaId: string): Promise<Response> {
  if (!uuidAny.safeParse(slaId).success) {
    return error(400, "invalid_payload", "malformed id", { id: slaId });
  }
  const id = slaId;

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
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
