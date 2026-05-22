import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolName, ChatRoleId } from "@companygraph/shared";
import type { ToolDef } from "./types";
import * as allTools from "./all";

// Assemble the registry by collecting every TOOL_DEF from the barrel.
// Tools self-register: adding a tool is "create file + add one line to all.ts".
const REGISTRY: Partial<Record<ToolName, ToolDef<unknown, unknown>>> = {};
for (const def of Object.values(allTools)) {
  if (def && typeof def === "object" && "name" in def && "schema" in def && "run" in def) {
    const d = def as ToolDef<unknown, unknown>;
    REGISTRY[d.name] = d;
  }
}

export function getTool(name: ToolName): ToolDef<unknown, unknown> | undefined {
  return REGISTRY[name];
}

export function listAllTools(): ToolName[] {
  return Object.keys(REGISTRY) as ToolName[];
}

// Anthropic tool-use compatible JSON Schema; auto-generated from each tool's
// zod schema via zod-to-json-schema (locked dep). DD-03.
export interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export function listToolsForRole(role: {
  id: ChatRoleId;
  allowed_tools: readonly ToolName[];
}): AnthropicToolSpec[] {
  return role.allowed_tools
    .map(name => REGISTRY[name])
    .filter((d): d is ToolDef<unknown, unknown> => !!d)
    .map(d => ({
      name: d.name,
      description: d.description,
      input_schema: zodToJsonSchema(d.schema, { target: "openApi3" }) as Record<string, unknown>,
    }));
}
