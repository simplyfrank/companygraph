// Agent tool: get_entity_detail — retrieves detailed schema for a specific entity.
//
// This tool gets the full JSON schema and relationships for a single entity.

import type { Driver } from "neo4j-driver";
import type { AgentTool } from "../ontology-agent";

export function createGetEntityDetailTool(driver: Driver): AgentTool {
  return {
    name: "get_entity_detail",
    description: "Get detailed JSON schema and relationships for a specific entity",
    execute: async (input: Record<string, unknown>) => {
      const entityId = input.entity_id as string;

      const session = driver.session({ defaultAccessMode: "READ" });
      try {
        // Get node label schema
        const nodeLabelRes = await session.run(
          `MATCH (l:_OntologyNodeLabel {name: $entityId})
           RETURN l.name AS name, l.json_schema_doc AS schema, l.external_alignment AS external_alignment`,
          { entityId },
        );

        const nodeLabelRec = nodeLabelRes.records[0];
        if (!nodeLabelRec) {
          return {
            error: `Entity not found: ${entityId}`,
            entity_id: entityId,
          };
        }

        const l = nodeLabelRec.get("l") as { properties: Record<string, unknown> } | null;
        if (!l) {
          return {
            error: `Invalid node label data: ${entityId}`,
            entity_id: entityId,
          };
        }

        // Get relationships for this entity
        const relationshipsRes = await session.run(
          `MATCH (e:_OntologyEdgeType)
           WHERE e.from_label = $entityId OR e.to_label = $entityId
           RETURN e.name AS name, e.from_label AS from_label, e.to_label AS to_label, e.json_schema_doc AS schema
           ORDER BY e.name`,
          { entityId },
        );

        const relationships: Array<{
          name: string;
          from_label: string;
          to_label: string;
          schema: unknown;
        }> = [];
        for (const rec of relationshipsRes.records) {
          const e = rec.get("e") as { properties: Record<string, unknown> } | null;
          if (!e) continue;
          relationships.push({
            name: e.properties.name as string,
            from_label: e.properties.from_label as string,
            to_label: e.properties.to_label as string,
            schema: e.properties.json_schema_doc,
          });
        }

        return {
          entity_id: entityId,
          name: l.properties.name as string,
          schema: l.properties.json_schema_doc,
          external_alignment: l.properties.external_alignment,
          relationships,
        };
      } finally {
        await session.close();
      }
    },
  };
}
