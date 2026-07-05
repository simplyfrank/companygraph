// kpi-measurement-alignment FR-09, FR-11 — parameter binding CRUD + reconcile routes.
// POST   /api/v1/kpis/:id/param-bindings  - create PARAM_BINDS edge
// GET    /api/v1/kpis/:id/param-bindings  - list PARAM_BINDS edges for a KPI
// DELETE /api/v1/param-bindings/:bindingId - delete a PARAM_BINDS edge
// POST   /api/v1/kpis/:id/reconcile       - reconcile single KPI's params
// POST   /api/v1/kpis/reconcile-all       - reconcile all non-archived KPIs

import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { paramBindingCreateRequestSchema } from "@companygraph/shared/schema/kpi-sla";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseWith, readJson } from "./_helpers";
import { reconcileKpiParams, reconcileAllKpis } from "../derive/kpi-reconcile";

const uuidAny = z.string().uuid();

// Target type → Neo4j label mapping
const TARGET_LABELS: Record<string, string> = {
  journey: "UserJourney",
  activity: "Activity",
  domain: "Domain",
  system: "System",
};

// POST /api/v1/kpis/:id/param-bindings - create PARAM_BINDS edge
export async function handleParamBindingPost(req: Request, kpiId: string): Promise<Response> {
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed kpi_id", { id: kpiId });
  }

  const body = parseWith(paramBindingCreateRequestSchema, await readJson(req));
  const { target_type, target_id, parameter, attribute_path } = body;
  const targetLabel = TARGET_LABELS[target_type];
  if (!targetLabel) {
    return error(400, "invalid_payload", `unknown target_type: ${target_type}`, { target_type });
  }

  const now = new Date().toISOString();
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Verify KPI exists and is not archived
    const kpiCheck = await session.run(
      "MATCH (k:KPI {id: $id}) WHERE k.archived_at IS NULL RETURN k",
      { id: kpiId },
    );
    if (kpiCheck.records.length === 0) {
      return error(404, "not_found", "KPI not found or archived", { kpi_id: kpiId });
    }

    // Verify target entity exists
    const targetCheck = await session.run(
      `MATCH (t:${targetLabel} {id: $id}) RETURN t`,
      { id: target_id },
    );
    if (targetCheck.records.length === 0) {
      return error(404, "not_found", `${target_type} not found`, { target_id });
    }

    // Create PARAM_BINDS edge (MERGE for idempotency on same parameter)
    const result = await session.run(
      `MATCH (k:KPI {id: $kpiId}), (t:${targetLabel} {id: $targetId})
       MERGE (k)-[r:PARAM_BINDS {
         parameter: $parameter,
         attribute_path: $attribute_path
       }]->(t)
       SET r.created_at = $now
       RETURN k.id AS kpi_id, t.id AS target_id, labels(t)[0] AS target_type,
              r.parameter AS parameter, r.attribute_path AS attribute_path,
              r.created_at AS created_at, elementId(r) AS binding_id`,
      { kpiId, targetId: target_id, parameter, attribute_path, now },
    );

    const row = result.records[0];
    if (!row) {
      return error(500, "internal_error", "failed to create param binding", {});
    }

    return ok({
      binding_id: row.get("binding_id"),
      kpi_id: row.get("kpi_id"),
      target_type: row.get("target_type")?.toLowerCase(),
      target_id: row.get("target_id"),
      parameter: row.get("parameter"),
      attribute_path: row.get("attribute_path"),
      created_at: row.get("created_at"),
    }, 201);
  } finally {
    await session.close();
  }
}

// GET /api/v1/kpis/:id/param-bindings - list PARAM_BINDS edges for a KPI
export async function handleParamBindingsGet(req: Request, kpiId: string): Promise<Response> {
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed kpi_id", { id: kpiId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (k:KPI {id: $kpiId})-[r:PARAM_BINDS]->(t)
       RETURN elementId(r) AS binding_id,
              k.id AS kpi_id,
              labels(t)[0] AS target_type,
              t.id AS target_id,
              t.name AS target_name,
              r.parameter AS parameter,
              r.attribute_path AS attribute_path,
              r.created_at AS created_at
       ORDER BY r.created_at DESC`,
      { kpiId },
    );

    const rows = result.records.map((r) => ({
      binding_id: r.get("binding_id"),
      kpi_id: r.get("kpi_id"),
      target_type: (r.get("target_type") as string)?.toLowerCase(),
      target_id: r.get("target_id"),
      target_name: r.get("target_name"),
      parameter: r.get("parameter"),
      attribute_path: r.get("attribute_path"),
      created_at: r.get("created_at"),
    }));

    return ok({ rows });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/param-bindings/:bindingId - delete a PARAM_BINDS edge
export async function handleParamBindingDelete(req: Request, bindingId: string): Promise<Response> {
  if (!bindingId || typeof bindingId !== "string") {
    return error(400, "invalid_payload", "malformed binding_id", { id: bindingId });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (k:KPI)-[r:PARAM_BINDS]->()
       WHERE elementId(r) = $id
       DELETE r
       RETURN count(r) AS deleted`,
      { id: bindingId },
    );

    if (result.records[0]?.get("deleted")?.toNumber() === 0) {
      return error(404, "not_found", "param binding not found", { id: bindingId });
    }

    return ok({ deleted: true });
  } finally {
    await session.close();
  }
}

// POST /api/v1/kpis/:id/reconcile - reconcile single KPI's params
export async function handleKpiReconcile(req: Request, kpiId: string): Promise<Response> {
  if (!uuidAny.safeParse(kpiId).success) {
    return error(400, "invalid_payload", "malformed kpi_id", { id: kpiId });
  }

  const result = await reconcileKpiParams(kpiId);
  return ok(result);
}

// POST /api/v1/kpis/reconcile-all - reconcile all non-archived KPIs
export async function handleKpiReconcileAll(req: Request): Promise<Response> {
  const result = await reconcileAllKpis();
  return ok(result);
}
