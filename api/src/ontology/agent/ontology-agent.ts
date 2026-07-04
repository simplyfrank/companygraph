// Ontology agent system — LLM-based ontology generation with tool-calling.
//
// Port of ontology_generator_manager.py from Ontos, simplified for TypeScript.
// The agent uses tools to gather metadata and generates OWL ontology proposals.

import type { Driver } from "neo4j-driver";
import type { OwlClass, OwlProperty, AgentStep } from "@companygraph/shared/schema/ontology";
import { generateOwlTurtle } from "../owl/generator";

export interface AgentTool {
  name: string;
  description: string;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface AgentConfig {
  llmModel: string;
  maxSteps: number;
  systemPrompt: string;
}

export interface AgentResult {
  success: boolean;
  classes: OwlClass[];
  properties: OwlProperty[];
  owlContent: string;
  steps: AgentStep[];
  llmUsage: Record<string, unknown>;
  error?: string;
}

export class OntologyAgent {
  private driver: Driver;
  private tools: Map<string, AgentTool>;
  private config: AgentConfig;

  constructor(driver: Driver, config: Partial<AgentConfig> = {}) {
    this.driver = driver;
    this.tools = new Map();
    this.config = {
      llmModel: config.llmModel || "gpt-4",
      maxSteps: config.maxSteps || 10,
      systemPrompt: config.systemPrompt || this.getDefaultSystemPrompt(),
    };
  }

  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  async generateOntology(
    sourceScope: string,
    sourceId: string,
    description?: string,
  ): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    const classes: OwlClass[] = [];
    const properties: OwlProperty[] = [];
    let llmUsage: Record<string, unknown> = {};

    try {
      // Step 1: Get metadata for the source entity
      const metadataStep = await this.executeTool("get_metadata", {
        source_scope: sourceScope,
        source_id: sourceId,
      });
      steps.push(metadataStep);

      if (!metadataStep.tool_output) {
        throw new Error("Failed to get metadata");
      }

      // Step 2: Get detailed schema for each entity
      const metadata = metadataStep.tool_output as { entities: Array<{ id: string; label: string }> };
      for (const entity of metadata.entities || []) {
        const detailStep = await this.executeTool("get_entity_detail", {
          entity_id: entity.id,
        });
        steps.push(detailStep);
      }

      // Step 3: Generate ontology using LLM (placeholder for actual LLM integration)
      const generationStep = await this.generateWithLLM(
        steps,
        sourceScope,
        sourceId,
        description,
      );
      steps.push(generationStep);

      if (generationStep.tool_output) {
        const output = generationStep.tool_output as {
          classes: OwlClass[];
          properties: OwlProperty[];
          usage: Record<string, unknown>;
        };
        classes.push(...output.classes);
        properties.push(...output.properties);
        llmUsage = output.usage;
      }

      // Step 4: Generate OWL Turtle
      const owlContent = generateOwlTurtle(classes, properties);

      return {
        success: true,
        classes,
        properties,
        owlContent,
        steps,
        llmUsage,
      };
    } catch (error) {
      return {
        success: false,
        classes: [],
        properties: [],
        owlContent: "",
        steps,
        llmUsage,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<AgentStep> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const startTime = Date.now();
    try {
      const output = await tool.execute(input);
      const duration = Date.now() - startTime;

      return {
        step_number: 0, // Will be set by caller
        tool_name: toolName,
        tool_input: input,
        tool_output: output,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        step_number: 0,
        tool_name: toolName,
        tool_input: input,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async generateWithLLM(
    steps: AgentStep[],
    sourceScope: string,
    sourceId: string,
    description?: string,
  ): Promise<AgentStep> {
    const startTime = Date.now();

    // Placeholder for actual LLM integration
    // This would call OpenAI API or similar with the gathered metadata
    // and system prompt to generate ontology classes and properties

    // For now, return a mock response
    const mockOutput = {
      classes: [
        {
          iri: `http://companygraph/ontology#${sourceScope}`,
          label: sourceScope,
          description: description || `Auto-generated class for ${sourceScope}`,
          super_classes: [],
          equivalent_classes: [],
          disjoint_with: [],
        },
      ],
      properties: [],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      },
    };

    const duration = Date.now() - startTime;

    return {
      step_number: 0,
      tool_name: "llm_generate",
      tool_input: { source_scope: sourceScope, source_id: sourceId, description },
      tool_output: mockOutput,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };
  }

  private getDefaultSystemPrompt(): string {
    return `You are an ontology engineer specializing in process landscape management.
Your task is to generate OWL ontology definitions from Neo4j metadata.

Guidelines:
1. Create classes for each entity type (UserJourney, Activity, Domain, etc.)
2. Create properties for relationships and attributes
3. Use proper OWL constructs (subClassOf, domain, range, etc.)
4. Follow the Turtle syntax for OWL
5. Include rdfs:label and rdfs:comment for all elements
6. Ensure consistency with existing ontology patterns

Output format:
- classes: Array of class definitions with IRI, label, description, super_classes
- properties: Array of property definitions with IRI, label, property_type, domain, range`;
  }
}
