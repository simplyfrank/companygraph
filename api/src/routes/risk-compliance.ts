// Risk & Compliance API handlers
// GET /api/v1/risk-compliance/regulated-activity-inventory - Matrix view by domain × regulation
// GET /api/v1/risk-compliance/sod-violations - Segregation of duties violation report
// GET /api/v1/risk-compliance/third-party-register - Third-party system register

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error } from "./_helpers";

// =============================================================================
// Regulated Activity Inventory (RC-1.2)
// =============================================================================

export async function handleRegulatedActivityInventory(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (d:Domain)
       OPTIONAL MATCH (d)<-[:PART_OF]-(j:UserJourney)
       OPTIONAL MATCH (j)<-[:PART_OF]-(a:Activity)
       WHERE a.regulatory_tags IS NOT NULL AND size(a.regulatory_tags) > 0
       WITH d, a
       UNWIND a.regulatory_tags AS tag
       RETURN d.name AS domain, tag AS regulation, count(DISTINCT a.id) AS activity_count
       ORDER BY domain, regulation`,
    );

    const matrix = new Map<string, Map<string, number>>();
    const regulations = new Set<string>();
    const domains = new Set<string>();

    for (const record of result.records) {
      const domain = record.get("domain") as string;
      const regulation = record.get("regulation") as string;
      const count = record.get("activity_count") as number;

      domains.add(domain);
      regulations.add(regulation);

      if (!matrix.has(domain)) {
        matrix.set(domain, new Map());
      }
      matrix.get(domain)!.set(regulation, count);
    }

    const sortedDomains = Array.from(domains).sort();
    const sortedRegulations = Array.from(regulations).sort();

    const data = sortedDomains.map((domain) => {
      const row: Record<string, number> = { domain };
      sortedRegulations.forEach((reg) => {
        row[reg] = matrix.get(domain)?.get(reg) || 0;
      });
      return row;
    });

    return ok({
      domains: sortedDomains,
      regulations: sortedRegulations,
      matrix: data,
    });
  } finally {
    await session.close();
  }
}

// =============================================================================
// Segregation of Duties Violations (RC-3.1)
// =============================================================================

export async function handleSodViolations(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (a1:Activity)-[:CONFLICTS_WITH]->(a2:Activity)
       OPTIONAL MATCH (a1)<-[:EXECUTES]-(r1:Role)
       OPTIONAL MATCH (a2)<-[:EXECUTES]-(r2:Role)
       WHERE r1.name = r2.name
       RETURN a1.id AS activity1_id, a1.name AS activity1_name,
              a2.id AS activity2_id, a2.name AS activity2_name,
              r1.name AS conflicting_role,
              a1.regulatory_tags AS tags1, a2.regulatory_tags AS tags2
       ORDER BY conflicting_role, activity1_name`,
    );

    const violations = result.records.map((record) => ({
      activity1_id: record.get("activity1_id"),
      activity1_name: record.get("activity1_name"),
      activity2_id: record.get("activity2_id"),
      activity2_name: record.get("activity2_name"),
      conflicting_role: record.get("conflicting_role"),
      tags1: record.get("tags1") || [],
      tags2: record.get("tags2") || [],
    }));

    return ok({ violations, count: violations.length });
  } finally {
    await session.close();
  }
}

// =============================================================================
// Third-Party Register (RC-4.2)
// =============================================================================

export async function handleThirdPartyRegister(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (s:System {is_third_party: true})
       OPTIONAL MATCH (a:Activity)-[:USES_SYSTEM]->(s)
       OPTIONAL MATCH (s)<-[:PART_OF]-(d:Domain)
       RETURN s.id AS system_id, s.name AS system_name, s.vendor AS vendor,
              s.contract_end AS contract_end, s.dpa_signed AS dpa_signed,
              s.data_classification AS data_classification,
              count(DISTINCT a.id) AS critical_journey_count,
              collect(DISTINCT d.name) AS domains
       ORDER BY vendor, system_name`,
    );

    const register = result.records.map((record) => ({
      system_id: record.get("system_id"),
      system_name: record.get("system_name"),
      vendor: record.get("vendor"),
      contract_end: record.get("contract_end"),
      dpa_signed: record.get("dpa_signed"),
      data_classification: record.get("data_classification"),
      critical_journey_count: record.get("critical_journey_count"),
      domains: record.get("domains"),
    }));

    return ok({ register, count: register.length });
  } finally {
    await session.close();
  }
}
