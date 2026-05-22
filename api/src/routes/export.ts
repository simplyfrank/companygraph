// AC-15 / NFR-02 / T-09b sibling refactor — export iterates the runtime
// registry via the §6.1 schema cache, not the compile-time NODE_LABELS /
// EDGE_TYPES const tuples. Round-trippability through POST /import is
// preserved: every label that has data nodes is exported under its
// registry name, every type with edges under its registry name.

import { getDriver } from "../neo4j/driver";
import { getSchema } from "../ontology/cache/schema";
import type { Node, Edge } from "@companygraph/shared/types";

// GET /api/v1/export — buffered JSON, ordered by id ASC, round-trippable
// through POST /import (FR-17 / AC-25).
export async function handleExportJson(): Promise<Response> {
  const schema = await getSchema();
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const nodes: (Node & { label: string })[] = [];
    for (const labelRow of schema.nodeLabels) {
      const label = labelRow.name;
      const r = await session.run(
        `MATCH (n:\`${label}\`) RETURN n ORDER BY n.id ASC`,
      );
      for (const rec of r.records) {
        const n = rec.get("n") as { properties: Record<string, string> };
        nodes.push({
          id: n.properties.id!,
          label,
          name: n.properties.name!,
          description: n.properties.description ?? "",
          createdAt: n.properties.createdAt!,
          updatedAt: n.properties.updatedAt!,
          attributes: JSON.parse(n.properties.attributes_json ?? "{}"),
        });
      }
    }
    const edges: Edge[] = [];
    for (const typeRow of schema.edgeTypes) {
      const type = typeRow.name;
      const r = await session.run(
        `MATCH (a)-[r:\`${type}\`]->(b) RETURN r, a.id AS fromId, b.id AS toId ORDER BY r.id ASC`,
      );
      for (const rec of r.records) {
        const rel = rec.get("r") as { properties: Record<string, string> };
        edges.push({
          id: rel.properties.id!,
          type,
          fromId: rec.get("fromId") as string,
          toId: rec.get("toId") as string,
          createdAt: rel.properties.createdAt!,
          attributes: JSON.parse(rel.properties.attributes_json ?? "{}"),
        });
      }
    }
    return new Response(JSON.stringify({ nodes, edges }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } finally {
    await session.close();
  }
}

// GET /api/v1/export.ndjson — streaming NDJSON via Web ReadableStream.
// Same ordering as JSON export.
export function handleExportNdjson(): Response {
  const driver = getDriver();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const schema = await getSchema();
      const session = driver.session({ defaultAccessMode: "READ" });
      try {
        for (const labelRow of schema.nodeLabels) {
          const label = labelRow.name;
          const result = await session.run(
            `MATCH (n:\`${label}\`) RETURN n ORDER BY n.id ASC`,
          );
          for (const rec of result.records) {
            const n = rec.get("n") as { properties: Record<string, string> };
            const row = {
              kind: "node" as const, label,
              id: n.properties.id, name: n.properties.name,
              description: n.properties.description ?? "",
              createdAt: n.properties.createdAt, updatedAt: n.properties.updatedAt,
              attributes: JSON.parse(n.properties.attributes_json ?? "{}"),
            };
            controller.enqueue(enc.encode(JSON.stringify(row) + "\n"));
          }
        }
        for (const typeRow of schema.edgeTypes) {
          const type = typeRow.name;
          const result = await session.run(
            `MATCH (a)-[r:\`${type}\`]->(b) RETURN r, a.id AS fromId, b.id AS toId ORDER BY r.id ASC`,
          );
          for (const rec of result.records) {
            const rel = rec.get("r") as { properties: Record<string, string> };
            const row = {
              kind: "edge" as const, type,
              id: rel.properties.id,
              fromId: rec.get("fromId") as string,
              toId: rec.get("toId") as string,
              createdAt: rel.properties.createdAt,
              attributes: JSON.parse(rel.properties.attributes_json ?? "{}"),
            };
            controller.enqueue(enc.encode(JSON.stringify(row) + "\n"));
          }
        }
      } finally {
        await session.close();
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}
