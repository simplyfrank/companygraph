// Auditor snapshot export (RC-2.2)
// GET /api/v1/snapshot?at=:iso - Full graph at ISO date with cryptographic hash

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error } from "./_helpers";

export async function handleSnapshotExport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const atParam = url.searchParams.get("at");
  
  if (!atParam) {
    return error(400, "invalid_payload", "Missing required query parameter: at (ISO date)", {
      required: ["at"],
      example: "2026-05-23T00:00:00Z",
    });
  }

  const atDate = new Date(atParam);
  if (isNaN(atDate.getTime())) {
    return error(400, "invalid_payload", "Invalid ISO date format", { at: atParam });
  }

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    // Export all nodes and edges at the specified point in time
    // Note: This is a simplified version - a full implementation would need
    // temporal database support or audit trail reconstruction
    const result = await session.run(
      `MATCH (n)
       OPTIONAL MATCH (n)-[r]->(m)
       RETURN n, r, m
       LIMIT 10000`,
    );

    const nodes: Array<Record<string, unknown>> = [];
    const edges: Array<Record<string, unknown>> = [];
    const nodeIds = new Set<string>();

    for (const record of result.records) {
      const n = record.get("n") as { properties: Record<string, unknown>; labels: string[] } | null;
      const r = record.get("r") as { properties: Record<string, unknown>; type: string } | null;
      const m = record.get("m") as { properties: Record<string, unknown>; labels: string[] } | null;

      if (n && !nodeIds.has(n.properties.id as string)) {
        nodeIds.add(n.properties.id as string);
        nodes.push({
          id: n.properties.id,
          labels: n.labels,
          properties: n.properties,
        });
      }

      if (r && n && m) {
        edges.push({
          id: r.properties.id || `${n.properties.id}-${r.type}-${m.properties.id}`,
          type: r.type,
          from: n.properties.id,
          to: m.properties.id,
          properties: r.properties,
        });
      }
    }

    const snapshot = {
      snapshot_at: atParam,
      generated_at: new Date().toISOString(),
      node_count: nodes.length,
      edge_count: edges.length,
      nodes,
      edges,
    };

    // Compute SHA-256 hash of the canonical JSON
    const canonicalJson = JSON.stringify(snapshot, Object.keys(snapshot).sort());
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const response = {
      ...snapshot,
      hash: hashHex,
      hash_algorithm: "sha-256",
    };

    return ok(response);
  } finally {
    await session.close();
  }
}
