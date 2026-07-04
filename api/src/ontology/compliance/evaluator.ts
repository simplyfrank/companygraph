// Compliance rule evaluation engine — evaluates parsed DSL rules against Neo4j data.
//
// Executes compliance rules by querying Neo4j and checking conditions.
// Returns evaluation results with violations and actions taken.

import type { Driver } from "neo4j-driver";
import type { ParsedRule, ParsedCondition } from "./dsl-parser";
import { updateRuleEvaluation } from "../storage/compliance-rules";

export interface EvaluationResult {
  passed: boolean;
  score: number;
  violations: Array<{ entity: string; property: string; expected: unknown; actual: unknown }>;
  affectedEntities: string[];
  actionsTaken: Array<{ type: string; config: Record<string, unknown> }>;
  durationMs: number;
}

// Valid Neo4j identifier: letters, digits, underscore only
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertValidIdentifier(name: string, context: string): void {
  if (!IDENTIFIER_REGEX.test(name)) {
    throw new Error(`Invalid ${context}: "${name}" — must be a valid Neo4j identifier (alphanumeric + underscore)`);
  }
}

export class ComplianceEvaluator {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  async evaluate(ruleId: string, rule: ParsedRule): Promise<EvaluationResult> {
    const startTime = Date.now();
    const violations: EvaluationResult["violations"] = [];
    const affectedEntities: string[] = [];
    const actionsTaken: EvaluationResult["actionsTaken"] = [];

    let allPassed = true;

    for (const condition of rule.conditions) {
      const result = await this.evaluateCondition(condition, rule.scope);
      if (!result.passed) {
        allPassed = false;
        violations.push(...result.violations);
        affectedEntities.push(...result.affectedEntities);
      }
    }

    // Calculate score (0-100 based on passed conditions)
    const passedCount = rule.conditions.length - violations.length;
    const score = rule.conditions.length > 0
      ? Math.round((passedCount / rule.conditions.length) * 100)
      : 100;

    // Execute actions if violations found
    if (!allPassed) {
      for (const action of rule.actions) {
        actionsTaken.push(action);
        // In a real implementation, this would execute the action
        // e.g., tag entities, send notifications, block operations
      }
    }

    const durationMs = Date.now() - startTime;

    // Store evaluation result
    await updateRuleEvaluation(
      this.driver,
      ruleId,
      allPassed,
      score,
      JSON.stringify(violations),
      JSON.stringify(affectedEntities),
      JSON.stringify(actionsTaken),
      durationMs,
    );

    return {
      passed: allPassed,
      score,
      violations,
      affectedEntities,
      actionsTaken,
      durationMs,
    };
  }

  private async evaluateCondition(
    condition: ParsedCondition,
    scope?: string,
  ): Promise<{ passed: boolean; violations: EvaluationResult["violations"]; affectedEntities: string[] }> {
    const session = this.driver.session({ defaultAccessMode: "READ" });
    try {
      if (condition.type === "metric") {
        return await this.evaluateMetricCondition(session, condition, scope);
      } else if (condition.type === "property") {
        return await this.evaluatePropertyCondition(session, condition, scope);
      } else if (condition.type === "count") {
        return await this.evaluateCountCondition(session, condition, scope);
      }
      return { passed: true, violations: [], affectedEntities: [] };
    } finally {
      await session.close();
    }
  }

  private async evaluateMetricCondition(
    session: any,
    condition: ParsedCondition,
    scope?: string,
  ): Promise<{ passed: boolean; violations: EvaluationResult["violations"]; affectedEntities: string[] }> {
    assertValidIdentifier(condition.entity, "entity label");
    assertValidIdentifier(condition.property || "", "property name");

    // Query for metric value
    const query = `
      MATCH (e:${condition.entity})
      ${scope ? `WHERE e.id = $scope` : ""}
      RETURN e.${condition.property} AS value, e.id AS id
    `;

    const result = await session.run(query, { scope });
    const violations: EvaluationResult["violations"] = [];
    const affectedEntities: string[] = [];

    for (const rec of result.records) {
      const value = rec.get("value");
      const id = rec.get("id");

      if (!this.compareValues(value, condition.operator, condition.value)) {
        violations.push({
          entity: condition.entity,
          property: condition.property || "",
          expected: condition.value,
          actual: value,
        });
        affectedEntities.push(id);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      affectedEntities,
    };
  }

  private async evaluatePropertyCondition(
    session: any,
    condition: ParsedCondition,
    scope?: string,
  ): Promise<{ passed: boolean; violations: EvaluationResult["violations"]; affectedEntities: string[] }> {
    assertValidIdentifier(condition.entity, "entity label");
    assertValidIdentifier(condition.property || "", "property name");

    // Query for property value
    const query = `
      MATCH (e:${condition.entity})
      ${scope ? `WHERE e.id = $scope` : ""}
      RETURN e.${condition.property} AS value, e.id AS id
    `;

    const result = await session.run(query, { scope });
    const violations: EvaluationResult["violations"] = [];
    const affectedEntities: string[] = [];

    for (const rec of result.records) {
      const value = rec.get("value");
      const id = rec.get("id");

      if (!this.compareValues(value, condition.operator, condition.value)) {
        violations.push({
          entity: condition.entity,
          property: condition.property || "",
          expected: condition.value,
          actual: value,
        });
        affectedEntities.push(id);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      affectedEntities,
    };
  }

  private async evaluateCountCondition(
    session: any,
    condition: ParsedCondition,
    scope?: string,
  ): Promise<{ passed: boolean; violations: EvaluationResult["violations"]; affectedEntities: string[] }> {
    assertValidIdentifier(condition.entity, "entity label");

    // Query for count
    const query = `
      MATCH (e:${condition.entity})
      ${scope ? `WHERE e.id = $scope` : ""}
      RETURN count(e) AS count
    `;

    const result = await session.run(query, { scope });
    const rec = result.records[0];
    const count = rec ? rec.get("count") : 0;

    const passed = this.compareValues(count, condition.operator, condition.value);

    return {
      passed,
      violations: passed
        ? []
        : [
            {
              entity: condition.entity,
              property: "count",
              expected: condition.value,
              actual: count,
            },
          ],
      affectedEntities: passed ? [] : [condition.entity],
    };
  }

  private compareValues(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case "<":
        return typeof actual === "number" && typeof expected === "number" && actual < expected;
      case ">":
        return typeof actual === "number" && typeof expected === "number" && actual > expected;
      case "<=":
        return typeof actual === "number" && typeof expected === "number" && actual <= expected;
      case ">=":
        return typeof actual === "number" && typeof expected === "number" && actual >= expected;
      case "=":
        return actual === expected;
      case "!=":
        return actual !== expected;
      case "in":
        return Array.isArray(expected) && expected.includes(actual);
      case "not_in":
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }
}

export async function evaluateComplianceRule(
  driver: Driver,
  ruleId: string,
  ruleDsl: string,
): Promise<EvaluationResult> {
  const { parseComplianceDsl } = await import("./dsl-parser");
  const parsedRule = parseComplianceDsl(ruleDsl);
  const evaluator = new ComplianceEvaluator(driver);
  return await evaluator.evaluate(ruleId, parsedRule);
}
