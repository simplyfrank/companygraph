// kpi-measurement-alignment FR-10 — parameter binding reconciliation.
// Reads all PARAM_BINDS edges for a KPI, resolves each attribute_path on
// the target entity's attributes_json, and PATCHes the KPI node's bound
// parameter to the resolved value. Static (unbound) parameters untouched.

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { metrics } from "../metrics";

export interface ReconciledParam {
  parameter: string;
  old_value: number;
  new_value: number;
  entity_id: string;
}

export interface ReconcileResult {
  kpi_id: string;
  reconciled: ReconciledParam[];
  unchanged: string[];
}

// Resolve a dotted attribute path (e.g. "throughputTarget") on a parsed
// attributes JSON object. Returns undefined if the path doesn't resolve.
function resolveAttributePath(attrs: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = attrs;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export async function reconcileKpiParams(kpiId: string): Promise<ReconcileResult> {
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Read all PARAM_BINDS edges + target entity attributes
    const bindingsResult = await session.run(
      `MATCH (k:KPI {id: $kpiId})-[r:PARAM_BINDS]->(t)
       RETURN r.parameter AS parameter,
              r.attribute_path AS attribute_path,
              t.id AS entity_id,
              labels(t)[0] AS entity_label,
              t.attributes_json AS attributes_json,
              k.target_value AS target_value,
              k.warning_threshold AS warning_threshold,
              k.critical_threshold AS critical_threshold`,
      { kpiId },
    );

    const reconciled: ReconciledParam[] = [];
    const unchanged: string[] = [];

    for (const record of bindingsResult.records) {
      const parameter = record.get("parameter") as string;
      const attributePath = record.get("attribute_path") as string;
      const entityId = record.get("entity_id") as string;
      const attributesJson = record.get("attributes_json") as string | null;

      // Parse attributes_json
      let attrs: Record<string, unknown> = {};
      if (attributesJson) {
        try {
          attrs = JSON.parse(attributesJson);
        } catch {
          // Corrupt JSON — skip this binding
          unchanged.push(parameter);
          continue;
        }
      }

      const resolved = resolveAttributePath(attrs, attributePath);
      if (resolved === undefined || typeof resolved !== "number") {
        // Path not found or not a number — skip
        unchanged.push(parameter);
        continue;
      }

      const currentValue = record.get(`target_value`) as number | null;
      const existingValue =
        parameter === "target_value"
          ? record.get("target_value")
          : parameter === "warning_threshold"
            ? record.get("warning_threshold")
            : record.get("critical_threshold");

      if (existingValue === resolved) {
        unchanged.push(parameter);
        continue;
      }

      // PATCH the KPI parameter
      await session.run(
        `MATCH (k:KPI {id: $kpiId})
         SET k.${parameter} = $value, k.updated_at = $now`,
        { kpiId, value: resolved, now: new Date().toISOString() },
      );

      reconciled.push({
        parameter,
        old_value: existingValue as number,
        new_value: resolved,
        entity_id: entityId,
      });
    }

    // Observability (FR-15)
    metrics.increment("kpi_reconciliation_runs_total");
    metrics.set("kpi_reconciliation_bindings_active", bindingsResult.records.length, { kpi_id: kpiId });

    return { kpi_id: kpiId, reconciled, unchanged };
  } finally {
    await session.close();
  }
}

// FR-11 — batch reconciliation for all non-archived KPIs
export async function reconcileAllKpis(): Promise<{
  reconciled_kpis: number;
  total_bindings: number;
  total_reconciled: number;
}> {
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (k:KPI) WHERE k.archived_at IS NULL RETURN k.id AS id`,
    );
    const kpiIds = result.records.map((r) => r.get("id") as string);

    let reconciledKpis = 0;
    let totalBindings = 0;
    let totalReconciled = 0;

    for (const kpiId of kpiIds) {
      const result = await reconcileKpiParams(kpiId);
      if (result.reconciled.length > 0) {
        reconciledKpis++;
        totalReconciled += result.reconciled.length;
      }
      totalBindings += result.reconciled.length + result.unchanged.length;
    }

    return {
      reconciled_kpis: reconciledKpis,
      total_bindings: totalBindings,
      total_reconciled: totalReconciled,
    };
  } finally {
    await session.close();
  }
}
