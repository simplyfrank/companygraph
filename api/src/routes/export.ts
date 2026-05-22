import { getDriver } from "../neo4j/driver";
import { NODE_LABELS, type NodeLabel } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, type EdgeType } from "@companygraph/shared/schema/edges";
import type { Node, Edge } from "@companygraph/shared/types";

// GET /api/v1/export — buffered JSON, ordered by id ASC, round-trippable
// through POST /import (FR-17 / AC-25).
export async function handleExportJson(): Promise<Response> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const nodes: (Node & { label: NodeLabel })[] = [];
    for (const label of NODE_LABELS) {
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
    for (const type of EDGE_TYPES) {
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
      const session = driver.session({ defaultAccessMode: "READ" });
      try {
        for (const label of NODE_LABELS) {
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
        for (const type of EDGE_TYPES) {
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
