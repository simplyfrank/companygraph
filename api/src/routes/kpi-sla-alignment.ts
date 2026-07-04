// KPI/SLA Alignment API handlers
// POST /api/v1/kpi-alignments - create KPI alignment to journey/activity
// DELETE /api/v1/kpi-alignments/:id - delete KPI alignment
// GET /api/v1/kpi-alignments - list KPI alignments for a target
// POST /api/v1/sla-alignments - create SLA alignment to journey/activity
// DELETE /api/v1/sla-alignments/:id - delete SLA alignment
// GET /api/v1/sla-alignments - list SLA alignments for a target

import type { Driver } from "neo4j-driver";
import {
  kpiAlignmentCreateRequestSchema,
  slaAlignmentCreateRequestSchema,
} from "@companygraph/shared/schema/kpi-sla";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseWith, readJson } from "./_helpers";

// NOTE (design §3.1): alignment ids are Neo4j elementId(r) strings, NOT
// UUIDs — the DELETE path params stay opaque strings, no UUID guard.

// POST /api/v1/kpi-alignments - create KPI alignment
export async function handleKpiAlignmentPost(req: Request): Promise<Response> {
  // FR-11a — zod replaces the hand-rolled ladder. The weight [0,1] bound
  // is the single sanctioned tightening (DD-01 rule ii, AC-06).
  const { kpi_id, target_type, target_id, weight, attribution_type, alignment_notes } =
    parseWith(kpiAlignmentCreateRequestSchema, await readJson(req));

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Verify KPI exists
    const kpiCheck = await session.run("MATCH (k:KPI {id: $id}) WHERE k.archived_at IS NULL RETURN k", { id: kpi_id });
    if (kpiCheck.records.length === 0) {
      return error(404, "not_found", "KPI not found or archived", { kpi_id });
    }

    // Verify target exists
    const targetLabel = target_type === "journey" ? "UserJourney" : target_type === "activity" ? "Activity" : "Domain";
    const targetCheck = await session.run(
      `MATCH (t:${targetLabel} {id: $id}) RETURN t`,
      { id: target_id }
    );
    if (targetCheck.records.length === 0) {
      return error(404, "not_found", `${target_type} not found`, { target_id });
    }

    // Create alignment relationship
    const result = await session.run(
      `MATCH (k:KPI {id: $kpi_id})
       MATCH (t:${targetLabel} {id: $target_id})
       CREATE (k)-[r:ALIGNED_TO {
         weight: $weight,
         attribution_type: $attribution_type,
         alignment_notes: $alignment_notes,
         created_at: $now
       }]->(t)
       RETURN k, t, elementId(r) AS alignment_id`,
      {
        kpi_id,
        target_id,
        weight,
        attribution_type,
        alignment_notes: alignment_notes || null,
        now,
      }
    );

    const alignmentId = result.records[0]?.get("alignment_id");
    return ok({
      alignment_id: alignmentId,
      kpi_id,
      target_type,
      target_id,
      weight,
      attribution_type,
      alignment_notes,
      created_at: now,
    });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/kpi-alignments/:id - delete KPI alignment
export async function handleKpiAlignmentDelete(req: Request, alignmentId: string): Promise<Response> {
  const id = alignmentId;
  if (!id || typeof id !== "string") return error(400, "invalid_payload", "malformed id", { id: alignmentId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (k:KPI)-[r:ALIGNED_TO]->(t)
       WHERE elementId(r) = $id
       DELETE r
       RETURN count(r) as deleted`,
      { id }
    );

    if (result.records[0]?.get("deleted") === 0) {
      return error(404, "not_found", "alignment not found", { id });
    }

    return ok({ deleted: true });
  } finally {
    await session.close();
  }
}

// GET /api/v1/kpi-alignments - list KPI alignments for a target
export async function handleKpiAlignmentsGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target_type = url.searchParams.get("target_type");
  const target_id = url.searchParams.get("target_id");

  if (!target_type || !target_id) {
    return error(400, "invalid_payload", "missing target_type or target_id query params", {
      required: ["target_type", "target_id"]
    });
  }

  if (!["journey", "activity", "domain"].includes(target_type)) {
    return error(400, "invalid_payload", "target_type must be 'journey', 'activity', or 'domain'", { target_type });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const targetLabel = target_type === "journey" ? "UserJourney" : target_type === "activity" ? "Activity" : "Domain";
    const result = target_type === "domain"
      ? await session.run(
          `MATCH (k:KPI)
           WHERE k.domain_id = $target_id AND k.archived_at IS NULL
           OPTIONAL MATCH (k)-[r:ALIGNED_TO]->(t)
           RETURN k.id AS kpi_id, k.name AS kpi_name, k.category AS kpi_category,
                  k.unit AS kpi_unit, k.target_value AS kpi_target_value,
                  elementId(r) AS alignment_id, r.weight AS weight,
                  r.attribution_type AS attribution_type,
                  r.alignment_notes AS alignment_notes, r.created_at AS created_at`,
          { target_id }
        )
      : await session.run(
          `MATCH (k:KPI)-[r:ALIGNED_TO]->(t:${targetLabel} {id: $target_id})
           WHERE k.archived_at IS NULL
           RETURN k.id AS kpi_id, k.name AS kpi_name, k.category AS kpi_category,
                  k.unit AS kpi_unit, k.target_value AS kpi_target_value,
                  elementId(r) AS alignment_id, r.weight AS weight,
                  r.attribution_type AS attribution_type,
                  r.alignment_notes AS alignment_notes, r.created_at AS created_at`,
      { target_id }
    );

    const rows = result.records.map((r) => ({
      alignment_id: r.get("alignment_id"),
      kpi_id: r.get("kpi_id"),
      kpi_name: r.get("kpi_name"),
      kpi_category: r.get("kpi_category"),
      kpi_unit: r.get("kpi_unit"),
      kpi_target_value: r.get("kpi_target_value"),
      weight: r.get("weight"),
      attribution_type: r.get("attribution_type"),
      alignment_notes: r.get("alignment_notes"),
      created_at: r.get("created_at"),
    }));

    return ok({ rows });
  } finally {
    await session.close();
  }
}

// POST /api/v1/sla-alignments - create SLA alignment
export async function handleSlaAlignmentPost(req: Request): Promise<Response> {
  const { sla_id, target_type, target_id, is_critical, alignment_notes } =
    parseWith(slaAlignmentCreateRequestSchema, await readJson(req));

  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Verify SLA exists
    const slaCheck = await session.run("MATCH (s:SLA {id: $id}) WHERE s.archived_at IS NULL RETURN s", { id: sla_id });
    if (slaCheck.records.length === 0) {
      return error(404, "not_found", "SLA not found or archived", { sla_id });
    }

    // Verify target exists
    const targetLabel = target_type === "journey" ? "UserJourney" : "Activity";
    const targetCheck = await session.run(
      `MATCH (t:${targetLabel} {id: $id}) RETURN t`,
      { id: target_id }
    );
    if (targetCheck.records.length === 0) {
      return error(404, "not_found", `${target_type} not found`, { target_id });
    }

    // Create alignment relationship
    const result = await session.run(
      `MATCH (s:SLA {id: $sla_id})
       MATCH (t:${targetLabel} {id: $target_id})
       CREATE (s)-[:ALIGNED_TO {
         is_critical: $is_critical,
         alignment_notes: $alignment_notes,
         created_at: $now
       }]->(t)
       RETURN s, t`,
      {
        sla_id,
        target_id,
        is_critical: is_critical || false,
        alignment_notes: alignment_notes || null,
        now,
      }
    );

    return ok({
      sla_id,
      target_type,
      target_id,
      is_critical,
      alignment_notes,
      created_at: now,
    });
  } finally {
    await session.close();
  }
}

// DELETE /api/v1/sla-alignments/:id - delete SLA alignment
export async function handleSlaAlignmentDelete(req: Request, alignmentId: string): Promise<Response> {
  const id = alignmentId;
  if (!id || typeof id !== "string") return error(400, "invalid_payload", "malformed id", { id: alignmentId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    const result = await session.run(
      `MATCH (s:SLA)-[r:ALIGNED_TO]->(t)
       WHERE elementId(r) = $id
       DELETE r
       RETURN count(r) as deleted`,
      { id }
    );

    if (result.records[0]?.get("deleted") === 0) {
      return error(404, "not_found", "alignment not found", { id });
    }

    return ok({ deleted: true });
  } finally {
    await session.close();
  }
}

// GET /api/v1/sla-alignments - list SLA alignments for a target
export async function handleSlaAlignmentsGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target_type = url.searchParams.get("target_type");
  const target_id = url.searchParams.get("target_id");

  if (!target_type || !target_id) {
    return error(400, "invalid_payload", "missing target_type or target_id query params", {
      required: ["target_type", "target_id"]
    });
  }

  if (!["journey", "activity"].includes(target_type)) {
    return error(400, "invalid_payload", "target_type must be 'journey' or 'activity'", { target_type });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const targetLabel = target_type === "journey" ? "UserJourney" : "Activity";
    const result = await session.run(
      `MATCH (s:SLA)-[r:ALIGNED_TO]->(t:${targetLabel} {id: $target_id})
       WHERE s.archived_at IS NULL
       RETURN s.id AS sla_id, s.name AS sla_name, s.service_type AS service_type,
              s.target_value AS target_value, s.target_unit AS target_unit,
              s.compliance_threshold AS compliance_threshold,
              r.is_critical AS is_critical, r.alignment_notes AS alignment_notes,
              r.created_at AS created_at`,
      { target_id }
    );

    const rows = result.records.map((r) => ({
      sla_id: r.get("sla_id"),
      sla_name: r.get("sla_name"),
      service_type: r.get("service_type"),
      target_value: r.get("target_value"),
      target_unit: r.get("target_unit"),
      compliance_threshold: r.get("compliance_threshold"),
      is_critical: r.get("is_critical"),
      alignment_notes: r.get("alignment_notes"),
      created_at: r.get("created_at"),
    }));

    return ok({ rows });
  } finally {
    await session.close();
  }
}
