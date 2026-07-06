// saas-operator-foundation T-04 (design §3.4, §4.5, §5 — FR-06, NFR-04,
// AC-19). The governed-API seed MECHANISM the content specs import to create
// risk/SLA/compliance rows — this foundation itself creates NO rows (FR-06).
//
// Rule D — governed data only through governed routes: every helper POSTs to
// an existing governed route over the loopback API; it edits NONE of the
// routes' storage code (risk-register.ts / sla-crud.ts / compliance-rules.ts
// are off-limits, NFR-04). The route's own zod re-parse is the whole
// validation contract.
//
// Route strings are the AS-BUILT routes (Deviations Register D-1/D-2):
//   risk       → POST /api/v1/risk-register   (risk:write)
//   SLA        → POST /api/v1/slas            (sla:write, D-1; file is sla-crud.ts)
//   compliance → POST /api/v1/compliance/rules (compliance:write, D-2)

import { loadEnv } from "../env";
import {
  slaCreateRequestSchema,
} from "@companygraph/shared/schema/kpi-sla";
import {
  complianceRuleSchema,
} from "@companygraph/shared/schema/ontology";
import type { z } from "zod";

function apiBase(): string {
  const env = loadEnv();
  return `http://${env.host}:${env.apiPort}`;
}

// The risk route's `createRiskSchema` is module-private in risk-register.ts
// (no export); importing it would edit that file (NFR-04-forbidden), so the
// risk body is a hand-constructed object literal matching the route's request
// shape. The route's own re-parse validates it (C-01).
export interface RiskSeedRow {
  name: string;
  owner: string;
  domain: string;
  likelihood: number; // 1..5
  impact: number; // 1..5
  status: "open" | "mitigating" | "accepted" | "resolved";
  trend: "up" | "flat" | "down";
  description?: string;
  mitigation_plan?: string;
  category?: string;
  risk_type?:
    | "strategic"
    | "operational"
    | "financial"
    | "compliance"
    | "security"
    | "technical";
}

// SLA + compliance rows reuse the EXPORTED shared-package schemas so a
// content spec builds a valid sample against the same contract the route
// enforces.
export type SlaSeedRow = z.input<typeof slaCreateRequestSchema>;
export type ComplianceSeedRow = z.input<typeof complianceRuleSchema>;

// Extract the persisted id from a governed route's success envelope. The
// governed routes return varying shapes:
//   risk       → the risk record object ({ id, ... })
//   SLA        → { sla: { id, ... } } or the record directly
//   compliance → the rule record object ({ id, ... })
// Probe the common locations and fail loudly if no id surfaces.
function extractId(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.id === "string") return b.id;
    for (const key of ["sla", "rule", "risk", "data"]) {
      const nested = b[key];
      if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).id === "string") {
        return (nested as Record<string, unknown>).id as string;
      }
    }
  }
  throw new Error(`governed-seed-helper: no persisted id in response envelope: ${JSON.stringify(body)}`);
}

async function postGoverned(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(`governed-seed-helper: POST ${path} → ${res.status} ${JSON.stringify(json)}`);
  }
  return extractId(json);
}

// POST /api/v1/risk-register (risk:write). Body is the hand-constructed
// object literal (createRiskSchema is module-private, C-01).
export async function seedRisk(row: RiskSeedRow): Promise<string> {
  return postGoverned("/api/v1/risk-register", row);
}

// POST /api/v1/slas (sla:write, D-1). Body validated against the EXPORTED
// slaCreateRequestSchema before the round-trip.
export async function seedSla(row: SlaSeedRow): Promise<string> {
  const body = slaCreateRequestSchema.parse(row);
  return postGoverned("/api/v1/slas", body);
}

// POST /api/v1/compliance/rules (compliance:write, D-2). Body validated
// against the EXPORTED complianceRuleSchema before the round-trip.
export async function seedComplianceRule(row: ComplianceSeedRow): Promise<string> {
  const body = complianceRuleSchema.parse(row);
  return postGoverned("/api/v1/compliance/rules", body);
}
