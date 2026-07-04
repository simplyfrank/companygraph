// Compliance rule API routes — CRUD for declarative SLA/KPI compliance rules.
//
// Following the pattern of ontology-glossary-collections.ts:
// - Input validation using Zod schemas
// - Proper error handling with error throwers
// - Emission of ontology change events after mutations
// - Helper functions for response and error handling

import { getDriver } from "../neo4j/driver";
import {
  createComplianceRule,
  getComplianceRule,
  listComplianceRules,
  patchComplianceRule,
  deleteComplianceRule,
} from "../ontology/storage/compliance-rules";
import { ontologyEvents } from "../ontology/events";
import {
  complianceRuleSchema,
  complianceRulePatchSchema,
} from "@companygraph/shared/schema/ontology";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";
import {
  ok,
  noContent,
  error,
  readJson,
  parseQueryBool,
} from "./_helpers";
import { evaluateComplianceRule } from "../ontology/compliance/evaluator";

export async function handleComplianceRules(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const ruleType = url.searchParams.get("rule_type") || undefined;
  const enabled = url.searchParams.has("enabled") ? parseQueryBool(url, "enabled") : undefined;

  const rules = await listComplianceRules(driver, ruleType, enabled);
  return ok(rules);
}

export async function handleCreateComplianceRule(req: Request): Promise<Response> {
  const driver = getDriver();
  const body = await readJson(req);
  const actor = "system"; // TODO: Get from auth context

  const parsed = complianceRuleSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid compliance rule payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const rule = await createComplianceRule(driver, parsed.data, actor);
  ontologyEvents.emit();
  return ok(rule);
}

export async function handleComplianceRule(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return error(400, "invalid_payload", "Missing rule id");
  }

  const rule = await getComplianceRule(driver, id);
  if (!rule) {
    return error(404, "not_found", "Compliance rule not found");
  }
  return ok(rule);
}

export async function handlePatchComplianceRule(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const actor = "system"; // TODO: Get from auth context

  if (!id) {
    return error(400, "invalid_payload", "Missing rule id");
  }

  const body = await readJson(req);
  const parsed = complianceRulePatchSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid compliance rule patch payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const rule = await patchComplianceRule(driver, id, parsed.data, actor);
  ontologyEvents.emit();
  return ok(rule);
}

export async function handleDeleteComplianceRule(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const actor = "system"; // TODO: Get from auth context

  if (!id) {
    return error(400, "invalid_payload", "Missing rule id");
  }

  await deleteComplianceRule(driver, id, actor);
  ontologyEvents.emit();
  return noContent();
}

export async function handleEvaluateComplianceRule(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return error(400, "invalid_payload", "Missing rule id");
  }

  const rule = await getComplianceRule(driver, id);
  if (!rule) {
    return error(404, "not_found", "Compliance rule not found");
  }

  const result = await evaluateComplianceRule(driver, id, rule.rule_dsl);
  return ok(result);
}
