// Compliance rule storage — CRUD for declarative SLA/KPI compliance rules.
//
// Follows the pattern of ontology-proposals.ts:
// - Single executeWrite transaction per mutation (NFR-01)
// - Audit + version + event writes in the same transaction
// - Supports rule evaluation history

import type { Driver, ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare } from "fast-json-patch";
import type {
  ComplianceRuleCreate,
  ComplianceRulePatch,
} from "@companygraph/shared/schema/ontology";
import { generateId } from "../../ids";
import { isConstraintViolation } from "../../errors";
import { ERROR_CODE_THROWERS } from "../error-throwers";
import { writeAudit, writeVersion } from "./audit";
import { writeEvent } from "./events";

export interface ComplianceRuleRow {
  id: string;
  name: string;
  description: string | null;
  rule_dsl: string;
  rule_type: string;
  category: string;
  severity: string;
  enabled: boolean;
  actions: string;
  schedule: string | null;
  last_evaluated_at: string | null;
  last_evaluation_result: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

async function readComplianceRuleInTx(
  tx: ManagedTransaction,
  id: string,
): Promise<ComplianceRuleRow | null> {
  const res = await tx.run(
    `MATCH (r:_ComplianceRule {id: $id}) RETURN r`,
    { id },
  );
  const rec = res.records[0];
  if (!rec) return null;

  const r = rec.get("r") as { properties: Record<string, unknown> } | null;
  if (!r) return null;

  return {
    id: r.properties.id as string,
    name: r.properties.name as string,
    description: (r.properties.description as string | null) ?? null,
    rule_dsl: r.properties.rule_dsl as string,
    rule_type: r.properties.rule_type as string,
    category: r.properties.category as string,
    severity: r.properties.severity as string,
    enabled: r.properties.enabled as boolean,
    actions: r.properties.actions as string,
    schedule: (r.properties.schedule as string | null) ?? null,
    last_evaluated_at: (r.properties.last_evaluated_at as string | null) ?? null,
    last_evaluation_result: (r.properties.last_evaluation_result as string | null) ?? null,
    created_at: r.properties.created_at as string,
    created_by: (r.properties.created_by as string | null) ?? null,
    updated_at: r.properties.updated_at as string,
    updated_by: (r.properties.updated_by as string | null) ?? null,
  };
}

export async function createComplianceRule(
  driver: Driver,
  input: ComplianceRuleCreate,
  actor: string,
): Promise<ComplianceRuleRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      const id = generateId();

      try {
        await tx.run(
          `CREATE (r:_ComplianceRule {
             id: $id, name: $name, description: $description,
             rule_dsl: $rule_dsl, rule_type: $rule_type, category: $category,
             severity: $severity, enabled: $enabled, actions: $actions,
             schedule: $schedule,
             created_at: $now, updated_at: $now, created_by: $actor, updated_by: $actor
           })`,
          {
            id,
            name: input.name,
            description: input.description ?? null,
            rule_dsl: input.rule_dsl,
            rule_type: input.rule_type,
            category: input.category,
            severity: input.severity,
            enabled: input.enabled,
            actions: JSON.stringify(input.actions),
            schedule: input.schedule ?? null,
            now,
            actor,
          },
        );

        const after = await readComplianceRuleInTx(tx, id);
        if (!after) {
          throw new Error(`createComplianceRule: row not readable post-write for ${id}`);
        }

        const version_id = generateId();
        await writeAudit(
          tx,
          actor,
          "create_compliance_rule",
          id,
          null,
          after,
          version_id,
        );
        await writeVersion(tx, version_id, actor, "create_compliance_rule", input);
        await writeEvent(tx, version_id, [
          { op: "add", path: `/complianceRules/${id}`, value: after },
        ]);
        return after;
      } catch (e) {
        if (isConstraintViolation(e)) {
          ERROR_CODE_THROWERS.name_conflict({ name: id });
        }
        throw e;
      }
    });
  } finally {
    await session.close();
  }
}

export async function getComplianceRule(
  driver: Driver,
  id: string,
): Promise<ComplianceRuleRow | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead((tx) => readComplianceRuleInTx(tx, id));
  } finally {
    await session.close();
  }
}

