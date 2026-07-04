// KPI CRUD handlers for KPI-SLA management system (kpi-okr-governance)
// POST /api/v1/kpis             - create KPI
// GET  /api/v1/kpis             - list KPIs (FR-10a; ?include_archived)
// GET  /api/v1/kpis/:id         - get KPI resource (FR-13)
// PATCH /api/v1/kpis/:id        - update KPI
// POST /api/v1/kpis/:id/archive - archive KPI (FR-13; the POST /kpis/:id
//                                 overload was retired per DEC-01)
// GET  /api/v1/kpis/:id/audit   - audit log (DEC-02 placeholder; the
//                                 GET /kpis/:id overload was retired)

import type { Driver } from "neo4j-driver";
import { z } from "zod";
import {
  kpiCreateRequestSchema,
  kpiPatchRequestSchema,
} from "@companygraph/shared/schema/kpi-sla";
import { getDriver } from "../neo4j/driver";
import { generateId } from "../ids";
import { ok, error, parseWith, parseQueryBool, readJson } from "./_helpers";

// DD-04 — path guard accepts ANY UUID version. The as-built v7-only
// parseId made PATCH/archive/audit of the v4 ids this file used to mint
// return 400 (V-01); pre-existing v4 KPIs must stay addressable.
const uuidAny = z.string().uuid();

// POST /api/v1/kpis - create KPI (returns 200, not 201 — pinned as-built)
export async function handleKpiPost(req: Request): Promise<Response> {
  const body = parseWith(kpiCreateRequestSchema, await readJson(req));
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

  const id = generateId(); // FR-14 — UUIDv7 (was crypto.randomUUID() v4)
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
        warning_threshold: warning_threshold ?? null,
        critical_threshold: critical_threshold ?? null,
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

// GET /api/v1/kpis - list KPIs (FR-10a). include_archived is parsed via
// parseQueryBool ("true"/"1" only) — the shared listQuerySchema is
// OpenAPI documentation, never wired here (design §4.5 / review C-01).
export async function handleKpiList(req: Request): Promise<Response> {
  const inclArch = parseQueryBool(new URL(req.url), "include_archived");

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (k:KPI)
       WHERE $inclArch OR k.archived_at IS NULL
       RETURN k
       ORDER BY k.created_at DESC`,
      { inclArch },
    );
    const rows = result.records.map((r) => r.get("k").properties);
    return ok({ rows });
  } finally {
    await session.close();
  }
}

// GET /api/v1/kpis/:id - KPI resource (FR-13). Archived KPIs ARE
// returned — archived_at tells the caller (design §4.4).
export async function handleKpiGet(req: Request, kpiId: string): Promise<Response> {
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed id", { id: kpiId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run("MATCH (k:KPI {id: $id}) RETURN k", { id: kpiId });
    if (result.records.length === 0) {
      return error(404, "not_found", "KPI not found", { id: kpiId });
    }
    return ok(result.records[0]!.get("k").properties);
  } finally {
    await session.close();
  }
}

// PATCH /api/v1/kpis/:id - update KPI
export async function handleKpiPatch(req: Request, kpiId: string): Promise<Response> {
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed id", { id: kpiId });
  }
  const id = kpiId;

  const body = parseWith(kpiPatchRequestSchema, await readJson(req));
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

    // Build dynamic SET clause over the as-built 10-field allow-list
    // (kpiPatchRequestSchema strips everything else in strip mode; the
    // explicit list stays as belt-and-braces against schema drift).
    const updates: string[] = ["k.updated_at = $now"];
    const params: Record<string, unknown> = { id, now };

    const allowedFields = [
      "name", "description", "category", "unit", "target_value",
      "target_direction", "warning_threshold", "critical_threshold",
      "measurement_frequency", "owner_role"
    ] as const;

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
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed id", { id: kpiId });
  }
  const id = kpiId;

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

// GET /api/v1/kpis/:id/audit - get KPI audit log (DEC-02 placeholder:
// one synthetic row from node timestamps, user_id "system" — real audit
// storage is deferred to a future spec; documented honestly in OpenAPI).
export async function handleKpiAuditLog(req: Request, kpiId: string): Promise<Response> {
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed id", { id: kpiId });
  }
  const id = kpiId;

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
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
