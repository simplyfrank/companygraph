// saas-operator-foundation T-01 (design §3.3, §3.4 — FR-04, FR-05).
//
// The shared System/Persona/Role catalog DATA + the internal (non-REST)
// zod shapes the seed harness validates against. This file is pure data +
// shapes: no driver, no fetch, no side effects. The seed ensure-modules
// (T-07/T-08) import these arrays; the loader (T-09) never re-parses them.
//
// en-US identifiers; zod is the only validation library (house rules).
// `systemKind` reuses the ONE augmentation vocabulary from
// shared/src/schema/system-kind.ts — never re-declared here (XD-15).

import { z } from "zod";
import { systemKindSchema } from "@companygraph/shared/schema/system-kind";

// Internal input shapes (§3.4) — permissive, catalog-only, never a REST
// boundary. `description` defaults to "" so a bare {seedKey, name} row parses.
export const catalogSystemSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  systemKind: systemKindSchema, // reused, never re-declared
});
export type CatalogSystem = z.infer<typeof catalogSystemSchema>;

export const catalogRoleSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
});
export type CatalogRole = z.infer<typeof catalogRoleSchema>;

export const catalogPersonaSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
});
export type CatalogPersona = z.infer<typeof catalogPersonaSchema>;

// The seven shared Systems (design §3.3, FR-04). All `functional` at
// foundation; content specs add function-specific systems in their own
// slice. The operator `CRM` here is a DISTINCT node from the retail
// `System {name:"CRM"}` because it is MERGE'd on `operatorSeedKey` (T-07,
// B-01), a marker no retail node carries.
export const SYSTEMS: CatalogSystem[] = [
  { seedKey: "moms", name: "MOMS", description: "Medical-office SaaS product (the operator's flagship application).", systemKind: "functional" },
  { seedKey: "helm", name: "Helm", description: "Operator control-plane for the SaaS fleet.", systemKind: "functional" },
  { seedKey: "stripe", name: "Stripe", description: "Subscription billing and payments.", systemKind: "functional" },
  { seedKey: "crm", name: "CRM", description: "Customer relationship management (operator sales/success).", systemKind: "functional" },
  { seedKey: "data_warehouse", name: "Data Warehouse", description: "Analytics/reporting data warehouse.", systemKind: "functional" },
  { seedKey: "kubernetes", name: "Kubernetes", description: "Container orchestration for the platform fleet.", systemKind: "functional" },
  { seedKey: "pagerduty", name: "PagerDuty", description: "Incident alerting and on-call scheduling.", systemKind: "functional" },
];

// Minimal operator core :Role set — one function-owner role per function
// (design §3.3, FR-05). Content specs add function-specific roles within
// their own slice; these are the shared EXECUTES targets seeded once.
export const ROLES: CatalogRole[] = [
  { seedKey: "marketing_lead", name: "Marketing Lead", description: "Owns the marketing function's process." },
  { seedKey: "sales_lead", name: "Sales Lead", description: "Owns the sales function's process." },
  { seedKey: "revenue_operations", name: "Revenue Operations", description: "Owns finance & accounting process operations." },
  { seedKey: "customer_success_lead", name: "Customer Success Lead", description: "Owns the customer-success function's process." },
  { seedKey: "product_lead", name: "Product Lead", description: "Owns the product & delivery function's process." },
  { seedKey: "site_reliability_engineer", name: "Site Reliability Engineer", description: "Owns the platform-ops function's process." },
];

// One function-owner :Persona per function (design §3.3, FR-05).
export const PERSONAS: CatalogPersona[] = [
  { seedKey: "marketing_owner", name: "Marketing Function Owner", description: "Accountable owner of the marketing function." },
  { seedKey: "sales_owner", name: "Sales Function Owner", description: "Accountable owner of the sales function." },
  { seedKey: "finance_owner", name: "Finance Function Owner", description: "Accountable owner of the finance & accounting function." },
  { seedKey: "customer_success_owner", name: "Customer Success Owner", description: "Accountable owner of the customer-success function." },
  { seedKey: "product_owner", name: "Product Function Owner", description: "Accountable owner of the product & delivery function." },
  { seedKey: "platform_ops_owner", name: "Platform Ops Owner", description: "Accountable owner of the platform-ops function." },
];
