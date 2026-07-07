// risk-compliance-change T-06/T-07 (design §4.6, DD-05) — shared zod
// schemas for the risk-register + change-requests + risk-compliance
// surfaces. Moved verbatim from the route files' inline definitions so
// the runtime routes and the OpenAPI registry share ONE zod source (no
// hand-maintained copy, no duplicate-definition drift). Behavior is
// unchanged: the moved create/patch schemas are byte-identical to the
// originals. Read + report-response schemas document the as-built
// envelopes (NFR-04 — snake_case columns, camelCase change-request body
// fields, per-report shapes) for OpenAPI; nothing tightens the contract.
//
// en-US identifiers; zod only.

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────
// Risk register (Postgres `risk_register`, migrations 002 + 005)
// ─────────────────────────────────────────────────────────────────────

export const createRiskSchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  domain: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
  category: z.string().optional(),
  risk_type: z
    .enum(["strategic", "operational", "financial", "compliance", "security", "technical"])
    .optional(),
  linked_entity_type: z.string().optional(),
  linked_entity_id: z.string().optional(),
  risk_owner_id: z.string().optional(),
  escalation_level: z.number().int().min(1).max(5).optional(),
});

export const updateRiskSchema = z.object({
  name: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]).optional(),
  trend: z.enum(["up", "flat", "down"]).optional(),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
  category: z.string().optional(),
  risk_type: z
    .enum(["strategic", "operational", "financial", "compliance", "security", "technical"])
    .optional(),
  linked_entity_type: z.string().optional(),
  linked_entity_id: z.string().optional(),
  risk_owner_id: z.string().optional(),
  escalation_level: z.number().int().min(1).max(5).optional(),
});

// As-built read shape (18 columns; snake_case; NFR-04).
export const riskReadSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  domain: z.string(),
  likelihood: z.number().int(),
  impact: z.number().int(),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  description: z.string().nullable(),
  mitigation_plan: z.string().nullable(),
  category: z.string().nullable(),
  risk_type: z
    .enum(["strategic", "operational", "financial", "compliance", "security", "technical"])
    .nullable(),
  linked_entity_type: z.string().nullable(),
  linked_entity_id: z.string().nullable(),
  risk_owner_id: z.string().nullable(),
  escalation_level: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ─────────────────────────────────────────────────────────────────────
// Change requests (Postgres `change_requests` / `reviews` / `sign_offs`,
// migration 001). Body fields are camelCase → snake_case columns (§3.3).
// ─────────────────────────────────────────────────────────────────────

export const changeRequestCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.string().min(1),
  draftSnapshot: z.object({}).passthrough(),
  baseSnapshot: z.object({}).passthrough(),
  diff: z.object({}).passthrough(),
  // N-01 (binding) — the runtime `.default([])` is behavior AC-05 relies
  // on, not just a type. Preserved verbatim.
  dependencyImpacts: z.array(z.object({}).passthrough()).default([]),
});

export const changeRequestPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(["draft", "pending_review", "approved", "rejected", "released"]).optional(),
  draftSnapshot: z.object({}).passthrough().optional(),
  diff: z.object({}).passthrough().optional(),
  dependencyImpacts: z.array(z.object({}).passthrough()).optional(),
});

export const reviewCreateSchema = z.object({
  reviewer: z.string().min(1),
  reviewerRole: z.enum(["entity_manager", "domain_manager", "technical_lead"]),
  status: z.enum(["approved", "rejected", "changes_requested"]),
  comment: z.string().min(1),
});

export const signOffCreateSchema = z.object({
  signer: z.string().min(1),
  signerRole: z.enum(["entity_manager", "domain_manager"]),
  status: z.enum(["signed", "declined"]),
  comment: z.string().optional(),
});

// As-built read shapes (snake_case columns; nested arrays on the CR read).
export const reviewReadSchema = z.object({
  id: z.string(),
  change_request_id: z.string(),
  reviewer: z.string(),
  reviewer_role: z.enum(["entity_manager", "domain_manager", "technical_lead"]),
  status: z.string(),
  comment: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const signOffReadSchema = z.object({
  id: z.string(),
  change_request_id: z.string(),
  signer: z.string(),
  signer_role: z.enum(["entity_manager", "domain_manager"]),
  status: z.string(),
  signed_at: z.string().nullable(),
  comment: z.string().nullable(),
  created_at: z.string(),
});

export const changeRequestReadSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  status: z.enum(["draft", "pending_review", "approved", "rejected", "released"]),
  draft_snapshot: z.record(z.unknown()),
  base_snapshot: z.record(z.unknown()),
  diff: z.record(z.unknown()),
  dependency_impacts: z.array(z.record(z.unknown())),
  created_at: z.string(),
  updated_at: z.string(),
  reviews: z.array(reviewReadSchema).optional(),
  signOffs: z.array(signOffReadSchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────
// risk-compliance reports (Neo4j read-only). Per-report as-built
// envelopes (§4.5, B-02): the inventory has NO `count`; the other two do.
// ─────────────────────────────────────────────────────────────────────

export const regulatedActivityInventorySchema = z.object({
  domains: z.array(z.string()),
  regulations: z.array(z.string()),
  // Each matrix row is `{ domain, <regulation>: count, ... }`.
  matrix: z.array(z.record(z.union([z.string(), z.number()]))),
});

export const sodViolationsSchema = z.object({
  violations: z.array(
    z.object({
      activity1_id: z.string(),
      activity1_name: z.string(),
      activity2_id: z.string(),
      activity2_name: z.string(),
      conflicting_role: z.string(),
      tags1: z.array(z.string()),
      tags2: z.array(z.string()),
    }),
  ),
  count: z.number().int(),
});

export const thirdPartyRegisterSchema = z.object({
  register: z.array(
    z.object({
      system_id: z.string(),
      system_name: z.string(),
      vendor: z.string().nullable(),
      contract_end: z.string().nullable(),
      dpa_signed: z.boolean().nullable(),
      data_classification: z.string().nullable(),
      critical_journey_count: z.number().int(),
      domains: z.array(z.string()),
    }),
  ),
  count: z.number().int(),
});
