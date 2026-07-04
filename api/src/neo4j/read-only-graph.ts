/**
 * Shared read-only Neo4j graph reader (RD-1, cto-analytics design §4 DD-02).
 *
 * Sibling to `read-only-session.ts`, but purpose-built for the analytics
 * modules under `api/src/analytics/`, which need the **full** graph
 * (all nodes + all edges — well over the 1000-row cap `runPassthrough`
 * enforces). This reader therefore keeps the read-only + transaction-timeout
 * guarantees but omits the row cap so the whole graph loads.
 *
 * Analytics modules import from here (or from a module that does) rather
 * than calling `getDriver()`/`driver.session()` directly — enforced by the
 * T-19 guard test `analytics-no-direct-driver.test.ts` (AC-11).
 */

import type { Driver } from "neo4j-driver";
import { getDriver } from "./driver";
import {
  ValidationError,
  isAccessModeViolation,
  isSyntaxError,
  isTransactionTimeout,
} from "../errors";

// Analytics reads run against `retail-mini` scale live; a generous ceiling
// bounds a pathological query without truncating the real graph. Matches
// `read-only-session.ts`'s posture (read-only tx + timeout) minus the row cap.
const TX_TIMEOUT_MS = 15_000;

export interface GraphNode {
  id: string;
  label: string; // Neo4j node label (e.g. "Activity")
  name: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string; // `${from}->${to}:${type}`
  source: string; // source node id
  target: string; // target node id
  type: string; // Neo4j relationship type (e.g. "PRECEDES")
}

export interface RawGraphRow {
  node?: GraphNode;
  edge?: GraphEdge;
}

// Runs an arbitrary read-only Cypher statement with a transaction timeout
// and NO row cap. Read-only access mode is enforced at the session level:
// a write statement is rejected by Neo4j and surfaced as
// `write_statement_rejected` (same mapping as `runPassthrough`).
export async function runReadOnlyGraph(
  stmt: string,
  params: Record<string, unknown> = {},
  driver: Driver = getDriver(),
): Promise<Record<string, unknown>[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(stmt, params, { timeout: TX_TIMEOUT_MS });
    return result.records.map((record) => record.toObject() as Record<string, unknown>);
  } catch (err) {
    if (isAccessModeViolation(err)) {
      throw new ValidationError("write_statement_rejected", {});
    }
    if (isSyntaxError(err)) {
      const pos = (err as { position?: { offset?: number } }).position;
      throw new ValidationError("parse_error", pos ? { position: pos } : {});
    }
    if (isTransactionTimeout(err)) {
      throw new ValidationError("query_timeout", { timeoutMs: TX_TIMEOUT_MS });
    }
    throw err;
  } finally {
    await session.close();
  }
}

// Whole-graph query: one node row per node (deduplicated at read time by id)
// followed by one edge row per relationship. Mirrors the as-built engine's
// projection so the migrated graphology engine consumes the same shape.
export const GRAPH_QUERY = `
  MATCH (n)
  WITH n, labels(n)[0] AS primaryLabel
  RETURN {
    id: n.id,
    label: primaryLabel,
    name: n.name,
    properties: properties(n)
  } AS node

  UNION ALL

  MATCH (a)-[r]->(b)
  RETURN {
    id: a.id + '->' + b.id + ':' + type(r),
    source: a.id,
    target: b.id,
    type: type(r)
  } AS edge
`;

// Loads the full graph (all nodes + all edges) via the read-only reader.
// Node rows are deduplicated on `id`; edge rows are collected as-is.
export async function fetchGraph(
  driver: Driver = getDriver(),
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const rows = await runReadOnlyGraph(GRAPH_QUERY, {}, driver);
  return partitionGraphRows(rows as RawGraphRow[]);
}

// Pure partition of raw {node?|edge?} rows into deduplicated node + edge
// arrays. Exported for unit testing without a live Neo4j.
export function partitionGraphRows(rows: RawGraphRow[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();

  for (const row of rows) {
    if (row.node && !seenNodes.has(row.node.id)) {
      seenNodes.add(row.node.id);
      nodes.push(row.node);
    } else if (row.edge) {
      edges.push(row.edge);
    }
  }

  return { nodes, edges };
}
