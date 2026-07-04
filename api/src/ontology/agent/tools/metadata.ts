// Agent tool: get_metadata — retrieves ontology metadata from Neo4j.
//
// This tool gathers all node labels and their schemas for ontology generation.

import type { Driver } from "neo4j-driver";
import type { AgentTool } from "../ontology-agent";

export function createGetMetadataTool(driver: Driver): AgentTool {
  return {
    name: "get_metadata",
    description: "Get all ontology node labels and their JSON schemas from Neo4j",
    execute: async (input: Record<string, unknown>) => {
      const sourceScope = input.source_scope as string;
      const sourceId = input.source_id as string;

      const session = driver.session({ defaultAccessMode: "READ" });
      try {
        // Get all node labels in the ontology registry
        const nodeLabelsRes = await session.run(
          `MATCH (l:_OntologyNodeLabel)
           RETURN l.name AS name, l.json_schema_doc AS schema
           ORDER BY l.name`,
        );

        const entities: Array<{ id: string; label: string; schema: unknown }> = [];
        for (const rec of nodeLabelsRes.records) {
          const l = rec.get("l") as { properties: Record<string, unknown> } | null;
          if (!l) continue;
          entities.push({
            id: l.properties.name as string,
            label: l.properties.name as string,
            schema: l.properties.json_schema_doc,
          });
        }

        // Get edge types
        const edgeTypesRes = await session.run(
          `MATCH (e:_OntologyEdgeType)
           RETURN e.name AS name, e.from_label AS from_label, e.to_label AS to_label
           ORDER BY e.name`,
        );

        const relationships: Array<{
          id: string;
          label: string;
          from_label: string;
          to_label: string;
        }> = [];
        for (const rec of edgeTypesRes.records) {
          const e = rec.get("e") as { properties: Record<string, unknown> } | null;
          if (!e) continue;
          relationships.push({
            id: e.properties.name as string,
            label: e.properties.name as string,
            from_label: e.properties.from_label as string,
            to_label: e.properties.to_label as string,
          });
        }

        return {
          entities,
          relationships,
          source_scope: sourceScope,
          source_id: sourceId,
        };
      } finally {
        await session.close();
      }
    },
  };
}
