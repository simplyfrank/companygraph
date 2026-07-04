// Compliance rules API functions

import type { ComplianceRuleRead, ComplianceRuleCreate, ComplianceRulePatch } from "@companygraph/shared/schema/ontology";
import { json } from "./core";

export const complianceRules = {
  list: (enabled?: boolean) =>
    json<ComplianceRuleRead[]>(`/api/v1/compliance/rules${enabled !== undefined ? `?enabled=${enabled}` : ""}`),

  create: (data: ComplianceRuleCreate) =>
    json<ComplianceRuleRead>("/api/v1/compliance/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    json<ComplianceRuleRead>(`/api/v1/compliance/rules/${encodeURIComponent(id)}`),

  patch: (id: string, data: ComplianceRulePatch) =>
    json<ComplianceRuleRead>(`/api/v1/compliance/rules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    json<{ success: boolean }>(`/api/v1/compliance/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  evaluate: (id: string) =>
    json<{ passed: boolean; score: number; violations: Array<{ entity: string; property: string; expected: unknown; actual: unknown }>; affected_entities: string[]; actions_taken: Array<{ type: string; config: Record<string, unknown> }> }>(`/api/v1/compliance/rules/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_id: id }),
    }),
};
