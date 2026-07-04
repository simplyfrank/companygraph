// T-04 — dedicated snapshot-capture read (FR-08 hash basis, DD-05, RD-1).
//
// A snapshot-capture Cypher scoped to THIS module — NOT the shared
// `read-only-graph.ts` `GRAPH_QUERY`. The capture query projects exactly the
// hash-basis fields the graph-state hash (hash.ts) needs and that
// `cto-analytics`'s shared reader does not expose:
//   • node   `{ id, label, attributes_json, updatedAt }`
//   • edge   `{ id, type, fromId, toId, attributes_json, createdAt }`
//
// The shared `GRAPH_QUERY` edge projection lacks the edge `id` /
// `attributes` / `createdAt` and does not split node `updatedAt`, so a
// dedicated query is required (DD-05). It still runs via `runReadOnlyGraph()`
// — read-only session, tx timeout, NO direct `getDriver()`/`driver.session()`
// (RD-1, AC-11 guard).
//
// The parsed snapshot is fed to `hash.ts` (deterministic hash) AND persisted
// by `cache.ts` (the `analytics_run` blob). `attributes_json` is parsed here
// into the `attributes` field (rule (d) — C-04) so the hash consumes
// already-parsed maps.

import { runReadOnlyGraph } from "../../neo4j/read-only-graph"; // RD-1 — no getDriver()
import type { HashNode, HashEdge } from "./hash";

/**
 * Snapshot-capture Cypher (DD-05). One `row` per node then per edge, tagged
 * with `kind` so the caller can partition. Projects the exact hash-basis
 * fields (edge `id`/`attributes_json`/`createdAt`, node `updatedAt`).
 */
export const SNAPSHOT_QUERY = `
  MATCH (n)
  RETURN {
    kind: 'node',
    id: n.id,
    label: labels(n)[0],
    name: n.name,
    attributes_json: n.attributes_json,
    updatedAt: n.updatedAt
  } AS row
  UNION ALL
  MATCH (a)-[r]->(b)
  RETURN {
    kind: 'edge',
    id: r.id,
    type: type(r),
    fromId: a.id,
    toId: b.id,
    attributes_json: r.attributes_json,
    createdAt: r.createdAt
  } AS row
`;

/**
 * The captured snapshot. `nodes`/`edges` are the hash-basis shapes (excluding
 * node `name`, which is NOT part of the hash). `namesById` carries each node's
 * `name` alongside so the compute engines (which need it) can be fed without
 * perturbing the hash basis.
 */
export interface CapturedSnapshot {
  nodes: HashNode[];
  edges: HashEdge[];
  namesById: Map<string, string>;
}

interface RawNodeRow {
  kind: "node";
  id: string;
  label: string | null;
  name: string | null;
  attributes_json: string | null;
  updatedAt: string | null;
}

interface RawEdgeRow {
  kind: "edge";
  id: string;
  type: string;
  fromId: string;
  toId: string;
  attributes_json: string | null;
  createdAt: string | null;
}

type RawRow = RawNodeRow | RawEdgeRow;

/** Parse a stored `attributes_json` STRING into a map (rule (d) — C-04). */
function parseAttributes(raw: string | null | undefined): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Pure partition of the raw capture rows into the `HashNode`/`HashEdge`
 * shapes. Exported so the projection→shape mapping is unit-testable without a
 * live Neo4j. Nodes are deduplicated on `id`; each `attributes_json` is parsed
 * into `attributes` (rule (d)).
 */
export function partitionSnapshotRows(rows: { row: RawRow }[]): CapturedSnapshot {
  const nodes: HashNode[] = [];
  const edges: HashEdge[] = [];
  const namesById = new Map<string, string>();
  const seenNodes = new Set<string>();

  for (const wrapper of rows) {
    const r = wrapper.row;
    if (!r) continue;
    if (r.kind === "node") {
      if (seenNodes.has(r.id)) continue;
      seenNodes.add(r.id);
      namesById.set(r.id, r.name ?? r.id);
      nodes.push({
        id: r.id,
        label: r.label ?? "",
        attributes: parseAttributes(r.attributes_json),
        updatedAt: r.updatedAt ?? "",
      });
    } else if (r.kind === "edge") {
      edges.push({
        id: r.id,
        type: r.type,
        fromId: r.fromId,
        toId: r.toId,
        attributes: parseAttributes(r.attributes_json),
        createdAt: r.createdAt ?? "",
      });
    }
  }

  return { nodes, edges, namesById };
}

/**
 * Capture the current live graph into the hash-basis snapshot shape via the
 * dedicated `SNAPSHOT_QUERY` (RD-1: read-only session, tx timeout, no direct
 * driver). Returns already-parsed `HashNode`/`HashEdge` arrays.
 */
export async function captureSnapshot(): Promise<CapturedSnapshot> {
  const rows = (await runReadOnlyGraph(SNAPSHOT_QUERY)) as { row: RawRow }[];
  return partitionSnapshotRows(rows);
}
