// finance-accounting-process-model T-07 + T-08 (design §8; review-design C-03-
// pattern; DD-06) — the self-owned governed RISK/COMPLIANCE content script.
// Writes the §4.7 frozen roster (5 risk-register rows + 1 compliance/rules row)
// via the governed APIs, wrapping a lookup-before-create dedup keyed on the
// `name` marker so a re-run adds ZERO rows (AC-09). It IMPORTS the exported
// foundation helpers `seedRisk` / `seedComplianceRule` (raw POSTs, no dedup)
// and edits NO owned-elsewhere code (NFR-03, AC-08, AC-13).
//
// Dedup shapes (verified from source):
//   risk       — GET /api/v1/risk-register?domain=…&risk_type=… → { data: [...] }
//                (the list route has NO `name` filter → matched in TS)
//   compliance — GET /api/v1/compliance/rules → [ ...rows ] (bare array)

import { loadEnv } from "../src/env";
import { closeDriver } from "../src/neo4j/driver";
import { seedRisk, seedComplianceRule } from "../src/seed/governed-seed-helper";
import type { RiskSeedRow, ComplianceSeedRow } from "../src/seed/governed-seed-helper";
import {
  FINANCE_RISKS,
  FINANCE_COMPLIANCE,
  FINANCE_RISK_DOMAIN,
  FINANCE_RISK_OWNER,
} from "./finance-ids";

function apiBase(): string {
  const env = loadEnv();
  return `http://${env.host}:${env.apiPort}`;
}

// ---------------------------------------------------------------------------
// Risk dedup (§8.2) — list by domain + risk_type, match `name` in TS.
// ---------------------------------------------------------------------------

interface RiskRecord {
  id?: string;
  name?: string;
}

async function existingRiskNames(
  base: string,
  domain: string,
  riskType: string,
): Promise<Set<string>> {
  const url = `${base}/api/v1/risk-register?domain=${encodeURIComponent(domain)}&risk_type=${encodeURIComponent(riskType)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`seed-finance-risks: GET /api/v1/risk-register -> ${res.status}`);
  const body = (await res.json()) as { data?: RiskRecord[] };
  const names = new Set<string>();
  for (const r of body.data ?? []) {
    if (typeof r.name === "string") names.add(r.name);
  }
  return names;
}

async function seedRisks(base: string): Promise<string[]> {
  const ids: string[] = [];
  // One list per risk_type present in the roster (financial, compliance).
  const cache = new Map<string, Set<string>>();
  for (const risk of FINANCE_RISKS) {
    let present = cache.get(risk.risk_type);
    if (!present) {
      present = await existingRiskNames(base, FINANCE_RISK_DOMAIN, risk.risk_type);
      cache.set(risk.risk_type, present);
    }
    if (present.has(risk.name)) continue; // idempotent skip (AC-09)

    const row: RiskSeedRow = {
      name: risk.name,
      owner: FINANCE_RISK_OWNER,
      domain: FINANCE_RISK_DOMAIN,
      likelihood: risk.likelihood,
      impact: risk.impact,
      status: "open",
      trend: "flat",
      description: risk.description,
      mitigation_plan: risk.mitigation_plan,
      risk_type: risk.risk_type,
    };
    ids.push(await seedRisk(row));
    present.add(risk.name); // avoid a duplicate within this same run
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Compliance dedup (§8.2) — list all rules, match `name` in TS.
// ---------------------------------------------------------------------------

interface ComplianceRecord {
  id?: string;
  name?: string;
}

async function existingComplianceNames(base: string): Promise<Set<string>> {
  const res = await fetch(`${base}/api/v1/compliance/rules`);
  if (!res.ok) throw new Error(`seed-finance-risks: GET /api/v1/compliance/rules -> ${res.status}`);
  const body = (await res.json()) as ComplianceRecord[];
  const names = new Set<string>();
  for (const r of body ?? []) {
    if (typeof r.name === "string") names.add(r.name);
  }
  return names;
}

// The compliance route parses the FULL complianceRuleSchema (id/created_at/
// updated_at required by the parse), but createComplianceRule server-generates
// id + timestamps (they are ignored). Supply placeholders to satisfy the parse.
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";
const PLACEHOLDER_TS = "2026-01-01T00:00:00.000Z";

async function seedCompliance(base: string): Promise<string[]> {
  const present = await existingComplianceNames(base);
  const ids: string[] = [];
  for (const rule of FINANCE_COMPLIANCE) {
    if (present.has(rule.name)) continue; // idempotent skip (AC-09)
    const row: ComplianceSeedRow = {
      id: PLACEHOLDER_ID,
      name: rule.name,
      description: rule.description,
      rule_dsl: rule.rule_dsl,
      rule_type: rule.rule_type,
      category: rule.category,
      severity: rule.severity,
      enabled: rule.enabled,
      actions: JSON.stringify(rule.actions),
      created_at: PLACEHOLDER_TS,
      updated_at: PLACEHOLDER_TS,
    };
    ids.push(await seedComplianceRule(row));
    present.add(rule.name);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Orchestration.
// ---------------------------------------------------------------------------

export interface FinanceRisksSeedResult {
  riskIds: string[];
  complianceIds: string[];
}

export async function seedFinanceRisks(base?: string): Promise<FinanceRisksSeedResult> {
  const apiBaseUrl = base ?? apiBase();
  const riskIds = await seedRisks(apiBaseUrl);
  const complianceIds = await seedCompliance(apiBaseUrl);
  return { riskIds, complianceIds };
}

if (import.meta.main) {
  seedFinanceRisks()
    .then((r) => {
      console.log(
        `[seed:finance-risks] risks created ${r.riskIds.length}, compliance rules created ${r.complianceIds.length}`,
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:finance-risks] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