export async function listComplianceRules(
  driver: Driver,
  ruleType?: string,
  enabled?: boolean,
): Promise<ReadonlyArray<ComplianceRuleRow>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.executeRead(async (tx) => {
      let query = `
        MATCH (r:_ComplianceRule)
        RETURN r
        ORDER BY r.created_at DESC
      `;
      const params: Record<string, unknown> = {};

      const conditions: string[] = [];
      if (ruleType) {
        conditions.push("r.rule_type = $ruleType");
        params.ruleType = ruleType;
      }
      if (enabled !== undefined) {
        conditions.push("r.enabled = $enabled");
        params.enabled = enabled;
      }

      if (conditions.length > 0) {
        query = `
          MATCH (r:_ComplianceRule)
          WHERE ${conditions.join(" AND ")}
          RETURN r
          ORDER BY r.created_at DESC
        `;
      }

      const res = await tx.run(query, params);
      const rows: ComplianceRuleRow[] = [];
      for (const rec of res.records) {
        const r = rec.get("r") as { properties: Record<string, unknown> } | null;
        if (!r) continue;
        rows.push({
          id: r.properties.id as string,
          name: r.properties.name as string,
          description: (r.properties.description as string | null) ?? null,
          rule_dsl: r.properties.rule_dsl as string,
          rule_type: r.properties.rule_type as string,
          category: r.properties.category as string,
          severity: r.properties.severity as string,
          enabled: r.properties.enabled as boolean,
          actions: r.properties.actions as string,
          schedule: (r.properties.schedule as string | null) ?? null,
          last_evaluated_at: (r.properties.last_evaluated_at as string | null) ?? null,
          last_evaluation_result: (r.properties.last_evaluation_result as string | null) ?? null,
          created_at: r.properties.created_at as string,
          created_by: (r.properties.created_by as string | null) ?? null,
          updated_at: r.properties.updated_at as string,
          updated_by: (r.properties.updated_by as string | null) ?? null,
        });
      }
      return rows;
    });
  } finally {
    await session.close();
  }
}

export async function patchComplianceRule(
  driver: Driver,
  id: string,
  input: ComplianceRulePatch,
  actor: string,
): Promise<ComplianceRuleRow> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const before = await readComplianceRuleInTx(tx, id);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: id, kind: "compliance_rule" });
      }

      const now = new Date().toISOString();
      const sets: string[] = ["r.updated_at = $now", "r.updated_by = $actor"];
      const params: Record<string, unknown> = { id, now, actor };

      if (input.name !== undefined) {
        sets.push("r.name = $name");
        params.name = input.name;
      }
      if (input.description !== undefined) {
        sets.push("r.description = $description");
        params.description = input.description;
      }
      if (input.rule_dsl !== undefined) {
        sets.push("r.rule_dsl = $rule_dsl");
        params.rule_dsl = input.rule_dsl;
      }
      if (input.enabled !== undefined) {
        sets.push("r.enabled = $enabled");
        params.enabled = input.enabled;
      }
      if (input.actions !== undefined) {
        sets.push("r.actions = $actions");
        params.actions = JSON.stringify(input.actions);
      }
      if (input.schedule !== undefined) {
        sets.push("r.schedule = $schedule");
        params.schedule = input.schedule;
      }

      await tx.run(
        `MATCH (r:_ComplianceRule {id: $id})
         SET ${sets.join(", ")}`,
        params,
      );

      const after = await readComplianceRuleInTx(tx, id);
      if (!after) {
        throw new Error(`patchComplianceRule: row not readable post-write for ${id}`);
      }

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "patch_compliance_rule",
        id,
        before,
        after,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "patch_compliance_rule", {
        id,
        patch: input,
      });
      await writeEvent(
        tx,
        version_id,
        jsonpatchCompare(before as unknown as object, after as unknown as object) as unknown as ReadonlyArray<Record<string, unknown>>,
      );
      return after;
    });
  } finally {
    await session.close();
  }
}

export async function deleteComplianceRule(
  driver: Driver,
  id: string,
  actor: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const before = await readComplianceRuleInTx(tx, id);
      if (!before) {
        ERROR_CODE_THROWERS.not_found({ name: id, kind: "compliance_rule" });
      }

      await tx.run(
        `MATCH (r:_ComplianceRule {id: $id}) DETACH DELETE r`,
        { id },
      );

      const version_id = generateId();
      await writeAudit(
        tx,
        actor,
        "delete_compliance_rule",
        id,
        before,
        null,
        version_id,
      );
      await writeVersion(tx, version_id, actor, "delete_compliance_rule", { id });
      await writeEvent(tx, version_id, [
        { op: "remove", path: `/complianceRules/${id}` },
      ]);
    });
  } finally {
    await session.close();
  }
}

export async function updateRuleEvaluation(
  driver: Driver,
  ruleId: string,
  passed: boolean,
  score: number,
  violations: string,
  affectedEntities: string,
  actionsTaken: string,
  durationMs: number,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      const evaluationId = generateId();

      // Create evaluation record
      await tx.run(
        `CREATE (e:_ComplianceEvaluation {
           id: $evaluationId, rule_id: $ruleId, evaluated_at: $now,
           passed: $passed, score: $score, violations: $violations,
           affected_entities: $affectedEntities, actions_taken: $actionsTaken,
           duration_ms: $durationMs
         })
         WITH e
         MATCH (r:_ComplianceRule {id: $ruleId})
         CREATE (r)-[:HAS_EVALUATION]->(e)`,
        {
          evaluationId,
          ruleId,
          now,
          passed,
          score,
          violations,
          affectedEntities,
          actionsTaken,
          durationMs,
        },
      );

      // Update rule with last evaluation result
      await tx.run(
        `MATCH (r:_ComplianceRule {id: $ruleId})
         SET r.last_evaluated_at = $now, r.last_evaluation_result = $result`,
        {
          ruleId,
          now,
          result: JSON.stringify({ passed, score, violations_count: JSON.parse(violations).length }),
        },
      );
    });
  } finally {
    await session.close();
  }
}
