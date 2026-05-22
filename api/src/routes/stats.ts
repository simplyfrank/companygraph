// /api/v1/stats — registry-driven keyset (T-09b post-FR-15 refactor).
//
// Iterates the runtime _OntologyNodeLabel + _OntologyEdgeType registry
// via the §6.1 schema cache rather than the compile-time const tuples.
// graph-core/FR-11's "all keys present even when value is 0" guarantee
// still holds — the keyset is now the union of seed labels (Domain /
// UserJourney / Activity / Role / System / Location etc.) and any
// labels added at runtime via POST /api/v1/ontology/node-labels.
//
// AC-01 timing — a new label appears in /stats within the cache TTL
// (60s p99). Mutations through the ontology routes emit
// `ontology.changed` which clears the cache, so the next /stats call
// after a label add reflects the new keyset immediately.

import { getDriver } from "../neo4j/driver";
import { getSchema } from "../ontology/cache/schema";
import { ok } from "./_helpers";
import type { Stats } from "@companygraph/shared/types";

export async function handleStats(): Promise<Response> {
  const schema = await getSchema();
  const labels = schema.nodeLabels.map((l) => l.name);
  const types = schema.edgeTypes.map((t) => t.name);

  // Empty registry corner case (pre-bootstrap call) — return the
  // empty {} shape rather than building a zero-branch UNION ALL.
  if (labels.length === 0 && types.length === 0) {
    return ok({ nodes: {}, edges: {} } satisfies Stats);
  }

  const nodeBranches = labels.map(
    (l) => `MATCH (n:\`${l}\`) RETURN 'node' AS kind, '${l}' AS name, count(n) AS c`,
  );
  const edgeBranches = types.map(
    (t) => `MATCH (a)-[r:\`${t}\`]->(b) RETURN 'edge' AS kind, '${t}' AS name, count(r) AS c`,
  );
  const cypher = [...nodeBranches, ...edgeBranches].join("\nUNION ALL\n");

  // Pre-seed the keyset to zero so "registered but no rows" surfaces
  // as { Foo: 0 } rather than missing key (FR-11 "all keys present").
  const nodes: Record<string, number> = Object.fromEntries(labels.map((l) => [l, 0]));
  const edges: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));

  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(cypher);
    for (const rec of result.records) {
      const kind = rec.get("kind") as string;
      const name = rec.get("name") as string;
      const c = (rec.get("c") as number | undefined) ?? 0;
      if (kind === "node") nodes[name] = c;
      else edges[name] = c;
    }
  } finally {
    await session.close();
  }

  return ok({ nodes, edges } satisfies Stats);
}
