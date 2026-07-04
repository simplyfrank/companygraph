// Compliance DSL parser — parses declarative compliance rule DSL.
//
// Supports patterns like:
// - "WHEN metric < threshold THEN action"
// - "ENSURE property = value"
// - "FOR EACH entity CHECK condition"

export interface ParsedCondition {
  type: "metric" | "property" | "count";
  entity: string;
  property?: string;
  operator: "<" | ">" | "<=" | ">=" | "=" | "!=" | "in" | "not_in";
  value: unknown;
}

export interface ParsedAction {
  type: "TAG" | "NOTIFY" | "BLOCK" | "ALERT";
  config: Record<string, unknown>;
}

export interface ParsedRule {
  conditions: ParsedCondition[];
  actions: ParsedAction[];
  scope?: string;
  schedule?: string;
}

export class ComplianceDslParser {
  parse(dsl: string): ParsedRule {
    const lines = dsl.split("\n").map((l) => l.trim()).filter((l) => l);
    const rule: ParsedRule = {
      conditions: [],
      actions: [],
    };

    for (const line of lines) {
      if (line.startsWith("WHEN")) {
        const condition = this.parseWhenClause(line);
        rule.conditions.push(condition);
      } else if (line.startsWith("ENSURE")) {
        const condition = this.parseEnsureClause(line);
        rule.conditions.push(condition);
      } else if (line.startsWith("FOR EACH")) {
        const condition = this.parseForEachClause(line);
        rule.conditions.push(condition);
      } else if (line.startsWith("THEN")) {
        const action = this.parseThenClause(line);
        rule.actions.push(action);
      } else if (line.startsWith("SCOPE")) {
        rule.scope = this.parseScopeClause(line);
      } else if (line.startsWith("SCHEDULE")) {
        rule.schedule = this.parseScheduleClause(line);
      }
    }

    return rule;
  }

  private parseWhenClause(line: string): ParsedCondition {
    // WHEN entity.property < value
    const match = line.match(/WHEN\s+(\w+)\.(\w+)\s+([<>=!]+)\s+(.+)/);
    if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
      throw new Error(`Invalid WHEN clause: ${line}`);
    }

    const entity = match[1];
    const property = match[2];
    const operator = match[3] as ParsedCondition["operator"];
    const value = this.parseValue(match[4]);

    return {
      type: "metric",
      entity,
      property,
      operator,
      value,
    };
  }

  private parseEnsureClause(line: string): ParsedCondition {
    // ENSURE entity.property = value
    const match = line.match(/ENSURE\s+(\w+)\.(\w+)\s+([=]+)\s+(.+)/);
    if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
      throw new Error(`Invalid ENSURE clause: ${line}`);
    }

    const entity = match[1];
    const property = match[2];
    const operator = match[3] as ParsedCondition["operator"];
    const value = this.parseValue(match[4]);

    return {
      type: "property",
      entity,
      property,
      operator,
      value,
    };
  }

  private parseForEachClause(line: string): ParsedCondition {
    // FOR EACH entity CHECK count > threshold
    const match = line.match(/FOR EACH\s+(\w+)\s+CHECK\s+count\s+([<>=!]+)\s+(.+)/);
    if (!match || !match[1] || !match[2] || !match[3]) {
      throw new Error(`Invalid FOR EACH clause: ${line}`);
    }

    const entity = match[1];
    const operator = match[2] as ParsedCondition["operator"];
    const value = this.parseValue(match[3]);

    return {
      type: "count",
      entity,
      operator,
      value,
    };
  }

  private parseThenClause(line: string): ParsedAction {
    // THEN TAG 'tag_name' or THEN NOTIFY channel
    const match = line.match(/THEN\s+(\w+)\s+(.+)/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid THEN clause: ${line}`);
    }

    const type = match[1] as ParsedAction["type"];
    const configStr = match[2];

    let config: Record<string, unknown>;
    if (configStr.startsWith("'") && configStr.endsWith("'")) {
      config = { tag: configStr.slice(1, -1) };
    } else if (configStr.startsWith('"') && configStr.endsWith('"')) {
      config = { tag: configStr.slice(1, -1) };
    } else {
      config = { target: configStr };
    }

    return { type, config };
  }

  private parseScopeClause(line: string): string {
    // SCOPE domain_id
    const match = line.match(/SCOPE\s+(.+)/);
    if (!match || !match[1]) {
      throw new Error(`Invalid SCOPE clause: ${line}`);
    }
    return match[1];
  }

  private parseScheduleClause(line: string): string {
    // SCHEDULE "0 0 * * *" (cron)
    const match = line.match(/SCHEDULE\s+(.+)/);
    if (!match || !match[1]) {
      throw new Error(`Invalid SCHEDULE clause: ${line}`);
    }
    return match[1].replace(/['"]/g, "");
  }

  private parseValue(valueStr: string): unknown {
    // Try to parse as number
    const num = Number(valueStr);
    if (!isNaN(num)) {
      return num;
    }

    // Try to parse as boolean
    if (valueStr === "true") return true;
    if (valueStr === "false") return false;

    // Try to parse as string (remove quotes)
    if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
      return valueStr.slice(1, -1);
    }
    if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
      return valueStr.slice(1, -1);
    }

    // Try to parse as array
    if (valueStr.startsWith("[") && valueStr.endsWith("]")) {
      try {
        return JSON.parse(valueStr);
      } catch {
        return valueStr;
      }
    }

    return valueStr;
  }

  generateDsl(rule: ParsedRule): string {
    const lines: string[] = [];

    if (rule.scope) {
      lines.push(`SCOPE ${rule.scope}`);
    }

    for (const condition of rule.conditions) {
      if (condition.type === "metric") {
        lines.push(
          `WHEN ${condition.entity}.${condition.property} ${condition.operator} ${this.stringifyValue(condition.value)}`,
        );
      } else if (condition.type === "property") {
        lines.push(
          `ENSURE ${condition.entity}.${condition.property} ${condition.operator} ${this.stringifyValue(condition.value)}`,
        );
      } else if (condition.type === "count") {
        lines.push(
          `FOR EACH ${condition.entity} CHECK count ${condition.operator} ${this.stringifyValue(condition.value)}`,
        );
      }
    }

    for (const action of rule.actions) {
      if (action.type === "TAG" && action.config.tag) {
        lines.push(`THEN TAG '${action.config.tag}'`);
      } else if (action.type === "NOTIFY" && action.config.target) {
        lines.push(`THEN NOTIFY ${action.config.target}`);
      } else if (action.type === "BLOCK") {
        lines.push(`THEN BLOCK`);
      } else if (action.type === "ALERT") {
        lines.push(`THEN ALERT`);
      }
    }

    if (rule.schedule) {
      lines.push(`SCHEDULE "${rule.schedule}"`);
    }

    return lines.join("\n");
  }

  private stringifyValue(value: unknown): string {
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "string") {
      return `'${value}'`;
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return String(value);
  }
}

export function parseComplianceDsl(dsl: string): ParsedRule {
  const parser = new ComplianceDslParser();
  return parser.parse(dsl);
}

export function generateComplianceDsl(rule: ParsedRule): string {
  const parser = new ComplianceDslParser();
  return parser.generateDsl(rule);
}
